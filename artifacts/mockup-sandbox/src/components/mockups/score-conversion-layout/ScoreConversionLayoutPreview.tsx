import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreConversionSectionEditor } from "./ScoreConversionSectionEditor";

type Layout = "current" | "requested";

const sections = [
  {
    id: "listening",
    name: "Listening",
    rawMinScore: 0,
    rawMaxScore: 40,
    rawStep: 1,
    mappings: [
      { id: "l1", rawFrom: 0, rawTo: 10, internalScore: 2, convertedScore: 2.5 },
      { id: "l2", rawFrom: 11, rawTo: 20, internalScore: 4, convertedScore: 4.5 },
      { id: "l3", rawFrom: 21, rawTo: 30, internalScore: 6, convertedScore: 6.5 },
    ],
  },
  {
    id: "reading",
    name: "Reading",
    rawMinScore: 0,
    rawMaxScore: 40,
    rawStep: 1,
    mappings: [
      { id: "r1", rawFrom: 0, rawTo: 10, internalScore: 2, convertedScore: 2.5 },
      { id: "r2", rawFrom: 11, rawTo: 20, internalScore: 4, convertedScore: 4.5 },
      { id: "r3", rawFrom: 21, rawTo: 30, internalScore: 6, convertedScore: 6.5 },
    ],
  },
];

function OverallRuleCard() {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Cách tính điểm tổng</h3>
        <p className="text-sm text-muted-foreground">
          Sau khi quy đổi từng phần thi, hệ thống sẽ áp dụng công thức này.
        </p>
      </div>
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="overall-method">Công thức chung</Label>
        <Select defaultValue="average">
          <SelectTrigger id="overall-method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="average">Trung bình các phần thi</SelectItem>
            <SelectItem value="sum">Cộng điểm các phần thi</SelectItem>
            <SelectItem value="custom">Tùy chỉnh công thức</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

function GradeBandsCard() {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Ngưỡng xếp loại (không bắt buộc)</h3>
          <p className="text-sm text-muted-foreground">Ví dụ: A2 từ 120 đến 139 điểm.</p>
        </div>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Thêm ngưỡng
        </Button>
      </div>
      <div className="space-y-3">
        {[
          { id: "a2", label: "A2", min: 120, max: 139 },
          { id: "b1", label: "B1", min: 140, max: 159 },
        ].map((band) => (
          <div
            key={band.id}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-md border p-2"
          >
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`grade-band-label-${band.id}`}>Tên xếp loại</Label>
              <Input id={`grade-band-label-${band.id}`} value={band.label} readOnly />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`grade-band-min-${band.id}`}>Điểm từ</Label>
              <Input id={`grade-band-min-${band.id}`} type="number" value={band.min} readOnly />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`grade-band-max-${band.id}`}>Đến</Label>
              <Input id={`grade-band-max-${band.id}`} type="number" value={band.max} readOnly />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Xóa ngưỡng ${band.label}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScoreConversionLayoutPreview({ layout }: { layout: Layout }) {
  const [activeSectionId, setActiveSectionId] = useState("listening");
  const sectionEditor = (
    <ScoreConversionSectionEditor
      sections={sections}
      activeSectionId={activeSectionId}
      onActiveSectionChange={setActiveSectionId}
    />
  );
  const settings = layout === "current" ? (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
      <OverallRuleCard />
      <GradeBandsCard />
    </div>
  ) : (
    <aside className="min-w-0 space-y-4">
      <OverallRuleCard />
      <GradeBandsCard />
    </aside>
  );

  return (
    <main className="min-h-screen bg-muted/50 p-4 text-sm">
      <div className="mx-auto min-h-[860px] w-full rounded-xl border bg-background p-5 shadow-lg">
        <header className="mb-5">
          <h1 className="text-lg font-semibold">Thêm bảng điểm quy đổi</h1>
          <p className="text-sm text-muted-foreground">
            Tạo bảng quy đổi dùng chung cho loại bài kiểm tra; bảng này chưa gắn với một bài kiểm tra cụ thể.
          </p>
        </header>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Loại bài kiểm tra</Label>
            <Input value="IELTS" readOnly />
          </div>
          <div className="space-y-2">
            <Label>Tên loại tùy chỉnh</Label>
            <Input value="Bài kiểm tra tổng hợp" readOnly />
          </div>
        </div>
        {layout === "current" ? (
          <>
            {settings}
            <div className="mt-6">{sectionEditor}</div>
          </>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
            <div className="min-w-0">{sectionEditor}</div>
            {settings}
          </div>
        )}
        <footer className="mt-6 flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline">Hủy</Button>
          <Button type="button">Lưu bảng quy đổi</Button>
        </footer>
      </div>
    </main>
  );
}