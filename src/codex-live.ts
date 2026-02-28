#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { baseDirFromImportMeta } from './lib/runtime.js';
import { loadConfig, saveConfig, resolveRepo, type LiveConfig } from './lib/config.js';
import { resolveSessionId, formatSessions } from './lib/sessions.js';
import { commandExists, runProcess } from './lib/proc.js';
import { stage, dodgeBlue, ok, fail, file, dim } from './lib/colors.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const DIST_DIR = path.join(BASE_DIR, 'dist');
const HOME_TMUX_CONF = path.join(process.env.HOME ?? '', '.tmux.conf');
const LOCAL_TMUX_CONF = path.join(BASE_DIR, '.tmux.conf');

type ParsedOpts = {
  repo?: string;
  session?: string;
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
  console.log('Codex live session orchestrator.\n');
  console.log(`Usage: ${dodgeBlue('codex-live')} [OPTIONS] <COMMAND>\n`);

  console.log('Commands:');
  console.log(`  ${dodgeBlue('repo')}${dim('      Repositories (ls/add/use/rm)')}`);
  console.log(`  ${dodgeBlue('session')}${dim('   Sessions (ls/use/show/clear)')}`);
  console.log(`  ${dodgeBlue('flow')}${dim('      Extraction flow (run/quick)')}`);
  console.log(`  ${dodgeBlue('exec')}${dim('      Execute any command with logging')}`);
  console.log(`  ${dodgeBlue('codex')}${dim('     Run original codex with logging')}`);
  console.log(`  ${dodgeBlue('watch')}${dim('     Follow current session logs')}`);
  console.log(`  ${dodgeBlue('open')}${dim('      Open watcher in another terminal')}`);
  console.log(`  ${dodgeBlue('popup')}${dim('     Open watcher in tmux popup')}`);
  console.log(`  ${dodgeBlue('tmux')}${dim('      Open tmux workspace (codex + watch)')}`);
  console.log(`  ${dodgeBlue('help')}${dim('      Show this help')}\n`);

  console.log('Options:');
  console.log(`  --repo <REPO>${dim('       Repository name or path')}`);
  console.log(`  --session <SESSION>${dim(' Session id, number, or current')}`);
  console.log(`  -h, --help${dim('              Show help')}\n`);

  console.log('Examples:');
  console.log(`  ${dodgeBlue('codex-live flow run')}`);
  console.log(`  ${dodgeBlue('codex-live flow quick :Q150 --probe')}`);
  console.log(`  ${dodgeBlue('codex-live exec -- git status')}`);
  console.log(`  ${dodgeBlue('codex-live codex -- --version')}`);
  console.log(`  ${dodgeBlue('codex-live popup current --width 70% --height 55%')}`);
  console.log(`  ${dodgeBlue('codex-live tmux --repo operpdf')}`);
  console.log(`\n${dim('Use `codex-live <command> --help` for command-specific help.')}`);
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
    if (a === '--session') { opts.session = args[++i]; continue; }
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

function ensureScript(name: string): string {
  const p = path.join(DIST_DIR, name);
  if (!process.argv[1] || p === process.argv[1]) return p;
  // Lightweight existence check via node fs API not required: child start will fail with clear error.
  return p;
}

function runInternal(scriptName: string, args: string[]): Promise<number> {
  const script = ensureScript(scriptName);
  return runProcess(process.execPath, [script, ...args]);
}

function syncTmuxConfCopy(): void {
  if (!process.env.HOME) return;
  if (!fs.existsSync(LOCAL_TMUX_CONF)) return;
  try {
    const st = fs.lstatSync(HOME_TMUX_CONF);
    if (st.isSymbolicLink()) fs.unlinkSync(HOME_TMUX_CONF);
  } catch {
    // arquivo não existe: segue para cópia
  }
  fs.copyFileSync(LOCAL_TMUX_CONF, HOME_TMUX_CONF);
}

function resolveSessionWithConfig(cfg: LiveConfig, opts: ParsedOpts): string {
  if (opts.session) {
    if (/^\d+$/.test(opts.session)) {
      return resolveSessionId(BASE_DIR, { sessionNumber: opts.session });
    }
    return opts.session;
  }

  if (opts.sessionId || opts.sessionNumber) {
    return resolveSessionId(BASE_DIR, { sessionId: opts.sessionId, sessionNumber: opts.sessionNumber });
  }

  const candidate = cfg.defaultSession;
  if (!candidate) return 'current';
  if (/^\d+$/.test(candidate)) {
    return resolveSessionId(BASE_DIR, { sessionNumber: candidate });
  }
  return candidate;
}

function parseSessionValue(value: string): string {
  if (value === 'current') return 'current';
  if (/^\d+$/.test(value)) {
    return resolveSessionId(BASE_DIR, { sessionNumber: value });
  }
  return value;
}

async function cmdRepo(subArgs: string[]): Promise<number> {
  const cfg = loadConfig(BASE_DIR);
  const [actionRaw, ...rest] = subArgs;
  const action = (actionRaw ?? 'ls').toLowerCase();

  if (action === 'ls' || action === 'list') {
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
    if (rest.length < 2) throw new Error('uso: codex-live repo add <nome> <path>');
    const [name, repoPath] = rest;
    cfg.repos[name] = repoPath;
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`repo adicionado: ${name} -> ${repoPath}`));
    return 0;
  }

  if (action === 'use') {
    if (rest.length < 1) throw new Error('uso: codex-live repo use <nome|path>');
    cfg.defaultRepo = rest[0];
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`repo padrão: ${cfg.defaultRepo}`));
    return 0;
  }

  if (action === 'rm' || action === 'remove') {
    if (rest.length < 1) throw new Error('uso: codex-live repo rm <nome>');
    const key = rest[0];
    delete cfg.repos[key];
    if (cfg.defaultRepo === key) cfg.defaultRepo = '';
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`repo removido: ${key}`));
    return 0;
  }

  throw new Error(`ação repo inválida: ${actionRaw}`);
}

async function cmdSession(subArgs: string[]): Promise<number> {
  const cfg = loadConfig(BASE_DIR);
  const [actionRaw, ...rest] = subArgs;
  const action = (actionRaw ?? 'ls').toLowerCase();

  if (action === 'ls' || action === 'list') {
    const rows = formatSessions(BASE_DIR);
    console.log(stage('Sessões disponíveis:'));
    if (rows.length === 0) {
      console.log('  (nenhuma)');
      return 0;
    }
    for (const r of rows) {
      const mark = cfg.defaultSession === r.id ? ok(' [default]') : '';
      console.log(`  ${dim(String(r.n).padStart(3, ' '))}  ${file(r.id)}${mark}`);
    }
    return 0;
  }

  if (action === 'show' || action === 'current') {
    const s = cfg.defaultSession || 'current';
    console.log(`session padrão: ${file(s)}`);
    return 0;
  }

  if (action === 'use') {
    if (rest.length < 1) throw new Error('uso: codex-live session use <id|número|current>');
    const resolved = parseSessionValue(rest[0]);
    cfg.defaultSession = resolved;
    saveConfig(BASE_DIR, cfg);
    console.log(ok(`session padrão: ${resolved}`));
    return 0;
  }

  if (action === 'clear') {
    cfg.defaultSession = '';
    saveConfig(BASE_DIR, cfg);
    console.log(ok('session padrão removida (voltando para current)'));
    return 0;
  }

  throw new Error(`ação session inválida: ${actionRaw}`);
}

async function cmdExec(args: string[]): Promise<number> {
  const { opts, rest } = parseOpts(args);
  if (opts.help) {
    console.log('uso: codex-live exec [--repo <nome|path>] [--session <id|número>] -- <comando> [args]');
    return 0;
  }
  if (rest.length === 0) throw new Error('faltou comando após exec');

  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionWithConfig(cfg, opts);

  const callArgs: string[] = [];
  if (sessionId && sessionId !== 'current') callArgs.push('--session', sessionId);
  callArgs.push('--repo', repo, '--', ...rest);

  console.log(stage('Execução:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} cmd=${dim(rest.join(' '))}`);
  return runInternal('codex-live-run.js', callArgs);
}

async function cmdFlow(args: string[]): Promise<number> {
  const { opts, rest } = parseOpts(args);
  const action = (rest[0] ?? 'run').toLowerCase();
  if (opts.help || action === 'help') {
    console.log('uso:');
    console.log('  codex-live flow run [range] [model] [input] [--probe] [--param <arg>]...');
    console.log('  codex-live flow quick [input] [--probe] [--param <arg>]...');
    console.log('exemplos:');
    console.log('  codex-live flow run');
    console.log('  codex-live flow run 1-10 @M-DESP :Q22 --probe');
    console.log('  codex-live flow quick :Q150 --probe');
    return 0;
  }

  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionWithConfig(cfg, opts);

  const positional = rest.slice(1);

  let range = opts.range;
  let model = opts.model;
  let input = opts.input;

  if (action === 'quick') {
    range = range ?? '1-12';
    model = model ?? '@M-DESP';
    input = input ?? positional[0] ?? ':Q22';
  } else if (action === 'run') {
    range = range ?? positional[0] ?? '1-12';
    model = model ?? positional[1] ?? '@M-DESP';
    input = input ?? positional[2] ?? ':Q22';
  } else {
    throw new Error(`ação flow inválida: ${action}`);
  }

  const cmdLine = ['./run.exe', range, '--inputs', model, '--inputs', input];
  if (opts.probe) cmdLine.push('--probe');
  cmdLine.push(...opts.params);

  const callArgs: string[] = [];
  if (sessionId && sessionId !== 'current') callArgs.push('--session', sessionId);
  callArgs.push('--repo', repo, '--', ...cmdLine);

  console.log(stage('Flow preparado:'));
  console.log(`  mode=${action} repo=${file(repo)} session=${file(sessionId)} range=${range} model=${model} input=${input} probe=${opts.probe ? 'true' : 'false'}`);
  return runInternal('codex-live-run.js', callArgs);
}

async function cmdMonitor(action: 'watch' | 'open' | 'popup' | 'tmux', args: string[]): Promise<number> {
  const { opts, rest } = parseOpts(args);
  const sessionArg = rest[0];

  const cfg = loadConfig(BASE_DIR);
  const resolvedOpts = { ...opts };
  if (sessionArg && !resolvedOpts.session && !resolvedOpts.sessionId && !resolvedOpts.sessionNumber) {
    if (/^\d+$/.test(sessionArg)) resolvedOpts.sessionNumber = sessionArg;
    else resolvedOpts.session = sessionArg;
  }
  const sessionId = resolveSessionWithConfig(cfg, resolvedOpts);

  if (opts.help) {
    console.log(`uso: codex-live ${action} [current|<id>|<número>]${action === 'popup' || action === 'tmux' ? ' [--width 70%] [--height 55%]' : ''}`);
    return 0;
  }

  if (action === 'tmux') {
    syncTmuxConfCopy();
    const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
    const callArgs: string[] = [];
    const tmuxSession = sessionId === 'current' ? 'codex_live' : sessionId;
    callArgs.push('--session', tmuxSession, '--repo', repo);
    if (opts.width) callArgs.push('--width', opts.width);
    if (opts.height) callArgs.push('--height', opts.height);
    console.log(stage('UI tmux:'), `session=${file(tmuxSession)} repo=${file(repo)}`);
    return runInternal('codex-tmux.js', callArgs);
  }

  const map: Record<'watch' | 'open' | 'popup', string> = {
    watch: 'codex-live-watch.js',
    open: 'codex-live-open-watch.js',
    popup: 'codex-popup.js'
  };

  const script = map[action];

  const callArgs = [sessionId];
  if (action === 'popup') {
    if (opts.width) callArgs.push('--width', opts.width);
    if (opts.height) callArgs.push('--height', opts.height);
  }

  console.log(stage(`${action.toUpperCase()}:`), `session=${file(sessionId)}`);
  return runInternal(script, callArgs);
}

async function cmdCodex(args: string[]): Promise<number> {
  const { opts, rest } = parseOpts(args);
  const wantHelp = opts.help || rest[0] === 'help' || rest.includes('--help-original');
  const passthrough = rest.filter((x) => x !== '--help-original' && x !== 'help');

  if (!commandExists('codex')) {
    throw new Error('comando `codex` não encontrado no PATH');
  }

  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionWithConfig(cfg, opts);

  const codexArgs: string[] = wantHelp ? ['--help'] : passthrough;

  const callArgs: string[] = [];
  if (sessionId && sessionId !== 'current') callArgs.push('--session', sessionId);
  callArgs.push('--repo', repo, '--', 'codex', ...codexArgs);

  const desc = wantHelp ? '--help' : (codexArgs.length > 0 ? codexArgs.join(' ') : '(sem args)');
  console.log(stage('Codex original:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} args=${dim(desc)}`);
  return runInternal('codex-live-run.js', callArgs);
}

async function main(): Promise<number> {
  const rawArgs = process.argv.slice(2);

  const leadingGlobals: string[] = [];
  let idx = 0;
  while (idx < rawArgs.length) {
    const a = rawArgs[idx];
    if (a === '--repo' || a === '--session') {
      if (idx + 1 >= rawArgs.length) break;
      leadingGlobals.push(a, rawArgs[idx + 1]);
      idx += 2;
      continue;
    }
    if (a === '--help' || a === '-h') {
      leadingGlobals.push(a);
      idx += 1;
      continue;
    }
    break;
  }

  const cmdNameRaw = rawArgs[idx];
  const args = cmdNameRaw ? [...leadingGlobals, ...rawArgs.slice(idx + 1)] : [];
  const cmdName = (cmdNameRaw ?? '').toLowerCase();

  if (!cmdName || cmdName === '--help' || cmdName === '-h' || cmdName === 'help') {
    usage();
    return 0;
  }

  try {
    switch (cmdName) {
      case 'repo': return cmdRepo(args);
      case 'session': return cmdSession(args);
      case 'exec': return cmdExec(args);
      case 'flow': return cmdFlow(args);
      case 'watch': return cmdMonitor('watch', args);
      case 'open': return cmdMonitor('open', args);
      case 'popup': return cmdMonitor('popup', args);
      case 'tmux': return cmdMonitor('tmux', args);
      case 'codex': return cmdCodex(args);

      default:
        throw new Error(`comando inválido: ${cmdNameRaw}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(fail(`erro: ${message}`));
    console.error(dim('use: codex-live help'));
    return 2;
  }
}

main().then((code) => process.exit(code));
