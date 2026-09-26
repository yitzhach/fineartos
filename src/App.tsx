import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './print.css';
import { SystemBar } from './os/SystemBar';
import { Launcher } from './os/Launcher';
import type { LauncherEntry } from './os/launcher';
import { zoneRect } from './os/tiling';
import { enterFullscreen, exitFullscreen, isFullscreen, useFullscreen } from './os/fullscreen';
import { Dock } from './os/Dock';
import { Frame } from './os/Frame';
import { Desktop, type DesktopItem } from './os/Desktop';
import { TrashButton } from './os/TrashButton';
import type { ConnectTab } from './connect/ui/Connect';
import type { GuestEntry } from './connect/guestbook';
import { attachedIds, countPhrase, trashedIds } from './os/trash';
import { autoArrange, pruneLayout, trashPositionOf } from './os/desktopLayout';
import { BuildStamp } from './os/BuildStamp';
import { AppRail, type RailItem } from './os/AppRail';
import { MOCK_TOOL_NAMES } from './os/mock/names';
import { registerModule, registerPlannedModules } from './os/registry';
import { renderGroups, topZ, type WindowKind, type WindowState } from './os/windows';
import { openingWindows } from './os/startup';
import { isApplePlatform, keyNames, keyText, undoKeys } from './os/keys';
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
import type { ProjectTab } from './commission/ui/ProjectWindow';
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
import { mailtoForInvoice } from './invoice/mailto';
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
  sourceImageId,
  titleFromFileName,
  type Photo,
} from './photo/photo';
import type { Adjustments } from './photo/adjust';
import type { Framing } from './photo/crop';
import { milestonesOf } from './commission/milestones';
import { ComingUp } from './os/ComingUp';
import { addDays, comingUp } from './os/dashboard';
import { followUpsDue } from './clients/followUps';
import type { ImportedContact } from './clients/clients';
import { checklistProgress, noteTitle, type Pin } from './notes/notes';
import { allOwed } from './finance/owed';
import {
  addPiece,
  feeExpense,
  feeExpenseId,
  localToday,
  pickableShows,
  removePiece,
  whenIs,
  type Show,
} from './shows/shows';
import {
  awaitingReply,
  clientStatus,
  recordHandoff,
  messageFor,
  toldAbout,
  updatesFor,
  type ClientUpdate,
  type HandoffChannel,
} from './commission/updates';
import type { CardContext } from './commission/updateRender';
import { crossfadeSeconds, emptySlideshow, readySlides, secondsPerSlide } from './lib/slideshow';
import { SHIPPED_PHOTOGRAPHS } from './lib/photographs';
import { Repository, type StoredDocument } from './persistence/repository';
import { fullImageIdsKey, imageIdsKey, type StudioRecords } from './persistence/records';
import { onDbProblem, type DbProblem } from './persistence/db';
import { onAppUpdate } from './lib/appUpdate';
import { describeSaveState, unavailableCloud } from './persistence/sync';
import {
  BUNDLED_WALLPAPERS,
  loadRestoreWindows,
  loadWindows,
  type WallpaperChoice,
} from './lib/prefs';
import { usePrefs } from './app/usePrefs';
import {
  ArtworkWindow,
  QuickCapture,
  ClientsTool,
  NotesTool,
  Connect,
  ClientPreview,
  DocumentList,
  Editor,
  Finder,
  FolderWindow,
  InvoiceList,
  InvoiceView,
  MockToolWindow,
  PhotoWindow,
  PicturePreview,
  ProjectWindow,
  ShortcutSheet,
  TrashWindow,
  UpdatesPane,
  WallpaperSlides,
  FinanceWindow,
  ImageEditor,
  InvoiceEditor,
  Settings,
  ShowsWindow,
  isLoadFailure,
  warmTools,
} from './app/lazyTools';
import { useUndo } from './app/useUndo';
import { useObjectUrls } from './app/useObjectUrls';
import { useStudioData } from './app/useStudioData';
import { useWindows } from './app/useWindows';
import { useTrashActions, useTrashState } from './app/useTrash';
import { useLauncherEntries, useShellKeys } from './app/useShellKeys';

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

registerPlannedModules();
// New commission leads the dock: it is the thing done most often, and it was
// a tile marooned among the artist's own files before.
registerModule({ id: 'new', name: 'New', icon: 'new', available: true, group: 'tool' });
registerModule({ id: 'home', name: 'Home', icon: 'home', available: true, group: 'tool' });
registerModule({ id: 'commissions', name: 'Projects', icon: 'projects', available: true, group: 'tool' });
registerModule({ id: 'invoices', name: 'Invoices', icon: 'invoices', available: true, group: 'tool' });
registerModule({ id: 'finder', name: 'Finder', icon: 'finder', available: true, group: 'tool' });
registerModule({ id: 'connect', name: 'Connect', icon: 'connect', available: true, group: 'tool' });
registerModule({ id: 'artwork', name: 'Artwork', icon: 'artwork', available: true, group: 'tool' });
registerModule({ id: 'shows', name: 'Shows', icon: 'shows', available: true, group: 'tool' });
registerModule({ id: 'finance', name: 'Finance', icon: 'finance', available: true, group: 'tool' });
registerModule({ id: 'clients', name: 'Clients', icon: 'clients', available: true, group: 'tool' });
registerModule({ id: 'notes', name: 'Notes', icon: 'notes', available: true, group: 'tool' });
// Last in the dock, the way the Trash is always last.
registerModule({ id: 'trash', name: 'Trash', icon: 'trash', available: true, group: 'trash' });

/**
 * The shell. The state lives in hooks by concern — src/app/ — and the rules
 * in the model modules beside their tests. What is left here is wiring: the
 * actions that cross concerns, and drawing each window.
 */
export default function App() {
  const repo = useMemo(() => new Repository(WORKSPACE_ID), []);
  const [message, setMessage] = useState<string | null>(null);

  const {
    theme,
    setTheme,
    wallpaper,
    setWallpaper,
    wallpaperLibrary,
    setWallpaperLibrary,
    studio,
    setStudio,
    payment,
    setPayment,
    askForSignature,
    setAskForSignature,
    restoreWindowsOn,
    setRestoreWindowsOn,
    mileageRate,
    setMileageRate,
    siteUrl,
    setSiteUrl,
    desktopLayout,
    setDesktopLayout,
    trashPosition,
    setTrashPosition,
  } = usePrefs();

  const { undoLabel, pushUndoEntry, undoLast } = useUndo(setMessage);
  const trashState = useTrashState();
  const { trash, trashRef, hidden } = trashState;

  const data = useStudioData({
    repo,
    cloud,
    workspaceId: WORKSPACE_ID,
    hidden,
    onProblem: setMessage,
    onFirstRead: (records) => startWith(records),
  });
  const { loaded, rows, projects, invoices, photos, clientUpdates, expenses, shows, allUpdates, allShows, guests } = data;

  /**
   * The guest book hands back its whole list; only what changed is written.
   * A write that fails is said out loud — a signature lost quietly at a show
   * cannot be asked for again (rule 5).
   */
  const setGuests = async (next: GuestEntry[]) => {
    const before = new Map(guests.map((guest) => [guest.id, guest]));
    const after = new Set(next.map((guest) => guest.id));
    try {
      for (const guest of next) if (before.get(guest.id) !== guest) await data.saveGuest(guest);
      for (const id of before.keys()) if (!after.has(id)) await data.deleteGuest(id);
    } catch (cause) {
      setMessage(`The guest book could not be saved: ${String(cause)}. That entry is not kept — please take it again.`);
    }
  };

  const wm = useWindows({ loaded, restoreWindowsOn });
  const { windows, compact, viewport, desktopViewportRef, top, tray, frames, snapped, open } = wm;

  /**
   * First read of the studio: put back the windows that were open, now that
   * there is something to check them against — or, when nothing comes back,
   * open the newest commission so the app starts in work.
   */
  const startWith = (records: StudioRecords) => {
    const opening = openingWindows({
      restoreOn: loadRestoreWindows(),
      saved: loadWindows(),
      records,
      hidden: trashedIds(trashRef.current),
    });
    if (opening.kind === 'restore') wm.setWindows(opening.windows);
    else if (opening.kind === 'newest') {
      open({ type: 'commission', docId: opening.docId }, 'Commission Studio', opening.documentNumber);
    }
  };

  const [importingImages, setImportingImages] = useState(false);
  const [connectTab, setConnectTab] = useState<ConnectTab>('guestbook');
  const [connectPhotoId, setConnectPhotoId] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(84);
  /**
   * True once a newer build is being served. A tab left open at a show goes
   * on running the JavaScript it loaded, which looks exactly like a deploy
   * that did not happen. Never reloads on its own — see src/lib/appUpdate.ts.
   */
  const [updateReady, setUpdateReady] = useState(false);
  /**
   * The picture being looked at on its own, and the ones it can be stepped
   * through. Ids rather than photos, so a picture edited or deleted while the
   * preview is open does not leave a stale copy on screen.
   */
  const [preview, setPreview] = useState<{ ids: string[]; index: number } | null>(null);
  /** Read by the tab shortcuts, which must not fight the preview's arrows. */
  const previewOpenRef = useRef(false);
  /** Set when the database cannot be opened — never left silent. */
  const [dbProblem, setDbProblem] = useState<DbProblem | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectTabs, setProjectTabs] = useState<Record<string, ProjectTab>>({});
  /** A stage just ticked off, offered to the Client tab as a started update. */
  const [updateSeed, setUpdateSeed] = useState<{ docId: string; milestoneId: string } | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  /** A show chosen in the search box, for the Shows window to select. */
  const [showFocus, setShowFocus] = useState<{ id: string } | null>(null);
  const [clientFocus, setClientFocus] = useState<{ id: string } | null>(null);
  const [noteFocus, setNoteFocus] = useState<{ id: string } | { newPin: Pin | null } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const addImagesRef = useRef<HTMLInputElement>(null);
  const fullscreen = useFullscreen();

  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  /** ⌘ and ⌥ on a Mac or an iPad; Ctrl and Alt everywhere else. */
  const apple = useMemo(
    () => typeof navigator !== 'undefined' && isApplePlatform(navigator.userAgent),
    [],
  );
  const keys = keyNames(apple);

  useEffect(() => onDbProblem(setDbProblem), []);
  useEffect(() => onAppUpdate(() => setUpdateReady(true)), []);
  useEffect(() => warmTools(), []);
  // A part of the app fetched on demand (import, export, a download) that
  // fails to arrive must say so, not do nothing (rule 5).
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isLoadFailure(event.reason)) {
        setMessage('That part of the app could not load. Check the connection, then reload the page.');
      }
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);
  useEffect(() => {
    previewOpenRef.current = preview !== null;
  }, [preview]);

  // --- Images -------------------------------------------------------------

  /**
   * Object URLs for every image any open window might show, and for every
   * picture in the wallpaper library, so the picker can show thumbnails and
   * the desktop can show the chosen one from the same map.
   */
  const neededImageIds = useMemo(
    () => imageIdsKey({ documents: rows, projects, photos, expenses }),
    [rows, projects, photos, expenses],
  );
  // Lists, the desktop and the catalogue draw the small copy; only what is
  // open at full size loads the original.
  const imageUrls = useObjectUrls(repo, neededImageIds, true);
  const fullIds = useMemo(() => {
    const photoIds: string[] = [];
    const docIds: string[] = [];
    for (const win of windows) {
      if (win.kind.type === 'photo' || win.kind.type === 'photoEdit') photoIds.push(win.kind.photoId);
      if (win.kind.type === 'commission') docIds.push(win.kind.docId);
    }
    if (preview) {
      for (const step of [-1, 0, 1]) {
        const id = preview.ids[(preview.index + step + preview.ids.length) % preview.ids.length];
        if (id) photoIds.push(id);
      }
    }
    return fullImageIdsKey({ photos, documents: rows, photoIds, docIds });
  }, [windows, preview, photos, rows]);
  const fullUrls = useObjectUrls(repo, fullIds);
  /** The original where it is loaded, else the thumbnail until it is. */
  const bigUrls = useMemo(() => ({ ...imageUrls, ...fullUrls }), [imageUrls, fullUrls]);
  const libraryIds = useMemo(
    () => wallpaperLibrary.map((w) => w.imageId).sort().join(','),
    [wallpaperLibrary],
  );
  const wallpaperUrls = useObjectUrls(repo, libraryIds);

  // --- Saving -------------------------------------------------------------

  const save = data.saveDocument;
  const saveInvoiceRecord = data.saveInvoice;
  const saveProjectRecord = data.saveProject;
  const savePhotoRecord = data.savePhoto;

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
      await data.deleteProject(folder.id);
    } else if (folder) {
      await repo.saveProject(removeFromProject(folder, id));
    }
    for (const updateId of attachedIds([id], await repo.listUpdates())) {
      await repo.deleteUpdate(updateId);
    }
    await repo.deleteDocument(id);
    wm.closeWindowsFor([id]);
    await data.reload();
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
    // A folder looks like a folder. What is filed inside it is shown when it
    // is opened, not painted onto its icon — the way a desktop has always
    // worked, and the only way "take it out again" can leave no trace.
    let project = createProject(projectNameFor(doc), doc.client.name || null);
    project = addDocumentToProject(project, doc.id);
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
      return image ? (await import('./invoice/download')).blobToDataUrl(image.blob) : null;
    },
    [repo],
  );

  const exportInvoice = async (invoice: Invoice, format: 'html' | 'jpeg' | 'png' | 'copy') => {
    try {
      const { copyInvoiceHtml, downloadInvoiceHtml, downloadInvoiceImage } = await import('./invoice/download');
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

  const downloadJson = (value: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (doc: CommissionDocument) => {
    const { exportDocument } = await import('./persistence/portable');
    const carried = allUpdates.filter((update) => update.documentId === doc.id);
    downloadJson(exportDocument(doc, carried), `${doc.documentNumber}.json`);
    setMessage(
      carried.length > 0
        ? `Exported as JSON, with ${carried.length === 1 ? '1 client update' : `${carried.length} client updates`}. Images are not in the file; they stay on this device.`
        : 'Exported as JSON. Images are not in the file; they stay on this device.',
    );
  };

  const handleImport = async (file: File) => {
    const { importDocumentFromText } = await import('./persistence/portable');
    const result = importDocumentFromText(
      await file.text(),
      Object.keys(imageUrls),
      photos.map((photo) => photo.id),
    );
    if (!result.ok) {
      setMessage(`Import refused: ${result.errors.join(' ')}`);
      return;
    }
    await save(result.document);
    for (const update of result.updates) await data.saveUpdate(update);
    open(
      { type: 'commission', docId: result.document.id },
      'Commission Studio',
      result.document.documentNumber,
    );
    // Every gap is named. An import that looked whole and was not would be
    // discovered months later, in front of the client.
    const gaps = [
      result.updates.length > 0
        ? `${result.updates.length === 1 ? '1 client update' : `${result.updates.length} client updates`} came with it`
        : null,
      result.missingImageIds.length > 0
        ? `${result.missingImageIds.length} referenced image(s) are not on this device`
        : null,
      result.missingPhotoIds.length > 0
        ? `${result.missingPhotoIds.length} picture(s) an update refers to are not here`
        : null,
    ].filter(Boolean);
    setMessage(gaps.length > 0 ? `Imported. ${gaps.join('. ')}.` : 'Imported.');
  };

  // --- Shows, as a file ---------------------------------------------------

  const handleExportShows = async () => {
    const { exportShows } = await import('./persistence/portable');
    downloadJson(exportShows(shows), `shows-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage(
      shows.length === 0
        ? 'Exported. There are no shows yet, and the file says so.'
        : 'Shows exported. The pictures are not in the file; booth fees travel in the books file.',
    );
  };

  const handleImportShows = async (file: File) => {
    const { importShowsFromText, newShows } = await import('./persistence/portable');
    const result = importShowsFromText(await file.text(), photos.map((photo) => photo.id));
    if (!result.ok) {
      setMessage(`Import refused: ${result.errors.join(' ')}`);
      return;
    }
    const incoming = newShows(result.shows, allShows);
    try {
      for (const show of incoming) {
        await repo.saveShow(show);
        // An accepted show whose fee row is not here yet gets it back.
        const row = feeExpense(show, null, localToday());
        if (row && !expenses.some((one) => one.id === row.id)) await repo.saveExpense(row);
      }
    } catch (cause) {
      setMessage(`The shows could not all be read in: ${String(cause)}`);
      await data.reload();
      return;
    }
    await data.reload();
    const already = result.shows.length - incoming.length;
    const parts = [
      `${incoming.length === 1 ? '1 show' : `${incoming.length} shows`} added`,
      already > 0 ? `${already} already here and left alone` : null,
      result.missingPieceIds.length > 0
        ? `${result.missingPieceIds.length} piece(s) they list are not on this device`
        : null,
    ].filter(Boolean);
    setMessage(`${parts.join('. ')}.`);
  };

  // --- The books, as a file ------------------------------------------------

  const handleExportExpenses = async () => {
    const { exportExpenses } = await import('./persistence/portable');
    downloadJson(exportExpenses(expenses), `books-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage(
      expenses.length === 0
        ? 'Exported. There is nothing in the books yet, and the file says so.'
        : 'Books exported. Receipt photographs are not in the file; they stay on this device.',
    );
  };

  const handleImportExpenses = async (file: File) => {
    const { importExpensesFromText, newExpenses } = await import('./persistence/portable');
    const result = importExpensesFromText(await file.text(), Object.keys(imageUrls));
    if (!result.ok) {
      setMessage(`Import refused: ${result.errors.join(' ')}`);
      return;
    }
    const incoming = newExpenses(result.expenses, expenses);
    for (const expense of incoming) await repo.saveExpense(expense);
    await data.reload();
    const already = result.expenses.length - incoming.length;
    const parts = [
      `${incoming.length === 1 ? '1 row' : `${incoming.length} rows`} added`,
      already > 0 ? `${already} already here and left alone` : null,
      result.missingImageIds.length > 0
        ? `${result.missingImageIds.length} receipt photograph(s) are not on this device`
        : null,
    ].filter(Boolean);
    setMessage(`${parts.join('. ')}.`);
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

  /** The name of anything on the desktop, for an undo label. */
  const nameOf = (id: string): string => {
    const project = projects.find((p) => p.id === id);
    if (project) return project.name;
    const photo = photos.find((p) => p.id === id);
    if (photo) return photo.title;
    const invoice = invoices.find((i) => i.id === id);
    if (invoice) return invoice.invoiceNumber;
    const doc = docById(id);
    return doc ? doc.title.trim() || doc.documentNumber : 'item';
  };

  const handleMoveIcon = (id: string, position: { x: number; y: number }) => {
    setDesktopLayout((current) => {
      // The position it had before, so Cmd+Z can put it back exactly — including
      // "nowhere yet", which means the icon goes back to being auto-placed.
      const before = current[id];
      pushUndoEntry(`Move “${nameOf(id)}”`, () =>
        setDesktopLayout((now) => {
          if (!before) {
            const { [id]: _undone, ...rest } = now;
            return rest;
          }
          return { ...now, [id]: before };
        }),
      );
      return { ...current, [id]: position };
    });
  };

  const handleTidy = () => {
    const surface = desktopViewportRef.current;
    // The whole arrangement, kept whole: a tidy moves everything, so undoing
    // it has to put everything back, not just the last icon.
    const before = desktopLayout;
    pushUndoEntry('Tidy up', () => setDesktopLayout(before));
    setDesktopLayout(
      autoArrange(desktopItems.map((item) => item.id), surface, [
        // Wherever the can is now, the tidy leaves room for it.
        trashPositionOf(trashPosition, surface),
      ]),
    );
    setMessage(`Desktop tidied up. ${undoKeys(apple)} puts it back.`);
  };

  const handleNewFolder = async () => {
    const taken = new Set(projects.map((p) => p.name));
    let name = 'New folder';
    for (let n = 2; taken.has(name); n += 1) name = `New folder ${n}`;
    const folder = createProject(name, null);
    await saveProjectRecord(folder);
    // Undoing a brand new folder removes it. It is empty by definition, so
    // nothing can be lost by doing so.
    pushUndoEntry(`New folder “${name}”`, () => data.deleteProject(folder.id));
    setMessage(`“${name}” is on your desktop. Drag files onto it, or rename it inside.`);
  };

  /**
   * Drag a file onto a folder — or pick the folder from the Finder, or undo
   * a "take out".
   *
   * Everything here is read from storage rather than from React state on
   * purpose: an undo runs from a closure made before the last refresh, and
   * filing against a stale copy of the folders silently did nothing at all.
   */
  const handleFileInto = async (folderId: string, itemId: string, quiet = false) => {
    const folders = await repo.listProjects();
    const folder = folders.find((p) => p.id === folderId);
    // Never a folder into a folder, and never a folder into itself.
    if (!folder || folder.id === itemId || folders.some((p) => p.id === itemId)) return;

    // Out of whatever folder it was in first, so it is never in two at once.
    const previous = folders.find(
      (p) => p.id !== folderId && projectItemIds(p).includes(itemId),
    );
    if (previous) await saveProjectRecord(removeFromProject(previous, itemId));

    const [storedPhoto, storedInvoice] = await Promise.all([
      repo.loadPhoto(itemId),
      repo.loadInvoice(itemId),
    ]);
    const next = storedPhoto
      ? addPhotoToProject(folder, itemId)
      : storedInvoice
        ? addInvoiceToProject(folder, itemId)
        : addDocumentToProject(folder, itemId);

    await saveProjectRecord(next);

    // The icon has gone into the folder, so its old spot is meaningless —
    // but it is remembered, so undoing puts it back where it was sitting.
    const spot = desktopLayout[itemId];
    setDesktopLayout((current) => {
      const { [itemId]: _gone, ...rest } = current;
      return rest;
    });

    if (!quiet) {
      pushUndoEntry(`File “${nameOf(itemId)}” into ${folder.name}`, async () => {
        await handleTakeOut(itemId, true);
        if (previous) await handleFileInto(previous.id, itemId, true);
        else if (spot) setDesktopLayout((current) => ({ ...current, [itemId]: spot }));
      });
      setMessage(`Filed into “${folder.name}”. ${undoKeys(apple)} undoes it.`);
    }
  };

  // --- Pictures -------------------------------------------------------------


  /**
   * Brings pictures in from the Add images square, from a file picker or a
   * drop. Each one is resized and re-encoded before it is stored — a modern
   * phone photo is 4 MB and there is no reason to keep every pixel of it.
   *
   * A file that cannot be read stops that file, not the batch: dropping ten
   * pictures and losing nine because the third was a PDF would be worse than
   * saying which one failed.
   */
  const handleImportPhotos = async (
    files: FileList | File[],
    folderId?: string,
    markCurrentShow = false,
  ) => {
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
        // 2560 on the longest edge, the same as a desktop picture: enough
        // for a print and small enough to keep the app quick.
        const prepared = await prepareWallpaper(file, 2560);
        const imageId = newId();
        await repo.putImage(imageId, prepared.blob);
        let photo = createPhoto({
          imageId,
          title: titleFromFileName(file.name),
          pixelWidth: prepared.width,
          pixelHeight: prepared.height,
        });
        // Dropped onto the current-show picker, a picture is in that show.
        // Nothing else is assumed: its price and status stay unstated.
        if (markCurrentShow) photo = editPhoto(photo, { inCurrentShow: true });
        await repo.savePhoto(photo);
        if (folder) folder = addPhotoToProject(folder, photo.id);
        added += 1;
      } catch (cause) {
        failed.push(file.name);
        // eslint-disable-next-line no-console
        console.warn('Could not add image', file.name, cause);
      }
    }

    if (folder) await repo.saveProject(folder);
    await data.reload();
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

  const { trashAttached, handleTrash, handlePutBack, handleDeleteForever, handleEmptyTrash } =
    useTrashActions({
      repo,
      trashState,
      rows,
      projects,
      invoices,
      photos,
      shows,
      notes: data.notes,
      allUpdates,
      allShows,
      expenses,
      reload: data.reload,
      wallpaperLibrary,
      closeWindowsFor: wm.closeWindowsFor,
      pushUndoEntry,
      say: setMessage,
      selectedId,
      setSelectedId,
    });

  /**
   * A folder's picture, if it ever had one, belonged to something inside it.
   * When that leaves, the picture goes with it — otherwise a folder keeps
   * wearing the face of a photograph that is no longer in it. Folders made by
   * an older version of this app are cleaned up by the same rule.
   */
  const clearCoverFrom = async (folder: Project, itemId: string): Promise<Project> => {
    if (!folder.coverImageId) return folder;
    const owned = new Set<string>();
    const [photo, stored] = await Promise.all([repo.loadPhoto(itemId), repo.load(itemId)]);
    if (photo) owned.add(photo.imageId);
    for (const id of stored?.document.artwork.referenceImageIds ?? []) owned.add(id);
    return owned.has(folder.coverImageId) ? setProjectCover(folder, null) : folder;
  };

  const handleTakeOut = async (itemId: string, quiet = false) => {
    // Read from storage, not from state: this also runs as an undo. See
    // handleFileInto.
    const folders = await repo.listProjects();
    const folder = folders.find((p) => projectItemIds(p).includes(itemId));
    if (!folder) return;
    await saveProjectRecord(await clearCoverFrom(removeFromProject(folder, itemId), itemId));
    if (!quiet) {
      pushUndoEntry(`Take “${nameOf(itemId)}” out of ${folder.name}`, () =>
        handleFileInto(folder.id, itemId, true),
      );
      setMessage('Moved back to the desktop. Nothing was deleted.');
    }
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

  const openEditor = (id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (photo) open({ type: 'photoEdit', photoId: id }, photo.title, 'Editing');
  };

  /**
   * The pictures a preview steps through: the ones filed in the same folder
   * when this picture is filed, and everything in the studio when it is not.
   * A folder is the set the artist made on purpose, so it beats the pile.
   */
  const previewSetFor = (photoId: string): string[] => {
    const folder = projects.find((project) => (project.imageIds ?? []).includes(photoId));
    const ids = folder
      ? (folder.imageIds ?? []).filter((id) => photos.some((photo) => photo.id === id))
      : photos.map((photo) => photo.id);
    return ids.length > 0 ? ids : [photoId];
  };

  /**
   * `within` is the list the arrows should walk — what the catalogue is
   * actually showing, when that is where the click came from. Stepping
   * through a different order from the one on screen is disorienting.
   */
  const openPreview = (photoId: string, within?: string[]) => {
    const ids = within && within.length > 0 ? within : previewSetFor(photoId);
    setPreview({ ids, index: Math.max(0, ids.indexOf(photoId)) });
  };

  // --- The books ------------------------------------------------------------

  const saveExpenseRecord = data.saveExpense;

  // --- Shows ----------------------------------------------------------------

  /** Saves a show and keeps its booth-fee row in the books in step. */
  const saveShowRecord = async (show: Show) => {
    try {
      await data.saveShow(show);
      const existing = expenses.find((row) => row.id === feeExpenseId(show.id)) ?? null;
      const row = feeExpense(show, existing, localToday());
      if (row) await data.saveExpense(row);
      else if (existing) await data.deleteExpense(existing.id);
    } catch (cause) {
      setMessage(`The show could not be saved: ${String(cause)}`);
      // Whatever did get written is what the screen should show.
      await data.reload();
    }
  };

  /** A piece on or off a show; its location in Artwork follows. */
  const toggleShowPiece = async (show: Show, photo: Photo) => {
    const result = show.pieceIds.includes(photo.id)
      ? removePiece(show, photo, shows)
      : addPiece(show, photo);
    try {
      await data.saveShow(result.show);
      if (result.location !== undefined) await savePhotoRecord(editPhoto(photo, { location: result.location }));
    } catch (cause) {
      setMessage(`The piece could not be moved: ${String(cause)}`);
      await data.reload();
    }
  };

  const deleteExpenseRecord = async (id: string) => {
    await data.deleteExpense(id);
    setMessage('Row removed.');
  };

  /**
   * Receipts, resized like every other picture the app stores. A photograph
   * of a petrol receipt off a phone is four megabytes of paper.
   */
  const addReceipts = async (files: File[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const file of files) {
      try {
        const prepared = await prepareWallpaper(file, 1600);
        const imageId = newId();
        await repo.putImage(imageId, prepared.blob);
        ids.push(imageId);
      } catch (cause) {
        // eslint-disable-next-line no-console
        console.warn('Could not read that receipt', file.name, cause);
        setMessage(`${file.name} could not be read as an image.`);
      }
    }
    return ids;
  };

  // --- Client updates -------------------------------------------------------

  const saveClientUpdate = data.saveUpdate;

  const deleteClientUpdate = async (id: string) => {
    await data.deleteUpdate(id);
    setMessage('Update removed. What was already handed over is still out there.');
  };

  /**
   * Renders an update and hands it over, then records that it was handed over
   * — not that it was sent, which this app cannot know and never claims.
   */
  const handOverUpdate = async (
    doc: CommissionDocument,
    update: ClientUpdate,
    channel: HandoffChannel,
  ) => {
    const context: CardContext = {
      studioName: doc.studio.name || null,
      studioEmail: doc.studio.email || null,
      clientName: doc.client.name || null,
      title: doc.title || null,
      documentNumber: doc.documentNumber || null,
      date: new Date().toISOString().slice(0, 10),
      stage:
        milestonesOf(doc).find((milestone) => milestone.id === update.milestoneId)?.label ?? null,
    };
    const chosen = update.photoIds
      .map((id) => photos.find((photo) => photo.id === id))
      .filter((photo): photo is Photo => Boolean(photo));
    // The card is drawn from the originals, not the thumbnails the lists use.
    const originals = await Promise.all(chosen.map((photo) => repo.getImage(photo.imageId)));
    const urls = originals
      .map((image) => (image ? URL.createObjectURL(image.blob) : null))
      .filter((url): url is string => Boolean(url));
    setTimeout(() => urls.forEach((url) => URL.revokeObjectURL(url)), 60_000);
    const message = messageFor(update, {
      studioName: doc.studio.name || null,
      clientName: doc.client.name || null,
      title: doc.title || null,
    });

    try {
      const { downloadUpdateCard, downloadUpdatePage, printUpdatePage, shareUpdateCard } = await import(
        './commission/updateDownload'
      );
      if (channel === 'jpeg') {
        await downloadUpdateCard(update, context, urls);
        setMessage('Saved as a picture. Attach it to a text or an email — it is yours to send.');
      } else if (channel === 'page' || channel === 'pdf') {
        const blobs = await Promise.all(
          chosen.map(async (photo) => ({
            blob: (await repo.getImage(photo.imageId))?.blob ?? null,
            title: photo.title,
          })),
        );
        if (channel === 'page') {
          await downloadUpdatePage(update, context, blobs);
          setMessage('Saved as one page, pictures and all. It opens anywhere, with or without a network.');
        } else {
          const result = await printUpdatePage(update, context, blobs);
          if (result === 'unsupported') {
            setMessage('This browser cannot print from here — Save as a page and print that instead.');
            return;
          }
          setMessage('Your print dialog is open. Choose Save as PDF to keep a copy.');
        }
      } else if (channel === 'copy') {
        await navigator.clipboard?.writeText(message);
        setMessage('Message copied. Paste it wherever you talk to this client.');
      } else if (channel === 'share') {
        const result = await shareUpdateCard(update, context, urls, message);
        if (result === 'unsupported') {
          setMessage('This browser has no share sheet — Save as a picture and attach it.');
          return;
        }
        if (result === 'cancelled') return;
        setMessage('Handed to your phone’s share sheet.');
      }
    } catch (cause) {
      // eslint-disable-next-line no-console
      console.warn('Could not hand the update over', cause);
      setMessage('That could not be prepared. Nothing was recorded.');
      return;
    }

    await saveClientUpdate(recordHandoff(update, channel));
  };

  /**
   * An edit saved over what the studio shows.
   *
   * The photograph itself is kept as a second blob and the numbers are stored
   * on the record, so the edit can be reopened, changed or undone, and the
   * editor always starts from the photograph rather than from the last edit.
   * Everything else in the app goes on reading `imageId` and knows nothing
   * about any of this.
   */
  const savePhotoEdit = async (
    photo: Photo,
    blob: Blob,
    adjustments: Adjustments,
    framing: Framing,
    size: { width: number; height: number },
  ) => {
    const original = sourceImageId(photo);
    const rendered = newId();
    await repo.putImage(rendered, blob);
    // The blob this replaces was itself an edit; only the photograph is kept.
    if (photo.imageId !== original) await repo.deleteImage(photo.imageId);
    await savePhotoRecord(
      editPhoto(photo, {
        imageId: rendered,
        originalImageId: original,
        edit: adjustments,
        framing,
        pixelWidth: size.width,
        pixelHeight: size.height,
      }),
    );
    setMessage('Edit saved. The photograph underneath it is kept — Back to the photograph undoes this.');
  };

  /** Puts the photograph back on show and forgets the numbers. */
  const revertPhotoEdit = async (photo: Photo) => {
    const original = sourceImageId(photo);
    if (photo.imageId !== original) await repo.deleteImage(photo.imageId);
    await savePhotoRecord(
      editPhoto(photo, { imageId: original, originalImageId: null, edit: null, framing: null }),
    );
    setMessage('Back to the photograph as it came in.');
  };

  /**
   * An edit saved as a second picture. The original is never written over: an
   * edit is an opinion, and the photograph under it is the only copy there is.
   */
  const savePhotoCopy = async (source: Photo, blob: Blob, changes: string[]) => {
    const imageId = newId();
    await repo.putImage(imageId, blob);
    const size = await imageSize(blob);
    let copy = createPhoto({
      imageId,
      title: `${source.title} (edited)`,
      pixelWidth: size?.width ?? source.pixelWidth,
      pixelHeight: size?.height ?? source.pixelHeight,
    });
    // Everything the artist recorded about the work carries over — it is the
    // same piece — but the note says plainly what this copy is.
    copy = editPhoto(copy, {
      widthIn: source.widthIn,
      heightIn: source.heightIn,
      medium: source.medium,
      year: source.year,
      price: source.price,
      currency: source.currency,
      note: [`Edited from “${source.title}”.`, changes.join(', ')].filter(Boolean).join(' '),
    });
    await savePhotoRecord(copy);
    setMessage(`Saved as “${copy.title}”. The original is untouched.`);
    // Opened from the record in hand: `photos` in this closure is the list as
    // it was before the copy existed, so looking it up there finds nothing.
    open({ type: 'photo', photoId: copy.id }, copy.title, 'Picture');
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

  // --- Tools, tiling and the search box -----------------------------------

  const hasFocused = top !== null;

  /** What a tool's window is called and shows, by dock id. */
  const toolSpec = (id: string): { kind: WindowKind; title: string; subtitle: string } => {
    switch (id) {
      case 'invoices':
        return { kind: { type: 'tool', tool: 'invoices-list' }, title: 'Invoices', subtitle: 'All invoices' };
      case 'commissions':
        return { kind: { type: 'list' }, title: 'Projects', subtitle: 'All commissions' };
      case 'trash':
        return { kind: { type: 'tool', tool: 'trash' }, title: 'Trash', subtitle: 'Nothing here is deleted yet' };
      case 'connect':
        return { kind: { type: 'tool', tool: 'connect' }, title: 'Connect', subtitle: 'Guest book, sharing and QR' };
      case 'finder':
        return { kind: { type: 'tool', tool: 'finder' }, title: 'Finder', subtitle: 'Everything in the studio' };
      case 'artwork':
        return { kind: { type: 'tool', tool: 'artwork' }, title: 'Artwork', subtitle: 'The catalogue' };
      case 'finance':
        return { kind: { type: 'tool', tool: 'finance' }, title: 'Finance', subtitle: 'The books' };
      case 'shows':
        return { kind: { type: 'tool', tool: 'shows' }, title: 'Shows', subtitle: 'Fairs, openings and markets' };
      case 'clients':
        return { kind: { type: 'tool', tool: 'clients' }, title: 'Clients', subtitle: 'Everyone, from every record' };
      case 'notes':
        return { kind: { type: 'tool', tool: 'notes' }, title: 'Notes', subtitle: 'Notes and checklists' };
      default:
        return { kind: { type: 'tool', tool: id }, title: MOCK_TOOL_NAMES[id] ?? id, subtitle: 'Preview' };
    }
  };


  const showDesktop = wm.showDesktop;

  /**
   * Opens a tool, or brings it forward. Unlike a dock button this never puts
   * the tool away: asking for something by name means wanting to see it.
   */
  const openTool = (id: string) => {
    if (id === 'home') return showDesktop();
    if (id === 'settings') return open({ type: 'settings' }, 'Settings', null);
    const spec = toolSpec(id);
    open(spec.kind, spec.title, spec.subtitle);
  };


  const shell = useShellKeys({
    previewOpenRef,
    windowsRef: wm.windowsRef,
    focusTab: wm.focusTab,
    openTool,
    snapFront: wm.snapFront,
  });

  // --- Clients and notes ----------------------------------------------------
  // The tools themselves build every person from the records (app/PeopleTools,
  // loaded on open). The shell keeps only what the search box and Coming up
  // need, read off the stored notes and profiles.

  const openClients = (id?: string) => {
    if (id) setClientFocus({ id });
    open({ type: 'tool', tool: 'clients' }, 'Clients', 'Everyone, from every record');
  };
  const openNotes = (focus?: { id: string } | { newPin: Pin | null }) => {
    if (focus) setNoteFocus(focus);
    open({ type: 'tool', tool: 'notes' }, 'Notes', 'Notes and checklists');
  };

  const openPin = (pin: Pin) => {
    if (pin.kind === 'client') openClients(pin.id);
    else if (pin.kind === 'commission') openDocumentWindow(pin.id);
    else if (pin.kind === 'invoice') openInvoiceWindow(pin.id);
    else if (pin.kind === 'photo') openPhotoWindow(pin.id);
    else if (pin.kind === 'show') {
      setShowFocus({ id: pin.id });
      openTool('shows');
    } else {
      const project = projects.find((p) => p.id === pin.id);
      if (project) open({ type: 'folder', projectId: pin.id }, project.name, 'Project folder');
    }
  };

  const peopleRecords = {
    rows,
    invoices,
    guests,
    contacts: data.contacts,
    profiles: data.profiles,
    notes: data.notes,
    shows,
    projects,
    photos,
  };
  const peopleActions = {
    saveProfile: data.saveProfile,
    deleteProfile: data.deleteProfile,
    saveNote: data.saveNote,
    saveContacts: data.saveContacts,
    reload: data.reload,
    trash: (id: string) => void handleTrash(id),
    say: setMessage,
    openPin,
    openGuestBook: () => openConnect('guestbook'),
    openNotes,
  };

  // Quick capture, for a phone: each lands where it belongs and says so.
  const captureReceipt = async (files: File[]) => {
    setCapturing(false);
    const ids = await addReceipts(files);
    if (ids.length === 0) return;
    const { createExpense, emptyExpenseDraft } = await import('./finance/ledger');
    const row = createExpense(
      { ...emptyExpenseDraft(localToday()), category: 'other', what: 'Receipt — say what it was', receiptImageIds: ids },
      { amount: null, ratePerMile: null },
    );
    try {
      await data.saveExpense(row);
      setMessage('Receipt kept in the books with no amount yet. Open Finance to say what it was and what it cost.');
    } catch (cause) {
      setMessage(`The receipt could not be saved: ${String(cause)}`);
    }
  };
  const capturePiece = async (files: File[]) => {
    setCapturing(false);
    await handleImportPhotos(files);
    openTool('artwork');
  };
  const captureContact = async (contact: ImportedContact) => {
    setCapturing(false);
    try {
      await data.saveContacts([contact]);
      setMessage(`${contact.name || contact.email || contact.phone} is in Clients.`);
    } catch (cause) {
      setMessage(`The contact could not be saved: ${String(cause)}`);
    }
  };

  const launcherNotes = useMemo(
    () =>
      data.notes.map((note) => ({
        id: note.id,
        title: noteTitle(note),
        hint: ['Note', checklistProgress(note)].filter(Boolean).join(' · '),
        words: [note.text, ...note.checklist.map((i) => i.text)].join(' ').slice(0, 400),
      })),
    [data.notes],
  );
  const launcherPeople = useMemo(
    () =>
      data.profiles.map((p) => ({
        id: p.id,
        name: p.name || p.label || 'A client',
        hint: p.tags.join(', ') || 'Client',
        words: [...p.tags, p.note ?? ''].join(' ').slice(0, 400),
      })),
    [data.profiles],
  );

  const launcherEntries = useLauncherEntries(
    {
      frames: frames.length,
      hasFocused,
      compact,
      undoLabel,
      theme,
      fullscreen: fullscreen.supported ? (fullscreen.active ? 'on' : 'off') : 'unsupported',
      autoTile: wm.autoTile,
      snapped,
      mac: apple,
    },
    { documents: rows, invoices, projects, photos, shows, guests, notes: launcherNotes, people: launcherPeople },
  );

  const toggleFullscreen = async () => {
    try {
      if (isFullscreen()) await exitFullscreen();
      else await enterFullscreen();
    } catch {
      setMessage('This browser refused to go fullscreen.');
    }
  };

  /** Something chosen from the search box. */
  const onLaunch = (entry: LauncherEntry) => {
    const at = entry.id.indexOf(':');
    const kind = entry.id.slice(0, at);
    const ref = entry.id.slice(at + 1);
    if (kind === 'tool') openTool(ref);
    else if (kind === 'action') runAction(ref);
    else if (kind === 'commission') openDocumentWindow(ref);
    else if (kind === 'invoice') openInvoiceWindow(ref);
    else if (kind === 'photo') openPhotoWindow(ref);
    else if (kind === 'folder') {
      const project = projects.find((p) => p.id === ref);
      if (project) open({ type: 'folder', projectId: ref }, project.name, 'Project folder');
    } else if (kind === 'show') {
      setShowFocus({ id: ref });
      openTool('shows');
    } else if (kind === 'guest') openConnect('guestbook');
    else if (kind === 'note') openNotes({ id: ref });
    else if (kind === 'client') openClients(ref);
  };

  const runAction = (id: string) => {
    switch (id) {
      case 'new-commission':
        return void handleNew();
      case 'new-invoice':
        return void makeInvoice(null, null);
      case 'new-folder':
        return void handleNewFolder();
      case 'quick-capture':
        return setCapturing(true);
      case 'add-images':
        return addImagesRef.current?.click();
      case 'guest-book':
        return openConnect('guestbook');
      case 'qr':
        return openConnect('qr');
      case 'send-picture':
        return openConnect('send');
      case 'tidy':
        return handleTidy();
      case 'wallpaper':
        return open({ type: 'settings' }, 'Settings', null);
      case 'undo':
        return void undoLast();
      case 'theme':
        return setTheme(theme === 'dark' ? 'light' : 'dark');
      case 'fullscreen':
        return void toggleFullscreen();
      case 'shortcuts':
        return shell.openShortcuts();
      case 'tile-columns':
        return wm.tile('columns');
      case 'tile-grid':
        return wm.tile('grid');
      case 'tile-main':
        return wm.tile('main');
      case 'tile-rows':
        return wm.tile('rows');
      case 'cascade':
        return wm.cascade();
      case 'untile':
        return wm.untile();
      case 'merge':
        wm.merge();
        return setMessage('Windows merged into tabs. ⧉ on a tab moves it back out.');
      case 'snap-left':
        return wm.snapFrontTo('left');
      case 'snap-right':
        return wm.snapFrontTo('right');
      case 'snap-fill':
        return wm.snapFrontTo('fill');
      case 'auto-tile':
        return wm.setAutoTile(!wm.autoTile);
      default:
        return undefined;
    }
  };

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
          <button className="btn" onClick={() => openPreview(photo.id)}>
            Preview
          </button>
          <button className="btn" onClick={() => openEditor(photo.id)}>
            Edit
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

    if (kind.type === 'tool' && kind.tool === 'shows') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          The events. Pieces taken read "At a show" in Artwork; accepted booth fees go in the books.
        </span>
      );
    }

    if (kind.type === 'tool' && kind.tool === 'clients') {
      return <ClientsTool records={peopleRecords} actions={peopleActions} focus={clientFocus} />;
    }

    if (kind.type === 'tool' && kind.tool === 'notes') {
      return <NotesTool records={peopleRecords} actions={peopleActions} focus={noteFocus} />;
    }

    if (kind.type === 'tool' && kind.tool === 'artwork') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          Every picture in the studio. Edits here are the same records the desktop shows.
        </span>
      );
    }

    if (kind.type === 'tool' && kind.tool === 'finance') {
      return (
        <span className="faint" style={{ fontSize: 12 }}>
          Your own records, for your accountant. Nothing here is tax advice.
        </span>
      );
    }

    if (kind.type === 'photoEdit') {
      const photo = photos.find((p) => p.id === kind.photoId);
      return (
        <>
          {photo && (
            <button className="btn" onClick={() => openPreview(photo.id)}>
              Preview
            </button>
          )}
          <span className="faint" style={{ fontSize: 12 }}>
            The photograph is kept underneath — an edit can be undone at any point.
          </span>
        </>
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
          toldAboutMilestoneIds={milestonesOf(doc)
            .filter((stage) => toldAbout(updatesFor(clientUpdates, doc.id), stage.id))
            .map((stage) => stage.id)}
          onTellClient={(milestoneId) => {
            setProjectTabs((s) => ({ ...s, [doc.id]: 'updates' }));
            setUpdateSeed({ docId: doc.id, milestoneId });
          }}
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
          updatesWaiting={awaitingReply(updatesFor(clientUpdates, doc.id)).length}
          clientStatus={clientStatus(updatesFor(clientUpdates, doc.id))}
          updatesSlot={
            <UpdatesPane
              doc={doc}
              updates={clientUpdates}
              photos={photos}
              imageUrls={imageUrls}
              invoices={forDoc.map((invoice) => ({
                id: invoice.id,
                number: invoice.invoiceNumber,
                issuedAt: invoice.issuedAt,
              }))}
              onSave={(update) => void saveClientUpdate(update)}
              onDelete={(id) => void deleteClientUpdate(id)}
              onHandoff={(update, channel) => handOverUpdate(doc, update, channel)}
              seedMilestoneId={updateSeed?.docId === doc.id ? updateSeed.milestoneId : null}
              onSeedUsed={() => setUpdateSeed(null)}
              onMessage={setMessage}
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
                imageUrls={bigUrls}
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
          url={bigUrls[photo.imageId]}
          onChange={(changes) => void savePhotoRecord(editPhoto(photo, changes))}
          onSend={() => openConnect('send', photo.id)}
          onPreview={() => openPreview(photo.id)}
          onEdit={() => openEditor(photo.id)}
        />
      );
    }

    if (kind.type === 'photoEdit') {
      const photo = photos.find((p) => p.id === kind.photoId);
      if (!photo) return <p className="hint">This picture has been deleted.</p>;
      return (
        <ImageEditor
          photo={photo}
          url={fullUrls[sourceImageId(photo)]}
          onSaveEdit={(blob, adjustments, framing, size) =>
            savePhotoEdit(photo, blob, adjustments, framing, size)
          }
          onSaveCopy={(blob, changes) => savePhotoCopy(photo, blob, changes)}
          onRevert={() => revertPhotoEdit(photo)}
          onMessage={setMessage}
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
          onArchive={(id) => void data.archiveDocument(id)}
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
          askForSignature={askForSignature}
          onAskForSignature={setAskForSignature}
          restoreWindows={restoreWindowsOn}
          onRestoreWindows={setRestoreWindowsOn}
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
          showNames={pickableShows(shows, localToday()).map((show) => show.name)}
          currentShowName={shows.find((show) => whenIs(show, localToday()) === 'on' && show.status !== 'declined')?.name ?? null}
          onGuests={(next) => void setGuests(next)}
          importing={importingImages}
          onAddImages={(files, markCurrentShow) =>
            void handleImportPhotos(files, undefined, markCurrentShow)
          }
          onToggleCurrentShow={(photoId, inShow) => {
            const photo = photos.find((p) => p.id === photoId);
            if (photo) void savePhotoRecord(editPhoto(photo, { inCurrentShow: inShow }));
          }}
          onSetVisible={(photoId, visible) => {
            const photo = photos.find((p) => p.id === photoId);
            if (photo) void savePhotoRecord(editPhoto(photo, { hiddenFromVisitors: !visible }));
          }}
          onOpenPhoto={openPhotoWindow}
          selectedPhotoId={connectPhotoId}
          onSelectPhoto={setConnectPhotoId}
          askForSignature={askForSignature}
          siteUrl={siteUrl}
          onSiteUrl={setSiteUrl}
          onMessage={setMessage}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'shows') {
      return (
        <ShowsWindow
          shows={shows}
          photos={photos}
          imageUrls={imageUrls}
          guests={guests}
          currency={invoices[0]?.quote.currency ?? photos[0]?.currency ?? 'USD'}
          onSave={(show) => void saveShowRecord(show)}
          onTrash={(show) => void handleTrash(show.id)}
          onExport={handleExportShows}
          onImport={(file) => void handleImportShows(file)}
          onTogglePiece={(show, photo) => void toggleShowPiece(show, photo)}
          focus={showFocus}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'artwork') {
      return (
        <ArtworkWindow
          photos={photos}
          imageUrls={imageUrls}
          onChange={(photo, changes) => void savePhotoRecord(editPhoto(photo, changes))}
          onPreview={openPreview}
          onEdit={openEditor}
          onMessage={setMessage}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'finance') {
      return (
        <FinanceWindow
          photos={photos}
          invoices={invoices}
          documents={rows.map((row) => row.document)}
          expenses={expenses}
          imageUrls={imageUrls}
          studio={studio}
          mileageRate={mileageRate}
          onMileageRate={setMileageRate}
          onSaveExpense={(expense) => void saveExpenseRecord(expense)}
          onDeleteExpense={(id) => void deleteExpenseRecord(id)}
          onAddReceipts={addReceipts}
          onMarkInvoiced={(photoId, invoiced) => {
            const photo = photos.find((one) => one.id === photoId);
            if (photo?.sale) {
              void savePhotoRecord(editPhoto(photo, { sale: { ...photo.sale, invoiced } }));
            }
          }}
          onOpenInvoice={openInvoiceWindow}
          onOpenDocument={openDocumentWindow}
          onExportBooks={handleExportExpenses}
          onImportBooks={(file) => void handleImportExpenses(file)}
          onMessage={setMessage}
        />
      );
    }

    if (kind.type === 'tool' && kind.tool === 'trash') {
      return (
        <TrashWindow
          trash={trash}
          updates={trashAttached}
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
      return <MockToolWindow tool={kind.tool} />;
    }

    return null;
  }

  // --- Render -------------------------------------------------------------

  /**
   * The slideshow's pictures, as object URLs in the order they were picked.
   * A picture deleted from the library, or one whose URL has not been made
   * yet, is left out rather than shown as a blank.
   */
  const slideshow = wallpaper.slideshow ?? emptySlideshow();
  // A slide is keyed either by an image id in the artist's own library or by
  // the path of a photograph that ships with the app.
  const slideSources: Record<string, string> = {
    ...wallpaperUrls,
    ...Object.fromEntries(SHIPPED_PHOTOGRAPHS.map((photograph) => [photograph.src, photograph.src])),
  };
  const slideUrls = readySlides(slideshow, Object.keys(slideSources))
    .map((key) => slideSources[key])
    .filter((url): url is string => Boolean(url));
  const slideSeconds = secondsPerSlide(slideshow, slideUrls.length);
  const slideCrossfade = crossfadeSeconds(slideshow, slideUrls.length);

  return (
    <div
      className="workspace"
      data-wallpaper={wallpaper.id}
      data-fit={wallpaper.fit ?? 'cover'}
      style={{
        ...wallpaperStyle(wallpaper, wallpaperUrls),
        // The room the dock takes, kept clear of the desktop icons.
        '--dock-reserve': `${dockHeight + 20}px`,
      } as React.CSSProperties}
    >
      {wallpaper.monochrome && <div className="wp-mono" aria-hidden="true" />}
      {wallpaper.id === 'slideshow' && (
        <WallpaperSlides
          urls={slideUrls}
          seconds={slideSeconds}
          crossfade={slideCrossfade}
          reducedMotion={prefersReducedMotion()}
        />
      )}
      <SystemBar
        studioName={studio.name}
        launcher={
          <Launcher
            entries={launcherEntries}
            onChoose={onLaunch}
            summon={shell.launcherSummon}
            compact={compact}
            summonKeys={[keys.mod, 'K']}
          />
        }
        arrange={
          compact
            ? undefined
            : {
                frames: frames.length,
                snapped,
                autoTile: wm.autoTile,
                layout: wm.tileLayout,
                onTile: wm.tile,
                onCascade: wm.cascade,
                onUntile: wm.untile,
                onAutoTile: wm.setAutoTile,
                snapKeys: keyText([keys.alt, keys.shift], apple),
              }
        }
        statusText={statusText}
        statusState={statusRow?.saveState ?? 'saved-local'}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onOpenSettings={() => open({ type: 'settings' }, 'Settings', null)}
        openWindows={windows.filter((w) => !w.minimized).length}
        onMergeWindows={() => {
          wm.merge();
          setMessage('Windows merged into tabs. ⧉ on a tab moves it back out.');
        }}
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

      {/* Add images from the search box: the same door as the desktop's square. */}
      <input
        ref={addImagesRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleImportPhotos(e.target.files);
          e.target.value = '';
        }}
      />

      {dbProblem && (
        <div className="db-problem no-print" role="alert">
          <strong>{dbProblem.kind === 'superseded' ? 'Reload needed' : 'The studio is not open'}</strong>
          <span>{dbProblem.message}</span>
          <button className="btn" data-variant="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}

      {updateReady && (
        <div className="update-ready no-print" role="status">
          <strong>Newer version</strong>
          <span>
            This tab is still running the build it opened with. Reload to pick up the new one —
            nothing you have saved is affected.
          </span>
          <button className="btn" data-variant="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" data-variant="quiet" onClick={() => setUpdateReady(false)}>
            Later
          </button>
        </div>
      )}

      <main className="desktop" ref={wm.desktopRef}>
        <Desktop
          items={desktopItems}
          panel={
            <ComingUp
              items={comingUp({
                shows,
                owed: allOwed({ invoices, documents: rows.map((row) => row.document) }),
                today: localToday(),
                followUps: followUpsDue(data.profiles, localToday(), addDays(localToday(), 30)),
              })}
              onOpen={(item) => {
                if (item.kind === 'followup') openClients(item.openId);
                else if (item.kind !== 'payment') {
                  // Straight to the show that was clicked, not the first one.
                  setShowFocus({ id: item.openId });
                  open({ type: 'tool', tool: 'shows' }, 'Shows', 'Fairs, openings and markets');
                } else if (invoices.some((invoice) => invoice.id === item.openId)) {
                  openInvoiceWindow(item.openId);
                } else {
                  openDocumentWindow(item.openId);
                }
              }}
            />
          }
          imageUrls={imageUrls}
          layout={desktopLayout}
          viewport={viewport}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openDesktopItem}
          onMove={handleMoveIcon}
          onFileInto={(folderId, itemId) => void handleFileInto(folderId, itemId)}
          onNewFolder={() => void handleNewFolder()}
          undoLabel={undoLabel}
          onUndo={() => void undoLast()}
          onAddImages={(files) => void handleImportPhotos(files)}
          importing={importingImages}
          onTidy={handleTidy}
          trashCount={trash.length}
          trashPosition={trashPosition}
          onMoveTrash={(position) => {
            const before = trashPosition;
            pushUndoEntry('Move the Trash', () => setTrashPosition(before));
            setTrashPosition(position);
          }}
          onTrash={(id) => void handleTrash(id)}
          onOpenTrash={openTrashWindow}
          onViewport={wm.onDesktopViewport}
        />

        {/* Where a window being dragged will land if let go now. Drawn at the
            top z but before the frames, so the window itself stays over it. */}
        {wm.snapPreview && !compact && (
          <div
            className="snap-preview no-print"
            aria-hidden="true"
            style={(() => {
              const r = zoneRect(wm.snapPreview!, desktopViewportRef.current);
              return { left: r.x, top: r.y, width: r.width, height: r.height, zIndex: topZ(windows) };
            })()}
          />
        )}

        {renderGroups(windows.filter((w) => !w.minimized)).map(({ active: win, tabs }) => (
            <Frame
              key={win.groupId ?? win.id}
              window={win}
              tabs={tabs}
              onSelectTab={wm.focusWin}
              onCloseTab={wm.closeWin}
              onPullOutTab={wm.pullOut}
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
              onFocus={() => wm.focusWin(win.id)}
              onClose={() => wm.closeWin(win.id)}
              onMinimize={() => wm.minimizeWin(win.id)}
              onZoom={() => wm.zoomWin(win.id)}
              onDragEnd={(to) => wm.onDragEndWindow(win.id, to)}
              onResize={(w, h) => wm.resizeWin(win.id, w, h)}
              onSnap={compact ? undefined : (zone) => wm.snapWin(win.id, zone)}
              fills={win.kind.type === 'photoEdit'}
              onDragTo={(point) => wm.onDragWindow(win.id, point)}
              dropTarget={tabs.some((tab) => tab.id === wm.dropTarget)}
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

      {preview && (
        <PicturePreview
          photos={preview.ids
            .map((id) => photos.find((photo) => photo.id === id))
            .filter((photo): photo is Photo => Boolean(photo))}
          index={preview.index}
          imageUrls={bigUrls}
          onIndex={(index) => setPreview((current) => (current ? { ...current, index } : current))}
          onClose={() => setPreview(null)}
          onEdit={(photoId) => {
            setPreview(null);
            openEditor(photoId);
          }}
        />
      )}

      {compact && !capturing && (
        <button className="qc-fab" aria-label="Quick capture" onClick={() => setCapturing(true)}>
          +
        </button>
      )}
      {capturing && (
        <div className="qc-backdrop" onClick={() => setCapturing(false)}>
          <div
            className="qc-panel"
            role="dialog"
            aria-label="Quick capture"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCapturing(false);
            }}
          >
            <QuickCapture
              onNote={() => {
                setCapturing(false);
                openNotes({ newPin: null });
              }}
              onReceipt={(files) => void captureReceipt(files)}
              onPiece={(files) => void capturePiece(files)}
              onContact={(contact) => void captureContact(contact)}
              onClose={() => setCapturing(false)}
            />
          </div>
        </div>
      )}

      {shell.shortcutsOpen && (
        <ShortcutSheet mac={apple} compact={compact} onClose={shell.closeShortcuts} />
      )}

      {tray.length > 0 && (
        <div className="tray no-print" aria-label="Minimised windows">
          {tray.map((win) => (
            <button key={win.id} className="tray-item" onClick={() => wm.focusWin(win.id)}>
              <span className="tray-dot" aria-hidden="true" />
              {win.title}
            </button>
          ))}
        </div>
      )}

      <BuildStamp />

      <Dock
        activeId={dockIdFor(top)}
        onHeight={setDockHeight}
        onOpen={(id) => {
          if (id === 'new') {
            // An action rather than a window to toggle: it makes a commission
            // and opens it, the way the desktop tile used to.
            void handleNew();
            return;
          }
          if (id === 'home') {
            showDesktop();
            return;
          }
          // Every other dock button is a switch for its tool: open it, bring
          // it forward, or put it away. See toggleWindow.
          wm.toggle(toolSpec(id));
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


/** The pixel size of a blob, or null when the browser cannot decode it. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** A viewer who has asked their system for less movement gets straight cuts. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
  if (choice.id === 'photograph') {
    return choice.photographSrc
      ? { ...dim, backgroundImage: `url(${choice.photographSrc})` }
      : dim;
  }
  // The slideshow draws its own layers; the workspace itself stays bare so
  // nothing shows through the dissolve.
  if (choice.id === 'slideshow') return dim;
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
