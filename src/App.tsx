import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './print.css';
import { SystemBar } from './os/SystemBar';
import { Dock } from './os/Dock';
import { Frame } from './os/Frame';
import { Desktop, type DesktopItem } from './os/Desktop';
import { Finder } from './os/Finder';
import { TrashWindow } from './os/TrashWindow';
import { TrashButton } from './os/TrashButton';
import { Connect, type ConnectTab } from './connect/ui/Connect';
import type { GuestEntry } from './connect/guestbook';
import {
  countPhrase,
  deletionTargets,
  findEntry,
  orphanImageIds,
  removeEntry,
  summarise,
  trashItem,
  trashedIds,
  type Trash,
  type TrashEntry,
} from './os/trash';
import {
  autoArrange,
  pruneLayout,
  trashPositionOf,
  type DesktopLayout,
  type IconPosition,
} from './os/desktopLayout';
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
  toggleWindow,
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
  addPhotoToProject,
  filedInvoiceIds,
  filedPhotoIds,
  projectItemCount,
  projectItemIds,
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
import {
  createPhoto,
  describePhoto,
  editPhoto,
  titleFromFileName,
  type Photo,
} from './photo/photo';
import { PhotoWindow } from './photo/ui/PhotoWindow';
import { Repository, type StoredDocument } from './persistence/repository';
import { describeSaveState, drainQueue, unavailableCloud } from './persistence/sync';
import { exportDocument, importDocumentFromText } from './persistence/portable';
import {
  BUNDLED_WALLPAPERS,
  loadPaymentInstructions,
  loadStudioDefaults,
  loadTheme,
  loadWallpaper,
  loadDesktopLayout,
  loadGuests,
  loadSiteUrl,
  loadTrash,
  loadTrashPosition,
  loadWallpaperLibrary,
  savePaymentInstructions,
  saveStudioDefaults,
  saveTheme,
  saveWallpaper,
  saveDesktopLayout,
  saveGuests,
  saveSiteUrl,
  saveTrash,
  saveTrashPosition,
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
registerModule({ id: 'finder', name: 'Finder', icon: '❐', available: true });
registerModule({ id: 'connect', name: 'Connect', icon: '◉', available: true });
// Last in the dock, the way the Trash is always last.
registerModule({ id: 'trash', name: 'Trash', icon: '♺', available: true });

export default function App() {
  const repo = useMemo(() => new Repository(WORKSPACE_ID), []);

  const [rows, setRows] = useState<StoredDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [importingImages, setImportingImages] = useState(false);
  const [guests, setGuests] = useState<GuestEntry[]>(loadGuests);
  const [siteUrl, setSiteUrl] = useState(loadSiteUrl);
  const [connectTab, setConnectTab] = useState<ConnectTab>('guestbook');
  const [connectPhotoId, setConnectPhotoId] = useState<string | null>(null);
  /** False until the first read from IndexedDB has come back. */
  const [loaded, setLoaded] = useState(false);

  const [windows, setWindows] = useState<WindowState[]>([]);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const compact = viewport.width <= COMPACT_WIDTH;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>(loadDesktopLayout);
  const [trash, setTrash] = useState<Trash>(loadTrash);
  const [trashPosition, setTrashPosition] = useState<IconPosition | null>(loadTrashPosition);
  /**
   * The desktop surface's own size, reported by Desktop. Smaller than the
   * window — the system bar is above it — and it is what the icon grid is
   * laid out against, so Tidy up must use the same number.
   */
  const desktopViewportRef = useRef(viewport);
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
  useEffect(() => saveDesktopLayout(desktopLayout), [desktopLayout]);
  useEffect(() => saveTrash(trash), [trash]);
  useEffect(() => saveGuests(guests), [guests]);
  useEffect(() => saveSiteUrl(siteUrl), [siteUrl]);
  useEffect(() => saveTrashPosition(trashPosition), [trashPosition]);
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

  // Read by `refresh`, which must see the current Trash rather than whatever
  // it was when the callback was made.
  const trashRef = useRef(trash);
  useEffect(() => {
    trashRef.current = trash;
  }, [trash]);

  const refresh = useCallback(async () => {
    const [documentRows, projectRows, invoiceRows, photoRows] = await Promise.all([
      repo.list(),
      repo.listProjects(),
      repo.listInvoices(),
      repo.listPhotos(),
    ]);
    // Everything in the Trash is hidden from the desktop, the Finder and the
    // lists. The records themselves are untouched in storage — that is what
    // makes Put back instant and lossless.
    const hidden = trashedIds(trashRef.current);
    setRows(documentRows.filter((row) => !hidden.has(row.id)));
    setProjects(projectRows.filter((project) => !hidden.has(project.id)));
    setInvoices(invoiceRows.filter((invoice) => !hidden.has(invoice.id)));
    setPhotos(photoRows.filter((photo) => !hidden.has(photo.id)));
    setLoaded(true);
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
    for (const photo of photos) ids.add(photo.imageId);
    return [...ids].sort().join(',');
  }, [rows, projects, photos]);

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
  const filedPhotos = filedPhotoIds(projects);

  const desktopItems: DesktopItem[] = [
    ...projects.map((project) => ({ kind: 'project' as const, id: project.id, project })),
    ...rows
      .filter((row) => row.document.state !== 'archived' && !filedDocs.has(row.id))
      .map((row) => ({ kind: 'document' as const, id: row.id, document: row.document })),
    ...invoices
      .filter((invoice) => !filedInvoices.has(invoice.id))
      .map((invoice) => ({ kind: 'invoice' as const, id: invoice.id, invoice })),
    ...photos
      .filter((photo) => !filedPhotos.has(photo.id))
      .map((photo) => ({ kind: 'photo' as const, id: photo.id, photo })),
  ];

  /** Which folder each filed item is in, for the Finder. */
  const folderOf: Record<string, string> = {};
  for (const project of projects) {
    for (const id of project.documentIds) folderOf[id] = project.id;
    for (const id of project.invoiceIds) folderOf[id] = project.id;
    for (const id of project.imageIds ?? []) folderOf[id] = project.id;
  }

  const handleMoveIcon = (id: string, position: { x: number; y: number }) => {
    setDesktopLayout((current) => ({ ...current, [id]: position }));
  };

  const handleTidy = () => {
    const surface = desktopViewportRef.current;
    setDesktopLayout(
      autoArrange(desktopItems.map((item) => item.id), surface, [
        // Wherever the can is now, the tidy leaves room for it.
        trashPositionOf(trashPosition, surface),
      ]),
    );
    setMessage('Desktop tidied up.');
  };

  const handleNewFolder = async () => {
    const taken = new Set(projects.map((p) => p.name));
    let name = 'New folder';
    for (let n = 2; taken.has(name); n += 1) name = `New folder ${n}`;
    await saveProjectRecord(createProject(name, null));
    setMessage(`“${name}” is on your desktop. Drag files onto it, or rename it inside.`);
  };

  /** Drag a file onto a folder — or pick the folder from the Finder. */
  const handleFileInto = async (folderId: string, itemId: string) => {
    const folder = projects.find((p) => p.id === folderId);
    // Never a folder into a folder, and never a folder into itself.
    if (!folder || folder.id === itemId || projects.some((p) => p.id === itemId)) return;

    // Out of whatever folder it was in first, so it is never in two at once.
    const previous = projectContaining(itemId);
    if (previous && previous.id !== folderId) {
      await repo.saveProject(removeFromProject(previous, itemId));
    }

    const isInvoice = invoices.some((invoice) => invoice.id === itemId);
    const photo = photos.find((p) => p.id === itemId);
    let next = photo
      ? addPhotoToProject(folder, itemId)
      : isInvoice
        ? addInvoiceToProject(folder, itemId)
        : addDocumentToProject(folder, itemId);

    // A folder with no face takes the first picture that lands in it.
    if (!next.coverImageId) {
      const cover = photo ? photo.imageId : docById(itemId)?.artwork.referenceImageIds[0];
      if (cover) next = setProjectCover(next, cover);
    }

    await saveProjectRecord(next);
    // The icon has gone into the folder, so its old spot is meaningless.
    setDesktopLayout((current) => {
      const { [itemId]: _gone, ...rest } = current;
      return rest;
    });
    setMessage(`Filed into “${folder.name}”.`);
  };

  // --- Pictures -------------------------------------------------------------

  const savePhotoRecord = async (photo: Photo) => {
    await repo.savePhoto(photo);
    await refresh();
  };

  /**
   * Brings pictures in from the Add images square, from a file picker or a
   * drop. Each one is resized and re-encoded before it is stored — a modern
   * phone photo is 4 MB and there is no reason to keep every pixel of it.
   *
   * A file that cannot be read stops that file, not the batch: dropping ten
   * pictures and losing nine because the third was a PDF would be worse than
   * saying which one failed.
   */
  const handleImportPhotos = async (files: FileList | File[], folderId?: string) => {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    setImportingImages(true);
    setImageError(null);
    const failed: string[] = [];
    let added = 0;
    let folder = folderId ? projects.find((p) => p.id === folderId) ?? null : null;

    for (const file of chosen) {
      try {
        // The same resize the wallpapers use, at a smaller edge: this is a
        // picture to show a client, not a backdrop.
        const prepared = await prepareWallpaper(file, 2000);
        const imageId = newId();
        await repo.putImage(imageId, prepared.blob);
        const photo = createPhoto({
          imageId,
          title: titleFromFileName(file.name),
          pixelWidth: prepared.width,
          pixelHeight: prepared.height,
        });
        await repo.savePhoto(photo);
        if (folder) {
          folder = addPhotoToProject(folder, photo.id);
          if (!folder.coverImageId) folder = setProjectCover(folder, imageId);
        }
        added += 1;
      } catch (cause) {
        failed.push(file.name);
        // eslint-disable-next-line no-console
        console.warn('Could not add image', file.name, cause);
      }
    }

    if (folder) await repo.saveProject(folder);
    await refresh();
    setImportingImages(false);

    if (added > 0) {
      setMessage(
        folderId
          ? `${countPhrase(added, 'picture')} added to the folder.`
          : `${countPhrase(added, 'picture')} added to the desktop. Drag one onto a folder to file it.`,
      );
    }
    if (failed.length > 0) {
      // Said twice on purpose: the inspector's error line is only visible when
      // a commission is open, and this import usually happens on the desktop.
      const text = `Could not add ${failed.join(', ')}. PNG, JPEG and WebP images up to 8 MB work.`;
      setImageError(text);
      setMessage(text);
    }
  };

  // --- Trash ---------------------------------------------------------------

  /**
   * Moving something to the Trash hides it; it never deletes it. The record
   * stays in IndexedDB exactly as it was, which is why Put back is instant.
   */
  const applyTrash = async (next: Trash) => {
    trashRef.current = next;
    setTrash(next);
    await refresh();
  };

  /** Windows onto a record that has just been hidden or destroyed. */
  const closeWindowsFor = (ids: string[]) => {
    setWindows((current) =>
      current.filter((w) => {
        const kind = w.kind;
        if (kind.type === 'commission') return !ids.includes(kind.docId);
        if (kind.type === 'invoice') return !ids.includes(kind.invoiceId);
        if (kind.type === 'folder') return !ids.includes(kind.projectId);
        if (kind.type === 'photo') return !ids.includes(kind.photoId);
        return true;
      }),
    );
  };

  const handleTrash = async (itemId: string) => {
    const project = projects.find((p) => p.id === itemId);
    const doc = docById(itemId);
    const invoice = invoices.find((i) => i.id === itemId);
    const photo = photos.find((p) => p.id === itemId);
    if (!project && !doc && !invoice && !photo) return;

    const entry: TrashEntry = project
      ? {
          id: project.id,
          kind: 'project',
          name: project.name,
          deletedAt: new Date().toISOString(),
          // The contents go in with the folder and come back out with it.
          contains: projectItemIds(project),
          fromFolderId: null,
        }
      : {
          id: itemId,
          kind: photo ? 'photo' : doc ? 'document' : 'invoice',
          name: photo
            ? photo.title
            : doc
              ? doc.title.trim() || doc.documentNumber
              : invoice?.invoiceNumber ?? 'Invoice',
          deletedAt: new Date().toISOString(),
          contains: [],
          fromFolderId: projectContaining(itemId)?.id ?? null,
        };

    await applyTrash(trashItem(trashRef.current, entry));
    if (selectedId === itemId) setSelectedId(null);
    // The record is hidden now, so a window onto it would only show a
    // tombstone. Closing it loses nothing: Put back is one click away.
    closeWindowsFor(deletionTargets(entry));
    setMessage(
      entry.contains.length > 0
        ? `“${entry.name}” and the ${countPhrase(entry.contains.length)} inside it went to the Trash. Nothing has been deleted.`
        : `“${entry.name}” went to the Trash. Nothing has been deleted.`,
    );
  };

  const handlePutBack = async (itemId: string) => {
    const entry = findEntry(trashRef.current, itemId);
    if (!entry) return;
    await applyTrash(removeEntry(trashRef.current, itemId));
    setMessage(
      entry.fromFolderId
        ? `“${entry.name}” is back in its folder.`
        : `“${entry.name}” is back on the desktop.`,
    );
  };

  /**
   * The only code in the app that destroys anything. Both callers ask the
   * artist a second question first, in TrashWindow.
   */
  const destroy = async (entries: TrashEntry[]) => {
    const ids = entries.flatMap(deletionTargets);
    const removedImages: string[] = [];

    for (const id of ids) {
      const storedPhoto = await repo.loadPhoto(id);
      if (storedPhoto) {
        removedImages.push(storedPhoto.imageId);
        await repo.deletePhoto(id);
        continue;
      }
      const stored = await repo.load(id);
      if (stored) {
        removedImages.push(...stored.document.artwork.referenceImageIds);
        await repo.deleteDocument(id);
        continue;
      }
      if (await repo.loadInvoice(id)) {
        await repo.deleteInvoice(id);
        continue;
      }
      if (await repo.loadProject(id)) await repo.deleteProject(id);
    }

    // A photograph another commission still uses is never taken with it, and
    // neither is one being used as a desktop picture.
    const [remaining, remainingPhotos] = await Promise.all([repo.list(), repo.listPhotos()]);
    const stillUsed = new Set<string>([
      ...remaining.flatMap((row) => row.document.artwork.referenceImageIds),
      ...remainingPhotos.map((photo) => photo.imageId),
      ...wallpaperLibrary.map((picture) => picture.imageId),
    ]);
    for (const imageId of orphanImageIds(removedImages, stillUsed)) {
      await repo.deleteImage(imageId);
    }

    closeWindowsFor(ids);

    const keep = trashRef.current.filter((e) => !entries.some((gone) => gone.id === e.id));
    await applyTrash(keep);
  };

  const handleDeleteForever = async (itemId: string) => {
    const entry = findEntry(trashRef.current, itemId);
    if (!entry) return;
    await destroy([entry]);
    setMessage(`“${entry.name}” has been deleted for good.`);
  };

  const handleEmptyTrash = async () => {
    const going = trashRef.current;
    if (going.length === 0) return;
    const { records } = summarise(going);
    await destroy(going);
    setMessage(`Trash emptied. ${countPhrase(records, 'record')} deleted for good.`);
  };

  const handleTakeOut = async (itemId: string) => {
    const folder = projectContaining(itemId);
    if (!folder) return;
    await saveProjectRecord(removeFromProject(folder, itemId));
    setMessage('Moved back to the desktop. Nothing was deleted.');
  };

  // Positions for things that have been deleted or filed away would otherwise
  // pile up in localStorage forever.
  // Waits for `loaded`: before the first read comes back the desktop is empty,
  // and pruning against nothing would throw away every saved position.
  const desktopIdKey = desktopItems.map((item) => item.id).join('|');
  useEffect(() => {
    if (!loaded) return;
    const ids = desktopIdKey ? desktopIdKey.split('|') : [];
    setDesktopLayout((current) => {
      const pruned = pruneLayout(current, ids);
      return Object.keys(pruned).length === Object.keys(current).length ? current : pruned;
    });
  }, [desktopIdKey, loaded]);

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

  /** Opens Connect on a given tab — and on a given picture, when sending one. */
  const openConnect = (tab: ConnectTab, photoId?: string) => {
    setConnectTab(tab);
    if (photoId) setConnectPhotoId(photoId);
    open({ type: 'tool', tool: 'connect' }, 'Connect', 'Guest book, sharing and QR');
  };

  const openTrashWindow = () =>
    open({ type: 'tool', tool: 'trash' }, 'Trash', 'Nothing here is deleted yet');

  /** How the invoice draws a picture it refers to. */
  const photoPlate = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return null;
    return {
      url: imageUrls[photo.imageId],
      title: photo.title,
      detail: describePhoto(photo) === 'No details yet' ? null : describePhoto(photo),
    };
  };

  /**
   * Uploading from inside an invoice: the pictures land on the desktop like
   * any other, and are added to this invoice as well. One picture, one place —
   * an invoice never gets a private copy.
   */
  const handleImportPhotosOnto = async (invoice: Invoice, files: FileList | File[]) => {
    const before = new Set((await repo.listPhotos()).map((photo) => photo.id));
    await handleImportPhotos(files);
    const added = (await repo.listPhotos()).filter((photo) => !before.has(photo.id));
    if (added.length === 0) return;
    await saveInvoiceRecord(
      applyInvoiceEdit(invoice, {
        imageIds: [...(invoice.imageIds ?? []), ...added.map((photo) => photo.id)],
      }),
    );
  };

  const openPhotoWindow = (id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (photo) open({ type: 'photo', photoId: id }, photo.title, 'Picture');
  };

  const openDesktopItem = (item: DesktopItem) => {
    if (item.kind === 'project') {
      open({ type: 'folder', projectId: item.id }, item.project.name, 'Project folder');
    } else if (item.kind === 'document') {
      openDocumentWindow(item.id);
    } else if (item.kind === 'photo') {
      openPhotoWindow(item.id);
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
          <TrashButton onTrash={() => void handleTrash(doc.id)} />
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
          <TrashButton onTrash={() => void handleTrash(invoice.id)} />
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
          {project && (
            <label className="btn" data-variant="quiet">
              {importingImages ? 'Adding…' : 'Add images'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) void handleImportPhotos(e.target.files, project.id);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          {project && (
            <TrashButton
              onTrash={() => void handleTrash(project.id)}
              note={
                projectItemCount(project) > 0
                  ? `Takes the ${countPhrase(projectItemCount(project))} inside it too. Nothing is deleted until you empty the Trash.`
                  : undefined
              }
            />
          )}
          <span className="faint" style={{ fontSize: 12 }}>Double-click a row to open it.</span>
        </>
      );
    }

    if (kind.type === 'photo') {
      const photo = photos.find((p) => p.id === kind.photoId);
      if (!photo) return null;
      return (
        <>
          <button className="btn" data-variant="primary" onClick={() => openConnect('send', photo.id)}>
            Send to a client
          </button>
          <TrashButton onTrash={() => void handleTrash(photo.id)} />
          <span className="faint" style={{ fontSize: 12 }}>Saved as you type</span>
        </>
      );
    }

    if (kind.type === 'settings') {
      return <span className="faint" style={{ fontSize: 12 }}>Changes are saved as you make them.</span>;
    }

    if (kind.type === 'tool' && kind.tool === 'connect') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          Everything here runs on this device. Nothing is sent without you tapping send.
        </span>
      );
    }

    if (kind.type === 'tool' && kind.tool === 'trash') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          Put back returns an item untouched. Only Empty Trash deletes anything.
        </span>
      );
    }

    if (kind.type === 'tool' && kind.tool === 'finder') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          Select a row, then Open. Drag an icon onto a folder on the desktop, or use Move to here.
        </span>
      );
    }

    // Only the mock tools carry this. A built tool saying it saves nothing
    // would be a lie about the Finder, which files things for real.
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
            photoFor={photoPlate}
          />
        </>
      ) : (
        <InvoiceEditor
          photos={photos}
          imageUrls={imageUrls}
          importing={importingImages}
          onAddImages={(files) => void handleImportPhotosOnto(invoice, files)}
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
          photos={photos.filter((photo) => (project.imageIds ?? []).includes(photo.id))}
          imageUrls={imageUrls}
          onOpenPhoto={openPhotoWindow}
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

    if (kind.type === 'photo') {
      const photo = photos.find((p) => p.id === kind.photoId);
      if (!photo) return <p className="hint">This picture has been deleted.</p>;
      return (
        <PhotoWindow
          photo={photo}
          url={imageUrls[photo.imageId]}
          onChange={(changes) => void savePhotoRecord(editPhoto(photo, changes))}
          onSend={() => openConnect('send', photo.id)}
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

    if (kind.type === 'tool' && kind.tool === 'connect') {
      return (
        <Connect
          tab={connectTab}
          onTab={setConnectTab}
          studio={studio}
          photos={photos}
          imageUrls={imageUrls}
          imageBlob={async (imageId) => (await repo.getImage(imageId))?.blob ?? null}
          guests={guests}
          onGuests={setGuests}
          selectedPhotoId={connectPhotoId}
          onSelectPhoto={setConnectPhotoId}
          siteUrl={siteUrl}
          onSiteUrl={setSiteUrl}
          onMessage={setMessage}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'trash') {
      return (
        <TrashWindow
          trash={trash}
          onPutBack={(id) => void handlePutBack(id)}
          onDeleteForever={(id) => void handleDeleteForever(id)}
          onEmpty={() => void handleEmptyTrash()}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'finder') {
      return (
        <Finder
          projects={projects}
          documents={rows.filter((row) => row.document.state !== 'archived').map((r) => r.document)}
          invoices={invoices}
          photos={photos}
          folderOf={folderOf}
          imageUrls={imageUrls}
          onOpen={(itemKind, id) => {
            if (itemKind === 'project') {
              const project = projects.find((p) => p.id === id);
              if (project) open({ type: 'folder', projectId: id }, project.name, 'Project folder');
            } else if (itemKind === 'document') {
              openDocumentWindow(id);
            } else if (itemKind === 'photo') {
              openPhotoWindow(id);
            } else {
              openInvoiceWindow(id);
            }
          }}
          onFileInto={(folderId, itemId) => void handleFileInto(folderId, itemId)}
          onTakeOut={(itemId) => void handleTakeOut(itemId)}
          onNewFolder={() => void handleNewFolder()}
          onTrash={(id) => void handleTrash(id)}
          onRenameFolder={(folderId, name) => {
            const project = projects.find((p) => p.id === folderId);
            if (project) void saveProjectRecord(renameProject(project, name));
          }}
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
          layout={desktopLayout}
          viewport={viewport}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openDesktopItem}
          onMove={handleMoveIcon}
          onFileInto={(folderId, itemId) => void handleFileInto(folderId, itemId)}
          onNew={handleNew}
          onNewFolder={() => void handleNewFolder()}
          onAddImages={(files) => void handleImportPhotos(files)}
          importing={importingImages}
          onTidy={handleTidy}
          trashCount={trash.length}
          trashPosition={trashPosition}
          onMoveTrash={setTrashPosition}
          onTrash={(id) => void handleTrash(id)}
          onOpenTrash={openTrashWindow}
          onViewport={(size) => {
            desktopViewportRef.current = size;
          }}
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
        {/* With no window open there is nowhere for a message to go, and an
            action like Move to Trash closes the window it was used in. */}
        {message && !top && (
          <div className="notice desktop-notice no-print">
            {message}{' '}
            <button className="btn" data-variant="quiet" onClick={() => setMessage(null)}>
              Dismiss
            </button>
          </div>
        )}
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
            return;
          }
          // Every other dock button is a switch for its tool: open it, bring
          // it forward, or put it away. See toggleWindow.
          const spec =
            id === 'invoices'
              ? { kind: { type: 'tool' as const, tool: 'invoices-list' }, title: 'Invoices', subtitle: 'All invoices' }
              : id === 'commissions'
                ? { kind: { type: 'list' as const }, title: 'Projects', subtitle: 'All commissions' }
                : id === 'trash'
                  ? { kind: { type: 'tool' as const, tool: 'trash' }, title: 'Trash', subtitle: 'Nothing here is deleted yet' }
                  : id === 'connect'
                  ? { kind: { type: 'tool' as const, tool: 'connect' }, title: 'Connect', subtitle: 'Guest book, sharing and QR' }
                  : id === 'finder'
                  ? { kind: { type: 'tool' as const, tool: 'finder' }, title: 'Finder', subtitle: 'Everything in the studio' }
                  : { kind: { type: 'tool' as const, tool: id }, title: MOCK_TOOL_NAMES[id] ?? id, subtitle: 'Preview' };
          setWindows((c) => toggleWindow(c, spec, viewportRef.current).windows);
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
