import { WorkflowPatchInput } from '../../shared/schemas';

export interface AgentProposalResult {
  success: boolean;
  explanation: string;
  patch: WorkflowPatchInput;
  warning?: string;
}

export class AgentEditService {
  /**
   * Deterministically processes a natural language prompt to generate a patch proposal
   * for a workflow without modifying it or saving to the database.
   */
  static generateProposal(workflowId: string, prompt: string): AgentProposalResult {
    const normalizedPrompt = prompt.trim().toLowerCase();

    // 1. Order Placed Process (wf_order_placed)
    if (workflowId === 'wf_order_placed') {
      // Prompt: "Insert a slack notification step after fraud check"
      if (/(insert|add).*slack.*after.*(fraud|check|order-created)/i.test(normalizedPrompt)) {
        return {
          success: true,
          explanation: 'Added slack notification step and linked its inputs to previous step output.',
          patch: [
            {
              op: 'add',
              path: '/nodes/1',
              value: {
                id: 'step_slack',
                name: 'Slack Notification',
                type: 'action',
                action: 'Slack.post',
                inputs: {
                  channel: '#billing-alerts',
                  message: 'Slack notification after fraud check for order {{trigger.orderId}}'
                }
              }
            },
            {
              op: 'replace',
              path: '/edges',
              value: [
                { id: 'edge_1', source: 'order-created', target: 'step_slack' },
                { id: 'edge_new', source: 'step_slack', target: 'invoice' },
                { id: 'edge_2', source: 'invoice', target: 'confirmation' },
                { id: 'edge_3', source: 'confirmation', target: 'fulfillment' }
              ]
            }
          ]
        };
      }

      // Prompt: "Change email recipient to support@company.com"
      if (/(change|update).*email.*(recipient|to).*support@company\.com/i.test(normalizedPrompt)) {
        return {
          success: true,
          explanation: 'Updated the email recipient address to support@company.com in the confirmation email step.',
          patch: [
            {
              op: 'replace',
              path: '/nodes/2/inputs/recipient',
              value: 'support@company.com'
            }
          ]
        };
      }

      // Prompt: "Remove fulfillment step"
      if (/(remove|delete).*fulfillment/i.test(normalizedPrompt)) {
        return {
          success: true,
          explanation: 'Removed the fulfillment step and updated edges to bypass it.',
          patch: [
            {
              op: 'remove',
              path: '/nodes/3'
            },
            {
              op: 'replace',
              path: '/edges',
              value: [
                { id: 'edge_1', source: 'order-created', target: 'invoice' },
                { id: 'edge_2', source: 'invoice', target: 'confirmation' }
              ]
            }
          ]
        };
      }
    }

    // 2. Asset Request Approval Process (wf_asset_request_approval)
    if (workflowId === 'wf_asset_request_approval') {
      // Prompt: "Change approval channel to #general"
      if (/(change|update).*channel.*to.*#general/i.test(normalizedPrompt)) {
        return {
          success: true,
          explanation: 'Updated the approvals Slack channel to #general.',
          patch: [
            {
              op: 'replace',
              path: '/nodes/0/inputs/channel',
              value: '#general'
            }
          ]
        };
      }

      // Prompt: "Set failure policy of approved-action to skip"
      if (/(change|update|set).*failure.*policy.*approved-action.*to.*skip/i.test(normalizedPrompt) || 
          /(set|change).*approved-action.*skip/i.test(normalizedPrompt)) {
        return {
          success: true,
          explanation: 'Changed the failure policy of the approved-action node to skip.',
          patch: [
            {
              op: 'replace',
              path: '/nodes/1/failurePolicy',
              value: {
                action: 'skip'
              }
            }
          ]
        };
      }
    }

    // Default fallback: return warning for unknown instructions
    return {
      success: false,
      explanation: 'Warning: Unknown instruction. The agent could not match this request to a known template instruction.',
      patch: [],
      warning: `Unknown instruction: "${prompt}". Supported instructions include: 'Insert a slack notification step after fraud check', 'Change email recipient to support@company.com', 'Remove fulfillment step', 'Change approval channel to #general', 'Set failure policy of approved-action to skip'.`
    };
  }
}
