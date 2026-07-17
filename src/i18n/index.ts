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
import frSharedImport from "./locales/fr/sharedImport.json";

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
import enSharedImport from "./locales/en/sharedImport.json";

import esComponentsCore from "./locales/es/componentsCore.json";
import esComponentsExtra from "./locales/es/componentsExtra.json";
import esSearch from "./locales/es/search.json";
import esHome from "./locales/es/home.json";
import esMatches from "./locales/es/matches.json";
import esStats from "./locales/es/stats.json";
import esCompetitive from "./locales/es/competitive.json";
import esEsports from "./locales/es/esports.json";
import esSettings from "./locales/es/settings.json";
import esOverlay from "./locales/es/overlay.json";
import esFormat from "./locales/es/format.json";
import esSharedImport from "./locales/es/sharedImport.json";

import ptBRComponentsCore from "./locales/pt-BR/componentsCore.json";
import ptBRComponentsExtra from "./locales/pt-BR/componentsExtra.json";
import ptBRSearch from "./locales/pt-BR/search.json";
import ptBRHome from "./locales/pt-BR/home.json";
import ptBRMatches from "./locales/pt-BR/matches.json";
import ptBRStats from "./locales/pt-BR/stats.json";
import ptBRCompetitive from "./locales/pt-BR/competitive.json";
import ptBREsports from "./locales/pt-BR/esports.json";
import ptBRSettings from "./locales/pt-BR/settings.json";
import ptBROverlay from "./locales/pt-BR/overlay.json";
import ptBRFormat from "./locales/pt-BR/format.json";
import ptBRSharedImport from "./locales/pt-BR/sharedImport.json";

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
    sharedImport: frSharedImport,
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
    sharedImport: enSharedImport,
  },
  es: {
    componentsCore: esComponentsCore,
    componentsExtra: esComponentsExtra,
    search: esSearch,
    home: esHome,
    matches: esMatches,
    stats: esStats,
    competitive: esCompetitive,
    esports: esEsports,
    settings: esSettings,
    overlay: esOverlay,
    format: esFormat,
    sharedImport: esSharedImport,
  },
  "pt-BR": {
    componentsCore: ptBRComponentsCore,
    componentsExtra: ptBRComponentsExtra,
    search: ptBRSearch,
    home: ptBRHome,
    matches: ptBRMatches,
    stats: ptBRStats,
    competitive: ptBRCompetitive,
    esports: ptBREsports,
    settings: ptBRSettings,
    overlay: ptBROverlay,
    format: ptBRFormat,
    sharedImport: ptBRSharedImport,
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
