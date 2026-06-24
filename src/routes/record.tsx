import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { Camera, Save, Send, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/record")({
  head: () => ({ meta: [{ title: "Record — Sec." }] }),
  component: RecordPage,
});

type Phase = "idle" | "recording" | "preview";

function RecordPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const start = () => {
    setPhase("recording");
    setProgress(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 5000;
      if (elapsed >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setProgress(1);
        setPhase("preview");
      } else {
        setProgress(elapsed);
      }
    }, 50);
  };

  const reset = () => { setPhase("idle"); setProgress(0); };

  return (
    <div className="pb-28">
      <OrangeHeader title="Record GIF" subtitle="5 seconds. Loops forever." back="/home" />

      <div className="px-5 pt-6">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black">
          <div className="absolute inset-0 grid place-items-center text-white/40">
            {phase === "preview" ? (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--orange)]/30 to-black text-8xl animate-pop-in">🎞️</div>
            ) : (
              <Camera className="h-16 w-16" />
            )}
          </div>

          {phase === "recording" && (
            <>
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                {(5 - progress * 5).toFixed(1)}s
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                <div className="h-full bg-[var(--orange)] transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center">
          {phase !== "preview" ? (
            <button
              onClick={start}
              disabled={phase === "recording"}
              className={`relative grid h-20 w-20 place-items-center rounded-full text-white shadow-xl ${phase === "recording" ? "" : "animate-pulse-ring"}`}
              style={{ backgroundColor: phase === "recording" ? "#dc2626" : "var(--orange)" }}
              aria-label="Record"
            >
              <div className={`${phase === "recording" ? "h-6 w-6 rounded-md" : "h-14 w-14 rounded-full"} bg-white/95 transition-all`} />
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
            {phase === "idle" && "Tap to start a 5-second recording"}
            {phase === "recording" && "Recording…"}
            {phase === "preview" && "Looks good?"}
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
