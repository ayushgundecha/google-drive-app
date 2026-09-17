import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { GridFSBucket, ObjectId, type Db } from 'mongodb';
import type { Config } from './config.js';
import type { FileDoc } from './database.js';
import { HttpError } from './errors.js';
export interface Storage {
  write(file: FileDoc, source: Readable): Promise<number>;
  read(file: FileDoc): Promise<Readable>;
  remove(file: FileDoc): Promise<void>;
}
export function createStorage(db: Db, config: Config): Storage {
  const bucket = new GridFSBucket(db, { bucketName: 'content' });
  const path = (f: FileDoc) =>
    join(config.UPLOAD_DIR, f.ownerId.toHexString(), f._id.toHexString());
  return {
    async write(file, source) {
      let bytes = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          done(
            bytes > config.MAX_FILE_BYTES
              ? new HttpError(413, 'FILE_TOO_LARGE', 'The file exceeds the upload limit.')
              : null,
            chunk,
          );
        },
      });
      if (file.backend === 'local') {
        await mkdir(join(config.UPLOAD_DIR, file.ownerId.toHexString()), {
          recursive: true,
          mode: 0o700,
        });
        await pipeline(
          source,
          meter,
          createWriteStream(path(file) + '.part', { flags: 'wx', mode: 0o600 }),
        );
        await rename(path(file) + '.part', path(file));
      } else {
        await pipeline(
          source,
          meter,
          bucket.openUploadStreamWithId(file._id, file._id.toHexString()),
        );
      }
      if (!bytes) throw new HttpError(400, 'EMPTY_FILE', 'Empty files cannot be uploaded.');
      return bytes;
    },
    async read(file) {
      if (file.backend === 'local') {
        await stat(path(file));
        return createReadStream(path(file));
      }
      const exists = await db.collection('content.files').findOne({ _id: file._id });
      if (!exists) throw new Error('Stored file is missing.');
      return bucket.openDownloadStream(file._id);
    },
    async remove(file) {
      if (file.backend === 'local') {
        await Promise.all([
          rm(path(file), { force: true }),
          rm(path(file) + '.part', { force: true }),
        ]);
      } else {
        // Delete both collections explicitly: interrupted uploads may only have chunks.
        await db.collection('content.chunks').deleteMany({ files_id: new ObjectId(file._id) });
        await db.collection('content.files').deleteOne({ _id: file._id });
      }
    },
  };
}
