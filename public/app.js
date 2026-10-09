'use strict';
/* Trợ lý soạn giáo án Toán 5512 — Bước 1: chọn bài học từ danh mục. */

const $ = (id) => document.getElementById(id);

const KIND_LABEL = {
  lesson: (it) => `Bài ${it.number}`,
  ltc: () => 'Luyện tập',
  btc: () => 'Cuối chương',
  hdtn: () => 'Trải nghiệm',
  ontap: () => 'Ôn tập',
};

let CATALOG = null;
let selectedItem = null; // { grade, chapterLabel, item }

function chapterLabelFor(grade, chapterCode) {
  // chapterCode: "6-I" | "hdtn-1" | "hdtn-2" | "ontap"
  const g = CATALOG.grades.find((x) => x.grade === grade);
  if (!g) return '';
  if (chapterCode === 'ontap') return 'Ôn tập cuối năm';
  if (chapterCode.startsWith('hdtn-')) {
    const v = chapterCode.split('-')[1];
    return `Hoạt động thực hành trải nghiệm – Tập ${v}`;
  }
  const ch = g.chapters.find((c) => c.code === chapterCode);
  return ch ? `Chương ${ch.roman}. ${ch.name}` : '';
}

function allGradeItems(grade) {
  const g = CATALOG.grades.find((x) => x.grade === grade);
  const out = [];
  for (const ch of g.chapters) {
    for (const it of ch.items) out.push({ grade, chapterCode: ch.code, item: it });
  }
  for (const hv of g.hdtn || []) {
    for (const it of hv.items || []) out.push({ grade, chapterCode: `hdtn-${hv.volume}`, item: it });
  }
  if (g.yearReview) out.push({ grade, chapterCode: 'ontap', item: g.yearReview });
  return out;
}

function itemTitle(it) {
  if (it.kind === 'lesson') return `Bài ${it.number}. ${it.title}`;
  return it.title;
}

function renderList(entries) {
  const box = $('item-list');
  box.innerHTML = '';
  if (!entries.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Không tìm thấy bài học phù hợp.';
    box.appendChild(d);
    return;
  }
  for (const e of entries) {
    const d = document.createElement('div');
    d.className = 'item' + (selectedItem && selectedItem.item.id === e.item.id ? ' selected' : '');
    const badge = document.createElement('span');
    badge.className = 'badge ' + e.item.kind;
    badge.textContent = KIND_LABEL[e.item.kind](e.item);
    const body = document.createElement('div');
    const t = document.createElement('div');
    t.textContent = itemTitle(e.item);
    body.appendChild(t);
    if (!$('search').value.trim()) {
      // khi không tìm kiếm, danh sách đã theo chương nên không cần crumb
    } else {
      const c = document.createElement('span');
      c.className = 'crumb';
      c.textContent = `Lớp ${e.grade} • ${chapterLabelFor(e.grade, e.chapterCode)}`;
      body.appendChild(c);
    }
    d.appendChild(badge);
    d.appendChild(body);
    d.addEventListener('click', () => selectItem(e));
    box.appendChild(d);
  }
}

function refreshList() {
  const q = $('search').value.trim().toLowerCase();
  const grade = parseInt($('grade-select').value, 10);
  if (q) {
    const out = [];
    for (const g of CATALOG.grades) {
      for (const e of allGradeItems(g.grade)) {
        if (itemTitle(e.item).toLowerCase().includes(q)) out.push(e);
      }
    }
    renderList(out);
    return;
  }
  const chapterCode = $('chapter-select').value;
  const entries = allGradeItems(grade).filter((e) => e.chapterCode === chapterCode);
  renderList(entries);
}

function selectItem(e) {
  selectedItem = e;
  document.querySelectorAll('.item').forEach((el) => el.classList.remove('selected'));
  // đánh dấu lại mục vừa chọn (render lại đơn giản)
  refreshList();
  const info = $('selected-info');
  info.innerHTML = '';
  const h = document.createElement('p');
  h.className = 'sel-title';
  h.textContent = itemTitle(e.item);
  const m = document.createElement('p');
  m.className = 'sel-meta';
  m.textContent = `Lớp ${e.grade} • ${chapterLabelFor(e.grade, e.chapterCode)} • Bộ sách Kết nối tri thức với cuộc sống`;
  const n = document.createElement('div');
  n.className = 'sel-next';
  n.textContent = 'Đã ghi nhận bài học. Sang mục 2 (cột bên phải): chọn chế độ, thời lượng, trọng tâm rồi bấm "Soạn giáo án".';
  info.appendChild(h);
  info.appendChild(m);
  info.appendChild(n);
}

function populateGradeSelect() {
  const sel = $('grade-select');
  sel.innerHTML = '';
  for (const g of CATALOG.grades) {
    const o = document.createElement('option');
    o.value = g.grade;
    o.textContent = `Lớp ${g.grade}`;
    sel.appendChild(o);
  }
}

function populateChapterSelect() {
  const grade = parseInt($('grade-select').value, 10);
  const g = CATALOG.grades.find((x) => x.grade === grade);
  const sel = $('chapter-select');
  sel.innerHTML = '';
  for (const ch of g.chapters) {
    const o = document.createElement('option');
    o.value = ch.code;
    o.textContent = `Chương ${ch.roman}. ${ch.name} (Tập ${ch.volume})`;
    sel.appendChild(o);
  }
  for (const hv of g.hdtn || []) {
    const o = document.createElement('option');
    o.value = `hdtn-${hv.volume}`;
    o.textContent = `Hoạt động thực hành trải nghiệm – Tập ${hv.volume}`;
    sel.appendChild(o);
  }
  const oy = document.createElement('option');
  oy.value = 'ontap';
  oy.textContent = 'Ôn tập cuối năm';
  sel.appendChild(oy);
}

function renderCounts() {
  let total = 0, main = 0;
  const parts = [];
  for (const g of CATALOG.grades) {
    const entries = allGradeItems(g.grade);
    const m = entries.filter((e) => e.item.kind === 'lesson').length;
    total += entries.length;
    main += m;
    parts.push(`Lớp ${g.grade}: ${entries.length} mục (${m} bài chính)`);
  }
  $('counts').innerHTML =
    `<strong>Tổng: ${total} mục chọn được • ${main} bài chính.</strong><br>${parts.join(' • ')}`;
}

async function renderCheck() {
  const box = $('check-result');
  try {
    const r = await fetch('/api/catalog/check');
    const c = await r.json();
    const pill = (ok) => `<span class="pill${ok ? '' : ' bad'}">${ok ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>`;
    let html = '';
    html += `<div class="line"><span>Tổng số mục chọn được: <strong>${c.totalItems}</strong> / ${c.expectedItems}</span>${pill(c.totalItems === c.expectedItems)}</div>`;
    html += `<div class="line"><span>Tổng số bài chính: <strong>${c.totalMain}</strong> / ${c.expectedMain}</span>${pill(c.totalMain === c.expectedMain)}</div>`;
    html += `<div class="line"><span>Tên chương dùng số La Mã (I–X)</span>${pill(c.romanNumeralsOk)}</div>`;
    for (const g of c.grades) {
      html += `<div class="line"><span>Lớp ${g.grade}: <strong>${g.main}</strong> bài chính (chuẩn ${g.expectedMain})</span>${pill(g.mainOk)}</div>`;
    }
    html += `<div class="line"><span><strong>Kết quả chung</strong></span>${pill(c.ok)}</div>`;
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<p class="hint">Không kiểm tra được: ' + String(e) + '</p>';
  }
}

function initTeacherForm() {
  const keys = ['upper', 'school', 'dept', 'teacher'];
  for (const k of keys) {
    const el = $('f-' + k);
    try { el.value = localStorage.getItem('t5512_' + k) || ''; } catch (e) { /* bỏ qua */ }
    el.addEventListener('input', () => {
      try { localStorage.setItem('t5512_' + k, el.value); } catch (e) { /* bỏ qua */ }
    });
  }
}

async function init() {
  const r = await fetch('/api/catalog');
  if (!r.ok) {
    $('item-list').innerHTML = '<div class="empty">Không tải được danh mục. Hãy kiểm tra server.</div>';
    return;
  }
  CATALOG = await r.json();
  populateGradeSelect();
  populateChapterSelect();
  $('grade-select').addEventListener('change', () => { populateChapterSelect(); refreshList(); });
  $('chapter-select').addEventListener('change', refreshList);
  $('search').addEventListener('input', refreshList);
  refreshList();
  renderCounts();
  renderCheck();
  initTeacherForm();
  initStep2();
  initStep3();
  initMathToolbar();
}

document.addEventListener('DOMContentLoaded', init);

/* ================= Bước 2: AI soạn giáo án ================= */

let currentMode = 'chi-tiet';
let focusPoints = []; // [{text, checked}]
let genTimer = null;

const STEP_LABELS = {
  part1: 'Phần 1: Mục tiêu + Thiết bị + Hoạt động 1–2',
  part2: 'Phần 2: Hoạt động 3–4 + Điều chỉnh',
  merge: 'Ghép 2 phần',
  single: 'Soạn giáo án',
  all: 'Gọi song song 2 phần',
};
const MODE_NAMES = { 'chi-tiet': 'Chi tiết', 'khung-nhanh': 'Khung nhanh', 'phan-hoa': 'Phân hoá' };

function initStep2() {
  loadSettingsUI();
  const bs = $('btn-save-settings');
  if (bs) bs.addEventListener('click', saveSettings);
  const bt = $('btn-test-settings');
  if (bt) bt.addEventListener('click', testSettings);
  document.querySelectorAll('#mode-tabs .mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mode-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
    });
  });
  const bf = $('btn-focus');
  if (bf) bf.addEventListener('click', suggestFocus);
  const bfa = $('btn-focus-add');
  if (bfa) bfa.addEventListener('click', () => {
    const v = $('focus-custom').value.trim();
    if (v) { focusPoints.push({ text: v, checked: true }); $('focus-custom').value = ''; renderFocus(); }
  });
  const bg = $('btn-generate');
  if (bg) bg.addEventListener('click', generate);
  renderFocus();
}

/* ---- Cài đặt AI: key chỉ lưu trên máy chủ ---- */
async function loadSettingsUI() {
  try {
    const r = await fetch('/api/settings');
    const s = await r.json();
    $('s-baseurl').value = s.baseUrl || '';
    $('s-model').value = s.model || '';
    $('settings-status').textContent = s.hasKey
      ? `Đã lưu key trên máy chủ (kết thúc bằng ${s.keyTail}).`
      : 'Chưa có API key — hãy dán key rồi bấm Lưu.';
  } catch (e) {
    $('settings-status').textContent = 'Không tải được cài đặt.';
  }
}

async function saveSettings() {
  $('settings-status').textContent = 'Đang lưu…';
  try {
    const r = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: $('s-baseurl').value.trim(),
        model: $('s-model').value.trim(),
        apiKey: $('s-key').value.trim(),
      }),
    });
    const j = await r.json();
    $('s-key').value = '';
    $('settings-status').textContent = j.ok
      ? (j.hasKey ? 'Đã lưu. Key được giữ kín trên máy chủ.' : 'Đã lưu (chưa có key).')
      : 'Lưu thất bại.';
  } catch (e) {
    $('settings-status').textContent = 'Lỗi khi lưu: ' + e.message;
  }
}

async function testSettings() {
  $('settings-status').textContent = 'Đang kiểm tra kết nối…';
  try {
    // Gửi đúng nội dung đang hiện trên form (kể cả khi chưa bấm Lưu).
    const r = await fetch('/api/settings/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: $('s-baseurl').value.trim(),
        model: $('s-model').value.trim(),
        apiKey: $('s-key').value.trim(),
      }),
    });
    const j = await r.json();
    $('settings-status').textContent = j.ok
      ? `Kết nối OK (model trả lời: ${j.reply}).`
      : `Kết nối thất bại: ${j.error}`;
  } catch (e) {
    $('settings-status').textContent = 'Lỗi: ' + e.message;
  }
}

/* ---- Trọng tâm ---- */
function selectedItemToPayload() {
  if (!selectedItem) return null;
  const it = selectedItem.item;
  return {
    id: it.id, kind: it.kind, number: it.number, title: it.title,
    grade: selectedItem.grade,
    chapterLabel: chapterLabelFor(selectedItem.grade, selectedItem.chapterCode),
  };
}

function renderFocus() {
  const list = $('focus-list');
  if (!list) return;
  list.innerHTML = '';
  if (!focusPoints.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Chưa có trọng tâm. Bấm "Gợi ý bằng AI" hoặc thêm thủ công bên dưới.';
    list.appendChild(p);
    return;
  }
  focusPoints.forEach((fp, i) => {
    const label = document.createElement('label');
    label.className = 'focus-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = fp.checked;
    cb.addEventListener('change', () => { fp.checked = cb.checked; });
    const span = document.createElement('span');
    span.textContent = fp.text;
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.title = 'Xoá';
    rm.addEventListener('click', (ev) => { ev.preventDefault(); focusPoints.splice(i, 1); renderFocus(); });
    label.appendChild(cb);
    label.appendChild(span);
    label.appendChild(rm);
    list.appendChild(label);
  });
}

async function suggestFocus() {
  const payload = selectedItemToPayload();
  if (!payload) { showGenError('Hãy chọn một bài học ở mục 1 trước.'); return; }
  const btn = $('btn-focus');
  btn.disabled = true;
  btn.textContent = 'Đang gợi ý…';
  try {
    const r = await fetch('/api/focus-points', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: payload }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Lỗi không rõ');
    focusPoints = j.points.map((p) => ({ text: p, checked: true }));
    renderFocus();
  } catch (e) {
    // Server đã gắn tiền tố 'Không gợi ý được trọng tâm: ' nên hiển thị nguyên văn.
    showGenError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gợi ý bằng AI';
  }
}

/* ---- Soạn giáo án (SSE + đồng hồ tiến độ) ---- */
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function showGenError(msg) {
  const e = $('generate-error');
  if (!e) return;
  e.textContent = msg;
  e.classList.remove('hidden');
}

function stepLi(tag, steps) {
  if (!steps[tag]) {
    const li = document.createElement('li');
    li.textContent = '… ' + (STEP_LABELS[tag] || tag);
    $('progress-steps').appendChild(li);
    steps[tag] = li;
  }
  return steps[tag];
}

function setStep(tag, status, note, steps) {
  const li = stepLi(tag, steps);
  li.className = status === 'done' ? 'done' : status === 'failed' ? 'failed' : 'doing';
  const icon = status === 'done' ? '✓' : status === 'failed' ? '✗' : status === 'retrying' ? '↻' : '…';
  li.textContent = icon + ' ' + (STEP_LABELS[tag] || tag) + (note ? ' — ' + note : '');
}

async function generate() {
  const errBox = $('generate-error');
  if (errBox) errBox.classList.add('hidden');
  const payloadItem = selectedItemToPayload();
  if (!payloadItem) { showGenError('Hãy chọn một bài học ở mục 1 trước.'); return; }
  const durEl = document.querySelector('input[name="duration"]:checked');
  const duration = durEl ? parseInt(durEl.value, 10) : 1;
  const focus = focusPoints.filter((f) => f.checked).map((f) => f.text);
  const extra = $('extra') ? $('extra').value : '';
  // LƯU Ý RIÊNG TƯ: payload KHÔNG chứa họ tên giáo viên / trường / tổ.
  const payload = { item: payloadItem, mode: currentMode, duration, focus, extra };

  const prog = $('progress');
  prog.classList.remove('hidden');
  $('progress-steps').innerHTML = '';
  $('progress-label').textContent = 'Đang soạn…';
  $('progress-clock').textContent = '00:00';
  $('progress-fill').style.width = '8%';
  const btn = $('btn-generate');
  btn.disabled = true;
  const t0 = Date.now();
  genTimer = setInterval(() => { $('progress-clock').textContent = fmtClock(Date.now() - t0); }, 250);
  const steps = {};

  try {
    const res = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || ('HTTP ' + res.status));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let plan = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        let data = '';
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (ev === 'progress') {
          const p = JSON.parse(data);
          if (p.status === 'started' || p.status === 'parallel-2') setStep(p.step, 'doing', null, steps);
          else if (p.status === 'done') {
            setStep(p.step, 'done', null, steps);
            const f = $('progress-fill');
            f.style.width = Math.min(95, (parseFloat(f.style.width) || 8) + 30) + '%';
          } else if (p.status === 'retrying') setStep(p.step, 'retrying', String(p.error || '').slice(0, 70), steps);
          else if (p.status === 'failed') setStep(p.step, 'failed', String(p.error || '').slice(0, 70), steps);
          $('progress-clock').textContent = fmtClock(p.elapsedMs != null ? p.elapsedMs : Date.now() - t0);
        } else if (ev === 'result') {
          plan = JSON.parse(data).plan;
        } else if (ev === 'error') {
          throw new Error(JSON.parse(data).message || 'Lỗi không rõ');
        }
      }
    }
    if (!plan) throw new Error('Không nhận được kết quả từ AI.');
    renderPlan(plan);
    currentPlan = plan;
    currentLibraryId = null;
    const bs = $('btn-save-library');
    if (bs) bs.textContent = 'Lưu vào thư viện';
    setLibraryStatus('');
    $('progress-fill').style.width = '100%';
    $('progress-label').textContent = 'Xong trong ' + fmtClock((plan.meta && plan.meta.elapsedMs) || (Date.now() - t0)) + '.';
  } catch (e) {
    showGenError('Soạn thất bại: ' + e.message);
    $('progress-label').textContent = 'Thất bại.';
  } finally {
    clearInterval(genTimer);
    btn.disabled = false;
  }
}

/* ---- Xem trước A4 ---- */
/** Dựng DOM cho 1 mảng segments (ký hiệu/cấu trúc công thức) vào parent. */
function renderSegments(parent, segments) {
  for (const s of segments || []) {
    if (!s || typeof s !== 'object') continue;
    if (s.frac && Array.isArray(s.frac.num) && Array.isArray(s.frac.den)) {
      const f = mathSpan('mfrac'), num = mathSpan('mnum'), den = mathSpan('mden');
      renderSegments(num, s.frac.num);
      renderSegments(den, s.frac.den);
      f.appendChild(num);
      f.appendChild(den);
      parent.appendChild(f);
    } else if (s.sqrt && Array.isArray(s.sqrt.body)) {
      const w = mathSpan('msqrt');
      if (Array.isArray(s.sqrt.n)) {
        const nn = mathSpan('mrootn');
        renderSegments(nn, s.sqrt.n);
        w.appendChild(nn);
      }
      const rad = mathSpan('mrad');
      rad.textContent = '√';
      const body = mathSpan('mbody');
      renderSegments(body, s.sqrt.body);
      w.appendChild(rad);
      w.appendChild(body);
      parent.appendChild(w);
    } else if (typeof s.text === 'string' && s.text) {
      const t = document.createTextNode(s.text);
      if (s.sup || s.sub) {
        const el = document.createElement(s.sup ? 'sup' : 'sub');
        el.appendChild(t);
        parent.appendChild(el);
      } else {
        parent.appendChild(t);
      }
    }
  }
}

function renderBlock(b) {
  let el;
  if (b.type === 'h') {
    el = document.createElement('h' + Math.min(4, Math.max(2, b.level || 3)));
    if (Array.isArray(b.segments)) renderSegments(el, b.segments);
    else el.textContent = b.text || '';
  } else if (b.type === 'ul' || b.type === 'ol') {
    el = document.createElement(b.type);
    for (const it of b.items || []) {
      const li = document.createElement('li');
      if (it && typeof it === 'object' && Array.isArray(it.segments)) renderSegments(li, it.segments);
      else li.textContent = it == null ? '' : String(it);
      el.appendChild(li);
    }
  } else {
    el = document.createElement('p');
    if (Array.isArray(b.segments)) renderSegments(el, b.segments);
    else el.textContent = b.text || '';
  }
  return el;
}

function renderPlan(plan) {
  const root = $('preview');
  root.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = plan.lessonTitle || 'Giáo án';
  root.appendChild(h1);
  const meta = document.createElement('p');
  meta.className = 'plan-meta';
  const m = plan.meta || {};
  const dur = m.duration === 2 ? '2 tiết (90 phút)' : '1 tiết (45 phút)';
  meta.textContent = `Toán lớp ${m.item && m.item.grade != null ? m.item.grade : ''} • ${m.item ? m.item.chapterLabel : ''} • ${dur} • Chế độ ${MODE_NAMES[m.mode] || ''}`;
  root.appendChild(meta);
  for (const sec of plan.sections || []) {
    const h2 = document.createElement('h2');
    h2.textContent = sec.heading || '';
    root.appendChild(h2);
    for (const b of sec.blocks || []) root.appendChild(renderBlock(b));
  }
  normalizePreviewMath(); // AI hay viết x^2 -> chuẩn hoá thành số mũ đúng định dạng
  if (root.scrollIntoView) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= Bước 4: thanh công thức toán học (kiểu MathType) ================= */

const MATH_SYMBOLS = [
  '±', '∓', '×', '÷', '·', '≤', '≥', '≠', '≈', '≡', '⇒', '⇔', '∞',
  'π', '°', '′', '√', '∛', 'Δ', '∠', '⊥', '∥',
  '∈', '∉', '⊂', '⊆', '∪', '∩', '∅', 'ℕ', 'ℤ', 'ℚ', 'ℝ',
  'α', 'β', 'γ', 'θ', 'λ', 'μ', 'σ', 'φ', 'ω',
  '²', '³', '∑', '∫',
];

let savedMathRange = null;

/** Lưu vùng chọn hiện tại nếu nằm trong khung soạn thảo. */
function mathSaveSelection() {
  const sel = window.getSelection();
  const root = $('preview');
  if (sel && sel.rangeCount && root && root.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedMathRange = sel.getRangeAt(0).cloneRange();
  }
}

/** Khôi phục vùng chọn đã lưu; chưa có thì đặt caret ở cuối khung soạn thảo. */
function mathRestoreSelection() {
  const root = $('preview');
  const sel = window.getSelection();
  if (savedMathRange && root.contains(savedMathRange.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedMathRange);
    return savedMathRange;
  }
  root.focus();
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

function mathPlaceCaretAfter(node) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function mathPlaceCaretInside(el, atEnd) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(r);
}

function mathAfterInsert() {
  mathSaveSelection();
  const root = $('preview');
  if (root) root.focus();
}

/** Chèn ký hiệu toán học (text thuần) tại vị trí con trỏ. */
function mathInsertSymbol(sym) {
  const range = mathRestoreSelection();
  range.deleteContents();
  const t = document.createTextNode(sym);
  range.insertNode(t);
  mathPlaceCaretAfter(t);
  mathAfterInsert();
}

function mathSpan(cls) {
  const s = document.createElement('span');
  s.className = cls;
  return s;
}

/** Dựng cấu trúc công thức; trả về { node, focus } (focus = ô nhập đầu tiên). */
function mathBuildStructure(kind) {
  if (kind === 'frac') {
    const f = mathSpan('mfrac'), num = mathSpan('mnum'), den = mathSpan('mden');
    f.appendChild(num);
    f.appendChild(den);
    return { node: f, focus: num };
  }
  if (kind === 'sqrt' || kind === 'nroot') {
    const w = mathSpan('msqrt');
    let first = null;
    if (kind === 'nroot') { first = mathSpan('mrootn'); w.appendChild(first); }
    const rad = mathSpan('mrad');
    rad.textContent = '√';
    const body = mathSpan('mbody');
    w.appendChild(rad);
    w.appendChild(body);
    return { node: w, focus: first || body };
  }
  if (kind === 'abs') {
    const w = mathSpan('mabs');
    const b = mathSpan('mabsb');
    w.appendChild(document.createTextNode('|'));
    w.appendChild(b);
    w.appendChild(document.createTextNode('|'));
    return { node: w, focus: b };
  }
  return null;
}

/** Chèn cấu trúc công thức; nếu đang bôi đen text thì đưa vào ô thích hợp. */
function mathInsertStructure(kind) {
  if (kind === 'sup' || kind === 'sub') {
    const range = mathRestoreSelection();
    const el = document.createElement(kind);
    if (!range.collapsed) {
      el.appendChild(range.extractContents());
      range.insertNode(el);
      mathPlaceCaretAfter(el);
    } else {
      range.deleteContents();
      range.insertNode(el);
      mathPlaceCaretInside(el, false);
    }
    mathAfterInsert();
    return;
  }
  const built = mathBuildStructure(kind);
  if (!built) return;
  const range = mathRestoreSelection();
  let focus = built.focus;
  let atEnd = false;
  if (!range.collapsed) {
    const frag = range.extractContents();
    if (kind === 'frac') {
      built.focus.appendChild(frag);
      atEnd = true;
    } else {
      const slot = built.node.querySelector('.mbody, .mabsb') || built.focus;
      slot.appendChild(frag);
      focus = slot;
      atEnd = true;
    }
  } else {
    range.deleteContents();
  }
  range.insertNode(built.node);
  mathPlaceCaretInside(focus, atEnd);
  mathAfterInsert();
}

function initMathToolbar() {
  const bar = $('math-toolbar');
  if (!bar) return;
  const symBox = $('math-symbols');
  for (const s of MATH_SYMBOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mbtn';
    b.textContent = s;
    b.title = 'Chèn ký hiệu ' + s;
    b.addEventListener('mousedown', (e) => { e.preventDefault(); mathSaveSelection(); });
    b.addEventListener('click', () => mathInsertSymbol(s));
    symBox.appendChild(b);
  }
  bar.querySelectorAll('[data-struct]').forEach((b) => {
    b.addEventListener('mousedown', (e) => { e.preventDefault(); mathSaveSelection(); });
    b.addEventListener('click', () => {
      const kind = b.getAttribute('data-struct');
      if (kind === 'normalize') { normalizePreviewMath(); return; }
      mathInsertStructure(kind);
    });
  });
  const root = $('preview');
  if (root) {
    root.addEventListener('keyup', mathSaveSelection);
    root.addEventListener('mouseup', mathSaveSelection);
  }
}

/* ---- Chuẩn hoá ký hiệu mũ dạng x^2, (a+b)^(n+1), x^{2n}, 10^-2
   thành số mũ đúng định dạng (VD: 8x^2 -> 8x²) ---- */
const CARET_RE = /\^(\{([^}]*)\}|\(([^)]*)\)|(-?[0-9A-Za-z]+))/g;
const CARET_TEST = /\^(\{[^}]*\}|\([^)]*\)|-?[0-9A-Za-z]+)/;

function caretInner(m) {
  return m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
}

/** Chuẩn hoá ký hiệu ^ trong khung soạn thảo thành <sup>, chạy tại chỗ trên DOM. */
function normalizePreviewMath() {
  const root = $('preview');
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p = node.parentElement;
      while (p && p !== root) {
        if (p.tagName === 'SUP' || p.tagName === 'SUB' ||
            (p.classList && (p.classList.contains('mfrac') || p.classList.contains('msqrt')))) {
          return NodeFilter.FILTER_REJECT;
        }
        p = p.parentElement;
      }
      return CARET_TEST.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  const re = new RegExp(CARET_RE.source, 'g');
  for (const tn of targets) {
    const t = tn.textContent;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const inner = caretInner(m);
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      if (inner) {
        const sup = document.createElement('sup');
        sup.textContent = inner;
        frag.appendChild(sup);
      } else {
        frag.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    if (frag.childNodes.length) tn.replaceWith(frag);
  }
}

/** Lấy plan từ nội dung đã sửa trong khung (đã chuẩn hoá ký hiệu ^). */
function getEditedPlan() {
  normalizePreviewMath();
  return collectPlanFromPreview() || currentPlan;
}

/* ---- Đọc nội dung đã sửa trong khung soạn thảo thành plan JSON ----
   Mọi chỉnh sửa tay — kể cả công thức chèn bằng thanh công thức — đều được
   giữ lại khi lưu vào thư viện và xuất Word. */

const MATH_MAX_DEPTH = 4;

/** Text thuần của 1 mảng segments (để kiểm tra rỗng). */
function mathSegsText(segs) {
  let t = '';
  for (const s of segs || []) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.text === 'string') t += s.text;
    else if (s.frac) {
      const nt = mathSegsText(s.frac.num);
      const dt = mathSegsText(s.frac.den);
      if (nt || dt) t += nt + '/' + dt;
    } else if (s.sqrt) {
      const bt = mathSegsText(s.sqrt.body);
      if (bt) t += '√' + bt;
    }
  }
  return t;
}

/** Đọc các node inline thành mảng segments; gộp text thuần liền kề. */
function mathInlineSegments(node, depth) {
  const segs = [];
  const pushText = (t, attrs) => {
    t = String(t == null ? '' : t).replace(/[\u200B\u2028\u2029]/g, '');
    if (!t) return;
    const a = attrs || {};
    const last = segs[segs.length - 1];
    if (last && typeof last.text === 'string' && !last.frac && !last.sqrt &&
        !!last.sup === !!a.sup && !!last.sub === !!a.sub) {
      last.text += t;
    } else {
      segs.push({ text: t, sup: !!a.sup, sub: !!a.sub });
    }
  };
  if (!node || depth > MATH_MAX_DEPTH) {
    if (node) pushText(node.textContent);
    return segs;
  }
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      pushText(child.textContent);
    } else if (child.nodeType === 1) {
      const tag = child.tagName;
      if (tag === 'SUP') pushText(child.textContent, { sup: true });
      else if (tag === 'SUB') pushText(child.textContent, { sub: true });
      else if (tag === 'BR') pushText(' ');
      else if (child.classList.contains('mfrac')) {
        const numEl = child.querySelector('.mnum');
        const denEl = child.querySelector('.mden');
        segs.push({
          frac: {
            num: mathInlineSegments(numEl || child, depth + 1),
            den: mathInlineSegments(denEl || child, depth + 1),
          },
        });
      } else if (child.classList.contains('msqrt')) {
        const nEl = child.querySelector('.mrootn');
        const bodyEl = child.querySelector('.mbody');
        segs.push({
          sqrt: {
            n: nEl ? mathInlineSegments(nEl, depth + 1) : null,
            body: mathInlineSegments(bodyEl || child, depth + 1),
          },
        });
      } else {
        // B, I, SPAN thường, .mabs (|…|): đọc xuyên qua, giữ text bên trong
        for (const s of mathInlineSegments(child, depth + 1)) segs.push(s);
      }
    }
  }
  return segs;
}

/** Chuyển 1 element khối (p/h) thành block; null nếu rỗng. */
function mathBlockFromEl(el, type, level) {
  const segs = mathInlineSegments(el, 0);
  if (!mathSegsText(segs).trim()) return null;
  const hasRich = segs.some((s) => s.frac || s.sqrt || s.sup || s.sub);
  const block = { type };
  if (type === 'h') block.level = level || 3;
  if (hasRich) block.segments = segs;
  else block.text = mathSegsText(segs);
  return block;
}

/** Chuyển 1 <li> thành item (string hoặc { segments }); null nếu rỗng. */
function mathItemFromLi(li) {
  const segs = mathInlineSegments(li, 0);
  if (!mathSegsText(segs).trim()) return null;
  const hasRich = segs.some((s) => s.frac || s.sqrt || s.sup || s.sub);
  return hasRich ? { segments: segs } : mathSegsText(segs);
}

/** Đọc toàn bộ khung soạn thảo thành plan, giữ nguyên tiêu đề/meta của currentPlan. */
function collectPlanFromPreview() {
  if (!currentPlan) return null;
  const root = $('preview');
  if (!root) return null;
  const sections = [];
  let cur = null;
  const ensureSection = () => {
    if (!cur) { cur = { heading: '', blocks: [] }; sections.push(cur); }
    return cur;
  };
  for (const el of root.children) {
    if (el.nodeType !== 1) continue;
    const tag = el.tagName;
    if (tag === 'H1' || el.classList.contains('plan-meta') || el.classList.contains('hint')) continue;
    if (tag === 'H2') {
      cur = { heading: el.textContent.trim(), blocks: [] };
      sections.push(cur);
    } else if (tag === 'H3' || tag === 'H4') {
      const b = mathBlockFromEl(el, 'h', tag === 'H3' ? 3 : 4);
      if (b) ensureSection().blocks.push(b);
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [];
      for (const li of el.querySelectorAll(':scope > li')) {
        const it = mathItemFromLi(li);
        if (it != null) items.push(it);
      }
      if (items.length) ensureSection().blocks.push({ type: tag === 'UL' ? 'ul' : 'ol', items });
    } else if (tag === 'P' || tag === 'DIV') {
      const b = mathBlockFromEl(el, 'p');
      if (b) ensureSection().blocks.push(b);
    } else if (el.textContent && el.textContent.trim()) {
      ensureSection().blocks.push({ type: 'p', text: el.textContent.trim() });
    }
  }
  if (!sections.length) return null;
  return { lessonTitle: currentPlan.lessonTitle, meta: currentPlan.meta, sections };
}

/* ================= Bước 3: Thư viện + xuất Word ================= */

let currentPlan = null; // giáo án đang hiển thị ở phần xem trước
let currentLibraryId = null; // id thư viện khi mở lại từ danh sách

function readTeacherInfo() {
  const v = (k) => { const el = $('f-' + k); return el ? el.value.trim() : ''; };
  return { upper: v('upper'), school: v('school'), dept: v('dept'), teacher: v('teacher') };
}

function setLibraryStatus(msg) {
  const el = $('library-status');
  if (el) el.textContent = msg || '';
}

async function downloadDocx(fetchOpts) {
  const r = await fetch('/api/export-docx', fetchOpts);
  if (!r.ok) {
    let msg = 'Xuất file thất bại.';
    try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) { /* bỏ qua */ }
    throw new Error(msg);
  }
  const blob = await r.blob();
  const a = document.createElement('a');
  const cd = r.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  a.download = m ? decodeURIComponent(m[1]) : 'giao-an.docx';
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function saveLibrary() {
  const plan = getEditedPlan();
  if (!plan) { setLibraryStatus('Chưa có giáo án. Hãy soạn giáo án trước.'); return; }
  const btn = $('btn-save-library');
  btn.disabled = true;
  setLibraryStatus('Đang lưu…');
  try {
    const body = JSON.stringify({ plan, teacherInfo: readTeacherInfo() });
    if (currentLibraryId) {
      const r = await fetch('/api/library/' + encodeURIComponent(currentLibraryId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Lưu thất bại.');
      setLibraryStatus('Đã cập nhật giáo án trong thư viện.');
    } else {
      const r = await fetch('/api/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || 'Lưu thất bại.');
      currentLibraryId = j.id;
      btn.textContent = 'Cập nhật thư viện';
      setLibraryStatus('Đã lưu vào thư viện.');
    }
    await loadLibraryList();
  } catch (e) {
    setLibraryStatus('Lưu thất bại: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function exportDocx() {
  const plan = getEditedPlan();
  if (!plan) { setLibraryStatus('Chưa có giáo án. Hãy soạn giáo án trước.'); return; }
  const btn = $('btn-export-docx');
  btn.disabled = true;
  setLibraryStatus('Đang xuất file Word…');
  try {
    await downloadDocx({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, teacherInfo: readTeacherInfo() }),
    });
    setLibraryStatus('Đã xuất file Word.');
  } catch (e) {
    setLibraryStatus('Xuất file thất bại: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function exportLibraryDocx(id) {
  setLibraryStatus('Đang xuất file Word…');
  try {
    const r = await fetch('/api/library/' + encodeURIComponent(id) + '/export', { method: 'POST' });
    if (!r.ok) {
      let msg = 'Xuất file thất bại.';
      try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) { /* bỏ qua */ }
      throw new Error(msg);
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    a.download = m ? decodeURIComponent(m[1]) : 'giao-an.docx';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setLibraryStatus('Đã xuất file Word.');
  } catch (e) {
    setLibraryStatus('Xuất file thất bại: ' + e.message);
  }
}

async function openLibraryPlan(id) {
  setLibraryStatus('Đang mở giáo án…');
  try {
    const r = await fetch('/api/library/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('Không mở được giáo án.');
    const entry = await r.json();
    currentPlan = entry.plan;
    currentLibraryId = entry.id;
    const info = entry.teacherInfo || {};
    for (const k of ['upper', 'school', 'dept', 'teacher']) {
      const el = $('f-' + k);
      if (el && info[k]) el.value = info[k];
    }
    renderPlan(currentPlan);
    $('btn-save-library').textContent = 'Cập nhật thư viện';
    setLibraryStatus('Đã mở giáo án từ thư viện.');
  } catch (e) {
    setLibraryStatus('Mở thất bại: ' + e.message);
  }
}

async function deleteLibraryPlan(id, title) {
  if (!confirm('Xoá giáo án "' + title + '" khỏi thư viện?')) return;
  setLibraryStatus('Đang xoá…');
  try {
    const r = await fetch('/api/library/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!r.ok) throw new Error('Xoá thất bại.');
    if (currentLibraryId === id) {
      currentLibraryId = null;
      $('btn-save-library').textContent = 'Lưu vào thư viện';
    }
    await loadLibraryList();
    setLibraryStatus('Đã xoá khỏi thư viện.');
  } catch (e) {
    setLibraryStatus('Xoá thất bại: ' + e.message);
  }
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

async function loadLibraryList() {
  const box = $('library-list');
  if (!box) return;
  try {
    const r = await fetch('/api/library');
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json();
    const items = (j.items || []).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<p class="hint">Chưa có giáo án nào trong thư viện.</p>';
      return;
    }
    for (const it of items) {
      const d = document.createElement('div');
      d.className = 'item' + (currentLibraryId === it.id ? ' selected' : '');
      const meta = `Toán ${it.grade ? 'lớp ' + it.grade : ''} • ${it.chapterLabel || ''} • ${it.duration === 2 ? '2 tiết' : '1 tiết'} • ${fmtDate(it.updatedAt)}`;
      d.innerHTML = '<div class="lib-title"></div><div class="lib-meta hint"></div><div class="row lib-actions"></div>';
      d.querySelector('.lib-title').textContent = it.lessonTitle || '(không tên)';
      d.querySelector('.lib-meta').textContent = meta;
      const acts = d.querySelector('.lib-actions');
      const mkBtn = (label, cls, fn) => {
        const b = document.createElement('button');
        b.className = 'btn small ' + cls;
        b.textContent = label;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
        acts.appendChild(b);
      };
      mkBtn('Mở lại', '', () => openLibraryPlan(it.id));
      mkBtn('Xuất Word', 'primary', () => exportLibraryDocx(it.id));
      mkBtn('Xoá', 'secondary', () => deleteLibraryPlan(it.id, it.lessonTitle));
      d.addEventListener('click', () => openLibraryPlan(it.id));
      box.appendChild(d);
    }
  } catch (e) {
    box.innerHTML = '<p class="hint">Không tải được thư viện: ' + String(e.message || e) + '</p>';
  }
}

function initStep3() {
  const bs = $('btn-save-library');
  if (bs) bs.addEventListener('click', saveLibrary);
  const be = $('btn-export-docx');
  if (be) be.addEventListener('click', exportDocx);
  loadLibraryList();
}
