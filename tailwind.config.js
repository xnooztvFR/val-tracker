/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design system "HUD tactique" — graphite froid + accent (rouge par défaut).
        // Valeurs portées par des variables CSS (voir `:root`/`[data-theme]`/`[data-accent]`
        // dans `index.css`) pour permettre un thème clair (backlog #33) et un accent
        // personnalisable (backlog #38) sans toucher aux classes Tailwind existantes —
        // `bg-base`, `text-hi`, `border-line`... restent inchangées partout dans l'app.
        base: "rgb(var(--color-base) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        raised: "rgb(var(--color-raised) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          dim: "rgb(var(--color-accent-dim) / <alpha-value>)",
        },
        crit: {
          DEFAULT: "rgb(var(--color-crit) / <alpha-value>)",
          dim: "rgb(var(--color-crit-dim) / <alpha-value>)",
        },
        hi: "rgb(var(--color-hi) / <alpha-value>)", // texte haute emphase
        lo: "rgb(var(--color-lo) / <alpha-value>)", // texte basse emphase / labels
        // Couleurs de rang officielles — badge de rang uniquement, jamais en fond.
        rank: {
          iron: "#5c5c5c",
          bronze: "#8a5a35",
          silver: "#9fa6ad",
          gold: "#d4af37",
          platinum: "#3ba8a0",
          diamond: "#a672e0",
          ascendant: "#3ecf8e",
          immortal: "#c23b6c",
          radiant: "#f4e285",
        },
      },
      fontFamily: {
        display: ['"Chakra Petch"', "Inter", "sans-serif"],
        sans: ["Inter", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "Consolas", "monospace"],
      },
      letterSpacing: {
        hud: "0.08em",
      },
    },
  },
  plugins: [],
};
