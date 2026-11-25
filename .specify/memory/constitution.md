<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Principles added: I. Server-side authorization; II. Single source of truth for session state;
  III. Lecturer decides, AI drafts; IV. Tests are mandatory; V. MVP scope discipline;
  VI. Contract stability; VII. Secrets stay in the environment
- Sections added: Fixed decisions & constraints; Development workflow & quality gates; Governance
- Deferred TODOs: none
-->

# Constitution: Nền tảng trình chiếu giảng dạy tương tác có AI

## Core Principles

### I. Kiểm tra quyền và lọc dữ liệu phía server (NON-NEGOTIABLE)

- Mọi quyết định về quyền MUST được thực hiện ở server, theo vai trò (giảng viên, máy chiếu,
  sinh viên) và theo trạng thái phiên. Ẩn ở giao diện không bao giờ được coi là cơ chế bảo vệ.
- Dữ liệu MUST được lọc TRƯỚC khi gửi xuống client: thiết bị sinh viên và máy chiếu không bao giờ
  nhận ghi chú riêng, slide có chỉ số lớn hơn slide cao nhất đã công bố, đáp án đúng/giải thích
  của quiz chưa công bố kết quả, hay câu hỏi sinh viên chưa được duyệt chiếu công khai.
- Mọi lệnh điều khiển (đổi slide, mở/đóng quiz, công bố kết quả, duyệt câu hỏi, kết thúc phiên)
  MUST chỉ được chấp nhận từ giảng viên đã xác thực và là chủ phiên.

Lý do: đây là một trong hai quyết định kiến trúc mà báo cáo môn học phải chứng minh.

### II. Nguồn trạng thái duy nhất của phiên

- Trạng thái phiên (slide hiện tại, slide cao nhất đã công bố, trạng thái quiz, trạng thái phiên)
  MUST chỉ có một nguồn sự thật ở server. Client chỉ hiển thị trạng thái server gửi.
- Khi kết nối (lần đầu, vào muộn, hoặc kết nối lại), client MUST nhận snapshot trạng thái hiện
  tại đã được lọc theo vai trò, không phụ thuộc vào việc đã nhận đủ các sự kiện trước đó.
- Thay đổi trạng thái MUST được đẩy theo thời gian thực tới mọi client của phiên, không cần
  tải lại trang.

Lý do: quyết định kiến trúc thứ hai của báo cáo; tránh lệch trạng thái giữa ba giao diện.

### III. Giảng viên quyết định, AI chỉ soạn nháp

- Mọi nội dung do AI tạo (slide, ghi chú, quiz) MUST được lưu ở trạng thái "nháp" cho tới khi
  giảng viên duyệt. Câu hỏi quiz chưa duyệt MUST không thể mở trong phiên.
- Mỗi câu hỏi do AI tạo MUST lưu slide căn cứ và hiển thị nó khi duyệt.
- Đầu ra AI MUST được kiểm tra theo schema; lỗi, timeout hoặc sai định dạng MUST trả về lỗi rõ
  ràng và không làm hỏng dữ liệu đang có.

### IV. Test là bắt buộc

- Mọi tính năng MUST có test tự động phù hợp (unit/integration) trước khi được coi là xong.
- Các quy tắc quyền và quy tắc quiz (1 lượt nộp/câu, không nhận bài sau khi đóng) MUST có test
  gọi trực tiếp API/kênh realtime với vai trò sinh viên, không chỉ qua giao diện.
- Luồng demo TicketBox MUST có test E2E đa ngữ cảnh trình duyệt (giảng viên, máy chiếu,
  ≥ 2 sinh viên).
- Ràng buộc nghiệp vụ quan trọng (1 lượt nộp/người/câu) MUST được bảo đảm ở tầng CSDL.

### V. Giữ đúng phạm vi MVP

- Chỉ 3 mẫu slide: tiêu đề, nội dung, quiz. Ưu tiên luồng trình chiếu và tương tác trước mọi
  tính năng trang trí.
- KHÔNG làm: chỉnh sửa cộng tác nhiều người, giữ hiệu ứng/bố cục PowerPoint, nhiều nhà cung
  cấp AI, ứng dụng di động native.
- Mọi đề xuất ngoài phạm vi MUST được PO ghi vào backlog, không đưa vào mã.

### VI. Ổn định hợp đồng (contract)

- API REST và sự kiện realtime MUST được mô tả trong `specs/*/contracts/` trước khi cài đặt.
- Không thay đổi contract, yêu cầu hay thiết kế khi chưa cập nhật tài liệu nguồn (spec/plan/
  contracts) và được PO xác nhận. Thiếu hoặc mâu thuẫn phát hiện khi code: dừng, cập nhật
  spec/plan, rồi mới sửa mã.

### VII. Bí mật chỉ nằm trong biến môi trường

- Khóa AI và các bí mật khác MUST chỉ đọc từ biến môi trường (`.env`), không commit, không ghi
  log, không gửi xuống client. Repo chỉ chứa `.env.example` với tên biến.

## Quyết định đã chốt và ràng buộc

Đã chốt với người dùng (PO) ngày 2026-11-25:

- Nhà cung cấp AI duy nhất: Google Gemini (model theo biến `AI_MODEL`, hiện là
  `gemini-3.1-flash-lite` vì các bản 2.5 đã ngừng cho người dùng mới và bản flash lớn hay quá tải; khóa trong `AI_API_KEY`), gọi qua một lớp trừu tượng riêng.
- Stack: Next.js (TypeScript) + Node.js, Socket.IO cho realtime, SQLite qua Prisma; một dự án
  duy nhất chạy chung một tiến trình server.
- Sinh viên tham gia ẩn danh, có tên hiển thị tùy chọn, không cần tài khoản. Danh tính người
  tham gia gắn với ngữ cảnh trình duyệt (token tham gia theo phiên).
- Môi trường demo: localhost trên một laptop, chia sẻ màn hình; giảng viên, máy chiếu và
  ≥ 2 sinh viên chạy trong các trình duyệt/cửa sổ ẩn danh riêng (sinh viên giả lập di động qua
  DevTools). Cấu hình host/URL công khai MUST cho phép chạy qua mạng LAN khi cần.
- Giao diện tiếng Việt.
- Giảng viên đăng nhập bằng email + mật khẩu (mật khẩu băm), không dùng OAuth.
- Tệp .pptx tối đa 20 MB; chỉ trích xuất tiêu đề, văn bản và ghi chú.

## Quy trình phát triển và cổng chất lượng

- Quy trình Spec Kit: constitution → specify → clarify → plan → tasks → analyze → implement.
  Mã chỉ được viết dựa trên spec/plan/tasks đã có.
- Thứ tự module: xác thực → bài giảng/slide → phiên + đồng bộ → quiz → câu hỏi/biểu cảm →
  AI → nhập PPTX.
- Sau mỗi module: chạy test, chạy thật ứng dụng (skill `run`) và commit git.
- Definition of Done theo mục 9 của `docs/prompt.txt`: có user story và acceptance criteria,
  FE/BE tích hợp có test, đã kiểm tra quyền phía server và trạng thái lỗi, không còn lỗi
  Critical/High, 4 tiêu chí demo chạy đúng, tài liệu (spec, plan, ADR, README) đã cập nhật.
- Mỗi lần bàn giao giữa các vai trò ghi rõ: công việc/trạng thái, đầu vào/đầu ra, file liên
  quan, quyết định/giả định/rủi ro, người nhận và hành động tiếp theo.

## Governance

- Constitution này có hiệu lực cao hơn mọi hướng dẫn khác trong dự án; agent trong
  `.claude/agents/` MUST tuân theo.
- Sửa đổi MUST được PO (người dùng) chấp thuận, ghi Sync Impact Report và tăng phiên bản theo
  semver (MAJOR: bỏ/định nghĩa lại nguyên tắc; MINOR: thêm nguyên tắc/mở rộng đáng kể; PATCH:
  làm rõ câu chữ).
- `/speckit-analyze` và review code MUST kiểm tra tuân thủ, đặc biệt nguyên tắc I và II.

**Version**: 1.0.0 | **Ratified**: 2026-11-25 | **Last Amended**: 2026-11-25
