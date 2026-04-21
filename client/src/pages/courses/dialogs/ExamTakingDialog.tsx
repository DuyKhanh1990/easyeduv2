import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpenCheck, Headphones, Mic, PenLine,
  FileText, ExternalLink, X, Volume2,
  Music, Video, Play, Pause, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, AlertCircle, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exam, ExamSection, Question, ExamSubmission } from "@shared/schema";

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

type Answers = Record<string, string | string[] | Record<string, string>>;

const SECTION_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  listening: { label: "Nghe", icon: Headphones, color: "text-blue-600" },
  speaking:  { label: "Nói",  icon: Mic,         color: "text-green-600" },
  reading:   { label: "Đọc",  icon: BookOpenCheck, color: "text-orange-600" },
  writing:   { label: "Viết", icon: PenLine,      color: "text-purple-600" },
};

function isVideoFile(name: string) {
  return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(name);
}

function isImageFile(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
}

function InlineAudioPlayer({ url, name }: { url: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setHasError(false);
    setAttempted(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);
    const onError = () => { if (attempted) { setHasError(true); } setPlaying(false); };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [url, attempted]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (hasError) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setAttempted(true);
      audio.load();
      audio.play().catch(() => { setHasError(true); setPlaying(false); });
      setPlaying(true);
    }
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (hasError) {
    return (
      <div className="flex items-center gap-2 bg-slate-700/80 rounded-lg px-3 py-1.5 max-w-[360px] w-full">
        <Music className="w-3 h-3 text-white/40 shrink-0" />
        <span className="text-xs text-white/40 truncate">{name}</span>
        <span className="text-[11px] text-orange-400 ml-auto shrink-0">File không khả dụng</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-slate-700/80 rounded-lg px-3 py-1.5 max-w-[360px] w-full">
      <audio ref={audioRef} src={url} preload="none" />
      <button
        onClick={togglePlay}
        className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-colors shrink-0"
        data-testid="btn-audio-play-pause"
      >
        {playing ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white ml-0.5" />}
      </button>
      <Music className="w-3 h-3 text-white/60 shrink-0" />
      <span className="text-xs text-white/70 truncate max-w-[70px] shrink-0">{name}</span>
      <span className="text-[11px] text-white/50 shrink-0 font-mono">{formatTime(currentTime)}</span>
      <input
        type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
        onChange={e => {
          const t = Number(e.target.value);
          setCurrentTime(t);
          if (audioRef.current) audioRef.current.currentTime = t;
        }}
        className="flex-1 h-1 accent-emerald-400 cursor-pointer min-w-0"
        data-testid="audio-scrubber"
      />
      <span className="text-[11px] text-white/50 shrink-0 font-mono">{formatTime(duration)}</span>
      <Volume2 className="w-3 h-3 text-white/50 shrink-0" />
      <input
        type="range" min={0} max={1} step={0.05} value={volume}
        onChange={e => {
          const v = Number(e.target.value);
          setVolume(v);
          if (audioRef.current) audioRef.current.volume = v;
        }}
        className="w-12 h-1 accent-emerald-400 cursor-pointer shrink-0"
        data-testid="audio-volume"
      />
    </div>
  );
}

function renderFillBlankInteractive(
  content: string,
  value: string,
  onChange: (v: string) => void,
) {
  const parts = content.split(/(\{\d+\})/g);
  const inputs: string[] = [];
  parts.forEach(p => { if (/^\{\d+\}$/.test(p)) inputs.push(p); });
  const values = value ? value.split("|||") : [];

  return (
    <span className="leading-loose">
      {parts.map((part, i) => {
        if (/^\{\d+\}$/.test(part)) {
          const blankIdx = inputs.indexOf(part);
          const blankVal = values[blankIdx] || "";
          return (
            <input
              key={i}
              type="text"
              value={blankVal}
              onChange={e => {
                const newVals = [...values];
                newVals[blankIdx] = e.target.value;
                while (newVals.length < inputs.length) newVals.push("");
                onChange(newVals.join("|||"));
              }}
              placeholder={`(${blankIdx + 1})`}
              className="inline-block min-w-[80px] max-w-[180px] border-b-2 border-primary/60 bg-primary/5 mx-1 px-2 py-0.5 text-sm rounded-sm focus:outline-none focus:border-primary"
              data-testid={`fill-blank-input-${blankIdx}`}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function isWordFile(name: string) {
  return /\.(doc|docx)$/i.test(name);
}

function PassageViewer({ url, name }: { url: string; name: string | null }) {
  const fileName = name || url.split("/").pop() || "file";
  const isVid = isVideoFile(fileName);
  const isImg = isImageFile(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  const isWord = isWordFile(fileName);
  const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;

  if (isVid) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <video src={url} controls className="w-full h-full object-contain" />
      </div>
    );
  }

  if (isImg) {
    return (
      <div className="w-full h-full overflow-auto flex items-start justify-center">
        <img src={url} alt={fileName} className="w-full object-contain" />
      </div>
    );
  }

  if (isPdf) {
    return (
      <iframe
        src={`${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
        className="w-full h-full"
        title={fileName}
      />
    );
  }

  if (isWord) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
    return (
      <iframe
        src={officeUrl}
        className="w-full h-full"
        title={fileName}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-10 text-center">
      <FileText className="w-10 h-10 text-orange-400" />
      <div>
        <p className="font-medium text-sm">{fileName}</p>
        <p className="text-xs text-muted-foreground mt-1">File không thể xem trực tiếp</p>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-sm font-medium transition-colors">
        <ExternalLink className="w-4 h-4" />Mở trong tab mới
      </a>
    </div>
  );
}

interface QuestionCardProps {
  sq: SectionQuestionRow;
  globalIndex: number;
  answers: Answers;
  onAnswer: (sqId: string, value: string | string[] | Record<string, string>) => void;
  showResult: boolean;
}

function QuestionCard({ sq, globalIndex, answers, onAnswer, showResult }: QuestionCardProps) {
  const q = sq.question;
  const answer = answers[sq.id];

  function isCorrect(): boolean {
    if (!q.correctAnswer) return false;
    if (q.type === "single_choice") {
      return answer === q.correctAnswer;
    }
    if (q.type === "multiple_choice") {
      try {
        const correct = JSON.parse(q.correctAnswer) as string[];
        const given = (answer as string[]) || [];
        return correct.length === given.length && correct.every(c => given.includes(c));
      } catch { return false; }
    }
    if (q.type === "fill_blank") {
      try {
        const correct = JSON.parse(q.correctAnswer) as string[];
        const given = ((answer as string) || "").split("|||");
        return correct.every((c, i) => c.trim().toLowerCase() === (given[i] || "").trim().toLowerCase());
      } catch { return false; }
    }
    return false;
  }

  const correct = showResult ? isCorrect() : null;

  return (
    <div
      className={cn(
        "border rounded-xl p-5 space-y-4 transition-all",
        showResult
          ? correct
            ? "border-green-400 bg-green-50/50 dark:bg-green-950/20"
            : "border-red-300 bg-red-50/50 dark:bg-red-950/20"
          : "border-border bg-background"
      )}
      data-testid={`question-card-${sq.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className={cn(
            "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
            showResult
              ? correct ? "bg-green-500 text-white" : "bg-red-400 text-white"
              : "bg-primary text-primary-foreground"
          )}>
            {globalIndex + 1}
          </span>
          <div className="space-y-1">
            {q.title && <p className="text-xs font-semibold text-muted-foreground">{q.title}</p>}
            <div className="text-sm font-medium leading-relaxed">
              {q.type === "fill_blank"
                ? renderFillBlankInteractive(
                    q.content,
                    (answer as string) || "",
                    v => onAnswer(sq.id, v)
                  )
                : q.content}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showResult && (
            correct
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs font-semibold text-muted-foreground">{q.score}đ</span>
        </div>
      </div>

      {q.mediaImageUrl && (
        <img src={q.mediaImageUrl} alt="question media" className="max-h-48 rounded-lg object-contain border" />
      )}
      {q.mediaAudioUrl && (
        <div className="bg-slate-800 rounded-lg px-3 py-2">
          <InlineAudioPlayer url={q.mediaAudioUrl} name="Audio câu hỏi" />
        </div>
      )}

      {(q.type === "single_choice") && Array.isArray(q.options) && (
        <div className="space-y-2 pl-9">
          {(q.options as any[]).map((opt: any) => {
            const isSelected = answer === opt.id;
            const isCorrectOpt = showResult && q.correctAnswer === opt.id;
            const isWrongSelected = showResult && isSelected && !isCorrectOpt;
            return (
              <label
                key={opt.id}
                data-testid={`option-${sq.id}-${opt.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none",
                  isCorrectOpt ? "border-green-400 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium"
                  : isWrongSelected ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700"
                  : isSelected ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name={`q-${sq.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => !showResult && onAnswer(sq.id, opt.id)}
                  disabled={showResult}
                  className="accent-primary"
                />
                <span className="text-sm font-medium shrink-0 w-5">{opt.id}.</span>
                <span className="text-sm">{opt.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {(q.type === "multiple_choice") && Array.isArray(q.options) && (
        <div className="space-y-2 pl-9">
          <p className="text-xs text-muted-foreground mb-2">Chọn tất cả đáp án đúng</p>
          {(q.options as any[]).map((opt: any) => {
            const selected = ((answer as string[]) || []).includes(opt.id);
            let correctAnswers: string[] = [];
            try { correctAnswers = JSON.parse(q.correctAnswer || "[]"); } catch {}
            const isCorrectOpt = showResult && correctAnswers.includes(opt.id);
            const isWrongSelected = showResult && selected && !isCorrectOpt;
            return (
              <label
                key={opt.id}
                data-testid={`option-${sq.id}-${opt.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none",
                  isCorrectOpt ? "border-green-400 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium"
                  : isWrongSelected ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700"
                  : selected ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    if (showResult) return;
                    const current = ((answer as string[]) || []);
                    if (selected) onAnswer(sq.id, current.filter(x => x !== opt.id));
                    else onAnswer(sq.id, [...current, opt.id]);
                  }}
                  disabled={showResult}
                  className="accent-primary"
                />
                <span className="text-sm font-medium shrink-0 w-5">{opt.id}.</span>
                <span className="text-sm">{opt.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {(q.type === "essay") && (
        <div className="pl-9">
          <textarea
            value={(answer as string) || ""}
            onChange={e => !showResult && onAnswer(sq.id, e.target.value)}
            disabled={showResult}
            placeholder="Nhập câu trả lời của bạn..."
            rows={5}
            className="w-full rounded-lg border border-border bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:opacity-70"
            data-testid={`essay-input-${sq.id}`}
          />
          {(() => {
            let constraints = { minWords: 0, maxWords: 0 };
            try { constraints = JSON.parse(q.correctAnswer || "{}"); } catch {}
            const wordCount = ((answer as string) || "").trim().split(/\s+/).filter(Boolean).length;
            return (
              <p className="text-xs text-muted-foreground mt-1">
                {wordCount} từ
                {constraints.minWords > 0 && ` · Tối thiểu ${constraints.minWords} từ`}
                {constraints.maxWords > 0 && ` · Tối đa ${constraints.maxWords} từ`}
              </p>
            );
          })()}
        </div>
      )}

      {(q.type === "matching") && Array.isArray(q.options) && (
        <div className="pl-9 space-y-2">
          <p className="text-xs text-muted-foreground mb-2">Nối mỗi cột bên trái với cột bên phải tương ứng</p>
          {(q.options as any[]).map((pair: any, oi: number) => {
            const matchAnswers = ((answer as Record<string, string>) || {});
            const rightOptions = (q.options as any[]).map((p: any) => p.right);
            return (
              <div key={pair.id ?? oi} className="flex items-center gap-3">
                <div className="flex-1 px-3 py-2 rounded-lg border bg-muted/20 text-sm">
                  {pair.left?.text || "—"}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <select
                  value={matchAnswers[pair.id] || ""}
                  onChange={e => {
                    if (showResult) return;
                    onAnswer(sq.id, { ...matchAnswers, [pair.id]: e.target.value });
                  }}
                  disabled={showResult}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
                  data-testid={`matching-select-${sq.id}-${oi}`}
                >
                  <option value="">-- Chọn --</option>
                  {rightOptions.map((r: any, ri: number) => (
                    <option key={ri} value={r?.id || ri}>{r?.text || "—"}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {showResult && q.explanation && (
        <div className="pl-9 mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Giải thích</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">{q.explanation}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  exam: ExamWithUsers;
  open: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void;
  readonlySubmission?: ExamSubmission | null;
}

type Phase = "intro" | "taking" | "submitted";

export function ExamTakingDialog({ exam, open, onClose, onSubmitSuccess, readonlySubmission }: Props) {
  const { toast } = useToast();
  const { data: authUser } = useAuth();
  const { data: meInfo } = useQuery<{ fullName: string | null; code: string | null; type: string | null }>({
    queryKey: ["/api/my-space/me-info"],
    enabled: !!authUser,
  });
  const [phase, setPhase] = useState<Phase>("intro");
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [activeResultPartIdx, setActiveResultPartIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [splitPos, setSplitPos] = useState(50);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pos = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.min(80, Math.max(20, pos)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const { data: sections = [], isLoading } = useQuery<SectionWithQuestions[]>({
    queryKey: ["/api/exams", exam.id, "preview"],
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (open) {
      if (readonlySubmission) {
        setPhase("submitted");
        setAnswers((readonlySubmission.answers as Answers) || {});
      } else {
        setPhase("intro");
        setAnswers({});
      }
      setActivePartIdx(0);
      setActiveResultPartIdx(0);
      setSecondsLeft(null);
      setShowConfirm(false);
      startTimeRef.current = null;
    }
  }, [open, readonlySubmission]);

  const allQuestions = sections.flatMap(s => s.questions);

  function startExam() {
    startTimeRef.current = Date.now();
    setPhase("taking");
    if (exam.timeLimitMinutes && exam.timeLimitMinutes > 0) {
      setSecondsLeft(exam.timeLimitMinutes * 60);
    }
  }

  useEffect(() => {
    if (phase === "taking" && secondsLeft !== null) {
      timerRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timerRef.current!);
            submitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const submitExam = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("submitted");
    setShowConfirm(false);
  }, []);

  const saveSubmission = useCallback(async (
    currentAnswers: Answers,
    currentSections: SectionWithQuestions[],
  ) => {
    try {
      const timeTaken = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : null;
      const allQs = currentSections.flatMap(s => s.questions);

      let totalScore = 0;
      let totalEarned = 0;
      currentSections.forEach(s => {
        s.questions.forEach(sq => {
          const scoreVal = parseFloat(String(sq.question.score)) || 0;
          totalScore += scoreVal;
        });
      });

      allQs.forEach(sq => {
        const q = sq.question;
        const scoreVal = parseFloat(String(q.score)) || 0;
        const a = currentAnswers[sq.id];
        if (!a) return;
        if (q.type === "single_choice" && a === q.correctAnswer) totalEarned += scoreVal;
        else if (q.type === "multiple_choice") {
          try {
            const correct = JSON.parse(q.correctAnswer || "[]") as string[];
            const given = (a as string[]) || [];
            if (correct.length === given.length && correct.every(c => given.includes(c))) totalEarned += scoreVal;
          } catch {}
        } else if (q.type === "fill_blank") {
          try {
            const correct = JSON.parse(q.correctAnswer || "[]") as string[];
            const given = ((a as string) || "").split("|||");
            if (correct.every((c, i) => c.trim().toLowerCase() === (given[i] || "").trim().toLowerCase())) totalEarned += scoreVal;
          } catch {}
        }
      });

      const partScores = currentSections.map((s, idx) => {
        let partEarned = 0;
        let partCorrect = 0;
        s.questions.forEach(sq => {
          const q = sq.question;
          const scoreVal = parseFloat(String(q.score)) || 0;
          const a = currentAnswers[sq.id];
          if (!a) return;
          let correct = false;
          if (q.type === "single_choice") correct = a === q.correctAnswer;
          else if (q.type === "multiple_choice") {
            try {
              const carr = JSON.parse(q.correctAnswer || "[]") as string[];
              const garr = (a as string[]) || [];
              correct = carr.length === garr.length && carr.every(c => garr.includes(c));
            } catch {}
          } else if (q.type === "fill_blank") {
            try {
              const carr = JSON.parse(q.correctAnswer || "[]") as string[];
              const garr = ((a as string) || "").split("|||");
              correct = carr.every((c, i) => c.trim().toLowerCase() === (garr[i] || "").trim().toLowerCase());
            } catch {}
          }
          if (correct) { partEarned += scoreVal; partCorrect++; }
        });
        return {
          partName: `Part ${idx + 1}: ${s.name}`,
          correct: partCorrect,
          total: s.questions.length,
          score: partEarned,
        };
      });

      await apiRequest("POST", "/api/exam-submissions", {
        examId: exam.id,
        answers: currentAnswers,
        score: totalEarned.toFixed(2),
        adjustedScore: totalEarned.toFixed(2),
        partScores,
        timeTakenSeconds: timeTaken,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/exams", exam.id, "my-attempt-count"] });

      onSubmitSuccess?.();
    } catch (err) {
      console.error("Failed to save exam submission:", err);
      toast({ title: "Lỗi nộp bài", description: "Không thể lưu bài làm. Vui lòng thử lại.", variant: "destructive" });
    }
  }, [exam.id, onSubmitSuccess, toast]);

  function formatTimer(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  useEffect(() => {
    if (phase === "submitted" && !readonlySubmission && sections.length > 0) {
      saveSubmission(answers, sections);
    }
  }, [phase]);

  function setAnswer(sqId: string, value: string | string[] | Record<string, string>) {
    setAnswers(prev => ({ ...prev, [sqId]: value }));
  }

  function isAnswered(sq: SectionQuestionRow): boolean {
    const a = answers[sq.id];
    if (!a) return false;
    if (Array.isArray(a)) return a.length > 0;
    if (typeof a === "object") return Object.keys(a).length > 0;
    return String(a).trim().length > 0;
  }

  function scrollToQuestion(sqId: string) {
    questionRefs.current[sqId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let globalQuestionIndex = 0;
  const sectionStartIndexes: number[] = [];
  sections.forEach(s => {
    sectionStartIndexes.push(globalQuestionIndex);
    globalQuestionIndex += s.questions.length;
  });
  const activeStartIndex = sectionStartIndexes[activePartIdx] ?? 0;
  const activePart = sections[activePartIdx] ?? null;
  const passageUrl = activePart?.readingPassageUrl || null;
  const passageName = activePart?.readingPassageName || null;
  const audioUrl = activePart?.sessionAudioUrl || null;
  const audioName = activePart?.sessionAudioName || null;
  const hasVisualFile = !!passageUrl;
  const hasAudio = !!(audioUrl && audioName);

  const answeredCount = allQuestions.filter(isAnswered).length;
  const totalCount = allQuestions.length;

  function calcScore() {
    let earned = 0;
    let total = 0;
    allQuestions.forEach(sq => {
      const q = sq.question;
      const scoreVal = parseFloat(String(q.score)) || 0;
      total += scoreVal;
      const a = answers[sq.id];
      if (q.type === "single_choice") {
        if (a === q.correctAnswer) earned += scoreVal;
      } else if (q.type === "multiple_choice") {
        try {
          const correct = JSON.parse(q.correctAnswer || "[]") as string[];
          const given = (a as string[]) || [];
          if (correct.length === given.length && correct.every(c => given.includes(c))) earned += scoreVal;
        } catch {}
      } else if (q.type === "fill_blank") {
        try {
          const correct = JSON.parse(q.correctAnswer || "[]") as string[];
          const given = ((a as string) || "").split("|||");
          if (correct.every((c, i) => c.trim().toLowerCase() === (given[i] || "").trim().toLowerCase())) earned += scoreVal;
        } catch {}
      }
    });
    return { earned, total };
  }

  if (!open) return null;

  const timerWarning = secondsLeft !== null && secondsLeft <= 300;
  const timerCritical = secondsLeft !== null && secondsLeft <= 60;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="exam-taking-fullscreen">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 px-5 py-2.5 border-b shrink-0",
        phase === "taking" && hasAudio ? "bg-slate-800 text-white" : "bg-background"
      )}>
        {/* Left: exam name */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <h2 className={cn("text-sm font-bold truncate max-w-[180px]", phase === "taking" && hasAudio ? "text-white" : "")}>
            {exam.name}
          </h2>
          <Badge
            variant={exam.status === "published" ? "default" : "secondary"}
            className="text-xs shrink-0"
          >
            {exam.status === "published" ? "Công bố" : "Nháp"}
          </Badge>
          {phase === "taking" && (
            <span className={cn("text-xs shrink-0", phase === "taking" && hasAudio ? "text-white/60" : "text-muted-foreground")}>
              {answeredCount}/{totalCount} câu đã trả lời
            </span>
          )}
        </div>

        {/* Center: audio player (takes remaining space) */}
        <div className="flex-1 flex justify-center">
          {phase === "taking" && hasAudio && audioUrl && audioName && (
            <InlineAudioPlayer url={audioUrl} name={audioName} />
          )}
          {phase === "taking" && !hasAudio && (
            <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden self-center">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: totalCount > 0 ? `${(answeredCount / totalCount) * 100}%` : "0%" }}
              />
            </div>
          )}
        </div>

        {/* Right: timer + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {phase === "taking" && secondsLeft !== null && (
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-bold border",
              timerCritical
                ? "bg-red-600 text-white border-red-600 animate-pulse"
                : timerWarning
                  ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300"
                  : hasAudio
                    ? "bg-white/10 text-white border-white/20"
                    : "bg-muted text-foreground border-border"
            )}>
              <Clock className="w-3 h-3" />
              {formatTimer(secondsLeft)}
            </div>
          )}
          {phase === "taking" && (
            <Button
              size="sm"
              variant={hasAudio ? "secondary" : "default"}
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1.5 text-xs h-7"
              data-testid="btn-submit-exam"
            >
              <Send className="w-3 h-3" />
              Nộp bài
            </Button>
          )}
          <button
            onClick={onClose}
            className={cn(
              "p-1.5 rounded transition-colors",
              hasAudio && phase === "taking"
                ? "text-white/60 hover:text-white hover:bg-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            data-testid="btn-close-exam-taking"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* INTRO PHASE */}
      {phase === "intro" && (
        <div className="flex-1 flex items-center justify-center p-8">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Đang tải bài kiểm tra...</p>
          ) : (
            <div className="max-w-lg w-full bg-card border rounded-2xl p-8 space-y-6 shadow-lg">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <BookOpenCheck className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold">{exam.name}</h3>
                {exam.description && (
                  <p className="text-sm text-muted-foreground">{exam.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {exam.timeLimitMinutes && (
                  <div className="px-4 py-3 rounded-xl border bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Thời gian</p>
                    <p className="text-lg font-bold text-primary">{exam.timeLimitMinutes} phút</p>
                  </div>
                )}
                <div className="px-4 py-3 rounded-xl border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Số câu hỏi</p>
                  <p className="text-lg font-bold text-primary">{totalCount}</p>
                </div>
                {exam.passingScore && (
                  <div className="px-4 py-3 rounded-xl border bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Điểm đạt</p>
                    <p className="text-lg font-bold text-primary">{exam.passingScore}</p>
                  </div>
                )}
                <div className="px-4 py-3 rounded-xl border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Số phần</p>
                  <p className="text-lg font-bold text-primary">{sections.length}</p>
                </div>
              </div>

              {sections.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung bài thi</p>
                  {sections.map((s, i) => {
                    const meta = SECTION_TYPE_META[s.type] ?? SECTION_TYPE_META.reading;
                    return (
                      <div key={s.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted/20">
                        <meta.icon className={cn("w-4 h-4", meta.color)} />
                        <span className="font-medium flex-1">Part {i + 1}: {s.name}</span>
                        <span className="text-muted-foreground text-xs">{s.questions.length} câu</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={startExam}
                disabled={totalCount === 0}
                data-testid="btn-start-exam"
              >
                {totalCount === 0 ? "Bài chưa có câu hỏi" : "Bắt đầu làm bài"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* TAKING PHASE */}
      {phase === "taking" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main: Questions Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Part header */}
            <div className="px-5 py-2.5 border-b bg-muted/10 shrink-0 flex items-center gap-3">
              {activePart && (() => {
                const meta = SECTION_TYPE_META[activePart.type] ?? SECTION_TYPE_META.reading;
                return (
                  <>
                    <meta.icon className={cn("w-4 h-4", meta.color)} />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">Part {activePartIdx + 1}</p>
                      <p className="text-sm font-semibold">{activePart.name}</p>
                    </div>
                    {activePart.questions.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Câu {activeStartIndex + 1}–{activeStartIndex + activePart.questions.length}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Content area */}
            <div className="flex flex-1 min-h-0 overflow-hidden" ref={splitContainerRef}>
              {hasVisualFile ? (
                <>
                  <div className="flex flex-col overflow-hidden" style={{ width: `${splitPos}%` }}>
                    <PassageViewer url={passageUrl!} name={passageName} />
                  </div>
                  {/* Draggable divider */}
                  <div
                    onMouseDown={handleDividerMouseDown}
                    className="w-1.5 shrink-0 cursor-col-resize flex items-center justify-center bg-border hover:bg-primary/30 transition-colors group relative z-10"
                    title="Kéo để thay đổi kích thước"
                  >
                    <div className="w-4 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-primary/50 flex items-center justify-center transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <div className="w-0.5 h-1 bg-current rounded-full" />
                        <div className="w-0.5 h-1 bg-current rounded-full" />
                        <div className="w-0.5 h-1 bg-current rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col overflow-hidden flex-1">
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {(activePart?.questions || []).map((sq, idx) => (
                        <div key={sq.id} ref={el => { questionRefs.current[sq.id] = el; }} className="scroll-mt-4">
                          <QuestionCard
                            sq={sq}
                            globalIndex={activeStartIndex + idx}
                            answers={answers}
                            onAnswer={setAnswer}
                            showResult={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {!activePart || activePart.questions.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      Chưa có câu hỏi nào trong phần này.
                    </div>
                  ) : (
                    activePart.questions.map((sq, idx) => (
                      <div key={sq.id} ref={el => { questionRefs.current[sq.id] = el; }} className="scroll-mt-4">
                        <QuestionCard
                          sq={sq}
                          globalIndex={activeStartIndex + idx}
                          answers={answers}
                          onAnswer={setAnswer}
                          showResult={false}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Part navigation footer */}
            <div className="border-t bg-background px-5 py-3 flex items-center justify-between shrink-0">
              <Button
                variant="outline" size="sm"
                disabled={activePartIdx === 0}
                onClick={() => setActivePartIdx(i => Math.max(0, i - 1))}
                data-testid="btn-prev-part"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Phần trước
              </Button>
              <div className="flex items-center gap-1.5">
                {sections.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setActivePartIdx(i)}
                    data-testid={`btn-part-${i}`}
                    className={cn(
                      "w-7 h-7 rounded-full text-xs font-bold transition-all border",
                      i === activePartIdx
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button
                variant="outline" size="sm"
                disabled={activePartIdx === sections.length - 1}
                onClick={() => setActivePartIdx(i => Math.min(sections.length - 1, i + 1))}
                data-testid="btn-next-part"
              >
                Phần tiếp
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Right: Question Navigator */}
          <div className="w-52 border-l flex flex-col bg-muted/10 shrink-0">
            <div className="px-3 py-3 border-b">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Câu hỏi</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {sections.map((section, sIdx) => {
                const startIdx = sectionStartIndexes[sIdx] ?? 0;
                const meta = SECTION_TYPE_META[section.type] ?? SECTION_TYPE_META.reading;
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => setActivePartIdx(sIdx)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors mb-1.5 text-left",
                        activePartIdx === sIdx
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                      data-testid={`nav-part-${sIdx}`}
                    >
                      <meta.icon className={cn("w-3 h-3 shrink-0", meta.color)} />
                      <span className="truncate">Part {sIdx + 1}: {section.name}</span>
                    </button>
                    <div className="flex flex-wrap gap-1 pl-1">
                      {section.questions.map((sq, qi) => {
                        const answered = isAnswered(sq);
                        const isActivePart = sIdx === activePartIdx;
                        return (
                          <button
                            key={sq.id}
                            onClick={() => {
                              setActivePartIdx(sIdx);
                              setTimeout(() => scrollToQuestion(sq.id), 50);
                            }}
                            data-testid={`nav-q-${sIdx}-${qi}`}
                            className={cn(
                              "w-7 h-7 rounded-md text-[11px] font-semibold flex items-center justify-center transition-all border",
                              answered
                                ? "bg-green-500 text-white border-green-500"
                                : isActivePart
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : "bg-background text-muted-foreground border-border hover:border-primary/30"
                            )}
                            title={`Câu ${startIdx + qi + 1}${answered ? " (đã trả lời)" : ""}`}
                          >
                            {startIdx + qi + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-4 h-4 rounded bg-green-500" />
                Đã trả lời
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-4 h-4 rounded bg-background border border-border" />
                Chưa trả lời
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBMITTED PHASE */}
      {phase === "submitted" && (
        <div className="flex-1 flex overflow-hidden">
          {(() => {
            const { earned, total } = calcScore();
            const passingScoreNum = parseFloat(String(exam.passingScore || "0"));
            const passed = passingScoreNum > 0 ? earned >= passingScoreNum : null;
            const answeredCountFinal = allQuestions.filter(isAnswered).length;

            let correctCount = 0;
            let wrongCount = 0;
            allQuestions.forEach(sq => {
              const q = sq.question;
              const a = answers[sq.id];
              if (!a) return;
              let isCorrect = false;
              if (q.type === "single_choice") {
                isCorrect = a === q.correctAnswer;
              } else if (q.type === "multiple_choice") {
                try {
                  const correct = JSON.parse(q.correctAnswer || "[]") as string[];
                  const given = (a as string[]) || [];
                  isCorrect = correct.length === given.length && correct.every(c => given.includes(c));
                } catch {}
              } else if (q.type === "fill_blank") {
                try {
                  const correct = JSON.parse(q.correctAnswer || "[]") as string[];
                  const given = ((a as string) || "").split("|||");
                  isCorrect = correct.every((c, i) => c.trim().toLowerCase() === (given[i] || "").trim().toLowerCase());
                } catch {}
              }
              if (isCorrect) correctCount++;
              else wrongCount++;
            });

            const activeResultSection = sections[activeResultPartIdx] ?? sections[0];
            const activeResultStartIdx = sectionStartIndexes[activeResultPartIdx] ?? 0;

            return (
              <>
                {/* LEFT SIDEBAR: Student info */}
                <div className="w-[35%] border-r flex flex-col overflow-y-auto bg-muted/10">
                  <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
                    {/* Student info */}
                    <div className="w-full text-center space-y-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Tên Học viên</div>
                      {(() => {
                        const name = readonlySubmission?.studentName ?? meInfo?.fullName ?? authUser?.username ?? "—";
                        const code = readonlySubmission?.studentCode ?? meInfo?.code;
                        return (
                          <div className="text-base font-bold">
                            {name}
                            {code && <span className="text-muted-foreground font-normal"> ({code})</span>}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Divider */}
                    <div className="w-16 h-px bg-border" />

                    {/* Exam name */}
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Bài kiểm tra</div>
                      <div className="text-sm font-semibold">{exam.name}</div>
                    </div>

                    {/* Score + Pass/Fail */}
                    <div className={cn(
                      "w-full rounded-2xl p-6 text-center border",
                      passed === true ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                      : passed === false ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                      : "bg-muted/30 border-border"
                    )}>
                      <div className="text-5xl font-black text-primary mb-1">{earned.toFixed(1)}</div>
                      <div className="text-sm text-muted-foreground mb-3">/ {total.toFixed(1)} điểm</div>
                      {passed !== null && (
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold",
                          passed ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                 : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                        )}>
                          {passed ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          {passed ? "Đạt" : "Chưa đạt"}
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="text-center space-y-2">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Trả lời:</span>
                        <span>{answeredCountFinal}/{totalCount}</span>
                      </div>
                      <div className="flex items-center justify-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="font-medium">Đúng:</span>
                          <span className="text-green-600 font-bold">{correctCount}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span className="font-medium">Sai:</span>
                          <span className="text-red-600 font-bold">{wrongCount}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT: Part tabs + questions */}
                <div className="w-[65%] flex flex-col overflow-hidden">
                  {/* Part tab buttons */}
                  <div className="shrink-0 p-3 border-b flex flex-wrap gap-2 bg-background">
                    {sections.map((section, sIdx) => {
                      const meta = SECTION_TYPE_META[section.type] ?? SECTION_TYPE_META.reading;
                      const isActive = activeResultPartIdx === sIdx;
                      return (
                        <button
                          key={section.id}
                          onClick={() => setActiveResultPartIdx(sIdx)}
                          data-testid={`btn-result-part-${sIdx + 1}`}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          )}
                        >
                          <meta.icon className="w-3.5 h-3.5" />
                          Part {sIdx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Questions for active part */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeResultSection && (
                      <>
                        <div className="flex items-center gap-2 py-1 border-b mb-3">
                          {(() => {
                            const meta = SECTION_TYPE_META[activeResultSection.type] ?? SECTION_TYPE_META.reading;
                            return <meta.icon className={cn("w-4 h-4", meta.color)} />;
                          })()}
                          <span className="text-sm font-semibold">Part {activeResultPartIdx + 1}: {activeResultSection.name}</span>
                        </div>
                        {activeResultSection.questions.map((sq, qi) => (
                          <div key={sq.id}>
                            <QuestionCard
                              sq={sq}
                              globalIndex={activeResultStartIdx + qi}
                              answers={answers}
                              onAnswer={() => {}}
                              showResult={true}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Submit Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl border shadow-xl p-6 max-w-sm w-full space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center mx-auto">
                <Send className="w-5 h-5 text-orange-500" />
              </div>
              <h3 className="text-base font-bold">Xác nhận nộp bài</h3>
              <p className="text-sm text-muted-foreground">
                Bạn đã trả lời <strong>{answeredCount}/{totalCount}</strong> câu hỏi.
                {answeredCount < totalCount && (
                  <span className="text-orange-600 dark:text-orange-400"> Còn {totalCount - answeredCount} câu chưa làm.</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">Sau khi nộp bài bạn không thể sửa đổi câu trả lời. Bạn có chắc chắn muốn nộp?</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} data-testid="btn-cancel-submit">
                Tiếp tục làm
              </Button>
              <Button className="flex-1" onClick={submitExam} data-testid="btn-confirm-submit">
                Nộp bài
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
