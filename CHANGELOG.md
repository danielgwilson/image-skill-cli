# Changelog

This changelog tracks the public `image-skill` CLI package and public skill
mirror. The npm package metadata remains the authority for tarball integrity and
provenance; this file is the human- and agent-readable release map.

## 0.1.19 - 2026-06-02

- Fix: the two newly-shipped modalities were broken on live prod despite green
  unit tests. Audio (`fal.stable-audio-25-text-to-audio`) failed server-side
  with `PROVIDER_FAILURE` "fal audio queue status returned HTTP 405" — the Fal
  queue status/result poll appended `requests/<id>` to the full sub-pathed model
  id, but Fal keys those endpoints by the app id only (`fal-ai/stable-audio-25`,
  sub-path dropped), so the poll 405'd. The queue runner now prefers the absolute
  `status_url`/`response_url` Fal returns and falls back to the app-level base.
  Video and Trellis (no sub-path) are unaffected.
- Fix: the documented promptless image-to-3D edit `image-skill edit --input
image_... --model fal.trellis-image-to-3d --json` (no `--prompt`) was
  unreachable — the edit validator required `--prompt` while the provider
  rejected any prompt. The public CLI bin (and the server) now treat Trellis as
  promptless: no `--prompt` is required and none is sent.
- Fix: a failed edit's `PROVIDER_FAILURE` recovery `suggested_command` now
  preserves `--input` and `--model` so the advertised retry is runnable verbatim
  (it previously collapsed to a bare `image-skill edit --idempotency-key ...`
  that failed "edit requires --input").

## 0.1.18 - 2026-06-02

- Contract: advertise the now-shipped audio and 3D modalities so registries
  (skills.sh, npm, the `.well-known` manifest) surface Image Skill for
  audio/music/sound and 3D/mesh/glb searches. This is a factual capability
  update — both modalities are live in production via the modality-generic path.
  Audio (music, sound) generation runs through `create` with
  `fal.stable-audio-25-text-to-audio` (Stable Audio 2.5), text-to-audio at a flat
  $0.20/clip, returning a durable owned `audio/wav` URL. 3D asset creation runs
  through `edit` as a promptless image-to-3D variation transform with
  `fal.trellis-image-to-3d` (Trellis), at a flat $0.02/asset, returning a durable
  owned `.glb` (`model/gltf-binary`) mesh URL. The skill/llms.txt frontmatter
  `description` and the npm package keywords now include audio and 3D. No CLI
  behavior change beyond the version bump; both modalities are model-id-gated
  through the existing create/edit surface.

## 0.1.17 - 2026-06-01

- Money integrity: `create` and `edit` now send `--idempotency-key` to the
  server so a retry of a transiently-failed generation REPLAYS the original
  job instead of charging again. `create --guide` bakes a generated key into
  its suggested command, and a proxy-killed 502 (`HOSTED_API_NON_JSON_RESPONSE`)
  now returns a recovery block with the request's idempotency key so the
  advertised retry is charge-safe. (0.1.16 parsed the flag but did not send it
  on create, so same-key retries still double-charged against the live server's
  dedup; this build closes that end-to-end.)

## 0.1.16 - 2026-06-01

- `credits buy` now accepts `--provider stripe_x402` to execute the agent-native
  USDC credit deposit end-to-end, and `credits quote` accepts
  `--payment-method stripe_x402.exact.usdc`. Previously the agent-native deposit
  method was advertised by `credits methods` but the CLI could only run the
  hosted-checkout provider, so an agent could discover the method without being
  able to act on it. The deposit command returns the redacted payment challenge
  and the `pay_stripe_crypto_deposit` next action; credits are granted only
  after verified settlement (poll `credits status`). No change to the
  `--provider stripe` hosted-checkout flow.

## 0.1.15 - 2026-05-31

- Republish from current `main` so the package matches the shipped contract:
  registry-slug-first install guidance (`npx skills add danielgwilson/image-skill-cli`),
  an MIT license, and the current zero-setup positioning (the prior
  enterprise-umbrella framing is fully retired in this build).
- Safety fix: this build rejects `edit --dry-run` with
  `PUBLIC_CLI_FLAG_NOT_AVAILABLE` instead of silently running a real, billed edit
  (the 0.1.14 behavior charged credits and consumed a daily job slot for a flag
  the agent expected to be a free cost preview). First-class edit dry-run support
  is tracked separately.

## 0.1.14 - 2026-05-29

- Refresh the public package with the guide-first `create --guide` flow so a
  fresh agent can get an `image-skill.create-guide.v1` no-mutation planning
  response before signup/auth setup.
- Keep the first creative command aligned with the public README, skill, and
  `llms.txt` contract.

## 0.1.13 - 2026-05-26

- Remove public changelog breadcrumbs for private harness payment rails.
- Keep the npm tarball aligned with the action-only public payment contract.

## 0.1.12 - 2026-05-26

- Publish the action-only payment-method public contract: public discovery now
  shows usable payment rails only.
- Remove staged/watch-only payment rail examples from the public npm docs and
  bundled skill references so agents are not steered toward unavailable flows.

## 0.1.11 - 2026-05-26

- Remove private non-production payment rails from the public CLI and public
  skill/docs contract.
- Make public credit quotes default to Stripe Checkout and reject unavailable
  payment methods locally before calling the hosted API.
- Keep private harness-only payment commands out of the public CLI package.

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
