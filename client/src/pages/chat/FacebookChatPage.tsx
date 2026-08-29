import { useState, useEffect, useRef, useCallback } from "react";
import { useFacebookSSE } from "@/hooks/use-facebook-sse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import {
  Send, MessageCircle, Loader2, RefreshCw, Search,
  CheckCheck, User, X, Plus, Settings, Trash2, Facebook,
  Link2, UserPlus, ExternalLink,
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

type FbConfig = {
  id: string;
  locationId: string | null;
  pageId: string;
  pageName: string | null;
  pageAvatar: string | null;
  verifyToken: string;
  isConnected: boolean;
};

type FbConversation = {
  id: string;
  locationId: string | null;
  facebookPageConfigId: string | null;
  psid: string;
  userName: string | null;
  userAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

type FbMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  content: string | null;
  attachments: any[] | null;
  sentAt: string;
};

type StudentMinimal = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  parentPhone?: string | null;
  locationId?: string | null;
};

type LinkedStudent = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
};

type CrmRelationship = { id: string; name: string };
type CrmCustomerSource = { id: string; name: string };

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function getInitials(name?: string | null) {
  if (!name) return "F";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function Avatar({ name, url, size = 9 }: { name?: string | null; url?: string | null; size?: number }) {
  if (url) return <img src={url} className={cn("rounded-full object-cover shrink-0", `w-${size} h-${size}`)} />;
  return (
    <div className={cn("rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0", `w-${size} h-${size}`)}>
      <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">
        {name ? getInitials(name) : <User className="w-4 h-4" />}
      </span>
    </div>
  );
}

// ── Connect Page Dialog (OAuth-first) ────────────────────────────────────────
function ConnectPageDialog({ open, onClose, locations }: {
  open: boolean;
  onClose: () => void;
  locations: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [form, setForm] = useState({ pageId: "", pageName: "", pageAccessToken: "" });

  const handleOAuth = async () => {
    setOauthLoading(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : "";
      const res = await apiRequest("GET", `/api/facebook/oauth/start${params}`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: data.message || "Không lấy được URL OAuth", variant: "destructive" });
        setOauthLoading(false);
      }
    } catch {
      toast({ title: "Lỗi khi bắt đầu OAuth", variant: "destructive" });
      setOauthLoading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: (data: { pageId: string; pageName: string; pageAccessToken: string; locationId: string }) =>
      apiRequest("POST", "/api/facebook/configs", data),
    onSuccess: () => {
      toast({ title: "Kết nối thành công" });
      qc.invalidateQueries({ queryKey: ["/api/facebook/configs"] });
      onClose();
    },
    onError: () => toast({ title: "Lỗi kết nối", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-blue-600" /> Kết nối Facebook Fanpage
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {locations.length > 1 && (
            <div className="space-y-2">
              <Label>Cơ sở</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Chọn cơ sở (tuỳ chọn)" /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white gap-2"
            onClick={handleOAuth}
            disabled={oauthLoading}
          >
            {oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
            Đăng nhập bằng Facebook
          </Button>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 text-center"
            onClick={() => setShowManual(v => !v)}
          >
            {showManual ? "Ẩn nhập thủ công" : "Hoặc nhập thủ công (nâng cao)"}
          </button>
          {showManual && (
            <div className="space-y-3 pt-1 border-t">
              <div className="space-y-2">
                <Label>Page ID <span className="text-red-500">*</span></Label>
                <Input placeholder="VD: 123456789" value={form.pageId}
                  onChange={e => setForm(f => ({ ...f, pageId: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tên Page (tuỳ chọn)</Label>
                <Input placeholder="VD: EasyEdu Fanpage" value={form.pageName}
                  onChange={e => setForm(f => ({ ...f, pageName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Page Access Token <span className="text-red-500">*</span></Label>
                <Input type="password" placeholder="EAAxxxx..." value={form.pageAccessToken}
                  onChange={e => setForm(f => ({ ...f, pageAccessToken: e.target.value }))} />
              </div>
              <Button
                className="w-full"
                disabled={!form.pageId || !form.pageAccessToken || createMut.isPending}
                onClick={() => createMut.mutate({ ...form, locationId })}
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Kết nối thủ công
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page Select Dialog (sau OAuth) ────────────────────────────────────────────
type OAuthPage = { id: string; name: string; picture?: string };

function PageSelectDialog({ open, onClose, pages, sessionId, locationId, onConnected }: {
  open: boolean;
  onClose: () => void;
  pages: OAuthPage[];
  sessionId: string;
  locationId: string;
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  const connectMut = useMutation({
    mutationFn: (pageId: string) =>
      apiRequest("POST", "/api/facebook/oauth/connect", { sessionId, pageId, locationId }),
    onSuccess: () => {
      toast({ title: "Kết nối thành công 🎉" });
      qc.invalidateQueries({ queryKey: ["/api/facebook/configs"] });
      onConnected();
      onClose();
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json().catch(() => null);
      toast({ title: msg?.message || "Lỗi kết nối", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-blue-600" /> Chọn Page để kết nối
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {pages.map(page => (
            <button
              key={page.id}
              onClick={() => setSelectedPageId(page.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                selectedPageId === page.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-muted/50"
              )}
            >
              {page.picture
                ? <img src={page.picture} className="w-10 h-10 rounded-full object-cover shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Facebook className="w-5 h-5 text-blue-600" />
                  </div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{page.name}</p>
                <p className="text-xs text-muted-foreground">ID: {page.id}</p>
              </div>
              {selectedPageId === page.id && (
                <div className="w-4 h-4 rounded-full bg-blue-500 shrink-0" />
              )}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button
            disabled={!selectedPageId || connectMut.isPending}
            onClick={() => connectMut.mutate(selectedPageId)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {connectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Kết nối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function FacebookChatPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: locations = [] } = useLocations();
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // OAuth callback handling
  const [oauthPages, setOauthPages] = useState<OAuthPage[]>([]);
  const [oauthSessionId, setOauthSessionId] = useState("");
  const [oauthLocationId, setOauthLocationId] = useState("");
  const [showPageSelect, setShowPageSelect] = useState(false);

  // ── Link student dialog ────────────────────────────────────────────────────
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkingStudent, setLinkingStudent] = useState(false);

  // ── Add student dialog ─────────────────────────────────────────────────────
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

  // Auto-select conversation from deep link (?conv=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conv");
    if (convId) {
      setSelectedConvId(convId);
      window.history.replaceState({}, "", "/facebook");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("oauth_session");
    const oauthError = params.get("oauth_error");

    if (oauthError) {
      const msgs: Record<string, string> = {
        no_pages: "Tài khoản Facebook này chưa quản lý Page nào.",
        token_exchange_failed: "Không thể lấy token từ Facebook. Vui lòng thử lại.",
        invalid_state: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
        server_error: "Lỗi máy chủ. Vui lòng thử lại sau.",
      };
      toast({ title: "Lỗi kết nối Facebook", description: msgs[oauthError] ?? oauthError, variant: "destructive" });
      window.history.replaceState({}, "", "/facebook");
      return;
    }

    if (sessionId) {
      window.history.replaceState({}, "", "/facebook");
      apiRequest("GET", `/api/facebook/oauth/pages/${sessionId}`)
        .then(r => r.json())
        .then(data => {
          if (data.pages?.length === 1) {
            apiRequest("POST", "/api/facebook/oauth/connect", {
              sessionId, pageId: data.pages[0].id, locationId: data.locationId,
            }).then(() => {
              toast({ title: "Kết nối thành công 🎉", description: data.pages[0].name });
              qc.invalidateQueries({ queryKey: ["/api/facebook/configs"] });
            }).catch(() => toast({ title: "Lỗi kết nối", variant: "destructive" }));
          } else if (data.pages?.length > 1) {
            setOauthPages(data.pages);
            setOauthSessionId(sessionId);
            setOauthLocationId(data.locationId ?? "");
            setShowPageSelect(true);
          } else {
            toast({ title: "Không tìm thấy Page nào", variant: "destructive" });
          }
        })
        .catch(() => toast({ title: "Session đã hết hạn. Vui lòng kết nối lại.", variant: "destructive" }));
    }
  }, []);

  useFacebookSSE({ enabled: true });

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: configs = [] } = useQuery<FbConfig[]>({
    queryKey: ["/api/facebook/configs"],
    queryFn: () => apiRequest("GET", "/api/facebook/configs").then(r => r.json()),
  });

  const { data: conversations = [], isLoading: convsLoading } = useQuery<FbConversation[]>({
    queryKey: ["/api/facebook/conversations", selectedLocationId],
    queryFn: () => {
      const params = selectedLocationId !== "all" ? `?locationId=${selectedLocationId}` : "";
      return apiRequest("GET", `/api/facebook/conversations${params}`).then(r => r.json());
    },
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<FbMessage[]>({
    queryKey: ["/api/facebook/conversations", selectedConvId, "messages"],
    queryFn: () => apiRequest("GET", `/api/facebook/conversations/${selectedConvId}/messages`).then(r => r.json()),
    enabled: !!selectedConvId,
  });

  // ── Linked student ────────────────────────────────────────────────────────
  const { data: linkedStudentData, refetch: refetchLinkedStudent } = useQuery<{ linked: boolean; student?: LinkedStudent }>({
    queryKey: ["/api/facebook/conversations", selectedConvId, "linked-student"],
    queryFn: () => apiRequest("GET", `/api/facebook/conversations/${selectedConvId}/linked-student`).then(r => r.json()),
    enabled: !!selectedConvId,
  });

  // ── Link search ────────────────────────────────────────────────────────────
  const { data: linkSearchResult, isFetching: linkSearching } = useQuery<{ students: StudentMinimal[] }>({
    queryKey: ["/api/students", "fb-link-search", linkSearchQuery],
    enabled: linkSearchQuery.trim().length >= 2,
    staleTime: 3000,
    queryFn: async () => {
      const params = new URLSearchParams({ searchTerm: linkSearchQuery, minimal: "true", limit: "10" });
      const res = await apiRequest("GET", `/api/students?${params.toString()}`);
      return res.json();
    },
  });
  const linkSearchResults = linkSearchResult?.students ?? [];

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLinkStudent = async (student: StudentMinimal) => {
    if (!selectedConvId || linkingStudent) return;
    setLinkingStudent(true);
    try {
      const res = await apiRequest("POST", `/api/facebook/conversations/${selectedConvId}/link-student`, { studentId: student.id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Liên kết thất bại");
      toast({ title: "Liên kết thành công", description: `${student.fullName} (${student.code}) đã được liên kết.` });
      setShowLinkDialog(false);
      setLinkSearchQuery("");
      refetchLinkedStudent();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể liên kết học viên", variant: "destructive" });
    } finally {
      setLinkingStudent(false);
    }
  };

  // Extract phone/email from messages
  const extractPhone = useCallback((msgs: FbMessage[]) => {
    const re = /(?<![0-9])(?:0|\+84|84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}(?![0-9])/g;
    for (const msg of [...msgs].reverse()) {
      if (msg.direction === "inbound" && msg.content) {
        const m = msg.content.match(re);
        if (m?.[0]) return m[0].replace(/^\+84/, "0").replace(/^84/, "0");
      }
    }
    return "";
  }, []);

  const extractEmail = useCallback((msgs: FbMessage[]) => {
    const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    for (const msg of [...msgs].reverse()) {
      if (msg.direction === "inbound" && msg.content) {
        const m = msg.content.match(re);
        if (m?.[0]) return m[0];
      }
    }
    return "";
  }, []);

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  const handleOpenAddDialog = useCallback(async () => {
    if (!selectedConv) return;
    const phone = extractPhone(messages);
    const email = extractEmail(messages);
    const defaultRelId = crmRelationships?.[0]?.id ?? "";
    const defaultLocIds = selectedLocationId !== "all" ? [selectedLocationId] : [];
    setAddForm({
      fullName: selectedConv.userName || "",
      phone,
      email,
      dateOfBirth: "",
      type: "Học viên",
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
      const r = await apiRequest("GET", `/api/students/next-code?type=${encodeURIComponent("Học viên")}`);
      const { code } = await r.json();
      setAutoCode(code);
      setAddForm(f => ({ ...f, username: f.username || code }));
    } catch {}
  }, [selectedConv, messages, extractPhone, extractEmail, crmRelationships, selectedLocationId]);

  const handleAddStudent = async () => {
    if (!addForm.fullName.trim()) return;
    setAddingStudent(true);
    try {
      let code = autoCode;
      if (!code) {
        const r = await apiRequest("GET", `/api/students/next-code?type=${encodeURIComponent(addForm.type)}`);
        code = (await r.json()).code;
      }
      const noteLines: string[] = [];
      if (addForm.note.trim()) noteLines.push(addForm.note.trim());
      if (addForm.parentName.trim()) noteLines.push(`Phụ huynh: ${addForm.parentName.trim()}`);
      if (addForm.parentPhone.trim()) noteLines.push(`SĐT PH: ${addForm.parentPhone.trim()}`);

      const effectiveLocs = addForm.locationIds.length > 0
        ? addForm.locationIds
        : selectedLocationId !== "all" ? [selectedLocationId] : [];

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
        socialLink: `Facebook PSID: ${selectedConv?.psid || ""}`,
        note: noteLines.join(" | ") || undefined,
        relationshipIds: addForm.relationshipId ? [addForm.relationshipId] : undefined,
      };

      const res = await apiRequest("POST", "/api/students", payload);
      const student = await res.json();
      if (!res.ok) throw new Error(student.message || "Tạo học viên thất bại");

      setNewStudentId(student.id);

      if (selectedConvId) {
        try {
          await apiRequest("POST", `/api/facebook/conversations/${selectedConvId}/link-student`, { studentId: student.id });
          refetchLinkedStudent();
        } catch {}
      }

      toast({
        title: "Đã thêm học viên thành công",
        description: `${addForm.fullName} (${code}) đã được thêm và liên kết với Facebook.`,
      });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể tạo học viên", variant: "destructive" });
    } finally {
      setAddingStudent(false);
    }
  };

  // ── Reply mutation ────────────────────────────────────────────────────────
  const replyMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiRequest("POST", `/api/facebook/conversations/${id}/reply`, { text }),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["/api/facebook/conversations", selectedConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/facebook/conversations"] });
    },
    onError: () => toast({ title: "Gửi thất bại", variant: "destructive" }),
  });

  const handleSend = useCallback(() => {
    if (!selectedConvId || !replyText.trim()) return;
    replyMut.mutate({ id: selectedConvId, text: replyText.trim() });
  }, [selectedConvId, replyText, replyMut]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Delete config ─────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/facebook/configs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/facebook/configs"] });
      toast({ title: "Đã ngắt kết nối page" });
    },
  });

  // ── Filter conversations ──────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    if (!searchTerm) return true;
    return c.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.psid.includes(searchTerm);
  });

  const connectedConfigs = configs.filter(c => c.isConnected);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

        {/* ── Left: conversation list ──────────────────────────────────── */}
        <div className="w-80 border-r flex flex-col shrink-0">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Facebook className="w-4 h-4 text-blue-600" />
                Facebook Chat
                {connectedConfigs.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{connectedConfigs.length} page</Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowSettings(true)} title="Quản lý Pages">
                  <Settings className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowConnect(true)} title="Kết nối page mới">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {locations.length > 1 && (
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Tìm kiếm..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {connectedConfigs.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Facebook className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Chưa kết nối Facebook Page nào</p>
              <Button size="sm" onClick={() => setShowConnect(true)}>
                <Plus className="w-4 h-4 mr-1" /> Kết nối page
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {convsLoading && (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!convsLoading && filteredConvs.length === 0 && connectedConfigs.length > 0 && (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Chưa có hội thoại nào</p>
              </div>
            )}
            {filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "w-full flex items-start gap-2.5 p-3 text-left hover:bg-muted/50 transition-colors border-b",
                  selectedConvId === conv.id && "bg-muted"
                )}
              >
                <Avatar name={conv.userName} url={conv.userAvatar} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{conv.userName ?? conv.psid}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-1">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMessage ?? ""}</p>
                    {conv.unreadCount > 0 && (
                      <Badge className="h-4 min-w-[1rem] text-[10px] px-1 shrink-0 bg-blue-600">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: message area ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <Facebook className="w-14 h-14 text-muted-foreground/30" />
              <p className="text-muted-foreground">Chọn một hội thoại để bắt đầu</p>
            </div>
          ) : (
            <>
              {/* Conv header */}
              <div className="p-3 border-b flex items-center gap-3">
                <Avatar name={selectedConv.userName} url={selectedConv.userAvatar} size={9} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{selectedConv.userName ?? selectedConv.psid}</p>
                  <p className="text-xs text-muted-foreground">PSID: {selectedConv.psid}</p>
                </div>

                {/* ── Liên kết HV / Thêm HV buttons ── */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {linkedStudentData?.linked && linkedStudentData.student ? (
                    <a
                      href={`/customers/${linkedStudentData.student.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
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
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                    qc.invalidateQueries({ queryKey: ["/api/facebook/conversations", selectedConvId, "messages"] });
                  }}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading && (
                  <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                )}
                {messages.map(msg => {
                  const isOut = msg.direction === "outbound";
                  return (
                    <div key={msg.id} className={cn("flex gap-2 max-w-[75%]", isOut ? "ml-auto flex-row-reverse" : "")}>
                      {!isOut && <Avatar name={selectedConv.userName} url={selectedConv.userAvatar} size={7} />}
                      <div className="space-y-1">
                        {msg.attachments?.map((att: any, i: number) => (
                          <div key={i} className={cn("rounded-2xl overflow-hidden", isOut ? "bg-blue-600 text-white" : "bg-muted")}>
                            {att.type === "image" && att.payload?.url && (
                              <img src={att.payload.url} className="max-w-[240px] max-h-[200px] object-cover" />
                            )}
                            {att.type !== "image" && (
                              <div className="px-3 py-2 text-xs">[{att.type}]</div>
                            )}
                          </div>
                        ))}
                        {msg.content && (
                          <div className={cn("px-3 py-2 rounded-2xl text-sm", isOut ? "bg-blue-600 text-white rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                            {msg.content}
                          </div>
                        )}
                        <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isOut ? "justify-end" : "")}>
                          <span>{formatTime(msg.sentAt)}</span>
                          {isOut && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Input
                    className="flex-1 text-sm"
                    placeholder="Nhập tin nhắn... (Enter để gửi)"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={replyMut.isPending}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!replyText.trim() || replyMut.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {replyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 pl-1">
                  ⚠️ Facebook chỉ cho phép reply trong 24h kể từ tin nhắn cuối của người dùng
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <ConnectPageDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        locations={locations}
      />

      <PageSelectDialog
        open={showPageSelect}
        onClose={() => setShowPageSelect(false)}
        pages={oauthPages}
        sessionId={oauthSessionId}
        locationId={oauthLocationId}
        onConnected={() => qc.invalidateQueries({ queryKey: ["/api/facebook/configs"] })}
      />

      {/* Settings dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quản lý Facebook Pages</DialogTitle>
          </DialogHeader>
          {configs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Chưa có page nào được kết nối.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {configs.map(cfg => {
                const loc = (locations as any[]).find((l: any) => l.id === cfg.locationId);
                return (
                  <div key={cfg.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <Facebook className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{cfg.pageName ?? cfg.pageId}</p>
                      <p className="text-xs text-muted-foreground">Page ID: {cfg.pageId}</p>
                      {loc && <p className="text-xs text-muted-foreground">{loc.name}</p>}
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Webhook: <span className="text-foreground">/api/facebook/webhook</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Verify Token: <span className="text-foreground">{cfg.verifyToken}</span>
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => {
                        if (confirm(`Ngắt kết nối page "${cfg.pageName ?? cfg.pageId}"?`)) {
                          deleteMut.mutate(cfg.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnect(true)}>
              <Plus className="w-4 h-4 mr-1" /> Kết nối page mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Avatar name={selectedConv.userName} url={selectedConv.userAvatar} size={9} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{selectedConv.userName ?? selectedConv.psid}</p>
                <p className="text-[11px] text-slate-400">PSID: {selectedConv.psid}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px] border-blue-200 bg-blue-50 text-blue-600">Facebook</Badge>
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
                      {linkingStudent
                        ? <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
                        : <Link2 className="w-4 h-4 text-slate-300 shrink-0" />
                      }
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
              Thêm học viên từ Facebook
            </DialogTitle>
          </DialogHeader>

          {selectedConv && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <Avatar name={selectedConv.userName} url={selectedConv.userAvatar} size={9} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{selectedConv.userName ?? selectedConv.psid}</p>
                <p className="text-[11px] text-slate-400">PSID: {selectedConv.psid}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px] border-blue-200 bg-blue-50 text-blue-600">Facebook</Badge>
            </div>
          )}

          {!newStudentId && (
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-700">
              <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Sau khi thêm, hội thoại Facebook này sẽ <strong>tự động liên kết</strong> với học viên mới.</span>
            </div>
          )}

          {newStudentId ? (
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
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {/* Hàng 1: Cơ sở, Mã, Phân loại */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Cơ sở <span className="text-red-500">*</span></Label>
                  <MultiSelect
                    options={(locations || []).map((l: any) => ({ label: l.name, value: l.id }))}
                    defaultValue={addForm.locationIds}
                    onValueChange={v => setAddForm(f => ({ ...f, locationIds: v }))}
                    placeholder="Chọn cơ sở..."
                    maxCount={1}
                    modalPopover
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Mã <span className="text-red-500">*</span></Label>
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
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Học viên">Học viên</SelectItem>
                      <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Họ và tên */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Họ và tên <span className="text-red-500">*</span></Label>
                <Input
                  value={addForm.fullName}
                  onChange={e => setAddForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Tên học viên..."
                  className="h-9"
                />
                {!addForm.fullName.trim() && (
                  <p className="text-[11px] text-amber-500">Tên lấy từ Facebook — bạn có thể chỉnh sửa</p>
                )}
              </div>

              {/* Sinh nhật, SĐT, Email */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Sinh nhật</Label>
                  <Input type="date" value={addForm.dateOfBirth}
                    onChange={e => setAddForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Số điện thoại
                    {addForm.phone && <span className="ml-1 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">✓ quét</span>}
                  </Label>
                  <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0xxxxxxxxx" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Email
                    {addForm.email && <span className="ml-1 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">✓ quét</span>}
                  </Label>
                  <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com" className="h-9" />
                </div>
              </div>

              {/* Nguồn, Tài khoản, Mật khẩu */}
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
                  <Input value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                    placeholder={autoCode || "HV-xxx"} className="h-9 font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Mật khẩu</Label>
                  <Input value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    className="h-9" />
                </div>
              </div>

              {/* Mối quan hệ */}
              {crmRelationships && crmRelationships.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Mối quan hệ</Label>
                  <Select value={addForm.relationshipId} onValueChange={v => setAddForm(f => ({ ...f, relationshipId: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn mối quan hệ..." /></SelectTrigger>
                    <SelectContent>
                      {crmRelationships.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
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
                    <Input value={addForm.parentName} onChange={e => setAddForm(f => ({ ...f, parentName: e.target.value }))}
                      placeholder="Tên phụ huynh..." className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">SĐT Phụ huynh</Label>
                    <Input value={addForm.parentPhone} onChange={e => setAddForm(f => ({ ...f, parentPhone: e.target.value }))}
                      placeholder="SĐT phụ huynh..." className="h-9" />
                  </div>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Ghi chú</Label>
                <Input value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Ghi chú thêm (tùy chọn)..." className="h-9" />
              </div>
            </div>
          )}

          {!newStudentId && (
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addingStudent}>Hủy</Button>
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
