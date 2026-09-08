# Changelog

## 0.1.0 — 2026-09-08

This release aligns all SDKs with the updated Search API contract.

### Migration from 0.0.1

- Remove `topic` and the `Topic` enum from client code. The API continues to ignore legacy `topic` input.
- Remove the image-count request option. Image quantity is now managed internally by the API.
- Search offsets must be 0–99. The per-page limit remains 1–50; pages crossing result 100 are truncated by the API.
- To configure per-result raw-content length, use Java/JS `maxCharacters` or Python `max_characters` inside content options. The default is 5000 Unicode code points, and the value does not enable raw content automatically.

These request-model changes can require source changes when upgrading from 0.0.1. All three packages share version 0.1.0 and Git tag v0.1.0.
