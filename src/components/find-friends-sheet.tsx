import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Search, UserPlus, X } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { UserAvatar } from "./user-avatar";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import {
  useAllFriendships,
  useFriendRequests,
  useRespondToFriendRequest,
  useSendFriendRequest,
  type FriendshipRow,
} from "../hooks/use-friendships";

type Profile = { id: string; username: string; avatar_emoji: string; avatar_url: string | null };

export function FindFriendsSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const { data: requests = [] } = useFriendRequests();
  const { data: allFriendships = [] } = useAllFriendships();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();

  const { data: allProfiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["profiles", "all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_emoji, avatar_url")
        .neq("id", user!.id)
        .order("username")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: !!user && isOpen,
  });

  // Per-user status map: otherId → { id, status, isSender }
  const statusMap = useMemo(() => {
    const map = new Map<
      string,
      { id: string; status: FriendshipRow["status"]; isSender: boolean }
    >();
    for (const f of allFriendships) {
      if (f.user_id === user?.id) {
        map.set(f.friend_id, { id: f.id, status: f.status, isSender: true });
      } else {
        map.set(f.user_id, { id: f.id, status: f.status, isSender: false });
      }
    }
    return map;
  }, [allFriendships, user?.id]);

  // Search results: exclude accepted friends (already in friends list) and
  // incoming pending requests (shown in the requests section above).
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProfiles.filter((p) => {
      if (q && !p.username.toLowerCase().includes(q)) return false;
      const entry = statusMap.get(p.id);
      if (!entry) return true;
      if (entry.status === "accepted") return false;
      if (entry.status === "pending" && !entry.isSender) return false; // shown in requests section
      return true;
    });
  }, [allProfiles, query, statusMap]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Friends">
      <div className="space-y-4">
        {/* ── Incoming friend requests ─────────────────────────── */}
        {requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Requests · {requests.length}
            </p>
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
              >
                <UserAvatar
                  avatarUrl={req.sender.avatar_url}
                  avatarEmoji={req.sender.avatar_emoji}
                  size={44}
                />
                <p className="flex-1 truncate text-sm font-semibold">{req.sender.username}</p>
                <button
                  onClick={() => respond.mutate({ friendshipId: req.id, status: "declined" })}
                  disabled={respond.isPending}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-muted-foreground transition active:scale-95 disabled:opacity-50"
                  aria-label={`Decline ${req.sender.username}`}
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => respond.mutate({ friendshipId: req.id, status: "accepted" })}
                  disabled={respond.isPending}
                  className="grid h-9 w-9 place-items-center rounded-full bg-[var(--orange)] text-white transition active:scale-95 disabled:opacity-50"
                  aria-label={`Accept ${req.sender.username}`}
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Search bar ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username"
            className="w-full bg-transparent text-sm outline-none"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        {/* ── Results ─────────────────────────────────────────── */}
        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {profilesLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
                >
                  <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
                  <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </>
          )}

          {!profilesLoading &&
            searchResults.map((p) => {
              const entry = statusMap.get(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
                >
                  <UserAvatar avatarUrl={p.avatar_url} avatarEmoji={p.avatar_emoji} size={44} />
                  <p className="flex-1 truncate text-sm font-semibold">{p.username}</p>
                  <FriendAction
                    entry={entry}
                    onSend={() => sendRequest.mutate(p.id)}
                    disabled={sendRequest.isPending || respond.isPending}
                  />
                </div>
              );
            })}

          {!profilesLoading && query && searchResults.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
          )}

          {!profilesLoading && !query && searchResults.length === 0 && allProfiles.length > 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              You're connected with everyone!
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function FriendAction({
  entry,
  onSend,
  disabled,
}: {
  entry?: { id: string; status: FriendshipRow["status"]; isSender: boolean };
  onSend: () => void;
  disabled: boolean;
}) {
  // Already friends — filtered out above, but guard here for safety
  if (entry?.status === "accepted") return null;

  // I sent a request, waiting
  if (entry?.status === "pending" && entry.isSender) {
    return (
      <span
        className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        aria-label="Request pending"
      >
        <Clock className="h-4 w-4" />
      </span>
    );
  }

  // No relationship or previously declined — show send button
  return (
    <button
      onClick={onSend}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-full bg-[var(--orange)] text-white transition active:scale-95 disabled:opacity-50"
      aria-label="Send friend request"
    >
      <UserPlus className="h-4 w-4" />
    </button>
  );
}
