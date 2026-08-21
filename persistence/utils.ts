import { Document, ObjectId } from 'mongodb';

/**
 * Maps a MongoDB document with `_id` to a domain/application-friendly typed object with a string `id`.
 */
export function mapDocument<T extends Document, R>(doc: T): R {
  const { _id, ...rest } = doc;
  return {
    id: _id instanceof ObjectId ? _id.toHexString() : String(_id),
    ...rest,
  } as unknown as R;
}

/**
 * Safely parses a string ID to a MongoDB ObjectId if it is valid.
 * Otherwise, returns the string or throws an error.
 */
export function parseObjectId(id: string): ObjectId {
  if (ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  throw new Error(`Invalid MongoDB ObjectId format: ${id}`);
}
