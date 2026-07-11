/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design system "HUD tactique" — graphite froid + cyan radar.
        base: "#0B0E11", // fond app
        surface: "#12161B", // panels / cards
        raised: "#171C22", // surface élevée (hover, modals)
        line: "#22282F", // hairlines / bordures
        accent: {
          DEFAULT: "#7CE8D3", // cyan tactique — interactif / positif
          dim: "#4DA695",
        },
        crit: {
          DEFAULT: "#FF5F5F", // signaux négatifs uniquement (défaites, deaths, alertes)
          dim: "#B24444",
        },
        hi: "#E8ECEF", // texte haute emphase
        lo: "#7A8590", // texte basse emphase / labels
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
