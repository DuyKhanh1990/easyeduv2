export const donTuTranslations = {
  vi: {
    title: "Đơn từ của tôi", personalInfo: "Thông tin cá nhân", linkedStudents: "Đơn từ của các học viên đã liên kết", studentRequests: "Đơn từ của học viên", loadScheduleError: "Không thể tải lịch học",
    add: "Thêm mới", loading: "Đang tải dữ liệu...", loadError: "Không thể tải dữ liệu đơn từ.", loadingStudent: "Đang nhận diện thông tin học viên...", studentLoadError: "Không thể tải thông tin học viên và cơ sở được gán.",
    requests: "Đơn từ", rewardsPenalties: "Thưởng / Phạt", advances: "Tạm ứng", totalRequests: "Tổng số đơn", pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối",
    status: "Trạng thái", allStatuses: "Tất cả trạng thái", requestType: "Loại đơn", allRequestTypes: "Tất cả loại đơn", student: "Học viên", allStudents: "Tất cả học viên", requestCount: "đơn từ", noMatchingRequests: "Chưa có đơn từ phù hợp",
    sender: "Người gửi", time: "Thời gian", sessions: "Số buổi", hours: "Số giờ", reasonNotes: "Lý do / Ghi chú", session: "buổi", me: "Tôi",
    totalReward: "Tổng thưởng", totalPenalty: "Tổng phạt", all: "Tất cả", reward: "Thưởng", penalty: "Phạt", noRewards: "Chưa có phiếu thưởng / phạt", type: "Loại", date: "Ngày", amount: "Số tiền", reason: "Lý do",
    totalAdvance: "Tổng tạm ứng", noAdvances: "Chưa có phiếu tạm ứng", documentDueDate: "Hạn hoàn chứng từ",
    addStudentLeave: "Thêm đơn xin nghỉ", assignedLocation: "Cơ sở được gán", noLocation: "Chưa được gán cơ sở", leavePeriod: "Thời gian xin nghỉ", start: "Bắt đầu", end: "Kết thúc", actualSchedule: "Lịch học thực tế", selectedSessions: "Đã chọn {count} buổi", noSchedules: "Không có lịch học trong khoảng thời gian này.", chooseTime: "Chọn thời gian để hệ thống tải lịch học thực tế.", chooseSchedules: "Chọn những buổi học mà học viên muốn xin nghỉ trong khoảng thời gian đã chọn.", description: "Mô tả", leaveReasonPlaceholder: "Nhập lý do xin nghỉ...", cancel: "Hủy", sendRequest: "Gửi đơn",
    addRequest: "Thêm đơn mới", staff: "Nhân sự", chooseRequestType: "Chọn loại đơn", fromDate: "Từ ngày", toDate: "Đến ngày", fromTime: "Từ giờ", toTime: "Đến giờ", reasonPlaceholder: "Nhập lý do...", createRequest: "Tạo đơn",
    leave: "Nghỉ phép", annualLeave: "Nghỉ phép năm", overtime: "Tăng ca", studentLeave: "Xin nghỉ học",
    sentStudentLeave: "Đã gửi đơn xin nghỉ", sendStudentLeaveError: "Không thể gửi đơn xin nghỉ", createdLeave: "Đã tạo đơn nghỉ phép", createLeaveError: "Không thể tạo đơn nghỉ phép", enterLeavePeriod: "Vui lòng nhập thời gian xin nghỉ", invalidDateRange: "Ngày bắt đầu không được sau ngày kết thúc", invalidOvertime: "Thời gian tăng ca không hợp lệ", chooseSchedule: "Vui lòng chọn ít nhất một lịch học muốn xin nghỉ",
  },
  en: {
    title: "My Requests", personalInfo: "Personal information", linkedStudents: "Requests for linked students", studentRequests: "Student requests", loadScheduleError: "Could not load the class schedule",
    add: "Add new", loading: "Loading data...", loadError: "Could not load requests.", loadingStudent: "Identifying student information...", studentLoadError: "Could not load student and assigned location information.",
    requests: "Requests", rewardsPenalties: "Rewards / Penalties", advances: "Advances", totalRequests: "Total requests", pending: "Pending", approved: "Approved", rejected: "Rejected",
    status: "Status", allStatuses: "All statuses", requestType: "Request type", allRequestTypes: "All request types", student: "Student", allStudents: "All students", requestCount: "requests", noMatchingRequests: "No matching requests",
    sender: "Submitted by", time: "Time", sessions: "Sessions", hours: "Hours", reasonNotes: "Reason / Notes", session: "sessions", me: "Me",
    totalReward: "Total rewards", totalPenalty: "Total penalties", all: "All", reward: "Reward", penalty: "Penalty", noRewards: "No reward / penalty records", type: "Type", date: "Date", amount: "Amount", reason: "Reason",
    totalAdvance: "Total advances", noAdvances: "No advance records", documentDueDate: "Document due date",
    addStudentLeave: "Add leave request", assignedLocation: "Assigned location", noLocation: "No location assigned", leavePeriod: "Leave period", start: "Start", end: "End", actualSchedule: "Actual schedule", selectedSessions: "Selected {count} sessions", noSchedules: "No classes in this period.", chooseTime: "Choose a period to load the actual schedule.", chooseSchedules: "Select the classes the student wants to be absent from in the selected period.", description: "Description", leaveReasonPlaceholder: "Enter the reason for leave...", cancel: "Cancel", sendRequest: "Send request",
    addRequest: "Add request", staff: "Staff", chooseRequestType: "Choose request type", fromDate: "From date", toDate: "To date", fromTime: "From time", toTime: "To time", reasonPlaceholder: "Enter reason...", createRequest: "Create request",
    leave: "Leave", annualLeave: "Annual leave", overtime: "Overtime", studentLeave: "Student leave",
    sentStudentLeave: "Leave request sent", sendStudentLeaveError: "Could not send leave request", createdLeave: "Leave request created", createLeaveError: "Could not create leave request", enterLeavePeriod: "Please enter the leave period", invalidDateRange: "Start date cannot be after end date", invalidOvertime: "Invalid overtime period", chooseSchedule: "Please select at least one class to request leave from",
  },
} as const;

export type DonTuTranslationKey = keyof typeof donTuTranslations.vi;