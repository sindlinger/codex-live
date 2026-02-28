export const colors = {
    reset: '\u001b[0m',
    stage: '\u001b[1;34m',
    dodgeBlue: '\u001b[38;5;39m',
    cmd: '\u001b[1;32m',
    ok: '\u001b[1;32m',
    fail: '\u001b[1;31m',
    warn: '\u001b[1;33m',
    dim: '\u001b[0;37m',
    file: '\u001b[1;34m'
};
export function useColor() {
    return true;
}
export function paint(value, color) {
    if (!useColor())
        return String(value);
    return `${color}${value}${colors.reset}`;
}
export const stage = (msg) => paint(msg, colors.stage);
export const dodgeBlue = (msg) => paint(msg, colors.dodgeBlue);
export const ok = (msg) => paint(msg, colors.ok);
export const warn = (msg) => paint(msg, colors.warn);
export const fail = (msg) => paint(msg, colors.fail);
export const file = (msg) => paint(msg, colors.file);
export const dim = (msg) => paint(msg, colors.dim);
export const cmd = (msg) => paint(msg, colors.cmd);
