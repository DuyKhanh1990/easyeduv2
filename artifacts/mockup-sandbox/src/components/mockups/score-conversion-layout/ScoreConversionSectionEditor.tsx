import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mapping = {
  id: string;
  rawFrom: number;
  rawTo: number;
  internalScore: number;
  convertedScore: number;
};

type Section = {
  id: string;
  name: string;
  rawMinScore: number;
  rawMaxScore: number;
  rawStep: number;
  mappings: Mapping[];
};

type Props = {
  sections: Section[];
  activeSectionId: string;
  onActiveSectionChange: (id: string) => void;
};

const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreConversionSectionEditor({
  sections,
  activeSectionId,
  onActiveSectionChange,
}: Props) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Các phần thi và thang điểm</h3>
          <p className="text-sm text-muted-foreground">
            Mẫu nạp sẵn tên phần và thang gợi ý; chọn từng tab để nhập khoảng điểm thô và điểm quy đổi của trung tâm.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm">
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
            <div className="rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`section-name-${section.id}`}>Tên phần thi</Label>
                  <Input id={`section-name-${section.id}`} value={section.name} readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-min-${section.id}`}>Điểm thô từ</Label>
                  <Input id={`raw-min-${section.id}`} type="number" value={section.rawMinScore} readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-max-${section.id}`}>Điểm thô đến</Label>
                  <Input id={`raw-max-${section.id}`} type="number" value={section.rawMaxScore} readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`raw-step-${section.id}`}>Bước điểm thô</Label>
                  <Input id={`raw-step-${section.id}`} type="number" value={section.rawStep} readOnly />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-medium">Bảng quy đổi {section.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Nhập điểm quy đổi tương ứng với từng khoảng điểm thô.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Xóa phần thi ${section.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm">Sao chép sang...</Button>
                  <Button type="button" variant="outline" size="sm">Tạo bảng quy đổi</Button>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm khoảng điểm
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Điểm thô từ</th>
                      <th className="px-3 py-2 font-medium">Điểm thô đến</th>
                      <th className="px-3 py-2 font-medium">Quy đổi nội bộ</th>
                      <th className="px-3 py-2 font-medium">Quy đổi Quốc tế</th>
                      <th className="w-12 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {section.mappings.map((mapping) => (
                      <tr key={mapping.id} className="border-b last:border-0">
                        <td className="px-3 py-2"><Input type="number" value={mapping.rawFrom} onChange={(event) => numericValue(event.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" value={mapping.rawTo} onChange={(event) => numericValue(event.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" value={mapping.internalScore} onChange={(event) => numericValue(event.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" value={mapping.convertedScore} onChange={(event) => numericValue(event.target.value)} /></td>
                        <td className="px-2 py-2">
                          <Button type="button" variant="ghost" size="icon" aria-label={`Xóa khoảng điểm ${mapping.rawFrom}–${mapping.rawTo}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
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