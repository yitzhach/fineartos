/**
 * Commission document model.
 *
 * All money is stored in integer minor units (cents for USD). Nothing in this
 * file ever holds a float amount: rounding happens once, in calc.ts.
 *
 * A field the artist has not filled in is null, never a zero or an empty
 * placeholder that could be mistaken for a real figure.
 */

export type DocumentState = 'draft' | 'issued' | 'archived';
export type LengthUnit = 'in' | 'cm';

/** Money in integer minor units, e.g. 12345 = $123.45. */
export type Minor = number;

export interface StudioProfile {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Object URL is derived at render time; the blob lives in the image store. */
  logoImageId: string | null;
}

export interface Client {
  name: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  projectAddress: string | null;
  /** Where the commission came from, e.g. a show name. */
  source: string | null;
}

export interface Artwork {
  description: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  unit: LengthUnit;
  materials: string | null;
  finish: string | null;
  referenceImageIds: string[];
}

export interface Schedule {
  targetCompletionDate: string | null;
  deliveryNotes: string | null;
}

export type LineKind = 'artwork' | 'delivery' | 'installation';

export interface LineItem {
  id: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unitPrice: Minor;
}

export interface Quote {
  currency: string;
  lineItems: LineItem[];
  /** Percentage the artist typed in, e.g. 8.25. Null means no tax configured. */
  taxRatePct: number | null;
}

export type DepositKind = 'amount' | 'percent';

export interface Payment {
  id: string;
  date: string;
  amount: Minor;
  note: string | null;
}

export interface DepositTerms {
  kind: DepositKind;
  /** Minor units when kind is 'amount'; a percentage like 50 when 'percent'. */
  value: number | null;
}

export interface Terms {
  body: string | null;
  revisionAllowance: string | null;
  cancellation: string | null;
}

/** Everything the client is allowed to see. Private notes are NOT in here. */
export interface ClientFacing {
  studio: StudioProfile;
  documentNumber: string;
  title: string;
  createdDate: string;
  client: Client;
  artwork: Artwork;
  schedule: Schedule;
  quote: Quote;
  deposit: DepositTerms;
  payments: Payment[];
  terms: Terms;
}

/** A frozen copy of the client-facing document, taken when it was issued. */
export interface IssuedSnapshot {
  version: number;
  issuedAt: string;
  document: ClientFacing;
}

export interface CommissionDocument extends ClientFacing {
  id: string;
  state: DocumentState;
  /** The draft's version. An edit after issuing bumps this above the snapshot. */
  version: number;
  /** Never leaves the app. Excluded from every snapshot and export. */
  privateNotes: string | null;
  issuedSnapshots: IssuedSnapshot[];
  createdAt: string;
  updatedAt: string;
  /** True for the labelled sample record, so the UI can say it is demo data. */
  isDemo: boolean;
}
