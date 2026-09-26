import { Plus, Trash2 } from "lucide-react";
import type { ScoreConversionTemplateInput } from "@shared/score-conversion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ScoreConversionSection = ScoreConversionTemplateInput["sections"][number];
type ScoreConversionMapping = ScoreConversionSection["mappings"][number];

type ScoreConversionSectionEditorProps = {
  sections: ScoreConversionSection[];
  activeSectionId: string;
  onActiveSectionChange: (sectionId: string) => void;
  onAddSection: () => void;
  onUpdateSection: (
    sectionId: string,
    update: Partial<ScoreConversionSection>,
  ) => void;
  onRemoveSection: (sectionId: string) => void;
  onOpenCopyMappings: (section: ScoreConversionSection) => void;
  onGenerateMappingTable: (section: ScoreConversionSection) => void;
  onAddMapping: (section: ScoreConversionSection) => void;
  onUpdateMapping: (
    sectionId: string,
    mappingId: string,
    update: Partial<ScoreConversionMapping>,
  ) => void;
  onRemoveMapping: (sectionId: string, mappingId: string) => void;
};

const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreConversionSectionEditor({
  sections,
  activeSectionId,
  onActiveSectionChange,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onOpenCopyMappings,
  onGenerateMappingTable,
  onAddMapping,
  onUpdateMapping,
  onRemoveMapping,
}: ScoreConversionSectionEditorProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Các phần thi và thang điểm</h3>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddSection}>
          <Plus className="mr-1 h-4 w-4" />
          Thêm phần thi
        </Button>
      </div>

      <Tabs
        value={activeSectionId || sections[0]?.id}
        onValueChange={onActiveSectionChange}
        className="space-y-4"
      >
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="shrink-0 whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {section.name || "Phần thi"}
            </TabsTrigger>
          ))}
        </TabsList>

        {sections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="space-y-4">
            <div className="rounded-lg border bg-white p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`section-name-${section.id}`}>Tên phần thi</Label>
                  <Input
                    id={`section-name-${section.id}`}
                    value={section.name}
                    onChange={(event) => onUpdateSection(section.id, { name: event.target.value })}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-min-${section.id}`}>Điểm thô từ</Label>
                  <Input
                    id={`raw-min-${section.id}`}
                    type="number"
                    step="any"
                    value={section.rawMinScore}
                    onChange={(event) => onUpdateSection(section.id, { rawMinScore: numericValue(event.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-max-${section.id}`}>Điểm thô đến</Label>
                  <Input
                    id={`raw-max-${section.id}`}
                    type="number"
                    step="any"
                    value={section.rawMaxScore}
                    onChange={(event) => onUpdateSection(section.id, { rawMaxScore: numericValue(event.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-step-${section.id}`}>Bước điểm thô</Label>
                  <Input
                    id={`raw-step-${section.id}`}
                    type="number"
                    min="0"
                    step="any"
                    value={section.rawStep}
                    onChange={(event) => onUpdateSection(section.id, { rawStep: numericValue(event.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-medium">Bảng quy đổi {section.name}</h4>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Xóa phần thi ${section.name}`}
                    disabled={sections.length <= 1}
                    onClick={() => onRemoveSection(section.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={section.mappings.length === 0 || sections.length < 2}
                    onClick={() => onOpenCopyMappings(section)}
                  >
                    Sao chép sang...
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onGenerateMappingTable(section)}
                  >
                    Tạo bảng quy đổi
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAddMapping(section)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm khoảng điểm
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] table-fixed text-left text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="w-[18%] px-2 py-2 font-medium">Điểm thô từ</th>
                      <th className="w-[18%] px-2 py-2 font-medium">Điểm thô đến</th>
                      <th className="w-[25%] px-2 py-2 font-medium">Quy đổi nội bộ</th>
                      <th className="w-[25%] px-2 py-2 font-medium">Quy đổi Quốc tế</th>
                      <th className="w-10 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {section.mappings.length ? section.mappings.map((mapping) => (
                      <tr key={mapping.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 px-2"
                            aria-label={`Điểm thô từ ${section.name}`}
                            type="number"
                            step="any"
                            value={mapping.rawFrom}
                            onChange={(event) => onUpdateMapping(section.id, mapping.id, {
                              rawFrom: numericValue(event.target.value),
                            })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 px-2"
                            aria-label={`Điểm thô đến ${section.name}`}
                            type="number"
                            step="any"
                            value={mapping.rawTo}
                            onChange={(event) => onUpdateMapping(section.id, mapping.id, {
                              rawTo: numericValue(event.target.value),
                            })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 px-2"
                            aria-label={`Điểm quy đổi nội bộ ${section.name}`}
                            type="number"
                            step="any"
                            value={mapping.internalScore}
                            onChange={(event) => onUpdateMapping(section.id, mapping.id, {
                              internalScore: numericValue(event.target.value),
                            })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 px-2"
                            aria-label={`Điểm quy đổi quốc tế ${section.name}`}
                            type="number"
                            step="any"
                            value={mapping.convertedScore}
                            onChange={(event) => onUpdateMapping(section.id, mapping.id, {
                              convertedScore: numericValue(event.target.value),
                            })}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Xóa khoảng điểm ${mapping.rawFrom}–${mapping.rawTo}`}
                            onClick={() => onRemoveMapping(section.id, mapping.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          Chưa có khoảng quy đổi. Thêm các khoảng điểm thô và điểm tương ứng.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}