'use strict';
/**
 * Xây dựng prompt cho 3 chế độ soạn giáo án.
 * - chi-tiet: 2 job song song (P1: I+II+HĐ1-2 ; P2: HĐ3-4+IV), có thử lại/rút gọn.
 * - khung-nhanh: 1 job gọn, ổn định.
 * - phan-hoa: 1 job, bài tập HĐ3 chia 3 mức độ.
 *
 * NGUYÊN TẮC RIÊNG TƯ: prompt chỉ được dựng từ {item, mode, duration, focus, extra}.
 * Tuyệt đối không đưa họ tên giáo viên / trường / tổ vào đây.
 */

const TIME_SPLITS = {
  1: { total: 45, parts: [5, 15, 15, 10] },
  2: { total: 90, parts: [10, 30, 30, 20] },
};

const ACT_NAMES = ['Khởi động', 'Hình thành kiến thức', 'Luyện tập', 'Vận dụng'];

function itemLabel(item) {
  if (item.kind === 'lesson' && item.number) return `Bài ${item.number}. ${item.title}`;
  return item.title;
}

function lessonContext(item, duration) {
  const t = TIME_SPLITS[duration] || TIME_SPLITS[1];
  return [
    `Bài học cần soạn: ${itemLabel(item)}.`,
    `Vị trí: Toán lớp ${item.grade} • ${item.chapterLabel} • Bộ sách "Kết nối tri thức với cuộc sống" (NXB Giáo dục Việt Nam).`,
    `Thời lượng: ${t.total} phút (${duration} tiết).`,
  ].join('\n');
}

function focusText(focus, extra) {
  const lines = [];
  if (Array.isArray(focus) && focus.length) {
    lines.push('Trọng tâm do giáo viên chọn (ưu tiên các ý này):');
    for (const f of focus) {
      const s = String(f).trim();
      if (s) lines.push(`- ${s}`);
    }
  }
  if (extra && String(extra).trim()) lines.push(`Yêu cầu thêm của giáo viên: ${String(extra).trim()}`);
  return lines.join('\n');
}

function structureSpec(t) {
  const acts = ACT_NAMES.map((n, i) => `  - Hoạt động ${i + 1}: ${n} (${t.parts[i]} phút)`).join('\n');
  return `Giáo án gồm đúng 4 phần theo thứ tự:
I. MỤC TIÊU
  1. Kiến thức: nêu cụ thể kiến thức của đúng bài học này.
  2. Năng lực:
     - Năng lực đặc thù môn Toán: tư duy và lập luận toán học; mô hình hoá toán học; giải quyết vấn đề toán học; giao tiếp toán học; sử dụng công cụ, phương tiện học toán.
     - Năng lực chung: tự chủ và tự học; giao tiếp và hợp tác; giải quyết vấn đề và sáng tạo.
  3. Phẩm chất: chăm chỉ, trung thực, trách nhiệm (chọn ý phù hợp bài).
II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU
  - Của giáo viên: ...
  - Của học sinh: ...
III. TIẾN TRÌNH DẠY HỌC — gồm đúng 4 hoạt động, ghi thời lượng từng hoạt động, tổng cộng đúng ${t.total} phút:
${acts}
  Mỗi hoạt động gồm đủ 4 mục:
    a) Mục tiêu.
    b) Nội dung.
    c) Sản phẩm.
    d) Tổ chức thực hiện — đúng 4 bước: (1) Chuyển giao nhiệm vụ; (2) Thực hiện nhiệm vụ; (3) Báo cáo, thảo luận; (4) Kết luận, nhận định.
IV. ĐIỀU CHỈNH SAU BÀI DẠY (ghi ngắn gọn).`;
}

const QUALITY_RULES = `Yêu cầu nội dung:
- Mỗi hoạt động phải có ví dụ/bài tập SỐ CỤ THỂ thuộc đúng bài học này, tính toán chính xác từng bước và ghi rõ đáp án.
- Tuyệt đối không đưa nội dung của bài trước hay bài sau vào bài này.
- Diễn đạt sư phạm, rõ ràng, đúng thuật ngữ toán học.
- Ký hiệu toán học: viết số mũ bằng dấu ^ (VD: x^2, (a+b)^(n+1), 10^-2); phân số viết dạng a/b;
  không dùng ký tự mũ Unicode rời rạc. Ứng dụng sẽ tự chuyển thành định dạng chuẩn khi hiển thị và xuất Word.`;

const OUTPUT_SCHEMA = `Trả về DUY NHẤT một object JSON hợp lệ (không lời dẫn, không code fence), đúng schema:
{
  "lessonTitle": "<tên bài học>",
  "sections": [
    {"heading": "I. MỤC TIÊU", "blocks": [
      {"type": "h", "level": 3, "text": "1. Kiến thức"},
      {"type": "ul", "items": ["...", "..."]},
      {"type": "h", "level": 3, "text": "2. Năng lực"},
      {"type": "p", "text": "..."}
    ]}
  ]
}
Loại block cho phép:
- {"type":"h","level":2|3|4,"text":"..."} : tiêu đề (dùng level 3 cho tên hoạt động và mục a/b/c/d).
- {"type":"p","text":"..."} : đoạn văn.
- {"type":"ul","items":["...","..."]} : gạch đầu dòng.
- {"type":"ol","items":["...","..."]} : danh sách đánh số.
Mỗi hoạt động trong phần III mở đầu bằng block {"type":"h","level":3,"text":"Hoạt động 1: Khởi động (5 phút)"} (ghi đúng tên và số phút).`;

function systemMsg(item) {
  return `Bạn là giáo viên Toán THCS giỏi, chuyên soạn giáo án theo mẫu Công văn 5512/BGDĐT của Bộ Giáo dục và Đào tạo.\nBối cảnh duy nhất: SGK Toán lớp ${item.grade} bộ "Kết nối tri thức với cuộc sống" (NXB Giáo dục Việt Nam).`;
}

/**
 * Trả về danh sách job. Mỗi job: { tag, system, user, maxTokens }.
 * chi-tiet -> 2 job (chạy song song); các chế độ khác -> 1 job.
 */
function buildGenerateJobs({ item, mode, duration, focus, extra }) {
  const t = TIME_SPLITS[duration] || TIME_SPLITS[1];
  const base = [lessonContext(item, duration), focusText(focus, extra)].filter(Boolean).join('\n\n');
  const system = systemMsg(item);

  if (mode === 'chi-tiet') {
    return [
      {
        tag: 'part1',
        system,
        maxTokens: 6000,
        user: `CHẾ ĐỘ: CHI TIẾT — PHẦN 1/2\n\n${base}\n\nNhiệm vụ: soạn PHẦN 1 gồm:\n- I. MỤC TIÊU (đầy đủ 1. Kiến thức; 2. Năng lực đặc thù + năng lực chung; 3. Phẩm chất).\n- II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU (của giáo viên; của học sinh).\n- Trong III. TIẾN TRÌNH DẠY HỌC: chỉ soạn Hoạt động 1 (${ACT_NAMES[0]}, ${t.parts[0]} phút) và Hoạt động 2 (${ACT_NAMES[1]}, ${t.parts[1]} phút); mỗi hoạt động đủ a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện theo đúng 4 bước (Chuyển giao nhiệm vụ; Thực hiện nhiệm vụ; Báo cáo, thảo luận; Kết luận, nhận định).\n\n${QUALITY_RULES}\n\n${OUTPUT_SCHEMA}`,
      },
      {
        tag: 'part2',
        system,
        maxTokens: 6000,
        user: `CHẾ ĐỘ: CHI TIẾT — PHẦN 2/2\n\n${base}\n\nNhiệm vụ: soạn PHẦN 2 gồm:\n- Trong III. TIẾN TRÌNH DẠY HỌC: chỉ soạn Hoạt động 3 (${ACT_NAMES[2]}, ${t.parts[2]} phút) và Hoạt động 4 (${ACT_NAMES[3]}, ${t.parts[3]} phút); mỗi hoạt động đủ a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện theo đúng 4 bước (Chuyển giao nhiệm vụ; Thực hiện nhiệm vụ; Báo cáo, thảo luận; Kết luận, nhận định).\n- IV. ĐIỀU CHỈNH SAU BÀI DẠY (ngắn gọn).\n\n${QUALITY_RULES}\n\n${OUTPUT_SCHEMA}`,
      },
    ];
  }

  if (mode === 'phan-hoa') {
    return [
      {
        tag: 'single',
        system,
        maxTokens: 6500,
        user: `CHẾ ĐỘ: PHÂN HOÁ\n\n${base}\n\nNhiệm vụ: soạn đầy đủ 4 phần I–IV.\n${structureSpec(t)}\n\nĐiểm khác biệt của chế độ này: trong Hoạt động 3 (Luyện tập), chia bài tập thành 3 mức độ, mỗi mức 2–3 bài tập CỤ THỂ có đáp án:\n- Mức 1: Nhận biết.\n- Mức 2: Thông hiểu.\n- Mức 3: Vận dụng.\n\n${QUALITY_RULES}\n\n${OUTPUT_SCHEMA}`,
      },
    ];
  }

  // khung-nhanh (mặc định)
  return [
    {
      tag: 'single',
      system,
      maxTokens: 4200,
      user: `CHẾ ĐỘ: KHUNG NHANH\n\n${base}\n\nNhiệm vụ: soạn đầy đủ 4 phần I–IV.\n${structureSpec(t)}\n\nTrình bày GỌN NHẸ, ỔN ĐỊNH: mỗi mục 2–4 gạch đầu dòng súc tích; mỗi hoạt động vẫn đủ a) b) c) d) và 4 bước tổ chức, có ít nhất 1 ví dụ/bài tập cụ thể có đáp án; tổng thời lượng 4 hoạt động đúng ${t.total} phút.\n\n${QUALITY_RULES}\n\n${OUTPUT_SCHEMA}`,
    },
  ];
}

function buildFocusPrompt(item) {
  return `Bài học: ${itemLabel(item)} (${item.chapterLabel}), Toán lớp ${item.grade}, bộ "Kết nối tri thức với cuộc sống".\nLiệt kê 6 trọng tâm dạy học của bài này. Mỗi trọng tâm MỘT dòng ngắn gọn (dưới 12 từ), thiết thực cho giáo viên khi soạn giáo án.\nTrả về DUY NHẤT JSON: {"points": ["...", "...", "...", "...", "...", "..."]}`;
}

module.exports = {
  TIME_SPLITS,
  ACT_NAMES,
  itemLabel,
  buildGenerateJobs,
  buildFocusPrompt,
};
