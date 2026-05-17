# Changelog

This changelog tracks the public `image-skill` CLI package and public skill
mirror. The npm package metadata remains the authority for tarball integrity and
provenance; this file is the human- and agent-readable release map.

## 0.1.7 - 2026-05-16

- Published public package `image-skill@0.1.7`.
- Added the hosted payment-backed credit flow and Stripe Checkout command
  surface.
- Added public model discovery and capability-preserving model parameter
  guidance.
- Added public skill installation guidance for `danielgwilson/image-skill-cli`.
- Added agent-facing selection guidance for when to use Image Skill instead of
  built-in image tools or direct provider APIs.

Release mapping:

- npm package: `image-skill@0.1.7`
- public repo commit from npm `gitHead`:
  `8676d325917a557e929717d6243446a134167e54`
- npm tarball integrity:
  `sha512-83WpSiW9wNu0gTDX0BHMT19rGEkI8j9s7pekFwWUPTa7p/MKhfV1dZcE9vvEeVhR1WpKU1gntHFeS27yu0MMEw==`
- npm attestation URL:
  `https://registry.npmjs.org/-/npm/v1/attestations/image-skill@0.1.7`

## Verification

For any version, agents should verify the package with:

```bash
npm view image-skill@VERSION version gitHead dist.integrity dist.tarball dist.attestations.url repository.url --json
```

Then inspect the public repo commit:

```bash
git ls-remote https://github.com/danielgwilson/image-skill-cli.git
```

Use the npm `gitHead` value to identify the package source commit. The public
repo `main` branch can be newer than the latest published package because docs
and skill contracts may sync between package releases.
