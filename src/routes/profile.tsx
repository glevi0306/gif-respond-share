import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Settings as SettingsIcon, Smile, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { BottomSheet } from "../components/bottom-sheet";
import { UserAvatar } from "../components/user-avatar";
import { AvatarEditor } from "../components/avatar-editor";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Sec." }] }),
  component: ProfilePage,
});

const EMOJI_PRESETS = [
  "😊","😂","🥰","😎","🤩","🥳","😋","🤪","🙄","😤",
  "🥺","😇","🤓","😴","🥸","🤔","😈","👻","🐱","🦊",
  "🐸","🌸","⭐","🔥","💎",
];

type StatsRow = { gif_count: number; questions_asked: number; questions_answered: number };
type RecentGif = { id: string; public_url: string };

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    staleTime: 60_000,
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFileToEdit(f);
    e.target.value = "";
    setSheetOpen(false);
  };

  const handleAvatarSave = async (blob: Blob) => {
    if (!user) return;
    setFileToEdit(null);
    setUploading(true);
    setUploadError(null);
    try {
      const path = `${user.id}/avatar.png`;
      const { error: storageErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (storageErr) throw storageErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the browser fetches the new photo, not a stale cached one
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);
      if (updateErr) throw updateErr;

      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    if (!user) return;
    setShowEmojiPicker(false);
    setSheetOpen(false);
    await supabase.from("profiles").update({ avatar_emoji: emoji }).eq("id", user.id);
    await refreshProfile();
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setSheetOpen(false);
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.invalidateQueries({ queryKey: ["chats"] });
  };

  const avatarEmoji = profile?.avatar_emoji ?? "🙂";
  const avatarUrl = profile?.avatar_url ?? null;
  const username = profile?.username ?? "you";
  const bio = (profile as { bio?: string } | null)?.bio ?? "No bio yet.";

  return (
    <div className="pb-28">
      <OrangeHeader
        title="Profile"
        back="/home"
        right={
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        }
      >
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={() => { setShowEmojiPicker(false); setSheetOpen(true); }}
            className="rounded-full ring-4 ring-white/30 active:opacity-75"
            aria-label="Edit avatar"
          >
            <UserAvatar avatarUrl={avatarUrl} avatarEmoji={avatarEmoji} size={80} />
          </button>

          <h2 className="text-xl font-bold text-white">@{username}</h2>
          <p className="max-w-xs text-center text-sm text-white/85">{bio}</p>
        </div>
      </OrangeHeader>

      {uploadError && (
        <p className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {uploadError}
        </p>
      )}

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

        <Link
          to="/settings"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold"
        >
          <SettingsIcon className="h-4 w-4" /> Open Settings
        </Link>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Avatar options bottom sheet */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setShowEmojiPicker(false); }}
        title={showEmojiPicker ? "Choose Emoji" : "Avatar"}
      >
        {showEmojiPicker ? (
          <div>
            <div className="grid grid-cols-5 gap-3 py-2">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  onClick={() => void handleEmojiSelect(e)}
                  className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl transition active:scale-95 ${
                    profile?.avatar_emoji === e
                      ? "bg-[var(--orange)]/15 ring-2 ring-[var(--orange)]"
                      : "bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition active:scale-[0.99]"
            >
              <Camera className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-semibold">Choose photo</p>
            </button>
            <button
              onClick={() => setShowEmojiPicker(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition active:scale-[0.99]"
            >
              <Smile className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-semibold">Choose emoji</p>
            </button>
            {avatarUrl && (
              <button
                onClick={() => void handleRemovePhoto()}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-left transition active:scale-[0.99] dark:border-red-900/40 dark:bg-red-950/20"
              >
                <Trash2 className="h-5 w-5 text-red-500" />
                <p className="text-sm font-semibold text-red-500">Remove photo</p>
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Avatar crop editor */}
      {fileToEdit && (
        <AvatarEditor
          file={fileToEdit}
          onSave={(blob) => void handleAvatarSave(blob)}
          onCancel={() => setFileToEdit(null)}
        />
      )}

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
