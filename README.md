# Trợ lý soạn giáo án Toán 5512

Ứng dụng web **có máy chủ/backend** hỗ trợ giáo viên Toán THCS (lớp 6–9)
soạn giáo án theo mẫu Công văn 5512/BGDĐT.

- Bộ sách duy nhất: **Kết nối tri thức với cuộc sống** (NXB Giáo dục Việt Nam).
- Danh mục: **283 mục chọn được / 151 bài chính**
  (Lớp 6: 74 mục – 43 bài chính; Lớp 7: 71 – 37; Lớp 8: 75 – 39; Lớp 9: 63 – 32).
- Tên chương dùng số La Mã (Chương I … Chương X).

## Chạy trên máy của thầy/cô

Cần cài sẵn [Node.js](https://nodejs.org) (bản 18 trở lên).

```bash
cd giao-an-5512
npm install
npm start
```

Mở trình duyệt vào: **http://localhost:3000**

Máy chủ chạy ngầm; tắt bằng `Ctrl+C` trong cửa sổ terminal.

## Triển khai trên Vercel

Code đã tương thích Vercel (`api/index.js` + `vercel.json` điều hướng mọi
request về Express app). Đẩy thư mục này lên GitHub rồi Import vào Vercel
(Framework Preset: **Other**, không cần build command).

**Hạn chế cần biết trên Vercel (do serverless):**
- Cài đặt AI (API key) và Thư viện giáo án được lưu vào `/tmp` nên **không
  bền**: có thể mất khi function "nguội" lại hoặc redeploy. Nếu mất key,
  vào lại mục "Cài đặt AI" để nhập lại.
- Function serverless bị giới hạn thời gian chạy: chế độ **Chi tiết**
  (gọi AI 2 luồng song song, có thể ~1 phút) dễ bị ngắt giữa chừng.
  Trên Vercel nên dùng chế độ **Khung nhanh**; muốn dùng Chi tiết ổn định
  thì chạy bản local (`npm start`).
- Lần mở đầu tiên sau khi idle có thể chậm vài giây (cold start).

## Cấu trúc

| File / thư mục | Chức năng |
|---|---|
| `server.js` | Backend Express: phục vụ giao diện + API |
| `catalog.json` | Danh mục 283 mục (dữ liệu đã kiểm chứng từ SGK) |
| `public/` | Giao diện web (HTML/CSS/JS) |
| `data/` | Thư viện giáo án (`library.json`) + cài đặt AI (`settings.json`) |
| `lib/docx.js` | Dựng file Word `.docx` theo mẫu 5512 (A4, Times New Roman 14, lề chuẩn, số trang, khối chữ ký) |

## Cài đặt AI

Vào mục "Cài đặt AI" trên giao diện: nhập **API base URL**, **model** và **API key**
(tương thích OpenAI, ví dụ `https://api.openai.com/v1` + key OpenAI).
Key chỉ lưu trên máy chủ (`data/settings.json`), không bao giờ gửi về trình duyệt.

Ví dụ dùng key miễn phí Google AI Studio (Gemini):
- Base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- Model: `gemini-3.8-flash`
- API key: key tạo tại Google AI Studio.

### Xử lý lỗi thường gặp (mục Cài đặt AI)

- **401 / UNAUTHENTICATED**: Google từ chối key. Copy lại key cho đủ ký tự;
  kiểm tra "API restrictions" của key trong Google Cloud Console; hoặc tạo key mới.
- **404 model no longer available**: Google đã ngừng model đó — đổi ô Model
  sang tên model mới (ví dụ `gemini-3.8-flash`).
- **429**: vượt giới hạn gói miễn phí — đợi 1–2 phút rồi thử lại.
- **503**: Google quá tải tạm thời — app tự thử lại 3 lần; nếu vẫn lỗi thì đợi một lúc.

## API hiện có

- `GET /api/health` – kiểm tra server.
- `GET /api/catalog` – toàn bộ danh mục.
- `GET /api/catalog/check` – tự kiểm tra: đếm 283/151, chương số La Mã.
- `GET /api/settings` – cấu hình AI (key che giấu).
- `POST /api/settings` – lưu base URL / model / key.
- `POST /api/settings/test` – kiểm tra kết nối tới LLM.
- `POST /api/focus-points` – gợi ý trọng tâm bài học (`{item}`).
- `POST /api/generate` – soạn giáo án, trả về SSE
  (`{item, mode: chi-tiet|khung-nhanh|phan-hoa, duration: 1|2, focus[], extra}`).
  Chế độ Chi tiết gọi 2 luồng song song (P1: I+II+HĐ1–2; P2: HĐ3–4+IV) rồi ghép,
  có tự thử lại + rút gọn khi lỗi. Thông tin giáo viên/trường/tổ bị tách bỏ
  trước khi dựng prompt.

- `POST /api/export-docx` – xuất file Word `.docx` từ giáo án đang xem
  (`{plan, teacherInfo}` → tải file về máy).
- `GET /api/library` – danh sách giáo án đã lưu (metadata).
- `POST /api/library` – lưu giáo án mới (`{plan, teacherInfo}`).
- `GET /api/library/:id` – lấy 1 giáo án đầy đủ.
- `PUT /api/library/:id` – cập nhật giáo án đã lưu.
- `DELETE /api/library/:id` – xoá giáo án.
- `POST /api/library/:id/export` – xuất `.docx` từ giáo án trong thư viện.

## Lộ trình

- **Bước 1** (xong): khung ứng dụng + danh mục.
- **Bước 2** (xong): AI soạn giáo án 3 chế độ, gợi ý trọng tâm,
  thời lượng 1–2 tiết, xem trước khổ A4 sửa trực tiếp.
- **Bước 3** (xong, rà soát lại 07/10/2026 cho đúng đặc tả): thư viện lưu trên máy chủ
  (lưu / mở lại / cập nhật / xoá) và xuất Word `.docx` thật: khổ A4,
  Times New Roman 14, giãn dòng 1.3, lề trên/dưới 2cm – trái 3cm – phải 2cm,
  số trang ở chân trang, đầu trang 2 cột (trái "ĐƠN VỊ CẤP TRÊN" + tên trường;
  phải "TỔ CHUYÊN MÔN" + họ tên giáo viên), khối chữ ký "TỔ TRƯỞNG" | "GIÁO VIÊN".
  Đã kiểm thử end-to-end qua API và kiểm chứng trực tiếp cấu trúc OOXML.
