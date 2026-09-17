import { lazy, Suspense, useState } from 'react';
import type { FileItem } from '@drive/shared';
import { Download, LoaderCircle } from 'lucide-react';
import { Modal } from './components';
import { useFileContent } from './useFileContent';

const PdfPreview = lazy(() => import('./PdfPreview'));
export function FilePreview({
  file,
  onClose,
  download,
}: {
  file: FileItem;
  onClose: () => void;
  download: (file: FileItem) => Promise<void>;
}) {
  const { content, error, retry } = useFileContent(file.id);
  const [broken, setBroken] = useState(false);
  const loading = (
    <p role="status" className="preview-status">
      <LoaderCircle className="spin" /> Loading preview…
    </p>
  );
  return (
    <Modal
      title={file.name}
      description="File preview. Download to keep a copy of the original."
      onClose={onClose}
      className="preview-modal"
    >
      <div className="preview-toolbar">
        <button className="primary-button" onClick={() => void download(file)}>
          <Download size={18} /> Download
        </button>
      </div>
      <div className="preview-body">
        {error ? (
          <div className="preview-status" role="alert">
            <p>{error}</p>
            <button className="text-button" onClick={retry}>
              Retry
            </button>
          </div>
        ) : !content ? (
          loading
        ) : content.kind === 'image' ? (
          broken ? (
            <p role="alert" className="preview-status">
              This image could not be decoded. Download the original to open it on your device.
            </p>
          ) : (
            <img
              className="preview-image"
              src={content.url}
              alt={file.name}
              onError={() => setBroken(true)}
            />
          )
        ) : content.kind === 'pdf' ? (
          <Suspense fallback={loading}>
            <PdfPreview data={content.data} />
          </Suspense>
        ) : (
          <div className="preview-status">
            <strong>No preview available</strong>
            <p>
              Preview supports JPEG, PNG, GIF, WebP, AVIF and PDF files. Download this file to open
              it on your device.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
