# Image Skill CLI Contract

Status: preview hosted-product contract.

The `image-skill` thin CLI/client gives agents a stable way to call the hosted Image Skill service, parse JSON responses, receive artifacts, and leave feedback.

Public contract URLs:

- `https://image-skill.com`
- `https://image-skill.com/skill.md`
- `https://image-skill.com/llms.txt`
- `https://image-skill.com/cli.md`
- `https://api.image-skill.com`

## Global Rules

- Every command that agents use must support `--json`.
- JSON is the default public CLI output. `--json` is accepted for
  compatibility and explicitness, but fresh agents do not need to add it to
  every command.
- JSON output must use the standard envelope from
  `https://image-skill.com/llms.txt`.
- Commands must have deterministic exit codes.
- Commands must emit service telemetry unless running in a documented no-telemetry test mode.
- Commands must not print secrets after initial creation.
- File-writing commands must avoid overwriting inputs unless `--overwrite` is explicit.
- Expensive commands must expose quota, claim, cost, and budget guard failures clearly.
- Public feedback commands submit to hosted product memory by default.

## Exit Codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| 0    | Success                                |
| 1    | Generic failure                        |
| 2    | Invalid arguments                      |
| 3    | Auth required or invalid token         |
| 4    | Capability denied                      |
| 5    | Quota exceeded                         |
| 6    | Content policy denied                  |
| 7    | Provider failure                       |
| 8    | Timeout                                |
| 9    | Filesystem or artifact storage failure |

## Commands

### `image-skill doctor`

Checks thin CLI/client health, hosted service reachability, auth state, local output permissions, and telemetry status.

```bash
image-skill doctor --json
```

### `image-skill trust`

Returns a no-auth, no-spend evidence packet for tool selection and package
provenance checks.

```bash
image-skill trust --json
```

The packet uses `schema: "image-skill.trust-packet.v0"` and reports the public
CLI version, npm metadata status, public repo mapping when inferable, hosted
contract document hashes, hosted `/healthz`, `/v1/models` availability, safe
copyable commands, proof URL placeholders, and redaction guarantees.

Use `trust` when deciding whether Image Skill is current and honest enough to
select. It is not a required setup step before the first image; the canonical
fresh-agent creative entrypoint remains `image-skill create --guide`.

If package metadata, hosted docs, API health, or model availability cannot be
verified, the command still returns a packet with explicit `unreachable`,
`not_available_yet`, `inspect_only`, or `stale_or_mismatched` states rather
than omitting the field.

### `image-skill signup --agent`

Bootstraps restricted agent access.

```bash
image-skill signup --agent \
  --agent-contact agent-inbox@example.com \
  --agent-name creative-agent \
  --runtime codex \
  --json
```

By default, signup stores the returned `isk_r_` token in the public CLI config
with 0600 permissions and redacts it from stdout. `--save` remains accepted as
a compatibility no-op for older instructions. Use `--no-save` only when local
persistence is intentionally disabled, and use `--show-token --no-save` only
when the agent runtime has a separate secret store and needs the raw token once.
Do not paste tokens into prompts, logs, issue text, or feedback.

In this preview contract, `--agent-contact` is an email-shaped durable contact
inbox for the restricted agent identity, not a requirement to find an
individual human. Use an agent-owned inbox when available; otherwise use an
operator, team, or sponsor inbox that can receive future claim, billing, or
abuse notices. Do not block waiting for a person, invent a person, or use a
throwaway inbox.
`example.invalid` addresses are only appropriate inside documented harness or
proof runs. `--human-email` remains accepted as a compatibility alias for
`--agent-contact`.

If the runtime has a separate secret store, it may provide the token to commands
as `IMAGE_SKILL_TOKEN`. Keep that value outside prompts, logs, issue text, and
feedback.

If the agent runtime can hand secrets to a command over stdin, avoid exporting
the token and use `--token-stdin` instead:

```bash
printf '%s\n' "$IMAGE_SKILL_TOKEN" | image-skill usage quota --token-stdin --json
```

`--api-base-url` is an advanced preview/test override; production public agents
should omit it.

### First Run Guide Loop

Use the no-spend guide first. It is the only required first command for a fresh
agent. It checks health, executable model availability, auth/quota when a token
already exists, and payment rails, then returns one `data.next_command`. Guide
mode does not create a signup, provider job, dry-run job, payment object,
credit debit, or asset.

```bash
image-skill create --guide --prompt "a compact field camera on a stainless workbench"
```

Read `data.stage`, run `data.next_command`, and rerun the guide only after
auth or payment state changes. Do not run `doctor`, `models list`, `signup`,
`whoami`, `usage quota`, `create --dry-run`, or payment commands as a setup
checklist before the guide asks for them.

- `prompt_required`: rerun `data.next_command` with the real prompt.
- `auth_required`: run `data.next_command`, then rerun guide once.
- `quota_required`: follow the payment commands in
  `data.checks.payments.suggested_commands`, then rerun guide once.
- `ready_to_create`: run `data.next_command` for the first bounded create.

Manual escape hatches are not prerequisites. Use them only when
`data.next_command` / `data.escape_hatches` asks, or when the task genuinely
needs deeper capability, quota, payment, or planning detail:

```bash
image-skill trust
image-skill doctor
image-skill models list
image-skill models show openai.gpt-image-2
image-skill whoami
image-skill usage quota
image-skill create --dry-run --prompt "a compact field camera on a stainless workbench"
```

Use `--show-token` only when the runtime has a separate secret store and needs
the raw token once. Otherwise prefer saved auth; it keeps tokens out of prompts,
logs, and shell history.

### Local Config And Install

Prefer package execution in fresh agent sandboxes:

```bash
npx -y image-skill@latest create --guide --prompt "a compact field camera on a stainless workbench" --json
```

Global install is optional, not the primary path. If `npm install -g image-skill`
or `npx image-skill@latest ...` hits prefix/cache `EACCES`, retry with writable
package-manager paths instead of cloning private source:

```bash
export npm_config_cache="${npm_config_cache:-$PWD/.npm-cache}"
export npm_config_prefix="${npm_config_prefix:-$PWD/.npm-global}"
export PATH="$npm_config_prefix/bin:$PATH"
npx -y image-skill@latest create --guide --prompt "a compact field camera on a stainless workbench" --json
```

Saved auth state defaults to
`${XDG_CONFIG_HOME:-~/.config}/image-skill/config.json`. If that location is
read-only, set a writable config path before `signup`:

```bash
export IMAGE_SKILL_CONFIG_PATH="$PWD/.image-skill/config.json"
npx -y image-skill@latest signup --agent \
  --agent-contact agent-inbox@example.com \
  --agent-name creative-agent \
  --runtime codex \
  --json
```

Config write failures return `PUBLIC_CLI_CONFIG_WRITE_FAILED` with a structured
`error.recovery.suggested_command`. Agents should follow that recovery field,
then rerun `create --guide` for the requested creative flow.

### `image-skill whoami`

Shows current actor, organization, claim state, token class, and grants.

```bash
image-skill whoami --json
```

### `image-skill usage quota`

Canonical pre-spend check. Shows remaining credits, job limits, model limits,
and reset windows before create/edit.

```bash
image-skill usage quota --json
```

`image-skill quota --json` remains a compatibility alias.

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/quota \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN"
```

### `image-skill credits methods`

Machine-readable payment rail discovery. Use this before quoting or buying so
agents can tell which rails are available, whether live money can move, whether
browser/human action is required, and which command to try next.

```bash
image-skill credits methods --json
```

Minimum success data shape:

```json
{
  "contract_version": "image-skill.payment-methods.v1",
  "credit_unit_cents": 1,
  "currency": "USD",
  "quote_endpoint": "/v1/credit-quotes",
  "packs_endpoint": "/v1/credit-packs",
  "status_endpoint": "/v1/credit-purchases/status",
  "methods": [
    {
      "method_id": "stripe_checkout",
      "status": "available",
      "available": true,
      "quoteable": true,
      "purchasable": true,
      "live_money": true,
      "buyer_modes": ["hybrid", "human_only"],
      "requires_browser": true,
      "default_pack_id": "starter-500",
      "purchase_endpoint": "/v1/credit-purchases/stripe-checkout-sessions"
    }
  ]
}
```

Public payment discovery is intentionally action-only. Rails that are merely
planned, watch-only, fake, or private harness-only are not returned here. Use a
method only when it is returned with `available:true`, `quoteable:true`, and
`purchasable:true`.

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/payment-methods
```

### `image-skill credits packs list`

Lists the recommended Image Skill credit packs for Stripe Checkout. Packs are
the default live-money buying UX because agents get obvious starter choices and
Stripe Checkout avoids tiny card-fee traps. Exact custom quotes are still
supported when an agent already knows the required credit budget.

```bash
image-skill credits packs list --json
```

Minimum success data:

```json
{
  "credit_unit_cents": 1,
  "credit_unit_usd": 0.01,
  "currency": "USD",
  "default_pack_id": "starter-500",
  "packs": [
    {
      "pack_id": "starter-500",
      "name": "Starter",
      "credits": 500,
      "amount_cents": 500,
      "currency": "USD"
    }
  ],
  "custom_quotes": {
    "supported": true,
    "min_credits": 1,
    "max_credits": 5000
  }
}
```

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/credit-packs
```

### `image-skill credits quote`

Requests a bounded credit quote from the hosted service. Public top-ups use
Stripe Checkout with `--payment-method stripe_checkout`. A quote never grants
credits.
One Image Skill credit is a stable user-facing value unit worth `$0.01`.
Creative operations can consume more than one credit based on the selected
model's provider cost and Image Skill's margin policy; inspect
`models show MODEL_ID --json` and operation `cost.credit_pricing` for the exact
debit before spending.

```bash
image-skill credits quote --credits 10 --payment-method stripe_checkout --json
```

For retry-stable automation, provide an explicit non-secret idempotency key:

```bash
image-skill credits quote \
  --credits 10 \
  --idempotency-key quote-run-001 \
  --json
```

Idempotency keys are scoped to the current hosted agent identity and exact
quote request. Reusing a key with different credits, pack, or payment method
returns a structured `error.recovery.suggested_command` with a fresh
idempotency key for the attempted quote terms.

For Stripe Checkout terms, prefer a named pack:

```bash
image-skill credits quote \
  --pack starter-500 \
  --payment-method stripe_checkout \
  --idempotency-key stripe-pack-quote-run-001 \
  --json
```

For exact custom Stripe Checkout terms, request the provider and bounded credit
amount explicitly:

```bash
image-skill credits quote \
  --credits 137 \
  --payment-method stripe_checkout \
  --idempotency-key exact-quote-run-001 \
  --json
```

Minimum success data:

```json
{
  "quote_id": "quote_...",
  "state": "created",
  "credits": 10,
  "price_amount_cents": 10,
  "currency": "USD",
  "expires_at": "2026-05-08T20:00:00.000Z",
  "accepted_payment_method": "stripe_checkout",
  "idempotency_key": "quote-run-001",
  "pack_id": null,
  "pack": null,
  "live_money": true
}
```

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/credit-quotes \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"pack_id":"starter-500","payment_method":"stripe_checkout","idempotency_key":"stripe-pack-quote-run-001"}'
```

### `image-skill credits buy`

Creates a payment action for a previously returned quote. Stripe Checkout is the
first live-money provider. This creates a hosted Stripe Checkout Session and
returns an `action_required` response with `checkout_handoff_url`; credits are
granted only after verified Stripe webhook fulfillment succeeds. Session
creation itself must not mutate credit balances.

Agents should present or open `checkout_handoff_url` for humans. It is a short
Image Skill URL that redirects to Stripe Checkout and is safe to copy from
mobile terminals, SSH clients, and wrapped chat output. `checkout_compact_url`
is also copy-safe and equals the Image Skill handoff when the hosted API can
provide one. `checkout_url` is the raw Stripe compatibility fallback only; do
not present it unless no handoff URL is available. Do not trim Stripe Checkout
URLs: the long `#...` fragment is required by Stripe Checkout in the browser.
Present any fallback Stripe URL in a fenced code block so terminal wrapping does
not corrupt it.
Stripe-hosted Checkout may also show a promotion-code field for
operator-provided codes; agents should let the human enter those codes on
Stripe, never collect promo codes, card details, or wallet credentials in the
Image Skill CLI.

```bash
image-skill credits buy \
  --provider stripe \
  --quote-id quote_... \
  --idempotency-key stripe-buy-run-001 \
  --json
```

Minimum success data:

```json
{
  "state": "action_required",
  "quote_id": "quote_...",
  "payment_attempt_id": "payatt_...",
  "provider": "stripe",
  "accepted_payment_method": "stripe_checkout",
  "checkout_session_id": "cs_...",
  "checkout_handoff_url": "https://api.image-skill.com/pay/payatt_...",
  "checkout_compact_url": "https://api.image-skill.com/pay/payatt_...",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_...#fid...",
  "credits": 500,
  "amount_cents": 500,
  "currency": "USD",
  "live_money": true,
  "next": {
    "human_action": "open_checkout_url",
    "checkout_handoff_url": "https://api.image-skill.com/pay/payatt_...",
    "checkout_compact_url": "https://api.image-skill.com/pay/payatt_...",
    "fallback_checkout_url": "https://checkout.stripe.com/c/pay/cs_...#fid...",
    "after_payment": "open checkout_handoff_url or checkout_compact_url; use the full checkout_url only if no Image Skill handoff URL is available, and preserve its Stripe # fragment. Then poll image-skill credits status --payment-attempt-id PAYMENT_ATTEMPT_ID --json or image-skill usage quota --json; credits are granted only after verified webhook fulfillment"
  }
}
```

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/credit-purchases/stripe-checkout-sessions \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"quote_id":"quote_...","idempotency_key":"stripe-buy-run-001"}'
```

### `image-skill credits status`

Shows the durable state of a quote, Stripe Checkout attempt, Checkout Session,
or receipt. Use this after `credits buy` so agents do not have to infer payment
state from quota deltas or activity text.

```bash
image-skill credits status \
  --payment-attempt-id payatt_... \
  --json
```

Exactly one reference flag is required: `--quote-id`,
`--payment-attempt-id`, `--checkout-session-id`, or `--receipt-id`.

Minimum action-required data:

```json
{
  "state": "action_required",
  "quote": {
    "quote_id": "quote_...",
    "credits": 500,
    "price_amount_cents": 500,
    "accepted_payment_method": "stripe_checkout",
    "pack_id": "starter-500",
    "x402": null
  },
  "payment_attempt": {
    "payment_attempt_id": "payatt_...",
    "checkout_session_id": "cs_...",
    "checkout_handoff_url": "https://api.image-skill.com/pay/payatt_...",
    "checkout_compact_url": "https://api.image-skill.com/pay/payatt_...",
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_...#fid...",
    "attempt_status": "requires_action"
  },
  "receipt": null,
  "credit_event": null,
  "next": {
    "retry_after_seconds": 10,
    "human_action": "open_checkout_url",
    "checkout_handoff_url": "https://api.image-skill.com/pay/payatt_...",
    "checkout_compact_url": "https://api.image-skill.com/pay/payatt_..."
  }
}
```

Minimum success data includes `state: "succeeded"`, `receipt`,
`credit_event`, and the updated hosted `limits`.

Hosted API equivalent:

```bash
curl -sS "https://api.image-skill.com/v1/credit-purchases/status?payment_attempt_id=payatt_..." \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN"
```

Do not pass card data, wallet secrets, provider receipts, Stripe secrets, MPP
tokens, SPTs, live x402 payment headers, or any payment credential to credits
commands. Stripe Checkout collects payment details only on Stripe-hosted pages.
The public request fields are `credits`, `pack_id`, `payment_method`,
`quote_id`, status reference IDs, and `idempotency_key`.

### `image-skill models`

First-run creative discovery. Lists public models and shows the full
capability-preserving schema for one model.

```bash
image-skill models --json
image-skill models list --json
image-skill models list --available --operation image.generate --json
image-skill models list --available --operation image.edit --json
image-skill models list --catalog-only --provider fal --json
image-skill models show MODEL_ID --json
```

Hosted API equivalents:

```bash
curl -sS https://api.image-skill.com/v1/models
curl -sS https://api.image-skill.com/v1/models/xai.grok-imagine-image
```

`models show` exposes operation support, media input/output types, parameter
schemas, defaults and fixed controls, cost and latency class, safety behavior,
and migration hints. Agents should inspect it before assuming a model supports
seeds, masks, reference images, transparent backgrounds, arbitrary aspect
ratios, image-size presets, output counts, resolution controls, safety
controls, or provider-native options.

`models list` is executable-first by default and returns `summary` with total,
returned, available, executable, catalog-only, provider split,
`execution_availability`, first actionable model ids, recommended filter
commands, and catalog-inclusion flags. Default list output excludes
catalog-only rows so fresh agents see executable candidates first. Use
`--available` for currently usable executable rows, `--operation
image.generate` or `--operation image.edit` for the task, `--provider fal|xai|openai`
to narrow by provider, and `--catalog-only` when you intentionally want
source-backed rows that are inspectable but not runnable yet. Provider-level
availability is not the same thing as model executability; for runnable
choices require both `status:"available"` and
`execution.model_execution_status:"executable"`. If a reachable provider has no
runnable model for the requested operation, `summary.execution_availability`
says so directly and includes the fastest `--available --operation ...`
recovery command.

Image Skill standardizes common controls so agents can work quickly, but it
must not flatten rich model capabilities into coarse universal categories.
Use `model_parameters` for rare or model-specific parameters advertised by the
capability schema.

Current executable provider-native controls include:

- Fal FLUX.1 dev: `model_parameters.image_size` for presets such as
  `square_hd`, plus `seed`.
- Fal FLUX Pro 1.1 Ultra Create: `model_parameters.seed` and
  `model_parameters.raw`; optional reference-image controls remain cataloged
  for inspection but are not executable on the create-only path.
- Fal Z-Image Turbo Create/Edit: `model_parameters.image_size` for
  `square_hd`, `square`, portrait/landscape presets, and `auto` on edit; costs
  are quoted from requested megapixels when the output size is explicit.
- Fal Nano Banana 2 Edit: `model_parameters.resolution` for `0.5K`, `1K`,
  `2K`, and `4K`, plus `seed`.
- Fal Ideogram V2 Edit: `model_parameters.expand_prompt`, `seed`, and
  `style`; pass masks as top-level `--mask` / `mask_asset_id`, not as
  provider `mask_url`.
- Fal Gemini 3 Pro Image Preview Create/Edit:
  `model_parameters.resolution` for `1K`, `2K`, and `4K`, plus `seed`; 4K is
  quoted as the higher-priced provider tier.
- Fal Nano Banana Pro Create/Edit: `model_parameters.resolution` for `1K`,
  `2K`, and `4K`, plus `seed`; 4K is quoted as the higher-priced provider tier.
- Fal FLUX Pro Kontext Pro/Max Edit: `model_parameters.seed`; guidance scale
  and aspect-ratio controls remain cataloged for inspection but are not
  executable until their UX and receipt behavior are represented.
- Fal Bytedance Seedream 4.5 Create/Edit: `model_parameters.image_size` for
  `square_hd`, `square`, portrait/landscape presets, `auto_2K`, and
  `auto_4K`, plus `seed`; multi-output and multi-reference controls remain
  cataloged but fixed for hosted accounting.
- Fal Bytedance Seedream 5.0 Lite Create/Edit:
  `model_parameters.image_size` for `square_hd`, `square`, portrait/landscape
  presets, `auto_2K`, and `auto_3K`; multi-output and multi-reference controls
  remain cataloged but fixed for hosted accounting.
- xAI Grok Imagine Image Quality: `model_parameters.resolution` for `1k` and
  `2k`; 2k is priced from the higher provider tier. Create supports top-level
  `--output-count` up to the model's advertised `max_outputs_per_request`,
  currently mapped to xAI's documented `n` batch parameter.
- GPT Image 1.5 create/edit: documented fixed sizes `1024x1024`,
  `1024x1536`, and `1536x1024`, output format, compression, transparent or
  opaque background, moderation, and the upstream provider-native quality
  parameter. GPT Image 1.5 create quotes output-token estimates when quality
  and concrete size are known; GPT Image 1.5 create supports top-level
  `--output-count` up to the model's advertised `max_outputs_per_request`,
  currently mapped to OpenAI's `n` parameter. GPT Image 1.5 edit accepts
  low/high `input_fidelity` and remains preflight unknown-cost until usage is
  returned.
- GPT Image 2 create/edit: size, output format, compression, background,
  moderation, and the upstream provider-native quality parameter. GPT Image 2
  create quotes request-aware output-token estimates when quality and concrete
  size are known; GPT Image 2 create supports top-level `--output-count` up to
  the model's advertised `max_outputs_per_request`, currently mapped to
  OpenAI's `n` parameter. GPT Image 2 edit remains preflight unknown-cost, then
  records usage-priced provider cost when OpenAI returns token usage.

Inspect each model before use; provider-native controls are available only
through validated `model_parameters`.

### `image-skill capabilities`

Schema-language view over the same capability catalog. Use this when you need
the capability abstraction directly rather than starting from a model.

```bash
image-skill capabilities --json
image-skill capabilities list --json
image-skill capabilities show CAPABILITY_ID --json
```

### `image-skill create`

Guides, creates, or plans a zero-cost dry run.

Guide the first image path without mutation:

```bash
image-skill create --guide --prompt "A compact field camera on a stainless workbench" --json
```

`create --guide` returns `schema: image-skill.create-guide.v1`,
`stage`, `next_command`, `escape_hatches`, selected executable model and cost,
auth/quota/payment blockers, and mutation flags. All mutation flags must be
false in guide mode: no provider call, hosted create, signup, payment object,
credit debit, or media write.

```bash
image-skill create \
  --prompt "A compact field camera on a stainless workbench" \
  --intent explore \
  --aspect-ratio 1:1 \
  --max-estimated-usd-per-image 0.07 \
  --json
```

Hosted defaults are quality-first. If an agent does not choose a model, Image
Skill selects the strongest available create capability for the requested
intent and budget, then records the decision in `request.selection`. Explicit
`--provider`, `--model`, namespaced model ids, and validated
`model_parameters` always take precedence. For final/product/hero-style
intents, Image Skill may default an eligible quality-capability request to a
higher output tier only when `--max-estimated-usd-per-image` is high enough for
that tier; otherwise it stays on a lower-cost quality tier or chooses a cheaper
capability within the budget and tells agents what happened in the selection
receipt.
Use `0.05` only when intentionally budget-capping to a lower-cost or
lower-resolution path; the current no-model quality default needs `0.07` to
permit the 2k plan.

Preview-compatible richer shape:

```bash
image-skill create \
  --prompt "Campaign-ready product image of a compact field camera" \
  --intent finalize \
  --model MODEL_ID \
  --aspect-ratio 1:1 \
  --output-count 2 \
  --max-estimated-usd-per-image 0.07 \
  --model-parameters-json '{"seed":1234}' \
  --json
```

Use `--output-count N` only when `models show MODEL_ID --json` advertises
`media.output.max_outputs_per_request` greater than `1`. `--output-count` is a
top-level Image Skill create control; do not pass provider-native `n` through
`model_parameters` unless the selected model schema explicitly advertises that
field. Credit pricing and `cost.credit_pricing.credits_required` are total
operation debits across all requested outputs. `--max-estimated-usd-per-image`
and raw API `max_estimated_usd_per_image` remain per-image budget guards.

Generate video through the same `create` command and durable-media loop. Because
the no-model default selects an image model, request a video model by id; the
response returns a durable owned `video_...` mp4 asset URL, a `job_id`, and a
`cost.credit_pricing` receipt just like an image create.

```bash
image-skill create \
  --model fal.ltx-video-13b-distilled \
  --prompt "A slow dolly push-in on a steaming espresso cup on a cafe counter, morning light" \
  --aspect-ratio 16:9 \
  --json
```

Inspect parameters, output media type, and cost first with `image-skill models
show fal.ltx-video-13b-distilled --json`. Video runs synchronously through the
same create call and can take longer than an image; the returned `assets[].url`
is an owned `video/mp4`.

For create models with wired reference support, pass owned reference assets
with the model's advertised reference role. Kling element routes use
`--element-frontal IMAGE[@ELEMENT_INDEX]` and
`--element-reference IMAGE[@ELEMENT_INDEX[:REFERENCE_INDEX]]`; flat
reference-image routes use `--reference-image IMAGE[@INDEX]`; Fal DreamO also
accepts `:TASK` where `TASK` is `ip`, `id`, or `style`. The public CLI uploads
local paths and external URLs first, then
sends top-level `references[]` entries with Image Skill `asset_id` values to
`/v1/create`. Do not pass provider-native `elements`, `frontal_image_url`,
`reference_image_urls`, `first_image_url`, `second_image_url`, `images`, or
`*_reference_task` through `model_parameters`; provider-private URLs are
resolved server-side after ownership and media-policy validation.

```bash
image-skill create \
  --model fal.kling-image-o3-text-to-image \
  --prompt "Place the same character in a clean studio campaign" \
  --element-frontal ./character-front.png@0 \
  --element-reference ./character-side.webp@0:0 \
  --output-count 2 \
  --max-estimated-usd-per-image 0.06 \
  --json
```

```bash
image-skill create \
  --model fal.dreamo \
  --prompt "Studio portrait preserving identity with a bolder editorial style" \
  --reference-image ./identity.png@0:id \
  --reference-image ./style.webp@1:style \
  --model-parameters-json '{"image_size":{"width":1280,"height":720}}' \
  --max-estimated-usd-per-image 0.06 \
  --json
```

High-resolution examples:

```bash
image-skill create \
  --prompt "Campaign-ready product image of a compact field camera" \
  --intent final \
  --max-estimated-usd-per-image 0.07 \
  --json

image-skill create \
  --prompt "Campaign-ready product image of a compact field camera" \
  --model fal.gemini-3-pro-image-preview \
  --model-parameters-json '{"resolution":"4K"}' \
  --max-estimated-usd-per-image 0.30 \
  --json

image-skill create \
  --prompt "Campaign-ready product image of a compact field camera" \
  --model xai.grok-imagine-image-quality \
  --model-parameters-json '{"resolution":"2k"}' \
  --max-estimated-usd-per-image 0.07 \
  --json

image-skill edit \
  --input-asset-id image_... \
  --prompt "preserve the subject and make this campaign-ready" \
  --model fal.nano-banana-2-edit \
  --model-parameters-json '{"resolution":"4K"}' \
  --accept-unknown-cost \
  --json
```

`model_parameters` must be validated against the selected model/capability
schema before any provider call or paid reservation. Unknown fields fail closed
unless the capability explicitly allows additional properties. This is how
Image Skill preserves rare model controls without turning every
provider-specific parameter into a top-level flag.
In the current preview, Fal create/edit, xAI quality generation, and OpenAI GPT
Image 2 expose the executable provider-native controls listed in the selected
model schema. GPT Image 2 create has request-aware output-token credit quotes
for concrete quality/size requests; GPT Image 2 edit still requires
unknown-cost acceptance before execution, but records usage-priced provider cost
after execution when OpenAI returns token usage. Provider-native controls remain
visible for planning and fail closed until their capability schema marks them
executable. Hosted
`create --dry-run` validates `model_parameters` against the selected model,
returns accepted keys/provenance and request-aware credit pricing for planning,
and never executes provider controls or consumes credits.
For dry-run responses, `cost.credit_pricing.credits_required` is the planned
live execution debit for the selected model. The actual debit for the dry run is
`quota.consumed_credits: 0`.
Authenticated hosted create dry-runs also create a recoverable planned job:
`jobs show` returns `status: "planned"` with `plan_receipt`, and `activity`
emits `job.planned`. Planned receipts do not create downloadable media assets or
usage debits.

Minimum success data:

```json
{
  "job_id": "job_...",
  "capability": {
    "id": "is.image.generate.xai-grok-imagine-image-quality.v1"
  },
  "assets": [
    {
      "asset_id": "image_...",
      "path": "https://media.image-skill.com/a/image_abc123.png",
      "mime_type": "image/png",
      "url": "https://media.image-skill.com/a/image_abc123.png",
      "content_length": 333444,
      "width": 2048,
      "height": 2048
    }
  ],
  "cost": {
    "estimated_usd": 0.07,
    "credit_pricing": {
      "credit_unit_usd": 0.01,
      "credits_required": 12,
      "estimated_provider_cost_usd": 0.07,
      "estimated_revenue_usd": 0.12,
      "pricing_confidence": "known"
    }
  },
  "request": {
    "output_count": 1,
    "selection": {
      "policy": "hosted_default_create_v1",
      "reason": "hosted default selected the strongest currently available quality-first create model",
      "intent": "explore",
      "capability": {
        "id": "is.image.generate.xai-grok-imagine-image-quality.v1"
      },
      "model_parameters": {
        "keys": ["resolution"],
        "defaults_applied": ["resolution=2k"],
        "source": "default_policy"
      },
      "output": {
        "resolution_class": "2k",
        "expected_width": null,
        "expected_height": null,
        "expected_min_short_edge": 2048
      }
    }
  },
  "safety": {
    "status": "allowed"
  }
}
```

When hosted artifact storage is configured, `url` is an Image Skill-owned URL.
Agents should prefer `assets[].url` over provider-origin URLs and should not
need provider account access to fetch outputs.

Hosted create does not accept `--output-dir`. A future download/fetch command
may add CLI-side local file convenience while preserving hosted artifact URLs as
the source of truth.

If provider generation succeeds but artifact storage fails, the command returns
`ARTIFACT_STORAGE_WRITE_FAILED` with exit `9` and `retryable: false`. Agents
should not retry the whole create blindly, because that may duplicate paid
provider spend.

Hosted free-preview API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/create \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "prompt": "A compact field camera on a stainless workbench",
    "intent": "explore",
    "aspect_ratio": "1:1",
    "output_count": 1,
    "max_estimated_usd_per_image": 0.07
  }'
```

Hosted free-preview create currently requires owned artifact storage and returns
one `assets[]` entry per output with `assets[].url` under
`https://media.image-skill.com/...` on success.

### `image-skill upload`

Normalizes a local image path or remote image URL into an Image Skill-owned
input asset for later edit workflows.

```bash
image-skill upload ./source.png --json
image-skill upload https://example.com/source.png --json
```

The CLI reads local files and remote URLs client-side, then sends image bytes to
`POST /v1/upload`. The hosted API does not fetch arbitrary remote URLs in this
preview. This keeps server-side URL fetching out of the public upload path.

Minimum success data:

```json
{
  "request": {
    "source_kind": "local_path",
    "filename": "source.png",
    "remote_origin": null
  },
  "asset": {
    "asset_id": "image_...",
    "job_id": "job_...",
    "kind": "uploaded",
    "url": "https://media.image-skill.com/a/image_abc123.png",
    "mime_type": "image/png",
    "content_length": 12345
  },
  "upload": {
    "bytes": 12345,
    "mime_type": "image/png",
    "sha256": "...",
    "policy": {
      "status": "allowed"
    }
  }
}
```

Supported preview MIME types are `image/png`, `image/jpeg`, `image/webp`,
`image/gif`, and `image/avif`. Unsupported input returns
`INPUT_POLICY_DENIED` with exit `6`. Responses never include local paths, raw
bytes, base64 payloads, full remote URLs, bucket names, or object keys.

### `image-skill edit`

Edits an Image Skill-owned input asset or client-normalized local/remote image
with one hosted provider-backed edit model.

```bash
image-skill edit \
  --input ASSET_ID_OR_PATH_OR_URL \
  --mask MASK_ASSET_ID_OR_PATH_OR_URL \
  --prompt "Remove the background and keep natural object shadows" \
  --accept-unknown-cost \
  --json
```

If `--input` is a local path or external URL, the public CLI first normalizes it
through the same upload resolver as `image-skill upload`, then sends only the
resulting `asset_id` to `POST /v1/edit`. If `--input` is an Image Skill asset id
or owned asset URL, edit uses that owned asset directly.
For models with wired mask support, `--mask` follows the same upload/asset-id
resolver and sends only `mask_asset_id`; never pass provider-native `mask_url`
through `model_parameters`.
For models with wired reference support, pass owned reference assets with the
model's advertised reference role. Kling element routes use
`--element-frontal IMAGE[@ELEMENT_INDEX]` and
`--element-reference IMAGE[@ELEMENT_INDEX[:REFERENCE_INDEX]]`; flat
reference-image routes use `--reference-image IMAGE[@INDEX[:TASK]]`. The
public CLI uploads local paths and external URLs first, then sends top-level
`references[]` entries with Image Skill `asset_id` values. For Kling element
routes, `--element-frontal ./front.png@0` becomes role `element_frontal` for
element index `0`, and `--element-reference ./side.webp@0:0` becomes role
`element_reference` for the same element with reference slot `0`. For DreamO
create, `--reference-image ./identity.png@0:id` becomes role
`reference_image`, index `0`, and `reference_task` `id`. For xAI edit,
`--reference-image ./reference.png@0` becomes the second ordered source image;
the primary `--input` asset remains the first source image. Do not pass
provider-native `elements`, `image_url`, `image_urls`, `frontal_image_url`,
`reference_image_urls`, `first_image_url`, `second_image_url`, `images`, or
`*_reference_task` through `model_parameters`; provider-private URLs are
resolved server-side after ownership and media-policy validation.
Current public `references[]` support covers Kling Image O1, Kling Image O3
image-to-image/text-to-image, Kling Image v3 image-to-image/text-to-image, and
Fal DreamO create plus xAI Grok Imagine image edit/quality edit. Kling requests
may contain at most 40 reference entries across at most 10 contiguous element
indexes starting at `0`; each referenced element requires one frontal image and
may include up to three additional reference images. DreamO accepts up to two
contiguous `reference_image` indexes starting at `0`, each with optional
`reference_task` `ip`, `id`, or `style`. xAI edit accepts up to two contiguous
`reference_image` indexes starting at `0` and does not accept `reference_task`.
Reference assets must be Image Skill-owned PNG, JPEG, or WebP images with
known non-empty byte length up to 10MB, known width and height of at least
300px, and aspect ratio from 0.40 to 2.50.

```bash
image-skill edit \
  --model fal.kling-image-o3-image-to-image \
  --input ./starting-frame.png \
  --element-frontal ./character-front.png@0 \
  --element-reference ./character-side.webp@0:0 \
  --prompt "Place the same character in a clean studio product portrait" \
  --accept-unknown-cost \
  --json
```

Direct `/v1/edit` callers use the same owned-asset contract:

```json
{
  "input_asset_id": "image_starting_frame",
  "model": "fal.kling-image-o3-image-to-image",
  "prompt": "Place the same character in a clean studio product portrait",
  "references": [
    {
      "asset_id": "image_character_front",
      "role": "element_frontal",
      "index": 0
    },
    {
      "asset_id": "image_character_side",
      "role": "element_reference",
      "index": 0,
      "reference_index": 0
    }
  ]
}
```

Preview hosted create/edit supports model-specific provider-backed paths such
as Fal Gemini 3 Pro Image Preview Create (`fal.gemini-3-pro-image-preview`),
Fal Nano Banana 2 Edit (`fal.nano-banana-2-edit`), Fal Ideogram V2 Edit
(`fal.ideogram-v2-edit`), Fal Gemini 3 Pro Image
Preview Edit (`fal.gemini-3-pro-image-preview-edit`), Fal FLUX Pro 1.1 Ultra
Create (`fal.flux-pro-v1-1-ultra`), Fal FLUX Pro Kontext Edit
(`fal.flux-pro-kontext`), Fal FLUX Pro Kontext Max Edit
(`fal.flux-pro-kontext-max`), Fal Seedream 5.0 Lite Create
(`fal.bytedance-seedream-v5-lite-text-to-image`), Fal Seedream 5.0 Lite Edit
(`fal.bytedance-seedream-v5-lite-edit`), Fal Seedream 4.5 Create
(`fal.bytedance-seedream-v4-5-text-to-image`), Fal Seedream 4.5 Edit
(`fal.bytedance-seedream-v4-5-edit`), Fal Nano Banana Pro Create
(`fal.nano-banana-pro`), Fal Nano Banana Pro Edit
(`fal.nano-banana-pro-edit`), GPT Image 1.5 Create
(`openai.gpt-image-1.5`), GPT Image 1.5 Edit
(`openai.gpt-image-1.5-edit`), and GPT Image 2 Edit
(`openai.gpt-image-2-edit`) when their provider credentials are configured.
Fal Gemini 3 Pro Image Preview create/edit has known per-image pricing: 1K/2K
requests quote `$0.15` provider cost and 4K quotes the doubled provider tier.
Fal Nano Banana Pro create/edit uses the same `$0.15` standard and doubled 4K
provider tier. Fal FLUX Pro 1.1 Ultra Create quotes `$0.06` provider cost per
image. Fal FLUX Pro Kontext Edit quotes `$0.04` provider cost per image, and
Fal FLUX Pro Kontext Max Edit quotes `$0.08` provider cost per image. Fal
Seedream 4.5 create/edit quotes `$0.04` provider cost per image.
Fal Seedream 5.0 Lite create/edit quotes `$0.035` provider cost per image. Fal
Z-Image Turbo create/edit quotes `$0.005/MP` when `image_size` is explicit or
derived from aspect ratio; edit `auto` remains unknown-cost. GPT Image 1.5
create quotes output-token estimates for concrete quality/size requests using
OpenAI's fixed-size token table; GPT Image 1.5 edit remains preflight
unknown-cost because edit input image/text tokens are provider-metered, then
records usage-priced provider cost when OpenAI returns token usage. GPT Image 2
create quotes output-token estimates for concrete quality/size requests. GPT
Image 2 edit remains preflight unknown-cost because edit input image/text tokens
are provider-metered, then records usage-priced provider cost when OpenAI
returns token usage. Other edit paths without machine-readable pricing require
`--accept-unknown-cost` until a stable price source is captured. Responses
include a new generated asset URL, job id, safety state, quota consumption, and
input asset metadata where
applicable. Responses do not include raw prompts, source bytes, base64
payloads, local paths, full external URLs, bucket names, or object keys.

Provider/model names in this paragraph are preview provenance, not the primary
public UX. The public selection surface should be Image Skill capabilities and
model-parameter schemas; provider/model details belong in explicit
provenance/debug output.

### `image-skill assets show`

Inspects an Image Skill-owned asset URL or hosted asset id.

```bash
image-skill assets show \
  https://media.image-skill.com/a/image_abc123.png \
  --json
```

For asset-id lookup, use hosted auth:

```bash
image-skill assets show image_... --json
```

Minimum success data:

```json
{
  "request": {
    "reference": "image_...",
    "reference_type": "asset_id"
  },
  "asset": {
    "asset_id": "image_...",
    "job_id": "job_...",
    "url": "https://media.image-skill.com/a/image_abc123.png",
    "mime_type": "image/png",
    "content_length": 12345,
    "width": 1024,
    "height": 1024,
    "source": "hosted_metadata"
  }
}
```

External URLs are rejected. Older assets created before hosted asset metadata
was recorded may still be inspectable by Image Skill-owned URL.

### `image-skill assets get`

Downloads an Image Skill-owned asset URL or hosted asset id to a local file.

```bash
image-skill assets get \
  https://media.image-skill.com/a/image_abc123.png \
  --output ./result.png \
  --json
```

The command refuses to overwrite existing files unless `--overwrite` is
explicit. It verifies byte length when the asset server provides a
`content-length` header.

### `image-skill jobs show`

Inspects a hosted Image Skill job visible to the authenticated agent.

```bash
image-skill jobs show job_... --json
```

Output includes public job status, trace id, timestamps, capability id, cost
summary, safety status, and Image Skill-owned asset metadata. Provider/model
provenance is available only through explicit provenance/debug affordances for
authorized actors. Default output does not include raw prompts, generated bytes, provider
credentials, DB/storage keys, bucket names, or local paths.

### `image-skill jobs wait`

Waits for a hosted Image Skill job to reach a terminal status.

```bash
image-skill jobs wait job_... --timeout-ms 30000 --poll-interval-ms 1000 --json
```

Completed jobs return immediately. Non-terminal jobs poll until completion,
failure, cancellation, or deterministic timeout.

### `image-skill activity list`

Lists recent hosted activity ledger events visible to the authenticated agent.

```bash
image-skill activity list --limit 20 --json
image-skill activity list --subject job_... --json
```

Activity is the ledger, not the work queue. Use it to find recent event IDs,
related job IDs, asset IDs, usage IDs, feedback IDs, trace IDs, status changes,
and product-memory writes. Use `jobs show` or `jobs wait` when you need
operational recovery, polling, retry judgment, or final job assets.

Minimum success data:

```json
{
  "events": [
    {
      "event_id": "evt_...",
      "type": "job.completed",
      "occurred_at": "2026-05-05T19:00:23.000Z",
      "summary": "Create job completed",
      "operation": "create",
      "subject": {
        "type": "job",
        "id": "job_..."
      },
      "links": {
        "job_id": "job_...",
        "asset_ids": ["image_..."],
        "feedback_id": null,
        "usage_event_id": "usage_..."
      },
      "status": "completed",
      "cost": {
        "estimated_usd": 0.025
      }
    }
  ],
  "source": "hosted_activity_ledger"
}
```

The ledger hides provider and storage implementation details by default. It is
safe to cite `evt_...`, `job_...`, `image_...`, `usage_...`, `feedback_id`,
and `trace_id` values in feedback.

Hosted API equivalent:

```bash
curl -sS "https://api.image-skill.com/v1/activity?limit=20&subject=job_..." \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN"
```

### `image-skill activity show`

Shows one hosted activity event or the latest events related to one subject.

```bash
image-skill activity show evt_... --json
image-skill activity show job_... --json
image-skill activity show image_... --json
image-skill activity show sig_... --json
```

`activity show` accepts activity event IDs plus job, asset, usage, feedback, and
trace references. When the reference is a subject rather than one exact event,
the response includes matching ledger events so an agent can cite the right
event without reading telemetry logs.

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/activity/evt_... \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN"
```

### Activity Event Registry

Activity `type` values are stable public contract values. Do not infer new
event names from provider responses or telemetry logs; use only the registry
below.

| Event type                                 | Subject    | Operation   | Emitted when                                                       | Stable links                                                       |
| ------------------------------------------ | ---------- | ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `job.completed`                            | `job`      | create/edit | A hosted create or edit job reaches a terminal state.              | `job_id`, `asset_ids`, `usage_event_id`                            |
| `job.planned`                              | `job`      | create      | An authenticated create dry-run stores a recoverable plan receipt. | `job_id`                                                           |
| `asset.created`                            | `asset`    | create/edit | A hosted create or edit produces an output asset.                  | `job_id`, `asset_ids`, `usage_event_id`                            |
| `asset.uploaded`                           | `asset`    | upload      | A public edit workflow uploads or imports input media.             | `job_id`, `asset_ids`, `usage_event_id`                            |
| `usage.credit_consumed`                    | `usage`    | usage       | A creative operation records a preview-credit entry.               | `job_id`, `usage_event_id`                                         |
| `feedback.created`                         | `feedback` | feedback    | Hosted agent feedback is accepted into product memory.             | `feedback_id`                                                      |
| `feedback.github_queue.processed`          | `feedback` | feedback    | Feedback is processed by the GitHub implementation queue handoff.  | `feedback_id`                                                      |
| `payment.checkout_session.created`         | `payment`  | payment     | A Stripe Checkout session is created and awaits external action.   | `quote_id`, `payment_attempt_id`, `checkout_session_id`            |
| `credits.payment_backed_granted`           | `credit`   | credits     | Verified payment fulfillment grants paid credits.                  | `quote_id`, `receipt_id`, `credit_event_id`                        |
| `credits.payment_backed_refunded`          | `credit`   | credits     | A Stripe refund debits payment-backed credits.                     | `quote_id`, `receipt_id`, `payment_reversal_id`, `credit_event_id` |
| `credits.payment_backed_disputed`          | `credit`   | credits     | A Stripe dispute debit applies to payment-backed credits.          | `quote_id`, `receipt_id`, `payment_reversal_id`, `credit_event_id` |
| `credits.payment_backed_reinstated`        | `credit`   | credits     | Stripe dispute funds were reinstated and recorded.                 | `quote_id`, `receipt_id`, `payment_reversal_id`                    |
| `credits.payment_backed_reversal_pending`  | `credit`   | credits     | A reversal was recorded but could not be fully applied.            | `quote_id`, `receipt_id`, `payment_reversal_id`                    |
| `credits.payment_backed_reversal_rejected` | `credit`   | credits     | A reversal was rejected because it could not safely reconcile.     | `quote_id`, `receipt_id`, `payment_reversal_id`                    |

`feedback.github_queue.processed` includes `details.github_queue` with
machine-readable lifecycle fields such as `state`, `reason`, `issue_urls`,
`issue_numbers`, `mode`, and `github_mutation`. Agents should use it to learn
whether submitted feedback was promoted, skipped, deduped, blocked, or already
mirrored without reading private repository artifacts.
`job.planned` includes `details.plan_receipt` for authenticated hosted create
dry-runs. It is a recoverable planning receipt, not completed media work:
planned outputs do not have durable asset IDs, download URLs, usage debits, or
provider execution.

If a response includes an event type outside this registry, treat it as a
contract bug and submit `image-skill feedback create --json` with the event ID
and trace ID.

### `image-skill feedback create`

Leaves structured product feedback in hosted Image Skill product memory.
At minimum, provide `--title` and `--body`; Image Skill accepts narrative
feedback and adds quality guidance server-side. Use the structured fields below
when the agent already knows them.

```bash
image-skill feedback create \
  --type user_feedback \
  --title "Short concrete title" \
  --body "What happened, what was expected, and why it matters" \
  --command "Command or workflow observed" \
  --expected "Expected result" \
  --actual "Actual result" \
  --proof-needed "What would prove this is handled" \
  --surface cli,docs \
  --evidence trace:TRACE_ID \
  --severity medium \
  --confidence high \
  --next-state watch \
  --json
```

Hosted feedback requires `IMAGE_SKILL_TOKEN` and persists through
`https://api.image-skill.com/v1/feedback`. The hosted API fails closed if
durable hosted feedback storage is unavailable.

JSON errors may include `error.recovery` with machine-readable fields such as
`required_flag`, `suggested_command`, `docs_url`, or `retry_after_seconds`.
Agents should prefer those fields over parsing prose error messages. For
example, `BUDGET_REQUIRES_CONFIRMATION` returns
`required_flag: "--accept-unknown-cost"`.

`whoami`, `usage quota`, `quota`, `credits quote`, `credits buy`,
`credits status`, `create`, `activity list`,
`activity show`, and `feedback create` accept `--token-stdin` for stdin-based
secret handoff.
`credits methods` and `credits packs list` do not require auth.

Feedback should avoid raw prompts, provider keys, generated image bytes, source
image bytes, and private user data.

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/feedback \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "type": "user_feedback",
    "title": "Short concrete title",
    "body": "What happened, what was expected, and why it matters",
    "command": "Command or workflow observed",
    "expected": "Expected result",
    "actual": "Actual result",
    "proof_needed": "What would prove this is handled",
    "surface": ["cli", "docs"],
    "evidence": ["trace:TRACE_ID"],
    "severity": "medium",
    "confidence": "high",
    "next_state": "watch"
  }'
```

### Planned Resource Commands

`jobs list`, `assets list`, `assets delete`, and async job cancellation are
planned public resource commands. They are not part of the current public
allowlist until the hosted service backs them and this contract lists their
exact command shapes. `activity list/show` is available now for ledger
readback, but it is not a substitute for future job listing, cancellation, or
retry controls.
