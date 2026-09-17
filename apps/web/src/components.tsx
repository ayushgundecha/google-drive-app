import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  X,
  MoreVertical,
  Download,
  Pencil,
  Copy,
  UserPlus,
  Folder,
  Info,
  Trash2,
  ExternalLink,
  CheckCircle2,
  ChevronRight,
  FileText,
  FileImage,
  FileArchive,
  FileCode2,
  FileVideo,
  FileAudio,
  File as FileIcon,
} from 'lucide-react';
import type { FileItem } from '@drive/shared';
export function DriveMark({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`drive-mark ${small ? 'small' : ''}`}
      src="/brand/drive.png"
      alt="Drive"
      width="48"
      height="48"
    />
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Unavailable({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`unavailable ${className}`}
      aria-disabled="true"
      title="Not implemented in this version"
      aria-label={label}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="modal-description">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext ?? ''))
    return { Icon: FileImage, color: 'violet', label: 'Image' };
  if (ext === 'pdf') return { Icon: FileText, color: 'red', label: 'PDF' };
  if (['zip', 'gz', 'tar', 'rar'].includes(ext ?? ''))
    return { Icon: FileArchive, color: 'amber', label: 'Archive' };
  if (['js', 'ts', 'tsx', 'json', 'html', 'css', 'py'].includes(ext ?? ''))
    return { Icon: FileCode2, color: 'green', label: 'Code' };
  if (['mp4', 'mov', 'webm'].includes(ext ?? ''))
    return { Icon: FileVideo, color: 'red', label: 'Video' };
  if (['mp3', 'wav', 'ogg'].includes(ext ?? ''))
    return { Icon: FileAudio, color: 'amber', label: 'Audio' };
  if (['txt', 'md', 'doc', 'docx'].includes(ext ?? ''))
    return { Icon: FileText, color: 'blue', label: 'Document' };
  return { Icon: FileIcon, color: 'blue', label: 'File' };
}
export function FileGlyph({ name, large = false }: { name: string; large?: boolean }) {
  const { Icon, color } = fileKind(name);
  return (
    <span className={`file-glyph ${color} ${large ? 'large' : ''}`}>
      <Icon size={large ? 64 : 21} strokeWidth={large ? 1.15 : 2} />
    </span>
  );
}
export type FileAction = 'rename' | 'share' | 'delete' | 'info';
export function FileMenu({
  file,
  onAction,
  onDownload,
}: {
  file: FileItem;
  onAction: (action: FileAction, file: FileItem) => void;
  onDownload: (file: FileItem) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="icon-button file-menu-trigger"
        aria-label={`Actions for ${file.name}`}
      >
        <MoreVertical size={21} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="file-menu" align="end" sideOffset={6}>
          <Menu.Item className="menu-item" disabled>
            <ExternalLink size={18} />
            Open with
            <ChevronRight size={16} className="menu-end" />
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item className="menu-item" onSelect={() => onDownload(file)}>
            <Download size={18} />
            Download
          </Menu.Item>
          <Menu.Item
            className="menu-item"
            disabled={!file.isOwner}
            onSelect={() => onAction('rename', file)}
          >
            <Pencil size={18} />
            Rename
          </Menu.Item>
          <Menu.Item className="menu-item" disabled>
            <Copy size={18} />
            Make a copy
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            className="menu-item"
            disabled={!file.isOwner}
            onSelect={() => onAction('share', file)}
          >
            <UserPlus size={18} />
            Share
            <ChevronRight size={16} className="menu-end" />
          </Menu.Item>
          <Menu.Item className="menu-item" disabled>
            <Folder size={18} />
            Organize
            <ChevronRight size={16} className="menu-end" />
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => onAction('info', file)}>
            <Info size={18} />
            File information
          </Menu.Item>
          <Menu.Item className="menu-item" disabled>
            <CheckCircle2 size={18} />
            Make available offline
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            className="menu-item destructive"
            disabled={!file.isOwner}
            onSelect={() => onAction('delete', file)}
          >
            <Trash2 size={18} />
            Delete permanently
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
