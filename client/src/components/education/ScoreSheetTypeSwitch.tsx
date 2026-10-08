import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";

export type ScoreSheetDialogMode = "regular" | "conversion";

interface ScoreSheetTypeSwitchProps {
  value: ScoreSheetDialogMode;
  onValueChange: (value: ScoreSheetDialogMode) => void;
  className?: string;
}

export function ScoreSheetTypeSwitch({
  value,
  onValueChange,
  className,
}: ScoreSheetTypeSwitchProps) {
  const { t } = useLanguage();

  return (
    <div className={className}>
      <Tabs
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue === "regular" || nextValue === "conversion") {
            onValueChange(nextValue);
          }
        }}
      >
        <TabsList
          aria-label={t("mySpace.scoreSheet.typeLabel")}
          className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/60 p-1"
        >
          <TabsTrigger
            value="regular"
            className="min-h-9 whitespace-normal px-3 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm"
          >
            {t("mySpace.scoreSheet.regularSheet")}
          </TabsTrigger>
          <TabsTrigger
            value="conversion"
            className="min-h-9 whitespace-normal px-3 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm"
          >
            {t("mySpace.scoreSheet.conversionSheet")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
