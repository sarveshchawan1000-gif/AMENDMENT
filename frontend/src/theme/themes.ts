export type ThemeId = "modern" | "kingdom" | "brushwork";

export interface Labels {
  ledger: string;
  leaderboard: string;
  amendTitle: string;
  amendSubmit: string;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: [string, string, string]; // shown in the picker
  supportsMode: boolean; // light/dark toggle
  labels: Labels; // theme-flavoured UI wording
}

export const DEFAULT_THEME: ThemeId = "modern";

export const THEMES: Record<ThemeId, ThemeDef> = {
  modern: {
    id: "modern",
    name: "Modern",
    tagline: "Clean, high-contrast, calm",
    swatch: ["#FFFFFF", "#2F5BFF", "#0F172A"],
    supportsMode: true,
    labels: {
      ledger: "Rule ledger",
      leaderboard: "Leaderboard",
      amendTitle: "Propose a rule",
      amendSubmit: "Submit rule",
    },
  },
  kingdom: {
    id: "kingdom",
    name: "Kingdom",
    tagline: "Parchment, crimson and gold",
    swatch: ["#E7D8B4", "#8C1C2B", "#B8902F"],
    supportsMode: false,
    labels: {
      ledger: "Royal decrees",
      leaderboard: "Standings of the realm",
      amendTitle: "Propose a decree",
      amendSubmit: "Submit decree",
    },
  },
  brushwork: {
    id: "brushwork",
    name: "Classical Ink",
    tagline: "Classical brushwork & high-performance UI",
    swatch: ["#F4EFEB", "#BD3A2B", "#2E624D"],
    supportsMode: true,
    labels: {
      ledger: "Scroll of Ordinances",
      leaderboard: "Hall of Scribes",
      amendTitle: "Inscribe an Ordinance",
      amendSubmit: "Inscribe & Seal",
    },
  },
};
