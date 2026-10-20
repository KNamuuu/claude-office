// 아이소메트릭: 밝은 3D 사무실. 타일 (x,y,z) → 화면 ((x-y)*32, (x+y)*16 - z*34). 깊이는 x+y로 정렬.
(function () {
  const { W, H, ROOMS, ROOM } = window.Layout;
  const HW = 32, HH = 16, Z = 34, WALL = 2.5;
  const P = (x, y, z = 0) => [(x - y) * HW, (x + y) * HH - z * Z];
  const shade = window.Sprites.shade;

  function poly(g, pts, fill, stroke) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  // 상자: 윗면 + 앞(+y)면 + 오른(+x)면
  function box(g, x, y, w, d, h, color, z = 0) {
    const t = z + h;
    poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, t), P(x, y + d, t)], shade(color, -0.12));
    poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, t), P(x + w, y, t)], shade(color, -0.24));
    poly(g, [P(x, y, t), P(x + w, y, t), P(x + w, y + d, t), P(x, y + d, t)], color, shade(color, -0.18));
  }
  // +y 면 위의 사각형 (u: x 방향 위치, v: 높이)
  function faceY(g, x0, y, u, v, w, h, c) { poly(g, [P(x0 + u, y, v), P(x0 + u + w, y, v), P(x0 + u + w, y, v + h), P(x0 + u, y, v + h)], c); }
  function faceX(g, x, y0, u, v, w, h, c) { poly(g, [P(x, y0 + u, v), P(x, y0 + u + w, v), P(x, y0 + u + w, v + h), P(x, y0 + u, v + h)], c); }

  const noise = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  function drawFloors(g) {
    poly(g, [P(0, 7), P(W, 7), P(W, 9), P(0, 9)], '#f7f6f3');
    for (const r of ROOMS) poly(g, [P(r.x0, r.y0), P(r.x0 + 7, r.y0), P(r.x0 + 7, r.y0 + 7), P(r.x0, r.y0 + 7)], r.isoFloor);
    g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(...P(x, 0)); g.lineTo(...P(x, H)); g.stroke(); }
    for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(...P(0, y)); g.lineTo(...P(W, y)); g.stroke(); }
    // 라운지 러그
    poly(g, [P(0.6, 12.6), P(4.4, 12.6), P(4.4, 15.4), P(0.6, 15.4)], 'rgba(224,122,63,0.18)');
  }

  function drawBackWalls(g, now) {
    // 왼쪽 벽 (x=0)
    poly(g, [P(0, 0), P(0, H), P(0, H, WALL), P(0, 0, WALL)], '#e4e1db', '#cfcac2');
    // 뒷벽 (y=0), 방마다 창문
    poly(g, [P(0, 0), P(W, 0), P(W, 0, WALL), P(0, 0, WALL)], '#f1eee8', '#d6d1c8');
    for (const r of ROOMS.filter(r => r.top)) {
      for (const [u, w] of [[0.6, 2.2], [4.2, 2.2]]) {
        const sky = g.createLinearGradient(...P(r.x0 + u, 0, 2.1), ...P(r.x0 + u, 0, 0.9));
        sky.addColorStop(0, '#9fd0f2'); sky.addColorStop(1, '#dff0fb');
        faceY(g, r.x0, 0, u, 0.9, w, 1.2, '#b9c3cc');
        faceY(g, r.x0, 0, u + 0.06, 0.96, w - 0.12, 1.08, sky);
        faceY(g, r.x0, 0, u + w / 2 - 0.03, 0.96, 0.06, 1.08, '#b9c3cc');
      }
      for (const d of r.wall) {
        if (d.t === 'whiteboard') {
          faceY(g, d.x, 0.01, 0, 0.8, d.w, 1.0, '#9aa3ad');
          faceY(g, d.x, 0.01, 0.05, 0.85, d.w - 0.1, 0.9, '#ffffff');
          for (let i = 0; i < 3; i++) faceY(g, d.x, 0.01, 0.3, 1.45 - i * 0.2, 0.6 + noise(i, 1) * 1.6, 0.05, ['#e0533d', '#3d7be0', '#2f9e5b'][i]);
        } else if (d.t === 'clock') {
          faceY(g, d.x, 0.01, 0.3, 2.05, 0.4, 0.3, '#ffffff');
        }
      }
    }
    // 벽 위 몰딩
    g.strokeStyle = '#c7c1b7'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(...P(0, H, WALL)); g.lineTo(...P(0, 0, WALL)); g.lineTo(...P(W, 0, WALL)); g.stroke();
  }

  // 유리 칸막이 한 칸
  function glass(g, ax, ay, bx, by) {
    const h = 1.25;
    poly(g, [P(ax, ay), P(bx, by), P(bx, by, h), P(ax, ay, h)], 'rgba(160,205,232,0.28)');
    g.strokeStyle = '#9fb3c4'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(...P(ax, ay, h)); g.lineTo(...P(bx, by, h)); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(...P(ax + (bx - ax) * 0.3, ay + (by - ay) * 0.3, 0.2)); g.lineTo(...P(ax + (bx - ax) * 0.5, ay + (by - ay) * 0.5, 1.0)); g.stroke();
    g.fillStyle = '#b8c6d2';
    for (const [px, py] of [[ax, ay], [bx, by]]) { const [sx, sy] = P(px, py, h); g.fillRect(sx - 1, sy, 2, h * Z); }
  }

  function glassDrawables() {
    const out = [];
    for (const X of [7, 14, 21]) for (const [y0, y1] of [[0, 7], [9, 16]]) for (let y = y0; y < y1; y++) {
      if (y === 0) continue;
      out.push({ depth: X + y + 0.5, draw: g => glass(g, X, y, X, y + 1) });
    }
    for (const r of ROOMS) {
      const Y = r.top ? 7 : 9;
      for (let x = r.x0; x < r.x0 + 7; x++) {
        if (x === r.doorTile.x) continue;
        out.push({ depth: x + 0.5 + Y, draw: g => glass(g, x, Y, x + 1, Y) });
      }
    }
    return out;
  }

  function drawFurn(g, it, now, f) {
    const { x, y, w, h: d } = it;
    switch (it.t) {
      case 'rack': {
        box(g, x + 0.12, y + 0.1, 0.76, 0.8, 2.0, '#3b404c');
        const rate = 1.2 + Math.min(f.heat.server.length, 20) * 0.9;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 3; i++) {
          const on = noise(x * 7 + i, y * 13 + j + Math.floor(now / 1000 * rate + noise(i, j) * 5)) > 0.45;
          faceY(g, x + 0.12, y + 0.9, 0.12 + i * 0.2, 0.2 + j * 0.22, 0.08, 0.06, on ? (i === 2 ? '#ffb347' : '#3ee07a') : '#2b3a30');
        }
        break;
      }
      case 'console':
        box(g, x + 0.15, y + 0.1, 0.7, d - 0.2, 0.8, '#5a606e');
        faceX(g, x + 0.85, y + 0.1, 0.2, 0.3, d - 0.6, 0.4, '#173a26');
        break;
      case 'desk': case 'terminal': case 'mydesk': {
        box(g, x + 0.05, y + 0.1, w - 0.1, d - 0.2, 0.7, it.t === 'mydesk' ? '#c98f5f' : '#e2c29b');
        const mons = it.t === 'mydesk' ? [w / 2 - 0.3] : Array.from({ length: w }, (_, i) => i + 0.2);
        mons.forEach((u, mi) => {
          box(g, x + u, y + 0.25, 0.6, 0.06, 0.45, '#2b2f38', 0.78);
          box(g, x + u + 0.25, y + 0.3, 0.1, 0.1, 0.08, '#2b2f38', 0.7);
          const sy = y + 0.31, base = 0.82;
          if (it.t === 'desk') { // 코드가 흐르는 모니터
            faceY(g, x + u, sy, 0.04, base, 0.52, 0.37, '#1a1f2b');
            const off = now / 1000 * (6 + f.heat.dev.length * 2) + mi * 3 + x;
            for (let l = 0; l < 5; l++) {
              const n = Math.floor(off) + l, len = 0.08 + noise(n, x) * 0.36, ind = Math.floor(noise(n, 2) * 3) * 0.04;
              const v = base + 0.33 - l * 0.07 + (off % 1) * 0.07;
              if (v < base + 0.35 && v > base + 0.02) faceY(g, x + u, sy, 0.07 + ind, v, len, 0.025, ['#8be9fd', '#ff79c6', '#f1fa8c', '#50fa7b', '#bd93f9'][n % 5]);
            }
          } else if (it.t === 'terminal') {
            faceY(g, x + u, sy, 0.04, base, 0.52, 0.37, '#0d3446');
            faceY(g, x + u, sy, 0.18, base + 0.08, 0.22, 0.22, '#2e8fb8');
            faceY(g, x + u, sy, 0.2 + (Math.floor(now / 400) % 3) * 0.05, base + 0.15, 0.06, 0.08, '#7ef0d0');
          } else {
            faceY(g, x + u, sy, 0.04, base, 0.52, 0.37, '#f4f6fa');
            faceY(g, x + u, sy, 0.08, base + 0.24, 0.14, 0.09, '#e07a3f');
            faceY(g, x + u, sy, 0.08, base + 0.12, 0.38, 0.03, '#aab4c3');
          }
        });
        if (it.t === 'mydesk') box(g, x + 0.3, y + 0.55, 0.16, 0.16, 0.14, '#e07a3f', 0.7);
        break;
      }
      case 'chair':
        box(g, x + 0.3, y + 0.3, 0.4, 0.4, 0.42, '#4b5262');
        box(g, x + 0.3, y + 0.62, 0.4, 0.08, 0.45, '#3c4250', 0.42);
        break;
      case 'shelf':
        box(g, x + 0.02, y + 0.1, w - 0.04, d - 0.2, 2.0, '#9a6b45');
        for (let j = 0; j < 4; j++) for (let i = 0; i < w * 6; i++) {
          const n = noise(x * 3 + i, j);
          if (n > 0.2) faceY(g, x + 0.02, y + d - 0.1, 0.06 + i * 0.16, 0.12 + j * 0.47, 0.12, 0.3 + noise(i, j) * 0.1, ['#c0453a', '#3a74c0', '#d6b03a', '#4ea06a', '#8a5bc0', '#d07a3a'][Math.floor(n * 6)]);
        }
        break;
      case 'table':
        box(g, x + 0.1, y + 0.1, w - 0.2, d - 0.2, 0.72, '#f4f4f2');
        for (let i = 0; i < w; i++) box(g, x + i + 0.3, y + 0.35, 0.35, 0.25, 0.01, '#d5dbe3', 0.72);
        break;
      case 'coffeetable':
        box(g, x + 0.15, y + 0.2, w - 0.3, d - 0.4, 0.38, '#b98a5c');
        box(g, x + w / 2 - 0.1, y + 0.4, 0.15, 0.15, 0.12, '#ffffff', 0.38);
        break;
      case 'sofa':
        box(g, x + 0.05, y + 0.15, w - 0.1, d - 0.25, 0.42, '#e07a3f');
        box(g, x + 0.05, y + d - 0.22, w - 0.1, 0.12, 0.75, '#c8642e');
        break;
      case 'armchair':
        box(g, x + 0.15, y + 0.15, 0.7, 0.7, 0.4, '#5aa4b5');
        box(g, x + 0.75, y + 0.15, 0.12, 0.7, 0.75, '#4a8a99');
        break;
      case 'bench':
        box(g, x + 0.05, y + 0.3, w - 0.1, 0.45, 0.4, '#a0a7b4');
        break;
      case 'plant': {
        box(g, x + 0.32, y + 0.32, 0.36, 0.36, 0.4, '#d9d4cc');
        const [cx, cy] = P(x + 0.5, y + 0.5, 0.95);
        g.fillStyle = '#4c9a5a'; g.beginPath(); g.ellipse(cx, cy, 15, 17, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#62b56f'; g.beginPath(); g.ellipse(cx - 4, cy - 5, 8, 9, 0, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'vending':
        box(g, x + 0.1, y + 0.1, 0.8, 0.8, 1.9, '#d6453f');
        faceX(g, x + 0.9, y + 0.1, 0.1, 0.5, 0.45, 1.1, '#2a3646');
        for (let j = 0; j < 4; j++) faceX(g, x + 0.9, y + 0.1, 0.15, 0.6 + j * 0.25, 0.35, 0.12, ['#f1d24a', '#4ad1f1', '#7cf14a', '#f14a9a'][j]);
        break;
      case 'coffee':
        box(g, x + 0.2, y + 0.2, 0.6, 0.6, 0.9, '#3a3a44');
        box(g, x + 0.35, y + 0.55, 0.2, 0.2, 0.15, '#ffffff', 0.9);
        break;
      case 'cabinet':
        box(g, x + 0.15, y + 0.15, 0.7, 0.7, 1.25, '#a7afbc');
        for (let j = 0; j < 3; j++) faceY(g, x + 0.15, y + 0.85, 0.28, 0.25 + j * 0.38, 0.14, 0.04, '#5b6372');
        break;
      case 'globe': {
        box(g, x + 0.4, y + 0.4, 0.2, 0.2, 0.6, '#8a5f3d');
        const [cx, cy] = P(x + 0.5, y + 0.5, 1.0);
        g.fillStyle = '#3d86d6'; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5cc47f'; g.beginPath(); g.ellipse(cx - 3 + Math.sin(now / 900) * 4, cy - 2, 5, 4, 0, 0, Math.PI * 2); g.fill();
        break;
      }
    }
  }

  function drawElevator(g, tx, ty, open) {
    box(g, tx + 0.05, ty + 0.05, 0.9, 0.9, 2.2, '#b9bec8');
    const o = open * 0.3;
    faceY(g, tx + 0.05, ty + 0.95, 0.12, 0, 0.66, 1.75, '#2b2e36');
    faceY(g, tx + 0.05, ty + 0.95, 0.12, 0, 0.33 - o, 1.75, '#d8dce3');
    faceY(g, tx + 0.05, ty + 0.95, 0.45 + o, 0, 0.33 - o, 1.75, '#ccd1d9');
    faceY(g, tx + 0.05, ty + 0.95, 0.38, 1.88, 0.14, 0.1, open > 0 ? '#ffb000' : '#7b808b');
  }

  function drawPerson(g, c, now, sel) {
    const [x, y] = P(c.x, c.y, 0);
    const walkPh = c.moving ? Math.sin(now / 90) : 0;
    const facing = c.dir === 'd' || c.dir === 'r';
    const shirt = c.kind === 'claude' ? '#e07a3f' : c.kind === 'codex' ? '#10a37f' : c.kind === 'me' ? '#5f6b7d' : '#3d7be0';
    const hair = c.kind === 'claude' ? '#5b3a29' : c.kind === 'me' ? '#2b2b30' : ['#2b2b30', '#7a4a2a', '#c9a35a', '#8a3a2a'][(c.key.length + c.key.charCodeAt(c.key.length - 1)) % 4];
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2); g.fill();
    if (sel) { g.strokeStyle = '#ff9a3c'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 15, 7, 0, 0, Math.PI * 2); g.stroke(); }
    // 다리
    g.fillStyle = '#39404d';
    g.fillRect(x - 5, y - 14 + Math.max(0, walkPh) * 2, 4, 14 - Math.max(0, walkPh) * 2);
    g.fillRect(x + 1, y - 14 + Math.max(0, -walkPh) * 2, 4, 14 - Math.max(0, -walkPh) * 2);
    // 몸통
    g.fillStyle = shirt;
    g.beginPath(); g.roundRect(x - 8, y - 32, 16, 20, 5); g.fill();
    g.fillStyle = shade(shirt, -0.15);
    g.fillRect(x - 10, y - 29 + walkPh * 2, 3, 11); g.fillRect(x + 7, y - 29 - walkPh * 2, 3, 11);
    if ((c.kind === 'claude' || c.kind === 'codex') && facing) {
      g.fillStyle = '#fff'; g.font = `bold ${c.kind === 'codex' ? 8 : 11}px -apple-system, sans-serif`; g.textAlign = 'center';
      g.fillText(c.kind === 'codex' ? '>_' : '✳', x, y - 18);
    }
    // 머리
    g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(x, y - 40, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = hair;
    g.beginPath();
    if (facing) g.arc(x, y - 42, 8.5, Math.PI * 1.05, Math.PI * 1.95); else g.arc(x, y - 40, 8.5, 0, Math.PI * 2);
    g.fill();
    if (facing) {
      g.fillStyle = '#2b2b30';
      const ex = c.dir === 'r' ? 2 : -2;
      g.fillRect(x - 3 + ex, y - 40, 2, 2); g.fillRect(x + 2 + ex, y - 40, 2, 2);
    }
    if (c.kind === 'me') { g.strokeStyle = '#2b2b30'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 41, 9.5, Math.PI, 0); g.stroke(); }
  }

  function bounds() {
    const [x0] = P(0, H), [x1] = P(W, 0), [, y0] = P(0, 0, WALL + 0.6), [, y1] = P(W, H);
    return { x: x0 - 40, y: y0 - 30, w: x1 - x0 + 80, h: y1 - y0 + 60 };
  }

  function draw(g, f, now, selKey) {
    g.imageSmoothingEnabled = true;
    drawFloors(g);
    drawBackWalls(g, now);
    const items = glassDrawables();
    for (const r of ROOMS) for (const it of r.furn) {
      const k = it.x + it.w / 2 + it.y + it.h / 2 - (it.block ? 0 : 1);
      items.push({ depth: k, draw: gg => drawFurn(gg, it, now, f) });
    }
    const pnow = performance.now();
    ROOM.lobby.elevatorTiles.forEach((t, i) => {
      const open = Math.max(0, Math.min(1, (f.elevators[i] - pnow) / 600));
      items.push({ depth: t.x + 0.5 + t.y - 1 + 0.5, draw: gg => drawElevator(gg, t.x, t.y - 1, open) });
    });
    const chars = [f.me, ...window.Office.present(f)];
    for (const c of chars) items.push({ depth: c.x + c.y + 0.01, draw: gg => drawPerson(gg, c, now, c.key === selKey) });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw(g);
    return chars.map(c => {
      const [x, y] = P(c.x, c.y);
      return { c, ax: x, ay: y - 52, tagX: x, tagY: y + 14, hit: { x: x - 12, y: y - 50, w: 24, h: 54 } };
    });
  }

  window.IsoRenderer = { id: 'iso', bounds, draw, bg: '#eef1f5' };
})();
