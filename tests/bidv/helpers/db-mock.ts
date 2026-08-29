/**
 * Reusable drizzle DB chain mock.
 *
 * Usage:
 *   const { db, mockSelect, mockInsert, mockUpdate, mockExecute } = createDbMock();
 *   vi.mock('../../server/db', () => ({ db }));
 *
 *   // Set return for a specific select call:
 *   mockSelect.limitOnce([{ id: '...' }]);
 */
import { vi } from "vitest";

export interface SelectChain {
  /** Queue a value to be resolved by the next .limit() call */
  limitOnce(value: unknown[]): void;
  /** Queue a value to be resolved by the next .orderBy().limit() call */
  limitDefault(value: unknown[]): void;
}

export function createDbMock() {
  // ── limit mock ─────────────────────────────────────────────────────────────
  const limitMock = vi.fn().mockResolvedValue([]);

  // ── chain: select → from → where / orderBy → limit ────────────────────────
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock   = vi.fn().mockReturnValue({ limit: limitMock, orderBy: orderByMock });
  const fromMock    = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock, limit: limitMock });
  const selectMock  = vi.fn().mockReturnValue({ from: fromMock });

  // ── insert chain ───────────────────────────────────────────────────────────
  const returningInsertMock = vi.fn().mockResolvedValue([]);
  const valuesMock = vi.fn().mockReturnValue({ returning: returningInsertMock });
  const onConflictMock = vi.fn().mockReturnValue({ returning: returningInsertMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock, onConflictDoUpdate: onConflictMock });

  // ── update chain ───────────────────────────────────────────────────────────
  const returningUpdateMock = vi.fn().mockResolvedValue([]);
  const whereUpdateMock = vi.fn().mockReturnValue({ returning: returningUpdateMock });
  const setMock   = vi.fn().mockReturnValue({ where: whereUpdateMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  // ── delete chain ───────────────────────────────────────────────────────────
  const returningDeleteMock = vi.fn().mockResolvedValue([]);
  const whereDeleteMock = vi.fn().mockReturnValue({ returning: returningDeleteMock });
  const deleteMock = vi.fn().mockReturnValue({ where: whereDeleteMock });

  // ── execute (raw SQL) ──────────────────────────────────────────────────────
  const executeMock = vi.fn().mockResolvedValue({ rows: [] });

  const db = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    execute: executeMock,
  };

  /** Helper: queue next .limit() resolution */
  function queueLimit(value: unknown[]) {
    limitMock.mockResolvedValueOnce(value);
  }

  /** Reset all mocks between tests */
  function reset() {
    limitMock.mockReset().mockResolvedValue([]);
    orderByMock.mockReset().mockReturnValue({ limit: limitMock });
    whereMock.mockReset().mockReturnValue({ limit: limitMock, orderBy: orderByMock });
    fromMock.mockReset().mockReturnValue({ where: whereMock, orderBy: orderByMock, limit: limitMock });
    selectMock.mockReset().mockReturnValue({ from: fromMock });
    returningInsertMock.mockReset().mockResolvedValue([]);
    valuesMock.mockReset().mockReturnValue({ returning: returningInsertMock });
    onConflictMock.mockReset().mockReturnValue({ returning: returningInsertMock });
    insertMock.mockReset().mockReturnValue({ values: valuesMock, onConflictDoUpdate: onConflictMock });
    returningUpdateMock.mockReset().mockResolvedValue([]);
    whereUpdateMock.mockReset().mockReturnValue({ returning: returningUpdateMock });
    setMock.mockReset().mockReturnValue({ where: whereUpdateMock });
    updateMock.mockReset().mockReturnValue({ set: setMock });
    returningDeleteMock.mockReset().mockResolvedValue([]);
    whereDeleteMock.mockReset().mockReturnValue({ returning: returningDeleteMock });
    deleteMock.mockReset().mockReturnValue({ where: whereDeleteMock });
    executeMock.mockReset().mockResolvedValue({ rows: [] });
  }

  return {
    db,
    queueLimit,
    reset,
    limitMock,
    executeMock,
    returningInsertMock,
    returningUpdateMock,
    returningDeleteMock,
    valuesMock,
    setMock,
    whereUpdateMock,
  };
}
