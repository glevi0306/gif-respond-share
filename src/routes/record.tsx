import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { BottomSheet } from "../components/bottom-sheet";
import { Camera, CheckCircle2, RotateCcw, Send, SwitchCamera, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/record")({
  validateSearch: (search: Record<string, unknown>) => ({
    questionId: search.questionId as string | undefined,
  }),
  head: () => ({ meta: [{ title: "Record — Sec." }] }),
  component: RecordPage,
});

// ── Phase state machine ───────────────────────────────────────
// idle → countdown → recording → encoding → preview → uploading → done
type Phase = "idle" | "countdown" | "recording" | "encoding" | "preview" | "uploading" | "done";

const DURATION_MS = 5000;
const FPS = 12;
const GIF_WIDTH = 360;
const FRAME_INTERVAL = Math.round(1000 / FPS);
const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);

type ProfileRow = { id: string; username: string; avatar_emoji: string };

function RecordPage() {
  const { questionId } = Route.useSearch();

  // ── Recording state ───────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdownNum, setCountdownNum] = useState(3);
  const [progress, setProgress] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  // ── Save / Send state ─────────────────────────────────────
  const [isSaved, setIsSaved] = useState(false);
  const savedRef = useRef<{ publicUrl: string; gifId: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSendSheet, setShowSendSheet] = useState(false);

  // ── Refs ──────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<ImageData[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gifBlobRef = useRef<Blob | null>(null);
  const uploadingRef = useRef(false);
  const countdownCancelledRef = useRef(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Friend list — only loaded when Send sheet is open (no questionId path)
  const { data: allProfiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["profiles", "all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_emoji")
        .neq("id", user!.id)
        .order("username")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!user && !questionId && showSendSheet,
  });

  // ── Camera helpers (unchanged) ────────────────────────────

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

  useEffect(() => {
    void startCamera();
    return () => {
      clearTimers();
      stopStream();
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  // ── GIF encoder (unchanged) ───────────────────────────────

  const encodeGif = async () => {
    setPhase("encoding");
    setEncodeProgress(0);
    const frames = framesRef.current;
    if (frames.length === 0) { setError("No frames captured."); setPhase("idle"); return; }
    const gif = GIFEncoder();
    const delay = Math.round(1000 / FPS);
    for (let i = 0; i < frames.length; i++) {
      const data = frames[i].data;
      const palette = quantize(data, 256, { format: "rgb444" });
      const index = applyPalette(data, palette, "rgb444");
      gif.writeFrame(index, frames[i].width, frames[i].height, { palette, delay });
      setEncodeProgress((i + 1) / frames.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    gif.finish();
    const bytes = gif.bytes();
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: "image/gif" });
    gifBlobRef.current = blob;
    const url = URL.createObjectURL(blob);
    setGifUrl(url);
    framesRef.current = [];
    setPhase("preview");
  };

  // ── Recording start ───────────────────────────────────────

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

    // 3-second countdown before recording begins
    countdownCancelledRef.current = false;
    setCountdownNum(3);
    setPhase("countdown");
    for (let i = 2; i >= 1; i--) {
      await new Promise((r) => setTimeout(r, 1000));
      if (countdownCancelledRef.current) return;
      setCountdownNum(i);
    }
    await new Promise((r) => setTimeout(r, 1000));
    if (countdownCancelledRef.current) return;

    framesRef.current = [];
    setPhase("recording");
    setProgress(0);
    const startedAt = performance.now();
    captureTimerRef.current = setInterval(() => {
      if (framesRef.current.length >= TOTAL_FRAMES) return;
      if (facing === "user") {
        ctx.save(); ctx.translate(targetW, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, targetW, targetH); ctx.restore();
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
      clearTimers(); setProgress(1); void encodeGif();
    }, DURATION_MS);
  };

  // ── Retake (unchanged) ────────────────────────────────────

  const reset = async () => {
    countdownCancelledRef.current = true;
    clearTimers();
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    gifBlobRef.current = null;
    uploadingRef.current = false;
    savedRef.current = null;
    setGifUrl(null);
    setProgress(0);
    setEncodeProgress(0);
    setUploadError(null);
    setSaveError(null);
    setIsSaved(false);
    setShowSendSheet(false);
    setPhase("idle");
    await startCamera();
  };

  // ── Flip camera (unchanged) ───────────────────────────────

  const flipCamera = async () => {
    setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (phase === "idle") void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // ── Core upload: storage + gifs table ────────────────────
  // Returns { publicUrl, gifId } — reuses saved result if already uploaded.

  const ensureGifSaved = async (): Promise<{ publicUrl: string; gifId: string }> => {
    if (savedRef.current) return savedRef.current;
    if (!gifBlobRef.current || !user) throw new Error("Nothing to upload.");

    const fileId = crypto.randomUUID();
    const storagePath = `${user.id}/${fileId}.gif`;

    const { error: storageErr } = await supabase.storage
      .from("gifs")
      .upload(storagePath, gifBlobRef.current, {
        contentType: "image/gif",
        cacheControl: "3600",
        upsert: false,
      });
    if (storageErr) throw storageErr;

    const { data: { publicUrl } } = supabase.storage.from("gifs").getPublicUrl(storagePath);

    const { data: gifRow, error: gifErr } = await supabase
      .from("gifs")
      .insert({ user_id: user.id, storage_path: storagePath, public_url: publicUrl, duration_ms: DURATION_MS })
      .select("id")
      .single();
    if (gifErr) throw gifErr;

    const result = { publicUrl, gifId: gifRow.id };
    savedRef.current = result;
    return result;
  };

  // ── Save to Library ───────────────────────────────────────
  // Uploads (once) and stays on the preview screen.

  const handleSave = async () => {
    if (isSaved || uploadingRef.current) return;
    uploadingRef.current = true;
    setSaveError(null);
    try {
      await ensureGifSaved();
      setIsSaved(true);
      queryClient.invalidateQueries({ queryKey: ["gifs"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      uploadingRef.current = false;
    }
  };

  // ── Send as answer to an existing question ────────────────

  const handleSendAnswer = async () => {
    if (uploadingRef.current || !questionId) return;
    uploadingRef.current = true;
    setUploadError(null);
    setPhase("uploading");
    try {
      const { publicUrl, gifId } = await ensureGifSaved();
      if (!isSaved) { setIsSaved(true); queryClient.invalidateQueries({ queryKey: ["gifs"] }); }

      const { error: ansErr } = await supabase.from("answers").insert({
        question_id: questionId,
        responder_id: user!.id,
        gif_id: gifId,
        gif_url: publicUrl,
      });
      if (ansErr) throw ansErr;

      const { error: qErr } = await supabase
        .from("questions")
        .update({ status: "answered" })
        .eq("id", questionId)
        .eq("to_id", user!.id);
      if (qErr) throw qErr;

      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["answer", "for-question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["conv-answers"] });

      // Increment usage counter (fire-and-forget)
      supabase.rpc("increment_gif_usage", { p_gif_id: gifId }).catch(() => {});
      // TODO(haptics): trigger impact feedback here when Capacitor is added

      setPhase("done");
      setTimeout(() => { uploadingRef.current = false; navigate({ to: "/home" }); }, 900);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Send failed. Please try again.");
      setPhase("preview");
      uploadingRef.current = false;
    }
  };

  // ── Send GIF to a friend (no questionId) ─────────────────
  // Saves to library, then inserts a direct_gifs row so it appears in chat.

  const handleSendToFriend = async (friendId: string) => {
    setShowSendSheet(false);
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadError(null);
    setPhase("uploading");
    try {
      const { publicUrl, gifId } = await ensureGifSaved();
      if (!isSaved) { setIsSaved(true); queryClient.invalidateQueries({ queryKey: ["gifs"] }); }

      const { error: dgErr } = await supabase.from("direct_gifs").insert({
        sender_id: user!.id,
        receiver_id: friendId,
        gif_id: gifId,
        gif_url: publicUrl,
      });
      if (dgErr) throw dgErr;

      queryClient.invalidateQueries({ queryKey: ["conv-direct-gifs"] });

      // Increment usage counter (fire-and-forget)
      supabase.rpc("increment_gif_usage", { p_gif_id: gifId }).catch(() => {});
      // TODO(haptics): trigger impact feedback here when Capacitor is added

      setPhase("done");
      setTimeout(() => {
        uploadingRef.current = false;
        navigate({ to: "/conversation/$userId", params: { userId: friendId } });
      }, 900);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Send failed.");
      setPhase("preview");
      uploadingRef.current = false;
    }
  };

  // ── Derived helpers ───────────────────────────────────────

  const showCamera = phase !== "preview" && phase !== "uploading" && phase !== "done";
  const showGif = (phase === "preview" || phase === "uploading" || phase === "done") && !!gifUrl;
  const showActions = phase === "preview" || phase === "uploading" || phase === "done";
  const actionsDisabled = phase === "uploading" || phase === "done";

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="pb-28">
      <OrangeHeader title="Record GIF" subtitle="5 seconds. Loops forever." back="/home" />

      <div className="px-5 pt-6">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black">

          {/* Always in DOM so videoRef is valid when reset() calls startCamera() */}
          <video
            ref={videoRef}
            playsInline muted autoPlay
            className={`absolute inset-0 h-full w-full object-cover ${!showCamera ? "hidden" : ""}`}
            style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
          />

          {showGif && (
            <img
              src={gifUrl!}
              alt="Recorded GIF preview"
              className="absolute inset-0 h-full w-full object-cover animate-fade-in"
            />
          )}

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

          {phase === "idle" && streamRef.current && (
            <button
              onClick={flipCamera}
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
              aria-label="Flip camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          )}

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

          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span
                key={countdownNum}
                className="text-9xl font-black text-white drop-shadow-2xl animate-countdown"
              >
                {countdownNum}
              </span>
            </div>
          )}

          {phase === "encoding" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[var(--orange)]" />
                <p className="text-sm font-semibold">Creating GIF…</p>
                <p className="mt-1 text-xs text-white/70 tabular-nums">{Math.round(encodeProgress * 100)}%</p>
              </div>
            </div>
          )}

          {phase === "uploading" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[var(--orange)]" />
                <p className="text-sm font-semibold">
                  {questionId ? "Sending GIF…" : "Saving GIF…"}
                </p>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl font-bold">
                  ✓
                </div>
                <p className="text-sm font-semibold">
                  {questionId ? "Answer sent!" : "GIF saved!"}
                </p>
              </div>
            </div>
          )}

          {showGif && phase !== "uploading" && phase !== "done" && (
            <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              GIF · Loop
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          {!showActions ? (
            <button
              onClick={start}
              disabled={phase === "recording" || phase === "encoding" || phase === "countdown" || !!error}
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
            <div className="w-full space-y-3">
              {/* Row: Retake + Save */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={reset}
                  disabled={actionsDisabled}
                  className="flex items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaved || actionsDisabled}
                  className={`flex items-center justify-center gap-2 rounded-full border py-3.5 text-sm font-semibold transition ${
                    isSaved
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-save-pulse"
                      : "border-border bg-card disabled:opacity-40"
                  }`}
                >
                  {isSaved ? (
                    <><CheckCircle2 className="h-4 w-4" /> Saved</>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>

              {/* Send button — full width */}
              <button
                onClick={() => {
                  if (questionId) {
                    void handleSendAnswer();
                  } else {
                    setShowSendSheet(true);
                  }
                }}
                disabled={actionsDisabled}
                className="btn-black flex w-full items-center justify-center gap-2 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {questionId ? "Send answer" : "Send GIF"}
              </button>
            </div>
          )}

          {(uploadError || saveError) && phase === "preview" && (
            <p className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {uploadError ?? saveError}
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {phase === "idle" && (error ? "Camera unavailable" : "Tap to start a 5-second recording")}
            {phase === "countdown" && "Get ready…"}
            {phase === "recording" && "Recording…"}
            {phase === "encoding" && "Encoding your GIF…"}
            {phase === "preview" && "Looks good? Save to Library or Send."}
            {phase === "uploading" && "Saving your GIF…"}
            {phase === "done" && (questionId ? "Navigating back…" : "All done!")}
          </p>
        </div>
      </div>

      {/* Friend-picker sheet — only when no questionId */}
      <BottomSheet
        isOpen={showSendSheet}
        onClose={() => setShowSendSheet(false)}
        title="Send GIF"
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {allProfiles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No friends yet — invite someone!
            </p>
          )}
          {allProfiles.map((f) => (
            <button
              key={f.id}
              onClick={() => void handleSendToFriend(f.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition active:scale-[0.99]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-xl">
                {f.avatar_emoji}
              </div>
              <p className="text-sm font-semibold">{f.username}</p>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomNav />
    </div>
  );
}
