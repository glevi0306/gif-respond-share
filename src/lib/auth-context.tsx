import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  username: string;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  language: string;
};

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authReady: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_emoji, avatar_url, bio, language")
    .eq("id", userId)
    .single();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Safety net: if the token refresh or network hangs on cold start, release
    // the loading gate after 5 s so the route guard can redirect to /auth
    // instead of leaving the user on an infinite spinner.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    let cancelled = false;

    // Use onAuthStateChange exclusively (fires INITIAL_SESSION on startup after
    // the client has fully resolved storage + any pending token refresh).
    // Calling getSession() separately races with INITIAL_SESSION on PWA/Safari
    // cold starts: getSession() can briefly return null before the stored
    // session is hydrated, which triggers a spurious redirect to /auth.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setProfile(null);
        setAuthReady(false);
        setLoading(false);
        return;
      }
      // Release the loading gate immediately so the route guard can run.
      setLoading(false);
      // authReady = true only when the token is confirmed fresh.
      // INITIAL_SESSION with an expired token is the one case where we hold
      // authReady=false until TOKEN_REFRESHED fires — this prevents protected
      // queries from running with an expired token and caching empty results
      // (Supabase RLS returns 200+empty rows, not 401, for expired tokens).
      const nowSec = Math.floor(Date.now() / 1000);
      const tokenFresh =
        _event !== "INITIAL_SESSION" || session.expires_at == null || session.expires_at > nowSec;
      setAuthReady(tokenFresh);
      // Only load the profile once the token is confirmed fresh; TOKEN_REFRESHED
      // will re-enter this handler and load it if the first event was stale.
      if (tokenFresh) {
        try {
          const p = await loadProfile(session.user.id);
          if (!cancelled) setProfile(p);
        } catch {
          // ignore
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    try {
      const p = await loadProfile(user.id);
      setProfile(p);
    } catch {
      // ignore
    }
  }, [user]);

  return (
    <Ctx.Provider value={{ session, user, profile, loading, authReady, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
