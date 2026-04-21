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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { TaskLevel } from "@shared/schema";
import type { ConfigPerms } from "./TaskStatusConfig";

const PRESET_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f59e0b", "#84cc16",
];

function SortableLevelItem({
  level,
  onDelete,
  canDelete,
  canEdit,
}: {
  level: TaskLevel;
  onDelete: (id: string) => void;
  canDelete: boolean;
  canEdit: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: level.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`level-item-${level.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border bg-background"
    >
      <div
        {...(canEdit ? { ...attributes, ...listeners } : {})}
        className={`flex-shrink-0 ${canEdit ? "cursor-grab text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-default"}`}
        data-testid={`level-drag-${level.id}`}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div
        className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20 shadow-sm"
        style={{ backgroundColor: level.color }}
        data-testid={`level-color-${level.id}`}
      />

      <span className="flex-1 text-sm font-medium" data-testid={`level-name-${level.id}`}>
        {level.name}
      </span>

      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(level.id)}
          data-testid={`delete-level-${level.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

interface TaskLevelConfigProps {
  perms: ConfigPerms;
}

export function TaskLevelConfig({ perms }: TaskLevelConfigProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");

  const onlyMine = perms.canView && !perms.canViewAll && !perms.isSuperAdmin;

  const { data: levels = [], isLoading } = useQuery<TaskLevel[]>({
    queryKey: ["/api/task-levels", { mine: onlyMine }],
    queryFn: async () => {
      const url = onlyMine ? "/api/task-levels?mine=true" : "/api/task-levels";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      apiRequest("POST", "/api/task-levels", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-levels"] });
      setDialogOpen(false);
      setNewName("");
      setNewColor("#3b82f6");
      toast({ title: "Đã thêm mức độ mới" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/task-levels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-levels"] });
      toast({ title: "Đã xoá mức độ" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/task-levels/reorder", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-levels"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!perms.canEdit && !perms.isSuperAdmin) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = levels.findIndex((l) => l.id === active.id);
    const newIndex = levels.findIndex((l) => l.id === over.id);
    const reordered = arrayMove(levels, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map((l) => l.id));
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), color: newColor });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Mức độ công việc</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canEdit ? "Kéo thả để sắp xếp thứ tự ưu tiên" : "Danh sách mức độ công việc"}
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            data-testid="button-add-level"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm mới mức độ
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={levels.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {levels.map((level) => (
              <SortableLevelItem
                key={level.id}
                level={level}
                onDelete={(id) => deleteMutation.mutate(id)}
                canDelete={canDelete}
                canEdit={canEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {levels.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          {canCreate ? 'Chưa có mức độ nào. Nhấn "Thêm mới mức độ" để tạo.' : "Chưa có mức độ nào."}
        </div>
      )}

      {canCreate && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-sm" data-testid="dialog-add-level">
            <DialogHeader>
              <DialogTitle>Thêm mới mức độ</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="level-name">Tên mức độ</Label>
                <Input
                  id="level-name"
                  placeholder="Ví dụ: Khẩn cấp"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  data-testid="input-level-name"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Màu sắc</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        newColor === color
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewColor(color)}
                      data-testid={`level-color-option-${color.replace("#", "")}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div
                    className="w-7 h-7 rounded-full border flex-shrink-0"
                    style={{ backgroundColor: newColor }}
                  />
                  <Input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-8 w-20 p-1 cursor-pointer"
                    data-testid="input-level-color"
                  />
                  <span className="text-xs text-muted-foreground">{newColor}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-testid="button-cancel-level"
              >
                Huỷ
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                data-testid="button-confirm-add-level"
              >
                {createMutation.isPending ? "Đang thêm..." : "Thêm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
