from __future__ import annotations

from dataclasses import dataclass

from agents import RunContextWrapper, function_tool

from .stream_manager import AdStreamManager


@dataclass
class OrbisToolContext:
    streams: AdStreamManager


@function_tool(name_override="start_ad_stream")
async def start_ad_stream(
    ctx: RunContextWrapper[OrbisToolContext],
    ad_prompt: str,
    resume_frame_base64: str | None = None,
) -> str:
    """Start a 15-second Visko Orbis ad stream from an approved ad prompt.

    Pass the saved insertion-point frame when available so Orbis can use it as
    the optional starting image.
    """
    stream = await ctx.context.streams.start(ad_prompt, resume_frame_base64)
    return f'{{"stream_id":"{stream.stream_id}","status":"{stream.status}"}}'


@function_tool(name_override="steer_ad_stream")
async def steer_ad_stream(
    ctx: RunContextWrapper[OrbisToolContext],
    stream_id: str,
    transition_prompt: str,
) -> str:
    """Steer the active ad toward its original-video resume frame; do not restart it."""
    stream = await ctx.context.streams.steer(stream_id, transition_prompt)
    return f'{{"stream_id":"{stream.stream_id}","status":"{stream.status}"}}'


@function_tool(name_override="stop_ad_stream")
async def stop_ad_stream(ctx: RunContextWrapper[OrbisToolContext], stream_id: str) -> str:
    """Stop the active Orbis ad stream at 15 seconds or after playback failure."""
    await ctx.context.streams.stop(stream_id)
    return f'{{"stream_id":"{stream_id}","status":"stopped"}}'
