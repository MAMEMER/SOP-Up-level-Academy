"use client";

// Client store ของพัสดุการ์ด — คุยกับ /api/parcel-orders เท่านั้น (Admin SDK + session ฝั่ง server).

import type { ParcelCheck, ParcelItem, ParcelOrder, ParcelPlan } from "./parcel-orders.ts";

export type ParcelFeed = { orders: ParcelOrder[]; today: string; isAdmin: boolean; staffCode: string };

const ENDPOINT = "/api/parcel-orders";

async function post<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error("ส่งไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่");
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: string; error?: string } & T;
  if (!res.ok) {
    if (data.error === "read_only_view") throw new Error("โหมดดูอย่างเดียว — ทำรายการไม่ได้");
    throw new Error(data.detail || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return data;
}

export async function fetchParcelFeed(branch?: string): Promise<ParcelFeed> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const res = await fetch(`${ENDPOINT}${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`parcel read failed: ${res.status}`);
  return (await res.json()) as ParcelFeed;
}

export type ParcelDraftItem = { id?: string; name: string; qty: number; plan: ParcelPlan; price: string; note: string };

export type ParcelDraft = {
  branch: string;
  seller: string;
  sellerLink: string;
  orderedDate: string;
  totalPaid: string;
  trackingNumber: string;
  note: string;
  sellerPhotos: string[];
  items: ParcelDraftItem[];
};

export function draftFromOrder(order: ParcelOrder): ParcelDraft {
  return {
    branch: order.branch,
    seller: order.unmatched && order.seller === "ไม่ทราบผู้ส่ง" ? "" : order.seller,
    sellerLink: order.sellerLink || "",
    orderedDate: order.unmatched ? order.arrivedDate || order.orderedDate : order.orderedDate,
    totalPaid: order.totalPaid ? String(order.totalPaid) : "",
    trackingNumber: order.trackingNumber || "",
    note: order.note || "",
    sellerPhotos: order.sellerPhotos,
    items: order.items.length
      ? order.items.map((item: ParcelItem) => ({
          id: item.id,
          name: item.name,
          qty: item.qty,
          plan: item.plan,
          price: item.price ? String(item.price) : "",
          note: item.note || ""
        }))
      : [{ name: "", qty: 1, plan: "sell", price: "", note: "" }]
  };
}

export async function saveParcelOrder(draft: ParcelDraft, id?: string): Promise<string> {
  const result = await post<{ ok: true; id?: string }>({ action: id ? "update" : "create", id, ...draft });
  return result.id || id || "";
}

export type UnmatchedDraft = { branch: string; seller: string; trackingNumber: string; note: string; arrivalPhotos: string[] };

/** ของมาถึงแต่ยังไม่มีออเดอร์ — แอดมินลงไว้ก่อน เจ้าของร้านจับคู่ทีหลัง */
export async function receiveUnmatchedParcel(draft: UnmatchedDraft): Promise<string> {
  const result = await post<{ ok: true; id?: string }>({ action: "receiveUnmatched", ...draft });
  return result.id || "";
}
export const matchParcel = (id: string, targetId: string) => post({ action: "match", id, targetId });

export const cancelParcel = (id: string, cancelled = true) => post({ action: "cancel", id, cancelled });
export const markArrivedByOwner = (id: string, arrivedDate: string) => post({ action: "arrivedByOwner", id, arrivedDate });
export const resolveParcelProblem = (id: string, index: number, resolution: string) =>
  post({ action: "resolveProblem", id, index, resolution });
export const checkParcelItem = (id: string, itemId: string, check: ParcelCheck | null, note = "") =>
  post({ action: "check", id, itemId, check, note });
export const storeParcelItem = (id: string, itemId: string, stored: boolean) => post({ action: "store", id, itemId, stored });
export const reportParcelProblem = (id: string, note: string) => post({ action: "problem", id, note });

/**
 * อัปวิดีโอแกะกล่อง: ขอ resumable session จาก server → PUT ไฟล์ตรงเข้า Storage (ไม่ผ่าน
 * serverless function ที่รับไฟล์ใหญ่ไม่ได้) → แจ้ง server ให้ตรวจไฟล์แล้วบันทึกว่าของถึง.
 */
export async function uploadUnboxVideo(id: string, file: File, onProgress: (ratio: number) => void): Promise<void> {
  const contentType = file.type || "video/mp4";
  const session = await post<{ ok: true; uploadUrl: string; path: string }>({
    action: "videoUploadUrl",
    id,
    contentType,
    size: file.size
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", session.uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`อัปวิดีโอไม่สำเร็จ (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("อัปวิดีโอไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่"));
    xhr.send(file);
  });
  onProgress(1);
  await post({ action: "arrived", id, path: session.path });
}
