import { connectDB } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';

const workflowId = 'wf_user_registration';
const workflowName = 'User Registration Process';

const trigger: Trigger = {
  id: 'tr_user_registration',
  type: 'manual',
  schema: {
    type: 'object',
    properties: {
      userId: { type: 'string', title: 'User ID' },
      username: { type: 'string', title: 'Username' },
      email: { type: 'string', title: 'Email Address' }
    },
    required: ['userId', 'username', 'email']
  }
};

const nodes: Node[] = [
  {
    id: 'user-verification',
    name: 'User Identity Verification',
    type: 'action',
    action: 'FraudService.check',
    inputs: {
      orderId: '{{trigger.userId}}',
      amount: 1
    }
  },
  {
    id: 'welcome-email',
    name: 'Send Welcome Email',
    type: 'action',
    action: 'EmailService.send',
    inputs: {
      recipient: '{{trigger.email}}',
      subject: 'Welcome to FlowTrace!',
      body: 'Hi {{trigger.username}}, thank you for registering!'
    }
  },
  {
    id: 'team-alert',
    name: 'Post Slack Signup Alert',
    type: 'action',
    action: 'Slack.post',
    inputs: {
      channel: '#signups',
      message: 'New user registered: {{trigger.username}} ({{trigger.email}})'
    }
  }
];

const edges: Edge[] = [
  {
    id: 'edge_ver_to_email',
    source: 'user-verification',
    target: 'welcome-email'
  },
  {
    id: 'edge_email_to_alert',
    source: 'welcome-email',
    target: 'team-alert'
  }
];

export async function seedUserRegistration(): Promise<void> {
  const { db } = await connectDB();

  console.log('Cleaning up existing UserRegistration workflow...');
  await db.collection(COLLECTIONS.WORKFLOWS).deleteOne({ _id: workflowId as unknown as import('mongodb').ObjectId });
  await db.collection(COLLECTIONS.VERSIONS).deleteMany({ workflowId });

  console.log('Creating UserRegistration workflow draft...');
  const { workflow, version } = await VersionService.createWorkflow(
    workflowId,
    workflowName,
    trigger,
    nodes,
    edges
  );
  console.log(`Created workflow draft "${workflow.name}" (version ${version.version})`);

  console.log('Publishing UserRegistration workflow version 1...');
  await VersionService.publishVersion(workflowId, version.version);
  console.log(`Published version 1 of workflow "${workflow.name}"`);
}
