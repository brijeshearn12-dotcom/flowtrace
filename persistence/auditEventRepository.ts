import { Document } from 'mongodb';
import { getDb } from '../server/db';
import { COLLECTIONS } from './constants';
import { AuditEventDocument } from './types';
import { mapDocument, parseObjectId } from './utils';

export class AuditEventRepository {
  private static getCollection() {
    return getDb().collection<Document>(COLLECTIONS.AUDIT_EVENTS);
  }

  static async create(event: {
    actor: 'user' | 'agent';
    action: 'create' | 'edit' | 'publish' | 'execute';
    entityType: 'workflow' | 'run';
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<AuditEventDocument> {
    const doc = {
      actor: event.actor,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      timestamp: new Date().toISOString(),
    };
    const result = await this.getCollection().insertOne(doc);
    return mapDocument<Document, AuditEventDocument>({
      _id: result.insertedId,
      ...doc,
    });
  }

  static async get(id: string): Promise<AuditEventDocument | null> {
    try {
      const oid = parseObjectId(id);
      const doc = await this.getCollection().findOne({ _id: oid });
      if (!doc) return null;
      return mapDocument<Document, AuditEventDocument>(doc);
    } catch {
      return null;
    }
  }

  static async list(entityType?: 'workflow' | 'run', entityId?: string): Promise<AuditEventDocument[]> {
    const filter: Record<string, unknown> = {};
    if (entityType) {
      filter.entityType = entityType;
    }
    if (entityId) {
      filter.entityId = entityId;
    }
    const docs = await this.getCollection().find(filter).sort({ timestamp: -1 }).toArray();
    return docs.map(doc => mapDocument<Document, AuditEventDocument>(doc));
  }
}
