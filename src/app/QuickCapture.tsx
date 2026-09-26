import { useRef, useState } from 'react';
import { newId } from '../commission/document';
import type { ImportedContact } from '../clients/clients';

interface Props {
  onNote: () => void;
  onReceipt: (files: File[]) => void;
  onPiece: (files: File[]) => void;
  onContact: (contact: ImportedContact) => void;
  onClose: () => void;
}

/**
 * Quick capture, for a phone at a show or in a shop: a note, a receipt
 * photographed, a new piece photographed, a new contact. Each lands where it
 * belongs — Notes, the books, Artwork, Clients — and says so.
 */
export function QuickCapture({ onNote, onReceipt, onPiece, onContact, onClose }: Props) {
  const receiptRef = useRef<HTMLInputElement>(null);
  const pieceRef = useRef<HTMLInputElement>(null);
  const [contact, setContact] = useState<{ name: string; email: string; phone: string } | null>(null);

  const files = (input: HTMLInputElement) => {
    const list = Array.from(input.files ?? []);
    input.value = '';
    return list;
  };

  if (contact) {
    const ok = Boolean(contact.name.trim() || contact.email.trim() || contact.phone.trim());
    return (
      <form
        className="qc-sheet"
        aria-label="New contact"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          onContact({
            id: newId(),
            name: contact.name.trim(),
            email: contact.email.trim() || null,
            phone: contact.phone.trim() || null,
            note: null,
            importedAt: new Date().toISOString(),
          });
        }}
      >
        <label className="field">
          <span>Name</span>
          <input autoFocus value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
        </label>
        <div className="chip-row">
          <button className="btn" data-variant="primary" type="submit" disabled={!ok}>
            Save contact
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="qc-sheet">
      <div className="qc-choices">
        <button className="btn" onClick={onNote}>
          Note
        </button>
        <button className="btn" onClick={() => receiptRef.current?.click()}>
          Receipt photo
        </button>
        <button className="btn" onClick={() => pieceRef.current?.click()}>
          New piece
        </button>
        <button className="btn" onClick={() => setContact({ name: '', email: '', phone: '' })}>
          New contact
        </button>
      </div>
      <input
        ref={receiptRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const list = files(e.target);
          if (list.length) onReceipt(list);
        }}
      />
      <input
        ref={pieceRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const list = files(e.target);
          if (list.length) onPiece(list);
        }}
      />
    </div>
  );
}
