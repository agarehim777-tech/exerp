# Architecture rules

- Extract application orchestration into focused hooks and domain modules rather than relocating it into shared monoliths; this keeps changes independently testable.
- Stabilize refresh callbacks and scope asynchronous reads to their current tenant before publishing results; late responses must not restore another tenant's data.
- Retain one authoritative persistence writer per collection during incremental migration; dual writers can resurrect deleted records.
- Keep shared UI implementations in TypeScript and retain explicit-extension legacy re-export bridges only during migration; extensionless self-imports can resolve to the bridge itself.
- Keep delivery calculations in the warehouse domain module and shared business dates independent of appDomain; this avoids cyclic module initialization during extraction.