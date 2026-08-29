import { useState, useEffect, useRef, useCallback } from "react";
import { useZaloSSE } from "@/hooks/use-zalo-sse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import {
  Send, MessageCircle, Loader2, RefreshCw, Link2,
  Search, Phone, Info, MoreHorizontal, Image, Smile,
  CheckCheck, Wifi, User, X, UserPlus, ExternalLink,
  Paperclip, FileText, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type ZaloConversation = {
  id: string;
  locationId: string;
  followerId: string;
  followerName: string | null;
  followerAvatar: string | null;
  anonymousKey: string | null;
  isAnonymous: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

type ZaloMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  content: string | null;
  attachments: any[] | null;
  sentAt: string;
};

type ZaloConfig = {
  id: string;
  locationId: string | null;
  appId: string;
  oaId: string | null;
  oaName: string | null;
  hasToken: boolean;
  isTokenExpired: boolean;
  isConnected: boolean;
};

type StudentMinimal = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  parentPhone: string | null;
  locationId: string | null;
};

type LinkedStudent = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
};

type CrmRelationship = {
  id: string;
  name: string;
};

type CrmCustomerSource = {
  id: string;
  name: string;
};

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function formatDateDivider(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return ""; }
}

function getInitials(name: string) {
  if (!name) return "Z";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function Avatar({ name, avatar, size = "md" }: { name: string; avatar?: string | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-9 h-9 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-11 h-11 text-sm";
  if (avatar) {
    return <img src={avatar} alt={name} className={cn("rounded-full object-cover shrink-0", sz)} onError={e => { (e.target as any).style.display = "none"; }} />;
  }
  return (
    <div className={cn("rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold shrink-0", sz)}>
      {getInitials(name)}
    </div>
  );
}

function ConvSkeleton() {
  return (
    <div className="px-4 py-3 flex items-start gap-3 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 bg-slate-200 rounded w-2/3" />
        <div className="h-2.5 bg-slate-100 rounded w-full" />
      </div>
    </div>
  );
}

function MsgSkeleton() {
  return (
    <div className="space-y-4 px-6 py-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={cn("flex gap-3 animate-pulse", i % 2 === 1 ? "flex-row-reverse" : "")}>
          {i % 2 === 0 && <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />}
          <div className={cn("rounded-2xl px-4 py-3 space-y-1", i % 2 === 1 ? "bg-blue-100 w-48" : "bg-white w-56 border border-slate-100")}>
            <div className="h-3 bg-slate-200 rounded w-full" />
            <div className="h-3 bg-slate-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ZaloOAChatPage() {
  const { data: locations } = useLocations();
  const { toast } = useToast();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connectDialogLocationId, setConnectDialogLocationId] = useState<string>("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Attachment & emoji state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileType, setPendingFileType] = useState<"image" | "file" | "gif">("image");
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Link student dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkingStudent, setLinkingStudent] = useState(false);

  // Quick-add student dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    type: "Học viên" as "Học viên" | "Phụ huynh",
    locationIds: [] as string[],
    customerSourceIds: [] as string[],
    username: "",
    password: "123456",
    parentName: "",
    parentPhone: "",
    note: "",
    relationshipId: "",
  });
  const [autoCode, setAutoCode] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentId, setNewStudentId] = useState<string | null>(null);

  const { data: crmRelationships } = useQuery<CrmRelationship[]>({
    queryKey: ["/api/crm/relationships"],
  });

  const { data: customerSources } = useQuery<CrmCustomerSource[]>({
    queryKey: ["/api/crm/customer-sources"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zalo_success") === "1") {
      toast({ title: "Kết nối thành công", description: "Zalo OA đã được kết nối thành công." });
      qc.invalidateQueries({ queryKey: ["/api/zalo-oa/configs"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("zalo_error")) {
      toast({ title: "Kết nối thất bại", description: params.get("zalo_error") || "Lỗi kết nối Zalo OA", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnectZalo = async (locId?: string) => {
    const targetLocationId = locId || selectedLocationId;
    if (!targetLocationId) return;
    setIsConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/zalo-oa/connect?locationId=${targetLocationId}&returnPath=/zalo`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Lỗi", description: data.message || "Không lấy được đường dẫn kết nối Zalo", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể kết nối Zalo", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOpenConnectDialog = () => {
    const firstLoc = (locations as any[])?.[0]?.id || "";
    setConnectDialogLocationId(selectedLocationId || firstLoc);
    setShowConnectDialog(true);
  };

  const handleDisconnect = async (locId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Bạn có chắc muốn ngắt kết nối Zalo OA cho cơ sở này?")) return;
    try {
      await apiRequest("DELETE", `/api/zalo-oa/configs/${locId}`);
      toast({ title: "Đã ngắt kết nối Zalo OA." });
      qc.invalidateQueries({ queryKey: ["/api/zalo-oa/configs"] });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    }
  };

  const handleRefreshToken = async (locId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest("POST", `/api/zalo-oa/configs/${locId}/refresh-token`);
      toast({ title: "Đã làm mới token thành công." });
      qc.invalidateQueries({ queryKey: ["/api/zalo-oa/configs"] });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId((locations[0] as any).id);
    }
  }, [locations, selectedLocationId]);

  const { data: configs } = useQuery<ZaloConfig[]>({
    queryKey: ["/api/zalo-oa/configs"],
  });

  const currentConfig = configs?.find(c => c.locationId === selectedLocationId);
  const isConfigured = !!currentConfig?.hasToken && !currentConfig?.isTokenExpired && currentConfig?.isConnected !== false;

  useZaloSSE({ enabled: !!selectedLocationId && isConfigured });

  const { data: conversations, isLoading: convsLoading, refetch: refetchConvs } = useQuery<ZaloConversation[]>({
    queryKey: ["/api/zalo-oa/conversations", selectedLocationId],
    enabled: !!selectedLocationId && isConfigured,
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/zalo-oa/conversations?locationId=${selectedLocationId}`);
      return res.json();
    },
  });

  const { data: messages, isLoading: msgsLoading, refetch: refetchMsgs } = useQuery<ZaloMessage[]>({
    queryKey: ["/api/zalo-oa/messages", selectedConvId],
    enabled: !!selectedConvId,
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/zalo-oa/conversations/${selectedConvId}/messages`);
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/zalo-oa/conversations", selectedLocationId] });
      return data;
    },
  });

  // Tìm kiếm học viên từ database
  const { data: studentSearchResult, isFetching: studentSearching } = useQuery<{ students: StudentMinimal[] }>({
    queryKey: ["/api/students", "search", searchQuery, selectedLocationId],
    enabled: searchQuery.trim().length >= 2,
    staleTime: 3000,
    queryFn: async () => {
      const params = new URLSearchParams({
        searchTerm: searchQuery,
        minimal: "true",
        limit: "10",
      });
      if (selectedLocationId) params.set("locationId", selectedLocationId);
      const res = await apiRequest("GET", `/api/students?${params.toString()}`);
      return res.json();
    },
  });

  const studentResults = studentSearchResult?.students ?? [];

  // Lấy thông tin học viên đã liên kết với hội thoại hiện tại
  const { data: linkedStudentData, refetch: refetchLinkedStudent } = useQuery<{ linked: boolean; student?: LinkedStudent }>({
    queryKey: ["/api/zalo-oa/conversations", selectedConvId, "linked-student"],
    enabled: !!selectedConvId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/zalo-oa/conversations/${selectedConvId}/linked-student`);
      return res.json();
    },
  });

  // Tìm kiếm học viên cho dialog liên kết
  const { data: linkSearchResult, isFetching: linkSearching } = useQuery<{ students: StudentMinimal[] }>({
    queryKey: ["/api/students", "link-search", linkSearchQuery],
    enabled: linkSearchQuery.trim().length >= 2,
    staleTime: 3000,
    queryFn: async () => {
      const params = new URLSearchParams({ searchTerm: linkSearchQuery, minimal: "true", limit: "10" });
      const res = await apiRequest("GET", `/api/students?${params.toString()}`);
      return res.json();
    },
  });

  const linkSearchResults = linkSearchResult?.students ?? [];

  const handleLinkStudent = async (student: StudentMinimal) => {
    if (!selectedConvId || linkingStudent) return;
    setLinkingStudent(true);
    try {
      const res = await apiRequest("POST", `/api/zalo-oa/conversations/${selectedConvId}/link-student`, { studentId: student.id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Liên kết thất bại");
      toast({ title: "Liên kết thành công", description: `${student.fullName} (${student.code}) đã được liên kết với hội thoại này.` });
      setShowLinkDialog(false);
      setLinkSearchQuery("");
      refetchLinkedStudent();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể liên kết học viên", variant: "destructive" });
    } finally {
      setLinkingStudent(false);
    }
  };

  // Click vào học viên từ dropdown → tìm hội thoại khớp
  const handleSelectStudent = useCallback((student: StudentMinimal) => {
    setShowStudentDropdown(false);
    setSearchQuery(student.fullName);

    if (!conversations) {
      toast({ title: "Chưa có dữ liệu hội thoại", description: "Vui lòng chờ hội thoại tải xong.", variant: "destructive" });
      return;
    }

    // Khớp theo tên hoặc số điện thoại
    const normalize = (s: string) => s.toLowerCase().trim();
    const phones = [student.phone, student.parentPhone].filter(Boolean).map(p => p!.replace(/\D/g, ""));

    const matched = conversations.find(conv => {
      const name = normalize(conv.followerName || conv.followerId);
      const studentName = normalize(student.fullName);
      if (name.includes(studentName) || studentName.includes(name)) return true;
      if (phones.length > 0) {
        const convPhone = (conv.followerName || conv.followerId).replace(/\D/g, "");
        return phones.some(p => convPhone.includes(p) || p.includes(convPhone));
      }
      return false;
    });

    if (matched) {
      setSelectedConvId(matched.id);
    } else {
      toast({
        title: `Không tìm thấy hội thoại của "${student.fullName}"`,
        description: "Học viên này chưa nhắn tin qua Zalo OA.",
      });
    }
  }, [conversations, toast]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowStudentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedConv = conversations?.find(c => c.id === selectedConvId);

  // Quét số điện thoại Việt Nam từ nội dung tin nhắn
  const extractPhoneFromMessages = useCallback((msgs: ZaloMessage[]): string => {
    const vnPhoneRegex = /(?<![0-9])(?:0|\+84|84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}(?![0-9])/g;
    for (const msg of [...msgs].reverse()) {
      if (msg.direction === "inbound" && msg.content) {
        const matches = msg.content.match(vnPhoneRegex);
        if (matches && matches[0]) {
          return matches[0].replace(/^\+84/, "0").replace(/^84/, "0");
        }
      }
    }
    return "";
  }, []);

  // Quét email từ nội dung tin nhắn
  const extractEmailFromMessages = useCallback((msgs: ZaloMessage[]): string => {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    for (const msg of [...msgs].reverse()) {
      if (msg.direction === "inbound" && msg.content) {
        const matches = msg.content.match(emailRegex);
        if (matches && matches[0]) return matches[0];
      }
    }
    return "";
  }, []);

  // Mở dialog thêm học viên, tự điền thông tin
  const handleOpenAddDialog = useCallback(async () => {
    if (!selectedConv) return;
    const detectedPhone = messages ? extractPhoneFromMessages(messages) : "";
    const detectedEmail = messages ? extractEmailFromMessages(messages) : "";
    const defaultType = "Học viên";
    const defaultRelId = crmRelationships && crmRelationships.length > 0 ? crmRelationships[0].id : "";
    const defaultLocIds = selectedLocationId ? [selectedLocationId] : [];
    setAddForm({
      fullName: selectedConv.followerName || "",
      phone: detectedPhone,
      email: detectedEmail,
      dateOfBirth: "",
      type: defaultType,
      locationIds: defaultLocIds,
      customerSourceIds: [],
      username: "",
      password: "123456",
      parentName: "",
      parentPhone: "",
      note: "",
      relationshipId: defaultRelId,
    });
    setAutoCode("");
    setNewStudentId(null);
    setShowAddDialog(true);
    try {
      const codeRes = await apiRequest("GET", `/api/students/next-code?type=${encodeURIComponent(defaultType)}`);
      const { code } = await codeRes.json();
      setAutoCode(code);
      setAddForm(f => ({ ...f, username: f.username || code }));
    } catch {}
  }, [selectedConv, messages, extractPhoneFromMessages, extractEmailFromMessages, crmRelationships, selectedLocationId]);

  // Submit tạo học viên mới
  const handleAddStudent = async () => {
    if (!addForm.fullName.trim() || !selectedLocationId) return;
    setAddingStudent(true);
    try {
      // Dùng mã đã fetch sẵn, hoặc fetch lại nếu chưa có
      let code = autoCode;
      if (!code) {
        const codeRes = await apiRequest("GET", `/api/students/next-code?type=${encodeURIComponent(addForm.type)}`);
        const data = await codeRes.json();
        code = data.code;
      }

      const noteLines: string[] = [];
      if (addForm.note.trim()) noteLines.push(addForm.note.trim());
      if (addForm.parentName.trim()) noteLines.push(`Phụ huynh: ${addForm.parentName.trim()}`);
      if (addForm.parentPhone.trim()) noteLines.push(`SĐT PH: ${addForm.parentPhone.trim()}`);

      const effectiveLocs = addForm.locationIds.length > 0 ? addForm.locationIds : [selectedLocationId];
      const payload = {
        fullName: addForm.fullName.trim(),
        type: addForm.type,
        code,
        locationIds: effectiveLocs,
        phone: addForm.phone.trim() || undefined,
        email: addForm.email.trim() || undefined,
        dateOfBirth: addForm.dateOfBirth || undefined,
        username: addForm.username.trim() || undefined,
        password: addForm.password.trim() || undefined,
        customerSourceIds: addForm.customerSourceIds.length > 0 ? addForm.customerSourceIds : undefined,
        socialLink: `Zalo ID: ${selectedConv?.followerId || ""}`,
        note: noteLines.join(" | ") || undefined,
        relationshipIds: addForm.relationshipId ? [addForm.relationshipId] : undefined,
      };

      const res = await apiRequest("POST", "/api/students", payload);
      const student = await res.json();

      if (!res.ok) throw new Error(student.message || "Tạo học viên thất bại");

      setNewStudentId(student.id);

      // Tự động map Zalo OA với học viên vừa tạo
      if (selectedConvId) {
        try {
          await apiRequest("POST", `/api/zalo-oa/conversations/${selectedConvId}/link-student`, { studentId: student.id });
          refetchLinkedStudent();
        } catch {}
      }

      toast({
        title: "Đã thêm học viên thành công",
        description: `${addForm.fullName} (${code}) đã được thêm và liên kết với Zalo OA.`,
      });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể tạo học viên", variant: "destructive" });
    } finally {
      setAddingStudent(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/zalo-oa/conversations/${selectedConvId}/reply`, { message: text });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      if (textareaRef.current) textareaRef.current.style.height = "40px";
      refetchMsgs();
      refetchConvs();
    },
    onError: (err: any) => {
      toast({ title: "Gửi thất bại", description: err.message, variant: "destructive" });
    },
  });

  const sendAttachmentMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: "image" | "file" | "gif" }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await fetch(`/api/zalo-oa/conversations/${selectedConvId}/send-attachment`, {
        method: "POST",
        body: formData,
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gửi file thất bại");
      return data;
    },
    onSuccess: () => {
      setPendingFile(null);
      setPendingFilePreview(null);
      refetchMsgs();
      refetchConvs();
    },
    onError: (err: any) => {
      toast({ title: "Gửi file thất bại", description: err.message, variant: "destructive" });
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isGif = file.type === "image/gif";
    const type = isGif ? "gif" : "image";
    setPendingFileType(type);
    setPendingFile(file);
    const url = URL.createObjectURL(file);
    setPendingFilePreview(url);
    e.target.value = "";
    setShowEmojiPicker(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFileType("file");
    setPendingFile(file);
    setPendingFilePreview(null);
    e.target.value = "";
    setShowEmojiPicker(false);
  };

  const handleRemovePending = () => {
    setPendingFile(null);
    setPendingFilePreview(null);
  };

  const handleSendAttachment = () => {
    if (!pendingFile || sendAttachmentMutation.isPending) return;
    sendAttachmentMutation.mutate({ file: pendingFile, type: pendingFileType });
  };

  const insertEmoji = (emoji: string) => {
    setReplyText(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (pendingFile) { handleSendAttachment(); return; }
    const text = replyText.trim();
    if (!text || replyMutation.isPending) return;
    replyMutation.mutate(text);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    e.target.style.height = "40px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const { data: webhookInfo } = useQuery<{ webhookUrl: string; callbackUrl: string }>({
    queryKey: ["/api/zalo-oa/webhook-info"],
  });

  const filteredConvs = conversations?.filter(c => {
    if (!searchQuery.trim()) return true;
    const name = (c.followerName || c.followerId).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  }) ?? [];

  // Group messages by date
  const groupedMessages = () => {
    if (!messages) return [];
    const groups: { date: string; msgs: ZaloMessage[] }[] = [];
    messages.forEach(msg => {
      const date = formatDateDivider(msg.sentAt);
      const last = groups[groups.length - 1];
      if (!last || last.date !== date) {
        groups.push({ date, msgs: [msg] });
      } else {
        last.msgs.push(msg);
      }
    });
    return groups;
  };

  // ─── Connect Dialog ───────────────────────────────────────────────────────
  const ConnectDialog = (
    <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-blue-600" />
            Quản lý kết nối Zalo OA
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-slate-500">Chọn cơ sở để kết nối hoặc quản lý Zalo Official Account:</p>
          <div className="space-y-2">
            {(locations as any[] || []).map((loc: any) => {
              const cfg = configs?.find(c => c.locationId === loc.id);
              const connected = cfg?.hasToken && !cfg?.isTokenExpired && cfg?.isConnected !== false;
              const expired = cfg?.hasToken && cfg?.isTokenExpired;
              const refreshFailed = cfg?.hasToken && !cfg?.isTokenExpired && cfg?.isConnected === false;
              return (
                <div
                  key={loc.id}
                  onClick={() => setConnectDialogLocationId(loc.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    connectDialogLocationId === loc.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{loc.name}</p>
                    {connected && <p className="text-xs text-emerald-600 mt-0.5">Đã kết nối{cfg?.oaName ? ` — ${cfg.oaName}` : ""}</p>}
                    {expired && <p className="text-xs text-amber-600 mt-0.5">Token hết hạn — cần kết nối lại</p>}
                    {refreshFailed && <p className="text-xs text-red-500 mt-0.5">Kết nối thất bại — cần kết nối lại</p>}
                    {!cfg?.hasToken && <p className="text-xs text-slate-400 mt-0.5">Chưa kết nối</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(expired || refreshFailed) && (
                      <button
                        onClick={(e) => handleRefreshToken(loc.id, e)}
                        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"
                        title="Làm mới token"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {cfg?.hasToken && (
                      <button
                        onClick={(e) => handleDisconnect(loc.id, e)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                        title="Ngắt kết nối"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {connected && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block ml-1" />}
                    {(expired || refreshFailed) && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 block ml-1" />}
                    {!cfg?.hasToken && <span className="w-2.5 h-2.5 rounded-full bg-slate-200 block ml-1" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConnectDialog(false)}>Đóng</Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            disabled={!connectDialogLocationId || isConnecting}
            onClick={() => { setShowConnectDialog(false); handleConnectZalo(connectDialogLocationId); }}
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {isConnecting ? "Đang chuyển hướng..." : "Kết nối Zalo OA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ─── Chưa cấu hình ───────────────────────────────────────────────────────
  if (!currentConfig || !currentConfig.hasToken || currentConfig.isTokenExpired) {
    return (
      <DashboardLayout fullscreen>
        {ConnectDialog}
        <div className="flex flex-col h-full bg-slate-50">
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-muted-foreground p-8">
            <div className="w-20 h-20 rounded-2xl bg-white shadow-md flex items-center justify-center border border-slate-100">
              <span className="text-4xl">💬</span>
            </div>
            <div className="text-center max-w-sm">
              <p className="font-semibold text-slate-700 text-lg mb-1">Kết nối Zalo OA</p>
              <p className="text-sm text-slate-500 mb-5">Kết nối tài khoản Zalo Official Account để nhận và trả lời tin nhắn khách hàng ngay trên hệ thống.</p>
              <Button
                onClick={handleOpenConnectDialog}
                disabled={isConnecting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 shadow-sm"
              >
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                {isConnecting ? "Đang chuyển hướng..." : "Kết nối Zalo OA"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Đã kết nối ──────────────────────────────────────────────────────────
  return (
    <DashboardLayout fullscreen>
      {ConnectDialog}
      <div className="flex h-full min-h-0 bg-slate-50">

        {/* ═══ CỘT HỘI THOẠI ═══ */}
        <div className="w-[340px] shrink-0 flex flex-col min-h-0 bg-white border-r border-slate-200">

          {/* Header cột hội thoại */}
          <div className="px-4 py-3.5 border-b border-slate-200">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                <span className="text-lg">💬</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  Zalo OA{currentConfig.oaName ? ` — ${currentConfig.oaName}` : ""}
                </p>
                {locations && locations.length > 1 ? (
                  <Select value={selectedLocationId} onValueChange={v => { setSelectedLocationId(v); setSelectedConvId(null); }}>
                    <SelectTrigger className="h-5 text-xs border-none shadow-none p-0 gap-1 w-full text-slate-500">
                      <SelectValue placeholder="Cơ sở" />
                    </SelectTrigger>
                    <SelectContent>
                      {(locations as any[]).map((l: any) => (
                        <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-slate-400">{(locations as any[])?.[0]?.name || "Cơ sở"}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-200 bg-emerald-50 text-emerald-700 font-medium gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Đã kết nối
                </Badge>
                <button
                  onClick={handleOpenConnectDialog}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Kết nối Zalo OA"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => refetchConvs()}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Làm mới"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setShowStudentDropdown(true);
                  }}
                  onFocus={() => searchQuery.trim().length >= 2 && setShowStudentDropdown(true)}
                  placeholder="Tìm tên, SĐT học viên..."
                  className="pl-9 pr-8 h-9 text-sm bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setShowStudentDropdown(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Student search dropdown */}
              {showStudentDropdown && searchQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
                  {/* Header dropdown */}
                  <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Học viên</span>
                    {studentSearching && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                  </div>

                  {studentSearching && studentResults.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center">Đang tìm kiếm...</div>
                  )}

                  {!studentSearching && studentResults.length === 0 && (
                    <div className="px-4 py-4 text-center">
                      <User className="w-6 h-6 text-slate-200 mx-auto mb-1.5" />
                      <p className="text-xs text-slate-400">Không tìm thấy học viên nào</p>
                    </div>
                  )}

                  {studentResults.map(student => (
                    <button
                      key={student.id}
                      onMouseDown={e => { e.preventDefault(); handleSelectStudent(student); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {student.fullName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{student.fullName}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {student.phone || student.parentPhone || student.code}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 border-slate-200 text-slate-400">
                        {student.code}
                      </Badge>
                    </button>
                  ))}

                  {studentResults.length > 0 && (
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
                      <p className="text-[11px] text-slate-400 text-center">
                        Chọn học viên để mở hội thoại Zalo
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center px-4 py-2 border-b border-slate-100 gap-1">
            <button className="px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded-md">
              Tất cả
              {conversations && conversations.length > 0 && (
                <span className="ml-1.5 bg-blue-600 text-white text-[10px] rounded-full px-1.5 py-px">{conversations.length}</span>
              )}
            </button>
            <button className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-50 transition-colors">
              Chưa đọc
              {conversations && conversations.filter(c => c.unreadCount > 0).length > 0 && (
                <span className="ml-1 text-slate-400">({conversations.filter(c => c.unreadCount > 0).length})</span>
              )}
            </button>
          </div>

          {/* Danh sách hội thoại */}
          <div className="flex-1 overflow-y-auto">
            {convsLoading && (
              <>
                <ConvSkeleton />
                <ConvSkeleton />
                <ConvSkeleton />
                <ConvSkeleton />
              </>
            )}
            {!convsLoading && (!filteredConvs || filteredConvs.length === 0) && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <MessageCircle className="w-7 h-7 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Chưa có hội thoại nào</p>
                  <p className="text-xs text-slate-400 mt-1">Tin nhắn từ Zalo sẽ xuất hiện ở đây</p>
                </div>
              </div>
            )}
            {filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "w-full text-left px-4 py-3 flex items-start gap-3 transition-all duration-150 relative border-b border-slate-50",
                  "hover:bg-slate-50",
                  selectedConvId === conv.id
                    ? "bg-blue-50 hover:bg-blue-50"
                    : ""
                )}
              >
                {selectedConvId === conv.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600 rounded-r" />
                )}
                <Avatar name={conv.followerName || conv.followerId} avatar={conv.followerAvatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={cn("text-sm truncate flex items-center gap-1", conv.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                      {conv.followerName || conv.followerId}
                      {conv.isAnonymous && <span className="shrink-0 text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-normal leading-none">Ẩn danh</span>}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-[11px] text-slate-400 shrink-0">{formatTime(conv.lastMessageAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-xs truncate", conv.unreadCount > 0 ? "text-slate-600" : "text-slate-400")}>
                      {conv.lastMessage || "Chưa có tin nhắn"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 bg-blue-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-semibold px-1">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ KHUNG CHAT CHÍNH ═══ */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {!selectedConvId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-slate-50">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                <MessageCircle className="w-10 h-10 text-slate-200" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">Chọn một hội thoại để bắt đầu</p>
                <p className="text-xs text-slate-400 mt-1">Chọn khách hàng từ danh sách bên trái</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-[64px] px-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                  {selectedConv && (
                    <>
                      <Avatar name={selectedConv.followerName || selectedConv.followerId} avatar={selectedConv.followerAvatar} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          {selectedConv.followerName || selectedConv.followerId}
                          {selectedConv.isAnonymous && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-normal leading-none">Ẩn danh</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {selectedConv.isAnonymous ? "Chưa follow OA" : `ID: ${selectedConv.followerId}`}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Linked student indicator or link button */}
                  {linkedStudentData?.linked && linkedStudentData.student ? (
                    <a
                      href={`/customers/${linkedStudentData.student.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                    >
                      <User className="w-3.5 h-3.5" />
                      {linkedStudentData.student.fullName} ({linkedStudentData.student.code})
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setLinkSearchQuery(""); setShowLinkDialog(true); }}
                      className="h-8 px-3 text-xs font-medium text-violet-600 border-violet-200 bg-violet-50 hover:bg-violet-100 hover:border-violet-300 gap-1.5"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Liên kết HV
                    </Button>
                  )}
                  {!linkedStudentData?.linked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenAddDialog}
                      className="h-8 px-3 text-xs font-medium text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Thêm HV
                    </Button>
                  )}
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                    <Info className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                  <Badge variant="outline" className="ml-1 text-[10px] px-2 py-0 h-5 border-emerald-200 bg-emerald-50 text-emerald-700 font-medium gap-1">
                    <Wifi className="w-2.5 h-2.5" />
                    Đang hoạt động
                  </Badge>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto min-h-0 bg-[#f1f5f9]">
                {msgsLoading ? (
                  <MsgSkeleton />
                ) : !messages || messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                    <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                      <MessageCircle className="w-7 h-7 text-slate-200" />
                    </div>
                    <p className="text-sm text-slate-500">Chưa có tin nhắn nào</p>
                    <p className="text-xs text-slate-400">Gửi tin nhắn để bắt đầu cuộc trò chuyện</p>
                  </div>
                ) : (
                  <div className="px-6 py-4 space-y-1">
                    {groupedMessages().map(group => (
                      <div key={group.date}>
                        {/* Date divider */}
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-slate-200" />
                          <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 bg-white rounded-full border border-slate-200">
                            {group.date}
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>

                        <div className="space-y-1">
                          {group.msgs.map((msg, idx) => {
                            const isOutbound = msg.direction === "outbound";
                            const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                            const isNewGroup = !prevMsg || prevMsg.direction !== msg.direction;
                            const nextMsg = idx < group.msgs.length - 1 ? group.msgs[idx + 1] : null;
                            const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction;

                            return (
                              <div
                                key={msg.id}
                                className={cn(
                                  "flex gap-2.5 items-end",
                                  isOutbound ? "flex-row-reverse" : "flex-row",
                                  isNewGroup ? "mt-3" : "mt-0.5"
                                )}
                              >
                                {/* Avatar chỉ hiện ở tin cuối của group */}
                                {!isOutbound && (
                                  <div className="w-9 shrink-0">
                                    {isLastInGroup && selectedConv && (
                                      <Avatar
                                        name={selectedConv.followerName || selectedConv.followerId}
                                        avatar={selectedConv.followerAvatar}
                                        size="sm"
                                      />
                                    )}
                                  </div>
                                )}

                                <div className={cn("flex flex-col max-w-[70%]", isOutbound ? "items-end" : "items-start")}>
                                  {/* Message bubble */}
                                  <div className={cn(
                                    "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                                    isOutbound
                                      ? [
                                        "bg-blue-600 text-white",
                                        "rounded-2xl",
                                        isNewGroup && isLastInGroup ? "rounded-2xl" : "",
                                        isNewGroup && !isLastInGroup ? "rounded-2xl rounded-br-md" : "",
                                        !isNewGroup && isLastInGroup ? "rounded-2xl rounded-tr-md rounded-br-md" : "",
                                        !isNewGroup && !isLastInGroup ? "rounded-l-2xl rounded-r-md" : "",
                                      ].join(" ")
                                      : [
                                        "bg-white border border-slate-100 text-slate-800",
                                        "rounded-2xl",
                                        isNewGroup && isLastInGroup ? "rounded-2xl" : "",
                                        isNewGroup && !isLastInGroup ? "rounded-2xl rounded-bl-md" : "",
                                        !isNewGroup && isLastInGroup ? "rounded-2xl rounded-tl-md rounded-bl-md" : "",
                                        !isNewGroup && !isLastInGroup ? "rounded-r-2xl rounded-l-md" : "",
                                      ].join(" ")
                                  )}>
                                    {msg.messageType === "image" && msg.attachments?.[0]?.payload?.url && (
                                      <a href={msg.attachments[0].payload.url} target="_blank" rel="noopener noreferrer">
                                        <img src={msg.attachments[0].payload.url} alt="ảnh" className="max-w-[240px] rounded-xl mb-1" />
                                      </a>
                                    )}
                                    {msg.messageType === "gif" && msg.attachments?.[0]?.payload?.url && (
                                      <img src={msg.attachments[0].payload.url} alt="gif" className="max-w-[240px] rounded-xl mb-1" />
                                    )}
                                    {msg.messageType === "file" && (
                                      <div className={cn("flex items-center gap-2 px-1 py-0.5", isOutbound ? "text-blue-50" : "text-slate-700")}>
                                        <FileText className="w-4 h-4 shrink-0" />
                                        <span className="text-sm truncate max-w-[180px]">{msg.content || msg.attachments?.[0]?.payload?.name || "[file]"}</span>
                                      </div>
                                    )}
                                    {msg.messageType === "sticker" && (
                                      <span className={cn("text-xs italic", isOutbound ? "text-blue-200" : "text-slate-400")}>[sticker]</span>
                                    )}
                                    {msg.content && msg.messageType !== "file" && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                                  </div>

                                  {/* Thời gian chỉ hiện ở tin cuối group */}
                                  {isLastInGroup && (
                                    <div className={cn("flex items-center gap-1 mt-1 px-1", isOutbound ? "flex-row-reverse" : "")}>
                                      <span className="text-[11px] text-slate-400">{formatTime(msg.sentAt)}</span>
                                      {isOutbound && <CheckCheck className="w-3 h-3 text-blue-400" />}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Reply box */}
              <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">

                {/* Hidden file inputs */}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <input ref={fileInputRef} type="file" accept="*/*" className="hidden" onChange={handleFileSelect} />

                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div className="mb-2 p-2 bg-white border border-slate-200 rounded-xl shadow-lg">
                    <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                      {["😀","😂","🥹","😍","🥰","😘","😎","🤩","😢","😭","😡","🤬","😱","🥳","🤗","🙏","👍","👎","❤️","🔥","✅","🎉","💯","🌟","😅","🤣","😊","🥺","😴","🤔","🙄","😏","😒","😔","😋","😜","🤪","🤓","😇","🥴","🤤","👀","💪","🤝","👋","✌️","🤞","🫶","💔","💕","💖","💗","💘","💝","🌹","🌺","🎁","🎊","🎈","⭐","🌈","☀️","🍀","🎵","🎶"].map(e => (
                        <button key={e} onClick={() => insertEmoji(e)} className="text-xl hover:bg-slate-100 rounded p-0.5 transition-colors leading-none">{e}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending file preview */}
                {pendingFile && (
                  <div className="mb-2 flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                    {pendingFilePreview ? (
                      <img src={pendingFilePreview} alt="preview" className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center bg-blue-50 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{pendingFile.name}</p>
                      <p className="text-xs text-slate-400">{(pendingFile.size / 1024).toFixed(0)} KB • {pendingFileType}</p>
                    </div>
                    <button onClick={handleRemovePending} className="text-slate-400 hover:text-slate-600 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-blue-300 focus-within:bg-white transition-colors">
                  {/* Toolbar left */}
                  <div className="flex items-center gap-0.5 pb-1 shrink-0">
                    <button
                      title="Gửi ảnh / GIF"
                      onClick={() => { imageInputRef.current?.click(); setShowEmojiPicker(false); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <Image className="w-4 h-4" />
                    </button>
                    <button
                      title="Đính kèm file"
                      onClick={() => { fileInputRef.current?.click(); setShowEmojiPicker(false); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      title="Emoji"
                      onClick={() => setShowEmojiPicker(v => !v)}
                      className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-lg transition-colors",
                        showEmojiPicker ? "text-yellow-500 bg-yellow-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={handleTextareaChange}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={pendingFile ? "Thêm chú thích (tuỳ chọn)..." : "Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"}
                    className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400 min-h-[40px] max-h-[120px] py-1.5 leading-relaxed"
                    style={{ height: "40px" }}
                    disabled={replyMutation.isPending || sendAttachmentMutation.isPending}
                    rows={1}
                  />

                  {/* Send button */}
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={(!replyText.trim() && !pendingFile) || replyMutation.isPending || sendAttachmentMutation.isPending}
                    className={cn(
                      "shrink-0 w-9 h-9 rounded-lg transition-all",
                      (replyText.trim() || pendingFile)
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        : "bg-slate-100 text-slate-300"
                    )}
                  >
                    {(replyMutation.isPending || sendAttachmentMutation.isPending)
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 px-1">
                  Enter để gửi • Shift+Enter xuống dòng • Hỗ trợ ảnh, file, emoji
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ DIALOG LIÊN KẾT HỌC VIÊN ═══ */}
      <Dialog open={showLinkDialog} onOpenChange={v => { if (!linkingStudent) setShowLinkDialog(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-violet-600" />
              </div>
              Liên kết học viên
            </DialogTitle>
          </DialogHeader>

          {selectedConv && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <Avatar name={selectedConv.followerName || selectedConv.followerId} avatar={selectedConv.followerAvatar} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{selectedConv.followerName || selectedConv.followerId}</p>
                <p className="text-[11px] text-slate-400">Zalo ID: {selectedConv.followerId}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px] border-violet-200 bg-violet-50 text-violet-600">Zalo OA</Badge>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                autoFocus
                placeholder="Tìm tên học viên, mã HV, SĐT..."
                value={linkSearchQuery}
                onChange={e => setLinkSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            <div className="min-h-[120px] max-h-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {linkSearchQuery.trim().length < 2 ? (
                <div className="flex flex-col items-center justify-center h-[120px] text-slate-400 text-sm gap-2">
                  <Search className="w-5 h-5 opacity-40" />
                  <span>Nhập ít nhất 2 ký tự để tìm kiếm</span>
                </div>
              ) : linkSearching ? (
                <div className="flex items-center justify-center h-[120px] gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tìm...</span>
                </div>
              ) : linkSearchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[120px] text-slate-400 text-sm gap-2">
                  <User className="w-5 h-5 opacity-40" />
                  <span>Không tìm thấy học viên nào</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {linkSearchResults.map(student => (
                    <button
                      key={student.id}
                      disabled={linkingStudent}
                      onClick={() => handleLinkStudent(student)}
                      className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-xs shrink-0">
                        {getInitials(student.fullName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{student.fullName}</p>
                        <p className="text-[11px] text-slate-400">{student.code}{student.phone ? ` · ${student.phone}` : ""}</p>
                      </div>
                      {linkingStudent ? (
                        <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
                      ) : (
                        <Link2 className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} disabled={linkingStudent}>
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG THÊM HỌC VIÊN NHANH ═══ */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!addingStudent) setShowAddDialog(v); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-blue-600" />
              </div>
              Thêm học viên từ Zalo
            </DialogTitle>
          </DialogHeader>

          {/* Thông tin nguồn Zalo */}
          {selectedConv && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <Avatar name={selectedConv.followerName || selectedConv.followerId} avatar={selectedConv.followerAvatar} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{selectedConv.followerName || selectedConv.followerId}</p>
                <p className="text-[11px] text-slate-400">Zalo ID: {selectedConv.followerId}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px] border-blue-200 bg-blue-50 text-blue-600">Zalo OA</Badge>
            </div>
          )}

          {/* Banner: Zalo OA sẽ tự động liên kết */}
          {!newStudentId && (
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-700">
              <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Sau khi thêm, tài khoản Zalo OA này sẽ <strong>tự động liên kết</strong> với học viên mới để gửi thông báo qua Zalo.</span>
            </div>
          )}

          {newStudentId ? (
            /* Sau khi tạo thành công */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <UserPlus className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Thêm thành công!</p>
                <p className="text-sm text-slate-500 mt-1">{addForm.fullName} đã được thêm vào hệ thống</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                  Đóng
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-1.5"
                  onClick={() => { window.open(`/customers/${newStudentId}`, "_blank"); setShowAddDialog(false); }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Xem hồ sơ
                </Button>
              </div>
            </div>
          ) : (
            /* Form nhập thông tin */
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {/* Hàng 1: Cơ sở, Mã, Phân loại */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Cơ sở <span className="text-red-500">*</span>
                  </Label>
                  <MultiSelect
                    options={(locations || []).map(l => ({ label: l.name, value: l.id }))}
                    defaultValue={addForm.locationIds}
                    onValueChange={v => setAddForm(f => ({ ...f, locationIds: v }))}
                    placeholder="Chọn cơ sở..."
                    maxCount={1}
                    modalPopover
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Mã <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={autoCode}
                    onChange={e => setAutoCode(e.target.value)}
                    placeholder="Đang tạo..."
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Phân loại</Label>
                  <Select
                    value={addForm.type}
                    onValueChange={async (v: any) => {
                      setAddForm(f => ({ ...f, type: v }));
                      setAutoCode("");
                      try {
                        const r = await apiRequest("GET", `/api/students/next-code?type=${encodeURIComponent(v)}`);
                        const d = await r.json();
                        setAutoCode(d.code);
                        setAddForm(f => ({ ...f, username: f.username || d.code }));
                      } catch {}
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Học viên">Học viên</SelectItem>
                      <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hàng 2: Họ và tên (full width) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  Họ và tên <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={addForm.fullName}
                  onChange={e => setAddForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Tên học viên..."
                  className="h-9"
                />
                {!addForm.fullName.trim() && (
                  <p className="text-[11px] text-amber-500">Tên lấy từ Zalo — bạn có thể chỉnh sửa</p>
                )}
              </div>

              {/* Hàng 3: Sinh nhật, SĐT, Email */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Sinh nhật</Label>
                  <Input
                    type="date"
                    value={addForm.dateOfBirth}
                    onChange={e => setAddForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Số điện thoại
                    {addForm.phone && (
                      <span className="ml-1 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">✓ quét</span>
                    )}
                  </Label>
                  <Input
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0xxxxxxxxx"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Email
                    {addForm.email && (
                      <span className="ml-1 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">✓ quét</span>
                    )}
                  </Label>
                  <Input
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="h-9"
                  />
                </div>
              </div>

              {/* Hàng 4: Nguồn, Tài khoản, Mật khẩu */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Nguồn</Label>
                  <MultiSelect
                    options={(customerSources || []).map(s => ({ label: s.name, value: s.id }))}
                    defaultValue={addForm.customerSourceIds}
                    onValueChange={v => setAddForm(f => ({ ...f, customerSourceIds: v }))}
                    placeholder="Chọn nguồn..."
                    maxCount={1}
                    modalPopover
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Tài khoản</Label>
                  <Input
                    value={addForm.username}
                    onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                    placeholder={autoCode || "HV-xxx"}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Mật khẩu</Label>
                  <Input
                    value={addForm.password}
                    onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Mối quan hệ */}
              {crmRelationships && crmRelationships.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Mối quan hệ</Label>
                  <Select
                    value={addForm.relationshipId}
                    onValueChange={v => setAddForm(f => ({ ...f, relationshipId: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Chọn mối quan hệ..." />
                    </SelectTrigger>
                    <SelectContent>
                      {crmRelationships.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Thông tin phụ huynh */}
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Thông tin phụ huynh</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Họ tên Phụ huynh</Label>
                    <Input
                      value={addForm.parentName}
                      onChange={e => setAddForm(f => ({ ...f, parentName: e.target.value }))}
                      placeholder="Tên phụ huynh..."
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">SĐT Phụ huynh</Label>
                    <Input
                      value={addForm.parentPhone}
                      onChange={e => setAddForm(f => ({ ...f, parentPhone: e.target.value }))}
                      placeholder="SĐT phụ huynh..."
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Ghi chú</Label>
                <Input
                  value={addForm.note}
                  onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Ghi chú thêm (tùy chọn)..."
                  className="h-9"
                />
              </div>
            </div>
          )}

          {!newStudentId && (
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addingStudent}>
                Hủy
              </Button>
              <Button
                onClick={handleAddStudent}
                disabled={!addForm.fullName.trim() || addingStudent}
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
              >
                {addingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {addingStudent ? "Đang thêm..." : "Thêm học viên"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
