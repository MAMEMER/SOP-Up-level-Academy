import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const sa=require('/Users/abc/Projects/up-level-guild-members-web/up-level-guild-firebase-adminsdk-fbsvc-bb54b4f16c.json');
const { cert, initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(sa) });
const db=getFirestore();
const ref=db.collection('tickets').doc('115Ilo8gNIrLL145VUbk');
const snap=await ref.get();
if(!snap.exists){ console.log('TICKET NOT FOUND'); process.exit(1); }
const d=snap.data();
console.log('BEFORE:', JSON.stringify({status:d.status, title:d.title, source:d.source, where:d.where||d.url}));
await ref.update({
  status:'resolved',
  resolvedAt: FieldValue.serverTimestamp(),
  resolvedBy: 'Kai (remote executor)',
  resolutionNote: 'แก้ CSS grid ของการ์ด checklist ให้หดตามจอมือถือ (grid-template-columns:minmax(0,1fr) + min-width:0, input width 100%, overflow-wrap:anywhere). เดิม card overflow ~78px ที่จอ 320px ทำให้เบราว์เซอร์ zoom out ทั้งหน้า → ดูเล็กเหมือนคอม. Verified overflow=0 ที่ 320/360/390/500px, deploy live แล้วบน sop.uplevelguild.com/checklist (commit fca99ad).'
});
const after=(await ref.get()).data();
console.log('AFTER status:', after.status);
process.exit(0);
