#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { baseDirFromImportMeta, nowCompactUtc } from './lib/runtime.js';
import { loadConfig, saveConfig, resolveRepo } from './lib/config.js';
import { resolveSessionId } from './lib/sessions.js';
import { commandExists, execCapture, runProcess } from './lib/proc.js';
import { stage, dodgeBlue, ok, fail, file, dim, warn } from './lib/colors.js';
import { readBuildInfo } from './lib/build-info.js';
import { listActiveWatchWindows } from './lib/watch-windows.js';
const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const DIST_DIR = path.join(BASE_DIR, 'dist');
const HOME_TMUX_CONF = path.join(process.env.HOME ?? '', '.tmux.conf');
const LOCAL_TMUX_CONF = path.join(BASE_DIR, '.tmux.conf');
const BUILD_INFO = readBuildInfo(BASE_DIR);
function usage() {
    console.log(`codex-live v${BUILD_INFO.version} (${BUILD_INFO.builtAtUtc})`);
    console.log('CLI para histórico do Codex, execução com logs locais e observabilidade.\n');
    console.log(`uso: ${dodgeBlue('codex-live')} [opções] <comando>\n`);
    console.log('modelo:');
    console.log(`  ${dim('-')} ${dodgeBlue('session')}, ${dodgeBlue('sessions')} e ${dodgeBlue('capture')} leem o histórico real em ${file('~/.codex/sessions')}`);
    console.log(`  ${dim('-')} ${dodgeBlue('exec')}, ${dodgeBlue('flow')}, ${dodgeBlue('watch')}, ${dodgeBlue('open-watch')}, ${dodgeBlue('popup')} e ${dodgeBlue('tmux')} usam logs locais em ${file('./sessions')}`);
    console.log(`  ${dim('-')} ${dodgeBlue('open')} é um alias interativo de ${dodgeBlue('codex')}\n`);
    console.log('histórico do Codex:');
    console.log(`  ${dodgeBlue('session')}${dim('     Busca, exporta e seleciona sessões reais do Codex')}`);
    console.log(`  ${dodgeBlue('sessions')}${dim('    Alias de `session ls` com filtros')}`);
    console.log(`  ${dodgeBlue('capture')}${dim('     Inspeciona eventos de uma sessão do Codex sem nova execução')}`);
    console.log(`  ${dodgeBlue('codex')}${dim('       Encaminha args para o binário original do Codex')}`);
    console.log(`  ${dodgeBlue('open')}${dim('        Abre o Codex interativo no terminal atual')}\n`);
    console.log('execução com logs locais:');
    console.log(`  ${dodgeBlue('exec')}${dim('        Executa um comando arbitrário com log em ./sessions')}`);
    console.log(`  ${dodgeBlue('flow')}${dim('        Executa o pipeline run/quick com log em ./sessions')}\n`);
    console.log('observabilidade local:');
    console.log(`  ${dodgeBlue('watch')}${dim('       Acompanha um log local no terminal atual')}`);
    console.log(`  ${dodgeBlue('open-watch')}${dim('  Abre uma janela de watch separada para um log local')}`);
    console.log(`  ${dodgeBlue('popup')}${dim('       Abre o watch em popup do tmux')}`);
    console.log(`  ${dodgeBlue('tmux')}${dim('        Sobe a UI tmux com watch opcional')}\n`);
    console.log('configuração:');
    console.log(`  ${dodgeBlue('repo')}${dim('        Lista, adiciona e seleciona repositórios')}`);
    console.log(`  ${dodgeBlue('help')}${dim('        Mostra esta ajuda')}\n`);
    console.log('opções globais:');
    console.log(`  --repo <nome|path>${dim('   Resolve o repositório padrão ou explícito')}`);
    console.log(`  --session <valor>${dim('   Sessão Codex para `codex/open`; id de log para `exec/flow/watch`')}`);
    console.log(`  -h, --help${dim('          Mostra ajuda')}\n`);
    console.log('exemplos:');
    console.log(`  ${dodgeBlue('codex-live session ls --theme dockermt --limit 10')}`);
    console.log(`  ${dodgeBlue('codex-live session use 1')}`);
    console.log(`  ${dodgeBlue('codex-live open')}`);
    console.log(`  ${dodgeBlue('codex-live capture 1 --focus --behind')}`);
    console.log(`  ${dodgeBlue('codex-live exec -- git status')}`);
    console.log(`  ${dodgeBlue('codex-live flow quick :Q150 --probe')}`);
    console.log(`  ${dodgeBlue('codex-live watch current')}`);
    console.log(`  ${dodgeBlue('codex-live open-watch current')}`);
    console.log(`\n${dim('Use `codex-live <command> --help` para ajuda específica.')}`);
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
        if (a === '--repo') {
            opts.repo = args[++i];
            continue;
        }
        if (a === '--session') {
            opts.session = args[++i];
            continue;
        }
        if (a === '--session-id' || a === '--section-id') {
            opts.sessionId = args[++i];
            continue;
        }
        if (a === '--session-number' || a === '--section-number' || a === '--number') {
            opts.sessionNumber = args[++i];
            continue;
        }
        if (a === '--range') {
            opts.range = args[++i];
            continue;
        }
        if (a === '--model') {
            opts.model = args[++i];
            continue;
        }
        if (a === '--input') {
            opts.input = args[++i];
            continue;
        }
        if (a === '--probe') {
            opts.probe = true;
            continue;
        }
        if (a === '--param') {
            opts.params.push(args[++i]);
            continue;
        }
        if (a === '--width') {
            opts.width = args[++i];
            continue;
        }
        if (a === '--height') {
            opts.height = args[++i];
            continue;
        }
        if (a === '--help' || a === '-h') {
            opts.help = true;
            continue;
        }
        rest.push(a);
    }
    return { opts, rest };
}
function ensureScript(name) {
    const p = path.join(DIST_DIR, name);
    if (!process.argv[1] || p === process.argv[1])
        return p;
    // Lightweight existence check via node fs API not required: child start will fail with clear error.
    return p;
}
function runInternal(scriptName, args) {
    const script = ensureScript(scriptName);
    return runProcess(process.execPath, [script, ...args]);
}
function syncTmuxConfCopy() {
    if (!process.env.HOME)
        return;
    if (!fs.existsSync(LOCAL_TMUX_CONF))
        return;
    try {
        const st = fs.lstatSync(HOME_TMUX_CONF);
        if (st.isSymbolicLink())
            fs.unlinkSync(HOME_TMUX_CONF);
    }
    catch {
        // arquivo não existe: segue para cópia
    }
    fs.copyFileSync(LOCAL_TMUX_CONF, HOME_TMUX_CONF);
}
function resolveLogSession(opts) {
    if (opts.session) {
        if (/^\d+$/.test(opts.session)) {
            return resolveSessionId(BASE_DIR, { sessionNumber: opts.session });
        }
        return opts.session;
    }
    if (opts.sessionId || opts.sessionNumber) {
        return resolveSessionId(BASE_DIR, { sessionId: opts.sessionId, sessionNumber: opts.sessionNumber });
    }
    return 'current';
}
function resolveCodexSessionNumber(value) {
    const rows = sessionCatalogEntries();
    const idx = Number(value);
    if (!Number.isFinite(idx) || idx < 1 || idx > rows.length) {
        throw new Error(`session-number inválido: ${value}`);
    }
    return rows[idx - 1].id;
}
function findCodexSessionId(value) {
    const exact = sessionCatalogEntries().find((row) => row.id.toLowerCase() === value.toLowerCase());
    return exact ? exact.id : null;
}
function resolveCodexSessionValue(value) {
    if (value === 'current')
        return 'current';
    if (/^\d+$/.test(value)) {
        return resolveCodexSessionNumber(value);
    }
    const exact = findCodexSessionId(value);
    if (exact)
        return exact;
    throw new Error(`session_id do Codex não encontrada: ${value}`);
}
function resolveConfiguredCodexSession(value) {
    if (!value || value === 'current')
        return 'current';
    if (/^\d+$/.test(value)) {
        try {
            return resolveCodexSessionNumber(value);
        }
        catch {
            return 'current';
        }
    }
    return findCodexSessionId(value) ?? 'current';
}
function resolveCodexSessionWithConfig(cfg, opts) {
    if (opts.session)
        return resolveCodexSessionValue(opts.session);
    if (opts.sessionId)
        return resolveCodexSessionValue(opts.sessionId);
    if (opts.sessionNumber)
        return resolveCodexSessionNumber(opts.sessionNumber);
    return resolveConfiguredCodexSession(cfg.defaultSession);
}
function parsePsStartedToMs(started) {
    const ms = Date.parse(started);
    return Number.isFinite(ms) ? ms : 0;
}
function formatAge(msElapsed, unit) {
    const safe = Math.max(0, Math.floor(msElapsed / 1000));
    if (unit === 's')
        return `${safe}s`;
    if (unit === 'm')
        return `${Math.floor(safe / 60)}m`;
    if (unit === 'h')
        return `${Math.floor(safe / 3600)}h`;
    const d = Math.floor(safe / 86400);
    const h = Math.floor((safe % 86400) / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (d > 0)
        return `${d}d ${h}h`;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
function parseMinAgeSeconds(raw) {
    const m = raw.trim().match(/^(\d+)\s*([smhd])?$/i);
    if (!m)
        throw new Error(`--min-age inválido: ${raw} (use ex.: 90s, 15m, 2h, 1d)`);
    const n = Number(m[1]);
    const u = (m[2] ?? 's').toLowerCase();
    if (u === 's')
        return n;
    if (u === 'm')
        return n * 60;
    if (u === 'h')
        return n * 3600;
    return n * 86400;
}
function listActiveCodexRows() {
    const codexRaw = execCapture('bash', ['-lc', "ps -eo pid=,lstart=,cmd= | sed -E 's/^[[:space:]]+//'"], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
    const uuidRx = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    return codexRaw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const m = line.match(/^(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/);
        if (!m)
            return null;
        const pid = Number(m[1]);
        const startedText = m[2];
        const startedAtMs = parsePsStartedToMs(startedText);
        const cmd = m[3];
        const isCodexCore = /\/codex\/codex(\s|$)/.test(cmd) || /^codex(\s|$)/.test(cmd);
        if (!isCodexCore)
            return null;
        const sid = cmd.match(uuidRx)?.[0] ?? '';
        const mode = /\bresume\b/.test(cmd)
            ? 'resume'
            : /\bexec\b/.test(cmd)
                ? 'exec'
                : /\bfork\b/.test(cmd)
                    ? 'fork'
                    : 'interactive';
        return { pid, startedAtMs, startedText, cmd, sid, mode };
    })
        .filter((x) => x !== null)
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
}
function codexSessionsRoot() {
    const override = process.env.CODEX_LIVE_CODEX_SESSIONS_ROOT?.trim();
    if (override)
        return path.resolve(override);
    return path.join(process.env.HOME ?? '', '.codex', 'sessions');
}
function listJsonlFiles(root) {
    if (!root || !fs.existsSync(root))
        return [];
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                stack.push(full);
            }
            else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
                out.push(full);
            }
        }
    }
    return out;
}
function extractSessionId(text) {
    const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : '';
}
function parseDateInputToMs(raw) {
    const value = raw.trim();
    if (!value)
        throw new Error('valor de data/hora vazio');
    if (value.toLowerCase() === 'now')
        return Date.now();
    if (/^\d{10,13}$/.test(value)) {
        const n = Number(value);
        if (!Number.isFinite(n))
            throw new Error(`data/hora inválida: ${raw}`);
        return value.length === 10 ? n * 1000 : n;
    }
    const isoMs = Date.parse(value);
    if (Number.isFinite(isoMs))
        return isoMs;
    throw new Error(`data/hora inválida: ${raw} (use ISO, YYYY-MM-DD, epoch, ou "now")`);
}
function parseDurationToMs(raw) {
    const value = raw.trim().toLowerCase();
    const m = value.match(/^(\d+)\s*(s|m|h|d|w|mo|mes|meses|month|months)?$/);
    if (!m) {
        throw new Error(`duração inválida: ${raw} (ex.: 3h, 2d, 1w, 2mo)`);
    }
    const n = Number(m[1]);
    const unit = m[2] ?? 's';
    if (unit === 's')
        return n * 1000;
    if (unit === 'm')
        return n * 60 * 1000;
    if (unit === 'h')
        return n * 3600 * 1000;
    if (unit === 'd')
        return n * 86400 * 1000;
    if (unit === 'w')
        return n * 7 * 86400 * 1000;
    return n * 30 * 86400 * 1000;
}
function readFileHead(filePath, maxBytes) {
    if (!fs.existsSync(filePath))
        return '';
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.allocUnsafe(maxBytes);
        const readBytes = fs.readSync(fd, buf, 0, maxBytes, 0);
        fs.closeSync(fd);
        if (readBytes <= 0)
            return '';
        return buf.subarray(0, readBytes).toString('utf8');
    }
    catch {
        return '';
    }
}
function parseCodexRolloutStartedMs(filePath) {
    const base = path.basename(filePath);
    const m = base.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-/);
    if (!m)
        return 0;
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const hh = Number(m[4]);
    const mi = Number(m[5]);
    const ss = Number(m[6]);
    const ms = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss, 0);
    return Number.isFinite(ms) ? ms : 0;
}
function shouldIgnoreThemeText(text) {
    const normalized = text.trim();
    if (!normalized)
        return true;
    if (/^#\s*AGENTS\.md instructions\b/i.test(normalized))
        return true;
    if (/<INSTRUCTIONS>/i.test(normalized) && /AGENTS\.md/i.test(normalized))
        return true;
    if (/^<environment_context>/i.test(normalized))
        return true;
    if (/^Available skills\b/i.test(normalized))
        return true;
    return false;
}
function codexSessionEntries() {
    const files = listCodexSessionFiles();
    const rows = [];
    for (const fileInfo of files) {
        const head = readFileHead(fileInfo.path, 256 * 1024);
        const lines = normalizeLineBreaks(head).split('\n');
        let sessionId = fileInfo.id || extractSessionId(fileInfo.path);
        let repoDir = '';
        let startedAtMs = parseCodexRolloutStartedMs(fileInfo.path) || fileInfo.mtimeMs;
        let firstUserMessage = '';
        let fallbackUserMessage = '';
        for (const line of lines) {
            const parsed = parseJsonLine(line);
            if (!parsed || typeof parsed !== 'object' || parsed === null)
                continue;
            const obj = parsed;
            const type = String(obj.type ?? '');
            if (type === 'session_meta') {
                const payload = obj.payload;
                const metaId = String(payload?.id ?? '').trim();
                if (metaId)
                    sessionId = metaId;
                const cwd = String(payload?.cwd ?? '').trim();
                if (cwd)
                    repoDir = cwd;
                const startedRaw = String(payload?.timestamp ?? obj.timestamp ?? '').trim();
                const startedMs = startedRaw ? Date.parse(startedRaw) : NaN;
                if (Number.isFinite(startedMs) && startedMs > 0)
                    startedAtMs = startedMs;
                continue;
            }
            if (type === 'event_msg') {
                const payload = obj.payload;
                if (String(payload?.type ?? '') !== 'user_message')
                    continue;
                const message = String(payload?.message ?? '').trim();
                if (!firstUserMessage && !shouldIgnoreThemeText(message)) {
                    firstUserMessage = message;
                }
                continue;
            }
            if (type === 'response_item') {
                const payload = obj.payload;
                if (String(payload?.type ?? '') !== 'message')
                    continue;
                if (String(payload?.role ?? '') !== 'user')
                    continue;
                const message = readMessageText(payload?.content).trim();
                if (!message || shouldIgnoreThemeText(message))
                    continue;
                if (!fallbackUserMessage)
                    fallbackUserMessage = message;
            }
        }
        const themeSource = firstUserMessage || fallbackUserMessage || '(sem tema)';
        const theme = shortText(themeSource, 120);
        const startedIso = startedAtMs > 0 ? new Date(startedAtMs).toISOString() : '';
        const textIndex = `${sessionId} ${repoDir} ${theme} ${firstUserMessage} ${fallbackUserMessage} ${fileInfo.path}`.toLowerCase();
        rows.push({
            n: rows.length + 1,
            id: sessionId || path.basename(fileInfo.path),
            dirPath: fileInfo.path,
            startedAtMs,
            updatedAtMs: fileInfo.mtimeMs,
            startedIso,
            repoDir,
            theme,
            textIndex
        });
    }
    return rows;
}
function compareNewestSessions(a, b) {
    return b.startedAtMs - a.startedAtMs
        || b.updatedAtMs - a.updatedAtMs
        || b.id.localeCompare(a.id);
}
function sessionCatalogEntries() {
    const merged = [...codexSessionEntries()].sort(compareNewestSessions);
    const seen = new Set();
    const deduped = [];
    for (const row of merged) {
        const key = row.id;
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(row);
    }
    return deduped.map((row, idx) => ({
        ...row,
        n: idx + 1
    }));
}
function deepSearchMatchesForTerm(term) {
    const out = {
        codexFiles: new Set()
    };
    if (!commandExists('rg'))
        return out;
    const codexRoot = codexSessionsRoot();
    const codexResult = execCapture('rg', ['-l', '-i', '-F', term, codexRoot, '-g', '*.jsonl'], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (codexResult.code === 0) {
        for (const line of codexResult.stdout.split('\n')) {
            const rawPath = line.trim();
            if (!rawPath)
                continue;
            out.codexFiles.add(path.resolve(rawPath));
        }
    }
    return out;
}
function buildSessionJsonRows(rows) {
    const nowMs = Date.now();
    return rows.map((r) => ({
        n: r.n,
        id: r.id,
        started_at: r.startedIso || null,
        age: r.startedAtMs > 0 ? formatAge(nowMs - r.startedAtMs, 'auto') : 'n/a',
        repo_dir: r.repoDir || null,
        repo_name: r.repoDir ? path.basename(r.repoDir) : null,
        theme: r.theme,
        dir_path: r.dirPath
    }));
}
function csvEscape(value) {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
function sessionRowsToCsv(rows) {
    const header = ['n', 'id', 'started_at', 'age', 'repo_dir', 'repo_name', 'theme', 'dir_path'];
    const lines = [header.join(',')];
    for (const r of rows) {
        lines.push([
            String(r.n),
            r.id,
            r.started_at ?? '',
            r.age,
            r.repo_dir ?? '',
            r.repo_name ?? '',
            r.theme,
            r.dir_path
        ].map(csvEscape).join(','));
    }
    return `${lines.join('\n')}\n`;
}
function parseSessionQueryOptions(rest, baseDir, mode) {
    const query = {
        themeFilters: [],
        fromMs: null,
        toMs: null,
        aroundMs: null,
        withinMs: null,
        limit: 0,
        sortMode: 'newest'
    };
    let jsonOut = false;
    let outPath = '';
    let stdoutCsv = false;
    let aroundRaw = '';
    for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i];
        if (a === '--json') {
            if (mode !== 'ls')
                throw new Error('--json só é válido em `session ls`');
            jsonOut = true;
            continue;
        }
        if (a === '--out' || a === '--csv' || a === '--output') {
            if (mode !== 'export')
                throw new Error(`${a} só é válido em \`session export\``);
            const v = String(rest[i + 1] ?? '').trim();
            if (!v)
                throw new Error(`${a} requer caminho de arquivo`);
            outPath = v;
            i += 1;
            continue;
        }
        if (a === '--stdout') {
            if (mode !== 'export')
                throw new Error('--stdout só é válido em `session export`');
            stdoutCsv = true;
            continue;
        }
        if (a === '--theme' || a === '--query' || a === '--q') {
            const v = String(rest[i + 1] ?? '').trim();
            if (!v)
                throw new Error(`${a} requer valor`);
            query.themeFilters.push(v.toLowerCase());
            i += 1;
            continue;
        }
        if (a === '--from') {
            query.fromMs = parseDateInputToMs(String(rest[i + 1] ?? ''));
            i += 1;
            continue;
        }
        if (a === '--to') {
            query.toMs = parseDateInputToMs(String(rest[i + 1] ?? ''));
            i += 1;
            continue;
        }
        if (a === '--since') {
            const ms = parseDurationToMs(String(rest[i + 1] ?? ''));
            query.fromMs = Date.now() - ms;
            i += 1;
            continue;
        }
        if (a === '--hours') {
            const n = Number(rest[i + 1] ?? '');
            if (!Number.isFinite(n) || n <= 0)
                throw new Error(`--hours inválido: ${rest[i + 1] ?? ''}`);
            query.fromMs = Date.now() - n * 3600 * 1000;
            i += 1;
            continue;
        }
        if (a === '--days') {
            const n = Number(rest[i + 1] ?? '');
            if (!Number.isFinite(n) || n <= 0)
                throw new Error(`--days inválido: ${rest[i + 1] ?? ''}`);
            query.fromMs = Date.now() - n * 86400 * 1000;
            i += 1;
            continue;
        }
        if (a === '--weeks') {
            const n = Number(rest[i + 1] ?? '');
            if (!Number.isFinite(n) || n <= 0)
                throw new Error(`--weeks inválido: ${rest[i + 1] ?? ''}`);
            query.fromMs = Date.now() - n * 7 * 86400 * 1000;
            i += 1;
            continue;
        }
        if (a === '--months') {
            const n = Number(rest[i + 1] ?? '');
            if (!Number.isFinite(n) || n <= 0)
                throw new Error(`--months inválido: ${rest[i + 1] ?? ''}`);
            query.fromMs = Date.now() - n * 30 * 86400 * 1000;
            i += 1;
            continue;
        }
        if (a === '--around') {
            aroundRaw = String(rest[i + 1] ?? '').trim();
            if (!aroundRaw)
                throw new Error('--around requer valor');
            i += 1;
            continue;
        }
        if (a === '--within') {
            query.withinMs = parseDurationToMs(String(rest[i + 1] ?? ''));
            i += 1;
            continue;
        }
        if (a === '--limit') {
            const n = Number(rest[i + 1] ?? '');
            if (!Number.isFinite(n) || n < 1)
                throw new Error(`--limit inválido: ${rest[i + 1] ?? ''}`);
            query.limit = Math.floor(n);
            i += 1;
            continue;
        }
        if (a === '--sort') {
            const v = String(rest[i + 1] ?? '').trim().toLowerCase();
            if (v !== 'newest' && v !== 'oldest' && v !== 'closest') {
                throw new Error(`--sort inválido: ${v} (use newest|oldest|closest)`);
            }
            query.sortMode = v;
            i += 1;
            continue;
        }
        if (a.length > 0) {
            throw new Error(`opção inválida para session ${mode}: ${a}`);
        }
    }
    if (aroundRaw) {
        if (aroundRaw.toLowerCase() === 'now') {
            query.aroundMs = Date.now();
        }
        else if (/^\d+$/.test(aroundRaw)) {
            const rows = sessionCatalogEntries();
            const idx = Number(aroundRaw);
            if (idx < 1 || idx > rows.length)
                throw new Error(`--around índice inválido: ${aroundRaw}`);
            query.aroundMs = rows[idx - 1].startedAtMs;
        }
        else {
            const rows = sessionCatalogEntries();
            const exact = rows.find((r) => r.id.toLowerCase() === aroundRaw.toLowerCase());
            query.aroundMs = exact ? exact.startedAtMs : parseDateInputToMs(aroundRaw);
        }
    }
    if (query.withinMs !== null && query.aroundMs === null) {
        throw new Error('--within exige --around');
    }
    if (query.fromMs !== null && query.toMs !== null && query.fromMs > query.toMs) {
        throw new Error('--from não pode ser maior que --to');
    }
    if (mode === 'export' && !stdoutCsv && !outPath) {
        outPath = path.join(baseDir, 'sessions', `export_${nowCompactUtc()}.csv`);
    }
    return { query, jsonOut, outPath, stdoutCsv };
}
function querySessionRows(_baseDir, query) {
    let rows = sessionCatalogEntries();
    if (query.themeFilters.length > 0) {
        const deepMatchesByTerm = new Map();
        rows = rows.filter((r) => query.themeFilters.every((term) => {
            if (r.textIndex.includes(term))
                return true;
            let matches = deepMatchesByTerm.get(term);
            if (!matches) {
                matches = deepSearchMatchesForTerm(term);
                deepMatchesByTerm.set(term, matches);
            }
            const resolvedPath = path.resolve(r.dirPath);
            return matches.codexFiles.has(resolvedPath);
        }));
    }
    const fromMs = query.fromMs;
    const toMs = query.toMs;
    if (fromMs !== null)
        rows = rows.filter((r) => r.startedAtMs >= fromMs);
    if (toMs !== null)
        rows = rows.filter((r) => r.startedAtMs <= toMs);
    if (query.aroundMs !== null || query.sortMode === 'closest') {
        const centerMs = query.aroundMs ?? Date.now();
        rows = rows
            .map((r) => ({ ...r, _distanceMs: Math.abs(r.startedAtMs - centerMs) }))
            .filter((r) => query.withinMs === null || r._distanceMs <= query.withinMs)
            .sort((a, b) => a._distanceMs - b._distanceMs || compareNewestSessions(a, b))
            .map(({ _distanceMs, ...restRow }) => restRow);
    }
    else {
        rows = rows.sort((a, b) => {
            if (query.sortMode === 'oldest') {
                return a.startedAtMs - b.startedAtMs
                    || a.updatedAtMs - b.updatedAtMs
                    || a.id.localeCompare(b.id);
            }
            return compareNewestSessions(a, b);
        });
    }
    if (query.limit > 0)
        rows = rows.slice(0, query.limit);
    return rows;
}
function listCodexSessionFiles() {
    const root = codexSessionsRoot();
    const files = listJsonlFiles(root);
    return files
        .map((p) => {
        const st = fs.statSync(p);
        const id = extractSessionId(path.basename(p));
        return { id, path: p, mtimeMs: st.mtimeMs, size: st.size };
    })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}
function normalizeLineBreaks(s) {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function shortText(s, max = 180) {
    const one = normalizeLineBreaks(s).replace(/\s+/g, ' ').trim();
    if (one.length <= max)
        return one;
    return `${one.slice(0, max - 1)}…`;
}
function readMessageText(content) {
    if (!Array.isArray(content))
        return '';
    for (const part of content) {
        if (!part || typeof part !== 'object')
            continue;
        const p = part;
        const t = typeof p.type === 'string' ? p.type : '';
        if ((t === 'output_text' || t === 'input_text') && typeof p.text === 'string')
            return p.text;
    }
    return '';
}
function isFocusEvent(obj) {
    const type = String(obj.type ?? '');
    if (/tool|call|message|response/i.test(type))
        return true;
    if (type === 'event_msg') {
        const p = obj.payload;
        const pt = String(p?.type ?? '');
        if (/tool|call|message|response/i.test(pt))
            return true;
    }
    if (type === 'response_item') {
        const p = obj.payload;
        const pt = String(p?.type ?? '');
        if (/tool|call|message|response/i.test(pt))
            return true;
    }
    return false;
}
function previewValue(v, max = 220) {
    try {
        if (typeof v === 'string')
            return shortText(v, max);
        return shortText(JSON.stringify(v), max);
    }
    catch {
        return shortText(String(v ?? ''), max);
    }
}
function paintMaybe(value, painter, colorize) {
    return colorize ? painter(value) : value;
}
function renderSpyLine(rawLine, raw, opts) {
    if (raw)
        return rawLine;
    const parsed = parseJsonLine(rawLine);
    if (!parsed || typeof parsed !== 'object' || parsed === null)
        return null;
    const obj = parsed;
    const type = String(obj.type ?? '');
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : '';
    const behind = opts.behind;
    const colorize = opts.colorize;
    const tsPaint = (s) => paintMaybe(s, dim, colorize);
    const tagBlue = (s) => paintMaybe(s, dodgeBlue, colorize);
    const tagGreen = (s) => paintMaybe(s, ok, colorize);
    const tagYellow = (s) => paintMaybe(s, warn, colorize);
    const tagRed = (s) => paintMaybe(s, fail, colorize);
    const line = (tag, msg = '') => `${tsPaint(ts)} ${tag}${msg ? ` ${msg}` : ''}`;
    if (type === 'session_meta') {
        const p = obj.payload;
        const id = String(p?.id ?? '');
        const cwd = String(p?.cwd ?? '');
        const base = line(tagBlue('[session_meta]'), `id=${id} cwd=${cwd}`);
        if (!behind)
            return base;
        const cliVer = String(p?.cli_version ?? '');
        const branch = String(p?.git?.branch ?? '');
        return `${base} ${tsPaint(`cli=${cliVer} branch=${branch}`)}`;
    }
    if (type === 'response_item') {
        const p = obj.payload;
        const ptype = String(p?.type ?? '');
        if (ptype === 'message') {
            const role = String(p?.role ?? 'unknown');
            const txt = shortText(readMessageText(p?.content));
            const tag = role === 'assistant' ? tagGreen('[message:assistant]') : tagYellow(`[message:${role}]`);
            return line(tag, txt);
        }
        if (ptype === 'function_call') {
            const name = String(p?.name ?? '');
            const callId = String(p?.call_id ?? '');
            const argsTxt = behind ? ` args=${previewValue(p?.arguments, 260)}` : '';
            return line(tagBlue('[tool_call]'), `${name} call_id=${callId}${argsTxt}`);
        }
        if (ptype === 'function_call_output') {
            const callId = String(p?.call_id ?? '');
            const outTxt = behind ? ` output=${previewValue(p?.output, 260)}` : '';
            return line(tagGreen('[tool_output]'), `call_id=${callId}${outTxt}`);
        }
        if (ptype === 'reasoning') {
            if (!behind)
                return line(tagYellow('[reasoning]'));
            const summary = previewValue(p?.summary ?? '', 220);
            return line(tagYellow('[reasoning]'), `summary=${summary}`);
        }
        return line(tagYellow(`[response_item:${ptype}]`));
    }
    if (type === 'event_msg') {
        const p = obj.payload;
        const ptype = String(p?.type ?? '');
        if (ptype === 'agent_message') {
            const msg = shortText(String(p?.message ?? ''));
            return line(tagGreen('[agent_message]'), msg);
        }
        if (ptype === 'user_message') {
            const msg = shortText(String(p?.message ?? ''));
            return line(tagYellow('[user_message]'), msg);
        }
        if (ptype === 'agent_reasoning') {
            const text = shortText(String(p?.text ?? ''));
            return line(tagYellow('[agent_reasoning]'), behind ? text : '');
        }
        if (ptype === 'token_count') {
            const info = p?.info;
            const tot = info?.total_token_usage;
            const inTok = tot?.input_tokens ?? '?';
            const outTok = tot?.output_tokens ?? '?';
            const total = tot?.total_tokens ?? '?';
            if (!behind)
                return line(tagBlue('[token_count]'), `in=${inTok} out=${outTok} total=${total}`);
            const cached = tot?.cached_input_tokens ?? '?';
            const reason = tot?.reasoning_output_tokens ?? '?';
            const rl = p?.rate_limits;
            const primary = rl?.primary;
            const usedPct = primary?.used_percent ?? '?';
            return line(tagBlue('[token_count]'), `in=${inTok} cached=${cached} out=${outTok} reason=${reason} total=${total} primary_used=${usedPct}%`);
        }
        if (ptype === 'error') {
            return line(tagRed('[event:error]'), previewValue(p, 260));
        }
        return line(tagYellow(`[event:${ptype}]`), behind ? previewValue(p, 220) : '');
    }
    if (type === 'turn_context') {
        const p = obj.payload;
        const cwd = String(p?.cwd ?? '');
        const model = String(p?.model ?? '');
        if (!behind)
            return line(tagBlue('[turn_context]'), `model=${model} cwd=${cwd}`);
        const approval = String(p?.approval_policy ?? '');
        const effort = String(p?.effort ?? '');
        return line(tagBlue('[turn_context]'), `model=${model} approval=${approval} effort=${effort} cwd=${cwd}`);
    }
    return line(tagYellow(`[${type}]`), behind ? previewValue(obj, 220) : '');
}
function resolveSpySession(target) {
    const files = listCodexSessionFiles();
    if (files.length === 0) {
        throw new Error(`nenhuma sessão encontrada em ${codexSessionsRoot()}`);
    }
    if (!target || target === 'last')
        return files[0];
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        const st = fs.statSync(target);
        return {
            id: extractSessionId(path.basename(target)),
            path: target,
            mtimeMs: st.mtimeMs,
            size: st.size
        };
    }
    if (/^\d+$/.test(target)) {
        const idx = Number(target);
        const active = listActiveCodexRows().filter((r) => r.sid);
        if (idx >= 1 && idx <= active.length) {
            const sid = active[idx - 1].sid;
            const matches = files.filter((f) => f.id.toLowerCase() === sid.toLowerCase());
            if (matches.length > 0)
                return matches[0];
            throw new Error(`sessão ativa ${sid} encontrada no processo, mas arquivo jsonl não foi localizado`);
        }
        if (idx >= 1 && idx <= files.length)
            return files[idx - 1];
        throw new Error(`índice inválido: ${target} (ativos=${active.length}, histórico=${files.length})`);
    }
    const sid = extractSessionId(target);
    if (!sid) {
        throw new Error(`alvo inválido: ${target} (use last, <número>, <session_id> ou caminho de .jsonl)`);
    }
    const matches = files.filter((f) => f.id.toLowerCase() === sid.toLowerCase());
    if (matches.length === 0)
        throw new Error(`session_id não encontrado: ${sid}`);
    return matches[0];
}
async function cmdSpy(args) {
    let target = '';
    let follow = false;
    let focus = false;
    let raw = false;
    let behind = false;
    let colorize = true;
    let lines = 80;
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === '--help' || a === '-h' || a === 'help') {
            console.log('uso: codex-live capture [last|<n>|<session_id>|<arquivo.jsonl>] [--focus] [--behind] [--follow] [--raw] [--no-color] [--lines N]');
            console.log(`origem padrão: ${file('~/.codex/sessions')}`);
            console.log('atalhos: `last` e `<n>` usam o catálogo de sessões do Codex ordenado por recência.');
            console.log('exemplos:');
            console.log('  codex-live capture');
            console.log('  codex-live capture 1 --focus');
            console.log('  codex-live capture 2 --focus --behind');
            console.log('  codex-live capture last --follow');
            console.log('  codex-live capture 019cac6b-2dc1-78e1-a39b-e0b40970cb0a --follow');
            console.log('  codex-live capture --raw --lines 30');
            console.log('obs: modo passivo, sem nova chamada ao modelo (não consome tokens).');
            return 0;
        }
        if (a === '--follow') {
            follow = true;
            continue;
        }
        if (a === '--focus') {
            focus = true;
            continue;
        }
        if (a === '--behind' || a === '--internals' || a === '--debug') {
            behind = true;
            continue;
        }
        if (a === '--raw') {
            raw = true;
            continue;
        }
        if (a === '--no-color') {
            colorize = false;
            continue;
        }
        if (a === '--lines') {
            lines = Number(args[i + 1] ?? '80');
            if (!Number.isFinite(lines) || lines < 1)
                throw new Error(`--lines inválido: ${args[i + 1] ?? ''}`);
            i += 1;
            continue;
        }
        if (!target) {
            target = a;
            continue;
        }
        throw new Error(`argumento inesperado: ${a}`);
    }
    const chosen = resolveSpySession(target || 'last');
    const when = new Date(chosen.mtimeMs).toISOString();
    const paintStage = (s) => (colorize ? stage(s) : s);
    const paintFile = (s) => (colorize ? file(s) : s);
    const paintDim = (s) => (colorize ? dim(s) : s);
    console.log(paintStage('Capture do Codex:'));
    console.log(`  session=${paintFile(chosen.id || '(sem-id)')} file=${paintFile(chosen.path)} modified=${paintDim(when)}`);
    const content = fs.readFileSync(chosen.path, 'utf8');
    const allLines = normalizeLineBreaks(content).split('\n').filter((x) => x.trim().length > 0);
    const initial = allLines.slice(Math.max(0, allLines.length - lines));
    for (const line of initial) {
        const parsed = parseJsonLine(line);
        if (focus && (!parsed || typeof parsed !== 'object' || parsed === null || !isFocusEvent(parsed)))
            continue;
        const out = renderSpyLine(line, raw, { behind, colorize });
        if (out)
            console.log(out);
    }
    if (!follow)
        return 0;
    console.log(paintStage('Follow:'), paintDim('Ctrl+C para encerrar'));
    const tail = spawn('tail', ['-n', '0', '-f', chosen.path], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let buf = '';
    const flush = (chunk) => {
        buf += chunk;
        while (true) {
            const nl = buf.indexOf('\n');
            if (nl < 0)
                break;
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line)
                continue;
            const parsed = parseJsonLine(line);
            if (focus && (!parsed || typeof parsed !== 'object' || parsed === null || !isFocusEvent(parsed)))
                continue;
            const out = renderSpyLine(line, raw, { behind, colorize });
            if (out)
                console.log(out);
        }
    };
    tail.stdout?.setEncoding('utf8');
    tail.stdout?.on('data', flush);
    tail.stderr?.setEncoding('utf8');
    tail.stderr?.on('data', (s) => process.stderr.write(s));
    return await new Promise((resolve) => {
        const onSigint = () => {
            try {
                tail.kill('SIGTERM');
            }
            catch { }
        };
        process.on('SIGINT', onSigint);
        tail.on('close', (code) => {
            process.off('SIGINT', onSigint);
            resolve(code ?? 0);
        });
        tail.on('error', () => {
            process.off('SIGINT', onSigint);
            resolve(1);
        });
    });
}
async function cmdRepo(subArgs) {
    const cfg = loadConfig(BASE_DIR);
    const [actionRaw, ...rest] = subArgs;
    const action = (actionRaw ?? 'ls').toLowerCase();
    if (action === 'help' || action === '--help' || action === '-h') {
        console.log('uso: codex-live repo <ls|add|use|rm> [args]');
        console.log('ações:');
        console.log('  ls                      lista repositórios cadastrados');
        console.log('  add <nome> <path>       adiciona ou sobrescreve um repositório');
        console.log('  use <nome|path>         define o repositório padrão');
        console.log('  rm <nome>               remove um repositório cadastrado');
        console.log('exemplos:');
        console.log('  codex-live repo ls');
        console.log('  codex-live repo add operpdf /mnt/c/git/operpdf-textopsalign');
        console.log('  codex-live repo use operpdf');
        console.log('  codex-live repo rm operpdf');
        return 0;
    }
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
        if (rest.length < 2)
            throw new Error('uso: codex-live repo add <nome> <path>');
        const [name, repoPath] = rest;
        cfg.repos[name] = repoPath;
        saveConfig(BASE_DIR, cfg);
        console.log(ok(`repo adicionado: ${name} -> ${repoPath}`));
        return 0;
    }
    if (action === 'use') {
        if (rest.length < 1)
            throw new Error('uso: codex-live repo use <nome|path>');
        cfg.defaultRepo = rest[0];
        saveConfig(BASE_DIR, cfg);
        console.log(ok(`repo padrão: ${cfg.defaultRepo}`));
        return 0;
    }
    if (action === 'rm' || action === 'remove') {
        if (rest.length < 1)
            throw new Error('uso: codex-live repo rm <nome>');
        const key = rest[0];
        delete cfg.repos[key];
        if (cfg.defaultRepo === key)
            cfg.defaultRepo = '';
        saveConfig(BASE_DIR, cfg);
        console.log(ok(`repo removido: ${key}`));
        return 0;
    }
    throw new Error(`ação repo inválida: ${actionRaw}`);
}
async function cmdSession(subArgs) {
    const { opts, rest: subRest } = parseOpts(subArgs);
    const cfg = loadConfig(BASE_DIR);
    const [actionRaw, ...rest] = subRest;
    const action = (actionRaw ?? 'ls').toLowerCase();
    if (action === 'help' || opts.help) {
        console.log('uso: codex-live session <ação> [args]');
        console.log(`fonte: ${file('~/.codex/sessions')}`);
        console.log('obs: `ls`, `export`, `show`, `use` e `clear` operam sobre sessões reais do Codex.');
        console.log('obs: a sessão padrão definida aqui é usada por `codex-live codex` e `codex-live open`.');
        console.log('ações:');
        console.log('  ls [filtros]            lista sessões do Codex');
        console.log('  export|csv [filtros] [--out arquivo.csv] [--stdout]  exporta CSV');
        console.log('  active [--age auto|s|m|h] [--min-age <dur>]  watch local + processos codex ativos');
        console.log('  attach <n|session_id> [--prompt "texto"]      entra na sessão codex ativa');
        console.log('  show|current            mostra sessão Codex padrão');
        console.log('  use <id|número|current> define sessão Codex padrão');
        console.log('  clear                   limpa sessão Codex padrão');
        console.log('filtros do ls:');
        console.log('  --theme <texto>         filtra por tema/mensagem inicial/comando/repo (pode repetir)');
        console.log('  --from <data>           início do intervalo (ISO, YYYY-MM-DD, epoch)');
        console.log('  --to <data>             fim do intervalo');
        console.log('  --since <dur>           últimas N unidades (ex.: 6h, 3d, 2w, 1mo)');
        console.log('  --hours|--days|--weeks|--months <n>  atalhos de tempo');
        console.log('  --around <data|now|id|n> --within <dur>       proximidade temporal');
        console.log('  --sort <newest|oldest|closest>                ordenação');
        console.log('  --json                  saída JSON');
        console.log('  --limit <n>             limita resultado');
        console.log('exemplos:');
        console.log('  codex-live session ls --theme dockermt --limit 10');
        console.log('  codex-live sessions --theme despacho --weeks 2');
        console.log('  codex-live session ls --from 2026-03-01 --to 2026-03-07');
        console.log('  codex-live session ls --around now --within 6h');
        console.log('  codex-live sessions --sort oldest --limit 20');
        console.log('  codex-live sessions --theme certidao --weeks 4 --json');
        console.log('  codex-live sessions export --theme despacho --weeks 1 --out /tmp/sessoes.csv');
        console.log('  codex-live sessions csv --theme certidao --since 30d');
        console.log('  codex-live session use 1');
        console.log('  codex-live session show');
        console.log('  codex-live session active --age auto');
        console.log('  codex-live session active --age m --min-age 10m');
        console.log('  codex-live session attach 2');
        console.log('  codex-live session attach 019cac6b-2dc1-78e1-a39b-e0b40970cb0a');
        return 0;
    }
    if (action === 'ls' || action === 'list') {
        const parsed = parseSessionQueryOptions(rest, BASE_DIR, 'ls');
        const rows = querySessionRows(BASE_DIR, parsed.query);
        const jsonRows = buildSessionJsonRows(rows);
        if (parsed.jsonOut) {
            console.log(JSON.stringify({
                count: jsonRows.length,
                filters: {
                    theme: parsed.query.themeFilters,
                    from: parsed.query.fromMs !== null ? new Date(parsed.query.fromMs).toISOString() : null,
                    to: parsed.query.toMs !== null ? new Date(parsed.query.toMs).toISOString() : null,
                    around: parsed.query.aroundMs !== null ? new Date(parsed.query.aroundMs).toISOString() : null,
                    within_ms: parsed.query.withinMs,
                    sort: parsed.query.sortMode,
                    limit: parsed.query.limit || null
                },
                sessions: jsonRows
            }, null, 2));
            return 0;
        }
        console.log(stage('Sessões disponíveis:'));
        if (rows.length === 0) {
            console.log('  (nenhuma)');
            return 0;
        }
        const nowMs = Date.now();
        const defaultCodexSession = resolveConfiguredCodexSession(cfg.defaultSession);
        for (const r of rows) {
            const mark = defaultCodexSession === r.id ? ok(' [default]') : '';
            const repoName = r.repoDir ? path.basename(r.repoDir) : '-';
            const age = r.startedAtMs > 0 ? formatAge(nowMs - r.startedAtMs, 'auto') : 'n/a';
            const when = r.startedIso ? r.startedIso.replace('T', ' ').replace('Z', ' UTC') : 'n/a';
            console.log(`  ${dim(String(r.n).padStart(3, ' '))}  ${file(r.id)}${mark} ${dim(`[${when}] [age=${age}] [repo=${repoName}]`)}`);
            console.log(`       ${dim('tema:')} ${r.theme}`);
        }
        return 0;
    }
    if (action === 'export' || action === 'csv') {
        const parsed = parseSessionQueryOptions(rest, BASE_DIR, 'export');
        const rows = querySessionRows(BASE_DIR, parsed.query);
        const jsonRows = buildSessionJsonRows(rows);
        const csvText = sessionRowsToCsv(jsonRows);
        if (parsed.stdoutCsv) {
            process.stdout.write(csvText);
            return 0;
        }
        const outDir = path.dirname(parsed.outPath);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(parsed.outPath, csvText, 'utf8');
        console.log(stage('Sessões exportadas (CSV):'));
        console.log(`  file=${file(parsed.outPath)} rows=${jsonRows.length}`);
        console.log(`  filtros: theme=${parsed.query.themeFilters.join('|') || '-'} sort=${parsed.query.sortMode}`);
        return 0;
    }
    if (action === 'active' || action === 'open' || action === 'running') {
        let ageUnit = 'auto';
        let minAgeSec = 0;
        for (let i = 0; i < rest.length; i += 1) {
            const a = rest[i];
            if (a === '--age') {
                const v = (rest[i + 1] ?? '').toLowerCase();
                if (v !== 'auto' && v !== 's' && v !== 'm' && v !== 'h') {
                    throw new Error(`--age inválido: ${v} (use auto|s|m|h)`);
                }
                ageUnit = v;
                i += 1;
            }
            else if (a === '--min-age') {
                minAgeSec = parseMinAgeSeconds(rest[i + 1] ?? '');
                i += 1;
            }
            else if (a.length > 0) {
                throw new Error(`opção inválida para session active: ${a}`);
            }
        }
        const active = listActiveWatchWindows(BASE_DIR);
        console.log(stage('Janelas watch ativas:'));
        if (active.length === 0) {
            console.log('  (nenhuma janela watch ativa)');
            console.log(dim('dica: use `codex-live watch current` no terminal atual ou `codex-live open-watch current` em nova janela.'));
        }
        else {
            const grouped = new Map();
            for (const row of active) {
                const arr = grouped.get(row.sessionId) ?? [];
                arr.push(row);
                grouped.set(row.sessionId, arr);
            }
            const nowMs = Date.now();
            const entries = [...grouped.entries()]
                .map(([id, rows]) => ({
                id,
                rows,
                latest: rows.reduce((max, r) => (r.startedAtUtc > max ? r.startedAtUtc : max), ''),
                oldestMs: rows.reduce((min, r) => {
                    const ms = Date.parse(r.startedAtUtc);
                    return Number.isFinite(ms) && ms > 0 ? Math.min(min, ms) : min;
                }, Number.MAX_SAFE_INTEGER)
            }))
                .filter((e) => {
                if (minAgeSec <= 0)
                    return true;
                if (e.oldestMs === Number.MAX_SAFE_INTEGER)
                    return false;
                return (nowMs - e.oldestMs) / 1000 >= minAgeSec;
            })
                .sort((a, b) => b.latest.localeCompare(a.latest));
            if (entries.length === 0) {
                console.log('  (nenhuma janela watch ativa no filtro atual)');
            }
            for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                const launchers = [...new Set(e.rows.map((r) => r.launcher))].join(',');
                const age = e.oldestMs === Number.MAX_SAFE_INTEGER ? 'n/a' : formatAge(nowMs - e.oldestMs, ageUnit);
                console.log(`  ${dim(String(i + 1).padStart(3, ' '))}  ${file(e.id)} ${dim(`[watchers=${e.rows.length} launcher=${launchers} age=${age}]`)}`);
            }
        }
        const nowMs = Date.now();
        const codexRows = listActiveCodexRows()
            .filter((r) => minAgeSec <= 0 || (nowMs - r.startedAtMs) / 1000 >= minAgeSec);
        console.log(stage('Sessões Codex ativas:'));
        if (codexRows.length === 0) {
            console.log('  (nenhum processo codex ativo)');
        }
        else {
            for (let i = 0; i < codexRows.length; i += 1) {
                const r = codexRows[i];
                const sidLabel = r.sid ? ` session=${file(r.sid)}` : '';
                const age = formatAge(nowMs - r.startedAtMs, ageUnit);
                console.log(`  ${dim(String(i + 1).padStart(3, ' '))} pid=${r.pid} mode=${r.mode}${sidLabel} ${dim(`[${r.startedText}] [age=${age}]`)}`);
            }
            console.log(dim('dica: para entrar em uma sessão com id, use `codex-live session attach <n|session_id>`'));
        }
        return 0;
    }
    if (action === 'attach' || action === 'enter') {
        if (rest.length < 1)
            throw new Error('uso: codex-live session attach <n|session_id> [--prompt "texto"]');
        const target = rest[0];
        let prompt = '';
        for (let i = 1; i < rest.length; i += 1) {
            const a = rest[i];
            if (a === '--prompt') {
                prompt = rest[i + 1] ?? '';
                i += 1;
            }
            else {
                prompt = [prompt, a].filter(Boolean).join(' ').trim();
            }
        }
        const active = listActiveCodexRows();
        let sid = target;
        if (/^\d+$/.test(target)) {
            const n = Number(target);
            if (n < 1 || n > active.length)
                throw new Error(`índice inválido: ${target} (use 1..${active.length})`);
            const row = active[n - 1];
            if (!row.sid) {
                throw new Error(`a entrada ${target} não tem session_id (pid=${row.pid}, mode=${row.mode})`);
            }
            sid = row.sid;
        }
        const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
        const callArgs = ['--repo', repo, '--', 'codex', 'resume', sid];
        if (prompt)
            callArgs.push(prompt);
        console.log(stage('Attach sessão codex:'));
        console.log(`  repo=${file(repo)} session=${file(sid)} ${prompt ? `prompt=${dim(prompt)}` : ''}`);
        return runInternal('codex-live-run.js', callArgs);
    }
    if (action === 'show' || action === 'current') {
        const s = resolveConfiguredCodexSession(cfg.defaultSession);
        console.log(`sessão Codex padrão: ${file(s)}`);
        return 0;
    }
    if (action === 'use') {
        if (rest.length < 1)
            throw new Error('uso: codex-live session use <id|número|current>');
        const resolved = resolveCodexSessionValue(rest[0]);
        cfg.defaultSession = resolved;
        saveConfig(BASE_DIR, cfg);
        console.log(ok(`sessão Codex padrão: ${resolved}`));
        return 0;
    }
    if (action === 'clear') {
        cfg.defaultSession = '';
        saveConfig(BASE_DIR, cfg);
        console.log(ok('sessão Codex padrão removida (voltando para current)'));
        return 0;
    }
    throw new Error(`ação session inválida: ${actionRaw}`);
}
async function cmdExec(args) {
    const { opts, rest } = parseOpts(args);
    if (opts.help) {
        console.log('uso: codex-live exec [--repo <nome|path>] [--session <id|número do log>] -- <comando> [args]');
        console.log(`destino do log: ${file('./sessions/<id>/')}`);
        console.log('obs: `--session` aqui seleciona o id do log local, não uma sessão do Codex.');
        console.log('exemplos:');
        console.log('  codex-live exec -- git status');
        console.log('  codex-live exec --repo operpdf -- npm test');
        console.log('  codex-live exec --session current -- bash -lc "echo ok"');
        return 0;
    }
    if (rest.length === 0)
        throw new Error('faltou comando após exec');
    const cfg = loadConfig(BASE_DIR);
    const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
    const sessionId = resolveLogSession(opts);
    const callArgs = [];
    if (sessionId && sessionId !== 'current')
        callArgs.push('--session', sessionId);
    callArgs.push('--repo', repo, '--', ...rest);
    console.log(stage('Execução:'));
    console.log(`  repo=${file(repo)} log=${file(sessionId)} cmd=${dim(rest.join(' '))}`);
    return runInternal('codex-live-run.js', callArgs);
}
async function cmdFlow(args) {
    const { opts, rest } = parseOpts(args);
    const action = (rest[0] ?? 'run').toLowerCase();
    if (opts.help || action === 'help') {
        console.log('uso:');
        console.log('  codex-live flow run [range] [model] [input] [--probe] [--param <arg>]...');
        console.log('  codex-live flow quick [input] [--probe] [--param <arg>]...');
        console.log(`destino do log: ${file('./sessions/<id>/')}`);
        console.log('obs: `--session` aqui seleciona o id do log local reutilizado pelo wrapper.');
        console.log('exemplos:');
        console.log('  codex-live flow run');
        console.log('  codex-live flow run 1-10 @M-DESP :Q22 --probe');
        console.log('  codex-live flow quick :Q150 --probe');
        console.log('  codex-live flow quick --session current :Q22');
        return 0;
    }
    const cfg = loadConfig(BASE_DIR);
    const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
    const sessionId = resolveLogSession(opts);
    const positional = rest.slice(1);
    let range = opts.range;
    let model = opts.model;
    let input = opts.input;
    if (action === 'quick') {
        range = range ?? '1-12';
        model = model ?? '@M-DESP';
        input = input ?? positional[0] ?? ':Q22';
    }
    else if (action === 'run') {
        range = range ?? positional[0] ?? '1-12';
        model = model ?? positional[1] ?? '@M-DESP';
        input = input ?? positional[2] ?? ':Q22';
    }
    else {
        throw new Error(`ação flow inválida: ${action}`);
    }
    const cmdLine = ['./run.exe', range, '--inputs', model, '--inputs', input];
    if (opts.probe)
        cmdLine.push('--probe');
    cmdLine.push(...opts.params);
    const callArgs = [];
    if (sessionId && sessionId !== 'current')
        callArgs.push('--session', sessionId);
    callArgs.push('--repo', repo, '--', ...cmdLine);
    console.log(stage('Flow preparado:'));
    console.log(`  mode=${action} repo=${file(repo)} log=${file(sessionId)} range=${range} model=${model} input=${input} probe=${opts.probe ? 'true' : 'false'}`);
    return runInternal('codex-live-run.js', callArgs);
}
async function cmdMonitor(action, args) {
    const { opts, rest } = parseOpts(args);
    const hasPositionalSession = Boolean(rest[0]) && !rest[0].startsWith('-');
    const sessionArg = hasPositionalSession ? rest[0] : undefined;
    const tailArgs = hasPositionalSession ? rest.slice(1) : rest;
    const cfg = loadConfig(BASE_DIR);
    const resolvedOpts = { ...opts };
    if (sessionArg && !resolvedOpts.session && !resolvedOpts.sessionId && !resolvedOpts.sessionNumber) {
        if (/^\d+$/.test(sessionArg))
            resolvedOpts.sessionNumber = sessionArg;
        else
            resolvedOpts.session = sessionArg;
    }
    const sessionId = resolveLogSession(resolvedOpts);
    const publicAction = action === 'open' ? 'open-watch' : action;
    if (opts.help) {
        if (action === 'tmux') {
            console.log('uso: codex-live tmux [current|<id>|<número>] [--width 70%] [--height 55%] [--watch popup|split|both|window|none] [--no-attach] [--log]');
            console.log(`fonte: ${file('./sessions')}`);
            console.log('obs: `<id>` e `<número>` aqui apontam para logs locais do wrapper.');
            console.log('exemplos:');
            console.log('  codex-live tmux');
            console.log('  codex-live tmux --repo operpdf --watch popup');
            console.log('  codex-live tmux current --watch split');
        }
        else {
            console.log(`uso: codex-live ${publicAction} [current|<id>|<número>]${action === 'popup' ? ' [--width 70%] [--height 55%]' : ''}`);
            console.log(`fonte: ${file('./sessions')}`);
            console.log('obs: `<id>` e `<número>` aqui apontam para logs locais do wrapper.');
            console.log('exemplos:');
            if (action === 'watch') {
                console.log('  codex-live watch');
                console.log('  codex-live watch current');
                console.log('  codex-live watch 1');
            }
            else if (action === 'open') {
                console.log('  codex-live open-watch');
                console.log('  codex-live open-watch current');
                console.log('  codex-live open-watch 1');
            }
            else {
                console.log('  codex-live popup');
                console.log('  codex-live popup current --width 70% --height 55%');
                console.log('  codex-live popup 1');
            }
        }
        return 0;
    }
    if (action === 'tmux') {
        syncTmuxConfCopy();
        const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
        const callArgs = [];
        const tmuxSession = sessionId === 'current' ? 'codex_live' : sessionId;
        callArgs.push('--session', tmuxSession, '--repo', repo);
        if (opts.width)
            callArgs.push('--width', opts.width);
        if (opts.height)
            callArgs.push('--height', opts.height);
        // Forward advanced tmux flags (ex: --no-attach, --no-popup, --log, --log-dir, --log-file)
        callArgs.push(...tailArgs);
        console.log(stage('UI tmux:'), `log=${file(sessionId)} tmux_session=${file(tmuxSession)} repo=${file(repo)}`);
        return runInternal('codex-tmux.js', callArgs);
    }
    const map = {
        watch: 'codex-live-watch.js',
        open: 'codex-live-open-watch.js',
        popup: 'codex-popup.js'
    };
    const script = map[action];
    const callArgs = [sessionId];
    if (action === 'popup') {
        if (opts.width)
            callArgs.push('--width', opts.width);
        if (opts.height)
            callArgs.push('--height', opts.height);
    }
    console.log(stage(`${publicAction.toUpperCase()}:`), `log=${file(sessionId)}`);
    return runInternal(script, callArgs);
}
async function cmdCodex(args) {
    const { opts, rest } = parseOpts(args);
    const wantHelp = opts.help || rest[0] === 'help' || rest.includes('--help-original');
    const passthrough = rest.filter((x) => x !== '--help-original' && x !== 'help');
    if (!commandExists('codex')) {
        throw new Error('comando `codex` não encontrado no PATH');
    }
    const cfg = loadConfig(BASE_DIR);
    const repo = resolveRepo(BASE_DIR, cfg, opts.repo);
    const sessionId = resolveCodexSessionWithConfig(cfg, opts);
    const codexArgs = wantHelp ? ['--help'] : passthrough;
    const callArgs = [];
    if (sessionId && sessionId !== 'current')
        callArgs.push('--session', sessionId);
    callArgs.push('--repo', repo, '--', 'codex', ...codexArgs);
    const desc = wantHelp ? '--help' : (codexArgs.length > 0 ? codexArgs.join(' ') : '(sem args)');
    console.log(stage('Codex original:'));
    console.log(`  repo=${file(repo)} session=${file(sessionId)} args=${dim(desc)}`);
    return runInternal('codex-live-run.js', callArgs);
}
async function cmdStart(args) {
    return cmdCodex(args);
}
function isJsonObjectLine(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
}
function parseJsonLine(line) {
    if (!isJsonObjectLine(line))
        return null;
    try {
        return JSON.parse(line);
    }
    catch {
        return null;
    }
}
async function cmdCapture(args) {
    return cmdSpy(args);
}
async function main() {
    const rawArgs = process.argv.slice(2);
    const leadingGlobals = [];
    let idx = 0;
    while (idx < rawArgs.length) {
        const a = rawArgs[idx];
        if (a === '--repo' || a === '--session') {
            if (idx + 1 >= rawArgs.length)
                break;
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
            case 'repo': return await cmdRepo(args);
            case 'session': return await cmdSession(args);
            case 'sessions': {
                const first = (args[0] ?? '').toLowerCase();
                const explicitAction = new Set([
                    'ls', 'list', 'active', 'open', 'running', 'attach', 'enter',
                    'show', 'current', 'use', 'clear', 'help', 'export', 'csv'
                ]);
                if (first && !first.startsWith('-') && explicitAction.has(first)) {
                    return await cmdSession(args);
                }
                return await cmdSession(['ls', ...args]);
            }
            case 'exec': return await cmdExec(args);
            case 'start': return await cmdStart(args);
            case 'open': return await cmdStart(args);
            case 'flow': return await cmdFlow(args);
            case 'spy': return await cmdSpy(args);
            case 'capture': return await cmdCapture(args);
            case 'watch': return await cmdMonitor('watch', args);
            case 'open-watch': return await cmdMonitor('open', args);
            case 'popup': return await cmdMonitor('popup', args);
            case 'tmux': return await cmdMonitor('tmux', args);
            case 'codex': return await cmdCodex(args);
            default:
                return await cmdExec([...leadingGlobals, cmdNameRaw, ...rawArgs.slice(idx + 1)]);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(fail(`erro: ${message}`));
        console.error(dim('use: codex-live help'));
        return 2;
    }
}
main()
    .then((code) => process.exit(code))
    .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(fail(`erro: ${message}`));
    process.exit(2);
});
