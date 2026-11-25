# Implementation Plan: Nền tảng trình chiếu giảng dạy tương tác có AI hỗ trợ

**Branch**: `001-interactive-ai-lectures` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-interactive-ai-lectures/spec.md`

## Summary

Một ứng dụng web full-stack TypeScript chạy trong một tiến trình Node.js: Next.js (App Router) phục
vụ giao diện và REST API, Socket.IO gắn trên cùng HTTP server phục vụ kênh realtime. SQLite (qua
Prisma) lưu toàn bộ dữ liệu, kể cả trạng thái phiên: bản ghi `Session` trong CSDL là **nguồn trạng
thái duy nhất**. Mọi lệnh điều khiển đi qua một tầng dịch vụ phía server (`SessionService`) thực
hiện: xác thực vai trò → kiểm tra trạng thái → cập nhật CSDL trong transaction, tăng `stateVersion`
→ dựng **snapshot đã lọc theo vai trò** (`projections`) → phát tới từng room vai trò. Client không
bao giờ tự suy ra trạng thái; khi kết nối/kết nối lại luôn nhận snapshot đầy đủ. AI (Google Gemini)
nằm sau interface `AiProvider`, đầu ra được kiểm tra bằng zod, timeout 30 giây, mọi kết quả lưu ở
trạng thái nháp.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js ≥ 20.9 (máy dev hiện có Node 26)

**Primary Dependencies**: Next.js 16 (App Router) + React 19; Socket.IO 4.8 (server + client);
Prisma 7 với `@prisma/adapter-better-sqlite3`; zod 4 (validate input/AI output); `@google/genai`
(Gemini); `bcryptjs` (băm mật khẩu); `qrcode` (QR dạng SVG/data URL); `jszip` + `fast-xml-parser`
(đọc .pptx); Tailwind CSS 4 (giao diện); `tsx` (chạy custom server khi dev)

**Storage**: SQLite (file `prisma/dev.db`), migration bằng Prisma

**Testing**: Vitest (unit + integration: service, API route handler, Socket.IO với
`socket.io-client` thật trên server test), Testing Library cho component, Playwright cho E2E đa
browser context (giảng viên, máy chiếu, 2 sinh viên). AI được mock trong test bằng `FakeAiProvider`.

**Target Platform**: Trình duyệt hiện đại trên laptop/điện thoại; server Node chạy trên laptop
(localhost, có thể bind `0.0.0.0` để vào qua LAN)

**Project Type**: Web application, một project (Next.js + custom server)

**Performance Goals**: Đổi slide tới mọi client ≤ 2 giây (thực tế < 200 ms trên localhost);
một phiên 60 người tham gia

**Constraints**: Không lộ ghi chú/slide chưa công bố/đáp án trước khi công bố; một tiến trình server
(không cần Redis/adapter); AI timeout 30 giây; .pptx ≤ 20 MB; bí mật chỉ trong `.env`

**Scale/Scope**: ~15 màn hình, ~10 entity, vài giảng viên, ≤ 60 người/phiên

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Cách plan đáp ứng | Kết quả |
|---|---|---|
| I. Quyền phía server | Mọi REST route và socket handler gọi `requireLecturer`/`requireSessionOwner`/`requireParticipant`; dữ liệu gửi đi chỉ qua `projections.ts` (projector/student/lecturer). Test gọi trực tiếp API/socket bằng vai trò sinh viên. | PASS |
| II. Nguồn trạng thái duy nhất | Trạng thái phiên chỉ ở bảng `Session` (+ `QuizRun`); `stateVersion` tăng mỗi lần đổi; `session:join` luôn trả snapshot; client chỉ render snapshot. | PASS |
| III. AI chỉ soạn nháp | `AiProvider` → zod schema → lưu `isAiDraft=true` / `status=DRAFT`; mở quiz yêu cầu `APPROVED`; lưu `sourceSlideIds`. | PASS |
| IV. Test bắt buộc | Vitest cho service/route/socket; ràng buộc unique `(quizRunId, participantId)` ở CSDL; Playwright TicketBox. | PASS |
| V. Phạm vi MVP | 3 mẫu slide, một nhà cung cấp AI, không cộng tác, không ảnh. | PASS |
| VI. Ổn định contract | `contracts/rest-api.md` + `contracts/realtime-events.md` là nguồn; payload định nghĩa bằng zod trong `src/shared/contracts/` dùng chung FE/BE. | PASS |
| VII. Bí mật trong env | `AI_API_KEY`, `AI_MODEL`, `SESSION_SECRET` chỉ đọc ở server (`src/server/env.ts`); `.env.example` chỉ tên biến. | PASS |

Re-check sau Phase 1: PASS (không có vi phạm cần ghi Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/001-interactive-ai-lectures/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md
│   └── realtime-events.md
└── tasks.md             # tạo bởi /speckit-tasks
docs/architecture/adr/   # ADR-001 đồng bộ, ADR-002 quyền người xem, ADR-003 AI
```

### Source Code (repository root)

```text
server.ts                      # custom server: Next handler + Socket.IO trên cùng http server
prisma/
├── schema.prisma
├── migrations/
└── seed.ts                    # kịch bản TicketBox
prisma.config.ts
src/
├── app/                       # Next.js App Router (UI + REST route handlers)
│   ├── (auth)/login, register
│   ├── lectures/              # danh sách, /[id]/edit (soạn thảo, AI, duyệt quiz, nhập PPTX)
│   ├── present/[sessionId]/   # bảng điều khiển giảng viên
│   ├── projector/[code]/      # màn hình máy chiếu
│   ├── join/[code]/           # sinh viên
│   ├── sessions/[id]/report/  # báo cáo sau buổi
│   └── api/                   # REST: auth, lectures, slides, questions, ai, import, sessions
├── server/
│   ├── env.ts                 # đọc & validate biến môi trường
│   ├── db.ts                  # Prisma client
│   ├── auth/                  # password, lecturer session cookie, participant/projector token
│   ├── services/              # lecture, slide, question, session (state machine), quiz, feedback, report
│   ├── realtime/              # io setup, handshake auth, rooms, broadcast
│   ├── projections.ts         # lọc dữ liệu theo vai trò (điểm kiểm tra quyền duy nhất cho output)
│   ├── ai/                    # AiProvider, GeminiProvider, FakeAiProvider, prompts, schemas
│   └── pptx/                  # trích xuất .pptx
├── shared/
│   └── contracts/             # zod schema + type cho REST payload và sự kiện realtime
├── client/
│   ├── realtime/              # useSessionSocket: kết nối, reconnect, áp snapshot theo stateVersion
│   └── components/            # SlideView, QuizChart, ConnectionBanner, QR...
tests/
├── unit/
├── integration/               # service + route + socket (server thật trên cổng ngẫu nhiên)
└── e2e/                       # Playwright: TicketBox, quyền, reconnect
```

**Structure Decision**: Một project Next.js với custom server để REST và Socket.IO dùng chung
tiến trình, chung Prisma client và chung `SessionService`. Điều này giữ "nguồn trạng thái duy nhất"
đơn giản (không cần đồng bộ giữa hai server) và dễ giải thích trong báo cáo. Tầng `src/server/`
không phụ thuộc React; tầng `src/shared/contracts/` là hợp đồng FE/BE.

## Kiến trúc cốt lõi (tóm tắt cho ADR)

### Đồng bộ ba giao diện (ADR-001)

1. Lệnh điều khiển (`slide:goto`, `quiz:open`…) gửi qua socket có ack; server xử lý tuần tự theo
   phiên (hàng đợi promise theo `sessionId`) để nhiều cửa sổ giảng viên không ghi đè lẫn nhau.
2. `SessionService` cập nhật CSDL trong transaction, tăng `stateVersion`.
3. `broadcastSession(sessionId)` dựng 3 projection và phát `session:state` tới room
   `s:{id}:lecturer`, `s:{id}:projector`, `s:{id}:student`; dữ liệu riêng từng sinh viên (đáp án đã
   nộp, biểu cảm của mình) đi kèm trong projection theo socket (room `p:{participantId}`).
4. Client giữ `stateVersion` cuối; bỏ qua bản cũ; khi `connect`/`reconnect` gửi `session:join` và
   thay toàn bộ state bằng snapshot nhận được. Không có "replay sự kiện".
5. Sự kiện tần suất cao (số người đã nộp, biểu cảm, câu hỏi mới) chỉ gửi tới room giảng viên dưới
   dạng snapshot rút gọn, gộp (throttle 250 ms).

### Kiểm tra quyền người xem (ADR-002)

- Giảng viên: cookie phiên đăng nhập httpOnly (token ngẫu nhiên, băm lưu trong `AuthSession`).
- Sinh viên: `POST /api/sessions/join` trả `participantToken` ngẫu nhiên (lưu localStorage theo mã
  phiên, server lưu băm). Máy chiếu: `projectorToken` riêng của phiên, chỉ giảng viên chủ phiên lấy
  được (nút "Mở màn hình chiếu").
- Socket handshake mang token; middleware gán `socket.data.role` + id; mỗi handler kiểm tra role.
- REST lấy slide cho sinh viên: `GET /api/s/{code}/slides/{index}` kiểm tra `index ≤ maxPublishedIndex`.
- `projections.ts` là nơi DUY NHẤT dựng dữ liệu gửi cho vai trò không phải giảng viên; có unit test
  khẳng định không có trường `notes`, `outline`, `correctIndex`, `explanation` (trước công bố).

## Complexity Tracking

Không có vi phạm constitution.
