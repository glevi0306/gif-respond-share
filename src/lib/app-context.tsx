import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "./sec-data";

type Theme = "light" | "dark" | "system";

type AppCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Language;
  setLanguage: (l: Language) => void;
};

const Ctx = createContext<AppCtx | null>(null);

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (localStorage.getItem(key) as T | null) ?? fallback;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Read from localStorage synchronously so the first render has the correct value
  // and avoids the default → stored-value re-render flash.
  const [theme, setTheme] = useState<Theme>(() => readStorage<Theme>("sec.theme", "light"));
  const [language, setLanguage] = useState<Language>(() => readStorage<Language>("sec.lang", "en"));
  const isFirstThemeRender = useRef(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = (t: Theme) => {
      const isDark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply(theme);
    localStorage.setItem("sec.theme", theme);

    // Skip the transition animation on the very first mount — only animate
    // when the user manually switches themes to avoid slowing down first paint.
    if (isFirstThemeRender.current) {
      isFirstThemeRender.current = false;
      return;
    }
    root.classList.add("theme-transition");
    const timer = setTimeout(() => root.classList.remove("theme-transition"), 300);
    return () => clearTimeout(timer);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("sec.lang", language);
  }, [language]);

  return <Ctx.Provider value={{ theme, setTheme, language, setLanguage }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be inside AppProvider");
  return c;
}
