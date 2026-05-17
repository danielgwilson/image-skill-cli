# image-skill@VERSION

## Package

- npm package: `image-skill@VERSION`
- public repo commit: `PUBLIC_REPO_COMMIT`
- publish workflow run: `PUBLISH_WORKFLOW_URL`
- npm tarball: `NPM_TARBALL_URL`
- npm integrity: `NPM_DIST_INTEGRITY`
- npm attestation URL: `NPM_ATTESTATION_URL`

## Public Contracts

- Skill: `https://image-skill.com/skill.md`
- LLM contract: `https://image-skill.com/llms.txt`
- CLI contract: `https://image-skill.com/cli.md`
- Hosted API health: `https://api.image-skill.com/healthz`

## What Changed

- SUMMARIZE_AGENT_VISIBLE_CHANGE

## Verification

Agents can verify this release with:

```bash
npm view image-skill@VERSION version gitHead dist.integrity dist.tarball dist.attestations.url repository.url --json
git ls-remote https://github.com/danielgwilson/image-skill-cli.git
npm exec --yes --package image-skill@VERSION -- image-skill version --json
npm exec --yes --package image-skill@VERSION -- image-skill doctor --json
```

`gitHead` from npm metadata is the source commit for the published package.
Public repo `main` may be newer than the package if docs or skill contracts
synced after the release.

## Known Status

- npm trusted publishing: EXPECTED_PRESENT
- npm provenance: EXPECTED_PRESENT
- public repo release mapping: THIS_RELEASE
- hosted contract compatibility: VERIFIED_OR_LINK
