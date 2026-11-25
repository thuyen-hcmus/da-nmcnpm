# ADR-003: Tích hợp AI qua một lớp trừu tượng, đầu ra luôn là nháp

- **Trạng thái**: Chấp nhận
- **Ngày**: 2026-11-25
- **Liên quan**: FR-020 → FR-025, constitution nguyên tắc III và VII, `src/server/ai/`

## Quyết định

- Interface `AiProvider.generateJson(kind, system, prompt, signal)`; hai cài đặt: `GeminiProvider`
  (vận hành) và `FakeAiProvider` (test, demo không Internet). Chọn bằng `AI_PROVIDER`.
- Nhà cung cấp duy nhất: Google Gemini, model theo `AI_MODEL` (hiện `gemini-3.1-flash-lite`: các bản
  2.5 đã ngừng cho người dùng mới, bản 3.x flash lớn hay trả 503 khi quá tải và chậm hơn 30 giây).
- Gemini được yêu cầu trả JSON theo `responseSchema`; server **validate lại bằng zod** trước khi lưu.
- Timeout tổng 30 giây; retry tối đa 2 lần có backoff cho lỗi mạng/5xx; không retry lỗi 4xx hay sai
  định dạng. Lỗi trả về mã `AI_TIMEOUT`, `AI_BAD_OUTPUT`, `AI_ERROR`; dữ liệu cũ không bị thay đổi.
- Kết quả: slide lưu `isAiDraft=true`; quiz lưu `status=DRAFT` kèm `sourceSlideIds`; gợi ý cho slide
  có sẵn chỉ trả về đề xuất, giảng viên tự áp dụng. Chỉ câu `APPROVED` mới mở được trong phiên.
- Khóa `AI_API_KEY` chỉ đọc ở server, không log, không gửi xuống client.
