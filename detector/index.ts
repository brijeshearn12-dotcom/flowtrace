import { Trigger, Node, Edge, Workflow } from '../shared/ir';
import { validateWorkflow } from '../shared/validator';

export interface DetectionResult {
  success: boolean;
  confidence: number;
  explanation: string;
  warnings: string[];
  workflow: Workflow;
}

// Fixed metadata structures for the Order Placed Process
const ORDER_PLACED_TRIGGER: Trigger = {
  id: 'tr_order_placed',
  type: 'manual',
  schema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', title: 'Order ID' },
      customerEmail: { type: 'string', title: 'Customer Email' },
      total: { type: 'number', title: 'Total Amount' }
    },
    required: ['orderId', 'customerEmail', 'total']
  }
};

const ORDER_PLACED_NODES: Node[] = [
  {
    id: 'order-created',
    name: 'Order Created Fraud Check',
    type: 'action',
    action: 'FraudService.check',
    inputs: {
      orderId: '{{trigger.orderId}}',
      amount: '{{trigger.total}}'
    }
  },
  {
    id: 'invoice',
    name: 'Create Invoice Notification',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#billing',
      message: 'Invoice generated for order {{trigger.orderId}} of amount {{trigger.total}}'
    }
  },
  {
    id: 'confirmation',
    name: 'Send Confirmation Email',
    type: 'action',
    action: 'EmailService.send',
    inputs: {
      recipient: '{{trigger.customerEmail}}',
      subject: 'Order {{trigger.orderId}} Confirmed',
      body: 'Thank you for your order of ${{trigger.total}}!'
    }
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment Slack Alert',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#warehouse',
      message: 'Fulfill order {{trigger.orderId}}'
    }
  }
];

const ORDER_PLACED_EDGES: Edge[] = [
  { id: 'edge_1', source: 'order-created', target: 'invoice' },
  { id: 'edge_2', source: 'invoice', target: 'confirmation' },
  { id: 'edge_3', source: 'confirmation', target: 'fulfillment' }
];

// Fixed metadata structures for the Asset Request Approval Process
const ASSET_REQUEST_TRIGGER: Trigger = {
  id: 'tr_asset_request',
  type: 'manual',
  schema: {
    type: 'object',
    properties: {
      requestId: { type: 'string', title: 'Request ID' },
      approved: { type: 'boolean', title: 'Approved' },
      amount: { type: 'number', title: 'Request Amount' }
    },
    required: ['requestId', 'approved', 'amount']
  }
};

const ASSET_REQUEST_NODES: Node[] = [
  {
    id: 'approval',
    name: 'Asset Request Approval Decision',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#approvals',
      message: 'Asset request {{trigger.requestId}} for amount ${{trigger.amount}}'
    }
  },
  {
    id: 'approved-action',
    name: 'Post Approved Asset',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#warehouse',
      message: 'Asset request {{trigger.requestId}} approved! Proceeding to dispatch.'
    },
    failurePolicy: {
      action: 'redirect',
      redirectTargetId: 'failure-handler'
    }
  },
  {
    id: 'rejected-action',
    name: 'Notify Rejection',
    type: 'action',
    action: 'EmailService.send',
    inputs: {
      recipient: 'requester@example.com',
      subject: 'Asset Request {{trigger.requestId}} Rejected',
      body: 'Sorry, your asset request for amount ${{trigger.amount}} was rejected.'
    }
  },
  {
    id: 'failure-handler',
    name: 'Log Critical Failure Alert',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#operations-alerts',
      message: 'Critical failure during asset dispatch for request {{trigger.requestId}}'
    }
  }
];

const ASSET_REQUEST_EDGES: Edge[] = [
  {
    id: 'edge_approved',
    source: 'approval',
    target: 'approved-action',
    condition: {
      field: '{{trigger.approved}}',
      operator: 'eq',
      value: true
    }
  },
  {
    id: 'edge_rejected',
    source: 'approval',
    target: 'rejected-action',
    condition: {
      field: '{{trigger.approved}}',
      operator: 'neq',
      value: true
    }
  }
];

/**
 * Deterministically detects workflow patterns from text and generates a validated draft.
 */
export function detectWorkflow(requirement: string): DetectionResult {
  const normalized = requirement.toLowerCase().trim();

  // Guard against empty / extremely short strings
  if (normalized.length < 10) {
    throw new Error('Requirement string is too short or empty');
  }

  let workflowId = 'wf_detected_draft';
  let workflowName = 'Detected Draft Workflow';
  let trigger: Trigger = { id: 'tr_manual', type: 'manual' };
  let nodes: Node[] = [];
  let edges: Edge[] = [];
  let confidence = 0;
  let explanation = 'Could not classify requirement into any known templates.';
  const warnings: string[] = [];

  const isOrderPlaced =
    normalized.includes('order') &&
    (normalized.includes('placed') ||
      normalized.includes('fraud') ||
      normalized.includes('billing') ||
      normalized.includes('invoice') ||
      normalized.includes('emailservice.send'));

  const isAssetRequest =
    normalized.includes('asset') &&
    (normalized.includes('request') ||
      normalized.includes('approval') ||
      normalized.includes('approved') ||
      normalized.includes('rejected') ||
      normalized.includes('failure-handler'));

  if (isOrderPlaced) {
    workflowId = 'wf_order_placed';
    workflowName = 'Order Placed Process';
    trigger = ORDER_PLACED_TRIGGER;
    nodes = ORDER_PLACED_NODES;
    edges = ORDER_PLACED_EDGES;
    confidence = 0.95;
    explanation = 'Detected OrderPlaced trigger, FraudCheck check step, invoice Slack post, customer confirmation email, and warehouse fulfillment alert.';
  } else if (isAssetRequest) {
    workflowId = 'wf_asset_request_approval';
    workflowName = 'Asset Request Approval Process';
    trigger = ASSET_REQUEST_TRIGGER;
    nodes = ASSET_REQUEST_NODES;
    edges = ASSET_REQUEST_EDGES;
    confidence = 0.95;
    explanation = 'Detected AssetRequest trigger, manager approvals, redirect policy fallback alerts, and conditional branching for approval/rejection.';
  } else {
    warnings.push('Requirement text did not match any allowlisted workflow pattern. Returning a blank template.');
  }

  const now = new Date().toISOString();
  const draft: Workflow = {
    id: workflowId,
    version: 1,
    status: 'draft',
    trigger,
    nodes,
    edges,
    createdAt: now,
    updatedAt: now
  };

  // Run validator on the draft IR to ensure correctness
  const validation = validateWorkflow(draft);
  if (!validation.success) {
    for (const err of validation.errors) {
      warnings.push(`IR validation warning: [${err.path}] ${err.message}`);
    }
  }

  return {
    success: isOrderPlaced || isAssetRequest,
    confidence,
    explanation,
    warnings,
    workflow: draft
  };
}
