import fs from 'node:fs';
import path from 'node:path';

export function sessionsDir(baseDir: string): string {
  return path.join(baseDir, 'sessions');
}

export function listSessions(baseDir: string): string[] {
  const dir = sessionsDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name !== 'current')
    .sort((a, b) => b.localeCompare(a));
}

export interface SessionSelector {
  sessionId?: string;
  sessionNumber?: string;
}

export function resolveSessionId(baseDir: string, opts: SessionSelector): string {
  if (opts.sessionId) return opts.sessionId;
  const sessions = listSessions(baseDir);
  if (opts.sessionNumber) {
    const idx = Number(opts.sessionNumber);
    if (!Number.isFinite(idx) || idx < 1 || idx > sessions.length) {
      throw new Error(`session-number inválido: ${opts.sessionNumber}`);
    }
    return sessions[idx - 1];
  }
  return 'current';
}

export function formatSessions(baseDir: string): Array<{ n: number; id: string }> {
  return listSessions(baseDir).map((id, i) => ({ n: i + 1, id }));
}
