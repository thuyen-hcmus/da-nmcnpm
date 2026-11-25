# REST API Contract

Base: `/api`. JSON. Payload được định nghĩa bằng zod trong `src/shared/contracts/` (nguồn mã của contract này).

## Lỗi

```json
{ "error": { "code": "FORBIDDEN", "message": "Bạn không có quyền thực hiện thao tác này" } }
```

| code | HTTP | Khi nào |
|---|---|---|
| VALIDATION_ERROR | 400 | input sai (kèm `details`) |
| UNAUTHENTICATED | 401 | chưa đăng nhập / token sai |
| FORBIDDEN | 403 | sai vai trò, không phải chủ sở hữu, slide chưa công bố |
| NOT_FOUND | 404 | không tồn tại (kể cả mã phiên sai) |
| CONFLICT | 409 | trạng thái không cho phép (vd. xóa bài giảng có phiên LIVE) |
| SESSION_ENDED | 410 | phiên đã kết thúc |
| PAYLOAD_TOO_LARGE | 413 | .pptx > 20 MB |
| PPTX_INVALID | 422 | tệp hỏng/không phải .pptx |
| AI_TIMEOUT | 504 | AI quá 30 giây |
| AI_BAD_OUTPUT | 502 | AI trả sai định dạng |
| AI_ERROR | 502 | lỗi khác từ AI |

Xác thực: **L** = giảng viên (cookie `sid`), **O** = giảng viên là chủ tài nguyên, **P** = participant
token (`Authorization: Bearer <participantToken>`), **—** = công khai.

## Auth

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | /auth/register | — | `{email, password(≥8), name}` → `201 {user}` + cookie |
| POST | /auth/login | — | `{email, password}` → `200 {user}` + cookie; sai → 401 thông báo chung |
| POST | /auth/logout | L | → 204 |
| GET | /auth/me | L | → `{user}` |

## Lectures & slides

| Method | Path | Auth | Ghi chú |
|---|---|---|---|
| GET | /lectures | L | `[{id,title,slideCount,updatedAt}]` |
| POST | /lectures | L | `{title}` → `201 Lecture` |
| GET | /lectures/:id | O | `{lecture, slides[], questions[]}` (đủ ghi chú, đáp án) |
| PATCH | /lectures/:id | O | `{title?, outline?}` |
| DELETE | /lectures/:id | O | 409 nếu có phiên LIVE |
| POST | /lectures/:id/duplicate | O | → `201 Lecture` (chép slide + câu hỏi, không chép phiên) |
| POST | /lectures/:id/slides | O | `{template, title?, body?, notes?, position?}` |
| PATCH | /slides/:id | O | `{title?, body?, notes?, template?, questionId?, isAiDraft?}` |
| DELETE | /slides/:id | O | |
| PUT | /lectures/:id/slides/order | O | `{slideIds: string[]}` (đủ và đúng tập slide) |
| POST | /lectures/:id/import-pptx | O | multipart `file` → `{slides[]}` được nối vào cuối; 413/422 |

## Quiz questions

| Method | Path | Auth | Ghi chú |
|---|---|---|---|
| POST | /lectures/:id/questions | O | `{prompt, options[], correctIndex, explanation?, sourceSlideIds?}` → DRAFT |
| PATCH | /questions/:id | O | sửa nội dung → status DRAFT |
| POST | /questions/:id/approve | O | DRAFT → APPROVED |
| DELETE | /questions/:id | O | |

## AI (mọi kết quả là nháp)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | /lectures/:id/ai/generate-slides | O | `{topic, audience, slideCount(1–20)}` → `{slides[]}` đã lưu, `isAiDraft=true`, nối vào cuối |
| POST | /lectures/:id/ai/split-text | O | `{text(≤20000), maxSlides?}` → `{slides[]}` đã lưu, nháp |
| POST | /slides/:id/ai/suggest | O | `{action: "condense"\|"notes"\|"rewrite"\|"expand"}` → `{suggestion:{title?,body?,notes?}}` **không lưu** |
| POST | /lectures/:id/ai/generate-quiz | O | `{slideIds[1..], count(1–5)}` → `{questions[]}` đã lưu, DRAFT, `sourceSlideIds` |

## Sessions

| Method | Path | Auth | Ghi chú |
|---|---|---|---|
| POST | /lectures/:id/sessions | O | 409 nếu bài giảng không có slide → `{session, joinUrl, projectorUrl}` |
| GET | /sessions/:id | O | snapshot giảng viên (như sự kiện `session:state` role lecturer) |
| GET | /sessions/:id/report | O | báo cáo (FR-060) |
| GET | /sessions/:id/join-qr | O | `image/svg+xml` QR của `joinUrl` |
| GET | /s/:code | — | `{status: "LIVE"\|"ENDED", lectureTitle}`; 404 nếu sai mã |
| POST | /s/:code/join | — | `{displayName?, participantToken?}` → `{participantToken, participant}`; token cũ hợp lệ → trả lại người cũ; 410 nếu ENDED |
| GET | /s/:code/slides/:index | P hoặc projector | 403 nếu `index > maxPublishedIndex`; trả `PublicSlide` (không có notes) |

Lệnh điều khiển phiên đi qua kênh realtime (xem `realtime-events.md`); REST không có endpoint điều khiển.

## Kiểu dữ liệu công khai

```ts
PublicSlide = { index, template, title, body, quiz?: PublicQuizRef }   // KHÔNG có notes
PublicQuizRun = { id, prompt, options[], status,
                  result?: { counts: number[], total, correctIndex, explanation } } // result chỉ khi PUBLISHED
```
