# Triển khai Interactive Class

GitHub Actions chạy TypeScript, Vitest, Playwright và build image Docker. Job production chạy sau khi
các bước này thành công trên `main`. Có thể chạy lại workflow từ tab **Actions** với nhánh `main`.
Job deploy kiểm tra commit còn là đầu nhánh `main` trước khi chuyển bản phát hành.
Local dùng Docker Compose và SQLite riêng theo [README](../README.md).

## Cấu hình GitHub và SSH

Chủ repo tạo environment `production` và giới hạn deployment ở nhánh `main`.
GitHub Actions kết nối SSH trực tiếp đến IP public của VPS qua TCP 22.
[Tài liệu GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

| Tên | Loại | Giá trị |
| --- | --- | --- |
| `VPS_HOST` | Variable | Địa chỉ IP public của VPS |
| `VPS_USER` | Variable | Tài khoản vận hành app trên VPS |
| `VPS_KNOWN_HOSTS` | Variable | Dòng `known_hosts` bắt đầu bằng IP trong `VPS_HOST` và chứa host key SSH đã xác minh |
| `VPS_DEPLOY_KEY` | Secret | Private key SSH riêng dành cho workflow production |

Tài khoản deploy cần quyền Docker và quyền ghi trong `/opt/da-nmcnpm`. Cài [script triển khai](../ops/deploy-vps.sh)
vào `/opt/da-nmcnpm/ci/deploy-vps.sh` với quyền thực thi. Thêm public key tương ứng vào
`authorized_keys` của tài khoản deploy với giới hạn sau.

```text
restrict,command="/opt/da-nmcnpm/ci/deploy-vps.sh" ssh-ed25519 <deploy-public-key>
```

## Vòng đời bản phát hành

Workflow gửi Git archive của commit đã qua CI. VPS build image theo SHA, chạy thử với bản sao SQLite
rồi sao lưu database production trước khi Compose cập nhật app. Bước thay container có thể ngắt kết
nối ngắn. Caddy tiếp tục phục vụ domain hiện có. Cấu hình AI lấy từ `/opt/da-nmcnpm/deploy.env`
và key nằm trong thư mục `/opt/da-nmcnpm/secrets` trên VPS.

Để chạy thử bước build và kiểm tra container trên VPS, dùng SHA của commit local.

```bash
revision=$(git rev-parse HEAD)
git archive --format=tar.gz "$revision" |
  ssh cloud-vps "/opt/da-nmcnpm/ci/deploy-vps.sh --prepare-only $revision"
```

Nếu cập nhật lỗi khi trạng thái migration còn như trước deploy, script khởi động lại image và
cấu hình Compose của bản trước, giữ database trực tiếp. Khi trạng thái migration đã đổi, log sẽ
chỉ ra đường dẫn bản sao SQLite và mã nguồn phát hành để kiểm tra và khôi phục có kiểm soát.
