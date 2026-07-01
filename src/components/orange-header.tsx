import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function OrangeHeader({
  title,
  subtitle,
  back,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="orange-header relative">
      <div className="flex items-center justify-between gap-3">
        {back ? (
          <Link
            to={back as string}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-[background-color,transform] hover:bg-white/25 active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <div className="h-10 w-10" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/80">{subtitle}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-end">{right}</div>
      </div>
      {children}
    </header>
  );
}
