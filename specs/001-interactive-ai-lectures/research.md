# Research: Nền tảng trình chiếu giảng dạy tương tác có AI

## R1. Kênh realtime

- **Decision**: Socket.IO 4.8 gắn vào cùng HTTP server với Next.js (custom `server.ts`).
- **Rationale**: Hai chiều (sinh viên cũng gửi nộp bài, biểu cảm), có sẵn tự kết nối lại, room,
  ack, middleware handshake để xác thực; chạy được trên localhost/LAN không cần dịch vụ ngoài.
- **Alternatives**: SSE + REST (một chiều, phải tự làm reconnect/room; vẫn khả thi nhưng nhiều mã
  hơn); dịch vụ realtime cloud (Pusher/Ably: cần Internet, thêm khóa, khó giải thích "nguồn trạng
  thái"); WebSocket thô `ws` (phải tự làm reconnect, room, ack).

## R2. Nguồn trạng thái duy nhất và kết nối lại

- **Decision**: Trạng thái phiên lưu trong CSDL (`Session`, `QuizRun`), có `stateVersion` tăng đơn
  điệu. Mỗi thay đổi → phát snapshot đầy đủ đã lọc theo vai trò. Khi `connect` (lần đầu/vào
  muộn/reconnect) client gửi `session:join` và nhận snapshot. Lệnh của một phiên xử lý tuần tự
  (khóa theo `sessionId` trong tiến trình).
- **Rationale**: Snapshot nhỏ (một phiên ≤ 50 slide văn bản), nên gửi lại toàn bộ đơn giản và
  luôn đúng; không cần lưu log sự kiện để replay. Khởi động lại server không mất trạng thái.
- **Alternatives**: Event sourcing/replay (phức tạp, không cần); trạng thái chỉ trong RAM (mất khi
  restart, khó kiểm thử).

## R3. Xác thực và token

- **Decision**: Giảng viên: email + mật khẩu (bcryptjs, cost 10), cookie `sid` httpOnly, SameSite=Lax,
  token ngẫu nhiên 32 byte, băm SHA-256 lưu bảng `AuthSession` (hết hạn 7 ngày). Sinh viên:
  `participantToken` 32 byte lưu localStorage theo khóa `ptk:{code}` (vì vậy cửa sổ ẩn danh/trình
  duyệt khác là người khác). Máy chiếu: `projectorToken` 32 byte của phiên, đưa vào URL máy chiếu
  `/projector/{code}#t=...` do giảng viên mở.
- **Rationale**: Đơn giản, không phụ thuộc thư viện auth; token băm trong CSDL nên lộ CSDL không lộ
  token; dễ thu hồi.
- **Alternatives**: NextAuth/Auth.js (nặng cho email+mật khẩu); JWT không trạng thái (khó thu hồi).

## R4. Nhà cung cấp AI

- **Decision**: Google Gemini qua SDK `@google/genai`, model từ `AI_MODEL` (mặc định
  `gemini-3.1-flash-lite`; bản 2.5 đã ngừng cho người dùng mới, bản 3.x flash hay 503 khi quá tải), thinkingLevel LOW, yêu cầu JSON bằng `responseMimeType: "application/json"` + `responseSchema`,
  sau đó validate lại bằng zod. Timeout 30 giây (AbortController), retry tối đa 2 lần có backoff khi lỗi mạng/5xx (không retry lỗi 4xx),
  không retry khi sai schema (báo lỗi định dạng). Interface `AiProvider { generateSlides,
  splitText, condense, suggestNotes, rewriteSlide, generateQuiz }`; `FakeAiProvider` dùng cho test
  và khi `AI_PROVIDER=fake` (demo dự phòng khi mất Internet).
- **Rationale**: Khóa đã có trong `.env`; flash nhanh, đủ cho tiếng Việt; JSON mode giảm lỗi định dạng.
- **Alternatives**: Gọi REST trực tiếp (phải tự xử lý định dạng); nhiều provider (ngoài phạm vi).

## R5. Nhập .pptx

- **Decision**: Kiểm tra kích thước (≤ 20 MB) trước khi đọc; mở bằng `jszip`; đọc
  `ppt/presentation.xml` + `_rels` để lấy thứ tự slide; với mỗi `ppt/slides/slideN.xml` dùng
  `fast-xml-parser` lấy text các shape (`a:t`), shape có placeholder `title`/`ctrTitle` làm tiêu đề;
  ghi chú từ `ppt/notesSlides/`. Lỗi zip/XML → `PPTX_INVALID`. Toàn bộ slide tạo trong một transaction.
- **Rationale**: Không cần LibreOffice; chỉ cần văn bản theo spec.
- **Alternatives**: `pptx2json`/`officeparser` (ít kiểm soát thứ tự, phụ thuộc thêm).

## R6. Mô hình quiz trong phiên

- **Decision**: `QuizQuestion` thuộc bài giảng (trạng thái DRAFT/APPROVED). Khi giảng viên mở quiz
  trong phiên, tạo `QuizRun` chép nội dung câu hỏi (bất biến cho phiên), trạng thái OPEN → CLOSED →
  PUBLISHED. Ràng buộc unique `(quizRunId, participantId)` trên `Answer`. Tối đa 1 `QuizRun` OPEN mỗi
  phiên (kiểm tra trong `SessionService` dưới khóa phiên).
- **Rationale**: Cho phép giảng viên tạo và duyệt câu mới ngay trong buổi (kịch bản TicketBox bước 4)
  mà vẫn giữ kết quả phiên ổn định; ràng buộc CSDL chống nộp trùng đồng thời.

## R7. Bản chụp bài giảng

- **Decision**: Tạo phiên chép slide vào `SessionSlide` (không chép ghi chú vào phần dữ liệu công khai;
  ghi chú vẫn lưu trong `SessionSlide.notes` chỉ projection giảng viên đọc).
- **Rationale**: Chỉ số slide ổn định trong phiên; sửa bài giảng không làm lệch `maxPublishedIndex`.

## R8. Kiểm thử

- **Decision**: Vitest với SQLite file tạm cho mỗi worker; socket test khởi động server thật trên
  cổng ngẫu nhiên và dùng `socket.io-client`; Playwright với 4 browser context, `FakeAiProvider`.
- **Rationale**: Kiểm thử trực tiếp API/socket bằng vai trò sinh viên là yêu cầu bắt buộc (QA mục 5.6).

## R9. Giao diện

- **Decision**: Tailwind CSS 4, component tự viết, biểu đồ quiz bằng SVG/CSS tự vẽ (bar chart ngang),
  chữ tiếng Việt, font hệ thống. Màn hình chiếu 16:9, cỡ chữ tối thiểu 32px.
- **Rationale**: Ít phụ thuộc, kiểm soát được tương phản; biểu đồ đơn giản không cần thư viện.
