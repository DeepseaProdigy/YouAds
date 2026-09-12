from __future__ import annotations

import asyncio
import base64
import inspect
import io
import os
import uuid
from dataclasses import dataclass, field
from typing import Any

from PIL import Image
from reactor_sdk import Reactor, ReactorStatus


class OrbisStreamError(RuntimeError):
    pass


@dataclass
class AdStream:
    stream_id: str
    ad_prompt: str
    resume_frame: bytes | None
    reactor: Reactor | None = None
    status: str = "starting"
    started: asyncio.Future[None] | None = None
    task: asyncio.Task[None] | None = None
    frames: asyncio.Queue[dict[str, str]] = field(
        default_factory=lambda: asyncio.Queue(maxsize=2)
    )

    async def run(self) -> None:
        loop = asyncio.get_running_loop()
        self.started = loop.create_future()
        try:
            api_key = os.environ.get("REACTOR_API_KEY") or os.environ.get("ORBIS_API_KEY")
            if not api_key:
                raise OrbisStreamError("Set REACTOR_API_KEY or ORBIS_API_KEY")

            reactor = Reactor(model_name="reactor/visko-orbis-stable", api_key=api_key)
            self.reactor = reactor

            @reactor.on_status(ReactorStatus.READY)
            async def on_ready(_: ReactorStatus) -> None:
                try:
                    video = reactor.tracks.with_direction("recvonly").with_kind("video").one()

                    @video.on_frame
                    def on_frame(frame: Any) -> None:
                        payload = self._encode_frame(frame)
                        loop.call_soon_threadsafe(self._enqueue_frame, payload)

                    if self.resume_frame:
                        upload = await reactor.upload_file(
                            self.resume_frame,
                            name="resume-frame.jpg",
                            mime_type="image/jpeg",
                        )
                        await reactor.send_command("set_image", {"image": upload})

                    await reactor.send_command("set_prompt", {"prompt": self.ad_prompt})
                    await reactor.send_command("start", {})
                    self.status = "streaming"
                    if not self.started.done():
                        self.started.set_result(None)
                except Exception as error:
                    self.status = "failed"
                    if not self.started.done():
                        self.started.set_exception(error)

            await reactor.connect()
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.status = "failed"
            if not self.started.done():
                self.started.set_exception(error)
            raise

    @staticmethod
    def _encode_frame(frame: Any) -> dict[str, str]:
        image = Image.fromarray(frame)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=82)
        return {
            "type": "frame",
            "mime_type": "image/jpeg",
            "data": base64.b64encode(output.getvalue()).decode("ascii"),
        }

    def _enqueue_frame(self, payload: dict[str, str]) -> None:
        if self.frames.full():
            self.frames.get_nowait()
        self.frames.put_nowait(payload)

    async def steer(self, transition_prompt: str) -> None:
        if self.status != "streaming" or self.reactor is None:
            raise OrbisStreamError("The ad stream is not active")
        await self.reactor.send_command("set_prompt", {"prompt": transition_prompt})

    async def stop(self) -> None:
        self.status = "stopped"
        if self.reactor is not None:
            result = self.reactor.disconnect()
            if inspect.isawaitable(result):
                await result
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass


class AdStreamManager:
    def __init__(self) -> None:
        self._streams: dict[str, AdStream] = {}

    async def start(self, ad_prompt: str, resume_frame_base64: str | None = None) -> AdStream:
        try:
            resume_frame = base64.b64decode(resume_frame_base64, validate=True) if resume_frame_base64 else None
        except ValueError as error:
            raise OrbisStreamError("resume_frame_base64 is not valid base64") from error

        stream = AdStream(str(uuid.uuid4()), ad_prompt, resume_frame)
        stream.task = asyncio.create_task(stream.run())
        while stream.started is None:
            await asyncio.sleep(0)
        try:
            await asyncio.wait_for(stream.started, timeout=90)
        except Exception:
            await stream.stop()
            raise
        self._streams[stream.stream_id] = stream
        return stream

    def get(self, stream_id: str) -> AdStream:
        if stream_id not in self._streams:
            raise OrbisStreamError("Unknown ad stream")
        return self._streams[stream_id]

    async def steer(self, stream_id: str, transition_prompt: str) -> AdStream:
        stream = self.get(stream_id)
        await stream.steer(transition_prompt)
        return stream

    async def stop(self, stream_id: str) -> None:
        stream = self.get(stream_id)
        await stream.stop()
        self._streams.pop(stream_id, None)

    async def shutdown(self) -> None:
        await asyncio.gather(*(self.stop(stream_id) for stream_id in tuple(self._streams)), return_exceptions=True)
