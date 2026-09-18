// Isolated browser-test process. This entry point is never included in production builds.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../apps/api/src/config.js';
import { initializeDatabase, collections } from '../apps/api/src/database.js';
import { createApp } from '../apps/api/src/app.js';
if (process.env.NODE_ENV !== 'test') throw new Error('Run this fixture only with NODE_ENV=test.');
const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('browser_test');
await initializeDatabase(db);
const root = await mkdtemp(join(tmpdir(), 'drive-browser-'));
const alice = {
  _id: new ObjectId('111111111111111111111111'),
  googleId: 'alice',
  email: 'alice@example.com',
  name: 'Alice Morgan',
  createdAt: new Date(),
};
const bob = {
  _id: new ObjectId('222222222222222222222222'),
  googleId: 'bob',
  email: 'bob@example.com',
  name: 'Bob Chen',
  createdAt: new Date(),
};
await collections(db).users.insertMany([alice, bob]);
const config = loadConfig({
  NODE_ENV: 'test',
  PORT: '3100',
  APP_ORIGIN: 'http://127.0.0.1:3100',
  MONGODB_URI: mongo.getUri(),
  SESSION_SECRET: 'isolated-browser-test-secret-32-characters',
  UPLOAD_DIR: root,
});
const { app } = createApp({
  db,
  client,
  config,
  testMiddleware: (req, res, next) => {
    const cookie = req.headers.cookie ?? '';
    const user = cookie.includes('test-user=alice')
      ? alice
      : cookie.includes('test-user=bob')
        ? bob
        : null;
    if (!user) return next();
    // Seed once, then exercise actual Passport sessions, including logout.
    res.clearCookie('test-user', { path: '/' });
    req.logIn(user, next);
  },
});
const server = app.listen(3100, '127.0.0.1', () => console.log('Browser fixture ready'));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => {
      void (async () => {
        await client.close();
        await mongo.stop();
        await rm(root, { recursive: true, force: true });
        process.exit(0);
      })();
    });
  });
