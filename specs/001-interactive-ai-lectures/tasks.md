# Tasks: Nền tảng trình chiếu giảng dạy tương tác có AI hỗ trợ

**Input**: Design documents from `/specs/001-interactive-ai-lectures/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Bắt buộc (constitution IV). Test quyền gọi trực tiếp API/socket.

## Trạng thái (2026-11-26)

- Xong: T001–T059 trừ T003 (ESLint chưa cấu hình) và T010 (băm mật khẩu được kiểm qua test tích hợp).
- T060: đã viết `tests/e2e/ticketbox.spec.ts`, chưa chạy vì máy chưa có Chromium cho Playwright.
- T061/T062: ADR-001..003 và README đã có; `docs/architecture/overview.md` gộp vào ADR.
- Còn lại: T063 (rà responsive), T064 (security-review, code-review), T065 (tài liệu QA/UAT).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (khác file, không phụ thuộc task chưa xong)
- **[Story]**: US1…US7 theo spec.md

---

## Phase 1: Setup

- [x] T001 Khởi tạo project Next.js 16 + TypeScript 5.9 + Tailwind 4 ở thư mục gốc (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx` với `lang="vi"`)
- [x] T002 Thêm phụ thuộc: socket.io, socket.io-client, prisma, @prisma/client, @prisma/adapter-better-sqlite3, zod, @google/genai, bcryptjs, qrcode, jszip, fast-xml-parser, tsx; dev: vitest, @testing-library/react, jsdom, @playwright/test
- [ ] T003 [P] Cấu hình ESLint/Prettier và scripts `dev`, `build`, `start`, `test`, `test:e2e`, `db:reset`, `demo:attack` trong `package.json`
- [x] T004 [P] Tạo `.env.example` (AI_PROVIDER, AI_API_KEY, AI_MODEL, SESSION_SECRET, HOST, PORT, PUBLIC_URL, DATABASE_URL) và `src/server/env.ts` validate bằng zod (không log giá trị bí mật)
- [x] T005 Tạo custom server `server.ts`: Next request handler + Socket.IO namespace `/live` trên cùng http server, bind `HOST`/`PORT`
- [x] T006 [P] Cấu hình Vitest (`vitest.config.ts`, DB SQLite tạm theo worker trong `tests/setup/db.ts`) và Playwright (`playwright.config.ts`, `AI_PROVIDER=fake`)

## Phase 2: Foundational (chặn mọi user story)

- [x] T007 Viết `prisma/schema.prisma` đủ entity theo data-model.md (User, AuthSession, Lecture, Slide, QuizQuestion, Session, SessionSlide, QuizRun, Participant, Answer, StudentQuestion, Reaction), gồm unique `Answer(quizRunId, participantId)`, `Reaction(participantId, slideIndex)`, `Slide(lectureId, position)`, `Session.code`; tạo migration đầu và `src/server/db.ts`
- [x] T008 [P] Định nghĩa contract dùng chung trong `src/shared/contracts/` (zod schema: lỗi, REST payload, `session:state` theo vai trò, payload lệnh socket) theo contracts/rest-api.md và contracts/realtime-events.md
- [x] T009 [P] Tiện ích lỗi và route wrapper `src/server/http.ts` (map AppError → mã lỗi/HTTP theo contract, log không chứa bí mật)
- [ ] T010 [P] Unit test băm mật khẩu và token trong `tests/unit/auth.test.ts`
- [x] T011 Auth giảng viên: `src/server/auth/password.ts`, `src/server/auth/lecturer-session.ts` (cookie `sid` httpOnly, token băm trong AuthSession, hết hạn 7 ngày), guard `requireLecturer`, `requireOwner`
- [x] T012 REST auth: `src/app/api/auth/{register,login,logout,me}/route.ts` + integration test `tests/integration/auth.test.ts` (đăng ký, đăng nhập sai → 401 thông báo chung, User.email unique)
- [x] T013 [P] Trang đăng nhập/đăng ký tiếng Việt `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`; middleware chuyển hướng trang giảng viên khi chưa đăng nhập
- [x] T014 Seed TicketBox `prisma/seed.ts`: giảng viên demo, bài giảng 6 slide (slide 4 "nhìn thấy ghế trống không đồng nghĩa với đã giữ được ghế", có ghi chú), câu quiz APPROVED từ slide 4 (đáp án "Không")
- [x] T015 [P] Layout chung, design tokens (màu, cỡ chữ máy chiếu ≥ 32px) và component `SlideView` (3 mẫu) trong `src/client/components/`

**Checkpoint**: đăng nhập được, CSDL có dữ liệu TicketBox.

## Phase 3: User Story 1 - Trình chiếu đồng bộ ba giao diện (P1) 🎯 MVP

**Goal**: đổi slide đồng bộ tới máy chiếu và sinh viên; vào muộn; xem lại; reconnect.
**Independent Test**: seed TicketBox + 4 cửa sổ; xem quickstart.md mục 1.

### Tests (viết trước)

- [x] T016 [P] [US1] Unit test `SessionService.gotoSlide` (Session.maxPublishedIndex không giảm, stateVersion tăng, index ngoài phạm vi bị từ chối) trong `tests/unit/session-service.test.ts`
- [x] T017 [P] [US1] Integration test socket `tests/integration/realtime-sync.test.ts`: 1 giảng viên + 1 máy chiếu + 2 sinh viên; goto → mọi client nhận `session:state` mới; client mới vào muộn nhận đúng slide; ngắt rồi nối lại nhận snapshot hiện tại; bỏ qua `v` cũ
- [x] T018 [P] [US1] Integration test `GET /api/s/:code/slides/:index` trả 403 khi index > maxPublishedIndex và không có notes trong `tests/integration/public-slides.test.ts`

### Implementation

- [x] T019 [US1] `src/server/services/session-service.ts`: tạo phiên (Session.code 6 ký tự, projectorToken, bản chụp SessionSlide), khóa tuần tự theo sessionId, `gotoSlide`, `toggleQr`, `end`
- [x] T020 [US1] `src/server/projections.ts`: `toLecturerState`, `toProjectorState`, `toStudentState` (chỉ slide ≤ maxPublishedIndex, không notes/outline)
- [x] T021 [US1] `src/server/realtime/`: middleware handshake (lecturer cookie / projector token / participant token), join room `s:{id}:{role}` và `p:{participantId}`, `session:join`, `broadcastSession`, handler `slide:goto`, `qr:toggle`
- [x] T022 [US1] REST: `POST /api/lectures/:id/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/join-qr`, `GET /api/s/:code`, `POST /api/s/:code/join` (Participant.displayName ≤ 40, token cũ → người cũ), `GET /api/s/:code/slides/:index`
- [x] T023 [US1] Hook client `src/client/realtime/useSessionSocket.ts`: kết nối, tự reconnect, gửi `session:join` khi connect, áp snapshot theo `v`, trạng thái kết nối
- [x] T024 [P] [US1] Component `ConnectionBanner` (đang kết nối lại / mất kết nối) và `JoinQr`
- [x] T025 [US1] Bảng điều khiển giảng viên `src/app/present/[sessionId]/page.tsx`: slide hiện tại, slide kế, ghi chú, dàn ý, nút trước/sau + phím mũi tên, QR/link, nút "Mở màn hình chiếu", bật/tắt QR, kết thúc phiên
- [x] T026 [US1] Màn hình máy chiếu `src/app/projector/[code]/page.tsx`: slide hiện tại toàn màn hình 16:9, QR khi bật, không có điều khiển
- [x] T027 [US1] Giao diện sinh viên `src/app/join/[code]/page.tsx`: nhập tên tùy chọn, theo bài giảng mặc định, xem lại slide đã công bố, nút "Về bài giảng", trạng thái phiên không tồn tại/đã kết thúc

**Checkpoint**: tiêu chí demo 1 chạy được với seed.

## Phase 4: User Story 2 - Tách quyền (P1)

**Goal**: chặn mọi lệnh điều khiển và dữ liệu nhạy cảm cho vai trò không phải chủ phiên.
**Independent Test**: script tấn công trực tiếp API/socket.

- [x] T028 [P] [US2] Integration test `tests/integration/permissions.test.ts`: sinh viên/máy chiếu gửi `slide:goto`, `quiz:open`, `quiz:close`, `quiz:publish`, `question:update`, `session:end` → `FORBIDDEN`, trạng thái không đổi; giảng viên khác → `FORBIDDEN`; token sai → `connect_error`
- [x] T029 [P] [US2] Unit test projection `tests/unit/projections.test.ts`: duyệt sâu payload student/projector không có khóa `notes`, `outline`, `correctIndex`, `explanation`, `counts` (khi chưa PUBLISHED), không có slide > maxPublishedIndex
- [x] T030 [US2] Bổ sung guard theo vai trò cho mọi handler trong `src/server/realtime/handlers.ts` (bảng quyền tập trung) và log từ chối quyền (FR-064)
- [x] T031 [US2] Kiểm tra quyền sở hữu bài giảng cho mọi REST route giảng viên (giảng viên A không truy cập bài của B) + test trong `tests/integration/ownership.test.ts`
- [x] T032 [US2] Script `scripts/demo-attack.ts` (npm run demo:attack) dùng participant token thử lệnh điều khiển và slide chưa công bố, in kết quả bị từ chối — dùng trong demo

**Checkpoint**: tiêu chí demo 2.

## Phase 5: User Story 3 - Quiz, câu hỏi, biểu cảm (P1)

**Goal**: vòng đời quiz trong phiên, 1 lượt nộp, câu hỏi chỉ giảng viên thấy, biểu cảm tổng hợp.
**Independent Test**: quickstart.md mục 3.

### Tests

- [x] T033 [P] [US3] Unit test `QuizService` (QuizRun.status OPEN→CLOSED→PUBLISHED; câu DRAFT không mở; publish khi OPEN → CONFLICT; tối đa 1 OPEN/phiên) trong `tests/unit/quiz-service.test.ts`
- [x] T034 [P] [US3] Integration test `tests/integration/quiz-answers.test.ts`: 20 `quiz:answer` đồng thời cùng participant → đúng 1 Answer (unique Answer(quizRunId, participantId)); nộp sau đóng → `QUIZ_CLOSED`; projection sinh viên không thấy counts trước PUBLISHED
- [x] T035 [P] [US3] Integration test `tests/integration/feedback.test.ts`: `question:ask` chỉ tới room giảng viên; spotlight → máy chiếu thấy; `reaction:set` đổi kind tính 1 lần (unique Reaction(participantId, slideIndex))

### Implementation

- [x] T036 [US3] `src/server/services/quiz-service.ts`: open (chép nội dung câu APPROVED vào QuizRun), close, publish, hide, answer (transaction + bắt lỗi unique → ALREADY_ANSWERED), tổng hợp counts
- [x] T037 [US3] `src/server/services/feedback-service.ts`: StudentQuestion (text 1–500, status NEW/ANSWERED/HIDDEN, spotlight qua Session.spotlightQuestionId), Reaction set/clear
- [x] T038 [US3] Handler socket `quiz:*`, `question:*`, `reaction:set` + `session:delta:lecturer` throttle 250 ms
- [x] T039 [P] [US3] Component `QuizChart` (bar chart SVG, đáp án đúng nổi bật, đọc được trên máy chiếu) theo skill dataviz
- [x] T040 [US3] Bảng điều khiển: danh sách câu đã duyệt, Mở → Đóng → Công bố, số đã nộp + phân bố riêng giảng viên, danh sách câu hỏi sinh viên (đã trả lời/chiếu/ẩn), tổng hợp biểu cảm slide hiện tại
- [x] T041 [US3] Máy chiếu: câu quiz đang mở (không kết quả), biểu đồ khi công bố, câu hỏi được chiếu
- [x] T042 [US3] Sinh viên: làm quiz (một lượt, xác nhận đã nộp, quiz đã đóng), kết quả khi công bố, form đặt câu hỏi, nút "Em hiểu"/"Em chưa rõ"

**Checkpoint**: tiêu chí demo 3; luồng trình chiếu P1 hoàn chỉnh.

## Phase 6: User Story 5 - Quản lý bài giảng và trình soạn thảo (P2)

(làm trước US4 vì AI cần trình soạn thảo)

- [x] T043 [P] [US5] Integration test CRUD bài giảng/slide/sắp xếp/nhân bản/xóa khi có phiên LIVE → 409 trong `tests/integration/lectures.test.ts`
- [x] T044 [US5] `src/server/services/lecture-service.ts` + REST `/api/lectures*`, `/api/slides/:id`, `PUT /api/lectures/:id/slides/order` (Slide.position, Slide.template, Lecture.title 1–200)
- [x] T045 [US5] REST câu hỏi quiz `/api/lectures/:id/questions`, `/api/questions/:id`, `/approve` (QuizQuestion.options 2–6, QuizQuestion.correctIndex, sửa → DRAFT) + test `tests/integration/questions.test.ts`
- [x] T046 [US5] Trang danh sách bài giảng `src/app/lectures/page.tsx` (tạo, đổi tên, xóa, nhân bản, bắt đầu trình chiếu)
- [x] T047 [US5] Trình soạn thảo `src/app/lectures/[id]/edit/page.tsx`: danh sách slide kéo thả/đổi thứ tự, 3 mẫu, sửa tiêu đề/nội dung/ghi chú, dàn ý, tự lưu, trạng thái lỗi/validation
- [x] T048 [US5] Màn hình quản lý/duyệt câu hỏi: sửa câu, hiển thị slide căn cứ cạnh câu, nút Duyệt, nhãn Nháp/Đã duyệt; chèn slide mẫu quiz

## Phase 7: User Story 4 - AI soạn slide và quiz (P2)

- [x] T049 [P] [US4] Unit test schema + xử lý lỗi AI (timeout 30s → AI_TIMEOUT, JSON sai → AI_BAD_OUTPUT, không thay đổi dữ liệu) với `FakeAiProvider` trong `tests/unit/ai-service.test.ts`
- [x] T050 [US4] `src/server/ai/provider.ts` (interface), `fake-provider.ts`, `gemini-provider.ts` (@google/genai, JSON mode + responseSchema, AbortController 30s, retry 1 lần lỗi mạng), `schemas.ts` (zod), `prompts.ts` (tiếng Việt)
- [x] T051 [US4] `src/server/services/ai-service.ts` + REST `/ai/generate-slides`, `/ai/split-text`, `/slides/:id/ai/suggest`, `/ai/generate-quiz` (lưu Slide.isAiDraft, QuizQuestion.status DRAFT, QuizQuestion.sourceSlideIds) + test `tests/integration/ai-routes.test.ts`
- [x] T052 [US4] UI: hộp thoại "Tạo từ ý tưởng" (chủ đề, đối tượng, số slide 1–20), "Dán văn bản", nút gợi ý trên từng slide (chấp nhận/bỏ), chọn slide → "Tạo quiz"; trạng thái đang chờ AI, AI lỗi + thử lại; nhãn "Nháp AI"
- [x] T053 [US4] Kiểm tra thủ công với Gemini thật (khóa trong .env) bằng kịch bản TicketBox; ghi kết quả vào `docs/qa/evidence/`

## Phase 8: User Story 6 - Nhập PowerPoint (P3)

- [x] T054 [P] [US6] Fixture `tests/fixtures/` (ticketbox.pptx hợp lệ, broken.pptx, notpptx.pptx) và test `tests/unit/pptx.test.ts`
- [x] T055 [US6] `src/server/pptx/extract.ts` (thứ tự slide theo presentation.xml, tiêu đề từ placeholder title/ctrTitle, văn bản, ghi chú; giới hạn 20 MB trước khi đọc)
- [x] T056 [US6] REST `POST /api/lectures/:id/import-pptx` (413/422, transaction) + UI nhập tệp trong trình soạn thảo, nút "AI viết lại/bổ sung"

## Phase 9: User Story 7 - Kết thúc phiên và báo cáo (P3)

- [x] T057 [P] [US7] Integration test kết thúc phiên (đóng quiz OPEN, từ chối phản hồi, sinh viên vào sau → SESSION_ENDED) và báo cáo trong `tests/integration/report.test.ts`
- [x] T058 [US7] `src/server/services/report-service.ts` + `GET /api/sessions/:id/report`
- [x] T059 [US7] Trang báo cáo `src/app/sessions/[id]/report/page.tsx` (người tham gia, kết quả quiz + tỉ lệ đúng, câu hỏi, biểu cảm theo slide) và danh sách phiên cũ trên trang bài giảng

## Phase 10: Polish & cross-cutting

- [ ] T060 [P] E2E Playwright `tests/e2e/ticketbox.spec.ts`: 4 context (giảng viên, máy chiếu, 2 sinh viên viewport điện thoại) chạy đủ kịch bản TicketBox và 4 tiêu chí demo, gồm offline/online
- [x] T061 [P] ADR `docs/architecture/adr/ADR-001-dong-bo-thoi-gian-thuc.md`, `ADR-002-kiem-tra-quyen-nguoi-xem.md`, `ADR-003-tich-hop-ai.md` + `docs/architecture/overview.md` với sơ đồ thành phần/trình tự
- [x] T062 [P] README.md: cài đặt, chạy, demo bằng nhiều trình duyệt, chạy qua LAN, chế độ `AI_PROVIDER=fake`
- [ ] T063 Kiểm tra responsive (360px, laptop, 1920×1080), bàn phím, tương phản; sửa lỗi
- [ ] T064 Chạy `security-review` và `code-review`; sửa lỗi Critical/High
- [ ] T065 QA: `docs/qa/test-plan.md`, `docs/qa/test-cases.md` (đủ 11 trường), `docs/qa/test-summary-report.md`; PO: `docs/po/uat-*.md`

---

## Dependencies & Execution Order

- Setup (T001–T006) → Foundational (T007–T015) → US1 → US2 → US3 (luồng P1, tuần tự vì cùng file realtime/projection)
- US5 phụ thuộc Foundational; có thể làm song song với US1–US3 (khác file) nếu có người
- US4 phụ thuộc US5 (trình soạn thảo, câu hỏi) ; US6 phụ thuộc US5; US7 phụ thuộc US3
- Polish sau cùng; T060 cần US1–US4

## Parallel Examples

- Foundational: T008, T009, T010, T013, T015 cùng lúc sau T007
- US1: T016, T017, T018 (test) song song; T024 song song với T023
- US3: T033, T034, T035, T039 song song

## Implementation Strategy

1. MVP = Phase 1–5 (trình chiếu + quyền + phản hồi với dữ liệu seed) → demo 3/4 tiêu chí.
2. Thêm US5 + US4 → đủ 4 tiêu chí.
3. US6, US7, Polish.
4. Sau mỗi phase: `npm test`, chạy thật (skill `run`), commit.
