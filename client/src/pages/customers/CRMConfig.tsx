import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmRelationshipSchema, insertCrmRejectReasonSchema, insertCrmCustomerSourceSchema, insertCrmSchoolSchema, insertCrmCustomFieldSchema, insertCrmPipelineGroupSchema, type CrmRelationship, type CrmRejectReason, type CrmCustomerSource, type CrmSchool } from "@shared/schema";
import { Plus, Pencil, Trash2, Settings2, GripVertical, Eye, GraduationCap, Phone, Mail, CalendarDays, User, MessageSquare, ChevronDown, BookOpen, Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useCrmRequiredFields, useCrmCustomFields, useCrmPipelineGroups, useCrmRegistrationFormFields, useCrmCustomerSources, type CrmRequiredField, type CrmCustomField, type CrmPipelineGroup } from "@/hooks/use-crm-config";
import { CRMConfigHistoryTab } from "./CRMConfigHistoryTab";
import { CRM_CONFIGURABLE_FIELDS, CRM_FIELD_GROUP_LABELS, REGISTRATION_FORM_FIELDS, makeCustomFieldKey, type CrmConfigurableField } from "@/lib/crm-customer-fields";
import { api } from "@shared/routes";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CRM_CONFIG_HREF = "/customers/crm-config";

function getTabFromUrl(): string {
  if (typeof window === "undefined") return "relationships";
  return new URLSearchParams(window.location.search).get("tab") || "relationships";
}

const ALL_TABS = [
  { value: "relationships", label: "Mối quan hệ" },
  { value: "reject-reasons", label: "Lý do từ chối" },
  { value: "sources", label: "Nguồn khách hàng" },
  { value: "schools", label: "Trường học" },
  { value: "additional-info", label: "Thông tin bổ sung" },
  { value: "required-info", label: "Thông tin bắt buộc" },
  { value: "registration-form", label: "Form đăng ký" },
  { value: "history", label: "Lịch sử" },
];

interface TabPerms {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function useTabPerms(tabValue: string): TabPerms {
  const { data: myPerms } = useMyPermissions();
  if (myPerms?.isSuperAdmin) return { canCreate: true, canEdit: true, canDelete: true };
  const resource = `${CRM_CONFIG_HREF}#${tabValue}`;
  const perm = myPerms?.permissions?.[resource];
  return {
    canCreate: perm?.canCreate ?? false,
    canEdit: perm?.canEdit ?? false,
    canDelete: perm?.canDelete ?? false,
  };
}

export function CRMConfig() {
  const { toast } = useToast();
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();

  const visibleTabs = ALL_TABS.filter(t => {
    if (t.value === "history") {
      return myPerms?.isSuperAdmin || ALL_TABS.some(other => other.value !== "history" && isSubTabVisible(CRM_CONFIG_HREF, other.value));
    }
    if (!isSubTabVisible(CRM_CONFIG_HREF, t.value)) return false;
    if (myPerms?.isSuperAdmin) return true;
    const resource = `${CRM_CONFIG_HREF}#${t.value}`;
    const perm = myPerms?.permissions?.[resource];
    return perm?.canView || perm?.canViewAll || perm?.canCreate || perm?.canEdit || perm?.canDelete;
  });
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(getTabFromUrl);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/customers/crm-config?tab=${value}`);
  };

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      handleTabChange(visibleTabs[0].value);
    }
  }, [visibleTabs.map(t => t.value).join(",")]);

  if (visibleTabs.length === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
              <Settings2 className="h-8 w-8 text-primary" />
              Cấu hình CRM
            </h1>
          </div>
          <p className="text-muted-foreground">Tất cả các tab đã bị ẩn. Vui lòng bật lại trong Quản lý module.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-8 w-8 text-primary" />
            Cấu hình CRM
          </h1>
          <p className="text-muted-foreground">Quản lý các danh mục cấu hình cho module khách hàng</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >{t.label}</button>
            ))}
          </div>
          
          {isSubTabVisible(CRM_CONFIG_HREF, "relationships") && (
            <TabsContent value="relationships">
              <RelationshipTab />
            </TabsContent>
          )}
          
          {isSubTabVisible(CRM_CONFIG_HREF, "reject-reasons") && (
            <TabsContent value="reject-reasons">
              <RejectReasonTab />
            </TabsContent>
          )}
          
          {isSubTabVisible(CRM_CONFIG_HREF, "sources") && (
            <TabsContent value="sources">
              <CustomerSourceTab />
            </TabsContent>
          )}

          {isSubTabVisible(CRM_CONFIG_HREF, "schools") && (
            <TabsContent value="schools">
              <SchoolTab />
            </TabsContent>
          )}

          {isSubTabVisible(CRM_CONFIG_HREF, "additional-info") && (
            <TabsContent value="additional-info">
              <AdditionalInfoTab />
            </TabsContent>
          )}

          {isSubTabVisible(CRM_CONFIG_HREF, "required-info") && (
            <TabsContent value="required-info">
              <RequiredInfoTab />
            </TabsContent>
          )}

          {isSubTabVisible(CRM_CONFIG_HREF, "registration-form") && (
            <TabsContent value="registration-form">
              <RegistrationFormTab />
            </TabsContent>
          )}

          {activeTab === "history" && (
            <TabsContent value="history">
              <CRMConfigHistoryTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function PipelineGroupTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("pipeline-groups");
  const [editing, setEditing] = useState<CrmPipelineGroup | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list, isLoading } = useCrmPipelineGroups();

  const form = useForm({
    resolver: zodResolver(insertCrmPipelineGroupSchema),
    defaultValues: { name: "", color: "#8b5cf6", position: 0 },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) return apiRequest("PUT", `/api/crm/pipeline-groups/${editing.id}`, data);
      return apiRequest("POST", "/api/crm/pipeline-groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.pipelineGroups.list.path] });
      setOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Thành công", description: "Đã lưu nhóm pipeline" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/pipeline-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.pipelineGroups.list.path] });
      toast({ title: "Đã xoá", description: "Đã xoá nhóm pipeline" });
    },
  });

  const handleEdit = (item: CrmPipelineGroup) => {
    setEditing(item);
    form.reset({ name: item.name, color: item.color, position: item.position });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Nhóm pipeline</CardTitle>
          <CardDescription>Tạo các nhóm cha để phân loại pipeline (ví dụ: Trước bán hàng, Trong bán hàng, Sau bán hàng)</CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); form.reset({ name: "", color: "#8b5cf6", position: 0 }); }}>
                <Plus className="h-4 w-4 mr-2" /> Thêm nhóm
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Sửa nhóm pipeline" : "Thêm nhóm pipeline"}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Tên nhóm</FormLabel><FormControl><Input placeholder="Ví dụ: Trong bán hàng" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="color" render={({ field }) => (
                    <FormItem><FormLabel>Màu sắc</FormLabel><FormControl><Input type="color" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="position" render={({ field }) => (
                    <FormItem><FormLabel>Thứ tự hiển thị</FormLabel><FormControl><Input type="number" min={0} {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>{editing ? "Cập nhật" : "Thêm mới"}</Button></DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên nhóm</TableHead>
                <TableHead>Màu sắc</TableHead>
                <TableHead>Thứ tự</TableHead>
                {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </TableCell>
                  <TableCell><div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} /></TableCell>
                  <TableCell>{item.position}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right space-x-2">
                      {canEdit && <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(list ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Chưa có nhóm nào. Thêm nhóm đầu tiên!</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RelationshipFormDialog({
  open,
  onOpenChange,
  editing,
  isParentMode,
  fixedParentId,
  allParents,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CrmRelationship | null;
  isParentMode: boolean;
  fixedParentId: string | null;
  allParents: CrmRelationship[];
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(insertCrmRelationshipSchema),
    defaultValues: {
      name: "",
      color: isParentMode ? "#8b5cf6" : "#3b82f6",
      position: "",
      groupId: null as string | null,
      isParentGroup: isParentMode,
      parentId: fixedParentId,
    },
  });

  useEffect(() => {
    if (editing) {
      form.reset({
        name: editing.name,
        color: editing.color,
        position: editing.position || "",
        groupId: editing.groupId ?? null,
        isParentGroup: editing.isParentGroup ?? false,
        parentId: (editing as any).parentId ?? null,
      });
    } else {
      form.reset({
        name: "",
        color: isParentMode ? "#8b5cf6" : "#3b82f6",
        position: "",
        groupId: null,
        isParentGroup: isParentMode,
        parentId: fixedParentId,
      });
    }
  }, [editing, open]);

  const title = editing
    ? (isParentMode ? "Sửa nhóm cha" : "Sửa pipeline con")
    : (isParentMode ? "Thêm nhóm cha" : "Thêm pipeline con");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Tên</FormLabel><FormControl><Input placeholder={isParentMode ? "Ví dụ: Trước bán hàng" : "Ví dụ: Lead"} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem><FormLabel>Màu sắc</FormLabel><FormControl><Input type="color" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="position" render={({ field }) => (
              <FormItem><FormLabel>Vị trí</FormLabel><FormControl><Input placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            {!isParentMode && !fixedParentId && (
              <FormField control={form.control} name="parentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nhóm cha</FormLabel>
                  <Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Chọn nhóm cha (tuỳ chọn)" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Không có nhóm cha</SelectItem>
                      {allParents.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>{editing ? "Cập nhật" : "Thêm mới"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SortableParentItem({
  item,
  isSelected,
  canEdit,
  canDelete,
  onSelect,
  onEdit,
  onDelete,
}: {
  item: CrmRelationship;
  isSelected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center justify-between rounded-md px-2 py-2 transition-colors text-sm",
        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      )}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer" onClick={onSelect}>
        <span
          {...attributes}
          {...listeners}
          className={cn(
            "cursor-grab active:cursor-grabbing p-0.5 rounded shrink-0",
            isSelected ? "text-primary-foreground/60 hover:text-primary-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: item.color }} />
        <span className="truncate font-medium">{item.name}</span>
      </div>
      {(canEdit || canDelete) && (
        <span className={cn("flex gap-0.5 shrink-0 ml-1", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className={cn("p-0.5 rounded", isSelected ? "hover:bg-primary-foreground/20" : "hover:bg-accent")}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className={cn("p-0.5 rounded text-destructive", isSelected ? "text-red-300 hover:bg-primary-foreground/20" : "hover:bg-accent")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function SortableChildRow({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: CrmRelationship;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          {item.name}
        </span>
      </TableCell>
      <TableCell><div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} /></TableCell>
      <TableCell className="text-muted-foreground text-sm">{item.position || "—"}</TableCell>
      {(canEdit || canDelete) && (
        <TableCell className="text-right space-x-1">
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function RelationshipTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("relationships");

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    isParentMode: boolean;
    editing: CrmRelationship | null;
  }>({ open: false, isParentMode: true, editing: null });

  const { data: list, isLoading } = useQuery<CrmRelationship[]>({
    queryKey: ["/api/crm/relationships"],
  });

  // Older databases can have parent_id populated while isParentGroup is
  // still false. Infer those parents so the configuration is not rendered
  // empty while the startup backfill is being rolled out.
  const managedRelationships = useMemo(
    () => (list ?? []).filter((relationship) => !relationship.isSystemDefault),
    [list]
  );
  const inferredParentIds = useMemo(
    () => new Set(managedRelationships.map(r => r.parentId).filter((id): id is string => Boolean(id))),
    [managedRelationships]
  );
  const isParentRelationship = (relationship: CrmRelationship) =>
    Boolean(relationship.isParentGroup || inferredParentIds.has(relationship.id));

  const sortedParents = useMemo(() =>
    [...managedRelationships.filter(isParentRelationship)].sort((a, b) => parseInt(a.position || "0") - parseInt(b.position || "0")),
    [managedRelationships, inferredParentIds]
  );
  const sortedChildrenOfSelected = useMemo(() =>
    [...managedRelationships.filter(r => !isParentRelationship(r) && r.parentId === selectedParentId)]
      .sort((a, b) => parseInt(a.position || "0") - parseInt(b.position || "0")),
    [managedRelationships, selectedParentId, inferredParentIds]
  );

  const [orderedParents, setOrderedParents] = useState<CrmRelationship[]>([]);
  const [orderedChildren, setOrderedChildren] = useState<CrmRelationship[]>([]);

  useEffect(() => { setOrderedParents(sortedParents); }, [list]);
  useEffect(() => { setOrderedChildren(sortedChildrenOfSelected); }, [selectedParentId, list]);

  const selectedParent = orderedParents.find(p => p.id === selectedParentId) ?? null;

  useEffect(() => {
    if (sortedParents.length > 0 && !selectedParentId) {
      setSelectedParentId(sortedParents[0].id);
    }
  }, [list]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; position: string }[]) => {
      await Promise.all(updates.map(u => apiRequest("PUT", `/api/crm/relationships/${u.id}`, { position: u.position })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể lưu thứ tự", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
    },
  });

  const handleParentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedParents.findIndex(p => p.id === active.id);
    const newIndex = orderedParents.findIndex(p => p.id === over.id);
    const newOrder = arrayMove(orderedParents, oldIndex, newIndex);
    setOrderedParents(newOrder);
    reorderMutation.mutate(newOrder.map((item, idx) => ({ id: item.id, position: String(idx) })));
  };

  const handleChildDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedChildren.findIndex(c => c.id === active.id);
    const newIndex = orderedChildren.findIndex(c => c.id === over.id);
    const newOrder = arrayMove(orderedChildren, oldIndex, newIndex);
    setOrderedChildren(newOrder);
    reorderMutation.mutate(newOrder.map((item, idx) => ({ id: item.id, position: String(idx) })));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (dialogState.editing) {
        return apiRequest("PUT", `/api/crm/relationships/${dialogState.editing.id}`, data);
      }
      return apiRequest("POST", "/api/crm/relationships", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
      setDialogState(s => ({ ...s, open: false, editing: null }));
      toast({ title: "Thành công", description: "Đã lưu thành công" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/relationships/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
      toast({ title: "Đã xoá" });
    },
  });

  const openAddParent = () => setDialogState({ open: true, isParentMode: true, editing: null });
  const openEditParent = (item: CrmRelationship) => setDialogState({ open: true, isParentMode: true, editing: item });
  const openAddChild = () => setDialogState({ open: true, isParentMode: false, editing: null });
  const openEditChild = (item: CrmRelationship) => setDialogState({ open: true, isParentMode: false, editing: item });

  if (isLoading) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Đang tải...</CardContent></Card>;
  }

  return (
    <>
      <RelationshipFormDialog
        open={dialogState.open}
        onOpenChange={v => setDialogState(s => ({ ...s, open: v, editing: v ? s.editing : null }))}
        editing={dialogState.editing}
        isParentMode={dialogState.isParentMode}
        fixedParentId={dialogState.isParentMode ? null : selectedParentId}
        allParents={orderedParents.filter(p => dialogState.editing?.id !== p.id)}
        onSave={data => saveMutation.mutate(data)}
        isPending={saveMutation.isPending}
      />

      <div className="flex gap-4 items-start">
        {/* LEFT: Nhóm cha */}
        <Card className="w-64 shrink-0">
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">Nhóm cha</CardTitle>
            {canCreate && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={openAddParent}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {orderedParents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 px-2">Chưa có nhóm cha. Nhấn + để thêm.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleParentDragEnd}>
                <SortableContext items={orderedParents.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {orderedParents.map(p => (
                      <SortableParentItem
                        key={p.id}
                        item={p}
                        isSelected={selectedParentId === p.id}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onSelect={() => setSelectedParentId(p.id)}
                        onEdit={() => openEditParent(p)}
                        onDelete={() => deleteMutation.mutate(p.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Pipeline con */}
        <Card className="flex-1 min-w-0">
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {selectedParent ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedParent.color }} />
                    Pipeline con — {selectedParent.name}
                  </>
                ) : "Pipeline con"}
              </CardTitle>
              {!selectedParent && (
                <p className="text-xs text-muted-foreground mt-0.5">Chọn một nhóm cha bên trái để xem</p>
              )}
            </div>
            {canCreate && selectedParent && (
              <Button size="sm" onClick={openAddChild}>
                <Plus className="h-4 w-4 mr-1.5" /> Thêm mới
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!selectedParent ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Chọn một nhóm cha bên trái để xem các pipeline con
              </div>
            ) : orderedChildren.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Chưa có pipeline con nào trong nhóm <span className="font-medium">{selectedParent.name}</span>.
                {canCreate && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={openAddChild}>
                      <Plus className="h-4 w-4 mr-1.5" /> Thêm pipeline con
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
                <SortableContext items={orderedChildren.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên</TableHead>
                        <TableHead>Màu sắc</TableHead>
                        <TableHead>Vị trí</TableHead>
                        {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderedChildren.map(item => (
                        <SortableChildRow
                          key={item.id}
                          item={item}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onEdit={() => openEditChild(item)}
                          onDelete={() => deleteMutation.mutate(item.id)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RejectReasonTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("reject-reasons");
  const [editing, setEditing] = useState<CrmRejectReason | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list } = useQuery<CrmRejectReason[]>({ queryKey: ["/api/crm/reject-reasons"] });

  const form = useForm({
    resolver: zodResolver(insertCrmRejectReasonSchema),
    defaultValues: { reason: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) return apiRequest("PUT", `/api/crm/reject-reasons/${editing.id}`, data);
      return apiRequest("POST", "/api/crm/reject-reasons", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/reject-reasons"] });
      setOpen(false); setEditing(null); form.reset();
      toast({ title: "Thành công", description: "Đã lưu lý do từ chối" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/reject-reasons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/reject-reasons"] });
      toast({ title: "Đã xoá", description: "Đã xoá lý do từ chối" });
    }
  });

  const handleEdit = (item: CrmRejectReason) => {
    setEditing(item);
    form.reset({ reason: item.reason });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div><CardTitle>Lý do từ chối</CardTitle><CardDescription>Quản lý các lý do khách hàng từ chối dịch vụ</CardDescription></div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
            <DialogTrigger asChild><Button onClick={() => { setEditing(null); form.reset({ reason: "" }); }}><Plus className="h-4 w-4 mr-2" /> Thêm mới</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Sửa lý do" : "Thêm lý do mới"}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                  <FormField control={form.control} name="reason" render={({ field }) => (
                    <FormItem><FormLabel>Nội dung lý do</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <DialogFooter><Button type="submit" disabled={createMutation.isPending}>{editing ? "Cập nhật" : "Thêm mới"}</Button></DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lý do</TableHead>
              {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.reason}</TableCell>
                {(canEdit || canDelete) && (
                  <TableCell className="text-right space-x-2">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomerSourceTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("sources");
  const [editing, setEditing] = useState<CrmCustomerSource | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list } = useQuery<CrmCustomerSource[]>({ queryKey: ["/api/crm/customer-sources"] });

  const form = useForm({
    resolver: zodResolver(insertCrmCustomerSourceSchema),
    defaultValues: { name: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) return apiRequest("PUT", `/api/crm/customer-sources/${editing.id}`, data);
      return apiRequest("POST", "/api/crm/customer-sources", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customer-sources"] });
      setOpen(false); setEditing(null); form.reset();
      toast({ title: "Thành công", description: "Đã lưu nguồn khách hàng" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/customer-sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customer-sources"] });
      toast({ title: "Đã xoá", description: "Đã xoá nguồn khách hàng" });
    }
  });

  const handleEdit = (item: CrmCustomerSource) => {
    setEditing(item);
    form.reset({ name: item.name });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div><CardTitle>Nguồn khách hàng</CardTitle><CardDescription>Quản lý các nguồn đến của khách hàng</CardDescription></div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
            <DialogTrigger asChild><Button onClick={() => { setEditing(null); form.reset({ name: "" }); }}><Plus className="h-4 w-4 mr-2" /> Thêm mới</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Sửa nguồn" : "Thêm nguồn mới"}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Tên nguồn</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <DialogFooter><Button type="submit" disabled={createMutation.isPending}>{editing ? "Cập nhật" : "Thêm mới"}</Button></DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguồn</TableHead>
              {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                {(canEdit || canDelete) && (
                  <TableCell className="text-right space-x-2">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SchoolTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("schools");
  const [editing, setEditing] = useState<CrmSchool | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list } = useQuery<CrmSchool[]>({ queryKey: ["/api/crm/schools"] });

  const form = useForm({
    resolver: zodResolver(insertCrmSchoolSchema),
    defaultValues: { name: "" },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) return apiRequest("PUT", `/api/crm/schools/${editing.id}`, data);
      return apiRequest("POST", "/api/crm/schools", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/schools"] });
      setOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Thành công", description: "Đã lưu trường học" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/schools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/schools"] });
      toast({ title: "Đã xoá", description: "Đã xoá trường học" });
    },
  });

  const handleEdit = (item: CrmSchool) => {
    setEditing(item);
    form.reset({ name: item.name });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div><CardTitle>Trường học</CardTitle><CardDescription>Quản lý danh sách trường học</CardDescription></div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); form.reset({ name: "" }); }}>
                <Plus className="h-4 w-4 mr-2" /> Thêm mới
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Sửa trường học" : "Thêm trường học"}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Tên trường học</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>{editing ? "Cập nhật" : "Thêm mới"}</Button></DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên trường học</TableHead>
              {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                {(canEdit || canDelete) && (
                  <TableCell className="text-right space-x-2">
                    {canEdit && <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const FIELD_TYPE_OPTIONS: { value: CrmCustomField["fieldType"]; label: string }[] = [
  { value: "text", label: "Văn bản ngắn" },
  { value: "textarea", label: "Văn bản dài" },
  { value: "number", label: "Số" },
  { value: "date", label: "Ngày" },
  { value: "select", label: "Chọn từ danh sách" },
];

function AdditionalInfoTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("additional-info");
  const [editing, setEditing] = useState<CrmCustomField | null>(null);
  const [open, setOpen] = useState(false);
  const [optionsText, setOptionsText] = useState("");

  const { data: list, isLoading } = useCrmCustomFields();

  const form = useForm<any>({
    resolver: zodResolver(insertCrmCustomFieldSchema) as any,
    defaultValues: { label: "", fieldType: "text", options: undefined, position: 0 },
  });

  const fieldType = form.watch("fieldType") as CrmCustomField["fieldType"];

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) {
        return apiRequest("PUT", `/api/crm/custom-fields/${editing.id}`, data);
      }
      return apiRequest("POST", "/api/crm/custom-fields", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.customFields.list.path] });
      setOpen(false); setEditing(null); form.reset(); setOptionsText("");
      toast({ title: "Thành công", description: "Đã lưu trường tùy chỉnh" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không lưu được", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.customFields.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.crm.requiredFields.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Đã xoá", description: "Đã xoá trường tùy chỉnh" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ label: "", fieldType: "text", options: undefined, position: (list?.length ?? 0) });
    setOptionsText("");
    setOpen(true);
  };

  const openEdit = (item: CrmCustomField) => {
    setEditing(item);
    form.reset({
      label: item.label,
      fieldType: item.fieldType,
      options: item.options ?? undefined,
      position: item.position,
    });
    setOptionsText((item.options ?? []).join("\n"));
    setOpen(true);
  };

  const onSubmit = (data: any) => {
    const payload: any = {
      label: data.label?.trim(),
      fieldType: data.fieldType,
      position: Number(data.position) || 0,
    };
    if (data.fieldType === "select") {
      const opts = optionsText.split("\n").map(s => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast({ title: "Lỗi", description: "Vui lòng nhập ít nhất một lựa chọn", variant: "destructive" });
        return;
      }
      payload.options = opts;
    } else {
      payload.options = null;
    }
    saveMutation.mutate(payload);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Thông tin bổ sung</CardTitle>
          <CardDescription>
            Tạo các trường thông tin tùy chỉnh để bổ sung vào hồ sơ Học viên / Phụ huynh.
          </CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) { setEditing(null); setOptionsText(""); } }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="button-add-custom-field">
                <Plus className="h-4 w-4 mr-2" /> Thêm mới
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Sửa trường thông tin" : "Thêm trường thông tin"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="label" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên trường <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input {...field} data-testid="input-custom-field-label" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fieldType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loại dữ liệu</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-custom-field-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FIELD_TYPE_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {fieldType === "select" && (
                    <FormItem>
                      <FormLabel>Danh sách lựa chọn (mỗi dòng 1 lựa chọn)</FormLabel>
                      <FormControl>
                        <Textarea
                          value={optionsText}
                          onChange={(e) => setOptionsText(e.target.value)}
                          rows={4}
                          placeholder={"Lựa chọn 1\nLựa chọn 2"}
                          data-testid="textarea-custom-field-options"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-custom-field">
                      {editing ? "Cập nhật" : "Thêm mới"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên trường</TableHead>
                <TableHead>Loại dữ liệu</TableHead>
                {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list ?? []).map((item) => (
                <TableRow key={item.id} data-testid={`row-custom-field-${item.id}`}>
                  <TableCell className="font-medium" data-testid={`text-custom-field-label-${item.id}`}>{item.label}</TableCell>
                  <TableCell>{FIELD_TYPE_OPTIONS.find(o => o.value === item.fieldType)?.label ?? item.fieldType}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right space-x-2">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`button-edit-custom-field-${item.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Xoá trường "${item.label}"? Dữ liệu đã nhập sẽ bị xoá theo.`)) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          data-testid={`button-delete-custom-field-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(!list || list.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Chưa có trường tùy chỉnh nào. Bấm "Thêm mới" để tạo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RequiredInfoTab() {
  const { toast } = useToast();
  const { canEdit } = useTabPerms("required-info");
  const { data: list, isLoading } = useCrmRequiredFields();
  const { data: customFields } = useCrmCustomFields();

  const requiredMap = new Map<string, boolean>(
    (list ?? []).map((r: CrmRequiredField) => [r.fieldKey, r.isRequired]),
  );

  const upsertMutation = useMutation({
    mutationFn: async (vars: { fieldKey: string; isRequired: boolean }) => {
      return apiRequest("PUT", api.crm.requiredFields.upsert.path, vars);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [api.crm.requiredFields.list.path] });
      const prev = queryClient.getQueryData<CrmRequiredField[]>([api.crm.requiredFields.list.path]);
      const next: CrmRequiredField[] = [...(prev ?? [])];
      const idx = next.findIndex(r => r.fieldKey === vars.fieldKey);
      if (idx >= 0) next[idx] = { ...next[idx], isRequired: vars.isRequired };
      else next.push({ fieldKey: vars.fieldKey, isRequired: vars.isRequired });
      queryClient.setQueryData([api.crm.requiredFields.list.path], next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([api.crm.requiredFields.list.path], ctx.prev);
      toast({ title: "Lỗi", description: "Không lưu được cấu hình", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.requiredFields.list.path] });
    },
  });

  const customAsConfigurable: CrmConfigurableField[] = (customFields ?? []).map(c => ({
    key: makeCustomFieldKey(c.id),
    label: c.label,
    group: "additional",
  }));
  const allFields: CrmConfigurableField[] = [...CRM_CONFIGURABLE_FIELDS, ...customAsConfigurable];
  const groups = Array.from(new Set(allFields.map(f => f.group)));

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Thông tin bắt buộc</CardTitle>
        <CardDescription>
          Tích chọn các trường thông tin sẽ trở thành bắt buộc (có dấu *) khi thêm/sửa Học viên hoặc Phụ huynh.
          Các trường mặc định bắt buộc của hệ thống (Cơ sở, Phân loại, Mã, Họ tên) không hiển thị ở đây.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (
          groups.map(group => {
            const fields = allFields.filter(f => f.group === group);
            if (fields.length === 0) return null;
            return (
              <div key={group} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{CRM_FIELD_GROUP_LABELS[group]}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {fields.map((f: CrmConfigurableField) => {
                    const checked = requiredMap.get(f.key) ?? false;
                    return (
                      <label
                        key={f.key}
                        htmlFor={`required-${f.key}`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-muted/40 cursor-pointer",
                          !canEdit && "opacity-60 cursor-not-allowed"
                        )}
                        data-testid={`label-required-${f.key}`}
                      >
                        <Checkbox
                          id={`required-${f.key}`}
                          checked={checked}
                          disabled={!canEdit || upsertMutation.isPending}
                          onCheckedChange={(val) => {
                            if (!canEdit) return;
                            upsertMutation.mutate({ fieldKey: f.key, isRequired: !!val });
                          }}
                          data-testid={`checkbox-required-${f.key}`}
                        />
                        <span className="text-sm text-foreground">{f.label}</span>
                        {checked && <span className="text-destructive text-sm">*</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ── Registration Form Preview ────────────────────────────────────────────────
type RegFieldDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  type: "text" | "tel" | "email" | "date" | "select" | "textarea";
  options?: string[];
  alwaysOn?: boolean;
};

const FIELD_META: Record<string, Omit<RegFieldDef, "key" | "label">> = {
  fullName:          { icon: <User className="h-4 w-4 text-muted-foreground" />,        placeholder: "Nhập họ và tên của bạn",               type: "text",     alwaysOn: true },
  phone:             { icon: <Phone className="h-4 w-4 text-muted-foreground" />,       placeholder: "Nhập số điện thoại để được liên hệ",   type: "tel" },
  email:             { icon: <Mail className="h-4 w-4 text-muted-foreground" />,        placeholder: "Nhập email của bạn (nếu có)",           type: "email" },
  dateOfBirth:       { icon: <CalendarDays className="h-4 w-4 text-muted-foreground" />,placeholder: "Chọn ngày sinh",                        type: "date" },
  parentName:        { icon: <User className="h-4 w-4 text-muted-foreground" />,        placeholder: "Họ tên phụ huynh",                      type: "text" },
  parentPhone:       { icon: <Phone className="h-4 w-4 text-muted-foreground" />,       placeholder: "Số điện thoại phụ huynh",               type: "tel" },
  customerSourceIds: { icon: <ChevronDown className="h-4 w-4 text-muted-foreground" />, placeholder: "Chọn nguồn biết đến trung tâm",         type: "select" },
  salesByIds:        { icon: <User className="h-4 w-4 text-muted-foreground" />,        placeholder: "Nhân viên tư vấn",                      type: "text" },
  note:              { icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />,placeholder: "Nhập nội dung bạn muốn được tư vấn...", type: "textarea" },
};

function RegistrationFormPreviewDialog({ visibleKeys, customFields }: {
  visibleKeys: Set<string>;
  customFields: CrmCustomField[];
}) {
  const [open, setOpen] = useState(false);

  // Build ordered list of fields to render
  const previewFields: RegFieldDef[] = [
    { key: "fullName", label: "Họ và tên", ...FIELD_META["fullName"] },
    ...REGISTRATION_FORM_FIELDS
      .filter(f => visibleKeys.has(f.key))
      .map(f => ({
        key: f.key,
        label: f.label,
        ...(FIELD_META[f.key] ?? { icon: <User className="h-4 w-4 text-muted-foreground" />, placeholder: f.label, type: "text" as const }),
      })),
    ...customFields
      .filter(c => visibleKeys.has(makeCustomFieldKey(c.id)))
      .map(c => ({
        key: makeCustomFieldKey(c.id),
        label: c.label,
        icon: <BookOpen className="h-4 w-4 text-muted-foreground" />,
        placeholder: `Nhập ${c.label.toLowerCase()}`,
        type: (c.fieldType === "textarea" ? "textarea" : c.fieldType === "date" ? "date" : c.fieldType === "select" ? "select" : "text") as RegFieldDef["type"],
        options: c.options ?? undefined,
      })),
  ];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Eye className="h-4 w-4" />
        Xem trước form
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 px-6 pt-6 pb-4 rounded-t-lg">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  Đăng ký tư vấn khóa học
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Điền thông tin để được tư vấn miễn phí và nhận ưu đãi hấp dẫn!
                </p>
              </div>
              <BookOpen className="h-10 w-10 text-blue-300 flex-shrink-0 opacity-60" />
            </div>
          </div>

          {/* Form fields */}
          <div className="px-6 py-4 space-y-4">
            {previewFields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Chưa chọn trường nào. Hãy tick chọn các trường ở trên để hiển thị trong form.
              </p>
            ) : (
              previewFields.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {f.label}
                    {f.alwaysOn && <span className="text-red-500 ml-1">*</span>}
                    {f.key === "email" && <span className="text-gray-400 font-normal ml-1">(không bắt buộc)</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <div className="relative">
                      <div className="absolute left-3 top-3 pointer-events-none">{f.icon}</div>
                      <textarea
                        disabled
                        placeholder={f.placeholder}
                        rows={3}
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-400 placeholder:text-gray-400 resize-none cursor-not-allowed"
                      />
                    </div>
                  ) : f.type === "select" ? (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{f.icon}</div>
                      <div className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-400 flex items-center justify-between">
                        <span>{f.placeholder}</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{f.icon}</div>
                      <input
                        disabled
                        type={f.type}
                        placeholder={f.placeholder}
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-400 placeholder:text-gray-400 cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Consent checkbox */}
            <div className="flex items-start gap-2 pt-1">
              <div className="mt-0.5 w-4 h-4 rounded border-2 border-blue-500 bg-blue-500 flex-shrink-0 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tôi đồng ý để trung tâm liên hệ tư vấn qua số điện thoại hoặc email.
              </p>
            </div>

            {/* Submit button */}
            <div className="pt-2 space-y-3">
              <div className="w-full py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                ĐĂNG KÝ NGAY
              </div>
              <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Thông tin của bạn được bảo mật tuyệt đối và chỉ phục vụ cho mục đích tư vấn khóa học.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegistrationFormTab() {
  const { toast } = useToast();
  const { canEdit } = useTabPerms("registration-form");
  const { data: list, isLoading } = useCrmRegistrationFormFields();
  const { data: customFields } = useCrmCustomFields();

  const visibleMap = new Map<string, boolean>(
    (list ?? []).map(r => [r.fieldKey, r.isVisible]),
  );
  const requiredMap = new Map<string, boolean>(
    (list ?? []).map(r => [r.fieldKey, (r as any).isRequired ?? false]),
  );
  const visibleKeys = new Set<string>(
    (list ?? []).filter(r => r.isVisible).map(r => r.fieldKey),
  );

  const upsertMutation = useMutation({
    mutationFn: async (vars: { fieldKey: string; isVisible: boolean; isRequired?: boolean }) => {
      return apiRequest("PUT", api.crm.registrationFields.upsert.path, vars);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [api.crm.registrationFields.list.path] });
      const prev = queryClient.getQueryData<{ fieldKey: string; isVisible: boolean; isRequired: boolean }[]>([api.crm.registrationFields.list.path]);
      const next = [...(prev ?? [])];
      const idx = next.findIndex(r => r.fieldKey === vars.fieldKey);
      if (idx >= 0) next[idx] = { ...next[idx], ...vars };
      else next.push({ fieldKey: vars.fieldKey, isVisible: vars.isVisible, isRequired: vars.isRequired ?? false });
      queryClient.setQueryData([api.crm.registrationFields.list.path], next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([api.crm.registrationFields.list.path], ctx.prev);
      toast({ title: "Lỗi", description: "Không lưu được cấu hình", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.crm.registrationFields.list.path] });
    },
  });

  const customAsConfigurable: CrmConfigurableField[] = (customFields ?? []).map(c => ({
    key: makeCustomFieldKey(c.id),
    label: c.label,
    group: "additional",
  }));
  const allFields: CrmConfigurableField[] = [...REGISTRATION_FORM_FIELDS, ...customAsConfigurable];
  const groups = Array.from(new Set(allFields.map(f => f.group)));

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Form đăng ký</CardTitle>
            <CardDescription className="mt-1">
              Tích chọn các trường thông tin sẽ hiển thị trên form đăng ký cho học viên.
              Trường <strong>Họ và tên</strong> luôn hiển thị mặc định.
            </CardDescription>
          </div>
          <RegistrationFormPreviewDialog
            visibleKeys={visibleKeys}
            customFields={customFields ?? []}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Shareable link */}
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Link form đăng ký</p>
            <p className="text-sm font-mono text-foreground truncate select-all">
              {typeof window !== "undefined" ? `${window.location.origin}/dang-ky` : "/dang-ky"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0"
            onClick={() => {
              const url = `${window.location.origin}/dang-ky`;
              navigator.clipboard.writeText(url).then(() =>
                toast({ title: "Đã sao chép link!" })
              );
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Sao chép
          </Button>
        </div>

        {/* Always-on field */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{CRM_FIELD_GROUP_LABELS["contact"]}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 opacity-70 cursor-not-allowed">
              <Checkbox checked disabled />
              <span className="text-sm text-foreground">Họ và tên</span>
              <span className="text-xs text-muted-foreground ml-auto">(mặc định)</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (
          groups.map(group => {
            const fields = allFields.filter(f => f.group === group);
            if (fields.length === 0) return null;
            return (
              <div key={group} className="space-y-2">
                {group !== "contact" && (
                  <h3 className="text-sm font-semibold text-foreground">{CRM_FIELD_GROUP_LABELS[group]}</h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {fields.map((f: CrmConfigurableField) => {
                    const checked = visibleMap.get(f.key) ?? false;
                    const required = requiredMap.get(f.key) ?? false;
                    return (
                      <div
                        key={f.key}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md border bg-background",
                          checked ? "hover:bg-muted/40" : "opacity-60",
                          !canEdit && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        {/* Visible checkbox */}
                        <Checkbox
                          id={`regform-${f.key}`}
                          checked={checked}
                          disabled={!canEdit || upsertMutation.isPending}
                          onCheckedChange={(val) => {
                            if (!canEdit) return;
                            upsertMutation.mutate({ fieldKey: f.key, isVisible: !!val, isRequired: !!val ? required : false });
                          }}
                        />
                        <label
                          htmlFor={`regform-${f.key}`}
                          className="text-sm text-foreground flex-1 cursor-pointer select-none"
                        >
                          {f.label}
                        </label>
                        {/* Required sub-checkbox — only active when field is visible */}
                        <div
                          className={cn(
                            "flex items-center gap-1 ml-auto border-l pl-2",
                            !checked && "pointer-events-none opacity-30"
                          )}
                          title="Bắt buộc nhập"
                        >
                          <Checkbox
                            id={`regform-req-${f.key}`}
                            checked={required}
                            disabled={!canEdit || !checked || upsertMutation.isPending}
                            onCheckedChange={(val) => {
                              if (!canEdit || !checked) return;
                              upsertMutation.mutate({ fieldKey: f.key, isVisible: true, isRequired: !!val });
                            }}
                            className="h-3.5 w-3.5 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                          />
                          <label
                            htmlFor={`regform-req-${f.key}`}
                            className={cn(
                              "text-xs cursor-pointer select-none whitespace-nowrap",
                              required ? "text-red-500 font-medium" : "text-muted-foreground"
                            )}
                          >
                            Bắt buộc
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
