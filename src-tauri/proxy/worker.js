/**
 * Relais Cloudflare Worker pour l'API Henrik Dev.
 *
 * But : permettre à l'app d'appeler Henrik sans embarquer la vraie clé API dans le binaire
 * distribué (voir src-tauri/src/api/henrik/client.rs::HenrikAuth et
 * src-tauri/.env.example). La clé Henrik vit UNIQUEMENT ici, comme secret Worker
 * (`wrangler secret put HENRIK_API_KEY`) — jamais dans le code, jamais dans un client.
 *
 * Le Worker n'accepte que des requêtes portant le bon jeton `X-Proxy-Token` (secret
 * `PROXY_TOKEN`, distinct de la clé Henrik — c'est LUI qui finit compilé dans le binaire de
 * l'app, via HENRIK_PROXY_TOKEN dans .env). Un jeton volé/extrait du binaire ne permet que
 * de consommer le quota Henrik via ce relais, jamais de récupérer la clé réelle.
 */
export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const token = request.headers.get("X-Proxy-Token");
    if (!token || token !== env.PROXY_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    // Whitelist de préfixe : n'autorise que les chemins de l'API Valorant Henrik, jamais un
    // chemin arbitraire (évite qu'un jeton volé serve à faire relayer autre chose que ce
    // pour quoi ce Worker existe).
    if (!url.pathname.startsWith("/valorant/")) {
      return new Response("Not found", { status: 404 });
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
