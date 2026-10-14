# Grand Opening checklist

`/grand-opening-checklist` uses the existing SOP Google staff allow-list/session and navigation. Any staff role can write; view-as sessions are read-only. Local development without credentials uses clearly labeled, user-scoped local preview; it cannot write shared data.

Storage: server-only `sop_grand_opening_checklist/{id}`, with immutable `history/{uuid}` subcollection. Fields: title, category, day (`17`, `18`, `ทั้งสองวัน`, or empty), nullable nonnegative finite quantities (max 1,000,000), assignee, note; revision, done/doneBy/doneAt, createdBy/createdAt, updatedBy/updatedAt, deleted. API rejects client audit fields. Actor names and timestamps come from the server session/clock. Each mutation and before/after history commit atomically with revision conflict detection. Deletion is a tombstone, preserving history and preventing seeds from reappearing. History returns the newest 100 events.

Like Influencer Tracker, 37 stable virtual seeds are overlaid with saved rows. GET never seeds or bulk-writes production. First mutation materializes the row; a seed's creator is “รายการเริ่มต้น”. Seeds remain editable. No recurring checklist windows, daily store task/KPI records or planned-day scheduling are changed: those infrastructure modules are designed for recurring work, not this shared event inventory.

GET `/api/grand-opening-checklist`: snapshot, or `?id=` history, or `?stream=1` authenticated SSE backed by an Admin Firestore snapshot listener. Each connection closes after 50 seconds; EventSource reconnects automatically. Abort/cancel/error removes the listener. No public client Firestore access/rules changes. POST actions: save (fields), tick (done), delete; all require id and expected revision. No database writes are performed for development screenshots or verification.

Progress reflects saved active rows, unaffected by filters. Day 17/18 includes both-day rows; untagged rows only appear in all-days. Drafts survive reload in user-scoped localStorage; Reset explicitly discards a draft. Save conflicts retain drafts and reload shared state. Ticking is disabled while a row has an unsaved draft to avoid changing its revision mid-edit. Export includes drafts and history already opened, not a complete audit backup.

Preview screenshots are stored under `docs/screenshots/`. Merge and production deploy require Champ's approval.
