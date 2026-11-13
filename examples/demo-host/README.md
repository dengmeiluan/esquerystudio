# demo-host — minimal ESQueryStudio host

The runnable version of the quick start: one `@Document` entity, one
`@SpringBootApplication` class, and the full ESQueryStudio console (Setup wizard,
mapping auto-reconcile, adhoc rebuilds, live monitoring) — no other wiring.

## Run it

```bash
# 1. install ESQueryStudio modules into your local repository (from the repository root)
./mvnw -o clean install -DskipTests

# 2. build & start the demo host
cd examples/demo-host
mvn spring-boot:run
```

Open `http://localhost:8081/esquerystudio.html`, complete the Setup wizard with
your Elasticsearch address, then:

- `Article` (`demo-article` index) is managed by mapping auto-register —
  add a `@Field` to the entity, restart, and watch the reconcile log add the
  field without downtime;
- the console exposes adhoc rebuild, data browser, query workbench and live
  monitoring against the connected cluster;
- jobs and the ops-audit trail persist in `~/.esquerystudio/demo-host/jobs.db`
  (`store=sqlite`), so history survives restarts.

Default login is `admin` / `esquerystudio` while the user index is empty —
create your own user before exposing the console beyond localhost.

## What to look at

| File | What it teaches |
|---|---|
| `src/main/java/.../Article.java` | declaring a managed entity (`@Document` + `@Field`) |
| `src/main/resources/application.yml` | the minimal host configuration (`mode=console`, auto-register, sqlite store) |
| `src/main/java/.../SampleHostAuthDelegate.java` | **the delegate SPI done right** — all four methods (`authenticate` / `hasCredential` / `tokenOf` / `revoke`), role mapping, page grants |
| `src/test/java/.../SampleHostAuthDelegateTest.java` | the four contracts that are easy to *omit* and impossible to notice at runtime |
| `src/test/java/.../DemoHostSmokeTest.java` | proof the embedded console boots with zero wiring |

## Wiring a real host identity (optional)

Registering only `authenticate` is the common mistake: the console then can't tell
"delegated but rejected" from "no host credentials", so a revoked host session can
silently fall back to a leftover built-in token, and "logout" only clears localStorage.
The sample implements all four methods; enable it to see the wiring:

```bash
# token is just Base64("user:hostRole") in the sample — e.g. ops user
mvn spring-boot:run -Dspring-boot.run.arguments=--demo.host-delegate.enabled=true
curl -H 'X-Demo-Host-Token: b3BzOnZpZXdlcg==' http://localhost:8081/internal/es/index/auth/me
```

Swap `authenticate` for your own JWT verification and `grantedPages` for the pages
your permission system actually grants (see the authorization-key table in
`docs/integration/configuration-reference.md`). Leave pages `null` only when you really
want role-wide access.

> The sample requires ESQueryStudio **1.0.0+** — earlier versions don't have the
> `hasCredential`/`tokenOf`/`revoke` methods, and copying the sample against them won't compile.
