import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './print.css';
import { SystemBar } from './os/SystemBar';
import { Dock } from './os/Dock';
import { AppWindow } from './os/Window';
import { Desktop, type DesktopItem } from './os/Desktop';
import { Settings } from './os/Settings';
import { BuildStamp } from './os/BuildStamp';
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
import { Overview } from './commission/ui/Overview';
import { ClientPreview } from './commission/ui/ClientPreview';
import { DocumentList } from './commission/ui/DocumentList';
import {
  applyInvoiceEdit,
  createBlankInvoice,
  createInvoiceFromDocument,
  issueInvoice,
  nextInvoiceNumber,
  recordInvoicePayment,
} from './invoice/invoice';
import type { Invoice } from './invoice/types';
import type { SidebarItem } from './os/Window';
import { InvoiceEditor } from './invoice/ui/InvoiceEditor';
import { InvoiceView } from './invoice/ui/InvoiceView';
import {
  blobToDataUrl,
  copyInvoiceHtml,
  downloadInvoiceHtml,
  downloadInvoiceImage,
  mailtoForInvoice,
} from './invoice/download';
import {
  addDocumentToProject,
  addInvoiceToProject,
  createProject,
  filedDocumentIds,
  filedInvoiceIds,
  projectNameFor,
  removeFromProject,
  renameProject,
  setProjectCover,
  type Project,
} from './project/project';
import { FolderWindow } from './project/ui/FolderWindow';
import { buildDemo, demoAlreadySeeded, drawDemoArtwork, markDemoSeeded } from './lib/demo';
import { Repository, type StoredDocument } from './persistence/repository';
import { describeSaveState, drainQueue, unavailableCloud } from './persistence/sync';
import { exportDocument, importDocumentFromText } from './persistence/portable';
import {
  BUNDLED_WALLPAPERS,
  loadPaymentInstructions,
  loadStudioDefaults,
  loadTheme,
  loadWallpaper,
  savePaymentInstructions,
  saveStudioDefaults,
  saveTheme,
  saveWallpaper,
  type PaymentInstructions,
  type StudioDefaults,
  type Theme,
  type WallpaperChoice,
} from './lib/prefs';

/**
 * Workspace id. With no auth in this phase there is one local workspace, but
 * every read already goes through it, so adding sign-in later does not mean
 * revisiting the storage layer.
 */
const WORKSPACE_ID = 'local';

const cloud = unavailableCloud;

type View =
  | 'desktop'
  | 'overview'
  | 'editor'
  | 'preview'
  | 'list'
  | 'folder'
  | 'invoice'
  | 'invoice-preview'
  | 'settings';

registerPlannedModules();
registerModule({ id: 'home', name: 'Home', icon: '⌂', available: true });
registerModule({ id: 'commissions', name: 'Commissions', icon: '✎', available: true });
registerModule({ id: 'invoices', name: 'Invoices', icon: '❑', available: true });

export default function App() {
  const repo = useMemo(() => new Repository(WORKSPACE_ID), []);

  const [rows, setRows] = useState<StoredDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [view, setView] = useState<View>('desktop');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [wallpaper, setWallpaper] = useState<WallpaperChoice>(loadWallpaper);
  const [studio, setStudio] = useState<StudioDefaults>(loadStudioDefaults);
  const [payment, setPayment] = useState<PaymentInstructions>(loadPaymentInstructions);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showIssued, setShowIssued] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const openRow = rows.find((row) => row.id === openId) ?? null;
  const openDoc = openRow?.document ?? null;
  const openProject = projects.find((p) => p.id === openProjectId) ?? null;
  const openInvoice = invoices.find((i) => i.id === openInvoiceId) ?? null;

  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveWallpaper(wallpaper), [wallpaper]);
  useEffect(() => saveStudioDefaults(studio), [studio]);
  useEffect(() => savePaymentInstructions(payment), [payment]);

  const refresh = useCallback(async () => {
    const [documentRows, projectRows, invoiceRows] = await Promise.all([
      repo.list(),
      repo.listProjects(),
      repo.listInvoices(),
    ]);
    setRows(documentRows);
    setProjects(projectRows);
    setInvoices(invoiceRows);
  }, [repo]);

  useEffect(() => {
    void (async () => {
      // First run only: seed one clearly-labelled demo commission so the app
      // opens showing what it does rather than an empty desktop. Seeded once
      // and never again, so deleting it makes it stay deleted.
      if (!demoAlreadySeeded()) {
        const existing = await repo.list();
        if (existing.length === 0) {
          const demo = buildDemo();
          let document = demo.document;
          let project = demo.project;

          // The demo's one image, drawn here rather than shipped. If the
          // browser cannot produce it, the demo just has no image.
          const artwork = await drawDemoArtwork();
          if (artwork) {
            const imageId = newId();
            try {
              await repo.putImage(imageId, artwork);
              document = {
                ...document,
                artwork: { ...document.artwork, referenceImageIds: [imageId] },
              };
              project = { ...project, coverImageId: imageId };
            } catch {
              // An image the store refuses is not worth failing the seed over.
            }
          }

          await repo.save(document, cloud.configured);
          await repo.saveProject(project);
          setOpenId(document.id);
          setView('overview');
        }
        markDemoSeeded();
      }

      await refresh();
      // Nothing here claims a sync: with no adapter configured the drain is a
      // no-op, and the status bar says cloud sync is unconfigured.
      await drainQueue(repo, WORKSPACE_ID, cloud);
    })();
  }, [refresh, repo]);

  // On a later launch, open the most recently touched commission rather than
  // a bare desktop. Only once, and never over a window the artist has opened.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rows.length === 0 || view !== 'desktop' || openId) return;
    restored.current = true;
    const newest = rows[0];
    if (newest) {
      setOpenId(newest.id);
      setView('overview');
    }
  }, [rows, view, openId]);

  useEffect(() => {
    const onOnline = () => void drainQueue(repo, WORKSPACE_ID, cloud).then(refresh);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh, repo]);

  // Object URLs for the open document's images, revoked on change.
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
      // Revoked a beat later, not immediately: React can still paint one frame
      // with the old src, and a revoked blob URL in an <img> is a console
      // error and a flash of broken image.
      const stale = [...created];
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [openDoc, repo]);

  // Thumbnails for the desktop: the first reference image of each document and
  // each folder's cover. Kept separate from the open document's images so
  // closing a window cannot revoke a URL the desktop is still showing.
  const thumbIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      const first = row.document.artwork.referenceImageIds[0];
      if (first) ids.add(first);
    }
    for (const project of projects) {
      if (project.coverImageId) ids.add(project.coverImageId);
    }
    return [...ids].sort().join(',');
  }, [rows, projects]);

  useEffect(() => {
    const ids = thumbIds ? thumbIds.split(',') : [];
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
      if (!cancelled) setThumbUrls(map);
    })();
    return () => {
      cancelled = true;
      const stale = [...created];
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [thumbIds, repo]);

  // The artist's own wallpaper, if they set one.
  useEffect(() => {
    const id = wallpaper.customImageId;
    if (!id) {
      setWallpaperUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      const image = await repo.getImage(id);
      if (image && !cancelled) {
        created = URL.createObjectURL(image.blob);
        setWallpaperUrl(created);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [wallpaper.customImageId, repo]);

  const save = useCallback(
    async (doc: CommissionDocument) => {
      await repo.save(doc, cloud.configured);
      await refresh();
    },
    [refresh, repo],
  );

  const saveInvoiceRecord = useCallback(
    async (invoice: Invoice) => {
      await repo.saveInvoice(invoice);
      await refresh();
    },
    [refresh, repo],
  );

  const saveProjectRecord = useCallback(
    async (project: Project) => {
      await repo.saveProject(project);
      await refresh();
    },
    [refresh, repo],
  );

  // --- Documents ----------------------------------------------------------

  const handleNew = async () => {
    const numbers = rows.map((row) => row.document.documentNumber);
    let doc = createDocument(nextDocumentNumber(numbers, new Date().getFullYear()));
    doc = { ...doc, studio: { ...doc.studio, ...studio } };
    await save(doc);
    setOpenId(doc.id);
    setView('overview');
  };

  const handleChange = async (changes: Partial<CommissionDocument>) => {
    if (!openDoc) return;
    const updated = applyEdit(openDoc, changes);
    // Studio details carry forward to the next new document.
    if (changes.studio) {
      setStudio({
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

  const handleAddImages = async (files: File[]) => {
    if (!openDoc) return;
    setImageError(null);
    const added: string[] = [];
    for (const file of files) {
      try {
        const id = newId();
        await repo.putImage(id, file);
        added.push(id);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error));
      }
    }
    if (added.length > 0) {
      await handleChange({
        artwork: {
          ...openDoc.artwork,
          referenceImageIds: [...openDoc.artwork.referenceImageIds, ...added],
        },
      });
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

  /**
   * Removes the seeded demo and the folder it came in. The seeded flag is
   * already set, so it stays gone.
   */
  const handleRemoveDemo = async (id: string) => {
    const folder = projects.find((p) => p.documentIds.includes(id));
    if (folder && folder.documentIds.length === 1 && folder.invoiceIds.length === 0) {
      await repo.deleteProject(folder.id);
    } else if (folder) {
      await repo.saveProject(removeFromProject(folder, id));
    }
    await repo.deleteDocument(id);
    setOpenId(null);
    setView('desktop');
    await refresh();
    setMessage('Demo removed.');
  };

  // --- Folders ------------------------------------------------------------

  const projectContaining = (itemId: string): Project | null =>
    projects.find((p) => p.documentIds.includes(itemId) || p.invoiceIds.includes(itemId)) ?? null;

  /**
   * "Save" for a commission means: put this on the desktop as a project
   * folder. A document already in a folder simply opens that folder rather
   * than making a second one.
   */
  const handleSaveToFolder = async () => {
    if (!openDoc) return;
    const existing = projectContaining(openDoc.id);
    if (existing) {
      setOpenProjectId(existing.id);
      setView('folder');
      return;
    }
    let project = createProject(projectNameFor(openDoc), openDoc.client.name || null);
    project = addDocumentToProject(project, openDoc.id);
    const cover = openDoc.artwork.referenceImageIds[0];
    if (cover) project = setProjectCover(project, cover);
    await saveProjectRecord(project);
    setOpenProjectId(project.id);
    setView('folder');
    setMessage(`Saved. “${project.name}” is on your desktop.`);
  };

  const handleRemoveFromFolder = async (itemId: string) => {
    if (!openProject) return;
    await saveProjectRecord(removeFromProject(openProject, itemId));
    setMessage('Moved back to the desktop. Nothing was deleted.');
  };

  // --- Invoices -----------------------------------------------------------

  const makeInvoice = async (fromDocument: CommissionDocument | null, project: Project | null) => {
    const number = nextInvoiceNumber(
      invoices.map((i) => i.invoiceNumber),
      new Date().getFullYear(),
    );
    let invoice = fromDocument
      ? createInvoiceFromDocument(fromDocument, number, payment)
      : createBlankInvoice(number, payment);

    // A blank invoice still knows who the studio is.
    if (!fromDocument) {
      invoice = { ...invoice, studio: { ...invoice.studio, ...studio } };
    }

    const folder = project ?? (fromDocument ? projectContaining(fromDocument.id) : null);
    if (folder) {
      invoice = { ...invoice, projectId: folder.id };
      await saveProjectRecord(addInvoiceToProject(folder, invoice.id));
    }

    await saveInvoiceRecord(invoice);
    setOpenInvoiceId(invoice.id);
    setView('invoice');
    setMessage(
      fromDocument
        ? `Invoice ${invoice.invoiceNumber} created from ${fromDocument.documentNumber}. Editing the commission from here on will not change it.`
        : `Invoice ${invoice.invoiceNumber} created.`,
    );
  };

  const handleInvoiceChange = async (changes: Partial<Invoice>) => {
    if (!openInvoice) return;
    await saveInvoiceRecord(applyInvoiceEdit(openInvoice, changes));
  };

  /** The studio logo, inlined, so an exported file carries its own images. */
  const logoDataUrl = useCallback(async (): Promise<string | null> => {
    const id = openInvoice?.studio.logoImageId;
    if (!id) return null;
    const image = await repo.getImage(id);
    return image ? blobToDataUrl(image.blob) : null;
  }, [openInvoice, repo]);

  const exportInvoice = async (format: 'html' | 'jpeg' | 'png' | 'copy') => {
    if (!openInvoice) return;
    try {
      if (format === 'html') {
        downloadInvoiceHtml(openInvoice, await logoDataUrl());
        setMessage(
          'Saved as a self-contained HTML file. Attach it, or open it and copy it into an email.',
        );
      } else if (format === 'copy') {
        await copyInvoiceHtml(openInvoice, await logoDataUrl());
        setMessage('Copied. Paste it straight into an email.');
      } else {
        await downloadInvoiceImage(openInvoice, format);
        setMessage(`Saved as ${format.toUpperCase()}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  // --- Wallpaper ----------------------------------------------------------

  const handleCustomWallpaper = async (file: File) => {
    try {
      const id = newId();
      await repo.putImage(id, file);
      setWallpaper({ id: 'custom', customImageId: id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const bundled = BUNDLED_WALLPAPERS.find((w) => w.id === wallpaper.id);
  const wallpaperStyle =
    wallpaper.id === 'custom' && wallpaperUrl
      ? { backgroundImage: `url(${wallpaperUrl})` }
      : bundled
        ? { backgroundImage: `url(${bundled.src})` }
        : undefined;

  // --- Desktop ------------------------------------------------------------

  const filedDocs = filedDocumentIds(projects);
  const filedInvoices = filedInvoiceIds(projects);

  const desktopItems: DesktopItem[] = [
    ...projects.map((project) => ({ kind: 'project' as const, id: project.id, project })),
    ...rows
      .filter((row) => row.document.state !== 'archived' && !filedDocs.has(row.id))
      .map((row) => ({ kind: 'document' as const, id: row.id, document: row.document })),
    ...invoices
      .filter((invoice) => !filedInvoices.has(invoice.id))
      .map((invoice) => ({ kind: 'invoice' as const, id: invoice.id, invoice })),
  ];

  const openDesktopItem = (item: DesktopItem) => {
    if (item.kind === 'project') {
      setOpenProjectId(item.id);
      setView('folder');
    } else if (item.kind === 'document') {
      setOpenId(item.id);
      setView('overview');
    } else {
      setOpenInvoiceId(item.id);
      setView('invoice');
    }
  };

  // --- Status -------------------------------------------------------------

  const statusState = openRow?.saveState ?? 'saved-local';
  const statusText = openRow
    ? describeSaveState(openRow.saveState, cloud)
    : cloud.configured
      ? 'Ready'
      : 'Local only — cloud sync not configured';

  const snapshot = openDoc ? latestSnapshot(openDoc) : null;
  const previewDoc = showIssued && snapshot ? snapshot.document : openDoc ? toClientFacing(openDoc) : null;

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

  const closeWindow = () => {
    setView('desktop');
    setOpenId(null);
    setOpenProjectId(null);
    setOpenInvoiceId(null);
    setShowIssued(false);
  };

  // --- In-window navigation -----------------------------------------------

  /** Invoices generated from the commission that is currently open. */
  const invoicesForOpenDoc = openDoc
    ? invoices.filter((invoice) => invoice.sourceDocumentId === openDoc.id)
    : [];

  // The sections named in the brief. The four that are built navigate; the
  // rest are shown subdued and labelled rather than hidden, so the shape of
  // the finished workflow is visible without pretending it exists.
  const commissionSidebar: SidebarItem[] = [
    { id: 'overview', name: 'Overview', icon: '⌂', onSelect: () => setView('overview') },
    { id: 'editor', name: 'Details', icon: '✎', onSelect: () => setView('editor') },
    { id: 'preview', name: 'Document', icon: '▤', onSelect: () => setView('preview') },
    {
      id: 'invoices',
      name: 'Invoices',
      icon: '❑',
      onSelect: () => {
        const first = invoicesForOpenDoc[0];
        if (first) {
          setOpenInvoiceId(first.id);
          setView('invoice');
        } else if (openDoc) {
          void makeInvoice(openDoc, null);
        }
      },
    },
    { id: 'concepts', name: 'Concepts', icon: '◇' },
    { id: 'production', name: 'Production', icon: '◈' },
    { id: 'delivery', name: 'Delivery', icon: '⊞' },
  ];

  // --- Toolbars -----------------------------------------------------------

  const documentToolbar =
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
        <button className="btn" data-variant="primary" disabled={!openDoc} onClick={handleSaveToFolder}>
          {openDoc && projectContaining(openDoc.id) ? 'Open folder' : 'Save to desktop folder'}
        </button>
        <button className="btn" disabled={!openDoc} onClick={() => openDoc && void makeInvoice(openDoc, null)}>
          Create invoice
        </button>
        <button className="btn" disabled={!openDoc} onClick={() => setView('preview')}>Preview</button>
        <button className="btn" disabled={!openDoc} onClick={handleIssue}>Issue</button>
        <button className="btn" disabled={!openDoc} onClick={() => openDoc && void handleDuplicate(openDoc.id)}>
          Duplicate
        </button>
        <button className="btn" data-variant="quiet" disabled={!openDoc} onClick={handleExport}>Export</button>
        <button className="btn" data-variant="quiet" onClick={() => importRef.current?.click()}>Import</button>
        <span className="faint" style={{ fontSize: 12 }}>
          {/* The toolbar tells the truth about saving: every edit is written as
              it is made, and "Save" files the work into a desktop folder. */}
          Saved as you type
        </span>
      </>
    );

  const invoiceToolbar =
    view === 'invoice-preview' ? (
      <>
        <button className="btn" onClick={() => setView('invoice')}>Back to editor</button>
        <button className="btn" data-variant="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button className="btn" onClick={() => void exportInvoice('html')}>Save HTML</button>
        <button className="btn" onClick={() => void exportInvoice('copy')}>Copy for email</button>
        <button className="btn" onClick={() => void exportInvoice('jpeg')}>Save JPEG</button>
        <button className="btn" data-variant="quiet" onClick={() => void exportInvoice('png')}>PNG</button>
      </>
    ) : (
      <>
        <button className="btn" data-variant="primary" onClick={() => setView('invoice-preview')}>
          Preview &amp; send
        </button>
        <button
          className="btn"
          disabled={!openInvoice || openInvoice.state === 'issued'}
          onClick={() => {
            if (openInvoice) void saveInvoiceRecord(issueInvoice(openInvoice));
          }}
        >
          {openInvoice?.state === 'issued' ? 'Issued' : 'Mark as issued'}
        </button>
        <span className="faint" style={{ fontSize: 12 }}>Saved as you type</span>
      </>
    );

  const folderToolbar = (
    <>
      <button
        className="btn"
        data-variant="primary"
        onClick={() => openProject && void makeInvoice(firstDocOf(openProject, rows), openProject)}
      >
        New invoice
      </button>
      <span className="faint" style={{ fontSize: 12 }}>Double-click a row to open it.</span>
    </>
  );

  // --- Render -------------------------------------------------------------

  const windowIsOpen = view !== 'desktop';

  return (
    <div className="workspace" data-wallpaper={wallpaper.id} style={wallpaperStyle}>
      <SystemBar
        studioName={studio.name}
        search={search}
        onSearch={setSearch}
        statusText={statusText}
        statusState={statusState}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onOpenSettings={() => setView('settings')}
        initials={
          studio.name
            .split(/\s+/)
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
        {/* The desktop is always there, with windows floating over it — the
            way a desktop behaves. It is not a screen you navigate away from. */}
        {(
          <Desktop
            items={desktopItems}
            imageUrls={thumbUrls}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={openDesktopItem}
            onNew={handleNew}
          />
        )}

        {windowIsOpen && (
          <AppWindow
            title={windowTitle(view, openDoc, openProject, openInvoice)}
            subtitle={windowSubtitle(view, openDoc, openInvoice)}
            sidebar={
              view === 'overview' || view === 'editor' || view === 'preview'
                ? commissionSidebar
                : undefined
            }
            activeSidebarId={view}
            toolbar={
              view === 'settings' ? (
                <span className="faint" style={{ fontSize: 12 }}>
                  Changes are saved as you make them.
                </span>
              ) : view === 'folder' ? (
                folderToolbar
              ) : view === 'invoice' || view === 'invoice-preview' ? (
                invoiceToolbar
              ) : (
                documentToolbar
              )
            }
            onClose={closeWindow}
          >
            {message && (
              <div className="notice no-print">
                {message}{' '}
                <button className="btn" data-variant="quiet" onClick={() => setMessage(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {openRow?.conflict && view === 'editor' && (
              <div className="notice no-print" data-tone="error">
                A different copy of this document was found when syncing. Both versions are
                kept; nothing was overwritten. Remote copy title: “{openRow.conflict.remote.title}”.
              </div>
            )}

            {view === 'settings' && (
              <Settings
                studio={studio}
                onStudio={setStudio}
                payment={payment}
                onPayment={setPayment}
                wallpaper={wallpaper}
                onWallpaper={setWallpaper}
                onCustomWallpaper={(file) => void handleCustomWallpaper(file)}
                customWallpaperUrl={wallpaperUrl}
              />
            )}

            {view === 'folder' && openProject && (
              <FolderWindow
                project={openProject}
                documents={rows
                  .filter((row) => openProject.documentIds.includes(row.id))
                  .map((row) => row.document)}
                invoices={invoices.filter((invoice) => openProject.invoiceIds.includes(invoice.id))}
                onOpenDocument={(id) => {
                  setOpenId(id);
                  setView('overview');
                }}
                onOpenInvoice={(id) => {
                  setOpenInvoiceId(id);
                  setView('invoice');
                }}
                onRename={(name) => void saveProjectRecord(renameProject(openProject, name))}
                onNewInvoice={() => void makeInvoice(firstDocOf(openProject, rows), openProject)}
                onRemoveItem={(id) => void handleRemoveFromFolder(id)}
              />
            )}

            {view === 'invoice' && openInvoice && (
              <InvoiceEditor
                invoice={openInvoice}
                onChange={(changes) => void handleInvoiceChange(changes)}
                onRecordPayment={(payload) =>
                  void saveInvoiceRecord(recordInvoicePayment(openInvoice, payload))
                }
              />
            )}

            {view === 'invoice-preview' && openInvoice && (
              <>
                <div className="send-strip no-print">
                  <span>
                    Artist OS cannot email this for you. Save the file and attach it — or copy
                    it and paste it into your mail window.
                  </span>
                  <a className="btn" href={mailtoForInvoice(openInvoice)}>
                    Open in my mail app
                  </a>
                </div>
                <InvoiceView
                  invoice={openInvoice}
                  logoUrl={
                    openInvoice.studio.logoImageId ? imageUrls[openInvoice.studio.logoImageId] : null
                  }
                />
              </>
            )}

            {view === 'overview' && openDoc && (
              <Overview
                doc={openDoc}
                invoices={invoicesForOpenDoc}
                imageUrls={imageUrls}
                onEdit={() => setView('editor')}
                onPreview={() => setView('preview')}
                onNewInvoice={() => void makeInvoice(openDoc, null)}
                onOpenInvoice={(id) => {
                  setOpenInvoiceId(id);
                  setView('invoice');
                }}
                onRemoveDemo={openDoc.isDemo ? () => void handleRemoveDemo(openDoc.id) : undefined}
              />
            )}

            {view === 'editor' && openDoc && (
              <Editor
                doc={openDoc}
                onChange={(changes) => void handleChange(changes)}
                imageUrls={imageUrls}
                onAddImages={(files) => void handleAddImages(files)}
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

            {view === 'list' && (
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
            )}
          </AppWindow>
        )}
      </main>

      <BuildStamp />

      <Dock
        activeId={dockIdFor(view)}
        onOpen={(id) => {
          if (id === 'home') {
            closeWindow();
          } else if (id === 'invoices') {
            // With no invoice open the dock lands on the newest one, or starts
            // a blank one when there are none — never a dead end.
            const newest = invoices[0];
            if (newest) {
              setOpenInvoiceId(newest.id);
              setView('invoice');
            } else {
              void makeInvoice(null, null);
            }
          } else {
            // Land on the commission you were last in, not a list of them.
            // The list is still a click away in the toolbar.
            const current = openId ?? rows[0]?.id ?? null;
            if (current) {
              setOpenId(current);
              setView('overview');
            } else {
              setView('list');
            }
          }
        }}
      />
    </div>
  );
}

function firstDocOf(project: Project, rows: StoredDocument[]): CommissionDocument | null {
  const id = project.documentIds[0];
  if (!id) return null;
  return rows.find((row) => row.id === id)?.document ?? null;
}

function dockIdFor(view: View): string {
  if (view === 'desktop') return 'home';
  if (view === 'invoice' || view === 'invoice-preview') return 'invoices';
  return 'commissions';
}

function windowTitle(
  view: View,
  doc: CommissionDocument | null,
  project: Project | null,
  invoice: Invoice | null,
): string {
  switch (view) {
    case 'settings':
      return 'Settings';
    case 'folder':
      return project?.name ?? 'Folder';
    case 'invoice':
    case 'invoice-preview':
      return invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice';
    case 'list':
      return 'Commissions';
    default:
      return doc ? 'Commission Studio' : 'Commissions';
  }
}

function windowSubtitle(
  view: View,
  doc: CommissionDocument | null,
  invoice: Invoice | null,
): string | null {
  if (view === 'invoice' || view === 'invoice-preview') return invoice?.client.name || null;
  if (view === 'overview' || view === 'editor' || view === 'preview') {
    return doc?.documentNumber ?? null;
  }
  return null;
}
