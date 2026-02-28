#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { baseDirFromImportMeta } from './lib/runtime.js';
import { loadConfig, saveConfig, resolveRepo } from './lib/config.js';
import { resolveSessionId, formatSessions } from './lib/sessions.js';
import { runProcess } from './lib/proc.js';
import { stage, ok, fail, file, dim } from './lib/colors.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const BIN_DIR = path.join(BASE_DIR, 'bin');

type ParsedOpts = {
  repo?: string;
  sessionId?: string;
  sessionNumber?: string;
  range?: string;
  model?: string;
  input?: string;
  probe?: boolean;
  params: string[];
  width?: string;
  height?: string;
  help?: boolean;
};

function usage(): void {
  console.log(`${stage('codex-live')} ${dim('(Node+TS CLI)')}\n\n${stage('Comandos:')}\n  codex-live repos list\n  codex-live repos add <nome> <path>\n  codex-live repos use <nome|path>\n  codex-live repos remove <nome>\n\n  codex-live sessions list\n\n  codex-live run [--repo <nome|path>] [--session-id <id>|--session-number <n>] -- <comando> [args]\n  codex-live pipeline [--repo <nome|path>] [--session-id <id>|--session-number <n>] [--range <1-12>] [--model <alias>] [--input <alias>] [--probe] [--param <arg>]...\n\n  codex-live watch [--session-id <id>|--session-number <n>]\n  codex-live open-watch [--session-id <id>|--session-number <n>]\n  codex-live popup [--session-id <id>|--session-number <n>] [--width <92%>] [--height <85%>]\n\n${stage('Exemplos:')}\n  codex-live pipeline --repo operpdf --range 1-12 --model @M-DESP --input :Q22 --probe\n  codex-live run --repo /mnt/c/git/operpdf-textopsalign -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe\n  codex-live popup --session-number 1 --width 70% --height 55%\n  codex-live sessions list`);
}

function parseOpts(args: string[]): { opts: ParsedOpts; rest: string[] } {
  const opts: ParsedOpts = { params: [] };
  const rest: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (a === '--repo') { opts.repo = args[++i]; continue; }
    if (a === '--session-id' || a === '--section-id') { opts.sessionId = args[++i]; continue; }
    if (a === '--session-number' || a === '--section-number' || a === '--number') { opts.sessionNumber = args[++i]; continue; }
    if (a === '--range') { opts.range = args[++i]; continue; }
    if (a === '--model') { opts.model = args[++i]; continue; }
    if (a === '--input') { opts.input = args[++i]; continue; }
    if (a === '--probe') { opts.probe = true; continue; }
    if (a === '--param') { opts.params.push(args[++i]); continue; }
    if (a === '--width') { opts.width = args[++i]; continue; }
    if (a === '--height') { opts.height = args[++i]; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    rest.push(a);
  }

  return { opts, rest };
}

function ensureBin(name: string): string {
  const p = path.join(BIN_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`bin não encontrado: ${p}`);
  return p;
}

async function cmdRepos(subArgs: string[]): Promise<number> {
  const cfg = loadConfig(BASE_DIR);
  const [action, ...rest] = subArgs;

  if (!action || action === 'list') {
    console.log(stage('Repos cadastrados:'));
    const keys = Object.keys(cfg.repos).sort();
    if (keys.length === 0) {
      console.log('  (nenhum)');
      return 0;
    }
    for (const k of keys) {
      const mark = cfg.defaultRepo === k ? ok(' [default]') : '';
      console.log(`  ${k} -> ${file(cfg.repos[k])}${mark}`);
    }
    return 0;
  }

  if (action === 'add') {
    if (rest.length < 2) throw new Error('uso: repos add <nome> <path>');
    const [name, repoPath] = rest;
    cfg.repos[name] = repoPath;
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`repo adicionado: ${name} -> ${repoPath}`));
    return 0;
  }

  if (action === 'use') {
    if (rest.length < 1) throw new Error('uso: repos use <nome|path>');
    cfg.defaultRepo = rest[0];
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`default repo definido: ${cfg.defaultRepo}`));
    return 0;
  }

  if (action === 'remove') {
    if (rest.length < 1) throw new Error('uso: repos remove <nome>');
    delete cfg.repos[rest[0]];
    if (cfg.defaultRepo === rest[0]) cfg.defaultRepo = '';
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`repo removido: ${rest[0]}`));
    return 0;
  }

  throw new Error(`ação repos inválida: ${action}`);
}

async function cmdSessions(): Promise<number> {
  const rows = formatSessions(BASE_DIR);
  console.log(stage('Sessões disponíveis:'));
  if (rows.length === 0) {
    console.log('  (nenhuma)');
    return 0;
  }
  for (const r of rows) console.log(`  ${dim(String(r.n).padStart(3, ' '))}  ${file(r.id)}`);
  return 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const { opts, rest } = parseOpts(args);
  if (opts.help) {
    console.log('uso: codex-live run [--repo <nome|path>] [--session-id <id>|--session-number <n>] -- <comando> [args]');
    return 0;
  }
  if (rest.length === 0) throw new Error('faltou comando após run');

  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionId(BASE_DIR, opts);
  const bin = ensureBin('codex-live-run');

  const callArgs: string[] = [];
  if (sessionId && sessionId !== 'current') callArgs.push('--session', sessionId);
  callArgs.push('--repo', repo, '--', ...rest);

  console.log(stage('Executando via codex-live-run:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} cmd=${dim(rest.join(' '))}`);
  return runProcess(bin, callArgs);
}

async function cmdPipeline(args: string[]): Promise<number> {
  const { opts } = parseOpts(args);
  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionId(BASE_DIR, opts);
  const bin = ensureBin('codex-live-run');

  const range = opts.range ?? '1-12';
  const model = opts.model ?? '@M-DESP';
  const input = opts.input ?? ':Q22';

  const cmdLine = ['./run.exe', range, '--inputs', model, '--inputs', input];
  if (opts.probe) cmdLine.push('--probe');
  cmdLine.push(...opts.params);

  const callArgs: string[] = [];
  if (sessionId && sessionId !== 'current') callArgs.push('--session', sessionId);
  callArgs.push('--repo', repo, '--', ...cmdLine);

  console.log(stage('Pipeline preparado:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} range=${range} model=${model} input=${input} probe=${opts.probe ? 'true' : 'false'}`);
  return runProcess(bin, callArgs);
}

async function cmdWatch(args: string[], mode: 'watch' | 'open-watch' | 'popup'): Promise<number> {
  const { opts } = parseOpts(args);
  const sessionId = resolveSessionId(BASE_DIR, opts);
  const map: Record<typeof mode, string> = {
    watch: 'codex-live-watch',
    'open-watch': 'codex-live-open-watch',
    popup: 'codex-popup'
  };
  const bin = ensureBin(map[mode]);

  const callArgs = [sessionId];
  if (mode === 'popup') {
    if (opts.width) callArgs.push('--width', opts.width);
    if (opts.height) callArgs.push('--height', opts.height);
  }

  console.log(stage(`Abrindo ${mode}:`), `session=${file(sessionId)}`);
  return runProcess(bin, callArgs);
}

async function main(): Promise<number> {
  const [cmdName, ...args] = process.argv.slice(2);
  if (!cmdName || cmdName === '--help' || cmdName === '-h' || cmdName === 'help') {
    usage();
    return 0;
  }

  try {
    switch (cmdName) {
      case 'repos': return cmdRepos(args);
      case 'sessions': return cmdSessions();
      case 'run': return cmdRun(args);
      case 'pipeline': return cmdPipeline(args);
      case 'watch': return cmdWatch(args, 'watch');
      case 'open-watch': return cmdWatch(args, 'open-watch');
      case 'popup': return cmdWatch(args, 'popup');
      default:
        throw new Error(`comando inválido: ${cmdName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(fail(`erro: ${message}`));
    console.error(dim('use: codex-live help'));
    return 2;
  }
}

main().then((code) => process.exit(code));
