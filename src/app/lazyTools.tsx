import { Component, Suspense, lazy, type ComponentType, type ReactNode } from 'react';

/**
 * The heavy tools load when first opened, so the shell's first load stays
 * small. Once the app is idle every one is fetched anyway, so the service
 * worker has them all for offline. A tool that cannot load says so and offers
 * Reload — never a blank window (rule 5).
 */

type Loader = () => Promise<unknown>;
const loaders: Loader[] = [];

class ToolBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="tool-load-failed" role="alert">
        <p>{this.props.name} could not load. The connection may have dropped, or a newer version is out.</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

function lazyTool<P extends object>(
  name: string,
  load: () => Promise<ComponentType<P>>,
  quiet = false,
): ComponentType<P> {
  const loader = () => load().then((component) => ({ default: component }));
  loaders.push(loader);
  const Lazy = lazy(loader) as unknown as ComponentType<P>;
  function Tool(props: P) {
    return (
      <ToolBoundary name={name}>
        <Suspense fallback={quiet ? null : <div className="tool-loading">Opening {name}…</div>}>
          <Lazy {...props} />
        </Suspense>
      </ToolBoundary>
    );
  }
  Tool.displayName = `Lazy(${name})`;
  return Tool;
}

export const Connect = lazyTool('Connect', () => import('../connect/ui/Connect').then((m) => m.Connect));
export const Settings = lazyTool('Settings', () => import('../os/Settings').then((m) => m.Settings));
export const InvoiceEditor = lazyTool('The invoice editor', () =>
  import('../invoice/ui/InvoiceEditor').then((m) => m.InvoiceEditor),
);
export const ArtworkWindow = lazyTool('Artwork', () => import('../artwork/ui/ArtworkWindow').then((m) => m.ArtworkWindow));
export const ShowsWindow = lazyTool('Shows', () => import('../shows/ui/ShowsWindow').then((m) => m.ShowsWindow));
export const FinanceWindow = lazyTool('Finance', () => import('../finance/ui/FinanceWindow').then((m) => m.FinanceWindow));
export const ImageEditor = lazyTool('The darkroom', () => import('../photo/ui/ImageEditor').then((m) => m.ImageEditor));

// Windows the shell opens often, split out only to keep the first load small.
export const Finder = lazyTool('The Finder', () => import('../os/Finder').then((m) => m.Finder));
export const TrashWindow = lazyTool('The Trash', () => import('../os/TrashWindow').then((m) => m.TrashWindow));
export const ShortcutSheet = lazyTool('The shortcut sheet', () => import('../os/ShortcutSheet').then((m) => m.ShortcutSheet));
export const Editor = lazyTool('The commission editor', () => import('../commission/ui/Editor').then((m) => m.Editor));
export const ClientPreview = lazyTool('The client page', () => import('../commission/ui/ClientPreview').then((m) => m.ClientPreview));
export const DocumentList = lazyTool('The commission list', () => import('../commission/ui/DocumentList').then((m) => m.DocumentList));
export const InvoiceView = lazyTool('The invoice', () => import('../invoice/ui/InvoiceView').then((m) => m.InvoiceView));
export const InvoiceList = lazyTool('The invoice list', () => import('../invoice/ui/InvoiceList').then((m) => m.InvoiceList));
export const FolderWindow = lazyTool('The folder', () => import('../project/ui/FolderWindow').then((m) => m.FolderWindow));
export const UpdatesPane = lazyTool('Client updates', () => import('../commission/ui/UpdatesPane').then((m) => m.UpdatesPane));
export const PhotoWindow = lazyTool('Photos', () => import('../photo/ui/PhotoWindow').then((m) => m.PhotoWindow));
export const PicturePreview = lazyTool('The picture', () => import('../photo/ui/PicturePreview').then((m) => m.PicturePreview));
export const ProjectWindow = lazyTool('The commission', () => import('../commission/ui/ProjectWindow').then((m) => m.ProjectWindow));export const ClientsTool = lazyTool('Clients', () => import('./PeopleTools').then((m) => m.ClientsTool));
export const NotesTool = lazyTool('Notes', () => import('./PeopleTools').then((m) => m.NotesTool));
export const QuickCapture = lazyTool('Quick capture', () => import('./QuickCapture').then((m) => m.QuickCapture));
export const MockToolWindow = lazyTool('The preview', () => import('../os/mock/tools').then((m) => m.MockToolWindow));

// The slideshow sits behind everything, so it loads without a caption.
export const WallpaperSlides = lazyTool(
  'The slideshow',
  () => import('../os/WallpaperSlides').then((m) => m.WallpaperSlides),
  true,
);

/** Fetch every tool once the browser is idle, so offline has them all. */
export function warmTools(): void {
  const run = () => {
    for (const load of loaders) load().catch(() => undefined); // a real open reports its own failure
  };
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  // A few seconds first, so the warm-up never competes with the first paint
  // or the first reads of the database.
  window.setTimeout(() => (idle ? idle(run, { timeout: 5000 }) : run()), 3000);
}

/** Whether an error is a code chunk that failed to arrive (wording differs per browser). */
export function isLoadFailure(reason: unknown): boolean {
  const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError/i.test(text);
}
