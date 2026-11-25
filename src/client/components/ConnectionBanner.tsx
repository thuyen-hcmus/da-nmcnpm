import type { ConnStatus } from "../realtime/useSessionSocket";

export function ConnectionBanner({ status }: { status: ConnStatus }) {
  if (status === "connected") return null;
  const text =
    status === "connecting" ? "Đang kết nối…" : status === "reconnecting" ? "Mất kết nối, đang kết nối lại…" : "Không thể kết nối";
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      {text}
    </div>
  );
}

export const CONNECT_ERRORS: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy phiên. Kiểm tra lại mã hoặc link.",
  SESSION_ENDED: "Phiên đã kết thúc.",
  UNAUTHENTICATED: "Phiên tham gia không hợp lệ, vui lòng vào lại.",
  FORBIDDEN: "Bạn không có quyền truy cập màn hình này.",
  VALIDATION_ERROR: "Link không hợp lệ.",
};
