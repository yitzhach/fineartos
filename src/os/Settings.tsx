import {
  hasAnyPaymentMethod,
  type PaymentInstructions,
  type StudioDefaults,
  type WallpaperChoice,
} from '../lib/prefs';
import type { CustomWallpaper } from '../lib/wallpapers';
import { WallpaperPicker } from './WallpaperPicker';

interface Props {
  studio: StudioDefaults;
  onStudio: (value: StudioDefaults) => void;
  payment: PaymentInstructions;
  onPayment: (value: PaymentInstructions) => void;
  wallpaper: WallpaperChoice;
  onWallpaper: (value: WallpaperChoice) => void;
  wallpaperLibrary: CustomWallpaper[];
  wallpaperUrls: Record<string, string>;
  onUploadWallpapers: (files: File[]) => void;
  onRemoveWallpaper: (imageId: string) => void;
  onRenameWallpaper: (imageId: string, name: string) => void;
  wallpaperBusy: boolean;
  wallpaperError: string | null;
  askForSignature: boolean;
  onAskForSignature: (value: boolean) => void;
  restoreWindows: boolean;
  onRestoreWindows: (value: boolean) => void;
}

const nullable = (value: string): string | null => (value.trim() === '' ? null : value);

/**
 * Studio identity, how to get paid, and what the desktop looks like.
 *
 * The payment fields are plain text on purpose. Nothing here connects to
 * Square, PayPal or a bank: these are the instructions printed on an invoice,
 * exactly as the artist typed them. See FUTURE_BUILD.md for what taking a
 * payment in the app would actually require.
 */
export function Settings(props: Props) {
  const { studio, payment } = props;
  const setPayment = (changes: Partial<PaymentInstructions>) =>
    props.onPayment({ ...payment, ...changes });

  return (
    <div className="settings">
      <fieldset className="section">
        <legend>Studio</legend>
        <p className="hint" style={{ marginTop: 0 }}>
          Used on every new document and invoice.
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="set-name">Studio name</label>
            <input
              id="set-name"
              type="text"
              value={studio.name}
              onChange={(e) => props.onStudio({ ...studio, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="set-email">Email</label>
            <input
              id="set-email"
              type="email"
              value={studio.email ?? ''}
              onChange={(e) => props.onStudio({ ...studio, email: nullable(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="set-phone">Phone</label>
            <input
              id="set-phone"
              type="tel"
              value={studio.phone ?? ''}
              onChange={(e) => props.onStudio({ ...studio, phone: nullable(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="set-address">Address</label>
            <textarea
              id="set-address"
              value={studio.address ?? ''}
              onChange={(e) => props.onStudio({ ...studio, address: nullable(e.target.value) })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>How clients pay you</legend>
        <p className="hint" style={{ marginTop: 0 }}>
          These are printed on your invoices exactly as you type them. Artist OS does not
          process payments and never sees the money — a Square link here is a link you
          pasted in, and the client pays Square directly.
        </p>

        <div className="field">
          <label htmlFor="pay-square">Square payment link</label>
          <input
            id="pay-square"
            type="text"
            placeholder="https://square.link/u/…"
            value={payment.squareLink ?? ''}
            onChange={(e) => setPayment({ squareLink: nullable(e.target.value) })}
          />
          <span className="hint">
            Create the link in your Square dashboard, then paste it here.
          </span>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="pay-paypal">PayPal</label>
            <input
              id="pay-paypal"
              type="text"
              value={payment.paypal ?? ''}
              onChange={(e) => setPayment({ paypal: nullable(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="pay-venmo">Venmo</label>
            <input
              id="pay-venmo"
              type="text"
              placeholder="@your-handle"
              value={payment.venmo ?? ''}
              onChange={(e) => setPayment({ venmo: nullable(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="pay-zelle">Zelle</label>
            <input
              id="pay-zelle"
              type="text"
              value={payment.zelle ?? ''}
              onChange={(e) => setPayment({ zelle: nullable(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="pay-check">Check payable to</label>
            <input
              id="pay-check"
              type="text"
              value={payment.checkPayableTo ?? ''}
              onChange={(e) => setPayment({ checkPayableTo: nullable(e.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="pay-bank">Bank transfer details</label>
          <textarea
            id="pay-bank"
            value={payment.bankDetails ?? ''}
            onChange={(e) => setPayment({ bankDetails: nullable(e.target.value) })}
          />
        </div>

        <div className="field">
          <label htmlFor="pay-terms">Payment terms</label>
          <textarea
            id="pay-terms"
            placeholder="Net 30. A late fee of 1.5% per month applies after the due date."
            value={payment.terms ?? ''}
            onChange={(e) => setPayment({ terms: nullable(e.target.value) })}
          />
        </div>

        {!hasAnyPaymentMethod(payment) && (
          <div className="notice">
            No payment method is set. Invoices will say so plainly rather than leaving the
            client to guess.
          </div>
        )}
      </fieldset>

      <fieldset className="section">
        <legend>Windows</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={props.restoreWindows}
            onChange={(e) => props.onRestoreWindows(e.target.checked)}
          />
          <span>Open the windows that were open last time</span>
        </label>
        <span className="hint">
          Only the arrangement is remembered — sizes, positions and which tabs were together.
          A window whose commission or picture has since been deleted is not put back.
        </span>
      </fieldset>

      <fieldset className="section">
        <legend>Guest book</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={props.askForSignature}
            onChange={(e) => props.onAskForSignature(e.target.checked)}
          />
          <span>Ask visitors to sign</span>
        </label>
        <span className="hint">
          On, the book shows a box to sign in and says “Sign our guest book”. Off, it does not
          ask — signatures already given are kept and still shown.
        </span>
      </fieldset>

      <fieldset className="section">
        <legend>Desktop picture</legend>
        <WallpaperPicker
          wallpaper={props.wallpaper}
          onWallpaper={props.onWallpaper}
          library={props.wallpaperLibrary}
          customUrls={props.wallpaperUrls}
          onUpload={props.onUploadWallpapers}
          onRemove={props.onRemoveWallpaper}
          onRename={props.onRenameWallpaper}
          busy={props.wallpaperBusy}
          error={props.wallpaperError}
        />
      </fieldset>
    </div>
  );
}
