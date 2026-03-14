#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { baseDirFromImportMeta } from './lib/runtime.js';
import { commandExists } from './lib/proc.js';
const BASE_DIR = baseDirFromImportMeta(import.meta.url);
function quoteSingle(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function parseArgs(argv) {
    const out = {
        target: 'last',
        width: process.env.CODEX_POPUP_WIDTH || '92%',
        height: process.env.CODEX_POPUP_HEIGHT || '85%'
    };
    const args = [...argv];
    while (args.length > 0) {
        const a = args.shift();
        if (a === '--session' || a === '--session-id' || a === '--section-id') {
            out.target = args.shift();
            continue;
        }
        if (a === '--width') {
            out.width = args.shift();
            continue;
        }
        if (a === '--height') {
            out.height = args.shift();
            continue;
        }
        if (a === '--help' || a === '-h') {
            console.log('uso: codex-popup [last|<n>|<session_id>|<arquivo.jsonl>] [--session <id>] [--width <92%>] [--height <85%>]');
            process.exit(0);
        }
        out.target = a;
    }
    return out;
}
function tryTmuxPopup(args) {
    if (!process.env.TMUX)
        return false;
    if (!commandExists('tmux'))
        return false;
    const probe = spawnSync('tmux', ['display-popup', '-E', "bash -lc 'echo tmux_popup_probe >/dev/null'"], { stdio: 'ignore' });
    if ((probe.status ?? 1) !== 0)
        return false;
    const watchCmd = `cd ${BASE_DIR} && ${quoteSingle(process.execPath)} ${quoteSingle(path.join(BASE_DIR, 'dist', 'codex-live-watch.js'))} ${quoteSingle(args.target)}`;
    const popupCmd = `bash -lc ${quoteSingle(watchCmd)}`;
    const res = spawnSync('tmux', ['display-popup', '-w', args.width, '-h', args.height, '-E', popupCmd], {
        stdio: 'inherit'
    });
    return (res.status ?? 1) === 0;
}
function main() {
    const args = parseArgs(process.argv.slice(2));
    if (tryTmuxPopup(args))
        return 0;
    const openWatch = path.join(BASE_DIR, 'dist', 'codex-live-open-watch.js');
    const res = spawnSync(process.execPath, [openWatch, args.target], { stdio: 'inherit' });
    return res.status ?? 1;
}
process.exit(main());
