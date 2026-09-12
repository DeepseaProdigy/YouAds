"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DOCUMENTED_RESOLUTIONS,
  type OrbisMessage,
  unwrapOrbisMessage,
} from "@/lib/orbis";
import {
  acquireOrbisTabLock,
  isQuotaExceededError,
  otherTabOwnsOrbisLock,
  refreshOrbisTabLock,
  releaseOrbisTabLock,
  sleep,
  startOrbisTabLockHeartbeat,
} from "@/lib/orbis-session-lock";

export function useOrbisSession(onDisconnected: () => void) {
  const { status, connect, disconnect, sendCommand, uploadFile } = useReactor(
    (state) => ({
      status: state.status,
      connect: state.connect,
      disconnect: state.disconnect,
      sendCommand: state.sendCommand,
      uploadFile: state.uploadFile,
    }),
  );

  const statusRef = useRef(status);
  statusRef.current = status;
  // A plain function call, rather than a bare `statusRef.current` read,
  // keeps TS's control-flow narrowing from (incorrectly) treating the ref's
  // value as fixed across `await` points where React can update it.
  const getStatus = useCallback(() => statusRef.current, []);

  const connectRef = useRef(connect);
  connectRef.current = connect;

  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [resolution, setResolution] = useState("");
  const [availableResolutions, setAvailableResolutions] = useState<string[]>(
    DOCUMENTED_RESOLUTIONS,
  );
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nanoBusy, setNanoBusy] = useState(false);
  const [runStarted, setRunStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryTotal, setRetryTotal] = useState(0);
  const cancelConnectRef = useRef(false);

  const previousStatus = useRef(status);
  const disconnecting = useRef(false);
  const conditionsReadyResolver = useRef<(() => void) | null>(null);
  const imageReadyResolver = useRef<(() => void) | null>(null);
  const expectsImageForRun = useRef(false);

  const connected = status === "ready";
  const controlsBusy = busy || nanoBusy;

  useEffect(() => {
    if (
      status === "disconnected" &&
      previousStatus.current !== "disconnected"
    ) {
      releaseOrbisTabLock();
      onDisconnected();
      setRunStarted(false);
      setPaused(false);
      setImageStatus("");
    }
    previousStatus.current = status;
  }, [onDisconnected, status]);

  useEffect(() => {
    if (!connected) return;
    return startOrbisTabLockHeartbeat();
  }, [connected]);

  const forceDisconnect = useCallback(async () => {
    disconnecting.current = true;
    setRunStarted(false);
    setPaused(false);

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    try {
      // Never recoverable — always terminate the server session immediately.
      await disconnectRef.current(false);
    } catch {
      // disconnect() is safe to call multiple times.
    } finally {
      disconnecting.current = false;
      releaseOrbisTabLock();
    }
  }, []);

  const waitForDisconnected = useCallback(
    async (timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (getStatus() === "disconnected") return;
        await sleep(100);
      }
      if (getStatus() !== "disconnected") {
        await forceDisconnect();
      }
    },
    [forceDisconnect, getStatus],
  );

  const connectWithRetry = useCallback(async () => {
    if (otherTabOwnsOrbisLock()) {
      throw new Error(
        "Another browser tab is using Orbis on this machine. Close it or " +
          "press Disconnect there, then try again.",
      );
    }

    if (getStatus() === "ready") return;

    if (getStatus() === "connecting" || getStatus() === "waiting") {
      await waitForDisconnected(15_000);
      if (getStatus() === "ready") return;
    }

    if (getStatus() !== "disconnected") {
      await forceDisconnect();
      await waitForDisconnected();
    }

    if (!acquireOrbisTabLock()) {
      throw new Error(
        "Another browser tab is using Orbis on this machine. Close it or " +
          "press Disconnect there, then try again.",
      );
    }

    // A "slot full" error usually means a *stale* session (a crashed tab, a
    // refresh that didn't finish closing its socket, a second page like
    // /agent-lab) is still held open on the Reactor server under this key.
    // The server only frees that slot after its own timeout, which can be
    // well past 15s, so keep retrying for a couple of minutes instead of
    // giving up quickly and forcing the user to keep clicking Connect.
    const backoffMs = [
      0, 2_000, 4_000, 8_000, 10_000, 10_000, 15_000, 15_000, 15_000, 15_000,
      15_000, 15_000,
    ];
    let lastError = "";
    cancelConnectRef.current = false;
    setRetryTotal(backoffMs.length);

    try {
      for (let i = 0; i < backoffMs.length; i += 1) {
        if (cancelConnectRef.current) {
          throw new Error("Connect cancelled.");
        }
        const delayMs = backoffMs[i];
        setRetryAttempt(i + 1);
        if (delayMs > 0) await sleep(delayMs);
        if (cancelConnectRef.current) {
          throw new Error("Connect cancelled.");
        }
        try {
          await connectRef.current();
          refreshOrbisTabLock();
          return;
        } catch (caught) {
          lastError =
            caught instanceof Error ? caught.message : String(caught);
          if (!isQuotaExceededError(lastError)) {
            releaseOrbisTabLock();
            throw caught;
          }
          await forceDisconnect();
          await waitForDisconnected();
        }
      }

      releaseOrbisTabLock();
      throw new Error(
        lastError ||
          "Could not connect to Orbis after repeated retries.",
      );
    } finally {
      setRetryAttempt(0);
      setRetryTotal(0);
    }
  }, [forceDisconnect, getStatus, waitForDisconnected]);

  useEffect(() => {
    const onHide = () => {
      cancelConnectRef.current = true;
      void forceDisconnect();
    };
    // "visibilitychange" fires reliably and early (unlike "pagehide", whose
    // async work can get cut off before the socket close reaches the
    // server). Closing the socket as soon as the tab is hidden — while we
    // are still mid-connect rather than fully streaming — is what prevents
    // an abandoned tab/refresh from leaving a zombie session that eats the
    // key's only slot and makes every future connect fail with the same
    // "slot is full" error.
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (statusRef.current === "connecting" || statusRef.current === "waiting") {
        cancelConnectRef.current = true;
        void forceDisconnect();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      void forceDisconnect();
    };
  }, [forceDisconnect]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const updateRunState = (message: OrbisMessage) => {
    if (message.type === "state") {
      if (typeof message.started === "boolean") setRunStarted(message.started);
      if (typeof message.paused === "boolean") setPaused(message.paused);
      if (message.has_image === false && !message.started) setImageStatus("");
    } else if (message.type === "generation_started") {
      setRunStarted(true);
      setPaused(false);
      if (message.image_conditioned === true) {
        setImageStatus("Orbis started from this image");
      } else if (
        message.image_conditioned === false &&
        expectsImageForRun.current
      ) {
        setImageStatus("Orbis started without image conditioning");
        setError("Orbis started without the uploaded image.");
      }
    } else if (message.type === "generation_paused") {
      setPaused(true);
    } else if (message.type === "generation_resumed") {
      setPaused(false);
    } else if (
      message.type === "generation_complete" ||
      message.type === "generation_reset"
    ) {
      setRunStarted(false);
      setPaused(false);
    }
  };

  useReactorMessage((raw: unknown) => {
    const message = unwrapOrbisMessage(raw);

    if (message.type === "conditions_ready") {
      conditionsReadyResolver.current?.();
      conditionsReadyResolver.current = null;
    }

    if (message.type === "state" && message.has_image === true) {
      imageReadyResolver.current?.();
      imageReadyResolver.current = null;
    }

    if (message.type === "state" && message.available_resolutions) {
      const reported = message.available_resolutions.map(String);
      if (reported.length) {
        setAvailableResolutions(reported);
        setResolution((current) =>
          !current || reported.includes(current) ? current : "",
        );
      }
    }

    if (!disconnecting.current) updateRunState(message);

    if (message.type === "command_error") {
      setError(
        `${message.command || "command"}: ${message.reason || "rejected"}`,
      );
      if (message.command === "start") setRunStarted(false);
    }

    if (message.type) {
      setEvents((current) => [message.type!, ...current].slice(0, 8));
    }
  });

  const waitForSignal = (
    resolver: { current: (() => void) | null },
    signalName: string,
  ) => {
    let timeout: ReturnType<typeof setTimeout>;
    const promise = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => {
        resolver.current = null;
        reject(new Error(`Timed out waiting for Orbis ${signalName}.`));
      }, 15_000);
      resolver.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    return {
      promise,
      cancel: () => {
        clearTimeout(timeout);
        resolver.current = null;
      },
    };
  };

  // Shared by the regular form and the Nano Banana one-click example.
  const startGeneration = async (
    startImage: File | null,
    runPrompt: string,
  ) => {
    if (!runPrompt.trim()) throw new Error("Enter a prompt before starting.");
    expectsImageForRun.current = Boolean(startImage);

    if (startImage) {
      const uploaded = await uploadFile(startImage, { name: startImage.name });
      const imageReady = waitForSignal(imageReadyResolver, "state.has_image");
      const rawReply = await sendCommand("set_image", { image: uploaded });
      if (!rawReply) {
        imageReady.cancel();
        throw new Error("Orbis did not accept the uploaded start image.");
      }

      const reply = unwrapOrbisMessage(rawReply);
      if (reply.type === "command_error") {
        imageReady.cancel();
        throw new Error(`set_image: ${reply.reason || "rejected"}`);
      }
      if (reply.type !== "image_accepted") {
        imageReady.cancel();
        throw new Error(
          `Expected image_accepted from Orbis, received ${reply.type || "an unknown reply"}.`,
        );
      }

      await imageReady.promise;

      const dimensions =
        reply.width && reply.height ? ` (${reply.width}×${reply.height})` : "";
      setImageStatus(`Orbis accepted image${dimensions}`);
      setEvents((current) => ["image_accepted", ...current].slice(0, 8));
    }

    if (resolution) await sendCommand("set_resolution", { resolution });

    const conditionsReady = waitForSignal(
      conditionsReadyResolver,
      "conditions_ready",
    );
    const promptReply = await sendCommand("set_prompt", {
      prompt: runPrompt.trim(),
    });
    if (!promptReply) {
      conditionsReady.cancel();
      throw new Error("Orbis did not accept the prompt.");
    }

    const promptMessage = unwrapOrbisMessage(promptReply);
    if (promptMessage.type === "command_error") {
      conditionsReady.cancel();
      throw new Error(`set_prompt: ${promptMessage.reason || "rejected"}`);
    }

    await conditionsReady.promise;
    setEvents((current) => ["conditions_ready", ...current].slice(0, 8));
    await sendCommand("start", {});
    setRunStarted(true);
    setPaused(false);
  };

  const selectImage = (nextImage: File | null) => {
    setImage(nextImage);
    setImageStatus("");
  };

  const startRun = () => runAction(() => startGeneration(image, prompt));

  const startFromNanoOutput = async (
    editedImage: File,
    groundedPrompt: string,
  ) => {
    setImage(editedImage);
    setPrompt(groundedPrompt);
    await runAction(() => startGeneration(editedImage, groundedPrompt));
  };

  const startAdRun = async (
    startImage: File | null,
    runPrompt: string,
  ) => {
    setImage(startImage);
    setPrompt(runPrompt);
    await runAction(() => startGeneration(startImage, runPrompt));
  };

  const steer = () =>
    runAction(async () => {
      if (!prompt.trim()) throw new Error("Enter a prompt before steering.");
      await sendCommand("set_prompt", { prompt: prompt.trim() });
    });

  const steerWithPrompt = async (nextPrompt: string) => {
    const trimmed = nextPrompt.trim();
    if (!trimmed) throw new Error("Enter a prompt before steering.");
    setPrompt(trimmed);
    await runAction(async () => {
      await sendCommand("set_prompt", { prompt: trimmed });
    });
  };

  const disconnectSession = async () => {
    cancelConnectRef.current = true;
    setError("");
    setBusy(true);
    try {
      await forceDisconnect();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return {
    status,
    connected,
    controlsBusy,
    runStarted,
    paused,
    muted,
    prompt,
    image,
    imageStatus,
    resolution,
    availableResolutions,
    error,
    events,
    retryAttempt,
    retryTotal,
    connectSession: () => runAction(() => connectWithRetry()),
    disconnectSession,
    toggleMuted: () => setMuted((current) => !current),
    setPrompt,
    selectImage,
    setResolution,
    startRun,
    startFromNanoOutput,
    startAdRun,
    setNanoBusy,
    steer,
    steerWithPrompt,
    pause: () => runAction(() => sendCommand("pause", {})),
    resume: () => runAction(() => sendCommand("resume", {})),
    reset: () => runAction(() => sendCommand("reset", {})),
  };
}

export type OrbisSession = ReturnType<typeof useOrbisSession>;
