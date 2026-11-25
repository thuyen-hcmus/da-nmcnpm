/**
 * Dữ liệu mẫu theo kịch bản "Hai người cùng đặt một ghế trên TicketBox" (docs/prompt.txt mục 4).
 * Giảng viên demo: gv@demo.local / matkhau123
 */
try {
  process.loadEnvFile?.(".env");
} catch {}

const { db } = await import("../src/server/db");
const { hashPassword } = await import("../src/server/auth/crypto");

export const DEMO_EMAIL = "gv@demo.local";
export const DEMO_PASSWORD = "matkhau123";

const slides = [
  { template: "TITLE", title: "Hai người cùng đặt một ghế trên TicketBox", body: "Vì sao không thể bán một ghế cho hai người?", notes: "Chiếu QR ở slide này, chờ lớp vào đủ." },
  { template: "CONTENT", title: "Bối cảnh", body: "Suất chiếu 19:00 còn ghế A5\nAn và Bình cùng mở sơ đồ ghế\nCả hai cùng thấy A5 đang trống", notes: "Hỏi lớp: các bạn đã từng gặp tình huống này chưa?" },
  { template: "CONTENT", title: "Điều người dùng nhìn thấy", body: "Sơ đồ ghế là ảnh chụp tại thời điểm tải trang\nTrạng thái thật nằm ở server\nGiữa lúc xem và lúc bấm có độ trễ", notes: "Nhấn mạnh: giao diện chỉ là bản sao, có thể đã cũ." },
  { template: "CONTENT", title: "Nhìn thấy ghế trống ≠ đã giữ được ghế", body: "Nhìn thấy chỉ là đọc dữ liệu\nGiữ ghế là một thao tác ghi cần server xác nhận\nChỉ một yêu cầu giữ ghế được chấp nhận", notes: "Đây là slide quan trọng nhất. Mở quiz ngay sau slide này." },
  { template: "CONTENT", title: "Server quyết định ai giữ được ghế", body: "Khóa ghế hoặc ràng buộc duy nhất trong CSDL\nYêu cầu đến trước được giữ ghế trong vài phút\nYêu cầu đến sau nhận thông báo ghế đã có người giữ", notes: "Minh họa hai yêu cầu gần như cùng lúc." },
  { template: "CONTENT", title: "Tóm tắt", body: "Giao diện có thể cũ, server là nguồn sự thật\nThao tác giữ ghế phải được xác nhận\nThiết kế cho trường hợp đồng thời ngay từ đầu", notes: "Cho lớp đặt câu hỏi." },
] as const;

const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
if (existing) await db.user.delete({ where: { id: existing.id } });

const user = await db.user.create({
  data: { email: DEMO_EMAIL, name: "Giảng viên Demo", passwordHash: await hashPassword(DEMO_PASSWORD) },
});

const lecture = await db.lecture.create({
  data: {
    ownerId: user.id,
    title: "TicketBox: hai người cùng đặt một ghế",
    outline: "1. Bối cảnh\n2. Nhìn thấy khác giữ được\n3. Server quyết định\n4. Quiz kiểm tra nhanh\n5. Thảo luận",
  },
});

const created = [];
for (let i = 0; i < slides.length; i++) {
  created.push(await db.slide.create({ data: { lectureId: lecture.id, position: i, ...slides[i], source: "MANUAL" } }));
}

const question = await db.quizQuestion.create({
  data: {
    lectureId: lecture.id,
    prompt: "An và Bình cùng nhìn thấy ghế A5 đang trống. Chỉ riêng việc nhìn thấy ghế trống có nghĩa là cả hai đã giữ được ghế không?",
    options: JSON.stringify(["Có", "Không"]),
    correctIndex: 1,
    explanation: "Nhìn thấy ghế trống chỉ là đọc dữ liệu (có thể đã cũ). Chỉ khi server xác nhận yêu cầu giữ ghế thì mới giữ được.",
    sourceSlideIds: JSON.stringify([created[3].id]),
    status: "APPROVED",
    source: "AI",
    approvedAt: new Date(),
  },
});

console.log(`Seed xong: ${DEMO_EMAIL} / ${DEMO_PASSWORD}, bài giảng ${lecture.id}, câu hỏi ${question.id}`);
await db.$disconnect();
