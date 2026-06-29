import { Link } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { compactTime } from "../hooks/use-questions";
import { UserAvatar } from "./user-avatar";

const RIGHT_RADIUS = "18px 18px 4px 18px";
const LEFT_RADIUS = "18px 18px 18px 4px";

// ── ChatBubble ────────────────────────────────────────────────

export interface ChatBubbleProps {
  variant: "question" | "deleted";
  text: string;
  createdAt: string;
  isRight: boolean;
  avatarEmoji?: string;
  avatarUrl?: string | null;
}

export function ChatBubble({
  variant,
  text,
  createdAt,
  isRight,
  avatarEmoji,
  avatarUrl,
}: ChatBubbleProps) {
  const isDeleted = variant === "deleted";
  return (
    <div className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight && <UserAvatar avatarUrl={avatarUrl} avatarEmoji={avatarEmoji ?? "🙂"} size={28} />}
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
          style={{
            borderRadius: isRight ? RIGHT_RADIUS : LEFT_RADIUS,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.04)",
          }}
        >
          <p className={`text-sm ${isDeleted ? "italic" : "font-medium"} leading-snug`}>{text}</p>
        </div>
        <p className="px-1 text-[10px] text-muted-foreground/60">{compactTime(createdAt)} ago</p>
      </div>
    </div>
  );
}

// ── GifBubble ─────────────────────────────────────────────────

export interface GifBubbleProps {
  gifUrl: string;
  createdAt: string;
  isRight: boolean;
  avatarEmoji?: string;
  avatarUrl?: string | null;
  reactionEmoji?: string | null;
  onTap: () => void;
}

export function GifBubble({
  gifUrl,
  createdAt,
  isRight,
  avatarEmoji,
  avatarUrl,
  reactionEmoji,
  onTap,
}: GifBubbleProps) {
  return (
    <div className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight && <UserAvatar avatarUrl={avatarUrl} avatarEmoji={avatarEmoji ?? "🙂"} size={28} />}
      <div
        className={`flex max-w-[75%] flex-col gap-1 animate-gif-reveal ${
          isRight ? "items-end" : "items-start"
        }`}
      >
        <div className={`relative w-[200px] ${reactionEmoji ? "mb-1" : ""}`}>
          <button
            onClick={onTap}
            className="w-full overflow-hidden transition-transform active:scale-[0.97]"
            style={{
              borderRadius: isRight ? RIGHT_RADIUS : LEFT_RADIUS,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12), 0 0.5px 2px rgba(0,0,0,0.06)",
            }}
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

          {reactionEmoji && (
            <div
              key={reactionEmoji}
              className={`absolute -bottom-3 ${isRight ? "left-2" : "right-2"} text-xl leading-none animate-reaction-pop`}
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.28))" }}
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
