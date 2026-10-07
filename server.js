'use strict';
/**
 * Trợ lý soạn giáo án Toán 5512 — máy chủ backend (Node.js + Express).
 *
 * Bước 1: phục vụ giao diện + API danh mục bài học.
 * Bước 2: AI soạn giáo án 3 chế độ (Chi tiết / Khung nhanh / Phân hoá) qua SSE.
 * Bước 3: thư viện giáo án trên máy chủ + xuất Word .docx thật.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { chatCompletion, extractJson } = require('./lib/llm');
const { itemLabel, buildGenerateJobs, buildFocusPrompt } = require('./lib/prompts');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

/**
 * Thư mục ghi được: trên Vercel filesystem chỉ cho ghi vào /tmp
 * (tạm thời, mất khi function lạnh lại); chạy local thì ghi vào data/.
 */
function writableDir() {
  if (process.env.VERCEL) {
    const d = '/tmp/giao-an-5512-data';
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  return path.join(ROOT, 'data');
}

/**
 * Diễn giải lỗi thường gặp của nhà cung cấp AI thành tiếng Việt dễ hành động.
 * Luôn giữ lại chi tiết kỹ thuật gốc để đối chiếu.
 */
function friendlyLlmError(raw) {
  const msg = String(raw || '');
  let hint = '';
  if (/UNAUTHENTICATED|invalid authentication|invalid_api_key|API key not valid/i.test(msg)) {
    hint =
      'Google từ chối API key (lỗi 401). Làm theo 3 bước: ' +
      '1) copy lại key từ Google AI Studio cho đủ ký tự, không thừa khoảng trắng; ' +
      '2) nếu key có "API restrictions" trong Google Cloud Console thì mở cho Generative Language API; ' +
      '3) thử tạo key mới tại AI Studio rồi nhập lại.';
  } else if (/no longer available|models\/[^ ]* (not found|is not)|did not find/i.test(msg)) {
    hint =
      'Model đã bị Google ngừng hỗ trợ. Sửa ô Model thành tên model mới ' +
      '(ví dụ gemini-3.8-flash), bấm Lưu rồi kiểm tra lại.';
  } else if (/LLM HTTP 429/.test(msg)) {
    hint =
      'Vượt giới hạn gọi của gói miễn phí (429). Đợi 1–2 phút rồi thử lại; ' +
      'nên dùng chế độ Khung nhanh thay vì Chi tiết.';
  } else if (/LLM HTTP 503/.test(msg)) {
    hint = 'Google đang quá tải tạm thời (503). Đợi một lúc rồi thử lại; app đã tự thử lại 3 lần.';
  } else if (/Expected ',' or '\]'|Unexpected token|is not valid JSON|Không tìm thấy JSON/i.test(msg)) {
    hint =
      'AI trả về dữ liệu sai định dạng (hay gặp ở model miễn phí nhỏ hoặc phản hồi bị cắt cụt; ' +
      'app đã tự vá và thử lại). Hãy bấm Soạn lại; nếu vẫn lỗi, chuyển sang chế độ Khung nhanh (nhẹ hơn, ít lỗi hơn).';
  }
  const tech = msg.length > 320 ? msg.slice(0, 320) + '…' : msg;
  return hint ? `${hint}\nChi tiết kỹ thuật: ${tech}` : tech;
}

/**
 * Thử lại các lỗi tạm thời của LLM (429/503, timeout):
 * quá tải phía nhà cung cấp thường tự hết sau vài giây.
 */
async function retryTransient(fn, { attempts = 3, baseDelayMs = 3000 } = {}) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const retryable = /LLM HTTP (429|503)/.test(msg) || /quá thời gian chờ/.test(msg);
      if (!retryable || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * i));
    }
  }
  throw lastErr;
}

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// ---------------------------------------------------------------------------
// Danh mục (Bước 1)
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'tro-ly-soan-giao-an-toan-5512', step: 3, time: new Date().toISOString() });
});

function loadCatalog() {
  const raw = fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8');
  return JSON.parse(raw);
}

app.get('/api/catalog', (req, res) => {
  try {
    res.json(loadCatalog());
  } catch (err) {
    res.status(500).json({ error: 'Không đọc được catalog.json', detail: String((err && err.message) || err) });
  }
});

app.get('/api/catalog/check', (req, res) => {
  try {
    const catalog = loadCatalog();
    const ROMAN_RE = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
    const EXPECTED_MAIN = { 6: 43, 7: 37, 8: 39, 9: 32 };
    const grades = [];
    let totalItems = 0;
    let totalMain = 0;
    let romanOk = true;
    for (const g of catalog.grades || []) {
      let items = 0;
      let main = 0;
      for (const ch of g.chapters || []) {
        if (!ROMAN_RE.test(ch.roman)) romanOk = false;
        for (const it of ch.items || []) {
          items += 1;
          if (it.kind === 'lesson') main += 1;
        }
      }
      for (const hv of g.hdtn || []) items += (hv.items || []).length;
      if (g.yearReview) items += 1;
      totalItems += items;
      totalMain += main;
      grades.push({
        grade: g.grade,
        items,
        main,
        expectedMain: EXPECTED_MAIN[g.grade],
        mainOk: main === EXPECTED_MAIN[g.grade],
      });
    }
    res.json({
      ok: totalItems === 283 && totalMain === 151 && romanOk && grades.every((x) => x.mainOk),
      totalItems,
      totalMain,
      expectedItems: 283,
      expectedMain: 151,
      romanNumeralsOk: romanOk,
      grades,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

/** Tra cứu mục trong catalog theo id -> thông tin chuẩn (chống prompt sai bài). */
function findCatalogItem(id) {
  const catalog = loadCatalog();
  for (const g of catalog.grades || []) {
    for (const ch of g.chapters || []) {
      for (const it of ch.items || []) {
        if (it.id === id) {
          return {
            id: it.id, kind: it.kind, number: it.number, title: it.title,
            grade: g.grade, chapterLabel: `Chương ${ch.roman}. ${ch.name}`,
          };
        }
      }
    }
    for (const hv of g.hdtn || []) {
      for (const it of hv.items || []) {
        if (it.id === id) {
          return {
            id: it.id, kind: it.kind, title: it.title,
            grade: g.grade, chapterLabel: `Hoạt động thực hành trải nghiệm – Tập ${hv.volume}`,
          };
        }
      }
    }
    if (g.yearReview && g.yearReview.id === id) {
      return { id, kind: 'ontap', title: 'Ôn tập cuối năm', grade: g.grade, chapterLabel: 'Ôn tập cuối năm' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cài đặt AI (Bước 2) — API key chỉ lưu trên máy chủ, không bao giờ trả về client
// ---------------------------------------------------------------------------

const SETTINGS_PATH = path.join(writableDir(), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
  }
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

app.get('/api/settings', (req, res) => {
  const s = loadSettings();
  res.json({
    baseUrl: s.baseUrl || 'https://api.openai.com/v1',
    model: s.model || 'gpt-4o-mini',
    hasKey: !!s.apiKey,
    keyTail: s.apiKey ? '…' + String(s.apiKey).slice(-4) : '',
  });
});

app.post('/api/settings', (req, res) => {
  const s = loadSettings();
  const b = req.body || {};
  if (typeof b.baseUrl === 'string' && b.baseUrl.trim()) s.baseUrl = b.baseUrl.trim().replace(/\/+$/, '');
  if (typeof b.model === 'string' && b.model.trim()) s.model = b.model.trim();
  if (typeof b.apiKey === 'string' && b.apiKey.trim()) s.apiKey = b.apiKey.trim();
  saveSettings(s);
  res.json({ ok: true, hasKey: !!s.apiKey });
});

app.post('/api/settings/test', async (req, res) => {
  const s = loadSettings();
  const b = req.body || {};
  // Ưu tiên giá trị gửi kèm (nội dung đang hiện trên form), rồi mới tới đã lưu.
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const baseUrl = str(b.baseUrl) || s.baseUrl;
  const model = str(b.model) || s.model;
  const apiKey = str(b.apiKey) || s.apiKey;
  if (!apiKey) return res.status(400).json({ ok: false, error: 'Chưa nhập API key.' });
  try {
    // Tự thử lại nếu Google quá tải thoáng qua, tránh báo "thất bại" oan.
    const out = await retryTransient(
      () =>
        chatCompletion({
          baseUrl, apiKey, model,
          messages: [{ role: 'user', content: 'Trả lời đúng một từ: OK' }],
          maxTokens: 100, timeoutMs: 25000, reasoningEffort: 'none',
        }),
      { attempts: 3, baseDelayMs: 3000 }
    );
    res.json({ ok: true, reply: out.slice(0, 80) });
  } catch (e) {
    res.status(502).json({ ok: false, error: friendlyLlmError(String((e && e.message) || e)) });
  }
});

// ---------------------------------------------------------------------------
// Gợi ý trọng tâm (Bước 2)
// ---------------------------------------------------------------------------

app.post('/api/focus-points', async (req, res) => {
  const s = loadSettings();
  if (!s.apiKey) return res.status(400).json({ error: 'Chưa cấu hình API key. Hãy vào phần "Cài đặt AI".' });
  const item = normalizeItem(req.body && req.body.item);
  if (!item) return res.status(400).json({ error: 'Bài học không hợp lệ.' });
  try {
    // Tự thử lại tối đa 3 lần nếu Google quá tải tạm thời (429/503).
    const content = await retryTransient(
      () =>
        chatCompletion({
          baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model,
          messages: [
            { role: 'system', content: 'Bạn là trợ lý soạn giáo án Toán THCS.' },
            { role: 'user', content: buildFocusPrompt(item) },
          ],
          // Trần token lớn + tắt thinking: một số model (vd. Gemini 2.5) mặc định
          // dùng hết token cho "suy nghĩ nội bộ" khiến JSON trả về bị cắt cụt.
          maxTokens: 2000, timeoutMs: 30000, reasoningEffort: 'none',
        }),
      { attempts: 3, baseDelayMs: 3000 }
    );
    let data;
    try {
      data = extractJson(content);
    } catch {
      throw new Error(
        'AI không trả về đúng định dạng JSON. Đoạn phản hồi nhận được: ' +
          JSON.stringify(String(content).slice(0, 200))
      );
    }
    const points = Array.isArray(data.points) ? data.points.filter((x) => typeof x === 'string').slice(0, 8) : [];
    if (!points.length) throw new Error('AI không trả về trọng tâm.');
    res.json({ points });
  } catch (e) {
    res.status(502).json({ error: 'Không gợi ý được trọng tâm: ' + String((e && e.message) || e) });
  }
});

// ---------------------------------------------------------------------------
// Soạn giáo án bằng AI (Bước 2) — SSE, hiển thị tiến độ + đồng hồ
// ---------------------------------------------------------------------------

/** Các trường thông tin giáo viên: loại bỏ nếu client gửi nhầm — KHÔNG vào prompt. */
const PRIVATE_FIELDS = ['teacher', 'teacherName', 'hoTen', 'hoten', 'school', 'truong', 'upper', 'donvi', 'dept', 'department', 'to'];

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.id) {
    const found = findCatalogItem(raw.id);
    if (found) return found;
  }
  if (!raw.title || !raw.grade) return null;
  return {
    id: raw.id || '', kind: raw.kind || 'lesson', number: raw.number,
    title: String(raw.title), grade: Number(raw.grade),
    chapterLabel: String(raw.chapterLabel || ''),
  };
}

/** Ghi log prompt phục vụ kiểm thử (không bao giờ ghi API key). Bật bằng PROMPT_LOG=1. */
function logPrompts(mode, jobs) {
  if (process.env.PROMPT_LOG !== '1') return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(), mode,
      prompts: jobs.map((j) => ({ tag: j.tag, system: j.system, user: j.user })),
    });
    fs.appendFileSync(path.join(ROOT, 'data', 'prompt-log.jsonl'), line + '\n');
  } catch { /* bỏ qua */ }
}

function sectionKey(heading) {
  const m = String(heading || '').trim().toUpperCase().match(/^(IV|I{1,3}|VI{0,3}|IX|X)\b/);
  return m ? m[1] : String(heading || '').trim().toUpperCase();
}

/** Ghép 2 phần của chế độ Chi tiết (gộp các section III). */
function mergePlans(p1, p2) {
  const sections = [...(p1.sections || [])];
  for (const s2 of p2.sections || []) {
    const k2 = sectionKey(s2.heading);
    const idx = sections.findIndex((s) => sectionKey(s.heading) === k2);
    if (idx >= 0) {
      sections[idx] = {
        heading: sections[idx].heading,
        blocks: [...(sections[idx].blocks || []), ...(s2.blocks || [])],
      };
    } else {
      sections.push(s2);
    }
  }
  return { lessonTitle: p1.lessonTitle || p2.lessonTitle || '', sections };
}

app.post('/api/generate', async (req, res) => {
  const s = loadSettings();
  if (!s.apiKey) return res.status(400).json({ error: 'Chưa cấu hình API key. Hãy vào phần "Cài đặt AI".' });

  // RIÊNG TƯ: tách bỏ mọi trường thông tin giáo viên trước khi dựng prompt.
  const body = { ...(req.body || {}) };
  for (const k of PRIVATE_FIELDS) delete body[k];

  const item = normalizeItem(body.item);
  const mode = ['chi-tiet', 'khung-nhanh', 'phan-hoa'].includes(body.mode) ? body.mode : 'khung-nhanh';
  const duration = body.duration === 2 ? 2 : 1;
  const focus = Array.isArray(body.focus) ? body.focus.map(String).slice(0, 12) : [];
  const extra = typeof body.extra === 'string' ? body.extra.slice(0, 1000) : '';
  if (!item) return res.status(400).json({ error: 'Bài học không hợp lệ.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  async function runJob(job) {
    send('progress', { step: job.tag, status: 'started', elapsedMs: elapsed() });
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const shorten = attempt === 2;
      try {
        const content = await chatCompletion({
          baseUrl: s.baseUrl,
          apiKey: s.apiKey,
          model: s.model,
          messages: [
            { role: 'system', content: job.system },
            { role: 'user', content: job.user + (shorten ? '\n\nTrình bày súc tích hơn nhưng giữ đầy đủ cấu trúc đã yêu cầu.' : '') },
          ],
          maxTokens: Math.round(job.maxTokens * (shorten ? 0.6 : 1)),
          timeoutMs: 55000,
        });
        const plan = extractJson(content);
        if (!plan || !Array.isArray(plan.sections) || !plan.sections.length) {
          throw new Error('AI trả về thiếu cấu trúc giáo án.');
        }
        send('progress', { step: job.tag, status: 'done', elapsedMs: elapsed(), attempt });
        return plan;
      } catch (e) {
        lastErr = e;
        send('progress', {
          step: job.tag, status: attempt < 2 ? 'retrying' : 'failed',
          elapsedMs: elapsed(), error: String((e && e.message) || e),
        });
      }
    }
    throw lastErr;
  }

  try {
    const jobs = buildGenerateJobs({ item, mode, duration, focus, extra });
    logPrompts(mode, jobs);
    let plan;
    if (jobs.length === 2) {
      send('progress', { step: 'all', status: 'parallel-2', elapsedMs: elapsed() });
      const [p1, p2] = await Promise.all([runJob(jobs[0]), runJob(jobs[1])]);
      send('progress', { step: 'merge', status: 'started', elapsedMs: elapsed() });
      plan = mergePlans(p1, p2);
      send('progress', { step: 'merge', status: 'done', elapsedMs: elapsed() });
    } else {
      plan = await runJob(jobs[0]);
    }
    plan.lessonTitle = plan.lessonTitle || itemLabel(item);
    plan.meta = {
      mode, duration, elapsedMs: elapsed(), model: s.model,
      item: { id: item.id, grade: item.grade, chapterLabel: item.chapterLabel, title: item.title, kind: item.kind, number: item.number },
      generatedAt: new Date().toISOString(),
    };
    send('result', { plan });
    send('done', {});
    res.end();
  } catch (e) {
    send('error', { message: friendlyLlmError(String((e && e.message) || e)) });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Bước 3: Thư viện giáo án lưu trên máy chủ + xuất Word .docx thật
// ---------------------------------------------------------------------------

const { exportDocxBuffer, docxFileName } = require('./lib/docx');

const LIBRARY_PATH = path.join(writableDir(), 'library.json');

function loadLibrary() {
  try {
    const raw = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLibrary(items) {
  fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true });
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(items, null, 1), 'utf8');
}

function libraryMeta(entry) {
  const meta = (entry.plan && entry.plan.meta) || {};
  const item = meta.item || {};
  return {
    id: entry.id,
    lessonTitle: entry.plan && entry.plan.lessonTitle ? entry.plan.lessonTitle : '',
    grade: item.grade != null ? item.grade : null,
    chapterLabel: item.chapterLabel || '',
    mode: meta.mode || '',
    duration: meta.duration || 1,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/** Danh sách giáo án đã lưu (chỉ metadata). */
app.get('/api/library', (req, res) => {
  res.json({ items: loadLibrary().map(libraryMeta) });
});

/** Lấy 1 giáo án đầy đủ. */
app.get('/api/library/:id', (req, res) => {
  const entry = loadLibrary().find((e) => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy giáo án.' });
  res.json(entry);
});

/** Chuẩn hoá giáo án trước khi lưu: chỉ giữ các trường hợp lệ. */
function sanitizePlan(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections) || !raw.sections.length) {
    return null;
  }
  const sections = raw.sections
    .filter((x) => x && typeof x === 'object')
    .map((sec) => ({
      heading: String(sec.heading || ''),
      blocks: (Array.isArray(sec.blocks) ? sec.blocks : [])
        .filter((b) => b && typeof b === 'object')
        .map((b) => {
          if (b.type === 'ul' || b.type === 'ol') {
            return {
              type: b.type,
              items: (Array.isArray(b.items) ? b.items : []).map(String).slice(0, 200),
            };
          }
          return {
            type: b.type === 'h' ? 'h' : 'p',
            level: Number(b.level) || 3,
            text: String(b.text || ''),
          };
        })
        .slice(0, 400),
    }))
    .slice(0, 20);
  if (!sections.length) return null;
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  return {
    lessonTitle: String(raw.lessonTitle || '').slice(0, 200),
    sections,
    meta: {
      mode: typeof meta.mode === 'string' ? meta.mode : '',
      duration: meta.duration === 2 ? 2 : 1,
      model: typeof meta.model === 'string' ? meta.model.slice(0, 80) : '',
      generatedAt: typeof meta.generatedAt === 'string' ? meta.generatedAt : '',
      item:
        meta.item && typeof meta.item === 'object'
          ? {
              grade: Number(meta.item.grade) || null,
              chapterLabel: String(meta.item.chapterLabel || '').slice(0, 200),
              title: String(meta.item.title || '').slice(0, 200),
              kind: String(meta.item.kind || ''),
            }
          : {},
    },
  };
}

function sanitizeTeacherInfo(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of ['upper', 'school', 'dept', 'teacher']) {
    out[k] = String(t[k] || '').slice(0, 120);
  }
  return out;
}

/** Lưu giáo án mới vào thư viện. */
app.post('/api/library', (req, res) => {
  const plan = sanitizePlan(req.body && req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Giáo án không hợp lệ.' });
  const items = loadLibrary();
  const entry = {
    id: 'pln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    plan,
    teacherInfo: sanitizeTeacherInfo(req.body && req.body.teacherInfo),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(entry);
  saveLibrary(items);
  res.json({ ok: true, id: entry.id });
});

/** Cập nhật giáo án đã lưu (nội dung xem trước đã sửa tay). */
app.put('/api/library/:id', (req, res) => {
  const plan = sanitizePlan(req.body && req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Giáo án không hợp lệ.' });
  const items = loadLibrary();
  const idx = items.findIndex((e) => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Không tìm thấy giáo án.' });
  items[idx].plan = plan;
  if (req.body && req.body.teacherInfo) {
    items[idx].teacherInfo = sanitizeTeacherInfo(req.body.teacherInfo);
  }
  items[idx].updatedAt = new Date().toISOString();
  saveLibrary(items);
  res.json({ ok: true, id: items[idx].id });
});

/** Xoá giáo án khỏi thư viện. */
app.delete('/api/library/:id', (req, res) => {
  const items = loadLibrary();
  const idx = items.findIndex((e) => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Không tìm thấy giáo án.' });
  items.splice(idx, 1);
  saveLibrary(items);
  res.json({ ok: true });
});

function sendDocx(res, plan, teacherInfo) {
  exportDocxBuffer(plan, teacherInfo)
    .then((buf) => {
      const name = encodeURIComponent(docxFileName(plan));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
      res.send(buf);
    })
    .catch((e) => {
      res.status(500).json({ error: 'Không xuất được file Word: ' + String((e && e.message) || e) });
    });
}

/** Xuất .docx trực tiếp từ giáo án đang xem trước (kèm thông tin GV). */
app.post('/api/export-docx', (req, res) => {
  const plan = sanitizePlan(req.body && req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Giáo án không hợp lệ.' });
  sendDocx(res, plan, sanitizeTeacherInfo(req.body && req.body.teacherInfo));
});

/** Xuất .docx từ 1 giáo án trong thư viện. */
app.post('/api/library/:id/export', (req, res) => {
  const entry = loadLibrary().find((e) => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy giáo án.' });
  sendDocx(res, entry.plan, entry.teacherInfo);
});

// Chạy trực tiếp (npm start): mở cổng lắng nghe.
// Khi được require (Vercel serverless qua api/index.js): chỉ xuất app, không listen.
if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[5512] Server đang chạy tại http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
