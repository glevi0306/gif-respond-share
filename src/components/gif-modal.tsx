import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Trash2 } from "lucide-react";
import { EmojiReactionBar } from "./emoji-reaction-bar";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface GifModalProps {
  gifUrl: string;
  createdAt: string;
  /** true = current user recorded this GIF → show Delete; false = show reaction bar */
  isOwner: boolean;
  /** false = suppress reaction bar even for non-owners (e.g. direct GIFs) */
  allowReactions?: boolean;
  /** current user's selected reaction, or null */
  currentReaction: string | null;
  /**
   * Which side the originating GIF bubble sits on.
   * Used to direct the close animation back toward the bubble.
   * Defaults to "right" when not provided.
   */
  originSide?: "left" | "right";
  onClose: () => void;
  onDelete: () => void;
  /** emoji to react with, or null to remove current reaction */
  onReact: (emoji: string | null) => void;
  /** override the default action bar (Delete / reactions) with custom content */
  actions?: ReactNode;
}

export function GifModal({
  gifUrl,
  createdAt,
  isOwner,
  allowReactions = true,
  currentReaction,
  originSide = "right",
  onClose,
  onDelete,
  onReact,
  actions,
}: GifModalProps) {
  const [imgBroken, setImgBroken] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the timer if the modal is unmounted before animation finishes
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Triggered when user picks an emoji. Fires the parent mutation then
  // starts the directional close animation. Deselecting (emoji = null)
  // keeps the modal open so the user can pick a different reaction.
  const handleReact = (emoji: string | null) => {
    onReact(emoji);
    if (emoji !== null) {
      setClosing(true);
      closeTimerRef.current = setTimeout(onClose, 320);
    }
  };

  const overlayClass = closing
    ? "animate-overlay-fade-out"
    : "animate-overlay-fade";

  const cardClass = closing
    ? `animate-modal-close-${originSide}`
    : "animate-modal-spring";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${overlayClass}`}
      style={{ backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)" }}
      onClick={closing ? undefined : onClose}
    >
      <button
        onClick={closing ? undefined : onClose}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition active:scale-95"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className={`mx-6 w-full max-w-sm ${cardClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-semibold tracking-wide text-white/70">
          {formatDateTime(createdAt)}
        </p>

        <div className="overflow-hidden rounded-[20px] bg-black">
          {imgBroken ? (
            <div className="flex aspect-video w-full items-center justify-center text-sm text-white/50">
              GIF unavailable
            </div>
          ) : (
            <img
              src={gifUrl}
              alt="GIF"
              className="w-full max-h-[60vh] object-contain"
              onError={() => setImgBroken(true)}
            />
          )}
        </div>

        <div className="mt-5">
          {actions ?? (
            isOwner ? (
              <div className="flex justify-center">
                <button
                  onClick={onDelete}
                  className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-400 transition active:scale-95"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            ) : allowReactions ? (
              <EmojiReactionBar selectedReaction={currentReaction} onSelect={handleReact} />
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
