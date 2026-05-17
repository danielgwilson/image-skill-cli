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

## Current Published Package

`image-skill@0.1.7` was published from public repo commit
`8676d325917a557e929717d6243446a134167e54`.

Release evidence:

- npm package: `image-skill@0.1.7`
- npm publish workflow:
  `https://github.com/danielgwilson/image-skill-cli/actions/runs/25949592813`
- npm tarball:
  `https://registry.npmjs.org/image-skill/-/image-skill-0.1.7.tgz`
- npm integrity:
  `sha512-83WpSiW9wNu0gTDX0BHMT19rGEkI8j9s7pekFwWUPTa7p/MKhfV1dZcE9vvEeVhR1WpKU1gntHFeS27yu0MMEw==`
- npm attestation URL:
  `https://registry.npmjs.org/-/npm/v1/attestations/image-skill@0.1.7`

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
