import { Eye, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type GradeBand = {
  label: string;
  color: string;
};

type PreviewBook = {
  id: string;
  kind: "regular" | "conversion";
  title: string;
  classCode: string;
  className: string;
  sessionIndex: number | null;
  scoreSheetName: string | null;
  score: string | null;
  gradeBand?: GradeBand;
  passStatus?: "passed" | "failed";
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  hasComment?: boolean;
};

type LayoutMode = "current" | "aligned";

const books: PreviewBook[] = [
  {
    id: "ielts",
    kind: "conversion",
    title: "IELTS",
    classCode: "Test ca học",
    className: "Test ca học",
    sessionIndex: 11,
    scoreSheetName: "IELTS",
    score: "7,5",
    gradeBand: { label: "Giỏi", color: "#15803D" },
    passStatus: "passed",
    createdByName: "—",
    createdAt: "23/10/2026",
    updatedAt: "06/10/2026",
    hasComment: true,
  },
  {
    id: "ket",
    kind: "conversion",
    title: "KET 1",
    classCode: "COPY-802431",
    className: "IELTS 6.0.1",
    sessionIndex: 8,
    scoreSheetName: "KET 1",
    score: "93,75",
    gradeBand: { label: "Rớt", color: "#6B7280" },
    passStatus: "failed",
    createdByName: "—",
    createdAt: "30/09/2026",
    updatedAt: "30/09/2026",
  },
  {
    id: "regular",
    kind: "regular",
    title: "Bảng điểm cuối khóa",
    classCode: "V9",
    className: "Văn 9",
    sessionIndex: null,
    scoreSheetName: "Bảng điểm cuối khóa",
    score: "8,5",
    createdByName: "Giám khảo",
    createdAt: "04/08/2026",
    updatedAt: "04/08/2026",
  },
];

function ScoreCard({
  book,
  layout,
}: {
  book: PreviewBook;
  layout: LayoutMode;
}) {
  const templateCell = (
    <div className="flex min-w-0 items-center">
      {book.scoreSheetName ? (
        <Badge variant="outline" className="max-w-full truncate text-[11px]">
          {book.scoreSheetName}
        </Badge>
      ) : null}
    </div>
  );

  const scoreCell = (
    <div className="flex min-w-0 items-center gap-1.5">
      {(layout === "current" || book.score) && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
          Điểm
        </span>
      )}
      {book.score && (
        <span className="text-sm font-bold text-violet-700 dark:text-violet-400">
          {book.score}
        </span>
      )}
      {book.hasComment && (
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      {layout === "current" && !book.score && (
        <span className="text-xs text-muted-foreground">Chưa có điểm</span>
      )}
    </div>
  );

  const classificationCell = (
    <div className="flex min-w-0 items-center gap-1.5">
      {book.gradeBand && (
        <>
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Phân loại
          </span>
          <span
            className="inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              color: book.gradeBand.color,
              backgroundColor: `${book.gradeBand.color}1A`,
            }}
          >
            {book.gradeBand.label}
          </span>
        </>
      )}
    </div>
  );

  const statusCell = (
    <div className="flex min-w-0 items-center gap-1.5">
      {book.passStatus && (
        <>
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Trạng thái
          </span>
          <span
            className="inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              color: book.passStatus === "passed" ? "#15803D" : "#DC2626",
              backgroundColor: book.passStatus === "passed" ? "#15803D1A" : "#DC26261A",
            }}
          >
            {book.passStatus === "passed" ? "Đạt" : "Không đạt"}
          </span>
        </>
      )}
    </div>
  );

  return (
    <article className="rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm dark:border-border dark:bg-card sm:px-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-gray-800 dark:text-foreground">
            {book.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-muted-foreground">
            <span>{book.classCode}</span>
            {book.className !== book.classCode && <span> — {book.className}</span>}
            {book.sessionIndex != null && <span> · Buổi {book.sessionIndex}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {book.kind === "conversion" && (
            <Badge className="rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
              Bảng điểm quy đổi
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-gray-500">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 pt-2 dark:border-border">
        {layout === "aligned" ? (
          <div className="grid grid-cols-2 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(8rem,1.15fr)_minmax(6rem,0.85fr)_minmax(7rem,1fr)_minmax(7rem,1fr)]">
            {templateCell}
            {scoreCell}
            {classificationCell}
            {statusCell}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {templateCell}
            {scoreCell}
            {book.gradeBand && classificationCell}
            {book.passStatus && statusCell}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${layout === "current" ? "justify-between" : "justify-start"}`}>
          <p className="min-w-0 truncate text-gray-500 dark:text-muted-foreground">
            Tạo: {book.createdByName ?? "—"} · {book.createdAt}
          </p>
          <p className="shrink-0 text-gray-500 dark:text-muted-foreground/70">
            Cập nhật: {book.updatedAt}
          </p>
        </div>
      </div>
    </article>
  );
}

export function StudentScoreCards({ layout }: { layout: LayoutMode }) {
  return (
    <main className="min-h-screen bg-gray-100 p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-violet-700">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          Thứ Sáu, 23/10/2026
        </div>
        {books.map((book) => (
          <ScoreCard key={book.id} book={book} layout={layout} />
        ))}
      </div>
    </main>
  );
}
