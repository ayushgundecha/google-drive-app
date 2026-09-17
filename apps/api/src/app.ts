import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import contentDisposition from 'content-disposition';
import type { Db, MongoClient } from 'mongodb';
import { ZodError } from 'zod';
import { listSchema, renameSchema, shareSchema, type Me } from '@drive/shared';
import type { Config } from './config.js';
import { collections, type FileDoc } from './database.js';
import { createPassport } from './auth.js';
import { createStorage, type Storage } from './storage.js';
import { fileService, fileItem, objectId } from './files.js';
import { HttpError } from './errors.js';
interface Options {
  db: Db;
  client: MongoClient;
  config: Config;
  storage?: Storage;
  testMiddleware?: RequestHandler;
}
export function createApp({
  db,
  client,
  config,
  storage = createStorage(db, config),
  testMiddleware,
}: Options) {
  if (testMiddleware && config.NODE_ENV !== 'test')
    throw new Error('Test authentication is only permitted in test mode.');
  const app = express();
  const c = collections(db);
  const files = fileService(db, config, storage);
  const passport = createPassport(db, config);
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    res.locals.requestId = id;
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
        },
      },
      strictTransportSecurity: config.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'ok' });
  });
  const sessionStore = MongoStore.create({
    clientPromise: Promise.resolve(client),
    dbName: db.databaseName,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60,
  });
  app.use(
    ['/api', '/auth'],
    session({
      name: 'drive.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(['/api', '/auth'], passport.initialize(), passport.session());
  if (testMiddleware) app.use('/api', testMiddleware);
  app.use(['/api', '/auth'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const requireAuth: RequestHandler = (req, _res, next) =>
    req.user ? next() : next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
  const csrf: RequestHandler = (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const supplied = req.get('x-csrf-token') ?? '';
    const expected = req.session.csrf ?? '';
    if (
      (origin && origin !== config.APP_ORIGIN) ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return next(
        new HttpError(403, 'CSRF_INVALID', 'Your session changed. Refresh and try again.'),
      );
    next();
  };
  app.get(
    '/auth/google',
    rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
    (req, res, next) => {
      if (!config.GOOGLE_CLIENT_ID) return res.redirect('/?authError=unconfigured');
      passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
    },
  );
  app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?authError=failed' }),
    (_req, res) => res.redirect('/drive'),
  );
  app.post('/auth/logout', csrf, (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy((error) => {
        if (error) return next(error);
        res
          .clearCookie('drive.sid', {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
          })
          .status(204)
          .end();
      });
    });
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.' },
      },
    }),
    requireAuth,
    csrf,
    express.json({ limit: '16kb' }),
  );
  app.get('/api/csrf', (req, res) => {
    req.session.csrf ??= randomBytes(32).toString('hex');
    res.json({ token: req.session.csrf });
  });
  app.get('/api/me', async (req, res) => {
    const user = req.user!;
    const quota = await c.quotas.findOne({ _id: 'storage' });
    const result: Me = {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      usedBytes: quota?.users[user._id.toHexString()] ?? 0,
      quotaBytes: config.USER_QUOTA_BYTES,
      maxFileBytes: config.MAX_FILE_BYTES,
    };
    res.json(result);
  });
  app.get('/api/files', async (req, res) => {
    const { scope, q, page } = listSchema.parse(req.query);
    const user = req.user!;
    const shared =
      scope === 'shared'
        ? await c.shares
            .find({ recipientId: user._id })
            .project<{ fileId: FileDoc['_id'] }>({ fileId: 1 })
            .toArray()
        : [];
    const filter = {
      status: 'ready' as const,
      ...(scope === 'owned'
        ? { ownerId: user._id }
        : { _id: { $in: shared.map((s) => s.fileId) } }),
      ...(q ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    };
    const [items, total] = await Promise.all([
      c.files
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 25)
        .limit(25)
        .toArray(),
      c.files.countDocuments(filter),
    ]);
    res.json({ files: items.map((f) => fileItem(f, user)), total, page, pageSize: 25 });
  });
  app.post(
    '/api/files',
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Please wait before uploading more files.' },
      },
    }),
    async (req, res) => {
      res.status(201).json(await files.upload(req, req.user!));
    },
  );
  app.get('/api/files/:id', async (req, res) =>
    res.json(fileItem(await files.accessible(req.params.id, req.user!), req.user!)),
  );
  app.get('/api/files/:id/download', async (req, res, next) => {
    const file = await files.accessible(req.params.id, req.user!);
    const source = await storage.read(file);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(file.name));
    res.setHeader('Content-Length', file.size);
    try {
      await pipeline(source, res);
    } catch (error) {
      if (!res.destroyed) next(error);
    }
  });
  app.patch('/api/files/:id', async (req, res) => {
    const { name } = renameSchema.parse(req.body);
    const file = await files.accessible(req.params.id, req.user!, true);
    file.name = name;
    file.updatedAt = new Date();
    await c.files.updateOne(
      { _id: file._id, status: 'ready' },
      { $set: { name, updatedAt: file.updatedAt } },
    );
    res.json(fileItem(file, req.user!));
  });
  app.delete('/api/files/:id', async (req, res) => {
    await files.remove(await files.accessible(req.params.id, req.user!, true));
    res.status(204).end();
  });
  app.get('/api/files/:id/shares', async (req, res) => {
    const file = await files.accessible(req.params.id, req.user!, true);
    const shares = await c.shares.find({ fileId: file._id }).toArray();
    const users = await c.users.find({ _id: { $in: shares.map((s) => s.recipientId) } }).toArray();
    res.json(
      shares.flatMap((s) => {
        const u = users.find((u) => u._id.equals(s.recipientId));
        return u
          ? [
              {
                recipientId: u._id.toHexString(),
                name: u.name,
                email: u.email,
                createdAt: s.createdAt.toISOString(),
              },
            ]
          : [];
      }),
    );
  });
  app.post('/api/files/:id/shares', async (req, res) => {
    const { email } = shareSchema.parse(req.body);
    const file = await files.accessible(req.params.id, req.user!, true);
    const recipient = await c.users.findOne({ email });
    if (!recipient)
      throw new HttpError(
        404,
        'RECIPIENT_NOT_FOUND',
        'This person needs to sign in to Drive once before you can share with them.',
      );
    if (recipient._id.equals(req.user!._id))
      throw new HttpError(400, 'SELF_SHARE', 'You already own this file.');
    await c.shares.updateOne(
      { fileId: file._id, recipientId: recipient._id },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    // Recheck after inserting to avoid retaining grants when deletion raced this request.
    if (!(await c.files.findOne({ _id: file._id, status: 'ready' }))) {
      await c.shares.deleteMany({ fileId: file._id });
      throw new HttpError(404, 'NOT_FOUND', 'File not found.');
    }
    res.status(204).end();
  });
  app.delete('/api/files/:id/shares/:recipientId', async (req, res) => {
    const file = await files.accessible(req.params.id, req.user!, true);
    await c.shares.deleteOne({ fileId: file._id, recipientId: objectId(req.params.recipientId) });
    res.status(204).end();
  });
  app.use(['/api', '/auth'], (_req, _res, next) =>
    next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.')),
  );
  const web = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
  app.use(express.static(web, { index: false }));
  app.get(['/', '/drive', '/shared'], (_req, res) => res.sendFile(resolve(web, 'index.html')));
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Page not found.')));
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the highlighted fields.',
          fields: error.flatten().fieldErrors,
        },
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request is too large.' } });
      return;
    }
    console.error(
      JSON.stringify({
        level: 'error',
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  };
  app.use(errors);
  return { app, files, sessionStore };
}
