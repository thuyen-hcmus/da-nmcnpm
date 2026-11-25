# Feature Specification: Nền tảng trình chiếu giảng dạy tương tác có AI hỗ trợ

**Feature Branch**: `001-interactive-ai-lectures`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "Dựa trên docs/prompt.txt mục 1 đến 4, đặc tả nền tảng trình chiếu giảng dạy tương tác có AI. Chỉ mô tả hành vi và yêu cầu, không chọn công nghệ."

## Tổng quan

Ứng dụng web cho phép giảng viên soạn slide, trình chiếu và tương tác với cả lớp ngay trong buổi
học. Giảng viên điều khiển trên laptop, máy chiếu hiển thị nội dung chung, sinh viên tham gia bằng
thiết bị cá nhân (quét QR hoặc mở link) để theo dõi slide, trả lời quiz, đặt câu hỏi và gửi biểu
cảm. Giảng viên dùng phản hồi của lớp để quyết định giảng tiếp hay dừng lại giải thích. AI hỗ trợ
soạn bài và tạo câu hỏi; giảng viên luôn quyết định nội dung nào được dùng và khi nào công bố.

Ba vai trò:

- **Giảng viên**: chủ bài giảng và chủ phiên; người duy nhất được điều khiển phiên.
- **Máy chiếu**: màn hình công khai của phiên; chỉ xem.
- **Sinh viên**: người tham gia phiên; xem slide đã công bố và gửi phản hồi.

## Clarifications

### Session 2026-11-25

- Q: Sinh viên tham gia ẩn danh hay nhập tên? → A: Ẩn danh, có ô nhập tên hiển thị tùy chọn;
  không cần tài khoản.
- Q: Môi trường demo? → A: Một laptop chạy cục bộ, chia sẻ màn hình; giảng viên, máy chiếu và
  ≥ 2 sinh viên mở trong các trình duyệt/cửa sổ ẩn danh riêng (sinh viên ở kích thước điện
  thoại). Hệ thống vẫn phải cho phép thiết bị khác trong cùng mạng truy cập khi cần.
- Q: Ngôn ngữ giao diện? → A: Tiếng Việt.
- Q: Cách giảng viên đăng nhập? → A: Email + mật khẩu.
- Q: Giới hạn tệp PowerPoint? → A: Tối đa 20 MB, định dạng .pptx.
- Q: Số nhà cung cấp AI? → A: Đúng một nhà cung cấp.
- Q: Quiz có bao nhiêu đáp án đúng, bao nhiêu lựa chọn? → A: Mỗi câu một đáp án đúng, 2–6 lựa
  chọn (hỗ trợ câu Đúng/Sai dạng 2 lựa chọn).
- Q: Biểu cảm tính thế nào? → A: Mỗi sinh viên có một trạng thái biểu cảm hiện tại theo từng
  slide ("Em hiểu" hoặc "Em chưa rõ"), có thể đổi hoặc bỏ; giảng viên thấy tổng hợp theo slide
  hiện tại.
- Q: Nhiều cửa sổ giảng viên cùng mở một phiên? → A: Cho phép cùng một giảng viên chủ phiên mở
  nhiều cửa sổ; mọi cửa sổ cùng phản ánh một trạng thái và lệnh từ bất kỳ cửa sổ nào đều được
  áp dụng theo thứ tự server nhận. Giảng viên khác (không phải chủ phiên) bị từ chối.
- Q: Quiz liên kết với slide như thế nào? → A: Câu hỏi quiz thuộc bài giảng, có slide căn cứ;
  slide mẫu "quiz" trong bài giảng đặt một câu hỏi đã duyệt vào vị trí trình chiếu. Giảng viên
  có thể mở bất kỳ câu hỏi đã duyệt nào của bài giảng trong phiên, độc lập với slide đang chiếu.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trình chiếu đồng bộ ba giao diện (Priority: P1)

Giảng viên tạo phiên từ một bài giảng, chiếu mã QR/link. Máy chiếu và sinh viên vào phiên. Khi
giảng viên chuyển slide, máy chiếu và thiết bị sinh viên cập nhật ngay mà không cần tải lại.
Sinh viên có thể xem lại slide đã chiếu, bấm "Về bài giảng" để quay lại slide hiện tại, nhưng không
mở được slide chưa công bố.

**Why this priority**: Là tiêu chí demo số 1 và quyết định kiến trúc trọng tâm của báo cáo;
không có luồng này thì mọi tương tác khác vô nghĩa.

**Independent Test**: Dùng một bài giảng mẫu (seed), mở 1 cửa sổ giảng viên, 1 máy chiếu, 2 sinh
viên; chuyển slide và quan sát; thử yêu cầu slide chưa công bố trực tiếp tới server.

**Acceptance Scenarios**:

1. **Given** giảng viên đã tạo phiên và đang ở slide 1, **When** sinh viên mở link/QR của phiên,
   **Then** sinh viên thấy slide 1 (không phải một slide cố định gắn trong link).
2. **Given** phiên đang ở slide 3, **When** giảng viên chuyển sang slide 4, **Then** máy chiếu và
   mọi thiết bị sinh viên đang theo bài giảng hiển thị slide 4 trong vòng 2 giây mà không tải lại.
3. **Given** phiên đang ở slide 4 và slide cao nhất đã công bố là 4, **When** sinh viên mở lại
   slide 2, **Then** sinh viên thấy slide 2 và thiết bị không còn tự theo giảng viên cho tới khi
   bấm "Về bài giảng".
4. **Given** sinh viên đang xem lại slide 2 trong khi phiên ở slide 4, **When** sinh viên bấm
   "Về bài giảng", **Then** thiết bị hiển thị slide 4 và tiếp tục tự theo giảng viên.
5. **Given** slide cao nhất đã công bố là 4, **When** sinh viên yêu cầu slide 5 bằng bất kỳ cách
   nào (giao diện, sửa link, gọi trực tiếp server), **Then** server từ chối và không gửi bất kỳ
   nội dung nào của slide 5.
6. **Given** phiên đang ở slide 4, **When** một sinh viên vào muộn, **Then** sinh viên thấy ngay
   slide 4 và có thể xem lại slide 1–4.
7. **Given** sinh viên hoặc máy chiếu mất kết nối trong khi giảng viên chuyển từ slide 4 sang 6,
   **When** kết nối được khôi phục, **Then** thiết bị tự lấy lại trạng thái hiện tại (slide 6,
   quiz đang mở nếu có) mà không cần tải lại trang, và hiển thị chỉ báo "đang kết nối lại" trong
   lúc mất kết nối.
8. **Given** giảng viên quay lại slide 2 sau khi đã chiếu tới slide 5, **When** sinh viên xem lại,
   **Then** sinh viên vẫn xem được slide 1–5 (slide cao nhất đã công bố không giảm).

---

### User Story 2 - Tách quyền giữa giảng viên, máy chiếu và sinh viên (Priority: P1)

Chỉ giảng viên chủ phiên mới thấy ghi chú riêng, dàn ý, bảng điều khiển và mới gửi được lệnh điều
khiển. Máy chiếu chỉ thấy nội dung công khai. Sinh viên chỉ thấy slide đã công bố và chỉ gửi được
phản hồi của chính mình.

**Why this priority**: Tiêu chí demo số 2 và quyết định kiến trúc thứ hai của báo cáo.

**Independent Test**: Với vai trò sinh viên và máy chiếu, gửi trực tiếp các lệnh điều khiển và các
yêu cầu dữ liệu tới server; kiểm tra dữ liệu nhận được không chứa ghi chú/slide chưa công bố/đáp án.

**Acceptance Scenarios**:

1. **Given** một slide có ghi chú riêng, **When** slide đó được công bố, **Then** dữ liệu gửi tới
   máy chiếu và sinh viên không chứa ghi chú riêng hay dàn ý.
2. **Given** người dùng có vai trò sinh viên hoặc máy chiếu, **When** gửi lệnh đổi slide, mở/đóng
   quiz, công bố kết quả, duyệt câu hỏi hay kết thúc phiên, **Then** server từ chối với lỗi không
   có quyền và trạng thái phiên không đổi.
3. **Given** một giảng viên khác đã đăng nhập nhưng không phải chủ phiên, **When** người này gửi
   lệnh điều khiển phiên, **Then** server từ chối.
4. **Given** quiz đang mở hoặc đã đóng nhưng chưa công bố, **When** sinh viên/máy chiếu nhận dữ
   liệu quiz, **Then** dữ liệu không chứa đáp án đúng, giải thích, hay số liệu tổng hợp lựa chọn.
5. **Given** giảng viên chưa đăng nhập, **When** truy cập trang quản lý bài giảng hoặc bảng điều
   khiển, **Then** được chuyển tới trang đăng nhập.

---

### User Story 3 - Thu phản hồi: quiz, câu hỏi, biểu cảm (Priority: P1)

Giảng viên mở một câu hỏi quiz đã duyệt; sinh viên nộp đáp án (mỗi người một lượt); giảng viên
thấy số người đã nộp và phân bố lựa chọn trên laptop; đóng quiz; rồi mới chọn công bố kết quả lên
máy chiếu và thiết bị sinh viên. Sinh viên gửi câu hỏi (chỉ giảng viên thấy cho tới khi duyệt chiếu)
và biểu cảm "Em hiểu"/"Em chưa rõ".

**Why this priority**: Tiêu chí demo số 3; là giá trị cốt lõi "giảng viên dùng phản hồi để quyết
định giảng tiếp hay dừng".

**Independent Test**: Với seed TicketBox và 2 sinh viên: mở quiz, nộp, nộp lại, đóng, nộp sau khi
đóng, công bố; gửi câu hỏi và biểu cảm; kiểm tra số liệu và nơi hiển thị.

**Acceptance Scenarios**:

1. **Given** câu hỏi ở trạng thái Đã duyệt, **When** giảng viên chọn "Mở quiz", **Then** câu hỏi
   chuyển sang Đang mở; sinh viên thấy nội dung câu hỏi và các lựa chọn; máy chiếu thấy câu hỏi
   và các lựa chọn nhưng không thấy kết quả.
2. **Given** câu hỏi ở trạng thái Nháp, **When** giảng viên cố mở nó (kể cả gọi trực tiếp server),
   **Then** hệ thống từ chối.
3. **Given** quiz đang mở, **When** sinh viên nộp đáp án, **Then** sinh viên thấy xác nhận "đã
   nộp", giảng viên thấy số người đã nộp tăng lên; sinh viên khác và máy chiếu không thấy lựa chọn
   của người khác.
4. **Given** sinh viên đã nộp cho câu này, **When** sinh viên nộp lại (kể cả gửi đồng thời nhiều
   yêu cầu), **Then** chỉ một lượt nộp được tính, lượt đầu tiên được giữ, và sinh viên nhận thông
   báo đã nộp rồi.
5. **Given** giảng viên đã đóng quiz, **When** sinh viên nộp đáp án, **Then** server từ chối và
   sinh viên thấy thông báo "quiz đã đóng".
6. **Given** quiz đã đóng, **When** giảng viên chọn "Công bố kết quả", **Then** máy chiếu hiển thị
   biểu đồ phân bố lựa chọn và đáp án đúng; sinh viên thấy đáp án đúng, giải thích và đáp án mình
   đã chọn đúng hay sai.
7. **Given** quiz đang mở, **When** giảng viên muốn công bố kết quả, **Then** hệ thống yêu cầu đóng
   quiz trước (không thể công bố khi đang mở).
8. **Given** sinh viên gửi câu hỏi, **When** câu hỏi được gửi, **Then** câu hỏi chỉ hiện trên giao
   diện giảng viên; không hiện trên máy chiếu hay thiết bị sinh viên khác.
9. **Given** giảng viên chọn "Chiếu cho cả lớp" một câu hỏi, **When** thao tác hoàn tất, **Then**
   câu hỏi hiện trên máy chiếu; giảng viên có thể ẩn lại hoặc đánh dấu đã trả lời.
10. **Given** sinh viên đang ở phiên, **When** sinh viên gửi "Em chưa rõ" cho slide hiện tại rồi đổi
    sang "Em hiểu", **Then** tổng hợp trên giao diện giảng viên tính sinh viên đó một lần, ở trạng
    thái "Em hiểu".

---

### User Story 4 - AI hỗ trợ soạn slide và quiz, giảng viên duyệt (Priority: P2)

Giảng viên nhập ý tưởng (chủ đề, đối tượng học, số slide mong muốn) để AI tạo bộ slide nháp; hoặc
dán văn bản để AI rút gọn, chia slide, gợi ý ghi chú. Giảng viên chọn một hay vài slide để AI tạo
quiz nháp kèm slide căn cứ; giảng viên sửa và duyệt từng câu trước khi dùng trong phiên.

**Why this priority**: Tiêu chí demo số 4. Đặt P2 vì luồng trình chiếu/tương tác (P1) phải chạy
được với nội dung soạn tay trước.

**Independent Test**: Nhập ý tưởng TicketBox, nhận 6 slide nháp; sửa slide 4; chọn slide 4 tạo
quiz; sửa và duyệt; mở quiz trong phiên. Giả lập AI lỗi/timeout/sai định dạng.

**Acceptance Scenarios**:

1. **Given** giảng viên nhập chủ đề, đối tượng học và số slide (1–20), **When** yêu cầu AI tạo,
   **Then** hệ thống hiển thị trạng thái "AI đang tạo", rồi thêm bộ slide nháp đúng số lượng
   (± 0) với các mẫu tiêu đề/nội dung và ghi chú gợi ý, đánh dấu "Nháp AI".
2. **Given** giảng viên dán văn bản (tối đa 20.000 ký tự), **When** chọn "Chia thành slide",
   **Then** AI tạo các slide nháp tóm tắt nội dung; **When** chọn "Rút gọn" hoặc "Gợi ý ghi chú"
   trên slide đang có, **Then** AI trả về đề xuất để giảng viên chấp nhận hoặc bỏ, không tự ghi đè.
3. **Given** giảng viên chọn slide 4, **When** yêu cầu AI tạo quiz (1–5 câu), **Then** mỗi câu nháp
   có nội dung, 2–6 lựa chọn, một đáp án đúng, giải thích ngắn và tham chiếu slide căn cứ (slide 4)
   hiển thị cạnh câu hỏi khi duyệt.
4. **Given** câu hỏi nháp, **When** giảng viên sửa nội dung/lựa chọn/đáp án rồi bấm "Duyệt",
   **Then** câu chuyển sang Đã duyệt và có thể mở trong phiên; sửa lại câu đã duyệt đưa nó về Nháp.
5. **Given** AI lỗi, quá thời gian chờ (30 giây) hoặc trả về sai định dạng, **When** giảng viên yêu
   cầu tạo, **Then** hệ thống hiển thị thông báo lỗi rõ ràng, cho phép thử lại, và không thay đổi
   slide/câu hỏi hiện có.

---

### User Story 5 - Quản lý bài giảng và trình soạn thảo (Priority: P2)

Giảng viên đăng ký, đăng nhập, quản lý danh sách bài giảng (tạo, sửa, xóa, nhân bản) và soạn slide
bằng trình soạn thảo giới hạn 3 mẫu (tiêu đề, nội dung, quiz): sửa văn bản, đổi thứ tự, ghi chú
thuyết trình, dàn ý.

**Why this priority**: Nền tảng cho mọi luồng khác, nhưng có thể thay bằng dữ liệu seed khi kiểm thử
P1.

**Independent Test**: Đăng ký tài khoản mới, tạo bài giảng, thêm/sửa/sắp xếp/xóa slide, nhân bản và
xóa bài giảng.

**Acceptance Scenarios**:

1. **Given** email chưa đăng ký, **When** giảng viên đăng ký với email hợp lệ và mật khẩu ≥ 8 ký tự,
   **Then** tài khoản được tạo và giảng viên được đăng nhập.
2. **Given** sai email hoặc mật khẩu, **When** đăng nhập, **Then** hiển thị lỗi chung (không tiết lộ
   trường nào sai).
3. **Given** giảng viên có bài giảng, **When** chọn "Nhân bản", **Then** tạo bài giảng mới với bản
   sao slide và câu hỏi (câu hỏi giữ trạng thái duyệt), không sao chép phiên và phản hồi cũ.
4. **Given** bài giảng có phiên đang diễn ra, **When** giảng viên xóa bài giảng, **Then** hệ thống
   yêu cầu kết thúc phiên trước.
5. **Given** trình soạn thảo, **When** giảng viên thêm slide mẫu tiêu đề/nội dung/quiz, kéo đổi thứ
   tự, sửa ghi chú và dàn ý, **Then** thay đổi được lưu và hiển thị đúng thứ tự khi trình chiếu.
6. **Given** giảng viên A, **When** cố xem/sửa bài giảng của giảng viên B, **Then** bị từ chối.

---

### User Story 6 - Nhập PowerPoint (Priority: P3)

Giảng viên nhập tệp .pptx; hệ thống trích xuất tiêu đề, văn bản và ghi chú của từng slide vào trình
soạn thảo dưới dạng slide mẫu tiêu đề/nội dung; giảng viên sửa và có thể nhờ AI viết lại/bổ sung.

**Why this priority**: Cách tạo thứ ba, ít rủi ro demo nhất; không cần giữ hiệu ứng/bố cục.

**Independent Test**: Nhập một tệp .pptx hợp lệ, một tệp hỏng, một tệp > 20 MB, một tệp không phải
.pptx.

**Acceptance Scenarios**:

1. **Given** tệp .pptx hợp lệ ≤ 20 MB, **When** nhập, **Then** mỗi slide trong tệp thành một slide
   trong bài giảng theo đúng thứ tự, với tiêu đề, văn bản và ghi chú được trích xuất.
2. **Given** tệp hỏng hoặc không phải .pptx, **When** nhập, **Then** hiển thị lỗi "tệp không hợp lệ"
   và không tạo slide nào.
3. **Given** tệp > 20 MB, **When** nhập, **Then** bị từ chối với thông báo giới hạn kích thước,
   trước khi xử lý nội dung.
4. **Given** slide đã nhập, **When** giảng viên chọn "AI viết lại" hoặc "AI bổ sung", **Then** AI trả
   về đề xuất để giảng viên chấp nhận hoặc bỏ.

---

### User Story 7 - Kết thúc phiên và báo cáo sau buổi (Priority: P3)

Giảng viên kết thúc phiên và xem báo cáo: kết quả từng quiz, danh sách câu hỏi của sinh viên,
thống kê biểu cảm theo slide, số người tham gia.

**Why this priority**: Hoàn thiện vòng đời phiên; không thuộc 4 tiêu chí demo trực tiếp.

**Independent Test**: Chạy kịch bản TicketBox tới cuối, kết thúc phiên, mở báo cáo.

**Acceptance Scenarios**:

1. **Given** phiên đang diễn ra, **When** giảng viên chọn "Kết thúc phiên", **Then** máy chiếu và
   sinh viên thấy "Phiên đã kết thúc", mọi quiz đang mở được đóng, không nhận thêm phản hồi.
2. **Given** phiên đã kết thúc, **When** sinh viên mở link phiên, **Then** thấy thông báo "Phiên đã
   kết thúc" và không xem được nội dung.
3. **Given** phiên đã kết thúc, **When** giảng viên mở báo cáo, **Then** thấy số người tham gia, kết
   quả từng câu quiz (phân bố lựa chọn, tỉ lệ đúng), danh sách câu hỏi và thống kê biểu cảm theo
   slide.

---

### Edge Cases

- Mã phiên không hợp lệ hoặc không tồn tại: hiển thị "Không tìm thấy phiên", không tiết lộ thông
  tin khác.
- Sinh viên vào sau khi phiên kết thúc: thông báo "Phiên đã kết thúc".
- Sinh viên mất mạng giữa lúc nộp quiz: khi kết nối lại, thiết bị biết mình đã nộp hay chưa theo
  trạng thái server; nếu quiz đã đóng thì không cho nộp.
- Sinh viên tải lại trang hoặc đóng/mở lại cửa sổ trong cùng trình duyệt: vẫn là cùng người tham
  gia (giữ lượt nộp, tên hiển thị); cửa sổ ẩn danh/trình duyệt khác là người tham gia khác.
- Nộp trùng đồng thời (nhiều yêu cầu cùng lúc): chỉ một lượt được ghi nhận.
- Giảng viên chuyển slide liên tục nhanh: mọi client hội tụ về cùng slide cuối cùng.
- Giảng viên mở nhiều cửa sổ cùng phiên: mọi cửa sổ đồng bộ; giảng viên khác bị từ chối.
- Giảng viên mất kết nối: phiên vẫn tiếp tục ở trạng thái cuối; khi kết nối lại bảng điều khiển
  lấy lại trạng thái, gồm số liệu quiz và câu hỏi.
- Mở quiz thứ hai khi quiz khác đang mở: hệ thống yêu cầu đóng quiz đang mở trước (mỗi phiên tối
  đa một quiz đang mở).
- Bài giảng không có slide: không thể tạo phiên.
- Sửa bài giảng khi đang có phiên: phiên dùng nội dung tại thời điểm tạo phiên (bản chụp), không
  thay đổi giữa buổi.
- AI trả về số slide khác yêu cầu, nội dung rỗng, JSON sai: coi là lỗi định dạng; không lưu kết
  quả một phần.
- Tệp .pptx có slide không có văn bản: tạo slide trống để giảng viên điền.
- Câu hỏi sinh viên rỗng hoặc quá dài (> 500 ký tự): bị từ chối với lỗi validation.
- Tên hiển thị trùng giữa các sinh viên: cho phép; hệ thống phân biệt bằng danh tính người tham gia.

## Requirements *(mandatory)*

### Functional Requirements

**Tài khoản và quyền**

- **FR-001**: Hệ thống MUST cho phép giảng viên đăng ký, đăng nhập và đăng xuất bằng email và mật
  khẩu (≥ 8 ký tự); mật khẩu không được lưu dạng đọc được.
- **FR-002**: Hệ thống MUST chỉ cho giảng viên truy cập và thay đổi bài giảng, câu hỏi và phiên
  của chính mình.
- **FR-003**: Sinh viên MUST tham gia phiên mà không cần tài khoản, với tên hiển thị tùy chọn
  (≤ 40 ký tự; để trống thì hiển thị là "Ẩn danh"); danh tính người tham gia gắn với phiên và với
  trình duyệt đã tham gia.
- **FR-004**: Máy chiếu MUST tham gia phiên với vai trò chỉ xem qua một đường dẫn máy chiếu do giảng
  viên mở từ bảng điều khiển; đường dẫn này không cấp quyền điều khiển.
- **FR-005**: Server MUST kiểm tra vai trò cho mọi yêu cầu và chỉ chấp nhận lệnh điều khiển (đổi
  slide, mở/đóng quiz, công bố kết quả, duyệt/ẩn câu hỏi sinh viên, bật/tắt QR trên máy chiếu, kết
  thúc phiên) từ giảng viên đã xác thực là chủ phiên.

**Soạn bài**

- **FR-010**: Giảng viên MUST tạo, đổi tên, xóa và nhân bản bài giảng; danh sách bài giảng hiển thị
  tên, số slide và thời điểm sửa gần nhất.
- **FR-011**: Trình soạn thảo MUST hỗ trợ đúng 3 mẫu slide: tiêu đề (tiêu đề + phụ đề), nội dung
  (tiêu đề + danh sách ý/đoạn văn), quiz (tham chiếu một câu hỏi đã duyệt).
- **FR-012**: Giảng viên MUST sửa văn bản, thêm, xóa, đổi thứ tự slide, sửa ghi chú thuyết trình
  từng slide và dàn ý bài giảng; thay đổi được lưu bền vững.
- **FR-013**: Giảng viên MUST tạo bài giảng theo 3 cách: soạn tay/dán văn bản, nhập ý tưởng cho AI,
  nhập tệp .pptx.

**AI**

- **FR-020**: Hệ thống MUST tạo bộ slide nháp từ chủ đề, đối tượng học và số slide mong muốn (1–20).
- **FR-021**: Hệ thống MUST chia văn bản dán (≤ 20.000 ký tự) thành slide nháp, rút gọn nội dung
  slide và gợi ý ghi chú thuyết trình; với slide đã có, kết quả AI là đề xuất mà giảng viên chấp
  nhận hoặc bỏ.
- **FR-022**: Hệ thống MUST tạo 1–5 câu quiz nháp từ một hoặc vài slide được chọn; mỗi câu có nội
  dung, 2–6 lựa chọn, đúng một đáp án đúng, giải thích ngắn và tham chiếu tới slide căn cứ.
- **FR-023**: Mọi nội dung do AI tạo MUST ở trạng thái Nháp và được đánh dấu là do AI tạo cho tới
  khi giảng viên duyệt hoặc chỉnh sửa và chấp nhận.
- **FR-024**: Hệ thống MUST kiểm tra định dạng đầu ra AI; khi AI lỗi, quá 30 giây hoặc sai định dạng,
  MUST báo lỗi rõ ràng, cho thử lại và không thay đổi dữ liệu hiện có.
- **FR-025**: Hệ thống MUST dùng đúng một nhà cung cấp AI.

**Quiz**

- **FR-030**: Câu hỏi quiz MUST có vòng đời: Nháp → Đã duyệt → Đang mở → Đã đóng → Đã công bố kết
  quả. Chỉ câu Đã duyệt mới mở được trong phiên; sửa câu Đã duyệt đưa nó về Nháp.
- **FR-031**: Giảng viên MUST tạo, sửa và xóa câu hỏi quiz thủ công, và MUST duyệt từng câu; khi
  duyệt, slide căn cứ (nếu có) được hiển thị cạnh câu hỏi.
- **FR-032**: Trong một phiên, mỗi câu hỏi có vòng đời mở/đóng/công bố riêng của phiên đó; mỗi phiên
  có tối đa một quiz đang mở tại một thời điểm.
- **FR-033**: Mỗi người tham gia MUST chỉ có tối đa một lượt nộp được tính cho mỗi câu trong mỗi
  phiên, kể cả khi gửi đồng thời; lượt nộp không sửa được.
- **FR-034**: Hệ thống MUST từ chối lượt nộp khi quiz không ở trạng thái Đang mở.
- **FR-035**: Khi quiz đang mở hoặc đã đóng chưa công bố, giảng viên MUST thấy số người đã nộp và
  phân bố lựa chọn; máy chiếu và sinh viên MUST không nhận đáp án đúng, giải thích hay phân bố.
- **FR-036**: Công bố kết quả MUST chỉ thực hiện được sau khi đóng; khi công bố, máy chiếu hiển thị
  biểu đồ phân bố và đáp án đúng, sinh viên thấy đáp án đúng, giải thích và kết quả của mình.

**Phiên và đồng bộ**

- **FR-040**: Giảng viên MUST tạo phiên từ một bài giảng có ít nhất một slide; phiên có mã tham gia
  ngắn, link và mã QR dẫn tới phiên (không tới slide cụ thể). Nội dung phiên là bản chụp bài giảng
  tại lúc tạo phiên.
- **FR-041**: Server MUST là nguồn trạng thái duy nhất của phiên: slide hiện tại, slide cao nhất đã
  công bố, quiz đang mở/đã công bố, trạng thái QR trên máy chiếu, trạng thái phiên (đang diễn ra/đã
  kết thúc).
- **FR-042**: Khi trạng thái phiên thay đổi, mọi client của phiên MUST được cập nhật mà không cần
  tải lại trang.
- **FR-043**: Khi client kết nối, vào muộn hoặc kết nối lại, server MUST gửi trạng thái hiện tại đầy
  đủ (đã lọc theo vai trò); client MUST hiển thị chỉ báo khi mất kết nối và tự kết nối lại.
- **FR-044**: Slide cao nhất đã công bố MUST bằng chỉ số lớn nhất từng được giảng viên chiếu trong
  phiên và không bao giờ giảm.
- **FR-045**: Server MUST chỉ gửi cho sinh viên và máy chiếu nội dung slide có chỉ số ≤ slide cao
  nhất đã công bố, và không bao giờ gửi ghi chú riêng hay dàn ý.
- **FR-046**: Sinh viên MUST xem lại được mọi slide đã công bố, có chế độ "theo bài giảng" mặc định
  và nút "Về bài giảng" để quay lại slide hiện tại.
- **FR-047**: Giao diện giảng viên MUST hiển thị slide hiện tại, slide kế tiếp, ghi chú riêng, dàn ý,
  điều khiển chuyển slide, QR/link, điều khiển quiz, số người tham gia, câu hỏi và tổng hợp biểu cảm.
- **FR-048**: Giảng viên MUST bật/tắt hiển thị QR + link tham gia trên máy chiếu.
- **FR-049**: Giảng viên MUST kết thúc phiên; sau đó phiên không nhận phản hồi và người tham gia
  thấy thông báo phiên đã kết thúc.

**Câu hỏi và biểu cảm của sinh viên**

- **FR-050**: Sinh viên MUST gửi câu hỏi (1–500 ký tự) cho giảng viên trong phiên đang diễn ra.
- **FR-051**: Câu hỏi sinh viên MUST mặc định chỉ hiển thị cho giảng viên; giảng viên có thể đánh
  dấu đã trả lời, chiếu cho cả lớp, hoặc ẩn khỏi màn chiếu. Câu hỏi được chiếu hiển thị trên máy
  chiếu, kèm tên hiển thị của người hỏi chỉ khi người hỏi không ẩn danh.
- **FR-052**: Sinh viên MUST gửi biểu cảm "Em hiểu" hoặc "Em chưa rõ" cho slide hiện tại; mỗi sinh
  viên có tối đa một trạng thái biểu cảm cho mỗi slide (có thể đổi hoặc bỏ).
- **FR-053**: Giảng viên MUST thấy tổng hợp biểu cảm của slide hiện tại (số "Em hiểu", số "Em chưa
  rõ", số người tham gia) cập nhật theo thời gian thực.

**Báo cáo và vận hành**

- **FR-060**: Sau khi kết thúc phiên, giảng viên MUST xem được báo cáo: số người tham gia, kết quả
  từng câu quiz (phân bố, tỉ lệ đúng), danh sách câu hỏi và thống kê biểu cảm theo slide.
- **FR-061**: Hệ thống MUST nhập tệp .pptx ≤ 20 MB, trích tiêu đề, văn bản và ghi chú theo thứ tự
  slide; từ chối tệp hỏng/sai định dạng/quá lớn với thông báo rõ ràng và không tạo dữ liệu dở dang.
- **FR-062**: Giao diện MUST bằng tiếng Việt và dùng được ở kích thước điện thoại (sinh viên), laptop
  (giảng viên) và màn hình chiếu 16:9 (chữ lớn, tương phản cao).
- **FR-063**: Hệ thống MUST cung cấp dữ liệu mẫu theo kịch bản TicketBox (giảng viên mẫu, bài giảng
  6 slide, câu quiz đã duyệt từ slide 4) để demo và kiểm thử.
- **FR-064**: Hệ thống MUST ghi log lỗi và các lần bị từ chối quyền mà không ghi bí mật hay mật khẩu.

### Key Entities

- **Giảng viên (User)**: tài khoản đăng nhập; sở hữu bài giảng và phiên.
- **Bài giảng (Lecture)**: tên, dàn ý, danh sách slide có thứ tự, chủ sở hữu.
- **Slide**: thuộc bài giảng; thứ tự, mẫu (tiêu đề/nội dung/quiz), nội dung, ghi chú riêng, nguồn
  (thủ công/AI/PPTX), trạng thái nháp AI.
- **Câu hỏi quiz (Quiz Question)**: thuộc bài giảng; nội dung, các lựa chọn, đáp án đúng, giải
  thích, slide căn cứ, trạng thái (Nháp/Đã duyệt), nguồn (thủ công/AI).
- **Phiên (Session)**: tạo từ bài giảng (bản chụp nội dung); mã tham gia, chủ phiên, slide hiện tại,
  slide cao nhất đã công bố, trạng thái QR, trạng thái phiên, thời điểm bắt đầu/kết thúc.
- **Quiz trong phiên (Session Quiz Run)**: một câu hỏi được dùng trong phiên; trạng thái Đang mở/Đã
  đóng/Đã công bố, thời điểm mở/đóng/công bố.
- **Người tham gia (Participant)**: sinh viên trong một phiên; tên hiển thị (tùy chọn), danh tính
  gắn với trình duyệt, thời điểm tham gia.
- **Lượt nộp (Answer)**: người tham gia × quiz trong phiên, lựa chọn, thời điểm; duy nhất theo cặp.
- **Câu hỏi sinh viên (Student Question)**: thuộc phiên; nội dung, người hỏi, trạng thái (mới/đã trả
  lời/đang chiếu/đã ẩn), thời điểm.
- **Biểu cảm (Reaction)**: người tham gia × slide trong phiên; loại "Em hiểu"/"Em chưa rõ"; duy nhất
  theo cặp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khi giảng viên chuyển slide, máy chiếu và 100% thiết bị sinh viên đang theo bài giảng
  hiển thị slide mới trong vòng 2 giây trên mạng cục bộ, không tải lại trang.
- **SC-002**: Trong 100% thử nghiệm trực tiếp tới server với vai trò sinh viên/máy chiếu, không có
  phản hồi nào chứa ghi chú riêng, slide chưa công bố, hay đáp án đúng trước khi công bố; 100% lệnh
  điều khiển từ vai trò không phải chủ phiên bị từ chối.
- **SC-003**: Với 20 lượt nộp đồng thời lặp lại từ cùng một người tham gia, đúng 1 lượt được tính;
  0 lượt được nhận sau khi quiz đóng.
- **SC-004**: Thiết bị mất kết nối tới 60 giây tự hiển thị đúng trạng thái hiện tại trong vòng 5 giây
  sau khi có lại mạng.
- **SC-005**: Giảng viên mới hoàn thành luồng "ý tưởng → 6 slide nháp → sửa 1 slide → tạo quiz từ slide
  → duyệt → mở trong phiên" trong dưới 10 phút.
- **SC-006**: 100% câu hỏi do AI tạo được hiển thị kèm slide căn cứ khi duyệt; 0 câu chưa duyệt mở
  được trong phiên.
- **SC-007**: Sinh viên tham gia phiên (từ lúc mở link/QR tới khi thấy slide) trong dưới 30 giây,
  không cần tạo tài khoản.
- **SC-008**: Kịch bản demo TicketBox chạy trọn vẹn với 1 giảng viên, 1 máy chiếu và ≥ 2 sinh viên,
  chứng minh đủ 4 tiêu chí: đồng bộ, tách quyền, thu phản hồi, AI hỗ trợ thật.
- **SC-009**: Hệ thống phục vụ một phiên 60 người tham gia đồng thời mà vẫn đạt SC-001.

## Assumptions

- Quy mô: một lớp học tối đa ~60 người tham gia mỗi phiên; vài giảng viên dùng đồng thời (môi trường
  đồ án, không phải sản phẩm thương mại).
- Demo chính chạy trên một laptop, chia sẻ màn hình; các cửa sổ trình duyệt riêng đóng vai giảng viên,
  máy chiếu và từng sinh viên. Hai cửa sổ cùng hồ sơ trình duyệt được xem là cùng một người tham gia.
- Dữ liệu phiên và phản hồi được giữ lại để xem báo cáo; không có yêu cầu xóa tự động.
- Không có chỉnh sửa cộng tác nhiều người, không giữ hiệu ứng/bố cục PowerPoint, không có ứng dụng
  di động native, không có nhiều nhà cung cấp AI, không có quên mật khẩu qua email.
- Chỉ trình duyệt hiện đại (Chrome, Edge, Firefox, Safari phiên bản gần đây).
- Kết quả AI phụ thuộc vào dịch vụ bên ngoài; demo cần có kết nối Internet cho phần AI, còn luồng
  trình chiếu/tương tác không phụ thuộc AI.
- Ảnh/hình trong slide nằm ngoài phạm vi MVP (chỉ văn bản).
