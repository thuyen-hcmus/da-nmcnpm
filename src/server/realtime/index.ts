import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DefaultEventsMap = Record<string, (...args: any[]) => void>;
import { z } from "zod";
import { db } from "../db";
import { hashToken } from "../auth/crypto";
import { readCookie, SESSION_COOKIE, userFromToken } from "../auth/lecturer-session";
import { AppError, type ErrorCode } from "@/shared/errors";
import { ev, SOCKET_NAMESPACE, type Ack } from "@/shared/contracts";
import { assertCanRun, type Actor, type Command } from "../services/actor";
import * as sessions from "../services/session-service";
import * as quiz from "../services/quiz-service";
import * as feedback from "../services/feedback-service";
import { loadSessionView, projectorTokenFor, toLecturerDelta, toLecturerState, toProjectorState, toStudentState } from "../projections";
import { sessionBus } from "./bus";
import { log } from "../log";

type SocketData = { actor: Actor; displayName: string | null };
type LiveSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const room = {
  role: (sessionId: string, role: Actor["role"]) => `s:${sessionId}:${role}`,
  participant: (participantId: string) => `p:${participantId}`,
};

const handshakeSchema = z.object({
  code: z.string().min(1).max(20),
  role: z.enum(["lecturer", "projector", "student"]),
  token: z.string().max(200).optional(),
});

function connectError(code: ErrorCode) {
  const err = new Error(code) as Error & { data?: unknown };
  err.data = { code };
  return err;
}

/** Xác thực khi kết nối: gán vai trò cho socket. Mọi kiểm tra quyền sau đó dựa trên socket.data.actor. */
async function authenticate(socket: LiveSocket): Promise<SocketData> {
  const parsed = handshakeSchema.safeParse(socket.handshake.auth);
  if (!parsed.success) throw connectError("VALIDATION_ERROR");
  const { code, role, token } = parsed.data;
  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) throw connectError("NOT_FOUND");

  if (role === "lecturer") {
    const user = await userFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!user) throw connectError("UNAUTHENTICATED");
    if (user.id !== session.ownerId) throw connectError("FORBIDDEN");
    return { actor: { role, userId: user.id, sessionId: session.id }, displayName: null };
  }
  if (role === "projector") {
    if (!token || hashToken(token) !== session.projectorTokenHash || token !== projectorTokenFor(session.id)) {
      throw connectError("FORBIDDEN");
    }
    return { actor: { role, sessionId: session.id }, displayName: null };
  }
  if (!token) throw connectError("UNAUTHENTICATED");
  const p = await db.participant.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!p || p.sessionId !== session.id) throw connectError("UNAUTHENTICATED");
  if (session.status !== "LIVE") throw connectError("SESSION_ENDED");
  return { actor: { role, participantId: p.id, sessionId: session.id }, displayName: p.displayName };
}

export function createRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, { serveClient: false, cors: { origin: false } });
  const nsp = io.of(SOCKET_NAMESPACE);

  async function stateFor(socket: LiveSocket) {
    const { actor } = socket.data;
    const view = await loadSessionView(actor.sessionId);
    if (!view) throw new AppError("NOT_FOUND");
    if (actor.role === "lecturer") return toLecturerState(view);
    if (actor.role === "projector") return toProjectorState(view);
    return toStudentState(view, { id: actor.participantId, displayName: socket.data.displayName });
  }

  async function broadcastState(sessionId: string) {
    const view = await loadSessionView(sessionId);
    if (!view) return;
    nsp.to(room.role(sessionId, "lecturer")).emit("session:state", (await toLecturerState(view)));
    nsp.to(room.role(sessionId, "projector")).emit("session:state", (await toProjectorState(view)));
    // Sinh viên: mỗi socket nhận projection riêng (đáp án/biểu cảm của chính mình)
    const students = await nsp.in(room.role(sessionId, "student")).fetchSockets();
    for (const s of students) {
      const data = s.data as SocketData;
      if (data.actor.role !== "student") continue;
      s.emit("session:state", toStudentState(view, { id: data.actor.participantId, displayName: data.displayName }));
    }
  }

  // Gộp delta cho giảng viên (throttle 250 ms)
  const pendingDelta = new Map<string, NodeJS.Timeout>();
  function scheduleDelta(sessionId: string) {
    if (pendingDelta.has(sessionId)) return;
    pendingDelta.set(
      sessionId,
      setTimeout(async () => {
        pendingDelta.delete(sessionId);
        const view = await loadSessionView(sessionId);
        if (!view) return;
        nsp.to(room.role(sessionId, "lecturer")).emit("session:delta:lecturer", (await toLecturerDelta(view)));
      }, 250),
    );
  }

  const onState = (id: string) => void broadcastState(id).catch((e) => log.error("broadcast failed", e));
  const onDelta = (id: string) => scheduleDelta(id);
  sessionBus.on("state", onState);
  sessionBus.on("delta", onDelta);

  nsp.use(async (socket, next) => {
    try {
      socket.data = await authenticate(socket as LiveSocket);
      next();
    } catch (e) {
      log.warn("socket auth rejected", { code: (e as { data?: { code?: string } }).data?.code });
      next(e as Error);
    }
  });

  nsp.on("connection", async (raw) => {
    const socket = raw as LiveSocket;
    const { actor } = socket.data;
    socket.join(room.role(actor.sessionId, actor.role));
    if (actor.role === "student") socket.join(room.participant(actor.participantId));

    const pushOwnState = async () => {
      socket.emit("session:state", await stateFor(socket));
    };

    /** Đăng ký một lệnh: kiểm tra vai trò theo bảng quyền + validate payload + trả ack. */
    function on<S extends z.ZodTypeAny>(command: Command, schema: S, run: (input: z.infer<S>) => Promise<unknown>, after?: () => Promise<void>) {
      socket.on(command, (async (payload: unknown, ack?: (r: Ack<Record<string, unknown>>) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          assertCanRun(actor, command);
          const input = schema.safeParse(payload ?? {});
          if (!input.success) throw new AppError("VALIDATION_ERROR", input.error.issues[0]?.message, input.error.issues);
          const result = (await run(input.data)) as Record<string, unknown>;
          reply({ ok: true, ...result });
          if (after) await after();
        } catch (e) {
          const err = e instanceof AppError ? e : new AppError("INTERNAL");
          if (!(e instanceof AppError)) log.error(`command ${command} failed`, e);
          if (err.code === "FORBIDDEN") log.warn("forbidden command", { command, role: actor.role, sessionId: actor.sessionId });
          reply({ ok: false, error: err.toJSON() });
        }
      }));
    }

    const empty = z.object({}).passthrough();

    on("session:join", empty, async () => ({ state: await stateFor(socket) }));

    on("slide:goto", ev.slideGoto, (i) => sessions.gotoSlide(actor, i.index));
    on("qr:toggle", ev.qrToggle, (i) => sessions.toggleQr(actor, i.show));
    on("session:end", empty, () => sessions.endSession(actor));
    on("quiz:open", ev.quizOpen, (i) => quiz.openQuiz(actor, i.questionId));
    on("quiz:close", ev.quizRunId, (i) => quiz.closeQuiz(actor, i.quizRunId));
    on("quiz:publish", ev.quizRunId, (i) => quiz.publishQuiz(actor, i.quizRunId));
    on("quiz:hide", ev.quizRunId, (i) => quiz.hideQuiz(actor, i.quizRunId));
    on("question:update", ev.questionUpdate, (i) => feedback.updateQuestion(actor, i));

    on("quiz:answer", ev.quizAnswer, (i) => quiz.answerQuiz(actor, i.quizRunId, i.optionIndex), pushOwnState);
    on("question:ask", ev.questionAsk, (i) => feedback.askQuestion(actor, i.text));
    on("reaction:set", ev.reactionSet, (i) => feedback.setReaction(actor, i.slideIndex, i.kind), pushOwnState);

    try {
      await pushOwnState();
    } catch (e) {
      log.error("initial state failed", e);
    }
    if (actor.role === "student") {
      db.participant.update({ where: { id: actor.participantId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
  });

  return {
    io,
    close: () => {
      sessionBus.off("state", onState);
      sessionBus.off("delta", onDelta);
      for (const t of pendingDelta.values()) clearTimeout(t);
      return new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
