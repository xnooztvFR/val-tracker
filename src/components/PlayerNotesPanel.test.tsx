// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import "../i18n";
import PlayerNotesPanel from "./PlayerNotesPanel";

let notesPinEnabled = true;
vi.mock("../store/settingsStore", () => ({
  useSettingsStore: (selector: (s: { settings: { notes_pin_enabled: boolean } }) => unknown) =>
    selector({ settings: { notes_pin_enabled: notesPinEnabled } }),
}));

const verifyNotesPin = vi.fn();

vi.mock("../lib/tauriApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tauriApi")>();
  return {
    ...actual,
    tauriApi: {
      ...actual.tauriApi,
      verifyNotesPin: (...args: unknown[]) => verifyNotesPin(...args),
      savePlayerNotes: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Backlog #99 : le contenu des notes perso reste masqué derrière un écran PIN tant que
// l'utilisateur ne l'a pas déverrouillé — s'assure que cette porte se comporte bien dans
// les 3 cas (verrouillé, PIN correct, PIN incorrect) puisque c'est un flux de
// confidentialité, pas juste une préférence d'affichage.
describe("PlayerNotesPanel — PIN unlock", () => {
  beforeEach(() => {
    notesPinEnabled = true;
    verifyNotesPin.mockReset();
  });

  it("hides the notes behind a PIN prompt when notes_pin_enabled is true", () => {
    render(<PlayerNotesPanel puuid="abc" initialNotes="secret note" />);

    expect(screen.getByText("Verrouillé")).toBeInTheDocument();
    expect(screen.queryByText("secret note")).not.toBeInTheDocument();
  });

  it("unlocks and reveals the notes on a correct PIN", async () => {
    verifyNotesPin.mockResolvedValue(true);
    const user = userEvent.setup();

    render(<PlayerNotesPanel puuid="abc" initialNotes="secret note" />);

    await user.type(screen.getByPlaceholderText("PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.queryByText("Verrouillé")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("secret note")).toBeInTheDocument();
  });

  it("shows an error and stays locked on an incorrect PIN", async () => {
    verifyNotesPin.mockResolvedValue(false);
    const user = userEvent.setup();

    render(<PlayerNotesPanel puuid="abc" initialNotes="secret note" />);

    await user.type(screen.getByPlaceholderText("PIN"), "0000");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));

    expect(await screen.findByText("PIN incorrect.")).toBeInTheDocument();
    expect(screen.getByText("Verrouillé")).toBeInTheDocument();
  });

  it("skips the PIN prompt entirely when notes_pin_enabled is false", () => {
    notesPinEnabled = false;
    render(<PlayerNotesPanel puuid="abc" initialNotes="secret note" />);

    expect(screen.queryByText("Verrouillé")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("secret note")).toBeInTheDocument();
  });
});
