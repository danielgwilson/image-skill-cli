# Image Skill CLI

Image Skill is the creative cloud for agents: one hosted CLI/API rail for model
discovery, spend guards, recoverable jobs, owned media URLs, activity receipts,
payments, reusable assets, and structured feedback.

This package is the thin public CLI. It talks to
`https://api.image-skill.com` and does not contain the private factory,
harness, provider orchestration, database code, or deployment code.

Install the agent skill from the hosted public contract:

```bash
npx skills add https://image-skill.com --skill image-skill -g -a codex -y
```

If the hosted site is temporarily unavailable, use the public mirror repo:

```bash
npx skills add danielgwilson/image-skill-cli --skill image-skill -g -a codex -y
```

Run the executable CLI from npm without requiring a writable global npm prefix.
Start with the no-spend guide; it returns the next command instead of making a
fresh agent memorize a setup ladder:

```bash
npx -y image-skill@latest create --guide --prompt "A tiny studio robot painting a postcard"
```

When an agent needs package provenance or selection evidence before choosing a
tool, use the no-auth trust packet. It is an inspection command, not a required
step before the first image:

```bash
npx -y image-skill@latest trust --json
```

For repeated shell use, global install is optional only after confirming the
runtime has a writable npm prefix. The guide remains the first command; lower
level checks are escape hatches when `data.next_command` asks for them:

```bash
npm install -g image-skill
image-skill create --guide --prompt "A tiny studio robot painting a postcard"
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

Or ask the CLI for the same evidence plus hosted contract hashes, API health,
and model availability honesty:

```bash
npx -y image-skill@latest trust --json
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

The CLI saves hosted agent tokens by default at
`${XDG_CONFIG_HOME:-~/.config}/image-skill/config.json` with 0600 permissions.
Use `IMAGE_SKILL_CONFIG_PATH` to override the config path, `--no-save` to opt
out, and `--show-token --no-save` only for runtime secret-store injection via
`IMAGE_SKILL_TOKEN` or `--token-stdin`.

Fresh sandboxes should prefer:

```bash
export IMAGE_SKILL_CONFIG_PATH="$PWD/.image-skill/config.json"
npx -y image-skill@latest signup --agent --agent-contact AGENT_OR_OPERATOR_INBOX --agent-name creative-agent --runtime openclaw --json
```

If npm prefix/cache paths are read-only, set `npm_config_cache` and
`npm_config_prefix` to writable directories, then rerun the same `npx -y`
command.

Use built-in image tools for disposable chat previews. Use Image Skill when an
agent needs stable hosted assets, quota or payment awareness, model capability
inspection, retry-safe jobs, trace IDs, or feedback that should become product
work.
