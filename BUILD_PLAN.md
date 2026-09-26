# BUILD_PLAN — the phased build list

The plan for turning Artist OS into the whole working life of one artist:
clients, commissions, invoices, the books, the mailing list, notes, and a
booth mode that runs a show from a laptop, a tablet or a phone.

How to use it: each work session takes the next one or two phases, builds
them to the "Done when" line, and ticks them here. A phase is sized to land
in one pass. Phases 0–6 run entirely on the artist's device and cost nothing
to operate; Phase 7 is the server line, and everything after it depends on
sign-in, as `FUTURE_BUILD.md` explains. The standing rules in `CLAUDE.md`
apply to every item — above all: nothing implies billing or sign-in before
they exist, and nothing claims to have been sent.

Status key: **Done** · **Next** · Planned · *Needs the artist's say*.

---

## Audit — 26 Sep 2026

Measured on the production build; the deployed URL was not reachable from
the build container, so it was not checked there.

| # | Finding | Status |
| --- | --- | --- |
| 1 | Dragging or resizing a window redrew the entire app — every open tool — on every pointer move. Stutter with Finance or Artwork open, worst on tablets. | **Fixed**: the frame moves itself; the desktop hears once, on release |
| 2 | The system bar search only filtered the Projects list. With the list closed it did nothing: a dead control (rule 8). | **Fixed**: it is the universal search now; the list keeps its own filter |
| 3 | A window's z-index grows with every focus. After ~20 clicks a window covered the search results, the menus and the dock. | **Fixed**: windows have their own layer (≥861px) |
| 4 | The desktop's buttons and the Coming up panel drew over the first windows opened. | **Fixed** |
| 5 | Alt+1–9 (jump to a tab) called `preventDefault` inside a state updater, which runs after the browser has acted. | **Fixed** |
| 6 | Titlebars had no `touch-action`: a finger on an iPad could pan the page and cancel the drag. | **Fixed**; NOT tested on a real iPad |
| 7 | One JavaScript bundle: 526 KB (159 KB gzip) plus 92 KB CSS, all parsed before the first paint; Vite warns past 500 KB. | Phase 1 |
| 8 | Every image in the studio is read full-size into memory at start-up, one at a time, and the whole set is read again whenever one image is added. | Phase 1 |
| 9 | Every save re-reads all seven stores. Fine at a hundred records, slow at thousands. | Phase 1 |
| 10 | The guest book lives in localStorage: a 5 MB ceiling, synchronous writes, and a failed write is swallowed — a silent failure (rule 5) on real contact data. | Phase 2 |
| 11 | `src/App.tsx` is 2,900 lines. Every change pays to read it. | Phase 1 |
| 12 | Every load reopens the newest commission, even one closed before the reload. | Phase 1 |
| 13 | Messages say ⌘Z on Windows and Linux. The search box already names keys per platform. | Phase 1 |
| 14 | On a phone the dock scrolls sideways with a half-cut icon at each end. The search sheet now reaches every tool; the dock should show fewer. | Phase 3 |

---

## Ideas — what "the ultimate artist OS" adds

Grouped by the job they do. Each lands in a phase below.

- **Clients (a real CRM).** A person record that ties together their
  commissions, invoices, guest-book signatures, purchases and notes. Tags
  (collector, gallery, lead), last contact, follow-up dates that feed Coming
  up, lifetime spend, and import from a phone's contacts (vCard) or a CSV.
- **Commission pipeline.** Inquiry → quote → deposit → stages → delivery on
  one board; proposal and contract templates; progress updates (built) and
  the in-person signature pad (built) used for sign-off.
- **Money.** Payment plans and layaway (instalments against one invoice),
  estimates, consignment (the gallery's share, what it owes), inventory value.
  The books already give profit and loss; nothing here becomes tax advice.
- **Mailing list.** Consenting guest-book signers and clients become a list,
  segmented by show, liked pieces or tag, exported to Mailchimp, Kit or
  Buttondown for free; sending from the app comes with the server.
- **Notes and a studio journal.** Quick notes and checklists pinned to a
  client, a piece, a show or a commission; dictation where the browser can
  listen (the Finance dictation already works that way); process photos,
  materials and hours per piece.
- **Show mode (the booth).** Full-screen, locked to the visitor-facing
  panels, left only with the artist's PIN. An attract loop — the artist's
  profile video or a slideshow of available work — that a tap turns into:
  sign the guest book, see the pieces at this show with prices, read the
  statement, browse the artist's website, and a wall of QR codes (site,
  Instagram, newsletter, a payment link). Runs offline; fairs have no signal.
- **Selling at the booth.** Mark sold in two taps: the piece's status and
  location, an income row in the books and a receipt handed to the device's
  own mail or messages app. A day's tally per show.
- **Visualizer.** A piece on a photo of the client's wall, to scale: the
  artist marks a known length on the photo and the piece's real dimensions do
  the rest. *Needs the artist's say on scope.*
- **Portfolio and paperwork.** Price lists and gallery line sheets from the
  catalogue, wall labels, certificates of authenticity, CV and statement
  versions.
- **Calendar and tasks.** Show dates, deadlines, deliveries and payments in
  one calendar with an ICS export; a task list per commission.
- **The OS itself.** Search and tiling (built), a shortcut sheet, workspaces
  ("Studio" and "Show"), quick capture from a phone (a note, a receipt photo,
  a new piece, a new contact in one tap).
- **With a server (paid).** Sign-in, sync across devices, the client portal
  (see progress, approve, pay), real email with delivery status, payment links
  that mark themselves paid, an online guest book, newsletter sending, a tablet
  kiosk driven from a phone, portfolio hosting on the artist's own domain.

---

## Free and paid — a proposal

The line that stays honest: **free is everything that runs on the device;
paid is everything that costs money to run** — servers, storage, email,
payments. Local features are not held back to make the paid tier look
bigger: a limit on records that cost nothing to keep only breeds
resentment. Prices are placeholders to decide later, and nothing in the app
mentions a plan until billing exists.

| | Free — on this device | Studio — ~$12/mo | Pro — ~$25/mo |
| --- | --- | --- | --- |
| Commissions, invoices, the books, artwork, shows, clients, notes | ✓ | ✓ | ✓ |
| Show mode: loop, guest book, pieces, QR wall, sales tally | ✓ | ✓ | ✓ |
| Export files, CSV, printing, mailing-list export | ✓ | ✓ | ✓ |
| Sign-in, cloud backup, sync phone ↔ tablet ↔ laptop | | ✓ | ✓ |
| Client portal: progress, approve, download, pay | | ✓ | ✓ |
| Email from the app with delivery status; online guest book | | ✓ | ✓ |
| Payment links that mark invoices paid (Square, Stripe) | | ✓ | ✓ |
| Newsletter sending | | up to 1,000 | up to 10,000 |
| Kiosk tablet driven live from the phone | | | ✓ |
| Portfolio site on the artist's own domain; assistant seat | | | ✓ |

---

## The build list

### Phase 0 — Find anything, arrange anything · **Done**

- Search box in the system bar (⌘K / Ctrl+K anywhere, / when not typing):
  tools by the words artists use ("qr", "mileage", "booth fee", "email
  list"), actions that can be done now, and records — clients, commission and
  invoice numbers, folders, pieces, shows, guest-book names. Empty, it lists
  every tool with its shortcut. On a phone it is a button that opens a sheet.
- Shortcuts: G then a letter opens a tool (P Projects, I Invoices, F Finder,
  C Connect, A Artwork, S Shows, B the Books, T Trash, H Home).
- Tiling: Arrange menu (side by side, grid, front one large, top to bottom,
  cascade, put back, auto-tile); drag a titlebar to an edge or corner to snap
  it, with a preview; Alt+Shift+arrows walk halves and quarters; a snap menu
  on every titlebar. Snapping never loses the size a window was given by hand.
- Audit fixes 1–6 above.
- Done when: `launcher.ts` and `tiling.ts` tested (61 tests);
  `scripts/check-launcher-tiling.mjs` passes at 1440, 1024 and 390 with a
  second tab open and a reload. **Met.**

### Phase 1 — Speed and a lighter shell · **Done**

- **Done.** Load each tool's code when it is first opened (Finance, Connect and its QR
  library, the darkroom, Artwork, Shows, the invoice editor, Settings), then
  fetch the rest while the app is idle so the service worker still has every
  tool for offline. A tool that cannot load says so and offers Reload.
- **Done.** Thumbnails: a small WebP stored beside each original; the desktop, lists
  and catalogue use it; the full picture loads only where it is shown. The
  image map is updated per image, not rebuilt.
- **Done.** A save updates the one record in state instead of re-reading every store.
- **Done.** Split `App.tsx` into hooks by concern (studio data, windows, trash, the
  search box) with no change in behaviour.
- **Done.** The newest commission opens on load only when nothing was restored.
- **Done.** Key names per platform in every message (⌘ or Ctrl); a "?" shortcut sheet.
- Done when: first-load JavaScript under 100 KB gzip; 200 photographs open
  without a stall; every browser check passes, including offline after one
  online visit.

### Phase 2 — Clients and notes · Planned · Free

- Clients tool (replaces the preview in the rail): a person record built from
  what exists — commission clients, invoice clients, guest-book entries —
  with duplicates offered for merging, never merged silently.
- Per client: everything they are in, tags, last contact, a follow-up date
  that appears in Coming up, notes, lifetime spend (with how many amounts
  were not recorded, per rule 6).
- Notes tool: quick notes and checklists, pinned to anything, found by the
  search box; dictation only where the browser can listen (rule 8).
- Quick capture on a phone: note, receipt photo, new piece, new contact.
- Guest book moves into IndexedDB (database version 7) and a failed write is
  shown, not swallowed. Import contacts from vCard or CSV.
- Done when: a guest who signs at a show and later commissions a piece is one
  person with both in their record; upgrade from v6 tested with a second tab.

### Phase 3 — Show mode · Planned · Free

- Booth mode: full screen, visitor panels only, the studio's money, clients
  and notes out of reach; leaving needs the artist's PIN.
- Attract loop: the artist's profile video (a file kept on the device, muted,
  looping) or a slideshow of the pieces at this show; a tap wakes the panels;
  idle returns to the loop.
- Panels: guest book (built), pieces at this show with prices or "price on
  request" (rule 1), artist statement, the artist's website, and a QR wall.
- The website panel shows the site inside the app where the site allows it.
  Many sites forbid being shown inside another page, and a browser cannot
  tell the app so — the setup asks the artist to confirm the site appears,
  and where it does not, the panel is the QR code instead (rule 8).
- Phone layout for the booth; the dock shows fewer items on a phone (audit
  14).
- Done when: a full show day runs offline on a tablet — loop, a sign-up, a
  QR scan, the PIN out — checked at tablet and phone widths.

### Phase 4 — Selling at the booth, and the Visualizer · Planned · Free

- Sold in two taps: status and location on the piece, an income row in the
  books, a receipt handed to the device's mail or messages app, and a
  payment link or QR per piece where the artist has one.
- The day's tally per show, pieces still out, consignment splits.
- Print: price list, wall labels, certificate of authenticity.
- Visualizer (*scope to settle with the artist first*): a room photo, a known
  length marked on it, the piece placed at true size.
- Done when: a sale at a show changes Artwork, Finance and the show's tally
  together, and the Trash can undo it cleanly.

### Phase 5 — Mailing list · Planned · Free

- The list: consenting guest-book entries and clients (consent never
  defaults to yes), segments by show, liked pieces and tag.
- Export CSV for Mailchimp, Kit or Buttondown; an announcement composer for
  new work that hands off through `mailto:` for a few people or copies for a
  newsletter tool — the app never says it sent anything.
- QR codes that carry the show's name so a visit can be traced to a fair.
- Done when: a show's sign-ups become a segment exported in one step.

### Phase 6 — Calendar and tasks · Planned · Free

- Calendar tool (replaces the preview): shows, deadlines, deliveries,
  payments due, follow-ups; ICS export for the phone's own calendar.
- Tasks per commission; a board of commissions by stage.
- Done when: every dated thing in the studio appears once, in one place.

### Phase 7 — Sign-in and the cloud · Planned · Studio — the server line

- Sign-in; switch on the Worker backend already ported into `worker/`;
  backups and sync across devices with conflicts shown, never overwritten
  silently; how the Trash syncs (see `FUTURE_BUILD.md`).
- Billing arrives here. Only from this phase on does the app mention a plan.
- Done when: a record made on the phone appears on the laptop, offline edits
  on both reconcile, and nothing is lost when they disagree.

### Phase 8 — Client portal, email, payments · Planned · Studio

- A signed link per client: progress updates, approve a stage (the Approve
  button returns once there is somewhere for it to write), download an
  invoice, pay.
- Invoices and updates sent by a mail provider from a verified domain, with
  sent, delivered and bounced recorded — "sending" until the provider says.
- Square and Stripe payment links generated per invoice; webhooks mark them
  paid.
- Done when: a client approves and pays from their phone and the studio sees
  both without anyone typing them in.

### Phase 9 — The connected booth · Planned · Studio and Pro

- Online guest book: visitors sign on their own phone from the QR, with a
  per-show token that can be revoked, and consent carried with the record.
- Newsletter sending with unsubscribe handled.
- A kiosk tablet driven live from the artist's phone.
- Done when: a visitor signs on their phone and appears on the tablet
  within seconds.

### Phase 10 — Presence · Planned · Pro

- Portfolio website from the catalogue, hosted on the artist's own domain.
- Gallery and consignment portal; an assistant seat.
