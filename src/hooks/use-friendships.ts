import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export type FriendRequest = {
  id: string;
  user_id: string;
  created_at: string;
  sender: { id: string; username: string; avatar_emoji: string; avatar_url: string | null };
};

export type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "declined";
};

/** Incoming pending requests where the current user is the recipient. */
export function useFriendRequests() {
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["friend-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id, user_id, created_at, sender:user_id(id, username, avatar_emoji, avatar_url)")
        .eq("friend_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Supabase infers joined relations as T[] even for unique FK joins.
      // Normalise to the scalar form the FriendRequest type expects.
      return (data ?? []).map((row) => {
        const raw = row.sender;
        const sender = Array.isArray(raw) ? raw[0] : raw;
        return { ...row, sender } as FriendRequest;
      });
    },
    enabled: !!user && authReady,
  });
}

/** All friendships involving the current user (both directions), for building a status map. */
export function useAllFriendships() {
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["all-friendships", user?.id],
    queryFn: async () => {
      const [{ data: asSender }, { data: asReceiver }] = await Promise.all([
        supabase
          .from("friendships")
          .select("id, user_id, friend_id, status")
          .eq("user_id", user!.id),
        supabase
          .from("friendships")
          .select("id, user_id, friend_id, status")
          .eq("friend_id", user!.id),
      ]);
      return [...(asSender ?? []), ...(asReceiver ?? [])] as FriendshipRow[];
    },
    enabled: !!user && authReady,
  });
}

/**
 * Send a friend request.
 * Uses upsert so a previously-declined request can be re-sent without violating
 * the unique (user_id, friend_id) constraint.
 */
export function useSendFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendId: string) => {
      const { error } = await supabase
        .from("friendships")
        .upsert(
          { user_id: user!.id, friend_id: friendId, status: "pending" },
          { onConflict: "user_id,friend_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-friendships", user?.id] });
    },
  });
}

/** Accept or decline an incoming friend request by its row id. */
export function useRespondToFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      friendshipId,
      status,
    }: {
      friendshipId: string;
      status: "accepted" | "declined";
    }) => {
      const { error } = await supabase
        .from("friendships")
        .update({ status })
        .eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-friendships", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["friends", user?.id] });
    },
  });
}
