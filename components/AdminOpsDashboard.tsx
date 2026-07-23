"use client";

import { useEffect, useMemo, useState } from "react";
import {
  mockAdminDashboardState,
  type AdminDashboardState,
  type ChecklistItem,
  type Issue,
  type Order,
  type Staff
} from "../lib/admin-dashboard-data.ts";
import {
  approveChecklistItem,
  getChecklistIssues,
  getDailyTaskStatusSummary,
  getFinishTaskGroups,
  getAdminDashboardSummary,
  markChecklistFollowUp,
  requestCorrection
} from "../lib/admin-dashboard-store.ts";

type DrawerItem =
  | { type: "staff"; item: Staff }
  | { type: "checklist"; item: ChecklistItem }
  | { type: "order"; item: Order }
  | { type: "issue"; item: Issue }
  | null;

const actorId = "owner-1";

const channelLabels: Record<Order["channel"], string> = {
  front_store: "หน้าร้าน",
  facebook: "Facebook",
  line: "LINE",
  shopee: "Shopee",
  tiktok: "TikTok",
  instagram: "Instagram"
};

const checklistStatusLabels: Record<ChecklistItem["status"], string> = {
  not_started: "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
  late: "ล่าช้า",
  issue: "มีปัญหา"
};

const reviewLabels: Record<ChecklistItem["adminReviewStatus"], string> = {
  waiting_review: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  correction_requested: "ขอแก้ไข",
  follow_up_required: "ต้องติดตาม"
};

const issueLabels: Record<Issue["status"], string> = {
  open: "เปิดอยู่",
  in_progress: "กำลังแก้",
  waiting_review: "รอตรวจ",
  closed: "ปิดแล้ว"
};

function money(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

function staffName(state: AdminDashboardState, id: string) {
  return state.staff.find((staff) => staff.id === id)?.name || id;
}

function statusTone(status: string) {
  if (["completed", "approved", "closed", "online", "matched"].includes(status)) return "green";
  if (["waiting_review", "pending_slip", "waiting", "medium"].includes(status)) return "yellow";
  if (["late", "issue", "urgent", "high", "missing_tracking", "problem", "mismatch", "correction_requested"].includes(status)) return "red";
  if (["in_progress", "needs_review"].includes(status)) return "blue";
  return "gray";
}

function AdminStatus({ label, status }: { label: string; status: string }) {
  return <span className={`admin-status status-${statusTone(status)}`}>{label}</span>;
}

function Drawer({ drawer, state, onClose }: { drawer: DrawerItem; state: AdminDashboardState; onClose: () => void }) {
  if (!drawer) return null;

  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <aside className="admin-drawer" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="admin-icon-button" onClick={onClose} aria-label="ปิดรายละเอียด">×</button>
        {drawer.type === "staff" ? (
          <>
            <p className="admin-kicker">Staff detail</p>
            <h3>{drawer.item.name}</h3>
            <dl>
              <dt>บทบาท</dt><dd>{drawer.item.role}</dd>
              <dt>กะ</dt><dd>{drawer.item.shift}</dd>
              <dt>เริ่มงาน</dt><dd>{drawer.item.startedAt}</dd>
              <dt>ล่าสุด</dt><dd>{drawer.item.lastActiveAt}</dd>
              <dt>งานล่าสุด</dt><dd>{drawer.item.latestTask}</dd>
              <dt>หมายเหตุ</dt><dd>{drawer.item.note}</dd>
            </dl>
          </>
        ) : null}
        {drawer.type === "checklist" ? (
          <>
            <p className="admin-kicker">Checklist detail</p>
            <h3>{drawer.item.title}</h3>
            <p>{drawer.item.description}</p>
            <dl>
              <dt>หมวด</dt><dd>{drawer.item.category}</dd>
              <dt>ผู้รับผิดชอบ</dt><dd>{staffName(state, drawer.item.assignedTo)}</dd>
              <dt>สถานะ</dt><dd>{checklistStatusLabels[drawer.item.status]}</dd>
              <dt>เริ่ม</dt><dd>{drawer.item.startedAt || "-"}</dd>
              <dt>เสร็จ</dt><dd>{drawer.item.completedAt || "-"}</dd>
              <dt>Deadline</dt><dd>{drawer.item.dueAt}</dd>
              <dt>หลักฐาน</dt><dd>{drawer.item.evidence || "-"}</dd>
              <dt>หมายเหตุ</dt><dd>{drawer.item.note || "-"}</dd>
              <dt>เหตุผลแก้ไข</dt><dd>{drawer.item.correctionReason || "-"}</dd>
            </dl>
          </>
        ) : null}
        {drawer.type === "order" ? (
          <>
            <p className="admin-kicker">Order detail</p>
            <h3>{drawer.item.id}</h3>
            <dl>
              <dt>ลูกค้า</dt><dd>{drawer.item.customerName}</dd>
              <dt>ช่องทาง</dt><dd>{channelLabels[drawer.item.channel]}</dd>
              <dt>ยอดเงิน</dt><dd>{money(drawer.item.total)} บาท</dd>
              <dt>ชำระเงิน</dt><dd>{drawer.item.paymentStatus}</dd>
              <dt>แพ็กของ</dt><dd>{drawer.item.packingStatus}</dd>
              <dt>จัดส่ง</dt><dd>{drawer.item.shippingStatus}</dd>
              <dt>Tracking</dt><dd>{drawer.item.trackingNumber || "-"}</dd>
              <dt>ผู้รับผิดชอบ</dt><dd>{staffName(state, drawer.item.assignedTo)}</dd>
              <dt>หมายเหตุ</dt><dd>{drawer.item.note}</dd>
            </dl>
          </>
        ) : null}
        {drawer.type === "issue" ? (
          <>
            <p className="admin-kicker">Issue detail</p>
            <h3>{drawer.item.title}</h3>
            <p>{drawer.item.detail}</p>
            <dl>
              <dt>ความรุนแรง</dt><dd>{drawer.item.severity}</dd>
              <dt>ผู้รับผิดชอบ</dt><dd>{staffName(state, drawer.item.assignedTo)}</dd>
              <dt>สร้างเมื่อ</dt><dd>{drawer.item.createdAt}</dd>
              <dt>Deadline</dt><dd>{drawer.item.deadline}</dd>
              <dt>สถานะ</dt><dd>{issueLabels[drawer.item.status]}</dd>
              <dt>Notes</dt><dd>{drawer.item.notes.join(", ") || "-"}</dd>
            </dl>
          </>
        ) : null}
      </aside>
    </div>
  );
}

export function AdminOpsDashboard({ isOwner = false }: { isOwner?: boolean }) {
  const [state, setState] = useState(mockAdminDashboardState);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [drawer, setDrawer] = useState<DrawerItem>(null);
  // ยอดขาย / มูลค่าเงิน = owner-only (Champ + Nem). Regular admins see "🔒".
  const showMoney = (value: number) => (isOwner ? money(value) : "🔒");
  const [stockSource, setStockSource] = useState<"mock" | "storehub">("mock");
  const [stockMessage, setStockMessage] = useState("ใช้ข้อมูล mock ระหว่างรอการเชื่อม StoreHub");

  useEffect(() => {
    let active = true;

    async function loadStoreHubStock() {
      try {
        const response = await fetch("/api/storehub/stock", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        if (Array.isArray(payload.stockItems) && Array.isArray(payload.highValueCards)) {
          setState((current) => ({
            ...current,
            stockItems: payload.stockItems,
            highValueCards: payload.highValueCards
          }));
          setStockSource(payload.source === "storehub" ? "storehub" : "mock");
          setStockMessage(payload.source === "storehub" ? `ดึงจาก StoreHub ล่าสุด ${payload.fetchedAt || ""}` : payload.reason || "ใช้ข้อมูล mock");
        }
      } catch {
        if (active) setStockMessage("เชื่อม StoreHub ไม่สำเร็จ ใช้ข้อมูล mock");
      }
    }

    void loadStoreHubStock();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => getAdminDashboardSummary(state), [state]);
  const finishTaskGroups = useMemo(() => getFinishTaskGroups(state), [state]);
  const dailyTaskSummary = useMemo(() => getDailyTaskStatusSummary(state), [state]);
  const checklistIssues = useMemo(() => getChecklistIssues(state), [state]);
  const queryText = query.trim().toLowerCase();

  const filteredChecklist = state.checklistItems.filter((item) => {
    const matchesQuery = `${item.title} ${item.category} ${item.note || ""}`.toLowerCase().includes(queryText);
    const matchesStatus = statusFilter === "all" || item.status === statusFilter || item.adminReviewStatus === statusFilter;
    const matchesStaff = staffFilter === "all" || item.assignedTo === staffFilter;
    return matchesQuery && matchesStatus && matchesStaff;
  });

  const filteredOrders = state.orders.filter((order) =>
    `${order.id} ${order.customerName} ${order.note}`.toLowerCase().includes(queryText)
  );
  const followUps = state.checklistItems.filter((item) => item.followUp).slice(0, 5);
  const topProducts = [...state.stockItems].sort((left, right) => right.estimatedValue - left.estimatedValue).slice(0, 6);

  function handleApproveChecklist(itemId: string) {
    setState((current) => approveChecklistItem(current, itemId, actorId));
  }

  function handleCorrection(itemId: string) {
    setState((current) => requestCorrection(current, itemId, actorId, "กรุณาแก้ไขหลักฐานหรือรายละเอียดงานให้ครบ"));
  }

  function handleFollowUp(itemId: string) {
    setState((current) => markChecklistFollowUp(current, itemId, actorId));
  }

  return (
    <main className="admin-ops">
      <div className="admin-owner-shell">
        <aside className="admin-owner-sidebar">
          <div className="admin-owner-brand"><span>U</span><strong>UPMAN Owner</strong></div>
          <div className="admin-owner-profile">
            <strong>เจ้าของร้าน</strong>
            <small>owner@uplevel-card.com</small>
          </div>
          <nav>
            <p>Operation Monitor</p>
            <a href="#summary">Finish Tasks</a>
            <a href="#checklist">Staff Checklist</a>
            <a href="#orders">ออเดอร์ออนไลน์</a>
            <a href="#stock">สินค้าคงคลัง</a>
            <p>ส่วนเสริมร้านการ์ด</p>
            <a href="#high-value">High Value Cards</a>
            <a href="#checklist">Staff Checklist</a>
            <a href="#issues">Issues & Follow Up</a>
            <a href="#review">Manager Review</a>
            <p>จัดการข้อมูล</p>
            <a href="#settings">พนักงาน / สาขา</a>
          </nav>
        </aside>

        <div className="admin-owner-content">
          <header className="admin-owner-topbar">
            <h2>Operation Monitor</h2>
            <div>
              <span>{state.dateRange}</span>
              <button type="button" className="admin-icon-button" aria-label="แจ้งเตือน">!</button>
            </div>
          </header>

          <section className="admin-filter-card">
            <strong>สาขา</strong>
            <input value={`${state.branch} · Operation checklist · ทุกกะ`} readOnly />
            <button type="button">ตกลง</button>
          </section>

          <section id="summary" className="admin-finish-grid">
            <article className="admin-card admin-task-day-card">
              <div className="admin-card-head">
                <div>
                  <p className="admin-kicker">วันนี้</p>
                  <h3>Task ทั้งหมดในวัน</h3>
                </div>
                <strong>{dailyTaskSummary.total}</strong>
              </div>
              <div className="admin-task-status-grid">
                <div className="task-status-green">
                  <span>เสร็จทันเวลา</span>
                  <strong>{dailyTaskSummary.onTime}</strong>
                </div>
                <div className="task-status-yellow">
                  <span>ช้ากว่ากำหนด</span>
                  <strong>{dailyTaskSummary.late}</strong>
                </div>
                <div className="task-status-red">
                  <span>ไม่ได้ทำ</span>
                  <strong>{dailyTaskSummary.missed}</strong>
                </div>
              </div>
            </article>

            <article className="admin-card admin-checklist-issue-card">
              <div className="admin-card-head">
                <div>
                  <p className="admin-kicker">จากการติ๊ก checklist</p>
                  <h3>ปัญหาที่เกิดขึ้น</h3>
                </div>
                <strong>{checklistIssues.length}</strong>
              </div>
              <div className="admin-checklist-issue-list">
                {checklistIssues.slice(0, 4).map((issue) => {
                  const checklist = state.checklistItems.find((item) => item.id === issue.checklistId);
                  return (
                    <button
                      key={issue.checklistId}
                      type="button"
                      onClick={() => checklist ? setDrawer({ type: "checklist", item: checklist }) : undefined}
                    >
                      <AdminStatus label={issue.severity === "high" ? "สูง" : "กลาง"} status={issue.severity} />
                      <span>{issue.title}<small>{staffName(state, issue.assignedTo)} · {issue.reason}</small></span>
                    </button>
                  );
                })}
              </div>
            </article>

            {finishTaskGroups.map((group) => {
              const percent = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;
              return (
                <article key={group.id} className="admin-card admin-finish-card">
                  <div className="admin-card-head">
                    <div>
                      <p className="admin-kicker">{group.dueLabel}</p>
                      <h3>{group.title} Finish Task</h3>
                    </div>
                    <strong>{percent}%</strong>
                  </div>
                  <div className="admin-finish-progress"><span style={{ width: `${percent}%` }} /></div>
                  <div className="admin-finish-counts">
                    <span>เสร็จแล้ว <strong>{group.completed}</strong></span>
                    <span>ค้าง <strong>{group.total - group.completed}</strong></span>
                    <span>ทั้งหมด <strong>{group.total}</strong></span>
                  </div>
                  <div className="admin-finish-list">
                    {group.tasks.slice(0, 4).map((task) => (
                      <div key={task.id}>
                        <span>{task.completed ? "✓" : "•"}</span>
                        <p>{task.title}<small>{task.dueDate} · {staffName(state, task.owner)}</small></p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="admin-metric-grid">
            <div><span>Completion</span><strong>{summary.completionRate}%</strong></div>
            <div><span>Pending</span><strong>{summary.pendingChecklist}</strong></div>
            <div><span>Late</span><strong>{summary.lateChecklist}</strong></div>
            <div><span>Checklist Issues</span><strong>{checklistIssues.length}</strong></div>
            <div><span>Stock Alerts</span><strong>{summary.stockAlerts}</strong></div>
            <div><span>Staff Online</span><strong>{summary.staffOnline}</strong></div>
          </section>

          <div className="admin-lower-grid">
            <section className="admin-card">
              <div className="admin-card-head">
                <h3>Operation Risk Queue</h3>
                <AdminStatus label="ต้องตามวันนี้" status="late" />
              </div>
              <div className="admin-operation-queue">
                <div><strong>{summary.lateChecklist}</strong><span>Checklist ล่าช้า</span></div>
                <div><strong>{dailyTaskSummary.missed}</strong><span>Task ไม่ได้ทำ</span></div>
                <div><strong>{summary.stockAlerts}</strong><span>Stock alerts</span></div>
                <div><strong>{checklistIssues.length}</strong><span>ปัญหาจาก checklist</span></div>
              </div>
              {checklistIssues.slice(0, 4).map((issue) => (
                <div key={issue.checklistId} className="admin-risk-row">
                  <AdminStatus label={issue.severity === "high" ? "สูง" : "กลาง"} status={issue.severity} />
                  <span>{issue.title}<small>{staffName(state, issue.assignedTo)} · {issue.reason}</small></span>
                </div>
              ))}
            </section>

            <section id="stock" className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h3>สินค้า</h3>
                  <small>{stockMessage}</small>
                </div>
                <AdminStatus label={stockSource === "storehub" ? "StoreHub" : "Mock"} status={stockSource === "storehub" ? "approved" : "waiting_review"} />
              </div>
              <div className="admin-product-stats">
                <span>สินค้าทั้งหมด<strong>119/690</strong></span>
                <span>สินค้าขายดี<strong>Booster</strong></span>
                <span>หมวดขายดี<strong>Single</strong></span>
              </div>
              <table className="admin-table compact">
                <tbody>
                  {topProducts.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.name}</td>
                      <td>{item.remaining}</td>
                      <td>{showMoney(item.estimatedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section id="checklist" className="admin-card">
            <div className="admin-card-head">
              <h3>Live Checklist Tracking</h3>
              <div className="admin-filter-row">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา checklist / order / issue" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">ทุกสถานะ</option>
                  <option value="completed">เสร็จแล้ว</option>
                  <option value="late">ล่าช้า</option>
                  <option value="waiting_review">รอตรวจ</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="follow_up_required">ต้องติดตาม</option>
                </select>
                <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
                  <option value="all">ทุกคน</option>
                  {state.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
              </div>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr><th>งาน</th><th>สถานะ</th><th>คนทำ</th><th>เริ่ม</th><th>เสร็จ</th><th>หลักฐาน</th><th>Review</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {filteredChecklist.map((item) => (
                    <tr key={item.id}>
                      <td><button type="button" className="admin-link-button" onClick={() => setDrawer({ type: "checklist", item })}>{item.title}</button><small>{item.category}</small></td>
                      <td><AdminStatus label={checklistStatusLabels[item.status]} status={item.status} /></td>
                      <td>{staffName(state, item.assignedTo)}</td>
                      <td>{item.startedAt || "-"}</td>
                      <td>{item.completedAt || "-"}</td>
                      <td>{item.evidence || "-"}</td>
                      <td><AdminStatus label={reviewLabels[item.adminReviewStatus]} status={item.adminReviewStatus} /></td>
                      <td className="admin-actions">
                        <button type="button" onClick={() => handleApproveChecklist(item.id)}>Approve</button>
                        <button type="button" onClick={() => handleCorrection(item.id)}>Request Correction</button>
                        <button type="button" onClick={() => handleFollowUp(item.id)}>Follow Up</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="admin-lower-grid three">
            <section id="staff" className="admin-card">
              <h3>Staff Activity Monitor</h3>
              {state.staff.map((staff) => {
                const done = state.checklistItems.filter((item) => item.assignedTo === staff.id && item.status === "completed").length;
                const pending = state.checklistItems.filter((item) => item.assignedTo === staff.id && item.status !== "completed").length;
                return (
                  <button key={staff.id} type="button" className="admin-staff-row" onClick={() => setDrawer({ type: "staff", item: staff })}>
                    <span><strong>{staff.name}</strong><small>{staff.shift} · {staff.latestTask}</small></span>
                    <AdminStatus label={`${done}/${done + pending}`} status={staff.status} />
                  </button>
                );
              })}
            </section>

            <section id="issues" className="admin-card">
              <h3>ปัญหาจาก Checklist</h3>
              {checklistIssues.map((issue) => {
                const checklist = state.checklistItems.find((item) => item.id === issue.checklistId);
                return (
                <div key={issue.checklistId} className="admin-issue-row">
                  <button type="button" className="admin-link-button" onClick={() => checklist ? setDrawer({ type: "checklist", item: checklist }) : undefined}>{issue.title}</button>
                  <AdminStatus label={issue.severity === "high" ? "สูง" : "กลาง"} status={issue.severity} />
                  <small>{staffName(state, issue.assignedTo)} · {issue.reason}</small>
                  <div className="admin-actions">
                    <button type="button" onClick={() => handleFollowUp(issue.checklistId)}>Follow Up</button>
                    <button type="button" onClick={() => handleCorrection(issue.checklistId)}>Request Correction</button>
                  </div>
                </div>
              );
              })}
            </section>

            <section id="review" className="admin-card">
              <h3>Owner Action Queue</h3>
              {followUps.map((item) => (
                <div key={item.id} className="admin-review-row">
                  <strong>{item.title}</strong>
                  <small>{staffName(state, item.assignedTo)} · {item.note || "ต้องตรวจต่อ"}</small>
                  <button type="button" onClick={() => handleApproveChecklist(item.id)}>Approve</button>
                </div>
              ))}
            </section>
          </div>

          <section id="orders" className="admin-card">
            <div className="admin-card-head"><h3>Order & Shipping Control</h3><span>หน้าร้าน / Facebook / LINE / Shopee / TikTok / Instagram</span></div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>Order ID</th><th>ลูกค้า</th><th>ช่องทาง</th><th>ยอดเงิน</th><th>ชำระเงิน</th><th>แพ็ก</th><th>จัดส่ง</th><th>ผู้รับผิดชอบ</th><th>ล่าสุด</th></tr></thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td><button type="button" className="admin-link-button" onClick={() => setDrawer({ type: "order", item: order })}>{order.id}</button></td>
                      <td>{order.customerName}</td>
                      <td>{channelLabels[order.channel]}</td>
                      <td>{showMoney(order.total)}</td>
                      <td><AdminStatus label={order.paymentStatus} status={order.paymentStatus} /></td>
                      <td><AdminStatus label={order.packingStatus} status={order.packingStatus} /></td>
                      <td><AdminStatus label={order.shippingStatus} status={order.shippingStatus} /></td>
                      <td>{staffName(state, order.assignedTo)}</td>
                      <td>{order.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="high-value" className="admin-lower-grid three">
            <article className="admin-card">
              <h3>Stock & High Value Card Monitor</h3>
              {state.highValueCards.map((card) => (
                <div key={card.id} className="admin-stock-row">
                  <strong>{card.name}</strong>
                  <span>{card.category} · {showMoney(card.estimatedValue)}{isOwner ? " บาท" : ""}</span>
                  <AdminStatus label={card.status} status={card.status} />
                </div>
              ))}
            </article>
            <article className="admin-card">
              <h3>Sales &amp; Cash Review {isOwner ? "" : "🔒"}</h3>
              {isOwner ? (
                <dl className="admin-cash-list">
                  <dt>ยอดหน้าร้าน</dt><dd>{money(state.saleSummary.frontStoreSales)}</dd>
                  <dt>ยอดออนไลน์</dt><dd>{money(state.saleSummary.onlineSales)}</dd>
                  <dt>เงินทอนตั้งต้น</dt><dd>{money(state.saleSummary.openingChange)}</dd>
                  <dt>เงินสดคงเหลือ</dt><dd>{money(state.saleSummary.cashRemaining)}</dd>
                  <dt>ส่วนต่างเงิน</dt><dd>{money(state.saleSummary.cashDifference)}</dd>
                </dl>
              ) : (
                <p className="admin-owner-lock">🔒 ยอดขาย/เงินสด เฉพาะเจ้าของ (Champ · เนม) — admin อื่นดูไม่ได้</p>
              )}
              <AdminStatus label="ยอดตรง" status={state.saleSummary.moneyStatus} />
            </article>
            <article className="admin-card">
              <h3>Timeline / Audit Log</h3>
              {state.auditLogs.slice(-6).reverse().map((log) => (
                <div key={log.id} className="admin-audit-row">
                  <strong>{log.action}</strong>
                  <small>{log.actor} · {log.detail}</small>
                </div>
              ))}
            </article>
          </section>

          <section id="settings" className="admin-card admin-settings-grid">
            <h3>Settings / Role Management</h3>
            <span>พนักงาน: {state.staff.length}</span>
            <span>บทบาท: Owner / Manager / Staff</span>
            <span>กะ: {state.shifts.map((shift) => shift.label).join(", ")}</span>
            <span>Checklist master: {state.checklistItems.length} งาน</span>
            <span>สาขา: {state.branch}</span>
            <span>สิทธิ์: Owner เห็นทุกข้อมูล, Staff เห็นงานตัวเอง</span>
          </section>
        </div>
      </div>

      <Drawer drawer={drawer} state={state} onClose={() => setDrawer(null)} />
    </main>
  );
}
