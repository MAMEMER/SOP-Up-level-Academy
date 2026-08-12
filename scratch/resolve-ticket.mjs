import fs from 'fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// load .env.local
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){
  const m=line.match(/^([A-Z_]+)=(.*)$/); if(!m) continue;
  let v=m[2]; if(v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1);
  process.env[m[1]] ??= v;
}
initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n')})});
const db=getFirestore();
const ref=db.collection('tickets').doc('115Ilo8gNIrLL145VUbk');
const snap=await ref.get();
if(!snap.exists){console.log('TICKET NOT FOUND'); process.exit(1);}
console.log('BEFORE:', JSON.stringify({status:snap.data().status, title:snap.data().title, source:snap.data().source}));
await ref.update({
  status:'resolved',
  resolvedAt: FieldValue.serverTimestamp(),
  resolvedBy: 'Kai (remote executor)',
  resolutionNote: 'แก้ CSS grid ของการ์ด checklist ให้หดตามจอมือถือ (minmax(0,1fr)+min-width:0) — เดิม overflow ~78px ที่ 320px ทำให้เบราว์เซอร์ zoom out; deploy live แล้วบน sop.uplevelguild.com/checklist. commit fca99ad'
});
const after=await ref.get();
console.log('AFTER status:', after.data().status);
process.exit(0);
