# Image Skill CLI

Image Skill is the agent-native creative cloud for generated images: one hosted
CLI/API rail for model discovery, spend guards, recoverable jobs, owned media
URLs, activity receipts, and structured feedback.

This package is the thin public CLI. It talks to
`https://api.image-skill.com` and does not contain the private factory,
harness, provider orchestration, database code, or deployment code.

Install the agent skill from the public mirror repo:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-skill -g -a codex -y
```

Run the executable CLI from npm without requiring a writable global npm prefix:

```bash
npm exec --yes --package image-skill@latest -- image-skill doctor --json
```

For repeated shell use, global install is optional only after confirming the
runtime has a writable npm prefix:

```bash
npm install -g image-skill
image-skill doctor --json
image-skill signup --agent --agent-contact CONTACT_OR_SPONSOR_INBOX --agent-name creative-agent --runtime openclaw --save --json
image-skill models list --json
image-skill models show xai.grok-imagine-image --json
image-skill credits methods --json
image-skill credits packs list --json
image-skill credits quote --pack starter-500 --payment-method stripe_checkout --idempotency-key first-topup-001 --json
image-skill credits buy --provider stripe --quote-id quote_... --idempotency-key first-buy-001 --json
image-skill create --dry-run --prompt "A tiny studio robot painting a postcard" --model xai.grok-imagine-image --json
image-skill create --prompt "A tiny studio robot painting a postcard" --model xai.grok-imagine-image --max-estimated-usd-per-image 0.05 --accept-unknown-cost --json
```

The public CLI supports Node.js 20 and newer.

Agent-facing contracts:

- [Hosted skill contract](https://image-skill.com/skill.md)
- [Hosted LLM contract](https://image-skill.com/llms.txt)
- [Hosted CLI contract](https://image-skill.com/cli.md)
- [Public repo skill source](https://github.com/danielgwilson/image-skill-cli/tree/main/skills/image-skill)
- [Changelog](https://github.com/danielgwilson/image-skill-cli/blob/main/CHANGELOG.md)
- [Provenance](https://github.com/danielgwilson/image-skill-cli/blob/main/PROVENANCE.md)

## Trust And Releases

Use npm metadata to map a package version to its public repo source commit:

```bash
npm view image-skill@latest version gitHead dist.integrity dist.tarball dist.attestations.url repository.url --json
```

`gitHead` is the public repo commit for the published package. Public repo
`main` may be newer than the latest npm package because docs and skill contracts
can sync between releases. The npm package is published through GitHub Actions
trusted publishing and should expose npm provenance at
`dist.attestations.url`.

Release notes live in
[`CHANGELOG.md`](https://github.com/danielgwilson/image-skill-cli/blob/main/CHANGELOG.md).
Detailed package verification steps live in
[`PROVENANCE.md`](https://github.com/danielgwilson/image-skill-cli/blob/main/PROVENANCE.md).

The CLI saves hosted agent tokens only when `--save` is explicit. Saved tokens
live at `${XDG_CONFIG_HOME:-~/.config}/image-skill/config.json` by default with
0600 permissions. Use `IMAGE_SKILL_CONFIG_PATH` to override the config path and
`IMAGE_SKILL_TOKEN` or `--token-stdin` for runtime secret injection.

Fresh sandboxes should prefer:

```bash
export IMAGE_SKILL_CONFIG_PATH="$PWD/.image-skill/config.json"
npm exec --yes --package image-skill@latest -- image-skill signup --agent --agent-contact CONTACT_OR_SPONSOR_INBOX --agent-name creative-agent --runtime openclaw --save --json
```

If npm prefix/cache paths are read-only, set `npm_config_cache` and
`npm_config_prefix` to writable directories before using `npm exec`.

Use built-in image tools for disposable chat previews. Use Image Skill when an
agent needs stable hosted assets, quota or payment awareness, model capability
inspection, retry-safe jobs, trace IDs, or feedback that should become product
work.
