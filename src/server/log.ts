/** Log đơn giản ra console. Không bao giờ truyền mật khẩu, token hay khóa AI vào đây (FR-064). */
function fmt(meta?: unknown) {
  if (meta instanceof Error) return meta.stack ?? meta.message;
  if (meta === undefined) return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

const silent = () => process.env.NODE_ENV === "test" && !process.env.LOG_IN_TEST;

export const log = {
  info: (msg: string, meta?: unknown) => !silent() && console.log(`[info] ${msg} ${fmt(meta)}`),
  warn: (msg: string, meta?: unknown) => !silent() && console.warn(`[warn] ${msg} ${fmt(meta)}`),
  error: (msg: string, meta?: unknown) => !silent() && console.error(`[error] ${msg} ${fmt(meta)}`),
};
