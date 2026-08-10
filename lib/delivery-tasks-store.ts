"use client";

// Client store สำหรับงานส่งของจากออเดอร์เว็บกิลด์ — คุยกับ /api/delivery-tasks เท่านั้น
// (Admin SDK + session ฝั่ง server) ไม่แตะ Firestore ตรงจากเบราว์เซอร์.

import type { DeliveryTask } from "./delivery-tasks.ts";
import type { ShiftCode } from "./shift-schedule.ts";

export type DeliveryFeed = {
  tasks: DeliveryTask[];
  today: string;
  shiftToday: ShiftCode | null;
  isAdmin: boolean;
  staffCode: string;
};

const ENDPOINT = "/api/delivery-tasks";

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((data) => (data as { detail?: string }).detail)
      .catch(() => undefined);
    throw new Error(detail || `delivery-tasks write failed: ${res.status}`);
  }
}

export async function fetchDeliveryFeed(branch: string): Promise<DeliveryFeed> {
  const res = await fetch(`${ENDPOINT}?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`delivery-tasks read failed: ${res.status}`);
  return (await res.json()) as DeliveryFeed;
}

export async function claimDelivery(id: string): Promise<void> {
  await post({ action: "claimDelivery", id });
}

export async function handoffDelivery(id: string, branch: string): Promise<void> {
  await post({ action: "handoffDelivery", id, branch });
}

export async function shipDelivery(id: string, trackingNumber: string): Promise<void> {
  const tracking = trackingNumber.trim();
  if (!tracking) throw new Error("ต้องกรอกเลข tracking ก่อนปิดงานส่งของ");
  await post({ action: "shipDelivery", id, trackingNumber: tracking });
}
