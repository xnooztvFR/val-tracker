import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import frComponentsCore from "./locales/fr/componentsCore.json";
import frComponentsExtra from "./locales/fr/componentsExtra.json";
import frSearch from "./locales/fr/search.json";
import frHome from "./locales/fr/home.json";
import frMatches from "./locales/fr/matches.json";
import frStats from "./locales/fr/stats.json";
import frCompetitive from "./locales/fr/competitive.json";
import frEsports from "./locales/fr/esports.json";
import frSettings from "./locales/fr/settings.json";
import frOverlay from "./locales/fr/overlay.json";
import frFormat from "./locales/fr/format.json";

import enComponentsCore from "./locales/en/componentsCore.json";
import enComponentsExtra from "./locales/en/componentsExtra.json";
import enSearch from "./locales/en/search.json";
import enHome from "./locales/en/home.json";
import enMatches from "./locales/en/matches.json";
import enStats from "./locales/en/stats.json";
import enCompetitive from "./locales/en/competitive.json";
import enEsports from "./locales/en/esports.json";
import enSettings from "./locales/en/settings.json";
import enOverlay from "./locales/en/overlay.json";
import enFormat from "./locales/en/format.json";

export const defaultNS = "componentsCore";

// Chaque écran/composant a son propre namespace (voir CLAUDE.md pas de mention, convention
// interne) pour permettre l'extraction du texte FR en parallèle sans que plusieurs sessions
// n'éditent le même fichier JSON.
export const resources = {
  fr: {
    componentsCore: frComponentsCore,
    componentsExtra: frComponentsExtra,
    search: frSearch,
    home: frHome,
    matches: frMatches,
    stats: frStats,
    competitive: frCompetitive,
    esports: frEsports,
    settings: frSettings,
    overlay: frOverlay,
    format: frFormat,
  },
  en: {
    componentsCore: enComponentsCore,
    componentsExtra: enComponentsExtra,
    search: enSearch,
    home: enHome,
    matches: enMatches,
    stats: enStats,
    competitive: enCompetitive,
    esports: enEsports,
    settings: enSettings,
    overlay: enOverlay,
    format: enFormat,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "fr",
  fallbackLng: "fr",
  defaultNS,
  ns: Object.keys(resources.fr),
  interpolation: {
    escapeValue: false, // React échappe déjà le JSX, pas besoin d'un double échappement.
  },
  returnNull: false,
});

export default i18n;
