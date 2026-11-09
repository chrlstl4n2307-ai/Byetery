const drainMs = 80;
const timeoutMs = 30_000;

export class PromptFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Keep the stream flowing between prompts. Pausing it allows ConPTY to
// deliver a previously queued LF or type-ahead to the next password.
export function createNoEcho(input = process.stdin, output = process.stdout) {
  let started = false;
  let closed = false;
  let priorRaw;
  let prompt;
  let terminal;
  let pairedLfTimer;

  function clearPair() {
    clearTimeout(pairedLfTimer);
    pairedLfTimer = undefined;
  }

  function finish(code) {
    if (!prompt) return;
    const current = prompt;
    prompt = undefined;
    clearTimeout(current.arm);
    clearTimeout(current.timeout);
    const value = current.value;
    current.value = '';
    if (current.visible) {
      try { output.write('\n'); } catch { code ??= 'PROMPT_STREAM_ERROR'; }
    }
    if (code) current.reject(new PromptFailure(code));
    else current.resolve(value);
  }

  function onData(chunk) {
    for (const ch of chunk) {
      if (pairedLfTimer !== undefined) {
        clearPair();
        if (ch === '\n') continue;
      }
      if (!prompt?.visible) continue;
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r') pairedLfTimer = setTimeout(clearPair, drainMs);
        finish(prompt.value ? undefined : 'PROMPT_EMPTY');
      } else if (ch === '\b' || ch === '\x7f') {
        prompt.value = [...prompt.value].slice(0, -1).join('');
      } else if (ch.charCodeAt(0) < 32) {
        finish('PROMPT_CONTROL_CHAR');
      } else if (prompt.value.length + ch.length > 256) {
        finish('PROMPT_TOO_LONG');
      } else {
        prompt.value += ch;
      }
    }
  }

  function onEnd() {
    terminal = 'PROMPT_STREAM_END';
    finish(terminal);
  }

  function onError() {
    terminal = 'PROMPT_STREAM_ERROR';
    finish(terminal);
  }

  function close() {
    if (closed) return;
    closed = true;
    clearPair();
    finish(terminal ?? 'PROMPT_STREAM_END');
    if (!started) return;
    input.off('data', onData);
    input.off('end', onEnd);
    input.off('error', onError);
    try { input.setRawMode(priorRaw); } finally { input.pause(); }
  }

  async function read(role) {
    if (closed || terminal || input.readableEnded || input.destroyed) {
      throw new PromptFailure(terminal ?? 'PROMPT_STREAM_END');
    }
    if (prompt) throw new PromptFailure('PROMPT_CONCURRENT');
    if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
      throw new PromptFailure('OWNER_TTY_REQUIRED');
    }
    if (!started) {
      started = true;
      priorRaw = Boolean(input.isRaw);
      try {
        input.setRawMode(true);
        input.setEncoding('utf8');
        input.on('data', onData);
        input.on('end', onEnd);
        input.on('error', onError);
        input.resume();
      } catch {
        terminal = 'PROMPT_STREAM_ERROR';
        throw new PromptFailure(terminal);
      }
    }
    return new Promise((resolve, reject) => {
      const current = { value: '', visible: false, resolve, reject };
      prompt = current;
      // Flush pending input before advertising that a new password is welcome.
      current.arm = setTimeout(() => {
        try {
          output.write('Contraseña de ' + role + ' (sin eco): ');
          current.visible = true;
          current.timeout = setTimeout(() => finish('PROMPT_TIMEOUT'), timeoutMs);
        } catch {
          onError();
        }
      }, drainMs);
    });
  }
  return Object.freeze({ read, close });
}
