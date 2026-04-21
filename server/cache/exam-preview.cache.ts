const TTL_MS = 10 * 60 * 1000; // 10 phút

interface CacheEntry<T> {
  data: T;
  expiredAt: number;
}

class ExamPreviewCache {
  private store = new Map<string, CacheEntry<unknown>>();

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
    this.store.set(examId, { data, expiredAt: Date.now() + TTL_MS });
  }

  invalidate(examId: string): void {
    this.store.delete(examId);
    console.log(`[ExamCache] Invalidated cache for exam: ${examId}`);
  }

  invalidateAll(): void {
    const count = this.store.size;
    this.store.clear();
    console.log(`[ExamCache] Cleared all ${count} cached exams`);
  }

  get size(): number {
    return this.store.size;
  }
}

export const examPreviewCache = new ExamPreviewCache();
