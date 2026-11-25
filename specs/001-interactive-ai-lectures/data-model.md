# Data Model

Tất cả id là chuỗi `cuid`. Thời gian `DateTime`. JSON lưu dạng chuỗi (SQLite).

## User (giảng viên)

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| email | String | unique, lưu chữ thường, định dạng email |
| passwordHash | String | bcrypt |
| name | String | 1–80 ký tự |
| createdAt | DateTime | |

## AuthSession

| id | tokenHash (unique, SHA-256) | userId → User | expiresAt | createdAt |

## Lecture

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| ownerId | → User | cascade delete |
| title | String | 1–200 |
| outline | String | ≤ 5.000, chỉ giảng viên thấy |
| createdAt / updatedAt | DateTime | |

## Slide

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| lectureId | → Lecture | cascade |
| position | Int | ≥ 0, unique `(lectureId, position)` (sắp xếp lại trong transaction) |
| template | Enum `TITLE` \| `CONTENT` \| `QUIZ` | |
| title | String | ≤ 200 |
| body | String | ≤ 5.000; TITLE: phụ đề; CONTENT: các ý, mỗi dòng một ý |
| questionId | → QuizQuestion? | chỉ khi `template = QUIZ`; câu phải APPROVED để trình chiếu |
| notes | String | ≤ 5.000, ghi chú riêng |
| source | Enum `MANUAL` \| `AI` \| `PPTX` | |
| isAiDraft | Boolean | true khi do AI tạo và chưa được giảng viên xác nhận |

## QuizQuestion

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| lectureId | → Lecture | cascade |
| prompt | String | 1–500 |
| options | JSON `string[]` | 2–6 phần tử, mỗi phần tử 1–200, không trùng |
| correctIndex | Int | 0 ≤ i < options.length |
| explanation | String | ≤ 1.000 |
| sourceSlideIds | JSON `string[]` | các Slide căn cứ (có thể rỗng nếu tạo tay) |
| status | Enum `DRAFT` \| `APPROVED` | sửa bất kỳ trường nội dung nào → `DRAFT` |
| source | Enum `MANUAL` \| `AI` | |
| approvedAt | DateTime? | |

Chuyển trạng thái: `DRAFT --approve--> APPROVED`; `APPROVED --edit--> DRAFT`.

## Session (nguồn trạng thái duy nhất của phiên)

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| lectureId | → Lecture | |
| ownerId | → User | chủ phiên |
| code | String | unique, 6 ký tự `[A-Z2-9]` (bỏ ký tự dễ nhầm) |
| projectorTokenHash | String | |
| status | Enum `LIVE` \| `ENDED` | |
| currentIndex | Int | 0 ≤ i < slideCount |
| maxPublishedIndex | Int | ≥ currentIndex, không bao giờ giảm |
| showJoinQr | Boolean | QR trên máy chiếu |
| spotlightQuestionId | → StudentQuestion? | câu đang chiếu |
| stateVersion | Int | tăng 1 mỗi thay đổi trạng thái |
| startedAt / endedAt | DateTime / DateTime? | |

Chuyển trạng thái: `LIVE --end--> ENDED` (đóng mọi QuizRun OPEN). Khi `ENDED`: từ chối mọi lệnh và phản hồi.

## SessionSlide (bản chụp)

| id | sessionId → Session | index (unique theo session) | template | title | body | notes | quizQuestionId? |

## QuizRun (quiz trong phiên)

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| id | String | PK |
| sessionId | → Session | |
| questionId | → QuizQuestion | |
| prompt, options, correctIndex, explanation | bản chép tại lúc mở | bất biến |
| status | Enum `OPEN` \| `CLOSED` \| `PUBLISHED` | tối đa 1 `OPEN` mỗi session |
| openedAt / closedAt / publishedAt | DateTime | |

Chuyển trạng thái: `(APPROVED question) --open--> OPEN --close--> CLOSED --publish--> PUBLISHED`.
Projector luôn hiển thị QuizRun mới nhất còn được "chiếu" (`OPEN` hoặc `PUBLISHED`), giảng viên có thể
gỡ khỏi màn chiếu (`quiz:hide`).

## Participant

| id | sessionId → Session | tokenHash (unique) | displayName? (≤ 40) | joinedAt | lastSeenAt |

## Answer

| id | quizRunId → QuizRun | participantId → Participant | optionIndex | createdAt |

Ràng buộc: **unique `(quizRunId, participantId)`**; chỉ chèn khi QuizRun `OPEN` (kiểm tra trong
transaction; vi phạm unique → `ALREADY_ANSWERED`).

## StudentQuestion

| id | sessionId | participantId | text (1–500) | status `NEW` \| `ANSWERED` \| `HIDDEN` | spotlighted (qua Session.spotlightQuestionId) | createdAt |

## Reaction

| id | sessionId | participantId | slideIndex | kind `UNDERSTOOD` \| `CONFUSED` | updatedAt |

Ràng buộc: unique `(participantId, slideIndex)`; gửi lại đổi `kind`; `kind = null` → xóa.
