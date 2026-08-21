import { connectDB, closeDB } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';

const workflowId = 'wf_asset_request_approval';
const workflowName = 'Asset Request Approval Process';

const trigger: Trigger = {
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

const nodes: Node[] = [
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

const edges: Edge[] = [
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

export async function seedAssetRequestApproval(): Promise<void> {
  const { db } = await connectDB();

  console.log('Cleaning up existing AssetRequestApproval workflow...');
  await db.collection(COLLECTIONS.WORKFLOWS).deleteOne({ _id: workflowId as unknown as import('mongodb').ObjectId });
  await db.collection(COLLECTIONS.VERSIONS).deleteMany({ workflowId });

  console.log('Creating AssetRequestApproval workflow draft...');
  const { workflow, version } = await VersionService.createWorkflow(
    workflowId,
    workflowName,
    trigger,
    nodes,
    edges
  );
  console.log(`Created workflow draft "${workflow.name}" (version ${version.version})`);

  console.log('Publishing AssetRequestApproval workflow version 1...');
  const result = await VersionService.publishVersion(workflowId, 1);
  console.log(`Published version 1 of workflow "${result.workflow.name}". PublishedVersionId: ${result.workflow.publishedVersionId}`);
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('assetRequestApproval.ts') ||
  process.argv[1].endsWith('assetRequestApproval.js') ||
  process.argv[1].endsWith('assetRequestApproval')
);

if (isMain) {
  seedAssetRequestApproval()
    .then(async () => {
      await closeDB();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Seeding failed:', error);
      await closeDB();
      process.exit(1);
    });
}
