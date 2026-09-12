# Backend-Owned Orbis Session Migration

## Decision

Move all Reactor/Orbis authentication, session creation, commands, and teardown
to the Python `orbis_service`. The browser must never create a Reactor session,
request a Reactor JWT, or receive `REACTOR_API_KEY`.

The frontend remains responsible for YouTube playback and the ad overlay. It
calls the application API and renders frames from a backend relay only.

```text
Browser
  pause YouTube + capture insertion frame
  -> Next.js ad API
  -> Python orbis_service
       validate request + create Reactor session with REACTOR_API_KEY
       set image/prompt, start and steer Orbis
       relay generated frames
  <- WebSocket frame relay
Browser renders overlay, then resumes YouTube
```

## Why

- `REACTOR_API_KEY` stays on the server.
- A single service owns each Orbis lifecycle, avoiding duplicate browser
  connections and stale sessions.
- Failures are handled in one place and can reliably stop Reactor.
- The frontend no longer depends on Reactor's browser SDK or `/api/token`.

## Target responsibilities

### Frontend

- Play, pause, and seek the embedded YouTube video.
- At an eligible break, pause and request the resume frame.
- Create an ad session through Next.js.
- Ask the backend to start the Orbis stream and subscribe to its relay URL.
- At visual second 10, call the transition endpoint.
- At 15 seconds, skip, unload, or UI failure, call finish/stop and resume
  YouTube at the stored timestamp.

The browser does not import `@reactor-team/js-sdk`, use `ReactorProvider`, call
`useOrbisSession`, or call `/api/token`.

### Next.js application API

- Validate browser requests and keep the ad-session record.
- Store the captured resume frame temporarily and select the approved prompt.
- Proxy start, transition, and stop requests to `orbis_service`.
- Return only safe stream metadata such as `stream_id` and `frames_url`.
- Never expose Reactor JWTs, keys, or control messages.

### Python `orbis_service`

- Read `REACTOR_API_KEY` from its own process environment.
- Report configuration as a boolean from `/v1/health`; never return the key.
- Create one Reactor client/session per active ad stream.
- Apply the saved frame and approved prompt, then start Orbis.
- Steer the existing session with the transition prompt; do not start a second
  session.
- Relay encoded frames over `/v1/ad-streams/{stream_id}/frames`.
- Stop and dispose of the Reactor session on completion, error, disconnect,
  expiry, or service shutdown.

## API contract

### 1. Create ad session

`POST /api/ads/start`

The browser sends the YouTube video ID, pause timestamp, and captured frame.
Next.js stores the frame, selects/expands an approved prompt, and returns an
`ad_session_id`. It does not contact Reactor.

### 2. Start server-owned Orbis

`POST /api/ads/{ad_session_id}/orbis/start`

Next.js sends the stored frame and approved prompt to Python:

```json
{
  "ad_prompt": "approved expanded ad prompt",
  "resume_frame_base64": "..."
}
```

Python returns:

```json
{
  "stream_id": "uuid",
  "status": "starting",
  "frames_url": "/v1/ad-streams/uuid/frames"
}
```

`frames_url` is an `orbis_service` relay URL, not a Reactor URL or credential.

### 3. Steer existing stream

`POST /api/ads/{ad_session_id}/orbis/transition`

At visual second 10, Next.js supplies the stored transition prompt to Python.
Python issues `set_prompt` (or its SDK equivalent) to the existing stream. It
must not reconnect or call `start` again.

### 4. Stop

`POST /api/ads/{ad_session_id}/orbis/stop`

Stops the server stream. `POST /api/ads/{ad_session_id}/finish` records the
outcome and removes the temporary frame. Both must be idempotent.

## Migration plan

1. Inventory and freeze browser Reactor usage.
   - Identify `ReactorProvider`, `useOrbisSession`, `ReactorView`, direct
     session hooks, and `/api/token` callers.
   - Keep them out of the active watch/ad route during migration.

2. Finalize Python lifecycle management.
   - Maintain `stream_id -> Reactor client/session/task` in one manager.
   - Implement start, transition, stop, health, frame relay, timeout, and
     cleanup behavior.
   - Return structured errors for missing configuration, capacity, startup
     timeout, and command failure.

3. Make Next.js the browser-facing orchestration boundary.
   - Keep `/api/ads/start`, `/transition`, and `/finish` as session-record APIs.
   - Use `/api/ads/{id}/orbis/start`, `/transition`, and `/stop` as
     server-to-server proxy routes.
   - Persist `orbis_stream_id` after a successful start.

4. Replace the active watch controller.
   - Remove the `orbis` argument and browser connection/warm-up/reconnect logic
     from `useAdController`.
   - After `POST /api/ads/start`, call backend Orbis start.
   - Save `frames_url` in UI state; begin the visual clock only after decoding
     the first relayed frame.
   - Call backend transition at 10 seconds and backend stop during teardown.

5. Replace the rendered player.
   - Replace `ReactorView`/`OrbisPlayer` with `OrbisRelayPlayer`, fed by the
     relay WebSocket.
   - Surface backend status/errors in telemetry and remove “Connect Orbis.”

6. Remove obsolete browser credential paths.
   - Delete `/api/token`, `requestReactorJwt`, browser session hooks, and React
     SDK dependencies once no active route imports them.
   - Remove `NEXT_PUBLIC_*` Reactor credential configuration. Keep only the
     frontend-safe service URL needed to open the relay.

7. Validate failure behavior.
   - Missing server key, capacity/429, no first frame, transition failure,
     WebSocket close, skip, page unload, and 15-second completion must release
     the session and resume YouTube.

## Environment ownership

```dotenv
# Python orbis_service process only — never NEXT_PUBLIC_
REACTOR_API_KEY=...

# Next.js server process: server-to-server base URL
ORBIS_SERVICE_URL=http://127.0.0.1:8000

# Browser-safe only if browser opens the relay WebSocket directly
NEXT_PUBLIC_ORBIS_SERVICE_URL=http://localhost:8000
```

For local development, the shell that launches Uvicorn must load the key before
starting Python (for example, `source ~/.zshrc`). A key set only in the Next.js
process cannot configure `orbis_service`.

## Definition of done

- The active watch route has no imports from `@reactor-team/js-sdk`.
- No browser request reaches `/api/token` or a Reactor endpoint.
- Python is the only process that calls Reactor and holds its key.
- A 15-second overlay starts from a stored frame, steers at 10 seconds, and
  stops/resumes YouTube at 15 seconds.
- Cleanup succeeds on success, skip, error, reload, and timeout.
