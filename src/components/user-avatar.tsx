import { memo } from "react";

interface UserAvatarProps {
  avatarUrl?: string | null;
  avatarEmoji: string;
  size?: number;
  className?: string;
}

export const UserAvatar = memo(function UserAvatar({
  avatarUrl,
  avatarEmoji,
  size = 28,
  className = "",
}: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid place-items-center rounded-full bg-muted shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {avatarEmoji}
    </div>
  );
});
