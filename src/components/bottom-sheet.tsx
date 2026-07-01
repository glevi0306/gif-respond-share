import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  // "open" | "closing" | "closed"
  const [renderState, setRenderState] = useState<"open" | "closing" | "closed">(
    isOpen ? "open" : "closed",
  );
  // Ref avoids stale closure in the isOpen effect
  const renderStateRef = useRef(renderState);
  renderStateRef.current = renderState;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (isOpen) {
      setRenderState("open");
    } else if (renderStateRef.current !== "closed") {
      setRenderState("closing");
      closeTimer.current = setTimeout(() => {
        setRenderState("closed");
        closeTimer.current = null;
      }, 180);
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (renderState === "closed") return null;

  const closing = renderState === "closing";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center ${
        closing ? "animate-overlay-fade-out-fast" : "animate-overlay-fade"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-t-3xl bg-background px-5 pt-4 shadow-xl ${
          closing ? "animate-sheet-close" : "animate-slide-up"
        }`}
        style={{ paddingBottom: "max(2.5rem, calc(env(safe-area-inset-bottom) + 1.5rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/25" />
        {title && <h2 className="mb-4 text-center text-base font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
