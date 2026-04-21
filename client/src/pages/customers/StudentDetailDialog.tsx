import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StudentFeePackagesTab } from "@/components/customers/StudentFeePackagesTab";
import { StudentInvoicesTab } from "@/components/customers/StudentInvoicesTab";
import { StudentFeeWalletTab } from "@/components/customers/StudentFeeWalletTab";
import { StudentScoreTab } from "@/components/customers/StudentScoreTab";
import { StudentReviewTab } from "@/components/customers/StudentReviewTab";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "discussion",   label: "Thảo luận", color: "#f97316" },
  { value: "classes",      label: "Lớp học",   color: "#0891b2" },
  { value: "fee-packages", label: "Gói học phí", color: "#7c3aed" },
  { value: "invoices",     label: "Hoá đơn",   color: "#16a34a" },
  { value: "fee-wallet",   label: "Ví học phí", color: "#0369a1" },
  { value: "score-review", label: "Bảng điểm - Nhận xét", color: "#be185d" },
] as const;

const SCORE_REVIEW_SUB_TABS = [
  { value: "score", label: "Bảng điểm" },
  { value: "review", label: "Nhận xét" },
] as const;

interface StudentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
}

interface Comment {
  id: string;
  studentId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
  };
}

interface CommentWithUser extends Comment {
  authorName: string;
  authorCode: string;
}

export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
}: StudentDetailDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("discussion");
  const [scoreReviewSubTab, setScoreReviewSubTab] = useState<"score" | "review">("score");
  const queryClient = useQueryClient();

  // Fetch comments
  const { data: commentsData = [], isLoading, refetch: refetchComments } = useQuery({
    queryKey: [`/api/students/${student?.id}/comments`],
    queryFn: async () => {
      if (!student?.id) return [];
      const res = await fetch(`/api/students/${student.id}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!student?.id && open,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Fetch classes
  const { data: classesData = [], isLoading: isLoadingClasses, refetch: refetchClasses } = useQuery({
    queryKey: [`/api/students/${student?.id}/classes`],
    queryFn: async () => {
      if (!student?.id) return [];
      const res = await fetch(`/api/students/${student.id}/classes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!student?.id && open,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Fetch attendance fee rules to know which statuses deduct fees
  const { data: attendanceFeeRules = [] } = useQuery({
    queryKey: ['/api/attendance-fee-rules'],
    queryFn: async () => {
      const res = await fetch('/api/attendance-fee-rules');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const deductingStatuses = new Set(
    (attendanceFeeRules as any[])
      .filter((r: any) => r.deductsFee)
      .map((r: any) => r.attendanceStatus)
  );

  // Refetch data when switching tabs
  useEffect(() => {
    if (!open || !student?.id) return;
    if (activeTab === "discussion") refetchComments();
    else if (activeTab === "classes") refetchClasses();
    else if (activeTab === "fee-packages" || activeTab === "invoices") {
      queryClient.invalidateQueries({ queryKey: ["/api/students", student.id, activeTab === "fee-packages" ? "fee-packages" : "invoices"] });
    }
  }, [activeTab, open]);

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/students/${student.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: () => {
      setInputValue("");
      queryClient.invalidateQueries({ queryKey: [`/api/students/${student?.id}/comments`] });
    },
  });

  const handleSend = () => {
    if (inputValue.trim()) {
      createCommentMutation.mutate(inputValue);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  };

  const getDayName = (dateStr: string) => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[new Date(dateStr).getDay()];
  };

  const formatSessionDate = (dateStr: string) => {
    const day = new Date(dateStr).getDate().toString().padStart(2, "0");
    const month = (new Date(dateStr).getMonth() + 1).toString().padStart(2, "0");
    const year = new Date(dateStr).getFullYear();
    const dayName = getDayName(dateStr);
    return `${dayName}, ${day}/${month}/${year}`;
  };

  const formatCourseTime = (startTime: string, endTime: string) => {
    return `${startTime} - ${endTime}`;
  };


  const calculateStats = (sessions: any[], invoicePaidTotal?: number) => {
    const attendedTotal = sessions.reduce((sum, s) => {
      const status = s.studentSession?.attendanceStatus;
      if (!status || !deductingStatuses.has(status)) return sum;
      const fee = s.allocatedFee != null
        ? Number(s.allocatedFee)
        : Number(s.studentSession?.sessionPrice || 0);
      return sum + fee;
    }, 0);
    const paid = Number(invoicePaidTotal || 0);

    return {
      paid,
      attended: attendedTotal,
      remaining: paid - attendedTotal,
    };
  };

  // Process comments to include author info
  const processedComments: CommentWithUser[] = commentsData.map((comment: Comment) => ({
    ...comment,
    authorName: comment.user?.username || "Unknown",
    authorCode: "ADMIN",
  }));

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none p-0 overflow-hidden flex flex-col rounded-none" style={{ width: '95vw', height: '95vh' }}>
        <DialogHeader className="border-b px-6 py-3 flex-shrink-0">
          <div className="relative flex items-center min-h-[36px]">
            {/* Left: title */}
            <DialogTitle className="text-base font-bold shrink-0 max-w-[220px] truncate">
              {student.fullName}
            </DialogTitle>

            {/* Center: tab buttons */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 flex-nowrap">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    data-testid={`tab-${tab.value}`}
                    style={
                      isActive
                        ? { backgroundColor: tab.color, borderColor: tab.color, color: "#fff" }
                        : { borderColor: tab.color, color: tab.color }
                    }
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-all focus:outline-none whitespace-nowrap"
                  >
                    {tab.label}
                    <span
                      style={{ backgroundColor: isActive ? "rgba(255,255,255,0.65)" : tab.color }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                  </button>
                );
              })}
            </div>

            {/* Right: close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="ml-auto h-8 w-8 p-0 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Independent layout: Bảng điểm – Nhận xét ── */}
          {activeTab === "score-review" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b bg-background flex-shrink-0">
                {SCORE_REVIEW_SUB_TABS.map((sub) => {
                  const isActive = scoreReviewSubTab === sub.value;
                  return (
                    <button
                      key={sub.value}
                      onClick={() => setScoreReviewSubTab(sub.value as "score" | "review")}
                      data-testid={`score-review-sub-${sub.value}`}
                      className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-all focus:outline-none ${
                        isActive
                          ? "bg-[#be185d] border-[#be185d] text-white"
                          : "border-[#be185d] text-[#be185d]"
                      }`}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
              {scoreReviewSubTab === "score" ? (
                <StudentScoreTab studentId={student.id} open={open} />
              ) : (
                <StudentReviewTab studentId={student.id} open={open} />
              )}
            </div>
          )}

          {/* Left Sidebar – shown only for non score-review tabs */}
          {activeTab !== "score-review" && (
          <div className="w-72 border-r bg-muted/30 overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Thông tin cơ bản
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Mã học viên</p>
                  <p className="text-sm font-medium">{student.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Loại</p>
                  <p className="text-sm font-medium">{student.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trạng thái tài khoản</p>
                  <p className="text-sm font-medium">{student.accountStatus}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Liên hệ
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Điện thoại</p>
                  <p className="text-sm font-medium">{student.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-blue-600 break-all">
                    {student.email || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Địa chỉ</p>
                  <p className="text-sm font-medium">{student.address || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Zalo/FB</p>
                  <p className="text-sm font-medium break-all">{student.socialLink || "-"}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Phụ huynh
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Phụ huynh 1</p>
                  <p className="text-sm font-medium">{student.parentName || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.parentPhone || "-"}
                  </p>
                </div>
                {student.parentName2 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phụ huynh 2</p>
                    <p className="text-sm font-medium">{student.parentName2}</p>
                    <p className="text-xs text-muted-foreground">
                      {student.parentPhone2 || "-"}
                    </p>
                  </div>
                )}
                {student.parentName3 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phụ huynh 3</p>
                    <p className="text-sm font-medium">{student.parentName3}</p>
                    <p className="text-xs text-muted-foreground">
                      {student.parentPhone3 || "-"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Thông tin khác
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Ngày sinh</p>
                  <p className="text-sm font-medium">
                    {student.dateOfBirth || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trình độ học</p>
                  <p className="text-sm font-medium">{student.academicLevel || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nguồn khách hàng</p>
                  <p className="text-sm font-medium">{student.source || "-"}</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Right Content Area - Tabs – shown only for non score-review tabs */}
          {activeTab !== "score-review" && (
          <div className="flex-1 overflow-hidden flex flex-col bg-white">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsContent value="discussion" className="!mt-0 p-0 flex-1 overflow-hidden">
                <div className="h-full w-full flex flex-col">
                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                    {isLoading ? (
                      <div className="h-full flex items-center justify-center text-gray-400">
                        <p>Đang tải...</p>
                      </div>
                    ) : processedComments.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400">
                        <p>Chưa có thảo luận nào</p>
                      </div>
                    ) : (
                      processedComments.map((comment) => (
                        <div key={comment.id} className="flex flex-col gap-1">
                          <p className="text-xs text-gray-500">
                            {comment.authorName} ({comment.authorCode}), {formatDateTime(comment.createdAt)}
                          </p>
                          <div className="bg-gray-100 rounded-lg p-3 max-w-xs">
                            <p className="text-sm text-gray-900 break-words">{comment.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="border-t bg-white p-4 flex-shrink-0">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Nhập bình luận..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleSend();
                          }
                        }}
                        disabled={createCommentMutation.isPending}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || createCommentMutation.isPending}
                        size="sm"
                        className="px-3 py-1 rounded-md border text-xs font-medium transition-all"
                      >
                        Gửi
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="classes" className="!mt-0 p-0 flex-1 overflow-hidden">
                {isLoadingClasses ? (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <p>Đang tải...</p>
                  </div>
                ) : classesData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <p>Học viên chưa đăng ký lớp nào</p>
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col">
                    {/* Class Tabs */}
                    <div className="border-b bg-gray-50 flex overflow-x-auto">
                      {classesData.map((item: any, index: number) => (
                        <button
                          key={item.studentClass?.id || index}
                          onClick={() => setSelectedClassIndex(index)}
                          className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            selectedClassIndex === index
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {item.class?.name} ({item.class?.classCode})
                        </button>
                      ))}
                    </div>

                    {/* Class Details */}
                    <div className="flex-1 overflow-y-auto flex flex-col bg-white">
                      {classesData[selectedClassIndex] && (
                        <div className="flex-1 flex flex-col">
                          {/* Three Stats Cards - Small */}
                          {(() => {
                            const stats = calculateStats(classesData[selectedClassIndex].sessions || [], classesData[selectedClassIndex].invoicePaidTotal);
                            return (
                              <div className="p-3 border-b grid grid-cols-3 gap-2">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                                  <p className="text-xs text-blue-600 font-semibold mb-1">Đã thanh toán</p>
                                  <p className="text-lg font-bold text-blue-700">{stats.paid.toLocaleString('vi-VN')} VND</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                                  <p className="text-xs text-green-600 font-semibold mb-1">Đã học</p>
                                  <p className="text-lg font-bold text-green-700">{stats.attended.toLocaleString('vi-VN')} VND</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                                  <p className="text-xs text-orange-600 font-semibold mb-1">Còn lại</p>
                                  <p className="text-lg font-bold text-orange-700">{stats.remaining.toLocaleString('vi-VN')} VND</p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Sessions Table */}
                          <div className="flex-1 overflow-x-auto p-4">
                            {(() => {
                              const sessions = classesData[selectedClassIndex].sessions || [];
                              return (
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                                      <th className="text-left p-2 font-semibold text-gray-700">Buổi học</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Ca học</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Ngày</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Điểm danh</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Tên Học phí</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Học phí gốc</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Học phí áp dụng</th>
                                      <th className="text-left p-2 font-semibold text-gray-700">Loại</th>
                                      <th className="text-right p-2 font-semibold text-gray-700">Học phí</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sessions && sessions.length > 0 ? (
                                      sessions.map((session: any, idx: number) => {
                                        const shiftTemplate = session.shiftTemplate;
                                        const packageType = session.studentSession?.packageType || "buổi";
                                        const sessionPrice = Number(session.studentSession?.sessionPrice || 0);
                                        const attendanceStatus = session.studentSession?.attendanceStatus;
                                        const isAttended = attendanceStatus === 'present';
                                        const isDeducted = !!attendanceStatus && deductingStatuses.has(attendanceStatus);
                                        const allocatedFee = session.allocatedFee != null ? Number(session.allocatedFee) : null;
                                        const deductAmount = allocatedFee != null ? allocatedFee : sessionPrice;
                                        const feeDisplay = isDeducted
                                          ? (packageType === 'buổi'
                                            ? `-${deductAmount.toLocaleString('vi-VN')} VND`
                                            : `-1 buổi`)
                                          : '- VND';
                                        
                                        return (
                                          <tr key={session.studentSession?.id || idx} className="border-b border-gray-200 hover:bg-gray-50">
                                            <td className="p-2">Buổi {session.studentSession?.sessionOrder || idx + 1}</td>
                                            <td className="p-2">
                                              {shiftTemplate ? (
                                                <div>
                                                  <div>ca {shiftTemplate.name}</div>
                                                  <div className="text-xs text-gray-500">{formatCourseTime(shiftTemplate.startTime, shiftTemplate.endTime)}</div>
                                                </div>
                                              ) : "N/A"}
                                            </td>
                                            <td className="p-2">
                                              {session.classSession?.sessionDate ? formatSessionDate(session.classSession.sessionDate) : "N/A"}
                                            </td>
                                            <td className="p-2">
                                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                                isAttended ? 'bg-green-100 text-green-700' :
                                                attendanceStatus === 'absent' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                              }`}>
                                                {isAttended ? 'Có mặt' :
                                                 attendanceStatus === 'absent' ? 'Vắng' :
                                                 'Chưa điểm danh'}
                                              </span>
                                            </td>
                                            <td className="p-2 text-gray-600">{session.feePackage?.name || 'N/A'}</td>
                                            <td className="p-2 text-gray-600">{sessionPrice.toLocaleString('vi-VN')} VND</td>
                                            <td className="p-2 text-gray-600">
                                              {session.allocatedFee != null
                                                ? <span className="text-blue-700 font-medium">{Number(session.allocatedFee).toLocaleString('vi-VN')} VND</span>
                                                : <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="p-2 text-gray-600">{packageType === 'buổi' ? 'Buổi' : 'Khoá'}</td>
                                            <td className="p-2 text-right">
                                              <span className={isDeducted ? "text-red-600 font-medium" : "text-gray-400"}>
                                                {feeDisplay}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    ) : (
                                      <tr>
                                        <td colSpan={9} className="p-4 text-center text-gray-500">
                                          Không có buổi học nào
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="fee-packages" className="!mt-0 p-0 flex-1 overflow-hidden">
                <StudentFeePackagesTab studentId={student.id} open={open} />
              </TabsContent>

              <TabsContent value="invoices" className="!mt-0 p-0 flex-1 overflow-hidden">
                <StudentInvoicesTab studentId={student.id} open={open} />
              </TabsContent>

              <TabsContent value="fee-wallet" className="!mt-0 p-0 flex-1 overflow-hidden">
                <StudentFeeWalletTab studentId={student.id} open={open} />
              </TabsContent>

            </Tabs>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
