export const colors = {
  reset: '\u001b[0m',
  stage: '\u001b[1;34m',
  cmd: '\u001b[1;32m',
  ok: '\u001b[1;32m',
  fail: '\u001b[1;31m',
  warn: '\u001b[1;33m',
  dim: '\u001b[0;37m',
  file: '\u001b[1;34m',
};

export function useColor() {
  return process.stdout.isTTY && process.env.NO_COLOR !== '1';
}

export function paint(s, c) {
  if (!useColor()) return String(s);
  return `${c}${s}${colors.reset}`;
}

export function stage(msg) {
  return paint(msg, colors.stage);
}

export function ok(msg) {
  return paint(msg, colors.ok);
}

export function warn(msg) {
  return paint(msg, colors.warn);
}

export function fail(msg) {
  return paint(msg, colors.fail);
}

export function file(msg) {
  return paint(msg, colors.file);
}

export function dim(msg) {
  return paint(msg, colors.dim);
}
