// build/icon.png (1024px, 주황 배경에 픽셀 고양이)를 의존성 없이 만든다: npm run icon
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { FRAMES, palette } = require('../renderer/sprites');

const N = 1024, px = Buffer.alloc(N * N * 4);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const put = (x, y, [r, g, b]) => { const i = (y * N + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };

// 둥근 사각형 주황 배경
const R = 180, M = 64;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const cx = Math.max(M + R - x, 0, x - (N - M - R)), cy = Math.max(M + R - y, 0, y - (N - M - R));
  if (x < M || y < M || x >= N - M || y >= N - M || cx * cx + cy * cy > R * R) continue;
  put(x, y, y > N * 0.72 ? hex('#c8642e') : hex('#e07a3f'));
}
// 고양이 (흰색 몸에 진한 윤곽이 주황 위에서 잘 보이게)
const pal = palette('#fbe9da'), rows = FRAMES.d[0], S = 40;
const ox = (N - 16 * S) / 2, oy = (N - rows.length * S) / 2 - 10;
rows.forEach((row, j) => [...row].forEach((ch, i) => {
  if (!pal[ch]) return;
  const c = hex(ch === 'w' ? '#ffffff' : pal[ch]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(ox + i * S + x, oy + j * S + y, c);
}));

// PNG 인코딩
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
