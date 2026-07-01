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
import { UserAvatar } from "../components/user-avatar";

export const Route = createFileRoute("/record")({
  validateSearch: (search: Record<string, unknown>) => ({
    questionId: search.questionId as string | undefined,
  }),
  head: () => ({ meta: [{ title: "Record — Sec." }] }),
  component: RecordPage,
});

// ── Phase state machine ───────────────────────────────────────
// idle → recording → encoding → preview → uploading → done
type Phase = "idle" | "recording" | "encoding" | "preview" | "uploading" | "done";

const DURATION_MS = 5000;
const MIN_DURATION_MS = 1000;
const FPS = 12;
const GIF_WIDTH = 360;
const FRAME_INTERVAL = Math.round(1000 / FPS);
const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);
// Hold threshold: if user releases before this ms, it's a tap (recording continues until second tap)
const HOLD_THRESHOLD_MS = 350;

// SVG border constants
const BORDER_STROKE = 2.5;
const BORDER_RX = 28; // matches rounded-3xl

type ProfileRow = {
  id: string;
  username: string;
  avatar_emoji: string;
  avatar_url?: string | null;
};

function RecordPage() {
  const { questionId } = Route.useSearch();

  // ── Recording state ───────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [minDurationError, setMinDurationError] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">(() => {
    try {
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem("sec.preferredCameraFacingMode")
          : null;
      return stored === "environment" ? "environment" : "user";
    } catch {
      return "user";
    }
  });
  const [isSwitching, setIsSwitching] = useState(false);
  const [cameraOpacity, setCameraOpacity] = useState(1);
  const [backCameraError, setBackCameraError] = useState<string | null>(null);
  // Tracks whether the camera stream is live. Stored in state (not only in
  // streamRef) so that a successful getUserMedia call triggers a re-render
  // and makes the flip button visible immediately — refs alone don't do this.
  const [streamReady, setStreamReady] = useState(false);

  // ── Border animation state ────────────────────────────────
  const [borderVisible, setBorderVisible] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // ── Save / Send state ─────────────────────────────────────
  const [isSaved, setIsSaved] = useState(false);
  const savedRef = useRef<{ publicUrl: string; gifId: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSendSheet, setShowSendSheet] = useState(false);

  // ── Refs (existing) ───────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<ImageData[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gifBlobRef = useRef<Blob | null>(null);
  const uploadingRef = useRef(false);

  // ── Interaction refs ──────────────────────────────────────
  const cameraContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerDownAtRef = useRef<number | null>(null);
  const tapModeActiveRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  // Prevents double-stop when both pointerup and auto-timeout fire close together
  const stoppingRef = useRef(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Friend list — only loaded when Send sheet is open (no questionId path)
  const { data: allProfiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["profiles", "all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_emoji, avatar_url")
        .neq("id", user!.id)
        .order("username")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!user && !questionId && showSendSheet,
  });

  // ── Measure camera container for SVG border ───────────────
  useEffect(() => {
    const el = cameraContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Camera helpers ────────────────────────────────────────

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
      setStreamReady(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      if (facing === "environment") {
        setBackCameraError("Back camera not available on this device.");
        setFacing("user");
        return;
      }
      const msg = e instanceof Error ? e.message : "Unable to access camera.";
      setError(msg);
    } finally {
      setCameraOpacity(1);
      setIsSwitching(false);
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
    if (frames.length === 0) {
      setError("No frames captured.");
      setPhase("idle");
      return;
    }
    try {
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
    } catch (err) {
      console.error("GIF encoding failed:", err);
      framesRef.current = [];
      setError("Could not create GIF. Please try again.");
      setPhase("idle");
    }
  };

  // ── Start recording (no countdown) ───────────────────────

  const startRecordingDirectly = async () => {
    stoppingRef.current = false;
    tapModeActiveRef.current = false;
    setMinDurationError(null);

    if (!streamRef.current || !videoRef.current) {
      await startCamera();
      if (!streamRef.current) return;
    }
    const video = videoRef.current!;
    if (video.readyState < 2) {
      await new Promise<void>((res) => {
        const on = () => {
          video.removeEventListener("loadeddata", on);
          res();
        };
        video.addEventListener("loadeddata", on);
      });
    }
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;

    // GIF canvas matches the 3:4 preview container so the output equals what the user saw.
    const targetW = GIF_WIDTH;
    const targetH = Math.round((GIF_WIDTH * 4) / 3); // 480 — mirrors aspect-[3/4] container

    // Replicate CSS object-cover center-crop: scale the video until it covers the 3:4 frame,
    // then sample only the visible center region.
    const videoAspect = vw / vh;
    const containerAspect = 3 / 4;
    let sx: number, sy: number, sw: number, sh: number;
    if (videoAspect > containerAspect) {
      // Video wider than container → fit height, crop left/right symmetrically
      sh = vh;
      sw = Math.round(vh * containerAspect);
      sx = Math.round((vw - sw) / 2);
      sy = 0;
    } else {
      // Video taller/narrower → fit width, crop top/bottom symmetrically
      sw = vw;
      sh = Math.round(vw / containerAspect);
      sx = 0;
      sy = Math.round((vh - sh) / 2);
    }

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setError("Canvas not available.");
      return;
    }

    framesRef.current = [];
    recordingStartedAtRef.current = Date.now();
    // HAPTIC: light-impact — recording starts
    setPhase("recording");
    setBorderVisible(true);
    setProgress(0);

    const startedAt = performance.now();
    captureTimerRef.current = setInterval(() => {
      if (framesRef.current.length >= TOTAL_FRAMES) return;
      if (facing === "user") {
        ctx.save();
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
        ctx.restore();
      } else {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
      }
      framesRef.current.push(ctx.getImageData(0, 0, targetW, targetH));
    }, FRAME_INTERVAL);
    progressTimerRef.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt) / DURATION_MS);
      setProgress(p);
    }, 50);
    // Auto-stop at max duration
    stopTimeoutRef.current = setTimeout(() => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      clearTimers();
      setBorderVisible(false);
      setProgress(1);
      tapModeActiveRef.current = false;
      pointerDownAtRef.current = null;
      void encodeGif();
    }, DURATION_MS);
  };

  // ── Stop recording early (with min-duration check) ────────

  const stopRecordingEarly = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const elapsed = Date.now() - recordingStartedAtRef.current;
    clearTimers();
    setBorderVisible(false);
    tapModeActiveRef.current = false;
    pointerDownAtRef.current = null;

    if (elapsed < MIN_DURATION_MS) {
      framesRef.current = [];
      setPhase("idle");
      setProgress(0);
      setMinDurationError("Record at least 1 second.");
      stoppingRef.current = false;
      return;
    }
    void encodeGif();
  };

  // ── Button pointer handlers ───────────────────────────────

  const handleButtonPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase === "idle" && !error) {
      pointerDownAtRef.current = Date.now();
      void startRecordingDirectly();
    } else if (phase === "recording" && tapModeActiveRef.current) {
      // Second tap in tap mode → stop
      stopRecordingEarly();
    }
  };

  const handleButtonPointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase !== "recording") {
      pointerDownAtRef.current = null;
      return;
    }
    const downAt = pointerDownAtRef.current;
    pointerDownAtRef.current = null;
    if (downAt === null || stoppingRef.current) return;

    const held = Date.now() - downAt;
    if (held >= HOLD_THRESHOLD_MS) {
      // Hold mode: release → stop
      stopRecordingEarly();
    } else {
      // Tap mode: quick release, wait for second tap
      tapModeActiveRef.current = true;
    }
  };

  const handleButtonPointerLeave = () => {
    // If user drags off the button while holding, treat as release in hold mode
    if (phase === "recording" && pointerDownAtRef.current !== null && !tapModeActiveRef.current) {
      stopRecordingEarly();
    }
  };

  // ── Retake ────────────────────────────────────────────────

  const reset = async () => {
    clearTimers();
    setBorderVisible(false);
    stoppingRef.current = false;
    tapModeActiveRef.current = false;
    pointerDownAtRef.current = null;
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    gifBlobRef.current = null;
    uploadingRef.current = false;
    savedRef.current = null;
    setGifUrl(null);
    setProgress(0);
    setEncodeProgress(0);
    setUploadError(null);
    setSaveError(null);
    setMinDurationError(null);
    setIsSaved(false);
    setShowSendSheet(false);
    setPhase("idle");
    await startCamera();
  };

  // ── Flip camera ───────────────────────────────────────────

  const flipCamera = () => {
    if (isSwitching || phase !== "idle" || !streamRef.current) return;
    const next: "user" | "environment" = facing === "user" ? "environment" : "user";
    setBackCameraError(null);
    setIsSwitching(true);
    setCameraOpacity(0);
    try {
      window.localStorage.setItem("sec.preferredCameraFacingMode", next);
    } catch {
      // ignore — localStorage unavailable
    }
    setFacing(next);
  };

  // Auto-clear back-camera warning after 3 s
  useEffect(() => {
    if (!backCameraError) return;
    const t = setTimeout(() => setBackCameraError(null), 3000);
    return () => clearTimeout(t);
  }, [backCameraError]);

  useEffect(() => {
    if (phase === "idle") void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // ── Core upload: storage + gifs table ────────────────────
  // Returns { publicUrl, gifId } — reuses saved result if already uploaded.
  //
  // Invariant: a gifs DB row is ONLY created if the storage upload succeeded,
  // and conversely a storage file is removed if the DB insert fails.

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

    const {
      data: { publicUrl },
    } = supabase.storage.from("gifs").getPublicUrl(storagePath);

    const { data: gifRow, error: gifErr } = await supabase
      .from("gifs")
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        public_url: publicUrl,
        duration_ms: DURATION_MS,
      })
      .select("id")
      .single();
    if (gifErr) {
      await supabase.storage
        .from("gifs")
        .remove([storagePath])
        .catch(() => {});
      throw gifErr;
    }

    const result = { publicUrl, gifId: gifRow.id };
    savedRef.current = result;
    return result;
  };

  // ── Save to Library ───────────────────────────────────────

  const handleSave = async () => {
    if (isSaved || uploadingRef.current) return;
    uploadingRef.current = true;
    setSaveError(null);
    setPhase("uploading");
    try {
      await ensureGifSaved();
      setIsSaved(true);
      queryClient.invalidateQueries({ queryKey: ["gifs"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      uploadingRef.current = false;
      setPhase("preview");
    }
  };

  // ── Send as answer ────────────────────────────────────────

  const handleSendAnswer = async () => {
    if (uploadingRef.current || !questionId) return;
    uploadingRef.current = true;
    setUploadError(null);
    setPhase("uploading");
    try {
      const { publicUrl, gifId } = await ensureGifSaved();
      if (!isSaved) {
        setIsSaved(true);
        queryClient.invalidateQueries({ queryKey: ["gifs"] });
      }

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
      queryClient.invalidateQueries({ queryKey: ["chats"] });

      void (async () => {
        try {
          await supabase.rpc("increment_gif_usage", { p_gif_id: gifId });
        } catch {
          /* non-critical */
        }
      })();

      // HAPTIC: success — GIF sent
      setPhase("done");
      setTimeout(() => {
        uploadingRef.current = false;
        navigate({ to: "/home" });
      }, 900);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Send failed. Please try again.");
      setPhase("preview");
      uploadingRef.current = false;
    }
  };

  // ── Send GIF to a friend ──────────────────────────────────

  const handleSendToFriend = async (friendId: string) => {
    setShowSendSheet(false);
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadError(null);
    setPhase("uploading");
    try {
      const { publicUrl, gifId } = await ensureGifSaved();
      if (!isSaved) {
        setIsSaved(true);
        queryClient.invalidateQueries({ queryKey: ["gifs"] });
      }

      const { error: dgErr } = await supabase.from("direct_gifs").insert({
        sender_id: user!.id,
        receiver_id: friendId,
        gif_id: gifId,
        gif_url: publicUrl,
      });
      if (dgErr) throw dgErr;

      queryClient.invalidateQueries({ queryKey: ["conv-direct-gifs"] });

      void (async () => {
        try {
          await supabase.rpc("increment_gif_usage", { p_gif_id: gifId });
        } catch {
          /* non-critical */
        }
      })();

      // HAPTIC: success — GIF sent to friend
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

  // ── SVG border perimeter ──────────────────────────────────
  const bInset = BORDER_STROKE / 2;
  const bw = containerSize.w > 0 ? containerSize.w - bInset * 2 : 0;
  const bh = containerSize.h > 0 ? containerSize.h - bInset * 2 : 0;
  const perimeter =
    bw > 0 && bh > 0
      ? 2 * (bw - 2 * BORDER_RX) + 2 * (bh - 2 * BORDER_RX) + 2 * Math.PI * BORDER_RX
      : 0;
  const dashOffset = perimeter > 0 ? perimeter * (1 - progress) : 0;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="pb-28">
      <OrangeHeader title="Record GIF" subtitle="5 seconds. Loops forever." back="/home" />

      <div className="px-5 pt-6">
        <div
          ref={cameraContainerRef}
          className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black"
        >
          {/* Always in DOM so videoRef is valid when reset() calls startCamera() */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full object-cover ${!showCamera ? "hidden" : ""}`}
            style={{
              transform: facing === "user" ? "scaleX(-1)" : undefined,
              opacity: cameraOpacity,
              transition: "opacity 220ms ease",
            }}
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
                <p className="mt-2 text-xs text-white/60">
                  Allow camera access in your browser settings.
                </p>
              </div>
            </div>
          )}

          {!streamRef.current && !error && phase === "idle" && (
            <div className="absolute inset-0 grid place-items-center text-white/40">
              <Camera className="h-16 w-16" />
            </div>
          )}

          {phase === "idle" && streamReady && (
            <button
              onClick={flipCamera}
              disabled={isSwitching}
              className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-[opacity,transform] disabled:opacity-40 active:scale-90"
              aria-label="Flip camera"
              // HAPTIC: selection — camera direction changes
            >
              <SwitchCamera
                className="h-5 w-5"
                style={{
                  transform: isSwitching ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </button>
          )}

          {backCameraError && phase === "idle" && (
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/65 px-4 py-2.5 text-center text-xs font-medium text-white backdrop-blur-sm">
              {backCameraError}
            </div>
          )}

          {phase === "recording" && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
            </div>
          )}

          {phase === "recording" && (
            <div className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur">
              {(5 - progress * 5).toFixed(1)}s
            </div>
          )}

          {phase === "encoding" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm animate-overlay-fade">
              <div className="text-center text-white">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[var(--orange)]" />
                <p className="text-sm font-semibold">Creating GIF…</p>
                <p className="mt-1 text-xs text-white/70 tabular-nums">
                  {Math.round(encodeProgress * 100)}%
                </p>
              </div>
            </div>
          )}

          {phase === "uploading" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm animate-overlay-fade">
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
              <div className="text-center text-white animate-fade-in">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl font-bold animate-success-in">
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

          {/* Neon green border progress — traces around the camera frame while recording */}
          {perimeter > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={containerSize.w}
              height={containerSize.h}
              style={{
                opacity: borderVisible ? 1 : 0,
                transition: "opacity 220ms ease",
              }}
            >
              <rect
                x={bInset}
                y={bInset}
                width={bw}
                height={bh}
                rx={BORDER_RX}
                ry={BORDER_RX}
                fill="none"
                stroke="#4ade80"
                strokeWidth={BORDER_STROKE}
                strokeLinecap="round"
                strokeDasharray={perimeter}
                strokeDashoffset={dashOffset}
                style={{
                  transition: borderVisible ? "stroke-dashoffset 75ms linear" : "none",
                }}
              />
            </svg>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          {!showActions ? (
            <>
              <button
                onPointerDown={handleButtonPointerDown}
                onPointerUp={handleButtonPointerUp}
                onPointerLeave={handleButtonPointerLeave}
                disabled={phase === "encoding" || !!error}
                className={`relative grid h-20 w-20 place-items-center rounded-full text-white shadow-xl disabled:opacity-60 active:scale-95 ${phase === "idle" ? "animate-pulse-ring" : ""}`}
                style={{
                  backgroundColor: phase === "recording" ? "#dc2626" : "var(--orange)",
                  transition:
                    "transform 120ms cubic-bezier(0.2, 0, 0, 1), background-color 200ms ease",
                }}
                aria-label={phase === "recording" ? "Stop recording" : "Record"}
              >
                <div
                  className={`${phase === "recording" ? "h-6 w-6 rounded-md" : "h-14 w-14 rounded-full"} bg-white/95`}
                  style={{
                    transition: "width 200ms ease, height 200ms ease, border-radius 200ms ease",
                  }}
                />
              </button>

              {minDurationError && (
                <p className="text-center text-xs font-medium text-amber-600 dark:text-amber-400">
                  {minDurationError}
                </p>
              )}
            </>
          ) : (
            <div className="w-full space-y-3">
              {/* Row: Retake + Save */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={reset}
                  disabled={actionsDisabled}
                  className="flex items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaved || actionsDisabled}
                  className={`flex items-center justify-center gap-2 rounded-full border py-3.5 text-sm font-semibold transition-transform active:scale-[0.97] ${
                    isSaved
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-save-pulse"
                      : "border-border bg-card disabled:opacity-40"
                  }`}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Saved
                    </>
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
            {phase === "idle" && (error ? "Camera unavailable" : "Hold to record")}
            {phase === "recording" && "Recording…"}
            {phase === "encoding" && "Encoding your GIF…"}
            {phase === "preview" && "Looks good? Save to Library or Send."}
            {phase === "uploading" && "Saving your GIF…"}
            {phase === "done" && (questionId ? "Navigating back…" : "All done!")}
          </p>
        </div>
      </div>

      {/* Friend-picker sheet — only when no questionId */}
      <BottomSheet isOpen={showSendSheet} onClose={() => setShowSendSheet(false)} title="Send GIF">
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
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-transform active:scale-[0.99]"
            >
              <UserAvatar avatarUrl={f.avatar_url} avatarEmoji={f.avatar_emoji} size={44} />
              <p className="text-sm font-semibold">{f.username}</p>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomNav />
    </div>
  );
}
