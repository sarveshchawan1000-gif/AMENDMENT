import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, THEMES, type ThemeDef, type ThemeId } from "./themes";
import "./themes.css";

// Fonts are bundled locally (no internet needed), matching the offline-first PRD.
// npm i @fontsource/plus-jakarta-sans @fontsource/cinzel @fontsource/eb-garamond @fontsource/orbitron @fontsource/chakra-petch
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/orbitron/600.css";
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/600.css";

type Mode = "light" | "dark";

interface ThemeCtx {
  theme: ThemeDef;
  mode: Mode;
  setTheme: (id: ThemeId) => void;
  setMode: (m: Mode) => void;
}

const THEME_KEY = "amendment.theme";
const MODE_KEY = "amendment.mode";
const Ctx = createContext<ThemeCtx | null>(null);

function read<T extends string>(key: string, fallback: T, valid: (v: string) => boolean): T {
  try {
    const v = localStorage.getItem(key);
    if (v && valid(v)) return v as T;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === "neon") return "brushwork";
      if (v && v in THEMES) return v as ThemeId;
    } catch {
      /* ignore */
    }
    return DEFAULT_THEME;
  });
  const [mode, setMode] = useState<Mode>(() =>
    read(MODE_KEY, "light" as Mode, (v) => v === "light" || v === "dark"),
  );

  const theme = THEMES[themeId];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeId;
    root.dataset.mode = theme.supportsMode ? mode : "";
    try {
      localStorage.setItem(THEME_KEY, themeId);
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [themeId, mode, theme.supportsMode]);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, mode, setTheme: setThemeId, setMode }),
    [theme, mode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside <ThemeProvider>");
  return c;
}
