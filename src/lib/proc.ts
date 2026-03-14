import { spawn, spawnSync, type SpawnOptions } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function commandExists(name: string): boolean {
  const res = spawnSync('bash', ['-lc', `command -v ${name} >/dev/null 2>&1`], { stdio: 'ignore' });
  return (res.status ?? 1) === 0;
}

export function execCapture(cmd: string, args: string[], options: SpawnOptions = {}): ExecResult {
  const res = spawnSync(cmd, args, {
    ...options,
    encoding: 'utf8'
  });
  return {
    code: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? ''
  };
}

export function execCaptureInput(
  cmd: string,
  args: string[],
  input: string,
  options: SpawnOptions = {}
): ExecResult {
  const res = spawnSync(cmd, args, {
    ...options,
    encoding: 'utf8',
    input
  });
  return {
    code: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? ''
  };
}

export function runProcess(cmd: string, args: string[], options: SpawnOptions = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: options.stdio ?? 'inherit',
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false
    });
    child.on('close', (code, signal) => {
      if (signal) return resolve(128);
      resolve(code ?? 1);
    });
    child.on('error', () => resolve(1));
  });
}

export function runAndCapture(
  cmd: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<{ code: number; combined: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false
    });

    let combined = '';
    child.stdout?.on('data', (buf) => {
      const text = buf.toString();
      combined += text;
      process.stdout.write(text);
    });
    child.stderr?.on('data', (buf) => {
      const text = buf.toString();
      combined += text;
      process.stderr.write(text);
    });

    child.on('close', (code, signal) => {
      if (signal) return resolve({ code: 128, combined });
      resolve({ code: code ?? 1, combined });
    });
    child.on('error', () => resolve({ code: 1, combined }));
  });
}
