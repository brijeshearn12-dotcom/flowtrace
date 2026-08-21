import { Document, Filter } from 'mongodb';
import { getDb } from '../server/db';
import { COLLECTIONS } from './constants';
import { WorkflowDocument } from './types';
import { mapDocument } from './utils';

export class WorkflowRepository {
  private static getCollection() {
    return getDb().collection<Document>(COLLECTIONS.WORKFLOWS);
  }

  static async create(workflow: {
    id: string;
    name: string;
    status?: 'draft' | 'published' | 'archived';
    latestVersion?: number;
    publishedVersionId?: string | null;
  }): Promise<WorkflowDocument> {
    const now = new Date().toISOString();
    const doc = {
      _id: workflow.id, // Keep logical string ID as the _id
      name: workflow.name,
      status: workflow.status || 'draft',
      latestVersion: workflow.latestVersion || 1,
      publishedVersionId: workflow.publishedVersionId || null,
      createdAt: now,
      updatedAt: now,
    };
    await this.getCollection().insertOne(doc as unknown as Document);
    return mapDocument<Document, WorkflowDocument>(doc as unknown as Document);
  }

  static async get(id: string): Promise<WorkflowDocument | null> {
    const filter = { _id: id } as unknown as Filter<Document>;
    const doc = await this.getCollection().findOne(filter);
    if (!doc) return null;
    return mapDocument<Document, WorkflowDocument>(doc);
  }

  static async list(): Promise<WorkflowDocument[]> {
    const docs = await this.getCollection().find({}).toArray();
    return docs.map(doc => mapDocument<Document, WorkflowDocument>(doc));
  }

  static async update(
    id: string,
    update: Partial<Omit<WorkflowDocument, 'id' | 'createdAt'>>
  ): Promise<WorkflowDocument | null> {
    const updateDoc: Record<string, unknown> = { ...update };
    updateDoc.updatedAt = new Date().toISOString();

    const filter = { _id: id } as unknown as Filter<Document>;
    const result = await this.getCollection().findOneAndUpdate(
      filter,
      { $set: updateDoc },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return mapDocument<Document, WorkflowDocument>(result);
  }
}
