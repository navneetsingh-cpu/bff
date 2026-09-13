// Pretty-prints `redis-cli MONITOR` output: one line per command, with any JSON
// argument (a session record) decoded and indented underneath it.
//
//   redis-cli MONITOR | node scripts/redis-monitor.mjs
//
// Lines that aren't MONITOR entries (such as the initial "OK") pass through.
import { createInterface } from 'node:readline';

// <unix seconds>.<micros> [<db> <client addr>] "arg" "arg" ...
const ENTRY = /^(\d+)\.(\d+) \[\d+ [^\]]+\] (.*)$/;

const ESCAPES = { n: 0x0a, r: 0x0d, t: 0x09, a: 0x07, b: 0x08, '"': 0x22, '\\': 0x5c };

// Undoes redis-cli's quoting. Non-ASCII bytes arrive as \xHH, so collect bytes
// and decode as UTF-8 at the end to get multi-byte characters back intact.
function parseArgs(text) {
  const args = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '"') {
      i++;
      continue;
    }
    const bytes = [];
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\' && text[i + 1] === 'x') {
        bytes.push(parseInt(text.slice(i + 2, i + 4), 16));
        i += 4;
      } else if (text[i] === '\\') {
        bytes.push(ESCAPES[text[i + 1]] ?? text.charCodeAt(i + 1));
        i += 2;
      } else {
        bytes.push(text.charCodeAt(i));
        i++;
      }
    }
    args.push(Buffer.from(bytes).toString('utf8'));
    i++;
  }
  return args;
}

function tryJson(value) {
  if (!/^\s*[[{]/.test(value)) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function formatTime(seconds, micros) {
  const d = new Date(Number(seconds) * 1000);
  return `${d.toTimeString().slice(0, 8)}.${micros.slice(0, 3)}`;
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on('line', (raw) => {
  // redis-cli runs under a TTY, so lines can end in \r.
  const line = raw.replace(/\r$/, '');
  const match = ENTRY.exec(line);
  if (!match) {
    console.log(line);
    return;
  }

  const [, seconds, micros, argText] = match;
  const [command = '', ...rest] = parseArgs(argText);
  const records = [];
  const shown = rest.map((arg) => {
    const parsed = tryJson(arg);
    if (parsed === undefined) return arg === '' || /\s/.test(arg) ? JSON.stringify(arg) : arg;
    records.push(parsed);
    return '<json>';
  });

  console.log(`${formatTime(seconds, micros)}  ${[command.toUpperCase(), ...shown].join(' ')}`);
  for (const record of records) {
    console.log(JSON.stringify(record, null, 2).replace(/^/gm, '    '));
  }
});
