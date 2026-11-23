// Pure helpers for the pin cross-checks in check.mjs (section 8). No file or network access; tested in pins.test.mjs.

// Two spellings of a commit agree when the shorter is a prefix of the longer: in full when both are 40 characters.
// Shorter than 7 never agrees, so an empty or truncated value fails closed.
export const sameCommit = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const n = Math.min(a.length, b.length);
  return n >= 7 && a.slice(0, n) === b.slice(0, n);
};

export const isFullSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

// Every commit-looking token on a line that names `repo` must be a well-formed spelling of `sha`: lowercase hex,
// 7 to 40 characters, agreeing with it. Uppercase and over-long runs are caught, not skipped.
export function namedCommitErrors(line, repo, sha) {
  if (!line.includes(repo)) return [];
  const errors = [];
  for (const tok of line.match(/\b[0-9a-f]{7,}\b/gi) || []) {
    if (!/^[0-9a-f]+$/.test(tok)) errors.push(`names ${repo} at ${tok}: a commit is written in lowercase hex`);
    else if (tok.length > 40) errors.push(`names ${repo} at ${tok}: ${tok.length} characters, a commit has at most 40`);
    else if (!sameCommit(tok, sha)) errors.push(`names ${repo} at ${tok}, the pin is ${sha}`);
  }
  return errors;
}

// The companions' full commits in marketplace.json against docs/security-data.js (entries matched by id = plugin
// name). SECURITY.md holds only short commits, so this is where a changed tail is caught.
export function sitePinErrors(plugins, entries) {
  const errors = [];
  const byId = new Map((entries || []).map((e) => [e.id, e]));
  for (const p of plugins || []) {
    if (typeof p.source !== "object") continue;
    const sha = p.source.sha;
    if (!isFullSha(sha)) { errors.push(`marketplace.json: ${p.name} pins "${sha ?? ""}", not a full lowercase 40-character commit`); continue; }
    const e = byId.get(p.name);
    if (!e) { errors.push(`docs/security-data.js has no entry with id "${p.name}" (marketplace.json pins it)`); continue; }
    if (e.sha !== sha) errors.push(`docs/security-data.js: ${p.name} sha is ${e.sha}, marketplace.json pins ${sha}`);
    if (!sameCommit(e.commit || "", sha) || (e.commit || "").length !== 7) errors.push(`docs/security-data.js: ${p.name} commit is "${e.commit}", marketplace.json pins ${sha.slice(0, 7)}`);
    const ref = p.source.ref ?? null;
    if ((e.ref ?? null) !== ref) errors.push(`docs/security-data.js: ${p.name} ref is ${e.ref ?? null}, marketplace.json says ${ref}`);
  }
  return errors;
}

// The vendored sources in .github/upstream-watch.json against docs/security-data.js (matched by repo): a full sha
// on the site must equal the watched one, and a short commit must agree with it.
export function siteVendoredErrors(vendored, entries) {
  const errors = [];
  for (const v of vendored || []) {
    for (const e of (entries || []).filter((x) => x.repo === v.repo)) {
      if (e.sha != null && (isFullSha(v.sha) ? e.sha !== v.sha : !sameCommit(e.sha, v.sha))) errors.push(`docs/security-data.js: ${e.id} sha is ${e.sha}, .github/upstream-watch.json says ${v.sha}`);
      if (e.commit != null && !sameCommit(e.commit, v.sha)) errors.push(`docs/security-data.js: ${e.id} commit is ${e.commit}, .github/upstream-watch.json says ${v.sha}`);
    }
  }
  return errors;
}
