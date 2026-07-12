import { useEffect, useState } from "react";
import { tauriApi } from "../lib/tauriApi";

interface ExternalImageProps {
  src: string;
  alt: string;
  className?: string;
}

/** Backlog #100 : logos/avatars VLR-esports renvoyés par Henrik viennent d'un CDN tiers dont
 * le domaine n'est ni documenté ni garanti stable (contrairement à
 * `media.valorant-api.com`, whitelisté dans `img-src`) — plutôt que d'étendre la CSP à un
 * domaine externe changeant, l'image est récupérée côté Rust (`fetch_external_image`) et
 * rendue en `data:` URI, déjà autorisée. Échec silencieux (réseau, contenu non-image) :
 * n'affiche rien plutôt que de casser l'écran, comme le `onError` qu'il remplace. */
export default function ExternalImage({ src, alt, className }: ExternalImageProps) {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUri(null);
    tauriApi
      .fetchExternalImage(src)
      .then((uri) => {
        if (!cancelled) setDataUri(uri);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!dataUri) return null;
  return <img src={dataUri} alt={alt} className={className} />;
}
