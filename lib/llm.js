'use strict';
/**
 * Client gọi LLM tương thích OpenAI (chat completions).
 * Hỗ trợ timeout, trích xuất JSON từ phản hồi (kể cả khi model bọc code fence).
 */

async function chatCompletion({ baseUrl, apiKey, model, messages, maxTokens = 4000, temperature = 0.7, timeoutMs = 55000, reasoningEffort }) {
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
  s = s.slice(start, end + 1);
  return JSON.parse(s);
}

module.exports = { chatCompletion, extractJson };
