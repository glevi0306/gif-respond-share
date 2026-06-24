import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { PROFILE, GIFS } from "../lib/sec-data";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Sec." }] }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="pb-28">
      <OrangeHeader
        title="Profile"
        back="/home"
        right={
          <Link to="/settings" aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        }
      >
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-black text-4xl ring-4 ring-white/30">{PROFILE.avatar}</div>
          <h2 className="text-xl font-bold text-white">@{PROFILE.username}</h2>
          <p className="max-w-xs text-center text-sm text-white/85">{PROFILE.bio}</p>
        </div>
      </OrangeHeader>

      <div className="px-5 pt-5">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="GIFs" value={PROFILE.totalGifs} />
          <Stat label="Asked" value={PROFILE.questionsAsked} />
          <Stat label="Answered" value={PROFILE.questionsAnswered} />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent GIFs</h3>
          <div className="grid grid-cols-4 gap-2">
            {GIFS.slice(0, 8).map((g) => (
              <div key={g.id} className="grid aspect-square place-items-center rounded-xl bg-muted text-3xl">{g.emoji}</div>
            ))}
          </div>
        </div>

        <Link to="/settings" className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold">
          <SettingsIcon className="h-4 w-4" /> Open Settings
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
