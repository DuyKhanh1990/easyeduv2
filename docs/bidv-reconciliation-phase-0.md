# BIDV Reconciliation — Phase 0: Chuẩn hóa đặc tả

## Mục đích

Tài liệu này là hồ sơ chuẩn bị trước khi tiếp tục Phase 1 (gọi API UAT để lấy
file đối soát). Phase 0 chỉ chuẩn hóa đặc tả, mapping và điều kiện nghiệm thu;
không thay đổi luồng `getbill`, `paybill`, webhook, hóa đơn hoặc ví.

Nguồn tham chiếu:

- `attached_assets/Tài_liệu_đặc_tả_Thu_hộ_định_danh_bản_tổng_hợp_V3_(1)_1786344260518.docx`
- `attached_assets/Pasted-D-i-y-l-k-ho-ch-tri-n-khai-chi-ti-t-cho-2-ph-n-theo-ngu_1786344969173.txt`
- `attached_assets/Pasted-1-K-t-n-i-API-BIDV-l-y-file-i-so-t-theo-ng-y-M-c-ti-u-C_1786344089734.txt`

> Tài liệu BIDV hiện có là đặc tả kỹ thuật. Những mục ghi “cần xác nhận”
> dưới đây chưa được coi là thông tin triển khai Production cho đến khi BIDV
> xác nhận bằng văn bản hoặc qua bộ mẫu UAT.

## 1. Phạm vi đã chốt cho đợt đầu

Đợt đầu chỉ thực hiện luồng đọc:

1. Nhân viên Finance chọn ngày giao dịch.
2. Hệ thống chủ động gọi API BIDV.
3. BIDV trả file giao dịch theo ngày.
4. Hệ thống verify response, giải mã/đọc file và lưu bản gốc.
5. Hệ thống hiển thị session và các record.

Chưa thực hiện trong đợt này:

- Gửi file chênh lệch `type = 2`.
- Hoàn tiền.
- Truy thu.
- Tự động sửa/gạch nợ hóa đơn.
- Thay đổi các luồng thanh toán BIDV hiện tại.

## 2. Đặc tả API đã đọc được từ tài liệu BIDV

### 2.1. Endpoint và phương thức

| Hạng mục | Giá trị trong tài liệu | Trạng thái |
|---|---|---|
| OAuth UAT | `https://bidv.net:9303/bidvorg/service/openapi/oauth2/token` | Đã biết |
| API UAT | `https://bidv.net:9303/bidvorg/service/open-banking/paygate/common/reconciliation/v1` | Đã biết |
| Method | `POST` | Đã biết |
| Content-Type | `application/json` cho API nghiệp vụ | Đã biết |
| Production URL | BIDV sẽ cập nhật khi triển khai | **Cần BIDV xác nhận** |

### 2.2. Request lấy file

Request nghiệp vụ sau khi mã hóa JWE có các trường:

```json
{
  "type": "1",
  "providerId": "<BIDV cấp>",
  "serviceId": "<BIDV cấp, optional>",
  "transDate": "YYYYMMDD",
  "fileType": "1"
}
```

Ý nghĩa:

- `type = 1`: BIDV trả file giao dịch thành công theo ngày giao dịch.
- `providerId`: mã nhà cung cấp do BIDV cấp, dài 3 ký tự theo bảng đặc tả.
- `serviceId`: mã dịch vụ, optional ở API nhưng cần xác định có bắt buộc
  theo ứng dụng EasyEdu/từng cơ sở hay không.
- `transDate`: ngày giao dịch, định dạng `YYYYMMDD`.
- `fileType = 1`: file giao dịch hàng ngày trên các kênh khác UNC.

### 2.3. Header bảo mật

| Header | Yêu cầu |
|---|---|
| `Authorization` | `Bearer <access_token>` |
| `Content-Type` | `application/json` |
| `User-Agent` | Đối tác tự quy định |
| `Channel` | Kênh riêng của đối tác |
| `Timestamp` | ISO 8601, ví dụ `2023-02-21T08:09:09.336Z` |
| `X-API-Interaction-ID` | ID duy nhất, 12 chữ số |
| `X-Idempotency-Key` | Optional, dùng phân biệt retry |
| `X-JWS-Signature` | JWS Compact Detached, bắt buộc, RS256 |
| `X-Client-Certificate` | Certificate raw, bỏ PEM header/footer và whitespace |

### 2.4. Mã hóa và ký

- Body `POST`: General JWE JSON Serialization.
- Key management: `A128KW`, `A192KW`, `A256KW` (mặc định `A256KW`).
- Content encryption: `A128GCM` (mặc định), ngoài ra BIDV nêu các thuật toán
  khác được hỗ trợ.
- Request bắt buộc ký JWS detached bằng private key của đối tác.
- Response có thể trả `X-JWS-Signature`; đối tác dùng certificate BIDV cấp để
  verify.
- OAuth mẫu dùng `grant_type=client_credentials`, scope mẫu là
  `read/ewallet`.

### 2.5. Response và mã lỗi riêng của reconciliation

Response thành công có các trường chính:

```json
{
  "type": "1",
  "errorCode": "000",
  "errorDesc": "...",
  "providerId": "...",
  "serviceId": "...",
  "transDate": "YYYYMMDD",
  "fileType": "1",
  "fileName": "...",
  "fileContent": "<Base64>"
}
```

| `errorCode` | Ý nghĩa |
|---|---|
| `000` | Thành công |
| `001` | Không tìm thấy file theo ngày |
| `002` | Sai định dạng message |
| `003` | Sai tên file |
| `004` | Sai chữ ký |
| `005` | Lỗi không xác định |

## 3. Mapping file đối soát

Mỗi dòng chi tiết được phân tách bằng `|` và có ký tự `|` ở cuối. Dòng footer
không có `|` ở cuối và gồm 3 trường:

```text
số dòng giao dịch|tổng số tiền|ngày giờ sinh file
```

### 3.1. Mapping 22 trường chi tiết

| Vị trí | Trường BIDV | Mapping nội bộ hiện tại | Ghi chú Phase 0 |
|---:|---|---|---|
| 0 | Mã kênh giao dịch | `channelCode` | Đã map |
| 1 | Mã dịch vụ/mã xử lý | `serviceId` | Đã map |
| 2 | Mã dịch vụ chi tiết | `rawData[2]` | Chưa có cột riêng |
| 3 | Mã hóa đơn | `billId` | Đã map |
| 4 | Mã khách hàng tại đối tác | `vaCode` | Hiện lưu từ `customerId` |
| 5 | Số tiền giao dịch | `amount` | Đã map |
| 6 | Mã tiền tệ | `currency` | Đã map, mặc định VND |
| 7 | Số Trace | `traceNumber` | Đã map |
| 8 | Giờ khởi tạo | ghép với vị trí 9 | Đã parse |
| 9 | Ngày khởi tạo | `transactionDate` | Đã parse |
| 10 | Giờ thanh toán | ghép với vị trí 11 | Đã parse |
| 11 | Ngày thanh toán | `valueDate` | Đã parse |
| 12 | Tài khoản ghi nợ | `rawData[12]` | Chưa có cột riêng |
| 13 | Tài khoản ghi có | `rawData[13]` | Chưa có cột riêng |
| 14 | Số thẻ | `rawData[14]` | Chưa có cột riêng |
| 15 | Mã thiết bị chấp nhận thẻ | `rawData[15]` | Chưa có cột riêng |
| 16 | Kết quả đối soát | `bankStatus` | Đã map |
| 17 | Yêu cầu của đối tác | `rawData[17]` | Chưa có cột riêng |
| 18 | Loại giao dịch | `transactionType` | Đã map |
| 19 | Thông tin bổ sung | `rawData[19]` | Chưa có cột riêng |
| 20 | ID giao dịch BIDV | `externalTransactionId` | Đã map |
| 21 | REF BIDV | `rawData[21]` | **Cần xác nhận và lưu riêng** |

### 3.2. Điểm mapping cần BIDV xác nhận

Tài liệu phân biệt ID giao dịch BIDV và REF BIDV ở vị trí 20/21. Code hiện
đang lưu vị trí 20 thành `externalTransactionId`, còn vị trí 21 chỉ nằm trong
`rawData`. Trước khi matching phải xác nhận:

- Vị trí 20 chính xác là ID nào.
- Vị trí 21 chính xác là REF CoreBanking nào.
- Trường nào BIDV yêu cầu dùng làm transaction ID chính.
- Trường nào dùng để tra soát/inquiry hoặc đối chiếu sau này.
- `customerId` ở vị trí 4 có phải luôn là VA code được EasyEdu lưu hay không.

## 4. Bảng xác nhận với BIDV

Các mục sau là checklist cần gửi BIDV hoặc xác nhận qua bộ mẫu UAT:

| Mục | Câu hỏi cần xác nhận | Trạng thái |
|---|---|---|
| Endpoint | Production URL chính thức là gì? | Chưa xác nhận |
| Provider | `providerId` của EasyEdu là gì? | Chưa xác nhận trong repo |
| Service | `serviceId` dùng chung hay theo cơ sở? | Chưa xác nhận |
| Scope | Scope OAuth thật cho reconciliation là gì? | Đang dùng mẫu `read/ewallet`, cần xác nhận |
| Ngày | `transDate` là ngày giao dịch, hạch toán hay ngày tạo file? | Cần xác nhận |
| Múi giờ | Dùng `Asia/Ho_Chi_Minh` hay quy ước khác? | Cần xác nhận |
| Sẵn sàng | File ngày D có từ thời điểm nào? | Cần xác nhận |
| Empty | Không có giao dịch trả footer hay `errorCode=001`? | Cần xác nhận |
| Format | File luôn TXT pipe-delimited UTF-8 hay có ZIP/encoding khác? | Cần xác nhận |
| Filename | Quy tắc tên file và mã phiên? | Cần xác nhận |
| Size | File lớn có phân trang/chia phần không? | Cần xác nhận |
| JWE | Symmetric key encoding và thuật toán được cấp cho app? | Cần xác nhận bằng sample |
| JWS | Certificate nào verify response, response có luôn ký không? | Cần xác nhận bằng sample |
| Retry | Mã lỗi nào retry được, giới hạn số lần và khoảng chờ? | Cần xác nhận |
| Rate limit | Tài liệu nêu 100 TPS; hạn mức riêng của app là bao nhiêu? | Cần xác nhận |
| Idempotency | Retry cùng ngày dùng key nào và BIDV giữ key bao lâu? | Cần xác nhận |
| Transaction ID | Mapping vị trí 20/21 và trace/bill/VA? | Cần xác nhận |

## 5. Bộ mẫu bắt buộc trước Phase 1

Hiện repo mới có tài liệu đặc tả, chưa có bộ file/response mẫu BIDV để xác
nhận crypto và parser. Cần nhận tối thiểu:

1. Một response thành công có giao dịch.
2. Một response thành công nhưng file rỗng.
3. Một response lỗi `001` hoặc lỗi định dạng.
4. Nếu có thể: response có `X-JWS-Signature` để verify bằng certificate.
5. Một file có giao dịch `004` và `005` để kiểm thử mapping trạng thái.
6. Một file có nhiều giao dịch và đủ trường REF BIDV.

Không dùng credential, key hoặc secret xuất hiện trong tài liệu mẫu làm
credential triển khai.

## 6. Điều kiện đủ để đóng Phase 0

Phase 0 được xem là đủ điều kiện chuyển sang Phase 1 khi có:

- [ ] Bảng xác nhận endpoint UAT/Production từ BIDV.
- [ ] `providerId`, `serviceId` và scope OAuth chính thức.
- [ ] Xác nhận ngày đối soát, timezone và thời điểm file sẵn sàng.
- [ ] Symmetric key/certificate/private key đã được cấp và lưu an toàn.
- [ ] Bộ response/file mẫu thành công, rỗng và lỗi.
- [ ] Mapping 22 trường được BIDV xác nhận, đặc biệt ID giao dịch và REF.
- [ ] Quy tắc retry, rate limit và idempotency được xác nhận.
- [ ] Quyết định rõ `errorCode=001` là “không có file” hay “file rỗng”.
- [ ] Chấp thuận phạm vi Phase 1 chỉ đọc, chưa gửi `type=2`.

## 7. Trạng thái hiện tại của dự án

- Đã có khung gọi API, JWE/JWS, session/file/record và giao diện lấy file.
- Chưa có đủ bằng chứng UAT từ BIDV để xác nhận toàn bộ mapping và crypto.
- Nút “Lấy file đối soát” hiện còn bị chặn bởi cấu hình nội bộ
  `SYSTEM_ENCRYPTION_KEY`; đây là điều kiện vận hành của Phase 1, không phải
  thay đổi đặc tả BIDV.
- Production URL trong code chưa thể coi là chính thức.
- Chưa triển khai matching, review, phê duyệt, hoàn tiền hoặc truy thu.

**Kết luận:** Phase 0 đã được chuẩn hóa thành checklist và mapping có thể gửi
cho BIDV xác nhận. Chưa chuyển sang Phase 1 và không có thay đổi code nghiệp vụ
trong bước này.