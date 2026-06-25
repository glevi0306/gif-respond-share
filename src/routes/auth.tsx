import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Apple, Chrome } from "lucide-react";
import { LANGUAGES, type Language } from "../lib/sec-data";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Sec." }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [lang, setLang] = useState<Language>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        // Derive a username from the email prefix; the DB trigger will use it
        const username = email
          .split("@")[0]
          .replace(/[^a-z0-9_]/gi, "_")
          .toLowerCase()
          .slice(0, 30);

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, language: lang },
          },
        });

        if (error) throw error;

        // If Supabase email confirmation is enabled there will be no session yet
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // AppShell's route guard will redirect to /home once session is set;
      // this navigate is a fallback in case the guard fires before re-render.
      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) setError(error.message);
  };

  // ── Email confirmation screen ────────────────────────────────
  if (checkEmail) {
    return (
      <div className="min-h-screen pb-10">
        <div className="orange-header pb-10 pt-12 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-black text-3xl font-black text-white">S.</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Sec.</h1>
          <p className="mt-1 text-sm text-white/85">Ask anything. Answer with a GIF.</p>
        </div>
        <div className="px-5 pt-8 text-center">
          <p className="text-2xl font-bold">Check your email</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>.
            Click it to finish signing up.
          </p>
          <button
            onClick={() => { setCheckEmail(false); setMode("login"); }}
            className="btn-black mt-6 w-full"
          >
            Back to log in
          </button>
        </div>
      </div>
    );
  }

  // ── Main auth form ───────────────────────────────────────────
  return (
    <div className="min-h-screen pb-10">
      <div className="orange-header pb-10 pt-12 text-center">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-black text-3xl font-black text-white">S.</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Sec.</h1>
        <p className="mt-1 text-sm text-white/85">Ask anything. Answer with a GIF.</p>
      </div>

      <div className="px-5 pt-6">
        <div className="mb-5 flex rounded-full bg-muted p-1 text-sm font-semibold">
          <button
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex-1 rounded-full py-2 transition ${mode === "login" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
          >Log in</button>
          <button
            onClick={() => { setMode("signup"); setError(null); }}
            className={`flex-1 rounded-full py-2 transition ${mode === "signup" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
          >Sign up</button>
        </div>

        <form onSubmit={submit} className="space-y-3 animate-pop-in">
          <input
            type="email" placeholder="Email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm outline-none focus:border-foreground disabled:opacity-60"
          />
          <input
            type="password" placeholder="Password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm outline-none focus:border-foreground disabled:opacity-60"
          />

          {mode === "signup" && (
            <div className="rounded-2xl border border-border bg-card p-3">
              <label className="mb-2 block px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language</label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code} type="button" onClick={() => setLang(l.code)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      lang === l.code ? "border-foreground bg-foreground text-background" : "border-border bg-background"
                    }`}
                  >
                    <span>{l.flag}</span><span className="truncate">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-black w-full disabled:opacity-60">
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleOAuth("apple")}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold"
          >
            <Apple className="h-5 w-5" /> Continue with Apple
          </button>
          <button
            onClick={() => handleOAuth("google")}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold"
          >
            <Chrome className="h-5 w-5" /> Continue with Google
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our <Link to="/auth" className="underline">Terms</Link> and <Link to="/auth" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
