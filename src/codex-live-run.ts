#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { stage, cmd as cmdColor, ok, fail, file } from './lib/colors.js';
import { baseDirFromImportMeta, ensureDir, nowCompactUtc, nowIso, shellJoin, updateCurrentSymlink } from './lib/runtime.js';
import { commandExists, runAndCapture } from './lib/proc.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);

function usage(): void {
  console.log(`Uso:\n  codex-live-run [--session <id>] [--repo <path>] -- <comando> [args...]\n  codex-live-run [--session <id>] [--repo <path>] <comando> [args...]`);
}

function appendLine(filePath: string, line: string): void {
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function appendMultiline(filePath: string, prefix: string, value: string): void {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    appendLine(filePath, `${prefix} ${line}`);
  }
}

function parseArgs(argv: string[]): { sessionId?: string; repoDir: string; cmd: string[] } {
  let sessionId: string | undefined;
  let repoDir = process.cwd();
  const args = [...argv];

  while (args.length > 0) {
    const head = args[0];
    if (head === '--session') {
      args.shift();
      if (args.length === 0) throw new Error('--session exige valor');
      sessionId = args.shift();
      continue;
    }
    if (head === '--repo') {
      args.shift();
      if (args.length === 0) throw new Error('--repo exige valor');
      repoDir = args.shift() as string;
      continue;
    }
    if (head === '--help' || head === '-h') {
      usage();
      process.exit(0);
    }
    if (head === '--') {
      args.shift();
      break;
    }
    break;
  }

  if (args.length === 0) throw new Error('faltou comando');
  return { sessionId, repoDir, cmd: args };
}

async function main(): Promise<number> {
  const { sessionId: requestedSessionId, repoDir, cmd } = parseArgs(process.argv.slice(2));
  const sessionId = requestedSessionId || `${nowCompactUtc()}__${Math.floor(Math.random() * 1_000_000)}`;

  const sessionDir = path.join(BASE_DIR, 'sessions', sessionId);
  ensureDir(sessionDir);
  ensureDir(path.join(BASE_DIR, 'sessions'));
  updateCurrentSymlink(BASE_DIR, sessionDir);

  const commandsLog = path.join(sessionDir, 'commands.log');
  const outputLog = path.join(sessionDir, 'output.log');
  const timelineLog = path.join(sessionDir, 'timeline.log');
  const eventsLog = path.join(sessionDir, 'events.jsonl');
  const metaJson = path.join(sessionDir, 'meta.json');

  const startedAt = nowIso();
  const pidNow = process.pid;
  const cmdPretty = shellJoin(cmd);

  fs.writeFileSync(
    metaJson,
    `${JSON.stringify({ session_id: sessionId, repo_dir: repoDir, started_at: startedAt, runner_pid: pidNow }, null, 2)}\n`,
    'utf8'
  );

  const startLine = `[${startedAt}] ${cmdColor('$')} ${cmdPretty}`;
  console.log(startLine);
  appendLine(commandsLog, startLine);
  appendLine(timelineLog, `[${startedAt}] [CMD] ${cmdPretty}`);
  appendLine(timelineLog, `[${startedAt}] [INFO] repo=${repoDir}`);
  appendLine(eventsLog, JSON.stringify({ ts: startedAt, event: 'command_start', cmd: cmdPretty, repo: repoDir }));

  let code = 1;
  let combined = '';
  if (commandExists('script')) {
    const scripted = await runAndCapture(
      'script',
      ['-q', '-e', '-f', '-c', cmdPretty, '/dev/null'],
      {
        cwd: repoDir,
        env: { ...process.env, TERM: process.env.TERM || 'xterm-256color' }
      }
    );
    code = scripted.code;
    combined = scripted.combined;
  } else {
    const [binary, ...args] = cmd;
    const direct = await runAndCapture(binary, args, {
      cwd: repoDir,
      env: { ...process.env }
    });
    code = direct.code;
    combined = direct.combined;
  }
  const endedAt = nowIso();
  if (combined.length > 0) {
    fs.appendFileSync(outputLog, combined, 'utf8');
    appendMultiline(timelineLog, `[${endedAt}] [OUT]`, combined);
  }

  const statusLabel = code === 0 ? 'ok' : 'fail';
  const endColor = code === 0 ? ok : fail;
  const endLine = `[${endedAt}] ${endColor(`exit=${code} (${statusLabel})`)} :: ${cmdPretty}`;
  console.log(endLine);
  appendLine(commandsLog, endLine);
  appendLine(timelineLog, `[${endedAt}] [EXIT] code=${code} status=${statusLabel} :: ${cmdPretty}`);
  appendLine(eventsLog, JSON.stringify({ ts: endedAt, event: 'command_end', exit: code, status: statusLabel, cmd: cmdPretty }));

  console.log(stage('Sessão:'), file(sessionDir));
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(fail(`erro: ${message}`));
    usage();
    process.exit(2);
  });
