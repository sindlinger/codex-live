import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const CLI_PATH = path.join(REPO_ROOT, 'dist', 'codex-live.js');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function makeFixtureRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-live-session-search-'));
  const codexSessionsRoot = path.join(root, 'codex-sessions');
  fs.mkdirSync(codexSessionsRoot, { recursive: true });
  return { root, codexSessionsRoot };
}

function writeCodexSession(root, { id, startedAt, cwd, events }) {
  const date = new Date(startedAt);
  const yyyy = date.getUTCFullYear();
  const mm = pad2(date.getUTCMonth() + 1);
  const dd = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mi = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  const dir = path.join(root, String(yyyy), mm, dd);
  const filePath = path.join(dir, `rollout-${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}-${id}.jsonl`);
  fs.mkdirSync(dir, { recursive: true });

  const lines = [
    {
      timestamp: startedAt,
      type: 'session_meta',
      payload: {
        id,
        timestamp: startedAt,
        cwd
      }
    },
    ...events
  ];

  fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
  return filePath;
}

function runSessionSearch({ codexSessionsRoot }, args) {
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, 'session', 'ls', ...args, '--json'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEX_LIVE_CODEX_SESSIONS_ROOT: codexSessionsRoot
      }
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('finds codex sessions when the term only appears later in the raw conversation', (t) => {
  const fixture = makeFixtureRoots();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const targetId = '019ce2b5-5d63-7960-88db-08a9818cac3e';
  writeCodexSession(fixture.codexSessionsRoot, {
    id: targetId,
    startedAt: '2026-03-12T12:41:02.000Z',
    cwd: '/tmp/codex-live',
    events: [
      {
        timestamp: '2026-03-12T12:41:03.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Pode continuar com a investigacao do ambiente.' }
          ]
        }
      },
      {
        timestamp: '2026-03-12T12:45:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'O dockermt ainda falha ao iniciar depois do install.' }
          ]
        }
      }
    ]
  });

  const out = runSessionSearch(fixture, ['--theme', 'dockermt', '--limit', '10']);
  assert.equal(out.count, 1);
  assert.equal(out.sessions[0].id, targetId);
  assert.equal(out.sessions[0].theme.toLowerCase().includes('dockermt'), false);
  assert.equal('source' in out.sessions[0], false);
});

test('resolves --around indices against the Codex catalog order', (t) => {
  const fixture = makeFixtureRoots();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  writeCodexSession(fixture.codexSessionsRoot, {
    id: '019cc7ef-ab08-7e21-bf99-2ca05fdf05e1',
    startedAt: '2026-03-07T07:54:58.000Z',
    cwd: '/tmp/codex-history',
    events: [
      {
        timestamp: '2026-03-07T07:55:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Teste o install e o uninstall do ambiente.' }
          ]
        }
      },
      {
        timestamp: '2026-03-07T07:56:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'O docker mt subiu, mas o alias dockermt ainda precisa ajuste.' }
          ]
        }
      }
    ]
  });

  writeCodexSession(fixture.codexSessionsRoot, {
    id: '019ce263-f154-7dd2-829f-4f88dc4f8edc',
    startedAt: '2026-03-12T14:12:06.647Z',
    cwd: '/tmp/codex-latest',
    events: [
      {
        timestamp: '2026-03-12T14:12:07.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Verifique a sessao mais recente.' }
          ]
        }
      }
    ]
  });

  const out = runSessionSearch(fixture, ['--around', '1', '--within', '2h', '--limit', '10']);
  assert.equal(out.count, 1);
  assert.equal(out.sessions[0].id, '019ce263-f154-7dd2-829f-4f88dc4f8edc');
});
