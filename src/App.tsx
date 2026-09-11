import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './print.css';
import { SystemBar } from './os/SystemBar';
import { Dock } from './os/Dock';
import { Frame } from './os/Frame';
import { Desktop, type DesktopItem } from './os/Desktop';
import { Settings } from './os/Settings';
import { BuildStamp } from './os/BuildStamp';
import { AppRail, type RailItem } from './os/AppRail';
import { MOCK_TOOLS, MOCK_TOOL_NAMES } from './os/mock/tools';
import { registerModule, registerPlannedModules } from './os/registry';
import {
  clampToViewport,
  closeWindow,
  focused as focusedWindow,
  focusWindow,
  minimizedWindows,
  minimizeWindow,
  moveWindow,
  openWindow,
  resizeWindow,
  toggleZoom,
  type WindowKind,
  type WindowState,
} from './os/windows';
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
import { ProjectWindow, type ProjectTab } from './commission/ui/ProjectWindow';
import { ArtworkInspector } from './commission/ui/ArtworkInspector';
import {
  applyInvoiceEdit,
  createBlankInvoice,
  createInvoiceFromDocument,
  issueInvoice,
  nextInvoiceNumber,
  recordInvoicePayment,
} from './invoice/invoice';
import type { Invoice } from './invoice/types';
import { InvoiceEditor } from './invoice/ui/InvoiceEditor';
import { InvoiceView } from './invoice/ui/InvoiceView';
import { InvoiceList } from './invoice/ui/InvoiceList';
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
import {
  addWallpaper,
  prepareWallpaper,
  removeWallpaper,
  renameWallpaper,
  type CustomWallpaper,
} from './lib/wallpapers';
import { Repository, type StoredDocument } from './persistence/repository';
import { describeSaveState, drainQueue, unavailableCloud } from './persistence/sync';
import { exportDocument, importDocumentFromText } from './persistence/portable';
import {
  BUNDLED_WALLPAPERS,
  loadPaymentInstructions,
  loadStudioDefaults,
  loadTheme,
  loadWallpaper,
  loadWallpaperLibrary,
  savePaymentInstructions,
  saveStudioDefaults,
  saveTheme,
  saveWallpaper,
  saveWallpaperLibrary,
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

/**
 * Local-only, deliberately. `src/persistence/workerCloud.ts` is the adapter
 * that would replace this, ported from the commission baseline. It stays
 * unused until a Supabase project, the Worker secrets, an R2 bucket and a
 * sign-in flow all exist — see its header.
 */
const cloud = unavailableCloud;

/** Below this width a window becomes a full-screen sheet, not a window. */
const COMPACT_WIDTH = 860;

registerPlannedModules();
registerModule({ id: 'home', name: 'Home', icon: '⌂', available: true });
registerModule({ id: 'commissions', name: 'Projects', icon: '✎', available: true });
registerModule({ id: 'invoices', name: 'Invoices', icon: '❑', available: true });

export default function App() {
  const repo = useMemo(() => new Repository(WORKSPACE_ID), []);

  const [rows, setRows] = useState<StoredDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [windows, setWindows] = useState<WindowState[]>([]);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const compact = viewport.width <= COMPACT_WIDTH;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectTabs, setProjectTabs] = useState<Record<string, ProjectTab>>({});
  const [invoicePreview, setInvoicePreview] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [wallpaper, setWallpaper] = useState<WallpaperChoice>(loadWallpaper);
  const [studio, setStudio] = useState<StudioDefaults>(loadStudioDefaults);
  const [payment, setPayment] = useState<PaymentInstructions>(loadPaymentInstructions);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [wallpaperLibrary, setWallpaperLibrary] = useState<CustomWallpaper[]>(loadWallpaperLibrary);
  const [wallpaperUrls, setWallpaperUrls] = useState<Record<string, string>>({});
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveWallpaper(wallpaper), [wallpaper]);
  useEffect(() => saveWallpaperLibrary(wallpaperLibrary), [wallpaperLibrary]);
  useEffect(() => saveStudioDefaults(studio), [studio]);
  useEffect(() => savePaymentInstructions(payment), [payment]);

  // The latest viewport, for callbacks that must not close over a stale one.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const onResize = () => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      setViewport(next);
      // Windows follow the screen in, so none is left unreachable.
      setWindows((current) => clampToViewport(current, next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const open = useCallback((kind: WindowKind, title: string, subtitle?: string | null) => {
    setWindows((current) => openWindow(current, { kind, title, subtitle }, viewportRef.current).windows);
  }, []);

  // --- Data ---------------------------------------------------------------

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
      // opens showing what it does. Seeded once, so removing it sticks.
      if (!demoAlreadySeeded()) {
        const existing = await repo.list();
        if (existing.length === 0) {
          const demo = buildDemo();
          let doc = demo.document;
          let project = demo.project;

          const artwork = await drawDemoArtwork();
          if (artwork) {
            const imageId = newId();
            try {
              await repo.putImage(imageId, artwork);
              doc = { ...doc, artwork: { ...doc.artwork, referenceImageIds: [imageId] } };
              project = { ...project, coverImageId: imageId };
            } catch {
              // An image the store refuses is not worth failing the seed over.
            }
          }

          await repo.save(doc, cloud.configured);
          await repo.saveProject(project);
        }
        markDemoSeeded();
      }

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

  // Open the most recent commission on first load, so the app starts in work.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rows.length === 0) return;
    restored.current = true;
    const newest = rows[0];
    if (newest) {
      open({ type: 'commission', docId: newest.id }, 'Commission Studio', newest.document.documentNumber);
    }
  }, [rows, open]);

  // --- Images -------------------------------------------------------------

  /**
   * Object URLs for every image any open window might show. One map for the
   * whole app: two windows onto the same project would otherwise each make a
   * URL for the same blob, and one closing would revoke the other's.
   */
  const neededImageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      for (const id of row.document.artwork.referenceImageIds) ids.add(id);
      if (row.document.studio.logoImageId) ids.add(row.document.studio.logoImageId);
    }
    for (const project of projects) if (project.coverImageId) ids.add(project.coverImageId);
    return [...ids].sort().join(',');
  }, [rows, projects]);

  useEffect(() => {
    const ids = neededImageIds ? neededImageIds.split(',') : [];
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
      // Revoked a beat later: React can still paint one frame with the old
      // src, and a revoked blob URL in an <img> is a console error.
      const stale = [...created];
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [neededImageIds, repo]);

  // Object URLs for every picture in the library, so the picker can show
  // thumbnails and the desktop can show the chosen one from the same map.
  const libraryIds = useMemo(
    () => wallpaperLibrary.map((w) => w.imageId).sort().join(','),
    [wallpaperLibrary],
  );

  useEffect(() => {
    const ids = libraryIds ? libraryIds.split(',') : [];
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
      if (!cancelled) setWallpaperUrls(map);
    })();
    return () => {
      cancelled = true;
      const stale = [...created];
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [libraryIds, repo]);

  // --- Saving -------------------------------------------------------------

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

  const docById = (id: string): CommissionDocument | null =>
    rows.find((row) => row.id === id)?.document ?? null;

  // --- Documents ----------------------------------------------------------

  const handleNew = async () => {
    const numbers = rows.map((row) => row.document.documentNumber);
    let doc = createDocument(nextDocumentNumber(numbers, new Date().getFullYear()));
    doc = { ...doc, studio: { ...doc.studio, ...studio } };
    await save(doc);
    open({ type: 'commission', docId: doc.id }, 'Commission Studio', doc.documentNumber);
  };

  const handleChange = async (docId: string, changes: Partial<CommissionDocument>) => {
    const doc = docById(docId);
    if (!doc) return;
    const updated = applyEdit(doc, changes);
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
    open({ type: 'commission', docId: copy.id }, 'Commission Studio', copy.documentNumber);
    setMessage(`Duplicated as ${copy.documentNumber}. Payments and issued versions were not copied.`);
  };

  const handleIssue = async (docId: string) => {
    const doc = docById(docId);
    if (!doc) return;
    const issued = issueDocument(doc);
    await save(issued);
    setMessage(`Issued version ${issued.version}. Later edits start a new draft and leave it unchanged.`);
  };

  const handleAddImages = async (docId: string, files: File[]) => {
    const doc = docById(docId);
    if (!doc) return;
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
      await handleChange(docId, {
        artwork: { ...doc.artwork, referenceImageIds: [...doc.artwork.referenceImageIds, ...added] },
      });
    }
  };

  const handleRemoveImage = async (docId: string, imageId: string) => {
    const doc = docById(docId);
    if (!doc) return;
    await handleChange(docId, {
      artwork: {
        ...doc.artwork,
        referenceImageIds: doc.artwork.referenceImageIds.filter((x) => x !== imageId),
      },
    });
  };

  const handleRemoveDemo = async (id: string) => {
    const folder = projects.find((p) => p.documentIds.includes(id));
    if (folder && folder.documentIds.length === 1 && folder.invoiceIds.length === 0) {
      await repo.deleteProject(folder.id);
    } else if (folder) {
      await repo.saveProject(removeFromProject(folder, id));
    }
    await repo.deleteDocument(id);
    setWindows((current) =>
      current.filter((w) => !(w.kind.type === 'commission' && w.kind.docId === id)),
    );
    await refresh();
    setMessage('Demo removed.');
  };

  // --- Folders ------------------------------------------------------------

  const projectContaining = (itemId: string): Project | null =>
    projects.find((p) => p.documentIds.includes(itemId) || p.invoiceIds.includes(itemId)) ?? null;

  const handleSaveToFolder = async (docId: string) => {
    const doc = docById(docId);
    if (!doc) return;
    const existing = projectContaining(doc.id);
    if (existing) {
      open({ type: 'folder', projectId: existing.id }, existing.name, 'Project folder');
      return;
    }
    let project = createProject(projectNameFor(doc), doc.client.name || null);
    project = addDocumentToProject(project, doc.id);
    const cover = doc.artwork.referenceImageIds[0];
    if (cover) project = setProjectCover(project, cover);
    await saveProjectRecord(project);
    open({ type: 'folder', projectId: project.id }, project.name, 'Project folder');
    setMessage(`Saved. “${project.name}” is on your desktop.`);
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

    if (!fromDocument) invoice = { ...invoice, studio: { ...invoice.studio, ...studio } };

    const folder = project ?? (fromDocument ? projectContaining(fromDocument.id) : null);
    if (folder) {
      invoice = { ...invoice, projectId: folder.id };
      await saveProjectRecord(addInvoiceToProject(folder, invoice.id));
    }

    await saveInvoiceRecord(invoice);
    open(
      { type: 'invoice', invoiceId: invoice.id },
      `Invoice ${invoice.invoiceNumber}`,
      invoice.client.name || null,
    );
    setMessage(
      fromDocument
        ? `Invoice ${invoice.invoiceNumber} created from ${fromDocument.documentNumber}. Editing the commission from here on will not change it.`
        : `Invoice ${invoice.invoiceNumber} created.`,
    );
  };

  const logoDataUrlFor = useCallback(
    async (invoice: Invoice): Promise<string | null> => {
      const id = invoice.studio.logoImageId;
      if (!id) return null;
      const image = await repo.getImage(id);
      return image ? blobToDataUrl(image.blob) : null;
    },
    [repo],
  );

  const exportInvoice = async (invoice: Invoice, format: 'html' | 'jpeg' | 'png' | 'copy') => {
    try {
      if (format === 'html') {
        downloadInvoiceHtml(invoice, await logoDataUrlFor(invoice));
        setMessage('Saved as a self-contained HTML file. Attach it, or open it and copy it into an email.');
      } else if (format === 'copy') {
        await copyInvoiceHtml(invoice, await logoDataUrlFor(invoice));
        setMessage('Copied. Paste it straight into an email.');
      } else {
        await downloadInvoiceImage(invoice, format);
        setMessage(`Saved as ${format.toUpperCase()}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  // --- Portable files -----------------------------------------------------

  const handleExport = (doc: CommissionDocument) => {
    const envelope = exportDocument(doc);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.documentNumber}.json`;
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
    open(
      { type: 'commission', docId: result.document.id },
      'Commission Studio',
      result.document.documentNumber,
    );
    setMessage(
      result.missingImageIds.length > 0
        ? `Imported. ${result.missingImageIds.length} referenced image(s) are not on this device.`
        : 'Imported.',
    );
  };

  /**
   * Adds pictures to the wallpaper library. Each one is resized and
   * re-encoded before it is stored, and the last one added becomes the
   * desktop — which is what someone who just dropped a picture in expects.
   *
   * A file that cannot be read is named rather than silently skipped, and the
   * ones that did work are still added.
   */
  const handleUploadWallpapers = async (files: File[]) => {
    setWallpaperError(null);
    setWallpaperBusy(true);
    const failures: string[] = [];
    let added: CustomWallpaper | null = null;
    let resizedAny = false;

    try {
      for (const file of files) {
        try {
          const prepared = await prepareWallpaper(file);
          const imageId = newId();
          await repo.putImage(imageId, prepared.blob);
          added = {
            imageId,
            name: file.name.replace(/\.[^.]+$/, '') || 'Untitled',
            addedAt: new Date().toISOString(),
            width: prepared.width,
            height: prepared.height,
          };
          resizedAny = resizedAny || prepared.resized;
          setWallpaperLibrary((current) => addWallpaper(current, added!));
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      setWallpaperBusy(false);
    }

    if (added) {
      setWallpaper({ ...wallpaper, id: 'custom', customImageId: added.imageId });
      setMessage(
        resizedAny
          ? 'Added. Large pictures were resized to 2560px on the longest edge.'
          : 'Added to your desktop pictures.',
      );
    }
    if (failures.length > 0) setWallpaperError(failures.join(' '));
  };

  /**
   * Removes a picture from the library and deletes its blob. If it was the
   * one on the desktop, the desktop goes back to a bundled picture rather
   * than pointing at an image that no longer exists.
   */
  const handleRemoveWallpaper = async (imageId: string) => {
    const wasInUse = wallpaper.id === 'custom' && wallpaper.customImageId === imageId;
    setWallpaperLibrary((current) => removeWallpaper(current, imageId));
    await repo.deleteImage(imageId);
    if (wasInUse) {
      setWallpaper({ ...wallpaper, id: theme === 'light' ? 'linen' : 'obsidian', customImageId: null });
    }
  };

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

  const openDocumentWindow = (id: string) => {
    const doc = docById(id);
    if (doc) open({ type: 'commission', docId: id }, 'Commission Studio', doc.documentNumber);
  };

  const openInvoiceWindow = (id: string) => {
    const invoice = invoices.find((i) => i.id === id);
    if (invoice) {
      open({ type: 'invoice', invoiceId: id }, `Invoice ${invoice.invoiceNumber}`, invoice.client.name || null);
    }
  };

  const openDesktopItem = (item: DesktopItem) => {
    if (item.kind === 'project') {
      open({ type: 'folder', projectId: item.id }, item.project.name, 'Project folder');
    } else if (item.kind === 'document') {
      openDocumentWindow(item.id);
    } else {
      openInvoiceWindow(item.id);
    }
  };

  const openRailItem = (item: RailItem) => {
    if (item.kind.type === 'tool' && item.kind.tool === 'invoices-list') {
      open(item.kind, 'Invoices', 'All invoices');
    } else if (item.kind.type === 'tool') {
      open(item.kind, MOCK_TOOL_NAMES[item.kind.tool] ?? item.name, 'Preview');
    } else if (item.kind.type === 'settings') {
      open(item.kind, 'Settings', null);
    } else {
      open(item.kind, 'Projects', 'All commissions');
    }
  };

  // --- Window plumbing ----------------------------------------------------

  const top = focusedWindow(windows);
  const tray = minimizedWindows(windows);

  const focusWin = (id: string) => setWindows((c) => focusWindow(c, id));
  const closeWin = (id: string) => setWindows((c) => closeWindow(c, id));
  const minimizeWin = (id: string) => setWindows((c) => minimizeWindow(c, id));
  const zoomWin = (id: string) => setWindows((c) => toggleZoom(c, id, viewportRef.current));

  const statusRow =
    top && top.kind.type === 'commission'
      ? rows.find((row) => row.id === (top.kind as { docId: string }).docId)
      : undefined;
  const statusText = statusRow
    ? describeSaveState(statusRow.saveState, cloud)
    : cloud.configured
      ? 'Ready'
      : 'Local only — cloud sync not configured';

  // --- Per-window rendering ----------------------------------------------

  function renderToolbar(win: WindowState) {
    const kind = win.kind;

    if (kind.type === 'commission') {
      const doc = docById(kind.docId);
      if (!doc) return null;
      const filed = projectContaining(doc.id);
      return (
        <>
          <button className="btn" data-variant="primary" onClick={() => void handleSaveToFolder(doc.id)}>
            {filed ? 'Open folder' : 'Save to folder'}
          </button>
          <button className="btn" onClick={() => void makeInvoice(doc, null)}>Create invoice</button>
          <button className="btn" onClick={() => void handleIssue(doc.id)}>Issue</button>
          <button className="btn" onClick={() => void handleDuplicate(doc.id)}>Duplicate</button>
          <button className="btn" data-variant="quiet" onClick={() => handleExport(doc)}>Export</button>
          <button className="btn" data-variant="quiet" onClick={() => importRef.current?.click()}>
            Import
          </button>
          <span className="faint" style={{ fontSize: 12 }}>Saved as you type</span>
        </>
      );
    }

    if (kind.type === 'invoice') {
      const invoice = invoices.find((i) => i.id === kind.invoiceId);
      if (!invoice) return null;
      const previewing = invoicePreview[invoice.id] ?? false;
      return previewing ? (
        <>
          <button className="btn" onClick={() => setInvoicePreview((s) => ({ ...s, [invoice.id]: false }))}>
            Back to editor
          </button>
          <button className="btn" data-variant="primary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button className="btn" onClick={() => void exportInvoice(invoice, 'html')}>Save HTML</button>
          <button className="btn" onClick={() => void exportInvoice(invoice, 'copy')}>Copy for email</button>
          <button className="btn" onClick={() => void exportInvoice(invoice, 'jpeg')}>Save JPEG</button>
          <button className="btn" data-variant="quiet" onClick={() => void exportInvoice(invoice, 'png')}>
            PNG
          </button>
        </>
      ) : (
        <>
          <button
            className="btn"
            data-variant="primary"
            onClick={() => setInvoicePreview((s) => ({ ...s, [invoice.id]: true }))}
          >
            Preview &amp; send
          </button>
          <button
            className="btn"
            disabled={invoice.state === 'issued'}
            onClick={() => void saveInvoiceRecord(issueInvoice(invoice))}
          >
            {invoice.state === 'issued' ? 'Issued' : 'Mark as issued'}
          </button>
          <span className="faint" style={{ fontSize: 12 }}>Saved as you type</span>
        </>
      );
    }

    if (kind.type === 'list') {
      return (
        <>
          <button className="btn" data-variant="primary" onClick={handleNew}>New commission</button>
          <button className="btn" data-variant="quiet" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </>
      );
    }

    if (kind.type === 'folder') {
      const project = projects.find((p) => p.id === kind.projectId);
      return (
        <>
          <button
            className="btn"
            data-variant="primary"
            onClick={() => project && void makeInvoice(firstDocOf(project, rows), project)}
          >
            New invoice
          </button>
          <span className="faint" style={{ fontSize: 12 }}>Double-click a row to open it.</span>
        </>
      );
    }

    if (kind.type === 'settings') {
      return <span className="faint" style={{ fontSize: 12 }}>Changes are saved as you make them.</span>;
    }

    return <span className="faint" style={{ fontSize: 12 }}>Preview — nothing here saves or sends.</span>;
  }

  function renderContent(win: WindowState) {
    const kind = win.kind;

    if (kind.type === 'commission') {
      const doc = docById(kind.docId);
      if (!doc) return <p className="hint">This commission has been deleted.</p>;
      const tab = projectTabs[doc.id] ?? 'overview';
      const forDoc = invoices.filter((i) => i.sourceDocumentId === doc.id);
      const snapshot = latestSnapshot(doc);
      return (
        <ProjectWindow
          doc={doc}
          invoices={forDoc}
          imageUrls={imageUrls}
          imageError={imageError}
          tab={tab}
          onTab={(next) => setProjectTabs((s) => ({ ...s, [doc.id]: next }))}
          onChange={(changes) => void handleChange(doc.id, changes)}
          onDocChange={(next) => void save(next)}
          onAddImages={(files) => void handleAddImages(doc.id, files)}
          onRemoveImage={(id) => void handleRemoveImage(doc.id, id)}
          onNewInvoice={() => void makeInvoice(doc, null)}
          onOpenInvoice={openInvoiceWindow}
          onRemoveDemo={doc.isDemo ? () => void handleRemoveDemo(doc.id) : undefined}
          editorSlot={
            <Editor
              doc={doc}
              onChange={(changes) => void handleChange(doc.id, changes)}
              imageUrls={imageUrls}
              onAddImages={(files) => void handleAddImages(doc.id, files)}
              onRemoveImage={(id) => void handleRemoveImage(doc.id, id)}
              imageError={imageError}
            />
          }
          documentSlot={
            <>
              <div className="send-strip no-print">
                <span>The client-facing document. Print it, or save it as a PDF from the print dialog.</span>
                <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
              </div>
              <ClientPreview
                doc={toClientFacing(doc)}
                imageUrls={imageUrls}
                issued={snapshot ? { version: snapshot.version, issuedAt: snapshot.issuedAt } : null}
              />
            </>
          }
        />
      );
    }

    if (kind.type === 'invoice') {
      const invoice = invoices.find((i) => i.id === kind.invoiceId);
      if (!invoice) return <p className="hint">This invoice has been deleted.</p>;
      const previewing = invoicePreview[invoice.id] ?? false;
      return previewing ? (
        <>
          <div className="send-strip no-print">
            <span>
              Artist OS cannot email this for you. Save the file and attach it — or copy it and
              paste it into your mail window.
            </span>
            <a className="btn" href={mailtoForInvoice(invoice)}>Open in my mail app</a>
          </div>
          <InvoiceView
            invoice={invoice}
            logoUrl={invoice.studio.logoImageId ? imageUrls[invoice.studio.logoImageId] : null}
          />
        </>
      ) : (
        <InvoiceEditor
          invoice={invoice}
          onChange={(changes) => void saveInvoiceRecord(applyInvoiceEdit(invoice, changes))}
          onRecordPayment={(payload) => void saveInvoiceRecord(recordInvoicePayment(invoice, payload))}
        />
      );
    }

    if (kind.type === 'folder') {
      const project = projects.find((p) => p.id === kind.projectId);
      if (!project) return <p className="hint">This folder has been deleted.</p>;
      return (
        <FolderWindow
          project={project}
          documents={rows.filter((row) => project.documentIds.includes(row.id)).map((r) => r.document)}
          invoices={invoices.filter((invoice) => project.invoiceIds.includes(invoice.id))}
          onOpenDocument={openDocumentWindow}
          onOpenInvoice={openInvoiceWindow}
          onRename={(name) => void saveProjectRecord(renameProject(project, name))}
          onNewInvoice={() => void makeInvoice(firstDocOf(project, rows), project)}
          onRemoveItem={(id) => {
            void saveProjectRecord(removeFromProject(project, id));
            setMessage('Moved back to the desktop. Nothing was deleted.');
          }}
        />
      );
    }

    if (kind.type === 'list') {
      return (
        <DocumentList
          rows={rows}
          search={search}
          onSearch={setSearch}
          onOpen={openDocumentWindow}
          onDuplicate={(id) => void handleDuplicate(id)}
          onArchive={(id) => void repo.archive(id).then(refresh)}
          onNew={handleNew}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
        />
      );
    }

    if (kind.type === 'settings') {
      return (
        <Settings
          studio={studio}
          onStudio={setStudio}
          payment={payment}
          onPayment={setPayment}
          wallpaper={wallpaper}
          onWallpaper={setWallpaper}
          wallpaperLibrary={wallpaperLibrary}
          wallpaperUrls={wallpaperUrls}
          onUploadWallpapers={(files) => void handleUploadWallpapers(files)}
          onRemoveWallpaper={(imageId) => void handleRemoveWallpaper(imageId)}
          onRenameWallpaper={(imageId, name) =>
            setWallpaperLibrary((current) => renameWallpaper(current, imageId, name))
          }
          wallpaperBusy={wallpaperBusy}
          wallpaperError={wallpaperError}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'invoices-list') {
      return (
        <InvoiceList
          invoices={invoices}
          onOpen={openInvoiceWindow}
          onNew={() => void makeInvoice(null, null)}
        />
      );
    }

    if (kind.type === 'tool') {
      const Tool = MOCK_TOOLS[kind.tool];
      return Tool ? <Tool /> : <p className="hint">This tool does not exist yet.</p>;
    }

    return null;
  }

  // --- Render -------------------------------------------------------------

  return (
    <div
      className="workspace"
      data-wallpaper={wallpaper.id}
      data-fit={wallpaper.fit ?? 'cover'}
      style={wallpaperStyle(wallpaper, wallpaperUrls)}
    >
      <SystemBar
        studioName={studio.name}
        search={search}
        onSearch={setSearch}
        statusText={statusText}
        statusState={statusRow?.saveState ?? 'saved-local'}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onOpenSettings={() => open({ type: 'settings' }, 'Settings', null)}
        initials={initialsOf(studio.name)}
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
        <Desktop
          items={desktopItems}
          imageUrls={imageUrls}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openDesktopItem}
          onNew={handleNew}
        />

        {windows
          .filter((w) => !w.minimized)
          .map((win) => (
            <Frame
              key={win.id}
              window={win}
              focused={top?.id === win.id}
              compact={compact}
              toolbar={renderToolbar(win)}
              sidebar={
                win.kind.type === 'commission' && !compact ? (
                  <AppRail activeId="projects" onOpen={openRailItem} />
                ) : undefined
              }
              inspector={
                win.kind.type === 'commission' && !compact
                  ? renderInspector(win.kind.docId)
                  : undefined
              }
              onFocus={() => focusWin(win.id)}
              onClose={() => closeWin(win.id)}
              onMinimize={() => minimizeWin(win.id)}
              onZoom={() => zoomWin(win.id)}
              onMove={(x, y) => setWindows((c) => moveWindow(c, win.id, x, y))}
              onResize={(w, h) => setWindows((c) => resizeWindow(c, win.id, w, h))}
            >
              {message && top?.id === win.id && (
                <div className="notice no-print">
                  {message}{' '}
                  <button className="btn" data-variant="quiet" onClick={() => setMessage(null)}>
                    Dismiss
                  </button>
                </div>
              )}
              {renderContent(win)}
            </Frame>
          ))}
      </main>

      {tray.length > 0 && (
        <div className="tray no-print" aria-label="Minimised windows">
          {tray.map((win) => (
            <button key={win.id} className="tray-item" onClick={() => focusWin(win.id)}>
              <span className="tray-dot" aria-hidden="true" />
              {win.title}
            </button>
          ))}
        </div>
      )}

      <BuildStamp />

      <Dock
        activeId={dockIdFor(top)}
        onOpen={(id) => {
          if (id === 'home') {
            // Show the desktop: everything goes to the tray, nothing is lost.
            setWindows((c) => c.map((w) => ({ ...w, minimized: true })));
          } else if (id === 'invoices') {
            open({ type: 'tool', tool: 'invoices-list' }, 'Invoices', 'All invoices');
          } else if (id === 'commissions') {
            open({ type: 'list' }, 'Projects', 'All commissions');
          } else {
            open({ type: 'tool', tool: id }, MOCK_TOOL_NAMES[id] ?? id, 'Preview');
          }
        }}
      />
    </div>
  );

  function renderInspector(docId: string) {
    const doc = docById(docId);
    if (!doc) return undefined;
    return (
      <ArtworkInspector
        doc={doc}
        imageUrls={imageUrls}
        onChange={(changes) => void handleChange(doc.id, changes)}
      />
    );
  }
}

function wallpaperStyle(
  choice: WallpaperChoice,
  customUrls: Record<string, string>,
): React.CSSProperties {
  // The dim is a CSS variable rather than a filter: a filter on the workspace
  // would darken the windows and the dock along with the picture.
  const dim = { '--wallpaper-dim': String((choice.dim ?? 0) / 100) } as React.CSSProperties;

  if (choice.id === 'custom') {
    const url = choice.customImageId ? customUrls[choice.customImageId] : undefined;
    return url ? { ...dim, backgroundImage: `url(${url})` } : dim;
  }
  const bundled = BUNDLED_WALLPAPERS.find((w) => w.id === choice.id);
  return bundled ? { ...dim, backgroundImage: `url(${bundled.src})` } : dim;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '—'
  );
}

function firstDocOf(project: Project, rows: StoredDocument[]): CommissionDocument | null {
  const id = project.documentIds[0];
  if (!id) return null;
  return rows.find((row) => row.id === id)?.document ?? null;
}

function dockIdFor(top: WindowState | null): string {
  if (!top) return 'home';
  if (top.kind.type === 'invoice') return 'invoices';
  if (top.kind.type === 'tool') {
    return top.kind.tool === 'invoices-list' ? 'invoices' : top.kind.tool;
  }
  if (top.kind.type === 'commission' || top.kind.type === 'list') return 'commissions';
  return 'home';
}
