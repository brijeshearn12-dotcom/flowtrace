# MVP Scope Document

This document outlines the priorities for the FlowTrace Workflow Engine hackathon MVP.

## P0 — Must Have
*Absolutely required for the core visual, executable, and auditable demo.*

*   **Sequential Execution Engine**: Steps execute one after another using a local Forms API adapter.
*   **Context Resolution**: Step inputs resolve template variables using the syntax `{{trigger.x}}` and `{{stepId.x}}`.
*   **Step Conditions**: Evaluates `eq`, `neq`, and `gt` conditionals to determine branch traversal.
*   **Failure Policies**: Implements `abort`, `skip`, and `redirect` error-handling routes.
*   **Shared IR Validator**: Zod schema library to validate canonical Intermediate Representation (IR) structures and patches.
*   **Rule-Based Detector**: Deterministic phrase/action parser to convert plain English instructions into visual workflow IR.
*   **MongoDB Persistence**: Storage and retrieval of `workflows`, `workflowVersions` (immutable), and `runs`.
*   **Basic React Flow DAG**: Renders the generated DAG visualization based on the workflow IR.

## P1 — Should Have
*Features that refine the demo workflow but are not strictly engine blockers.*

*   **Manual Trigger Form**: Interface allowing users to input test payloads and manually run workflows.
*   **Run Logs & Polled Status**: Visual status badges (running, success, failure) and structured logs for ongoing/completed execution runs.
*   **Version Control & Stale-Edit Protection**: Draft/published status toggle for workflow versions, preventing overrides on stale drafts.
*   **Manual Patch Editor**: Code/form patch entry to manually edit existing nodes or settings.
*   **Multiple Workflow Detection**: Parser ability to process and structure multiple workflows from a single large plain text prompt.

## P2 — Nice to Have
*Non-critical enhancements to polish the developer/user experience.*

*   **Natural-Language Patch Preview**: Using optional local LLM to propose patches.
*   **Local LLM Detection Augmentation**: Optional fallback to LLM when deterministic phrase matching fails.
*   **UI Helpers**: Rich warnings, layout alignment updates, node duplication, and keyboard shortcuts.

## DO NOT BUILD
*Explicitly excluded from the MVP scope.*

*   **Webhooks**: External incoming event triggers.
*   **Cron/Scheduled Workflows**: Automated time-based execution.
*   **Retries and Backoff**: Retrying failed steps automatically.
*   **Multi-tenant RBAC**: Users, authorization layers, and teams.
*   **Integration Marketplace**: Connecting real external tools beyond mock Forms API.
*   **Arbitrary Code Execution**: Sandbox environments or custom script steps.
*   **Blank-canvas Workflow Builder**: Manual drag-and-drop node creation from scratch.
