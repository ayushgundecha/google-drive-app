import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound, LockKeyhole, LoaderCircle } from 'lucide-react';
import { renameSchema, shareSchema, type FileItem, type ShareItem } from '@drive/shared';
import { Modal, Avatar, type FileAction } from './components';
import { bytes, date, mutate, request } from './api';
export function FileDialog({
  action,
  file,
  onClose,
  notify,
}: {
  action: FileAction;
  file: FileItem;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(file.name);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const shares = useQuery({
    queryKey: ['shares', file.id],
    queryFn: () => request<ShareItem[]>(`/api/files/${file.id}/shares`),
    enabled: action === 'share',
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['files'] }),
      client.invalidateQueries({ queryKey: ['me'] }),
    ]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (action === 'rename') {
      const parsed = renameSchema.safeParse({ name });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
    }
    if (action === 'share') {
      const parsed = shareSchema.safeParse({ email });
      if (!parsed.success) {
        setError('Enter a valid email address.');
        return;
      }
    }
    setBusy(true);
    try {
      if (action === 'rename') {
        await mutate(`/api/files/${file.id}`, 'PATCH', { name });
        await refresh();
        notify('File renamed');
        onClose();
      }
      if (action === 'delete') {
        await mutate(`/api/files/${file.id}`, 'DELETE');
        await refresh();
        notify('File deleted permanently');
        onClose();
      }
      if (action === 'share') {
        await mutate(`/api/files/${file.id}/shares`, 'POST', { email });
        setEmail('');
        await shares.refetch();
        notify('Access granted');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  async function revoke(recipientId: string) {
    setBusy(true);
    setError('');
    try {
      await mutate(`/api/files/${file.id}/shares/${recipientId}`, 'DELETE');
      await shares.refetch();
      notify('Access removed');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    rename: 'Rename',
    delete: 'Delete permanently?',
    share: `Share “${file.name}”`,
    info: 'File information',
  };
  const descriptions = {
    rename: 'Choose a name that makes your file easy to find.',
    delete: `“${file.name}” will be permanently deleted. Everyone you shared it with will lose access. This cannot be undone.`,
    share:
      'Add people using the Google email they use for Drive. They must have signed in at least once.',
    info: 'Details about your file and its storage.',
  };
  return (
    <Modal
      title={titles[action]}
      description={descriptions[action]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {action === 'info' ? (
        <>
          <dl className="file-details">
            <dt>Name</dt>
            <dd>{file.name}</dd>
            <dt>Owner</dt>
            <dd>
              {file.ownerName}
              {file.isOwner ? ' (you)' : ''}
            </dd>
            <dt>Size</dt>
            <dd>{bytes(file.size)}</dd>
            <dt>Type</dt>
            <dd>{file.mimeType}</dd>
            <dt>Created</dt>
            <dd>{date(file.createdAt)}</dd>
            <dt>Modified</dt>
            <dd>{date(file.updatedAt)}</dd>
            <dt>Access</dt>
            <dd>{file.isOwner ? 'Owner' : 'Viewer'}</dd>
          </dl>
          <div className="dialog-actions">
            <button className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          {action === 'rename' && (
            <>
              <label htmlFor="filename">Filename</label>
              <input
                id="filename"
                value={name}
                maxLength={180}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-invalid={!!error}
                aria-describedby={error ? 'dialog-error' : undefined}
              />
            </>
          )}
          {action === 'share' && (
            <>
              <label htmlFor="share-email">Add a person</label>
              <div className="share-input">
                <input
                  id="share-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? 'dialog-error' : undefined}
                />
                <button className="primary-button" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : 'Share'}
                </button>
              </div>
              <h3>People with access</h3>
              <div className="person">
                <Avatar name={file.ownerName} />
                <div>
                  <strong>{file.ownerName}</strong>
                  <small>You</small>
                </div>
                <span>Owner</span>
              </div>
              {shares.isPending ? (
                <p className="muted">Loading access…</p>
              ) : shares.isError ? (
                <p role="alert" className="inline-error">
                  Unable to load sharing details.{' '}
                  <button type="button" onClick={() => shares.refetch()}>
                    Retry
                  </button>
                </p>
              ) : (
                shares.data?.map((person) => (
                  <div className="person" key={person.recipientId}>
                    <UserRound size={25} />
                    <div>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => revoke(person.recipientId)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              <div className="restricted">
                <LockKeyhole size={20} />
                <div>
                  <strong>Restricted</strong>
                  <small>Only people with access can download this file.</small>
                </div>
              </div>
            </>
          )}
          {error && (
            <p className="inline-error" id="dialog-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button className="text-button" type="button" disabled={busy} onClick={onClose}>
              {action === 'share' ? 'Done' : 'Cancel'}
            </button>
            {action !== 'share' && (
              <button
                className={action === 'delete' ? 'danger-button' : 'primary-button'}
                disabled={busy}
              >
                {busy ? 'Working…' : action === 'rename' ? 'Save' : 'Delete permanently'}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
