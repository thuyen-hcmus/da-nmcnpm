import { EventEmitter } from "node:events";

/**
 * Kênh nội bộ giữa tầng dịch vụ và tầng realtime.
 * Dịch vụ chỉ báo "phiên X đã đổi"; tầng realtime tự dựng snapshot đã lọc và phát đi.
 */
type Events = {
  state: [sessionId: string];
  delta: [sessionId: string];
};

class Bus extends EventEmitter<Events> {}

const g = globalThis as unknown as { __sessionBus?: Bus };
export const sessionBus: Bus = g.__sessionBus ?? (g.__sessionBus = new Bus());
sessionBus.setMaxListeners(50);

export function notifyState(sessionId: string) {
  sessionBus.emit("state", sessionId);
}
export function notifyDelta(sessionId: string) {
  sessionBus.emit("delta", sessionId);
}
