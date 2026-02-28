export const colors = {
  reset: '\u001b[0m',
  stage: '\u001b[1;34m',
  cmd: '\u001b[1;32m',
  ok: '\u001b[1;32m',
  fail: '\u001b[1;31m',
  warn: '\u001b[1;33m',
  dim: '\u001b[0;37m',
  file: '\u001b[1;34m'
} as const;

export function useColor(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== '1';
}

export function paint(value: string, color: string): string {
  if (!useColor()) return String(value);
  return `${color}${value}${colors.reset}`;
}

export const stage = (msg: string): string => paint(msg, colors.stage);
export const ok = (msg: string): string => paint(msg, colors.ok);
export const warn = (msg: string): string => paint(msg, colors.warn);
export const fail = (msg: string): string => paint(msg, colors.fail);
export const file = (msg: string): string => paint(msg, colors.file);
export const dim = (msg: string): string => paint(msg, colors.dim);
export const cmd = (msg: string): string => paint(msg, colors.cmd);
