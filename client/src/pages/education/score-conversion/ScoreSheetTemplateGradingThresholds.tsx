import { Plus, Trash2 } from "lucide-react";
import type { ScoreSheetTemplateInput } from "@shared/score-sheet-template";
import { SCORE_CONVERSION_DEFAULT_GRADE_BAND_COLOR } from "@shared/score-conversion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GradeBand = NonNullable<ScoreSheetTemplateInput["gradeBands"]>[number];
type PassThreshold = NonNullable<ScoreSheetTemplateInput["passThreshold"]>;

type ScoreSheetTemplateGradingThresholdsProps = {
  gradeBands: GradeBand[];
  passThreshold: PassThreshold;
  usesConvertedScore: boolean;
  onGradeBandsChange: (gradeBands: GradeBand[]) => void;
  onPassThresholdChange: (passThreshold: PassThreshold) => void;
};

const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreSheetTemplateGradingThresholds({
  gradeBands,
  passThreshold,
  usesConvertedScore,
  onGradeBandsChange,
  onPassThresholdChange,
}: ScoreSheetTemplateGradingThresholdsProps) {
  const updateGradeBand = (bandId: string, update: Partial<GradeBand>) => {
    onGradeBandsChange(gradeBands.map((band) =>
      band.id === bandId ? { ...band, ...update } : band));
  };

  const updatePassThreshold = (update: Partial<PassThreshold>) => {
    onPassThresholdChange({ ...passThreshold, ...update });
  };

  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Ngưỡng xếp loại (không bắt buộc)</h3>
          <p className="text-sm text-muted-foreground">
            {usesConvertedScore
              ? "Ngưỡng áp dụng cho điểm Tổng đã quy đổi của bảng điểm mẫu này."
              : "Không liên kết bảng quy đổi: ngưỡng áp dụng cho điểm Tổng thô của mẫu này."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={gradeBands.length >= 20}
          onClick={() => onGradeBandsChange([
            ...gradeBands,
            {
              id: crypto.randomUUID(),
              label: "Ngưỡng mới",
              color: SCORE_CONVERSION_DEFAULT_GRADE_BAND_COLOR,
              minScore: 0,
              maxScore: 0,
            },
          ])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Thêm ngưỡng
        </Button>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Ngưỡng Đạt</h4>
            <p className="text-xs text-muted-foreground">
              Điểm từ mốc “Từ” trở lên được xếp Đạt; điểm cao hơn “Đến” vẫn là Đạt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="score-sheet-template-pass-threshold-enabled"
              checked={passThreshold.enabled}
              onCheckedChange={(checked) => updatePassThreshold({ enabled: checked === true })}
            />
            <Label
              htmlFor="score-sheet-template-pass-threshold-enabled"
              className="cursor-pointer text-sm"
            >
              Phân loại Đạt/Không đạt
            </Label>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="score-sheet-template-pass-threshold-min">Đạt: Từ</Label>
            <Input
              id="score-sheet-template-pass-threshold-min"
              type="number"
              step="any"
              value={passThreshold.minScore}
              disabled={!passThreshold.enabled}
              onChange={(event) => updatePassThreshold({ minScore: numericValue(event.target.value) })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="score-sheet-template-pass-threshold-max">Đến</Label>
            <Input
              id="score-sheet-template-pass-threshold-max"
              type="number"
              step="any"
              value={passThreshold.maxScore}
              disabled={!passThreshold.enabled}
              onChange={(event) => updatePassThreshold({ maxScore: numericValue(event.target.value) })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="score-sheet-template-pass-threshold-source">Mốc so sánh</Label>
            <Select
              value={passThreshold.scoreSource}
              onValueChange={(value) => updatePassThreshold({
                scoreSource: value === "overallRawScore" ? "overallRawScore" : "overallConvertedScore",
              })}
              disabled={!passThreshold.enabled}
            >
              <SelectTrigger id="score-sheet-template-pass-threshold-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overallRawScore">Điểm Tổng</SelectItem>
                <SelectItem value="overallConvertedScore">Điểm đã quy đổi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {!passThreshold.enabled && (
          <p className="mt-2 text-xs text-muted-foreground">
            Bật phân loại để áp dụng ngưỡng này cho kết quả học viên.
          </p>
        )}
      </div>

      {gradeBands.length > 0 ? (
        <div className="space-y-3">
          {gradeBands.map((band, index) => (
            <div
              key={band.id}
              className="grid min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-md border p-2"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`score-sheet-grade-band-label-${band.id}`}>Tên xếp loại</Label>
                  <Label
                    htmlFor={`score-sheet-grade-band-color-${band.id}`}
                    className="cursor-pointer text-xs text-muted-foreground"
                  >
                    Màu chữ
                  </Label>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    id={`score-sheet-grade-band-label-${band.id}`}
                    value={band.label}
                    onChange={(event) => updateGradeBand(band.id, { label: event.target.value })}
                    placeholder="Ví dụ: A2"
                    maxLength={80}
                    className="min-w-0 flex-1"
                    style={{ color: band.color }}
                  />
                  <Input
                    id={`score-sheet-grade-band-color-${band.id}`}
                    type="color"
                    value={band.color}
                    onChange={(event) => updateGradeBand(band.id, { color: event.target.value })}
                    aria-label={`Màu chữ xếp loại ${band.label || index + 1}`}
                    title="Chọn màu hiển thị cho tên xếp loại"
                    className="h-9 w-10 shrink-0 cursor-pointer p-1"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`score-sheet-grade-band-min-${band.id}`}>Điểm từ</Label>
                <Input
                  id={`score-sheet-grade-band-min-${band.id}`}
                  type="number"
                  step="any"
                  value={band.minScore}
                  onChange={(event) => updateGradeBand(band.id, { minScore: numericValue(event.target.value) })}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`score-sheet-grade-band-max-${band.id}`}>Đến</Label>
                <Input
                  id={`score-sheet-grade-band-max-${band.id}`}
                  type="number"
                  step="any"
                  value={band.maxScore}
                  onChange={(event) => updateGradeBand(band.id, { maxScore: numericValue(event.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Xóa ngưỡng xếp loại ${band.label || index + 1}`}
                onClick={() => onGradeBandsChange(gradeBands.filter((item) => item.id !== band.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Chưa có ngưỡng xếp loại.</p>
      )}
    </section>
  );
}
