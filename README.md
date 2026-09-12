# Orbis in-video ads MVP

This app pauses an embedded YouTube video, captures the insertion frame, and
plays a 15-second generated ad over it. Orbis/Reactor sessions are created and
controlled by the Python service, not by the browser.

## Architecture

```text
Browser -> Next.js ad API -> Python orbis_service -> Reactor / Visko Orbis
Browser <- WebSocket JPEG relay <- Python orbis_service
```

The browser never receives a Reactor key or JWT. It requests an ad start,
connects to the safe frame relay URL returned by the application, requests a
transition at 10 seconds, and stops at 15 seconds.

## Run locally

Install and run the Next.js app:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Install the host tools used to capture the actual paused YouTube frame:

```bash
brew install ffmpeg yt-dlp
```

Run the Python service in a second terminal:

```bash
cd orbis_service
source .venv/bin/activate
source ~/.zshrc
python -m uvicorn app.main:app --reload --reload-dir app --port 8000
```

Required environment ownership:

```dotenv
# Loaded by the Uvicorn process only
REACTOR_API_KEY=your_reactor_api_key

# Loaded by the Next.js process
ORBIS_SERVICE_URL=http://127.0.0.1:8000

# Safe for the browser: origin for the frame relay WebSocket
NEXT_PUBLIC_ORBIS_SERVICE_URL=http://localhost:8000
```

Check the service before testing the UI:

```bash
curl http://127.0.0.1:8000/v1/health
```

It should report that the Reactor key is configured. It never returns the key
itself.

## Ad flow

1. The browser pauses YouTube and the backend uses `yt-dlp` plus `ffmpeg` to
   extract the frame at that exact timestamp. It does not substitute a
   thumbnail.
2. `POST /api/ads/start` stores that frame and selects an approved prompt.
3. `POST /api/ads/{id}/orbis/start` tells Python to create the Reactor session,
   upload the frame, set the prompt, and start Orbis.
4. Python returns a frame relay URL. The browser begins its 15-second visual
   clock only after decoding the first relayed frame.
5. At 10 seconds, `POST /api/ads/{id}/orbis/transition` steers the existing
   stream toward the saved YouTube frame.
6. At 15 seconds, on skip, or on failure, the application stops the stream and
   resumes YouTube at its saved timestamp.

See [plan.md](./plan.md) for migration ownership and failure-handling details.
