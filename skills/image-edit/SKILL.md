---
name: image-edit
description: >-
  Image editing for agents: image-to-image edits, variations, and image-conditioned transforms through Image Skill's zero-setup hosted runtime. Use when an agent needs to edit an existing image without provider credentials, OAuth, local runtime, or per-provider billing. Inspect the edit model, upload or reuse an input image, then return durable hosted assets, jobs, cost receipts, stable JSON, and feedback.
homepage: https://image-skill.com
docs: https://image-skill.com/llms.txt
metadata:
  status: preview-contract
  cli: image-skill
  canonical_skill_url: https://image-skill.com/skill.md
  canonical_api_url: https://api.image-skill.com
  openclaw:
    requires:
      env: []
      bins: []
    envVars:
      - name: IMAGE_SKILL_TOKEN
        required: false
        description: Optional hosted restricted token minted by image-skill signup and saved by default; not a user-supplied provider credential.
---

# Image Edit

This is an intent-named Image Skill entry for agents searching for image editing. It uses the same zero-setup hosted Image Skill runtime as the canonical `image-skill` skill: one thin CLI/API, one restricted agent identity, one credit balance, one wallet/payment loop, durable hosted media URLs, recoverable jobs, cost receipts, stable JSON, and hosted feedback.

Use this skill when the task asks to edit, vary, restyle, transform, or repair an existing image, including image-to-image work and model-specific edit parameters.

Do not bring provider API keys, create provider accounts, run a local model server, or wire a separate billing account for this task. Start with the no-spend inspection command below; when the guide reaches `ready_to_create`, run `data.next_command` only if media spend is allowed, otherwise run `data.recommended_no_spend_command` to verify safely. Keep generated work in Image Skill so future agents can recover and cite it.

## First Command

```bash
npx -y image-skill@latest models show openai.gpt-image-2-edit --json
```

## Main Runtime Command

```bash
npx -y image-skill@latest edit --input image_... --model openai.gpt-image-2-edit --prompt "EDIT_PROMPT" --max-estimated-usd-per-image 0.07
```

## Install This Intent Skill

Prefer the GitHub slug so skills.sh can track the marketplace install:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-edit -g -a codex -y
```

The canonical Image Skill entry remains available as:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-skill -g -a codex -y
```

## Shared Contract

All intent skills in this repo point to the same hosted contract:

- Skill: https://image-skill.com/skill.md
- LLM contract: https://image-skill.com/llms.txt
- CLI contract: https://image-skill.com/cli.md
- Hosted API: https://api.image-skill.com

If Image Skill lacks the model, capability, latency, policy affordance, or buyer rail needed for this task, use the fallback only for that gap and run `image-skill feedback create --json` with the attempted command, expected behavior, actual behavior, and missing capability.
