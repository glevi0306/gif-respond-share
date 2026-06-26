import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { BottomNav } from "../../components/bottom-nav";
import { GifModal } from "../../components/gif-modal";
import { ChatBubble, GifBubble, WaitingBubble } from "../../components/chat-bubble";
import {
  useConversation,
  useAnswersForConversation,
  useReactionsForConversation,
  useDirectGifsForConversation,
  useUpsertReaction,
  useRemoveReaction,
  useSoftDeleteAnswer,
  useSoftDeleteDirectGif,
  type QuestionSender,
  type ConvQuestion,
  type DirectGifRow,
} from "../../hooks/use-questions";
import { useAuth } from "../../lib/auth-context";

export const Route = createFileRoute("/conversation/$userId")({
  head: () => ({ meta: [{ title: "Conversation — Sec." }] }),
  component: ConversationPage,
});

type ViewingGif =
  | { kind: "answer"; gifUrl: string; createdAt: string; answerId: string;    isOwner: boolean }
  | { kind: "direct"; gifUrl: string; createdAt: string; directGifId: string; isOwner: boolean };

type TimelineItem =
  | { kind: "question"; q: ConvQuestion }
  | { kind: "direct";   d: DirectGifRow };

// ── Page ─────────────────────────────────────────────────────

function ConversationPage() {
  const { userId: partnerId } = useParams({ from: "/conversation/$userId" });
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: thread = [], isLoading, error } = useConversation(partnerId);
  const { data: answersById = {} } = useAnswersForConversation(partnerId);
  const { data: reactionsById = {} } = useReactionsForConversation(partnerId);
  const { data: directGifs = [] } = useDirectGifsForConversation(partnerId);

  const upsertReaction   = useUpsertReaction();
  const removeReaction   = useRemoveReaction();
  const softDelete       = useSoftDeleteAnswer();
  const softDeleteDirect = useSoftDeleteDirectGif();

  const [viewingGif, setViewingGif] = useState<ViewingGif | null>(null);
  // Tracks whether user is near the bottom of the page; only auto-scroll if true
  const nearBottomRef = useRef(true);

  // Lock body scroll when modal open
  useEffect(() => {
    if (viewingGif) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [viewingGif]);

  // Track scroll position to avoid disrupting manual upward scroll
  useEffect(() => {
    const onScroll = () => {
      const distFromBottom =
        document.documentElement.scrollHeight -
        document.documentElement.scrollTop -
        window.innerHeight;
      nearBottomRef.current = distFromBottom < 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll only when user is already near the bottom
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread.length, directGifs.length]);

  const partner: QuestionSender | null =
    thread.length > 0
      ? thread[0].from_id === partnerId
        ? thread[0].sender
        : thread[0].receiver
      : null;

  // Merge questions and direct GIFs into one chronological timeline
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...thread.map((q): TimelineItem => ({ kind: "question", q })),
      ...directGifs.map((d): TimelineItem => ({ kind: "direct", d })),
    ];
    items.sort((a, b) => {
      const ta = a.kind === "question" ? a.q.created_at : a.d.created_at;
      const tb = b.kind === "question" ? b.q.created_at : b.d.created_at;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    return items;
  }, [thread, directGifs]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <ConvHeader partner={null} />
        <div className="flex flex-1 justify-center pt-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--orange)]" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <ConvHeader partner={null} />
        <p className="px-5 pt-10 text-center text-sm text-muted-foreground">
          Could not load conversation. Please try again.
        </p>
        <BottomNav />
      </div>
    );
  }

  return (
    <>
      <div className="pb-28">
        <ConvHeader partner={partner} />

        <div className="px-4 pt-4">
          {timeline.length === 0 && (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No messages yet. Ask a question to start!
            </p>
          )}

          {timeline.map((item) => {
            if (item.kind === "direct") {
              const d = item.d;
              const isRight = d.sender_id === user?.id;
              if (d.is_deleted) {
                return (
                  <div key={`direct-${d.id}`} className="py-3 space-y-2">
                    <ChatBubble
                      variant="deleted"
                      text="GIF deleted"
                      createdAt={d.created_at}
                      isRight={isRight}
                    />
                  </div>
                );
              }
              return (
                <div key={`direct-${d.id}`} className="py-3 space-y-2">
                  <GifBubble
                    gifUrl={d.gif_url}
                    createdAt={d.created_at}
                    isRight={isRight}
                    avatarEmoji={partner?.avatar_emoji ?? "🙂"}
                    onTap={() =>
                      setViewingGif({
                        kind: "direct",
                        gifUrl: d.gif_url,
                        createdAt: d.created_at,
                        directGifId: d.id,
                        isOwner: isRight,
                      })
                    }
                  />
                </div>
              );
            }

            // kind === "question"
            const q = item.q;
            const iAsked = q.from_id === user?.id;
            const answer = answersById[q.id] ?? null;
            const hasAnswer = q.status === "answered" && answer != null;
            // GIF from recipient: I asked → partner answers (left); partner asked → I answer (right)
            const gifIsRight = !iAsked;

            return (
              <div key={q.id} className="py-3 space-y-2">
                <ChatBubble
                  variant="question"
                  text={q.text}
                  createdAt={q.created_at}
                  isRight={iAsked}
                  avatarEmoji={partner?.avatar_emoji ?? "🙂"}
                />

                {hasAnswer ? (
                  answer!.is_deleted ? (
                    <ChatBubble
                      variant="deleted"
                      text="GIF deleted"
                      createdAt={answer!.created_at}
                      isRight={gifIsRight}
                    />
                  ) : (
                    <GifBubble
                      gifUrl={answer!.gif_url}
                      createdAt={answer!.created_at}
                      isRight={gifIsRight}
                      avatarEmoji={partner?.avatar_emoji ?? "🙂"}
                      reactionEmoji={reactionsById[answer!.id]?.emoji}
                      onTap={() =>
                        setViewingGif({
                          kind: "answer",
                          gifUrl: answer!.gif_url,
                          createdAt: answer!.created_at,
                          answerId: answer!.id,
                          isOwner: answer!.responder_id === user?.id,
                        })
                      }
                    />
                  )
                ) : (
                  <WaitingBubble
                    isRight={gifIsRight}
                    waitingForMe={!iAsked && q.status === "waiting"}
                    questionId={q.id}
                  />
                )}
              </div>
            );
          })}

          <div ref={bottomRef} />

          <div className="pt-4 pb-2">
            <Link
              to="/ask"
              search={{ to: partnerId }}
              className="btn-black flex w-full items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" /> Ask a question
            </Link>
          </div>
        </div>
      </div>

      {viewingGif && (
        <GifModal
          gifUrl={viewingGif.gifUrl}
          createdAt={viewingGif.createdAt}
          isOwner={viewingGif.isOwner}
          allowReactions={viewingGif.kind === "answer"}
          currentReaction={
            viewingGif.kind === "answer" && !viewingGif.isOwner
              ? (reactionsById[viewingGif.answerId]?.user_id === user?.id
                  ? (reactionsById[viewingGif.answerId]?.emoji ?? null)
                  : null)
              : null
          }
          onClose={() => setViewingGif(null)}
          onDelete={() => {
            if (viewingGif.kind === "answer") {
              softDelete.mutate({ answerId: viewingGif.answerId });
            } else {
              softDeleteDirect.mutate({ directGifId: viewingGif.directGifId });
            }
            setViewingGif(null);
          }}
          onReact={(emoji) => {
            if (viewingGif.kind !== "answer") return;
            if (emoji === null) removeReaction.mutate({ answerId: viewingGif.answerId });
            else upsertReaction.mutate({ answerId: viewingGif.answerId, emoji });
          }}
        />
      )}

      <BottomNav />
    </>
  );
}

// ── Header ───────────────────────────────────────────────────

function ConvHeader({ partner }: { partner: QuestionSender | null }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
      <Link
        to="/home"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="relative shrink-0">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-xl">
          {partner?.avatar_emoji ?? "🙂"}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {partner ? `@${partner.username}` : "Conversation"}
        </p>
        <p className="text-[11px] font-medium text-emerald-500">Online</p>
      </div>
    </header>
  );
}
