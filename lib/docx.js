'use strict';
/**
 * Bước 3 — Xuất giáo án thành file Word .docx thật.
 *
 * Đúng đặc tả:
 * - Khổ A4, phông Times New Roman cỡ 14, giãn dòng 1.3.
 * - Lề: trên 2cm, dưới 2cm, trái 3cm, phải 2cm. Số trang ở chân trang.
 * - Đầu trang (2 cột): trái "ĐƠN VỊ CẤP TRÊN" + tên trường;
 *   phải "TỔ CHUYÊN MÔN" + họ và tên giáo viên.
 * - Cuối giáo án: khối chữ ký hai cột "TỔ TRƯỞNG" | "GIÁO VIÊN".
 *
 * RIÊNG TƯ: thông tin giáo viên/trường/tổ chỉ dùng để chèn vào file Word;
 * không bao giờ gửi cho AI, không ghi log.
 */

const {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageNumber,
  NumberFormat, Footer, Table, TableCell, TableRow, WidthType, BorderStyle,
  Math: OMath, MathFraction, MathRun, MathSuperScript, MathSubScript, MathRadical,
} = require('docx');

const FONT = 'Times New Roman';
const SIZE = 28; // 14pt tính theo half-points
const LINE_13 = 312; // giãn dòng 1.3 (đơn vị 1/240 dòng)
const CM = 566.929; // twips cho 1 cm

const s = (v) => (v == null ? '' : String(v));

function run(text, opts = {}) {
  return new TextRun({
    text: s(text),
    font: FONT,
    size: SIZE,
    bold: !!opts.bold,
    italics: !!opts.italics,
    superScript: !!opts.sup,
    subScript: !!opts.sub,
  });
}

/**
 * Nhận diện phân số viết dạng a/b trong text thuần (VD: 3/4, x^2/y^3,
 * (a+b)/(c-d), -3/4) để dựng thành phân số XẾP CHỒNG kiểu MathType
 * (tử số trên, mẫu số dưới dấu gạch ngang) trong file Word.
 * Không nhận diện: ngày tháng (12/05/2026), URL (http://...), chuỗi a/b/c.
 */
const FRAC_OP = '(?:\\([^()]*\\)|[A-Za-z0-9]+(?:[.,][A-Za-z0-9]+)*(?:\\^(?:\\{[^}]*\\}|\\([^)]*\\)|[A-Za-z0-9]+))?)';
const FRAC_RE = new RegExp(`(?<!/\\d)(?<!/)(-?${FRAC_OP})\\s*/\\s*(${FRAC_OP})(?!\\s*/)(?!\\d)` , 'g');

/** Tách text thành [{text} | {frac:{num,den}}]; dấu ⁄ cũ cũng chuẩn hoá thành /. */
function splitInline(text) {
  const t = s(text).replace(/⁄/g, '/');
  const re = new RegExp(FRAC_RE.source, 'g');
  const out = [];
  let last = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push({ text: t.slice(last, m.index) });
    out.push({ frac: { num: m[1], den: m[2] } });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ text: t.slice(last) });
  return out.length ? out : [{ text: t }];
}

/**
 * Làm phẳng segments thành các mảnh text { text, sup, sub } để dựng TextRun.
 * - Phân số: tử số (chữ mũ trên) + dấu ⁄ (U+2044) + mẫu số (chữ mũ dưới).
 * - Căn thức: √(…), căn bậc n: ⁿ√(…).
 * - Ký hiệu mũ dạng x^2 trong text thuần cũng được tách thành số mũ thật.
 */
const CARET_RE_DOCX = /\^(\{([^}]*)\}|\(([^)]*)\)|(-?[0-9A-Za-z]+))/g;

/** Tách "8x^2" thành [{text:"8x"},{text:"2",sup:true}]; null nếu không có ký hiệu ^. */
function expandCaretText(text) {
  const re = new RegExp(CARET_RE_DOCX.source, 'g');
  const out = [];
  let last = 0, m, found = false;
  while ((m = re.exec(text))) {
    const inner = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (inner) { out.push({ text: inner, sup: true }); found = true; }
    else out.push({ text: m[0] });
    last = m.index + m[0].length;
  }
  if (!found) return null;
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Một MathRun; in đậm/nghiêng theo style của block chứa nó. */
function mathRun(t, opts) {
  const st = opts && opts.bold ? 'bold' : opts && opts.italics ? 'italic' : undefined;
  return st ? new MathRun({ text: s(t), style: st }) : new MathRun(s(t));
}

/**
 * Kết hợp các mảnh [{text, sup?, sub?}] thành MathRun, gộp mũ trên/dưới
 * vào base đứng ngay trước nó (MathSuperScript / MathSubScript thật của Word).
 */
function combineMathRuns(pieces, opts) {
  const runs = [];
  let base = null;
  for (const p of pieces) {
    if (!p || !p.text) continue;
    if (p.sup || p.sub) {
      const exp = mathRun(p.text, opts);
      if (base) {
        runs.pop();
        runs.push(p.sup
          ? new MathSuperScript({ children: [base], superScript: [exp] })
          : new MathSubScript({ children: [base], subScript: [exp] }));
        base = null;
      } else {
        const empty = mathRun('', opts);
        runs.push(p.sup
          ? new MathSuperScript({ children: [empty], superScript: [exp] })
          : new MathSubScript({ children: [empty], subScript: [exp] }));
      }
    } else {
      base = mathRun(p.text, opts);
      runs.push(base);
    }
  }
  return runs;
}

/**
 * Text thuần -> các MathComponent (dùng trong tử/mẫu phân số).
 * Xử lý: phân số a/b lồng nhau (đệ quy), ký hiệu mũ ^.
 */
function mathComponentsFromText(text, opts) {
  const out = [];
  let buf = [];
  const flush = () => { if (buf.length) { out.push(...combineMathRuns(buf, opts)); buf = []; } };
  for (const part of splitInline(text)) {
    if (part.frac) {
      flush();
      out.push(new MathFraction({
        numerator: mathComponentsFromText(part.frac.num, opts),
        denominator: mathComponentsFromText(part.frac.den, opts),
      }));
      continue;
    }
    const ex = expandCaretText(part.text);
    if (ex) { for (const c of ex) if (c.text) buf.push(c); }
    else if (part.text) buf.push({ text: part.text });
  }
  flush();
  return out;
}

/** Mảng segments (từ thanh công thức) -> MathComponent cho tử/mẫu phân số. */
function mathComponentsFromSegs(segs, opts) {
  const out = [];
  for (const sgm of segs || []) {
    if (!sgm || typeof sgm !== 'object') continue;
    if (sgm.frac && sgm.frac.num && sgm.frac.den) {
      out.push(new MathFraction({
        numerator: mathComponentsFromSegs(sgm.frac.num, opts),
        denominator: mathComponentsFromSegs(sgm.frac.den, opts),
      }));
    } else if (sgm.sqrt && sgm.sqrt.body) {
      out.push(new MathRadical({
        children: mathComponentsFromSegs(sgm.sqrt.body, opts),
        ...(sgm.sqrt.n ? { degree: mathComponentsFromSegs(sgm.sqrt.n, opts) } : {}),
      }));
    } else if (typeof sgm.text === 'string' && sgm.text) {
      if (sgm.sup || sgm.sub) {
        const inner = mathComponentsFromText(sgm.text, opts);
        const empty = mathRun('', opts);
        out.push(sgm.sup
          ? new MathSuperScript({ children: [empty], superScript: inner })
          : new MathSubScript({ children: [empty], subScript: inner }));
      } else {
        out.push(...mathComponentsFromText(sgm.text, opts));
      }
    }
  }
  return out;
}

/** Dựng phân số xếp chồng (OMML) từ 2 chuỗi tử/mẫu. */
function stackedFraction(numText, denText, opts) {
  return new OMath({
    children: [new MathFraction({
      numerator: mathComponentsFromText(numText, opts),
      denominator: mathComponentsFromText(denText, opts),
    })],
  });
}

/** Text thuần của block -> mảng TextRun | Math (xử lý a/b và ^). */
function childrenFromText(text, opts) {
  const o = opts || {};
  const out = [];
  for (const part of splitInline(text)) {
    if (part.frac) { out.push(stackedFraction(part.frac.num, part.frac.den, o)); continue; }
    const ex = expandCaretText(part.text);
    if (!ex) { if (part.text) out.push(run(part.text, o)); continue; }
    for (const c of ex) {
      if (!c.text) continue;
      out.push(run(c.text, { bold: o.bold, italics: o.italics, sup: !!(c.sup || o.sup), sub: !!o.sub }));
    }
  }
  return out;
}

/** Mảng segments -> mảng TextRun | Math. */
function childrenFromSegs(segs, opts) {
  const o = opts || {};
  const out = [];
  for (const sgm of segs || []) {
    if (!sgm || typeof sgm !== 'object') continue;
    if (sgm.frac && sgm.frac.num && sgm.frac.den) {
      // Phân số chèn bằng thanh công thức: dựng OMML xếp chồng thật.
      out.push(new OMath({
        children: [new MathFraction({
          numerator: mathComponentsFromSegs(sgm.frac.num, o),
          denominator: mathComponentsFromSegs(sgm.frac.den, o),
        })],
      }));
    } else if (sgm.sqrt && sgm.sqrt.body) {
      // Căn thức: giữ cách hiển thị inline √(…) như trước.
      if (sgm.sqrt.n) out.push(...childrenFromSegs(sgm.sqrt.n, { ...o, sup: true }));
      out.push(run('√(', o));
      out.push(...childrenFromSegs(sgm.sqrt.body, o));
      out.push(run(')', o));
    } else if (typeof sgm.text === 'string' && sgm.text) {
      out.push(...childrenFromText(sgm.text, { ...o, sup: o.sup || sgm.sup, sub: o.sub || sgm.sub }));
    }
  }
  return out;
}

/** Dựng các TextRun/Math cho 1 block; opts (bold/italics) áp cho toàn block. */
function blockRuns(b, opts) {
  const segs =
    Array.isArray(b.segments) && b.segments.length
      ? b.segments
      : typeof b.text === 'string' && b.text
        ? [{ text: b.text }]
        : null;
  const children = segs ? childrenFromSegs(segs, opts) : [];
  return children.length ? children : [run('', opts)];
}

/** Dựng các TextRun/Math cho 1 item của danh sách (string hoặc { segments }). */
function itemRuns(it) {
  if (it && typeof it === 'object' && Array.isArray(it.segments)) return blockRuns(it);
  return blockRuns({ text: it });
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: {
      line: LINE_13,
      lineRule: 'auto',
      after: opts.after != null ? opts.after : 120,
    },
    children: [run(text, opts)],
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideH: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideV: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

/**
 * Đầu trang theo đặc tả: 2 cột không viền.
 * Trái: "ĐƠN VỊ CẤP TRÊN" + (đơn vị) + tên trường.
 * Phải: "TỔ CHUYÊN MÔN" + (tổ) + họ tên giáo viên.
 */
function headerInfoTable(info) {
  const t = info || {};
  const left = ['ĐƠN VỊ CẤP TRÊN'];
  if (t.upper) left.push(t.upper);
  left.push(t.school ? `Tên trường: ${t.school}` : 'Tên trường: …');
  const right = ['TỔ CHUYÊN MÔN'];
  if (t.dept) right.push(t.dept);
  right.push(t.teacher ? `Họ và tên giáo viên: ${t.teacher}` : 'Họ và tên giáo viên: …');

  const cell = (lines, align) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      children: lines.map(
        (ln, i) =>
          new Paragraph({
            alignment: align,
            spacing: { line: LINE_13, lineRule: 'auto', after: 40 },
            children: [run(ln, { bold: i === 0 })],
          }),
      ),
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({ children: [cell(left, AlignmentType.LEFT), cell(right, AlignmentType.RIGHT)] })],
  });
}

/** Khối tiêu đề bài dạy theo mẫu 5512. */
function titleBlockParagraphs(plan) {
  const meta = plan.meta || {};
  const item = meta.item || {};
  const grade = item.grade != null ? item.grade : '';
  const duration = meta.duration === 2 ? '2 tiết (90 phút)' : '1 tiết (45 phút)';
  return [
    para(`TÊN BÀI DẠY: ${(plan.lessonTitle || '').toUpperCase()}`, {
      bold: true, align: AlignmentType.CENTER, after: 200,
    }),
    para(`Môn học/Hoạt động giáo dục: Toán; lớp: ${grade}`, { after: 60 }),
    para(`Thời gian thực hiện: ${duration}`, { after: 200 }),
  ];
}

/** Chuyển 1 block của plan thành (các) Paragraph. */
function blocksToParagraphs(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'h') {
      out.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { line: LINE_13, lineRule: 'auto', after: 120 },
          children: blockRuns(b, { bold: true }),
        })
      );
    } else if (b.type === 'ul' || b.type === 'ol') {
      const items = Array.isArray(b.items) ? b.items : [];
      for (const it of items) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: LINE_13, lineRule: 'auto', after: 80 },
            bullet: b.type === 'ul' ? { level: 0 } : undefined,
            numbering: b.type === 'ol' ? { reference: 'plan-list', level: 0 } : undefined,
            children: itemRuns(it),
          })
        );
      }
    } else {
      out.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: LINE_13, lineRule: 'auto', after: 120 },
          children: blockRuns(b),
        })
      );
    }
  }
  return out;
}

/** Khối chữ ký cuối giáo án: hai cột "TỔ TRƯỞNG" | "GIÁO VIÊN". */
function signatureTable(info) {
  const name = s((info || {}).teacher);
  const titleCell = (text) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      children: [para(text, { bold: true, align: AlignmentType.CENTER, after: 60 })],
    });
  const blankCell = (extra) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      children: extra || [para('', { after: 800 })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [titleCell('TỔ TRƯỞNG'), titleCell('GIÁO VIÊN')] }),
      new TableRow({
        children: [
          blankCell(),
          blankCell([
            para('', { after: 600 }),
            para(name || '(Họ và tên)', { bold: !!name, italics: !name, align: AlignmentType.CENTER, after: 0 }),
          ]),
        ],
      }),
      new TableRow({ children: [blankCell([para('', { after: 200 })]), blankCell([para('', { after: 200 })])] }),
    ],
  });
}

/** Dựng Document đầy đủ từ plan + thông tin giáo viên. */
function buildDocument(plan, teacherInfo) {
  if (!plan || !Array.isArray(plan.sections) || !plan.sections.length) {
    throw new Error('Giáo án không hợp lệ: thiếu sections.');
  }
  const children = [headerInfoTable(teacherInfo), ...titleBlockParagraphs(plan)];
  for (const sec of plan.sections) {
    children.push(para(sec.heading, { bold: true, align: AlignmentType.LEFT }));
    children.push(...blocksToParagraphs(sec.blocks));
  }
  children.push(new Paragraph({ spacing: { before: 480, line: LINE_13, lineRule: 'auto' }, children: [] }));
  children.push(signatureTable(teacherInfo));

  return new Document({
    numbering: {
      config: [
        {
          reference: 'plan-list',
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: {
              top: Math.round(2 * CM),
              bottom: Math.round(2 * CM),
              left: Math.round(3 * CM),
              right: Math.round(2 * CM),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: LINE_13, lineRule: 'auto' },
                children: [
                  run('Trang ', {}),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE }),
                  run(' / ', {}),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

/** Trả về Buffer của file .docx. */
async function exportDocxBuffer(plan, teacherInfo) {
  const doc = buildDocument(plan, teacherInfo);
  return Packer.toBuffer(doc);
}

/** Tên file an toàn từ tiêu đề bài dạy. */
function docxFileName(plan) {
  const raw = s(plan && plan.lessonTitle).normalize('NFC');
  const cleaned = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `Giao-an-5512_${cleaned || 'giao-an'}.docx`;
}

module.exports = { buildDocument, exportDocxBuffer, docxFileName };
