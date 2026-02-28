import fs from 'node:fs';
import path from 'node:path';

export function sessionsDir(baseDir) {
  return path.join(baseDir, 'sessions');
}

export function listSessions(baseDir) {
  const dir = sessionsDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  const items = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n !== 'current')
    .sort((a, b) => b.localeCompare(a));
  return items;
}

export function resolveSessionId(baseDir, opts = {}) {
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

export function formatSessions(baseDir) {
  const sessions = listSessions(baseDir);
  return sessions.map((id, i) => ({ n: i + 1, id }));
}
