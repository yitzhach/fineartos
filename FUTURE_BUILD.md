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
