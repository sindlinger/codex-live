#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, resolveRepo } from './lib/config.mjs';
import { resolveSessionId, formatSessions } from './lib/sessions.mjs';
import { runProcess } from './lib/proc.mjs';
import { stage, ok, warn, fail, file, dim } from './lib/colors.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(BASE_DIR, 'bin');

function usage() {
  console.log(`${stage('codex-live')} ${dim('(Node CLI)')}

${stage('Comandos:')}
  codex-live repos list
  codex-live repos add <nome> <path>
  codex-live repos use <nome|path>
  codex-live repos remove <nome>

  codex-live sessions list

  codex-live run [--repo <nome|path>] [--session-id <id>|--session-number <n>] -- <comando> [args]
  codex-live pipeline [--repo <nome|path>] [--session-id <id>|--session-number <n>] [--range <1-12>] [--model <alias>] [--input <alias>] [--probe] [--param <arg>]...

  codex-live watch [--session-id <id>|--session-number <n>]
  codex-live open-watch [--session-id <id>|--session-number <n>]
  codex-live popup [--session-id <id>|--session-number <n>] [--width <92%>] [--height <85%>]

${stage('Exemplos:')}
  codex-live pipeline --repo operpdf --range 1-12 --model @M-DESP --input :Q22 --probe
  codex-live run --repo /mnt/c/git/operpdf-textopsalign -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe
  codex-live popup --session-number 1 --width 70% --height 55%
  codex-live sessions list`);
}

function parseOpts(args) {
  const opts = { params: [] };
  const rest = [];
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

function ensureBin(name) {
  const p = path.join(BIN_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`bin não encontrado: ${p}`);
  return p;
}

async function cmdRepos(subArgs) {
  const cfg = loadConfig(BASE_DIR);
  const [action, ...rest] = subArgs;
  if (!action || action === 'list') {
    console.log(stage('Repos cadastrados:'));
    const keys = Object.keys(cfg.repos).sort();
    if (keys.length === 0) {
      console.log(warn('  (nenhum)'));
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
    const value = rest[0];
    cfg.defaultRepo = value;
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

async function cmdSessions() {
  const rows = formatSessions(BASE_DIR);
  console.log(stage('Sessões disponíveis:'));
  if (rows.length === 0) {
    console.log(warn('  (nenhuma)'));
    return 0;
  }
  for (const r of rows) console.log(`  ${dim(String(r.n).padStart(3, ' '))}  ${file(r.id)}`);
  return 0;
}

async function cmdRun(args) {
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

  const runArgs = [];
  if (sessionId && sessionId !== 'current') runArgs.push('--session', sessionId);
  runArgs.push('--repo', repo, '--', ...rest);

  console.log(stage('Executando via codex-live-run:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} cmd=${dim(rest.join(' '))}`);
  return runProcess(bin, runArgs);
}

async function cmdPipeline(args) {
  const { opts } = parseOpts(args);
  const cfg = loadConfig(BASE_DIR);
  const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
  const sessionId = resolveSessionId(BASE_DIR, opts);
  const bin = ensureBin('codex-live-run');

  const range = opts.range || '1-12';
  const model = opts.model || '@M-DESP';
  const input = opts.input || ':Q22';

  const cmd = ['./run.exe', range, '--inputs', model, '--inputs', input];
  if (opts.probe) cmd.push('--probe');
  for (const p of opts.params) cmd.push(p);

  const runArgs = [];
  if (sessionId && sessionId !== 'current') runArgs.push('--session', sessionId);
  runArgs.push('--repo', repo, '--', ...cmd);

  console.log(stage('Pipeline preparado:'));
  console.log(`  repo=${file(repo)} session=${file(sessionId)} range=${range} model=${model} input=${input} probe=${opts.probe ? 'true' : 'false'}`);
  return runProcess(bin, runArgs);
}

async function cmdWatch(args, mode) {
  const { opts } = parseOpts(args);
  const sessionId = resolveSessionId(BASE_DIR, opts);
  const map = {
    watch: 'codex-live-watch',
    'open-watch': 'codex-live-open-watch',
    popup: 'codex-popup',
  };
  const bin = ensureBin(map[mode]);
  console.log(stage(`Abrindo ${mode}:`), `session=${file(sessionId)}`);
  const callArgs = [sessionId];
  if (mode === 'popup') {
    if (opts.width) callArgs.push('--width', opts.width);
    if (opts.height) callArgs.push('--height', opts.height);
  }
  return runProcess(bin, callArgs);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    usage();
    return 0;
  }

  try {
    switch (cmd) {
      case 'repos': return await cmdRepos(args);
      case 'sessions': return await cmdSessions();
      case 'run': return await cmdRun(args);
      case 'pipeline': return await cmdPipeline(args);
      case 'watch': return await cmdWatch(args, 'watch');
      case 'open-watch': return await cmdWatch(args, 'open-watch');
      case 'popup': return await cmdWatch(args, 'popup');
      default:
        throw new Error(`comando inválido: ${cmd}`);
    }
  } catch (err) {
    console.error(fail(`erro: ${err.message}`));
    console.error(dim('use: codex-live help'));
    return 2;
  }
}

main().then((code) => process.exit(code));
