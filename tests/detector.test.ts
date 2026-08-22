import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectWorkflow } from '../detector';
import { Server } from 'http';
import express from 'express';
import detectRouter from '../server/routes/detect';

describe('Deterministic Detector Unit Tests', () => {
  it('1. should detect Order Placed Process requirement pattern', () => {
    const requirement = 'When an order is placed, run FraudService.check. Then create a billing invoice and send a customer confirmation email. Finally, alert warehouse for fulfillment.';
    const result = detectWorkflow(requirement);

    expect(result.success).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.workflow.id).toBe('wf_order_placed');
    expect(result.workflow.nodes.length).toBe(4);
    expect(result.workflow.edges.length).toBe(3);
    expect(result.warnings.length).toBe(0);
    expect(result.explanation).toContain('OrderPlaced trigger');
  });

  it('2. should detect Asset Request Approval Process requirement pattern', () => {
    const requirement = 'Set up an asset request approval flow. Send notification to approvals channel. If approved, post to warehouse. If rejected, send an rejection notification. If dispatch fails, redirect to critical failure-handler.';
    const result = detectWorkflow(requirement);

    expect(result.success).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.workflow.id).toBe('wf_asset_request_approval');
    expect(result.workflow.nodes.length).toBe(4);
    expect(result.workflow.edges.length).toBe(2);
    expect(result.warnings.length).toBe(0);
    expect(result.explanation).toContain('AssetRequest trigger');
  });

  it('3. should handle unsupported requirement safely, returning a blank template', () => {
    const requirement = 'This is a completely unrelated project description about a soccer match.';
    const result = detectWorkflow(requirement);

    expect(result.success).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.workflow.id).toBe('wf_detected_draft');
    expect(result.workflow.nodes.length).toBe(0);
    expect(result.workflow.edges.length).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('did not match any allowlisted workflow pattern');
  });

  it('4. should throw error for empty/too short requirement strings', () => {
    expect(() => detectWorkflow('')).toThrow('Requirement string is too short or empty');
    expect(() => detectWorkflow('abc')).toThrow('Requirement string is too short or empty');
  });
});

describe('Detector Route API Integration Tests', () => {
  let server: Server;
  let port: number;
  const app = express();

  beforeAll(async () => {
    app.use(express.json());
    app.use('/api/detect', detectRouter);
    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('1. should verify POST /api/detect success with order requirement', async () => {
    const res = await fetch(`http://localhost:${port}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirement: 'Order placed, run FraudCheck and notify Slack channel #warehouse'
      })
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.confidence).toBe(0.95);
    expect(data.workflow.id).toBe('wf_order_placed');
  });

  it('2. should verify POST /api/detect returns 400 Bad Request for short requirement', async () => {
    const res = await fetch(`http://localhost:${port}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirement: 'short'
      })
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('too short or empty');
  });

  it('3. should verify POST /api/detect handles missing requirement with 400 Bad Request', async () => {
    const res = await fetch(`http://localhost:${port}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('too short or empty');
  });
});
