import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Plus, Sparkles } from "lucide-react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { FRIENDS, QUESTIONS, RECENT_ANSWERS } from "../lib/sec-data";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Home — Sec." }] }),
  component: HomePage,
});

function HomePage() {
  const online = FRIENDS.filter((f) => f.online);
  return (
    <div className="pb-28">
      <OrangeHeader
        title="Sec."
        subtitle="Ask anything. Answer with a GIF."
        right={
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </button>
        }
      >
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-black/15 p-3 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/75">Today</p>
            <p className="text-sm font-semibold text-white">{QUESTIONS.filter(q => q.status === "waiting").length} waiting · {RECENT_ANSWERS.length} answers</p>
          </div>
          <Link to="/ask" className="flex items-center gap-1.5 rounded-full bg-black px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-4 w-4" /> Ask
          </Link>
        </div>
      </OrangeHeader>

      <section className="px-5 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Friends online</h2>
          <span className="text-xs text-muted-foreground">{online.length} active</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {online.map((f) => (
            <div key={f.id} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <div className="relative grid h-14 w-14 place-items-center rounded-full bg-card text-2xl ring-2 ring-[var(--orange)]">
                {f.avatar}
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
              </div>
              <p className="truncate text-[11px] font-medium">{f.username}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-base font-bold">Questions for you</h2>
        <div className="space-y-2.5">
          {QUESTIONS.filter(q => q.status === "waiting").map((q) => (
            <Link
              key={q.id} to="/question/$id" params={{ id: q.id }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition active:scale-[0.99]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-xl">{q.from.avatar}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{q.from.username}</p>
                  <span className="text-[10px] text-muted-foreground">{q.receivedAt}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{q.text}</p>
              </div>
              <span className="rounded-full bg-[var(--orange)]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--orange)]">New</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold"><Sparkles className="h-4 w-4 text-[var(--orange)]" /> Recent answers</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {RECENT_ANSWERS.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 grid aspect-square place-items-center rounded-xl bg-muted text-4xl">{a.emoji}</div>
              <p className="text-xs font-semibold">to {a.to.username}</p>
              <p className="text-[11px] text-muted-foreground">{a.category} · {a.time}</p>
            </div>
          ))}
        </div>
      </section>

      <BottomNav />
    </div>
  );
}
