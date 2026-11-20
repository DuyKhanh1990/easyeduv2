import { pool } from "./db.js";
import type { PoolClient } from "pg";

const MUTATION_BARRIER_LOCK_KEY = "easyedu:database-mutation-barrier";
let permitClient: PoolClient | null = null;
let activePermits = 0;
let coordinatorTail: Promise<void> = Promise.resolve();

async function withCoordinator<T>(work: () => Promise<T>): Promise<T> {
  const previous = coordinatorTail;
  let releaseQueue!: () => void;
  coordinatorTail = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    releaseQueue();
  }
}

export async function acquireDatabaseMutationPermit(): Promise<
  () => Promise<void>
> {
  await withCoordinator(async () => {
    if (activePermits === 0) {
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock_shared(hashtext($1))", [
          MUTATION_BARRIER_LOCK_KEY,
        ]);
        permitClient = client;
      } catch (error) {
        client.release();
        throw error;
      }
    }
    activePermits++;
  });

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await withCoordinator(async () => {
      activePermits = Math.max(0, activePermits - 1);
      if (activePermits !== 0 || !permitClient) return;
      const client = permitClient;
      permitClient = null;
      await client
        .query("SELECT pg_advisory_unlock_shared(hashtext($1))", [
          MUTATION_BARRIER_LOCK_KEY,
        ])
        .catch(() => undefined);
      client.release();
    });
  };
}