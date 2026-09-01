const ROLE_LABELS = { admin: '管理者', editor: '編集者', viewer: '閲覧者' };

function formatUserBadge(user) {
  if (!user) return '';
  if (user.role === 'admin') return `${user.display_name}（管理者）`;
  const roleLabel = ROLE_LABELS[user.role] || '編集者';
  return `${user.display_name}さん（${roleLabel}）`;
}

const COUNTRY_FLAGS = [
  ['インドネシア', '🇮🇩'], ['indonesia', '🇮🇩'],
  ['ミャンマー', '🇲🇲'], ['myanmar', '🇲🇲'], ['ビルマ', '🇲🇲'],
  ['スリランカ', '🇱🇰'], ['sri lanka', '🇱🇰'],
  ['ベトナム', '🇻🇳'], ['vietnam', '🇻🇳'], ['viet nam', '🇻🇳'],
  ['ネパール', '🇳🇵'], ['nepal', '🇳🇵'],
  ['フィリピン', '🇵🇭'], ['philippines', '🇵🇭'],
  ['中国', '🇨🇳'], ['china', '🇨🇳'],
  ['タイ', '🇹🇭'], ['thailand', '🇹🇭'],
  ['カンボジア', '🇰🇭'], ['cambodia', '🇰🇭'],
  ['バングラデシュ', '🇧🇩'], ['bangladesh', '🇧🇩'],
  ['モンゴル', '🇲🇳'], ['mongolia', '🇲🇳'],
  ['インド', '🇮🇳'], ['india', '🇮🇳'],
  ['パキスタン', '🇵🇰'], ['pakistan', '🇵🇰'],
  ['マレーシア', '🇲🇾'], ['malaysia', '🇲🇾'],
  ['韓国', '🇰🇷'], ['korea', '🇰🇷'], ['大韓民国', '🇰🇷'],
  ['日本', '🇯🇵'], ['japan', '🇯🇵'],
  ['ウズベキスタン', '🇺🇿'], ['uzbekistan', '🇺🇿'],
];

function flagForCountry(input) {
  const q = (input || '').trim().toLowerCase();
  if (!q) return '';
  for (const [name, flag] of COUNTRY_FLAGS) {
    const n = name.toLowerCase();
    if (q === n || q.includes(n) || n.includes(q)) return flag;
  }
  return '';
}

function syncFlagFromNationality() {
  const nationality = document.getElementById('newWorkerNationality').value;
  const flag = flagForCountry(nationality);
  document.getElementById('newWorkerFlag').value = flag || (nationality.trim() ? '🏳️' : '');
}

let state = {
  user: null,
  facilities: [],
  unassigned: [],
  summary: {},
  canEdit: false,
  isAdmin: false,
  currentTab: 'staff',
  orderList: [],
  orderDirty: false,
};

let dragWorkerId = null;
let dragFacilityOrderId = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

async function checkAuth() {
  const { user } = await api('/api/auth/me');
  if (user) {
    state.user = user;
    showApp();
    await loadData();
  } else {
    showLogin();
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        display_name: document.getElementById('loginDisplayName').value,
        password: document.getElementById('loginPassword').value,
      }),
    });
    state.user = user;
    showApp();
    await loadData();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  showLogin();
});

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userBadge').textContent = formatUserBadge(state.user);
}

document.getElementById('loginPasswordToggle').addEventListener('click', () => {
  const input = document.getElementById('loginPassword');
  const btn = document.getElementById('loginPasswordToggle');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.textContent = visible ? '👁️' : '🙈';
  btn.setAttribute('aria-label', visible ? 'パスワードを表示' : 'パスワードを非表示');
  btn.title = visible ? 'パスワードを表示' : 'パスワードを非表示';
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('tabStaff').classList.toggle('hidden', tab !== 'staff');
  document.getElementById('tabOrder').classList.toggle('hidden', tab !== 'order');
  if (tab === 'order') {
    state.orderList = state.facilities.map((f) => f.id);
    state.orderDirty = false;
    renderOrderList();
  }
}

async function loadData() {
  const data = await api('/api/data');
  state.facilities = data.facilities;
  state.unassigned = data.unassigned;
  state.summary = data.summary;
  state.canEdit = data.canEdit;
  state.isAdmin = data.isAdmin;
  if (state.currentTab === 'order') {
    state.orderList = state.facilities.map((f) => f.id);
    state.orderDirty = false;
  }
  render();
}

function render() {
  const canEdit = state.canEdit;
  document.getElementById('readOnlyBanner').classList.toggle('hidden', canEdit);
  document.getElementById('toolbar').classList.toggle('hidden', !canEdit);
  document.getElementById('historyBtn').classList.toggle('hidden', !state.isAdmin);
  renderSummary();
  renderAlerts();
  renderSheet(canEdit);
  renderUnassigned(canEdit);
  updateWorkerModalFacilities();
  if (state.currentTab === 'order') renderOrderList();
  document.getElementById('orderActions').classList.toggle('hidden', !canEdit);
}

function getFacilityById(id) {
  return state.facilities.find((f) => f.id === id);
}

function renderOrderList() {
  const list = document.getElementById('orderList');
  const canEdit = state.canEdit;
  const ids = state.orderList.length ? state.orderList : state.facilities.map((f) => f.id);

  list.innerHTML = ids.map((id, index) => {
    const f = getFacilityById(id);
    if (!f) return '';
    const dragAttrs = canEdit
      ? `draggable="true" ondragstart="onFacilityDragStart(event,${id})" ondragend="onFacilityDragEnd(event)" ondragover="onFacilityDragOver(event,${id})" ondragleave="onFacilityDragLeave(event)" ondrop="onFacilityDrop(event,${id})"`
      : '';
    return `<li class="order-item" data-facility-id="${id}" ${dragAttrs}>
      <span class="order-grip">${canEdit ? '⠿' : ''}</span>
      <span class="order-num">${index + 1}</span>
      <div class="order-info">
        <div class="name">${esc(f.name)}</div>
        <div class="address">${esc(f.address)}</div>
      </div>
      ${canEdit ? `<div class="order-btns">
        <button type="button" onclick="moveFacilityUp(${id})" ${index === 0 ? 'disabled' : ''} title="上へ">↑</button>
        <button type="button" onclick="moveFacilityDown(${id})" ${index === ids.length - 1 ? 'disabled' : ''} title="下へ">↓</button>
      </div>` : ''}
    </li>`;
  }).join('');
}

function moveFacilityInOrder(facilityId, direction) {
  const ids = [...state.orderList];
  const idx = ids.indexOf(facilityId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= ids.length) return;
  ids.splice(idx, 1);
  ids.splice(newIdx, 0, facilityId);
  state.orderList = ids;
  state.orderDirty = true;
  renderOrderList();
}

function moveFacilityUp(id) { moveFacilityInOrder(id, -1); }
function moveFacilityDown(id) { moveFacilityInOrder(id, 1); }

function onFacilityDragStart(e, facilityId) {
  if (!state.canEdit) return;
  dragFacilityOrderId = facilityId;
  e.target.closest('.order-item')?.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `facility:${facilityId}`);
}

function onFacilityDragEnd(e) {
  e.target.closest('.order-item')?.classList.remove('dragging');
  dragFacilityOrderId = null;
  document.querySelectorAll('.order-item').forEach((el) => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function onFacilityDragOver(e, targetId) {
  if (!state.canEdit) return;
  e.preventDefault();
  const item = e.currentTarget;
  item.classList.remove('drag-over-top', 'drag-over-bottom');
  const rect = item.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  item.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
}

function onFacilityDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
}

function onFacilityDrop(e, targetId) {
  if (!state.canEdit) return;
  e.preventDefault();
  const item = e.currentTarget;
  const insertBefore = item.classList.contains('drag-over-top');
  item.classList.remove('drag-over-top', 'drag-over-bottom');

  const raw = e.dataTransfer.getData('text/plain');
  const sourceId = raw.startsWith('facility:')
    ? parseInt(raw.slice(9))
    : dragFacilityOrderId;
  if (!sourceId || sourceId === targetId) return;

  const ids = [...state.orderList];
  const fromIdx = ids.indexOf(sourceId);
  let toIdx = ids.indexOf(targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  ids.splice(fromIdx, 1);
  toIdx = ids.indexOf(targetId);
  if (!insertBefore) toIdx += 1;
  ids.splice(toIdx, 0, sourceId);

  state.orderList = ids;
  state.orderDirty = true;
  renderOrderList();
}

async function saveFacilityOrder() {
  try {
    await api('/api/facilities/reorder', {
      method: 'PUT',
      body: JSON.stringify({ order: state.orderList }),
    });
    state.orderDirty = false;
    await loadData();
    alert('並び順を保存しました');
  } catch (err) {
    alert(err.message);
  }
}

function renderSummary() {
  const s = state.summary;
  document.getElementById('summary').innerHTML = `
    <div class="stat-card"><div class="label">事業所数</div><div class="value">${s.facilityCount}</div></div>
    <div class="stat-card"><div class="label">日本人（合計）</div><div class="value" style="color:var(--japanese)">${s.totalJapanese}</div></div>
    <div class="stat-card"><div class="label">特定技能人材（合計）</div><div class="value">${s.totalSkill}</div></div>
    <div class="stat-card"><div class="label">未配置</div><div class="value" style="color:var(--warning)">${s.unassigned}</div></div>
    <div class="stat-card ${s.alertCount > 0 ? 'danger' : 'ok'}"><div class="label">アラート</div><div class="value">${s.alertCount}</div></div>
  `;
}

function renderAlerts() {
  const alerts = state.facilities.filter((f) => f.is_alert);
  const banner = document.getElementById('alertBanner');
  if (alerts.length === 0) {
    banner.classList.remove('visible');
    banner.innerHTML = '';
    return;
  }
  banner.classList.add('visible');
  banner.innerHTML = `
    <strong>要対応：配置人員が定員合計（日本人＋EPA＋介護＋永住者等）を上回っています</strong>
    <ul>${alerts.map((a) =>
      `<li><strong>${esc(a.name)}</strong>：定員 ${a.counts.staff_capacity} 名 &lt; 配置 ${a.counts.assigned} 名（${a.counts.assigned - a.counts.staff_capacity} 名超過）</li>`
    ).join('')}</ul>
  `;
}

function renderWorkerChip(worker, canEdit) {
  const dragAttrs = canEdit
    ? `draggable="true" ondragstart="onDragStart(event,${worker.id})" ondragend="onDragEnd(event)"`
    : 'draggable="false"';
  const removeBtn = canEdit
    ? `<button class="remove" onclick="removeWorker(${worker.id})" title="削除">&times;</button>`
    : '';

  return `<span class="worker-chip ${canEdit ? '' : 'readonly'}" ${dragAttrs} data-worker-id="${worker.id}">
    <span class="worker-flag">${worker.flag || '🏳️'}</span>
    <button type="button" class="worker-name-btn" draggable="false"
      onclick="showWorkerTimeline(${worker.id}, event)"
      onmousedown="event.stopPropagation()"
      title="配置履歴を見る">${esc(worker.name)}</button>
    ${removeBtn}
  </span>`;
}

function numInput(facilityId, field, value, canEdit) {
  return `<input type="number" class="num-input" min="0" value="${value}"
    ${canEdit ? '' : 'disabled'}
    onchange="updateCount(${facilityId}, '${field}', this.value)">`;
}

function renderSheet(canEdit) {
  document.getElementById('sheetBody').innerHTML = state.facilities.map((f) => {
    const workers = f.workers || [];
    const c = f.counts;
    const diffClass = f.diff >= 0 ? 'diff-ok' : 'diff-ng';
    const noCouncil = !f.in_council;

    return `<tr class="${f.is_alert ? 'alert-row' : ''} ${noCouncil ? 'no-council-row' : ''}">
      <td class="facility-cell">
        <div class="name">${esc(f.name)}</div>
        <div class="address">${esc(f.address)}</div>
        ${canEdit ? `<button class="btn-link" onclick="openEditFacility(${f.id})">編集</button>` : ''}
      </td>
      <td style="text-align:center">
        <span class="council-pill ${f.in_council ? 'council-yes' : 'council-no'}">${f.in_council ? '加入' : '未加入'}</span>
      </td>
      <td style="text-align:center">${numInput(f.id, 'japanese', f.japanese_count, canEdit)}</td>
      <td style="text-align:center">${numInput(f.id, 'epa', c.epa, canEdit)}</td>
      <td style="text-align:center">${numInput(f.id, 'care_visa', c.care_visa, canEdit)}</td>
      <td style="text-align:center">${numInput(f.id, 'permanent', c.permanent, canEdit)}</td>
      <td style="text-align:center"><span class="count-badge count-foreign">${c.skill_total}</span></td>
      <td style="text-align:center"><span class="${diffClass}">${f.diff >= 0 ? '+' : ''}${f.diff}</span></td>
      <td style="text-align:center">
        <span class="status-pill ${f.is_alert ? 'status-ng' : 'status-ok'}">${f.is_alert ? '超過' : 'OK'}</span>
      </td>
      <td>
        <div class="workers-zone ${noCouncil ? 'no-drop' : ''}" data-facility-id="${f.id}" data-in-council="${f.in_council}"
          ${canEdit && f.in_council ? `ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,${f.id})"` : ''}
          ${canEdit && noCouncil ? `ondragover="onDragOverBlocked(event)" ondrop="onDropBlocked(event)"` : ''}>
          ${noCouncil ? '<span class="empty-hint blocked-hint">協議会未加入 — 配置不可</span>'
            : workers.length === 0
              ? '<span class="empty-hint">ここにドロップ</span>'
              : workers.map((w) => renderWorkerChip(w, canEdit)).join('')}
        </div>
      </td>
      <td class="row-actions">
        ${canEdit ? `<button class="btn btn-sm" onclick="openEditFacility(${f.id})">編集</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderUnassigned(canEdit) {
  const zone = document.getElementById('unassignedZone');
  const workers = state.unassigned || [];
  const dropAttrs = canEdit
    ? `ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, null)"`
    : '';

  zone.innerHTML = workers.length === 0
    ? '<span class="empty-hint">未配置の人材はありません</span>'
    : workers.map((w) => renderWorkerChip(w, canEdit)).join('');
  if (canEdit) {
    zone.setAttribute('ondragover', 'onDragOver(event)');
    zone.setAttribute('ondragleave', 'onDragLeave(event)');
    zone.setAttribute('ondrop', 'onDrop(event, null)');
  }
}

function updateWorkerModalFacilities() {
  document.getElementById('newWorkerFacility').innerHTML =
    '<option value="">未配置</option>' +
    state.facilities
      .filter((f) => f.in_council)
      .map((f) => `<option value="${f.id}">${esc(f.name)}</option>`)
      .join('');
}

async function updateCount(facilityId, field, value) {
  try {
    await api(`/api/facilities/${facilityId}/counts`, {
      method: 'PATCH',
      body: JSON.stringify({ field, count: value }),
    });
    await loadData();
  } catch (err) {
    alert(err.message);
    await loadData();
  }
}

async function removeWorker(workerId) {
  if (!confirm('この人材を削除しますか？')) return;
  try {
    await api(`/api/workers/${workerId}`, { method: 'DELETE' });
    await loadData();
  } catch (err) {
    alert(err.message);
  }
}

function onDragStart(e, workerId) {
  if (!state.canEdit) return;
  dragWorkerId = workerId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(workerId));
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
  dragWorkerId = null;
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}

function onDragOver(e) {
  if (!state.canEdit) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDragOverBlocked(e) {
  if (!state.canEdit) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'none';
}

function onDropBlocked(e) {
  if (!state.canEdit) return;
  e.preventDefault();
  alert('協議会未登録のため就労不可です！');
}

async function onDrop(e, facilityId) {
  if (!state.canEdit) return;
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const targetId = facilityId === null || facilityId === 'null' || facilityId === ''
    ? null
    : parseInt(facilityId);

  if (targetId) {
    const facility = state.facilities.find((f) => f.id === targetId);
    if (facility && !facility.in_council) {
      alert('協議会未登録のため就労不可です！');
      return;
    }
  }

  const workerId = parseInt(e.dataTransfer.getData('text/plain') || dragWorkerId);
  if (!workerId) return;

  try {
    await api(`/api/workers/${workerId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ facility_id: targetId }),
    });
    await loadData();
  } catch (err) {
    alert(err.message);
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('saveOrderBtn').addEventListener('click', saveFacilityOrder);

document.getElementById('historyBtn').addEventListener('click', async () => {
  if (!state.isAdmin) return;
  openModal('historyModal');
  const { history } = await api('/api/history');
  document.getElementById('historyBody').innerHTML = history.map((h) => `
    <tr>
      <td style="white-space:nowrap">${esc(h.created_at)}</td>
      <td>${esc(h.display_name)}</td>
      <td>${esc(h.action)}</td>
      <td>${esc(h.details)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">履歴がありません</td></tr>';
});

async function showWorkerTimeline(workerId, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  openModal('workerTimelineModal');
  const body = document.getElementById('workerTimelineBody');
  body.innerHTML = '<p class="timeline-loading">読み込み中...</p>';
  try {
    const { worker, timeline, timelineText } = await api(`/api/workers/${workerId}/assignments`);
    document.getElementById('workerTimelineTitle').textContent = `${worker.name} の配置履歴`;
    if (!timeline.length) {
      body.innerHTML = '<p class="timeline-empty">配置履歴がありません</p>';
      return;
    }
    body.innerHTML = `
      <p class="timeline-summary">${esc(timelineText)}</p>
      <ul class="timeline-list">
        ${timeline.map((a) => {
          const range = a.ended_at ? `${a.started_at} 〜 ${a.ended_at}` : `${a.started_at} 〜 現在`;
          return `<li><strong>${esc(a.facility_name)}</strong><span class="timeline-dates">${esc(range)}</span></li>`;
        }).join('')}
      </ul>
    `;
  } catch (err) {
    body.innerHTML = `<p class="timeline-error">${esc(err.message)}</p>`;
  }
}

document.getElementById('addFacilityBtn').addEventListener('click', () => {
  document.getElementById('newFacilityName').value = '';
  document.getElementById('newFacilityAddress').value = '';
  document.getElementById('newFacilityInCouncil').checked = false;
  openModal('facilityModal');
});

document.getElementById('confirmAddFacility').addEventListener('click', async () => {
  const name = document.getElementById('newFacilityName').value.trim();
  const address = document.getElementById('newFacilityAddress').value.trim();
  const in_council = document.getElementById('newFacilityInCouncil').checked;
  if (!name) { alert('事業所名を入力してください'); return; }
  try {
    await api('/api/facilities', {
      method: 'POST',
      body: JSON.stringify({ name, address, in_council }),
    });
    closeModal('facilityModal');
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

function openEditFacility(facilityId) {
  const f = state.facilities.find((x) => x.id === facilityId);
  if (!f) return;
  document.getElementById('editFacilityId').value = f.id;
  document.getElementById('editFacilityName').value = f.name;
  document.getElementById('editFacilityAddress').value = f.address;
  document.getElementById('editFacilityInCouncil').checked = !!f.in_council;
  openModal('editFacilityModal');
}

document.getElementById('confirmEditFacility').addEventListener('click', async () => {
  const id = document.getElementById('editFacilityId').value;
  const name = document.getElementById('editFacilityName').value.trim();
  const address = document.getElementById('editFacilityAddress').value.trim();
  const in_council = document.getElementById('editFacilityInCouncil').checked;
  if (!name) { alert('事業所名を入力してください'); return; }
  try {
    await api(`/api/facilities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, address, in_council }),
    });
    closeModal('editFacilityModal');
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('deleteFacilityBtn').addEventListener('click', async () => {
  const id = document.getElementById('editFacilityId').value;
  const f = state.facilities.find((x) => x.id === Number(id));
  if (!confirm(`「${f?.name}」を削除しますか？\n所属する人材は未配置に移動します。`)) return;
  try {
    await api(`/api/facilities/${id}`, { method: 'DELETE' });
    closeModal('editFacilityModal');
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('addWorkerBtn').addEventListener('click', () => {
  document.getElementById('newWorkerName').value = '';
  document.getElementById('newWorkerFlag').value = '';
  document.getElementById('newWorkerNationality').value = '';
  openModal('workerModal');
});

document.getElementById('newWorkerNationality').addEventListener('input', syncFlagFromNationality);

document.getElementById('confirmAddWorker').addEventListener('click', async () => {
  const name = document.getElementById('newWorkerName').value.trim();
  const flag = document.getElementById('newWorkerFlag').value.trim();
  const nationality = document.getElementById('newWorkerNationality').value.trim();
  const facility_id = document.getElementById('newWorkerFacility').value || null;
  if (!name) { alert('氏名を入力してください'); return; }

  try {
    await api('/api/workers', {
      method: 'POST',
      body: JSON.stringify({
        name, flag: flag || '🏳️', nationality,
        facility_id: facility_id ? parseInt(facility_id) : null,
      }),
    });
    closeModal('workerModal');
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const rows = [
    ['事業所名', '住所', '協議会', '日本人', 'EPA介護福祉士', '在留資格「介護」', '永住者・配偶者等', '特定技能人材合計', '配置人員', '定員合計', '余裕', '状態'],
  ];
  state.facilities.forEach((f) => {
    rows.push([
      f.name, f.address, f.in_council ? '加入' : '未加入', f.japanese_count,
      f.counts.epa, f.counts.care_visa, f.counts.permanent,
      f.counts.skill_total, f.counts.assigned, f.counts.staff_capacity,
      f.diff, f.is_alert ? '超過' : 'OK',
    ]);
  });
  const bom = '\uFEFF';
  const csv = bom + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `人員配置表_ウェルサポ_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

window.updateCount = updateCount;
window.removeWorker = removeWorker;
window.openEditFacility = openEditFacility;
window.onDragStart = onDragStart;
window.onDragEnd = onDragEnd;
window.onDragOver = onDragOver;
window.onDragLeave = onDragLeave;
window.onDragOverBlocked = onDragOverBlocked;
window.onDropBlocked = onDropBlocked;
window.onDrop = onDrop;
window.moveFacilityUp = moveFacilityUp;
window.moveFacilityDown = moveFacilityDown;
window.onFacilityDragStart = onFacilityDragStart;
window.onFacilityDragEnd = onFacilityDragEnd;
window.onFacilityDragOver = onFacilityDragOver;
window.onFacilityDragLeave = onFacilityDragLeave;
window.onFacilityDrop = onFacilityDrop;
window.showWorkerTimeline = showWorkerTimeline;

checkAuth();
