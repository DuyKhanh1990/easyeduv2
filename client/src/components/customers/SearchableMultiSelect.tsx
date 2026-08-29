import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check, AlertCircle } from "lucide-react";

interface Option {
  id: string;
  name?: string;
  fullName?: string;
  reason?: string;
  isActive?: boolean;
}

interface SearchableMultiSelectProps {
  options: Option[];
  selected: string[];
  onSelect: (val: string) => void;
  onRemove: (val: string) => void;
  placeholder: string;
}

export function SearchableMultiSelect({
  options,
  selected,
  onSelect,
  onRemove,
  placeholder,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const sortedOptions = [...(options || [])].sort((a, b) => {
    const aActive = a.isActive !== false;
    const bActive = b.isActive !== false;
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex h-9 w-full cursor-pointer items-center justify-between whitespace-nowrap rounded-md border border-input bg-white px-3 py-2 text-xs shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {selected.length > 0 ? `Đã chọn ${selected.length}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm kiếm..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
              <CommandGroup>
                {sortedOptions.map((option) => {
                  const isInactive = option.isActive === false;
                  const label = option.name || option.fullName || option.reason || "";
                  return (
                    <CommandItem
                      key={option.id}
                      value={label}
                      disabled={isInactive}
                      onSelect={() => {
                        if (isInactive) return;
                        if (selected.includes(option.id)) {
                          onRemove(option.id);
                        } else {
                          onSelect(option.id);
                        }
                      }}
                      className={cn(isInactive && "opacity-40 cursor-not-allowed")}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected.includes(option.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1">{label}</span>
                      {isInactive && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 ml-1 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>Không hoạt động</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const option = options?.find((o) => o.id === id);
            return option ? (
              <div
                key={id}
                className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1"
              >
                {option.name || option.fullName || option.reason}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="hover:text-destructive text-xs"
                >
                  ×
                </button>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
