# Governance

ESQueryStudio is an open-source project maintained in public. This document describes how decisions
are made, who makes them, and how the project evolves.

## Roles

| Role | Responsibilities |
|---|---|
| **Lead maintainer** | Final decision on scope, architecture, releases, and security response. Currently [@dengmeiluan](https://github.com/dengmeiluan). |
| **Maintainers** | Review and merge contributions, triage issues, own a module or subsystem, participate in release decisions. |
| **Contributors** | Propose changes, report bugs, improve documentation, review code. No formal membership required. |

Maintainer status is earned through sustained, high-quality contributions and is granted by the lead
maintainer after a public nomination in a GitHub Discussion. Maintainers may step down at any time.

## Decision making

- **Lazy consensus**: routine fixes, documentation, tests, and non-breaking improvements proceed
  after review and a reasonable comment window.
- **Architecture and breaking changes**: require an RFC-style issue describing motivation,
  alternatives, migration, and compatibility. The comment window is at least seven days for
  breaking changes.
- **Security**: handled privately through GitHub Security Advisories. Details are disclosed after a
  fix is available.
- **Disagreement**: the lead maintainer makes the final call, documents the reasoning in the issue
  or pull request, and records the outcome in the changelog when user-visible.

## Pull requests

1. One focused change per pull request; include tests and documentation.
2. All required checks must pass (backend, frontend, typecheck, docs).
3. At least one maintainer approval is required. The lead maintainer may self-merge small fixes.
4. Breaking changes update `CHANGELOG.md`, the specification/contract, and migration notes.

## Release policy

- Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Patch releases for fixes; minor releases for backward-compatible features; major releases for
  breaking changes.
- Releases are cut from `main` by tag and built by the release workflow. Artifacts include checksums
  and an SBOM.
- Security fixes may be released out of band.

## Modules and ownership

Each module has a clear boundary:

- `platform` — page contract, feature packs, branding, host SPI.
- `modules/console` — engine and console implementation.
- `apps/server` — standalone deployment.
- `ui` — Vue 3 console source.

Changes that cross a module boundary require the owning maintainer's review. The engine is currently
inside `modules/console` because of package cycles; extracting it into its own artifact is an
explicit roadmap item and follows the same RFC process.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Amendments

This document changes through a pull request. Material changes require a seven-day comment window.
