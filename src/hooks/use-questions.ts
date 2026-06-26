import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

// ── Types ────────────────────────────────────────────────────

export type QuestionSender = {
  id: string;
  username: string;
  avatar_emoji: string;
  avatar_url?: string | null;
};

export type QuestionRow = {
  id: string;
  from_id: string;
  to_id: string;
  text: string;
  status: "waiting" | "answered";
  created_at: string;
  sender: QuestionSender;
};

// ── Helpers ──────────────────────────────────────────────────

// Compact relative time: "now", "2m", "1h", "3d", "1w"
export function compactTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// ── Queries ──────────────────────────────────────────────────

// All waiting questions the current user received, newest first
export function useReceivedQuestions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["questions", "received", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, sender:profiles!from_id(id, username, avatar_emoji, avatar_url)")
        .eq("to_id", user!.id)
        .eq("status", "waiting")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuestionRow[];
    },
    enabled: !!user,
  });
}

// Single question by ID; both sender and recipient are allowed by RLS.
// Pass refetchInterval (ms) to poll for live status changes (e.g. waiting → answered).
// refetchInterval may also be a function receiving the Query object for data-dependent polling.
export function useQuestion(
  id: string,
  opts?: { refetchInterval?: number | false | ((query: any) => number | false | undefined) },
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["question", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, sender:profiles!from_id(id, username, avatar_emoji, avatar_url)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as QuestionRow;
    },
    enabled: !!user && !!id,
    refetchInterval: opts?.refetchInterval,
  });
}

// ── Chat / Conversation types ─────────────────────────────────

// One entry per conversation partner in the Home Chats list
export type ChatRow = {
  partnerId: string;
  partner: QuestionSender;
  lastText: string;
  lastTime: string;
  status: "sent" | "new-answer" | "new-question" | "idle";
  questionId: string;
};

// A question row augmented with both participant profiles (answers fetched separately)
export type ConvQuestion = QuestionRow & {
  receiver: QuestionSender;
};

// A resolved answer in the conversation thread
export type ConvAnswer = {
  id: string;
  question_id: string;
  gif_url: string;
  created_at: string;
  is_deleted: boolean;
  responder_id: string;
};

// An emoji reaction on a GIF (answer or direct GIF — exactly one target is set)
export type ReactionRow = {
  id: string;
  answer_id: string | null;
  direct_gif_id: string | null;
  user_id: string;
  emoji: string;
};

// A direct GIF sent peer-to-peer (no question required)
export type DirectGifRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  gif_url: string;
  is_deleted: boolean;
  created_at: string;
};

// ── Chat / Conversation hooks ─────────────────────────────────

// One chat per unique conversation partner, sorted by most recent activity
export function useChats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "id, from_id, to_id, text, status, created_at, " +
          "sender:profiles!from_id(id, username, avatar_emoji, avatar_url), " +
          "receiver:profiles!to_id(id, username, avatar_emoji, avatar_url)"
        )
        .or(`from_id.eq.${user!.id},to_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      type RawRow = {
        id: string;
        from_id: string;
        to_id: string;
        text: string;
        status: "waiting" | "answered";
        created_at: string;
        sender: QuestionSender;
        receiver: QuestionSender;
      };

      const seen = new Set<string>();
      const chats: ChatRow[] = [];

      for (const q of (data ?? []) as RawRow[]) {
        const iSent = q.from_id === user!.id;
        const partnerId = iSent ? q.to_id : q.from_id;
        if (seen.has(partnerId)) continue;
        seen.add(partnerId);

        const partner = iSent ? q.receiver : q.sender;

        let status: ChatRow["status"];
        if (!iSent && q.status === "waiting") {
          status = "new-question"; // partner asked me, I haven't replied with a GIF
        } else if (iSent && q.status === "answered") {
          status = "new-answer"; // I asked, partner replied
        } else if (iSent && q.status === "waiting") {
          status = "sent"; // I asked, still waiting
        } else {
          status = "idle"; // I answered their question, no pending action
        }

        chats.push({ partnerId, partner, lastText: q.text, lastTime: q.created_at, status, questionId: q.id });
      }

      return chats;
    },
    enabled: !!user,
    staleTime: 0,    // polling queries should always re-fetch on interval
    refetchInterval: 15_000,
  });
}

// Full chronological thread between the current user and one partner
export function useConversation(partnerId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversation", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "*, " +
          "sender:profiles!from_id(id, username, avatar_emoji, avatar_url), " +
          "receiver:profiles!to_id(id, username, avatar_emoji, avatar_url)"
        )
        .in("from_id", [user!.id, partnerId])
        .in("to_id", [user!.id, partnerId])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConvQuestion[];
    },
    enabled: !!user && !!partnerId,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// Answers for a conversation — direct query avoids PostgREST embed + RLS nesting issues.
// Returns a map: question_id → ConvAnswer for O(1) lookup in the thread render.
export function useAnswersForConversation(partnerId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conv-answers", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answers")
        .select("id, question_id, gif_url, created_at, is_deleted, responder_id")
        .in("responder_id", [user!.id, partnerId]);
      if (error) throw error;
      const map: Record<string, ConvAnswer> = {};
      for (const a of (data ?? []) as ConvAnswer[]) {
        map[a.question_id] = a;
      }
      return map;
    },
    enabled: !!user && !!partnerId,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// Reactions for a conversation — two-step query avoids PostgREST embed RLS issues.
// Returns { byAnswerId, byDirectGifId } maps for O(1) lookup in the thread render.
export function useReactionsForConversation(partnerId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conv-reactions", user?.id, partnerId],
    queryFn: async () => {
      const byAnswerId: Record<string, ReactionRow> = {};
      const byDirectGifId: Record<string, ReactionRow> = {};

      // Step 1a: collect answer IDs for this conversation
      const { data: answers, error: aErr } = await supabase
        .from("answers")
        .select("id")
        .in("responder_id", [user!.id, partnerId]);
      if (aErr) throw aErr;
      const answerIds = (answers ?? []).map((a: { id: string }) => a.id);

      // Step 1b: collect direct_gif IDs for this conversation
      const { data: directGifsData, error: dgErr } = await supabase
        .from("direct_gifs")
        .select("id")
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${partnerId}),` +
          `and(sender_id.eq.${partnerId},receiver_id.eq.${user!.id})`
        );
      if (dgErr) throw dgErr;
      const directGifIds = (directGifsData ?? []).map((d: { id: string }) => d.id);

      // Step 2a: fetch reactions for answer IDs
      if (answerIds.length > 0) {
        const { data, error } = await supabase
          .from("reactions")
          .select("id, answer_id, direct_gif_id, user_id, emoji")
          .in("answer_id", answerIds);
        if (error) throw error;
        for (const r of (data ?? []) as ReactionRow[]) {
          if (r.answer_id) byAnswerId[r.answer_id] = r;
        }
      }

      // Step 2b: fetch reactions for direct GIF IDs
      if (directGifIds.length > 0) {
        const { data, error } = await supabase
          .from("reactions")
          .select("id, answer_id, direct_gif_id, user_id, emoji")
          .in("direct_gif_id", directGifIds);
        if (error) throw error;
        for (const r of (data ?? []) as ReactionRow[]) {
          if (r.direct_gif_id) byDirectGifId[r.direct_gif_id] = r;
        }
      }

      return { byAnswerId, byDirectGifId };
    },
    enabled: !!user && !!partnerId,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// ── Mutations ────────────────────────────────────────────────

type ReactionTarget =
  | { answerId: string; directGifId?: never }
  | { directGifId: string; answerId?: never };

// Upsert an emoji reaction on an answer or direct GIF (one reaction per user per target)
export function useUpsertReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ReactionTarget & { emoji: string }) => {
      // Delete existing reaction first (partial unique indexes make direct upsert tricky)
      if (args.answerId) {
        await supabase.from("reactions").delete()
          .eq("answer_id", args.answerId).eq("user_id", user!.id);
      } else {
        await supabase.from("reactions").delete()
          .eq("direct_gif_id", args.directGifId!).eq("user_id", user!.id);
      }
      const { error } = await supabase.from("reactions").insert({
        answer_id: args.answerId ?? null,
        direct_gif_id: args.directGifId ?? null,
        user_id: user!.id,
        emoji: args.emoji,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conv-reactions"] });
    },
  });
}

// Remove the current user's reaction from an answer or direct GIF
export function useRemoveReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ReactionTarget) => {
      const { error } = args.answerId
        ? await supabase.from("reactions").delete()
            .eq("answer_id", args.answerId).eq("user_id", user!.id)
        : await supabase.from("reactions").delete()
            .eq("direct_gif_id", args.directGifId!).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conv-reactions"] });
    },
  });
}

// Soft-delete a GIF answer (owner only; RLS enforces responder_id = auth.uid())
export function useSoftDeleteAnswer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ answerId }: { answerId: string }) => {
      const { error } = await supabase
        .from("answers")
        .update({ is_deleted: true })
        .eq("id", answerId)
        .eq("responder_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conv-answers"] });
    },
  });
}

// Direct GIFs for a conversation — fetches all peer-to-peer GIFs between two users
export function useDirectGifsForConversation(partnerId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conv-direct-gifs", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_gifs")
        .select("id, sender_id, receiver_id, gif_url, is_deleted, created_at")
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${partnerId}),` +
          `and(sender_id.eq.${partnerId},receiver_id.eq.${user!.id})`
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DirectGifRow[];
    },
    enabled: !!user && !!partnerId,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// Soft-delete a direct GIF (sender only; RLS enforces sender_id = auth.uid())
export function useSoftDeleteDirectGif() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ directGifId }: { directGifId: string }) => {
      const { error } = await supabase
        .from("direct_gifs")
        .update({ is_deleted: true })
        .eq("id", directGifId)
        .eq("sender_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conv-direct-gifs"] });
    },
  });
}

export function useSendQuestion() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ toId, text }: { toId: string; text: string }) => {
      const { error } = await supabase.from("questions").insert({
        from_id: user!.id,
        to_id: toId,
        text: text.trim(),
        status: "waiting",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh the received-questions list for the current user
      // (in case they test with the same account as both sender and recipient)
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}
