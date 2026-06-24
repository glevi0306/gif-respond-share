import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Language } from "./sec-data";

type Theme = "light" | "dark" | "system";

type AppCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Language;
  setLanguage: (l: Language) => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("sec.theme")) as Theme | null;
    const savedLang = (typeof window !== "undefined" && localStorage.getItem("sec.lang")) as Language | null;
    if (saved) setTheme(saved);
    if (savedLang) setLanguage(savedLang);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = (t: Theme) => {
      const isDark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply(theme);
    localStorage.setItem("sec.theme", theme);
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
