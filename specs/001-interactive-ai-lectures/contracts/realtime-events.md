# Realtime Events Contract (Socket.IO, namespace `/live`)

## Handshake

`io("/live", { auth: { code, role, token? } })`

| role | token | Xác thực |
|---|---|---|
| `lecturer` | (cookie `sid`) | user là chủ phiên `code` |
| `projector` | projectorToken | khớp `Session.projectorTokenHash` |
| `student` | participantToken | Participant thuộc phiên |

Sai → `connect_error` với `data.code` ∈ `UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | SESSION_ENDED`.
Sau khi kết nối, server tự join room `s:{id}:{role}` (và `p:{participantId}` cho sinh viên) rồi gửi
ngay `session:state`.

## Server → Client

### `session:state` (snapshot đầy đủ, đã lọc theo vai trò)

Gửi khi: kết nối/kết nối lại, `session:join`, và sau mỗi thay đổi trạng thái.

```ts
// chung
{ v: number /* stateVersion */, status: "LIVE"|"ENDED", code, lectureTitle,
  currentIndex, maxPublishedIndex, slideCount }

// student: + 
{ slides: PublicSlide[] /* chỉ index ≤ maxPublishedIndex */,
  activeQuiz: PublicQuizRun | null,      // QuizRun mới nhất đang "trên màn chiếu" (OPEN/CLOSED/PUBLISHED); result chỉ khi PUBLISHED
  me: { participantId, displayName, answeredOptionIndex: number|null, reactionForCurrent: kind|null } }

// projector: +
{ currentSlide: PublicSlide, showJoinQr, joinUrl, activeQuiz: PublicQuizRun | null,
  spotlightQuestion: { text, displayName|null } | null }

// lecturer: +
{ slides: LecturerSlide[] /* đủ, có notes */, outline,
  activeQuiz: (PublicQuizRun & { correctIndex, explanation, counts, total, onScreen }) | null,
  approvedQuestions: { id, prompt }[], participantCount,
  reactions: { slideIndex, understood, confused },  // cho slide hiện tại
  questions: StudentQuestionView[], spotlightQuestionId, projectorUrl, joinUrl }
```

Client MUST bỏ qua snapshot có `v` nhỏ hơn bản đang giữ.

### `session:delta:lecturer` (chỉ room giảng viên, throttle 250 ms)

`{ v, participantCount, activeQuiz?: { counts, total }, reactions, questions }` — cập nhật nhanh khi có
nộp bài/biểu cảm/câu hỏi mà không đổi trạng thái chung.

## Client → Server (tất cả dùng ack `(res) => void`)

`res = { ok: true, v } | { ok: false, error: { code, message } }`

### Lệnh giảng viên (role ≠ lecturer → `FORBIDDEN`, phiên ENDED → `SESSION_ENDED`)

| Event | Payload | Quy tắc |
|---|---|---|
| `slide:goto` | `{ index }` | 0 ≤ index < slideCount; `maxPublishedIndex = max(cũ, index)` |
| `qr:toggle` | `{ show: boolean }` | |
| `quiz:open` | `{ questionId }` | câu APPROVED cùng bài giảng; không có QuizRun OPEN khác → `CONFLICT` |
| `quiz:close` | `{ quizRunId }` | OPEN → CLOSED |
| `quiz:publish` | `{ quizRunId }` | CLOSED → PUBLISHED; OPEN → `CONFLICT` |
| `quiz:hide` | `{ quizRunId }` | gỡ khỏi màn chiếu; OPEN → `CONFLICT` (đóng trước) |
| `question:update` | `{ questionId, status?: "ANSWERED"\|"HIDDEN", spotlight?: boolean }` | |
| `session:end` | `{}` | đóng QuizRun OPEN, status ENDED |

### Lệnh sinh viên (role ≠ student → `FORBIDDEN`)

| Event | Payload | Quy tắc / lỗi |
|---|---|---|
| `quiz:answer` | `{ quizRunId, optionIndex }` | không OPEN → `QUIZ_CLOSED`; đã nộp → `ALREADY_ANSWERED` |
| `question:ask` | `{ text }` (1–500) | `VALIDATION_ERROR` |
| `reaction:set` | `{ slideIndex, kind: "UNDERSTOOD"\|"CONFUSED"\|null }` | slideIndex ≤ maxPublishedIndex |

### Chung

| Event | Payload | |
|---|---|---|
| `session:join` | `{}` | trả lại `session:state` qua ack (dùng khi reconnect) |

Sinh viên xem lại slide cũ là thao tác cục bộ trên `slides` đã nhận (đã lọc); không có slide chưa công bố trong client.
