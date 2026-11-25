# ADR-002: Kiểm tra quyền người xem ở server, theo vai trò và theo slide đã công bố

- **Trạng thái**: Chấp nhận
- **Ngày**: 2026-11-25
- **Liên quan**: FR-003 → FR-005, FR-035, FR-045, constitution nguyên tắc I,
  `src/server/projections.ts`, `src/server/services/actor.ts`, `src/server/realtime/index.ts`

## Bối cảnh

Sinh viên dùng thiết bị của chính mình, có thể mở DevTools, sửa link, gọi thẳng API hay WebSocket.
Nếu server gửi ghi chú riêng hoặc slide chưa chiếu xuống rồi giao diện "ẩn đi", sinh viên vẫn đọc
được. Quyền phải được quyết định ở server.

## Quyết định

Quyền được kiểm tra ở **ba lớp**, tất cả phía server:

1. **Xác thực khi kết nối (handshake)** – gán vai trò cho socket:
   | Vai trò | Bằng chứng | Kiểm tra |
   |---|---|---|
   | Giảng viên | cookie `sid` httpOnly (token băm trong `AuthSession`) | user phải là `Session.ownerId` |
   | Máy chiếu | `projectorToken` = HMAC(SESSION_SECRET, sessionId), chỉ có trong link giảng viên mở | so khớp HMAC |
   | Sinh viên | `participantToken` ngẫu nhiên khi vào phiên (lưu băm) | Participant thuộc đúng phiên |

2. **Kiểm tra lệnh (đầu vào)** – bảng quyền tập trung `COMMAND_ROLES` trong `actor.ts`; mọi handler
   gọi `assertCanRun(actor, command)` trước khi làm gì. Tầng dịch vụ kiểm tra lại chủ phiên và
   trạng thái (phiên LIVE, quiz OPEN…). Ví dụ: `slide:goto`, `quiz:*`, `question:update`,
   `session:end` chỉ dành cho giảng viên chủ phiên; `quiz:answer`, `question:ask`, `reaction:set`
   chỉ dành cho sinh viên.

3. **Lọc dữ liệu (đầu ra)** – `projections.ts` là nơi DUY NHẤT dựng dữ liệu gửi cho máy chiếu và
   sinh viên:
   - chỉ slide có `index ≤ maxPublishedIndex` (giá trị không bao giờ giảm);
   - không bao giờ có `notes`, `outline`;
   - quiz chưa công bố: không có `correctIndex`, `explanation`, số liệu lựa chọn;
   - câu hỏi sinh viên: chỉ câu được giảng viên "chiếu" mới tới máy chiếu, không tới sinh viên khác.
   REST `GET /api/s/{code}/slides/{index}` áp cùng quy tắc (403 nếu chưa công bố).

```
Thiết bị sinh viên ──token──▶ [1] handshake: role=student, participantId
        │
        ├─ quiz:open ─────────▶ [2] assertCanRun → FORBIDDEN (không chạm CSDL)
        │
        └─ nhận dữ liệu ◀───── [3] toStudentState(view): lọc slide ≤ maxPublished, bỏ notes/đáp án
```

## Hệ quả

- Sửa giao diện hay gọi API thủ công không lấy được dữ liệu bị cấm vì dữ liệu đó không bao giờ rời
  server.
- Thêm trường mới vào slide/quiz phải cân nhắc trong `projections.ts`; unit test duyệt sâu payload sẽ
  báo nếu khóa cấm lọt ra.
- Token sinh viên nằm trong localStorage theo mã phiên: cửa sổ ẩn danh/trình duyệt khác là người khác
  (phù hợp demo một laptop nhiều trình duyệt).

## Kiểm chứng

- `tests/integration/permissions.test.ts`: sinh viên và máy chiếu gửi 8 lệnh điều khiển → `FORBIDDEN`,
  trạng thái không đổi; giảng viên khác bị từ chối; token sai; payload không chứa khóa/chuỗi bí mật;
  REST 403 cho slide chưa công bố.
- `npm run demo:attack -- <MÃ>`: script demo gọi thẳng server với vai trò sinh viên, in ra từng thao
  tác bị từ chối (dùng khi trình bày).
