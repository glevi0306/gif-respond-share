import { Link } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { compactTime } from "../hooks/use-questions";

// Bubble border-radius: small corner on the "tail" side gives a speech-bubble effect
const RIGHT_RADIUS = "18px 18px 4px 18px"; // my messages
const LEFT_RADIUS  = "18px 18px 18px 4px"; // partner messages

// ── ChatBubble ────────────────────────────────────────────────
// Handles question text and "GIF deleted" placeholder variants.
// Theme-aware: uses bg-foreground/text-background so the colour inverts
// automatically between light (black bubble, white text) and dark mode
// (white bubble, black text).

export interface ChatBubbleProps {
  variant: "question" | "deleted";
  text: string;
  createdAt: string;
  isRight: boolean;
  avatarEmoji?: string;
}

export function ChatBubble({ variant, text, createdAt, isRight, avatarEmoji }: ChatBubbleProps) {
  const isDeleted = variant === "deleted";
  return (
    <div className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-sm">
          {avatarEmoji ?? "🙂"}
        </div>
      )}
      <div
        className={`flex max-w-[75%] flex-col gap-1 animate-question-reveal ${
          isRight ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`px-4 py-3 ${
            isDeleted
              ? "border border-dashed border-border bg-muted text-muted-foreground"
              : "bg-foreground text-background"
          }`}
          style={{ borderRadius: isRight ? RIGHT_RADIUS : LEFT_RADIUS }}
        >
          <p className={`text-sm ${isDeleted ? "italic" : "font-medium"} leading-snug`}>
            {text}
          </p>
        </div>
        <p className="px-1 text-[10px] text-muted-foreground/60">
          {compactTime(createdAt)} ago
        </p>
      </div>
    </div>
  );
}

// ── GifBubble ─────────────────────────────────────────────────
// Tappable GIF bubble with an optional emoji-reaction badge.
// The badge uses bg-foreground/text-background for theme-awareness
// (dark mode: white circle, dark emoji; light mode: black circle, white emoji).

export interface GifBubbleProps {
  gifUrl: string;
  createdAt: string;
  isRight: boolean;
  avatarEmoji?: string;
  reactionEmoji?: string | null;
  onTap: () => void;
}

export function GifBubble({ gifUrl, createdAt, isRight, avatarEmoji, reactionEmoji, onTap }: GifBubbleProps) {
  return (
    <div className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-sm">
          {avatarEmoji ?? "🙂"}
        </div>
      )}
      <div
        className={`flex max-w-[75%] flex-col gap-1 animate-gif-reveal ${
          isRight ? "items-end" : "items-start"
        }`}
      >
        {/* Button wrapper is relative so the badge can be positioned against it */}
        <div className={`relative w-[200px] ${reactionEmoji ? "mb-1" : ""}`}>
          <button
            onClick={onTap}
            className="w-full overflow-hidden transition-transform active:scale-[0.97]"
            style={{ borderRadius: isRight ? RIGHT_RADIUS : LEFT_RADIUS }}
            aria-label="View GIF"
          >
            {gifUrl ? (
              <img
                src={gifUrl}
                alt="GIF answer"
                loading="lazy"
                decoding="async"
                className="w-full object-cover animate-gif-appear"
              />
            ) : (
              <div
                className="grid w-full place-items-center bg-muted text-sm text-muted-foreground"
                style={{ aspectRatio: "4/3" }}
              >
                GIF unavailable
              </div>
            )}
          </button>

          {/* Reaction badge — bottom-right for left-aligned GIFs, bottom-left for right-aligned */}
          {reactionEmoji && (
            <div
              key={reactionEmoji}
              className={`absolute -bottom-3 ${isRight ? "left-2" : "right-2"} grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-foreground text-base text-background animate-reaction-pop shadow-sm`}
            >
              {reactionEmoji}
            </div>
          )}
        </div>

        <p className={`px-1 text-[10px] text-muted-foreground/60 ${reactionEmoji ? "mt-2" : ""}`}>
          {compactTime(createdAt)} ago
        </p>
      </div>
    </div>
  );
}

// ── WaitingBubble ─────────────────────────────────────────────

export interface WaitingBubbleProps {
  isRight: boolean;
  waitingForMe: boolean;
  questionId: string;
}

export function WaitingBubble({ isRight, waitingForMe, questionId }: WaitingBubbleProps) {
  const radius = isRight ? RIGHT_RADIUS : LEFT_RADIUS;
  return (
    <div className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight && <div className="h-7 w-7 shrink-0" />}
      <div className="max-w-[75%]">
        {waitingForMe ? (
          <Link
            to="/record"
            search={{ questionId }}
            className="flex items-center gap-2 border-2 border-[var(--orange)] bg-[var(--orange)]/10 px-4 py-3 text-sm font-semibold text-[var(--orange)] transition-transform active:scale-95"
            style={{ borderRadius: radius }}
          >
            <Video className="h-4 w-4" /> Record GIF
          </Link>
        ) : (
          <div
            className="border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
            style={{ borderRadius: radius }}
          >
            Waiting for GIF reply…
          </div>
        )}
      </div>
    </div>
  );
}
