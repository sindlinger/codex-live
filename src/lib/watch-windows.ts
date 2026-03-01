import fs from 'node:fs';
import path from 'node:path';
import { execCapture } from './proc.js';
import { ensureDir, nowIso } from './runtime.js';

const REGISTRY_BASENAME = 'watch-windows.json';

export interface WatchWindowEntry {
  pid: number;
  sessionId: string;
  launcher: string;
  ownerPid: number;
  ownerTty: string;
  ownerCmd: string;
  startedAtUtc: string;
}

interface WatchWindowRegistry {
  version: 1;
  windows: WatchWindowEntry[];
}

function registryPath(baseDir: string): string {
  return path.join(baseDir, 'logs', REGISTRY_BASENAME);
}

function readRegistry(baseDir: string): WatchWindowRegistry {
  const file = registryPath(baseDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WatchWindowRegistry>;
    const windows = Array.isArray(parsed.windows) ? parsed.windows : [];
    return { version: 1, windows: windows as WatchWindowEntry[] };
  } catch {
    return { version: 1, windows: [] };
  }
}

function writeRegistry(baseDir: string, registry: WatchWindowRegistry): void {
  const file = registryPath(baseDir);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanRegistry(baseDir: string): WatchWindowRegistry {
  const current = readRegistry(baseDir);
  const alive = current.windows.filter((w) => isPidAlive(w.pid));
  const cleaned: WatchWindowRegistry = { version: 1, windows: alive };
  writeRegistry(baseDir, cleaned);
  return cleaned;
}

export function getCurrentTty(): string {
  const out = execCapture('bash', ['-lc', 'tty'], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
  if (!out || out.toLowerCase().includes('not a tty')) return '(no-tty)';
  return out;
}

export function listActiveWatchWindows(baseDir: string): WatchWindowEntry[] {
  return cleanRegistry(baseDir).windows;
}

export function registerWatchWindow(baseDir: string, entry: WatchWindowEntry): void {
  const current = cleanRegistry(baseDir);
  const withoutSelf = current.windows.filter((w) => w.pid !== entry.pid);
  withoutSelf.push(entry);
  writeRegistry(baseDir, { version: 1, windows: withoutSelf });
}

export function unregisterWatchWindow(baseDir: string, pid: number): void {
  const current = cleanRegistry(baseDir);
  const filtered = current.windows.filter((w) => w.pid !== pid);
  writeRegistry(baseDir, { version: 1, windows: filtered });
}

export interface CloseWatchWindowsResult {
  before: number;
  closed: WatchWindowEntry[];
  failed: WatchWindowEntry[];
  remaining: WatchWindowEntry[];
}

export function closeActiveWatchWindows(baseDir: string): CloseWatchWindowsResult {
  const current = cleanRegistry(baseDir);
  const closed: WatchWindowEntry[] = [];
  const failed: WatchWindowEntry[] = [];

  for (const w of current.windows) {
    try {
      process.kill(w.pid, 'SIGTERM');
      closed.push(w);
    } catch {
      failed.push(w);
    }
  }

  const after = cleanRegistry(baseDir);
  return {
    before: current.windows.length,
    closed,
    failed,
    remaining: after.windows
  };
}

export function newWatchWindowEntry(params: {
  pid: number;
  sessionId: string;
  launcher: string;
  ownerPid: number;
  ownerTty: string;
  ownerCmd: string;
}): WatchWindowEntry {
  return {
    pid: params.pid,
    sessionId: params.sessionId,
    launcher: params.launcher,
    ownerPid: params.ownerPid,
    ownerTty: params.ownerTty,
    ownerCmd: params.ownerCmd,
    startedAtUtc: nowIso()
  };
}
