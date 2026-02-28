import { spawn } from 'node:child_process';

export function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: opts.stdio || 'inherit',
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      shell: false,
    });
    child.on('close', (code, signal) => {
      if (signal) return resolve(128);
      return resolve(code ?? 1);
    });
    child.on('error', () => resolve(1));
  });
}
