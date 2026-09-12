from __future__ import annotations

from pydantic import BaseModel, Field


class StartAdStreamRequest(BaseModel):
    ad_prompt: str = Field(min_length=1, max_length=4_000)
    resume_frame_base64: str | None = None


class SteerAdStreamRequest(BaseModel):
    transition_prompt: str = Field(min_length=1, max_length=4_000)


class AdStreamResponse(BaseModel):
    stream_id: str
    status: str
    frames_url: str
