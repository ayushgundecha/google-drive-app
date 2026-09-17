import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Config } from './config.js';
export interface UserDoc {
  _id: ObjectId;
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}
export interface FileDoc {
  _id: ObjectId;
  ownerId: ObjectId;
  ownerName: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  backend: 'local' | 'gridfs';
  status: 'uploading' | 'ready' | 'deleting';
  createdAt: Date;
  updatedAt: Date;
}
export interface ShareDoc {
  _id: ObjectId;
  fileId: ObjectId;
  recipientId: ObjectId;
  createdAt: Date;
}
export interface Allocation {
  owner: string;
  bytes: number;
}
export interface QuotaDoc {
  _id: string;
  total: number;
  count: number;
  users: Record<string, number>;
  counts: Record<string, number>;
  allocations: Record<string, Allocation>;
}
export function collections(db: Db) {
  return {
    users: db.collection<UserDoc>('users'),
    files: db.collection<FileDoc>('files'),
    shares: db.collection<ShareDoc>('shares'),
    quotas: db.collection<QuotaDoc>('quotas'),
  };
}
export async function connectDatabase(config: Config) {
  const client = new MongoClient(config.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(config.MONGODB_DB);
  await initializeDatabase(db);
  return { client, db };
}
export async function initializeDatabase(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.users.createIndex({ googleId: 1 }, { unique: true }),
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.files.createIndex({ ownerId: 1, status: 1, createdAt: -1, _id: -1 }),
    c.files.createIndex({ status: 1, updatedAt: 1 }),
    c.shares.createIndex({ fileId: 1, recipientId: 1 }, { unique: true }),
    c.shares.createIndex({ recipientId: 1 }),
  ]);
  await c.quotas.updateOne(
    { _id: 'storage' },
    { $setOnInsert: { total: 0, count: 0, users: {}, counts: {}, allocations: {} } },
    { upsert: true },
  );
}
