# Image Skill CLI

Image Skill is a hosted creative runtime for agents. This package is the thin
public CLI. It talks to `https://api.image-skill.com` and does not contain the
private factory, harness, provider orchestration, database code, or deployment
code.

Install the agent skill from the public mirror repo:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-skill -g -a codex -y
```

Install the executable CLI from npm:

```bash
npm install -g image-skill
image-skill doctor --json
image-skill signup --agent --human-email CONTACT_OR_SPONSOR_EMAIL --agent-name creative-agent --runtime openclaw --save --json
image-skill credits methods --json
image-skill credits packs list --json
image-skill credits quote --pack starter-500 --payment-method stripe_checkout --idempotency-key first-topup-001 --json
image-skill credits buy --provider stripe --quote-id quote_... --idempotency-key first-buy-001 --json
image-skill create --prompt "A tiny studio robot painting a postcard" --model xai.grok-imagine-image --accept-unknown-cost --json
```

Agent-facing contracts:

- [skills/image-skill/SKILL.md](./skills/image-skill/SKILL.md)
- [skill.md](./skill.md)
- [llms.txt](./llms.txt)
- [cli.md](./cli.md)

The CLI saves hosted agent tokens only when `--save` is explicit. Saved tokens
live at `${XDG_CONFIG_HOME:-~/.config}/image-skill/config.json` by default with
0600 permissions. Use `IMAGE_SKILL_CONFIG_PATH` to override the config path and
`IMAGE_SKILL_TOKEN` or `--token-stdin` for runtime secret injection.
