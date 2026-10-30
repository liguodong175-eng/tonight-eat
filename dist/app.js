const STORAGE_KEY = 'dinner-wheel-v1';
const $ = (selector) => document.querySelector(selector);
const app = $('#app');
const canvas = $('#wheel-canvas');
const ctx = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const blankState = () => ({ version: 1, restaurants: [], pending: [], visits: [] });

let state = loadState();
let excluded = new Set();
let currentResult = null;
let displayedWheel = null;
let spinning = false;
let wheelRotation = 0;
let toastTimer;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clean(value, limit = 80) {
  return String(value ?? '').trim().slice(0, limit);
}

function normalizeName(value) {
  return clean(value, 60).replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function validState(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.restaurants) || !Array.isArray(data.pending) || !Array.isArray(data.visits)) return false;
  if (data.restaurants.length > 3000 || data.pending.length > 10000 || data.visits.length > 10000) return false;
  const ids = new Set();
  const names = new Set();
  for (const r of data.restaurants) {
    if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) || typeof r.name !== 'string' || !clean(r.name, 60) || r.name.length > 60 || typeof r.active !== 'boolean') return false;
    if (['cuisine', 'taste', 'area'].some((key) => typeof r[key] !== 'string' || r[key].length > 80)) return false;
    const name = normalizeName(r.name);
    if (names.has(name)) return false;
    ids.add(r.id); names.add(name);
  }
  const eventIds = new Set();
  for (const event of [...data.pending, ...data.visits]) {
    if (!event || typeof event.id !== 'string' || !event.id || eventIds.has(event.id) || typeof event.restaurantId !== 'string' || !ids.has(event.restaurantId)) return false;
    eventIds.add(event.id);
  }
  return data.pending.every((event) => typeof event.drawnAt === 'string' && !Number.isNaN(Date.parse(event.drawnAt)))
    && data.visits.every((event) => (event.date === null || (typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date))) && ['draw', 'manual'].includes(event.source));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const data = JSON.parse(raw);
    return validState(data) ? data : blankState();
  } catch { return blankState(); }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast('浏览器未能保存数据，请先导出备份。'); }
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function tags(restaurant) {
  return [restaurant.cuisine, restaurant.taste].flatMap((value) => value.split(/[,，、/]+/).map((part) => part.trim()).filter(Boolean));
}

function eligibleRestaurants() {
  const taste = $('#taste-filter').value;
  return state.restaurants.filter((restaurant) => restaurant.active && !excluded.has(restaurant.id) && matchesFilters(restaurant, taste));
}

function matchesFilters(restaurant, taste) {
  return !taste || tags(restaurant).includes(taste);
}

function selectOptions(select, values, allLabel) {
  const previous = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  select.value = values.includes(previous) ? previous : '';
}

function renderFilters() {
  const tastes = [...new Set(state.restaurants.flatMap(tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  selectOptions($('#taste-filter'), tastes, '全部口味');
}

function drawWheel(restaurants) {
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 9;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center, center);
  const list = restaurants.length ? restaurants : [{ name: '加几家饭店' }];
  const colors = ['#f88268', '#eeb66e', '#d66b79', '#b46c8d', '#ee965c', '#8f6787', '#efaa88', '#b95964'];
  const span = Math.PI * 2 / list.length;
  list.forEach((restaurant, index) => {
    const start = -Math.PI / 2 + index * span;
    const end = start + span;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, end); ctx.closePath();
    ctx.fillStyle = colors[index % colors.length]; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#37202b'; ctx.stroke();
    ctx.save();
    ctx.rotate(start + span / 2);
    ctx.translate(radius * .66, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#301b27';
    ctx.font = `900 ${list.length > 16 ? 19 : list.length > 9 ? 22 : 27}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = list.length > 22 ? `${index + 1}` : Array.from(restaurant.name).slice(0, list.length > 12 ? 4 : 6).join('');
    ctx.fillText(label, 0, 0, radius * .54);
    ctx.restore();
  });
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.lineWidth = 12; ctx.strokeStyle = '#ffe5ae'; ctx.stroke();
  ctx.restore();
  canvas.setAttribute('aria-label', restaurants.length ? `饭店抽奖转盘，${restaurants.length} 家参与：${restaurants.map((r) => r.name).join('、')}` : '转盘里还没有可抽取的饭店');
}

function renderWheel() {
  const list = eligibleRestaurants();
  $('#eligible-count').textContent = list.length;
  $('#wheel-count').textContent = currentResult && displayedWheel ? `上轮 ${displayedWheel.length} 家` : `${list.length} 家可抽`;
  $('#draw-button').disabled = spinning || !list.length;
  $('#draw-button').textContent = spinning ? '转盘正在决定…' : '转一下，决定今晚 ✦';
  const empty = $('#wheel-empty');
  if (!list.length && !currentResult) {
    empty.hidden = false;
    empty.innerHTML = !state.restaurants.length
      ? '转盘还是空的。<br><button type="button" data-action="open-add">添加第一家饭店 →</button>'
      : state.restaurants.some((r) => r.active)
        ? '当前条件下没有可抽的饭店。<br><button type="button" data-action="reset-conditions">清除条件 →</button>'
        : '饭店都已置灰。<br><button type="button" data-action="open-manage">去清单恢复 →</button>';
    if (state.restaurants.length && state.restaurants.some((r) => r.active)) $('#adjust-panel').open = true;
  } else empty.hidden = true;
  drawWheel(currentResult && displayedWheel ? displayedWheel : list);
  const shown = state.restaurants.filter((r) => r.active && matchesFilters(r, $('#taste-filter').value));
  $('#candidate-list').innerHTML = shown.length ? shown.map((r) => `<button class="candidate-chip ${excluded.has(r.id) ? 'excluded' : ''}" type="button" data-action="exclude" data-id="${escapeHtml(r.id)}" aria-pressed="${excluded.has(r.id)}" title="${excluded.has(r.id) ? '取消临时排除' : '临时排除'}">${escapeHtml(r.name)} ${excluded.has(r.id) ? '×' : ''}</button>`).join('') : '<p class="empty-list" style="padding:22px 0">当前筛选下没有参与抽奖的饭店。</p>';
  $('#reset-wheel-filters').disabled = excluded.size === 0 && !$('#taste-filter').value;
  $('#adjust-count').textContent = $('#taste-filter').value ? `${$('#taste-filter').value}${excluded.size ? ` · 排除 ${excluded.size}` : ''}` : excluded.size ? `排除 ${excluded.size}` : '可选';
  renderResult();
  renderPendingReminder();
}

function renderResult() {
  const card = $('#result-card');
  const pending = state.pending.find((event) => event.id === currentResult);
  const restaurant = pending && state.restaurants.find((r) => r.id === pending.restaurantId);
  if (!restaurant) { card.hidden = true; card.innerHTML = ''; return; }
  card.hidden = false;
  card.innerHTML = `<div class="result-kicker">✦ TONIGHT'S PICK ✦</div><h3>${escapeHtml(restaurant.name)}</h3><p>${escapeHtml([restaurant.cuisine, restaurant.taste, restaurant.area].filter(Boolean).join(' · ') || '今晚就去试试它吧')}</p><div class="result-actions"><button type="button" data-action="confirm" data-id="${escapeHtml(pending.id)}">这次吃了 ✓</button><button class="secondary" type="button" data-action="undo" data-id="${escapeHtml(pending.id)}">撤销抽取</button></div>`;
}

function renderPendingReminder() {
  const remaining = state.pending.filter((event) => event.id !== currentResult);
  const reminder = $('#pending-reminder');
  reminder.hidden = remaining.length === 0;
  reminder.innerHTML = remaining.length ? `<strong>${remaining.length} 次抽取待确认</strong>${remaining.map((event) => {
    const restaurant = state.restaurants.find((r) => r.id === event.restaurantId);
    return `<div class="pending-item"><span>${escapeHtml(restaurant?.name || '未知饭店')}</span><div class="pending-actions"><button type="button" data-action="confirm" data-id="${escapeHtml(event.id)}">这次吃了</button><button class="secondary" type="button" data-action="undo" data-id="${escapeHtml(event.id)}">撤销</button></div></div>`;
  }).join('')}` : '';
}

function renderLibrary() {
  const sorted = [...state.restaurants].sort((a, b) => Number(b.active) - Number(a.active));
  $('#restaurant-list').innerHTML = sorted.length ? sorted.map((r) => {
    const visits = state.visits.filter((event) => event.restaurantId === r.id).length;
    const meta = [r.cuisine, r.taste, r.area, visits ? `吃过 ${visits} 次` : '', r.active ? '转盘中' : '已置灰'].filter(Boolean).join(' · ');
    return `<div class="restaurant-row ${r.active ? '' : 'is-inactive'}"><div class="restaurant-avatar">${escapeHtml(Array.from(r.name)[0])}</div><div><div class="restaurant-name">${escapeHtml(r.name)}</div><div class="restaurant-meta">${escapeHtml(meta)}</div></div><div class="restaurant-actions"><button type="button" data-action="edit" data-id="${escapeHtml(r.id)}">编辑</button><button type="button" class="${r.active ? '' : 'action-primary'}" data-action="toggle" data-id="${escapeHtml(r.id)}">${r.active ? '置灰' : '加入转盘'}</button></div></div>`;
  }).join('') : '<div class="empty-list">还没有饭店。点击上方“添加饭店”建立清单。</div>';
  $('#restaurant-count').textContent = `${state.restaurants.length} 家`;
  $('#library-summary').textContent = `共 ${state.restaurants.length} 家 · ${state.restaurants.filter((r) => r.active).length} 家在转盘中`;
  $('#restore-all').disabled = !state.restaurants.some((r) => !r.active);
}

function renderHistory() {
  $('#visited-count').textContent = state.visits.length;
  $('#history-list').innerHTML = state.visits.length ? state.visits.map((event) => {
    const r = state.restaurants.find((item) => item.id === event.restaurantId);
    return `<div class="visit-row"><div class="visit-info"><strong>${escapeHtml(r?.name || '未知饭店')}</strong><small>${event.date ? `${escapeHtml(event.date)} · 吃过` : '过往吃过 · 补记'}</small></div><button type="button" data-action="restore" data-id="${escapeHtml(event.restaurantId)}" ${r?.active ? 'disabled' : ''}>${r?.active ? '转盘中' : '加入转盘'}</button></div>`;
  }).join('') : '<div class="empty-list">还没有吃过记录。添加饭店时可以补记。</div>';
}

function render() { renderFilters(); renderWheel(); renderLibrary(); renderHistory(); }

function addRestaurant(form) {
  const values = Object.fromEntries(new FormData(form));
  const name = clean(values.name, 60);
  if (!name) return;
  const previouslyEaten = values.alreadyVisited === 'on';
  let restaurant = state.restaurants.find((r) => normalizeName(r.name) === normalizeName(name));
  if (restaurant && !previouslyEaten) { toast('这家饭店已经在清单里了。'); return; }
  if (!restaurant) {
    restaurant = { id: uid(), name, cuisine: clean(values.cuisine, 40), taste: '', area: '', active: !previouslyEaten, createdAt: new Date().toISOString() };
    state.restaurants.unshift(restaurant);
  } else if (previouslyEaten) {
    if (!restaurant.cuisine) restaurant.cuisine = clean(values.cuisine, 40);
    restaurant.active = false;
  }
  if (previouslyEaten) state.visits.unshift({ id: uid(), restaurantId: restaurant.id, date: null, source: 'manual' });
  persist(); form.reset(); $('#add-panel').open = false; render();
  toast(previouslyEaten ? `${restaurant.name} 已记入吃过记录。` : `${restaurant.name} 已加入转盘。`);
}

function uniformIndex(length) {
  if (!crypto.getRandomValues) return Math.floor(Math.random() * length);
  const array = new Uint32Array(1);
  const range = 2 ** 32;
  const limit = range - (range % length);
  do { crypto.getRandomValues(array); } while (array[0] >= limit);
  return array[0] % length;
}

function finishDraw(restaurant) {
  restaurant.active = false;
  const pending = { id: uid(), restaurantId: restaurant.id, drawnAt: new Date().toISOString() };
  state.pending.unshift(pending);
  currentResult = pending.id;
  spinning = false;
  $('#taste-filter').disabled = false;
  persist(); render(); toast(`今晚抽到了 ${restaurant.name}！`);
}

function draw() {
  if (spinning) return;
  const list = eligibleRestaurants();
  if (!list.length) { toast('当前没有可抽取的饭店。'); return; }
  const index = uniformIndex(list.length);
  const restaurant = list[index];
  currentResult = null;
  displayedWheel = list;
  drawWheel(list);
  renderResult();
  renderPendingReminder();
  spinning = true;
  $('#taste-filter').disabled = true;
  $('#draw-button').disabled = true;
  $('#draw-button').textContent = '转盘正在决定…';
  const target = (360 - (index + .5) * 360 / list.length) % 360;
  const delta = ((target - wheelRotation % 360 + 360) % 360) + 360 * 6;
  wheelRotation += delta;
  if (reducedMotion.matches) { canvas.style.transition = 'none'; canvas.style.transform = `rotate(${wheelRotation}deg)`; finishDraw(restaurant); return; }
  canvas.style.transition = 'transform 5.2s cubic-bezier(.13,.72,.12,1)';
  requestAnimationFrame(() => { canvas.style.transform = `rotate(${wheelRotation}deg)`; });
  const done = () => { canvas.removeEventListener('transitionend', done); finishDraw(restaurant); };
  canvas.addEventListener('transitionend', done, { once: true });
  setTimeout(() => { if (spinning) done(); }, 5600);
}

function confirmPending(id) {
  const index = state.pending.findIndex((event) => event.id === id);
  if (index < 0) return;
  const [event] = state.pending.splice(index, 1);
  state.visits.unshift({ id: uid(), restaurantId: event.restaurantId, date: today(), source: 'draw' });
  if (currentResult === id) { currentResult = null; displayedWheel = null; }
  persist(); render(); toast('记下了这次美味。');
}

function undoPending(id) {
  const index = state.pending.findIndex((event) => event.id === id);
  if (index < 0) return;
  const [event] = state.pending.splice(index, 1);
  const restaurant = state.restaurants.find((r) => r.id === event.restaurantId);
  if (restaurant) restaurant.active = true;
  if (currentResult === id) { currentResult = null; displayedWheel = null; }
  persist(); render(); toast('已撤销抽取，饭店回到转盘。');
}

function openEditor(id) {
  const r = state.restaurants.find((item) => item.id === id);
  if (!r) return;
  const form = $('#edit-form');
  for (const key of ['id', 'name', 'cuisine']) form.elements[key].value = r[key] || '';
  $('#edit-dialog').showModal();
}

function saveEdit(form) {
  const values = Object.fromEntries(new FormData(form));
  const r = state.restaurants.find((item) => item.id === values.id);
  if (!r) return;
  const name = clean(values.name, 60);
  if (!name) return;
  if (state.restaurants.some((item) => item.id !== r.id && normalizeName(item.name) === normalizeName(name))) { toast('饭店库里已有同名饭店。'); return; }
  r.name = name; r.cuisine = clean(values.cuisine, 40);
  persist(); $('#edit-dialog').close(); render(); toast('饭店资料已更新。');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `今晚吃什么-备份-${today()}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('备份文件已导出。');
}

async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('文件过大');
    const data = JSON.parse(await file.text());
    if (!validState(data)) throw new Error('备份格式不正确或数据不完整');
    if (!window.confirm(`将用备份中的 ${data.restaurants.length} 家饭店、${data.visits.length} 条吃过记录替换当前所有数据。确定导入吗？`)) return;
    state = data; excluded = new Set(); currentResult = null; displayedWheel = null; wheelRotation = 0;
    canvas.style.transition = 'none'; canvas.style.transform = 'rotate(0deg)';
    $('#taste-filter').value = '';
    $('#backup-menu').open = false;
    persist(); render(); toast('备份已导入。');
  } catch (error) { toast(`导入失败：${error.message}`); }
  finally { $('#import-file').value = ''; }
}

$('#add-form').addEventListener('submit', (event) => { event.preventDefault(); if (!spinning) addRestaurant(event.currentTarget); });
$('#edit-form').addEventListener('submit', (event) => { event.preventDefault(); if (!spinning) saveEdit(event.currentTarget); });
$('#draw-button').addEventListener('click', draw);
$('#close-dialog').addEventListener('click', () => $('#edit-dialog').close());
$('#edit-dialog').addEventListener('click', (event) => { if (event.target === $('#edit-dialog')) $('#edit-dialog').close(); });
$('#taste-filter').addEventListener('change', () => { if (!spinning) renderWheel(); });
$('#export-button').addEventListener('click', () => { exportData(); $('#backup-menu').open = false; });
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', (event) => importData(event.target.files[0]));
$('#reset-wheel-filters').addEventListener('click', () => { if (spinning) return; excluded.clear(); $('#taste-filter').value = ''; renderWheel(); });
$('#restore-all').addEventListener('click', () => { if (spinning) return; state.restaurants.forEach((r) => { r.active = true; }); persist(); render(); toast('所有饭店已重新加入转盘。'); });

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || spinning) return;
  const { action, id } = button.dataset;
  const restaurant = state.restaurants.find((r) => r.id === id);
  if (action === 'open-add') { $('#add-panel').open = true; $('#add-panel').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' }); $('#add-form [name=name]').focus(); return; }
  if (action === 'open-manage') { $('#restaurants-section').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' }); return; }
  if (action === 'reset-conditions') { excluded.clear(); $('#taste-filter').value = ''; renderWheel(); return; }
  if (action === 'exclude') { excluded.has(id) ? excluded.delete(id) : excluded.add(id); renderWheel(); return; }
  if (action === 'edit') { openEditor(id); return; }
  if (action === 'toggle' && restaurant) { restaurant.active = !restaurant.active; excluded.delete(id); persist(); render(); toast(restaurant.active ? '已加入转盘。' : '已置灰，暂不参与抽奖。'); return; }
  if (action === 'restore' && restaurant) { restaurant.active = true; excluded.delete(id); persist(); render(); toast('已重新加入转盘。'); return; }
  if (action === 'confirm') { confirmPending(id); return; }
  if (action === 'undo') { undoPending(id); }
});

render();
