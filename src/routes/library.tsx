import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Tag, Share2, Trash2, Star, ArrowUpDown } from "lucide-react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { GifModal } from "../components/gif-modal";
import { BottomSheet } from "../components/bottom-sheet";
import { GIF_CATEGORIES } from "../lib/sec-data";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { compactTime } from "../hooks/use-questions";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library — Sec." }] }),
  component: LibraryPage,
});

type GifRow = {
  id: string;
  public_url: string;
  storage_path: string;
  category: string | null;
  created_at: string;
  is_favorite: boolean;
  times_used: number;
};

type ProfileRow = { id: string; username: string; avatar_emoji: string };

function getCategoryEmoji(key: string | null): string | null {
  if (!key) return null;
  return GIF_CATEGORIES.find((c) => c.key === key)?.emoji ?? null;
}

function LibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<"recent" | "used">("recent");
  const [selectedGif, setSelectedGif] = useState<GifRow | null>(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Tracks which gif id is animating its category emoji badge
  const [animatingCatId, setAnimatingCatId] = useState<string | null>(null);

  const { data: gifs = [], isLoading, error } = useQuery<GifRow[]>({
    queryKey: ["gifs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifs")
        .select("id, public_url, storage_path, category, created_at, is_favorite, times_used")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GifRow[];
    },
    enabled: !!user,
  });

  const { data: allProfiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["profiles", "all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_emoji")
        .neq("id", user!.id)
        .order("username")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!user && showShareSheet,
  });

  // Apply category + favorites filter
  const filtered = cat === "favorites"
    ? gifs.filter((g) => g.is_favorite)
    : cat === "all"
      ? gifs
      : gifs.filter((g) => g.category === cat);

  // Apply sort
  const items = [...filtered].sort((a, b) => {
    if (sort === "used") return b.times_used - a.times_used;
    return a.created_at < b.created_at ? 1 : -1; // recent first (already ordered by DB but keep consistent)
  });

  const filteredProfiles = friendSearch
    ? allProfiles.filter((f) => f.username.toLowerCase().includes(friendSearch.toLowerCase()))
    : allProfiles;

  // ── Actions ──────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!selectedGif || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      // Step 1: Delete the DB row first.
      // With migration 009, answers.gif_id becomes nullable (ON DELETE SET NULL),
      // so this succeeds even for GIFs that have been used as answers.
      // answers.gif_url is denormalized, so chat display continues to work.
      const { error: dbError } = await supabase
        .from("gifs")
        .delete()
        .eq("id", selectedGif.id);
      if (dbError) throw dbError;

      // Step 2: Only delete the storage file if no active chat message
      // still references this URL (to avoid breaking conversation images).
      const gifUrl = selectedGif.public_url;
      const [{ count: ansCount }, { count: dgCount }] = await Promise.all([
        supabase
          .from("answers")
          .select("id", { count: "exact", head: true })
          .eq("gif_url", gifUrl)
          .eq("is_deleted", false),
        supabase
          .from("direct_gifs")
          .select("id", { count: "exact", head: true })
          .eq("gif_url", gifUrl)
          .eq("is_deleted", false),
      ]);

      if (!ansCount && !dgCount) {
        // Safe to remove: no conversation is displaying this GIF
        await supabase.storage.from("gifs").remove([selectedGif.storage_path]);
      }
      // If the GIF is still in chat, we leave the storage file intact
      // so conversation images keep loading. The row is already removed
      // from the Library (gifs table deleted above).

      queryClient.invalidateQueries({ queryKey: ["gifs"] });
      setDeleteError(null);
      setSelectedGif(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    setSelectedGif(null);
    setDeleteError(null);
  };

  const handleSetCategory = async (categoryKey: string) => {
    if (!selectedGif || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("gifs")
        .update({ category: categoryKey })
        .eq("id", selectedGif.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gifs"] });
      setSelectedGif((prev) => (prev ? { ...prev, category: categoryKey } : null));
      // Trigger category badge pop animation on the grid card
      setAnimatingCatId(selectedGif.id);
      setTimeout(() => setAnimatingCatId(null), 200);
      setShowCategorySheet(false);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async (friendId: string) => {
    if (!selectedGif || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("direct_gifs").insert({
        sender_id: user!.id,
        receiver_id: friendId,
        gif_id: selectedGif.id,
        gif_url: selectedGif.public_url,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["conv-direct-gifs"] });
      // Increment usage counter (fire-and-forget)
      supabase.rpc("increment_gif_usage", { p_gif_id: selectedGif.id }).catch(() => {});
      setShowShareSheet(false);
      setFriendSearch("");
      setSelectedGif(null);
      navigate({ to: "/conversation/$userId", params: { userId: friendId } });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFavorite = async (gif: GifRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !gif.is_favorite;
    // Optimistic update
    queryClient.setQueryData<GifRow[]>(["gifs", user?.id], (prev) =>
      (prev ?? []).map((g) => (g.id === gif.id ? { ...g, is_favorite: next } : g))
    );
    await supabase.from("gifs").update({ is_favorite: next }).eq("id", gif.id);
    queryClient.invalidateQueries({ queryKey: ["gifs"] });
    // Update selected gif if it's open
    setSelectedGif((prev) => (prev?.id === gif.id ? { ...prev, is_favorite: next } : prev));
  };

  // ── Modal action bar ─────────────────────────────────────────

  const modalActions = selectedGif ? (
    <div>
      {deleteError && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {deleteError}
        </p>
      )}
    <div className="flex justify-around">
      <button
        onClick={() => void handleDelete()}
        disabled={busy}
        className="flex flex-col items-center gap-1.5 px-4 py-2 transition active:scale-95 disabled:opacity-50"
      >
        <div className="grid h-10 w-10 place-items-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
          <Trash2 className="h-4 w-4" />
        </div>
        <span className="text-[11px] font-semibold text-red-400">Delete</span>
      </button>

      <button
        onClick={() => setShowCategorySheet(true)}
        disabled={busy}
        className="flex flex-col items-center gap-1.5 px-4 py-2 transition active:scale-95 disabled:opacity-50"
      >
        <div className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-base">
          {getCategoryEmoji(selectedGif.category) ?? <Tag className="h-4 w-4 text-muted-foreground" />}
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">Category</span>
      </button>

      <button
        onClick={(e) => void handleToggleFavorite(selectedGif, e)}
        disabled={busy}
        className="flex flex-col items-center gap-1.5 px-4 py-2 transition active:scale-95 disabled:opacity-50"
      >
        <div className={`grid h-10 w-10 place-items-center rounded-full border ${selectedGif.is_favorite ? "border-amber-400/40 bg-amber-400/15 text-amber-400" : "border-border bg-card text-muted-foreground"}`}>
          <Star className={`h-4 w-4 ${selectedGif.is_favorite ? "fill-amber-400" : ""}`} />
        </div>
        <span className={`text-[11px] font-semibold ${selectedGif.is_favorite ? "text-amber-400" : "text-muted-foreground"}`}>
          {selectedGif.is_favorite ? "Starred" : "Star"}
        </span>
      </button>

      <button
        onClick={() => setShowShareSheet(true)}
        disabled={busy}
        className="flex flex-col items-center gap-1.5 px-4 py-2 transition active:scale-95 disabled:opacity-50"
      >
        <div className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card">
          <Share2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">Share</span>
      </button>
    </div>
    </div>
  ) : null;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="pb-28">
      <OrangeHeader
        title="GIF Library"
        subtitle={isLoading ? "Loading…" : `${gifs.length} saved`}
        back="/home"
      />

      <div className="px-5 pt-5">
        {/* Category filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CatChip active={cat === "all"} onClick={() => setCat("all")}>All</CatChip>
          <CatChip active={cat === "favorites"} onClick={() => setCat("favorites")}>⭐ Favorites</CatChip>
          {GIF_CATEGORIES.map((c) => (
            <CatChip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
              {c.emoji} {c.label}
            </CatChip>
          ))}
        </div>

        {/* Sort control */}
        {!isLoading && !error && gifs.length > 1 && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setSort((s) => (s === "recent" ? "used" : "recent"))}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition active:scale-95"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sort === "recent" ? "Recently Added" : "Most Used"}
            </button>
          </div>
        )}

        {isLoading && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            Could not load your GIFs. Please try again.
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {items.map((g) => {
                const catEmoji = getCategoryEmoji(g.category);
                const isCatAnimating = animatingCatId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGif(g)}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-muted transition active:scale-[0.97]"
                  >
                    <GifThumbnail url={g.public_url} />

                    {/* Category emoji badge — top-center with pop animation on change */}
                    {catEmoji && (
                      <div
                        key={isCatAnimating ? `${g.id}-anim` : g.id}
                        className={`absolute left-1/2 top-2 -translate-x-1/2 text-base leading-none drop-shadow ${isCatAnimating ? "animate-cat-pop" : ""}`}
                      >
                        {catEmoji}
                      </div>
                    )}

                    {/* Star badge — top-right */}
                    {g.is_favorite && (
                      <div className="absolute right-1.5 top-1.5 text-amber-400 drop-shadow">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                      </div>
                    )}

                    {/* Star toggle button — visible on hover/tap, top-right */}
                    <button
                      onClick={(e) => void handleToggleFavorite(g, e)}
                      className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full backdrop-blur transition active:scale-90 ${
                        g.is_favorite
                          ? "bg-amber-400/90 text-white opacity-100"
                          : "bg-black/50 text-white opacity-0 group-hover:opacity-100"
                      }`}
                      aria-label={g.is_favorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className={`h-3.5 w-3.5 ${g.is_favorite ? "fill-white" : ""}`} />
                    </button>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <p className="text-[10px] font-semibold text-white">
                        {compactTime(g.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {items.length === 0 && (
              <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {cat === "all"
                  ? "No GIFs recorded yet."
                  : cat === "favorites"
                    ? "No favorites yet — tap ★ on a GIF to star it."
                    : "No GIFs in this category yet."}
              </div>
            )}
          </>
        )}
      </div>

      {/* GIF detail modal */}
      {selectedGif && (
        <GifModal
          gifUrl={selectedGif.public_url}
          createdAt={selectedGif.created_at}
          isOwner={true}
          allowReactions={false}
          currentReaction={null}
          onClose={closeModal}
          onDelete={handleDelete}
          onReact={() => {}}
          actions={modalActions}
        />
      )}

      {/* Category picker sheet */}
      <BottomSheet
        isOpen={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        title="Choose Category"
      >
        <div className="space-y-2">
          {GIF_CATEGORIES.map((c) => {
            const isSelected = selectedGif?.category === c.key;
            return (
              <button
                key={c.key}
                onClick={() => void handleSetCategory(c.key)}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] disabled:opacity-50 ${
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card"
                }`}
              >
                <span className="text-xl">{c.emoji}</span>
                <span className="text-sm font-semibold">{c.label}</span>
                {isSelected && <span className="ml-auto text-xs font-semibold opacity-70">Selected</span>}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Share / friend picker sheet */}
      <BottomSheet
        isOpen={showShareSheet}
        onClose={() => { setShowShareSheet(false); setFriendSearch(""); }}
        title="Send to Friend"
      >
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search friends…"
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filteredProfiles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {allProfiles.length === 0 ? "No friends yet." : "No results."}
            </p>
          )}
          {filteredProfiles.map((f) => (
            <button
              key={f.id}
              onClick={() => void handleShare(f.id)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition active:scale-[0.99] disabled:opacity-50"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-xl">
                {f.avatar_emoji}
              </div>
              <p className="text-sm font-semibold">{f.username}</p>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomNav />
    </div>
  );
}

// GIF thumbnail with a visible fallback for broken / deleted storage URLs
function GifThumbnail({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-muted">
        <span className="text-xs text-muted-foreground">Unavailable</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt="GIF"
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
