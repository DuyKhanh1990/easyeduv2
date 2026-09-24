# Kiểm kê nguồn ghi thời gian EasyEdu

Kiểm kê ban đầu ngày 24/09/2026 trên PostgreSQL **đang dùng thật**. Tài liệu này tách **mặc định trong schema**, **đường ghi ứng dụng** và **nguồn của từng dòng lịch sử**; không dùng một loại bằng chứng thay cho loại khác. Sau kiểm kê, bốn cột đầu tiên đã được chuyển đổi có sao lưu riêng (xem phần tiến độ).

## Phạm vi

Tại thời điểm kiểm kê, DB có **301 cột `timestamp without time zone` trên 160 bảng**. Đối chiếu bằng AST với `shared/schema.ts`: cả 301 cột đều có khai báo; schema còn một cột của bảng `test_session_content_attempts` chưa có trong DB. Các cột đã là `timestamptz` không nằm trong 301 cột này. Bảng số lượng dưới đây là **đường cơ sở trước chuyển đổi**, không phải số dư hiện tại.

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

`student_sessions.attendance_at` có hai đường ghi ứng dụng tìm thấy, đều dùng `new Date()`. DB trước chuyển đổi có **145 giá trị không null**: 99 dòng có nhật ký cùng lớp trong 30 giây *nếu* hiểu giá trị là UTC, nhưng đối chiếu theo lớp/thời điểm chưa đủ để chứng thực từng học viên; 46 dòng còn lại không khớp tiêu chí này. Một trùng khớp theo **giờ thô** lại khác trạng thái điểm danh, minh họa vì sao khớp thời gian đơn lẻ có thể sai. Việc chuyển các dòng lịch sử dùng **giả định theo đường ghi ứng dụng**, không phải chứng cứ độc lập cho từng dòng.

## Tiến độ chuyển đổi trên DB hiện tại

| Cột | Cách diễn giải giá trị cũ | Sao lưu và đối chiếu |
| --- | --- | --- |
| `student_sessions.attendance_at` | UTC (hai đường ghi ứng dụng đều `new Date()`) | `time_migration.student_sessions_attendance_at_before_utc`: 1.899 dòng, gồm 145 giá trị; đối chiếu giá trị gốc sau chuyển: **0 lệch**. 46 giá trị không khớp nhật ký theo tiêu chí trên vẫn chưa có chứng cứ độc lập về nguồn, nên giữ bản gốc để hoàn nguyên. |
| `activity_logs.created_at` | `Asia/Ho_Chi_Minh` (đường ghi ứng dụng bỏ qua cột, DB default `now()` dưới timezone phiên Việt Nam) | `time_migration.activity_logs_created_at_before_utc`: 767 dòng; đối chiếu giá trị gốc sau chuyển: **0 lệch**. Không phát hiện ứng dụng truyền giá trị riêng; dữ liệu nhập ngoài ứng dụng trong quá khứ vẫn không thể loại trừ tuyệt đối. |
| `course_audit_logs.created_at` | `Asia/Ho_Chi_Minh` (đường ghi ứng dụng bỏ qua cột, DB default `now()`) | `time_migration.course_audit_logs_created_at_before_utc`: 11 dòng; đối chiếu **0 lệch**. |
| `assessment_audit_logs.created_at` | `Asia/Ho_Chi_Minh` (đường ghi ứng dụng bỏ qua cột, DB default `now()`) | `time_migration.assessment_audit_logs_created_at_before_utc`: 27 dòng; đối chiếu **0 lệch**. |
| `invoice_audit_logs.created_at` | `Asia/Ho_Chi_Minh` (đường ghi qua `createInvoiceAuditLog` không truyền thời gian; DB default `now()`) | `time_migration.invoice_audit_logs_created_at_before_utc`: 39 dòng; đối chiếu sau chuyển đổi **0 lệch**. |
| `s3_file_logs.created_at`, `web_push_subscriptions.created_at`, `gateway_registry.created_at` | `Asia/Ho_Chi_Minh` (các đường ghi bỏ qua cột; DB default `now()`) | Migration `0037` giữ sao lưu lần lượt 58/7/2 dòng; đối chiếu từng bảng **0 lệch**. |
| `student_sessions.online_clicked_at`, `online_ended_at` | UTC (đường ghi sự kiện dùng `new Date()`; API trả instant ISO) | Migration `0038` sao lưu 1.899 dòng theo ID; chỉ 7 dòng có ít nhất một giá trị; đối chiếu từng giá trị sau chuyển đổi **0 lệch**. |
| `exam_sessions.started_at`, `expires_at`; `exam_submissions.started_at`, `expires_at` | UTC (thời gian bắt đầu/hết hạn của phiên thi do server tạo và dùng lại khi nộp bài) | Migration `0039` sao lưu 5/940 dòng theo ID; giá trị khác null lần lượt 5/2 và 7/3; đối chiếu từng cột **0 lệch**. `submitted_at` được giữ nguyên vì caller có thể truyền giá trị. |
| `student_sessions.created_at` | `Asia/Ho_Chi_Minh` (toàn bộ đường INSERT ứng dụng được rà đều bỏ qua trường; DB default `now()`) | Migration `0040` sao lưu 1.896 dòng theo ID; đối chiếu **0 lệch**. Import/SQL trực tiếp lịch sử không được loại trừ tuyệt đối. |
| `class_sessions.created_at`, `exam_submissions.created_at` | `Asia/Ho_Chi_Minh` (đường INSERT ứng dụng bỏ qua trường; với bài thi, schema đầu vào loại bỏ `createdAt`) | Migration `0041` sao lưu lần lượt 1.650/940 dòng theo ID; đối chiếu **0 lệch**. Import/SQL trực tiếp lịch sử không được loại trừ tuyệt đối. |
| `created_at` của 15 bảng danh mục/cấu hình (`locations`, `departments`, `roles`, `courses`, `course_fee_packages`, `score_categories`, `score_sheets`, `score_sheet_items`, `questions`, `exam_sections`, `exam_section_questions`, `course_programs`, `course_program_contents`, `free_class_session_contents`, `free_class_day_assignments`) | `Asia/Ho_Chi_Minh` (các writer ứng dụng đã rà đều bỏ qua trường và dùng DB default `now()`) | Migration `0042` sao lưu tổng cộng 299 dòng theo ID; đối chiếu từng cột **0 lệch**. Import/SQL trực tiếp lịch sử không được loại trừ tuyệt đối. |
| `created_at` của 12 bảng cấu hình/chat (`ai_settings`, `invoice_print_templates`, `payment_gateways`, `task_statuses`, `task_levels`, `zalo_oa_configs`, `zalo_oa_conversations`, `zalo_oa_messages`, `conversations`, `messages`, `salary_allowance_types`, `salary_default_configs`) | `Asia/Ho_Chi_Minh` (các writer ứng dụng đã rà đều bỏ qua trường; DB default `now()`/`CURRENT_TIMESTAMP`) | Migration `0043` sao lưu tổng cộng 335 dòng theo ID; đối chiếu **0 lệch**. Số dòng theo thứ tự bảng ở cột đầu: 3/5/0/5/2/2/50/266/0/0/2/0. |
| `created_at` của 15 bảng CRM/nhân sự/giáo dục (`attendance_fee_rules`, `classrooms`, `crm_customer_sources`, `crm_pipeline_groups`, `crm_reject_reasons`, `crm_relationships`, `crm_schools`, `evaluation_criteria`, `evaluation_sub_criteria`, `shift_templates`, `staff_assignments`, `staff_salary_configs`, `student_locations`, `subjects`, `teacher_salary_packages`) | `Asia/Ho_Chi_Minh` (các đường ghi đã rà bỏ qua trường và dùng DB default `now()`) | Migration `0044` sao lưu tổng cộng 280 dòng theo ID; đối chiếu **0 lệch**. Số dòng theo thứ tự bảng ở cột đầu: 5/6/3/0/1/10/1/3/21/44/26/5/147/5/3. |
| `created_at` của 14 bảng tích hợp/kho/chat (`admin_hub_connections`, `omicall_location_configs`, `store_warehouses`, `store_suppliers`, `store_categories`, `store_units`, `store_colors`, `store_sizes`, `store_products`, `chat_groups`, `online_learning_rules`, `facebook_page_configs`, `facebook_conversations`, `facebook_messages`) | `Asia/Ho_Chi_Minh` (các đường ghi đã rà bỏ qua trường và dùng DB default `now()`) | Migration `0045` sao lưu tổng cộng 37 dòng theo ID; đối chiếu **0 lệch**. Số dòng theo thứ tự bảng ở cột đầu: 4/2/3/1/3/2/2/3/7/4/2/1/1/2. |
| `created_at` của `finance_transaction_categories`, `staff_rewards`, `staff_advances`, `staff_hr_salary_configs` | `Asia/Ho_Chi_Minh` (insert schema/writer bỏ qua trường, DB default `now()`) | Migration `0046` sao lưu tổng cộng 19 dòng theo ID; đối chiếu **0 lệch**. Số dòng theo thứ tự bảng: 14/2/1/2. |
| `tasks.created_at`, `task_comments.created_at` | `Asia/Ho_Chi_Minh` (cả hai insert bỏ qua trường và dùng DB default `now()`) | Migration `0047` sao lưu 19/9 dòng theo ID; so lại với giờ tường gốc **0 lệch**. Giao diện chi tiết công việc chuyển sang format instant theo timezone của Center; `updated_at` và `due_date` không đổi. |
| `created_at` của 67 bảng cùng nguồn DB (`0048`) | `Asia/Ho_Chi_Minh` (66 khai báo Drizzle và bảng raw-DDL `center_notification_templates`; writer ứng dụng bỏ qua trường, riêng `exam_sessions` dùng SQL `NOW()`) | Chỉ development: sao lưu tổng cộng **5.761 dòng**, đối chiếu khóa và giờ tường **0 lệch**. Backup dùng PK `id`, riêng `short_links` dùng PK `code`; giữ lại tới khi audit hoàn tất. |

Các migration có điều kiện chặn chạy lặp và hướng dẫn hoàn nguyên: `migrations/0033_student_session_attendance_at_utc.sql` đến `migrations/0048_db_default_created_at_batch_utc.sql`. Sau khi xác minh migration `0048` trên development, còn **155/301 cột** chưa chuyển: 6 `created_at`, 103 `updated_at`, 46 trường tên khác. Không thay đổi production.

## Cohort còn lại sau migration 0048

| Nhóm | Số cột | Diễn giải và cách xử lý |
| --- | ---: | --- |
| `created_at` mặc định DB đã phân loại | 0 | Đã chuyển 67 cột trong migration `0048`; còn giả định import/SQL trực tiếp lịch sử có thể bị loại trừ tuyệt đối hay không thì vẫn không thể chứng minh cho từng dòng. |
| `created_at` trộn nguồn/người dùng/dịch vụ | 6 | `bidv_location_configs`, `invoices`, `invoice_payment_schedule`, `notifications`, `student_attendance_qr_tokens`, `store_stock_transactions`. Không chuyển theo nhóm mặc định DB; riêng bảng kho có writer sao chép timestamp hoặc nhận giá trị từ caller. |
| `updated_at` có writer ứng dụng `new Date()` và DB default lúc insert | 87 | Nguồn có thể khác nhau giữa insert và update; không suy nguồn của mọi dòng lịch sử từ writer hiện tại. Chỉ chuyển sau khi phân loại giá trị cũ hoặc áp dụng rõ ngoại lệ dữ liệu test có backup. |
| `updated_at` có writer SQL và JS | 11 | Có thể trộn `NOW()`/`transaction_timestamp()` và `new Date()` trong cùng cột; không chuyển theo một timezone chung. |
| `updated_at` dịch vụ/nguồn ngoài | 5 | Vòng đời backup/restore và callback BIDV, Facebook, Omicall; cần giữ nguồn riêng. |
| Trường tên khác: DB default | 10 | Writer DB `now()`; riêng `student_relationship_history.changed_at` chưa có bằng chứng đầy đủ cho mọi đường ghi. |
| Trường tên khác: server `Date` | 11 | Instant do server tạo; lịch sử cần loại trừ import/default/caller ghi đè. |
| Trường tên khác: caller hoặc giờ lịch/điểm danh | 7 | Bảo toàn ý nghĩa ngày/giờ địa phương của task, bài thi, nội dung và điểm danh. |
| Trường tên khác: nhà cung cấp | 3 | Giữ hợp đồng timezone/offset của BIDV và Zalo; không dùng timezone phiên DB thay thế. |
| Trường tên khác: trộn nguồn | 15 | Cần phân loại theo đường ghi/thời kỳ của từng dòng; không chuyển blanket. |

### Thử nghiệm đại diện theo nhóm

- Development trả `Asia/Ho_Chi_Minh` từ `current_setting('TimeZone')`; `now()::timestamp` khớp `now() AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- Dữ liệu `database_backups` thực tế cho thấy `requested_at` là giờ DB (ví dụ `2026-09-24 00:29:59.997471`) còn `started_at` là giờ UTC-naive (ví dụ `2026-09-23 17:30:00.007`). Diễn giải đúng cho từng nguồn đưa về gần cùng thời điểm; formatter legacy hiện tại không dùng chung an toàn cho cả hai.
- `tasks` có 19 dòng và `task_comments` có 9 dòng; hai insert hiện tại bỏ qua `created_at`. Test dùng mẫu thực tế, xác nhận hiển thị trước và sau chuyển đổi giữ nguyên giờ Center. Migration `0047` đã sao lưu/đối chiếu từng ID, **0 lệch**.
- `npx vitest run tests/time/center-time.test.ts tests/time/center-date-range.test.ts`: **9/9 đạt**. `npm run build`: đạt. `npm run check` vẫn báo 271 lỗi, bằng baseline đã ghi nhận trước đợt này.

Chưa chuyển các `updated_at`, trường lịch/giờ địa phương, provider hoặc mixed-source trong đợt này. Các cohort còn lại cần được thử writer/reader riêng; giữ nguyên các bảng backup trong `time_migration` cho tới khi hoàn tất audit.

Chưa được mặc định rằng các cột còn lại đều là instant: ngày lịch, giờ lặp và cột trộn nguồn cần xử lý riêng. Bộ lọc nhật ký dùng khoảng `[đầu ngày, đầu ngày tiếp theo)` theo IANA timezone của Center; màn hình lịch sử hóa đơn cũng dùng timezone của Center. Thử biên ngày khi đổi giờ mùa hè ở `Europe/Berlin` xác nhận một ngày có thể dài 23 giờ, không được cộng cố định 24 giờ vào UTC.

## Quy tắc chuyển đổi khi đủ chứng cứ

1. Thời điểm thực tương lai cần `timestamptz`, server ghi instant UTC, client hiển thị/ngày nghiệp vụ theo IANA timezone của Center. `date` và giờ lịch lặp không chuyển thành instant.
2. **Chỉ với dòng được chứng minh** do DB ghi thành phần giờ Việt Nam, diễn giải bằng `AT TIME ZONE 'Asia/Ho_Chi_Minh'`. **Chỉ với dòng được chứng minh** lưu thành phần giờ UTC từ JS `Date`, diễn giải bằng `AT TIME ZONE 'UTC'`. Không cộng/trừ bảy giờ trên cả bảng.
3. Cột có nhiều đường ghi cần quy tắc theo nguồn của **từng dòng**; dòng không có chứng cứ giữ nguyên cho tới khi có nguồn độc lập hoặc quyết định xử lý rõ ràng.
4. Trước khi thay kiểu trên DB thật: dựng bản sao/đối chiếu dữ liệu, giữ giá trị thô để hoàn nguyên, chạy thử trên bản sao, đồng bộ schema + writer + reader + bộ lọc ngày, rồi mới lên lịch áp dụng. `db:push` hiện có prompt mất dữ liệu không liên quan, không dùng `--force`/truncate để đi vòng.

**An toàn khi thử điểm danh:** xác minh *đúng session* có phân bổ hóa đơn, số tiền hiệu lực và quy tắc trừ ví trước khi yêu cầu thao tác trên DB thật. Tên “lớp thử” không đảm bảo không ghi vào ví học phí.