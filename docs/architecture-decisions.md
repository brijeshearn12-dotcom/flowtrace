# Architectural Decisions

This document tracks key architectural decisions and options rejected for the FlowTrace Workflow Engine.

## Accepted Decisions

1. **Sequential Execution for MVP**
   - Workflows will execute sequentially to minimize complexity and ensure reliability in the MVP stage.
   
2. **Rule-Based Detection as Offline-Safe Fallback**
   - Detection must work through deterministic phrase/action matching. LLMs are optional and untrusted.

3. **Immutable Published Versions**
   - Published workflow versions are immutable to ensure complete auditability.

4. **Shared Validator Model**
   - Manual and agent edits share a unified patch and validator model to maintain safety guarantees.

5. **Local Mock Forms API**
   - Use a local mock Forms API that supports deterministic success and controlled failure to reliably demo edge cases.

6. **Executor Priority**
   - Build and test the executor backend engine before fully polishing the frontend React Flow UI.

## Rejected Decisions

1. **LLM-Only Detection**
   - Rejected due to lack of determinism, potential halluncinations, and security concerns.
   
2. **Production Webhooks & Cron Scheduling**
   - Out of scope for the MVP.
   
3. **Arbitrary Agent Actions or URL Calls**
   - Banned to prevent arbitrary code execution or security bypasses. All external requests must flow through structured adapters (like Forms API).

4. **Automatic Retries and Backoff**
   - Out of scope for the MVP.
   
5. **Multi-tenant Role-Based Access Control (RBAC)**
   - Single-tenant/local setup is sufficient for the hackathon MVP.
