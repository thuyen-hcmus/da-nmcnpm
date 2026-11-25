# ADR-001: Đồng bộ bộ ba giao diện bằng một nguồn trạng thái duy nhất ở server

- **Trạng thái**: Chấp nhận
- **Ngày**: 2026-11-25
- **Liên quan**: FR-041 → FR-044, constitution nguyên tắc II, `src/server/services/session-service.ts`,
  `src/server/realtime/index.ts`, `src/client/realtime/useSessionSocket.ts`

## Bối cảnh

Một phiên học có ba loại màn hình: laptop giảng viên, máy chiếu, điện thoại sinh viên. Khi giảng
viên chuyển slide, mở/đóng quiz hay công bố kết quả, mọi màn hình phải thấy cùng một trạng thái mà
không tải lại trang. Sinh viên có thể vào muộn, mất Wi-Fi, tải lại trang; giảng viên có thể mở
nhiều cửa sổ cùng phiên.

## Quyết định

1. **Kênh thời gian thực: Socket.IO** (WebSocket, tự fallback long-polling) chạy trên **cùng HTTP
   server** với Next.js (`server.ts`), dùng chung Prisma client và tầng dịch vụ.
2. **Nguồn trạng thái duy nhất: bảng `Session` trong CSDL** (`currentIndex`, `maxPublishedIndex`,
   `showJoinQr`, `spotlightQuestionId`, `status`) cùng bảng `QuizRun`. Mỗi thay đổi tăng
   `stateVersion`. Client không bao giờ tự suy ra trạng thái.
3. **Luồng một lệnh** (ví dụ đổi slide):

   ```
   Giảng viên ──slide:goto{index}──▶ handler (kiểm tra vai trò)
        │                               │
        │                       withSessionLock(sessionId)   ← xử lý tuần tự theo phiên
        │                               │
        │                     SessionService.gotoSlide: UPDATE Session, stateVersion+1
        │                               │
        │                     sessionBus.emit("state", id)
        │                               │
        ◀──ack{ok,v}──────────  broadcastState: loadSessionView → 3 projection
                                        ├─▶ room s:{id}:lecturer   (đủ dữ liệu)
                                        ├─▶ room s:{id}:projector  (công khai)
                                        └─▶ từng socket sinh viên   (công khai + "của tôi")
   ```

4. **Snapshot thay vì sự kiện gia tăng**: server luôn gửi `session:state` đầy đủ (đã lọc theo vai
   trò). Một phiên chỉ vài chục slide văn bản nên snapshot nhỏ; đổi lại, client không bao giờ lệch
   do lỡ một sự kiện.
5. **Kết nối lại / vào muộn**: ngay khi socket kết nối (lần đầu hoặc sau khi rớt mạng), server đẩy
   snapshot hiện tại; client còn gọi `session:join` để chắc chắn. Snapshot có `v` nhỏ hơn bản đang
   giữ bị bỏ qua. Không cần "replay" sự kiện.
6. **Dữ liệu tần suất cao** (số người đã nộp, biểu cảm, câu hỏi mới) chỉ gửi cho giảng viên dưới
   dạng `session:delta:lecturer`, gộp mỗi 250 ms, không làm tăng `stateVersion`.

## Hệ quả

- Khởi động lại server không mất trạng thái phiên (nằm trong SQLite).
- Nhiều cửa sổ giảng viên cùng phiên luôn thống nhất; lệnh xử lý theo thứ tự server nhận.
- Giới hạn: khóa theo phiên nằm trong bộ nhớ một tiến trình. Muốn chạy nhiều tiến trình phải thêm
  Redis adapter + khóa phân tán (ngoài phạm vi đồ án).

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| SSE + REST | Một chiều; phải tự làm reconnect, room, ack cho lệnh của sinh viên |
| Dịch vụ realtime cloud (Pusher, Ably, Firebase) | Cần Internet và khóa riêng; trạng thái nằm ngoài hệ thống, khó giải thích "nguồn sự thật" |
| Gửi sự kiện gia tăng (delta) cho mọi client | Client lỡ một sự kiện là lệch; cần cơ chế replay phức tạp |
| Trạng thái chỉ trong RAM | Mất khi restart, khó kiểm thử |

## Kiểm chứng

- `tests/integration/realtime-sync.test.ts`: đổi slide < 2 s tới máy chiếu và 2 sinh viên; vào muộn;
  ngắt rồi nối lại; `stateVersion` tăng đơn điệu; 2 cửa sổ giảng viên.
- `tests/e2e/ticketbox.spec.ts`: bật chế độ offline cho một sinh viên, giảng viên chuyển slide, bật
  lại mạng → sinh viên tự về đúng slide.
