import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Plus, Trash2, Lock, Pencil } from "lucide-react";
import type { TaskStatus } from "@shared/schema";

export type ConfigPerms = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isSuperAdmin: boolean;
};

type StatusWithMeta = TaskStatus & { inUse?: boolean; taskCount?: number };

const PRESET_COLORS = [
  "#1d4ed8", "#3b82f6", "#06b6d4", "#22c55e",
  "#84cc16", "#eab308", "#f97316", "#ef4444",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f59e0b",
];

const DEFAULT_COLOR = "#1d4ed8";

function SortableStatusItem({
  status,
  onDelete,
  onEdit,
  canDelete,
  canEdit,
}: {
  status: StatusWithMeta;
  onDelete: (id: string) => void;
  onEdit: (status: StatusWithMeta) => void;
  canDelete: boolean;
  canEdit: boolean;
}) {
  const isDraggable = !status.isFixed && canEdit;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isInUse = status.inUse ?? false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`status-item-${status.id}`}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-background ${
        status.isFixed ? "opacity-80" : ""
      }`}
    >
      <div
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
        className={`flex-shrink-0 ${isDraggable ? "cursor-grab text-muted-foreground hover:text-foreground" : "text-muted-foreground/30"}`}
        data-testid={`drag-handle-${status.id}`}
      >
        {status.isFixed ? <Lock className="h-4 w-4" /> : <GripVertical className="h-4 w-4" />}
      </div>

      <div
        className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20 shadow-sm"
        style={{ backgroundColor: status.color }}
        data-testid={`status-color-${status.id}`}
      />

      <span className="flex-1 text-sm font-medium" data-testid={`status-name-${status.id}`}>
        {status.name}
      </span>

      {isInUse && !status.isFixed && (
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
          {status.taskCount} CV
        </span>
      )}

      {status.isFixed ? (
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
          Mặc định
        </span>
      ) : (
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-blue-600"
              onClick={() => onEdit(status)}
              data-testid={`edit-status-${status.id}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && !isInUse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(status.id)}
              data-testid={`delete-status-${status.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskStatusConfigProps {
  perms: ConfigPerms;
}

export function TaskStatusConfig({ perms }: TaskStatusConfigProps) {
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  const [editOpen, setEditOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusWithMeta | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  const onlyMine = perms.canView && !perms.canViewAll && !perms.isSuperAdmin;

  const { data: statuses = [], isLoading } = useQuery<StatusWithMeta[]>({
    queryKey: ["/api/task-statuses", { mine: onlyMine }],
    queryFn: async () => {
      const url = onlyMine ? "/api/task-statuses?mine=true" : "/api/task-statuses";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      apiRequest("POST", "/api/task-statuses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-statuses"] });
      setCreateOpen(false);
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      toast({ title: "Đã thêm trạng thái mới" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; color: string } }) =>
      apiRequest("PATCH", `/api/task-statuses/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-statuses"] });
      setEditOpen(false);
      setEditingStatus(null);
      toast({ title: "Đã cập nhật trạng thái" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/task-statuses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-statuses"] });
      toast({ title: "Đã xoá trạng thái" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/task-statuses/reorder", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-statuses"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fixedFirst = statuses.find((s) => s.isFixed && s.position === 0);
  const fixedLast = statuses.find((s) => s.isFixed && s.position > 0);
  const draggableStatuses = statuses.filter((s) => !s.isFixed);

  function handleDragEnd(event: DragEndEvent) {
    if (!perms.canEdit && !perms.isSuperAdmin) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draggableStatuses.findIndex((s) => s.id === active.id);
    const newIndex = draggableStatuses.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(draggableStatuses, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map((s) => s.id));
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), color: newColor });
  }

  function handleOpenEdit(status: StatusWithMeta) {
    setEditingStatus(status);
    setEditName(status.name);
    setEditColor(status.color);
    setEditOpen(true);
  }

  function handleConfirmEdit() {
    if (!editingStatus || !editName.trim()) return;
    editMutation.mutate({ id: editingStatus.id, data: { name: editName.trim(), color: editColor } });
  }

  const canCreate = perms.canCreate || perms.isSuperAdmin;
  const canEdit = perms.canEdit || perms.isSuperAdmin;
  const canDelete = perms.canDelete || perms.isSuperAdmin;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Đang tải...
      </div>
    );
  }

  const colorPicker = (color: string, setColor: (c: string) => void, testPrefix: string) => (
    <div className="space-y-1.5">
      <Label>Màu sắc</Label>
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
            data-testid={`${testPrefix}-color-${c.replace("#", "")}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="w-7 h-7 rounded-full border flex-shrink-0" style={{ backgroundColor: color }} />
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-20 p-1 cursor-pointer"
          data-testid={`${testPrefix}-color-input`}
        />
        <span className="text-xs text-muted-foreground">{color}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Trạng thái công việc</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canEdit ? "Kéo thả để sắp xếp thứ tự hiển thị cột Kanban" : "Danh sách trạng thái công việc"}
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-add-status"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm mới trạng thái
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {fixedFirst && (
          <SortableStatusItem
            key={fixedFirst.id}
            status={fixedFirst}
            onDelete={() => {}}
            onEdit={() => {}}
            canDelete={false}
            canEdit={false}
          />
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draggableStatuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {draggableStatuses.map((status) => (
              <SortableStatusItem
                key={status.id}
                status={status}
                onDelete={(id) => deleteMutation.mutate(id)}
                onEdit={handleOpenEdit}
                canDelete={canDelete}
                canEdit={canEdit}
              />
            ))}
          </SortableContext>
        </DndContext>

        {draggableStatuses.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
            {canCreate ? 'Chưa có trạng thái tùy chỉnh. Nhấn "Thêm mới trạng thái" để tạo.' : "Chưa có trạng thái nào."}
          </div>
        )}

        {fixedLast && (
          <SortableStatusItem
            key={fixedLast.id}
            status={fixedLast}
            onDelete={() => {}}
            onEdit={() => {}}
            canDelete={false}
            canEdit={false}
          />
        )}
      </div>

      {/* Dialog tạo mới */}
      {canCreate && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-sm" data-testid="dialog-add-status">
            <DialogHeader>
              <DialogTitle>Thêm mới trạng thái</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="status-name">Tên trạng thái</Label>
                <Input
                  id="status-name"
                  placeholder="Ví dụ: Đang thực hiện"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  data-testid="input-status-name"
                />
              </div>
              {colorPicker(newColor, setNewColor, "create")}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-status">
                Huỷ
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                data-testid="button-confirm-add-status"
              >
                {createMutation.isPending ? "Đang thêm..." : "Thêm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog chỉnh sửa */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-edit-status">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa trạng thái</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-status-name">Tên trạng thái</Label>
              <Input
                id="edit-status-name"
                placeholder="Tên trạng thái"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmEdit()}
                data-testid="input-edit-status-name"
              />
            </div>
            {colorPicker(editColor, setEditColor, "edit")}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} data-testid="button-cancel-edit-status">
              Huỷ
            </Button>
            <Button
              onClick={handleConfirmEdit}
              disabled={!editName.trim() || editMutation.isPending}
              data-testid="button-confirm-edit-status"
            >
              {editMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
