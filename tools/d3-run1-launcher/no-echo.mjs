const drainMs = 80;
const timeoutMs = 30_000;
import { StringDecoder } from 'node:string_decoder';
export class PromptFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function createNoEcho(input = process.stdin, output = process.stdout) {
  let closed = false;
  let prompt;
  let terminal;

  function finish(code) {
    if (!prompt) return;
    const current = prompt;
    prompt = undefined;
    clearTimeout(current.arm);
    clearTimeout(current.timeout);
    const value = current.value;
    current.value = '';
    current.decoder = undefined;
    input.off('data', onData);
    input.off('end', onEnd);
    input.off('error', onError);
    try {
      if (input.isRaw !== current.priorRaw) input.setRawMode(current.priorRaw);
    } catch {
      code ??= 'PROMPT_STREAM_ERROR';
    }
    try {
      if (!current.wasFlowing) input.pause();
    } catch {
      code ??= 'PROMPT_STREAM_ERROR';
    }
    if (current.visible) {
      try { output.write('\n'); } catch { code ??= 'PROMPT_STREAM_ERROR'; }
    }
    if (code) current.reject(new PromptFailure(code));
    else current.resolve(value);
  }

  function onData(chunk) {
    const current = prompt;
    if (!current) return;
    const text = typeof chunk === 'string' ? chunk : current.decoder.write(chunk);
    if (!current.visible) {
      if (text.includes('\x03')) finish('PROMPT_CONTROL_CHAR');
      return;
    }
    for (const ch of text) {
      if (ch === '\r' || ch === '\n') {
        return finish(current.value ? undefined : 'PROMPT_EMPTY');
      } else if (ch === '\b' || ch === '\x7f') {
        current.value = [...current.value].slice(0, -1).join('');
      } else if (ch.charCodeAt(0) < 32) {
        return finish('PROMPT_CONTROL_CHAR');
      } else if (current.value.length + ch.length > 256) {
        return finish('PROMPT_TOO_LONG');
      } else {
        current.value += ch;
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
    finish(terminal ?? 'PROMPT_STREAM_END');
  }

  async function read(role) {
    if (closed || terminal || input.readableEnded || input.destroyed) {
      throw new PromptFailure(terminal ?? 'PROMPT_STREAM_END');
    }
    if (prompt) throw new PromptFailure('PROMPT_CONCURRENT');
    if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
      throw new PromptFailure('OWNER_TTY_REQUIRED');
    }
    return new Promise((resolve, reject) => {
      const current = { value: '', visible: false, resolve, reject,
        priorRaw: Boolean(input.isRaw), wasFlowing: input.readableFlowing === true,
        decoder: new StringDecoder('utf8') };
      prompt = current;
      try {
        input.setRawMode(true);
        input.on('end', onEnd);
        input.on('error', onError);
        input.on('data', onData);
        // Discard bytes queued while idle, including the trailing LF of an
        // earlier CRLF. No pairing state or timer survives a prompt.
        current.arm = setTimeout(() => {
          try {
            output.write('Contraseña de ' + role + ' (sin eco): ');
            current.visible = true;
            current.timeout = setTimeout(() => finish('PROMPT_TIMEOUT'), timeoutMs);
          } catch {
            onError();
          }
        }, drainMs);
        input.resume();
      } catch {
        onError();
      }
    });
  }
  return Object.freeze({ read, close });
}
