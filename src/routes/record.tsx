import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { Camera, Save, Send, RotateCcw, SwitchCamera, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/record")({
  head: () => ({ meta: [{ title: "Record — Sec." }] }),
  component: RecordPage,
});

type Phase = "idle" | "recording" | "encoding" | "preview";

const DURATION_MS = 5000;
const FPS = 12;
const GIF_WIDTH = 360; // capture width; height derived from aspect
const FRAME_INTERVAL = Math.round(1000 / FPS);
const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);

function RecordPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<ImageData[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const navigate = useNavigate();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimers = () => {
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    captureTimerRef.current = null;
    stopTimeoutRef.current = null;
    progressTimerRef.current = null;
  };

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not supported on this device.");
      }
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to access camera.";
      setError(msg);
    }
  }, [facing, stopStream]);

  // Mount: request camera; cleanup on unmount
  useEffect(() => {
    void startCamera();
    return () => {
      clearTimers();
      stopStream();
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  const encodeGif = async () => {
    setPhase("encoding");
    setEncodeProgress(0);
    const frames = framesRef.current;
    if (frames.length === 0) {
      setError("No frames captured.");
      setPhase("idle");
      return;
    }
    const gif = GIFEncoder();
    const delay = Math.round(1000 / FPS);
    for (let i = 0; i < frames.length; i++) {
      const data = frames[i].data;
      const palette = quantize(data, 256, { format: "rgb444" });
      const index = applyPalette(data, palette, "rgb444");
      gif.writeFrame(index, frames[i].width, frames[i].height, { palette, delay });
      setEncodeProgress((i + 1) / frames.length);
      // Yield to keep UI responsive
      await new Promise((r) => setTimeout(r, 0));
    }
    gif.finish();
    const blob = new Blob([gif.bytes()], { type: "image/gif" });
    const url = URL.createObjectURL(blob);
    setGifUrl(url);
    framesRef.current = [];
    setPhase("preview");
  };

  const start = async () => {
    if (!streamRef.current || !videoRef.current) {
      await startCamera();
      if (!streamRef.current) return;
    }
    const video = videoRef.current!;
    if (video.readyState < 2) {
      await new Promise<void>((res) => {
        const on = () => { video.removeEventListener("loadeddata", on); res(); };
        video.addEventListener("loadeddata", on);
      });
    }

    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;
    const targetW = GIF_WIDTH;
    const targetH = Math.round((vh / vw) * targetW);
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { setError("Canvas not available."); return; }

    framesRef.current = [];
    setPhase("recording");
    setProgress(0);
    const startedAt = performance.now();

    captureTimerRef.current = setInterval(() => {
      if (framesRef.current.length >= TOTAL_FRAMES) return;
      if (facing === "user") {
        ctx.save();
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, targetW, targetH);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, targetW, targetH);
      }
      framesRef.current.push(ctx.getImageData(0, 0, targetW, targetH));
    }, FRAME_INTERVAL);

    progressTimerRef.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt) / DURATION_MS);
      setProgress(p);
    }, 50);

    stopTimeoutRef.current = setTimeout(() => {
      clearTimers();
      setProgress(1);
      void encodeGif();
    }, DURATION_MS);
  };

  const reset = async () => {
    clearTimers();
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifUrl(null);
    setProgress(0);
    setEncodeProgress(0);
    setPhase("idle");
    if (!streamRef.current) await startCamera();
  };

  const flipCamera = async () => {
    setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  // Restart stream when facing changes
  useEffect(() => {
    if (phase === "idle") void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  return (
    <div className="pb-28">
      <OrangeHeader title="Record GIF" subtitle="5 seconds. Loops forever." back="/home" />

      <div className="px-5 pt-6">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black">
          {/* Live camera */}
          {phase !== "preview" && (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
          )}

          {/* GIF preview */}
          {phase === "preview" && gifUrl && (
            <img
              src={gifUrl}
              alt="Recorded GIF preview"
              className="absolute inset-0 h-full w-full object-cover animate-fade-in"
            />
          )}

          {/* No-camera fallback icon */}
          {error && phase === "idle" && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center text-white">
              <div>
                <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[var(--orange)]" />
                <p className="text-sm font-medium">{error}</p>
                <p className="mt-2 text-xs text-white/60">Allow camera access in your browser settings.</p>
              </div>
            </div>
          )}

          {!streamRef.current && !error && phase === "idle" && (
            <div className="absolute inset-0 grid place-items-center text-white/40">
              <Camera className="h-16 w-16" />
            </div>
          )}

          {/* Flip camera */}
          {phase === "idle" && streamRef.current && (
            <button
              onClick={flipCamera}
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
              aria-label="Flip camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          )}

          {/* REC overlay */}
          {phase === "recording" && (
            <>
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur">
                {(5 - progress * 5).toFixed(1)}s
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                <div
                  className="h-full bg-[var(--orange)]"
                  style={{ width: `${progress * 100}%`, transition: "width 75ms linear" }}
                />
              </div>
            </>
          )}

          {/* Encoding overlay */}
          {phase === "encoding" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[var(--orange)]" />
                <p className="text-sm font-semibold">Creating GIF…</p>
                <p className="mt-1 text-xs text-white/70 tabular-nums">{Math.round(encodeProgress * 100)}%</p>
              </div>
            </div>
          )}

          {/* Loop badge on preview */}
          {phase === "preview" && (
            <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              GIF · Loop
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center">
          {phase !== "preview" ? (
            <button
              onClick={start}
              disabled={phase === "recording" || phase === "encoding" || !!error}
              className={`relative grid h-20 w-20 place-items-center rounded-full text-white shadow-xl disabled:opacity-60 ${phase === "idle" ? "animate-pulse-ring" : ""}`}
              style={{ backgroundColor: phase === "recording" ? "#dc2626" : "var(--orange)" }}
              aria-label="Record"
            >
              <div
                className={`${phase === "recording" ? "h-6 w-6 rounded-md" : "h-14 w-14 rounded-full"} bg-white/95`}
                style={{ transition: "all 200ms ease" }}
              />
            </button>
          ) : (
            <div className="grid w-full grid-cols-2 gap-3">
              <button onClick={reset} className="flex items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold">
                <RotateCcw className="h-4 w-4" /> Retake
              </button>
              <button onClick={() => navigate({ to: "/library" })} className="btn-black flex items-center justify-center gap-2">
                <Save className="h-4 w-4" /> Save
              </button>
              <button onClick={() => navigate({ to: "/home" })} className="btn-black col-span-2 flex items-center justify-center gap-2">
                <Send className="h-4 w-4" /> Send answer
              </button>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {phase === "idle" && (error ? "Camera unavailable" : "Tap to start a 5-second recording")}
            {phase === "recording" && "Recording…"}
            {phase === "encoding" && "Encoding your GIF…"}
            {phase === "preview" && "Looks good?"}
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
