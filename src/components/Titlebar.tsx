import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { useTranslation } from "react-i18next";

import { useUiStore } from "../store/uiStore";

const appWindow = getCurrentWindow();
const MINI_SIZE = new LogicalSize(340, 460);

/** Barre de titre custom (fenêtre sans decorations) : drag, mode mini/overlay, minimiser,
 * fermer. La navigation applicative (dont Paramètres) vit dans TopNav, pas ici. */
export default function Titlebar() {
  const { t } = useTranslation("componentsCore");
  const { compact, toggleCompact } = useUiStore();
  const previousSize = useRef<{ width: number; height: number } | null>(null);

  async function handleToggleCompact() {
    if (!compact) {
      const current = await appWindow.outerSize();
      const factor = await appWindow.scaleFactor();
      previousSize.current = { width: current.width / factor, height: current.height / factor };
      await appWindow.setSize(MINI_SIZE);
      await appWindow.setAlwaysOnTop(true);
    } else {
      await appWindow.setAlwaysOnTop(false);
      if (previousSize.current) {
        await appWindow.setSize(new LogicalSize(previousSize.current.width, previousSize.current.height));
      }
    }
    toggleCompact();
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-line bg-base px-3"
    >
      <span
        data-tauri-drag-region
        className="hud-label pointer-events-none text-[10px] text-lo/70"
      >
        VAL // TRACKER
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={handleToggleCompact}
          aria-label={compact ? t("titlebar.exitMiniMode") : t("titlebar.miniMode")}
          title={compact ? t("titlebar.exitMiniMode") : t("titlebar.miniMode")}
          className={`flex h-7 w-8 items-center justify-center transition-colors ${
            compact ? "text-accent" : "text-lo hover:bg-raised hover:text-hi"
          }`}
        >
          <CompactIcon />
        </button>
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          aria-label={t("titlebar.minimize")}
          className="flex h-7 w-8 items-center justify-center text-lo transition-colors hover:bg-raised hover:text-hi"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          aria-label={t("titlebar.close")}
          className="flex h-7 w-8 items-center justify-center text-lo transition-colors hover:bg-crit hover:text-base"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}

function CompactIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M8 3H3v5M12 17h5v-5M3 3l6 6M17 17l-6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
      <path
        d="M1 1l10 10M11 1L1 11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
