import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableMultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function SearchableMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  disabled = false,
  className,
  "data-testid": testId,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const remove = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== val));
  };

  const selectedLabels = value.map((v) => options.find((o) => o.value === v)?.label).filter(Boolean);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={cn(
            "flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedLabels.map((label, i) => (
                <Badge
                  key={value[i]}
                  variant="secondary"
                  className="text-xs py-0 h-5 gap-0.5"
                >
                  {label}
                  <button
                    type="button"
                    data-testid={`remove-${value[i]}`}
                    onClick={(e) => remove(value[i], e)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 text-sm"
            data-testid="search-input"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Không tìm thấy</div>
          ) : (
            filtered.map((option) => {
              const selected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  data-testid={`option-${option.value}`}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    selected && "bg-accent/50"
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-sm border border-primary shrink-0",
                    selected ? "bg-primary text-primary-foreground" : "opacity-50"
                  )}>
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                  <span>{option.label}</span>
                  {option.sublabel && (
                    <span className="text-[11px] text-muted-foreground">({option.sublabel})</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
