export type CustomerGuideSection = {
  id: string;
  title: string;
  content: string;
};

export type CustomerGuideGroup = {
  id: string;
  title: string;
  sections: CustomerGuideSection[];
};

export type CustomerGuide = {
  title: string;
  description: string;
  groups: CustomerGuideGroup[];
};

const p = (text: string) => `<p>${text}</p>`;
const bullets = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
const steps = (items: string[]) => `<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`;
const tip = (text: string) => `<blockquote><p><strong>Lưu ý:</strong> ${text}</p></blockquote>`;

export const DEFAULT_CUSTOMER_GUIDE: CustomerGuide = {
  title: "Tài liệu hướng dẫn — Học viên",
  description:
    "Hướng dẫn đầy đủ các nghiệp vụ trên trang /customers, từ tra cứu, tạo hồ sơ đến phân lớp, cập nhật và quản lý dữ liệu hàng loạt.",
  groups: [
    {
      id: "getting-started",
      title: "Bắt đầu sử dụng",
      sections: [
        {
          id: "overview",
          title: "Tổng quan trang Học viên",
          content:
            p("Trang Học viên là nơi quản lý tập trung toàn bộ hồ sơ học viên và phụ huynh, thông tin tư vấn, tình trạng học tập, lớp học, lịch học và các hoạt động chăm sóc liên quan.") +
            bullets([
              "<strong>Các thẻ thống kê:</strong> xem nhanh tổng số, đang học, chưa có lịch, bảo lưu và đã nghỉ.",
              "<strong>Thanh công cụ:</strong> chuyển chế độ xem, mở tài liệu hướng dẫn và thêm học viên mới.",
              "<strong>Khu vực danh sách:</strong> tìm kiếm, lọc, chọn cột, phân trang và thực hiện thao tác trên từng học viên.",
            ]) +
            tip("Nên bắt đầu bằng việc chọn đúng <strong>Cơ sở</strong> và chế độ xem phù hợp trước khi tìm kiếm để danh sách trả về đúng phạm vi phụ trách."),
        },
        {
          id: "search-filter",
          title: "Tìm kiếm và bộ lọc",
          content:
            p("Dùng ô tìm kiếm để tra cứu nhanh theo tên hoặc mã học viên. Kết quả được cập nhật sau một khoảng ngắn để tránh phải tải lại danh sách sau mỗi ký tự.") +
            steps([
              "Nhập tên, mã học viên hoặc thông tin nhận diện vào ô tìm kiếm.",
              "Nhấn <strong>Bộ lọc</strong> để mở các điều kiện lọc. Có thể kết hợp nhiều điều kiện cùng lúc.",
              "Chọn <strong>Cơ sở, Phân loại, Mối quan hệ, Nguồn, Lý do từ chối, Sale, Quản lý, Giáo viên, Lớp</strong> nếu cần lọc theo người phụ trách hoặc nhóm.",
              "Chọn khoảng <strong>Ngày tạo, Ngày cập nhật hoặc Sinh nhật</strong> để lọc theo thời gian.",
              "Chọn <strong>Trạng thái tài khoản</strong> và <strong>Trạng thái học viên</strong> để tách học viên đang hoạt động, bị khóa, đang học, bảo lưu hoặc đã nghỉ.",
              "Kiểm tra các nhãn <strong>Đang áp dụng bộ lọc</strong> trên màn hình và bấm <strong>Xoá tất cả</strong> để trở về danh sách ban đầu.",
            ]) +
            tip("Muốn tìm học viên chưa được xếp lớp, chuyển sang chế độ <strong>Theo lớp</strong> rồi chọn tab <strong>Chưa phân lớp</strong>."),
        },
        {
          id: "views",
          title: "Xem theo mối quan hệ / lớp",
          content:
            p("Hai chế độ xem giúp cùng một dữ liệu được sử dụng cho hai mục đích nghiệp vụ khác nhau:") +
            bullets([
              "<strong>Theo mối quan hệ:</strong> theo dõi luồng tư vấn/chăm sóc như khách hàng mới, đã tư vấn, đang theo học hoặc các trạng thái CRM đã cấu hình.",
              "<strong>Theo lớp:</strong> theo dõi danh sách của từng lớp và nhóm chưa được phân lớp.",
            ]) +
            steps([
              "Chọn nút chế độ xem ở thanh công cụ phía trên danh sách.",
              "Ở chế độ mối quan hệ, chọn tab nhóm lớn rồi chọn trạng thái con để thu hẹp danh sách.",
              "Ở chế độ theo lớp, chọn <strong>Tất cả</strong>, một lớp cụ thể hoặc <strong>Chưa phân lớp</strong>.",
            ]),
        },
      ],
    },
    {
      id: "student-management",
      title: "Quản lý hồ sơ học viên",
      sections: [
        {
          id: "create",
          title: "Thêm học viên mới",
          content:
            p("Dùng nút <strong>Thêm học viên</strong> khi tạo một hồ sơ mới. Nên chuẩn bị thông tin chính xác từ phiếu đăng ký hoặc thông tin đã xác nhận với phụ huynh.") +
            steps([
              "Bấm <strong>Thêm học viên</strong> ở góc trên bên phải.",
              "Nhập các thông tin nhận diện: họ tên, số điện thoại, ngày sinh, email, địa chỉ và thông tin liên hệ phụ huynh.",
              "Chọn <strong>Cơ sở</strong>, phân loại và các thông tin CRM như nguồn, mối quan hệ, Sale hoặc người quản lý.",
              "Nếu đã xác định lớp, chọn lớp và giáo viên phù hợp. Nếu chưa xác định, có thể để trống và phân lớp sau.",
              "Nhập trình độ, ghi chú và các trường thông tin bổ sung theo cấu hình của trung tâm.",
              "Kiểm tra lại số điện thoại, cơ sở và mối quan hệ, sau đó bấm nút lưu ở cuối biểu mẫu.",
            ]) +
            tip("Nếu tạo tài khoản đăng nhập cho học viên, hãy dùng thông tin liên hệ đã được xác nhận và hướng dẫn người học đổi mật khẩu sau lần đăng nhập đầu tiên."),
        },
        {
          id: "profile",
          title: "Xem và cập nhật hồ sơ",
          content:
            steps([
              "Bấm vào tên hoặc dòng học viên để mở <strong>Chi tiết học viên</strong>.",
              "Kiểm tra các nhóm thông tin: hồ sơ, phụ huynh, lớp học, lịch học, tài chính, ghi chú và lịch sử hoạt động.",
              "Để cập nhật, mở menu <strong>Thao tác</strong> ở dòng tương ứng rồi chọn <strong>Chỉnh sửa</strong>.",
              "Cập nhật đúng phần cần thay đổi, giữ nguyên các dữ liệu không liên quan và bấm lưu.",
              "Để xóa hồ sơ, chọn <strong>Xóa</strong> và xác nhận. Chỉ thực hiện khi chắc chắn hồ sơ không còn cần dùng cho nghiệp vụ hoặc đối soát.",
            ]) +
            p("Nhật ký hoạt động giúp kiểm tra ai đã tạo, cập nhật hoặc thực hiện thao tác trên hồ sơ. Khi có sai lệch dữ liệu, hãy kiểm tra nhật ký trước khi sửa tiếp."),
        },
      ],
    },
    {
      id: "learning-operations",
      title: "Điều phối học tập",
      sections: [
        {
          id: "assignments",
          title: "Lớp học, lịch học và phân công",
          content:
            p("Các nghiệp vụ phân lớp và lịch học thường được thực hiện từ menu thao tác của từng học viên hoặc từ thao tác hàng loạt.") +
            steps([
              "Chọn học viên cần phân công trong danh sách.",
              "Chọn chức năng phân lớp để đưa học viên vào lớp phù hợp; kiểm tra cơ sở của lớp trước khi lưu.",
              "Mở chức năng lịch học để chọn ca, ngày bắt đầu và các buổi học theo lịch của trung tâm.",
              "Gán giáo viên, trợ giảng hoặc người phụ trách nếu nghiệp vụ yêu cầu.",
              "Sau khi lưu, kiểm tra lại cột lớp học, lịch gần nhất và trạng thái học tập trên danh sách.",
            ]) +
            tip("Trước khi phân lớp hàng loạt, nên lọc theo cùng cơ sở và kiểm tra toàn bộ học viên đã chọn để tránh gán nhầm lớp."),
        },
        {
          id: "bulk",
          title: "Thao tác hàng loạt",
          content:
            p("Thao tác hàng loạt giúp cập nhật nhiều hồ sơ cùng lúc. Chỉ các học viên được tích chọn mới bị ảnh hưởng.") +
            steps([
              "Dùng checkbox ở đầu bảng để chọn toàn bộ học viên của trang, hoặc tích từng dòng.",
              "Kiểm tra số lượng đã chọn và mở menu <strong>Thao tác hàng loạt</strong>.",
              "Chọn nghiệp vụ: phân cơ sở, phân Sale, phân quản lý, phân giáo viên, phân phụ huynh, phân lớp hoặc cập nhật trạng thái tài khoản.",
              "Chọn giá trị mới, đọc lại phạm vi áp dụng và xác nhận.",
              "Tải lại hoặc bỏ bộ lọc để kiểm tra các dòng đã được cập nhật.",
            ]) +
            tip("Xóa hàng loạt là thao tác không nên dùng cho việc “tạm nghỉ”. Với học viên ngừng học, ưu tiên cập nhật trạng thái để vẫn giữ lịch sử."),
        },
      ],
    },
    {
      id: "data-management",
      title: "Dữ liệu và cấu hình",
      sections: [
        {
          id: "excel",
          title: "Nhập và xuất Excel",
          content:
            p("Excel phù hợp khi tiếp nhận danh sách học viên từ biểu mẫu đăng ký hoặc khi cần gửi dữ liệu cho bộ phận khác.") +
            `<h4>Nhập danh sách</h4>` +
            steps([
              "Mở menu <strong>Upload / Nhập Excel</strong>.",
              "Tải file mẫu nếu chưa có mẫu chuẩn, không tự ý đổi tên các cột bắt buộc.",
              "Điền dữ liệu, kiểm tra định dạng số điện thoại, ngày tháng và mã cơ sở.",
              "Chọn file, xem phần xem trước và xác nhận nhập.",
              "Nếu có dòng lỗi, tải file lỗi, sửa đúng các dòng đó rồi nhập lại.",
            ]) +
            `<h4>Xuất danh sách</h4>` +
            steps([
              "Áp dụng bộ lọc trước nếu chỉ muốn xuất một nhóm học viên.",
              "Chọn <strong>Download / Xuất Excel</strong>.",
              "Kiểm tra file xuất, đặc biệt các cột nhạy cảm trước khi chia sẻ.",
            ]),
        },
        {
          id: "columns",
          title: "Cài đặt cột và nhật ký",
          content:
            p("Mỗi người dùng có thể sắp xếp bảng theo nhu cầu công việc để tập trung vào những dữ liệu quan trọng nhất.") +
            steps([
              "Mở <strong>Cột / Cài đặt cột</strong> ở thanh công cụ danh sách.",
              "Tìm tên cột trong ô tìm kiếm và bật/tắt hiển thị bằng checkbox.",
              "Kéo thả tên cột để thay đổi thứ tự hiển thị.",
              "Đóng bảng cài đặt; lựa chọn được lưu cho lần truy cập sau.",
              "Mở <strong>Nhật ký</strong> để theo dõi các thay đổi và hỗ trợ kiểm tra lịch sử thao tác.",
            ]) +
            tip("Sale có thể ưu tiên các cột mối quan hệ, nguồn và lịch hẹn; giáo viên nên ưu tiên lớp, lịch học và trạng thái học tập; kế toán nên ưu tiên mã, phụ huynh và trạng thái tài khoản."),
        },
      ],
    },
    {
      id: "business-processes",
      title: "Quy trình nghiệp vụ",
      sections: [
        {
          id: "workflow",
          title: "Quy trình nghiệp vụ mẫu",
          content:
            `<h4>Tiếp nhận học viên mới</h4>` +
            steps([
              "Tạo hồ sơ với thông tin liên hệ đã xác nhận.",
              "Gán cơ sở, nguồn và nhân sự phụ trách.",
              "Cập nhật mối quan hệ theo tiến độ tư vấn.",
              "Khi đăng ký thành công, phân lớp và tạo lịch học.",
              "Kiểm tra lại trạng thái học tập và ghi chú bàn giao.",
            ]) +
            `<h4>Học viên chuyển lớp</h4>` +
            steps([
              "Tìm hồ sơ bằng mã học viên để tránh chọn nhầm người trùng tên.",
              "Kiểm tra lớp hiện tại và lịch học đang có.",
              "Thực hiện phân lớp mới, cập nhật giáo viên hoặc ca học.",
              "Ghi chú lý do chuyển lớp và kiểm tra kết quả sau khi lưu.",
            ]) +
            `<h4>Học viên bảo lưu / nghỉ học</h4>` +
            steps([
              "Mở đúng hồ sơ và kiểm tra các lớp, lịch, công nợ liên quan.",
              "Cập nhật trạng thái học viên thay vì xóa hồ sơ.",
              "Ghi rõ ngày bắt đầu, lý do và người xác nhận trong ghi chú.",
              "Khi quay lại, cập nhật trạng thái và phân lịch học mới.",
            ]) +
            `<blockquote><p><strong>Nguyên tắc kiểm tra trước khi lưu:</strong> đúng người — đúng cơ sở — đúng lớp — đúng người phụ trách — đúng trạng thái.</p></blockquote>`,
        },
      ],
    },
  ],
};