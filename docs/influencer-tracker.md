# Influencer Tracker

Route: `/influencers`. Available to signed-in SOP staff, including มุก, using the existing staff allow-list. View-as sessions are read-only. The supplied opening-message emoji is preserved as explicitly requested.

`GET /api/influencers` overlays 15 static seed rows with `sop_influencers/{id}`. Reading does not seed or bulk-write Firestore. The first edit materializes a seed row. New rows use browser-generated UUIDs.

`POST /api/influencers` validates all fields, blocks impersonation and requires both a real session configuration and Admin credentials. A transaction compares the revision and atomically stores the row plus an immutable `sop_influencers/{id}/history/{uuid}` event (before, after, server time, actor from session). No deletion endpoint exists. History queries return the latest 100 events; older events remain stored. The shared collection is server-only; no client Firestore rules changes are required.

Missing credentials/session configuration enters clearly labeled local preview mode. Preview data and history are isolated from shared data. User-scoped localStorage preserves drafts and filters, and Reset only discards the selected draft after confirmation. Export contains rows, drafts and history already opened in this browser (it is not a full historical backup).

Dates entered in the editor are Bangkok local wall time. The initial Penguin Hut contact is assumed to be 14 October 2026, 16:55 Bangkok time. Follower numbers, rates and channel ownership are supplied reference data, not independently verified.

Production deployment and any customer messaging require approval. No outreach is sent by this feature.
