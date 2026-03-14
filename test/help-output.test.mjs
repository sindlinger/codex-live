import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const CLI_PATH = path.join(REPO_ROOT, 'dist', 'codex-live.js');

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  return {
    status: result.status ?? 1,
    stdout: stripAnsi(result.stdout ?? ''),
    stderr: stripAnsi(result.stderr ?? '')
  };
}

test('main help explains that monitoramento now reads real Codex sessions', () => {
  const out = runCli(['--help']);
  assert.equal(out.status, 0, out.stderr || out.stdout);
  assert.match(out.stdout, /session, sessions, capture, watch, open-watch, popup e tmux leem ~\/\.codex\/sessions/);
  assert.match(out.stdout, /exec e flow apenas gravam logs auxiliares em \.\/logs\/runs/);
  assert.match(out.stdout, /codex-live search "dockermt no dockerhub há uns 3 dias"/);
  assert.match(out.stdout, /codex-live session ls --theme dockermt --limit 10/);
  assert.match(out.stdout, /codex-live open-watch 1/);
});

test('session help documents real Codex sessions and examples', () => {
  const out = runCli(['session', 'help']);
  assert.equal(out.status, 0, out.stderr || out.stdout);
  assert.match(out.stdout, /fonte: ~\/\.codex\/sessions/);
  assert.match(out.stdout, /sessão padrão definida aqui é usada por `codex-live codex` e `codex-live open`/);
  assert.match(out.stdout, /codex-live session ls --theme dockermt --limit 10/);
  assert.match(out.stdout, /codex-live session use 1/);
});

test('repo and watch help show examples against real Codex sessions', () => {
  const repoOut = runCli(['repo', 'help']);
  assert.equal(repoOut.status, 0, repoOut.stderr || repoOut.stdout);
  assert.match(repoOut.stdout, /codex-live repo add operpdf/);

  const watchOut = runCli(['watch', '--help']);
  assert.equal(watchOut.status, 0, watchOut.stderr || watchOut.stdout);
  assert.match(watchOut.stdout, /fonte: ~\/\.codex\/sessions/);
  assert.match(watchOut.stdout, /alvo é sempre uma sessão real do Codex/);
  assert.match(watchOut.stdout, /codex-live watch last/);
});
