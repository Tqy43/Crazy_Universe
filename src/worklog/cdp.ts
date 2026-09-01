import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as net from 'node:net';

export interface CdpClient {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
  onEvent(handler: (method: string, params: Record<string, unknown>, sessionId?: string) => void): void;
  close(): void;
}

export async function debuggerUrl(port: number, timeoutMs = 15000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const body = await httpJson(`http://127.0.0.1:${port}/json/version`);
      const url = body.webSocketDebuggerUrl;
      if (typeof url === 'string' && url) {
        return url;
      }
    } catch {
      /* chrome still starting */
    }
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

export async function openCdp(wsUrl: string): Promise<CdpClient> {
  const socket = await openWebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners: Array<(method: string, params: Record<string, unknown>, sessionId?: string) => void> = [];

  const handleMessage = (raw: string) => {
    let msg: {
      id?: number;
      error?: { message?: string };
      result?: unknown;
      method?: string;
      params?: Record<string, unknown>;
      sessionId?: string;
    };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg.id === 'number' && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        waiter?.reject(new Error(msg.error.message || 'CDP error'));
      } else {
        waiter?.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      for (const listener of listeners) {
        listener(msg.method, msg.params ?? {}, msg.sessionId);
      }
    }
  };

  socket.onMessage(handleMessage);
  const pingTimer = setInterval(() => {
    try {
      socket.ping();
    } catch {
      /* closed */
    }
  }, 15_000);

  return {
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    onEvent(handler) {
      listeners.push(handler);
    },
    close() {
      clearInterval(pingTimer);
      for (const waiter of pending.values()) {
        waiter.reject(new Error('CDP closed'));
      }
      pending.clear();
      socket.close();
    },
  };
}

function httpJson(url: string): Promise<{ webSocketDebuggerUrl?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk as Buffer));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as { webSocketDebuggerUrl?: string });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(800, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

interface RawSocket {
  send(text: string): void;
  ping(): void;
  onMessage(handler: (text: string) => void): void;
  close(): void;
}

function openWebSocket(wsUrl: string): Promise<RawSocket> {
  const parsed = new URL(wsUrl);
  const key = crypto.randomBytes(16).toString('base64');
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: parsed.hostname, port: Number(parsed.port || 80) }, () => {
      socket.write(
        `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\n` +
          `Host: ${parsed.host}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });
    let upgraded = false;
    let headerBuf: Buffer = Buffer.alloc(0);
    let frameBuf: Buffer = Buffer.alloc(0);
    let fragment: Buffer = Buffer.alloc(0);
    const messageHandlers: Array<(text: string) => void> = [];
    let resolved = false;

    const fail = (error: Error) => {
      socket.destroy();
      if (!resolved) {
        reject(error);
      }
    };

    const raw: RawSocket = {
      send(text) {
        socket.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
      },
      ping() {
        socket.write(encodeFrame(0x9, Buffer.alloc(0)));
      },
      onMessage(handler) {
        messageHandlers.push(handler);
      },
      close() {
        socket.destroy();
      },
    };

    socket.on('data', (chunk: Buffer) => {
      if (!upgraded) {
        headerBuf = Buffer.concat([headerBuf, chunk]);
        const split = indexOfHeadersEnd(headerBuf);
        if (split < 0) {
          return;
        }
        const header = headerBuf.subarray(0, split).toString('utf8');
        if (!/Sec-WebSocket-Accept:/i.test(header)) {
          fail(new Error('WebSocket handshake failed'));
          return;
        }
        upgraded = true;
        frameBuf = headerBuf.subarray(split + 4);
        headerBuf = Buffer.alloc(0);
        resolved = true;
        resolve(raw);
        ({ frameBuf, fragment } = consumeFrames(socket, frameBuf, fragment, messageHandlers));
        return;
      }
      frameBuf = Buffer.concat([frameBuf, chunk]);
      ({ frameBuf, fragment } = consumeFrames(socket, frameBuf, fragment, messageHandlers));
    });
    socket.on('error', fail);
  });
}

function indexOfHeadersEnd(buffer: Buffer): number {
  const needle = Buffer.from('\r\n\r\n');
  return buffer.indexOf(needle);
}

function consumeFrames(
  socket: net.Socket,
  buffer: Buffer,
  fragment: Buffer,
  handlers: Array<(text: string) => void>,
): { frameBuf: Buffer; fragment: Buffer } {
  let offset = 0;
  let current = fragment;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset] ?? 0;
    const second = buffer[offset + 1] ?? 0;
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let header = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      header = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) {
        break;
      }
      length = Number(buffer.readBigUInt64BE(offset + 2));
      header = 10;
    }
    const maskBytes = masked ? 4 : 0;
    if (buffer.length - offset < header + maskBytes + length) {
      break;
    }
    let payload = buffer.subarray(offset + header + maskBytes, offset + header + maskBytes + length);
    if (masked) {
      const mask = buffer.subarray(offset + header, offset + header + 4);
      const copy = Buffer.from(payload);
      for (let i = 0; i < copy.length; i += 1) {
        copy[i] = (copy[i] ?? 0) ^ (mask[i % 4] ?? 0);
      }
      payload = copy;
    }
    offset += header + maskBytes + length;
    if (opcode === 0x8) {
      socket.destroy();
      break;
    }
    if (opcode === 0x9) {
      socket.write(encodeFrame(0xa, payload));
      continue;
    }
    if (opcode === 0xa) {
      continue;
    }
    if (opcode === 0x1 || opcode === 0x0) {
      current = opcode === 0x1 ? payload : Buffer.concat([current, payload]);
      if (fin) {
        const text = current.toString('utf8');
        current = Buffer.alloc(0);
        for (const handler of handlers) {
          handler(text);
        }
      }
    }
  }
  return { frameBuf: buffer.subarray(offset), fragment: current };
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const mask = crypto.randomBytes(4);
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0);
  }
  return Buffer.concat([header, mask, masked]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
