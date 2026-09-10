# Artist OS — Phase 1 Codex Build Brief

## Mission

Build the first usable release of Isaac Anderson’s Artist OS: a refined desktop-style app containing one working tool, **Commission Documents**. An artist must be able to create a commission document, save it, reopen it, edit it and print a polished client PDF. Build working software, not a mock dashboard. Keep the implementation small and extensible.

Target repository: `https://github.com/yitzhach/commission`. The user reports that `main` connects to a Cloudflare Worker; inspect and verify the actual setup before changing it. This brief is a handoff specification, not evidence that the repository has been inspected.

This narrower Phase 1 supersedes the earlier broad commission-management MVP. Preserve the long-term direction, but implement only the scope below.

## Visual direction

Use the attached Artist OS reference image (`4fcd4efe-243a-411e-83de-87ea458da389.png`) as the visual guide. If unavailable, use this description and request the image only if essential; do not block functional work.

- Full-screen workspace with sculptural stone/plaster/copper wallpaper, charcoal translucent windows, fine borders, restrained sage accents and generous artwork imagery. Provide a solid-background option. Use an independent wallpaper asset or CSS treatment; never use the screenshot itself as the app background.
- Top system bar: Artist OS, studio name, document search, truthful connection/save status, light/dark toggle, local clock and initials/profile menu. Clock opens a simple calendar; defer weather and show feeds.
- Bottom dock: Home and Commissions work. Shows, Artwork, Connect, Visualizer and Finance appear subdued with “Coming later”; no dead-end screens or invented plan/billing behavior.
- Desktop icons represent saved documents, not duplicate app launchers. Folder management comes later.
- Commission window has a contextual toolbar with functional New, Save, Duplicate, Preview and Print/PDF actions. Allow desktop dragging, position locking and maximize/restore; remember layout. One active document window is sufficient. Defer a general multiwindow engine.
- Tablet and phone use a focused full-width layout, large touch targets, accessible labels and no hover-only actions. Avoid desktop-sized windows overflowing small screens.
- Light mode uses warm ivory and muted stone, retaining the same layout. Serif studio branding, readable sans-serif working text. Transparency must preserve contrast; respect reduced-motion preferences.
- Persist theme, solid/wallpaper selection and layout. Paid branding and custom wallpaper uploads come later.

## The working feature

Keep three views: **Desktop / Document list → Document editor → Client preview**.

Document list: create, search by client/title/document number, open, duplicate and archive. Desktop shortcuts open those same saved records. Show useful empty states. Any seeded examples must be clearly labeled demo data.

Editor fields:

| Section | Fields |
| --- | --- |
| Studio | Artist/business name, contact details, optional logo; reusable defaults |
| Document | Unique number, title, created date, draft/issued/archived state |
| Client | Name, email, phone, billing/project address; optional source/show |
| Artwork | Description, width/height/optional depth, explicit units, materials, finish, optional reference images |
| Schedule | Target completion date and delivery/installation notes |
| Quote | Editable description/quantity/unit-price line items, delivery/installation lines, optional manually entered tax rate, currency |
| Deposit/payment | Requested deposit as amount or percentage; manually recorded receipts with date, amount and note; paid total and balance |
| Terms | Artist-editable terms, revision allowance and cancellation notes; no claim of legal review |
| Private | Internal notes, excluded from all client output |

Start with USD as the default and one currency per document; no conversion. Use integer minor units and explicit rounding. Deposit requested is not money received. Calculate subtotal, configured tax, total, required deposit, paid and balance from one shared calculation function. Reject invalid quantities, rates and payment amounts; allow overpayment with an explicit credit indication.

Client preview is a clean, light, branded document with artwork images, specifications, itemized pricing, deposit, schedule and terms. Support browser Print / Save as PDF with reliable Letter and A4 layouts, sensible page breaks and no app chrome or private notes. Label the action accurately; a direct PDF download engine is unnecessary. No sending, online signature or payment processing in this phase.

Issuing a document preserves an immutable client-facing snapshot and version number. Subsequent edits create a new draft revision, leaving the issued snapshot intact. Duplicate creates a new document number and resets payments and issued history.

## Offline and persistence

Tablet use at art shows is essential. Deliver an installable PWA, with offline support after initial online preparation. Allow creation, editing, reopening and preview of local commission drafts and prepared images without internet. Use IndexedDB for records, drafts, image blobs and the pending-write queue; localStorage is for preferences only.

Distinguish “Saved on this device,” “Pending sync,” “Synced” and “Save failed.” Connectivity alone never means synced. Retry queued writes when the app is open and online; use stable IDs/idempotency to prevent duplicates. Preserve conflicting edits for resolution rather than silently overwriting. Do not rely on background sync or imply browser storage is a guaranteed backup. Include document JSON export/import with schema validation for portable recovery. Document whether images are included and retain them through the ordinary offline workflow.

The earlier client kiosk and offline inquiry workflow remain planned, but are outside this document-only release.

## Foundation and guardrails

Read repository instructions, existing project guide, package files and Worker configuration first. Reuse the working stack and deployment configuration. If starting empty, the intended baseline is React + TypeScript + Vite, a Cloudflare Worker, Supabase Auth/PostgreSQL and private R2 image storage. Verify current official platform guidance when implementing; do not migrate a working app merely to match this baseline.

Separate the OS shell, commission feature, calculation rules and persistence adapter. Use a small module registry so future tools can register their name, icon and entry point. No microservices, generic plugin marketplace or subscription engine.

For cloud persistence, enforce workspace membership on every record and image operation; use database row-level security and server-side authorization. Keep secrets server-side. Scope offline data by account/workspace and prevent it appearing under a different login. Sign-out must handle unsynced work explicitly. Private notes never enter published snapshots or client exports. Validate inputs and image type/size. Avoid personal data in logs.

Provide migrations, environment-variable examples without secrets and setup instructions. If credentials are unavailable, finish the runnable local persistence path and cloud adapter/migrations, label cloud sync unavailable, and report the precise setup blocker. Do not claim production or enterprise readiness before access isolation and cloud behavior are verified.

## Efficient execution

1. Inspect once and report a short implementation plan grounded in the repository. Resolve routine decisions independently; ask only about a genuine blocker.
2. Implement in small milestones: shell and editor; persistence and calculations; client preview/print; offline behavior and configured cloud sync. Complete all Phase 1 milestones rather than stopping after the design.
3. Maintain one concise project guide with architecture, commands, decisions, remaining blockers and the next phase. Avoid duplicated documentation and repeated broad repository scans.
4. Use focused tests for calculations, duplicate/snapshot behavior, private-data exclusion, offline recovery and tenant isolation where configured. Run the build/type checks and visually inspect desktop, tablet, phone and multipage print output.
5. Preserve unrelated work. Prepare a reviewable branch/commit when repository access permits. Do not push to deployment-connected `main` or deploy as part of this build handoff unless the user explicitly requests it in the build session.

## Done means

- Create a real document, attach an image, reload and reopen without data loss.
- Edit pricing and record a partial payment; total, deposit and balance stay correct.
- Duplicate without retaining the original receipts; revise without modifying an issued snapshot.
- Print a polished multipage document without clipping, controls or private notes.
- Prepare online, enable airplane mode, create/edit a draft, close/reopen, then reconnect. Local data survives; configured sync creates no duplicates and surfaces conflicts/errors.
- Search, dock navigation, theme, profile settings and window controls work on desktop; tablet/phone remain usable without dragging.
- If cloud is configured, two test workspaces cannot access each other’s records or images. Otherwise identify this as unverified and provide exact setup steps.
- Finish with what works, what was tested, how to run it, and any concrete blocker. Stop at this phase.

## Later, in order

1. Show preparation and protected client kiosk with offline inquiry capture.
2. Full commission workflow: site visits, concepts, production, delivery and archive.
3. Secure client links, version-specific approvals and payment integration.
4. Wall visualizer, photo markup, voice notes and reusable templates.
5. Connect, show tools, finance, entitlements, folders and richer desktop behavior.

## Paste into Codex

Read `COMMISSION_PHASE_1.md` and the attached Artist OS design reference. In `yitzhach/commission`, inspect the repository instructions and existing Cloudflare setup, then implement the complete Phase 1 described in the brief. Build only the OS shell and Commission Documents tool, including offline drafts and client PDF printing. Preserve working infrastructure, keep future tools inactive, make routine decisions independently, and verify the acceptance checks. Maintain one concise project guide. Deliver a runnable, reviewable build and report any genuine setup blockers; do not deploy or push to main yet.
