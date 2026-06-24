import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { GIF_CATEGORIES, GIFS } from "../lib/sec-data";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library — Sec." }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const [cat, setCat] = useState<string>("all");
  const items = cat === "all" ? GIFS : GIFS.filter((g) => g.category === cat);

  return (
    <div className="pb-28">
      <OrangeHeader title="GIF Library" subtitle={`${GIFS.length} saved`} back="/home" />

      <div className="px-5 pt-5">
        <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CatChip active={cat === "all"} onClick={() => setCat("all")}>✨ All</CatChip>
          {GIF_CATEGORIES.map((c) => (
            <CatChip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
              {c.emoji} {c.label}
            </CatChip>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {items.map((g) => (
            <div key={g.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-muted">
              <div className="grid h-full w-full place-items-center text-4xl transition group-active:scale-95">{g.emoji}</div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                <p className="text-[10px] font-semibold text-white">{g.date}</p>
              </div>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No GIFs in this category yet.
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
