#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { baseDirFromImportMeta, shellJoin } from './lib/runtime.js';
import { commandExists } from './lib/proc.js';
import { ok, warn, stage, dim } from './lib/colors.js';
import { closeActiveWatchWindows, getCurrentTty } from './lib/watch-windows.js';
const BASE_DIR = baseDirFromImportMeta(import.meta.url);
function psQuoteSingle(value) {
    return value.replace(/'/g, "''");
}
function shDoubleQuote(value) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`');
    return `"${escaped}"`;
}
function buildWatchInnerCommand(sessionId, launcher, ownerTty) {
    const ownerPid = process.pid;
    const ownerCmd = `codex-live open ${sessionId}`;
    const envPrefix = [
        'CODEX_WATCH_WINDOW=1',
        `CODEX_WATCH_LAUNCHER=${shDoubleQuote(launcher)}`,
        `CODEX_WATCH_OPEN_PID=${ownerPid}`,
        `CODEX_WATCH_OPEN_TTY=${shDoubleQuote(ownerTty)}`,
        `CODEX_WATCH_OWNER_CMD=${shDoubleQuote(ownerCmd)}`
    ].join(' ');
    const watchExec = `${shDoubleQuote(process.execPath)} ${shDoubleQuote(`${BASE_DIR}/dist/codex-live-watch.js`)} ${shDoubleQuote(sessionId)}`;
    return `cd ${shDoubleQuote(BASE_DIR)} && ${envPrefix} ${watchExec}`;
}
function openInPowerShell(sessionId, ownerTty) {
    if (!commandExists('powershell.exe'))
        return false;
    const ownerTtySafe = ownerTty.replace(/\s+/g, '_');
    const psArgs = [
        '-e',
        'env',
        'CODEX_WATCH_WINDOW=1',
        'CODEX_WATCH_LAUNCHER=powershell',
        `CODEX_WATCH_OPEN_PID=${process.pid}`,
        `CODEX_WATCH_OPEN_TTY=${ownerTtySafe}`,
        'CODEX_WATCH_OWNER_CMD=codex-live-open',
        process.execPath,
        `${BASE_DIR}/dist/codex-live-watch.js`,
        sessionId
    ];
    const psArray = psArgs.map((a) => `'${psQuoteSingle(a)}'`).join(',');
    const ps = `$a=@(${psArray}); Start-Process wsl.exe -ArgumentList $a`;
    const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
    return (res.status ?? 1) === 0;
}
function openLinuxTerminal(sessionId, ownerTty) {
    const watchCmd = `${buildWatchInnerCommand(sessionId, 'linux-terminal', ownerTty)}; exec bash`;
    if (commandExists('gnome-terminal')) {
        const res = spawnSync('gnome-terminal', ['--', 'bash', '-lc', watchCmd], { stdio: 'ignore' });
        if ((res.status ?? 1) === 0)
            return true;
    }
    if (commandExists('x-terminal-emulator')) {
        const res = spawnSync('x-terminal-emulator', ['-e', 'bash', '-lc', watchCmd], { stdio: 'ignore' });
        if ((res.status ?? 1) === 0)
            return true;
    }
    return false;
}
function main() {
    const sessionId = process.argv[2] ?? 'current';
    const ownerTty = getCurrentTty();
    const prune = closeActiveWatchWindows(BASE_DIR);
    console.log(stage('[watch-windows]'), `abertas antes=${prune.before} fechadas=${prune.closed.length} falhas=${prune.failed.length} restantes=${prune.remaining.length}`);
    if (prune.closed.length > 0) {
        for (const w of prune.closed) {
            console.log(`  ${dim('-')} closed pid=${w.pid} session=${w.sessionId} launcher=${w.launcher} owner_tty=${w.ownerTty}`);
        }
    }
    if (prune.failed.length > 0) {
        for (const w of prune.failed) {
            console.log(`  ${warn('!')} failed pid=${w.pid} session=${w.sessionId} launcher=${w.launcher} owner_tty=${w.ownerTty}`);
        }
    }
    if (openInPowerShell(sessionId, ownerTty)) {
        console.log(ok('Janela de watch solicitada no Windows PowerShell.'));
        return 0;
    }
    if (openLinuxTerminal(sessionId, ownerTty))
        return 0;
    console.log(warn('Não consegui abrir nova janela automaticamente. Rode manualmente:'));
    console.log(shellJoin(['cd', BASE_DIR, '&&', process.execPath, `${BASE_DIR}/dist/codex-live-watch.js`, sessionId]));
    return 1;
}
process.exit(main());
