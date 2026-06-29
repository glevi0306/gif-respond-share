import { useState } from "react";

const SCREENS = [
  {
    emoji: "💬",
    title: "Ask your friends anything",
    body: "Tap Ask to send a question to any friend. Anything you're curious about.",
  },
  {
    emoji: "🎬",
    title: "Answer with a 5-second GIF",
    body: "Hit record and go. Your face says more than a text ever could.",
  },
  {
    emoji: "👥",
    title: "Add friends to get started",
    body: "Tap the Add button on the Home screen to find friends by username.",
  },
] as const;

const STORAGE_KEY = "sec.onboarding.done";

function markDone() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  } catch {
    // ignore — localStorage unavailable (private browsing, storage quota)
  }
}

export function shouldShowOnboarding(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  const dismiss = () => {
    markDone();
    onDone();
  };

  const next = () => {
    if (step < SCREENS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  const screen = SCREENS[step];
  const isLast = step === SCREENS.length - 1;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-between bg-background px-6 pb-12 pt-6">
      {/* Skip */}
      <div className="flex w-full justify-end">
        <button
          onClick={dismiss}
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground active:opacity-70"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center gap-6 text-center">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[var(--orange)]/10 text-5xl"
          style={{ fontSize: "3rem" }}
        >
          {screen.emoji}
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight">{screen.title}</h1>
          <p className="text-base text-muted-foreground">{screen.body}</p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="w-full space-y-5">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {SCREENS.map((_, i) => (
            <span
              key={i}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === step ? "1.5rem" : "0.5rem",
                backgroundColor: i === step ? "var(--orange)" : "var(--muted)",
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full rounded-full bg-[var(--orange)] py-4 text-base font-bold text-white active:opacity-90"
        >
          {isLast ? "Get started" : "Continue"}
        </button>
      </div>
    </div>
  );
}
