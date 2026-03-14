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

function runMemorySearch({ codexSessionsRoot }, args) {
  return runMemorySearchWithEnv({ codexSessionsRoot }, args);
}

function runMemorySearchWithEnv({ codexSessionsRoot }, args, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, 'search', ...args, '--json'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEX_LIVE_CODEX_SESSIONS_ROOT: codexSessionsRoot,
        ...extraEnv
      }
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeExecutable(filePath, body) {
  fs.writeFileSync(filePath, body, { encoding: 'utf8', mode: 0o755 });
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

test('memory search ranks the relevant Codex session from imperfect user recollection', (t) => {
  const fixture = makeFixtureRoots();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  writeCodexSession(fixture.codexSessionsRoot, {
    id: '019cd111-1111-7111-8111-111111111111',
    startedAt: '2026-03-10T10:00:00.000Z',
    cwd: '/tmp/older',
    events: [
      {
        timestamp: '2026-03-10T10:00:10.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'Falamos sobre containers em geral.' }
          ]
        }
      }
    ]
  });

  writeCodexSession(fixture.codexSessionsRoot, {
    id: '019cd222-2222-7222-8222-222222222222',
    startedAt: '2026-03-12T14:12:06.647Z',
    cwd: '/tmp/dockerhub',
    events: [
      {
        timestamp: '2026-03-12T14:12:07.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'O dockermt nao esta mais funcionando no meu dockerhub.' }
          ]
        }
      },
      {
        timestamp: '2026-03-12T14:12:08.000Z',
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'Vamos verificar imagens locais e o Docker Hub.'
        }
      }
    ]
  });

  const out = runMemorySearch(fixture, ['dockermt', 'imagens', 'locais', 'dockerhub', 'ha', '3', 'dias']);
  assert.ok(out.count > 0);
  assert.equal(out.candidates[0].id, '019cd222-2222-7222-8222-222222222222');
  assert.match(out.candidates[0].matched_terms.join(' '), /dockermt/);
});

test('memory search can ask Codex to rerank candidates using the real session protocol prompt', (t) => {
  const fixture = makeFixtureRoots();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const targetId = '019cd333-3333-7333-8333-333333333333';
  writeCodexSession(fixture.codexSessionsRoot, {
    id: targetId,
    startedAt: '2026-03-12T14:12:06.647Z',
    cwd: '/tmp/dockerhub',
    events: [
      {
        timestamp: '2026-03-12T14:12:07.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'O dockermt sumiu do meu dockerhub e das imagens locais.' }
          ]
        }
      },
      {
        timestamp: '2026-03-12T14:12:08.000Z',
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'Vamos procurar a imagem tanto no Docker Hub quanto no host local.'
        }
      }
    ]
  });

  const binDir = path.join(fixture.root, 'bin');
  const promptCapture = path.join(fixture.root, 'prompt.txt');
  const searchLogsRoot = path.join(fixture.root, 'search-logs');
  fs.mkdirSync(binDir, { recursive: true });

  writeExecutable(path.join(binDir, 'codex'), `#!/usr/bin/env bash
set -euo pipefail
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
cat > "$CODEX_LIVE_TEST_PROMPT_CAPTURE"
printf '%s\\n' '{"best_session_id":"${targetId}","confidence":"high","rationale":"stub-rationale","alternate_session_ids":[],"suggested_capture_target":null,"terms_used":["dockermt","dockerhub"]}' > "$output"
`);

  const out = runMemorySearchWithEnv(
    fixture,
    ['--to-codex', 'dockermt', 'dockerhub', 'imagens', 'locais'],
    {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      CODEX_LIVE_TEST_PROMPT_CAPTURE: promptCapture,
      CODEX_LIVE_SEARCH_LOGS_ROOT: searchLogsRoot
    }
  );

  assert.equal(out.codex.best_session_id, targetId);
  assert.equal(out.codex.confidence, 'high');
  assert.equal(out.candidates[0].id, targetId);

  const prompt = fs.readFileSync(promptCapture, 'utf8');
  assert.match(prompt, /~\/\.codex\/sessions\/YYYY\/MM\/DD\/rollout-<timestamp>-<session_id>\.jsonl/);
  assert.match(prompt, /session_meta, turn_context, event_msg, response_item, compacted/);
  assert.match(prompt, /Treat it as a clue, not as literal truth/);
  assert.match(prompt, /Prefer candidates with direct topic mentions in user or assistant messages/);
  assert.match(prompt, /Candidates JSON:/);
});

test('memory search can ask a follow-up question inside the selected real Codex session', (t) => {
  const fixture = makeFixtureRoots();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const targetId = '019cd444-4444-7444-8444-444444444444';
  writeCodexSession(fixture.codexSessionsRoot, {
    id: targetId,
    startedAt: '2026-03-12T14:12:06.647Z',
    cwd: '/tmp/dockerhub',
    events: [
      {
        timestamp: '2026-03-12T14:12:07.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'O dockermt sumiu do meu dockerhub e das imagens locais.' }
          ]
        }
      },
      {
        timestamp: '2026-03-12T14:12:08.000Z',
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'Vamos procurar a imagem tanto no Docker Hub quanto no host local.'
        }
      }
    ]
  });

  const binDir = path.join(fixture.root, 'bin');
  const callsLog = path.join(fixture.root, 'codex-calls.log');
  const searchLogsRoot = path.join(fixture.root, 'search-logs');
  fs.mkdirSync(binDir, { recursive: true });

writeExecutable(path.join(binDir, 'codex'), `#!/usr/bin/env bash
set -euo pipefail
mode="rerank"
output=""
args=("$@")
idx=0
while [ "$idx" -lt "$#" ]; do
  arg="\${args[$idx]}"
  if [ "$arg" = "--output-last-message" ]; then
    idx=$((idx + 1))
    output="\${args[$idx]}"
  elif [ "$arg" = "resume" ]; then
    mode="ask"
  fi
  idx=$((idx + 1))
done
printf '%s\\n' "$mode|$*" >> "$CODEX_LIVE_TEST_CALLS"
if [ "$mode" = "ask" ]; then
  printf '%s\\n' 'Concluímos que o dockermt não estava mais nas imagens locais nem no Docker Hub.' > "$output"
else
  cat >/dev/null
  printf '%s\\n' '{"best_session_id":"${targetId}","confidence":"high","rationale":"stub-rationale","alternate_session_ids":[],"suggested_capture_target":null,"terms_used":["dockermt","dockerhub"]}' > "$output"
fi
`);

  const out = runMemorySearchWithEnv(
    fixture,
    ['--to-codex', '--ask', 'o que concluímos sobre isso?', 'dockermt', 'dockerhub', 'imagens', 'locais'],
    {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      CODEX_LIVE_TEST_CALLS: callsLog,
      CODEX_LIVE_SEARCH_LOGS_ROOT: searchLogsRoot
    }
  );

  assert.equal(out.selected_session_id, targetId);
  assert.equal(out.action, 'ask');
  assert.equal(out.asked_question, 'o que concluímos sobre isso?');
  assert.match(out.answer, /dockermt não estava mais nas imagens locais nem no Docker Hub/i);
  assert.equal(out.codex.best_session_id, targetId);

  const calls = fs.readFileSync(callsLog, 'utf8').trim().split('\n');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^rerank\|exec /);
  assert.match(calls[1], new RegExp(`^ask\\|exec .* resume ${targetId} o que concluímos sobre isso\\?$`));
});
