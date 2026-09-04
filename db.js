const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { loadStore, persistStore, flushStore, setSavingPaused, usesRemoteStorage } = require('./storage');

const DATA_PATH = path.join(__dirname, 'data.json');

const FACILITIES = [
  { name: 'はっぴーらいふ', address: '〒004-0842 北海道札幌市清田区清田２条１丁目１４－１７' },
  { name: 'グループホームウェルネス美園', address: '〒062-0003 北海道札幌市豊平区美園３条４丁目3-5 W\'s group building' },
  { name: 'グループホームウェルネス清田2条', address: '〒004-0842 札幌市清田区清田2条1-14-17' },
  { name: 'グループホームウェルネス真栄', address: '〒004-0842 札幌市清田区真栄4条5-16-2' },
  { name: 'グループホームウェルネス里塚', address: '〒004-0842 札幌市清田区里塚3条1-15-15' },
  { name: 'グループホームウェルネス西岡', address: '〒062-0003 北海道札幌市豊平区西岡2条4丁目9番20号' },
  { name: 'グループホームウェルネス月寒', address: '〒062-0003 札幌市豊平区月寒西1条6-1-20' },
  { name: 'グループホームウェルネス南平岸', address: '〒062-0003 札幌市豊平区中の島2条7丁目2番7号' },
  { name: 'グループホームウェルネス南平岸駅前', address: '〒062-0003 札幌市豊平区平岸4条16丁目3-24' },
  { name: 'グループホームウェルネス北31条', address: '〒065-0012 札幌市東区北31条東5丁目1-17' },
  { name: 'グループホームウェルネス美園3', address: '〒062-0003 札幌市豊平区美園3条4丁目3-5 3階' },
  { name: 'グループホームウェルネス清田', address: '〒004-0842 北海道札幌市清田区清田二条1丁目16-22' },
];

const DEFAULT_WORKERS = [
  { name: 'THERE SA', flag: '🇲🇲', nationality: 'ミャンマー' },
  { name: 'SAW THI MON', flag: '🇲🇲', nationality: 'ミャンマー' },
  { name: 'IQBAL FERIZAL DZULQARNAIN', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'MUHAMAD TEGUH SANJAYA', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'HEWA HEENIPELLAGE THARINDU LAKSHITHA', flag: '🇱🇰', nationality: 'スリランカ' },
  { name: 'WIJETUNGA DONA SHAMILA ERANDI', flag: '🇱🇰', nationality: 'スリランカ' },
  { name: 'FAUZAN VALENTINO PRATAMA', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'MUHAMAD RAMDAN ALEX JUNIOR', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'SEPTIAN BAYU AJI', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'SHERGIAN NURGIANA GIORDANO', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'APRIL PHOO', flag: '🇲🇲', nationality: 'ミャンマー' },
  { name: 'AZLAN NIFAN', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'FERNADY SETIAWAN', flag: '🇮🇩', nationality: 'インドネシア' },
  { name: 'AGUS FAJAR MAULUDIN', flag: '🇮🇩', nationality: 'インドネシア' },
];

const WORKER_CATEGORIES = ['epa', 'care_visa', 'permanent'];
const CATEGORY_LABELS = {
  epa: 'EPA介護福祉士',
  care_visa: '在留資格「介護」',
  permanent: '永住者・配偶者等',
};

const COUNT_FIELDS = {
  japanese: 'japanese_count',
  epa: 'epa_count',
  care_visa: 'care_visa_count',
  permanent: 'permanent_count',
};

let store = null;
let nextId = { users: 1, facilities: 1, workers: 1, edit_history: 1, worker_assignments: 1 };

function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function dateFromTimestamp(ts) {
  if (!ts) return todayDate();
  return ts.split(' ')[0] || todayDate();
}

function facilityNameById(facilityId) {
  if (!facilityId) return '未配置';
  return store.facilities.find((f) => f.id === facilityId)?.name || '（削除済み事業所）';
}

function startAssignment(workerId, facilityId, startDate) {
  if (!store.worker_assignments) store.worker_assignments = [];
  store.worker_assignments.push({
    id: nextId.worker_assignments++,
    worker_id: workerId,
    facility_id: facilityId || null,
    facility_name: facilityNameById(facilityId),
    started_at: startDate || todayDate(),
    ended_at: null,
  });
  saveStore();
}

function endCurrentAssignment(workerId, endDate) {
  if (!store.worker_assignments) return;
  const current = store.worker_assignments
    .filter((a) => a.worker_id === workerId && !a.ended_at)
    .sort((a, b) => b.id - a.id)[0];
  if (current) current.ended_at = endDate || todayDate();
  saveStore();
}

function moveWorkerAssignment(workerId, newFacilityId) {
  if (newFacilityId === undefined) return;
  const worker = store.workers.find((w) => w.id === workerId);
  if (!worker) return;
  if (worker.facility_id === (newFacilityId || null)) return;

  const today = todayDate();
  endCurrentAssignment(workerId, today);
  startAssignment(workerId, newFacilityId || null, today);
  worker.facility_id = newFacilityId || null;
  saveStore();
}

function getWorkerTimeline(workerId) {
  if (!store.worker_assignments) return [];
  return store.worker_assignments
    .filter((a) => a.worker_id === workerId)
    .sort((a, b) => a.id - b.id);
}

function getWorkerById(workerId) {
  return store.workers.find((w) => w.id === Number(workerId)) || null;
}

function updateWorker(workerId, updates) {
  const w = store.workers.find((x) => x.id === Number(workerId));
  if (!w) return null;
  const prev = {
    name: w.name,
    nationality: w.nationality,
    flag: w.flag,
    birth_date: w.birth_date || '',
  };
  if (updates.name !== undefined) w.name = String(updates.name).trim();
  if (updates.nationality !== undefined) w.nationality = String(updates.nationality).trim();
  if (updates.flag !== undefined) w.flag = String(updates.flag).trim() || '🏳️';
  if (updates.birth_date !== undefined) w.birth_date = String(updates.birth_date || '').trim();
  saveStore();
  return { worker: w, prev };
}

function syncWorkerFacilityFromAssignments(workerId) {
  const worker = store.workers.find((w) => w.id === Number(workerId));
  if (!worker) return;
  const current = getWorkerTimeline(workerId).filter((a) => !a.ended_at).sort((a, b) => b.id - a.id)[0];
  worker.facility_id = current?.facility_id || null;
  saveStore();
}

function updateAssignment(assignmentId, updates) {
  if (!store.worker_assignments) return null;
  const a = store.worker_assignments.find((x) => x.id === Number(assignmentId));
  if (!a) return null;

  if (updates.facility_id !== undefined) {
    const fid = updates.facility_id === null || updates.facility_id === '' ? null : Number(updates.facility_id);
    a.facility_id = fid;
    a.facility_name = facilityNameById(fid);
  }
  if (updates.facility_name !== undefined && updates.facility_id === undefined) {
    a.facility_name = String(updates.facility_name).trim() || a.facility_name;
  }
  if (updates.started_at !== undefined) a.started_at = String(updates.started_at).trim() || a.started_at;
  if (updates.ended_at !== undefined) {
    const end = updates.ended_at === null || updates.ended_at === '' ? null : String(updates.ended_at).trim();
    a.ended_at = end;
  }
  syncWorkerFacilityFromAssignments(a.worker_id);
  saveStore();
  return a;
}

function addAssignment(workerId, { facility_id, started_at, ended_at }) {
  const worker = store.workers.find((w) => w.id === Number(workerId));
  if (!worker) return null;
  if (!store.worker_assignments) store.worker_assignments = [];

  const fid = facility_id === null || facility_id === '' || facility_id === undefined
    ? null
    : Number(facility_id);
  const assignment = {
    id: nextId.worker_assignments++,
    worker_id: Number(workerId),
    facility_id: fid,
    facility_name: facilityNameById(fid),
    started_at: (started_at && String(started_at).trim()) || todayDate(),
    ended_at: ended_at === null || ended_at === '' || ended_at === undefined
      ? null
      : String(ended_at).trim(),
  };
  store.worker_assignments.push(assignment);
  syncWorkerFacilityFromAssignments(workerId);
  saveStore();
  return assignment;
}

function deleteAssignment(assignmentId) {
  if (!store.worker_assignments) return null;
  const a = store.worker_assignments.find((x) => x.id === Number(assignmentId));
  if (!a) return null;
  const workerId = a.worker_id;
  store.worker_assignments = store.worker_assignments.filter((x) => x.id !== a.id);
  syncWorkerFacilityFromAssignments(workerId);
  saveStore();
  return a;
}

function now() {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function makeFacility(data, id, sortOrder) {
  return {
    id,
    name: data.name,
    address: data.address || '',
    in_council: data.in_council ?? false,
    japanese_count: 0,
    epa_count: 0,
    care_visa_count: 0,
    permanent_count: 0,
    sort_order: sortOrder,
  };
}

function defaultStore() {
  return {
    users: [
      { id: 1, username: 'admin', password_hash: bcrypt.hashSync('admin123', 10), role: 'admin', display_name: 'ナリカワ', created_at: now() },
      { id: 2, username: 'editor', password_hash: bcrypt.hashSync('editor123', 10), role: 'editor', display_name: '編集者', created_at: now() },
      { id: 3, username: 'viewer', password_hash: bcrypt.hashSync('viewer123', 10), role: 'viewer', display_name: '閲覧者', created_at: now() },
    ],
    facilities: FACILITIES.map((f, i) => ({ ...makeFacility({ ...f, in_council: true }, i + 1, i) })),
    workers: DEFAULT_WORKERS.map((w, i) => ({
      id: i + 1,
      name: w.name,
      flag: w.flag,
      nationality: w.nationality,
      birth_date: '',
      category: 'care_visa',
      facility_id: null,
      created_at: now(),
    })),
    edit_history: [],
    worker_assignments: [],
  };
}

function migrateStore() {
  store.facilities.forEach((f) => {
    if (f.epa_count === undefined) f.epa_count = 0;
    if (f.care_visa_count === undefined) f.care_visa_count = 0;
    if (f.permanent_count === undefined) f.permanent_count = 0;
    if (f.in_council === undefined) f.in_council = true;
  });

  const adminUser = store.users.find((u) => u.username === 'admin');
  if (adminUser && adminUser.display_name === '管理者') {
    adminUser.display_name = 'ナリカワ';
  }

  if (store.workers.length === 0) {
    store.workers = DEFAULT_WORKERS.map((w, i) => ({
      id: i + 1,
      name: w.name,
      flag: w.flag,
      nationality: w.nationality,
      birth_date: '',
      category: 'care_visa',
      facility_id: null,
      created_at: now(),
    }));
  } else {
    store.workers.forEach((w) => {
      if (!w.flag) {
        const match = DEFAULT_WORKERS.find((d) => d.name === w.name);
        w.flag = match?.flag || '🏳️';
      }
      if (w.birth_date === undefined) w.birth_date = '';
    });
  }

  if (!store.worker_assignments) store.worker_assignments = [];

  store.workers.forEach((w) => {
    const hasAssignment = store.worker_assignments.some((a) => a.worker_id === w.id);
    if (!hasAssignment && w.facility_id) {
      const nextAsgId = Math.max(0, ...store.worker_assignments.map((a) => a.id)) + 1;
      store.worker_assignments.push({
        id: nextAsgId,
        worker_id: w.id,
        facility_id: w.facility_id,
        facility_name: facilityNameById(w.facility_id),
        started_at: dateFromTimestamp(w.created_at),
        ended_at: null,
      });
    }
  });
}

function saveStore() {
  if (!store) return;
  persistStore(store);
}

async function initDb() {
  setSavingPaused(true);

  const loaded = await loadStore();
  if (loaded) {
    store = loaded;
    migrateStore();
  } else {
    store = defaultStore();
    migrateStore();
  }

  nextId = {
    users: Math.max(0, ...store.users.map((u) => u.id)) + 1,
    facilities: Math.max(0, ...store.facilities.map((f) => f.id)) + 1,
    workers: Math.max(0, ...store.workers.map((w) => w.id)) + 1,
    edit_history: Math.max(0, ...store.edit_history.map((h) => h.id)) + 1,
    worker_assignments: Math.max(0, ...(store.worker_assignments || []).map((a) => a.id)) + 1,
  };

  setSavingPaused(false);
  saveStore();
  await flushStore();

  const backend = usesRemoteStorage() ? 'Upstash Redis（永続）' : 'data.json（ローカル）';
  console.log(`  データ保存: ${backend}`);
}

function logHistory(user, action, details) {
  store.edit_history.unshift({
    id: nextId.edit_history++,
    user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    action,
    details,
    created_at: now(),
  });
  if (store.edit_history.length > 1000) store.edit_history.length = 1000;
  saveStore();
}

function facilityCounts(f, workerCount) {
  const epa = f.epa_count || 0;
  const care_visa = f.care_visa_count || 0;
  const permanent = f.permanent_count || 0;
  const japanese = f.japanese_count || 0;
  const skill_total = epa + care_visa + permanent;
  const staff_capacity = japanese + epa + care_visa + permanent;
  const assigned = workerCount || 0;
  const diff = staff_capacity - assigned;
  return {
    epa,
    care_visa,
    permanent,
    skill_total,
    staff_capacity,
    assigned,
    diff,
    is_alert: assigned > staff_capacity,
  };
}

function getAllData() {
  const workers = store.workers;
  return store.facilities
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((f) => {
      const facilityWorkers = workers.filter((w) => w.facility_id === f.id);
      const counts = facilityCounts(f, facilityWorkers.length);
      return {
        ...f,
        workers: facilityWorkers,
        counts,
        diff: counts.diff,
        is_alert: counts.is_alert,
      };
    });
}

function getUnassignedWorkers() {
  return store.workers.filter((w) => !w.facility_id);
}

function getSummary() {
  const facilities = getAllData();
  const unassigned = store.workers.filter((w) => !w.facility_id).length;
  const alertCount = facilities.filter((f) => f.is_alert).length;
  const totalJapanese = facilities.reduce((s, f) => s + f.japanese_count, 0);
  const totalSkill = facilities.reduce((s, f) => s + f.counts.skill_total, 0);
  const totalAssigned = facilities.reduce((s, f) => s + f.counts.assigned, 0);
  return { facilityCount: facilities.length, totalJapanese, totalSkill, totalAssigned, unassigned, alertCount };
}

function addFacility(name, address, inCouncil) {
  const maxOrder = store.facilities.reduce((m, f) => Math.max(m, f.sort_order), -1);
  const facility = makeFacility({ name, address, in_council: !!inCouncil }, nextId.facilities++, maxOrder + 1);
  store.facilities.push(facility);
  saveStore();
  return facility;
}

function updateFacility(facilityId, updates) {
  const f = store.facilities.find((x) => x.id === Number(facilityId));
  if (!f) return null;
  const prev = { name: f.name, address: f.address, in_council: f.in_council };
  if (updates.name !== undefined) f.name = updates.name.trim();
  if (updates.address !== undefined) f.address = updates.address.trim();
  if (updates.in_council !== undefined) f.in_council = !!updates.in_council;
  saveStore();
  return { facility: f, prev };
}

function deleteFacility(facilityId) {
  const f = store.facilities.find((x) => x.id === Number(facilityId));
  if (!f) return null;
  const today = todayDate();
  store.workers.forEach((w) => {
    if (w.facility_id === f.id) {
      endCurrentAssignment(w.id, today);
      startAssignment(w.id, null, today);
      w.facility_id = null;
    }
  });
  store.facilities = store.facilities.filter((x) => x.id !== f.id);
  saveStore();
  return f;
}

function reorderFacilities(orderedIds) {
  orderedIds.forEach((id, index) => {
    const f = store.facilities.find((x) => x.id === Number(id));
    if (f) f.sort_order = index;
  });
  saveStore();
}

function updateFacilityCount(facilityId, field, count) {
  const col = COUNT_FIELDS[field];
  if (!col) return null;
  const f = store.facilities.find((x) => x.id === Number(facilityId));
  if (!f) return null;
  const prev = f[col];
  f[col] = Math.max(0, parseInt(count) || 0);
  saveStore();
  return { facility: f, prev, field };
}

const db = {
  prepare(sql) {
    return {
      get(...params) {
        if (sql.includes('FROM users WHERE username')) {
          return store.users.find((u) => u.username === params[0]) || undefined;
        }
        if (sql.includes('FROM facilities WHERE id')) {
          return store.facilities.find((f) => f.id === Number(params[0])) || undefined;
        }
        if (sql.includes('FROM workers WHERE id')) {
          return store.workers.find((w) => w.id === Number(params[0])) || undefined;
        }
        if (sql.includes('SELECT name FROM facilities WHERE id')) {
          const f = store.facilities.find((f) => f.id === Number(params[0]));
          return f ? { name: f.name } : undefined;
        }
        return undefined;
      },
      all(...params) {
        if (sql.includes('FROM edit_history ORDER BY')) {
          return store.edit_history.slice(0, params[0] || 100);
        }
        if (sql.includes('FROM users ORDER BY')) {
          return store.users.map(({ password_hash, ...u }) => u);
        }
        return [];
      },
      run(...params) {
        if (sql.includes('INSERT INTO users')) {
          const [username, password_hash, role, display_name] = params;
          if (store.users.find((u) => u.username === username)) throw new Error('UNIQUE');
          const user = { id: nextId.users++, username, password_hash, role, display_name, created_at: now() };
          store.users.push(user);
          saveStore();
          return { lastInsertRowid: user.id };
        }
        if (sql.includes('INSERT INTO workers')) {
          const [name, flag, nationality, category, facility_id] = params;
          const worker = {
            id: nextId.workers++,
            name,
            flag: flag || '🏳️',
            nationality,
            birth_date: '',
            category,
            facility_id: facility_id || null,
            created_at: now(),
          };
          store.workers.push(worker);
          if (facility_id) {
            startAssignment(worker.id, facility_id, dateFromTimestamp(worker.created_at));
          }
          saveStore();
          return { lastInsertRowid: worker.id };
        }
        if (sql.includes('UPDATE workers SET facility_id')) {
          const [facility_id, id] = params;
          moveWorkerAssignment(Number(id), facility_id || null);
          return {};
        }
        if (sql.includes('DELETE FROM workers WHERE id')) {
          endCurrentAssignment(Number(params[0]), todayDate());
          store.workers = store.workers.filter((w) => w.id !== Number(params[0]));
          saveStore();
          return {};
        }
        return {};
      },
    };
  },
};

module.exports = {
  db,
  initDb,
  logHistory,
  getAllData,
  getUnassignedWorkers,
  getSummary,
  addFacility,
  updateFacility,
  deleteFacility,
  reorderFacilities,
  updateFacilityCount,
  getWorkerTimeline,
  getWorkerById,
  updateWorker,
  updateAssignment,
  addAssignment,
  deleteAssignment,
  moveWorkerAssignment,
  WORKER_CATEGORIES,
  CATEGORY_LABELS,
  COUNT_FIELDS,
};
