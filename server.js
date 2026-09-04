const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const {
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
  updateWorker,
  updateAssignment,
  addAssignment,
  deleteAssignment,
  WORKER_CATEGORIES,
  CATEGORY_LABELS,
  COUNT_FIELDS,
} = require('./db');

const COUNT_LABELS = {
  japanese: '日本人',
  epa: 'EPA介護福祉士',
  care_visa: '在留資格「介護」',
  permanent: '永住者・配偶者等',
};

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'wellsupo-staff-tracker-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

function requireEditor(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'ログインが必要です' });
  if (req.session.user.role === 'viewer') return res.status(403).json({ error: '編集権限がありません' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'ログインが必要です' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '管理者権限が必要です' });
  next();
}

const SHARED_PASSWORD = process.env.SHARED_PASSWORD || '5961';
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'ナリカワ';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Una6759';

// --- Auth ---

app.post('/api/auth/login', (req, res) => {
  const { display_name, password } = req.body;
  if (!display_name?.trim()) return res.status(400).json({ error: 'お名前を入力してください' });
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });

  const name = display_name.trim();
  let role;
  let sessionDisplayName;

  if (password === ADMIN_PASSWORD) {
    role = 'admin';
    sessionDisplayName = ADMIN_NAME;
  } else if (password === SHARED_PASSWORD) {
    role = 'editor';
    sessionDisplayName = name;
  } else if (VIEWER_PASSWORD && password === VIEWER_PASSWORD) {
    role = 'viewer';
    sessionDisplayName = name;
  } else {
    return res.status(401).json({ error: 'パスワードが正しくありません' });
  }

  req.session.user = {
    id: null,
    username: name,
    role,
    display_name: sessionDisplayName,
  };

  logHistory(req.session.user, 'ログイン', `${name} がログインしました`);
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const user = req.session.user;
  logHistory(user, 'ログアウト', `${user.display_name} がログアウトしました`);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// --- Data ---

app.get('/api/data', requireAuth, (req, res) => {
  res.json({
    facilities: getAllData(),
    unassigned: getUnassignedWorkers(),
    summary: getSummary(),
    categories: WORKER_CATEGORIES.map((k) => ({ key: k, label: CATEGORY_LABELS[k] })),
    canEdit: req.session.user.role !== 'viewer',
    isAdmin: req.session.user.role === 'admin',
  });
});

app.post('/api/facilities', requireEditor, (req, res) => {
  const { name, address, in_council } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '事業所名を入力してください' });

  const facility = addFacility(name.trim(), (address || '').trim(), in_council);
  const councilLabel = facility.in_council ? '協議会加入' : '協議会未加入';
  logHistory(req.session.user, '事業所追加', `「${facility.name}」を追加（${councilLabel}）`);
  res.json({ id: facility.id });
});

app.patch('/api/facilities/:id', requireEditor, (req, res) => {
  const { name, address, in_council } = req.body;
  if (name !== undefined && !name?.trim()) {
    return res.status(400).json({ error: '事業所名を入力してください' });
  }

  const result = updateFacility(req.params.id, {
    name: name?.trim(),
    address,
    in_council,
  });
  if (!result) return res.status(404).json({ error: '事業所が見つかりません' });

  const { facility, prev } = result;
  const changes = [];
  if (prev.name !== facility.name) changes.push(`名称: ${prev.name} → ${facility.name}`);
  if (prev.address !== facility.address) changes.push('住所を変更');
  if (prev.in_council !== facility.in_council) {
    changes.push(facility.in_council ? '協議会: 未加入 → 加入' : '協議会: 加入 → 未加入');
  }
  logHistory(req.session.user, '事業所編集', `「${facility.name}」: ${changes.join('、') || '情報を更新'}`);
  res.json({ ok: true });
});

app.delete('/api/facilities/:id', requireEditor, (req, res) => {
  const facility = deleteFacility(req.params.id);
  if (!facility) return res.status(404).json({ error: '事業所が見つかりません' });

  logHistory(req.session.user, '事業所削除', `「${facility.name}」を削除（所属人材は未配置へ）`);
  res.json({ ok: true });
});

app.put('/api/facilities/reorder', requireEditor, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: '並び順が不正です' });
  }
  reorderFacilities(order);
  logHistory(req.session.user, '事業所並び替え', `${order.length} 事業所の表示順を変更`);
  res.json({ ok: true });
});

app.patch('/api/facilities/:id/counts', requireEditor, (req, res) => {
  const { field, count } = req.body;
  if (!COUNT_FIELDS[field]) return res.status(400).json({ error: '項目が不正です' });

  const result = updateFacilityCount(req.params.id, field, count);
  if (!result) return res.status(404).json({ error: '事業所が見つかりません' });

  const { facility, prev, field: f } = result;
  const col = COUNT_FIELDS[f];
  const newCount = facility[col];
  logHistory(
    req.session.user,
    '人数変更',
    `「${facility.name}」の${COUNT_LABELS[f]}: ${prev} → ${newCount}`
  );
  res.json({ ok: true });
});

app.post('/api/workers', requireEditor, (req, res) => {
  const { name, flag, nationality, facility_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '氏名を入力してください' });

  const category = 'care_visa';

  if (facility_id) {
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facility_id);
    if (!facility) return res.status(404).json({ error: '事業所が見つかりません' });
    if (!facility.in_council) {
      return res.status(403).json({ error: '協議会未登録のため就労不可です！' });
    }
  }

  const result = db
    .prepare('INSERT INTO workers (name, flag, nationality, category, facility_id) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), (flag || '🏳️').trim(), (nationality || '').trim(), category, facility_id || null);

  const facilityName = facility_id
    ? db.prepare('SELECT name FROM facilities WHERE id = ?').get(facility_id)?.name || '不明'
    : '未配置';

  logHistory(
    req.session.user,
    '人材追加',
    `「${name.trim()}」を${facilityName}に追加`
  );

  res.json({ id: result.lastInsertRowid });
});

app.patch('/api/workers/:id/move', requireEditor, (req, res) => {
  const { facility_id } = req.body;
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  if (facility_id) {
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facility_id);
    if (!facility) return res.status(404).json({ error: '事業所が見つかりません' });
    if (!facility.in_council) {
      return res.status(403).json({ error: '協議会未登録のため就労不可です！' });
    }
  }

  const prevFacility = worker.facility_id
    ? db.prepare('SELECT name FROM facilities WHERE id = ?').get(worker.facility_id)?.name
    : '未配置';
  const newFacility = facility_id
    ? db.prepare('SELECT name FROM facilities WHERE id = ?').get(facility_id)?.name
    : '未配置';

  db.prepare('UPDATE workers SET facility_id = ? WHERE id = ?').run(facility_id || null, worker.id);

  logHistory(
    req.session.user,
    '人材移動',
    `「${worker.name}」: ${prevFacility} → ${newFacility}`
  );

  res.json({ ok: true });
});

app.delete('/api/workers/:id', requireEditor, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  db.prepare('DELETE FROM workers WHERE id = ?').run(worker.id);
  logHistory(
    req.session.user,
    '人材削除',
    `${CATEGORY_LABELS[worker.category]}「${worker.name}」を削除`
  );
  res.json({ ok: true });
});

app.patch('/api/workers/:id', requireEditor, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  const { name, nationality, flag, birth_date } = req.body;
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: '氏名を入力してください' });
  }

  const result = updateWorker(worker.id, { name, nationality, flag, birth_date });
  if (!result) return res.status(404).json({ error: '人材が見つかりません' });

  const changes = [];
  if (result.prev.name !== result.worker.name) {
    changes.push(`氏名: ${result.prev.name} → ${result.worker.name}`);
  }
  if (result.prev.nationality !== result.worker.nationality) {
    changes.push(`国籍: ${result.prev.nationality || '（空）'} → ${result.worker.nationality || '（空）'}`);
  }
  if ((result.prev.birth_date || '') !== (result.worker.birth_date || '')) {
    changes.push(`生年月日: ${result.prev.birth_date || '（空）'} → ${result.worker.birth_date || '（空）'}`);
  }

  logHistory(
    req.session.user,
    '人材情報編集',
    `「${result.worker.name}」: ${changes.join('、') || '情報を更新'}`
  );

  res.json({ worker: result.worker });
});

app.get('/api/workers/:id/assignments', requireAuth, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  const timeline = getWorkerTimeline(Number(req.params.id));
  const timelineText = timeline
    .map((a) => {
      const range = a.ended_at ? `${a.started_at}-${a.ended_at}` : `${a.started_at}-`;
      return `${a.facility_name}（${range}）`;
    })
    .join('→');

  res.json({
    worker: {
      id: worker.id,
      name: worker.name,
      flag: worker.flag,
      nationality: worker.nationality || '',
      birth_date: worker.birth_date || '',
    },
    timeline,
    timelineText,
    canEdit: req.session.user.role !== 'viewer',
  });
});

app.post('/api/workers/:id/assignments', requireEditor, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  const { facility_id, started_at, ended_at } = req.body;
  if (facility_id) {
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facility_id);
    if (!facility) return res.status(404).json({ error: '事業所が見つかりません' });
  }

  const assignment = addAssignment(worker.id, { facility_id, started_at, ended_at });
  logHistory(
    req.session.user,
    '職歴追加',
    `「${worker.name}」: ${assignment.facility_name}（${assignment.started_at}${assignment.ended_at ? '-' + assignment.ended_at : '-'}）`
  );
  res.json({ assignment });
});

app.patch('/api/workers/:id/assignments/:assignmentId', requireEditor, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  const { facility_id, started_at, ended_at, facility_name } = req.body;
  if (facility_id) {
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facility_id);
    if (!facility) return res.status(404).json({ error: '事業所が見つかりません' });
  }

  const assignment = updateAssignment(req.params.assignmentId, {
    facility_id,
    facility_name,
    started_at,
    ended_at,
  });
  if (!assignment || assignment.worker_id !== Number(req.params.id)) {
    return res.status(404).json({ error: '職歴が見つかりません' });
  }

  logHistory(
    req.session.user,
    '職歴編集',
    `「${worker.name}」: ${assignment.facility_name}（${assignment.started_at}${assignment.ended_at ? '-' + assignment.ended_at : '-'}）`
  );
  res.json({ assignment });
});

app.delete('/api/workers/:id/assignments/:assignmentId', requireEditor, (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '人材が見つかりません' });

  const assignment = deleteAssignment(req.params.assignmentId);
  if (!assignment || assignment.worker_id !== Number(req.params.id)) {
    return res.status(404).json({ error: '職歴が見つかりません' });
  }

  logHistory(
    req.session.user,
    '職歴削除',
    `「${worker.name}」: ${assignment.facility_name}（${assignment.started_at}${assignment.ended_at ? '-' + assignment.ended_at : '-'}）を削除`
  );
  res.json({ ok: true });
});

// --- History (admin only) ---

app.get('/api/history', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const history = db
    .prepare('SELECT * FROM edit_history ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json({ history });
});

// --- User management (admin only) ---

app.get('/api/users', requireAdmin, (req, res) => {
  const users = db
    .prepare('SELECT id, username, role, display_name, created_at FROM users ORDER BY id')
    .all();
  res.json({ users });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: '必須項目を入力してください' });
  }
  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ error: '権限が不正です' });
  }

  try {
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), role, display_name);
    logHistory(req.session.user, 'ユーザー追加', `ユーザー「${display_name}」（${role}）を追加`);
    res.json({ id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'ユーザー名が既に使われています' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  【人員配置表】株式会社ウェルサポ様`);
    console.log(`  → http://localhost:${PORT}\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
