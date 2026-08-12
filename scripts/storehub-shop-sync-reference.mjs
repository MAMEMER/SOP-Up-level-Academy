#!/usr/bin/env node
// StoreHub → Firestore `shop-products` sync for uplevelguild.com/shop
// Reads creds from ~/.storehub_creds (server-only). Run: node scripts/storehub-sync.mjs [--dry]
// Pulls /stores, /products, /inventory/{mainStore}, joins, maps category→type, writes in-stock items.
// Price = priceOverride (admin, preserved) ?? round(unitPrice*1.07) (VAT). Single cards w/ unitPrice=0 → storePrice=null.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';

const DRY = process.argv.includes('--dry');
const MAIN_STORE = '6a268170c008ab000760e21a'; // Up level Academy (บางแค)
const BASE = 'https://api.storehubhq.com';

// --- creds (outside repo) ---
const credText = fs.readFileSync(path.join(os.homedir(), '.storehub_creds'), 'utf8');
const cred = Object.fromEntries(credText.split('\n').filter(Boolean).map(l => l.split('=')));
const AUTH = 'Basic ' + Buffer.from(`${cred.STOREHUB_USER}:${cred.STOREHUB_PASS}`).toString('base64');

const saPath = path.join(import.meta.dirname, '..', 'up-level-guild-firebase-adminsdk-fbsvc-bb54b4f16c.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
const db = admin.firestore();

const sh = async (p) => {
  const r = await fetch(BASE + p, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- classification ---
const LORCANA_RE = /lorcana/i;
const PKM_SET_RE = /(ดรีม|บลาสต์|เงามืด|คุกคาม|พายุ|จักรวาล|ไดsusb|เทอร่า|ดาร์ก|ฟลาริง|พาราไดซ์|อังคาร|ev[0-9]|sv[0-9]|s[0-9]+[a-z]?$)/i;
const SEALED_RE = /\b(box|booster|etb|elite trainer|bundle|display|กล่อง|ซอง|ดิสเพลย์|แพ็ค|pack)\b/i;
const ACC_RE = /\b(sleeve|playmat|deck box|ซอง?การ์ด|แผ่นรอง|กล่องเด็ค|binder|toploader|อัลบั้ม|ปลอก)\b/i;

function classify(prod) {
  const name = prod.name || '';
  const cat = prod.category || '';
  let type = 'other', game = '';
  if (LORCANA_RE.test(cat) || LORCANA_RE.test(name)) game = 'lorcana';

  if (SEALED_RE.test(name) || (cat === 'card' && /BOX|booster|กล่อง|ซอง/i.test(name))) {
    type = 'sealed';
    if (!game) game = /pok[eé]mon|โปเกมอน|ดรีม|บลาสต์/i.test(name) ? 'pokemon' : '';
  } else if (ACC_RE.test(name) || ACC_RE.test(cat)) {
    type = 'accessory';
  } else if (/^Lorcana S\d+$/i.test(cat) || PKM_SET_RE.test(cat)) {
    type = 'single';
    if (!game) game = LORCANA_RE.test(cat) ? 'lorcana' : 'pokemon';
  } else if (cat === 'card') {
    type = 'sealed'; // misc card-category product, treat as sealed unless clearly single
  }
  return { type, game };
}

// parse "Lorcana S1 - Abu - Mischievous Monkey" → set + cardName for display/search
function parseSingle(name) {
  const m = name.match(/^(.*?)\s*-\s*(.+)$/);
  return m ? { cardName: m[2].trim() } : { cardName: name };
}

// --- catalog image join ---
const normK = s => (s || '').toLowerCase().replace(/[\s.,'"!?:()]/g, '').replace(/[\-–—]/g, '').trim();

// Build in-memory image indexes from Firestore catalogs.
async function buildImageIndexes() {
  const lorIdx = new Map();       // `${setCode}|${name}|${version}` → image
  const lorByNameVer = new Map(); // `${name}|${version}` → image (any set fallback)
  const pkmIdx = new Map();       // `${expansionCode}|${num}` → image
  const [lsnap, psnap] = await Promise.all([
    db.collection('lorcana-cards').get(),
    db.collection('pkm-cards').get(),
  ]);
  lsnap.forEach(d => { const v = d.data(); if (!v.image) return;
    lorIdx.set(`${v.setCode}|${normK(v.name)}|${normK(v.version)}`, v.image);
    lorByNameVer.set(`${normK(v.name)}|${normK(v.version)}`, v.image);
  });
  psnap.forEach(d => { const v = d.data(); if (!v.image) return;
    const num = String(v.collectorNumber || '').split('/')[0].replace(/^0+/, '') || '0';
    pkmIdx.set(`${(v.expansionCode || '').toLowerCase()}|${num}`, v.image);
  });
  return { lorIdx, lorByNameVer, pkmIdx };
}

// Resolve catalog image for a single product (null if no match).
function matchImage(prod, game, idx) {
  const name = prod.name || '';
  if (game === 'lorcana' && /^Lorcana S\d+$/i.test(prod.category || '')) {
    const set = (prod.category.match(/S(\d+)/i) || [])[1];
    const rest = name.replace(/^Lorcana S\d+\s*-\s*/i, '');
    const parts = rest.split(/ - /); // spaced dash only — keeps "Rosy-Cheeked"
    if (parts.length >= 2) {
      const ver = parts[parts.length - 1], cardName = parts.slice(0, -1).join(' - ');
      const img = idx.lorIdx.get(`${set}|${normK(cardName)}|${normK(ver)}`)
               || idx.lorByNameVer.get(`${normK(cardName)}|${normK(ver)}`);
      if (img) return img;
    }
    // single-segment (songs/items): match by name within set, any version
    const cardName = parts.join(' - '), pre = `${set}|${normK(cardName)}|`;
    for (const [k, im] of idx.lorIdx) if (k.startsWith(pre)) return im;
    return null;
  }
  if (game === 'pokemon') {
    const pm = name.match(/\(([^)]*)\)\s*$/); // last paren group
    if (!pm) return null;
    const inside = pm[1]; // "U · SV10s T 130/138" | "MA4 062/123" | "- · Tactic 009/019"
    const nm = inside.match(/(\d+)\/\d+\s*$/); if (!nm) return null;
    const num = String(+nm[1]);
    // code = token before " T " if present, else first alnum token before num/total
    let code = (inside.match(/([A-Za-z0-9-]+)\s+T\s+\d+\//) || [])[1]
            || (inside.match(/([A-Za-z0-9-]+)\s+\d+\//) || [])[1];
    if (!code) return null;
    return idx.pkmIdx.get(`${code.toLowerCase()}|${num}`) || null;
  }
  return null;
}

async function main() {
  console.log(DRY ? '— DRY RUN —' : '— LIVE SYNC —');
  const stores = await sh('/stores'); await sleep(350);
  console.log('stores:', stores.map(s => `${s.name}(${s.id.slice(-6)})`).join(', '));

  const products = await sh('/products'); await sleep(350);
  const inv = await sh(`/inventory/${MAIN_STORE}`);
  const qtyById = Object.fromEntries(inv.map(x => [x.productId, x.quantityOnHand || 0]));
  console.log(`products: ${products.length} · inventory rows: ${inv.length}`);

  // existing priceOverrides to preserve
  const existing = {};
  if (!DRY) {
    const snap = await db.collection('shop-products').get();
    snap.forEach(d => { const v = d.data(); if (v.priceOverride != null) existing[d.id] = v.priceOverride; });
    console.log(`preserving ${Object.keys(existing).length} admin priceOverrides`);
  }

  // catalog image indexes (lorcana-cards + pkm-cards)
  const imgIdx = await buildImageIndexes();
  console.log(`catalog: lorcana ${imgIdx.lorIdx.size} · pkm ${imgIdx.pkmIdx.size} image keys`);

  const rows = [];
  const stats = { single: 0, sealed: 0, accessory: 0, other: 0, priced: 0, needsPrice: 0 };
  const imgStats = { lorHit: 0, lorMiss: 0, pkmHit: 0, pkmMiss: 0 };
  const imgMisses = [];
  for (const p of products) {
    if (p.isParentProduct) continue;            // parents have no own stock
    const qty = qtyById[p.id] || 0;
    if (qty <= 0) continue;                      // in-stock only
    const { type, game } = classify(p);
    const image = type === 'single' ? matchImage(p, game, imgIdx) : null;
    if (type === 'single') {
      const g = game === 'lorcana' ? 'lor' : game === 'pokemon' ? 'pkm' : null;
      if (g) { imgStats[`${g}${image ? 'Hit' : 'Miss'}`]++; if (!image) imgMisses.push(p.name); }
    }
    const up = p.unitPrice || 0;
    const storePrice = up > 0 ? Math.round(up * 1.07) : null;
    const priceOverride = existing[p.id] ?? null;
    const price = priceOverride ?? storePrice;
    stats[type]++; if (price != null) stats.priced++; else stats.needsPrice++;
    rows.push({
      id: p.id,
      name: p.name || '',
      sku: p.sku || null,
      category: p.category || '',
      set: p.category || '',
      cardName: type === 'single' ? parseSingle(p.name || '').cardName : (p.name || ''),
      type, game,
      storePrice, priceOverride, price,
      qty,
      trackStock: !!p.trackStockLevel,
      image, // joined from lorcana-cards / pkm-cards catalogs (null if no match)
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  console.log('in-stock to write:', rows.length, JSON.stringify(stats));
  const lorTot = imgStats.lorHit + imgStats.lorMiss, pkmTot = imgStats.pkmHit + imgStats.pkmMiss;
  console.log(`image join — Lorcana ${imgStats.lorHit}/${lorTot} · Pokémon ${imgStats.pkmHit}/${pkmTot} · with-image ${imgStats.lorHit + imgStats.pkmHit}`);
  if (imgMisses.length) console.log('img misses sample:', imgMisses.slice(0, 8));
  console.log('sample:', rows.slice(0, 3).map(r => `${r.type}/${r.game||'-'} "${r.name.slice(0,32)}" ฿${r.price ?? 'TBD'} x${r.qty}`).join(' | '));

  if (DRY) { console.log('dry run — no writes'); return; }

  // batched writes (merge so we never clobber priceOverride mid-run)
  let n = 0;
  for (let i = 0; i < rows.length; i += 450) {
    const batch = db.batch();
    for (const r of rows.slice(i, i + 450)) batch.set(db.collection('shop-products').doc(r.id), r, { merge: true });
    await batch.commit(); n += Math.min(450, rows.length - i);
    process.stdout.write(`\rwritten ${n}/${rows.length}`);
  }
  console.log(`\n✓ synced ${n} products to Firestore shop-products`);
}
main().then(() => process.exit(0)).catch(e => { console.error('SYNC FAILED:', e); process.exit(1); });
