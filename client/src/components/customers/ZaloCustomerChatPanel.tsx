import { useState, useEffect, useRef } from "react";
import { useZaloSSE } from "@/hooks/use-zalo-sse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Loader2, MessageCircle, ExternalLink, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { StudentResponse } from "@shared/schema";

type ZaloConversation = {
  id: string;
  locationId: string;
  followerId: string;
  followerName: string | null;
  followerAvatar: string | null;
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
  hasToken: boolean;
  isTokenExpired: boolean;
  isConnected: boolean;
  oaName: string | null;
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

function getInitials(name: string) {
  if (!name) return "Z";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function AvatarBubble({ name, avatar, size = "md" }: { name: string; avatar?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  if (avatar) {
    return <img src={avatar} alt={name} className={cn("rounded-full object-cover bg-blue-100 shrink-0", sz)} onError={e => { (e.target as any).style.display = "none"; }} />;
  }
  return (
    <div className={cn("rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold shrink-0", sz)}>
      {getInitials(name)}
    </div>
  );
}

interface Props {
  student: StudentResponse | null;
  open: boolean;
  onClose: () => void;
}

export function ZaloCustomerChatPanel({ student, open, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [search, setSearch] = useState("");

  const locationId = (student as any)?.locationId ?? null;

  // Reset state when student changes
  useEffect(() => {
    if (student) {
      setSelectedConvId(null);
      setReplyText("");
      setSearch(student.fullName ?? "");
    }
  }, [student?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConvId]);

  // Fetch Zalo OA config for this location
  const { data: configs } = useQuery<ZaloConfig[]>({
    queryKey: ["/api/zalo-oa/configs"],
    enabled: open,
  });

  const currentConfig = configs?.find(c => c.locationId === locationId);
  const isConfigured = !!currentConfig?.hasToken && !currentConfig?.isTokenExpired;

  useZaloSSE({ enabled: open && isConfigured });

  // Fetch conversations for this location
  const { data: conversations, isLoading: convsLoading } = useQuery<ZaloConversation[]>({
    queryKey: ["/api/zalo-oa/conversations", locationId],
    enabled: open && !!locationId && isConfigured,
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/zalo-oa/conversations?locationId=${locationId}`);
      return res.json();
    },
  });

  // Filter conversations by search term
  const filtered = conversations?.filter(c => {
    if (!search.trim()) return true;
    const name = (c.followerName || c.followerId).toLowerCase();
    return name.includes(search.toLowerCase());
  }) ?? [];

  // Auto-select first matching conversation when data arrives
  useEffect(() => {
    if (!selectedConvId && filtered.length > 0 && student) {
      const exact = filtered.find(c =>
        c.followerName?.toLowerCase().includes(student.fullName?.toLowerCase() ?? "")
      );
      if (exact) setSelectedConvId(exact.id);
    }
  }, [conversations, student?.id]);

  // Fetch messages for selected conversation
  const { data: messages, isLoading: msgsLoading, refetch: refetchMsgs } = useQuery<ZaloMessage[]>({
    queryKey: ["/api/zalo-oa/messages", selectedConvId],
    enabled: !!selectedConvId,
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/zalo-oa/conversations/${selectedConvId}/messages`);
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/zalo-oa/conversations", locationId] });
      return data;
    },
  });

  useEffect(() => {
    if (messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/zalo-oa/conversations/${selectedConvId}/reply`, { message: text });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      refetchMsgs();
    },
    onError: (err: any) => {
      toast({ title: "Gửi thất bại", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const text = replyText.trim();
    if (!text || replyMutation.isPending) return;
    replyMutation.mutate(text);
  };

  const selectedConv = conversations?.find(c => c.id === selectedConvId);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col w-full sm:max-w-2xl"
        style={{ maxWidth: "680px" }}
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <span className="text-lg">💬</span>
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold truncate">
                Chat Zalo — {student?.fullName ?? ""}
              </SheetTitle>
              {currentConfig?.oaName && (
                <p className="text-xs text-muted-foreground truncate">OA: {currentConfig.oaName}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              asChild
            >
              <a href="/zalo" target="_blank" rel="noopener noreferrer" title="Mở trang Zalo OA Chat">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </SheetHeader>

        {/* Body */}
        {!isConfigured ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">Chưa kết nối Zalo OA</p>
            <p className="text-xs opacity-70">Vào <strong>Cài đặt → Zalo OA</strong> để kết nối trước.</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Left: conversation list */}
            <div className="w-52 shrink-0 border-r flex flex-col min-h-0 bg-muted/10">
              <div className="px-2 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm tên..."
                    className="h-8 pl-7 pr-7 text-xs"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {convsLoading && (
                  <div className="flex items-center gap-2 justify-center py-6 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...
                  </div>
                )}
                {!convsLoading && filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 px-3 text-center gap-2">
                    <MessageCircle className="w-7 h-7 opacity-20" />
                    <p className="text-xs text-muted-foreground">
                      {search
                        ? "Không tìm thấy hội thoại"
                        : "Học viên chưa nhắn tin cho OA"}
                    </p>
                  </div>
                )}
                {filtered.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={cn(
                      "w-full text-left px-2.5 py-2.5 flex items-start gap-2 border-b transition-colors hover:bg-muted/40",
                      selectedConvId === conv.id && "bg-primary/8 border-l-2 border-l-primary"
                    )}
                  >
                    <AvatarBubble name={conv.followerName || conv.followerId} avatar={conv.followerAvatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium truncate">{conv.followerName || conv.followerId}</span>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage || "Chưa có tin nhắn"}
                      </p>
                      {conv.lastMessageAt && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatTime(conv.lastMessageAt)}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: message area */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {!selectedConvId ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
                  <MessageCircle className="w-9 h-9 opacity-20" />
                  <p className="text-xs">Chọn một hội thoại bên trái để xem tin nhắn</p>
                </div>
              ) : (
                <>
                  {/* Conv header */}
                  <div className="px-3 py-2.5 border-b flex items-center gap-2 bg-background shrink-0">
                    {selectedConv && (
                      <>
                        <AvatarBubble name={selectedConv.followerName || selectedConv.followerId} avatar={selectedConv.followerAvatar} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{selectedConv.followerName || selectedConv.followerId}</p>
                          <p className="text-[10px] text-muted-foreground">Zalo ID: {selectedConv.followerId}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
                    {msgsLoading && (
                      <div className="flex items-center gap-2 justify-center py-8 text-muted-foreground text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải tin nhắn...
                      </div>
                    )}
                    {!msgsLoading && messages?.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-xs">Chưa có tin nhắn</div>
                    )}
                    {messages?.map(msg => {
                      const isOutbound = msg.direction === "outbound";
                      return (
                        <div key={msg.id} className={cn("flex gap-2 items-end", isOutbound ? "flex-row-reverse" : "flex-row")}>
                          {!isOutbound && selectedConv && (
                            <AvatarBubble name={selectedConv.followerName || selectedConv.followerId} avatar={selectedConv.followerAvatar} size="sm" />
                          )}
                          <div className={cn(
                            "max-w-[72%] rounded-2xl px-3 py-2 text-xs",
                            isOutbound
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          )}>
                            {msg.messageType === "image" && msg.attachments?.[0]?.payload?.url && (
                              <a href={msg.attachments[0].payload.url} target="_blank" rel="noopener noreferrer">
                                <img src={msg.attachments[0].payload.url} alt="ảnh" className="max-w-[180px] rounded-xl mb-1" />
                              </a>
                            )}
                            {msg.messageType !== "text" && msg.messageType !== "image" && (
                              <span className="opacity-70">[{msg.messageType}]</span>
                            )}
                            {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                            <p className={cn("text-[10px] mt-1 opacity-60", isOutbound ? "text-right" : "text-left")}>
                              {formatTime(msg.sentAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply box */}
                  <div className="px-3 py-2.5 border-t bg-background flex items-end gap-2 shrink-0">
                    <Input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder="Nhập tin nhắn..."
                      className="flex-1 text-sm"
                      disabled={replyMutation.isPending}
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!replyText.trim() || replyMutation.isPending}
                      className="shrink-0 h-9 w-9"
                    >
                      {replyMutation.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
