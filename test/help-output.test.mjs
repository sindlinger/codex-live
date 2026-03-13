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

test('main help explains the split between Codex history and local logs', () => {
  const out = runCli(['--help']);
  assert.equal(out.status, 0, out.stderr || out.stdout);
  assert.match(out.stdout, /session, sessions e capture leem o histórico real em ~\/\.codex\/sessions/);
  assert.match(out.stdout, /exec, flow, watch, open-watch, popup e tmux usam logs locais em \.\/sessions/);
  assert.match(out.stdout, /codex-live session ls --theme dockermt --limit 10/);
  assert.match(out.stdout, /codex-live open-watch current/);
});

test('session help documents real Codex sessions and examples', () => {
  const out = runCli(['session', 'help']);
  assert.equal(out.status, 0, out.stderr || out.stdout);
  assert.match(out.stdout, /fonte: ~\/\.codex\/sessions/);
  assert.match(out.stdout, /sessão padrão definida aqui é usada por `codex-live codex` e `codex-live open`/);
  assert.match(out.stdout, /codex-live session ls --theme dockermt --limit 10/);
  assert.match(out.stdout, /codex-live session use 1/);
});

test('repo and watch help show examples and local-log semantics', () => {
  const repoOut = runCli(['repo', 'help']);
  assert.equal(repoOut.status, 0, repoOut.stderr || repoOut.stdout);
  assert.match(repoOut.stdout, /codex-live repo add operpdf/);

  const watchOut = runCli(['watch', '--help']);
  assert.equal(watchOut.status, 0, watchOut.stderr || watchOut.stdout);
  assert.match(watchOut.stdout, /fonte: \.\/sessions/);
  assert.match(watchOut.stdout, /logs locais do wrapper/);
  assert.match(watchOut.stdout, /codex-live watch current/);
});
