import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { STATIC_STALE_TIME } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Warehouse, Users, Tag, Ruler, Palette, Maximize2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfigTab = "warehouses" | "suppliers" | "categories" | "units" | "colors" | "sizes" | "reservation";

const CONFIG_TABS: { value: ConfigTab; label: string; icon: any; color: string; activeColor: string }[] = [
  { value: "warehouses",   label: "Quản lý kho",        icon: Warehouse, color: "border-blue-300 text-blue-700 hover:bg-blue-50",      activeColor: "bg-blue-600 border-blue-600 text-white" },
  { value: "suppliers",    label: "Nhà cung cấp",        icon: Users,     color: "border-emerald-300 text-emerald-700 hover:bg-emerald-50", activeColor: "bg-emerald-600 border-emerald-600 text-white" },
  { value: "categories",   label: "Danh mục",             icon: Tag,       color: "border-violet-300 text-violet-700 hover:bg-violet-50",  activeColor: "bg-violet-600 border-violet-600 text-white" },
  { value: "units",        label: "Đơn vị",               icon: Ruler,     color: "border-orange-300 text-orange-700 hover:bg-orange-50",  activeColor: "bg-orange-500 border-orange-500 text-white" },
  { value: "colors",       label: "Màu sắc",              icon: Palette,   color: "border-pink-300 text-pink-700 hover:bg-pink-50",        activeColor: "bg-pink-500 border-pink-500 text-white" },
  { value: "sizes",        label: "Kích cỡ",              icon: Maximize2, color: "border-cyan-300 text-cyan-700 hover:bg-cyan-50",        activeColor: "bg-cyan-600 border-cyan-600 text-white" },
  { value: "reservation",  label: "Thời gian giữ chỗ",   icon: Clock,     color: "border-amber-300 text-amber-700 hover:bg-amber-50",     activeColor: "bg-amber-500 border-amber-500 text-white" },
];

// ── Generic table wrapper ─────────────────────────────────────────────────────
function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Button size="sm" onClick={onAdd} className="flex items-center gap-1.5 h-8">
        <Plus className="w-3.5 h-3.5" /> Thêm mới
      </Button>
    </div>
  );
}

function TableShell({ headers, children, isEmpty, emptyText }: { headers: string[]; children: React.ReactNode; isEmpty: boolean; emptyText: string }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-10">#</th>
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={headers.length + 2} className="text-center py-10 text-muted-foreground text-xs">{emptyText}</td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onEdit}>
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 h-5 border-none font-medium",
      status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
    )}>
      {status === "active" ? "Hoạt động" : "Ngừng"}
    </Badge>
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────
function DeleteDialog({ open, name, onConfirm, onCancel, isPending }: { open: boolean; name: string; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá mục này?</AlertDialogTitle>
          <AlertDialogDescription>Bạn có chắc muốn xoá <strong>{name}</strong>? Hành động này không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending} className="bg-destructive hover:bg-destructive/90">Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── WAREHOUSES ────────────────────────────────────────────────────────────────
type Warehouse = { id: string; code: string; name: string; locationId?: string | null; address?: string | null; minStock?: number | null; maxStock?: number | null; status: string };

function WarehousesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({ code: "", name: "", locationId: "", address: "", minStock: "", maxStock: "", status: "active" });

  const { data: rows = [] } = useQuery<Warehouse[]>({ queryKey: ["/api/store/warehouses"], queryFn: () => fetch("/api/store/warehouses", { credentials: "include" }).then(r => r.json()) });
  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"], staleTime: STATIC_STALE_TIME });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/warehouses"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/warehouses", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm kho" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/warehouses/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật kho" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/warehouses/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá kho" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "", locationId: "", address: "", minStock: "", maxStock: "", status: "active" }); setOpen(true); };
  const openEdit = (r: Warehouse) => { setEditing(r); setForm({ code: r.code, name: r.name, locationId: r.locationId || "", address: r.address || "", minStock: r.minStock?.toString() || "", maxStock: r.maxStock?.toString() || "", status: r.status }); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };
  const submit = () => {
    const payload = { ...form, locationId: form.locationId || null, address: form.address || null, minStock: form.minStock ? parseInt(form.minStock) : null, maxStock: form.maxStock ? parseInt(form.maxStock) : null };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  return (
    <>
      <SectionHeader title="Danh sách kho" onAdd={openCreate} />
      <TableShell headers={["Mã kho", "Tên kho", "Cơ sở", "Địa chỉ", "Tối thiểu", "Tối đa", "Trạng thái"]} isEmpty={rows.length === 0} emptyText="Chưa có kho nào. Nhấn Thêm mới để tạo.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{r.code}</td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{locations.find((l: any) => l.id === r.locationId)?.name || "—"}</td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">{r.address || "—"}</td>
            <td className="px-4 py-2.5 text-xs text-center">{r.minStock ?? "—"}</td>
            <td className="px-4 py-2.5 text-xs text-center">{r.maxStock ?? "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Sửa kho" : "Thêm kho mới"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>Mã kho *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="KHO-001" /></div>
            <div className="space-y-1"><Label>Tên kho *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kho chính" /></div>
            <div className="space-y-1">
              <Label>Cơ sở</Label>
              <Select value={form.locationId || "none"} onValueChange={v => setForm(f => ({ ...f, locationId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Không chọn —</SelectItem>
                  {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Trạng thái</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Hoạt động</SelectItem>
                  <SelectItem value="inactive">Ngừng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label>Địa chỉ</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Địa chỉ kho..." /></div>
            <div className="space-y-1"><Label>Tồn kho tối thiểu</Label><Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} placeholder="0" /></div>
            <div className="space-y-1"><Label>Tồn kho tối đa</Label><Input type="number" value={form.maxStock} onChange={e => setForm(f => ({ ...f, maxStock: e.target.value }))} placeholder="1000" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────
type Supplier = { id: string; code: string; name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null; taxCode?: string | null; note?: string | null; status: string };

function SuppliersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const emptyForm = { code: "", name: "", contactPerson: "", phone: "", email: "", address: "", taxCode: "", note: "", status: "active" };
  const [form, setForm] = useState(emptyForm);

  const { data: rows = [] } = useQuery<Supplier[]>({ queryKey: ["/api/store/suppliers"], queryFn: () => fetch("/api/store/suppliers", { credentials: "include" }).then(r => r.json()) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/suppliers"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/suppliers", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm nhà cung cấp" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/suppliers/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/suppliers/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r: Supplier) => { setEditing(r); setForm({ code: r.code, name: r.name, contactPerson: r.contactPerson || "", phone: r.phone || "", email: r.email || "", address: r.address || "", taxCode: r.taxCode || "", note: r.note || "", status: r.status }); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };
  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const submit = () => { editing ? updateMut.mutate(form) : createMut.mutate(form); };

  return (
    <>
      <SectionHeader title="Danh sách nhà cung cấp" onAdd={openCreate} />
      <TableShell headers={["Mã NCC", "Tên NCC", "Người LH", "SĐT", "Email", "MST", "Trạng thái"]} isEmpty={rows.length === 0} emptyText="Chưa có nhà cung cấp nào.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{r.code}</td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5 text-xs">{r.contactPerson || "—"}</td>
            <td className="px-4 py-2.5 text-xs">{r.phone || "—"}</td>
            <td className="px-4 py-2.5 text-xs">{r.email || "—"}</td>
            <td className="px-4 py-2.5 text-xs">{r.taxCode || "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>Mã NCC *</Label><Input value={form.code} onChange={f("code")} placeholder="NCC-001" /></div>
            <div className="space-y-1"><Label>Tên nhà cung cấp *</Label><Input value={form.name} onChange={f("name")} placeholder="Công ty ABC" /></div>
            <div className="space-y-1"><Label>Người liên hệ</Label><Input value={form.contactPerson} onChange={f("contactPerson")} placeholder="Nguyễn Văn A" /></div>
            <div className="space-y-1"><Label>Số điện thoại</Label><Input value={form.phone} onChange={f("phone")} placeholder="0901234567" /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={f("email")} placeholder="ncc@email.com" /></div>
            <div className="space-y-1"><Label>Mã số thuế</Label><Input value={form.taxCode} onChange={f("taxCode")} placeholder="0123456789" /></div>
            <div className="space-y-1 col-span-2"><Label>Địa chỉ</Label><Input value={form.address} onChange={f("address")} placeholder="Địa chỉ..." /></div>
            <div className="space-y-1"><Label>Ghi chú</Label><Input value={form.note} onChange={f("note")} placeholder="Ghi chú..." /></div>
            <div className="space-y-1">
              <Label>Trạng thái</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Hoạt động</SelectItem>
                  <SelectItem value="inactive">Ngừng</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── CATEGORIES ────────────────────────────────────────────────────────────────
type Category = { id: string; name: string; description?: string | null };

function CategoriesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: rows = [] } = useQuery<Category[]>({ queryKey: ["/api/store/categories"], queryFn: () => fetch("/api/store/categories", { credentials: "include" }).then(r => r.json()) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/categories"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/categories", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm danh mục" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/categories/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/categories/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setForm({ name: "", description: "" }); setOpen(true); };
  const openEdit = (r: Category) => { setEditing(r); setForm({ name: r.name, description: r.description || "" }); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };

  return (
    <>
      <SectionHeader title="Danh mục sản phẩm" onAdd={openCreate} />
      <TableShell headers={["Tên danh mục", "Mô tả"]} isEmpty={rows.length === 0} emptyText="Chưa có danh mục nào.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.description || "—"}</td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Sửa danh mục" : "Thêm danh mục"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Tên danh mục *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Văn phòng phẩm" /></div>
            <div className="space-y-1"><Label>Mô tả</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mô tả..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={() => editing ? updateMut.mutate(form) : createMut.mutate(form)} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── UNITS ─────────────────────────────────────────────────────────────────────
type Unit = { id: string; name: string };

function UnitsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const [name, setName] = useState("");

  const { data: rows = [] } = useQuery<Unit[]>({ queryKey: ["/api/store/units"], queryFn: () => fetch("/api/store/units", { credentials: "include" }).then(r => r.json()) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/units"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/units", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm đơn vị" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/units/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/units/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setName(""); setOpen(true); };
  const openEdit = (r: Unit) => { setEditing(r); setName(r.name); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };

  return (
    <>
      <SectionHeader title="Đơn vị tính" onAdd={openCreate} />
      <TableShell headers={["Tên đơn vị"]} isEmpty={rows.length === 0} emptyText="Chưa có đơn vị nào.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Sửa đơn vị" : "Thêm đơn vị"}</DialogTitle></DialogHeader>
          <div className="space-y-1 py-2"><Label>Tên đơn vị *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Cái, Hộp, Kg..." autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={() => editing ? updateMut.mutate({ name }) : createMut.mutate({ name })} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── COLORS ────────────────────────────────────────────────────────────────────
type Color = { id: string; name: string; hex?: string | null };

function ColorsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Color | null>(null);
  const [deleting, setDeleting] = useState<Color | null>(null);
  const [form, setForm] = useState({ name: "", hex: "#ffffff" });

  const { data: rows = [] } = useQuery<Color[]>({ queryKey: ["/api/store/colors"], queryFn: () => fetch("/api/store/colors", { credentials: "include" }).then(r => r.json()) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/colors"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/colors", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm màu" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/colors/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/colors/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setForm({ name: "", hex: "#ffffff" }); setOpen(true); };
  const openEdit = (r: Color) => { setEditing(r); setForm({ name: r.name, hex: r.hex || "#ffffff" }); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };

  return (
    <>
      <SectionHeader title="Màu sắc" onAdd={openCreate} />
      <TableShell headers={["Màu", "Tên màu"]} isEmpty={rows.length === 0} emptyText="Chưa có màu nào.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded border border-border shadow-sm shrink-0" style={{ backgroundColor: r.hex || "#ffffff" }} />
                <span className="text-xs font-mono text-muted-foreground">{r.hex || "—"}</span>
              </div>
            </td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Sửa màu" : "Thêm màu"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Tên màu *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Trắng, Đỏ, Xanh..." autoFocus /></div>
            <div className="space-y-1">
              <Label>Mã màu</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.hex || "#ffffff"} onChange={e => setForm(f => ({ ...f, hex: e.target.value }))} className="w-10 h-9 rounded border border-border cursor-pointer p-0.5" />
                <Input value={form.hex || ""} onChange={e => setForm(f => ({ ...f, hex: e.target.value }))} placeholder="#ffffff" className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={() => editing ? updateMut.mutate(form) : createMut.mutate(form)} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── SIZES ─────────────────────────────────────────────────────────────────────
type Size = { id: string; name: string };

function SizesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Size | null>(null);
  const [deleting, setDeleting] = useState<Size | null>(null);
  const [name, setName] = useState("");

  const { data: rows = [] } = useQuery<Size[]>({ queryKey: ["/api/store/sizes"], queryFn: () => fetch("/api/store/sizes", { credentials: "include" }).then(r => r.json()) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/sizes"] });
  const createMut = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/store/sizes", d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã thêm kích cỡ" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const updateMut = useMutation({ mutationFn: (d: any) => apiRequest("PATCH", `/api/store/sizes/${editing?.id}`, d), onSuccess: () => { invalidate(); close(); toast({ title: "Đã cập nhật" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });
  const deleteMut = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/store/sizes/${deleting?.id}`), onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Đã xoá" }); }, onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }) });

  const openCreate = () => { setEditing(null); setName(""); setOpen(true); };
  const openEdit = (r: Size) => { setEditing(r); setName(r.name); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };

  return (
    <>
      <SectionHeader title="Kích cỡ" onAdd={openCreate} />
      <TableShell headers={["Tên kích cỡ"]} isEmpty={rows.length === 0} emptyText="Chưa có kích cỡ nào.">
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
            <td className="px-4 py-2.5 font-medium text-sm">{r.name}</td>
            <td className="px-4 py-2.5"><RowActions onEdit={() => openEdit(r)} onDelete={() => setDeleting(r)} /></td>
          </tr>
        ))}
      </TableShell>

      <Dialog open={open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Sửa kích cỡ" : "Thêm kích cỡ"}</DialogTitle></DialogHeader>
          <div className="space-y-1 py-2"><Label>Tên kích cỡ *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="S, M, L, XL, 36, 38..." autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={() => editing ? updateMut.mutate({ name }) : createMut.mutate({ name })} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog open={!!deleting} name={deleting?.name || ""} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(null)} isPending={deleteMut.isPending} />
    </>
  );
}

// ── RESERVATION CONFIG ────────────────────────────────────────────────────────
function ReservationConfigTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ sessionMinutes: number; draftMinutes: number }>({
    queryKey: ["/api/store/reservation-config"],
    queryFn: () => fetch("/api/store/reservation-config", { credentials: "include" }).then(r => r.json()),
  });

  const [sessionMinutes, setSessionMinutes] = useState<string>("");
  const [draftMinutes, setDraftMinutes] = useState<string>("");

  const loaded = !!data;
  if (loaded && sessionMinutes === "" && draftMinutes === "") {
    setSessionMinutes(String(data!.sessionMinutes));
    setDraftMinutes(String(data!.draftMinutes));
  }

  const saveMut = useMutation({
    mutationFn: () => fetch("/api/store/reservation-config", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionMinutes: Math.max(1, parseInt(sessionMinutes) || 5),
        draftMinutes: Math.max(1, parseInt(draftMinutes) || 1440),
      }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/store/reservation-config"] });
      toast({ title: "Đã lưu cấu hình thời gian giữ chỗ" });
    },
    onError: () => toast({ title: "Lỗi khi lưu", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <p className="text-xs text-muted-foreground">
        Cấu hình thời gian hệ thống giữ chỗ hàng trong kho, tránh tình trạng nhiều nhân sự cùng xuất một sản phẩm.
      </p>

      <div className="space-y-5">
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold">Giữ chỗ khi tạo phiếu xuất kho (chưa lưu)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Khi nhân sự thêm sản phẩm vào phiếu nhưng chưa lưu, hệ thống tạm giữ số lượng đó. Timer tự reset mỗi khi có thay đổi.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={sessionMinutes}
              onChange={e => setSessionMinutes(e.target.value)}
              className="w-28 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">phút</span>
            <span className="text-xs text-muted-foreground ml-2">(tối thiểu 1 phút)</span>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold">Giữ chỗ khi phiếu xuất kho ở trạng thái Lưu nháp</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Phiếu nháp không hoạt động sau thời gian này sẽ tự động giải phóng số lượng giữ chỗ về kho. Tính từ lần cập nhật cuối của phiếu.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={draftMinutes}
              onChange={e => setDraftMinutes(e.target.value)}
              className="w-28 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">phút</span>
            {parseInt(draftMinutes) >= 60 && (
              <span className="text-xs text-muted-foreground ml-2">
                (≈ {Math.round(parseInt(draftMinutes) / 60 * 10) / 10} giờ)
              </span>
            )}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Ví dụ: 1440 phút = 24 giờ, 2880 phút = 48 giờ, 10080 phút = 7 ngày
          </p>
        </div>
      </div>

      <Button
        size="sm"
        onClick={() => saveMut.mutate()}
        disabled={saveMut.isPending}
        className="h-8"
      >
        {saveMut.isPending ? "Đang lưu..." : "Lưu cấu hình"}
      </Button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function StoreConfigTab() {
  const [active, setActive] = useState<ConfigTab>("warehouses");

  return (
    <div className="space-y-4">
      {/* Sub-tab buttons */}
      <div className="flex flex-wrap gap-2">
        {CONFIG_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = active === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActive(tab.value)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                isActive ? tab.activeColor : tab.color + " bg-background"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-background rounded-xl p-4 border border-border">
        {active === "warehouses"  && <WarehousesTab />}
        {active === "suppliers"   && <SuppliersTab />}
        {active === "categories"  && <CategoriesTab />}
        {active === "units"       && <UnitsTab />}
        {active === "colors"      && <ColorsTab />}
        {active === "sizes"       && <SizesTab />}
        {active === "reservation" && <ReservationConfigTab />}
      </div>
    </div>
  );
}
