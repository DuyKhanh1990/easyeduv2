import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check } from "lucide-react";

interface Option {
  id: string;
  name?: string;
  fullName?: string;
  reason?: string;
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

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-9 justify-between bg-white opacity-100 text-xs"
          >
            <span className="truncate">
              {selected.length > 0 ? `Đã chọn ${selected.length}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm kiếm..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
              <CommandGroup>
                {options?.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name || option.fullName || option.reason || ""}
                    onSelect={() => {
                      if (selected.includes(option.id)) {
                        onRemove(option.id);
                      } else {
                        onSelect(option.id);
                      }
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(option.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.name || option.fullName || option.reason}
                  </CommandItem>
                ))}
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
