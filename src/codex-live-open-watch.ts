#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { baseDirFromImportMeta, shellJoin } from './lib/runtime.js';
import { commandExists } from './lib/proc.js';
import { ok, warn, stage, dim } from './lib/colors.js';
import { closeActiveWatchWindows, getCurrentTty } from './lib/watch-windows.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const OPEN_LOG = path.join(BASE_DIR, 'logs', 'open-watch.log');

function appendOpenLog(message: string): void {
  try {
    fs.mkdirSync(path.dirname(OPEN_LOG), { recursive: true });
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    fs.appendFileSync(OPEN_LOG, `[${ts}] ${message}\n`, 'utf8');
  } catch {
    // ignore log failures
  }
}

function shDoubleQuote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

function buildWatchInnerCommand(target: string, launcher: string, ownerTty: string): string {
  const ownerPid = process.pid;
  const ownerCmd = `codex-live open-watch ${target}`;
  const envPrefix = [
    'CODEX_WATCH_WINDOW=1',
    `CODEX_WATCH_LAUNCHER=${shDoubleQuote(launcher)}`,
    `CODEX_WATCH_OPEN_PID=${ownerPid}`,
    `CODEX_WATCH_OPEN_TTY=${shDoubleQuote(ownerTty)}`,
    `CODEX_WATCH_OWNER_CMD=${shDoubleQuote(ownerCmd)}`
  ].join(' ');
  const watchExec = `${shDoubleQuote(process.execPath)} ${shDoubleQuote(`${BASE_DIR}/dist/codex-live-watch.js`)} ${shDoubleQuote(target)}`;
  return `cd ${shDoubleQuote(BASE_DIR)} && ${envPrefix} ${watchExec}`;
}

function buildOpenWatchScriptCommand(target: string, launcher: string, ownerTty: string): string {
  const script = `${BASE_DIR}/scripts/open-watch-window.sh`;
  return shellJoin([
    script,
    target,
    launcher,
    String(process.pid),
    ownerTty,
    'codex-live-open'
  ]);
}

function openInTmux(target: string, ownerTty: string): boolean {
  if (!commandExists('tmux')) return false;
  const client = spawnSync('tmux', ['display-message', '-p', '#{client_tty}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const clientTty = (client.stdout ?? '').trim();
  appendOpenLog(
    `open_tmux_client_check status=${client.status ?? -1} client_tty=${clientTty || '(none)'} stderr=${(client.stderr ?? '').trim()}`
  );
  if ((client.status ?? 1) !== 0 || !clientTty) return false;

  const popupCmd = buildOpenWatchScriptCommand(target, 'tmux-popup', ownerTty);

  // Prefer popup when there is a current client.
  let res = spawnSync('tmux', ['display-popup', '-E', '-w', '70%', '-h', '55%', popupCmd], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  appendOpenLog(`open_tmux_popup status=${res.status ?? -1} stdout=${(res.stdout ?? '').trim()} stderr=${(res.stderr ?? '').trim()}`);
  if ((res.status ?? 1) === 0) return true;

  // Fallback to a new tmux window if popup is unavailable.
  const newWindowCmd = buildOpenWatchScriptCommand(target, 'tmux-window', ownerTty);
  res = spawnSync('tmux', ['new-window', '-n', 'codex-watch', newWindowCmd], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  appendOpenLog(`open_tmux_new_window status=${res.status ?? -1} stdout=${(res.stdout ?? '').trim()} stderr=${(res.stderr ?? '').trim()}`);
  return (res.status ?? 1) === 0;
}

function openLinuxTerminal(target: string, ownerTty: string): boolean {
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!hasDisplay) {
    appendOpenLog('open_linux_terminal skip=no_display');
    return false;
  }
  const watchCmd = `${buildWatchInnerCommand(target, 'linux-terminal', ownerTty)}; exec bash`;

  if (commandExists('gnome-terminal')) {
    const res = spawnSync('gnome-terminal', ['--', 'bash', '-lc', watchCmd], {
      stdio: 'ignore',
      timeout: 3000
    });
    appendOpenLog(`open_linux_gnome status=${res.status ?? -1} signal=${res.signal ?? ''}`);
    if ((res.status ?? 1) === 0) return true;
  }

  if (commandExists('x-terminal-emulator')) {
    const res = spawnSync('x-terminal-emulator', ['-e', 'bash', '-lc', watchCmd], {
      stdio: 'ignore',
      timeout: 3000
    });
    appendOpenLog(`open_linux_xterm status=${res.status ?? -1} signal=${res.signal ?? ''}`);
    if ((res.status ?? 1) === 0) return true;
  }

  return false;
}

function main(): number {
  const target = process.argv[2] ?? 'last';
  const ownerTty = getCurrentTty();
  appendOpenLog(`open_start pid=${process.pid} target=${target} owner_tty=${ownerTty}`);

  const prune = closeActiveWatchWindows(BASE_DIR);
  console.log(stage('[watch-windows]'), `abertas antes=${prune.before} fechadas=${prune.closed.length} falhas=${prune.failed.length} restantes=${prune.remaining.length}`);
  if (prune.closed.length > 0) {
    for (const w of prune.closed) {
      console.log(`  ${dim('-')} closed pid=${w.pid} target=${w.sessionId} launcher=${w.launcher} owner_tty=${w.ownerTty}`);
    }
  }
  if (prune.failed.length > 0) {
    for (const w of prune.failed) {
      console.log(`  ${warn('!')} failed pid=${w.pid} target=${w.sessionId} launcher=${w.launcher} owner_tty=${w.ownerTty}`);
    }
  }

  if (openInTmux(target, ownerTty)) {
    appendOpenLog('open_result launcher=tmux status=ok');
    console.log(ok('Janela de watch aberta no tmux (WSL).'));
    console.log(dim(`log: ${OPEN_LOG}`));
    return 0;
  }

  if (openLinuxTerminal(target, ownerTty)) {
    appendOpenLog('open_result launcher=linux-terminal status=ok');
    console.log(ok('Janela de watch aberta em terminal Linux (WSL).'));
    console.log(dim(`log: ${OPEN_LOG}`));
    return 0;
  }

  appendOpenLog('open_result launcher=none status=fail');
  console.log(warn('Não consegui abrir nova janela automaticamente. Rode manualmente:'));
  console.log(shellJoin(['cd', BASE_DIR, '&&', process.execPath, `${BASE_DIR}/dist/codex-live-watch.js`, target]));
  console.log(dim(`log: ${OPEN_LOG}`));
  return 1;
}

process.exit(main());
