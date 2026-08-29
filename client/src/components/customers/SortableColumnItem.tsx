import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  fixed?: "left" | "right";
}

interface SortableColumnItemProps {
  column: ColumnConfig;
  onToggle: (id: string) => void;
}

export function SortableColumnItem({ column, onToggle }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, disabled: !!column.fixed });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto" as any,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 bg-popover hover:bg-accent rounded-md group mb-1 border border-transparent",
        isDragging && "border-primary/50 shadow-md",
        column.fixed && "opacity-60 cursor-not-allowed"
      )}
    >
      {!column.fixed ? (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      ) : (
        <div className="w-4 h-4" />
      )}

      <span className="flex-1 text-sm font-medium">{column.label}</span>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => onToggle(column.id)}
      >
        {column.visible ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4 text-destructive" />
        )}
      </Button>
    </div>
  );
}
