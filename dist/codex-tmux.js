#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { baseDirFromImportMeta, ensureDir, nowCompactUtc, nowIso, shellQuote } from './lib/runtime.js';
import { commandExists, execCapture } from './lib/proc.js';
const SCRIPT_NAME = 'codex-tmux';
const BASE_DIR = baseDirFromImportMeta(import.meta.url);
const RUN_ID = `${nowCompactUtc()}__${process.pid}`;
function usage() {
    console.log(`Uso:
  codex-tmux [--tmux-session <nome>] [--watch-target <last|id|n>] [--repo <path>] [--watch <popup|split|both|window|none>] [--no-popup] [--no-attach]
             [--popup-width <70%>] [--popup-height <55%>]
             [--log] [--log-dir <path>] [--log-file <path>]

Descrição:
  Cria/reusa sessão tmux real e inicia codex no painel principal.
  Quando o attach está habilitado (padrão), abre outro terminal para anexar.

Logs:
  Por padrão não gera relatório. Use --log para habilitar JSON.`);
}
function parseArgs(argv) {
    const out = {
        tmuxSession: process.env.CODEX_TMUX_SESSION || 'codex_live',
        watchTarget: process.env.CODEX_WATCH_TARGET || 'last',
        repo: process.env.CODEX_REPO_DIR || '/mnt/c/git/operpdf-textopsalign',
        watchMode: 'popup',
        doAttach: true,
        popupWidth: process.env.CODEX_POPUP_WIDTH || '70%',
        popupHeight: process.env.CODEX_POPUP_HEIGHT || '55%',
        logEnabled: false,
        logDir: path.join(BASE_DIR, 'logs'),
        help: false
    };
    const args = [...argv];
    while (args.length > 0) {
        const a = args.shift();
        if (a === '--tmux-session') {
            const v = args.shift();
            if (!v)
                throw new Error('--tmux-session exige valor');
            out.tmuxSession = v;
            continue;
        }
        if (a === '--watch-target') {
            const v = args.shift();
            if (!v)
                throw new Error('--watch-target exige valor');
            out.watchTarget = v;
            continue;
        }
        if (a === '--repo') {
            const v = args.shift();
            if (!v)
                throw new Error('--repo exige valor');
            out.repo = v;
            continue;
        }
        if (a === '--no-popup') {
            out.watchMode = out.watchMode === 'both' ? 'split' : 'none';
            continue;
        }
        if (a === '--watch') {
            const v = (args.shift() || '').toLowerCase();
            if (v !== 'popup' && v !== 'split' && v !== 'both' && v !== 'window' && v !== 'none') {
                throw new Error('--watch exige: popup|split|both|window|none');
            }
            out.watchMode = v;
            continue;
        }
        if (a === '--no-attach') {
            out.doAttach = false;
            continue;
        }
        if (a === '--popup-width' || a === '--width') {
            const v = args.shift();
            if (!v)
                throw new Error(`${a} exige valor`);
            out.popupWidth = v;
            continue;
        }
        if (a === '--popup-height' || a === '--height') {
            const v = args.shift();
            if (!v)
                throw new Error(`${a} exige valor`);
            out.popupHeight = v;
            continue;
        }
        if (a === '--log') {
            out.logEnabled = true;
            continue;
        }
        if (a === '--log-dir') {
            const v = args.shift();
            if (!v)
                throw new Error('--log-dir exige valor');
            out.logEnabled = true;
            out.logDir = v;
            continue;
        }
        if (a === '--log-file') {
            const v = args.shift();
            if (!v)
                throw new Error('--log-file exige valor');
            out.logEnabled = true;
            out.logFile = v;
            continue;
        }
        if (a === '--help' || a === '-h') {
            out.help = true;
            continue;
        }
        throw new Error(`argumento inválido: ${a}`);
    }
    return out;
}
class JsonLogger {
    enabled;
    startedAt;
    runId;
    args;
    events = [];
    reportPath;
    watchAuditFile = '';
    finalStatus = 'ok';
    constructor(enabled, args, logDir, logFile) {
        this.enabled = enabled;
        this.startedAt = nowIso();
        this.runId = RUN_ID;
        this.args = args;
        if (!enabled) {
            this.reportPath = '';
            return;
        }
        ensureDir(logDir);
        this.reportPath = logFile || path.join(logDir, `${SCRIPT_NAME}__${this.runId}.json`);
        this.watchAuditFile = path.join(logDir, `${SCRIPT_NAME}__${this.runId}__watch.audit.log`);
    }
    getWatchAuditFile() {
        return this.watchAuditFile;
    }
    log(step, status, message, details = '') {
        if (!this.enabled)
            return;
        this.events.push({
            ts: nowIso(),
            step,
            status,
            message,
            details
        });
        if (status === 'fail')
            this.finalStatus = 'fail';
        if (status === 'warn' && this.finalStatus !== 'fail')
            this.finalStatus = 'warn';
    }
    write(exitCode, options) {
        if (!this.enabled)
            return;
        const endedAt = nowIso();
        const payload = {
            script: SCRIPT_NAME,
            run_id: this.runId,
            started_at: this.startedAt,
            ended_at: endedAt,
            status: exitCode === 0 ? this.finalStatus : 'fail',
            exit_code: exitCode,
            args: this.args,
            config: {
                tmux_session: options.tmuxSession,
                watch_target: options.watchTarget,
                repo_dir: options.repo,
                watch_mode: options.watchMode,
                auto_popup: options.watchMode === 'popup' || options.watchMode === 'both',
                split_enabled: options.watchMode === 'split' || options.watchMode === 'both',
                window_enabled: options.watchMode === 'window',
                do_attach: options.doAttach,
                popup_width: options.popupWidth,
                popup_height: options.popupHeight,
                log_enabled: options.logEnabled,
                log_dir: options.logDir,
                watch_audit_file: this.watchAuditFile
            },
            events: this.events
        };
        fs.writeFileSync(this.reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        console.log(`Relatório JSON: ${this.reportPath}`);
    }
}
function tmux(args) {
    const r = execCapture('tmux', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: r.code, out: r.stdout.trim(), err: r.stderr.trim() };
}
function setHook(session, hook, value) {
    if (!value) {
        spawnSync('tmux', ['set-hook', '-u', '-t', session, hook], { stdio: 'ignore' });
        return;
    }
    spawnSync('tmux', ['set-hook', '-t', session, hook, value], { stdio: 'ignore' });
}
function psEscapeSingle(s) {
    return s.replace(/'/g, "''");
}
function launchAttachInNewTerminal(session, logger) {
    const attachCmd = `tmux attach-session -t ${session}`;
    if (commandExists('powershell.exe')) {
        const ps = `$cmd='wsl.exe -e bash -lc ''${psEscapeSingle(attachCmd)}'''; Start-Process powershell.exe -ArgumentList @('-NoExit','-Command',$cmd)`;
        const p = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
        if ((p.status ?? 1) === 0) {
            logger.log('attach', 'ok', 'opened_external_terminal', 'launcher=powershell.exe');
            return true;
        }
    }
    if (commandExists('gnome-terminal')) {
        const g = spawnSync('gnome-terminal', ['--', 'bash', '-lc', `${attachCmd}; exec bash`], { stdio: 'ignore' });
        if ((g.status ?? 1) === 0) {
            logger.log('attach', 'ok', 'opened_external_terminal', 'launcher=gnome-terminal');
            return true;
        }
    }
    if (commandExists('x-terminal-emulator')) {
        const x = spawnSync('x-terminal-emulator', ['-e', 'bash', '-lc', `${attachCmd}; exec bash`], { stdio: 'ignore' });
        if ((x.status ?? 1) === 0) {
            logger.log('attach', 'ok', 'opened_external_terminal', 'launcher=x-terminal-emulator');
            return true;
        }
    }
    logger.log('attach', 'fail', 'external_terminal_unavailable');
    console.error('Falha: não consegui abrir outro terminal automaticamente.');
    console.error('Launchers tentados: powershell.exe, gnome-terminal, x-terminal-emulator');
    console.error(`Anexe manualmente em outro terminal: tmux attach -t ${session}`);
    return false;
}
function spawnPopupOnAttach(session, width, height, watchCmd, logger) {
    const worker = `for _ in $(seq 1 80); do ` +
        `client_tty=$(tmux list-clients -t ${shellQuote(session)} -F '#{client_tty}' 2>/dev/null | head -n1 || true); ` +
        `if [ -n "$client_tty" ]; then ` +
        `tmux display-popup -c "$client_tty" -w ${shellQuote(width)} -h ${shellQuote(height)} -E ${shellQuote(watchCmd)} >/dev/null 2>&1; ` +
        `exit 0; fi; sleep 0.1; done; exit 0`;
    spawnSync('tmux', ['run-shell', '-b', worker], { stdio: 'ignore' });
    logger.log('popup_fallback', 'ok', 'scheduled', `size=${width}x${height}`);
}
function buildPopupHookCommand(session, width, height, watchCmd) {
    return (`run-shell -b ` +
        shellQuote(`client_tty=$(tmux list-clients -t ${shellQuote(session)} -F '#{client_tty}' 2>/dev/null | head -n1 || true); ` +
            `if [ -n "$client_tty" ]; then ` +
            `tmux display-popup -c "$client_tty" -w ${shellQuote(width)} -h ${shellQuote(height)} -E ${shellQuote(watchCmd)} >/dev/null 2>&1; ` +
            `fi`));
}
function paneExists(paneId) {
    if (!paneId)
        return false;
    const panes = tmux(['list-panes', '-a', '-F', '#{pane_id}']);
    if (panes.code !== 0)
        return false;
    return panes.out.split(/\r?\n/).map((x) => x.trim()).includes(paneId.trim());
}
function windowExists(windowId) {
    if (!windowId)
        return false;
    const windows = tmux(['list-windows', '-a', '-F', '#{window_id}']);
    if (windows.code !== 0)
        return false;
    return windows.out.split(/\r?\n/).map((x) => x.trim()).includes(windowId.trim());
}
function paneCurrentCommand(target) {
    const out = tmux(['list-panes', '-t', target, '-F', '#{pane_current_command}']);
    if (out.code !== 0)
        return '';
    return out.out.split(/\r?\n/).map((x) => x.trim()).find((x) => x.length > 0) ?? '';
}
function windowFirstPaneInfo(windowId) {
    const out = tmux(['list-panes', '-t', windowId, '-F', '#{pane_id} #{pane_current_command}']);
    if (out.code !== 0)
        return { paneId: '', cmd: '' };
    const first = out.out.split(/\r?\n/).map((x) => x.trim()).find((x) => x.length > 0) ?? '';
    if (!first)
        return { paneId: '', cmd: '' };
    const sep = first.indexOf(' ');
    if (sep <= 0)
        return { paneId: first, cmd: '' };
    return { paneId: first.slice(0, sep), cmd: first.slice(sep + 1).trim() };
}
function isWatcherCmd(cmd) {
    const c = (cmd || '').trim().toLowerCase();
    return c === 'node' || c === 'tail';
}
function ensureWatchSplit(session, mainPaneId, watchCmd, logger) {
    const existing = tmux(['show-options', '-t', session, '-qv', '@watch_pane']).out;
    if (existing && paneExists(existing)) {
        const cmd = paneCurrentCommand(existing);
        if (isWatcherCmd(cmd)) {
            logger.log('split', 'ok', 'reused', `pane=${existing};cmd=${cmd}`);
            return;
        }
        spawnSync('tmux', ['kill-pane', '-t', existing], { stdio: 'ignore' });
        logger.log('split', 'warn', 'stale_recreated', `pane=${existing};cmd=${cmd || 'unknown'}`);
    }
    const target = mainPaneId || `${session}:0.0`;
    const split = tmux(['split-window', '-t', target, '-v', '-l', '30%', '-P', '-F', '#{pane_id}', watchCmd]);
    if (split.code === 0 && split.out) {
        spawnSync('tmux', ['set-option', '-t', session, '-q', '@watch_pane', split.out], { stdio: 'ignore' });
        logger.log('split', 'ok', 'created', `pane=${split.out};target=${target}`);
        return;
    }
    logger.log('split', 'warn', 'failed', `target=${target};code=${split.code};err=${split.err}`);
}
function ensureWatchWindow(session, watchCmd, logger) {
    const existing = tmux(['show-options', '-t', session, '-qv', '@watch_window']).out;
    if (existing && windowExists(existing)) {
        const info = windowFirstPaneInfo(existing);
        if (info.paneId && isWatcherCmd(info.cmd)) {
            logger.log('window', 'ok', 'reused', `window=${existing};pane=${info.paneId};cmd=${info.cmd}`);
            return;
        }
        spawnSync('tmux', ['kill-window', '-t', existing], { stdio: 'ignore' });
        logger.log('window', 'warn', 'stale_recreated', `window=${existing};cmd=${info.cmd || 'unknown'}`);
    }
    const created = tmux(['new-window', '-t', session, '-d', '-n', 'watch-log', '-P', '-F', '#{window_id}', watchCmd]);
    if (created.code === 0 && created.out) {
        spawnSync('tmux', ['set-option', '-t', session, '-q', '@watch_window', created.out], { stdio: 'ignore' });
        logger.log('window', 'ok', 'created', `window=${created.out}`);
        return;
    }
    logger.log('window', 'warn', 'failed', `code=${created.code};err=${created.err}`);
}
function clearWatchSplit(session, logger) {
    const existing = tmux(['show-options', '-t', session, '-qv', '@watch_pane']).out;
    if (existing && paneExists(existing)) {
        spawnSync('tmux', ['kill-pane', '-t', existing], { stdio: 'ignore' });
        logger.log('split', 'ok', 'closed', `pane=${existing}`);
    }
    spawnSync('tmux', ['set-option', '-t', session, '-u', '@watch_pane'], { stdio: 'ignore' });
}
function clearWatchWindow(session, logger) {
    const existing = tmux(['show-options', '-t', session, '-qv', '@watch_window']).out;
    if (existing && windowExists(existing)) {
        spawnSync('tmux', ['kill-window', '-t', existing], { stdio: 'ignore' });
        logger.log('window', 'ok', 'closed', `window=${existing}`);
    }
    spawnSync('tmux', ['set-option', '-t', session, '-u', '@watch_window'], { stdio: 'ignore' });
}
function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return 0;
    }
    const logger = new JsonLogger(options.logEnabled, process.argv.slice(2), options.logDir, options.logFile);
    logger.log('startup', 'ok', 'begin', `base_dir=${BASE_DIR}`);
    logger.log('parse', 'ok', 'parsed', `tmux_session=${options.tmuxSession};watch_target=${options.watchTarget};repo=${options.repo};watch_mode=${options.watchMode};` +
        `do_attach=${options.doAttach};size=${options.popupWidth}x${options.popupHeight};log=${options.logEnabled}`);
    let exitCode = 0;
    try {
        if (!commandExists('tmux'))
            throw new Error('tmux não encontrado');
        if (!fs.existsSync(options.repo) || !fs.statSync(options.repo).isDirectory()) {
            throw new Error(`repo não encontrado: ${options.repo}`);
        }
        logger.log('preflight', 'ok', 'validated');
        const watchAudit = logger.getWatchAuditFile();
        const watchProgram = `${shellQuote(process.execPath)} ${shellQuote(path.join(BASE_DIR, 'dist', 'codex-live-watch.js'))} ${shellQuote(options.watchTarget)}`;
        const watchCmd = options.logEnabled
            ? `cd ${shellQuote(BASE_DIR)} && CODEX_WATCH_AUDIT_FILE=${shellQuote(watchAudit)} ${watchProgram}`
            : `cd ${shellQuote(BASE_DIR)} && ${watchProgram}`;
        const hasSession = tmux(['has-session', '-t', options.tmuxSession]).code === 0;
        if (!hasSession) {
            const hasCodex = commandExists('codex');
            const startCmd = hasCodex
                ? `bash -lc ${shellQuote(`cd ${shellQuote(options.repo)} && codex`)}`
                : `bash -lc ${shellQuote(`cd ${shellQuote(options.repo)} && echo "codex não encontrado no PATH"; exec bash`)}`;
            logger.log('session', hasCodex ? 'ok' : 'warn', 'start_cmd_selected', hasCodex ? 'cmd=codex' : 'cmd=fallback_bash');
            const created = spawnSync('tmux', ['new-session', '-d', '-s', options.tmuxSession, '-c', options.repo, startCmd], { stdio: 'ignore' });
            if ((created.status ?? 1) !== 0)
                throw new Error(`falha ao criar sessão tmux: ${options.tmuxSession}`);
            spawnSync('tmux', ['set-option', '-t', options.tmuxSession, '-gq', 'status', 'on'], { stdio: 'ignore' });
            spawnSync('tmux', ['set-option', '-t', options.tmuxSession, '-gq', 'mouse', 'on'], { stdio: 'ignore' });
            logger.log('session', 'ok', 'created', `tmux_session=${options.tmuxSession}`);
        }
        else {
            logger.log('session', 'ok', 'reused', `tmux_session=${options.tmuxSession}`);
        }
        spawnSync('tmux', ['set-option', '-t', options.tmuxSession, '-q', '@codex_watch_cmd', watchCmd], { stdio: 'ignore' });
        logger.log('session', 'ok', 'watch_cmd_set', `watch_target=${options.watchTarget};watch_audit_file=${watchAudit}`);
        const panes = tmux(['list-panes', '-t', options.tmuxSession, '-F', '#{pane_id}']);
        const mainPaneId = panes.out.split(/\r?\n/).find((x) => x.trim().length > 0) ?? '';
        const popupEnabled = options.watchMode === 'popup' || options.watchMode === 'both';
        const splitEnabled = options.watchMode === 'split' || options.watchMode === 'both';
        const windowEnabled = options.watchMode === 'window';
        if (splitEnabled) {
            ensureWatchSplit(options.tmuxSession, mainPaneId, watchCmd, logger);
        }
        else {
            clearWatchSplit(options.tmuxSession, logger);
        }
        if (windowEnabled) {
            ensureWatchWindow(options.tmuxSession, watchCmd, logger);
        }
        else {
            clearWatchWindow(options.tmuxSession, logger);
        }
        if (options.doAttach) {
            if (popupEnabled) {
                const hookCmd = buildPopupHookCommand(options.tmuxSession, options.popupWidth, options.popupHeight, watchCmd);
                setHook(options.tmuxSession, 'client-attached', hookCmd);
                setHook(options.tmuxSession, 'client-resized');
                logger.log('popup', 'ok', 'hook_set_external_attach_only', `size=${options.popupWidth}x${options.popupHeight};mode=${options.watchMode}`);
                spawnPopupOnAttach(options.tmuxSession, options.popupWidth, options.popupHeight, watchCmd, logger);
            }
            else {
                setHook(options.tmuxSession, 'client-attached');
                setHook(options.tmuxSession, 'client-resized');
                logger.log('popup', 'ok', 'disabled', `mode=${options.watchMode}`);
            }
            if (!launchAttachInNewTerminal(options.tmuxSession, logger)) {
                exitCode = 1;
                return exitCode;
            }
            console.log(`Attach aberto em outro terminal para a sessão tmux: ${options.tmuxSession}`);
            exitCode = 0;
            return exitCode;
        }
        console.log(`Sessão tmux pronta: ${options.tmuxSession}`);
        if (popupEnabled) {
            const hookCmd = buildPopupHookCommand(options.tmuxSession, options.popupWidth, options.popupHeight, watchCmd);
            setHook(options.tmuxSession, 'client-attached', hookCmd);
            setHook(options.tmuxSession, 'client-resized');
            console.log(`Popup no attach: ${options.popupWidth} x ${options.popupHeight}`);
            logger.log('popup', 'ok', 'hook_set_no_attach_only', `size=${options.popupWidth}x${options.popupHeight};mode=${options.watchMode}`);
        }
        if (splitEnabled) {
            console.log('Split de watch: habilitado');
        }
        if (windowEnabled) {
            console.log('Janela de watch: habilitada');
        }
        console.log(`Watch alvo do Codex: ${options.watchTarget}`);
        console.log(`Anexar: tmux attach -t ${options.tmuxSession}`);
        logger.log('attach', 'ok', 'skipped_by_flag', `tmux_session=${options.tmuxSession}`);
        exitCode = 0;
        return exitCode;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.log('fatal', 'fail', message);
        console.error(message);
        exitCode = 1;
        return exitCode;
    }
    finally {
        logger.write(exitCode, options);
    }
}
process.exit(main());
