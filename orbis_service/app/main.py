from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from .models import AdStreamResponse, StartAdStreamRequest, SteerAdStreamRequest
from .stream_manager import AdStreamManager, OrbisStreamError

streams = AdStreamManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await streams.shutdown()


app = FastAPI(title="Orbis Ad Tool", lifespan=lifespan)


def response(stream_id: str, status: str) -> AdStreamResponse:
    return AdStreamResponse(stream_id=stream_id, status=status, frames_url=f"/v1/ad-streams/{stream_id}/frames")


@app.post("/v1/ad-streams", response_model=AdStreamResponse, status_code=201)
async def start_ad_stream_endpoint(request: StartAdStreamRequest) -> AdStreamResponse:
    try:
        stream = await streams.start(request.ad_prompt, request.resume_frame_base64)
        return response(stream.stream_id, stream.status)
    except OrbisStreamError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/v1/ad-streams/{stream_id}/transition", response_model=AdStreamResponse)
async def steer_ad_stream_endpoint(stream_id: str, request: SteerAdStreamRequest) -> AdStreamResponse:
    try:
        stream = await streams.steer(stream_id, request.transition_prompt)
        return response(stream.stream_id, stream.status)
    except OrbisStreamError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/v1/ad-streams/{stream_id}", status_code=204)
async def stop_ad_stream_endpoint(stream_id: str) -> None:
    try:
        await streams.stop(stream_id)
    except OrbisStreamError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.websocket("/v1/ad-streams/{stream_id}/frames")
async def relay_frames(websocket: WebSocket, stream_id: str) -> None:
    try:
        stream = streams.get(stream_id)
    except OrbisStreamError:
        await websocket.close(code=4404, reason="Unknown ad stream")
        return
    await websocket.accept()
    try:
        while stream.status == "streaming":
            await websocket.send_json(await stream.frames.get())
    except WebSocketDisconnect:
        return
