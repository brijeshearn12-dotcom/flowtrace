import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentEditService } from '../server/services/agentEditService';
import { connectDB, closeDB, getDb } from '../server/db';
import { WorkflowRepository, VersionRepository, COLLECTIONS } from '../persistence';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';
import express from 'express';
import { Server } from 'http';
import workflowsRouter from '../server/routes/workflows';

describe('AgentEditService Unit Tests (Deterministic Mappings)', () => {
  it('1. should return a valid patch for wf_order_placed with "Insert a slack notification step after fraud check"', () => {
    const result = AgentEditService.generateProposal(
      'wf_order_placed',
      'Insert a slack notification step after fraud check'
    );
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('slack notification');
    expect(result.patch.length).toBeGreaterThan(0);
    expect(result.patch[0].op).toBe('add');
    expect(result.patch[0].path).toBe('/nodes/1');
    expect(result.patch[0].value.id).toBe('step_slack');
  });

  it('2. should return a valid patch for wf_order_placed with "Change email recipient to support@company.com"', () => {
    const result = AgentEditService.generateProposal(
      'wf_order_placed',
      'Change email recipient to support@company.com'
    );
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('support@company.com');
    expect(result.patch).toEqual([
      {
        op: 'replace',
        path: '/nodes/2/inputs/recipient',
        value: 'support@company.com'
      }
    ]);
  });

  it('3. should return a valid patch for wf_order_placed with "Remove fulfillment step"', () => {
    const result = AgentEditService.generateProposal(
      'wf_order_placed',
      'Remove fulfillment step'
    );
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('Removed the fulfillment step');
    expect(result.patch[0]).toEqual({
      op: 'remove',
      path: '/nodes/3'
    });
  });

  it('4. should return a valid patch for wf_asset_request_approval with "Change approval channel to #general"', () => {
    const result = AgentEditService.generateProposal(
      'wf_asset_request_approval',
      'Change approval channel to #general'
    );
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('#general');
    expect(result.patch).toEqual([
      {
        op: 'replace',
        path: '/nodes/0/inputs/channel',
        value: '#general'
      }
    ]);
  });

  it('5. should return a valid patch for wf_asset_request_approval with "Set failure policy of approved-action to skip"', () => {
    const result = AgentEditService.generateProposal(
      'wf_asset_request_approval',
      'Set failure policy of approved-action to skip'
    );
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('approved-action node to skip');
    expect(result.patch).toEqual([
      {
        op: 'replace',
        path: '/nodes/1/failurePolicy',
        value: {
          action: 'skip'
        }
      }
    ]);
  });

  it('6. should return a warning response for unknown instructions', () => {
    const result = AgentEditService.generateProposal(
      'wf_order_placed',
      'Do some magic and rewrite the whole process'
    );
    expect(result.success).toBe(false);
    expect(result.explanation).toContain('Warning: Unknown instruction');
    expect(result.patch).toEqual([]);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('magic');
  });
});

describe('Agent Edit Route API Integration Tests', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  beforeAll(async () => {
    // Attempt database connection with a 1000ms timeout
    const connectWithTimeout = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 1000);

      connectDB()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });

    try {
      await connectWithTimeout;
      isDbAvailable = true;
    } catch {
      console.log('MongoDB not available; skipping DB-dependent route tests');
      isDbAvailable = false;
    }

    if (isDbAvailable) {
      await seedOrderPlaced();
      await seedAssetRequestApproval();
    }

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);

    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (isDbAvailable) {
      await closeDB();
    }
  });

  it('1. should verify POST /api/workflows/:id/agent-edit returns valid patch for known instruction', async () => {
    if (!isDbAvailable) return;

    // Get original workflow version to compare later
    const originalWf = await WorkflowRepository.get('wf_order_placed');
    expect(originalWf).not.toBeNull();
    const originalVersion = await VersionRepository.getByVersion('wf_order_placed', originalWf!.latestVersion);
    expect(originalVersion).not.toBeNull();

    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Insert a slack notification step after fraud check'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.explanation).toContain('slack notification');
    expect(data.patch.length).toBeGreaterThan(0);

    // Verify published/database workflow is UNCHANGED
    const finalWf = await WorkflowRepository.get('wf_order_placed');
    expect(finalWf!.latestVersion).toBe(originalWf!.latestVersion);
    expect(finalWf!.status).toBe(originalWf!.status);

    const finalVersion = await VersionRepository.getByVersion('wf_order_placed', finalWf!.latestVersion);
    expect(JSON.stringify(finalVersion!.nodes)).toBe(JSON.stringify(originalVersion!.nodes));
  });

  it('2. should verify POST /api/workflows/:id/agent-edit returns warning for unknown instruction', async () => {
    if (!isDbAvailable) return;

    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'unknown instruction'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(data.explanation).toContain('Warning: Unknown instruction');
    expect(data.warning).toBeDefined();
    expect(data.patch).toEqual([]);
  });

  it('3. should verify API returns 404 for non-existent workflow ID', async () => {
    if (!isDbAvailable) return;

    const res = await fetch(`http://localhost:${port}/api/workflows/non_existent/agent-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Insert a slack notification step after fraud check'
      })
    });

    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toContain('not found');
  });

  it('4. should verify API returns 400 for missing prompt', async () => {
    if (!isDbAvailable) return;

    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain('Prompt string is required');
  });
});
