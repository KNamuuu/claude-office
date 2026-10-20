// 픽셀 2D: 탑다운 3/4 시점. 월드 좌표 = 타일 * T px.
(function () {
  const { W, H, ROOMS, ROOM } = window.Layout;
  const { FRAMES, palette, shade } = window.Sprites;
  const T = 32;
  const spriteCache = new Map();

  // 스프라이트를 색별로 한 번만 오프스크린 캔버스로 굽는다
  function sprite(color, dir, frame) {
    const k = color + dir + frame;
    let cv = spriteCache.get(k);
    if (!cv) {
      const pal = palette(color), rows = FRAMES[dir][frame];
      cv = document.createElement('canvas');
      cv.width = 16; cv.height = rows.length;
      const g = cv.getContext('2d');
      rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
      spriteCache.set(k, cv);
    }
    return cv;
  }

  const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const noise = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  function drawFloor(g) {
    rect(g, '#0e0d13', -T, -T, (W + 2) * T, (H + 2) * T);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = window.Layout.roomAt(x, y);
      if (!r) { // 복도
        rect(g, (x + y) % 2 ? '#2a2a33' : '#2d2d37', x * T, y * T, T, T);
        if (y === 7) rect(g, '#34343f', x * T, y * T + T - 2, T, 2);
        continue;
      }
      rect(g, r.floor[(x + y) % 2], x * T, y * T, T, T);
      if (r.id === 'lounge') rect(g, 'rgba(255,170,190,0.05)', x * T + 4, y * T + 4, T - 8, T - 8);
      if (r.id === 'dev' || r.id === 'desk') rect(g, 'rgba(0,0,0,0.12)', x * T, y * T + T - 1, T, 1);
    }
  }

  function drawWalls(g, now) {
    // 뒷벽(윗줄 방 0행)과 아랫줄 방 위쪽 벽(9행): 벽면 + 윗면
    for (const r of ROOMS) {
      const y = r.y0 * T;
      for (let i = 0; i < 7; i++) {
        const x = (r.x0 + i) * T;
        if (!r.top && r.x0 + i === r.doorTile.x) { // 문틀
          rect(g, '#1a1820', x - 3, y, 3, T); rect(g, '#1a1820', x + T, y, 3, T);
          rect(g, r.floor[0], x, y, T, T);
          rect(g, '#5a5470', x - 3, y - 4, T + 6, 4);
          continue;
        }
        rect(g, '#3f3a52', x, y, T, T);
        rect(g, '#4a4561', x, y, T, 6);
        rect(g, '#5d5778', x, y - 4, T, 4);
        rect(g, '#2a2638', x, y + T - 3, T, 3);
      }
      for (const d of r.wall) drawWallDeco(g, d, r, now);
      if (r.elevatorTiles) for (let i = 0; i < r.elevatorTiles.length; i++) drawElevator(g, r.elevatorTiles[i].x, r.y0, i);
    }
    // 방 사이 칸막이 벽
    for (const xb of [7, 14, 21]) for (const [y0, y1] of [[0, 7], [9, 16]]) {
      rect(g, '#1a1820', xb * T - 3, y0 * T - 4, 6, (y1 - y0) * T + 4);
      rect(g, '#5d5778', xb * T - 3, y0 * T - 4, 6, 3);
    }
    // 윗줄 방과 복도 사이 낮은 벽 (문 칸은 비움)
    for (const r of ROOMS.filter(r => r.top)) for (let i = 0; i < 7; i++) {
      const x = (r.x0 + i) * T;
      if (r.x0 + i === r.doorTile.x) { rect(g, '#7a6a4a', x, 7 * T - 2, T, 2); continue; }
      rect(g, '#1a1820', x, 7 * T - 4, T, 6);
      rect(g, '#5d5778', x, 7 * T - 6, T, 3);
    }
    // 바깥 테두리
    rect(g, '#1a1820', -4, -4, W * T + 8, 4); rect(g, '#1a1820', -4, H * T, W * T + 8, 4);
    rect(g, '#1a1820', -4, -4, 4, H * T + 8); rect(g, '#1a1820', W * T, -4, 4, H * T + 8);
  }

  const elevatorOpen = [0, 0];
  function drawElevator(g, tx, ty, i) {
    const x = tx * T, y = ty * T;
    rect(g, '#7c7f8c', x + 1, y - 2, T - 2, T + 2);
    rect(g, '#22222a', x + 4, y + 3, T - 8, T - 3);
    const open = elevatorOpen[i] * (T / 2 - 4);
    rect(g, '#b8bcc8', x + 4, y + 3, T / 2 - 4 - open, T - 3);
    rect(g, '#a7abb8', x + T / 2 + open, y + 3, T / 2 - 4 - open, T - 3);
    rect(g, elevatorOpen[i] > 0 ? '#ffcf4a' : '#5a5d68', x + T / 2 - 2, y - 1, 4, 2);
  }

  function drawWallDeco(g, d, r, now) {
    const x = d.x * T, y = r.y0 * T, w = d.w * T;
    if (d.t === 'window') {
      rect(g, '#1a1820', x + 4, y + 4, w - 8, T - 10);
      rect(g, '#2d4a6e', x + 6, y + 6, w - 12, T - 14);
      rect(g, '#3f6592', x + 6, y + 6, w - 12, 5);
      rect(g, '#1a1820', x + w / 2 - 1, y + 6, 2, T - 14);
    } else if (d.t === 'whiteboard') {
      rect(g, '#d8dbe2', x + 4, y + 4, w - 8, T - 10);
      for (let i = 0; i < 4; i++) rect(g, ['#e0533d', '#3d7be0', '#2f9e5b', '#222'][i], x + 10, y + 9 + i * 4, (w - 30) * (0.4 + noise(i, 3) * 0.6), 2);
      rect(g, '#9a9ea8', x + 4, y + T - 7, w - 8, 2);
    } else if (d.t === 'worldmap' || d.t === 'screen') {
      rect(g, '#14161c', x + 3, y + 3, w - 6, T - 8);
      rect(g, '#0f3a4a', x + 5, y + 5, w - 10, T - 12);
      for (let i = 0; i < 9; i++) rect(g, '#3fc0a8', x + 8 + noise(i, 1) * (w - 20), y + 8 + noise(i, 2) * 10, 4 + noise(i, 5) * 8, 3);
      const sweep = (now / 25) % (w - 10);
      rect(g, 'rgba(120,255,220,0.35)', x + 5 + sweep, y + 5, 2, T - 12);
    } else if (d.t === 'poster') {
      rect(g, '#e07a3f', x + 9, y + 5, T - 18, T - 12);
      rect(g, '#fbe3cf', x + 12, y + 9, T - 24, 3);
    } else if (d.t === 'clock') {
      rect(g, '#efe6d8', x + 11, y + 6, 10, 10);
      rect(g, '#222', x + 15, y + 8, 2, 4);
      rect(g, '#222', x + 15, y + 11, 4, 1);
    } else if (d.t === 'vent') {
      for (let i = 0; i < 4; i++) rect(g, '#2a2638', x + 8, y + 7 + i * 4, T - 16, 2);
    }
  }

  // 가구: y가 큰 것을 나중에 그리도록 정렬용 깊이와 함께 반환
  function furnitureDrawables(f, now) {
    const out = [];
    const serverHeat = f.heat.server.length, devHeat = f.heat.dev.length;
    for (const r of ROOMS) for (const it of r.furn) {
      out.push({ depth: (it.y + it.h) * T - (it.block ? 2 : 20), draw: g => drawFurn(g, it, now, serverHeat, devHeat) });
    }
    return out;
  }

  function drawFurn(g, it, now, serverHeat, devHeat) {
    const x = it.x * T, y = it.y * T, w = it.w * T, h = it.h * T;
    switch (it.t) {
      case 'rack': {
        rect(g, '#0b0c10', x + 3, y - 14, T - 6, T + 12);
        rect(g, '#1d212c', x + 5, y - 12, T - 10, T + 8);
        const rate = 1.2 + Math.min(serverHeat, 20) * 0.9; // 활동량이 많을수록 빨리 깜빡임
        for (let j = 0; j < 7; j++) {
          rect(g, '#272c3a', x + 6, y - 10 + j * 5, T - 12, 4);
          for (let i = 0; i < 3; i++) {
            const on = noise(it.x * 7 + i, it.y * 13 + j + Math.floor(now / 1000 * rate + noise(i, j) * 5)) > 0.45;
            rect(g, on ? (i === 2 ? '#ffb347' : '#5cff8a') : '#1a3a24', x + 9 + i * 4, y - 9 + j * 5, 2, 2);
          }
        }
        break;
      }
      case 'console':
        rect(g, '#2b2f3c', x + 2, y + 4, w - 4, h - 6);
        rect(g, '#0b0c10', x + 5, y + 7, w - 10, 16);
        rect(g, '#5cff8a', x + 7, y + 10 + (Math.floor(now / 300) % 3) * 4, 10, 2);
        break;
      case 'desk': case 'terminal': case 'mydesk': {
        rect(g, '#5a3d27', x + 2, y + 10, w - 4, h - 10);
        rect(g, '#8a5f3d', x + 2, y + 6, w - 4, 8);
        rect(g, '#a87650', x + 2, y + 6, w - 4, 2);
        const mons = it.t === 'mydesk' ? [x + w / 2 - 10] : Array.from({ length: it.w }, (_, i) => x + i * T + 6);
        for (const [mi, mx] of mons.entries()) {
          rect(g, '#14161c', mx, y - 12, 20, 18);
          rect(g, '#14161c', mx + 8, y + 5, 4, 3);
          const sx = mx + 2, sy = y - 10, sw = 16, sh = 13;
          if (it.t === 'desk') { // 코드가 흐르는 모니터
            rect(g, '#10141c', sx, sy, sw, sh);
            const speed = 6 + devHeat * 2, off = (now / 1000 * speed + mi * 3 + it.x) ;
            for (let l = 0; l < 6; l++) {
              const n = Math.floor(off) + l, len = 3 + noise(n, it.x) * 11, ind = Math.floor(noise(n, 2) * 3) * 2;
              const col = ['#8be9fd', '#ff79c6', '#f1fa8c', '#50fa7b', '#bd93f9'][n % 5];
              const yy = sy + 1 + l * 2 - (off % 1) * 2;
              if (yy >= sy && yy < sy + sh - 1) rect(g, col, sx + 1 + ind, yy, Math.min(len, sw - 2 - ind), 1);
            }
          } else if (it.t === 'terminal') {
            rect(g, '#0d2a38', sx, sy, sw, sh);
            rect(g, '#2e8fb8', sx + 4, sy + 2, 8, 8);
            rect(g, '#6fe0c8', sx + 5 + (Math.floor(now / 400) % 3) * 2, sy + 4, 2, 3);
          } else {
            rect(g, '#1d2430', sx, sy, sw, sh);
            rect(g, '#e07a3f', sx + 2, sy + 2, 5, 4);
            rect(g, '#6c7a90', sx + 2, sy + 8, 12, 1);
            rect(g, '#6c7a90', sx + 2, sy + 10, 8, 1);
          }
        }
        if (it.t === 'mydesk') { rect(g, '#e8e1d2', x + w - 26, y + 8, 10, 6); rect(g, '#c25a2a', x + 8, y + 7, 6, 6); }
        break;
      }
      case 'chair':
        rect(g, '#2a2f3c', x + 8, y + 8, T - 16, T - 14);
        rect(g, '#3b4254', x + 8, y + 8, T - 16, 3);
        break;
      case 'shelf':
        rect(g, '#3a2718', x + 1, y - 14, w - 2, h + 10);
        for (let j = 0; j < 3; j++) {
          rect(g, '#24170e', x + 3, y - 12 + j * 12, w - 6, 10);
          for (let i = 0; i * 4 < w - 8; i++) {
            const n = noise(it.x * 3 + i, j);
            if (n > 0.15) rect(g, ['#c0453a', '#3a74c0', '#d6b03a', '#4ea06a', '#8a5bc0', '#d07a3a'][Math.floor(n * 6)], x + 4 + i * 4, y - 12 + j * 12 + Math.floor(noise(i, j) * 3), 3, 10 - Math.floor(noise(i, j) * 3));
          }
        }
        break;
      case 'table': case 'coffeetable':
        rect(g, '#4d3626', x + 3, y + 6, w - 6, h - 6);
        rect(g, it.t === 'table' ? '#9b7451' : '#6d4c34', x + 3, y + 3, w - 6, h - 10);
        rect(g, '#b68b63', x + 3, y + 3, w - 6, 2);
        if (it.t === 'table') for (let i = 0; i < it.w; i++) rect(g, '#efe6d8', x + i * T + 10, y + 8, 10, 7);
        else rect(g, '#efe6d8', x + w / 2 - 4, y + 8, 7, 6);
        break;
      case 'sofa':
        rect(g, '#7a3a52', x + 2, y + 2, w - 4, h - 4);
        rect(g, '#9b4b69', x + 2, y + 2, w - 4, 6);
        rect(g, '#6a2f45', x + 2, y + 12, 5, h - 14); rect(g, '#6a2f45', x + w - 7, y + 12, 5, h - 14);
        break;
      case 'armchair':
        rect(g, '#3a6a7a', x + 4, y + 4, T - 8, T - 8);
        rect(g, '#4b8494', x + T - 10, y + 4, 6, T - 8);
        break;
      case 'bench':
        rect(g, '#555a68', x + 2, y + 14, w - 4, 8);
        rect(g, '#6b7182', x + 2, y + 14, w - 4, 2);
        break;
      case 'plant':
        rect(g, '#8a4b2a', x + 10, y + 16, 12, 12);
        rect(g, '#2f7a3a', x + 6, y + 2, 20, 16);
        rect(g, '#46a052', x + 9, y - 2, 8, 10);
        rect(g, '#46a052', x + 17, y + 4, 7, 8);
        break;
      case 'vending':
        rect(g, '#b8323a', x + 3, y - 12, T - 6, T + 10);
        rect(g, '#1d2a3a', x + 6, y - 8, T - 16, T - 4);
        for (let j = 0; j < 4; j++) rect(g, ['#f1d24a', '#4ad1f1', '#7cf14a', '#f14a9a'][j], x + 8, y - 6 + j * 6, T - 20, 3);
        rect(g, '#efe6d8', x + T - 9, y, 3, 8);
        break;
      case 'coffee':
        rect(g, '#2b2b33', x + 6, y + 2, T - 12, T - 6);
        rect(g, '#5a5a66', x + 8, y + 4, T - 16, 6);
        rect(g, '#efe6d8', x + 13, y + 16, 6, 6);
        if (Math.floor(now / 500) % 2) rect(g, 'rgba(255,255,255,0.4)', x + 15, y + 10 - (now / 100) % 4, 2, 4);
        break;
      case 'cabinet':
        rect(g, '#59606e', x + 4, y - 6, T - 8, T + 2);
        for (let j = 0; j < 3; j++) { rect(g, '#6b7382', x + 6, y - 4 + j * 9, T - 12, 7); rect(g, '#2a2f3c', x + 14, y - 1 + j * 9, 4, 1); }
        break;
      case 'globe':
        rect(g, '#5a3d27', x + 13, y + 18, 6, 10);
        rect(g, '#2e6fb8', x + 7, y + 2, 18, 18);
        rect(g, '#4fbf7f', x + 10 + (Math.floor(now / 600) % 3) * 2, y + 6, 6, 5);
        rect(g, '#4fbf7f', x + 14, y + 13, 5, 4);
        break;
    }
  }

  function drawCat(g, c, now, sel) {
    const px = c.x * T, py = c.y * T;
    const frame = c.moving ? Math.floor(now / 160) % 2 : 0;
    const bob = c.moving ? (frame ? -1 : 0) : 0;
    const spr = sprite(c.color, c.dir, frame);
    rect(g, 'rgba(0,0,0,0.35)', px - 10, py + 7, 20, 4);
    if (sel) { rect(g, '#ffd166', px - 13, py + 9, 26, 2); rect(g, '#ffd166', px - 13, py - 26, 26, 2); }
    g.drawImage(spr, Math.round(px - 16), Math.round(py - 24 + bob), 32, 32);
    if (c.kind === 'claude') { // 주황 고양이 머리 위 ✳ 배지
      g.fillStyle = '#ffe2c8'; g.font = 'bold 9px Menlo, monospace'; g.textAlign = 'center';
      g.fillText('✳', px, py - 25 + bob);
    }
    if (c.kind === 'codex') { // Codex는 초록 고양이 + >_ 배지
      g.fillStyle = '#c9f5e6'; g.font = 'bold 8px Menlo, monospace'; g.textAlign = 'center';
      g.fillText('>_', px, py - 25 + bob);
    }
    if (c.kind === 'me') rect(g, '#3d7be0', px - 9, py - 23, 18, 2); // 헤드셋
  }

  function bounds() { return { x: -T * 0.6, y: -T * 0.9, w: (W + 1.2) * T, h: (H + 1.5) * T }; }

  function draw(g, f, now, selKey) {
    g.imageSmoothingEnabled = false;
    const pnow = performance.now();
    for (let i = 0; i < 2; i++) elevatorOpen[i] = Math.max(0, Math.min(1, (f.elevators[i] - pnow) / 600));
    drawFloor(g);
    drawWalls(g, now);
    const items = furnitureDrawables(f, now);
    const chars = [f.me, ...window.Office.present(f)];
    for (const c of chars) items.push({ depth: c.y * T, draw: gg => drawCat(gg, c, now, c.key === selKey) });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw(g);
    return chars.map(c => ({ c, ax: c.x * T, ay: c.y * T - 30, tagX: c.x * T, tagY: c.y * T + 12, hit: { x: c.x * T - 14, y: c.y * T - 26, w: 28, h: 38 } }));
  }

  window.PixelRenderer = { id: 'pixel', bounds, draw, bg: '#0e0d13' };
})();
