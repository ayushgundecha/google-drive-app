import { useEffect, useRef, useState } from 'react';
import type { FileItem } from '@drive/shared';
import { FileGlyph } from './components';
import { useFileContent } from './useFileContent';

export function FileThumbnail({ file }: { file: FileItem }) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [broken, setBroken] = useState(false);
  const candidate =
    /^image\/(png|jpeg|gif|webp|avif)$/.test(file.mimeType) ||
    /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name);
  const { content } = useFileContent(file.id, candidate && visible);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={root} className="thumbnail-content">
      {content?.kind === 'image' && !broken ? (
        <img src={content.url} alt="" className="image-thumbnail" onError={() => setBroken(true)} />
      ) : (
        <span className="paper-preview">
          <FileGlyph name={file.name} large />
          <span>{file.name.split('.').pop()?.slice(0, 8).toUpperCase() || 'FILE'}</span>
          <span className="paper-lines">
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
    </span>
  );
}
