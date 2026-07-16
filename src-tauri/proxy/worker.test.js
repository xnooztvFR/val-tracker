// Tests de la logique pure du relais Cloudflare Worker (pas de test d'intégration Cloudflare
// runtime — Node suffit ici, `resolveTokenId`/`constantTimeEqual`/`isRateLimited` ne touchent
// que des objets JS simples). Lancer avec `node --test` (Node 18+, déjà un prérequis du
// projet — voir CLAUDE.md § Setup) depuis ce dossier.
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveTokenId, constantTimeEqual, isRateLimited, DEFAULT_RATE_LIMIT_PER_MINUTE } from "./worker.js";

test("constantTimeEqual matches identical strings and rejects different ones", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual("", ""), true);
});

test("resolveTokenId with PROXY_TOKENS resolves to the matching channel id", () => {
  const env = { PROXY_TOKENS: JSON.stringify({ discord: "tok-discord", website: "tok-website" }) };
  assert.equal(resolveTokenId("tok-discord", env), "discord");
  assert.equal(resolveTokenId("tok-website", env), "website");
  assert.equal(resolveTokenId("unknown-token", env), null);
});

test("resolveTokenId returns null on malformed PROXY_TOKENS JSON", () => {
  const env = { PROXY_TOKENS: "{not valid json" };
  assert.equal(resolveTokenId("anything", env), null);
});

test("resolveTokenId falls back to PROXY_TOKEN (legacy single-token mode)", () => {
  const env = { PROXY_TOKEN: "legacy-token" };
  assert.equal(resolveTokenId("legacy-token", env), "default");
  assert.equal(resolveTokenId("wrong-token", env), null);
});

test("resolveTokenId returns null when no token is provided", () => {
  assert.equal(resolveTokenId(null, { PROXY_TOKEN: "legacy-token" }), null);
  assert.equal(resolveTokenId("", { PROXY_TOKEN: "legacy-token" }), null);
});

test("resolveTokenId returns null when neither PROXY_TOKENS nor PROXY_TOKEN is configured", () => {
  assert.equal(resolveTokenId("anything", {}), null);
});

/** Mock KV minimal (Map en mémoire) imitant l'API `get`/`put` utilisée par `isRateLimited`. */
function fakeKvNamespace() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

test("isRateLimited allows requests under the configured limit", async () => {
  const env = { RATE_LIMIT: fakeKvNamespace(), RATE_LIMIT_PER_MINUTE: "3" };
  assert.equal(await isRateLimited(env, "token-a"), false);
  assert.equal(await isRateLimited(env, "token-a"), false);
  assert.equal(await isRateLimited(env, "token-a"), false);
});

test("isRateLimited blocks requests once the per-minute limit is reached", async () => {
  const env = { RATE_LIMIT: fakeKvNamespace(), RATE_LIMIT_PER_MINUTE: "2" };
  assert.equal(await isRateLimited(env, "token-b"), false);
  assert.equal(await isRateLimited(env, "token-b"), false);
  assert.equal(await isRateLimited(env, "token-b"), true);
});

test("isRateLimited tracks each token independently", async () => {
  const env = { RATE_LIMIT: fakeKvNamespace(), RATE_LIMIT_PER_MINUTE: "1" };
  assert.equal(await isRateLimited(env, "token-c"), false);
  assert.equal(await isRateLimited(env, "token-c"), true);
  // Un jeton différent démarre avec son propre compteur, non partagé.
  assert.equal(await isRateLimited(env, "token-d"), false);
});

test("isRateLimited falls back to the default limit when RATE_LIMIT_PER_MINUTE is unset", async () => {
  const env = { RATE_LIMIT: fakeKvNamespace() };
  for (let i = 0; i < DEFAULT_RATE_LIMIT_PER_MINUTE; i += 1) {
    assert.equal(await isRateLimited(env, "token-e"), false);
  }
  assert.equal(await isRateLimited(env, "token-e"), true);
});
