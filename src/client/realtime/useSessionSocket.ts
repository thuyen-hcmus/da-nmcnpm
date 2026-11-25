"use client";
/**
 * Kết nối realtime tới phiên. Client KHÔNG tự suy ra trạng thái: chỉ hiển thị snapshot server gửi
 * (ADR-001). Khi kết nối/kết nối lại, server tự đẩy snapshot; ta vẫn gọi session:join để chắc chắn.
 * Snapshot có `v` nhỏ hơn bản đang giữ bị bỏ qua.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_NAMESPACE, type Ack, type LecturerDelta, type Role, type SessionState } from "@/shared/contracts";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "error";

export function useSessionSocket<S extends SessionState>(opts: {
  code: string;
  role: Role;
  token?: string | null;
  enabled?: boolean;
  onDelta?: (d: LecturerDelta) => void;
}) {
  const { code, role, token, enabled = true } = opts;
  const [state, setState] = useState<S | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const versionRef = useRef(0);
  const deltaRef = useRef(opts.onDelta);
  deltaRef.current = opts.onDelta;

  const apply = useCallback((s: S) => {
    if (s.v < versionRef.current) return;
    versionRef.current = s.v;
    setState(s);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const socket = io(SOCKET_NAMESPACE, {
      auth: { code, role, token: token ?? undefined },
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      setError(null);
      socket.emit("session:join", {}, (r: Ack<{ state: S }>) => {
        if (r.ok) apply(r.state);
      });
    });
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("connect_error", (e: Error & { data?: { code?: string } }) => {
      const c = e.data?.code;
      if (c && c !== "INTERNAL") {
        setStatus("error");
        setError(c);
        socket.disconnect(); // lỗi quyền/phiên: không tự thử lại
      } else {
        setStatus("reconnecting");
      }
    });
    socket.on("session:state", (s: S) => apply(s));
    socket.on("session:delta:lecturer", (d: LecturerDelta) => {
      if (d.v < versionRef.current) return;
      deltaRef.current?.(d);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, role, token, enabled, apply]);

  /** Gửi lệnh có ack. */
  const send = useCallback(<T = Record<string, unknown>>(event: string, payload: unknown = {}) => {
    return new Promise<Ack<T>>((resolve) => {
      const s = socketRef.current;
      if (!s || !s.connected) {
        resolve({ ok: false, error: { code: "INTERNAL", message: "Mất kết nối, đang thử lại…" } });
        return;
      }
      s.timeout(8000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
        if (err) resolve({ ok: false, error: { code: "INTERNAL", message: "Máy chủ không phản hồi" } });
        else resolve(res);
      });
    });
  }, []);

  return { state, setState, status, error, send };
}
