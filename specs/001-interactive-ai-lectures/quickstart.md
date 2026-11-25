# Quickstart & Validation Guide

## Chuẩn bị

1. Node.js ≥ 20.9.
2. `cp .env.example .env` rồi điền `AI_API_KEY`, `AI_MODEL=gemini-3.1-flash-lite`, `SESSION_SECRET`.
   Đặt `AI_PROVIDER=fake` để chạy không cần Internet/AI.
3. `npm install`
4. `npm run db:reset` (migrate + seed TicketBox: giảng viên `gv@demo.local`, mật khẩu ghi trong `prisma/seed.ts`).
5. `npm run dev` → http://localhost:3000 (đặt `HOST=0.0.0.0 PUBLIC_URL=http://<ip-lan>:3000` để vào qua LAN).

## Kiểm thử tự động

- `npm test` — unit + integration (gồm test quyền gọi trực tiếp API/socket bằng vai trò sinh viên).
- `npm run test:e2e` — Playwright: 4 browser context chạy kịch bản TicketBox.

## Demo thủ công (một laptop, chia sẻ màn hình)

| Cửa sổ | Cách mở |
|---|---|
| Giảng viên | Chrome thường, đăng nhập, mở bài TicketBox → "Bắt đầu trình chiếu" |
| Máy chiếu | Nút "Mở màn hình chiếu" trên bảng điều khiển (cửa sổ mới, F11) |
| Sinh viên 1 | Cửa sổ ẩn danh Chrome, mở link tham gia, DevTools → giả lập iPhone |
| Sinh viên 2 | Trình duyệt khác (Edge/Firefox/Safari) hoặc hồ sơ Chrome khác |

Hai tab trong cùng một cửa sổ/hồ sơ là **cùng một sinh viên**.

## Kịch bản kiểm chứng 4 tiêu chí

1. **Đồng bộ**: chuyển slide 1 → 4; máy chiếu và 2 sinh viên cập nhật không tải lại. Sinh viên 1 xem
   slide 2, bấm "Về bài giảng" → slide 4; không có nút/slide 5. Tắt mạng sinh viên 2 (DevTools →
   Offline), chuyển sang slide 5, bật lại → sinh viên 2 tự về slide 5.
2. **Tách quyền**: sinh viên không thấy ghi chú; chạy `npm run demo:attack` (script gọi socket với
   participant token thử `slide:goto`, `quiz:open`, lấy slide 6) → tất cả bị từ chối.
3. **Phản hồi**: mở quiz slide 4; 2 sinh viên nộp; nộp lại → "đã nộp"; đóng quiz; nộp → "quiz đã
   đóng"; giảng viên thấy phân bố, máy chiếu chưa thấy; "Công bố kết quả" → biểu đồ trên máy chiếu.
   Gửi câu hỏi và biểu cảm → chỉ giảng viên thấy; "Chiếu cho cả lớp" → hiện trên máy chiếu.
4. **AI**: tạo bài mới từ ý tưởng TicketBox (6 slide) → sửa slide 4 → chọn slide 4 "Tạo quiz" →
   sửa đáp án → Duyệt → mở trong phiên mới.
