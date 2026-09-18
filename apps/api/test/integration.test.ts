import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import supertest from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { collections, initializeDatabase, type FileDoc, type UserDoc } from '../src/database.js';
import { createStorage } from '../src/storage.js';
import { fileService } from '../src/files.js';
let mongo: MongoMemoryServer, client: MongoClient, db: Db, root: string;
const alice: UserDoc = {
  _id: new ObjectId(),
  googleId: 'alice',
  email: 'alice@example.com',
  name: 'Alice',
  createdAt: new Date(),
};
const bob: UserDoc = {
  _id: new ObjectId(),
  googleId: 'bob',
  email: 'bob@example.com',
  name: 'Bob',
  createdAt: new Date(),
};
const eve: UserDoc = {
  _id: new ObjectId(),
  googleId: 'eve',
  email: 'eve@example.com',
  name: 'Eve',
  createdAt: new Date(),
};
const configFor = (backend: 'local' | 'gridfs' = 'local') =>
  loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB: db.databaseName,
    APP_ORIGIN: 'http://localhost:5173',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    UPLOAD_DIR: root,
    STORAGE_BACKEND: backend,
    MAX_FILE_BYTES: '65536',
    USER_QUOTA_BYTES: '262144',
    TOTAL_QUOTA_BYTES: '1048576',
  });
function build(backend: 'local' | 'gridfs' = 'local', config = configFor(backend)) {
  return createApp({
    db,
    client,
    config,
    testMiddleware: async (req, _res, next) => {
      const id = req.get('x-test-user');
      if (id)
        req.user = (await collections(db).users.findOne({ _id: new ObjectId(id) })) ?? undefined;
      next();
    },
  });
}
async function actor(app: ReturnType<typeof build>['app'], user = alice) {
  const agent = supertest.agent(app);
  const { body } = await agent
    .get('/api/csrf')
    .set('x-test-user', user._id.toHexString())
    .expect(200);
  return { agent, headers: { 'x-test-user': user._id.toHexString(), 'x-csrf-token': body.token } };
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  root = await mkdtemp(join(tmpdir(), 'drive-test-'));
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
  if (root) await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  db = client.db(`test_${new ObjectId().toHexString()}`);
  await initializeDatabase(db);
  await collections(db).users.insertMany([alice, bob, eve]);
});
for (const backend of ['local', 'gridfs'] as const)
  describe(`${backend} storage`, () => {
    it('streams exact bytes, searches literal filenames, renames without moving bytes, then deletes', async () => {
      const { app } = build(backend);
      const { agent, headers } = await actor(app);
      const data = Buffer.from('A private document.\nこんにちは');
      const uploaded = await agent
        .post('/api/files')
        .set(headers)
        .attach('file', data, 'notes[1].txt')
        .expect(201);
      const id = uploaded.body.id;
      expect(uploaded.body.size).toBe(data.length);
      const result = await agent.get('/api/files?q=%5B1%5D').set(headers).expect(200);
      expect(result.body.total).toBe(1);
      expect((await agent.get('/api/files?q=missing').set(headers)).body.total).toBe(0);
      const download = await agent.get(`/api/files/${id}/download`).set(headers).expect(200);
      expect(download.body).toEqual(data);
      expect(download.headers['content-disposition']).toContain('attachment');
      await agent.patch(`/api/files/${id}`).set(headers).send({ name: 'renamed.txt' }).expect(200);
      expect((await agent.get(`/api/files/${id}/download`).set(headers)).body).toEqual(data);
      expect((await agent.get('/api/me').set(headers)).body.usedBytes).toBe(data.length);
      await agent.delete(`/api/files/${id}`).set(headers).expect(204);
      await agent.get(`/api/files/${id}`).set(headers).expect(404);
      expect((await agent.get('/api/me').set(headers)).body.usedBytes).toBe(0);
      if (backend === 'gridfs') {
        expect(await db.collection('content.chunks').countDocuments()).toBe(0);
        expect(await db.collection('content.files').countDocuments()).toBe(0);
      }
    });
    it('rejects zero-byte, oversized and extra-part uploads without leaking quota or bytes', async () => {
      const { app } = build(backend);
      const { agent, headers } = await actor(app);
      await agent
        .post('/api/files')
        .set(headers)
        .attach('file', Buffer.alloc(0), 'empty.txt')
        .expect(400);
      await agent
        .post('/api/files')
        .set(headers)
        .attach('file', Buffer.alloc(65537), 'large.bin')
        .expect(413);
      await agent
        .post('/api/files')
        .set(headers)
        .attach('file', Buffer.from('a'), 'one.txt')
        .attach('file', Buffer.from('b'), 'two.txt')
        .expect(400);
      await agent
        .post('/api/files')
        .set(headers)
        .field('extra', 'bad')
        .attach('file', Buffer.from('x'), 'x.txt')
        .expect(400);
      expect((await collections(db).quotas.findOne({ _id: 'storage' }))?.total).toBe(0);
      expect(await collections(db).files.countDocuments()).toBe(0);
      if (backend === 'gridfs')
        expect(await db.collection('content.chunks').countDocuments()).toBe(0);
    });
    it('accepts a file exactly at the configured size limit', async () => {
      const { app } = build(backend);
      const { agent, headers } = await actor(app);
      await agent
        .post('/api/files')
        .set(headers)
        .attach('file', Buffer.alloc(65536), 'exact.bin')
        .expect(201);
    });
    it('reconciles interrupted uploads and repeated deletion cleanup idempotently', async () => {
      const config = configFor(backend),
        c = collections(db),
        storage = createStorage(db, config);
      const id = new ObjectId();
      const owner = alice._id.toHexString();
      const pending: FileDoc = {
        _id: id,
        ownerId: alice._id,
        ownerName: 'Alice',
        name: 'interrupted.txt',
        originalName: 'interrupted.txt',
        size: 7,
        mimeType: 'text/plain',
        backend,
        status: 'uploading',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      await c.files.insertOne(pending);
      await c.quotas.updateOne(
        { _id: 'storage' },
        {
          $set: {
            total: 65536,
            count: 1,
            [`users.${owner}`]: 65536,
            [`counts.${owner}`]: 1,
            [`allocations.${id.toHexString()}`]: { owner, bytes: 65536 },
          },
        },
      );
      await storage.write(pending, Readable.from(Buffer.from('partial')));
      const service = fileService(db, config, storage);
      await service.recover();
      await service.recover();
      expect(await c.files.countDocuments()).toBe(0);
      expect((await c.quotas.findOne({ _id: 'storage' }))?.total).toBe(0);
      if (backend === 'gridfs')
        expect(await db.collection('content.chunks').countDocuments()).toBe(0);
    });
  });
it('enforces identity, CSRF, object ownership, sharing and revocation', async () => {
  const { app } = build();
  await supertest(app).get('/api/files').expect(401);
  const a = await actor(app),
    b = await actor(app, bob),
    e = await actor(app, eve);
  await a.agent
    .post('/api/files')
    .set('x-test-user', alice._id.toHexString())
    .attach('file', Buffer.from('secret'), 'secret.txt')
    .expect(403);
  await a.agent
    .post('/api/files')
    .set({ ...a.headers, origin: 'https://evil.example' })
    .attach('file', Buffer.from('secret'), 'secret.txt')
    .expect(403);
  const { body } = await a.agent
    .post('/api/files')
    .set(a.headers)
    .attach('file', Buffer.from('secret'), 'secret.txt')
    .expect(201);
  const url = `/api/files/${body.id}`;
  await b.agent.get(url).set(b.headers).expect(404);
  await b.agent.get(`${url}/download`).set(b.headers).expect(404);
  expect((await b.agent.get('/api/files').set(b.headers)).body.total).toBe(0);
  await b.agent.patch(url).set(b.headers).send({ name: 'hacked.txt' }).expect(404);
  await b.agent.delete(url).set(b.headers).expect(404);
  await a.agent
    .post(`${url}/shares`)
    .set(a.headers)
    .send({ email: 'missing@example.com' })
    .expect(404);
  await a.agent.post(`${url}/shares`).set(a.headers).send({ email: alice.email }).expect(400);
  for (let i = 0; i < 2; i++)
    await a.agent
      .post(`${url}/shares`)
      .set(a.headers)
      .send({ email: ' BOB@example.com ' })
      .expect(204);
  expect((await a.agent.get(`${url}/shares`).set(a.headers)).body).toHaveLength(1);
  expect((await b.agent.get('/api/files?scope=shared').set(b.headers)).body.total).toBe(1);
  await b.agent.get(`${url}/download`).set(b.headers).expect(200);
  await b.agent.patch(url).set(b.headers).send({ name: 'no.txt' }).expect(404);
  await b.agent.post(`${url}/shares`).set(b.headers).send({ email: eve.email }).expect(404);
  await b.agent.get(`${url}/shares`).set(b.headers).expect(404);
  await e.agent.get(`${url}/download`).set(e.headers).expect(404);
  await a.agent.delete(`${url}/shares/${bob._id}`).set(a.headers).expect(204);
  await b.agent.get(`${url}/download`).set(b.headers).expect(404);
  await a.agent.patch(url).set(a.headers).send({ name: '../bad' }).expect(400);
  await a.agent.get('/api/files/not-an-id').set(a.headers).expect(400);
  await a.agent.get('/api/files?page=-1').set(a.headers).expect(400);
  await a.agent.get('/api/unknown').set(a.headers).expect(404);
});
it('reserves quotas atomically under concurrent uploads', async () => {
  const config = { ...configFor(), USER_QUOTA_BYTES: 65536, TOTAL_QUOTA_BYTES: 65536 };
  const { app } = build('local', config);
  const { agent, headers } = await actor(app);
  const results = await Promise.all(
    [1, 2, 3].map((n) =>
      agent.post('/api/files').set(headers).attach('file', Buffer.alloc(40000), `file${n}.bin`),
    ),
  );
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  expect((await collections(db).quotas.findOne({ _id: 'storage' }))?.total).toBe(40000);
});
it('deferred storage deletion stays inaccessible and recovery releases quota', async () => {
  const config = configFor();
  const base = createStorage(db, config);
  let failing = true;
  const { app, files } = createApp({
    db,
    client,
    config,
    storage: {
      ...base,
      remove: async (f) => {
        if (failing) throw new Error('Simulated storage outage');
        await base.remove(f);
      },
    },
    testMiddleware: (req, _res, next) => {
      req.user = alice;
      next();
    },
  });
  const { agent, headers } = await actor(app);
  const { body } = await agent
    .post('/api/files')
    .set(headers)
    .attach('file', Buffer.from('test'), 'test.txt')
    .expect(201);
  await agent.delete(`/api/files/${body.id}`).set(headers).expect(500);
  await agent.get(`/api/files/${body.id}/download`).set(headers).expect(404);
  failing = false;
  await files.recover();
  expect((await agent.get('/api/me').set(headers)).body.usedBytes).toBe(0);
});
it('refuses test authentication outside the isolated test runtime', () => {
  const config = { ...configFor(), NODE_ENV: 'development' as const };
  expect(() =>
    createApp({ db, client, config, testMiddleware: (_req, _res, next) => next() }),
  ).toThrow('Test authentication');
});
it('rejects invalid production configuration', () => {
  expect(() =>
    loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost/drive',
      SESSION_SECRET: 'a'.repeat(32),
    }),
  ).toThrow('Production requires');
});

it('rejects a malformed multipart body and releases its reservation', async () => {
  const { app } = build();
  const { agent, headers } = await actor(app);
  await agent
    .post('/api/files')
    .set(headers)
    .set('Content-Type', 'multipart/form-data; boundary=broken')
    .send('--broken\r\ninvalid headers')
    .expect(400);
  expect((await collections(db).quotas.findOne({ _id: 'storage' }))?.total).toBe(0);
});

it('rejects a mismatched Google OAuth state without contacting the token endpoint', async () => {
  const config = {
    ...configFor(),
    GOOGLE_CLIENT_ID: 'configured-client',
    GOOGLE_CLIENT_SECRET: 'configured-secret',
  };
  const { app } = build('local', config);
  const agent = supertest.agent(app);
  const started = await agent.get('/auth/google').expect(302);
  const target = new URL(started.headers.location);
  expect(target.hostname).toBe('accounts.google.com');
  expect(target.searchParams.get('state')).toBeTruthy();
  expect(target.searchParams.get('prompt')).toBe('select_account');
  const callback = await agent.get('/auth/google/callback?state=invalid&code=invalid').expect(302);
  expect(callback.headers.location).toBe('/?authError=failed');
  await agent.get('/api/me').expect(401);
});

it('cleans a real disconnected upload without keeping file bytes or quota', async () => {
  const { request: httpRequest } = await import('node:http');
  const { app } = build();
  // Obtain a fresh standalone session cookie for the raw HTTP client.
  const fresh = await supertest(app)
    .get('/api/csrf')
    .set('x-test-user', alice._id.toHexString())
    .expect(200);
  const cookie = fresh.headers['set-cookie'][0].split(';')[0];
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  try {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/files',
      method: 'POST',
      headers: {
        cookie,
        'x-test-user': alice._id.toHexString(),
        'x-csrf-token': fresh.body.token,
        'content-type': 'multipart/form-data; boundary=disconnect',
        'transfer-encoding': 'chunked',
      },
    });
    req.on('error', () => {});
    req.write(
      '--disconnect\r\nContent-Disposition: form-data; name="file"; filename="partial.txt"\r\nContent-Type: text/plain\r\n\r\npartial',
    );
    await expect
      .poll(async () => (await collections(db).quotas.findOne({ _id: 'storage' }))?.total)
      .toBe(65536);
    req.destroy();
    await expect
      .poll(async () => (await collections(db).quotas.findOne({ _id: 'storage' }))?.total)
      .toBe(0);
    expect(await collections(db).files.countDocuments()).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('logout destroys the authenticated session, expires its cookie and rejects cookie replay', async () => {
  const { app } = build();
  const agent = supertest.agent(app);
  const started = await agent
    .get('/api/csrf')
    .set('x-test-user', alice._id.toHexString())
    .expect(200);
  const cookie = started.headers['set-cookie'][0].split(';')[0];
  const sessions = db.collection('sessions');
  const stored = await sessions.findOne({});
  const session = JSON.parse(stored!.session);
  session.passport = { user: alice._id.toHexString() };
  await sessions.updateOne({ _id: stored!._id }, { $set: { session: JSON.stringify(session) } });
  // No test header: subsequent requests authenticate from the real Passport session.
  await agent.get('/api/me').expect(200);
  await agent.post('/auth/logout').expect(403);
  await agent.get('/api/me').expect(200);
  const response = await agent
    .post('/auth/logout')
    .set('x-csrf-token', started.body.token)
    .expect(204);
  expect(
    response.headers['set-cookie'].some(
      (value: string) =>
        value.startsWith('drive.sid=;') && value.includes('Expires=Thu, 01 Jan 1970'),
    ),
  ).toBe(true);
  expect(await sessions.countDocuments({ _id: stored!._id })).toBe(0);
  await agent.get('/api/me').expect(401);
  await supertest(app).get('/api/files').set('Cookie', cookie).expect(401);
});
