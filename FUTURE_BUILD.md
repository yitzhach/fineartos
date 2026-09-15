# Future build — what is asked for, and what it actually costs

This file exists because three requested features cannot be built honestly in
a browser-only app, and quietly shipping something that looks like them would
be worse than not shipping them.

Everything in Artist OS today runs on the artist's device. There is no server,
no account, no secret, and nothing leaves the machine unless the artist saves
a file and sends it themselves. That is a real property, not a limitation to
be papered over — and each item below is a decision to give some of it up in
exchange for something worth having.

Nothing here is built. Nothing in the app hints that any of it exists.

---

## 1. Emailing an invoice from inside the app

**Asked for:** "This doc can be emailed to the client from here."

**Why it is not built:** a browser cannot send email. There is no API for it,
in any browser, by design — an app that could send mail as you without your
mail client would be a spam engine. The two honest routes:

| Route | What happens | What it costs |
| --- | --- | --- |
| `mailto:` link | Opens the artist's own mail app with the client, subject and body filled in. **This ships today.** | Cannot attach the invoice — `mailto:` has no attachment field. The artist attaches the saved file. |
| A mail API | The app asks a server to send the mail; the server has the API key. | A server, a paid mail account, a verified sending domain. |

**What the API route needs, concretely:**

- **A mail provider.** Resend, Postmark or SES. Roughly $0–20/month at studio
  volume.
- **A verified sending domain** with SPF, DKIM and DMARC records on the
  artist's own domain. Without this, invoices land in spam or are rejected
  outright — this is the part people skip and then wonder why nobody got the
  email. It is DNS work, not code.
- **A server endpoint** to hold the API key. A Cloudflare Worker fits: the app
  already deploys as one. The key goes in a Worker secret and never reaches
  the browser, because anything in the browser is public.
- **A rendered attachment.** The self-contained HTML already produced by
  `src/invoice/render.ts` can be attached as-is, or converted to PDF
  server-side.
- **A record of what was sent.** An invoice that says "sent" must know when,
  to which address, and whether it bounced. A send that is not recorded is a
  claim the app cannot support — the same rule the save states already follow.

**Rough shape:** `POST /api/send-invoice` taking an invoice id and an address,
authenticated as the artist, returning a send id. The app records the send id
and the timestamp on the invoice. Until the provider confirms, the invoice
says "sending", not "sent".

**Blocked on:** sign-in (below). Without it the endpoint is an open relay
anyone can use to send mail from your domain.

---

## 2. Square, and card payments generally

**Asked for:** "Tight integration with Square would be nice, as well as future
payment options such as other CC processing options down the road."

**What ships today:** a Square payment link field. The artist creates the link
in their Square dashboard and pastes it in; it prints on the invoice and the
client pays Square directly. Artist OS never touches the money and never sees
a card. This is genuinely useful and carries no risk.

**What "tight integration" would mean, in increasing order of cost:**

1. **Generate the payment link automatically** from the invoice's amount and
   number, instead of pasting one in. Needs Square OAuth, a server to hold the
   tokens, and token refresh. The client experience is identical; the artist
   saves a manual step.
2. **Know when it was paid.** Square sends a webhook when the link is paid;
   the server verifies the signature and marks the invoice paid. This is the
   one that actually changes the artist's day — no more checking Square and
   copying the amount over by hand.
3. **Take the card in the app.** Square Web Payments SDK, card fields hosted
   by Square in an iframe so card numbers never touch this code. Also PCI
   scope, refunds, disputes and a payments ledger that must reconcile with
   Square's, forever.

**Recommendation:** 1 and 2 are worth building. 3 is a payments product, not a
feature — it is where a small tool turns into something with an on-call rota.

**Designing for other processors now:** keep the model free of Square. A
payment is `{ provider, externalId, amount, paidAt, status }`. Stripe and
PayPal fit that shape unchanged. Do not let a Square field reach
`invoice/types.ts`.

**Needs:** Square developer account, OAuth app, a server for tokens and
webhooks, and a webhook endpoint that verifies signatures — an unverified
webhook lets anyone mark any invoice paid.

---

## 3. The client portal

**Asked for:** "or on the client portal, they can download it."

**Why it is not built:** a portal is, unavoidably, a website with other
people's data on it. It needs hosting, a database, and an access rule for
every single read. The app today has none of these, and the existing guide is
already blunt that server-side tenant isolation is unverified.

**What it needs:**

- **A database.** D1 or Postgres. Invoices and documents move from the
  artist's device to a server that must be backed up.
- **Authentication for the artist.** Everything else depends on it.
- **Link security for the client.** Clients will not make accounts. The usual
  answer is a long unguessable link, which means the link *is* the password:
  it must expire, be revocable, and be scoped to exactly one invoice. Not a
  sequential id. Not the invoice number.
- **Row-level security on every read.** Enforced in the query, not in the UI.
  A client opening their link must not be able to reach another client's
  invoice by changing anything in it.
- **An audit trail.** Who opened the link and when. Both artist and client
  will eventually need to answer "did you send it?" — and today the app can
  only answer "you saved a file".
- **A privacy position.** Client names, addresses and amounts stop being
  local-only. That deserves a real decision, and probably a line in whatever
  the artist tells their clients.

**Recommendation:** build this last, and only after sign-in and mail. A portal
without a solid isolation story is the one failure here that damages the
artist's reputation rather than merely annoying them.

---

## The dependency, stated plainly

    sign-in  →  mail sending  →  payment webhooks  →  client portal

Every item is blocked on the one before it. Sign-in is not a feature the
artist will ever notice, which is exactly why it is worth being honest that
it is the gate on all three.

## Smaller things, not blocked on any of the above

- **PDF generated directly**, instead of through the browser's print dialog.
  Needs a PDF library or a server; the print route works today and costs
  nothing.
- **Recurring invoices**, for artists on retainer.
- **A real JPEG at print resolution.** The canvas renderer draws at 2× today,
  which is fine for email and thin for print.


## Saving to the cloud, and downloading a project

Both are asked for and neither is built. They are written down here rather
than half-started, because each needs a decision that has not been made.

### The guest book, once there is a server

The guest book works today on the artist's own device: the tablet on the
table is the book. What it cannot do is collect a signature from a visitor's
own phone. A QR code that opened a form on their phone would save their
answers in *their* browser, where the studio would never see them — so the
QR code hands details out (a contact card, or a link) rather than pretending
to take anything in, and the tool says so on the screen rather than in a
footnote.

The moment there is a server and a signed-in studio, the same form can post
to it and the QR can point at it. Three things to decide then:

- **What a stranger's POST is allowed to do.** An open endpoint that writes
  to the artist's guest book is a spam target. Rate limits at minimum,
  probably a per-show token that the QR carries and that the artist can
  revoke.
- **Consent has to travel with the record.** The "happy to hear from the
  studio" box is the difference between a mailing list and a complaint;
  whatever syncs must carry it and must never default it to true.
- **Whether a visitor can edit or remove their own entry later.** Easy to
  promise on a sign, hard to build without accounts for visitors.

### The Trash, once there is a cloud

Today the Trash is a list in this browser: the records stay in IndexedDB and
are simply hidden. When records sync, a deletion has to sync too, and that
raises a question worth answering deliberately rather than by accident —
whether emptying the Trash on the laptop should destroy the record on the
phone straight away, or whether the Trash itself should sync so the same
second chance exists on both. The second is more work and much harder to
regret.

### Desktop and folders saved to Cloudflare

Today a project, its invoices and its icon positions live in this browser:
IndexedDB for the records, localStorage for the positions. Opening the app on
a phone shows an empty desktop, because nothing has ever left the laptop.

Blocked on the same gate as everything else in this document — sign-in. Until
a request can say *whose* studio it is, a sync endpoint would either be open
to everyone or belong to no one. The adapter that would do the talking is
already written and switched off: `src/persistence/workerCloud.ts`, with the
schema in `migrations/001_commissions.sql`.

Two things to decide when it is built:
- **Whether icon positions sync at all.** A desktop arranged for a 27-inch
  screen makes no sense on a phone. Most likely answer: positions stay local
  per device, and only the records sync.
- **What happens to a conflict.** Two devices editing one invoice offline is
  rare but not impossible, and last-write-wins silently loses work.

### Downloading a whole project

"You can download a project" — one file holding the commission, its invoices,
the artwork images and the client's details. The open question is what shape
it takes, and the honest answer is that it depends on who is opening it:

- **A pitch deck / presentation PDF** — for sending to a client or a gallery.
  Big images, few words, the artist's name on it.
- **A working archive** — every record as JSON plus the original images, so
  the project can be moved to another machine or another app. This is the one
  that protects the artist; it is also the least impressive to look at.
- **A printable dossier** — the invoice layout that already exists, extended
  to cover the whole project.

These are not alternatives so much as different jobs, and the app will
probably end up doing two of them. The invoice exporter
(`src/invoice/download.ts`) already renders a self-contained HTML file, a
JPEG through canvas, and a PDF through the print dialog, so whichever shape
wins has somewhere to start.


## Shows, as a shell around a tracker that already exists

**Asked for:** the Shows tool, but light — because a much fuller show tracker
already exists as its own app, and this suite must not get heavy re-creating
it.

The bundle only grows if the code ships inside it, so the answer is not to
ship it. Three separable pieces, each usable without the next.

### The shell

A small registry — `src/os/externalTools.ts` — describing a hosted tool:
name, icon, URL, and an honest line about what it can and cannot do. The
Shows window loads that URL in an iframe, and only when it is opened. Cost to
the bundle is a few hundred bytes and no dependency. The tracker keeps its
own repository, its own deploy and its own data.

What that does not buy, and must be said on screen rather than discovered:

- **No shared database.** Cross-origin means Finance cannot read a booth fee
  from it and Artwork cannot know a piece is at a fair.
- **It needs a network.** Offline, the window says so; it never sits blank.
- **The other app must allow framing.** A tracker that sets
  `X-Frame-Options: DENY` or a restrictive `frame-ancestors` cannot be hosted
  this way at all, and the fallback is a link that opens it in a tab.
- **Rule 8 holds.** With no plan, the Shows icon is absent — not a teaser
  with dead controls. If it appears at all, it explains what Shows is and
  where it lives.

### The genuinely light native part

A show is not a record here. It is a *label*: a "shown at" name and dates on
a piece in Artwork, and a show name on an expense in Finance. Two fields, no
new store, no new tab — and between them they answer "where is this painting"
and "what did that fair cost me" without a Shows tool existing at all. This
is worth building whether or not the shell ever is.

### Light syncing — the calendar and the list of shows

Four rungs, cheapest first. Each is a decision about how much coupling is
worth it; none of them needs a server except the last.

1. **Nothing shared.** The iframe, and the two labels above. The artist reads
   dates in one window and types a booth fee in the other. Honest, free, and
   probably enough for a year.
2. **Export and import a small file.** The tracker writes a `shows.json` —
   name, venue, start and end dates, load-in, application deadline, status —
   and Artist OS reads it into a read-only list plus calendar entries. No
   coupling at all: the two apps never talk, and it works offline. The cost
   is that the artist re-exports when something changes, so the app must
   always say *when* it was imported and never imply it is current.
3. **A `postMessage` handshake.** When the Shows window opens, the hosted
   tracker posts a read-only summary of its shows to the parent, which caches
   it. Roughly thirty lines on each side, still no server, and it removes the
   manual re-export. It requires a change in the other app, an agreed message
   shape, and a strict origin check on both ends — a page in an iframe is
   untrusted input, exactly like an import file.
4. **Real two-way sync.** Blocked on the same gate as everything else in this
   document: sign-in. Not before.

Rungs 2 and 3 share one rule, and it is the important one: **the tracker owns
the show; Artist OS owns the money and the pieces.** Anything imported is
read-only here, shown as belonging to the other tool, and never editable in
two places. A show list that is partly imported and partly stale says how
many rows it could not see, the same way every other total in this app does.

### Still unknown

The show tracker's data shape. A `claude.ai/code/session_…` link is a working
session, not the app: it cannot be fetched or framed. What is needed before
any of rungs 2–4 can be designed properly is the deployed URL, and whether
its records already carry stable ids and ISO dates.


## Losing everything: bulk deletion, contacts, and a real backup

**Asked for:** it should be nearly impossible to wipe out the client records
and the invoices by accident. One file is easy to lose and easy to live
without; a folder holding dozens of invoices is not.

Today the Trash never deletes, emptying asks twice and quotes the real total
— a folder holding nine is "delete 10 records". That is good, and it has two
gaps.

### The second click is the same click at any size

Confirming ten records and confirming two hundred look identical. The
friction should be proportional to what is inside: past some weight, or any
time client records or invoices are in the pile, the confirmation asks the
artist to type the count rather than click again. Small change, and it is the
difference between a slip and a decision.

### There is no backup

`src/persistence/portable.ts` exports one document. What protects the artist
is **Save everything**: a single file holding every record, restored by
*merging* rather than overwriting, with a quiet line somewhere saying when
the last one was taken. Ids are already stable (`newId`), so a merge is
tractable; images are the open question, exactly as in "Downloading a whole
project" above.

That also fixes the emptying dialog properly. Rule 2 stays intact — emptying
is still not undoable — but with a backup in reach, the dialog can offer
**Back up first** as its primary button, and the loss becomes recoverable
without pretending it is reversible.

### A person outlives the job

Deleting a commission must never be able to take the client with it. Contacts
belong in their own store, not inside the document that happens to mention
them. This is the same root as the orphaned `clientUpdates` rows: child
records and shared records are different things and are currently treated the
same.

**Order.** Backup and restore first — it protects everything else, and
`portable.ts` has to be widened anyway to carry updates and expenses. Then
the proportional confirmation. Then contacts as their own records.
