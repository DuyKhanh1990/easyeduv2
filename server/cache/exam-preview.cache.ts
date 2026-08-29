const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 phút cho preview
const LIST_TTL_MS = 60 * 1000;          // 60 giây cho danh sách

interface CacheEntry<T> {
  data: T;
  expiredAt: number;
}

class ExamPreviewCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private listEntry: CacheEntry<unknown> | null = null;

  // ── Preview cache (per exam ID) ──────────────────────────────────────────

  get<T>(examId: string): T | null {
    const entry = this.store.get(examId);
    if (!entry) return null;
    if (Date.now() > entry.expiredAt) {
      this.store.delete(examId);
      return null;
    }
    return entry.data as T;
  }

  set<T>(examId: string, data: T): void {
    this.store.set(examId, { data, expiredAt: Date.now() + PREVIEW_TTL_MS });
  }

  invalidate(examId: string): void {
    this.store.delete(examId);
    this.invalidateList();
    console.log(`[ExamCache] Invalidated preview cache for exam: ${examId}`);
  }

  invalidateAll(): void {
    const count = this.store.size;
    this.store.clear();
    this.listEntry = null;
    console.log(`[ExamCache] Cleared all ${count} cached exams`);
  }

  get size(): number {
    return this.store.size;
  }

  // ── List cache (GET /api/exams) ──────────────────────────────────────────

  getList<T>(): T | null {
    if (!this.listEntry) return null;
    if (Date.now() > this.listEntry.expiredAt) {
      this.listEntry = null;
      return null;
    }
    return this.listEntry.data as T;
  }

  setList<T>(data: T): void {
    this.listEntry = { data, expiredAt: Date.now() + LIST_TTL_MS };
  }

  invalidateList(): void {
    if (this.listEntry) {
      this.listEntry = null;
      console.log("[ExamCache] Invalidated exam list cache");
    }
  }
}

export const examPreviewCache = new ExamPreviewCache();
