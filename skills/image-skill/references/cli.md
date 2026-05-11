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
- JSON output must use the standard envelope from `https://image-skill.com/llms.txt`.
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

### `image-skill signup --agent`

Bootstraps restricted agent access.

```bash
image-skill signup --agent \
  --human-email human@example.com \
  --agent-name creative-agent \
  --runtime codex \
  --save \
  --json
```

`--save` stores the returned `isk_r_` token in the public CLI config with 0600
permissions and redacts it from stdout. Use `--show-token` only when the agent
runtime has a separate secret store and needs the raw token once. Do not paste
tokens into prompts, logs, issue text, or feedback.

For shell-based agent runtimes, store the token outside prompts and then expose
it as:

```bash
export IMAGE_SKILL_TOKEN="isk_r_..."
```

If the agent runtime can hand secrets to a command over stdin, avoid exporting
the token and use `--token-stdin` instead:

```bash
printf '%s\n' "$IMAGE_SKILL_TOKEN" | image-skill usage quota --token-stdin --json
```

`--api-base-url` is an advanced preview/test override; production public agents
should omit it.

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
      "method_id": "fake",
      "available": true,
      "live_money": false,
      "buyer_modes": ["agent_only", "hybrid", "human_only"],
      "requires_browser": false,
      "purchase_endpoint": "/v1/credit-purchases"
    },
    {
      "method_id": "stripe_checkout",
      "available": true,
      "live_money": true,
      "buyer_modes": ["hybrid", "human_only"],
      "requires_browser": true,
      "default_pack_id": "starter-500",
      "purchase_endpoint": "/v1/credit-purchases/stripe-checkout-sessions"
    }
  ]
}
```

`available` is environment-dependent. `available:false` means the rail is known
but not currently usable in the queried environment; read `unavailable_reason`
and `recovery`.

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

Requests a bounded credit quote from the hosted service. By default this uses
the harness-safe fake/test settlement rail; agents can request Stripe Checkout
terms with `--payment-method stripe_checkout`. A quote never grants credits.
One Image Skill credit is a stable user-facing value unit worth `$0.01`.
Creative operations can consume more than one credit based on the selected
model's provider cost and Image Skill's margin policy; inspect
`models show MODEL_ID --json` and operation `cost.credit_pricing` for the exact
debit before spending.

```bash
image-skill credits quote --credits 10 --json
```

For retry-stable automation, provide an explicit non-secret idempotency key:

```bash
image-skill credits quote \
  --credits 10 \
  --idempotency-key quote-run-001 \
  --json
```

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
  "accepted_payment_method": "fake",
  "idempotency_key": "quote-run-001",
  "pack_id": null,
  "pack": null,
  "live_money": false
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

Creates a live-provider payment action for a previously returned quote. Stripe
Checkout is the first supported provider. This creates a hosted Stripe Checkout
Session and returns an `action_required` response with `checkout_url`; credits
are granted only after verified Stripe webhook fulfillment succeeds. Session
creation itself must not mutate credit balances.

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
  "checkout_url": "https://checkout.stripe.com/...",
  "credits": 500,
  "amount_cents": 500,
  "currency": "USD",
  "live_money": true,
  "next": {
    "human_action": "open_checkout_url",
    "after_payment": "poll image-skill credits status --payment-attempt-id PAYMENT_ATTEMPT_ID --json or image-skill usage quota --json; credits are granted only after verified webhook fulfillment"
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
    "pack_id": "starter-500"
  },
  "payment_attempt": {
    "payment_attempt_id": "payatt_...",
    "checkout_session_id": "cs_...",
    "checkout_url": "https://checkout.stripe.com/...",
    "attempt_status": "requires_action"
  },
  "receipt": null,
  "credit_event": null,
  "next": {
    "retry_after_seconds": 10,
    "human_action": "open_checkout_url"
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

### `image-skill credits fake-purchase`

Confirms a previously returned fake/test quote and grants bounded
payment-backed credits in the hosted credit ledger. This command is deliberately
named `fake-purchase` because it is a harness-safe settlement precursor:
`live_money:false`, no live money moved, and no payment credential is accepted.

```bash
image-skill credits fake-purchase \
  --quote-id quote_... \
  --idempotency-key purchase-run-001 \
  --json
```

`--idempotency-key` is required because the command mutates credit state even
though the settlement rail is fake/test-only.

Minimum success data:

```json
{
  "state": "succeeded",
  "quote_id": "quote_...",
  "receipt_id": "receipt_...",
  "credit_event_id": "credit_event_...",
  "credits_granted": 10,
  "amount_cents": 10,
  "currency": "USD",
  "accepted_payment_method": "fake",
  "idempotency_key": "purchase-run-001",
  "balance_after": 10,
  "live_money": false
}
```

Hosted API equivalent:

```bash
curl -sS https://api.image-skill.com/v1/credit-purchases \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"quote_id":"quote_...","idempotency_key":"purchase-run-001"}'
```

Do not pass card data, wallet secrets, provider receipts, Stripe secrets, MPP
tokens, SPTs, or any payment credential to credits commands. Stripe Checkout
collects payment details only on Stripe-hosted pages. The public request fields
are `credits`, `pack_id`, `payment_method`, `quote_id`, status reference IDs,
and `idempotency_key`.

### `image-skill models`

First-run creative discovery. Lists public models and shows the full
capability-preserving schema for one model.

```bash
image-skill models --json
image-skill models list --json
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

Image Skill standardizes common controls so agents can work quickly, but it
must not flatten rich model capabilities into coarse universal categories.
Use `model_parameters` for rare or model-specific parameters advertised by the
capability schema.

GPT Image 2 is exposed as `openai.gpt-image-2` for create and
`openai.gpt-image-2-edit` for edit when OpenAI is configured. Inspect these
models before use; OpenAI provider-native controls such as size, output
format, compression, background, moderation, and the upstream
provider-native quality parameter are available only through validated
`model_parameters`.

### `image-skill capabilities`

Schema-language view over the same capability catalog. Use this when you need
the capability abstraction directly rather than starting from a model.

```bash
image-skill capabilities --json
image-skill capabilities list --json
image-skill capabilities show CAPABILITY_ID --json
```

### `image-skill create`

Creates an image or plans a zero-cost dry run.

```bash
image-skill create \
  --prompt "A compact field camera on a stainless workbench" \
  --intent explore \
  --aspect-ratio 1:1 \
  --max-estimated-usd-per-image 0.05 \
  --json
```

Preview-compatible richer shape:

```bash
image-skill create \
  --prompt-file ./prompt.md \
  --intent finalize \
  --model MODEL_ID \
  --aspect-ratio 1:1 \
  --format png \
  --max-usd 0.25 \
  --model-parameters-json '{"seed":1234}' \
  --json
```

`model_parameters` must be validated against the selected model/capability
schema before any provider call or paid reservation. Unknown fields fail closed
unless the capability explicitly allows additional properties. This is how
Image Skill preserves rare model controls without turning every
provider-specific parameter into a top-level flag.
In the current preview, Fal create/edit expose executable `seed`, and OpenAI
GPT Image 2 exposes documented provider-native controls through
`model_parameters`. Provider-native controls remain visible for planning and
fail closed until their capability schema marks them executable.

Minimum success data:

```json
{
  "job_id": "job_...",
  "capability": {
    "id": "is.image.generate.preview.v1"
  },
  "assets": [
    {
      "asset_id": "image_...",
      "path": "https://media.image-skill.com/a/image_abc123.png",
      "mime_type": "image/png",
      "url": "https://media.image-skill.com/a/image_abc123.png"
    }
  ],
  "cost": {
    "estimated_usd": 0.025,
    "credit_pricing": {
      "credit_unit_usd": 0.01,
      "credits_required": 5,
      "estimated_provider_cost_usd": 0.025,
      "estimated_revenue_usd": 0.05,
      "pricing_confidence": "known"
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
    "max_estimated_usd_per_image": 0.05,
    "model_parameters": {
      "seed": 1234
    }
  }'
```

Hosted free-preview create currently requires owned artifact storage and returns
`assets[].url` under `https://media.image-skill.com/...` on success.

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
  --prompt "Remove the background and keep natural object shadows" \
  --accept-unknown-cost \
  --json
```

If `--input` is a local path or external URL, the public CLI first normalizes it
through the same upload resolver as `image-skill upload`, then sends only the
resulting `asset_id` to `POST /v1/edit`. If `--input` is an Image Skill asset id
or owned asset URL, edit uses that owned asset directly.

Preview hosted edit supports model-specific provider-backed edit paths such as
Fal Nano Banana 2 Edit (`fal.nano-banana-2-edit`) and GPT Image 2 Edit
(`openai.gpt-image-2-edit`) when their provider credentials are configured.
Current machine-readable prices are treated as unknown for these edit paths, so
live edit requires `--accept-unknown-cost` until a stable price source is
captured. Responses include a new generated asset URL, job id, safety state,
quota consumption, and input asset metadata. Responses do not include raw
prompts, source bytes, base64 payloads, local paths, full external URLs, bucket
names, or object keys.

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

| Event type                         | Subject    | Operation   | Emitted when                                                      | Stable links                                            |
| ---------------------------------- | ---------- | ----------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `job.completed`                    | `job`      | create/edit | A hosted create or edit job reaches a terminal state.             | `job_id`, `asset_ids`, `usage_event_id`                 |
| `asset.created`                    | `asset`    | create/edit | A hosted create or edit produces an output asset.                 | `job_id`, `asset_ids`, `usage_event_id`                 |
| `asset.uploaded`                   | `asset`    | upload      | A public edit workflow uploads or imports input media.            | `job_id`, `asset_ids`, `usage_event_id`                 |
| `usage.credit_consumed`            | `usage`    | usage       | A creative operation records a preview-credit entry.              | `job_id`, `usage_event_id`                              |
| `feedback.created`                 | `feedback` | feedback    | Hosted agent feedback is accepted into product memory.            | `feedback_id`                                           |
| `feedback.github_queue.processed`  | `feedback` | feedback    | Feedback is processed by the GitHub implementation queue handoff. | `feedback_id`                                           |
| `payment.checkout_session.created` | `payment`  | payment     | A Stripe Checkout session is created and awaits external action.  | `quote_id`, `payment_attempt_id`, `checkout_session_id` |
| `credits.payment_backed_granted`   | `credit`   | credits     | Verified payment or fake-payment proof grants paid credits.       | `quote_id`, `receipt_id`, `credit_event_id`             |

`feedback.github_queue.processed` includes `details.github_queue` with
machine-readable lifecycle fields such as `state`, `reason`, `issue_urls`,
`issue_numbers`, `mode`, and `github_mutation`. Agents should use it to learn
whether submitted feedback was promoted, skipped, deduped, blocked, or already
mirrored without reading private repository artifacts.

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
`credits status`, `credits fake-purchase`, `create`, `activity list`,
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
