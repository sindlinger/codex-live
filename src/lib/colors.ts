export const colors = {
  reset: '\u001b[0m',
  stage: '\u001b[38;5;110m',
  dodgeBlue: '\u001b[38;5;74m',
  cmd: '\u001b[38;5;108m',
  ok: '\u001b[38;5;108m',
  fail: '\u001b[38;5;174m',
  warn: '\u001b[38;5;180m',
  dim: '\u001b[38;5;245m',
  file: '\u001b[38;5;111m'
} as const;

export function useColor(): boolean {
  return true;
}

export function paint(value: string, color: string): string {
  if (!useColor()) return String(value);
  return `${color}${value}${colors.reset}`;
}

export const stage = (msg: string): string => paint(msg, colors.stage);
export const dodgeBlue = (msg: string): string => paint(msg, colors.dodgeBlue);
export const ok = (msg: string): string => paint(msg, colors.ok);
export const warn = (msg: string): string => paint(msg, colors.warn);
export const fail = (msg: string): string => paint(msg, colors.fail);
export const file = (msg: string): string => paint(msg, colors.file);
export const dim = (msg: string): string => paint(msg, colors.dim);
export const cmd = (msg: string): string => paint(msg, colors.cmd);
