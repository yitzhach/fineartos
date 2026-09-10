import {
  BUNDLED_WALLPAPERS,
  hasAnyPaymentMethod,
  type PaymentInstructions,
  type StudioDefaults,
  type WallpaperChoice,
} from '../lib/prefs';
import { ImageDrop } from './ImageDrop';

interface Props {
  studio: StudioDefaults;
  onStudio: (value: StudioDefaults) => void;
  payment: PaymentInstructions;
  onPayment: (value: PaymentInstructions) => void;
  wallpaper: WallpaperChoice;
  onWallpaper: (value: WallpaperChoice) => void;
  onCustomWallpaper: (file: File) => void;
  customWallpaperUrl: string | null;
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
  const { studio, payment, wallpaper } = props;
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
        <legend>Desktop</legend>
        <div className="wallpapers">
          {BUNDLED_WALLPAPERS.map((option) => (
            <button
              key={option.id}
              className="wallpaper-swatch"
              data-selected={wallpaper.id === option.id}
              onClick={() => props.onWallpaper({ ...wallpaper, id: option.id })}
            >
              <img src={option.src} alt="" />
              <span>{option.name}</span>
            </button>
          ))}

          <button
            className="wallpaper-swatch"
            data-selected={wallpaper.id === 'solid'}
            onClick={() => props.onWallpaper({ ...wallpaper, id: 'solid' })}
          >
            <span className="solid-swatch" aria-hidden="true" />
            <span>Solid colour</span>
          </button>

          {props.customWallpaperUrl && (
            <button
              className="wallpaper-swatch"
              data-selected={wallpaper.id === 'custom'}
              onClick={() => props.onWallpaper({ ...wallpaper, id: 'custom' })}
            >
              <img src={props.customWallpaperUrl} alt="" />
              <span>Your image</span>
            </button>
          )}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Use your own image</label>
          <ImageDrop
            multiple={false}
            label="Drop a photo here to use as your desktop"
            hint="It stays on this device, like every other image in the app"
            onFiles={(files) => {
              const first = files[0];
              if (first) props.onCustomWallpaper(first);
            }}
          />
        </div>
      </fieldset>
    </div>
  );
}
