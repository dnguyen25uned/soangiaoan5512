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
  });
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
      out.push(para(b.text, { bold: true, align: AlignmentType.LEFT }));
    } else if (b.type === 'ul' || b.type === 'ol') {
      const items = Array.isArray(b.items) ? b.items : [];
      for (const it of items) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: LINE_13, lineRule: 'auto', after: 80 },
            bullet: b.type === 'ul' ? { level: 0 } : undefined,
            numbering: b.type === 'ol' ? { reference: 'plan-list', level: 0 } : undefined,
            children: [run(it)],
          })
        );
      }
    } else {
      out.push(para(b.text));
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
