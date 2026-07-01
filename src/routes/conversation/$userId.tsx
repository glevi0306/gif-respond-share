import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, MessageCircle } from "lucide-react";
import { BottomNav } from "../../components/bottom-nav";
import { GifModal } from "../../components/gif-modal";
import { ChatBubble, GifBubble, WaitingBubble } from "../../components/chat-bubble";
import { UserAvatar } from "../../components/user-avatar";
import {
  useConversation,
  useAnswersForConversation,
  useReactionsForConversation,
  useDirectGifsForConversation,
  useMarkConversationRead,
  useConversationReadState,
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
  | { kind: "answer"; gifUrl: string; createdAt: string; answerId: string; isOwner: boolean }
  | { kind: "direct"; gifUrl: string; createdAt: string; directGifId: string; isOwner: boolean };

type TimelineItem = { kind: "question"; q: ConvQuestion } | { kind: "direct"; d: DirectGifRow };

// ── Page ─────────────────────────────────────────────────────

function ConversationPage() {
  const { userId: partnerId } = useParams({ from: "/conversation/$userId" });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const { data: thread = [], isLoading: threadLoading, error } = useConversation(partnerId);
  const { data: answersById = {}, isLoading: answersLoading } =
    useAnswersForConversation(partnerId);
  const { data: reactionsData = { byAnswerId: {}, byDirectGifId: {} } } =
    useReactionsForConversation(partnerId);
  const { byAnswerId: reactionsById, byDirectGifId: reactionsByDirectGifId } = reactionsData;
  const { data: directGifs = [], isLoading: directGifsLoading } =
    useDirectGifsForConversation(partnerId);

  // Partner's last_seen_at for this conversation (they read = eye open on our messages)
  const { data: partnerLastSeenAt = null } = useConversationReadState(partnerId);

  // All three core queries must be done before we attempt to scroll.
  // isLoading stays false when stale cache exists, so cached conversations
  // skip the skeleton and go straight to the image-wait overlay.
  const isLoading = threadLoading || answersLoading || directGifsLoading;

  const upsertReaction = useUpsertReaction();
  const removeReaction = useRemoveReaction();
  const softDelete = useSoftDeleteAnswer();
  const softDeleteDirect = useSoftDeleteDirectGif();

  const [viewingGif, setViewingGif] = useState<ViewingGif | null>(null);

  // chatReady starts false on every mount (every conversation entry).
  // It only flips true once all data + images are settled.
  const [chatReady, setChatReady] = useState(false);
  const nearBottomRef = useRef(true);
  // Guards the subsequent-scroll effect from double-firing right after
  // the initial instant scroll sets chatReady = true.
  const skipNextScrollRef = useRef(false);

  // Jump-to-newest button: visible when scrolled away from the bottom.
  // hasNewContent drives the gentle bounce when polling brings new items.
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);

  // Lock body scroll when GIF modal is open
  useEffect(() => {
    if (viewingGif) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [viewingGif]);

  // Track scroll position: prevents polling yanking user back down when
  // scrolled up, and drives jump-to-newest button visibility.
  useEffect(() => {
    const onScroll = () => {
      const distFromBottom =
        document.documentElement.scrollHeight -
        document.documentElement.scrollTop -
        window.innerHeight;
      const isNear = distFromBottom < 200;
      nearBottomRef.current = isNear;
      if (isNear) {
        setShowJumpBtn(false);
        setHasNewContent(false);
      } else {
        setShowJumpBtn(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mark conversation as read every time this page is opened (partnerId changes
  // on every navigation due to AnimatedPage key remount). Invalidates the home
  // chats list so New Answer / New Question badges clear immediately.
  const markRead = useMarkConversationRead();
  useEffect(() => {
    if (!user?.id) return;
    markRead.mutate(partnerId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, user?.id]);

  // ── Initial scroll: wait for data + bottom GIFs, then reveal ────────────
  // GIFs use loading="lazy" with reserved aspect-ratio, so only the images
  // near the scroll target (bottom of chat) need to finish loading before we
  // can position correctly. Waiting for every image in a long conversation
  // saturated bandwidth and held the overlay for the full 2.5 s safety window.
  // We wait for at most the last 3 img elements (nearest the bottom). A 1 s
  // safety timeout prevents a broken image from blocking the reveal.
  const answersCount = Object.keys(answersById).length;
  useEffect(() => {
    if (isLoading || chatReady) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;

      const allImgs = chatContainerRef.current
        ? Array.from(chatContainerRef.current.querySelectorAll<HTMLImageElement>("img"))
        : [];
      // Only wait for the last 3 images — they are nearest the bottom where
      // we scroll. Images further up have reserved aspect-ratio space, so their
      // load state does not affect the scroll target position.
      const bottomImgs = allImgs.slice(-3);
      const pending = bottomImgs.filter((img) => !img.complete);

      const finish = () => {
        if (cancelled) return;
        cancelled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        // Second RAF: ensures the browser has applied image dimensions to the
        // layout before we measure scroll position.
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: "instant" });
          nearBottomRef.current = true;
          skipNextScrollRef.current = true;
          setChatReady(true);
        });
      };

      if (pending.length === 0) {
        finish();
        return;
      }

      // Safety valve: never stay behind the overlay longer than 1 s
      timer = setTimeout(finish, 1000);

      let remaining = pending.length;
      const onSettled = () => {
        if (cancelled) return;
        remaining--;
        if (remaining <= 0) finish();
      };

      pending.forEach((img) => {
        img.addEventListener("load", onSettled, { once: true });
        img.addEventListener("error", onSettled, { once: true });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, chatReady, thread.length, directGifs.length, answersCount]);

  // ── Subsequent scroll: smooth-scroll when new content arrives ────────────
  // Only active after chatReady; skips its very first run (which fires when
  // chatReady transitions to true) to avoid a second scroll after the instant
  // one already placed us at the bottom.
  // When the user is scrolled up and new content arrives, arm the bounce
  // indicator on the jump button instead of force-scrolling.
  useEffect(() => {
    if (!chatReady) return;
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false;
      return;
    }
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewContent(true);
    }
  }, [chatReady, thread.length, directGifs.length, answersCount]);

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

  // Track the last timeline item sent by the current user and when it was created.
  // Only this item shows the open/closed eye seen indicator.
  const { lastSentIdx, lastSentCreatedAt } = useMemo(() => {
    let idx = -1;
    let createdAt = "";
    timeline.forEach((item, i) => {
      if (item.kind === "direct" && item.d.sender_id === user?.id && !item.d.is_deleted) {
        idx = i;
        createdAt = item.d.created_at;
      } else if (item.kind === "question") {
        const q = item.q;
        const iAsked = q.from_id === user?.id;
        const answer = answersById[q.id];
        if (iAsked) {
          idx = i;
          createdAt = q.created_at;
        } else if (answer && !answer.is_deleted) {
          idx = i;
          createdAt = answer.created_at;
        }
      }
    });
    return { lastSentIdx: idx, lastSentCreatedAt: createdAt };
  }, [timeline, user?.id, answersById]);

  // true = partner has seen it; false = not yet; undefined = no sent items
  const lastSentSeenState: boolean | undefined =
    lastSentIdx >= 0
      ? partnerLastSeenAt !== null
        ? partnerLastSeenAt >= lastSentCreatedAt
        : false
      : undefined;

  // Phase 1: no data yet — show skeleton (isLoading true)
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

  // Phase 2 / 3: data ready — render chat, overlay dismisses once images settle
  return (
    <>
      <div className="pb-28">
        <ConvHeader partner={partner} />

        <div ref={chatContainerRef} className="px-4 pt-4 chat-paper-bg min-h-screen">
          {timeline.length === 0 && (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No messages yet. Ask a question to start!
            </p>
          )}

          {timeline.map((item, i) => {
            const isLastSent = i === lastSentIdx;

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
                    avatarUrl={partner?.avatar_url}
                    reactionEmoji={reactionsByDirectGifId[d.id]?.emoji}
                    seenState={isLastSent && isRight ? lastSentSeenState : undefined}
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
                  avatarUrl={partner?.avatar_url}
                  seenState={isLastSent && iAsked ? lastSentSeenState : undefined}
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
                      avatarUrl={partner?.avatar_url}
                      reactionEmoji={reactionsById[answer!.id]?.emoji}
                      seenState={isLastSent && !iAsked ? lastSentSeenState : undefined}
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

      {/* Loading overlay — covers the chat while images are still loading.
          Always in DOM; fades out once chatReady = true (smooth reveal vs.
          instant removal). transition fires only on exit so first appearance
          is instant (no fade-in that would flash skeleton content). */}
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background/85 backdrop-blur-[2px]"
        style={{
          opacity: chatReady ? 0 : 1,
          pointerEvents: chatReady ? "none" : "auto",
          transition: chatReady ? "opacity 250ms var(--ease-out)" : "none",
        }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--orange)]" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">Loading chat…</p>
      </div>

      {/* Jump to newest — fades in when scrolled up, bounces when new content arrives */}
      <button
        onClick={() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          setHasNewContent(false);
        }}
        aria-label="Jump to newest"
        className={`fixed z-30 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--orange)] text-white shadow-lg${hasNewContent ? " animate-btn-pulse" : ""}`}
        style={{
          right: "1rem",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)",
          opacity: chatReady && showJumpBtn ? 1 : 0,
          pointerEvents: chatReady && showJumpBtn ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
      >
        <ChevronDown className="h-5 w-5" />
      </button>

      {viewingGif && (
        <GifModal
          gifUrl={viewingGif.gifUrl}
          createdAt={viewingGif.createdAt}
          isOwner={viewingGif.isOwner}
          allowReactions={!viewingGif.isOwner}
          originSide={viewingGif.isOwner ? "right" : "left"}
          currentReaction={
            viewingGif.isOwner
              ? null
              : viewingGif.kind === "answer"
                ? reactionsById[viewingGif.answerId]?.user_id === user?.id
                  ? (reactionsById[viewingGif.answerId]?.emoji ?? null)
                  : null
                : reactionsByDirectGifId[viewingGif.directGifId]?.user_id === user?.id
                  ? (reactionsByDirectGifId[viewingGif.directGifId]?.emoji ?? null)
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
            // HAPTIC: selection — emoji reaction picked
            if (viewingGif.isOwner) return;
            if (viewingGif.kind === "answer") {
              if (emoji === null) removeReaction.mutate({ answerId: viewingGif.answerId });
              else upsertReaction.mutate({ answerId: viewingGif.answerId, emoji });
            } else {
              if (emoji === null) removeReaction.mutate({ directGifId: viewingGif.directGifId });
              else upsertReaction.mutate({ directGifId: viewingGif.directGifId, emoji });
            }
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
    <header
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 pb-3 backdrop-blur-sm"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <Link
        to="/home"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-95"
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="relative shrink-0">
        <UserAvatar
          avatarUrl={partner?.avatar_url}
          avatarEmoji={partner?.avatar_emoji ?? "🙂"}
          size={40}
        />
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
