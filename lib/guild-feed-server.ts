import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";

// โพสต์บรรทัดสรุปขึ้น "ฟีดวงการ" ของเว็บสมาชิก (guild.uplevelguild.com/feed).
//
// เว็บกิลด์กับเว็บ SOP ใช้ Firebase project เดียวกัน คอลเลกชัน feed_posts จึงเขียนได้จาก
// ฝั่งนี้ด้วย Admin SDK — ใช้ตอนหัวหน้ากด "ให้พนักงานเห็น" กับคำติ/คำแนะนำ แล้วอยากให้ขึ้น
// ฟีดพร้อมกัน. รูปร่างเอกสารต้องตรงกับที่หน้า /feed ของเว็บกิลด์อ่าน (src/types/feed.ts)
// ไม่งั้นการ์ดจะเรนเดอร์พัง: authorUid / authorName / authorRank / authorAvatarUrl / text /
// imageUrl / kind / pinned / likedBy / likeCount / commentCount / createdAt / editedAt.

const FEED_POSTS = "feed_posts";

export type FeedbackKindForFeed = "praise" | "suggestion" | "complaint";

/** บอกแค่ "ใครได้รับอะไรจากใคร" — ไม่มีข้อความที่สมาชิกเขียน */
export function feedHeadline(input: { staffName: string; kind: FeedbackKindForFeed; memberName: string }): string {
  const verb =
    input.kind === "praise" ? "ได้รับคำชมจาก" : input.kind === "suggestion" ? "ได้รับคำแนะนำจาก" : "ได้รับคำติจาก";
  return `${input.staffName} ${verb} ${input.memberName}`;
}

/** โพสต์ขึ้นฟีดในนามร้าน (kind news) — คืน false เมื่อยังไม่มี service account (dev preview) */
export async function postGuildFeedHeadline(text: string): Promise<boolean> {
  if (!hasAdminCredentials()) return false;
  await adminDb().collection(FEED_POSTS).add({
    authorUid: "system",
    authorName: "Up Level",
    authorRank: "Staff",
    authorAvatarUrl: null,
    text,
    imageUrl: null,
    kind: "news",
    pinned: false,
    likedBy: [],
    likeCount: 0,
    commentCount: 0,
    createdAt: Timestamp.now(),
    editedAt: null
  });
  return true;
}
