#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { baseDirFromImportMeta, ensureDir, nowCompactUtc, nowIso, updateCurrentSymlink } from './lib/runtime.js';
import { stage, dim, file, fail } from './lib/colors.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const WATCH_AUDIT_FILE = process.env.CODEX_WATCH_AUDIT_FILE || '';

function watchAudit(message: string): void {
  if (!WATCH_AUDIT_FILE) return;
  ensureDir(path.dirname(WATCH_AUDIT_FILE));
  fs.appendFileSync(WATCH_AUDIT_FILE, `[${nowIso()}] ${message}\n`, 'utf8');
}

function resolveSessionDir(sessionId: string): string {
  const sessionsBase = path.join(BASE_DIR, 'sessions');
  ensureDir(sessionsBase);

  if (sessionId === 'current') {
    const currentLink = path.join(sessionsBase, 'current');
    try {
      const stat = fs.lstatSync(currentLink);
      if (stat.isSymbolicLink()) {
        return fs.realpathSync(currentLink);
      }
    } catch {
      // will create below
    }

    const generated = path.join(sessionsBase, `${nowCompactUtc()}__watch_only`);
    ensureDir(generated);
    updateCurrentSymlink(BASE_DIR, generated);
    return generated;
  }

  const custom = path.join(sessionsBase, sessionId);
  ensureDir(custom);
  updateCurrentSymlink(BASE_DIR, custom);
  return custom;
}

async function main(): Promise<number> {
  const sessionId = process.argv[2] ?? 'current';
  const sessionDir = resolveSessionDir(sessionId);

  const commandsLog = path.join(sessionDir, 'commands.log');
  const outputLog = path.join(sessionDir, 'output.log');
  const eventsLog = path.join(sessionDir, 'events.jsonl');

  fs.closeSync(fs.openSync(commandsLog, 'a'));
  fs.closeSync(fs.openSync(outputLog, 'a'));
  fs.closeSync(fs.openSync(eventsLog, 'a'));

  watchAudit(`watch_start pid=${process.pid} argv=${process.argv.slice(2).join(' ')}`);

  console.log(`${stage('[codex-live-watch]')} sessão: ${file(sessionDir)}`);
  console.log(`${stage('[codex-live-watch]')} logs:`);
  console.log(`  - ${file(commandsLog)}`);
  console.log(`  - ${file(outputLog)}`);
  console.log(`  - ${file(eventsLog)}`);
  if (WATCH_AUDIT_FILE) console.log(`  - ${file(WATCH_AUDIT_FILE)}`);
  console.log('');
  console.log(`${dim('Dica:')} rode em outro terminal:`);
  console.log(`  ${dim('codex-live exec --repo /mnt/c/git/operpdf-textopsalign -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe')}`);
  console.log('');
  console.log(`${dim('Modo:')} histórico completo + acompanhamento em tempo real`);
  console.log('');

  const tail = spawn('tail', ['-n', '+1', '-F', commandsLog, outputLog], {
    stdio: 'inherit'
  });

  const signalHandler = (signalName: NodeJS.Signals, code: number) => {
    watchAudit(`watch_signal pid=${process.pid} sig=${signalName}`);
    if (!tail.killed) {
      try { tail.kill('SIGTERM'); } catch { /* ignore */ }
    }
    watchAudit(`watch_exit pid=${process.pid} code=${code}`);
    process.exit(code);
  };

  process.on('SIGHUP', () => signalHandler('SIGHUP', 129));
  process.on('SIGINT', () => signalHandler('SIGINT', 130));
  process.on('SIGQUIT', () => signalHandler('SIGQUIT', 131));
  process.on('SIGTERM', () => signalHandler('SIGTERM', 143));

  return await new Promise<number>((resolve) => {
    tail.on('close', (code, signal) => {
      const finalCode = signal ? 128 : (code ?? 1);
      watchAudit(`watch_exit pid=${process.pid} code=${finalCode}`);
      resolve(finalCode);
    });
    tail.on('error', () => {
      watchAudit(`watch_exit pid=${process.pid} code=1`);
      resolve(1);
    });
  });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(fail(`erro: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
