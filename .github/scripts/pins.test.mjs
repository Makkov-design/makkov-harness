import assert from "node:assert/strict";
import test from "node:test";
import { sameCommit, isFullSha, namedCommitErrors, sitePinErrors, siteVendoredErrors } from "./pins.mjs";

const A = "6c2120103600407a1a9986afd834e73144ef8998";
const B = "6c2120103600407a1a9986afd834e73144ef8999"; // same first 39 characters
const REPO = "VoltAgent/awesome-design-md";

test("sameCommit compares in full when both are 40 characters", () => {
  assert.equal(sameCommit(A, A), true);
  assert.equal(sameCommit(A, B), false);
  assert.equal(sameCommit("6c21201", A), true);
  assert.equal(sameCommit(A, "6c21201"), true);
  assert.equal(sameCommit("6c21202", A), false);
});

test("sameCommit fails closed on short or missing values", () => {
  for (const s of ["", "6", "6c2120", undefined, null]) {
    assert.equal(sameCommit(s, A), false, String(s));
    assert.equal(sameCommit(A, s), false, String(s));
  }
});

test("isFullSha accepts only 40 lowercase hex characters", () => {
  assert.equal(isFullSha(A), true);
  assert.equal(isFullSha(A.toUpperCase()), false);
  assert.equal(isFullSha(A.slice(0, 39)), false);
  assert.equal(isFullSha(A + "0"), false);
  assert.equal(isFullSha(undefined), false);
});

test("namedCommitErrors: a matching URL passes, other repositories are ignored", () => {
  assert.deepEqual(namedCommitErrors(`https://raw.githubusercontent.com/${REPO}/${A}/design-md/x/DESIGN.md`, REPO, A), []);
  assert.deepEqual(namedCommitErrors(`${REPO} at \`6c21201\``, REPO, A), []);
  assert.deepEqual(namedCommitErrors(`other/repo at ${B}`, REPO, A), []);
});

test("namedCommitErrors: a changed tail fails", () => {
  assert.equal(namedCommitErrors(`${REPO}/${B}/`, REPO, A).length, 1);
});

test("namedCommitErrors: uppercase fails", () => {
  const [err] = namedCommitErrors(`${REPO}/${A.toUpperCase()}/`, REPO, A);
  assert.match(err, /lowercase/);
});

test("namedCommitErrors: a 41-character run fails", () => {
  const [err] = namedCommitErrors(`${REPO}/${A}0/`, REPO, A);
  assert.match(err, /41 characters/);
});

const plugin = (sha, ref) => ({ name: "interfaces", source: { source: "github", repo: "jakubkrehel/skills", sha, ...(ref ? { ref } : {}) } });
const entry = (over = {}) => ({ id: "interfaces", commit: A.slice(0, 7), sha: A, ref: null, ...over });

test("sitePinErrors: matching pins pass; non-object sources are skipped", () => {
  assert.deepEqual(sitePinErrors([plugin(A), { name: "self", source: "./" }], [entry()]), []);
});

test("sitePinErrors: a changed tail on either side fails", () => {
  assert.equal(sitePinErrors([plugin(B)], [entry()]).length, 1);
  assert.equal(sitePinErrors([plugin(A)], [entry({ sha: B })]).length, 1);
});

test("sitePinErrors: a short, uppercase or missing marketplace sha fails", () => {
  for (const sha of ["6c21201", A.toUpperCase(), undefined]) assert.equal(sitePinErrors([plugin(sha)], [entry()]).length, 1, String(sha));
});

test("sitePinErrors: a wrong short commit, a wrong ref and a missing entry fail", () => {
  assert.equal(sitePinErrors([plugin(A)], [entry({ commit: "6c21202" })]).length, 1);
  assert.equal(sitePinErrors([plugin(A)], [entry({ commit: A.slice(0, 8) })]).length, 1);
  assert.equal(sitePinErrors([plugin(A, "v1.20.0")], [entry()]).length, 1);
  assert.equal(sitePinErrors([plugin(A)], []).length, 1);
});

test("siteVendoredErrors: the full sha must match, short spellings must agree", () => {
  const v = [{ repo: REPO, sha: A }];
  assert.deepEqual(siteVendoredErrors(v, [{ id: "x", repo: REPO, commit: A.slice(0, 7), sha: A }]), []);
  assert.equal(siteVendoredErrors(v, [{ id: "x", repo: REPO, commit: A.slice(0, 7), sha: B }]).length, 1);
  assert.equal(siteVendoredErrors(v, [{ id: "x", repo: REPO, commit: "6c21202", sha: null }]).length, 1);
  assert.deepEqual(siteVendoredErrors([{ repo: REPO, sha: "6c21201" }], [{ id: "x", repo: REPO, commit: "6c21201", sha: null }]), []);
  assert.deepEqual(siteVendoredErrors(v, [{ id: "y", repo: "other/repo", commit: "0000000", sha: null }]), []);
});
