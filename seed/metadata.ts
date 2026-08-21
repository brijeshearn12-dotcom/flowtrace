import { ObjectId } from 'mongodb';
import { connectDB, closeDB } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';

const seedData = [
  {
    _id: new ObjectId('60c72b2f9b1d8b2bad8f4101'),
    key: 'forms',
    value: {
      order_placed_form: {
        id: 'order_placed_form',
        name: 'Order Placed Trigger Form',
        schema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', title: 'Order ID' },
            amount: { type: 'number', title: 'Amount' }
          },
          required: ['orderId', 'amount']
        }
      },
      asset_request_form: {
        id: 'asset_request_form',
        name: 'Asset Request Approval Form',
        schema: {
          type: 'object',
          properties: {
            assetId: { type: 'string', title: 'Asset ID' },
            requester: { type: 'string', title: 'Requester Name' },
            approver: { type: 'string', title: 'Approver Email' }
          },
          required: ['assetId', 'requester', 'approver']
        }
      }
    }
  },
  {
    _id: new ObjectId('60c72b2f9b1d8b2bad8f4102'),
    key: 'functions',
    value: {
      'FraudService.check': {
        name: 'Fraud Check',
        description: 'Checks the fraud score for a given order amount',
        inputs: {
          orderId: 'string',
          amount: 'number'
        },
        outputs: {
          score: 'number',
          approved: 'boolean'
        }
      },
      'EmailService.send': {
        name: 'Send Confirmation Email',
        description: 'Sends an email to confirm the order',
        inputs: {
          recipient: 'string',
          subject: 'string',
          body: 'string'
        },
        outputs: {
          success: 'boolean'
        }
      },
      'Slack.post': {
        name: 'Post Slack Notification',
        description: 'Posts a message to a Slack channel',
        inputs: {
          channel: 'string',
          message: 'string'
        },
        outputs: {
          success: 'boolean'
        }
      }
    }
  },
  {
    _id: new ObjectId('60c72b2f9b1d8b2bad8f4103'),
    key: 'buttons',
    value: {
      approve: {
        id: 'approve',
        label: 'Approve',
        style: 'primary'
      },
      reject: {
        id: 'reject',
        label: 'Reject',
        style: 'danger'
      }
    }
  },
  {
    _id: new ObjectId('60c72b2f9b1d8b2bad8f4104'),
    key: 'operations',
    value: {
      eq: {
        id: 'eq',
        name: 'Equals',
        description: 'Checks if two values are equal'
      },
      neq: {
        id: 'neq',
        name: 'Not Equals',
        description: 'Checks if two values are not equal'
      },
      gt: {
        id: 'gt',
        name: 'Greater Than',
        description: 'Checks if first value is greater than the second'
      }
    }
  }
];

export async function seedMetadata(): Promise<void> {
  console.log('Connecting to database...');
  const { db } = await connectDB();
  const collection = db.collection(COLLECTIONS.METADATA);

  console.log('Seeding project metadata...');
  for (const doc of seedData) {
    const { key, value } = doc;
    const updatedAt = new Date().toISOString();

    await collection.updateOne(
      { key },
      {
        $setOnInsert: { _id: doc._id },
        $set: { value, updatedAt }
      },
      { upsert: true }
    );
    console.log(`Upserted metadata key: "${key}"`);
  }

  console.log('Metadata seeding complete.');
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('metadata.ts') ||
  process.argv[1].endsWith('metadata.js') ||
  process.argv[1].endsWith('metadata')
);

if (isMain) {
  seedMetadata()
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
