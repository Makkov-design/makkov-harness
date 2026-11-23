# Releasing the npm package

The npm package `makkov-harness` is the Node installer (`bin/makkov-harness.mjs`, `install/node/`) with the
skills and the routing map. Its version is the plugin's (`package.json` and `.claude-plugin/plugin.json` change
together at release, with the CHANGELOG heading). Only the owner publishes it.

## Once: the first version, by hand

npm lets a trusted publisher (the release workflow) be set up only for a package that already exists, so the first
version is published from the owner's computer:

1. An npm account with two-factor authentication on (npmjs.com, Account, Two-Factor Authentication).
2. In a fresh clone at the release commit: `npm login`, then `npm publish` (it asks for the one-time code).
3. On npmjs.com, the package's Settings, Trusted publishing: GitHub Actions, organization or user
   `Makkov-design`, repository `makkov-harness`, workflow file `release.yml`, no environment. Leave "Allowed
   actions" at staged publishing only. The first publish through it must happen within 2 days, or the setting
   expires and has to be made again.
4. Same page, Publishing access: "Require two-factor authentication and disallow tokens".

## Every later version

1. Set the version in `package.json` and `.claude-plugin/plugin.json` (and `marketplace.json`), date the CHANGELOG.
2. Merge, then push the tag `v<version>`, or start Actions, release, Run workflow.
3. The workflow checks the versions, runs the tests, and stages the version (`npm stage publish`). Nothing is live yet.
4. On npmjs.com, the package's Staged Packages tab: check it and approve it with two-factor authentication. It is
   live from then on.

No npm token is stored in the repository or in its settings: the workflow proves who it is to npm with GitHub's
OIDC token, and npm attaches a provenance statement to the version. Checked against docs.npmjs.com
(trusted-publishers, staged-publishing) on 2026-11-23; if npm changes these steps, follow its documentation.
