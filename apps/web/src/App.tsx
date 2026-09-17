import { Login } from './Login';
import { FileCollection } from './FileCollection';
import { useUploads } from './useUploads';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Search,
  SlidersHorizontal,
  CircleHelp,
  Settings,
  Grip,
  Plus,
  Home,
  HardDrive,
  Monitor,
  UsersRound,
  Clock3,
  Star,
  OctagonAlert,
  Trash2,
  Cloud,
  ChevronDown,
  Info,
  LayoutGrid,
  List,
  ChevronRight,
  CalendarDays,
  Lightbulb,
  CircleCheckBig,
  UserRound,
  PanelLeft,
  X,
  UploadCloud,
  ArrowUp,
  Check,
  AlertCircle,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';
import type { FileItem, FileList, Me } from '@drive/shared';
import { Avatar, DriveMark, FileGlyph, Unavailable, type FileAction } from './components';
import { FileDialog } from './FileDialog';
import { bytes, mutate, request, RequestError } from './api';
export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => request<Me>('/api/me'),
    retry: (count, error) => !(error instanceof RequestError && error.status === 401) && count < 1,
  });
  const location = useLocation();
  if (me.isPending)
    return (
      <div className="app-loading">
        <DriveMark />
        <LoaderCircle className="spin" />
        <span>Opening your Drive…</span>
      </div>
    );
  if (me.isError && !(me.error instanceof RequestError && me.error.status === 401))
    return (
      <div className="app-loading">
        <Cloud size={44} />
        <h1>Unable to connect</h1>
        <p>Your files are safe. Check your connection and try again.</p>
        <button className="primary-button" onClick={() => me.refetch()}>
          Try again
        </button>
      </div>
    );
  if (!me.data) return <Login />;
  if (!['/drive', '/shared'].includes(location.pathname)) return <Navigate to="/drive" replace />;
  return <Drive me={me.data} />;
}
function Drive({ me }: { me: Me }) {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const shared = location.pathname === '/shared';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [layout, setLayout] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('drive.layout') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [sidebar, setSidebar] = useState(false);
  const [dialog, setDialog] = useState<{ action: FileAction; file: FileItem } | null>(null);
  const [toast, setToast] = useState('');
  const { uploads, uploading, uploadFiles, cancel, dismiss } = useUploads(me, setToast);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setSidebar(false);
  }, [shared]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const listing = useQuery({
    queryKey: ['files', shared, query, page],
    queryFn: () =>
      request<FileList>(
        `/api/files?scope=${shared ? 'shared' : 'owned'}&q=${encodeURIComponent(query)}&page=${page}`,
      ),
  });
  useEffect(() => {
    if (listing.error instanceof RequestError && listing.error.status === 401)
      void client.invalidateQueries({ queryKey: ['me'] });
  }, [listing.error, client]);
  useEffect(() => {
    if (listing.data && page > Math.max(1, Math.ceil(listing.data.total / 25)))
      setPage(Math.max(1, Math.ceil(listing.data.total / 25)));
  }, [listing.data, page]);
  const action = (action: FileAction, file: FileItem) => setDialog({ action, file });
  async function download(file: FileItem) {
    try {
      await request(`/api/files/${file.id}`);
      const link = document.createElement('a');
      link.href = `/api/files/${file.id}/download`;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void uploadFiles(event.dataTransfer.files);
  }
  function setView(next: 'grid' | 'list') {
    setLayout(next);
    try {
      localStorage.setItem('drive.layout', next);
    } catch {
      /* View preferences are optional. */
    }
  }
  async function logout() {
    if (uploading) {
      setToast('Finish or cancel your uploads before signing out.');
      return;
    }
    try {
      await mutate('/auth/logout', 'POST');
      client.clear();
      navigate('/');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  const files = listing.data?.files ?? [];
  return (
    <div
      className="drive-app"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <a href="#main" className="skip-link">
        Skip to files
      </a>
      <header className="topbar">
        <div className="brand">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeft size={23} />
          </button>
          <DriveMark />
          <span>Drive</span>
        </div>
        <div className="search-field">
          <Search size={23} />
          <input
            aria-label="Search in Drive"
            placeholder="Search in Drive"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={20} />
            </button>
          ) : (
            <Unavailable className="icon-button" label="Advanced search — unavailable">
              <SlidersHorizontal size={23} />
            </Unavailable>
          )}
        </div>
        <div className="top-actions">
          <Unavailable className="icon-button" label="Help — unavailable">
            <CircleHelp size={23} />
          </Unavailable>
          <Unavailable className="icon-button" label="Settings — unavailable">
            <Settings size={24} />
          </Unavailable>
          <Unavailable className="icon-button" label="Google apps — unavailable">
            <Grip size={23} />
          </Unavailable>
          <Menu.Root>
            <Menu.Trigger className="account-button" aria-label="Account menu">
              <Avatar name={me.name} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="file-menu account-menu" align="end" sideOffset={12}>
                <div className="account-details">
                  <strong>{me.name}</strong>
                  <small>{me.email}</small>
                </div>
                <Menu.Separator />
                <Menu.Item className="menu-item" onSelect={() => void logout()}>
                  <LogOut size={18} />
                  Sign out
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? 'is-open' : ''}`} aria-label="Main navigation">
        <button className="new-button" onClick={() => picker.current?.click()} disabled={uploading}>
          <Plus size={30} strokeWidth={1.7} />
          <span>New</span>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          className="visually-hidden"
          aria-label="Upload files"
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <nav>
          <Unavailable className="nav-item">
            <Home size={21} />
            <span>Home</span>
          </Unavailable>
          <NavLink to="/drive" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <HardDrive size={21} />
            <span>My Drive</span>
          </NavLink>
          <Unavailable className="nav-item">
            <Monitor size={21} />
            <span>Computers</span>
          </Unavailable>
          <div className="nav-gap" />
          <NavLink
            to="/shared"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <UsersRound size={21} />
            <span>Shared with me</span>
          </NavLink>
          <Unavailable className="nav-item">
            <Clock3 size={21} />
            <span>Recent</span>
          </Unavailable>
          <Unavailable className="nav-item">
            <Star size={21} />
            <span>Starred</span>
          </Unavailable>
          <div className="nav-gap" />
          <Unavailable className="nav-item">
            <OctagonAlert size={21} />
            <span>Spam</span>
          </Unavailable>
          <Unavailable className="nav-item">
            <Trash2 size={21} />
            <span>Trash</span>
          </Unavailable>
        </nav>
        <div className="storage-section">
          <div className="storage-label">
            <Cloud size={22} />
            <span>Storage ({Math.round((me.usedBytes / me.quotaBytes) * 100)}% full)</span>
          </div>
          <div
            className="storage-track"
            role="progressbar"
            aria-label="Storage used"
            aria-valuenow={Math.round((me.usedBytes / me.quotaBytes) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.min(100, (me.usedBytes / me.quotaBytes) * 100)}%` }} />
          </div>
          <p>
            {bytes(me.usedBytes)} of {bytes(me.quotaBytes)} used
          </p>
          <Unavailable className="storage-upgrade">Get more storage</Unavailable>
          <small className="upload-limit">Up to {bytes(me.maxFileBytes)} per file</small>
        </div>
      </aside>
      <main id="main" className="workspace" tabIndex={-1}>
        <div className="workspace-heading">
          <h1>
            {query ? 'Search results' : shared ? 'Shared with me' : 'My Drive'}
            {!query && <ChevronDown size={18} />}
          </h1>
          <button
            className="icon-button"
            aria-label="About this view"
            onClick={() =>
              setToast(
                shared
                  ? 'Files shared with you are available to download. Only their owner can rename or delete them.'
                  : 'Upload with New or drag files here. Use a file’s menu to rename, download, share, or delete it.',
              )
            }
          >
            <Info size={21} />
          </button>
        </div>
        <div className="toolbar">
          <div className="filter-group">
            {['Type', 'People', 'Modified'].map((label) => (
              <Unavailable className="filter-chip" key={label}>
                {label}
                <ChevronDown size={14} />
              </Unavailable>
            ))}
          </div>
          <div className="view-toggle" aria-label="File view">
            <button
              aria-label="List view"
              aria-pressed={layout === 'list'}
              onClick={() => setView('list')}
            >
              <List size={19} />
            </button>
            <button
              aria-label="Grid view"
              aria-pressed={layout === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={17} />
            </button>
          </div>
        </div>
        {query && (
          <p className="result-caption">
            {listing.data?.total ?? '…'} results for “{query}” in{' '}
            {shared ? 'Shared with me' : 'My Drive'}
          </p>
        )}
        <div className="file-area" aria-busy={listing.isFetching}>
          {listing.isPending ? (
            <div className="file-grid">
              {[0, 1, 2, 3].map((n) => (
                <div className="skeleton-card" key={n}>
                  <div />
                  <section />
                </div>
              ))}
            </div>
          ) : listing.isError ? (
            <div className="empty-state">
              <AlertCircle size={42} />
              <h2>Couldn’t load your files</h2>
              <p>{listing.error.message}</p>
              <button className="primary-button" onClick={() => listing.refetch()}>
                Try again
              </button>
            </div>
          ) : !files.length ? (
            <div className="empty-state">
              <div className="empty-icon">
                {query ? (
                  <Search size={48} strokeWidth={1.25} />
                ) : shared ? (
                  <UsersRound size={48} strokeWidth={1.25} />
                ) : (
                  <FolderOpen size={52} strokeWidth={1.15} />
                )}
              </div>
              <h2>
                {query
                  ? 'No matching files'
                  : shared
                    ? 'A space for shared files'
                    : 'A fresh start for your files'}
              </h2>
              <p>
                {query
                  ? 'Try a different filename or clear your search.'
                  : shared
                    ? 'Files people share with your Google email will appear here.'
                    : 'Drop your files here, or upload something to get started.'}
              </p>
              {!shared && !query && (
                <button
                  className="primary-button"
                  onClick={() => picker.current?.click()}
                  disabled={uploading}
                >
                  <Plus size={18} />
                  Upload files
                </button>
              )}
              {query && (
                <button className="text-button" onClick={() => setSearch('')}>
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <FileCollection
              files={files}
              layout={layout}
              shared={shared}
              action={action}
              download={download}
            />
          )}
        </div>
        {listing.data && listing.data.total > 25 && (
          <div className="pagination">
            <button className="text-button" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(listing.data.total / 25)}
            </span>
            <button
              className="text-button"
              disabled={page * 25 >= listing.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
        <div className="workspace-bottom">
          <ShieldCheck size={13} />
          <span>
            {shared
              ? 'Shared securely with you'
              : 'Only you can access your files until you share them'}
          </span>
        </div>
      </main>
      <aside className="utility-rail" aria-label="Additional tools">
        <Unavailable className="icon-button calendar-tool" label="Calendar — unavailable">
          <CalendarDays size={22} />
        </Unavailable>
        <Unavailable className="icon-button notes-tool" label="Notes — unavailable">
          <Lightbulb size={22} />
        </Unavailable>
        <Unavailable className="icon-button tasks-tool" label="Tasks — unavailable">
          <CircleCheckBig size={23} />
        </Unavailable>
        <Unavailable className="icon-button contacts-tool" label="Contacts — unavailable">
          <UserRound size={22} />
        </Unavailable>
        <hr />
        <Unavailable className="icon-button" label="Add tools — unavailable">
          <Plus size={23} />
        </Unavailable>
        <Unavailable className="icon-button rail-bottom" label="Expand tools — unavailable">
          <ChevronRight size={21} />
        </Unavailable>
      </aside>
      {dragging && (
        <div className="drop-overlay">
          <div>
            <UploadCloud size={55} />
            <h2>Drop files to upload</h2>
            <p>Files will be added to My Drive</p>
          </div>
        </div>
      )}
      {uploads.length > 0 && (
        <section className="upload-tray" aria-label="Uploads">
          <div className="upload-heading">
            <strong>
              {uploading
                ? 'Uploading files'
                : `${uploads.filter((u) => u.status === 'done').length} upload${uploads.filter((u) => u.status === 'done').length === 1 ? '' : 's'} complete`}
            </strong>
            <button
              className="icon-button"
              aria-label={uploading ? 'Cancel uploads' : 'Dismiss uploads'}
              onClick={() => (uploading ? cancel() : dismiss())}
            >
              <X size={19} />
            </button>
          </div>
          <div className="upload-items">
            {uploads.map((item) => (
              <div className="upload-item" key={item.id}>
                <FileGlyph name={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <small className={item.status === 'error' ? 'error-text' : ''}>
                    {item.status === 'error'
                      ? item.error
                      : item.status === 'done'
                        ? 'Uploaded'
                        : item.status === 'queued'
                          ? 'Waiting…'
                          : item.progress === 100
                            ? 'Finishing…'
                            : `${item.progress}% uploaded`}
                  </small>
                  {item.status === 'uploading' && (
                    <progress
                      max={100}
                      value={item.progress}
                      aria-label={`Upload progress for ${item.name}`}
                    />
                  )}
                </div>
                {item.status === 'done' ? (
                  <Check className="success-icon" size={19} />
                ) : item.status === 'error' ? (
                  <AlertCircle className="error-text" size={19} />
                ) : (
                  <ArrowUp size={18} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {dialog && (
        <FileDialog
          key={`${dialog.action}-${dialog.file.id}`}
          {...dialog}
          onClose={() => setDialog(null)}
          notify={setToast}
        />
      )}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">
        {toast}
        {toast && (
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
