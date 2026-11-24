# Releasing the npm package

The npm package `makkov-harness` is the Node installer (`bin/makkov-harness.mjs`, `install/node/`) with the
skills and the routing map. Its version is the plugin's: `package.json`, `.claude-plugin/plugin.json` and the
plugin's entry in `.claude-plugin/marketplace.json` change together at release, with the CHANGELOG heading. Only
the owner publishes it.

Checked against docs.npmjs.com (trusted-publishers, staged-publishing, npm-stage, npm-trust, npm-publish) and
docs.github.com (deployment environments, rulesets) on 2026-11-24. If npm or GitHub change these steps, follow
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

## Once: the first version, by hand

npm sets up a trusted publisher only for a package that already exists ("Package must exist", docs.npmjs.com,
npm-trust). So the first version is published from the owner's computer. (npm also documents staging a brand-new package, which creates a
`0.0.0-stage` placeholder version; this page uses the manual publish, which is simpler to check.)

1. An npm account with two-factor authentication on (npmjs.com, Account, Two-Factor Authentication).
2. A fresh clone at the merged release commit, nothing else in the folder: `git status --porcelain --ignored`
   prints nothing. (`npm pack` packs the `files` list in `package.json`; an untracked or ignored file under those
   folders would go in too.)
3. `npm pack --dry-run` and read the list. Then `npm login` and `npm publish`. npm asks for the one-time code
   on the command line (docs.npmjs.com, npm-publish, the `otp` setting).

## Once: the GitHub side (before the first release by the workflow)

Create the environment **before** the workflow first runs: a workflow that names an environment that does not
exist creates it, with no protection at all.

1. Repository Settings, Environments, New environment, name `npm-release`.
   - Required reviewers: the owner. Tick "Prevent self-review" only if another person can approve; with the owner
     alone, leave it off (the owner starts and approves).
   - Untick "Allow administrators to bypass configured protection rules".
   - Deployment branches and tags: "Selected branches and tags", add the rule Branch `main` and the rule Tag `v*`.
   - Add no secrets and no variables: the workflow needs none.
2. Repository Settings, Rules, Rulesets, New ruleset, New tag ruleset. Name `release tags`, Enforcement status
   Active, target tags: Include by pattern `v*`. Rules: "Restrict creations", "Restrict updates", "Restrict
   deletions". Bypass list: the owner (Repository admin role) only.

## Once: the npm side (shortly before the next release)

Set this up only when the next version is ready to tag: the first publish through a new trusted publisher must
happen within 2 days, or the setting expires and has to be made again.

1. npmjs.com, the package's Settings, Trusted publishing, GitHub Actions: organization or user `Makkov-design`,
   repository `makkov-harness`, workflow filename `release.yml`, environment `npm-release`. Allowed actions:
   staged publishing only.
2. Same page, Publishing access: "Require two-factor authentication and disallow tokens".

## Every later version

1. Set the version in `package.json`, `.claude-plugin/plugin.json` and the plugin's entry in
   `.claude-plugin/marketplace.json`, and date the CHANGELOG heading. Merge through a reviewed pull request.
2. Push the tag `v<version>` on the merged commit, or start Actions, release, Run workflow on `main`.
3. The `test` job checks the three versions (and the tag), runs the unit tests and every installer scenario with the
   Node installer, and lists what goes into the package. It has no OIDC token.
4. The `publish` job waits for the owner in the `npm-release` environment. Before pressing Approve, open the run
   and check the commit it was started from is the one you merged.
5. It stages the version (`npm stage publish`). Nothing is live yet.
6. Inspect the staged version before approving it:
   - `npm stage list` lists the staged versions with their ids.
   - `npm stage view <id>` shows the details of one.
   - `npm stage download <id>` saves the tarball. Compare it with what you reviewed: in a fresh clone of the merged
     commit, `npm pack`, then compare the two lists of files (`tar -tzf`) and their contents (unpack both and
     `diff -r`).
   - If anything is wrong: `npm stage reject <id>` (asks for two-factor authentication). Nothing goes live.
7. Approve it in npmjs.com, Account settings, Staged Packages, with two-factor authentication. It is live from then
   on. (`npm stage publish` itself needs no second factor; approving and rejecting do.)

No npm token is stored in the repository or in its settings: the publish job proves who it is to npm with GitHub's
OIDC token, and npm attaches a provenance statement to the version.

## The rest of a release

The npm steps above are one part. For every version, once the last pull request that belongs to it is merged:

1. Tag `v<version>` on that merge commit on `main` and push the tag (the CHANGELOG links compare tags, and the
   release workflow starts on it). Then create a GitHub Release from that tag, with the version's CHANGELOG section
   as its text. Before the first tag ever, do the "Once" sections above: create and protect the `npm-release`
   environment and the tag ruleset before pushing it, do not approve the publish job that tag starts (it waits in
   `npm-release`), and publish the first version by hand.
2. Claude users get the new plugin version only after a Sync: claude.ai, Customize, Plugins, Manage marketplaces,
   `makkov-harness`, ⋯, Sync, then quit and reopen the desktop app (README.md, "Getting updates"). Do it once on
   your own account and check that the plugin shows the new version.
3. A new companion version, Frame Lens included, gets its own pull request after its tag exists upstream: the
   `third-party-install-guard` review (Frame Lens is the author's own project and is recorded as "own"), then `sha`
   and `ref` in `.claude-plugin/marketplace.json` and its rows in `SECURITY.md` and `docs/security-data.js`
   (CONTRIBUTING.md, "Updating pins"). Its CHANGELOG line goes into the version that is tagged after it merges.

## After the first version is live

Until the package is on npm, the documentation describes only the clone (`install/install.sh`,
`install/install.ps1`, and `node bin/makkov-harness.mjs` from the clone). Once `npm view makkov-harness version`
answers, add these sentences, in one pull request:

- README.md, the install section, after the clone commands: "With Node.js 22 or later you can skip the clone:
  `npx makkov-harness install --agent <agent>` (add `--project <path>` for one project). It does the same as the
  shell installers; `npx makkov-harness doctor` reports what is installed where."
- INSTALL.md, the section on the Node installer: "The same installer is on npm: `npx makkov-harness install
  --agent <agent> [--project <path>]`, then `npx makkov-harness doctor` to check. Use the same `--agent` and
  `--project` for update and uninstall."
- COMPATIBILITY.md, the "Install route" row: "Node installer: from the clone, or `npx makkov-harness` (Node.js 22+)."
