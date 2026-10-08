import "./_group.css";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const skills = [
  { id: "reading", name: "Reading", raw: 15, rawMax: 30, converted: 75, convertedMax: 150, parts: [] },
  {
    id: "writing",
    name: "Writing",
    raw: 20,
    rawMax: 30,
    converted: 105,
    convertedMax: 150,
    parts: [{ name: "Part 1", score: 10, max: 15 }, { name: "Part 2", score: 10, max: 15 }],
  },
  { id: "listening", name: "Listening", raw: 20, rawMax: 25, converted: 120, convertedMax: 150, parts: [] },
  {
    id: "speaking",
    name: "Speaking",
    raw: 20,
    rawMax: 45,
    converted: 75,
    convertedMax: 150,
    parts: [
      { name: "Grammar and vocabulary", score: 6, max: 10 },
      { name: "Pronunciation", score: 5, max: 10 },
      { name: "Interactive Communication", score: 4, max: 10 },
      { name: "Global achievement", score: 5, max: 15 },
    ],
  },
];

const evaluations = [
  {
    title: "IELTS",
    entries: [
      { title: "Kết quả và năng lực tiếp thu", text: "Hiểu và vận dụng thành thạo kiến thức được dạy." },
      { title: "Kỷ luật và nội quy lớp học", text: "Tuân thủ nghiêm túc nội quy của trung tâm / lớp học." },
      { title: "Ý thức và thái độ học tập", text: "Tích cực phát biểu xây dựng bài, tham gia thảo luận nhóm." },
    ],
  },
];

const formatScore = (value: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);

export function StudentScoreSheetDialog() {
  return (
    <div className="min-h-screen bg-background">
      <Dialog open>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-[1600px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-5">
            <DialogTitle className="text-base">KET 1</DialogTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary" className="text-xs font-normal">COPY-802431 — IELTS 6.0.1</Badge>
              <Badge variant="outline" className="text-xs font-normal">KET 1</Badge>
              <Badge variant="secondary" className="text-xs font-normal">Bảng điểm quy đổi</Badge>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:flex-[0_0_60%] md:border-r">
              <div className="mb-3 space-y-2">
                <p className="text-xs text-muted-foreground">Lần 1/1 · Lần thi mới nhất</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    Điểm tổng quy đổi:{" "}
                    <span className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                      93,75
                    </span>
                  </span>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <Badge variant="outline" className="text-red-600">RỚT</Badge>
                    <Badge className="bg-red-600 hover:bg-red-600">Không đạt</Badge>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-lg border">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-[44%] px-2 py-2 font-semibold sm:px-3">Kỹ năng</th>
                      <th className="w-[28%] px-2 py-2 font-semibold sm:px-3">Số câu đúng</th>
                      <th className="w-[28%] px-2 py-2 font-semibold sm:px-3">Điểm quốc tế</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {skills.map((skill) => (
                      <tr key={skill.id} className="align-top">
                        <td className="break-words px-2 py-2.5 sm:px-3">
                          <p className="font-medium">{skill.name}</p>
                          <p className="text-xs text-muted-foreground">Tối đa {formatScore(skill.rawMax)}</p>
                          {skill.parts.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {skill.parts.map((part) => (
                                <li key={part.name}>{part.name}: {formatScore(part.score)} / {formatScore(part.max)}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-xs font-medium tabular-nums sm:px-3 sm:text-sm">
                          {formatScore(skill.raw)} / {formatScore(skill.rawMax)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-xs font-medium tabular-nums sm:px-3 sm:text-sm">
                          {formatScore(skill.converted)} / {formatScore(skill.convertedMax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Nhận xét / Đánh giá</h3>
              </div>
              <div className="space-y-4 rounded-lg border bg-background px-3 py-3">
                {evaluations.map((group) => (
                  <section key={group.title} className="space-y-1.5">
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    {group.entries.map((entry) => (
                      <div key={entry.title} className="space-y-0.5 pl-2">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
