import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { FindFriendsSheet } from "../components/find-friends-sheet";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { useChats, compactTime, ChatRow } from "../hooks/use-questions";
import { useFriendRequests } from "../hooks/use-friendships";
import { UserAvatar } from "../components/user-avatar";
import Secauthlogo from "../assets/Secauthlogo.png";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Home — Sec." }] }),
  component: HomePage,
});

type FriendProfile = {
  id: string;
  username: string;
  avatar_emoji: string;
  avatar_url?: string | null;
};

function useFriends() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["friends", user?.id],
    queryFn: async () => {
      const [{ data: asSender }, { data: asReceiver }] = await Promise.all([
        supabase
          .from("friendships")
          .select("profile:friend_id(id, username, avatar_emoji, avatar_url)")
          .eq("user_id", user!.id)
          .eq("status", "accepted"),
        supabase
          .from("friendships")
          .select("profile:user_id(id, username, avatar_emoji, avatar_url)")
          .eq("friend_id", user!.id)
          .eq("status", "accepted"),
      ]);
      const profiles = [
        ...((asSender ?? []) as { profile: FriendProfile }[]).map((r) => r.profile),
        ...((asReceiver ?? []) as { profile: FriendProfile }[]).map((r) => r.profile),
      ].filter(Boolean) as FriendProfile[];
      return profiles;
    },
    enabled: !!user,
  });
}

function StatusBadge({ status }: { status: ChatRow["status"] }) {
  if (status === "new-question") {
    return (
      <span className="shrink-0 rounded-full bg-[var(--orange)]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--orange)]">
        New Question
      </span>
    );
  }
  if (status === "new-answer") {
    return (
      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        New Answer
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Sent
      </span>
    );
  }
  return null;
}

function HomePage() {
  const { data: chats = [], isLoading: chatsLoading } = useChats();
  const { data: friends = [], isLoading: friendsLoading } = useFriends();
  const { data: friendRequests = [] } = useFriendRequests();
  const [showFriendsSheet, setShowFriendsSheet] = useState(false);

  const pending = chats.filter(
    (c) => c.status === "new-question" || c.status === "new-answer",
  ).length;

  return (
    <div className="pb-28">
      <OrangeHeader
        title=""
        subtitle=""
        right={
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
        }
      >
        <div className="mb-5 flex flex-col items-center">
          <img src={Secauthlogo} alt="Sec." className="w-44 object-contain" />
          <p className="mt-2 text-sm text-white/85"></p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-black/15 p-3 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/75">Today</p>
            <p className="text-sm font-semibold text-white">
              {pending > 0 ? `${pending} pending` : "All caught up"}
            </p>
          </div>

          <Link
            to="/ask"
            search={{ to: undefined }}
            className="flex items-center gap-1.5 rounded-full bg-black px-3 py-2 text-xs font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Ask
          </Link>
        </div>
      </OrangeHeader>

      <section className="pt-6">
        <div className="mb-3 flex items-center justify-between px-5">
          <h2 className="text-base font-bold">Friends</h2>
          <button
            onClick={() => setShowFriendsSheet(true)}
            className="relative flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition active:scale-95"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
            {friendRequests.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--orange)] px-1 text-[9px] font-bold text-white">
                {friendRequests.length}
              </span>
            )}
          </button>
        </div>
        <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-3 px-5 py-2">
            {friendsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
                    <div className="h-2.5 w-10 animate-pulse rounded-full bg-muted" />
                  </div>
                ))
              : friends.map((f) => (
                  <Link
                    key={f.id}
                    to="/conversation/$userId"
                    params={{ userId: f.id }}
                    className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                  >
                    <div className="relative rounded-full border-2 border-[var(--orange)] p-0.5 bg-background">
                      <UserAvatar avatarUrl={f.avatar_url} avatarEmoji={f.avatar_emoji} size={56} />
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                    </div>
                    <p className="truncate text-[11px] font-medium">{f.username}</p>
                  </Link>
                ))}
          </div>
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-base font-bold">Chats</h2>

        {chatsLoading && (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
              >
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!chatsLoading && (
          <div className="space-y-2.5">
            {chats.map((c) => (
              <Link
                key={c.partnerId}
                to="/conversation/$userId"
                params={{ userId: c.partnerId }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition active:scale-[0.99]"
              >
                <UserAvatar
                  avatarUrl={c.partner.avatar_url}
                  avatarEmoji={c.partner.avatar_emoji}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.partner.username}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {compactTime(c.lastTime)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{c.lastText}</p>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}

            {chats.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                No conversations yet. Tap Ask to start one!
              </div>
            )}
          </div>
        )}
      </section>

      <FindFriendsSheet isOpen={showFriendsSheet} onClose={() => setShowFriendsSheet(false)} />

      <BottomNav />
    </div>
  );
}
