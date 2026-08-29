import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  BookOpenCheck, Headphones, Mic, PenLine,
  FileText, ExternalLink, ChevronRight, X, Volume2,
  Music, Video, Play, Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exam, ExamSection, Question } from "@shared/schema";

type SectionQuestionRow = {
  id: string;
  sectionId: string;
  questionId: string;
  orderIndex: number;
  question: Question;
};

type SectionWithQuestions = ExamSection & {
  questions: SectionQuestionRow[];
};

type ExamWithUsers = Exam & { createdByName: string | null; updatedByName: string | null };

const SECTION_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  listening: { label: "Nghe", icon: Headphones, color: "text-blue-600" },
  speaking:  { label: "Nói",  icon: Mic,         color: "text-green-600" },
  reading:   { label: "Đọc",  icon: BookOpenCheck, color: "text-orange-600" },
  writing:   { label: "Viết", icon: PenLine,      color: "text-purple-600" },
};

const TYPE_LABEL_MAP: Record<string, string> = {
  single_choice:   "Trắc nghiệm",
  multiple_choice: "Nhiều lựa chọn",
  fill_blank:      "Điền chỗ trống",
  essay:           "Tự luận",
  matching:        "Câu hỏi nối",
};

function isVideoFile(name: string) {
  return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(name);
}

function renderFillBlankContent(content: string) {
  const parts = content.split(/(\{\d+\})/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (/^\{\d+\}$/.test(part)) {
          return (
            <span key={i} className="inline-block min-w-[60px] border-b-2 border-foreground/40 mx-1 text-center text-muted-foreground text-xs align-bottom pb-0.5">
              &nbsp;&nbsp;&nbsp;&nbsp;
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function AudioBar({ url, name }: { url: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-800 text-white shrink-0">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
        data-testid="btn-audio-play-pause"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex items-center gap-1 text-xs text-white/70 shrink-0">
        <Music className="w-3.5 h-3.5" />
        <span className="max-w-[140px] truncate">{name}</span>
      </div>

      <span className="text-xs text-white/60 shrink-0">{formatTime(currentTime)}</span>

      <input
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={e => {
          const t = Number(e.target.value);
          setCurrentTime(t);
          if (audioRef.current) audioRef.current.currentTime = t;
        }}
        className="flex-1 h-1 accent-emerald-400 cursor-pointer"
        data-testid="audio-scrubber"
      />

      <span className="text-xs text-white/60 shrink-0">{formatTime(duration)}</span>

      <div className="flex items-center gap-1.5 shrink-0">
        <Volume2 className="w-3.5 h-3.5 text-white/70" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={e => {
            const v = Number(e.target.value);
            setVolume(v);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          className="w-20 h-1 accent-emerald-400 cursor-pointer"
          data-testid="audio-volume"
        />
      </div>
    </div>
  );
}

interface Props {
  exam: ExamWithUsers;
  open: boolean;
  onClose: () => void;
}

export function ExamPreviewDialog({ exam, open, onClose }: Props) {
  const [activePartIdx, setActivePartIdx] = useState(0);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: sections = [], isLoading } = useQuery<SectionWithQuestions[]>({
    queryKey: ["/api/exams", exam.id, "preview"],
    enabled: open,
  });

  useEffect(() => {
    if (open) setActivePartIdx(0);
  }, [open]);

  if (!open) return null;

  const activePart = sections[activePartIdx] ?? null;
  const passageUrl = activePart?.readingPassageUrl || null;
  const passageName = activePart?.readingPassageName || null;
  const audioUrl = activePart?.sessionAudioUrl || null;
  const audioName = activePart?.sessionAudioName || null;

  const hasVisualFile = !!(passageUrl);
  const hasAudio = !!(audioUrl);
  const isVideo = hasVisualFile && isVideoFile(passageName || passageUrl || "");
  const isPdf = hasVisualFile && /\.pdf$/i.test(passageName || passageUrl || "");

  let globalQuestionIndex = 0;
  const sectionStartIndexes: number[] = [];
  sections.forEach(s => {
    sectionStartIndexes.push(globalQuestionIndex);
    globalQuestionIndex += s.questions.length;
  });
  const activeStartIndex = sectionStartIndexes[activePartIdx] ?? 0;

  function scrollToQuestion(qId: string) {
    questionRefs.current[qId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const QuestionsPanel = () => (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {!activePart || activePart.questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">Chưa có câu hỏi nào trong session này.</p>
        </div>
      ) : (
        activePart.questions.map((sq, idx) => (
          <div
            key={sq.id}
            ref={el => { questionRefs.current[sq.id] = el; }}
            className="bg-background border rounded-lg p-4 scroll-mt-4"
            data-testid={`preview-question-${activePartIdx}-${idx}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-semibold">
                Câu {activeStartIndex + idx + 1}
                {sq.question.title ? `: ${sq.question.title}` : ""}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold">{sq.question.score}đ</span>
                <span className="text-[11px] px-2 py-0.5 rounded border bg-muted text-muted-foreground">
                  {TYPE_LABEL_MAP[sq.question.type] ?? sq.question.type}
                </span>
              </div>
            </div>
            <div className="text-sm text-foreground leading-relaxed">
              {sq.question.type === "fill_blank"
                ? renderFillBlankContent(sq.question.content)
                : sq.question.content}
            </div>
            {(sq.question.type === "single_choice" || sq.question.type === "multiple_choice") &&
              Array.isArray(sq.question.options) && (sq.question.options as any[]).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {(sq.question.options as any[]).map((opt: any, oi: number) => (
                  <div key={opt.id ?? oi} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="font-medium shrink-0">{opt.id}.</span>
                    <span>{opt.text}</span>
                  </div>
                ))}
              </div>
            )}
            {sq.question.type === "matching" &&
              Array.isArray(sq.question.options) && (sq.question.options as any[]).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {(sq.question.options as any[]).map((pair: any, oi: number) => (
                  <div key={pair.id ?? oi} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-1 rounded border bg-muted/20 flex-1">{pair.left?.text || "—"}</span>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <span className="px-2 py-1 rounded border bg-blue-50/50 flex-1">{pair.right?.text || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="exam-preview-fullscreen">
      {/* Top header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-base font-bold truncate">{exam.name}</h2>
          <Badge variant={exam.status === "published" ? "default" : "secondary"} className="text-xs shrink-0">
            {exam.status === "published" ? "Công bố" : "Nháp"}
          </Badge>
          {exam.timeLimitMinutes && (
            <span className="text-xs text-muted-foreground shrink-0">⏱ {exam.timeLimitMinutes} phút</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
          data-testid="btn-close-preview"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Audio player bar (if audio file attached) */}
      {hasAudio && audioUrl && audioName && (
        <AudioBar url={audioUrl} name={audioName} />
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Đang tải...
          </div>
        ) : sections.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Bài kiểm tra chưa có session nào.
          </div>
        ) : hasVisualFile ? (
          /* SPLIT SCREEN: left = passage, right = questions */
          <>
            <div className="w-1/2 border-r flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/20 shrink-0">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-0.5">
                  PART {activePartIdx + 1}
                </div>
                <div className="text-lg font-bold uppercase">{activePart?.name}</div>
                {activePart && activePart.questions.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Câu {activeStartIndex + 1}–{activeStartIndex + activePart.questions.length}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {isVideo ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">{passageName}</span>
                      <a href={passageUrl!} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-auto">
                        <ExternalLink className="w-3 h-3" />Mở tab mới
                      </a>
                    </div>
                    <video
                      src={passageUrl!}
                      controls
                      className="w-full rounded border bg-black"
                    />
                  </div>
                ) : isPdf ? (
                  <div className="h-full min-h-[400px] flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium">{passageName}</span>
                      <a href={passageUrl!} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-auto">
                        <ExternalLink className="w-3 h-3" />Mở tab mới
                      </a>
                    </div>
                    <iframe src={passageUrl!} className="flex-1 w-full border rounded min-h-[500px]" title="PDF" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
                    <FileText className="w-12 h-12 text-orange-400" />
                    <div className="text-center">
                      <p className="font-semibold">{passageName}</p>
                      <p className="text-xs text-muted-foreground mt-1">File Word — không thể xem trực tiếp trong trình duyệt</p>
                    </div>
                    <a href={passageUrl!} download
                      className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-md text-sm font-medium transition-colors">
                      <ExternalLink className="w-4 h-4" />Tải xuống để đọc
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="w-1/2 flex flex-col overflow-hidden bg-muted/10">
              <div className="px-5 py-3 border-b bg-muted/20 shrink-0">
                <p className="text-sm font-semibold">Câu hỏi</p>
                {activePart && (
                  <p className="text-xs text-muted-foreground mt-0.5">{activePart.questions.length} câu hỏi</p>
                )}
              </div>
              <QuestionsPanel />
            </div>
          </>
        ) : (
          /* FULL WIDTH: just questions */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">PART {activePartIdx + 1}</div>
                <span className="font-bold">{activePart?.name}</span>
                {activePart && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {activePart.questions.length} câu hỏi
                  </span>
                )}
              </div>
            </div>
            <QuestionsPanel />
          </div>
        )}
      </div>

      {/* Bottom parts bar */}
      {sections.length > 0 && (
        <div className="border-t bg-background shrink-0 flex items-stretch divide-x overflow-x-auto">
          {sections.map((section, idx) => {
            const meta = SECTION_TYPE_META[section.type] ?? SECTION_TYPE_META.reading;
            const startIdx = sectionStartIndexes[idx] ?? 0;
            const isActive = idx === activePartIdx;
            return (
              <button
                key={section.id}
                onClick={() => setActivePartIdx(idx)}
                data-testid={`preview-part-tab-${idx}`}
                className={cn(
                  "flex flex-col items-start px-5 py-3 min-w-[160px] transition-colors text-left",
                  isActive ? "bg-primary/5 border-t-2 border-primary" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn("text-xs font-bold", isActive ? "text-primary" : "text-foreground")}>
                    Part {idx + 1}
                  </span>
                  <meta.icon className={cn("w-3 h-3", meta.color)} />
                  {section.sessionAudioUrl && <Music className="w-3 h-3 text-purple-400" />}
                  {section.readingPassageUrl && <FileText className="w-3 h-3 text-orange-400" />}
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-[140px] mb-1">{section.name}</p>
                <div className="flex items-center gap-0.5 flex-wrap">
                  {section.questions.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">0 câu</span>
                  ) : (
                    section.questions.map((sq, qi) => (
                      <button
                        key={sq.id}
                        onClick={e => {
                          e.stopPropagation();
                          setActivePartIdx(idx);
                          setTimeout(() => scrollToQuestion(sq.id), 50);
                        }}
                        data-testid={`preview-q-nav-${idx}-${qi}`}
                        className={cn(
                          "w-6 h-6 rounded text-[11px] font-medium flex items-center justify-center transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                        title={`Câu ${startIdx + qi + 1}`}
                      >
                        {startIdx + qi + 1}
                      </button>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
