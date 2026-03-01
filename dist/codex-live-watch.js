#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { baseDirFromImportMeta, ensureDir, nowCompactUtc, nowIso, updateCurrentSymlink } from './lib/runtime.js';
import { stage, dim, file, fail, ok, warn, cmd, dodgeBlue, paint } from './lib/colors.js';
import { readBuildInfo } from './lib/build-info.js';
import { newWatchWindowEntry, registerWatchWindow, unregisterWatchWindow } from './lib/watch-windows.js';
const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const WATCH_AUDIT_FILE = process.env.CODEX_WATCH_AUDIT_FILE || '';
function watchAudit(message) {
    if (!WATCH_AUDIT_FILE)
        return;
    ensureDir(path.dirname(WATCH_AUDIT_FILE));
    fs.appendFileSync(WATCH_AUDIT_FILE, `[${nowIso()}] ${message}\n`, 'utf8');
}
function resolveSessionDir(sessionId) {
    const sessionsBase = path.join(BASE_DIR, 'sessions');
    ensureDir(sessionsBase);
    if (sessionId === 'current') {
        const currentLink = path.join(sessionsBase, 'current');
        try {
            const stat = fs.lstatSync(currentLink);
            if (stat.isSymbolicLink()) {
                return fs.realpathSync(currentLink);
            }
        }
        catch {
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
function parseSessionStartedAt(sessionDir) {
    const name = path.basename(sessionDir);
    const m = name.match(/^(\d{8}T\d{6}Z)/);
    if (m?.[1]) {
        const iso = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[1].slice(9, 11)}:${m[1].slice(11, 13)}:${m[1].slice(13, 15)}Z`;
        return iso;
    }
    try {
        const st = fs.statSync(sessionDir);
        return st.birthtime.toISOString();
    }
    catch {
        return 'n/a';
    }
}
function bannerLine(content, width = 60) {
    const txt = content.length > width ? `${content.slice(0, width - 3)}...` : content;
    return `║ ${txt.padEnd(width, ' ')} ║`;
}
const modulePalette = [
    { re: /\bdocdetector(?:\.exe)?\b/gi, color: '\u001b[38;5;39m' }, // blue
    { re: /\banchors(?:\.exe)?\b/gi, color: '\u001b[38;5;213m' }, // pink
    { re: /\bobjdiff(?:\.exe)?\b/gi, color: '\u001b[38;5;75m' }, // steel blue
    { re: /\bhelper(?:\.exe)?\b/gi, color: '\u001b[38;5;110m' }, // soft cyan
    { re: /\bparser(?:\.exe)?\b/gi, color: '\u001b[38;5;71m' }, // green
    { re: /\balignrange(?:\.exe)?\b/gi, color: '\u001b[38;5;214m' }, // orange
    { re: /\bextractor(?:\.exe)?\b/gi, color: '\u001b[38;5;45m' }, // teal
    { re: /\bhonorarios(?:\.exe)?\b/gi, color: '\u001b[38;5;221m' }, // amber
    { re: /\brepairer(?:\.exe)?\b/gi, color: '\u001b[38;5;209m' }, // coral
    { re: /\bvalidator(?:\.exe)?\b/gi, color: '\u001b[38;5;78m' }, // lime
    { re: /\bprobe(?:\.exe)?\b/gi, color: '\u001b[38;5;141m' }, // purple
    { re: /\bpersist(?:\.exe)?\b/gi, color: '\u001b[38;5;246m' } // gray
];
function highlightModules(line) {
    let out = line;
    for (const entry of modulePalette) {
        out = out.replace(entry.re, (m) => paint(m, entry.color));
    }
    return out;
}
function highlightAlertWords(line) {
    return line.replace(/\b(ALERTA|WARN|WARNING|ERROR|FAIL)\b/gi, (m) => warn(m));
}
function paintStandardLogLine(raw, source) {
    const line = raw.replace(/\r/g, '');
    if (!line)
        return line;
    if (/exit=[1-9]/.test(line))
        return fail(line);
    if (/erro:|error:|exception|traceback/i.test(line))
        return fail(line);
    if (/ALERTA|WARN|warning|missing|fail/i.test(line))
        return highlightAlertWords(line);
    const lineWithModuleColors = highlightModules(line);
    if (lineWithModuleColors !== line)
        return highlightAlertWords(lineWithModuleColors);
    if (line.startsWith('[RUN]'))
        return dodgeBlue(highlightAlertWords(lineWithModuleColors));
    if (/^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(line) && line.includes('$ '))
        return cmd(line);
    if (line.includes('exit=0'))
        return ok(line);
    if (/^\s*etapa[_ -][0-9]+/i.test(line) || line.includes('etapa_'))
        return stage(highlightAlertWords(lineWithModuleColors));
    if (/\.jsonl?$/.test(line) || line.includes('/sessions/') || line.includes('\\sessions\\'))
        return file(lineWithModuleColors);
    if (source === 'commands')
        return dim(highlightAlertWords(lineWithModuleColors));
    return highlightAlertWords(lineWithModuleColors);
}
function expandCommandLineForDisplay(line) {
    if (!line.includes("bash -lc '"))
        return [line];
    const marker = "bash -lc '";
    const idx = line.indexOf(marker);
    if (idx < 0)
        return [line];
    if (!line.endsWith("'"))
        return [line];
    const prefix = line.slice(0, idx + marker.length - 1).trimEnd();
    const body = line.slice(idx + marker.length, -1);
    const chunks = body
        .split(/;\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (chunks.length <= 1)
        return [line];
    const out = [prefix];
    chunks.forEach((chunk, i) => out.push(`  ${i + 1}. ${chunk}`));
    return out;
}
function renderTimelineLine(raw) {
    const line = raw.replace(/\r/g, '');
    if (!line)
        return [];
    const m = line.match(/^\[([^\]]+)\]\s+\[(CMD|INFO|OUT|EXIT)\]\s*(.*)$/);
    if (!m)
        return [paintStandardLogLine(line, 'output')];
    const ts = dim(`[${m[1]}]`);
    const tag = m[2];
    const payload = m[3] ?? '';
    const tagTxt = tag === 'CMD' ? cmd('[CMD]')
        : tag === 'INFO' ? stage('[INFO]')
            : tag === 'OUT' ? dodgeBlue('[OUT]')
                : /code=0\b/i.test(payload) ? ok('[EXIT]') : fail('[EXIT]');
    const decorate = (s) => highlightAlertWords(highlightModules(s));
    if (tag === 'CMD' && payload.includes("bash -lc '") && payload.endsWith("'")) {
        const marker = "bash -lc '";
        const idx = payload.indexOf(marker);
        const body = payload.slice(idx + marker.length, -1);
        const chunks = body.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
        const rows = [`${ts} ${tagTxt} ${dim('bash -lc')}`];
        chunks.forEach((chunk, i) => rows.push(`  ${dim(`${i + 1}.`)} ${decorate(chunk)}`));
        return rows;
    }
    if (tag === 'EXIT') {
        const ex = payload.match(/^(code=\d+\s+status=\w+)\s+::\s+bash -lc '(.*)'$/);
        if (ex) {
            const rows = [`${ts} ${tagTxt} ${ex[1]} :: ${dim('bash -lc')}`];
            const chunks = ex[2].split(/;\s+/).map((s) => s.trim()).filter(Boolean);
            chunks.forEach((chunk, i) => rows.push(`  ${dim(`${i + 1}.`)} ${decorate(chunk)}`));
            return rows;
        }
    }
    return [`${ts} ${tagTxt} ${decorate(payload)}`];
}
function wireTailStream(stream, onLine) {
    if (!stream)
        return;
    let carry = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
        const data = carry + chunk;
        const parts = data.split('\n');
        carry = parts.pop() ?? '';
        for (const part of parts)
            onLine(part);
    });
    stream.on('end', () => {
        if (carry)
            onLine(carry);
    });
}
async function main() {
    const sessionId = process.argv[2] ?? 'current';
    const sessionDir = resolveSessionDir(sessionId);
    const buildInfo = readBuildInfo(BASE_DIR);
    const watchStartedAt = nowIso();
    const sessionStartedAt = parseSessionStartedAt(sessionDir);
    const asWindow = process.env.CODEX_WATCH_WINDOW === '1';
    const launcher = process.env.CODEX_WATCH_LAUNCHER || 'direct';
    const ownerPid = Number(process.env.CODEX_WATCH_OPEN_PID || '0') || 0;
    const ownerTty = process.env.CODEX_WATCH_OPEN_TTY || '(unknown)';
    const ownerCmd = process.env.CODEX_WATCH_OWNER_CMD || '';
    const commandsLog = path.join(sessionDir, 'commands.log');
    const outputLog = path.join(sessionDir, 'output.log');
    const timelineLog = path.join(sessionDir, 'timeline.log');
    const eventsLog = path.join(sessionDir, 'events.jsonl');
    fs.closeSync(fs.openSync(commandsLog, 'a'));
    fs.closeSync(fs.openSync(outputLog, 'a'));
    fs.closeSync(fs.openSync(timelineLog, 'a'));
    fs.closeSync(fs.openSync(eventsLog, 'a'));
    watchAudit(`watch_start pid=${process.pid} argv=${process.argv.slice(2).join(' ')}`);
    let windowRegistered = false;
    if (asWindow) {
        registerWatchWindow(BASE_DIR, newWatchWindowEntry({
            pid: process.pid,
            sessionId,
            launcher,
            ownerPid,
            ownerTty,
            ownerCmd
        }));
        windowRegistered = true;
        watchAudit(`watch_window_register pid=${process.pid} session=${sessionId} launcher=${launcher} owner_tty=${ownerTty}`);
    }
    console.log(stage('╔════════════════════════════════════════════════════════════════╗'));
    console.log(stage(bannerLine(`codex-live v${buildInfo.version}`)));
    console.log(stage(bannerLine(`watch_started_utc: ${watchStartedAt}`)));
    console.log(stage(bannerLine(`session_started_utc: ${sessionStartedAt}`)));
    console.log(stage(bannerLine(`build_built_at_utc: ${buildInfo.builtAtUtc}`)));
    console.log(stage('╚════════════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`${stage('[codex-live-watch]')} sessão: ${file(sessionDir)}`);
    console.log(`${stage('[codex-live-watch]')} logs:`);
    console.log(`  - ${file(timelineLog)} ${dim('(consolidado)')}`);
    console.log(`  - ${file(commandsLog)}`);
    console.log(`  - ${file(outputLog)}`);
    console.log(`  - ${file(eventsLog)}`);
    if (WATCH_AUDIT_FILE)
        console.log(`  - ${file(WATCH_AUDIT_FILE)}`);
    console.log('');
    console.log(`${dim('Dica:')} rode em outro terminal:`);
    console.log(`  ${dim('codex-live exec --repo <repo> -- <comando> [args...]')}`);
    console.log('');
    console.log(`${dim('Modo:')} histórico completo + acompanhamento em tempo real`);
    console.log('');
    if (asWindow) {
        console.log(`${stage('[codex-live-watch]')} janela registrada: pid=${process.pid} launcher=${launcher} owner_tty=${ownerTty}`);
        console.log('');
    }
    const hasTimeline = fs.existsSync(timelineLog);
    const tailTargets = hasTimeline ? [timelineLog] : [commandsLog, outputLog];
    const tail = spawn('tail', ['-n', '+1', '-F', ...tailTargets], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let currentSource = hasTimeline ? 'timeline' : 'unknown';
    const mapSourceFromHeader = (line) => {
        if (line.includes('timeline.log'))
            return 'timeline';
        if (line.includes('commands.log'))
            return 'commands';
        if (line.includes('output.log'))
            return 'output';
        return 'unknown';
    };
    const handleLine = (line) => {
        const headerMatch = line.match(/^==>\s+(.+)\s+<==$/);
        if (headerMatch?.[1]) {
            currentSource = mapSourceFromHeader(headerMatch[1]);
            const label = currentSource === 'commands'
                ? stage('[commands.log]')
                : currentSource === 'timeline'
                    ? stage('[timeline.log]')
                    : currentSource === 'output'
                        ? stage('[output.log]')
                        : stage('[tail]');
            process.stdout.write(`${label} ${file(headerMatch[1])}\n`);
            return;
        }
        if (currentSource === 'timeline') {
            for (const part of renderTimelineLine(line)) {
                process.stdout.write(`${part}\n`);
            }
            return;
        }
        const expanded = currentSource === 'commands' ? expandCommandLineForDisplay(line) : [line];
        for (const part of expanded) {
            process.stdout.write(`${paintStandardLogLine(part, currentSource)}\n`);
        }
    };
    wireTailStream(tail.stdout, handleLine);
    wireTailStream(tail.stderr, (line) => process.stderr.write(`${fail(line)}\n`));
    const signalHandler = (signalName, code) => {
        watchAudit(`watch_signal pid=${process.pid} sig=${signalName}`);
        if (windowRegistered) {
            unregisterWatchWindow(BASE_DIR, process.pid);
            windowRegistered = false;
        }
        if (!tail.killed) {
            try {
                tail.kill('SIGTERM');
            }
            catch { /* ignore */ }
        }
        watchAudit(`watch_exit pid=${process.pid} code=${code}`);
        process.exit(code);
    };
    process.on('SIGHUP', () => signalHandler('SIGHUP', 129));
    process.on('SIGINT', () => signalHandler('SIGINT', 130));
    process.on('SIGQUIT', () => signalHandler('SIGQUIT', 131));
    process.on('SIGTERM', () => signalHandler('SIGTERM', 143));
    return await new Promise((resolve) => {
        tail.on('close', (code, signal) => {
            const finalCode = signal ? 128 : (code ?? 1);
            if (windowRegistered) {
                unregisterWatchWindow(BASE_DIR, process.pid);
                windowRegistered = false;
            }
            watchAudit(`watch_exit pid=${process.pid} code=${finalCode}`);
            resolve(finalCode);
        });
        tail.on('error', () => {
            if (windowRegistered) {
                unregisterWatchWindow(BASE_DIR, process.pid);
                windowRegistered = false;
            }
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
