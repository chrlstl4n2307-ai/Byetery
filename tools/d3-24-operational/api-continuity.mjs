import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';

const exec = promisify(execFile);

export function checkD324ApiIdentity(api, nodePath, serverPath, processFact, listeners) {
  const port = new URL(api.origin).port;
  const quoted = value => ['"' + value + '"', ...(value.includes(' ') ? [] : [value])];
  const commands = quoted(nodePath).flatMap(node => quoted(serverPath).map(server =>
    node + ' --experimental-strip-types ' + server));
  check(processFact?.path === nodePath && processFact.startedAt === api.startedAt &&
    commands.includes(processFact.commandLine) && typeof listeners === 'string', 'D324_API_PROCESS_CHANGED');
  const rows = listeners.split(/\r?\n/).map(line => line.trim().split(/\s+/))
    .filter(row => row[0] === 'TCP' && row[1] === '127.0.0.1:' + port && row[3] === 'LISTENING');
  check(rows.length === 1 && rows[0][4] === String(api.pid), 'D324_API_LISTENER_CHANGED');
}

export async function checkLocalD324Api(root, api, nodePath) {
  check(process.platform === 'win32' && Number.isSafeInteger(api.pid) && api.pid > 0, 'D324_API_PROCESS_CHANGED');
  const system = join(process.env.SystemRoot, 'System32');
  const options = { windowsHide: true, timeout: 10_000, encoding: 'utf8', maxBuffer: 1_048_576 };
  const [proc, listener] = await Promise.all([
    exec(join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); " +
      "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = " + api.pid + "'; if (!$p) {throw 'ABSENT'}; " +
      "@{path=$p.ExecutablePath;commandLine=$p.CommandLine;startedAt=$p.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture)} | ConvertTo-Json -Compress"],
    options),
    exec(join(system, 'netstat.exe'), ['-ano', '-p', 'tcp'], options),
  ]);
  checkD324ApiIdentity(api, nodePath, join(root, 'backend', 'src', 'application', 'server.ts'),
    JSON.parse(proc.stdout), listener.stdout);
}
