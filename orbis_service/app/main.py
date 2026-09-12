from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from reactor_sdk.errors import RateLimitedError

from .models import AdStreamResponse, StartAdStreamRequest, SteerAdStreamRequest
from .stream_manager import AdStreamManager, OrbisStreamError

streams = AdStreamManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await streams.shutdown()


app = FastAPI(title="Orbis Ad Tool", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/v1/health")
async def health() -> dict[str, bool]:
    """Safe process-level configuration check for local orchestration."""
    return {
        "ok": True,
        "reactor_key_configured": bool(
            os.environ.get("REACTOR_API_KEY") or os.environ.get("ORBIS_API_KEY")
        ),
    }


def response(stream_id: str, status: str) -> AdStreamResponse:
    return AdStreamResponse(stream_id=stream_id, status=status, frames_url=f"/v1/ad-streams/{stream_id}/frames")


@app.post("/v1/ad-streams", response_model=AdStreamResponse, status_code=201)
async def start_ad_stream_endpoint(request: StartAdStreamRequest) -> AdStreamResponse:
    try:
        stream = await streams.start(request.ad_prompt, request.resume_frame_base64)
        return response(stream.stream_id, stream.status)
    except RateLimitedError as error:
        raise HTTPException(
            status_code=503,
            detail="Orbis has no available generation capacity right now. Please try again shortly.",
            headers={"Retry-After": "15"},
        ) from error
    except OrbisStreamError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Could not start Orbis: {error}") from error


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
