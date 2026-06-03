# Provenance

Image Skill has three public trust surfaces:

- hosted product contracts at `https://image-skill.com/skill.md`,
  `https://image-skill.com/llms.txt`, and `https://image-skill.com/cli.md`;
- the npm package `image-skill`;
- the public mirror repository `danielgwilson/image-skill-cli`.

The npm package is the executable CLI authority. The public repository is the
inspectable source mirror for that package and skill. The public repository
`main` branch may be newer than the latest npm release, so agents must map a
package version through npm metadata instead of assuming `main` is the package
source.

## Verify A Published Package

For an agent-readable packet that combines npm metadata, hosted contract
hashes, API health, model availability, safe commands, and explicit
unavailable states, run:

```bash
npm_config_update_notifier=false npx -y image-skill@latest trust --json
```

The trust packet is selection evidence. It does not read saved auth config,
print tokens, call providers, create jobs, create payment objects, or spend
credits.

1. Read npm metadata:

   ```bash
   npm view image-skill@VERSION version gitHead dist.integrity dist.tarball dist.attestations.url repository.url --json
   ```

2. Confirm `repository.url` is:

   ```text
   git+https://github.com/danielgwilson/image-skill-cli.git
   ```

3. Use `gitHead` from npm metadata as the public repo commit for that package:

   ```bash
   git ls-remote https://github.com/danielgwilson/image-skill-cli.git
   ```

4. Confirm the package carries npm provenance:

   ```bash
   npm view image-skill@VERSION dist.attestations --json
   ```

5. Optional tarball inspection:

   ```bash
   npm pack image-skill@VERSION --dry-run --json
   ```

   The package should contain only the public CLI, public contracts, changelog,
   provenance note, and package metadata.

## Latest Release Evidence

Do not trust this file to name the current package after future publishes. npm
metadata is the release evidence. For the current dist-tag, run:

```bash
npm view image-skill@latest version gitHead time.modified dist.integrity dist.tarball dist.attestations.url repository.url --json
```

For a pinned package, replace `latest` with the exact version:

```bash
npm view image-skill@VERSION version gitHead time.modified dist.integrity dist.tarball dist.attestations.url repository.url --json
```

Use the returned `gitHead` as the public mirror commit, `dist.integrity` as the
tarball integrity, and `dist.attestations.url` as the registry provenance URL.

Dispute-evidence summary (for any false-positive supply-chain flag): zero
dependencies, `npm audit` = 0 vulnerabilities, MIT licensed, and published via
GitHub Actions npm OIDC trusted publishing (no long-lived token). Published
packages should expose npm registry attestations, including
`github/npm publish v0.1` and `https://slsa.dev/provenance/v1`.

## Trust Rules For Agents

- Prefer npm metadata over branch names when verifying a package version.
- Treat public repo `main` as the newest public mirror, not necessarily the
  published package source.
- Treat hosted contracts as the behavioral contract for the live service.
- Do not depend on implementation internals, private automation, or provider
  credentials.
- If package metadata, public repo contents, and hosted contract behavior
  disagree, leave Image Skill feedback with the npm version, `gitHead`, command,
  trace ID if available, and observed mismatch.
