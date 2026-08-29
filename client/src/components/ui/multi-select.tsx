import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronsUpDown, Search, X, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const EMPTY_DEFAULT_VALUE: string[] = [];

const multiSelectVariants = cva(
  "m-1 transition-all duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] hover:bg-muted-foreground/20",
  {
    variants: {
      variant: {
        default:
          "border-foreground/10 text-foreground bg-card hover:bg-card/80",
        secondary:
          "border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        inverted: "inverted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface MultiSelectProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof multiSelectVariants> {
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
    color?: string;
    isActive?: boolean;
  }[];
  onValueChange: (value: string[]) => void;
  defaultValue?: string[];
  placeholder?: string;
  animation?: number;
  maxCount?: number;
  modalPopover?: boolean;
  asChild?: boolean;
  className?: string;
}

export const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      options,
      onValueChange,
      variant,
      defaultValue = EMPTY_DEFAULT_VALUE,
      placeholder = "Select options",
      animation = 0,
      maxCount = 3,
      modalPopover = false,
      asChild = false,
      className,
      ...props
    },
    ref
  ) => {
    const [selectedValues, setSelectedValues] =
      React.useState<string[]>(defaultValue);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    // Sync internal state when defaultValue changes (e.g. form.reset() after mount)
    const prevDefaultRef = React.useRef(defaultValue);
    React.useEffect(() => {
      const prev = prevDefaultRef.current;
      const same =
        prev.length === defaultValue.length &&
        prev.every((v, i) => v === defaultValue[i]);
      if (!same) {
        prevDefaultRef.current = defaultValue;
        setSelectedValues(defaultValue);
      }
    }, [defaultValue]);

    const filteredOptions = React.useMemo(() => {
      const filtered = !search.trim()
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
      return [...filtered].sort((a, b) => {
        const aActive = a.isActive !== false;
        const bActive = b.isActive !== false;
        if (aActive === bActive) return 0;
        return aActive ? -1 : 1;
      });
    }, [options, search]);

    const toggleOption = (value: string) => {
      const opt = options.find(o => o.value === value);
      if (opt && opt.isActive === false) return;
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      setSelectedValues(next);
      onValueChange(next);
    };

    const handleClear = () => {
      setSelectedValues([]);
      onValueChange([]);
    };

    const clearExtraOptions = () => {
      const next = selectedValues.slice(0, maxCount);
      setSelectedValues(next);
      onValueChange(next);
    };

    const handleOpenChange = (open: boolean) => {
      setIsPopoverOpen(open);
      if (!open) setSearch("");
    };

    return (
      <Popover open={isPopoverOpen} onOpenChange={handleOpenChange} modal={modalPopover}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            {...props}
            className={cn(
              "flex w-full p-2 rounded-md border min-h-11 h-auto items-center justify-between bg-white hover:bg-white text-sm shadow-sm transition-colors",
              className
            )}
          >
            {selectedValues.length > 0 ? (
              <div className="flex justify-between items-center w-full">
                <div className="flex flex-wrap items-center">
                  {selectedValues.slice(0, maxCount).map((value) => {
                    const option = options.find((o) => o.value === value);
                    const IconComponent = option?.icon;
                    return (
                      <Badge
                        key={value}
                        className={cn(multiSelectVariants({ variant }))}
                      >
                        {IconComponent && (
                          <IconComponent className="h-4 w-4 mr-2" />
                        )}
                        {option?.label}
                        <X
                          className="ml-2 h-4 w-4 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOption(value);
                          }}
                        />
                      </Badge>
                    );
                  })}
                  {selectedValues.length > maxCount && (
                    <Badge
                      className={cn(
                        "bg-transparent text-foreground border-foreground/1 hover:bg-transparent",
                        multiSelectVariants({ variant })
                      )}
                    >
                      {`+ ${selectedValues.length - maxCount} more`}
                      <X
                        className="ml-2 h-4 w-4 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearExtraOptions();
                        }}
                      />
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <X
                    className="h-4 mx-2 cursor-pointer text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear();
                    }}
                  />
                  <Separator orientation="vertical" className="flex min-h-6 h-full" />
                  <ChevronsUpDown className="h-4 mx-2 cursor-pointer text-muted-foreground" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full mx-auto">
                <span className="text-sm text-muted-foreground mx-3">
                  {placeholder}
                </span>
                <ChevronsUpDown className="h-4 mx-2 cursor-pointer text-muted-foreground" />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 shadow-xl border border-border bg-white z-[9999]"
          align="start"
        >
          <div className="flex flex-col">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul className="max-h-[300px] overflow-y-auto overflow-x-hidden py-1">
              {filteredOptions.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </li>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  const isInactive = option.isActive === false;
                  return (
                    <li
                      key={option.value}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !isInactive && toggleOption(option.value)}
                      className={cn(
                        "relative flex select-none items-center rounded-sm px-2 py-1.5 mx-1 text-sm outline-none",
                        isInactive
                          ? "opacity-40 cursor-not-allowed bg-muted/20"
                          : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                          isSelected && !isInactive
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50"
                        )}
                      >
                        {isSelected && !isInactive && <Check className="h-3 w-3" />}
                      </div>
                      {option.icon && (
                        <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="flex-1">{option.label}</span>
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
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t flex items-center">
              {selectedValues.length > 0 && (
                <>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleClear}
                    className="flex-1 py-2 text-sm text-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleOpenChange(false)}
                className="flex-1 py-2 text-sm text-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

MultiSelect.displayName = "MultiSelect";
