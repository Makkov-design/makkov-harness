// Sound effects from Openverse (https://api.openverse.org): free, no key needed.
// Anonymous use is rate limited (20 requests a minute, 200 a day). With a free registered
// app (OPENVERSE_CLIENT_ID + OPENVERSE_CLIENT_SECRET in the environment) searches carry a
// Bearer token and get the higher registered limits. Callers fall back to the bundled
// library when Openverse is unavailable.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OPENVERSE_AUDIO_URL = "https://api.openverse.org/v1/audio/";
const OPENVERSE_TOKEN_URL = "https://api.openverse.org/v1/auth_tokens/token/";
// The only licences media-use accepts: no NonCommercial, ShareAlike or NoDerivatives.
export const OPENVERSE_SFX_LICENSES = new Set(["cc0", "by"]);
const PLAYABLE_FILETYPES = new Set(["mp3", "wav", "ogg", "flac"]);
const MAX_SFX_MS = 15000;
const IDEAL_SFX_MS = 4000;
const BY_PENALTY = 2;
const SEARCH_TIMEOUT_MS = 10000;

// Openverse text lands in markdown and JSON: one line, no control or markdown-structure characters, bounded.
const oneLine = (text) =>
  String(text ?? "")
    .replace(/[\p{Cc}`[\]<>\\]+/gu, " ")
    .trim()
    .slice(0, 300);
// Openverse's audio providers (api.openverse.org/v1/audio/stats/); a new provider's link is dropped until listed.
const SOURCE_HOSTS = new Set(["freesound.org", "www.jamendo.com", "commons.wikimedia.org"]);
function httpsUrl(url, hosts) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (!hosts || hosts.has(parsed.hostname))
      ? oneLine(parsed.href)
      : "";
  } catch {
    return "";
  }
}

/** Openverse could not answer (offline, rate limited, server error): stop asking it this run. */
export class OpenverseUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "OpenverseUnavailableError";
  }
}

function usable(result) {
  return (
    OPENVERSE_SFX_LICENSES.has(result?.license) &&
    PLAYABLE_FILETYPES.has(result.filetype) &&
    typeof result.url === "string" &&
    result.url.startsWith("https://") &&
    Number.isFinite(result.duration) &&
    result.duration > 0 &&
    result.duration <= MAX_SFX_MS
  );
}

// Lower is better: relevance position, then seconds past a typical cue length, then CC0 over CC BY.
function penalty(result, position) {
  const longBy = Math.max(0, result.duration - IDEAL_SFX_MS) / 1000;
  return position + longBy + (result.license === "by" ? BY_PENALTY : 0);
}

/** Best usable sound in Openverse's relevance-ordered results, or null. */
export function pickOpenverseSfx(results) {
  let best = null;
  results.forEach((result, position) => {
    if (!usable(result)) return;
    const score = penalty(result, position);
    if (!best || score < best.score) best = { result, score };
  });
  if (!best) return null;
  const r = best.result;
  return {
    id: r.id,
    url: r.url,
    ext: `.${r.filetype}`,
    title: oneLine(r.title),
    creator: oneLine(r.creator),
    license: r.license,
    licenseUrl: httpsUrl(r.license_url),
    sourceUrl: httpsUrl(r.foreign_landing_url, SOURCE_HOSTS),
    credit: oneLine(r.attribution),
    durationS: Math.round(r.duration) / 1000,
  };
}

// Access token for a registered Openverse app, cached until a minute before it expires.
// The credentials only ever come from the environment and are never written anywhere.
let cachedToken = null;

/** Forget the cached token (tests, or after Openverse rejected it). */
export function resetOpenverseToken() {
  cachedToken = null;
}

/** Bearer token when OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET are set, else null (anonymous). */
export async function openverseToken({ fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
  const clientId = env.OPENVERSE_CLIENT_ID?.trim();
  const clientSecret = env.OPENVERSE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > now())
    return cachedToken.value;
  try {
    const response = await fetchImpl(OPENVERSE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (typeof body?.access_token !== "string" || !body.access_token) return null;
    const lifetimeS = Number.isFinite(body.expires_in) ? body.expires_in : 3600;
    cachedToken = {
      clientId,
      value: body.access_token,
      expiresAt: now() + Math.max(0, lifetimeS - 60) * 1000,
    };
    return cachedToken.value;
  } catch {
    // An unverified email, a typo or a network blip: search anonymously instead of failing.
    return null;
  }
}

/** Best licensed sound effect for `query`, null on no match; throws OpenverseUnavailableError. */
export async function searchOpenverseSfx(query, { fetchImpl = fetch, env = process.env } = {}) {
  const params = new URLSearchParams({
    q: query,
    page_size: "20",
    license: [...OPENVERSE_SFX_LICENSES].join(","),
  });
  const search = async (token) => {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetchImpl(`${OPENVERSE_AUDIO_URL}?${params}`, {
        headers,
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new OpenverseUnavailableError(`Openverse unreachable (${error.message})`);
    }
  };
  const token = await openverseToken({ fetchImpl, env });
  let response = await search(token);
  if (token && response.status === 401) {
    // Revoked or expired early: drop it and ask once more without a token.
    resetOpenverseToken();
    response = await search(null);
  }
  if (response.status === 429)
    throw new OpenverseUnavailableError("Openverse rate limit reached (HTTP 429)");
  if (!response.ok) throw new OpenverseUnavailableError(`Openverse HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new OpenverseUnavailableError("Openverse returned non-JSON");
  }
  return pickOpenverseSfx(Array.isArray(body?.results) ? body.results : []);
}

/** Record a CC BY sound's credit for `file` in the project's credits file (one line per file). */
export function writeSfxCredit(creditsPath, file, sound) {
  if (sound.license !== "by") return;
  // The sound may come from a saved record, not this run's pick: clean it again here.
  const sourceUrl = httpsUrl(sound.sourceUrl, SOURCE_HOSTS);
  const source = sourceUrl ? ` Source: ${sourceUrl}` : "";
  const line = `- \`${file}\`: ${oneLine(sound.credit)}${source}`;
  let prior = "";
  try {
    prior = readFileSync(creditsPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const kept = prior
    .split("\n")
    .filter((l) => l.startsWith("- ") && !l.startsWith(`- \`${file}\`:`));
  const header =
    "# Sound effect credits\n\nThese sounds are licensed CC BY: credit them wherever the video is published.\n\n";
  mkdirSync(dirname(creditsPath), { recursive: true });
  writeFileSync(creditsPath, `${header}${[...kept, line].join("\n")}\n`);
}
