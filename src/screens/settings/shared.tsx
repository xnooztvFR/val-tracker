import type { ReactNode } from "react";

/** Classes partagées par les champs texte/select de tous les panneaux de Paramètres. */
export const INPUT_CLASS =
  "border border-line bg-surface px-3 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{children}</h1>;
}
