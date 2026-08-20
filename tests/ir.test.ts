import { describe, it, expect } from 'vitest';
import { Workflow, Run, StepResult } from '../shared/ir';

describe('Canonical IR Typecheck Test', () => {
  it('should successfully compile and validate a mock Workflow structure', () => {
    const mockWorkflow: Workflow = {
      id: 'wf_order_placed',
      version: 1,
      status: 'published',
      trigger: {
        id: 'tr_order',
        type: 'manual',
        schema: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            amount: { type: 'number' },
          },
        },
      },
      nodes: [
        {
          id: 'step_check_fraud',
          name: 'Check Fraud',
          type: 'action',
          action: 'FraudService.check',
          inputs: {
            orderId: '{{trigger.orderId}}',
            amount: '{{trigger.amount}}',
          },
          failurePolicy: {
            action: 'abort',
          },
        },
        {
          id: 'step_require_approval',
          name: 'High Value Approval',
          type: 'form',
          action: 'ApprovalService.request',
          inputs: {
            approverGroup: 'finance-admin',
            amount: '{{trigger.amount}}',
          },
          condition: {
            field: '{{trigger.amount}}',
            operator: 'gt',
            value: 1000,
          },
          failurePolicy: {
            action: 'redirect',
            redirectTargetId: 'step_cancel_order',
          },
        },
        {
          id: 'step_cancel_order',
          name: 'Cancel Order',
          type: 'action',
          action: 'OrderService.cancel',
          inputs: {
            orderId: '{{trigger.orderId}}',
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'step_check_fraud',
          target: 'step_require_approval',
        },
        {
          id: 'edge_2',
          source: 'step_require_approval',
          target: 'step_cancel_order',
          condition: {
            field: '{{step_require_approval.approved}}',
            operator: 'neq',
            value: true,
          },
        },
      ],
      createdAt: '2026-08-20T11:00:00Z',
      updatedAt: '2026-08-20T11:00:00Z',
    };

    expect(mockWorkflow.id).toBe('wf_order_placed');
    expect(mockWorkflow.nodes[1].condition?.operator).toBe('gt');
    expect(mockWorkflow.nodes[1].failurePolicy?.action).toBe('redirect');
  });

  it('should successfully compile and validate a mock Run structure', () => {
    const mockStepResult: StepResult = {
      stepId: 'step_check_fraud',
      status: 'success',
      output: {
        score: 0.12,
        isFraud: false,
      },
      startedAt: '2026-08-20T11:01:00Z',
      completedAt: '2026-08-20T11:01:01Z',
    };

    const mockRun: Run = {
      id: 'run_12345',
      workflowId: 'wf_order_placed',
      version: 1,
      status: 'success',
      triggerPayload: {
        orderId: 'ord_999',
        amount: 1500,
      },
      results: {
        step_check_fraud: mockStepResult,
      },
      startedAt: '2026-08-20T11:01:00Z',
      completedAt: '2026-08-20T11:01:05Z',
    };

    expect(mockRun.status).toBe('success');
    expect(mockRun.results['step_check_fraud'].status).toBe('success');
  });
});
