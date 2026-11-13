# Support

ESQueryStudio is maintained on a best-effort basis. There is no commercial SLA.

## Where to ask

| Need | Channel |
|---|---|
| Usage questions, design discussions, show your setup | [GitHub Discussions](https://github.com/dengmeiluan/esquerystudio/discussions) |
| Reproducible bug | [Bug report](https://github.com/dengmeiluan/esquerystudio/issues/new?template=bug_report.yml) |
| Feature request | [Feature request](https://github.com/dengmeiluan/esquerystudio/issues/new?template=feature_request.yml) |
| Security vulnerability | [GitHub Security tab](https://github.com/dengmeiluan/esquerystudio/security) — use “Report a vulnerability” when available; never a public issue |

## Supported versions

| Version | Status |
|---|---|
| `1.x` | Supported; fixes land on the latest patch |
| `main` | Development branch; preview only, no compatibility promise |

## What to include in a bug report

- ESQueryStudio version, deployment mode (`server`, embedded console, `client`), and JDK.
- Spring Boot version (host and standalone) and Elasticsearch server/client versions.
- A minimal reproduction: configuration shape, HTTP calls, or a failing test.
- Relevant logs with secrets redacted: `[EsStackContract]`, `[MappingReconcile]`, rebuild, auth, and
  console startup lines.

Never include passwords, tokens, private keys, customer data, or full connection strings. If a log
line contains a secret, redact it before pasting.

## Before opening an issue

1. Read [docs/integration/troubleshooting.md](docs/integration/troubleshooting.md) and
   [docs/integration/configuration-reference.md](docs/integration/configuration-reference.md).
2. Search existing issues and discussions.
3. Try the latest release and the `main` branch if the problem may already be fixed.

## Commercial support

The project does not sell support. Hosts and integrators are welcome to build their own commercial
offerings on top of the Apache-2.0 licensed code.
