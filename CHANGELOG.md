# Changelog

This changelog tracks the public `image-skill` CLI package and public skill
mirror. The npm package metadata remains the authority for tarball integrity and
provenance; this file is the human- and agent-readable release map.

## 0.1.11 - 2026-05-26

- Remove private no-spend fake payment rails from the public CLI and public
  skill/docs contract.
- Make public credit quotes default to Stripe Checkout and reject fake payment
  methods locally before calling the hosted API.
- Hide the private `credits fake-purchase` harness command from the public CLI
  package.

## 0.1.10 - 2026-05-22

- Stripe Checkout payment-link hardening follow-up.
- Make `checkout_compact_url` copy-safe by preferring the short Image Skill
  `checkout_handoff_url` whenever the hosted API provides one.
- Keep raw Stripe `checkout_url` only as the full fallback and preserve its
  required `#...` browser fragment.
- Add proof coverage that the Image Skill handoff redirects to the exact Stripe
  Checkout URL with the fragment intact.

## 0.1.9 - 2026-05-22

- Emergency Stripe Checkout payment-link hotfix.
- Restored full Stripe Checkout URL preservation, including the `#...`
  fragment required by Stripe's browser checkout app.
- Kept `checkout_handoff_url` as the preferred short human payment link, but
  made stale-server fallback safe by no longer fragment-stripping
  `checkout_url`, `checkout_compact_url`, or `next.fallback_checkout_url`.
- Do not use `image-skill@0.1.8` for live Stripe payments.

## 0.1.8 - 2026-05-22

- Hardened Stripe Checkout handoff responses for mobile terminals and chat.
- Added fragment-stripped `checkout_url` normalization so stale hosted API
  responses no longer cause the public CLI to print a long `#...` Stripe URL
  under the easiest field for agents to copy.
- Kept `checkout_handoff_url` as the preferred human payment link and
  `checkout_compact_url` as the explicit stale-server fallback.

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
