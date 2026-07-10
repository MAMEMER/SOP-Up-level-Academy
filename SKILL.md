---
name: up-level-storehub-stock
description: StoreHub stock operation workflow for Up Level Academy, covering daily stock checks, stocktake/counting, receiving stock, adding products, discrepancy handling, and checklist conversion for SOP training.
---

# Up Level StoreHub Stock Workflow

Use this skill when creating or updating SOP/checklist content for StoreHub stock operations in Up Level Academy.

Note: StoreHub store URLs are login-protected. If a specific StoreHub page cannot be accessed, apply this standard workflow and ask for screenshots only when a UI-specific button name or field is required.

## Core Rules

- Every physical stock movement must be reflected in StoreHub on the same day.
- Do not adjust stock before checking the physical item, product name, SKU/barcode, variant, and location.
- If physical count and StoreHub count do not match, record the discrepancy and inform the responsible lead before final adjustment.
- High-value cards and reserved products must be counted separately from normal sale-ready stock.
- Stock work should be separated from packing/shipping tasks.

## Daily Stock Checklist Pattern

### Add Product

Use when a product does not exist in StoreHub yet.

- Search StoreHub first to avoid duplicate product records.
- Add product name, category, variant, SKU/barcode, selling price, cost if available, and tax/status if required.
- Set track inventory on for physical products.
- Add opening quantity only after physical count is confirmed.
- Save and verify the product appears in the correct category/POS listing.

### Receive Stock

Use when supplier stock arrives or stock is transferred into the branch.

- Compare received items with invoice, supplier list, or transfer note.
- Check product name, variant, SKU/barcode, quantity, and item condition.
- Separate damaged, missing, wrong, reserved, and high-value items before recording.
- Receive/add quantity in StoreHub under the correct product and outlet.
- Label price/category and move items to shelf, storage, display case, or locked case.

### Stocktake / Stock Count

Use for daily spot count, weekly category count, monthly stock count, or full stocktake.

- Select the count scope before starting: full store, category, shelf, display case, high-value case, or reserved area.
- Freeze movement in the counted area while counting; do not sell/move items from that area until count is submitted or paused clearly.
- Count physical quantity by SKU/product/variant.
- Compare physical count with StoreHub expected quantity.
- Record discrepancy reason where known: sold not deducted, received not added, damaged, misplaced, reserved, missing, wrong SKU, or duplicate product.
- Submit or save the stocktake only after recounting any mismatch.

### Adjust / Follow Up

- Never hide discrepancies by adjusting without reason.
- Report high-value discrepancy immediately.
- After approved adjustment, verify StoreHub quantity, shelf quantity, and display quantity match.
- Record items to reorder and items that should be moved to locked/high-value storage.

## Checklist Writing Rules

When converting to web checklist, keep tasks action-based and ordered:

1. Add new product if needed.
2. Receive stock into StoreHub.
3. Count physical stock by selected scope.
4. Compare StoreHub quantity with physical quantity.
5. Recount mismatches.
6. Record/submit discrepancy.
7. Label and place stock correctly.
8. Report issues and low-stock items.

## UI Rules for Checklist Details

- Do not show the visible text "เพิ่มรายละเอียด" for extra fields.
- Keep extra fields such as upload image, email, cash input, and notes inside the same task box as the related checkbox.
- Do not use dropdown controls for task details unless explicitly requested; show same-topic details inside the task box.

## UPMAN Owner UI Pattern

Use the UPMAN Owner dashboard as the main working UI for owner/admin operation monitoring. Do not use the old static `preview.html` SOP library UI when the user asks for the UPMAN work interface.

Primary route:

- Next app route: `/admin/ops`
- Local preview: `http://localhost:3020/admin/ops` when the dev server is running on port `3020`

Expected page identity:

- Brand mark: `UPMAN Owner`
- Main title: `Operation Monitor`
- Owner profile: `เจ้าของร้าน`
- Business context: Up Level card shop operations, staff checklist, online orders, stock, high-value cards, cash review, and owner follow-up.

Layout pattern:

- Left dark owner sidebar with grouped navigation.
- Top operation bar with date range and notification action.
- Branch/filter band near the top.
- Dense owner dashboard content with compact cards, tables, status pills, and action buttons.
- Keep the UI operational and scan-friendly, not a marketing landing page.

Required operation modules:

- Finish Tasks summary for daily, weekly, and monthly work.
- Checklist issue summary from staff task completion.
- Live Checklist Tracking with filters for query, status, and staff.
- Operation Risk Queue for late, missing, stock alert, and checklist issue counts.
- Stock and High Value Card Monitor with StoreHub/mock source status.
- Order and Shipping Control for front store, Facebook, LINE, Shopee, TikTok, and Instagram orders.
- Sales and Cash Review with cash difference status.
- Owner Action Queue for approve, request correction, and follow-up actions.
- Timeline / Audit Log for owner traceability.
- Settings / Role Management summary for staff, roles, shifts, branch, and checklist master.

Interaction rules:

- Owner actions should remain visible in-row where possible: `Approve`, `Request Correction`, and `Follow Up`.
- Detail views should open as a drawer or side panel without losing the dashboard context.
- Status labels should use clear tones: green for complete/approved, yellow for waiting or medium risk, red for late/problem/high risk, blue for in progress, gray for neutral.
- Thai operation labels are preferred for staff-facing work; English labels are acceptable for admin dashboard categories already used in UPMAN.
- If StoreHub environment variables are missing, show mock stock data with a clear mock/source message instead of breaking the page.

Preview/debug rules:

- For UPMAN UI preview, start the Next dev server and open `/admin/ops`.
- If `localhost:3000` is listening but does not respond, use a fresh port such as `3020`.
- Verify the route returns `200 OK` and contains `UPMAN Owner` before telling the user the preview is ready.

## Project Performance Rules

Use these rules when creating or updating the Project Performance / Performance Score page.

- Use only data that can be checked from a declared source: Google Sheet schedule, StoreHub CSV export, checklist Google Sheet/Form, or a manual record saved in the performance input.
- Do not guess, fabricate, or keep mock/sample/fixture records in the score calculation.
- If a required value cannot be verified from the available source, leave it out of scoring and ask the user for the source file, screenshot, row, or exact manual record.
- Every deduction shown to the team must include where the data came from and enough detail to verify the reason.
