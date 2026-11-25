/**
 * Script demo "tách quyền" (tiêu chí demo 2, ADR-002): đóng vai một sinh viên đã vào phiên rồi
 * gọi THẲNG vào server (không qua giao diện) để thử các thao tác bị cấm. Tất cả phải bị từ chối.
 *
 * Cách dùng:  npm run demo:attack -- <MÃ_PHIÊN>
 * (server đang chạy ở PUBLIC_URL, mặc định http://localhost:3000)
 */
import { io } from "socket.io-client";

try {
  process.loadEnvFile?.(".env");
} catch {}

const base = process.env.PUBLIC_URL || "http://localhost:3000";
const code = (process.argv[2] || "").toUpperCase();
if (!code) {
  console.error("Thiếu mã phiên. Ví dụ: npm run demo:attack -- TD9G46");
  process.exit(1);
}

const join = await fetch(`${base}/api/s/${code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: "Kẻ tò mò" }),
});
if (!join.ok) {
  console.error("Không vào được phiên:", await join.text());
  process.exit(1);
}
const { participantToken } = (await join.json()) as { participantToken: string };
console.log(`Đã vào phiên ${code} với vai trò SINH VIÊN.\n`);

type Ack = { ok: boolean; error?: { code: string; message: string }; state?: Record<string, unknown> };
const socket = io(`${base}/live`, { auth: { code, role: "student", token: participantToken }, transports: ["websocket"] });
await new Promise<void>((resolve, reject) => {
  socket.once("connect", () => resolve());
  socket.once("connect_error", reject);
});
const emit = (ev: string, payload: unknown) => new Promise<Ack>((r) => socket.emit(ev, payload, r));

const join2 = await emit("session:join", {});
const st = join2.state as { maxPublishedIndex: number; slideCount: number; slides: unknown[] };
const hidden = st.slideCount - 1;
console.log(`Server gửi cho sinh viên ${st.slides.length}/${st.slideCount} slide (slide cao nhất đã công bố: ${st.maxPublishedIndex + 1}).`);
const raw = JSON.stringify(join2.state);
console.log(`Dữ liệu nhận được có ghi chú riêng?  ${/"notes"|"outline"/.test(raw) ? "CÓ  ✗" : "không ✓"}`);
const quiz = (join2.state as { activeQuiz?: { status: string } | null }).activeQuiz;
if (quiz?.status === "PUBLISHED") {
  console.log("Quiz hiện tại đã được giảng viên công bố, nên sinh viên được thấy đáp án (đúng quy tắc).\n");
} else {
  console.log(`Dữ liệu nhận được có đáp án đúng?   ${/"correctIndex"|"explanation"/.test(raw) ? "CÓ  ✗" : "không ✓"}\n`);
}

const attempts: [string, string, unknown][] = [
  ["Đổi slide sang slide cuối", "slide:goto", { index: hidden }],
  ["Mở quiz", "quiz:open", { questionId: "bat-ky" }],
  ["Đóng quiz", "quiz:close", { quizRunId: "bat-ky" }],
  ["Công bố kết quả", "quiz:publish", { quizRunId: "bat-ky" }],
  ["Chiếu câu hỏi lên màn chung", "question:update", { questionId: "bat-ky", spotlight: true }],
  ["Kết thúc phiên", "session:end", {}],
];
for (const [label, ev, payload] of attempts) {
  const r = await emit(ev, payload);
  console.log(`${r.ok ? "✗ ĐƯỢC PHÉP" : "✓ Bị từ chối"}  ${label.padEnd(30)} ${r.ok ? "" : `(${r.error?.code})`}`);
}

const res = await fetch(`${base}/api/s/${code}/slides/${hidden}`, { headers: { authorization: `Bearer ${participantToken}` } });
console.log(`${res.ok ? "✗ ĐƯỢC PHÉP" : "✓ Bị từ chối"}  ${"Tải trực tiếp slide chưa công bố".padEnd(30)} (HTTP ${res.status})`);

socket.disconnect();
process.exit(0);
