import { ObjectId, type Db } from 'mongodb';
import type { Request } from 'express';
import Busboy from 'busboy';
import { collections, type FileDoc, type UserDoc } from './database.js';
import type { Config } from './config.js';
import type { Storage } from './storage.js';
import { HttpError } from './errors.js';
import { filenameSchema, type FileItem } from '@drive/shared';
export function objectId(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, 'INVALID_ID', 'Invalid identifier.');
  return new ObjectId(value);
}
export function fileItem(f: FileDoc, user: UserDoc): FileItem {
  return {
    id: f._id.toHexString(),
    name: f.name,
    originalName: f.originalName,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    ownerId: f.ownerId.toHexString(),
    ownerName: f.ownerName,
    isOwner: f.ownerId.equals(user._id),
  };
}
export function fileService(db: Db, config: Config, storage: Storage) {
  const c = collections(db);
  async function reserve(f: FileDoc) {
    const owner = f.ownerId.toHexString(),
      id = f._id.toHexString(),
      bytes = config.MAX_FILE_BYTES;
    const result = await c.quotas.updateOne(
      {
        _id: 'storage',
        total: { $lte: config.TOTAL_QUOTA_BYTES - bytes },
        count: { $lt: 1000 },
        $expr: {
          $and: [
            { $lte: [{ $ifNull: [`$users.${owner}`, 0] }, config.USER_QUOTA_BYTES - bytes] },
            { $lt: [{ $ifNull: [`$counts.${owner}`, 0] }, 100] },
          ],
        },
      },
      {
        $inc: { total: bytes, count: 1, [`users.${owner}`]: bytes, [`counts.${owner}`]: 1 },
        $set: { [`allocations.${id}`]: { owner, bytes } },
      },
    );
    if (!result.modifiedCount)
      throw new HttpError(
        409,
        'QUOTA_EXCEEDED',
        'Storage capacity or file count limit reached. Delete files and try again.',
      );
  }
  async function settle(f: FileDoc, bytes: number) {
    const id = f._id.toHexString(),
      owner = f.ownerId.toHexString(),
      difference = bytes - config.MAX_FILE_BYTES;
    await c.quotas.updateOne(
      { _id: 'storage', [`allocations.${id}.bytes`]: config.MAX_FILE_BYTES },
      {
        $inc: { total: difference, [`users.${owner}`]: difference },
        $set: { [`allocations.${id}.bytes`]: bytes },
      },
    );
  }
  async function release(f: FileDoc) {
    const id = f._id.toHexString();
    const quota = await c.quotas.findOne({ _id: 'storage' });
    const allocation = quota?.allocations[id];
    if (!allocation) return;
    await c.quotas.updateOne(
      { _id: 'storage', [`allocations.${id}.bytes`]: allocation.bytes },
      {
        $inc: {
          total: -allocation.bytes,
          count: -1,
          [`users.${allocation.owner}`]: -allocation.bytes,
          [`counts.${allocation.owner}`]: -1,
        },
        $unset: { [`allocations.${id}`]: '' },
      },
    );
  }
  async function cleanup(f: FileDoc) {
    await storage.remove(f);
    await c.shares.deleteMany({ fileId: f._id });
    await release(f);
    await c.files.deleteOne({ _id: f._id, status: { $ne: 'ready' } });
  }
  async function accessible(id: string, user: UserDoc, ownerOnly = false) {
    const file = await c.files.findOne({ _id: objectId(id), status: 'ready' });
    if (!file) throw new HttpError(404, 'NOT_FOUND', 'File not found.');
    if (!file.ownerId.equals(user._id)) {
      if (ownerOnly || !(await c.shares.findOne({ fileId: file._id, recipientId: user._id })))
        throw new HttpError(404, 'NOT_FOUND', 'File not found.');
    }
    return file;
  }
  async function upload(req: Request, user: UserDoc) {
    const now = new Date();
    const f: FileDoc = {
      _id: new ObjectId(),
      ownerId: user._id,
      ownerName: user.name,
      name: '',
      originalName: '',
      mimeType: 'application/octet-stream',
      size: 0,
      backend: config.STORAGE_BACKEND,
      status: 'uploading',
      createdAt: now,
      updatedAt: now,
    };
    await c.files.insertOne(f);
    try {
      await reserve(f);
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({
          headers: req.headers,
          defParamCharset: 'utf8',
          limits: {
            files: 1,
            fields: 0,
            parts: 2,
            fileSize: config.MAX_FILE_BYTES + 1,
            headerPairs: 50,
          },
        });
      } catch {
        throw new HttpError(400, 'INVALID_UPLOAD', 'Send one file as multipart/form-data.');
      }
      let count = 0;
      let failure: unknown;
      let writing: Promise<void> = Promise.resolve();
      await new Promise<void>((resolve, reject) => {
        const aborted = () => {
          parser.destroy(new HttpError(400, 'UPLOAD_ABORTED', 'Upload interrupted.'));
        };
        req.once('aborted', aborted);
        parser.on('file', (field, source, info) => {
          count++;
          writing = (async () => {
            if (field !== 'file') {
              source.resume();
              throw new HttpError(400, 'INVALID_UPLOAD', 'Use the file field.');
            }
            const parsed = filenameSchema.safeParse(info.filename);
            if (!parsed.success) {
              source.resume();
              throw new HttpError(
                400,
                'INVALID_FILENAME',
                'Use a valid filename, at most 180 characters.',
              );
            }
            f.name = parsed.data;
            f.originalName = parsed.data;
            f.mimeType = info.mimeType.slice(0, 150);
            f.size = await storage.write(f, source);
            if (source.truncated)
              throw new HttpError(413, 'FILE_TOO_LARGE', 'The file exceeds the upload limit.');
          })().catch((error) => {
            failure = error;
            source.resume();
          });
        });
        for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'])
          parser.on(event, () => {
            failure = new HttpError(
              400,
              'INVALID_UPLOAD',
              'Send exactly one file and no extra fields.',
            );
          });
        parser.once('error', (error) => {
          req.off('aborted', aborted);
          reject(
            error instanceof HttpError
              ? error
              : new HttpError(400, 'INVALID_UPLOAD', 'Malformed or interrupted multipart upload.'),
          );
        });
        parser.once('close', () => {
          req.off('aborted', aborted);
          resolve();
        });
        if (req.aborted) aborted();
        else req.pipe(parser);
      }).finally(async () => {
        await writing;
      });
      if (failure) throw failure;
      if (count !== 1) throw new HttpError(400, 'INVALID_UPLOAD', 'Select a file to upload.');
      await settle(f, f.size);
      f.status = 'ready';
      f.updatedAt = new Date();
      await c.files.replaceOne({ _id: f._id, status: 'uploading' }, f);
      return fileItem(f, user);
    } catch (error) {
      await c.files.updateOne(
        { _id: f._id },
        { $set: { status: 'deleting', updatedAt: new Date() } },
      );
      try {
        await cleanup({ ...f, status: 'deleting' });
      } catch {
        console.error('Upload cleanup deferred', f._id.toHexString());
      }
      throw error;
    }
  }
  async function remove(f: FileDoc) {
    await c.files.updateOne(
      { _id: f._id, status: 'ready' },
      { $set: { status: 'deleting', updatedAt: new Date() } },
    );
    await cleanup({ ...f, status: 'deleting' });
  }
  async function recover() {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    await c.files.updateMany(
      { status: 'uploading', updatedAt: { $lt: cutoff } },
      { $set: { status: 'deleting' } },
    );
    for await (const file of c.files.find({ status: 'deleting' })) {
      try {
        await cleanup(file);
      } catch {
        console.error('Storage cleanup deferred', file._id.toHexString());
      }
    }
  }
  return { accessible, upload, remove, recover };
}
