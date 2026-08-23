# FlowTrace Offline Runbook & Deterministic Demo Guide

This guide documents how FlowTrace runs entirely in **offline mode** with zero dependencies on external LLM services, cloud APIs, or third-party network connections.

---

## 1. Overview & Offline Architecture

FlowTrace is designed with **offline-first determinism** as a core architectural principle:
- **No LLM or External AI Required**: Requirement parsing and agent patch proposals operate through deterministic keyword and phrase matching rules against allowlisted patterns.
- **Local Mock Forms API**: External service boundaries (`FraudService.check`, `Slack.post`, `EmailService.send`) are simulated by an in-process and local HTTP mock adapter that returns deterministic responses and configurable failure injections.
- **Zero API Keys**: No `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` are required to run, test, or demo FlowTrace.
- **Local Persistence**: Runs against a local MongoDB instance (via Docker Compose) or local replica.

```text
                                  ┌───────────────────────────────┐
                                  │      React + Vite Client      │
                                  │    (http://localhost:5173)    │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       Express Backend API                                       │
│                                     (http://localhost:3001)                                     │
│                                                                                                 │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────────────┐  │
│  │     Deterministic     │   │     Deterministic      │   │          DAG Sequential          │  │
│  │ Requirement Detector  │   │   Agent Edit Service   │   │         Workflow Executor        │  │
│  │   (Offline Pattern    │   │    (Offline Patch      │   │    (Context resolver, conditions │  │
│  │       Matcher)        │   │       Generator)       │   │      & failure policies)         │  │
│  └───────────────────────┘   └────────────────────────┘   └─────────────────┬────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┼───────────────────┘
                                                                              │
                                                                              ▼
                                                            ┌──────────────────────────────────┐
                                                            │       Local Mock Forms API       │
                                                            │      (In-process adapter &       │
                                                            │     http://localhost:3002)       │
                                                            └──────────────────────────────────┘
```

---

## 2. Environment Configuration

To run completely offline, ensure your environment variables are configured as follows:

```env
# Server & Client Ports
PORT=3001
CLIENT_URL=http://localhost:5173
FORMS_API_BASE_URL=http://localhost:3002

# Local Database
MONGODB_URI=mongodb://localhost:27017/flowtrace
MONGODB_DB=flowtrace

# Disable External AI / LLM (uses deterministic offline engine)
LLM_ENABLED=false

# External API Keys (Leave completely empty / unset)
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GEMINI_API_KEY=
```

---

## 3. Deterministic Seeded Workflows

FlowTrace seeds two complete workflows with deterministic behaviors:

### 1. `wf_order_placed` (Order Placed Process)
- **Trigger**: Manual payload with `orderId`, `customerEmail`, `total`.
- **Step 1 (`order-created`)**: `FraudService.check` -> returns deterministic score `{ score: 0.05, approved: true, riskLevel: 'low' }`.
- **Step 2 (`invoice`)**: `Slack.post` to `#billing` with dynamic template context `{{trigger.orderId}}` and `{{trigger.total}}`.
- **Step 3 (`confirmation`)**: `EmailService.send` to `{{trigger.customerEmail}}`.
- **Step 4 (`fulfillment`)**: `Slack.post` to `#warehouse`.

### 2. `wf_asset_request_approval` (Asset Request Approval Process)
- **Trigger**: Manual payload with `requestId`, `approved` (boolean), `amount`.
- **Step 1 (`approval`)**: `Slack.post` to `#approvals`.
- **Branch A (Conditional `approved === true`)**:
  - `approved-action`: `Slack.post` to `#warehouse`.
  - **Failure Policy**: `redirect` to `failure-handler` on dispatch failure.
- **Branch B (Conditional `approved !== true`)**:
  - `rejected-action`: `EmailService.send` rejection notification.
- **Step 4 (`failure-handler`)**: `Slack.post` to `#operations-alerts` (executed only when redirected on failure).

---

## 4. Step-by-Step Offline Demo Guide

### Step 1: Start Local Database & Services
```bash
# 1. Start local MongoDB container (if not using local mongod)
docker compose up -d mongo

# 2. Seed database with metadata and demo workflows
pnpm seed

# 3. Start local development servers (Express + Vite + Mock API)
pnpm dev
```

### Step 2: Verify Requirement Detection (Offline)
1. Open `http://localhost:5173` in your browser.
2. In the **Natural Language Requirements Composer**, select the preset **Order Placed Process** or type:
   > *"When an order is placed, run FraudService.check. Then create a billing invoice and send a customer confirmation email. Finally, alert warehouse for fulfillment."*
3. Click **Detect Workflow Draft**.
4. **Expected Result**: Confidence `95%`, graph topology with 4 nodes and 3 edges generated instantly and deterministically without external LLM API calls.

### Step 3: Run Deterministic Sequential Execution
1. Select the seeded **Order Placed Process** workflow.
2. In the **Trigger Panel**, provide test payload:
   ```json
   {
     "orderId": "ORD-101",
     "customerEmail": "alice@example.com",
     "total": 500
   }
   ```
3. Click **Execute Workflow**.
4. **Expected Result**: All 4 steps execute sequentially with green status badges. Step outputs dynamically resolve context templates (`{{trigger.orderId}}`, `{{order-created.score}}`).

### Step 4: Verify Conditional Branching
1. Select the seeded **Asset Request Approval Process** workflow.
2. **Test Approved Branch**:
   - Trigger with `{"requestId": "REQ-001", "approved": true, "amount": 1000}`.
   - **Result**: `approval` and `approved-action` execute; `rejected-action` is skipped.
3. **Test Rejected Branch**:
   - Trigger with `{"requestId": "REQ-002", "approved": false, "amount": 1000}`.
   - **Result**: `approval` and `rejected-action` execute; `approved-action` is skipped.

### Step 5: Verify Failure Handling & Redirect Recovery
1. When `approved-action` experiences an external API failure, its `redirect` failure policy jumps execution to `failure-handler`.
2. The `failure-handler` logs the alert and the workflow run completes with recovered `success` status.

### Step 6: Verify Offline Agent Proposals
1. In the **Agent Proposal** tab, submit:
   > *"Insert a slack notification step after fraud check"*
2. **Expected Result**: Generates a reviewable structured JSON patch adding a Slack notification step linked to the previous node's output, with zero LLM API calls.

---

## 5. Offline Automated Verification

Run the entire offline test suite with a single command:

```bash
# Run all unit, integration, and offline fallback tests
pnpm test

# Run browser acceptance test suite
pnpm test:browser
```
