import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Apple, Chrome } from "lucide-react";
import { LANGUAGES, type Language } from "../lib/sec-data";
import { useApp } from "../lib/app-context";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Sec." }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [lang, setLang] = useState<Language>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setLanguage } = useApp();
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") setLanguage(lang);
    navigate({ to: "/home" });
  };

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
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-2 transition ${mode === "login" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
          >Log in</button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-2 transition ${mode === "signup" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
          >Sign up</button>
        </div>

        <form onSubmit={submit} className="space-y-3 animate-pop-in">
          <input
            type="email" placeholder="Email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm outline-none focus:border-foreground"
          />
          <input
            type="password" placeholder="Password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm outline-none focus:border-foreground"
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

          <button type="submit" className="btn-black w-full">
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2">
          <button className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold">
            <Apple className="h-5 w-5" /> Continue with Apple
          </button>
          <button className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold">
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
