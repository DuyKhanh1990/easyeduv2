import fs from "fs";
import path from "path";

export interface ErrorEvent {
  id: string;
  timestamp: string;
  level: "error" | "warn";
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  request?: {
    method: string;
    path: string;
    statusCode?: number;
    userId?: string;
    ip?: string;
  };
}

const MAX_IN_MEMORY = 200;
const LOG_FILE = path.join(process.cwd(), "logs", "app-errors.jsonl");
const recentErrors: ErrorEvent[] = [];

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeToFile(event: ErrorEvent) {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + "\n", "utf8");
  } catch {
  }
}

export function captureError(
  err: unknown,
  context?: {
    request?: ErrorEvent["request"];
    extra?: Record<string, unknown>;
  }
): ErrorEvent {
  const isError = err instanceof Error;
  const event: ErrorEvent = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level: "error",
    message: isError ? err.message : String(err),
    stack: isError ? err.stack : undefined,
    context: context?.extra,
    request: context?.request,
  };

  recentErrors.push(event);
  if (recentErrors.length > MAX_IN_MEMORY) {
    recentErrors.shift();
  }

  writeToFile(event);

  return event;
}

export function captureWarn(message: string, extra?: Record<string, unknown>): ErrorEvent {
  const event: ErrorEvent = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level: "warn",
    message,
    context: extra,
  };

  recentErrors.push(event);
  if (recentErrors.length > MAX_IN_MEMORY) {
    recentErrors.shift();
  }

  writeToFile(event);
  return event;
}

export function getRecentErrors(limit = 50): ErrorEvent[] {
  return recentErrors.slice(-limit).reverse();
}

export function getErrorStats() {
  const errors = recentErrors.filter(e => e.level === "error");
  const warns = recentErrors.filter(e => e.level === "warn");
  const last1h = Date.now() - 60 * 60 * 1000;
  const recentHour = recentErrors.filter(e => new Date(e.timestamp).getTime() > last1h);

  return {
    total: recentErrors.length,
    errors: errors.length,
    warns: warns.length,
    lastHour: recentHour.length,
    oldest: recentErrors[0]?.timestamp ?? null,
    newest: recentErrors[recentErrors.length - 1]?.timestamp ?? null,
  };
}
