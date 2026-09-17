import { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ data }: { data: ArrayBuffer }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    // Copy because PDF.js transfers ownership to its worker. Never execute PDF scripts.
    const task = getDocument({
      data: data.slice(0),
      useWasm: false,
      disableFontFace: true,
      enableXfa: false,
      maxImageSize: 16_000_000,
    });
    void task.promise
      .then((document) => {
        if (active) setPdf(document);
      })
      .catch((error: Error) => {
        if (active)
          setError(
            error.name === 'PasswordException'
              ? 'This PDF is password-protected. Download it to open with your PDF reader.'
              : 'This PDF could not be opened. Download the original to try another reader.',
          );
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [data]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let render: RenderTask | undefined;
    setBusy(true);
    setText('');
    void (async () => {
      const documentPage = await pdf.getPage(page);
      if (!active || !canvas.current) return;
      const base = documentPage.getViewport({ scale: 1 });
      const viewport = documentPage.getViewport({
        scale: Math.min(2, 1600 / Math.max(base.width, base.height)),
      });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      render = documentPage.render({ canvas: canvas.current, viewport });
      const [content] = await Promise.all([documentPage.getTextContent(), render.promise]);
      if (active) {
        setText(content.items.flatMap((item) => ('str' in item ? [item.str] : [])).join(' '));
        setBusy(false);
      }
    })().catch(() => {
      if (active) {
        setBusy(false);
        setError('This page could not be rendered. Download the original to view it.');
      }
    });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page]);
  if (error)
    return (
      <p role="alert" className="preview-status">
        {error}
      </p>
    );
  return (
    <div className="pdf-preview">
      <div className="pdf-controls">
        <button
          className="text-button"
          disabled={!pdf || page === 1 || busy}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous page
        </button>
        <span aria-live="polite">{pdf ? `Page ${page} of ${pdf.numPages}` : 'Loading PDF…'}</span>
        <button
          className="text-button"
          disabled={!pdf || page === pdf.numPages || busy}
          onClick={() => setPage((value) => value + 1)}
        >
          Next page
        </button>
      </div>
      {busy && <p role="status">Rendering page…</p>}
      <canvas
        ref={canvas}
        aria-label={`PDF page ${page}`}
        role="img"
        style={{ display: busy ? 'none' : 'block' }}
      />
      <p className="visually-hidden">{text}</p>
    </div>
  );
}
