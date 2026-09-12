import { mkdir, readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TMP_DIR = path.join(process.cwd(), "tmp", "ads", "frames");

type Cmd = { bin: string; prefixArgs: string[] };

function run(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function resolveYtDlp(): Promise<Cmd> {
  try {
    const check = await run("yt-dlp", ["--version"], 8_000);
    if (check.code === 0) return { bin: "yt-dlp", prefixArgs: [] };
  } catch {
    // fall through
  }
  const check = await run(
    "python3",
    ["-m", "yt_dlp", "--version"],
    8_000,
  );
  if (check.code === 0) {
    return { bin: "python3", prefixArgs: ["-m", "yt_dlp"] };
  }
  throw new Error("yt-dlp is not installed");
}

async function getStreamUrl(
  ytDlp: Cmd,
  videoUrl: string,
): Promise<string> {
  const args = [
    ...ytDlp.prefixArgs,
    "-f",
    "bv*[height<=720][ext=mp4]/bv*[height<=720]/b[height<=720]/b",
    "-g",
    "--no-playlist",
    videoUrl,
  ];
  const result = await run(ytDlp.bin, args, 60_000);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || "yt-dlp failed to resolve stream URL",
    );
  }
  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const url = lines[0];
  if (!url?.startsWith("http")) {
    throw new Error("yt-dlp returned no stream URL");
  }
  return url;
}

/**
 * Grab one JPEG at timestampSeconds from a YouTube video via yt-dlp + ffmpeg.
 */
export async function extractYoutubeFrame(input: {
  videoId: string;
  timestampSeconds: number;
}): Promise<{ bytes: Buffer; source: "stream" }> {
  const videoId = input.videoId.trim();
  const t = Math.max(0, input.timestampSeconds);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  await mkdir(TMP_DIR, { recursive: true });
  const outPath = path.join(TMP_DIR, `${randomUUID()}.jpg`);

  try {
    const ytDlp = await resolveYtDlp();
    const ff = await run("ffmpeg", ["-version"], 5_000);
    if (ff.code !== 0) throw new Error("ffmpeg is not installed");

    const streamUrl = await getStreamUrl(ytDlp, videoUrl);

    // Input seek first — better on remote streams than frame index.
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      t.toFixed(3),
      "-i",
      streamUrl,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      outPath,
    ];
    const ffmpegResult = await run("ffmpeg", ffmpegArgs, 90_000);
    if (ffmpegResult.code !== 0) {
      throw new Error(
        ffmpegResult.stderr.trim() ||
          "ffmpeg failed to extract frame",
      );
    }

    const bytes = await readFile(outPath);
    if (bytes.byteLength < 1_000) {
      throw new Error("Extracted frame was empty");
    }
    return { bytes, source: "stream" };
  } finally {
    await unlink(outPath).catch(() => undefined);
  }
}

export async function fetchYoutubeThumbnail(
  videoId: string,
): Promise<Buffer> {
  const candidates = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];
  let lastError = "Could not fetch thumbnail";
  for (const url of candidates) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      lastError = `Thumbnail HTTP ${response.status}`;
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 2_000) {
      lastError = "Thumbnail too small; trying fallback";
      continue;
    }
    return bytes;
  }
  throw new Error(lastError);
}
