import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCirclePlus, Video, Library, User } from "lucide-react";

const tabs = [
  { to: "/home", icon: Home, label: "Home" },
  { to: "/ask", icon: MessageCirclePlus, label: "Ask" },
  { to: "/record", icon: Video, label: "Record", primary: true },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4 pb-4 pt-2">
      <div className="flex items-center justify-between rounded-full border border-border bg-card/95 px-3 py-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] backdrop-blur">
        {tabs.map(({ to, icon: Icon, label, primary }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          if (primary) {
            return (
              <Link
                key={to}
                to={to}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
                style={{ backgroundColor: "var(--orange)" }}
                aria-label={label}
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-medium transition ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition`} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
