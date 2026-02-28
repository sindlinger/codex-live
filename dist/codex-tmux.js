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
  codex-tmux [--session <nome>] [--repo <path>] [--no-popup] [--no-attach]
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
        session: process.env.CODEX_TMUX_SESSION || 'codex_live',
        repo: process.env.CODEX_REPO_DIR || '/mnt/c/git/operpdf-textopsalign',
        autoPopup: true,
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
        if (a === '--session') {
            const v = args.shift();
            if (!v)
                throw new Error('--session exige valor');
            out.session = v;
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
            out.autoPopup = false;
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
                session_name: options.session,
                repo_dir: options.repo,
                auto_popup: options.autoPopup,
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
        `tmux display-popup -t "$client_tty" -w ${shellQuote(width)} -h ${shellQuote(height)} -E ${shellQuote(watchCmd)} >/dev/null 2>&1; ` +
        `exit 0; fi; sleep 0.1; done; exit 0`;
    spawnSync('tmux', ['run-shell', '-b', worker], { stdio: 'ignore' });
    logger.log('popup_fallback', 'ok', 'scheduled', `size=${width}x${height}`);
}
function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return 0;
    }
    const logger = new JsonLogger(options.logEnabled, process.argv.slice(2), options.logDir, options.logFile);
    logger.log('startup', 'ok', 'begin', `base_dir=${BASE_DIR}`);
    logger.log('parse', 'ok', 'parsed', `session=${options.session};repo=${options.repo};auto_popup=${options.autoPopup};` +
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
        const watchProgram = `${shellQuote(process.execPath)} ${shellQuote(path.join(BASE_DIR, 'dist', 'codex-live-watch.js'))} current`;
        const watchCmd = options.logEnabled
            ? `cd ${shellQuote(BASE_DIR)} && CODEX_WATCH_AUDIT_FILE=${shellQuote(watchAudit)} ${watchProgram}`
            : `cd ${shellQuote(BASE_DIR)} && ${watchProgram}`;
        const hasSession = tmux(['has-session', '-t', options.session]).code === 0;
        if (!hasSession) {
            const hasCodex = commandExists('codex');
            const startCmd = hasCodex
                ? `bash -lc ${shellQuote(`cd ${shellQuote(options.repo)} && codex`)}`
                : `bash -lc ${shellQuote(`cd ${shellQuote(options.repo)} && echo "codex não encontrado no PATH"; exec bash`)}`;
            logger.log('session', hasCodex ? 'ok' : 'warn', 'start_cmd_selected', hasCodex ? 'cmd=codex' : 'cmd=fallback_bash');
            const created = spawnSync('tmux', ['new-session', '-d', '-s', options.session, '-c', options.repo, startCmd], { stdio: 'ignore' });
            if ((created.status ?? 1) !== 0)
                throw new Error(`falha ao criar sessão tmux: ${options.session}`);
            spawnSync('tmux', ['set-option', '-t', options.session, '-gq', 'status', 'on'], { stdio: 'ignore' });
            spawnSync('tmux', ['set-option', '-t', options.session, '-gq', 'mouse', 'on'], { stdio: 'ignore' });
            logger.log('session', 'ok', 'created', `session=${options.session}`);
        }
        else {
            logger.log('session', 'ok', 'reused', `session=${options.session}`);
        }
        spawnSync('tmux', ['set-option', '-t', options.session, '-gq', '@codex_watch_cmd', watchCmd], { stdio: 'ignore' });
        logger.log('session', 'ok', 'watch_cmd_set', `watch_audit_file=${watchAudit}`);
        if (options.doAttach) {
            if (options.autoPopup) {
                const hookCmd = `display-popup -t '#{client_tty}' -w ${options.popupWidth} -h ${options.popupHeight} -E "${watchCmd}"`;
                setHook(options.session, 'client-attached');
                setHook(options.session, 'client-resized', hookCmd);
                logger.log('popup', 'ok', 'hook_set_external_resize_only', `size=${options.popupWidth}x${options.popupHeight}`);
                spawnPopupOnAttach(options.session, options.popupWidth, options.popupHeight, watchCmd, logger);
            }
            else {
                setHook(options.session, 'client-attached');
                setHook(options.session, 'client-resized');
                logger.log('popup', 'ok', 'disabled');
            }
            if (!launchAttachInNewTerminal(options.session, logger)) {
                exitCode = 1;
                return exitCode;
            }
            console.log(`Attach aberto em outro terminal para a sessão: ${options.session}`);
            exitCode = 0;
            return exitCode;
        }
        console.log(`Sessão pronta: ${options.session}`);
        if (options.autoPopup) {
            const hookCmd = `display-popup -t '#{client_tty}' -w ${options.popupWidth} -h ${options.popupHeight} -E "${watchCmd}"`;
            setHook(options.session, 'client-attached', hookCmd);
            setHook(options.session, 'client-resized', hookCmd);
            console.log(`Popup no attach: ${options.popupWidth} x ${options.popupHeight}`);
            logger.log('popup', 'ok', 'hook_set_no_attach_resize', `size=${options.popupWidth}x${options.popupHeight}`);
        }
        console.log(`Anexar: tmux attach -t ${options.session}`);
        logger.log('attach', 'ok', 'skipped_by_flag', `session=${options.session}`);
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
