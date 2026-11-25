import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioc, type Socket } from "socket.io-client";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import { createAuthSession } from "@/server/auth/lecturer-session";
import { createRealtime } from "@/server/realtime";
import { createSession, joinSession } from "@/server/services/session-service";
import { projectorTokenFor } from "@/server/projections";
import type { Ack, SessionState } from "@/shared/contracts";

let n = 0;

export async function makeLecturer() {
  n++;
  const user = await db.user.create({
    data: { email: `gv${n}-${Date.now()}@test.local`, name: `GV ${n}`, passwordHash: await hashPassword("matkhau123") },
  });
  const { token } = await createAuthSession(user.id);
  return { user, cookie: `sid=${token}` };
}

/** Bài giảng 6 slide + 1 câu hỏi đã duyệt + 1 câu nháp (theo seed TicketBox, rút gọn). */
export async function makeLecture(ownerId: string, slideCount = 6) {
  const lecture = await db.lecture.create({ data: { ownerId, title: "TicketBox", outline: "Dàn ý bí mật" } });
  const slides = [];
  for (let i = 0; i < slideCount; i++) {
    slides.push(
      await db.slide.create({
        data: { lectureId: lecture.id, position: i, template: i === 0 ? "TITLE" : "CONTENT", title: `Slide ${i + 1}`, body: `Nội dung ${i + 1}`, notes: `GHI_CHU_RIENG_${i + 1}` },
      }),
    );
  }
  const approved = await db.quizQuestion.create({
    data: {
      lectureId: lecture.id,
      prompt: "Nhìn thấy ghế trống có nghĩa là đã giữ được ghế không?",
      options: JSON.stringify(["Có", "Không"]),
      correctIndex: 1,
      explanation: "GIAI_THICH_BI_MAT",
      sourceSlideIds: JSON.stringify([slides[3]?.id].filter(Boolean)),
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  const draft = await db.quizQuestion.create({
    data: { lectureId: lecture.id, prompt: "Câu nháp", options: JSON.stringify(["A", "B"]), correctIndex: 0, status: "DRAFT" },
  });
  return { lecture, slides, approved, draft };
}

export async function startServer() {
  const http: HttpServer = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const rt = createRealtime(http);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const port = (http.address() as AddressInfo).port;
  const clients: Socket[] = [];

  function connect(auth: Record<string, unknown>, cookie?: string) {
    const s = ioc(`http://127.0.0.1:${port}/live`, {
      auth,
      transports: ["websocket"],
      extraHeaders: cookie ? { cookie } : undefined,
      reconnection: false,
      forceNew: true,
    });
    clients.push(s);
    return s;
  }

  return {
    port,
    connect,
    async close() {
      for (const c of clients) c.disconnect();
      await rt.close();
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}

export type Harness = Awaited<ReturnType<typeof startServer>>;

/** Đợi sự kiện session:state thỏa điều kiện. */
export function nextState<T extends SessionState = SessionState>(s: Socket, pred: (st: T) => boolean = () => true, timeout = 3000) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      s.off("session:state", h);
      reject(new Error("timeout waiting for session:state"));
    }, timeout);
    const h = (st: T) => {
      if (pred(st)) {
        clearTimeout(t);
        s.off("session:state", h);
        resolve(st);
      }
    };
    s.on("session:state", h);
  });
}

export function connected(s: Socket) {
  return new Promise<void>((resolve, reject) => {
    if (s.connected) return resolve();
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
}

export function connectError(s: Socket) {
  return new Promise<{ code?: string }>((resolve, reject) => {
    s.once("connect", () => reject(new Error("unexpectedly connected")));
    s.once("connect_error", (e: Error & { data?: { code?: string } }) => resolve(e.data ?? {}));
  });
}

export function emit<T = Record<string, unknown>>(s: Socket, event: string, payload: unknown = {}) {
  return new Promise<Ack<T>>((resolve) => s.emit(event, payload, (r: Ack<T>) => resolve(r)));
}

/** Dựng cả phiên: giảng viên + máy chiếu + n sinh viên đã kết nối, mỗi client đã nhận state đầu. */
export async function setupLive(h: Harness, students = 2) {
  const { user, cookie } = await makeLecturer();
  const data = await makeLecture(user.id);
  const { session } = await createSession(user.id, data.lecture.id);

  const lecturer = h.connect({ code: session.code, role: "lecturer" }, cookie);
  const lecturerFirst = nextState(lecturer);
  const projector = h.connect({ code: session.code, role: "projector", token: projectorTokenFor(session.id) });
  const projectorFirst = nextState(projector);
  const studs = [];
  for (let i = 0; i < students; i++) {
    const j = await joinSession(session.code, { displayName: `SV${i + 1}` });
    const s = h.connect({ code: session.code, role: "student", token: j.participantToken });
    const first = nextState(s);
    studs.push({ socket: s, token: j.participantToken, participantId: j.participant.id, first });
  }
  await Promise.all([lecturerFirst, projectorFirst, ...studs.map((s) => s.first)]);
  return { user, cookie, ...data, session, lecturer, projector, students: studs };
}

/** Duyệt sâu một object, trả các khóa bị cấm tìm thấy. */
export function findKeys(obj: unknown, keys: string[], path = "$"): string[] {
  const found: string[] = [];
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.includes(k)) found.push(`${path}.${k}`);
      found.push(...findKeys(v, keys, `${path}.${k}`));
    }
  }
  return found;
}
