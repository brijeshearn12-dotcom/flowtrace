import { Document, ObjectId, Filter } from 'mongodb';
import { getDb } from '../server/db';
import { COLLECTIONS } from './constants';
import { RunDocument } from './types';
import { mapDocument } from './utils';
import { StepResult } from '../shared/ir';

export class RunRepository {
  private static getCollection() {
    return getDb().collection<Document>(COLLECTIONS.RUNS);
  }

  static async create(run: {
    id?: string;
    workflowId: string;
    workflowVersionId: string;
    version: number;
    status: 'running' | 'success' | 'failed' | 'aborted';
    triggerPayload: Record<string, unknown>;
    results?: Record<string, StepResult>;
    startedAt?: string;
  }): Promise<RunDocument> {
    const doc: Document = {
      workflowId: run.workflowId,
      workflowVersionId: run.workflowVersionId,
      version: run.version,
      status: run.status,
      triggerPayload: run.triggerPayload,
      results: run.results || {},
      startedAt: run.startedAt || new Date().toISOString(),
    };
    if (run.id) {
      doc._id = run.id;
    }
    const result = await this.getCollection().insertOne(doc);
    if (!doc._id) {
      doc._id = result.insertedId;
    }
    return mapDocument<Document, RunDocument>(doc);
  }

  static async get(id: string): Promise<RunDocument | null> {
    const filter = { _id: id } as unknown as Filter<Document>;
    const doc = await this.getCollection().findOne(filter);
    if (!doc) {
      if (ObjectId.isValid(id)) {
        const filterOid = { _id: new ObjectId(id) } as unknown as Filter<Document>;
        const docOid = await this.getCollection().findOne(filterOid);
        if (docOid) return mapDocument<Document, RunDocument>(docOid);
      }
      return null;
    }
    return mapDocument<Document, RunDocument>(doc);
  }

  static async list(workflowId?: string): Promise<RunDocument[]> {
    const filter = workflowId ? ({ workflowId } as unknown as Filter<Document>) : {};
    const docs = await this.getCollection().find(filter).toArray();
    return docs.map(doc => mapDocument<Document, RunDocument>(doc));
  }

  static async update(
    id: string,
    update: Partial<Pick<RunDocument, 'status' | 'results' | 'completedAt'>>
  ): Promise<RunDocument | null> {
    const filter = { _id: id } as unknown as Filter<Document>;
    let result = await this.getCollection().findOneAndUpdate(
      filter,
      { $set: update },
      { returnDocument: 'after' }
    );
    
    if (!result && ObjectId.isValid(id)) {
      const filterOid = { _id: new ObjectId(id) } as unknown as Filter<Document>;
      result = await this.getCollection().findOneAndUpdate(
        filterOid,
        { $set: update },
        { returnDocument: 'after' }
      );
    }

    if (!result) return null;
    return mapDocument<Document, RunDocument>(result);
  }
}
