/**
 * Relais Cloudflare Worker pour l'API Henrik Dev.
 *
 * But : permettre à l'app d'appeler Henrik sans embarquer la vraie clé API dans le binaire
 * distribué (voir src-tauri/src/api/henrik/client.rs::HenrikAuth et
 * src-tauri/.env.example). La clé Henrik vit UNIQUEMENT ici, comme secret Worker
 * (`wrangler secret put HENRIK_API_KEY`) — jamais dans le code, jamais dans un client.
 *
 * Le Worker n'accepte que des requêtes portant un jeton `X-Proxy-Token` connu. Deux modes
 * (voir `resolveTokenId`) : un jeton par canal de distribution (secret JSON `PROXY_TOKENS`,
 * recommandé — permet de révoquer un seul jeton compromis sans casser les autres) ou, en
 * rétrocompatibilité, un jeton global unique (`PROXY_TOKEN`). Un jeton volé/extrait du
 * binaire ne permet que de consommer le quota Henrik via ce relais, jamais de récupérer la
 * clé réelle — et avec `PROXY_TOKENS` + le rate limiting par jeton ci-dessous (backlog #98),
 * l'impact d'une fuite reste borné au quota du jeton compromis, pas au quota global.
 */
export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const token = request.headers.get("X-Proxy-Token");
    const tokenId = resolveTokenId(token, env);
    if (!tokenId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    // Whitelist de préfixe : n'autorise que les chemins de l'API Valorant Henrik, jamais un
    // chemin arbitraire (évite qu'un jeton volé serve à faire relayer autre chose que ce
    // pour quoi ce Worker existe).
    if (!url.pathname.startsWith("/valorant/")) {
      return new Response("Not found", { status: 404 });
    }

    // Rate limiting par jeton (backlog #98) : best-effort, désactivé si le binding KV
    // `RATE_LIMIT` n'est pas configuré (voir README.md § Rate limiting) pour ne pas casser
    // un déploiement existant qui n'a pas encore créé le namespace KV.
    if (env.RATE_LIMIT) {
      const limited = await isRateLimited(env, tokenId);
      if (limited) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "retry-after": "60" },
        });
      }
    }

    const target = `https://api.henrikdev.xyz${url.pathname}${url.search}`;

    const henrikResponse = await fetch(target, {
      method: "GET",
      headers: {
        Authorization: env.HENRIK_API_KEY,
        "User-Agent": "val-tracker-proxy/1.0",
      },
    });

    // Ne transmet que les en-têtes dont l'app cliente a besoin (content-type pour le JSON/
    // PNG du crosshair, retry-after pour le respect du rate limit Henrik) — pas question de
    // faire fuiter d'éventuels en-têtes internes de la réponse Henrik.
    const headers = new Headers();
    const contentType = henrikResponse.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const retryAfter = henrikResponse.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);

    return new Response(henrikResponse.body, {
      status: henrikResponse.status,
      headers,
    });
  },
};

/**
 * Résout le jeton reçu vers un identifiant stable utilisé comme clé de rate limiting.
 * - Mode recommandé : secret `PROXY_TOKENS`, JSON `{"nom-canal": "jeton", ...}` — un jeton
 *   par canal de distribution, révocable individuellement (voir README.md § Rotation).
 * - Rétrocompatibilité : secret `PROXY_TOKEN` unique — tous les binaires distribués
 *   partagent alors le même compteur de rate limiting ("default"), comme avant le #98.
 */
function resolveTokenId(token, env) {
  if (!token) return null;

  if (env.PROXY_TOKENS) {
    let tokens;
    try {
      tokens = JSON.parse(env.PROXY_TOKENS);
    } catch {
      return null;
    }
    for (const [id, value] of Object.entries(tokens)) {
      if (constantTimeEqual(value, token)) return id;
    }
    return null;
  }

  if (env.PROXY_TOKEN && constantTimeEqual(env.PROXY_TOKEN, token)) return "default";
  return null;
}

/**
 * Comparaison à temps constant de deux chaînes, même esprit que
 * `settings.rs::constant_time_eq` côté Rust (XOR-accumulate sur toute la longueur, sans
 * retour anticipé sur une différence de longueur pour ne pas fuiter la longueur exacte via
 * le timing).
 */
function constantTimeEqual(a, b) {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  let diff = bytesA.length ^ bytesB.length;
  const maxLength = Math.max(bytesA.length, bytesB.length);
  for (let i = 0; i < maxLength; i += 1) {
    const byteA = i < bytesA.length ? bytesA[i] : 0;
    const byteB = i < bytesB.length ? bytesB[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;

/**
 * Fenêtre glissante approximative (fenêtre fixe d'une minute) par jeton, stockée en KV avec
 * `expirationTtl` pour l'auto-nettoyage. Lecture puis écriture non atomiques : sous forte
 * concurrence sur le même jeton, quelques requêtes en plus du seuil peuvent passer — un
 * compromis acceptable ici (le but est de borner l'impact d'un jeton fuité au fil des
 * minutes, pas un rate limit exact), qui évite la complexité/coût d'un Durable Object.
 */
async function isRateLimited(env, tokenId) {
  const limit = Number(env.RATE_LIMIT_PER_MINUTE) || DEFAULT_RATE_LIMIT_PER_MINUTE;
  const window = Math.floor(Date.now() / 60000);
  const key = `rl:${tokenId}:${window}`;

  const current = Number(await env.RATE_LIMIT.get(key)) || 0;
  if (current >= limit) return true;

  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}
