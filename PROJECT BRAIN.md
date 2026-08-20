# PROJECT BRAIN

## Project Name
FlowTrace

## Hackathon
Workflow Engine hackathon challenge. Official judging weights, submission rules, deadline timezone, AI-use rules, and deployment requirements are **UNKNOWN — NEEDS CONFIRMATION**.

## Problem Statement
Organizations hand-code multi-step business workflows across backend logic. The logic is difficult to visualize, audit, and safely change. FlowTrace converts a plain-language requirement plus existing schemas/functions/buttons into a visual, executable, auditable workflow.

## Objective
Build the smallest reliable MVP that detects workflows, renders a DAG, executes real or deterministic mock Forms API calls, passes context between steps, supports conditions and failure policies, and safely versions manual and agent edits.

## One-Line Pitch
FlowTrace turns plain-English business requirements into visual, executable, and safely editable workflows.

## Target Users
Platform builders, developers, business/product teams, operational staff, and citizen automators.

## Core Features
1. Requirement-to-IR detection.
2. Multiple workflow detection.
3. MongoDB persistence.
4. React Flow DAG visualization.
5. Manual trigger and payload form.
6. Sequential execution through Forms API adapter.
7. `{{trigger.x}}` and `{{stepId.x}}` context resolution.
8. `eq`, `neq`, and `gt` conditions.
9. `abort`, `skip`, and `redirect` failure policies.
10. Live or polled run statuses and detailed logs.
11. Manual patch editing.
12. Agent natural-language patch preview.
13. Shared validation.
14. Draft/published/archived versions and stale-edit protection.

## Optional Features
Confidence explanations, richer warnings, keyboard shortcuts, improved layout, node duplication, and local LLM augmentation when deterministic fallback remains available.

## Do Not Build During MVP
Webhooks, cron triggers, retries/backoff, multi-tenant RBAC, arbitrary code execution, arbitrary agent URLs, integration marketplace, and blank-canvas workflow construction.

## Tech Stack
React, React Flow, TypeScript, TanStack Query, Node.js, Express, MongoDB, Zod, Dagre, Docker Compose, and a deterministic local mock Forms API. Optional local LLM only for ambiguous detection or agent patch generation.

## Architecture
```text
USER → REACT FRONTEND → EXPRESS API
                         ├─ detector
                         ├─ shared validator
                         ├─ patch/version service
                         └─ executor
                              ├─ context resolver
                              ├─ conditions
                              └─ Forms API adapter
                                   ├─ existing API
                                   └─ local mock API
                         ↓
                    MongoDB persistence
```

## Folder Structure
```text
flowtrace/
├── brain.md
├── README.md
├── .gitignore
├── .env.example
├── package.json
├── docker-compose.yml
├── client/
├── server/
├── shared/
├── detector/
├── executor/
├── persistence/
├── mock-forms-api/
├── seed/
├── tests/
└── docs/
```

## Database Structure
`workflows` stores logical IDs and current pointers. `workflowVersions` stores immutable IR versions. `runs` stores trigger payload, executed version, status, and step results. `auditEvents` optionally stores edit, validation, publish, and execution events. `projectMetadata` stores schemas, functions, buttons, and operations.

## APIs
`POST /api/detect`, `GET/POST /api/workflows`, `GET/PATCH /api/workflows/:id`, `POST /api/workflows/:id/validate`, `POST /api/workflows/:id/publish`, `POST /api/workflows/:id/run`, `GET /api/runs/:runId`, `GET /api/runs/:runId/logs`, and `POST /api/workflows/:id/agent-edit`.

## AI/ML Models
Detection must work through deterministic phrase/action matching. Any LLM is optional and untrusted. LLM output may propose patches but cannot directly mutate a published workflow, execute code, call arbitrary URLs, or bypass validation.

## Environment Variables
`MONGODB_URI`, `MONGODB_DB`, `SERVER_PORT`, `CLIENT_URL`, `FORMS_API_BASE_URL`, `FORMS_API_TOKEN`, `LLM_ENABLED`, `LLM_MODEL`, and `LOG_LEVEL`. Never commit real secrets.

## Current Development Status
Baseline toolchain and package structure initialized (React, TypeScript, Vite, Express, MongoDB driver, Zod, Dagre, Vitest, ESLint). Builds, types, tests, and lint checks are all passing.

## Completed Features
Requirements baseline, five minimum pre-development documents, initial architecture, UI system, this project brain, Git initialization with .gitignore configuration, Baseline Tools installation, and creation of the 10 core project folders (client, server, shared, detector, executor, persistence, mock-forms-api, seed, tests, docs).

## Features Currently Being Built
None.

## Pending Features
Implementation of shared IR types, validator, persistence, mock API, executor, detector, API routes, UI, tests, deployment, and demo materials.

## Known Bugs
No application bugs yet. Planning documents may require cleanup if generated duplicates are discovered.

## Fixed Bugs
None.

## Important Decisions
1. Sequential execution for MVP.
2. Rule-based detection is the offline-safe fallback.
3. Published workflow versions are immutable.
4. Manual and agent edits share one patch and validator model.
5. Local mock Forms API must support deterministic success and controlled failure.
6. Build executor before UI polish.

## Decisions We Rejected
LLM-only detection, production webhooks, cron scheduling, arbitrary agent actions, retries, multi-tenancy, and a broad integration marketplace.

## Current Priorities
1. Confirm official hackathon rules and judging weights.
2. Freeze canonical IR and execution semantics.
3. Implement validator and executor.
4. Implement seeded OrderPlaced and AssetRequestApproval flows.
5. Connect React Flow UI.
6. Rehearse deterministic demo.

## Testing Status
Baseline Vitest setup is passing (1 baseline test). Required tests to implement include detector, schema, reference resolver, condition evaluator, executor, persistence/versioning, API, UI, and end-to-end tests.

## Deployment Status
Not deployed. Local Docker Compose and localhost runbook are the baseline. Deployment target is **UNKNOWN — NEEDS CONFIRMATION**.

## Demo Flow
1. Open FlowTrace.
2. Paste OrderPlaced requirement.
3. Show detected graph and confidence.
4. Inspect a node and reference.
5. Add or change a step through manual or agent patch.
6. Show validation and diff.
7. Publish version 2.
8. Run a manual trigger.
9. Show green step progression and context output.
10. Run AssetRequestApproval false branch.
11. Simulate an API failure.
12. Show failure route and audit log.

## Presentation Flow
Problem, operational cost, solution, detection, architecture, technical innovation, live demo, impact, reliability, and future scope.

## Judge Questions
Likely questions: What is genuinely AI-driven? How is the workflow IR validated? How is context passed? What happens on failure? How are agent edits safe? Why MongoDB? What is real versus mocked? How does this scale? What is intentionally out of scope?

## Answers
The core value is not a chatbot; it is the shared canonical IR, validator, executor, and audit model. LLM augmentation is optional. The mock Forms API mirrors the required external boundary and makes the demo deterministic. Published versions are immutable and invalid/stale edits are rejected.

## Important Commands
```bash
pnpm install
pnpm dev
pnpm test
pnpm seed
pnpm lint
docker compose up -d mongo
```

## Important File Locations
`brain.md` is the source of truth. Contracts belong in `docs/`. Shared IR and validation belong in `shared/`. Runtime behavior belongs in `executor/`. Demo fixtures belong in `seed/` and `mock-forms-api/`.

## Do Not Break These Components
Do not change the canonical IR shape, template reference syntax, version immutability rules, shared validator, seeded demo payloads, or mock Forms API route contract without updating tests and this file.

## Future Improvements
Webhooks, cron, retries, background workers, RBAC, parallel branches, richer LLM interpretation, and external integrations.

## Last Updated
2026-08-20

## Brain Rules

1. Read `brain.md` before major changes.
2. Update it after major work.
3. Preserve important knowledge.
4. Record architectural decisions and rejected alternatives.
5. Record bugs and fixes.
6. Record successful commands.
7. Record environment setup.
8. Record APIs and their purposes.
9. Record unfinished work.
10. Keep it sufficient for a new AI agent to continue safely.

**Prepared by:** Manus AI

**Status:** Initial project memory


---

**Prepared by:** Manus AI  
**Status:** Initial project memory



## Detailed Manual Update

A beginner-friendly nine-task construction manual was generated at `/home/ubuntu/FLOWTRACE_36_HOUR_BEGINNER_MANUAL.md`. It contains nine timed tasks, eight actionable steps per task, 72 customized Antigravity prompts, verification instructions, time checks, free-tool guidance, troubleshooting, emergency mode, and final submission checks.

## Current Status Update

Baseline toolchain, package structure, and all 10 core project directories (client, server, shared, detector, executor, persistence, mock-forms-api, seed, tests, docs) have been configured. Builds, types, tests, and lint checks are verified and passing. The next step is to freeze IR, contracts, and validation.

## Manual Build Order

1. Confirm official rules and unknown submission requirements.
2. Initialize the repository and tools.
3. Freeze IR, contracts, and validation.
4. Build persistence and seed data.
5. Build detector, mock API, executor, and logs.
6. Build React Flow UI.
7. Build safe editing and version approval.
8. Test, polish, deploy or document local runbook.
9. Rehearse, submit, and save confirmation.

## Last Updated

2026-08-20

---

**Prepared by:** Manus AI  
**Status:** Beginner manual generated  
**Last updated:** 2026-08-20

## References

[1]: /home/ubuntu/upload/Pasted_content.txt "Workflow Engine problem statement"
[2]: /home/ubuntu/upload/Pasted_content_01.txt "Hackathon CTO execution brief"
[3]: /home/ubuntu/upload/Pasted_content_02.txt "Beginner-friendly 36-hour construction-manual brief"

This update is based on the supplied documents [1] [2] [3].
