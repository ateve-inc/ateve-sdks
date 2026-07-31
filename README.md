# Ateve SDKs

Official SDKs for the Ateve Search API (`POST /v1/search`).

| SDK | Directory | Registry | Package |
|---|---|---|---|
| Java | [`java/`](java/) | Maven Central | `ai.ateve:ateve-java` |
| JavaScript / TypeScript | [`js/`](js/) | npm | `ateve` |
| Python | [`python/`](python/) | PyPI | `ateve` |

All SDKs are thin clients: one SDK search call sends one HTTP request. The
SDKs do not automatically retry or fail over because a timeout can happen
after a billable search has already executed. Retry, idempotency, circuit
breaking, and endpoint routing remain the responsibility of the host
application or gateway.

## Development

Java requires JDK 11+ and Maven 3.9+. Java release builds sign artifacts with
GPG and publish through Maven Central.

JavaScript requires Node.js 22+:

```bash
cd js
npm ci
npm test
npm run typecheck
npm run build
```

Python requires Python 3.11+:

```bash
cd python
python -m pytest
```

## Release workflows

Release workflows run on version tags matching `v*`:

- [`release-java.yml`](.github/workflows/release-java.yml)
- [`release-js.yml`](.github/workflows/release-js.yml)
- [`release-python.yml`](.github/workflows/release-python.yml)

The Java workflow requires `CENTRAL_USERNAME`, `CENTRAL_PASSWORD`,
`GPG_PRIVATE_KEY`, and `GPG_PASSPHRASE` repository secrets. npm and PyPI use
OIDC trusted publishing after their registry-side publisher configuration is
complete.
