import { connectDB, closeDB } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';

const workflowId = 'wf_order_placed';
const workflowName = 'Order Placed Process';

const trigger: Trigger = {
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

const nodes: Node[] = [
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

const edges: Edge[] = [
  {
    id: 'edge_1',
    source: 'order-created',
    target: 'invoice'
  },
  {
    id: 'edge_2',
    source: 'invoice',
    target: 'confirmation'
  },
  {
    id: 'edge_3',
    source: 'confirmation',
    target: 'fulfillment'
  }
];

export async function seedOrderPlaced(): Promise<void> {
  const { db } = await connectDB();

  console.log('Cleaning up existing OrderPlaced workflow...');
  await db.collection(COLLECTIONS.WORKFLOWS).deleteOne({ _id: workflowId as unknown as import('mongodb').ObjectId });
  await db.collection(COLLECTIONS.VERSIONS).deleteMany({ workflowId });

  console.log('Creating OrderPlaced workflow draft...');
  const { workflow, version } = await VersionService.createWorkflow(
    workflowId,
    workflowName,
    trigger,
    nodes,
    edges
  );
  console.log(`Created workflow draft "${workflow.name}" (version ${version.version})`);

  console.log('Publishing OrderPlaced workflow version 1...');
  const result = await VersionService.publishVersion(workflowId, 1);
  console.log(`Published version 1 of workflow "${result.workflow.name}". PublishedVersionId: ${result.workflow.publishedVersionId}`);
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('orderPlaced.ts') ||
  process.argv[1].endsWith('orderPlaced.js') ||
  process.argv[1].endsWith('orderPlaced')
);

if (isMain) {
  seedOrderPlaced()
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
