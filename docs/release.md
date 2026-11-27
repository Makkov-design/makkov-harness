# Releasing the npm package

The npm package `makkov-harness` is the Node installer (`cli/makkov-harness.mjs`, `install/node/`) with the
skills and the routing map. Its version is the plugin's: `package.json`, `.claude-plugin/plugin.json` and the
plugin's entry in `.claude-plugin/marketplace.json` change together at release, with the CHANGELOG heading. Only
the owner publishes it.

Checked against docs.npmjs.com (trusted-publishers, staged-publishing, npm-stage, npm-trust, npm-publish) and
docs.github.com (deployment environments, rulesets) on 2026-11-24; the state of each one-time step on 2026-11-25. If npm or GitHub change these steps, follow
their documentation and correct this page.

## The gates, and what each one stops

A version goes live only after all of these. Each stops something different; none stops everything.

| Gate | What it stops | What it does not stop |
|---|---|---|
| Pull request review and CI | A change nobody looked at reaching `main`. | Anyone who can push to `main` or merge without review. |
| Tag ruleset on `v*` | Someone with write access starting a tag-triggered release. | A run started by hand (Run workflow): that needs write access, and the environment below is what holds it. |
| GitHub environment `npm-release` with a required reviewer | Any run (tag or by hand) reaching the publish step without the owner pressing Approve. The OIDC token npm trusts is issued to the publish job only, inside this environment. | The owner approving a run without reading it. GitHub cannot be asked from the workflow whether the environment has a reviewer, so the workflow cannot fail closed on that: if the environment loses its reviewer, this gate is gone and the run goes straight to npm. |
| npm trusted publisher (workflow `release.yml`, environment `npm-release`, staged only) | Any other repository, workflow file or environment publishing the package; any token. | A bad commit that passed the gates above. |
| npm staged-version approval with two-factor authentication | Anything that got this far going live without the owner, on npmjs.com, with their second factor. This is the last gate. | An owner whose npm account and second factor are both taken. |

## Done once: the first version, by hand

npm sets up a trusted publisher only for a package that already exists ("Package must exist", docs.npmjs.com,
npm-trust). So the first version was published from the owner's computer: `makkov-harness` 0.6.0, on 2026-11-25,
with `npm publish` from a fresh clone of the release commit, after `npm pack --dry-run`, with the npm account's
two-factor authentication on. It has no provenance statement (that comes only from a publish in CI). npm also
lists a `0.0.0-stage` version, created a few minutes before 0.6.0: the placeholder npm makes when a brand-new
package is staged. It is not a release; leave it.

## Done once: the GitHub side

Both exist. Check them before each release; if one is missing or changed, set it back as below before the tag.
(A workflow that names an environment that does not exist creates it, with no protection at all.)

1. Repository Settings, Environments, `npm-release`:
   - Required reviewers: the owner. "Prevent self-review" only if another person can approve; with the owner
     alone, it stays off (the owner starts and approves).
   - "Allow administrators to bypass configured protection rules": off.
   - Deployment branches and tags: "Selected branches and tags", the rule Branch `main` and the rule Tag `v*`.
   - No secrets and no variables: the workflow needs none.
2. Repository Settings, Rules, Rulesets, tag ruleset `release tags`: Enforcement status Active, target tags
   Include by pattern `v*`, rules "Restrict creations", "Restrict updates", "Restrict deletions", bypass list the
   owner (Repository admin role) only.

## Once: the npm side (not done yet; shortly before tagging 0.6.1)

Set this up only when 0.6.1 is merged and ready to tag: the first publish through a new trusted publisher must
happen within 2 days, or the setting expires and has to be made again.

1. npmjs.com, the package's Settings, Trusted publishing, GitHub Actions: organization or user `Makkov-design`,
   repository `makkov-harness`, workflow filename `release.yml`, environment `npm-release`. Allowed actions:
   staged publishing only.
2. Same page, Publishing access: "Require two-factor authentication and disallow tokens".

Until this is done, the `publish` job has nothing npm trusts and fails at `npm stage publish`; nothing is published.

## Every version from 0.6.1 on

0.6.1 is the first version the workflow publishes. You need npm 11.15 or later on your own computer for the
`npm stage` commands in step 7 (`npm --version`; Node 24 ships 11.19, or `npm install -g npm@latest`), signed in
with `npm login`.

1. Set the version in `package.json`, `.claude-plugin/plugin.json` and the plugin's entry in
   `.claude-plugin/marketplace.json`, and date the CHANGELOG heading. Merge through a reviewed pull request.
2. Check the `npm-release` environment and the tag ruleset (above), and that the npm trusted publisher is set up
   (for 0.6.1: set it up now, "Once: the npm side").
3. Tag `v<version>` on the merge commit on `main` and push the tag (`git tag v<version> <merge commit>`,
   `git push origin v<version>`), or start Actions, release, Run workflow on `main`.
4. The `test` job checks the three versions (and the tag), runs the unit tests and every installer scenario with the
   Node installer, and lists what goes into the package (`npm pack --dry-run`). It has no OIDC token.
5. The `publish` job waits for the owner in the `npm-release` environment. Before pressing Approve, open the run
   and check the commit it was started from is the merge commit you tagged, and read the `test` job's package
   list.
6. Once approved, it checks that npm is 11.15 or later and stages the version (`npm stage publish`). Nothing is
   live yet.
7. Inspect the staged version before approving it:
   - `npm stage list` lists the staged versions with their ids.
   - `npm stage view <id>` shows the details of one.
   - `npm stage download <id>` saves the tarball. Compare it with what you reviewed: in a fresh clone of the merged
     commit, `npm pack`, then compare the two lists of files (`tar -tzf`) and their contents (unpack both and
     `diff -r`).
   - If anything is wrong: `npm stage reject <id>` (asks for two-factor authentication). Nothing goes live.
8. Approve it in npmjs.com, Account settings, Staged Packages, with two-factor authentication. It is live from then
   on. (`npm stage publish` itself needs no second factor; approving and rejecting do.)
9. Check it: `npm view makkov-harness version` prints the new version, the version's page on npmjs.com shows its
   provenance (built from this repository's `release.yml` at the commit the run started from: the tagged merge
   commit, or for a run started by hand the head of `main` at that moment, which must be the merge commit you
   reviewed), and in an empty folder `npx makkov-harness@<version> --help` prints the usage. After a run started
   by hand, tag that same commit ("The rest of a release", step 1).

No npm token is stored in the repository or in its settings: the publish job proves who it is to npm with GitHub's
OIDC token, and npm attaches a provenance statement to the version.

## The rest of a release

The npm steps above are one part. For every version, once the last pull request that belongs to it is merged:

1. The tag `v<version>` on that merge commit on `main` (step 3 above; the CHANGELOG links compare tags). Then create
   a GitHub Release from that tag, with the version's CHANGELOG section as its text.
2. Sync the marketplace on claude.ai and confirm the plugin is synced, not Skipped, at the tagged commit.
   Claude users get the new plugin version only after a Sync: claude.ai, Customize, Plugins, Manage marketplaces,
   `makkov-harness`, ⋯, Sync, then quit and reopen the desktop app (README.md, "Getting updates"). Do it on your
   own account. Sync reads the default branch, so run it when `main` is at the tagged commit. Check that the
   `makkov-harness` plugin shows the new version and is not marked Skipped; a Skipped plugin keeps the version it
   had and says why (0.6.0 and 0.6.1 were skipped for a top-level `bin/`, so plugin users stayed on 0.5.0).
   `check.mjs` catches the causes the documentation names (claude-ai.mjs), not every one.
   **A release is not done until this passes.** If it is Skipped, fix the cause in a new patch release.
3. A new companion version, Frame Lens included, gets its own pull request after its tag exists upstream: the
   `third-party-install-guard` review (Frame Lens is the author's own project and is recorded as "own"), then `sha`
   and `ref` in `.claude-plugin/marketplace.json` and its rows in `SECURITY.md` and `docs/security-data.js`
   (CONTRIBUTING.md, "Updating pins"). Its CHANGELOG line goes into the version that is tagged after it merges.
