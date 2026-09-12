# YouTube In-Video Orbis Ad Platform

## Goal

Show a 15-second generated ad inside a YouTube video. At an ad break, pause
the source video, select an approved ad prompt, call the server-owned Orbis
tool, and transition the final five seconds back to the source scene.

## Playback flow

```text
Pause original YouTube video at an eligible break
  -> save the exact resume timestamp and frame
  -> select an approved prompt from the ad-prompt bank
  -> call Orbis tool: set_prompt + start
  -> relay and play generated ad for 10 seconds
  -> summarize saved resume frame
  -> call Orbis tool: set_prompt(transition prompt)
  -> play transition for 5 seconds
  -> stop Orbis and resume YouTube at saved timestamp
```

The “first frame of the original video” is the frame at the resume timestamp.
Capture and save it before starting the ad; at second 10, summarize that saved
frame instead of extracting it then. This avoids a late transition caused by
frame-extraction or model latency.

## Architecture

```text
YouTube player integration
  -> Ad playback controller
  -> Ad orchestration API
       -> approved ad-prompt bank
       -> resume-frame store + summary service
       -> Orbis tool
            -> Reactor / Visko Orbis session
            -> frame relay -> generated-ad overlay
  -> resume original YouTube player
```

## Components

### YouTube player integration

- Decide whether an insertion point is eligible.
- Pause playback and store `video_id`, `resume_timestamp`, and the exact
  `resume_frame`.
- Present the generated ad as an overlay/replacement player.
- Remove the overlay and resume at the stored timestamp after 15 seconds.

### Ad-prompt bank

Use a closed, approved, versioned prompt bank. A model must not invent ad copy
or alter required brand and legal wording.

```python
class AdPrompt:
    id: str
    campaign_id: str
    prompt: str
    target_rules: dict
    enabled: bool
    version: int
```

The selector returns one eligible prompt based on campaign targeting and
delivery constraints.

### Frame-summary service

At ad second 10, summarize the stored resume frame into visual facts:

- subjects and screen position;
- setting, lighting, dominant colors, and framing;
- implied camera movement;
- objects/text that must not be recreated or changed;
- a concise transition prompt.

Example transition prompt:

```text
Transition to a rain-soaked neon city sidewalk at dusk. A woman in a yellow
raincoat is on the left in medium tracking-shot framing. Match cool pavement
reflections and gentle forward camera movement. Do not add branding, captions,
or a new focal subject.
```

### Orbis tool

The Orbis tool owns one persistent Reactor session per active ad. It is a
Python function tool registered on the Main Agent and it calls Reactor itself.

```python
async def start_ad_stream(ad_prompt: str, resume_frame: bytes) -> StreamHandle:
    """Connect, optionally set_image, set_prompt, start, and relay frames."""

async def steer_ad_to_resume_frame(stream_id: str, transition_prompt: str) -> None:
    """Send set_prompt on the existing Reactor session at ad second 10."""

async def stop_ad_stream(stream_id: str) -> None:
    """Close the Reactor session at second 15 or on failure."""
```

Start path:

```text
connect Reactor
optional upload resume frame -> set_image
set_prompt(approved ad prompt)
start
relay generated video/audio to the ad overlay
```

Transition path at second 10:

```text
summarize stored resume frame
set_prompt(transition prompt) on the same Reactor session
continue relay through second 15
```

Do not call `start` again for the transition. `set_prompt` steers the running
Orbis stream at its next chunk boundary.

## Timing contract

| Ad time | Action |
| --- | --- |
| Before 0s | Pause YouTube, save frame/timestamp, select prompt, connect Orbis. |
| 0s | Begin visible ad playback after the first playable generated frame. |
| 0–10s | Run the selected approved ad prompt. |
| 10s | Summarize saved resume frame and steer Orbis with `set_prompt`. |
| 10–15s | Continue the same stream while it morphs toward source scene. |
| 15s | Stop Orbis, remove overlay, seek/resume original video. |

Schedule the internal steering call slightly before visual second 10 if runtime
measurement shows command latency; preserve a five-second visible transition.

## APIs

### Start ad

`POST /v1/ads/start`

```json
{
  "youtube_video_id": "abc123",
  "resume_timestamp_seconds": 142.8,
  "resume_frame": "base64-encoded-image",
  "targeting_context": { "region": "US", "content_category": "travel" }
}
```

Response:

```json
{
  "ad_session_id": "uuid",
  "stream_id": "uuid",
  "duration_seconds": 15,
  "frame_relay_url": "wss://api.example.com/v1/orbis/streams/uuid/frames"
}
```

### Transition

`POST /v1/ads/{ad_session_id}/transition`

Called by the playback controller at second 10. It uses the stored frame; the
client does not upload it again.

### Finish

`POST /v1/ads/{ad_session_id}/finish`

Stops the Orbis session, records the outcome, and allows the client to resume
the original video.

## Persistence and guardrails

- Store ad-session ID, campaign/prompt version, source timestamp, stream ID,
  lifecycle events, display duration, and transition result.
- Store the resume frame temporarily with a short TTL; delete it at completion.
- Keep the Reactor API key server-side; browser receives only the frame relay.
- Enforce one active ad session per viewer and ad break.
- On startup, transition, relay, or player failure: stop the ad and resume
  source playback immediately.
- Stop streams on completion, skip, player unload, or service shutdown.
- The MVP JPEG-frame relay should be replaced by a WebRTC relay before
  production.

## Build order

1. Add `AdSession`, prompt-bank selection, and 15-second playback controller.
2. Extend the Python service with start, steer, and stop ad operations.
3. Capture and securely store the insertion-point frame and timestamp.
4. Implement frame summarization and transition-prompt construction.
5. Add start, transition, and finish endpoints.
6. Connect the frontend ad overlay to the frame relay.
7. Test successful delivery, startup failure, transition failure, unload,
   repeated breaks, and exact 15-second teardown.

## MVP acceptance criteria

- An approved eligible prompt is selected from the prompt bank.
- The original YouTube video pauses and its resume frame is saved.
- A 15-second Orbis ad begins and plays through the overlay.
- At second 10, the same stream receives a frame-derived transition prompt.
- At second 15, Orbis stops and the original video resumes.
- Any ad failure falls back to uninterrupted original playback.
