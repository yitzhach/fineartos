import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './print.css';
import { SystemBar } from './os/SystemBar';
import { Dock } from './os/Dock';
import { AppWindow } from './os/Window';
import { registerModule, registerPlannedModules } from './os/registry';
import {
  applyEdit,
  createDocument,
  duplicateDocument,
  issueDocument,
  latestSnapshot,
  newId,
  nextDocumentNumber,
  toClientFacing,
} from './commission/document';
import type { CommissionDocument } from './commission/types';
import { Editor } from './commission/ui/Editor';
import { ClientPreview } from './commission/ui/ClientPreview';
import { DocumentList } from './commission/ui/DocumentList';
import { Repository, type StoredDocument } from './persistence/repository';
import { describeSaveState, drainQueue, unavailableCloud } from './persistence/sync';
import { exportDocument, importDocumentFromText } from './persistence/portable';
import {
  loadBackground,
  loadStudioDefaults,
  loadTheme,
  saveBackground,
  saveStudioDefaults,
  saveTheme,
  type Background,
  type Theme,
} from './lib/prefs';

/**
 * Workspace id. With no auth in this phase there is one local workspace, but
 * every read already goes through it, so adding sign-in later does not mean
 * revisiting the storage layer.
 */
const WORKSPACE_ID = 'local';

const cloud = unavailableCloud;

type View = 'desktop' | 'editor' | 'preview';

registerPlannedModules();
registerModule({ id: 'home', name: 'Home', icon: '⌂', available: true });
registerModule({ id: 'commissions', name: 'Commissions', icon: '✎', available: true });

export default function App() {
  const repo = useMemo(() => new Repository(WORKSPACE_ID), []);

  const [rows, setRows] = useState<StoredDocument[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View>('desktop');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [background, setBackground] = useState<Background>(loadBackground);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showIssued, setShowIssued] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const openRow = rows.find((row) => row.id === openId) ?? null;
  const openDoc = openRow?.document ?? null;

  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveBackground(background), [background]);

  const refresh = useCallback(async () => {
    setRows(await repo.list());
  }, [repo]);

  useEffect(() => {
    void (async () => {
      await refresh();
      // Nothing here claims a sync: with no adapter configured the drain is a
      // no-op, and the status bar says cloud sync is unconfigured.
      await drainQueue(repo, WORKSPACE_ID, cloud);
    })();
  }, [refresh, repo]);

  useEffect(() => {
    const onOnline = () => void drainQueue(repo, WORKSPACE_ID, cloud).then(refresh);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh, repo]);

  // Object URLs for the images this document references, revoked on change.
  useEffect(() => {
    if (!openDoc) return;
    const ids = [...openDoc.artwork.referenceImageIds];
    if (openDoc.studio.logoImageId) ids.push(openDoc.studio.logoImageId);

    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const map: Record<string, string> = {};
      for (const id of ids) {
        const image = await repo.getImage(id);
        if (image) {
          const url = URL.createObjectURL(image.blob);
          created.push(url);
          map[id] = url;
        }
      }
      if (!cancelled) setImageUrls(map);
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [openDoc, repo]);

  const save = useCallback(
    async (doc: CommissionDocument) => {
      await repo.save(doc, cloud.configured);
      await refresh();
    },
    [refresh, repo],
  );

  const handleNew = async () => {
    const numbers = rows.map((row) => row.document.documentNumber);
    const defaults = loadStudioDefaults();
    let doc = createDocument(nextDocumentNumber(numbers, new Date().getFullYear()));
    doc = { ...doc, studio: { ...doc.studio, ...defaults } };
    await save(doc);
    setOpenId(doc.id);
    setView('editor');
  };

  const handleChange = async (changes: Partial<CommissionDocument>) => {
    if (!openDoc) return;
    const updated = applyEdit(openDoc, changes);
    // Studio details carry forward to the next new document.
    if (changes.studio) {
      saveStudioDefaults({
        name: updated.studio.name,
        email: updated.studio.email,
        phone: updated.studio.phone,
        address: updated.studio.address,
      });
    }
    await save(updated);
  };

  const handleDuplicate = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const numbers = rows.map((r) => r.document.documentNumber);
    const copy = duplicateDocument(row.document, nextDocumentNumber(numbers, new Date().getFullYear()));
    await save(copy);
    setOpenId(copy.id);
    setView('editor');
    setMessage(`Duplicated as ${copy.documentNumber}. Payments and issued versions were not copied.`);
  };

  const handleIssue = async () => {
    if (!openDoc) return;
    const issued = issueDocument(openDoc);
    await save(issued);
    setMessage(`Issued version ${issued.version}. Later edits start a new draft and leave it unchanged.`);
  };

  const handleAddImage = async (file: File) => {
    if (!openDoc) return;
    setImageError(null);
    try {
      const id = newId();
      await repo.putImage(id, file);
      await handleChange({
        artwork: { ...openDoc.artwork, referenceImageIds: [...openDoc.artwork.referenceImageIds, id] },
      });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRemoveImage = async (id: string) => {
    if (!openDoc) return;
    await handleChange({
      artwork: {
        ...openDoc.artwork,
        referenceImageIds: openDoc.artwork.referenceImageIds.filter((x) => x !== id),
      },
    });
  };

  const handleExport = () => {
    if (!openDoc) return;
    const envelope = exportDocument(openDoc);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${openDoc.documentNumber}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Exported as JSON. Images are not in the file; they stay on this device.');
  };

  const handleImport = async (file: File) => {
    const result = importDocumentFromText(await file.text(), []);
    if (!result.ok) {
      setMessage(`Import refused: ${result.errors.join(' ')}`);
      return;
    }
    await save(result.document);
    setOpenId(result.document.id);
    setView('editor');
    setMessage(
      result.missingImageIds.length > 0
        ? `Imported. ${result.missingImageIds.length} referenced image(s) are not on this device.`
        : 'Imported.',
    );
  };

  const statusState = openRow?.saveState ?? 'saved-local';
  const statusText = openRow
    ? describeSaveState(openRow.saveState, cloud)
    : cloud.configured
      ? 'Ready'
      : 'Local only — cloud sync not configured';

  const snapshot = openDoc ? latestSnapshot(openDoc) : null;
  const previewDoc = showIssued && snapshot ? snapshot.document : openDoc ? toClientFacing(openDoc) : null;

  const toolbar =
    view === 'preview' ? (
      <>
        <button className="btn" onClick={() => setView('editor')}>Back to editor</button>
        {snapshot && (
          <button className="btn" onClick={() => setShowIssued(!showIssued)} aria-pressed={showIssued}>
            {showIssued ? 'Viewing issued version' : 'Viewing current draft'}
          </button>
        )}
        <button className="btn" data-variant="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          Uses your browser's print dialog. Choose “Save as PDF” there.
        </span>
      </>
    ) : (
      <>
        <button className="btn" onClick={handleNew}>New</button>
        <button className="btn" disabled={!openDoc} onClick={() => openDoc && void handleDuplicate(openDoc.id)}>
          Duplicate
        </button>
        <button className="btn" disabled={!openDoc} onClick={() => setView('preview')}>Preview</button>
        <button className="btn" disabled={!openDoc} onClick={() => { setView('preview'); }}>
          Print / PDF
        </button>
        <button className="btn" disabled={!openDoc} onClick={handleIssue}>Issue</button>
        <button className="btn" data-variant="quiet" disabled={!openDoc} onClick={handleExport}>Export</button>
        <button className="btn" data-variant="quiet" onClick={() => importRef.current?.click()}>Import</button>
        <span className="faint" style={{ fontSize: 12 }}>
          {/* The toolbar tells the truth about saving: there is no Save button
              because every edit is written as it is made. */}
          Saved as you type
        </span>
      </>
    );

  return (
    <div className="workspace" data-background={background}>
      <SystemBar
        studioName={loadStudioDefaults().name}
        search={search}
        onSearch={setSearch}
        statusText={statusText}
        statusState={statusState}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        background={background}
        onToggleBackground={() => setBackground(background === 'wallpaper' ? 'solid' : 'wallpaper')}
        initials={
          loadStudioDefaults()
            .name.split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? '')
            .join('') || '—'
        }
      />

      <input
        ref={importRef}
        type="file"
        accept="application/json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport(file);
          e.target.value = '';
        }}
      />

      <main className="desktop">
        {view === 'desktop' && (
          <div className="desktop-icons">
            {rows
              .filter((row) => row.document.state !== 'archived')
              .map((row) => (
                <button
                  key={row.id}
                  className="desktop-icon"
                  onDoubleClick={() => {
                    setOpenId(row.id);
                    setView('editor');
                  }}
                  onClick={() => {
                    setOpenId(row.id);
                    setView('editor');
                  }}
                >
                  <span className="sheet" aria-hidden="true" />
                  <span className="label">
                    {row.document.title || row.document.documentNumber}
                    {row.document.isDemo && <span className="demo-tag">Demo</span>}
                  </span>
                </button>
              ))}
            <button className="desktop-icon" onClick={handleNew}>
              <span className="sheet" style={{ opacity: 0.45 }} aria-hidden="true" />
              <span className="label">New document</span>
            </button>
          </div>
        )}

        {view !== 'desktop' && openDoc && (
          <AppWindow
            title={`Commissions — ${openDoc.documentNumber}`}
            toolbar={toolbar}
            onClose={() => {
              setView('desktop');
              setOpenId(null);
              setShowIssued(false);
            }}
          >
            {message && (
              <div className="notice no-print">
                {message}{' '}
                <button className="btn" data-variant="quiet" onClick={() => setMessage(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {openRow?.conflict && (
              <div className="notice no-print" data-tone="error">
                A different copy of this document was found when syncing. Both versions are
                kept; nothing was overwritten. Remote copy title: “{openRow.conflict.remote.title}”.
              </div>
            )}

            {view === 'editor' && (
              <Editor
                doc={openDoc}
                onChange={(changes) => void handleChange(changes)}
                imageUrls={imageUrls}
                onAddImage={(file) => void handleAddImage(file)}
                onRemoveImage={(id) => void handleRemoveImage(id)}
                imageError={imageError}
              />
            )}

            {view === 'preview' && previewDoc && (
              <ClientPreview
                doc={previewDoc}
                imageUrls={imageUrls}
                issued={showIssued && snapshot ? { version: snapshot.version, issuedAt: snapshot.issuedAt } : null}
              />
            )}
          </AppWindow>
        )}

        {view !== 'desktop' && !openDoc && (
          <AppWindow title="Commissions" toolbar={toolbar} onClose={() => setView('desktop')}>
            <DocumentList
              rows={rows}
              search={search}
              onSearch={setSearch}
              onOpen={(id) => {
                setOpenId(id);
                setView('editor');
              }}
              onDuplicate={(id) => void handleDuplicate(id)}
              onArchive={(id) => void repo.archive(id).then(refresh)}
              onNew={handleNew}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived(!showArchived)}
            />
          </AppWindow>
        )}
      </main>

      <Dock
        activeId={view === 'desktop' ? 'home' : 'commissions'}
        onOpen={(id) => {
          if (id === 'home') {
            setView('desktop');
            setOpenId(null);
          } else {
            setOpenId(null);
            setView('editor');
          }
        }}
      />
    </div>
  );
}
