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
  const { user, authReady } = useAuth();
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
    enabled: !!user && authReady,
  });
}

// Single question by ID; both sender and recipient are allowed by RLS.
// Pass refetchInterval (ms) to poll for live status changes (e.g. waiting → answered).
// refetchInterval may also be a function receiving the Query object for data-dependent polling.
export function useQuestion(
  id: string,
  opts?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: unknown } }) => number | false | undefined);
  },
) {
  const { user, authReady } = useAuth();
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
    enabled: !!user && !!id && authReady,
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
  status: "sent" | "new-answer" | "new-question" | "new-gif" | "idle";
  questionId?: string;
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

// One chat per unique conversation partner, sorted by most recent activity.
// Badge status is suppressed for conversations the current user has already opened
// (tracked via conversation_reads).
export function useChats() {
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["chats", user?.id],
    queryFn: async () => {
      type RawRow = {
        id: string;
        from_id: string;
        to_id: string;
        text: string;
        status: "waiting" | "answered";
        created_at: string;
        sender: QuestionSender | QuestionSender[] | null;
        receiver: QuestionSender | QuestionSender[] | null;
      };
      type RawDG = { id: string; sender_id: string; receiver_id: string; created_at: string };
      type ReadRow = { partner_id: string; last_seen_at: string };
      type AnswerTimeRow = { question_id: string; created_at: string };

      const normalizeProfile = (
        raw: QuestionSender | QuestionSender[] | null,
      ): QuestionSender | null => {
        if (!raw) return null;
        return Array.isArray(raw) ? (raw[0] ?? null) : raw;
      };

      // Fetch questions, direct_gifs, and read receipts in parallel
      const [{ data: questionsData, error }, { data: directGifsRaw }, { data: readsData }] =
        await Promise.all([
          supabase
            .from("questions")
            .select(
              "id, from_id, to_id, text, status, created_at, " +
                "sender:profiles!from_id(id, username, avatar_emoji, avatar_url), " +
                "receiver:profiles!to_id(id, username, avatar_emoji, avatar_url)",
            )
            .or(`from_id.eq.${user!.id},to_id.eq.${user!.id}`)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("direct_gifs")
            .select("id, sender_id, receiver_id, created_at")
            .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("conversation_reads")
            .select("partner_id, last_seen_at")
            .eq("user_id", user!.id),
        ]);
      if (error) throw error;

      // Build reads map: partner_id → last_seen_at
      const readsMap: Record<string, string> = {};
      for (const r of (readsData ?? []) as ReadRow[]) {
        readsMap[r.partner_id] = r.last_seen_at;
      }

      // Collect answered question IDs where I'm the asker
      const rows = (questionsData ?? []) as unknown as RawRow[];
      const answeredQIds = rows
        .filter((q) => q.from_id === user!.id && q.status === "answered")
        .map((q) => q.id);

      const answerTimeMap: Record<string, string> = {};
      if (answeredQIds.length > 0) {
        const { data: answersData } = await supabase
          .from("answers")
          .select("question_id, created_at")
          .in("question_id", answeredQIds);
        for (const a of (answersData ?? []) as AnswerTimeRow[]) {
          answerTimeMap[a.question_id] = a.created_at;
        }
      }

      // Map<partnerId, Candidate> — keeps only the newest activity per partner
      type Candidate = {
        partner: QuestionSender;
        lastText: string;
        time: string;
        status: ChatRow["status"];
        questionId?: string;
      };
      const candidateMap = new Map<string, Candidate>();
      const profilesMap = new Map<string, QuestionSender>();

      const setIfNewer = (partnerId: string, candidate: Candidate) => {
        const existing = candidateMap.get(partnerId);
        if (!existing || candidate.time > existing.time) {
          candidateMap.set(partnerId, candidate);
        }
      };

      // Process questions
      for (const q of rows) {
        const iSent = q.from_id === user!.id;
        const partnerId = iSent ? q.to_id : q.from_id;
        const partner = normalizeProfile(iSent ? q.receiver : q.sender);
        if (!partner) continue;

        profilesMap.set(partnerId, partner);

        const lastSeenAt = readsMap[partnerId] ?? null;
        let status: ChatRow["status"];
        let activityTime = q.created_at;

        if (!iSent && q.status === "waiting") {
          status = lastSeenAt && lastSeenAt >= q.created_at ? "idle" : "new-question";
        } else if (iSent && q.status === "answered") {
          const answerTime = answerTimeMap[q.id] ?? q.created_at;
          activityTime = answerTime;
          status = lastSeenAt && lastSeenAt >= answerTime ? "idle" : "new-answer";
        } else if (iSent && q.status === "waiting") {
          status = "sent";
        } else {
          status = "idle";
        }

        setIfNewer(partnerId, {
          partner,
          lastText: q.text,
          time: activityTime,
          status,
          questionId: q.id,
        });
      }

      // Process direct GIFs — fetch profiles for partners not already known from questions
      const dgRows = (directGifsRaw ?? []) as RawDG[];
      const unknownIds = new Set<string>();
      for (const dg of dgRows) {
        const partnerId = dg.sender_id === user!.id ? dg.receiver_id : dg.sender_id;
        if (!profilesMap.has(partnerId)) unknownIds.add(partnerId);
      }
      if (unknownIds.size > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, avatar_emoji, avatar_url")
          .in("id", [...unknownIds]);
        for (const p of (profilesData ?? []) as QuestionSender[]) {
          profilesMap.set(p.id, p);
        }
      }

      for (const dg of dgRows) {
        const iSent = dg.sender_id === user!.id;
        const partnerId = iSent ? dg.receiver_id : dg.sender_id;
        const partner = profilesMap.get(partnerId);
        if (!partner) continue;

        const lastSeenAt = readsMap[partnerId] ?? null;
        const status: ChatRow["status"] = iSent
          ? "sent"
          : lastSeenAt && lastSeenAt >= dg.created_at
            ? "idle"
            : "new-gif";

        setIfNewer(partnerId, {
          partner,
          lastText: "Sent a GIF",
          time: dg.created_at,
          status,
        });
      }

      // Sort by most recent activity descending
      return Array.from(candidateMap.entries())
        .sort(([, a], [, b]) => (a.time > b.time ? -1 : a.time < b.time ? 1 : 0))
        .map(([partnerId, c]) => ({
          partnerId,
          partner: c.partner,
          lastText: c.lastText,
          lastTime: c.time,
          status: c.status,
          questionId: c.questionId,
        }));
    },
    enabled: !!user && authReady,
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

// Full chronological thread between the current user and one partner
export function useConversation(partnerId: string) {
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["conversation", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "*, " +
            "sender:profiles!from_id(id, username, avatar_emoji, avatar_url), " +
            "receiver:profiles!to_id(id, username, avatar_emoji, avatar_url)",
        )
        .in("from_id", [user!.id, partnerId])
        .in("to_id", [user!.id, partnerId])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ConvQuestion[];
    },
    enabled: !!user && !!partnerId && authReady,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// Answers for a conversation — direct query avoids PostgREST embed + RLS nesting issues.
// Returns a map: question_id → ConvAnswer for O(1) lookup in the thread render.
export function useAnswersForConversation(partnerId: string) {
  const { user, authReady } = useAuth();
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
    enabled: !!user && !!partnerId && authReady,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

// Reactions for a conversation — two-step query avoids PostgREST embed RLS issues.
// Returns { byAnswerId, byDirectGifId } maps for O(1) lookup in the thread render.
export function useReactionsForConversation(partnerId: string) {
  const { user, authReady } = useAuth();
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
            `and(sender_id.eq.${partnerId},receiver_id.eq.${user!.id})`,
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
    enabled: !!user && !!partnerId && authReady,
    staleTime: 0,
    refetchInterval: 30_000,
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
        await supabase
          .from("reactions")
          .delete()
          .eq("answer_id", args.answerId)
          .eq("user_id", user!.id);
      } else {
        await supabase
          .from("reactions")
          .delete()
          .eq("direct_gif_id", args.directGifId!)
          .eq("user_id", user!.id);
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
        ? await supabase
            .from("reactions")
            .delete()
            .eq("answer_id", args.answerId)
            .eq("user_id", user!.id)
        : await supabase
            .from("reactions")
            .delete()
            .eq("direct_gif_id", args.directGifId!)
            .eq("user_id", user!.id);
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
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["conv-direct-gifs", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_gifs")
        .select("id, sender_id, receiver_id, gif_url, is_deleted, created_at")
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${partnerId}),` +
            `and(sender_id.eq.${partnerId},receiver_id.eq.${user!.id})`,
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DirectGifRow[];
    },
    enabled: !!user && !!partnerId && authReady,
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
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

// ── Read receipts ─────────────────────────────────────────────

// Mark a conversation as read for the current user.
// Upserts conversation_reads (user_id, partner_id) with last_seen_at = now(),
// then invalidates the home chats list so badges update immediately.
export function useMarkConversationRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partnerId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("conversation_reads")
        .upsert(
          { user_id: user.id, partner_id: partnerId, last_seen_at: new Date().toISOString() },
          { onConflict: "user_id,partner_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_, partnerId) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["conv-read-state", user?.id, partnerId] });
    },
  });
}

// Fetch the partner's last_seen_at for this conversation so the sender can
// show open/closed eye seen indicators. Requires RLS to allow reading rows
// where partner_id = auth.uid() (see migration notes).
export function useConversationReadState(partnerId: string) {
  const { user, authReady } = useAuth();
  return useQuery({
    queryKey: ["conv-read-state", user?.id, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_reads")
        .select("last_seen_at")
        .eq("user_id", partnerId)
        .eq("partner_id", user!.id)
        .maybeSingle();
      if (error) return null;
      return (data?.last_seen_at ?? null) as string | null;
    },
    enabled: !!user && !!partnerId && authReady,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}
