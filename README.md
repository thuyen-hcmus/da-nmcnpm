# Lớp học tương tác có AI hỗ trợ

Đồ án: nền tảng trình chiếu giảng dạy tương tác. Giảng viên soạn slide (có AI hỗ trợ), trình chiếu;
máy chiếu và điện thoại sinh viên đồng bộ theo thời gian thực; sinh viên làm quiz, đặt câu hỏi, gửi
biểu cảm; giảng viên quyết định khi nào công bố kết quả.

- Đặc tả (Spec Kit): [`specs/001-interactive-ai-lectures/`](specs/001-interactive-ai-lectures/) –
  `spec.md`, `plan.md`, `data-model.md`, `contracts/`, `tasks.md`
- Nguyên tắc dự án: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Kiến trúc: [ADR-001 đồng bộ](docs/architecture/adr/ADR-001-dong-bo-thoi-gian-thuc.md),
  [ADR-002 quyền người xem](docs/architecture/adr/ADR-002-kiem-tra-quyen-nguoi-xem.md),
  [ADR-003 AI](docs/architecture/adr/ADR-003-tich-hop-ai.md)
- Agent team: [`.claude/agents/`](.claude/agents/)

## Công nghệ

Next.js 16 (App Router, TypeScript) + Socket.IO 4 trên cùng một server Node (`server.ts`), SQLite qua
Prisma 7, Google Gemini (`@google/genai`), Tailwind CSS 4, Vitest, Playwright.

## Chạy local

Dùng Docker Compose với Node.js 24, SQLite và AI giả lập theo mặc định.

```bash
docker compose -f compose.local.yaml up -d
docker compose -f compose.local.yaml logs -f app
```

Ứng dụng mở tại [localhost:3000](http://localhost:3000). Có thể đặt `LOCAL_PORT` nếu muốn dùng cổng khác.
Để tạo lại tài khoản demo và bài giảng mẫu TicketBox, chạy `docker compose -f compose.local.yaml exec app npm run db:seed`.

Nếu chạy trực tiếp với Node.js 24, dùng các lệnh sau.

```bash
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run db:seed           # tạo dữ liệu mẫu TicketBox
npm run dev               # http://localhost:3000
```

Tài khoản mẫu: `gv@demo.local` / `matkhau123` (bài giảng TicketBox 6 slide + 1 câu quiz đã duyệt).

`AI_PROVIDER=fake` trong `.env` dùng AI giả lập (không cần Internet) để demo dự phòng.

## Demo trên một laptop (chia sẻ màn hình)

| Vai trò | Cách mở |
|---|---|
| Giảng viên | Chrome thường → đăng nhập → bài giảng → **Bắt đầu trình chiếu** |
| Máy chiếu | Nút **Mở màn hình chiếu ↗** trên bảng điều khiển (F11 để toàn màn hình) |
| Sinh viên 1 | Cửa sổ ẩn danh, mở link tham gia, DevTools → chế độ điện thoại |
| Sinh viên 2 | Trình duyệt khác (Edge/Firefox/Safari) hoặc hồ sơ Chrome khác |

Mỗi sinh viên phải là một trình duyệt hoặc cửa sổ ẩn danh riêng: hai tab cùng cửa sổ được tính là
cùng một người.

Chứng minh tách quyền bằng cách gọi thẳng server với vai trò sinh viên:

```bash
npm run demo:attack -- <MÃ_PHIÊN>
```

Chạy qua mạng LAN (điện thoại thật): đặt `HOST=0.0.0.0` và `PUBLIC_URL=http://<ip-laptop>:3000`.

## Kiểm thử

```bash
npm test            # unit + integration (Vitest), gồm test quyền gọi trực tiếp socket/API
npm run test:e2e    # Playwright: giảng viên + máy chiếu + 2 sinh viên, kịch bản TicketBox
npm run typecheck
```

`test:e2e` tự chạy một server riêng ở cổng 3100 với CSDL `e2e.db` và AI giả lập. Lần đầu cần
`npx playwright install chromium`.

## CI/CD

GitHub Actions kiểm tra pull request và các nhánh được push. Job production triển khai bản đã qua
kiểm thử từ `main` lên VPS. Xem [cách cấu hình CI/CD và khôi phục bản phát hành](docs/deployment.md).

## Cấu trúc

```text
server.ts                    Next.js + Socket.IO trên cùng HTTP server
prisma/                      schema, migration, seed TicketBox
src/app/                     trang (lectures, present, projector, join, sessions/report) + REST API
src/server/services/         nghiệp vụ: phiên, quiz, phản hồi, bài giảng, báo cáo
src/server/projections.ts    lọc dữ liệu theo vai trò (ADR-002)
src/server/realtime/         Socket.IO: xác thực, room, phát snapshot (ADR-001)
src/server/ai/               AiProvider, Gemini, Fake, schema zod (ADR-003)
src/server/pptx/             trích xuất .pptx
src/shared/contracts/        hợp đồng FE/BE dùng chung
tests/                       unit, integration, e2e
```
