import { useState, useEffect } from "react";
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
import { insertCrmRelationshipSchema, insertCrmRejectReasonSchema, insertCrmCustomerSourceSchema, type CrmRelationship, type CrmRejectReason, type CrmCustomerSource } from "@shared/schema";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";

const CRM_CONFIG_HREF = "/customers/crm-config";
const ALL_TABS = [
  { value: "relationships", label: "Mối quan hệ" },
  { value: "reject-reasons", label: "Lý do từ chối" },
  { value: "sources", label: "Nguồn khách hàng" },
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
    if (!isSubTabVisible(CRM_CONFIG_HREF, t.value)) return false;
    if (myPerms?.isSuperAdmin) return true;
    const resource = `${CRM_CONFIG_HREF}#${t.value}`;
    const perm = myPerms?.permissions?.[resource];
    return perm?.canView || perm?.canViewAll || perm?.canCreate || perm?.canEdit || perm?.canDelete;
  });
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.value || "relationships");

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].value);
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function RelationshipTab() {
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete } = useTabPerms("relationships");
  const [editing, setEditing] = useState<CrmRelationship | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list, isLoading } = useQuery<CrmRelationship[]>({
    queryKey: ["/api/crm/relationships"],
  });

  const form = useForm({
    resolver: zodResolver(insertCrmRelationshipSchema),
    defaultValues: { name: "", color: "#3b82f6", position: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editing) {
        return apiRequest("PUT", `/api/crm/relationships/${editing.id}`, data);
      }
      return apiRequest("POST", "/api/crm/relationships", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
      setOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Thành công", description: "Đã lưu thông tin mối quan hệ" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/relationships/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/relationships"] });
      toast({ title: "Đã xoá", description: "Đã xoá mối quan hệ" });
    }
  });

  const handleEdit = (item: CrmRelationship) => {
    setEditing(item);
    form.reset({ name: item.name, color: item.color, position: item.position || "" });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Mối quan hệ</CardTitle>
          <CardDescription>Cấu hình các mức độ mối quan hệ với khách hàng</CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); form.reset({ name: "", color: "#3b82f6", position: "" }); }}>
                <Plus className="h-4 w-4 mr-2" /> Thêm mới
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Sửa mối quan hệ" : "Thêm mới mối quan hệ"}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Tên mối quan hệ</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="color" render={({ field }) => (
                    <FormItem><FormLabel>Màu sắc</FormLabel><FormControl><Input type="color" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="position" render={({ field }) => (
                    <FormItem><FormLabel>Vị trí</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
              <TableHead>Tên</TableHead>
              <TableHead>Màu sắc</TableHead>
              <TableHead>Vị trí</TableHead>
              {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} /> {item.color}</div></TableCell>
                <TableCell>{item.position}</TableCell>
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
