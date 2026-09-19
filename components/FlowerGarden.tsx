"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bloomLabel,
  flowerDateLabel,
  targetPercent,
  type FlowerReceived,
  type GardenSummary
} from "../lib/flower-garden.ts";

// สวนดอกไม้ของพนักงานบนหน้าประเมินผลงาน
//
// พนักงานเห็นดอกไม้ของตัวเองพร้อมข้อความที่ลูกค้าเขียน แต่**ไม่เห็นว่าใครให้** —
// server ตัดฟิลด์ผู้ให้ทิ้งก่อนส่งมาแล้ว ไม่ได้ซ่อนที่หน้าจอ
//
// ใบไม้แห้งนับเป็นจำนวนติดลบตามที่ตกลงกันไว้ แต่**เนื้อความไม่อยู่ที่นี่** — คำติ
// ยังเดินประตูเดิมคือหัวหน้าอ่านก่อนแล้วกดให้เห็นที่ช่องเสียงจากสมาชิกด้านล่าง

type Payload = {
  items: FlowerReceived[];
  summary: GardenSummary | null;
  targetPetals: number;
  potentialPetals?: number;
  staffCount?: number;
  month: string;
};

export function FlowerGarden({ staffCode }: { staffCode: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/flowers?staffCode=${encodeURIComponent(staffCode)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Payload);
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }, [staffCode]);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <section className="flower-garden">
        <h2>สวนดอกไม้</h2>
        <p className="flower-garden-note">เปิดสวนดอกไม้ไม่สำเร็จ — {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="flower-garden">
        <h2>สวนดอกไม้</h2>
        <p className="flower-garden-note">กำลังโหลด…</p>
      </section>
    );
  }

  const summary = data.summary;
  const net = summary?.netPetals ?? 0;
  const pct = targetPercent(net, data.targetPetals);
  const below = pct !== null && pct < 100;

  return (
    <section className="flower-garden">
      <h2>สวนดอกไม้</h2>
      <p className="flower-garden-note">
        ดอกไม้ที่ลูกค้าให้ในเดือนนี้ — ไม่ผูกกับคะแนน KPI และไม่มีใครรู้ว่าใครเป็นคนให้
      </p>

      <div className="flower-garden-head">
        <div>
          <strong className="flower-garden-net">{bloomLabel(net)}</strong>
          <span>
            ได้ {bloomLabel(summary?.petalsGiven ?? 0)}
            {summary?.petalsDocked ? ` · ใบไม้แห้ง −${summary.petalsDocked} กลีบ` : ""}
          </span>
        </div>
        {data.targetPetals > 0 ? (
          <div className={below ? "flower-garden-target is-below" : "flower-garden-target"}>
            <strong>{pct}%</strong>
            <span>ของเกณฑ์เดือนนี้ ({data.targetPetals} กลีบ)</span>
          </div>
        ) : null}
      </div>

      {data.targetPetals > 0 ? (
        <p className="flower-garden-note">
          เกณฑ์คิดจากครึ่งหนึ่งของกลีบที่บิลทั้งเดือนแจกได้
          {data.potentialPetals ? ` (${data.potentialPetals} กลีบ)` : ""} หารพนักงาน {data.staffCount ?? "—"} คน
          {below ? " — ได้น้อยกว่าเกณฑ์ ไว้คุยกันตอนประเมินว่าเกิดอะไรขึ้น" : ""}
        </p>
      ) : null}

      {data.items.length ? (
        <ul className="flower-garden-list">
          {data.items.map((item) => (
            <li key={item.id} className={item.kind === "leaf" ? "is-leaf" : "is-flower"}>
              <div className="flower-garden-row-head">
                <strong>{item.kind === "leaf" ? `ใบไม้แห้ง −${item.petals} กลีบ` : bloomLabel(item.petals)}</strong>
                <small>{flowerDateLabel(item.createdAt)}</small>
              </div>
              {item.kind === "leaf" ? (
                <p className="flower-garden-note">ข้อความอยู่ที่ช่องเสียงจากสมาชิก หัวหน้าจะเปิดให้เห็นเมื่ออ่านแล้ว</p>
              ) : item.message ? (
                <p className="flower-garden-message">{item.message}</p>
              ) : null}
              {item.photos.length ? (
                <div className="flower-garden-photos">
                  {item.photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="รูปที่ลูกค้าแนบมา" />
                    </a>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flower-garden-note">เดือนนี้ยังไม่มีดอกไม้ — ลูกค้าให้ได้จากจอหน้าเคาน์เตอร์</p>
      )}
    </section>
  );
}
