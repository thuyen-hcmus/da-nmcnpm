/** Mã lỗi theo contracts/rest-api.md và contracts/realtime-events.md */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_ANSWERED: 409,
  QUIZ_CLOSED: 409,
  SESSION_ENDED: 410,
  PAYLOAD_TOO_LARGE: 413,
  PPTX_INVALID: 422,
  AI_ERROR: 502,
  AI_BAD_OUTPUT: 502,
  AI_TIMEOUT: 504,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ApiError = { code: ErrorCode; message: string; details?: unknown };

export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Dữ liệu không hợp lệ",
  UNAUTHENTICATED: "Bạn cần đăng nhập",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  NOT_FOUND: "Không tìm thấy",
  CONFLICT: "Thao tác không phù hợp với trạng thái hiện tại",
  ALREADY_ANSWERED: "Bạn đã nộp câu này rồi",
  QUIZ_CLOSED: "Quiz đã đóng",
  SESSION_ENDED: "Phiên đã kết thúc",
  PAYLOAD_TOO_LARGE: "Tệp quá lớn (tối đa 20 MB)",
  PPTX_INVALID: "Tệp PowerPoint không hợp lệ",
  AI_ERROR: "AI đang gặp lỗi, vui lòng thử lại",
  AI_BAD_OUTPUT: "AI trả về kết quả sai định dạng, vui lòng thử lại",
  AI_TIMEOUT: "AI phản hồi quá lâu, vui lòng thử lại",
  INTERNAL: "Lỗi hệ thống",
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
  }
  toJSON(): ApiError {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}
