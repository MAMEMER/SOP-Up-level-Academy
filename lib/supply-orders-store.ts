"use client";

// Client store ของเติมสต็อกที่สั่งแล้ว — คุยกับ /api/supply-orders เท่านั้น.

import type { ReadOrderResult, SupplyCheck, SupplyOrder } from "./supply-orders.ts";

export type SupplyFeed = { orders: SupplyOrder[]; today: string; isAdmin: boolean; staffCode: string };

const ENDPOINT = "/api/supply-orders";

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
    if (data.error === "forbidden") throw new Error("ยกเลิกได้เฉพาะคนที่ลงออเดอร์ หรือเจ้าของร้าน");
    throw new Error(data.detail || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return data;
}

export async function fetchSupplyFeed(branch?: string): Promise<SupplyFeed> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const res = await fetch(`${ENDPOINT}${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`supply read failed: ${res.status}`);
  return (await res.json()) as SupplyFeed;
}

export type SupplyDraftItem = { id?: string; name: string; qty: number; unit: string; productId?: string };

export type SupplyDraft = {
  branch: string;
  supplier: string;
  orderedDate: string;
  total: string;
  note: string;
  photos: string[];
  items: SupplyDraftItem[];
  aiRead: boolean;
};

export async function readOrderPhotos(photos: string[], branch: string): Promise<ReadOrderResult> {
  const data = await post<{ ok: true; result: ReadOrderResult }>({ action: "read", photos, branch });
  return data.result;
}

export async function saveSupplyOrder(draft: SupplyDraft, id?: string): Promise<string> {
  const result = await post<{ ok: true; id?: string }>({ action: id ? "update" : "create", id, ...draft });
  return result.id || id || "";
}

export const cancelSupplyOrder = (id: string, cancelled = true) => post({ action: "cancel", id, cancelled });
export const checkSupplyItem = (id: string, itemId: string, check: SupplyCheck | null, receivedQty?: number, note = "") =>
  post({ action: "check", id, itemId, check, receivedQty, note });
export const finishReceiving = (id: string, deliveryPhotos: string[], receiveNote: string) =>
  post({ action: "finish", id, deliveryPhotos, receiveNote });
export const reopenReceiving = (id: string) => post({ action: "reopen", id });
export const updateFollowUp = (id: string, input: Record<string, unknown>) => post({ action: "followUp", id, ...input });
