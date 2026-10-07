'use strict';
/**
 * Client gọi LLM tương thích OpenAI (chat completions).
 * Hỗ trợ timeout, trích xuất JSON từ phản hồi (kể cả khi model bọc code fence).
 */

async function chatCompletion({ baseUrl, apiKey, model, messages, maxTokens = 4000, temperature = 0.3, timeoutMs = 55000, reasoningEffort }) {
  const url = String(baseUrl).replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = { model, messages, max_tokens: maxTokens, temperature };
    // Một số model (vd. Gemini 2.5) mặc định "suy nghĩ" rất tốn token;
    // reasoning_effort: 'none' tắt thinking cho các lệnh gọi ngắn, nhẹ.
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('LLM trả về không phải JSON: ' + text.slice(0, 200));
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || typeof content !== 'string') throw new Error('LLM không trả về nội dung.');
    return content;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`LLM quá thời gian chờ (${Math.round(timeoutMs / 1000)}s).`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Trích object JSON từ nội dung model trả về (chịu được code fence ```json). */
function extractJson(content) {
  let s = String(content).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Không tìm thấy JSON trong phản hồi của AI.');
  }
  const full = s.slice(start); // từ { đầu tới hết nội dung (có thể bị cắt cụt)
  s = s.slice(start, end + 1); // bản cắt ở } cuối (bỏ phần đuôi thừa sau JSON)
  const attempts = [
    () => JSON.parse(s), // JSON chuẩn
    // Vá cả phần đuôi bị cắt dở TRƯỚC: giữ được tối đa nội dung hoàn chỉnh
    // (kể cả mục còn viết dở thì giáo viên vẫn sửa/xoá được trên bản xem trước).
    () => JSON.parse(repairJson(full)),
    () => JSON.parse(repairJson(s)), // vá bản đã cắt đuôi
  ];
  let firstErr = null;
  for (const fn of attempts) {
    try {
      return fn();
    } catch (e) {
      if (!firstErr) firstErr = e;
    }
  }
  throw firstErr;
}

/**
 * Vá các lỗi JSON thường gặp: dấu phẩy thừa trước } ], chuỗi/ngoặc bị cắt cụt
 * (model miễn phí hay trả về JSON dở dang khi hết token hoặc viết ẩu).
 */
function repairJson(s) {
  let t = String(s);
  t = t.replace(/,\s*([}\]])/g, '$1'); // bỏ dấu phẩy thừa
  t = t.replace(/,\s*$/, ''); // bỏ dấu phẩy lửng ở cuối (trường hợp cắt cụt)
  let out = '';
  const stack = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    out += ch;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const open = stack[stack.length - 1];
      if ((ch === '}' && open === '{') || (ch === ']' && open === '[')) stack.pop();
    }
  }
  if (inStr) out += '"'; // đóng chuỗi đang viết dở
  while (stack.length) out += stack.pop() === '{' ? '}' : ']'; // đóng ngoặc còn mở
  return out;
}

module.exports = { chatCompletion, extractJson };
