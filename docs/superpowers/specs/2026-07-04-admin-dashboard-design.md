# Admin Dashboard Design

## Goal

Build a separate Admin Dashboard for a card shop owner or manager to monitor daily staff checklist work, orders, cash, stock, issues, approvals, and audit history. The Admin view is operational, not a landing page. It must start directly at the dashboard and let the owner make fast decisions.

## Chosen Direction

Use the approved **Operations Command Center** layout:

- Dedicated Admin route separate from Staff Checklist.
- Sidebar navigation for admin-only sections.
- Top bar with work date, shop status, user role, search, and filters.
- Summary cards at the top.
- Dense operational panels and tables below.
- Detail drawer for inspecting records without leaving the dashboard.

## FoodStory-Inspired UI Direction

The Admin Dashboard should use FoodStory Owner Summary as product inspiration, adapted for a card shop instead of a cafe or restaurant. The user provided reference screenshots of the FoodStory summary dashboard, so the layout should follow the same owner-report rhythm while changing the content model to card-shop operations.

FoodStory-inspired patterns to adapt:

- Left rail navigation with grouped report/operation/settings menu items.
- Header with product mark, page title, date range picker, and notification icon.
- Branch selector card below the header with a clear confirm/apply button.
- Summary-first dashboard with the most important business numbers at the top.
- Date, branch, and channel filters near the top bar.
- Revenue and order metrics shown before operational detail.
- Payment breakdown by cash, transfer, QR, and card.
- Bill/order donut card showing total orders and channel split.
- Cancel/refund/problem transaction card.
- Daily sales chart.
- Hourly sales bar chart with open-hour/close-hour toggle.
- Top products table.
- Inventory value/loss card.
- Customer/member card.
- Promotion or campaign card.
- Employee action list.
- Stock and employee monitoring connected into the same owner view.
- Multi-branch readiness even if the first mock data uses one branch.

Card-shop adaptation:

- Replace restaurant/cafe concepts such as tables, menu items, and food stock with card-shop concepts:
  - Orders by channel:หน้าร้าน, Facebook, LINE, Shopee, TikTok, Instagram.
  - Products: booster packs, sleeves, deck boxes, single cards, graded cards.
  - High-value cards and showcase cabinet checks.
  - Tournament/event work.
  - Paid-not-shipped and missing-tracking orders.
- Keep sales summary prominent, but add operational health: checklist completion, late tasks, staff online, issues, stock alerts, and follow-up queue.
- Visual style should be quieter and denser than the current green Staff Checklist: white workspace, light gray background, compact cards, clear red/yellow/green/blue status badges, and table-first scanning.
- Use FoodStory-like visual structure but not restaurant-specific labels or assets. The UPMAN design should feel like owner software for a card shop: clean white cards, light gray page background, teal action buttons, green/orange chart accents, and compact Thai report labels.

## Route And Separation

Create a new admin dashboard page at:

- `/admin/ops`

The existing Staff Checklist remains at `/checklist`. Staff uses the checklist workflow to create and update work records. Admin uses `/admin/ops` to read the same operational state, review it, and write review actions back into the shared store.

In the first implementation, the shared source is a browser/local mock store. The code should be structured so the store can later be replaced by Supabase or another backend without rewriting UI components.

## Required Sections

The Admin Dashboard will include these sections in one command-center page, navigated by sidebar anchors or internal tabs:

1. **Overview**
   - Shop status.
   - Branch selector.
   - Date selector.
   - Sales channel selector.
   - Completion rate.
   - Total tasks, completed tasks, pending tasks, late tasks.
   - Pending orders.
   - Today sales and order count.
   - Issue count.
   - Stock alerts.
   - Staff online.
   - Sales trend or hourly sales strip for today.
   - FoodStory-style report widgets adapted for card shop:
     - Net sales.
     - Gross sales / discounts / tax / service / total.
     - Order donut by channel.
     - Refund/cancel/problem order summary.
     - Daily sales chart.
     - Hourly sales chart.
     - Top-selling card products.
     - Stock value and lost/damaged stock.
     - Customers/member summary.
     - Promotion/event summary.
     - Employee action feed.

2. **Staff Activity Monitor**
   - Staff name, shift, start time, last activity, completed tasks, pending tasks.
   - Status: normal, late, needs review, shift closed.
   - Latest task and staff note.
   - Clickable staff detail in the dashboard drawer.

3. **Live Checklist Tracking**
   - Checklist grouped by work phase:
     - Before opening.
     - Opening.
     - Front-store sales.
     - Online admin.
     - Stock.
     - Packing and shipping.
     - Events.
     - Before closing.
     - Closing.
   - Each row shows title, status, owner, start time, completion time, evidence, note, and admin review status.
   - Actions: Admin Review, Mark Follow Up, Request Correction, Approve.

4. **Order & Shipping Control**
   - Today order counts by payment, packing, and shipping state.
   - Order table with order ID, customer, channel, total, payment status, packing status, shipping status, tracking number, owner, updated time, and note.
   - Channel summary for front store, Facebook, LINE, Shopee, TikTok, and Instagram.
   - Use "bill" concepts from FoodStory as "orders" for the card shop.

5. **Sales & Cash Review**
   - Total sales, front-store sales, online sales.
   - Cash, transfer, QR, card amounts.
   - Opening change, cash remaining, expected cash, cash difference.
   - Money status: matched, mismatch, needs review.
   - Daily Closing Review with report submitted, system matched, evidence complete, expenses, and owner approval action.
   - FoodStory-style owner summary blocks:
     - Net sales.
     - Gross sales.
     - Discounts.
     - Refunds/voided sales.
     - Average order value.
     - Sales by channel.
     - Payment method breakdown.

6. **Stock & High Value Card Monitor**
   - Low stock, out of stock, restock needed.
   - High-value display cards.
   - Reserved cards, sold cards, changed-today cards.
   - Damaged or lost stock reports.
   - Top product table should show best-selling products by quantity and revenue:
     - Booster packs.
     - Sleeves.
     - Deck boxes.
     - Single cards.
     - Graded cards.
     - Event entry products.

7. **Issue & Follow Up Center**
   - Issues for waiting customer, paid-not-shipped orders, incomplete order data, cash mismatch, lost stock, damaged stock, complaint, incomplete checklist, missing report, and next-day handoff.
   - Actions: Assign, Resolve, Add Note.

8. **Manager Review & Approval**
   - Review checklist items.
   - Approve, reject/request correction, mark follow up, add note.
   - View change history.
   - Approve daily closing.

9. **Timeline / Audit Log**
   - Staff shift start, shop opened, checklist ticked, order created, slip verified, packed, tracking sent, issue reported, correction requested, approved, shop closed.
   - Each event shows time, type, actor, detail, previous status, and new status.

10. **Settings / Role Management**
    - Staff list.
    - Roles: Owner, Manager, Staff.
    - Shifts.
    - Checklist master.
    - Checklist deadlines.
    - Work categories.
    - Branches.
    - Visibility permissions.

## Data Model

Create mock data and TypeScript types for:

- `Staff`
- `Shift`
- `ChecklistItem`
- `ChecklistStatus`
- `Order`
- `Payment`
- `Shipment`
- `SaleSummary`
- `StockItem`
- `HighValueCard`
- `Issue`
- `AdminReview`
- `AuditLog`

The model should support future backend replacement by keeping plain serializable objects with stable IDs.

## Store And Service Design

Create an admin dashboard store/service separate from UI components. Required operations:

- `getAdminDashboardState`
- `updateChecklistStatus`
- `approveChecklistItem`
- `requestCorrection`
- `markChecklistFollowUp`
- `createIssue`
- `assignIssue`
- `resolveIssue`
- `addIssueNote`
- `approveDailyClosing`

For the prototype, these functions can operate on local state initialized from mock data. They should return updated state instead of mutating hidden module state, so tests can call them directly.

## Staff And Admin Data Flow

The shared workflow should behave as follows:

- Staff ticks checklist -> Admin checklist status updates.
- Staff adds note or issue -> Admin Issue Center shows it.
- Staff updates order -> Admin Order Control updates.
- Staff submits closing report -> Admin Daily Closing Review shows it.
- Admin requests correction -> Staff-facing state can show `Correction Requested`.
- Admin approves work -> Staff-facing state can show `Approved`.

Initial implementation will simulate this with shared mock/local state. Backend replacement later should map these store operations to database reads/writes.

## UI Requirements

The UI must be a practical operations dashboard:

- Thai-first copy.
- FoodStory-like sidebar navigation with grouped sections and icon-friendly rows.
- Top bar with UPMAN mark, page title, date range, notification icon, branch, sales channel, shop status, and role.
- Branch selector block under the header with an apply button.
- Summary cards.
- Fast-scanning tables.
- Status badges:
  - Green: done, approved, normal.
  - Yellow: pending, waiting review.
  - Red: issue, late, mismatch.
  - Blue: in progress.
  - Gray: not started, closed.
- Search.
- Filters by staff, category, status, and severity.
- Detail drawer/modal.
- Clear action buttons: Approve, Request Correction, Assign, Resolve, Follow Up.
- Desktop and tablet responsive layout.
- Dashboard cards should use an owner-report grid:
  - Large net sales card on the left.
  - Order/channel donut and cancellation/problem card on the right.
  - Full-width daily sales chart.
  - Two-column lower grid for hourly sales, top products, stock, customers, promotion, employee actions, and operational queue.

## Component Boundaries

Create focused components:

- `AdminOpsDashboard`
- `AdminSidebar`
- `AdminTopbar`
- `AdminSummaryCards`
- `StaffActivityMonitor`
- `LiveChecklistTracking`
- `OrderShippingControl`
- `SalesCashReview`
- `StockMonitor`
- `IssueFollowUpCenter`
- `ManagerReviewPanel`
- `AuditTimeline`
- `AdminSettingsPanel`
- `AdminDetailDrawer`
- `StatusBadge` or admin-specific status badge helper if existing badge is not enough.

Components should receive data and callbacks as props where practical. Business behavior belongs in the store/service layer.

## Testing

Add tests for store/service behavior before implementation:

- Approving a checklist item changes its admin review status and writes an audit log.
- Requesting correction changes review status, stores a reason, and writes an audit log.
- Marking follow up changes item state and creates or updates follow-up visibility.
- Assigning an issue changes assignee and writes an audit log.
- Resolving an issue changes status and writes an audit log.
- Dashboard summary counts completed, pending, late, orders, issues, stock alerts, and staff online correctly.

Run:

- `npm test`
- `npm run lint`
- `npm run build`

## Scope For First Implementation

In scope:

- One working Admin page at `/admin/ops`.
- Mock data and pure store/service functions.
- All required sections represented.
- Search/filter interactions.
- Detail drawer.
- Core actions for checklist review and issue handling.
- Build/test verification.

Out of scope for this first pass:

- Real Supabase schema migrations.
- Real-time subscriptions.
- Authentication or role gating beyond fitting into the existing app shell.
- Multi-page admin routing for every section.
- Persisting admin actions across browser refresh unless local storage is straightforward and low risk.
