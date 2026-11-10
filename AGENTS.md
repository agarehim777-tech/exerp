# Architecture rules

- Extract application orchestration into focused hooks and domain modules rather than relocating it into shared monoliths; this keeps changes independently testable.
- Stabilize refresh callbacks and scope asynchronous reads to their current tenant before publishing results; late responses must not restore another tenant's data.
- Retain one authoritative persistence writer per collection during incremental migration; dual writers can resurrect deleted records.