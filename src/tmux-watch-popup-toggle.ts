#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { baseDirFromImportMeta } from './lib/runtime.js';
import { commandExists, execCapture } from './lib/proc.js';

const BASE_DIR = baseDirFromImportMeta(import.meta.url);

function tmux(args: string[]): { code: number; out: string } {
  const res = execCapture('tmux', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: res.code, out: res.stdout.trim() };
}

function paneExists(paneId: string): boolean {
  const panes = tmux(['list-panes', '-a', '-F', '#{pane_id}']);
  if (panes.code !== 0) return false;
  return panes.out.split('\n').includes(paneId);
}

function main(): number {
  if (!commandExists('tmux')) {
    console.error('tmux não encontrado');
    return 1;
  }

  const pane = tmux(['show-options', '-qv', '@watch_popup_pane']).out;
  if (pane && paneExists(pane)) {
    spawnSync('tmux', ['kill-pane', '-t', pane], { stdio: 'ignore' });
    spawnSync('tmux', ['set-option', '-u', '@watch_popup_pane'], { stdio: 'ignore' });
    return 0;
  }

  const configured = tmux(['show-options', '-qv', '@codex_watch_cmd']).out;
  const cmd = configured || `cd ${BASE_DIR} && ${process.execPath} ${BASE_DIR}/dist/codex-live-watch.js last`;
  const pop = tmux(['display-popup', '-w', '70%', '-h', '55%', '-E', cmd, '-P', '-F', '#{pane_id}']);
  if (pop.code !== 0 || !pop.out) return 1;

  spawnSync('tmux', ['set-option', '-q', '@watch_popup_pane', pop.out], { stdio: 'ignore' });
  return 0;
}

process.exit(main());
