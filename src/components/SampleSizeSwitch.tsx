export const SAMPLE_SIZES = [20, 50, 100] as const;
export type SampleSize = (typeof SAMPLE_SIZES)[number];

/** Sélecteur segmenté "20 / 50 / 100 derniers matchs" partagé par Accueil, Tendances,
 * Agents et Cartes. */
export default function SampleSizeSwitch({
  value,
  onChange,
}: {
  value: SampleSize;
  onChange: (size: SampleSize) => void;
}) {
  return (
    <div className="flex border border-line">
      {SAMPLE_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onChange(size)}
          className={`px-3 py-1 font-display text-xs font-semibold uppercase tracking-hud transition-colors ${
            value === size ? "bg-accent text-base" : "text-lo hover:bg-raised hover:text-hi"
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}
