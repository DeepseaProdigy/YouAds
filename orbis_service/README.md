# Orbis ad tool

Run the service:

```bash
cd orbis_service
source .venv/bin/activate
# Limits reload watching to source files; do not watch .venv.
python -m uvicorn app.main:app --reload --reload-dir app --port 8000
```

Set `REACTOR_API_KEY` (or the existing `ORBIS_API_KEY`) in the service shell.

Endpoints:

- `POST /v1/ad-streams` starts a Reactor stream from `ad_prompt` and optional
  `resume_frame_base64`.
- `POST /v1/ad-streams/{stream_id}/transition` sends the second-10 transition
  prompt to the same Reactor session.
- `DELETE /v1/ad-streams/{stream_id}` stops the stream at 15 seconds.
- `WS /v1/ad-streams/{stream_id}/frames` relays JPEG frames for the ad overlay.
