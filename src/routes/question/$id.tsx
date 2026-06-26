import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { OrangeHeader } from "../../components/orange-header";
import { BottomNav } from "../../components/bottom-nav";
import { Video, Check, Clock } from "lucide-react";
import { useQuestion, compactTime } from "../../hooks/use-questions";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";

export const Route = createFileRoute("/question/$id")({
  head: () => ({ meta: [{ title: "Question — Sec." }] }),
  component: QuestionDetailPage,
});

type AnswerRow = { gif_url: string; created_at: string } | null;

function QuestionDetailPage() {
  const { id } = useParams({ from: "/question/$id" });
  const { user } = useAuth();

  // Poll for status changes, but stop once the question is answered.
  const { data: q, isLoading, error } = useQuestion(id, {
    refetchInterval: (query) =>
      (query.state.data as { status?: string } | undefined)?.status === "answered" ? false : 4000,
  });

  // Only fetch the answer once the question is confirmed answered.
  // The question query (above) polls every 4s and flips q.status; that enables this query.
  const { data: answer, isLoading: answerLoading } = useQuery<AnswerRow>({
    queryKey: ["answer", "for-question", id],
    queryFn: async () => {
      const { data: answerData, error: answerError } = await supabase
        .from("answers")
        .select("gif_url, created_at")
        .eq("question_id", id)
        .maybeSingle();
      if (answerError) throw answerError;
      return answerData as AnswerRow;
    },
    enabled: !!user && !!id && q?.status === "answered",
  });

  if (isLoading) {
    return (
      <div className="pb-28">
        <OrangeHeader title="Question" back="/home" />
        <div className="flex justify-center pt-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--orange)]" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error || !q) {
    return (
      <div className="pb-28">
        <OrangeHeader title="Question" back="/home" />
        <div className="px-5 pt-10 text-center text-sm text-muted-foreground">
          Question not found or you don't have access.
        </div>
        <BottomNav />
      </div>
    );
  }

  const answered = q.status === "answered";

  return (
    <div className="pb-28">
      <OrangeHeader title="Question" back="/home" />

      <div className="px-5 pt-6">
        <div className="rounded-3xl border border-border bg-card p-5 animate-pop-in">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-2xl">
              {q.sender.avatar_emoji}
            </div>
            <div>
              <p className="text-sm font-semibold">{q.sender.username}</p>
              <p className="text-xs text-muted-foreground">{compactTime(q.created_at)} ago</p>
            </div>
          </div>
          <p className="text-2xl font-bold leading-tight">{q.text}</p>
        </div>

        <div className="mt-5">
          {answered ? (
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-emerald-500">
                <Check className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Answered</span>
              </div>
              <div className="w-full overflow-hidden rounded-2xl bg-muted">
                {answerLoading ? (
                  <div className="grid aspect-square w-full place-items-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--orange)]" />
                  </div>
                ) : answer?.gif_url ? (
                  <img
                    src={answer.gif_url}
                    alt="GIF answer"
                    className="w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center text-7xl">🎞️</div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-[var(--orange)]">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Waiting for your answer</span>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                You can't reply with text. Record a 5-second GIF to answer.
              </p>
              <Link
                to="/record"
                search={{ questionId: q.id }}
                className="btn-black flex w-full items-center justify-center gap-2"
              >
                <Video className="h-4 w-4" /> Answer with GIF
              </Link>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
