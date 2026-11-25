/**
 * Xử lý tuần tự các lệnh làm đổi trạng thái của cùng một phiên (nhiều cửa sổ giảng viên,
 * nhiều sinh viên nộp đồng thời) để không ghi đè lẫn nhau. Một tiến trình server nên khóa
 * trong bộ nhớ là đủ (plan.md).
 */
const g = globalThis as unknown as { __sessionLocks?: Map<string, Promise<unknown>> };
const locks: Map<string, Promise<unknown>> = g.__sessionLocks ?? (g.__sessionLocks = new Map());

export function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(sessionId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(sessionId, tail);
  tail.then(() => {
    if (locks.get(sessionId) === tail) locks.delete(sessionId);
  });
  return next;
}
