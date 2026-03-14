import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function baseDirFromImportMeta(importMetaUrl: string): string {
  const selfFile = fileURLToPath(importMetaUrl);
  return path.resolve(path.dirname(selfFile), '..');
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function nowCompactUtc(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_\-./:@]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function shellJoin(args: string[]): string {
  return args.map(shellQuote).join(' ');
}
