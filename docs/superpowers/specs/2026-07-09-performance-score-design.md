# Performance Score Design

## Goal

Build an admin page for checking employee performance scores for Up Level store operations. The page prioritizes calculation accuracy and auditability over visual polish. It must show how each employee score is produced, which data source caused each deduction, and whether the employee qualifies for incentive or coaching.

## Approved Direction

Use a calculation-first prototype with mock/import-ready data before connecting live APIs.

This keeps the score rules testable while Google Sheet and StoreHub access details are still external. The data layer must be structured so a future Google Sheet reader and StoreHub reader can replace mock data without changing the scoring engine or UI behavior.

## Route

Create an admin-only dashboard page:

- `/admin/performance-score`

Keep the existing `/admin/performance` page intact unless a navigation link is added.

## Review Periods

The page must support these preset periods:

- `ครึ่งเดือนที่แล้ว`
- `1 ก.ค. 2026 ถึงปัจจุบัน`

The period controls which shifts, clock events, stock counts, checklist events, complaints, and assignments are included in the score.

## Data Sources

### Google Sheet Schedule

Google Sheet is the primary source for planned shifts. It is updated before the 30th of every month.

Minimum normalized fields:

- `employeeName`
- `workDate`
- `scheduledStart`
- `scheduledEnd`
- `shiftLabel`
- `source`

The scoring engine must compare all attendance records against this schedule, not against StoreHub clock-in records alone.

### StoreHub Attendance

StoreHub is used for actual clock-in and clock-out records.

Minimum normalized fields:

- `employeeName`
- `workDate`
- `clockIn`
- `clockOut`
- `source`

Clock-in records are matched by employee name and work date. If StoreHub has a clock event but Google Sheet has no planned shift, show it as an unmatched record and do not silently include it in attendance scoring.

### StoreHub Stock Count

StoreHub stock count data is used to score weekly and monthly stock work.

Minimum normalized fields:

- `employeeName`
- `owner`
- `category`
- `countType`
- `dueDate`
- `submittedAt`
- `expectedQuantity`
- `actualQuantity`
- `discrepancyStatus`
- `resolvedWithin24Hours`
- `realLossOccurrence`
- `source`

Supported count types:

- Weekly food and drink count, Monday to Sunday
- Weekly sleeve/equipment count, Tuesday
- Weekly box count, Wednesday
- Monthly single count, due on the 1st and accepted no later than the 2nd
- Monthly bulk count, due on the 15th and accepted no later than the 16th

### Manual Operational Inputs

The first build may use mock/import-ready records for items that are not yet available from Google Sheet or StoreHub:

- Checklist records
- Customer complaints
- Critical errors
- Assigned work items

The UI must label these as imported/mock source data until a real connector is added.

## Score Model

Total score is 100 points.

- Attendance: 20 points
- Stock count: 20 points
- Checklist: 20 points
- Customer service: 20 points
- Assigned work: 20 points

The page must show both the category score and the deduction events behind it.

## Attendance Rules

Attendance starts from 20 points for the selected period.

Rules:

- Use Google Sheet planned shifts as the baseline.
- Missing a scheduled shift deducts 2 points.
- Late clock-in deducts 2 points.
- Late clock-in within 10 minutes deducts 1 point.
- Do not reduce below 0 points.

The UI must show:

- scheduled time
- actual clock-in
- late minutes
- deduction
- reason

## Stock Rules

Stock has 20 total points:

- Weekly count: 10 points
- Monthly count: 10 points

Submission timing:

- Complete and on time: full points for that count bucket.
- Late submission: deduct 2 points per late day.
- More than 5 days late: deduct 10 points for that bucket.

Discrepancy handling:

- If a mismatch is found, investigated within 24 hours, explained, and corrected, no discrepancy deduction is applied.
- Confirmed real loss occurrence 1 deducts 10 points.
- Confirmed real loss occurrence 2 deducts 20 points.
- Fraud or hidden information is flagged for management review instead of being treated as a normal score deduction only.

The stock category score must not go below 0.

## Checklist Rules

Checklist starts from 20 points.

Rules:

- Complete and verifiable checklist: 20 points.
- Missing important checklist item deducts 2 points each time.
- Backfilled submission deducts 1 point each time.
- False record deducts 10 points and triggers coaching flag.
- Do not reduce below 0 points.

Examples include opening/closing, cleaning, restocking, equipment checks, and online order work.

## Customer Service Rules

Customer service has 20 total points:

- Customer feedback: 10 points
- Event/customer response work: 10 points

Feedback bucket:

- No complaint: 10 points
- Complaint fixed immediately: deduct 2 points per complaint, minimum score follows the repeated/severe rules below.
- Repeated same complaint: 5 points.
- Severe complaint: 0 points.

Event and response bucket:

- No complaint or critical error: 10 points.
- Complaint or critical error fixed immediately: deduct 2 points each time.
- Repeated same issue: 5 points.
- Severe issue: 0 points.

Repeated or severe critical errors must trigger a coaching flag.

## Assigned Work Rules

Assigned work starts from 20 points per selected period.

Only mutually agreed shop-related work with clear due date and target is included.

Score mapping:

- Finished early with quality: 20 points
- Finished on time: 18 points
- Finished but needs revision: 15 points
- Late by no more than 1 day: 12 points
- Not finished after due date: 0 points and coaching flag

When multiple assigned work items exist in the period, calculate the average item score and cap it at 20.

## Incentive Mapping

Total score determines incentive:

- 90-100: 100%
- 80-89: 80%
- 70-79: 50%
- 60-69: 20%
- Below 60: no incentive and weekly performance assessment

Employees below 60 points must be flagged for 4 weeks of coaching with a target score of at least 70.

## Page Behavior

The page should be dense and operational:

- Period selector at the top.
- Summary cards for team average, employees below 60, unresolved stock issues, and missing clock-ins.
- Employee score table with total score, incentive percent, category breakdown, and coaching flag.
- Expandable detail area per employee showing every deduction event.
- Source status panel showing whether schedule, attendance, stock, checklist, service, and assigned work data are mock/import/live.
- Clear warnings for unmatched names, missing shifts, missing StoreHub clock-ins, and unresolved stock discrepancies.

## Calculation Engine

Create a pure TypeScript scoring module separate from React UI.

Suggested exports:

- `calculateAttendanceScore`
- `calculateStockScore`
- `calculateChecklistScore`
- `calculateCustomerServiceScore`
- `calculateAssignedWorkScore`
- `calculateEmployeePerformanceScore`
- `getIncentiveTier`

The scoring functions must accept normalized plain objects and return:

- numeric score
- max score
- deduction records
- flags
- source warnings

## Testing

Add focused tests for the scoring engine before wiring the UI.

Required cases:

- On-time attendance gives full attendance points.
- Late within 10 minutes deducts 1 point.
- Late over 10 minutes deducts 2 points.
- Absent scheduled shift deducts 2 points.
- Attendance score does not go below 0.
- Stock late submission deducts 2 points per day.
- Stock submission more than 5 days late deducts 10 points.
- Resolved stock mismatch within 24 hours does not deduct discrepancy points.
- Confirmed real stock loss deducts according to occurrence count.
- False checklist record deducts 10 points and flags coaching.
- Severe complaint sets the relevant service bucket to 0.
- Not-finished assigned work gives 0 and flags coaching.
- Total score maps to correct incentive tier.

## Out Of Scope For First Build

- Live Google Sheet authentication.
- Live StoreHub authentication beyond existing stock API patterns.
- Automatic Facebook, Instagram, Shopee, LINE, or Google Review ingestion.
- Payroll export.
- Multi-branch scoring rules beyond source-ready data fields.

## Implementation Notes

Use existing Next.js and dashboard patterns in this repository. Keep styling minimal and consistent with the current admin pages. Do not introduce a charting library for the first build because the user requested function accuracy over visual design.
