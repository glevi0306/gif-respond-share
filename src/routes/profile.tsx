import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Sec." }] }),
  component: ProfilePage,
});

type StatsRow = { gif_count: number; questions_asked: number; questions_answered: number };
type RecentGif = { id: string; public_url: string };

function ProfilePage() {
  const { user, profile } = useAuth();

  const { data: stats } = useQuery<StatsRow>({
    queryKey: ["profile-stats", user?.id],
    queryFn: async () => {
      const [gifsRes, askedRes, answeredRes] = await Promise.all([
        supabase.from("gifs").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("from_id", user!.id),
        supabase.from("answers").select("id", { count: "exact", head: true }).eq("responder_id", user!.id).eq("is_deleted", false),
      ]);
      return {
        gif_count: gifsRes.count ?? 0,
        questions_asked: askedRes.count ?? 0,
        questions_answered: answeredRes.count ?? 0,
      };
    },
    enabled: !!user,
    staleTime: 60_000, // counts change rarely — cache for 60 s
  });

  const { data: recentGifs = [] } = useQuery<RecentGif[]>({
    queryKey: ["profile-recent-gifs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifs")
        .select("id, public_url")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as RecentGif[];
    },
    enabled: !!user,
  });

  const avatarEmoji = profile?.avatar_emoji ?? "🙂";
  const username = profile?.username ?? "you";
  const bio = (profile as { bio?: string } | null)?.bio ?? "No bio yet.";

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
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-black text-4xl ring-4 ring-white/30">
            {avatarEmoji}
          </div>
          <h2 className="text-xl font-bold text-white">@{username}</h2>
          <p className="max-w-xs text-center text-sm text-white/85">{bio}</p>
        </div>
      </OrangeHeader>

      <div className="px-5 pt-5">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="GIFs" value={stats?.gif_count} />
          <Stat label="Asked" value={stats?.questions_asked} />
          <Stat label="Answered" value={stats?.questions_answered} />
        </div>

        {recentGifs.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent GIFs</h3>
            <div className="grid grid-cols-4 gap-2">
              {recentGifs.map((g) => (
                <div key={g.id} className="aspect-square overflow-hidden rounded-xl bg-muted">
                  <img
                    src={g.public_url}
                    alt="GIF"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Link to="/settings" className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold">
          <SettingsIcon className="h-4 w-4" /> Open Settings
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <p className="text-xl font-extrabold">
        {value === undefined ? (
          <span className="inline-block h-5 w-8 animate-pulse rounded bg-muted" />
        ) : value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
