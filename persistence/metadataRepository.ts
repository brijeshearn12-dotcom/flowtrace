import { getDb } from '../server/db';
import { COLLECTIONS } from './constants';
import { ProjectMetadata } from './types';

export class MetadataRepository {
  private static getCollection() {
    return getDb().collection(COLLECTIONS.METADATA);
  }

  static async create(key: string, value: Record<string, unknown>): Promise<ProjectMetadata> {
    const doc = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
    await this.getCollection().insertOne(doc);
    return doc;
  }

  static async get(key: string): Promise<ProjectMetadata | null> {
    const doc = await this.getCollection().findOne({ key });
    if (!doc) return null;
    return {
      key: doc.key as string,
      value: doc.value as Record<string, unknown>,
      updatedAt: doc.updatedAt as string,
    };
  }

  static async update(key: string, value: Record<string, unknown>): Promise<ProjectMetadata | null> {
    const updatedAt = new Date().toISOString();
    const result = await this.getCollection().findOneAndUpdate(
      { key },
      { $set: { value, updatedAt } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return {
      key: result.key as string,
      value: result.value as Record<string, unknown>,
      updatedAt: result.updatedAt as string,
    };
  }
}
