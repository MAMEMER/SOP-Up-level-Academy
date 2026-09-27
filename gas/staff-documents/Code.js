/**
 * SOP → Google Drive bridge: เอกสารพนักงาน (ประกันสังคม / บัญชีเงินเดือน)
 *
 * Web app ของ champ.championest (execute as me) — service account เป็นเจ้าของไฟล์ใน My Drive
 * ส่วนตัวไม่ได้ จึงให้สคริปต์นี้เขียนแทนในนามแชมป์.
 * เรียกได้จาก server ของเว็บ SOP เท่านั้น: ทุก request ต้องมี secret ที่ SHA-256 ตรงกับ SECRET_SHA256
 * (ตัว secret จริงอยู่ใน Vercel env STAFF_DOCS_GAS_SECRET — ในไฟล์นี้มีแค่ hash).
 *
 * actions
 *   submit  → บันทึกไฟล์ลง <ROOT>/พนักงาน - เอกสารประกันสังคม/<รหัส> <ชื่อเล่น>/ + upsert แถวในชีต
 *             idempotent: ไฟล์ที่ description = submissionId มีอยู่แล้วจะไม่สร้างซ้ำ
 *             ไฟล์ชื่อซ้ำจากการส่งครั้งก่อนถูกย้ายไป /ประวัติ (ไม่ลบ)
 *   get     → แถวของพนักงานคนนั้น (ใช้ตอนแก้ไขข้อมูล)
 *   ping    → ลิงก์โฟลเดอร์ + ชีต
 *   purgeTest → ลบโฟลเดอร์ + แถวของรหัส TEST-* เท่านั้น (ล้างข้อมูลทดสอบ)
 */

var ROOT_FOLDER_ID = '1O94mfqq408V-LIrQmE3LAxOf0UKVvtgL';
var DOCS_FOLDER_NAME = 'พนักงาน - เอกสารประกันสังคม';
var SHEET_NAME = 'ข้อมูลพนักงาน (จากฟอร์ม)';
var HISTORY_FOLDER_NAME = 'ประวัติ';
var SECRET_SHA256 = 'e9afa9dc9ce648ed4b32fe4a43bd809bb4936eb29a76cfbe6d368b23b9147c04';
var CODE_COL = 2; // B = รหัสพนักงาน
var FOLDER_LINK_HEADER = 'โฟลเดอร์เอกสาร';

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!checkSecret_(body.secret)) return json_({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: 'busy' });
  try {
    if (body.action === 'submit') return json_(submit_(body));
    if (body.action === 'get') return json_(getRow_(String(body.employeeId || '')));
    if (body.action === 'ping') return json_(ping_());
    if (body.action === 'purgeTest') return json_(purgeTest_(String(body.employeeId || '')));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: false, error: 'post_only' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkSecret_(secret) {
  if (!secret || typeof secret !== 'string' || SECRET_SHA256.length !== 64) return false;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secret, Utilities.Charset.UTF_8);
  var hex = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  // constant-time-ish compare
  var diff = 0;
  for (var i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ SECRET_SHA256.charCodeAt(i);
  return diff === 0;
}

function safeName_(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '').trim();
}

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function docsFolder_() {
  return childFolder_(DriveApp.getFolderById(ROOT_FOLDER_ID), DOCS_FOLDER_NAME);
}

function sheet_(headers) {
  var folder = docsFolder_();
  var files = folder.getFilesByName(SHEET_NAME);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.openById(files.next().getId());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  }
  var sh = ss.getSheets()[0];
  if (headers && headers.length && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#FFE8D1');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
  }
  return { ss: ss, sh: sh };
}

function findRow_(sh, employeeId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var codes = sh.getRange(2, CODE_COL, last - 1, 1).getDisplayValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]).trim() === employeeId) return i + 2;
  }
  return -1;
}

function parseIsoDate_(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : value;
}

function submit_(body) {
  var employeeId = safeName_(body.employeeId);
  if (!employeeId) return { ok: false, error: 'missing_employee' };
  var submissionId = String(body.submissionId || '');
  if (!submissionId) return { ok: false, error: 'missing_submission' };

  var folder = childFolder_(docsFolder_(), safeName_(body.folderName) || employeeId);
  var saved = [];
  var files = body.files || [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var name = safeName_(f.name);
    if (!name || !f.base64) continue;
    var existing = folder.getFilesByName(name);
    var already = null;
    var toArchive = [];
    while (existing.hasNext()) {
      var file = existing.next();
      if (file.getDescription() === submissionId) already = file;
      else toArchive.push(file);
    }
    if (already) {
      saved.push({ kind: f.kind, name: name, id: already.getId() });
      continue;
    }
    if (toArchive.length) {
      var history = childFolder_(folder, HISTORY_FOLDER_NAME);
      var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd_HHmm');
      toArchive.forEach(function (old) {
        old.moveTo(history);
        old.setName(stamp + '_' + old.getName());
      });
    }
    var blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.mimeType || 'application/octet-stream', name);
    var created = folder.createFile(blob);
    created.setDescription(submissionId);
    saved.push({ kind: f.kind, name: name, id: created.getId() });
  }

  var headers = body.headers || [];
  var s = sheet_(headers);
  var sh = s.sh;
  var row = body.row || [];
  var width = Math.max(row.length, headers.length);
  var linkCol = headers.indexOf(FOLDER_LINK_HEADER);
  var rowIndex = findRow_(sh, employeeId);
  var isNew = rowIndex < 0;
  if (isNew) rowIndex = Math.max(sh.getLastRow(), 1) + 1;

  var textCols = body.textColumns || [];
  textCols.forEach(function (c) { sh.getRange(rowIndex, c + 1).setNumberFormat('@'); });
  var dateCols = body.dateColumns || [];

  var current = isNew ? [] : sh.getRange(rowIndex, 1, 1, width).getValues()[0];
  var values = [];
  for (var c = 0; c < width; c++) {
    var v = row[c];
    if (c === 0) v = rowIndex - 1; // ลำดับ
    else if (c === linkCol) v = folder.getUrl();
    else if (v === null || v === undefined) {
      // ช่องของเจ้าของ/บัญชี: แถวเดิม = คงค่าเดิม · แถวใหม่ = ค่าเริ่มต้น
      v = isNew ? (headers[c] === 'ขึ้นทะเบียนประกันสังคม' ? 'รอตรวจสอบ' : '') : current[c];
    } else if (dateCols.indexOf(c) >= 0) v = parseIsoDate_(v);
    values.push(v);
  }
  sh.getRange(rowIndex, 1, 1, width).setValues([values]);
  dateCols.forEach(function (c) { sh.getRange(rowIndex, c + 1).setNumberFormat('dd/mm/yyyy'); });

  return { ok: true, folderUrl: folder.getUrl(), sheetUrl: s.ss.getUrl(), savedFiles: saved, rowIndex: rowIndex, isNew: isNew };
}

function getRow_(employeeId) {
  employeeId = safeName_(employeeId);
  if (!employeeId) return { ok: false, error: 'missing_employee' };
  var s = sheet_(null);
  var rowIndex = findRow_(s.sh, employeeId);
  if (rowIndex < 0) return { ok: false, error: 'not_found' };
  var width = s.sh.getLastColumn();
  var raw = s.sh.getRange(rowIndex, 1, 1, width).getValues()[0];
  var row = raw.map(function (v) {
    return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd') : v;
  });
  return { ok: true, row: row };
}

function ping_() {
  var folder = docsFolder_();
  var files = folder.getFilesByName(SHEET_NAME);
  return { ok: true, folderUrl: folder.getUrl(), sheetUrl: files.hasNext() ? files.next().getUrl() : null };
}

function purgeTest_(employeeId) {
  employeeId = safeName_(employeeId);
  if (!/^TEST-/i.test(employeeId)) return { ok: false, error: 'test_only' };
  var docs = docsFolder_();
  var removedFolders = 0;
  var it = docs.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(employeeId + ' ') === 0 || f.getName() === employeeId) {
      f.setTrashed(true);
      removedFolders++;
    }
  }
  var removedRows = 0;
  var files = docs.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    var sh = SpreadsheetApp.openById(files.next().getId()).getSheets()[0];
    var r = findRow_(sh, employeeId);
    while (r > 0) {
      sh.deleteRow(r);
      removedRows++;
      r = findRow_(sh, employeeId);
    }
  }
  return { ok: true, removedFolders: removedFolders, removedRows: removedRows };
}

/** รันครั้งเดียวจาก editor เพื่อกดอนุญาตสิทธิ์ Drive/Sheets (ไม่มีผลข้างเคียงนอกจากสร้างโฟลเดอร์/ชีตถ้ายังไม่มี) */
function authorize() {
  Logger.log(JSON.stringify(ping_()));
}
