import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Send } from "lucide-react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { FRIENDS, QUESTION_SUGGESTIONS } from "../lib/sec-data";

export const Route = createFileRoute("/ask")({
  head: () => ({ meta: [{ title: "Ask — Sec." }] }),
  component: AskPage,
});

function AskPage() {
  const [query, setQuery] = useState("");
  const [friendId, setFriendId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const navigate = useNavigate();

  const filtered = FRIENDS.filter((f) => f.username.toLowerCase().includes(query.toLowerCase()));
  const canSend = friendId && text.trim().length > 0;

  return (
    <div className="pb-28">
      <OrangeHeader title="Ask a friend" subtitle="They'll answer with a GIF" back="/home" />

      <div className="px-5 pt-6">
        <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends" className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filtered.map((f) => (
            <button
              key={f.id} onClick={() => setFriendId(f.id)}
              className={`flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-2xl p-2 transition ${
                friendId === f.id ? "bg-[var(--orange)]/15" : ""
              }`}
            >
              <div className={`grid h-14 w-14 place-items-center rounded-full bg-card text-2xl ${friendId === f.id ? "ring-2 ring-[var(--orange)]" : "ring-1 ring-border"}`}>
                {f.avatar}
              </div>
              <p className="truncate text-[11px] font-medium">{f.username}</p>
            </button>
          ))}
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your question</label>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="What are you doing?"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-card p-4 text-base outline-none focus:border-foreground"
          />
        </div>

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setText(s)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium">
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!canSend}
          onClick={() => navigate({ to: "/home" })}
          className="btn-black mt-6 flex w-full items-center justify-center gap-2 disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Send question
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
