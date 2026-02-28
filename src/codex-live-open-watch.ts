#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { baseDirFromImportMeta, shellJoin } from './lib/runtime.js';
import { commandExists } from './lib/proc.js';
import { ok, warn } from './lib/colors.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);

function psQuoteSingle(value: string): string {
  return value.replace(/'/g, "''");
}

function openInPowerShell(sessionId: string): boolean {
  if (!commandExists('powershell.exe')) return false;

  const inner = `cd ${BASE_DIR} && ${process.execPath} ${BASE_DIR}/dist/codex-live-watch.js ${sessionId}`;
  const ps = `$cmd='wsl.exe -e bash -lc ''${psQuoteSingle(inner)}'''; Start-Process powershell.exe -ArgumentList @('-NoExit','-Command',$cmd)`;

  const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
  return (res.status ?? 1) === 0;
}

function openLinuxTerminal(sessionId: string): boolean {
  const watchCmd = `cd '${BASE_DIR}' && '${process.execPath}' '${BASE_DIR}/dist/codex-live-watch.js' '${sessionId}'; exec bash`;

  if (commandExists('gnome-terminal')) {
    const res = spawnSync('gnome-terminal', ['--', 'bash', '-lc', watchCmd], { stdio: 'ignore' });
    if ((res.status ?? 1) === 0) return true;
  }

  if (commandExists('x-terminal-emulator')) {
    const res = spawnSync('x-terminal-emulator', ['-e', 'bash', '-lc', watchCmd], { stdio: 'ignore' });
    if ((res.status ?? 1) === 0) return true;
  }

  return false;
}

function main(): number {
  const sessionId = process.argv[2] ?? 'current';

  if (openInPowerShell(sessionId)) {
    console.log(ok('Janela de watch solicitada no Windows PowerShell.'));
    return 0;
  }

  if (openLinuxTerminal(sessionId)) return 0;

  console.log(warn('Não consegui abrir nova janela automaticamente. Rode manualmente:'));
  console.log(shellJoin(['cd', BASE_DIR, '&&', process.execPath, `${BASE_DIR}/dist/codex-live-watch.js`, sessionId]));
  return 1;
}

process.exit(main());
