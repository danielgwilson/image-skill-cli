---
name: image-skill
description: Use Image Skill when an agent needs to create, edit, inspect, iterate on, or manage generated images through the hosted image-skill service and thin CLI/client. Also use it when an agent needs to bootstrap restricted access, check quota, request human claim, or leave product feedback.
homepage: https://image-skill.com
docs: https://image-skill.com/llms.txt
metadata:
  {
    "status": "preview-contract",
    "cli": "image-skill",
    "canonical_skill_url": "https://image-skill.com/skill.md",
    "canonical_api_url": "https://api.image-skill.com",
  }
---

# Image Skill

Status: preview hosted-product contract.

Image Skill is a CLI-first hosted creative runtime for agents. Use it to create, edit, inspect, iterate on, and reuse generated images.

Public agents should depend on the hosted contract, a thin CLI/client, stable JSON outputs, trace IDs, job IDs, artifact references, quota/cost state, and feedback commands.

Core rule: Image Skill should preserve model capability, not flatten it away.
Use capability introspection and model parameter schemas before assuming what a
model can do. Normalized controls are for common paths; model parameters are
how rare or provider-native capabilities remain available without turning the
whole CLI into a lowest-common-denominator interface.

## First Run

Install the agent-facing skill from the public mirror repo when the runtime
supports skills.sh-compatible installation:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-skill -g -a codex -y
```

Install the executable CLI from npm:

```bash
npm install -g image-skill
```

Check service and client health:

```bash
image-skill doctor --json
```

Bootstrap restricted agent access:

```bash
image-skill signup --agent \
  --agent-contact CONTACT_OR_SPONSOR_INBOX \
  --agent-name AGENT_NAME \
  --runtime RUNTIME_NAME \
  --save \
  --json
```

`--save` stores the returned hosted token in the public CLI config with 0600
permissions and redacts it from stdout. Use `--show-token` only when the agent
runtime has a separate secret store and needs the raw token once.

In the preview contract, `--agent-contact` means the accountable contact,
sponsor, operator, or agent inbox for the restricted agent identity. If no
individual human is in the loop, use a durable operator/team/agent inbox that
can receive future claim, billing, or abuse notices. Do not invent a person or
use a throwaway inbox.
`example.invalid` addresses are only appropriate inside documented harness or
proof runs. `--human-email` remains accepted as a compatibility alias for
`--agent-contact`.

If the runtime supports stdin secret handoff, prefer `--token-stdin` for
`whoami`, `usage quota`, `quota`, `create`, and `feedback create` instead of
placing the token in command args.

Inspect identity and quota:

```bash
image-skill whoami --json
image-skill usage quota --json
```

The preview hosted signup path currently uses the agent-contact inbox above.
Future payment-backed signup paths are planned so capable agents can become
bounded paying users without making human claim the only path to meaningful
usage.

Credit quote and buy flow:

```bash
image-skill credits methods --json
image-skill credits packs list --json
image-skill credits quote \
  --pack starter-500 \
  --payment-method stripe_checkout \
  --idempotency-key stripe-pack-quote-run-001 \
  --json
image-skill credits quote --credits 137 --json
image-skill credits buy \
  --provider stripe \
  --quote-id QUOTE_ID \
  --idempotency-key stripe-buy-run-001 \
  --json
image-skill credits fake-purchase \
  --quote-id QUOTE_ID \
  --idempotency-key purchase-run-001 \
  --json
```

This is the agent-facing precursor to future MPP, Stripe, wallet, or
delegated-card adapters. Packs are the default Stripe Checkout UX; exact
`--credits` quotes remain available when an agent already knows the required
budget. `credits methods --json` tells agents which rails are currently
available, which buyer modes they support, and whether browser/human action is
required before an agent tries to quote or buy. `credits buy --provider stripe`
returns a
Stripe-hosted `checkout_url` for a `stripe_checkout` quote and does not grant
credits until verified webhook fulfillment succeeds. `credits fake-purchase`
returns `live_money:false`, moves no live money, accepts no payment credential,
and exists so agents can exercise the quote, receipt, credit-ledger, and
activity-audit contract safely.
One Image Skill credit is `$0.01`. Creative operations debit model-priced
credits, not a flat one-credit unit. Use `models show MODEL_ID --json` and the
operation response `cost.credit_pricing` to see `credits_required`,
`estimated_provider_cost_usd`, and pricing confidence.

## Create An Image

Inspect models first:

```bash
image-skill models --json
image-skill models list --json
image-skill models show openai.gpt-image-2 --json
```

`models show` is the first detailed discovery surface for agents. It exposes
operations, media inputs/outputs, model-parameter schemas, fixed and wired
controls, cost/latency class, safety behavior, and migration hints. Use
`capabilities` when you need the schema language directly.

Create with hosted artifact URLs and JSON:

```bash
image-skill create \
  --prompt "A product mockup of a compact field camera on a stainless workbench" \
  --intent explore \
  --aspect-ratio 1:1 \
  --max-estimated-usd-per-image 0.05 \
  --json
```

For model-specific controls that are advertised by models/capabilities, use a
validated JSON parameter payload instead of inventing coarse global categories:

```bash
image-skill create \
  --prompt-file ./prompt.md \
  --intent finalize \
  --model MODEL_ID \
  --model-parameters-json '{"seed":1234}' \
  --max-usd 0.25 \
  --json
```

In the current preview, Fal create/edit expose executable `seed`, while OpenAI
GPT Image 2 exposes documented provider-native controls such as size, output
format, compression, background, moderation, and its provider-native quality
parameter through validated `model_parameters`. These are model-specific
controls, not universal Image Skill tiers.

Hosted free-preview API:

```bash
curl -sS https://api.image-skill.com/v1/create \
  -H "authorization: Bearer $IMAGE_SKILL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"prompt":"A product mockup of a compact field camera on a stainless workbench","intent":"explore","aspect_ratio":"1:1","max_estimated_usd_per_image":0.05,"model_parameters":{"seed":1234}}'
```

Expected behavior:

- returns `job_id`, `trace_id`, `asset_ids`, artifact references, cost estimate, and safety status;
- returns Image Skill-owned artifact references under `assets[].url`;
- emits service telemetry;
- refuses when quota, claim state, scopes, content policy, budget guard, provider availability, or safety rules do not allow the job.

## Fetch Generated Assets

Upload an existing image into an Image Skill-owned input asset:

```bash
image-skill upload PATH_OR_URL --json
```

Use upload before edit workflows. The CLI normalizes local paths and remote
URLs client-side; public responses include `asset_id`, `job_id`, hosted URL,
MIME type, byte length, and SHA-256 hash, but never local paths, full remote
URLs, raw bytes, base64 payloads, buckets, or object keys.

Edit an owned input asset, local path, or remote URL:

```bash
image-skill edit \
  --input ASSET_ID_OR_PATH_OR_URL \
  --prompt "Remove the background and keep natural object shadows" \
  --accept-unknown-cost \
  --json
```

For local paths and external URLs, the public CLI uploads the input first and
then edits the resulting Image Skill-owned asset id. Preview hosted edit uses
Fal Nano Banana 2 Edit and consumes model-priced restricted free-preview
credits after provider success.

Inspect an Image Skill-owned asset:

```bash
image-skill assets show ASSET_ID_OR_URL --json
```

Download it without repeating provider work:

```bash
image-skill assets get ASSET_ID_OR_URL --output ./result.png --json
```

`assets get` refuses to overwrite existing files unless `--overwrite` is
explicit. Use only Image Skill-owned asset URLs or asset ids returned by
Image Skill.

## Inspect Generated Jobs

Inspect a hosted job:

```bash
image-skill jobs show JOB_ID --json
```

Wait for a hosted job to complete:

```bash
image-skill jobs wait JOB_ID --json
```

Use `jobs show` or `jobs wait` instead of telemetry or history files when you
need status, cost, safety, public capability id, timestamps, and reusable assets
for a hosted create.

## Inspect Activity

List recent ledger events:

```bash
image-skill activity list --limit 20 --json
```

Show one event or subject:

```bash
image-skill activity show EVENT_OR_JOB_OR_ASSET_OR_FEEDBACK --json
```

Use `activity` when you need an audit trail: recent jobs, assets, usage events,
feedback acceptance, trace IDs, and status changes that can be cited in product
feedback. Do not use `activity` as a wait or recovery command. Use `jobs show`
or `jobs wait` for operational job state, final assets, and retry judgment.

## Feedback

If a workflow fails, is confusing, succeeds with friction, or suggests a missing feature, leave product feedback:

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

Good feedback includes the command, trace ID, expected result, actual result, and whether the issue is CLI affordance, model output, auth/quota, docs, provider reliability, or product judgment.
If the agent cannot fill every structured field, still submit `--title` and
`--body`; narrative feedback is accepted, and quality warnings remain available
when the signal lacks enough triage evidence.

When a JSON command fails, inspect `error.recovery` before retrying. Recovery
may include `required_flag`, `suggested_command`, `docs_url`, or
`retry_after_seconds`; use these fields instead of scraping prose messages.

Public feedback is hosted by default. With `IMAGE_SKILL_TOKEN` set, the CLI
submits to `https://api.image-skill.com/v1/feedback` and the service fails
closed if durable hosted feedback storage is unavailable.

## Safety And Cost

- Check `usage quota --json` before costly workflows. `quota --json` remains a
  compatibility alias.
- Use `credits methods --json` to inspect payment rail availability, buyer
  modes, limits, and recovery commands before quoting or buying.
- Use `credits packs list --json` to inspect recommended live-money packs.
- Use `credits quote --pack PACK_ID --payment-method stripe_checkout --json`
  for the default Stripe Checkout path.
- Use `credits quote --credits CREDITS --json` for exact bounded custom
  top-ups when the required budget is already known.
- Use `credits buy --provider stripe --json` only to create a Stripe-hosted
  checkout action. Session creation itself does not grant credits.
- Use `credits fake-purchase --json` only for preview credit-ledger proof; it
  is not live settlement and must not receive payment credentials.
- Treat credits as prepaid cents of Image Skill value. Operation debits are
  model-aware and appear in `cost.credit_pricing`.
- Use dry-run modes and explicit budget caps for exploration.
- Do not mistake quota limits or free-preview policy for creative quality
  labels. Ask capabilities what a capability supports.
- Do not bypass claim state, scopes, policy checks, or telemetry.
- Do not create deceptive, harassing, infringing, or unsafe media.
- Escalate to the human when a workflow needs spend, identity, legal judgment, or external publishing.

## Reference

- Full machine-readable contract: `https://image-skill.com/llms.txt`
- CLI command contract: `https://image-skill.com/cli.md`
- Product homepage: `https://image-skill.com`
