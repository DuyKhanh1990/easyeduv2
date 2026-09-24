# Kiểm kê nguồn ghi thời gian EasyEdu

Kiểm kê ngày 24/09/2026 trên PostgreSQL **đang dùng thật**, chỉ đọc. Tài liệu này tách **mặc định trong schema**, **đường ghi ứng dụng** và **nguồn của từng dòng lịch sử**; không dùng một loại bằng chứng thay cho loại khác. Chưa chạy chuyển đổi dữ liệu hoặc đổi kiểu cột.

## Phạm vi

DB có **301 cột `timestamp without time zone` trên 160 bảng**. Đối chiếu bằng AST với `shared/schema.ts`: cả 301 cột đều có khai báo; schema còn một cột của bảng `test_session_content_attempts` chưa có trong DB. Các cột đã là `timestamptz` không nằm trong 301 cột này.

| Loại cột | Số cột trong DB | Điều mặc định chứng minh được |
| --- | ---: | --- |
| `created_at` có DB default | 145 | Chỉ khi INSERT không truyền giá trị: lấy giờ của phiên DB |
| `updated_at` có DB default | 103 | Chỉ khi INSERT không truyền giá trị; **không** tự đổi khi UPDATE |
| Tên khác có DB default | 14 | Chỉ khi đường ghi bỏ qua cột đó |
| Tên khác không có default | 39 | Không thể suy nguồn ghi từ schema |

Phiên DB hiện dùng `Asia/Ho_Chi_Minh`: `now()::timestamp` cho thành phần giờ Việt Nam. **Không cộng các số ở bảng này để suy ra 262 cột có cùng nguồn ghi thực tế**: ứng dụng có thể ghi đè DB default.

## Các nhóm đường ghi đã có chứng cứ

| Đường ghi | Cột và bằng chứng | Giới hạn suy luận |
| --- | --- | --- |
| DB tự điền giờ Việt Nam khi INSERT | Phép thử Bộ môn: `subjects.created_at`, `activity_logs.created_at` ~11:52/11:53; phép thử Khóa học: `course_audit_logs.created_at` = 12:24:40; nhật ký điểm danh `activity_logs.created_at` = 12:29:49 và 12:29:54. Các insert nhật ký trong ứng dụng không truyền `createdAt`. | Chỉ xác nhận đường ghi hiện tại và những dòng đối chiếu được; dữ liệu import/ghi trực tiếp trước đây chưa được chứng minh. |
| Server ghi `new Date()` vào cột **không có múi giờ** | Phép thử Bộ môn: `subjects.updated_at` = 04:53 lúc thực tế 11:53; Khóa học: `courses.updated_at` = 05:24:40 lúc nhật ký là 12:24:40; điểm danh: `student_sessions.attendance_at` và `updated_at` = 05:29:47/05:29:52, nhật ký được tạo khoảng 2 giây sau vào 12:29. `updateCourse` và hai đường ghi điểm danh dùng `new Date()`. | Đây là thành phần giờ UTC được lưu trong cột không có múi giờ, **không phải** cột `timestamptz`. Không kết luận mọi giá trị cũ của cột cùng nguồn. |
| **Trộn nguồn ngay trong một cột** | `subjects.updated_at`, `courses.updated_at`, `student_sessions.updated_at`: INSERT có thể nhận default giờ DB; UPDATE hiện dùng `new Date()`. Riêng `student_sessions.updated_at` còn có UPDATE bằng SQL `NOW()` và đường UPDATE bỏ qua cột. | Không chuyển cả cột theo một múi giờ. Cần phân loại dòng/đường ghi và nguồn thời gian của mỗi giai đoạn. |
| Ghi đè `created_at` dù có default | Đường tạo hóa đơn có thể nhận `invoices.created_at` do người dùng nhập; lịch thanh toán có thể nhận `invoice_payment_schedule.created_at`. `notifications.created_at`, `student_attendance_qr_tokens.created_at`, `bidv_location_configs.created_at` có đường INSERT truyền `Date` của server. | 145 cột `created_at` không thể gộp tất cả vào nhóm DB-default-only. |
| Thời gian do người dùng hoặc nguồn ngoài cung cấp | Ví dụ giờ lịch/hạn nộp (`tasks.due_date`, `exams.open_at/close_at`) và ngày giao dịch BIDV. Giao diện tạo công việc lấy giờ theo thiết bị, gửi ISO, server chuyển lại thành `Date`; luồng tạo công việc còn gửi thông báo cho người được giao. | Phải xác định ý nghĩa giờ địa phương và nguồn/offset cho từng luồng; không thử bằng nghiệp vụ thật chỉ để đo thời gian. |

`student_sessions.attendance_at` hiện có hai đường ghi ứng dụng tìm thấy, đều dùng `new Date()`. DB có **145 giá trị không null**: 99 dòng có nhật ký cùng lớp trong 30 giây *nếu* hiểu giá trị là UTC, nhưng đối chiếu theo lớp/thời điểm chưa đủ để chứng thực từng học viên; 46 dòng còn lại không khớp tiêu chí này. Một trùng khớp theo **giờ thô** lại khác trạng thái điểm danh, minh họa vì sao khớp thời gian đơn lẻ có thể sai. Chưa có căn cứ chuyển toàn bộ 145 dòng lịch sử.

## Quy tắc chuyển đổi khi đủ chứng cứ

1. Thời điểm thực tương lai cần `timestamptz`, server ghi instant UTC, client hiển thị/ngày nghiệp vụ theo IANA timezone của Center. `date` và giờ lịch lặp không chuyển thành instant.
2. **Chỉ với dòng được chứng minh** do DB ghi thành phần giờ Việt Nam, diễn giải bằng `AT TIME ZONE 'Asia/Ho_Chi_Minh'`. **Chỉ với dòng được chứng minh** lưu thành phần giờ UTC từ JS `Date`, diễn giải bằng `AT TIME ZONE 'UTC'`. Không cộng/trừ bảy giờ trên cả bảng.
3. Cột có nhiều đường ghi cần quy tắc theo nguồn của **từng dòng**; dòng không có chứng cứ giữ nguyên cho tới khi có nguồn độc lập hoặc quyết định xử lý rõ ràng.
4. Trước khi thay kiểu trên DB thật: dựng bản sao/đối chiếu dữ liệu, giữ giá trị thô để hoàn nguyên, chạy thử trên bản sao, đồng bộ schema + writer + reader + bộ lọc ngày, rồi mới lên lịch áp dụng. `db:push` hiện có prompt mất dữ liệu không liên quan, không dùng `--force`/truncate để đi vòng.

**An toàn khi thử điểm danh:** xác minh *đúng session* có phân bổ hóa đơn, số tiền hiệu lực và quy tắc trừ ví trước khi yêu cầu thao tác trên DB thật. Tên “lớp thử” không đảm bảo không ghi vào ví học phí.