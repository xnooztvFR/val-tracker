// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import "../i18n";
import OnboardingWizard from "./OnboardingWizard";

const setApiKey = vi.fn().mockResolvedValue(undefined);
const setDefaultRegion = vi.fn().mockResolvedValue(undefined);

vi.mock("../store/settingsStore", () => ({
  useSettingsStore: () => ({ setApiKey, setDefaultRegion }),
}));

const verifyHenrikApiKey = vi.fn();
const detectLocalAccount = vi.fn().mockResolvedValue(null);

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    verifyHenrikApiKey: (...args: unknown[]) => verifyHenrikApiKey(...args),
    detectLocalAccount: (...args: unknown[]) => detectLocalAccount(...args),
  },
}));

// Régression backlog (fix 2026-07-13) : le wizard n'était affiché que si `settings.
// onboarding_completed` était `false` — s'assure que la progression complète des 3 étapes
// (le seul chemin qui appelle `onFinish`) fonctionne toujours de bout en bout.
describe("OnboardingWizard", () => {
  beforeEach(() => {
    setApiKey.mockClear();
    setDefaultRegion.mockClear();
    verifyHenrikApiKey.mockReset();
    detectLocalAccount.mockClear();
  });

  it("walks through all 3 steps and calls onFinish", async () => {
    verifyHenrikApiKey.mockResolvedValue(true);
    const onFinish = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard apiKeyAlreadySet={false} onFinish={onFinish} />);

    expect(screen.getByText("1. Clé API Henrik")).toBeInTheDocument();

    const input = document.querySelector('input[type="password"]');
    expect(input).not.toBeNull();
    await user.type(input as Element, "test-api-key");
    await user.click(screen.getByRole("button", { name: "Vérifier et enregistrer" }));

    await waitFor(() => expect(setApiKey).toHaveBeenCalledWith("test-api-key"));
    await user.click(screen.getByRole("button", { name: "Suivant" }));

    expect(screen.getByText("2. Région par défaut")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Suivant" }));

    await waitFor(() => expect(setDefaultRegion).toHaveBeenCalled());
    expect(screen.getByText("3. Détection automatique de partie")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Terminé" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows an error and does not advance when the API key is invalid", async () => {
    verifyHenrikApiKey.mockResolvedValue(false);
    const user = userEvent.setup();

    render(<OnboardingWizard apiKeyAlreadySet={false} onFinish={vi.fn()} />);

    const input = document.querySelector('input[type="password"]');
    await user.type(input as Element, "wrong-key");
    await user.click(screen.getByRole("button", { name: "Vérifier et enregistrer" }));

    expect(await screen.findByText("Clé invalide.")).toBeInTheDocument();
    expect(setApiKey).not.toHaveBeenCalled();
    expect(screen.getByText("1. Clé API Henrik")).toBeInTheDocument();
  });

  it("lets the user skip step 1 when a proxy access is already compiled in", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard apiKeyAlreadySet onFinish={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Passer" }));
    expect(screen.getByText("2. Région par défaut")).toBeInTheDocument();
  });
});
