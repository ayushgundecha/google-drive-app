import { FileThumbnail } from './FileThumbnail';
import type { FileItem } from '@drive/shared';
import { FileGlyph, FileMenu, type FileAction } from './components';
import { bytes, date } from './api';
export function FileCollection({
  files,
  layout,
  shared,
  action,
  download,
}: {
  files: FileItem[];
  layout: 'grid' | 'list';
  shared: boolean;
  action: (action: FileAction, file: FileItem) => void;
  download: (file: FileItem) => Promise<void>;
}) {
  return layout === 'grid' ? (
    <div className="file-grid">
      {files.map((file) => (
        <article className="file-card" key={file.id}>
          <div className="card-heading">
            <FileGlyph name={file.name} />
            <button className="file-name" title={file.name} onClick={() => action('preview', file)}>
              {file.name}
            </button>
            <FileMenu file={file} onAction={action} onDownload={(file) => void download(file)} />
          </div>
          <button
            className="file-preview"
            aria-label={`Preview ${file.name}`}
            onClick={() => action('preview', file)}
          >
            <FileThumbnail file={file} />
          </button>
          <div className="card-footer">
            <span>{bytes(file.size)}</span>
            <span>{shared ? file.ownerName : date(file.createdAt)}</span>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Owner</th>
            <th scope="col">Date modified</th>
            <th scope="col">File size</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td>
                <div className="table-name">
                  <FileGlyph name={file.name} />
                  <button onClick={() => action('preview', file)} title={file.name}>
                    {file.name}
                  </button>
                </div>
              </td>
              <td>{file.isOwner ? 'me' : file.ownerName}</td>
              <td>{date(file.updatedAt)}</td>
              <td>{bytes(file.size)}</td>
              <td>
                <FileMenu
                  file={file}
                  onAction={action}
                  onDownload={(file) => void download(file)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
