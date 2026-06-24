import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { OrangeHeader } from "../../components/orange-header";
import { BottomNav } from "../../components/bottom-nav";
import { QUESTIONS } from "../../lib/sec-data";
import { Video, Check, Clock } from "lucide-react";

export const Route = createFileRoute("/question/$id")({
  head: () => ({ meta: [{ title: "Question — Sec." }] }),
  component: QuestionDetailPage,
});

function QuestionDetailPage() {
  const { id } = useParams({ from: "/question/$id" });
  const q = QUESTIONS.find((x) => x.id === id) ?? QUESTIONS[0];
  const answered = q.status === "answered";

  return (
    <div className="pb-28">
      <OrangeHeader title="Question" back="/home" />

      <div className="px-5 pt-6">
        <div className="rounded-3xl border border-border bg-card p-5 animate-pop-in">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-2xl">{q.from.avatar}</div>
            <div>
              <p className="text-sm font-semibold">{q.from.username}</p>
              <p className="text-xs text-muted-foreground">{q.receivedAt} ago</p>
            </div>
          </div>
          <p className="text-2xl font-bold leading-tight">{q.text}</p>
        </div>

        <div className="mt-5">
          {answered ? (
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-emerald-500">
                <Check className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-wider">Answered</span>
              </div>
              <div className="grid aspect-square w-full place-items-center rounded-2xl bg-muted text-7xl">
                {q.gifThumb ?? "🎞️"}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-[var(--orange)]">
                <Clock className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-wider">Waiting for your answer</span>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                You can't reply with text. Record a 5-second GIF to answer.
              </p>
              <Link to="/record" className="btn-black flex w-full items-center justify-center gap-2">
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
