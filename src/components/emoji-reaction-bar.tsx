export const REACTIONS = ["😂", "❤️", "🔥", "👏", "😮", "😭"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

interface EmojiReactionBarProps {
  selectedReaction: string | null;
  onSelect: (emoji: string | null) => void; // null = deselect current
}

export function EmojiReactionBar({ selectedReaction, onSelect }: EmojiReactionBarProps) {
  return (
    <div className="flex justify-center gap-3">
      {REACTIONS.map((emoji) => {
        const active = selectedReaction === emoji;
        return (
          <button
            key={emoji}
            onClick={() => onSelect(active ? null : emoji)}
            className="text-3xl active:scale-90"
            style={{
              transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease",
              transform: active ? "scale(1.4)" : "scale(1)",
              opacity: selectedReaction && !active ? 0.4 : 1,
            }}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
