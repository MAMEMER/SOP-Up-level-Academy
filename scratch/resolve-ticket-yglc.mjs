import fs from 'fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const sa=JSON.parse(fs.readFileSync('/Users/abc/Projects/up-level-guild-members-web/up-level-guild-firebase-adminsdk-fbsvc-bb54b4f16c.json','utf8'));
initializeApp({credential:cert(sa)});
const db=getFirestore();
const ref=db.collection('tickets').doc('YglcDqygBJGDr8TMidoj');
const snap=await ref.get();
if(!snap.exists){console.log('TICKET NOT FOUND'); process.exit(1);}
console.log('BEFORE:', JSON.stringify({status:snap.data().status, title:snap.data().title, source:snap.data().source, page:snap.data().page||snap.data().where}));
await ref.update({
  status:'resolved',
  resolvedAt: FieldValue.serverTimestamp(),
  resolvedBy: 'Kai (remote executor)',
  resolutionNote: 'ปฏิทินตารางกะ (.staff-calendar) ทับซ้อนบนมือถือ — 7 คอลัมน์บีบเหลือ ~44px ทำให้ช่วงเวลา/ชื่อทีมล้นทับช่องข้างๆ. แก้: media query <=600px สลับปฏิทินเป็นคอลัมน์เดียวเต็มจอต่อวัน + ซ่อนช่องว่าง/หัวตาราง 7 คอลัมน์ + ขยายฟอนต์ที่บีบ (เดสก์ท็อปคงเดิม). merge PR#53 -> commit 8bd5e51, deploy live sop.uplevelguild.com แล้ว. หมายเหตุ: ตั๋วแจ้งหน้า /checklist แต่ปฏิทินจริงอยู่หน้า /schedule (ตารางกะ) ซึ่งเป็นปฏิทินเดียวในระบบ. ซ้ำกับตั๋ว crawf8V4.'
});
const after=await ref.get();
console.log('AFTER status:', after.data().status);
process.exit(0);
