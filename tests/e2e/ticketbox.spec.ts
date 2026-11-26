/**
 * E2E kịch bản TicketBox với 4 ngữ cảnh trình duyệt riêng: giảng viên, máy chiếu, 2 sinh viên
 * (giả lập điện thoại). Chứng minh 4 tiêu chí demo (docs/prompt.txt mục 4).
 */
import { expect, test, devices, type Browser, type Page, type WebSocketRoute } from "@playwright/test";

const EMAIL = "gv@demo.local";
const PASSWORD = "matkhau123";
const SHOTS = "docs/qa/evidence";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Bài giảng của tôi" })).toBeVisible();
}

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: test.info().project.use.baseURL });
  return ctx.newPage();
}

test("TicketBox: đồng bộ, tách quyền, thu phản hồi, AI hỗ trợ", async ({ browser, page }) => {
  // ---------- Giảng viên: AI tạo slide từ ý tưởng, sửa slide 4, AI tạo quiz, duyệt ----------
  await login(page);
  await page.getByPlaceholder("Tên bài giảng mới").fill("TicketBox (AI)");
  await page.getByRole("button", { name: "+ Tạo bài giảng" }).click();
  await page.getByRole("button", { name: /Tạo slide từ ý tưởng/ }).click();
  await page.getByLabel("Chủ đề / ý tưởng").fill("Giải thích vì sao hai người không thể cùng mua một ghế cho một suất chiếu");
  await page.getByLabel("Số slide").fill("6");
  await page.getByRole("button", { name: "Tạo bằng AI" }).click();
  await expect(page.getByText("Có 6 slide nháp do AI tạo")).toBeVisible();

  // sửa slide 4
  const list = page.getByLabel("Danh sách slide");
  const fourthSlide = list.getByRole("listitem").filter({
    has: page.getByRole("checkbox", { name: "Chọn slide 4 để tạo quiz" }),
  });
  await fourthSlide.getByRole("button").click();
  await page.getByLabel("Tiêu đề").fill("Nhìn thấy ghế trống không đồng nghĩa với đã giữ được ghế");
  await page.getByRole("button", { name: "Xác nhận nội dung" }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();

  // chọn slide 4 → AI tạo quiz → sửa → duyệt
  await page.getByLabel("Chọn slide 4 để tạo quiz").check();
  await page.getByRole("button", { name: /AI tạo quiz từ 1 slide/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tạo bằng AI" }).click();
  await expect(page.getByText("Slide căn cứ – đối chiếu")).toBeVisible();
  await page.getByLabel("Câu hỏi", { exact: true }).fill(
    "An và Bình cùng nhìn thấy ghế A5 đang trống. Chỉ riêng việc nhìn thấy ghế trống có nghĩa là cả hai đã giữ được ghế không?",
  );
  await page.getByRole("button", { name: "Duyệt câu này" }).click();
  await expect(page.getByText("✓ Đã duyệt")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-duyet-quiz.png`, fullPage: true });

  // ---------- Vào lớp ----------
  await page.getByRole("button", { name: "Bắt đầu trình chiếu" }).click();
  await expect(page.getByText("Đang chiếu · slide 1/6")).toBeVisible();
  const code = (await page.locator("b.tracking-widest").first().textContent())!.trim();
  const projectorUrl = await page.getByRole("link", { name: /Mở màn hình chiếu/ }).getAttribute("href");

  const projCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: test.info().project.use.baseURL });
  const projector = await projCtx.newPage();
  await projector.goto(projectorUrl!);
  await expect(projector.getByText(code, { exact: true })).toBeVisible(); // QR + mã khi mời vào lớp

  const s1 = await phone(browser);
  const s2 = await phone(browser);
  const secondStudent: { offline: boolean; transport?: WebSocketRoute } = { offline: false };
  await s2.routeWebSocket(/\/socket\.io\//, async (socket) => {
    if (secondStudent.offline) {
      await socket.close({ code: 1001 });
      return;
    }
    secondStudent.transport = socket;
    socket.connectToServer();
  });
  for (const [s, name] of [[s1, "An"], [s2, "Bình"]] as const) {
    await s.goto(`/join/${code}`);
    await s.getByLabel("Tên hiển thị (không bắt buộc)").fill(name);
    await s.getByRole("button", { name: "Vào lớp" }).click();
    await expect(s.getByText("Slide 1 · đang theo bài giảng")).toBeVisible();
  }
  await expect(page.getByText("2 sinh viên")).toBeVisible();

  // ---------- 1. Đồng bộ đúng ----------
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Tiếp →" }).click();
  await expect(page.getByText("Đang chiếu · slide 4/6")).toBeVisible();
  await expect(projector.getByText("Nhìn thấy ghế trống không đồng nghĩa với đã giữ được ghế")).toBeVisible();
  await expect(s1.getByText("Slide 4 · đang theo bài giảng")).toBeVisible();
  await expect(s2.getByText("Slide 4 · đang theo bài giảng")).toBeVisible();

  // sinh viên xem lại slide 2, "Về bài giảng" → slide 4, không sang được slide 5
  await s1.getByLabel("Slide trước").click();
  await s1.getByLabel("Slide trước").click();
  await expect(s1.getByText(/Slide 2 · đang xem lại/)).toBeVisible();
  await s1.getByRole("button", { name: "Về bài giảng" }).click();
  await expect(s1.getByText("Slide 4 · đang theo bài giảng")).toBeVisible();
  await expect(s1.getByLabel("Slide sau")).toBeDisabled();
  await s1.screenshot({ path: `${SHOTS}/02-sinh-vien-slide4.png` });

  // ---------- 2. Tách đúng quyền (qua giao diện; test API/socket nằm ở tests/integration) ----------
  const slide4Notes = await page.getByText(/Gợi ý: giải thích ý chính 3/).textContent();
  expect(slide4Notes).toBeTruthy();
  await expect(s1.getByText(/Gợi ý: giải thích/)).toHaveCount(0);
  await expect(projector.getByText(/Gợi ý: giải thích/)).toHaveCount(0);
  const s1Html = await s1.content();
  expect(s1Html).not.toContain("Ý chính 4"); // nội dung slide 5 không có trên thiết bị
  await expect(s1.getByRole("button", { name: /Tiếp|Mở quiz|Kết thúc/ })).toHaveCount(0);

  // ---------- 3. Thu phản hồi đúng ----------
  await s1.getByRole("button", { name: "🤔 Em chưa rõ" }).click();
  await s2.getByRole("button", { name: "👍 Em hiểu" }).click();
  await s2.getByLabel("Đặt câu hỏi cho giảng viên").fill("Nếu hai người bấm cùng một mili giây thì sao?");
  await s2.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Nếu hai người bấm cùng một mili giây thì sao?")).toBeVisible();
  await expect(projector.getByText("Nếu hai người bấm cùng một mili giây thì sao?")).toHaveCount(0);

  await page.getByRole("listitem").filter({ hasText: "An và Bình cùng nhìn thấy" }).getByRole("button", { name: "Mở quiz" }).click();
  await expect(projector.getByText("Quiz đang mở – trả lời trên điện thoại")).toBeVisible();
  await s1.getByRole("button", { name: /^A\. Có/ }).click();
  await expect(s1.getByText("Bạn đã nộp. Chờ giảng viên công bố kết quả.")).toBeVisible();
  await expect(s1.getByRole("button", { name: /^B\. Không/ })).toBeDisabled(); // không nộp lại được
  await s2.getByRole("button", { name: /^B\. Không/ }).click();
  await expect(page.getByText("2 / 2 sinh viên đã nộp")).toBeVisible();
  await expect(projector.getByText("Kết quả")).toHaveCount(0); // lớp chưa thấy kết quả

  await page.getByRole("button", { name: "Đóng quiz" }).click();
  await expect(page.getByText("Đã đóng (lớp chưa thấy kết quả)", { exact: true })).toBeVisible();
  await expect(projector.getByText("Quiz đã đóng")).toBeVisible();
  await page.getByRole("button", { name: "Công bố kết quả lên màn chiếu" }).click();
  await expect(projector.getByText("Kết quả", { exact: true })).toBeVisible();
  await expect(projector.getByText("Tổng: 2 lượt nộp")).toBeVisible();
  await expect(s1.getByText("Bạn trả lời chưa đúng.")).toBeVisible();
  await expect(s2.getByText("Bạn trả lời đúng!")).toBeVisible();
  await projector.screenshot({ path: `${SHOTS}/03-may-chieu-ket-qua.png` });
  await page.screenshot({ path: `${SHOTS}/04-bang-dieu-khien.png`, fullPage: true });

  // chiếu câu hỏi cho cả lớp
  await page.getByRole("button", { name: "Gỡ khỏi màn chiếu" }).click();
  await page.getByRole("button", { name: "Chiếu cho cả lớp" }).click();
  await expect(projector.getByText("Nếu hai người bấm cùng một mili giây thì sao?")).toBeVisible();

  // ---------- Mất kết nối rồi kết nối lại ----------
  secondStudent.offline = true;
  if (!secondStudent.transport) throw new Error("Sinh viên thứ hai chưa có kết nối realtime");
  await secondStudent.transport.close({ code: 1001 });
  await expect(s2.getByText("Mất kết nối, đang kết nối lại…")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Tiếp →" }).click();
  await expect(page.getByText("Đang chiếu · slide 5/6")).toBeVisible();
  secondStudent.offline = false;
  await expect(s2.getByText("Slide 5 · đang theo bài giảng")).toBeVisible({ timeout: 15000 });

  // ---------- Kết thúc phiên → báo cáo ----------
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Kết thúc phiên" }).click();
  await expect(page.getByText(`Báo cáo phiên ${code}`)).toBeVisible();
  await expect(page.getByText("Đúng 50%")).toBeVisible();
  await expect(s1.getByText("Phiên đã kết thúc. Cảm ơn bạn đã tham gia!")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-bao-cao.png`, fullPage: true });
});
