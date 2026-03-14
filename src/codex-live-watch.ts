#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { baseDirFromImportMeta } from './lib/runtime.js';
import { newWatchWindowEntry, registerWatchWindow, unregisterWatchWindow } from './lib/watch-windows.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);

async function main(): Promise<number> {
  const target = process.argv[2] ?? 'last';
  const extraArgs = process.argv.slice(3);
  const asWindow = process.env.CODEX_WATCH_WINDOW === '1';
  const launcher = process.env.CODEX_WATCH_LAUNCHER || 'direct';
  const ownerPid = Number(process.env.CODEX_WATCH_OPEN_PID || '0') || 0;
  const ownerTty = process.env.CODEX_WATCH_OPEN_TTY || '(unknown)';
  const ownerCmd = process.env.CODEX_WATCH_OWNER_CMD || '';

  if (asWindow) {
    registerWatchWindow(
      BASE_DIR,
      newWatchWindowEntry({
        pid: process.pid,
        sessionId: target,
        launcher,
        ownerPid,
        ownerTty,
        ownerCmd
      })
    );
  }

  const cliPath = path.join(BASE_DIR, 'dist', 'codex-live.js');
  const child = spawn(
    process.execPath,
    [cliPath, 'capture', target, '--follow', '--behind', ...extraArgs],
    {
      cwd: BASE_DIR,
      env: { ...process.env },
      stdio: 'inherit'
    }
  );

  return await new Promise<number>((resolve) => {
    const cleanup = () => {
      if (asWindow) unregisterWatchWindow(BASE_DIR, process.pid);
    };

    const onSigint = () => {
      try {
        child.kill('SIGINT');
      } catch {
        // ignore
      }
    };

    process.on('SIGINT', onSigint);
    child.on('close', (code) => {
      process.off('SIGINT', onSigint);
      cleanup();
      resolve(code ?? 0);
    });
    child.on('error', () => {
      process.off('SIGINT', onSigint);
      cleanup();
      resolve(1);
    });
  });
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(1));
