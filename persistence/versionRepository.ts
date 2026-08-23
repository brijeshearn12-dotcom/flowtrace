import { Document } from 'mongodb';
import { getDb } from '../server/db';
import { COLLECTIONS } from './constants';
import { WorkflowVersionDocument } from './types';
import { mapDocument, parseObjectId } from './utils';
import { WorkflowRepository } from './workflowRepository';
import { Trigger, Node, Edge } from '../shared/ir';

export class VersionRepository {
  private static getCollection() {
    return getDb().collection<Document>(COLLECTIONS.VERSIONS);
  }

  static async create(version: {
    workflowId: string;
    version: number;
    trigger: Trigger;
    nodes: Node[];
    edges: Edge[];
    source?: 'manual' | 'agent';
    summary?: string;
  }): Promise<WorkflowVersionDocument> {
    const doc = {
      workflowId: version.workflowId,
      version: version.version,
      trigger: version.trigger,
      nodes: version.nodes,
      edges: version.edges,
      createdAt: new Date().toISOString(),
      source: version.source || 'manual',
      summary: version.summary || '',
    };
    const result = await this.getCollection().insertOne(doc);
    return mapDocument<Document, WorkflowVersionDocument>({
      _id: result.insertedId,
      ...doc,
    });
  }

  static async get(id: string): Promise<WorkflowVersionDocument | null> {
    try {
      const oid = parseObjectId(id);
      const doc = await this.getCollection().findOne({ _id: oid });
      if (!doc) return null;
      return mapDocument<Document, WorkflowVersionDocument>(doc);
    } catch {
      return null;
    }
  }

  static async getByVersion(workflowId: string, versionNumber: number): Promise<WorkflowVersionDocument | null> {
    const doc = await this.getCollection().findOne({ workflowId, version: versionNumber });
    if (!doc) return null;
    return mapDocument<Document, WorkflowVersionDocument>(doc);
  }

  static async list(workflowId: string): Promise<WorkflowVersionDocument[]> {
    const docs = await this.getCollection().find({ workflowId }).toArray();
    return docs.map(doc => mapDocument<Document, WorkflowVersionDocument>(doc));
  }

  static async publish(workflowId: string, versionId: string): Promise<void> {
    // Set the workflow's status to published and update publishedVersionId pointer
    await WorkflowRepository.update(workflowId, {
      status: 'published',
      publishedVersionId: versionId,
    });
  }
}
