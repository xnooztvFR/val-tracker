// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../i18n";
import AccountSwitcher from "./AccountSwitcher";
import type { TrackedPlayer } from "../lib/tauriApi";

let accounts: TrackedPlayer[] = [];
const refresh = vi.fn().mockResolvedValue(undefined);
const setSelf = vi.fn().mockResolvedValue(undefined);

vi.mock("../store/selfAccountsStore", () => ({
  useSelfAccountsStore: () => ({ accounts, refresh, setSelf }),
}));

const detectLocalAccount = vi.fn().mockResolvedValue(null);
const fetchAccount = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    detectLocalAccount: (...args: unknown[]) => detectLocalAccount(...args),
    fetchAccount: (...args: unknown[]) => fetchAccount(...args),
  },
}));

function renderSwitcher(current?: { puuid: string; region: string; name: string; tag: string }) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AccountSwitcher current={current} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Backlog #57 (multi-comptes) : le sélecteur de comptes "à soi" est le point d'entrée
// pour switcher entre main/smurfs — s'assure que le panneau s'ouvre, affiche le bon état
// vide, et propose de marquer le profil courant comme sien.
describe("AccountSwitcher", () => {
  beforeEach(() => {
    accounts = [];
    refresh.mockClear();
    setSelf.mockClear();
    detectLocalAccount.mockClear();
    fetchAccount.mockClear();
  });

  it("shows the empty state when no account is linked yet", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "Mes comptes" }));

    expect(
      screen.getByText(
        "Aucun compte lié. Marque un profil comme le tien ci-dessous, ou lie le compte détecté si le client Riot est ouvert.",
      ),
    ).toBeInTheDocument();
  });

  it("offers to mark the current profile as mine when it isn't linked yet", async () => {
    const user = userEvent.setup();
    renderSwitcher({ puuid: "p1", region: "eu", name: "Player", tag: "1234" });

    await user.click(screen.getByRole("button", { name: "Mes comptes" }));
    await user.click(screen.getByText("Marquer Player#1234 comme mon compte"));

    expect(setSelf).toHaveBeenCalledWith("p1", true);
  });

  it("lists already-linked accounts", async () => {
    accounts = [
      { puuid: "p1", region: "eu", name: "Player", tag: "1234" } as TrackedPlayer,
    ];
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "Mes comptes" }));

    expect(screen.getByText("Player")).toBeInTheDocument();
    expect(screen.getByText("#1234")).toBeInTheDocument();
  });
});
