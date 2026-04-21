import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShiftTemplate, Location, InsertShiftTemplate } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertShiftTemplateSchema } from "@shared/schema";
import { Plus, Pencil, Trash2, Clock, Building2, BookOpen, ListChecks, School, Banknote, X, FileSpreadsheet, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import type { AttendanceFeeRule, ScoreCategory, ScoreSheet, ScoreSheetItem } from "@shared/schema";

type ConfigTabPerm = { canAdd: boolean; canEdit: boolean; canDelete: boolean };

const EDUCATION_CONFIG_HREF = "/education-config";
const EDUCATION_TABS = [
  { value: "classrooms", label: "Phòng học", icon: School },
  { value: "subjects", label: "Bộ môn", icon: BookOpen },
  { value: "evaluation", label: "Tiêu chí đánh giá", icon: ListChecks },
  { value: "shifts", label: "Ca học", icon: Clock },
  { value: "attendance-fee", label: "Trừ tiền học phí", icon: Banknote },
  { value: "score-sheets", label: "Bảng điểm", icon: FileSpreadsheet },
];

// ─── Phòng học tab ────────────────────────────────────────────────────────────
function ClassroomsTab({ perm }: { perm?: ConfigTabPerm }) {
  const canAdd = perm?.canAdd ?? true;
  const canEdit = perm?.canEdit ?? true;
  const canDelete = perm?.canDelete ?? true;
  const { toast } = useToast();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const { data: rooms = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/classrooms", selectedLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/classrooms?locationId=${selectedLocationId}`);
      return res.json();
    },
    enabled: !!selectedLocationId,
  });

  const roomForm = useForm<{ name: string; capacity: string }>({
    defaultValues: { name: "", capacity: "" },
  });

  useEffect(() => {
    if (editingRoom) {
      roomForm.reset({ name: editingRoom.name, capacity: editingRoom.capacity?.toString() || "" });
    } else {
      roomForm.reset({ name: "", capacity: "" });
    }
  }, [editingRoom]);

  const createRoom = useMutation({
    mutationFn: async (data: { name: string; capacity: string }) =>
      (await apiRequest("POST", "/api/classrooms", { name: data.name, locationId: selectedLocationId, capacity: data.capacity ? parseInt(data.capacity) : null })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/classrooms", selectedLocationId] }); toast({ title: "Đã thêm phòng học" }); setIsRoomDialogOpen(false); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const updateRoom = useMutation({
    mutationFn: async (data: { name: string; capacity: string }) =>
      (await apiRequest("PUT", `/api/classrooms/${editingRoom?.id}`, { name: data.name, locationId: selectedLocationId, capacity: data.capacity ? parseInt(data.capacity) : null })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/classrooms", selectedLocationId] }); toast({ title: "Đã cập nhật phòng học" }); setIsRoomDialogOpen(false); setEditingRoom(null); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteRoom = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/classrooms/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/classrooms", selectedLocationId] }); toast({ title: "Đã xoá phòng học" }); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const handleRoomSubmit = (data: { name: string; capacity: string }) => {
    if (editingRoom) updateRoom.mutate(data);
    else createRoom.mutate(data);
  };

  return (
    <div className="flex gap-0 h-full border rounded-lg overflow-hidden">
      {/* Left sidebar: Locations */}
      <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="px-4 py-3 border-b bg-background">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cơ sở</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocationId(loc.id)}
              data-testid={`btn-location-${loc.id}`}
              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 border-b border-border/30 transition-colors ${selectedLocationId === loc.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"}`}
            >
              <Building2 className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate">{loc.name}</span>
              {loc.isMain && <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 shrink-0">Chính</Badge>}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Rooms */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 border-b flex items-center justify-between bg-background">
          <div>
            <p className="text-sm font-semibold">Phòng học</p>
            {selectedLocationId && (
              <p className="text-xs text-muted-foreground">{locations.find(l => l.id === selectedLocationId)?.name}</p>
            )}
          </div>
          {canAdd && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingRoom(null); setIsRoomDialogOpen(true); }} data-testid="btn-add-room">
            <Plus className="h-3.5 w-3.5" /> Thêm phòng
          </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Đang tải...</div>
          ) : rooms.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Chưa có phòng học nào. Nhấn "Thêm phòng" để tạo mới.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên phòng</TableHead>
                  <TableHead>Sức chứa</TableHead>
                  <TableHead className="w-20 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id} data-testid={`row-room-${room.id}`}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{room.capacity ? `${room.capacity} người` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRoom(room); setIsRoomDialogOpen(true); }} data-testid={`btn-edit-room-${room.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        )}
                        {canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteRoom.mutate(room.id)} data-testid={`btn-delete-room-${room.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Room Dialog */}
      <Dialog open={isRoomDialogOpen} onOpenChange={(open) => { setIsRoomDialogOpen(open); if (!open) setEditingRoom(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Sửa phòng học" : "Thêm phòng học"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={roomForm.handleSubmit(handleRoomSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên phòng <span className="text-destructive">*</span></label>
              <Input {...roomForm.register("name", { required: true })} placeholder="VD: Phòng A1" data-testid="input-room-name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sức chứa</label>
              <Input {...roomForm.register("capacity")} type="number" placeholder="VD: 30" data-testid="input-room-capacity" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRoomDialogOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={createRoom.isPending || updateRoom.isPending}>{editingRoom ? "Lưu" : "Thêm"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tiêu chí đánh giá tab ───────────────────────────────────────────────────
function EvaluationCriteriaTab({ perm }: { perm?: ConfigTabPerm }) {
  const canAdd = perm?.canAdd ?? true;
  const canEdit = perm?.canEdit ?? true;
  const canDelete = perm?.canDelete ?? true;
  const { toast } = useToast();
  const [selectedCriteriaId, setSelectedCriteriaId] = useState<string | null>(null);
  const [editingCriteria, setEditingCriteria] = useState<any | null>(null);
  const [isCriteriaDialogOpen, setIsCriteriaDialogOpen] = useState(false);
  const [editingSubCriteria, setEditingSubCriteria] = useState<any | null>(null);
  const [isSubDialogOpen, setIsSubDialogOpen] = useState(false);

  const { data: criteriaList = [] } = useQuery<any[]>({ queryKey: ["/api/evaluation-criteria"] });

  useEffect(() => {
    if (criteriaList.length > 0 && !selectedCriteriaId) {
      setSelectedCriteriaId(criteriaList[0].id);
    }
  }, [criteriaList, selectedCriteriaId]);

  const { data: subCriteriaList = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria", selectedCriteriaId, "sub-criteria"],
    queryFn: async () => {
      const res = await fetch(`/api/evaluation-criteria/${selectedCriteriaId}/sub-criteria`);
      return res.json();
    },
    enabled: !!selectedCriteriaId,
  });

  const criteriaForm = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const subForm = useForm<{ name: string }>({ defaultValues: { name: "" } });

  useEffect(() => { criteriaForm.reset({ name: editingCriteria?.name || "" }); }, [editingCriteria]);
  useEffect(() => { subForm.reset({ name: editingSubCriteria?.name || "" }); }, [editingSubCriteria]);

  const createCriteria = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("POST", "/api/evaluation-criteria", data)).json(),
    onSuccess: (row) => { queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria"] }); toast({ title: "Đã thêm tiêu chí" }); setIsCriteriaDialogOpen(false); setSelectedCriteriaId(row.id); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const updateCriteria = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("PUT", `/api/evaluation-criteria/${editingCriteria?.id}`, data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria"] }); toast({ title: "Đã cập nhật tiêu chí" }); setIsCriteriaDialogOpen(false); setEditingCriteria(null); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const deleteCriteria = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/evaluation-criteria/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria"] });
      toast({ title: "Đã xoá tiêu chí" });
      if (selectedCriteriaId === id) setSelectedCriteriaId(null);
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const createSub = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("POST", "/api/evaluation-sub-criteria", { name: data.name, criteriaId: selectedCriteriaId })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria", selectedCriteriaId, "sub-criteria"] }); toast({ title: "Đã thêm tiêu chí con" }); setIsSubDialogOpen(false); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const updateSub = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("PUT", `/api/evaluation-sub-criteria/${editingSubCriteria?.id}`, { name: data.name, criteriaId: selectedCriteriaId })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria", selectedCriteriaId, "sub-criteria"] }); toast({ title: "Đã cập nhật tiêu chí con" }); setIsSubDialogOpen(false); setEditingSubCriteria(null); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const deleteSub = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/evaluation-sub-criteria/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/evaluation-criteria", selectedCriteriaId, "sub-criteria"] }); toast({ title: "Đã xoá tiêu chí con" }); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex gap-0 h-full border rounded-lg overflow-hidden">
      {/* Left: Criteria list */}
      <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="px-4 py-3 border-b bg-background flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiêu chí</p>
          {canAdd && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingCriteria(null); setIsCriteriaDialogOpen(true); }} data-testid="btn-add-criteria">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {criteriaList.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground italic">Chưa có tiêu chí nào</p>
          ) : criteriaList.map((c) => (
            <div
              key={c.id}
              data-testid={`row-criteria-${c.id}`}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 border-b border-border/30 group ${selectedCriteriaId === c.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"}`}
              onClick={() => setSelectedCriteriaId(c.id)}
              style={{ cursor: "pointer" }}
            >
              <span className="truncate flex-1">{c.name}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                {canEdit && (
                <button onClick={(e) => { e.stopPropagation(); setEditingCriteria(c); setIsCriteriaDialogOpen(true); }} className="p-1 hover:text-primary" data-testid={`btn-edit-criteria-${c.id}`}>
                  <Pencil className="h-3 w-3" />
                </button>
                )}
                {canDelete && (
                <button onClick={(e) => { e.stopPropagation(); deleteCriteria.mutate(c.id); }} className="p-1 hover:text-destructive" data-testid={`btn-delete-criteria-${c.id}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Sub-criteria */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 border-b flex items-center justify-between bg-background">
          <div>
            <p className="text-sm font-semibold">Tiêu chí con</p>
            {selectedCriteriaId && (
              <p className="text-xs text-muted-foreground">{criteriaList.find(c => c.id === selectedCriteriaId)?.name}</p>
            )}
          </div>
          {canAdd && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingSubCriteria(null); setIsSubDialogOpen(true); }} disabled={!selectedCriteriaId} data-testid="btn-add-sub-criteria">
            <Plus className="h-3.5 w-3.5" /> Thêm tiêu chí con
          </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedCriteriaId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Chọn một tiêu chí ở bên trái để xem tiêu chí con</div>
          ) : subCriteriaList.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Chưa có tiêu chí con. Nhấn "Thêm tiêu chí con" để tạo mới.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên tiêu chí con</TableHead>
                  <TableHead className="w-20 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subCriteriaList.map((sub) => (
                  <TableRow key={sub.id} data-testid={`row-sub-criteria-${sub.id}`}>
                    <TableCell className="font-medium">{sub.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingSubCriteria(sub); setIsSubDialogOpen(true); }} data-testid={`btn-edit-sub-${sub.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        )}
                        {canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteSub.mutate(sub.id)} data-testid={`btn-delete-sub-${sub.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Criteria Dialog */}
      <Dialog open={isCriteriaDialogOpen} onOpenChange={(open) => { setIsCriteriaDialogOpen(open); if (!open) setEditingCriteria(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingCriteria ? "Sửa tiêu chí" : "Thêm tiêu chí"}</DialogTitle></DialogHeader>
          <form onSubmit={criteriaForm.handleSubmit((d) => editingCriteria ? updateCriteria.mutate(d) : createCriteria.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên tiêu chí <span className="text-destructive">*</span></label>
              <Input {...criteriaForm.register("name", { required: true })} placeholder="VD: Toán" data-testid="input-criteria-name" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCriteriaDialogOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={createCriteria.isPending || updateCriteria.isPending}>{editingCriteria ? "Lưu" : "Thêm"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sub-criteria Dialog */}
      <Dialog open={isSubDialogOpen} onOpenChange={(open) => { setIsSubDialogOpen(open); if (!open) setEditingSubCriteria(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingSubCriteria ? "Sửa tiêu chí con" : "Thêm tiêu chí con"}</DialogTitle></DialogHeader>
          <form onSubmit={subForm.handleSubmit((d) => editingSubCriteria ? updateSub.mutate(d) : createSub.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên tiêu chí con <span className="text-destructive">*</span></label>
              <Input {...subForm.register("name", { required: true })} placeholder="VD: Tiếp thu bài nhanh" data-testid="input-sub-criteria-name" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSubDialogOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={createSub.isPending || updateSub.isPending}>{editingSubCriteria ? "Lưu" : "Thêm"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Bộ môn tab ───────────────────────────────────────────────────────────────
function SubjectsTab({ perm }: { perm?: ConfigTabPerm }) {
  const canAdd = perm?.canAdd ?? true;
  const canEdit = perm?.canEdit ?? true;
  const canDelete = perm?.canDelete ?? true;
  const { toast } = useToast();
  const [editingSubject, setEditingSubject] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: subjects = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/subjects"] });

  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });
  useEffect(() => { form.reset({ name: editingSubject?.name || "" }); }, [editingSubject]);

  const createSubject = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("POST", "/api/subjects", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subjects"] }); toast({ title: "Đã thêm bộ môn" }); setIsDialogOpen(false); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const updateSubject = useMutation({
    mutationFn: async (data: { name: string }) => (await apiRequest("PUT", `/api/subjects/${editingSubject?.id}`, data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subjects"] }); toast({ title: "Đã cập nhật bộ môn" }); setIsDialogOpen(false); setEditingSubject(null); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });
  const deleteSubject = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/subjects/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subjects"] }); toast({ title: "Đã xoá bộ môn" }); },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between bg-background">
        <p className="text-sm font-semibold">Danh sách bộ môn</p>
        {canAdd && (
        <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingSubject(null); setIsDialogOpen(true); }} data-testid="btn-add-subject">
          <Plus className="h-3.5 w-3.5" /> Thêm bộ môn
        </Button>
        )}
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Đang tải...</div>
      ) : subjects.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Chưa có bộ môn nào. Nhấn "Thêm bộ môn" để tạo mới.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên bộ môn</TableHead>
              <TableHead className="w-20 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((sub) => (
              <TableRow key={sub.id} data-testid={`row-subject-${sub.id}`}>
                <TableCell className="font-medium">{sub.name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingSubject(sub); setIsDialogOpen(true); }} data-testid={`btn-edit-subject-${sub.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    )}
                    {canDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteSubject.mutate(sub.id)} data-testid={`btn-delete-subject-${sub.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingSubject(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingSubject ? "Sửa bộ môn" : "Thêm bộ môn"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editingSubject ? updateSubject.mutate(d) : createSubject.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên bộ môn <span className="text-destructive">*</span></label>
              <Input {...form.register("name", { required: true })} placeholder="VD: Toán, Anh văn..." data-testid="input-subject-name" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={createSubject.isPending || updateSubject.isPending}>{editingSubject ? "Lưu" : "Thêm"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function buildTabPerm(data: import("@/hooks/use-my-permissions").MyPermissionsResult | undefined, tabValue: string): ConfigTabPerm {
  if (!data) return { canAdd: false, canEdit: false, canDelete: false };
  if (data.isSuperAdmin) return { canAdd: true, canEdit: true, canDelete: true };
  const key = `${EDUCATION_CONFIG_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return { canAdd: false, canEdit: false, canDelete: false };
  return { canAdd: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
}

function canViewTab(data: import("@/hooks/use-my-permissions").MyPermissionsResult | undefined, tabValue: string): boolean {
  if (!data) return true;
  if (data.isSuperAdmin) return true;
  const key = `${EDUCATION_CONFIG_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return false;
  return p.canView || p.canViewAll;
}

// ─── Trừ tiền học phí tab ────────────────────────────────────────────────────
const ALL_ATTENDANCE_STATUSES: { value: string; label: string; color: string }[] = [
  { value: "pending", label: "Chưa điểm danh", color: "text-slate-600" },
  { value: "present", label: "Có học", color: "text-green-600" },
  { value: "absent", label: "Nghỉ học", color: "text-red-600" },
  { value: "makeup_wait", label: "Nghỉ chờ bù", color: "text-orange-600" },
  { value: "makeup_done", label: "Đã học bù", color: "text-blue-600" },
  { value: "paused", label: "Bảo lưu", color: "text-yellow-600" },
];

function AttendanceFeeRuleTab() {
  const { toast } = useToast();
  const [dialogSide, setDialogSide] = useState<"deduct" | "nodeduct" | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  const { data: rules = [], isLoading } = useQuery<AttendanceFeeRule[]>({
    queryKey: ["/api/attendance-fee-rules"],
  });

  const deductList = rules.filter((r) => r.deductsFee);
  const nodeductList = rules.filter((r) => !r.deductsFee);
  const assignedStatuses = new Set(rules.map((r) => r.attendanceStatus));

  const availableForDialog = ALL_ATTENDANCE_STATUSES.filter((s) => !assignedStatuses.has(s.value));

  const addRule = useMutation({
    mutationFn: async (data: { attendanceStatus: string; deductsFee: boolean }) =>
      (await apiRequest("POST", "/api/attendance-fee-rules", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance-fee-rules"] });
      toast({ title: "Đã thêm trạng thái" });
      setDialogSide(null);
      setSelectedStatus("");
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const removeRule = useMutation({
    mutationFn: async (status: string) => apiRequest("DELETE", `/api/attendance-fee-rules/${status}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance-fee-rules"] });
      toast({ title: "Đã xoá trạng thái" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!selectedStatus || !dialogSide) return;
    addRule.mutate({ attendanceStatus: selectedStatus, deductsFee: dialogSide === "deduct" });
  };

  const getStatusInfo = (status: string) =>
    ALL_ATTENDANCE_STATUSES.find((s) => s.value === status) ?? { label: status, color: "text-slate-600" };

  const PaneList = ({
    items,
    side,
    title,
    color,
  }: {
    items: AttendanceFeeRule[];
    side: "deduct" | "nodeduct";
    title: string;
    color: "red" | "green";
  }) => (
    <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
        <p className={`text-sm font-semibold ${color === "red" ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
          {title}
        </p>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => { setDialogSide(side); setSelectedStatus(""); }}
          data-testid={`btn-add-fee-rule-${side}`}
          disabled={availableForDialog.length === 0}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-3 text-center">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic p-4 text-center">Chưa có trạng thái nào</p>
        ) : (
          items.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between px-3 py-2 rounded-md bg-background border group"
              data-testid={`fee-rule-item-${rule.attendanceStatus}`}
            >
              <span className={`text-sm font-medium ${getStatusInfo(rule.attendanceStatus).color}`}>{getStatusInfo(rule.attendanceStatus).label}</span>
              <button
                onClick={() => removeRule.mutate(rule.attendanceStatus)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                data-testid={`btn-remove-fee-rule-${rule.attendanceStatus}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-220px)] flex gap-4">
      <PaneList items={deductList} side="deduct" title="Trừ tiền học phí" color="red" />
      <PaneList items={nodeductList} side="nodeduct" title="Không trừ tiền học phí" color="green" />

      <Dialog open={!!dialogSide} onOpenChange={(open) => { if (!open) { setDialogSide(null); setSelectedStatus(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialogSide === "deduct" ? "Thêm trạng thái trừ tiền" : "Thêm trạng thái không trừ tiền"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Trạng thái điểm danh <span className="text-destructive">*</span></label>
              {availableForDialog.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Tất cả trạng thái đã được phân loại</p>
              ) : (
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger data-testid="select-attendance-status">
                    <SelectValue placeholder="Chọn trạng thái điểm danh..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForDialog.map((s) => (
                      <SelectItem key={s.value} value={s.value} className={s.color}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogSide(null); setSelectedStatus(""); }}>Huỷ</Button>
            <Button
              onClick={handleAdd}
              disabled={!selectedStatus || addRule.isPending}
              data-testid="btn-confirm-add-fee-rule"
            >
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function vietnameseToSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_");
}

// ─── Bảng điểm tab ───────────────────────────────────────────────────────────
type ScoreSheetWithItems = ScoreSheet & {
  items: (ScoreSheetItem & { category: ScoreCategory | null })[];
};

type SheetFormItem = { categoryId: string; formula: string };
type SheetForm = { name: string; items: SheetFormItem[] };

function ScoreSheetTab() {
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [newSheetName, setNewSheetName] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  const [editingSheetNameId, setEditingSheetNameId] = useState<string | null>(null);
  const [editingSheetNameValue, setEditingSheetNameValue] = useState("");

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ScoreCategory | null>(null);
  const [catName, setCatName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [codeManual, setCodeManual] = useState(false);

  const [rightItems, setRightItems] = useState<SheetFormItem[]>([{ categoryId: "", formula: "" }]);
  const [rightDirty, setRightDirty] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: cats = [], isLoading: catsLoading } = useQuery<ScoreCategory[]>({
    queryKey: ["/api/score-categories"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery<ScoreSheetWithItems[]>({
    queryKey: ["/api/score-sheets"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const selectedSheet = sheets.find((s) => s.id === selectedSheetId) ?? null;

  useEffect(() => {
    if (!sheetsLoading && sheets.length > 0 && !selectedSheetId) {
      setSelectedSheetId(sheets[0].id);
    }
  }, [sheets, sheetsLoading, selectedSheetId]);

  useEffect(() => {
    if (selectedSheet) {
      setRightItems(
        selectedSheet.items.length > 0
          ? selectedSheet.items.map((i) => ({ categoryId: i.categoryId, formula: i.formula }))
          : [{ categoryId: "", formula: "" }]
      );
      setRightDirty(false);
    }
  }, [selectedSheetId, sheets]);

  // ── Category mutations ────────────────────────────────────────────────────
  const saveCat = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      if (editingCat) {
        return (await apiRequest("PUT", `/api/score-categories/${editingCat.id}`, data)).json();
      }
      return (await apiRequest("POST", "/api/score-categories", data)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-categories"] });
      toast({ title: editingCat ? "Đã cập nhật danh mục" : "Đã thêm danh mục" });
      closeCatDialog();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteCat = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/score-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-categories"] });
      toast({ title: "Đã xoá danh mục" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  // ── Score sheet mutations ─────────────────────────────────────────────────
  const createSheet = useMutation({
    mutationFn: async (data: { name: string; items: SheetFormItem[] }) =>
      (await apiRequest("POST", "/api/score-sheets", data)).json(),
    onSuccess: (created: ScoreSheetWithItems) => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheets"] });
      toast({ title: "Đã thêm bảng điểm" });
      setNewSheetName("");
      setAddingSheet(false);
      setSelectedSheetId(created.id);
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const renameSheet = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const sheet = sheets.find((s) => s.id === id);
      if (!sheet) throw new Error("Not found");
      return (await apiRequest("PUT", `/api/score-sheets/${id}`, {
        name,
        items: sheet.items.map((i, idx) => ({ categoryId: i.categoryId, formula: i.formula, order: idx })),
      })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheets"] });
      toast({ title: "Đã đổi tên bảng điểm" });
      setEditingSheetNameId(null);
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const saveSheetItems = useMutation({
    mutationFn: async ({ id, items }: { id: string; items: SheetFormItem[] }) => {
      const sheet = sheets.find((s) => s.id === id);
      if (!sheet) throw new Error("Not found");
      return (await apiRequest("PUT", `/api/score-sheets/${id}`, {
        name: sheet.name,
        items: items.filter((i) => i.categoryId).map((item, idx) => ({ ...item, order: idx })),
      })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheets"] });
      toast({ title: "Đã lưu công thức" });
      setRightDirty(false);
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteSheet = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/score-sheets/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheets"] });
      toast({ title: "Đã xoá bảng điểm" });
      if (selectedSheetId === id) setSelectedSheetId(null);
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  // ── Category dialog helpers ───────────────────────────────────────────────
  const openNewCat = () => {
    setEditingCat(null);
    setCatName("");
    setCatCode("");
    setCodeManual(false);
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: ScoreCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatCode(cat.code);
    setCodeManual(true);
    setCatDialogOpen(true);
  };

  const closeCatDialog = () => {
    setCatDialogOpen(false);
    setEditingCat(null);
    setCatName("");
    setCatCode("");
    setCodeManual(false);
  };

  const handleCatNameChange = (val: string) => {
    setCatName(val);
    if (!codeManual) setCatCode(vietnameseToSlug(val));
  };

  const handleSaveCat = () => {
    if (!catName.trim() || !catCode.trim()) {
      toast({ title: "Vui lòng nhập tên và mã danh mục", variant: "destructive" });
      return;
    }
    saveCat.mutate({ name: catName.trim(), code: catCode.trim() });
  };

  // ── Right panel helpers ───────────────────────────────────────────────────
  const getCatById = (id: string) => cats.find((c) => c.id === id);

  const updateRightItem = (idx: number, field: keyof SheetFormItem, value: string) => {
    setRightItems((prev) => {
      const items = [...prev];
      if (field === "categoryId") {
        const cat = cats.find((c) => c.id === value);
        items[idx] = { ...items[idx], categoryId: value, formula: cat ? `= ${cat.code}` : items[idx].formula };
      } else {
        items[idx] = { ...items[idx], [field]: value };
      }
      return items;
    });
    setRightDirty(true);
  };

  const addRightItem = () => {
    setRightItems((prev) => [...prev, { categoryId: "", formula: "" }]);
    setRightDirty(true);
  };

  const removeRightItem = (idx: number) => {
    setRightItems((prev) => prev.filter((_, i) => i !== idx));
    setRightDirty(true);
  };

  const handleAddSheet = () => {
    if (!newSheetName.trim()) {
      toast({ title: "Vui lòng nhập tên bảng điểm", variant: "destructive" });
      return;
    }
    createSheet.mutate({ name: newSheetName.trim(), items: [] });
  };

  const handleSaveItems = () => {
    if (!selectedSheetId) return;
    saveSheetItems.mutate({ id: selectedSheetId, items: rightItems });
  };

  return (
    <div className="flex gap-0 h-full border rounded-lg overflow-hidden">
      {/* ── Panel 1: Danh mục điểm ── */}
      <div className="w-56 flex-shrink-0 border-r flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
          <p className="text-sm font-semibold">Danh mục điểm</p>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={openNewCat}
            data-testid="btn-add-score-category"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {catsLoading ? (
            <p className="text-sm text-muted-foreground p-3 text-center">Đang tải...</p>
          ) : cats.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4 text-center">Chưa có danh mục</p>
          ) : (
            cats.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-3 py-2 rounded-md border bg-background hover:bg-muted/30 group transition-colors"
                data-testid={`score-cat-item-${cat.id}`}
              >
                <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-medium truncate">{cat.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{cat.code}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 ml-2 shrink-0">
                  <button
                    onClick={() => openEditCat(cat)}
                    className="p-1 hover:text-primary transition-colors"
                    data-testid={`btn-edit-cat-${cat.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteCat.mutate(cat.id)}
                    className="p-1 hover:text-destructive transition-colors"
                    data-testid={`btn-delete-cat-${cat.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Panel 2: Tên Bảng điểm ── */}
      <div className="w-64 flex-shrink-0 border-r flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
          <p className="text-sm font-semibold">Tên Bảng điểm</p>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => { setAddingSheet(true); setNewSheetName(""); }}
            data-testid="btn-add-score-sheet"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {addingSheet && (
          <div className="px-3 py-2 border-b bg-muted/10 flex gap-2 items-center">
            <Input
              autoFocus
              value={newSheetName}
              onChange={(e) => setNewSheetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddSheet(); if (e.key === "Escape") setAddingSheet(false); }}
              placeholder="Tên bảng điểm..."
              className="h-7 text-sm"
              data-testid="input-new-sheet-name"
            />
            <button
              onClick={handleAddSheet}
              className="p-1 hover:text-primary transition-colors text-muted-foreground"
              data-testid="btn-confirm-add-sheet"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAddingSheet(false)}
              className="p-1 hover:text-destructive transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sheetsLoading ? (
            <p className="text-sm text-muted-foreground p-3 text-center">Đang tải...</p>
          ) : sheets.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4 text-center">Chưa có bảng điểm</p>
          ) : (
            sheets.map((sheet) => (
              <div
                key={sheet.id}
                onClick={() => { if (editingSheetNameId !== sheet.id) setSelectedSheetId(sheet.id); }}
                className={`flex items-center justify-between px-3 py-2 rounded-md border cursor-pointer group transition-colors ${
                  selectedSheetId === sheet.id ? "bg-primary/10 border-primary/30" : "bg-background hover:bg-muted/30"
                }`}
                data-testid={`score-sheet-item-${sheet.id}`}
              >
                {editingSheetNameId === sheet.id ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={editingSheetNameValue}
                      onChange={(e) => setEditingSheetNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameSheet.mutate({ id: sheet.id, name: editingSheetNameValue });
                        if (e.key === "Escape") setEditingSheetNameId(null);
                      }}
                      className="h-6 text-sm px-1"
                      data-testid={`input-rename-sheet-${sheet.id}`}
                    />
                    <button
                      onClick={() => renameSheet.mutate({ id: sheet.id, name: editingSheetNameValue })}
                      className="p-1 hover:text-primary transition-colors shrink-0"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{sheet.name}</p>
                    <p className="text-xs text-muted-foreground">{sheet.items.length} danh mục</p>
                  </div>
                )}
                {editingSheetNameId !== sheet.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 ml-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSheetNameId(sheet.id);
                        setEditingSheetNameValue(sheet.name);
                      }}
                      className="p-1 hover:text-primary transition-colors"
                      data-testid={`btn-rename-sheet-${sheet.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSheet.mutate(sheet.id); }}
                      className="p-1 hover:text-destructive transition-colors"
                      data-testid={`btn-delete-sheet-${sheet.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: Công thức danh mục ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSheet ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <p className="text-sm italic">Chọn một bảng điểm để xem và chỉnh sửa công thức</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{selectedSheet.name}</p>
                <p className="text-xs text-muted-foreground">Công thức cho từng danh mục điểm</p>
              </div>
              <Button
                size="sm"
                onClick={handleSaveItems}
                disabled={!rightDirty || saveSheetItems.isPending}
                data-testid="btn-save-sheet-items"
              >
                {saveSheetItems.isPending ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center px-1 mb-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Danh mục</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mã</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Công thức</p>
                <span />
              </div>

              {rightItems.map((item, idx) => {
                const selectedCat = getCatById(item.categoryId);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                    <Select
                      value={item.categoryId}
                      onValueChange={(v) => updateRightItem(idx, "categoryId", v)}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid={`select-cat-${idx}`}>
                        <SelectValue placeholder="Chọn danh mục..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cats.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <code className={`text-xs px-2 py-1.5 rounded border font-mono whitespace-nowrap min-w-[60px] text-center ${
                      selectedCat ? "bg-muted text-muted-foreground" : "bg-muted/30 text-muted-foreground/40"
                    }`}>
                      {selectedCat ? selectedCat.code : "—"}
                    </code>

                    <Input
                      value={item.formula}
                      onChange={(e) => updateRightItem(idx, "formula", e.target.value)}
                      placeholder={selectedCat ? `= ${selectedCat.code}` : "Công thức..."}
                      className="h-8 font-mono text-xs"
                      data-testid={`input-formula-${idx}`}
                    />

                    <button
                      onClick={() => removeRightItem(idx)}
                      className="p-1.5 hover:text-destructive transition-colors text-muted-foreground"
                      data-testid={`btn-remove-item-${idx}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              <Button
                variant="outline" size="sm"
                onClick={addRightItem}
                className="mt-2"
                data-testid="btn-add-right-item"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Thêm danh mục
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Dialog: Danh mục điểm ── */}
      <Dialog open={catDialogOpen} onOpenChange={(o) => { if (!o) closeCatDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? "Chỉnh sửa danh mục điểm" : "Thêm danh mục điểm"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tên danh mục</Label>
              <Input
                value={catName}
                onChange={(e) => handleCatNameChange(e.target.value)}
                placeholder="Ví dụ: Thực hành"
                data-testid="input-cat-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mã code <span className="text-xs text-muted-foreground">(tự động từ tên)</span></Label>
              <Input
                value={catCode}
                onChange={(e) => { setCatCode(e.target.value); setCodeManual(true); }}
                placeholder="Ví dụ: thuc_hanh"
                className="font-mono text-sm"
                data-testid="input-cat-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCatDialog}>Huỷ</Button>
            <Button onClick={handleSaveCat} disabled={saveCat.isPending} data-testid="btn-save-cat">
              {editingCat ? "Lưu" : "Thêm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EducationConfig() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();

  const getTabFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "classrooms";
  };

  const [activeTab, setActiveTab] = useState(getTabFromUrl());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);

  const visibleTabs = EDUCATION_TABS.filter(t => isSubTabVisible(EDUCATION_CONFIG_HREF, t.value) && canViewTab(myPerms, t.value));

  useEffect(() => {
    const tab = getTabFromUrl();
    if (tab !== activeTab) setActiveTab(tab);
  }, [window.location.search]);

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      handleTabChange(visibleTabs[0].value);
    }
  }, [visibleTabs.map(t => t.value).join(",")]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/education-config?tab=${value}`);
  };

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: shifts, isLoading: isLoadingShifts } = useQuery<ShiftTemplate[]>({ queryKey: ["/api/shift-templates"] });

  const form = useForm<InsertShiftTemplate>({
    resolver: zodResolver(insertShiftTemplateSchema),
    defaultValues: { name: "", startTime: "08:00", endTime: "09:30", locationId: "", note: "", status: "active" },
  });

  useEffect(() => {
    if (editingShift) {
      form.reset({ name: editingShift.name, startTime: editingShift.startTime, endTime: editingShift.endTime, locationId: editingShift.locationId, note: editingShift.note || "", status: editingShift.status || "active" });
    } else {
      form.reset({ name: "", startTime: "08:00", endTime: "09:30", locationId: locations?.[0]?.id || "", note: "", status: "active" });
    }
  }, [editingShift, locations, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertShiftTemplate) => (await apiRequest("POST", "/api/shift-templates", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shift-templates"] }); toast({ title: "Thành công", description: "Đã tạo ca học mới" }); setIsDialogOpen(false); },
    onError: (error: any) => toast({ title: "Lỗi", description: error.message || "Không thể tạo ca học", variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<InsertShiftTemplate> }) => (await apiRequest("PUT", `/api/shift-templates/${data.id}`, data.updates)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shift-templates"] }); toast({ title: "Thành công", description: "Đã cập nhật ca học" }); setIsDialogOpen(false); setEditingShift(null); },
    onError: (error: any) => toast({ title: "Lỗi", description: error.message || "Không thể cập nhật ca học", variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/shift-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shift-templates"] }); toast({ title: "Thành công", description: "Đã xóa ca học" }); },
    onError: (error: any) => toast({ title: "Lỗi", description: error.message || "Không thể xóa ca học", variant: "destructive" }),
  });

  const onSubmit = (data: InsertShiftTemplate) => {
    if (editingShift) updateMutation.mutate({ id: editingShift.id, updates: data });
    else createMutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Cấu hình giáo dục</h1>
          <p className="text-muted-foreground mt-1">Quản lý phòng học, ca học, bộ môn và tiêu chí đánh giá</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "classrooms") && canViewTab(myPerms, "classrooms") && (
            <TabsContent value="classrooms" className="mt-4">
              <div className="h-[calc(100vh-220px)]">
                <ClassroomsTab perm={buildTabPerm(myPerms, "classrooms")} />
              </div>
            </TabsContent>
          )}

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "subjects") && canViewTab(myPerms, "subjects") && (
            <TabsContent value="subjects" className="mt-4">
              <SubjectsTab perm={buildTabPerm(myPerms, "subjects")} />
            </TabsContent>
          )}

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "evaluation") && canViewTab(myPerms, "evaluation") && (
            <TabsContent value="evaluation" className="mt-4">
              <div className="h-[calc(100vh-220px)]">
                <EvaluationCriteriaTab perm={buildTabPerm(myPerms, "evaluation")} />
              </div>
            </TabsContent>
          )}

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "shifts") && canViewTab(myPerms, "shifts") && <TabsContent value="shifts" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Ca học
                </CardTitle>
                {buildTabPerm(myPerms, "shifts").canAdd && (
                <Button size="sm" onClick={() => { setEditingShift(null); setIsDialogOpen(true); }} data-testid="btn-add-shift">
                  <Plus className="mr-1 h-4 w-4" /> Thêm ca học
                </Button>
                )}
              </CardHeader>
              <CardContent>
                {isLoadingShifts ? (
                  <p className="text-sm text-muted-foreground">Đang tải...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên ca</TableHead>
                        <TableHead>Giờ bắt đầu</TableHead>
                        <TableHead>Giờ kết thúc</TableHead>
                        <TableHead>Cơ sở</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Ghi chú</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts?.map((shift) => (
                        <TableRow key={shift.id} data-testid={`row-shift-${shift.id}`}>
                          <TableCell className="font-medium">{shift.name}</TableCell>
                          <TableCell>{shift.startTime}</TableCell>
                          <TableCell>{shift.endTime}</TableCell>
                          <TableCell>{locations?.find((l) => l.id === shift.locationId)?.name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={shift.status === "active" ? "default" : "secondary"}>
                              {shift.status === "active" ? "Hoạt động" : "Không hoạt động"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{shift.note || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {buildTabPerm(myPerms, "shifts").canEdit && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingShift(shift); setIsDialogOpen(true); }} data-testid={`btn-edit-shift-${shift.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              )}
                              {buildTabPerm(myPerms, "shifts").canDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(shift.id)} data-testid={`btn-delete-shift-${shift.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingShift(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingShift ? "Sửa ca học" : "Thêm ca học mới"}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên ca học</FormLabel>
                        <FormControl><Input {...field} placeholder="VD: Ca sáng 1" data-testid="input-shift-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="startTime" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giờ bắt đầu</FormLabel>
                          <FormControl><Input {...field} type="time" data-testid="input-shift-start" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="endTime" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giờ kết thúc</FormLabel>
                          <FormControl><Input {...field} type="time" data-testid="input-shift-end" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="locationId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cơ sở</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-shift-location"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {locations?.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trạng thái</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "active"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-shift-status"><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Hoạt động</SelectItem>
                            <SelectItem value="inactive">Không hoạt động</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="note" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ghi chú</FormLabel>
                        <FormControl><Textarea {...field} value={field.value || ""} placeholder="Ghi chú thêm..." data-testid="input-shift-note" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingShift(null); }}>Huỷ</Button>
                      <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                        {editingShift ? "Cập nhật" : "Tạo mới"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </TabsContent>}

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "attendance-fee") && canViewTab(myPerms, "attendance-fee") && (
            <TabsContent value="attendance-fee" className="mt-4">
              <AttendanceFeeRuleTab />
            </TabsContent>
          )}

          {isSubTabVisible(EDUCATION_CONFIG_HREF, "score-sheets") && canViewTab(myPerms, "score-sheets") && (
            <TabsContent value="score-sheets" className="mt-4 h-[calc(100vh-220px)]">
              <ScoreSheetTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
