import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openverseToken, resetOpenverseToken, searchOpenverseSfx } from "./openverse.mjs";

// No real network and no real credentials: placeholders and a stand-in fetch.
const CREDS = { OPENVERSE_CLIENT_ID: "test-id", OPENVERSE_CLIENT_SECRET: "test-placeholder" };
const result = {
  id: "a1",
  title: "Pop",
  creator: "Ana",
  license: "cc0",
  url: "https://cdn.freesound.test/pop.mp3",
  filetype: "mp3",
  duration: 400,
  attribution: "Pop by Ana",
};

function stub({ token = { access_token: "tok-1", expires_in: 3600 }, tokenStatus = 200, search } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth_tokens/token/"))
      return tokenStatus === 200 ? Response.json(token) : new Response("no", { status: tokenStatus });
    return search ? search(init) : Response.json({ results: [result] });
  };
  return { calls, fetchImpl };
}
const searches = (calls) => calls.filter((c) => c.url.includes("/v1/audio/"));
const auth = (call) => call.init.headers?.Authorization;

beforeEach(() => resetOpenverseToken());

test("no credentials: searches anonymously and never asks for a token", async () => {
  const { calls, fetchImpl } = stub();
  const sound = await searchOpenverseSfx("pop", { fetchImpl, env: {} });
  assert.equal(sound.id, "a1");
  assert.equal(calls.length, 1);
  assert.equal(auth(calls[0]), undefined);
});

test("credentials: exchanges them once for a token and sends it as Bearer", async () => {
  const { calls, fetchImpl } = stub();
  await searchOpenverseSfx("pop", { fetchImpl, env: CREDS });
  await searchOpenverseSfx("click", { fetchImpl, env: CREDS });
  const tokenCalls = calls.filter((c) => c.url.includes("/auth_tokens/token/"));
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].init.method, "POST");
  const form = new URLSearchParams(tokenCalls[0].init.body);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("client_id"), "test-id");
  assert.deepEqual(searches(calls).map(auth), ["Bearer tok-1", "Bearer tok-1"]);
});

test("an expired cached token is fetched again", async () => {
  const { calls, fetchImpl } = stub({ token: { access_token: "tok-1", expires_in: 120 } });
  let clock = 0;
  const now = () => clock;
  await openverseToken({ fetchImpl, env: CREDS, now });
  clock = 61_000; // past expires_in minus the 60 s margin
  await openverseToken({ fetchImpl, env: CREDS, now });
  assert.equal(calls.filter((c) => c.url.includes("/auth_tokens/token/")).length, 2);
});

test("a rejected token request falls back to anonymous search", async () => {
  const { calls, fetchImpl } = stub({ tokenStatus: 401 });
  const sound = await searchOpenverseSfx("pop", { fetchImpl, env: CREDS });
  assert.equal(sound.id, "a1");
  assert.deepEqual(searches(calls).map(auth), [undefined]);
});

test("a search that rejects the token is retried once without it", async () => {
  const { calls, fetchImpl } = stub({
    search: (init) =>
      init.headers?.Authorization
        ? new Response("bad token", { status: 401 })
        : Response.json({ results: [result] }),
  });
  const sound = await searchOpenverseSfx("pop", { fetchImpl, env: CREDS });
  assert.equal(sound.id, "a1");
  assert.deepEqual(searches(calls).map(auth), ["Bearer tok-1", undefined]);
});

test("a refused key pair is not retried on every search", async () => {
  const { calls, fetchImpl } = stub({ tokenStatus: 401 });
  await searchOpenverseSfx("pop", { fetchImpl, env: CREDS });
  await searchOpenverseSfx("click", { fetchImpl, env: CREDS });
  assert.equal(calls.filter((c) => c.url.includes("/auth_tokens/token/")).length, 1);
  assert.deepEqual(searches(calls).map(auth), [undefined, undefined]);
});

test("a token rejected by search is not reused on the next search", async () => {
  const { calls, fetchImpl } = stub({
    search: (init) =>
      init.headers?.Authorization
        ? new Response("bad token", { status: 401 })
        : Response.json({ results: [result] }),
  });
  await searchOpenverseSfx("pop", { fetchImpl, env: CREDS });
  await searchOpenverseSfx("click", { fetchImpl, env: CREDS });
  assert.deepEqual(searches(calls).map(auth), ["Bearer tok-1", undefined, undefined]);
});
