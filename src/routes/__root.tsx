import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Secauthlogo from "../assets/Secauthlogo.png";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProvider, useApp } from "../lib/app-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import type { Language } from "../lib/sec-data";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-black inline-flex">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="btn-black"
          >Try again</button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FF7A00" },
      { title: "Sec. — Ask anything. Answer with a GIF." },
      { name: "description", content: "Sec. is a mobile-first social app: ask friends anything, answer with a 5-second GIF." },
      { property: "og:title", content: "Sec. — Ask anything. Answer with a GIF." },
      { property: "og:description", content: "Ask friends anything. Answer with a 5-second GIF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      // PWA / iOS
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Sec." },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// AppShell consumes both AuthProvider and AppProvider.
// It handles the global loading state, language sync, route guard, and splash screen.
function AppShell() {
  const { session, profile, loading } = useAuth();
  const { setLanguage } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // ── Service worker ────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // ── Splash screen ─────────────────────────────────────────────
  // Visible on first mount. Fades out once auth resolves + min 700ms has passed.
  const [splashHidden, setSplashHidden] = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      setSplashFading(true);
      setTimeout(() => setSplashHidden(true), 220);
    };
    // Show for at least 500ms so returning users don't see a flash
    const minTimer = setTimeout(() => { if (!loadingRef.current) dismiss(); }, 500);
    // Hard cap: never hang longer than 900ms total
    const maxTimer = setTimeout(dismiss, 900);
    return () => { clearTimeout(minTimer); clearTimeout(maxTimer); };
  }, []);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => {}, 0);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Sync the user's preferred language from their Supabase profile
  useEffect(() => {
    if (profile?.language) {
      setLanguage(profile.language as Language);
    }
  }, [profile?.language, setLanguage]);

  // Route guard: redirect unauthenticated users to /auth, and
  // redirect authenticated users away from /auth to /home
  useEffect(() => {
    if (loading) return;
    const onAuthPage = pathname === "/auth";
    if (!session && !onAuthPage) {
      navigate({ to: "/auth" });
    } else if (session && onAuthPage) {
      navigate({ to: "/home" });
    }
  }, [session, loading, pathname, navigate]);

  const mainContent = loading ? (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-[var(--orange)]" />
    </div>
  ) : (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background">
      <Outlet />
    </div>
  );

  return (
    <>
      {mainContent}
      {!splashHidden && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-splash-in"
          style={{
            backgroundColor: "var(--orange)",
            transition: splashFading ? "opacity 300ms ease" : undefined,
            opacity: splashFading ? 0 : 1,
          }}
        >
          <img src={Secauthlogo} alt="Sec." className="w-56 object-contain" fetchPriority="high" />
        </div>
      )}
    </>
  );
}
