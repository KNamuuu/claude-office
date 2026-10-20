// 정원: 피크민풍 픽셀아트. 바닥은 16px 타일로 그려 2배로 키우고, 월드 좌표는 픽셀 2D와 같은 32px/타일.
// 캐릭터 스프라이트는 핀터레스트 팬아트(빨강·노랑·파랑 정면)를 바탕으로 만든 것 — 개인용.
(function () {
  const { W, H, ROOM } = window.Layout;
  const B = 16;               // 바닥 그림 기준 타일 크기
  const FW = 28, FH = 34;     // 스프라이트 한 프레임
  const STAGES = [['leaf', 0], ['bud', 50], ['flower', 130]];  // 도구 사용 횟수로 성장

  const img = {};
  const load = name => { const i = new Image(); i.src = `garden/${name}.png`; img[name] = i; };
  for (const c of ['red', 'yellow', 'blue']) {
    for (const [s] of STAGES) load(`${c}-${s}`);
    load(`onion-${c}`);
  }
  load('captain');

  const rnd = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ZONE = { server: [0, true], dev: [7, true], library: [14, true], meeting: [21, true], lounge: [0, false], desk: [7, false], search: [14, false], lobby: [21, false] };
  function zoneAt(x, y) {
    if (y === 7 || y === 8) return null;
    for (const [id, [x0, top]] of Object.entries(ZONE)) {
      const y0 = top ? 0 : 9;
      if (x >= x0 && x < x0 + 7 && y >= y0 && y < y0 + 7) return id;
    }
    return null;
  }

  // ── 바닥 (한 번만 그림) ────────────────────
  let ground = null;
  function buildGround() {
    const cv = document.createElement('canvas');
    cv.width = W * B; cv.height = H * B;
    const g = cv.getContext('2d');
    const R = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = zoneAt(x, y), X = x * B, Y = y * B;
      if (!z) {  // 흙길
        R((x + y) % 2 ? '#b38a55' : '#aa8250', X, Y, B, B);
        if (rnd(x, y) > 0.7) R('#8d6a3e', X + 4, Y + 6, 2, 2);
        continue;
      }
      const base = z === 'server' ? ['#55606a', '#5c6772'] : z === 'lobby' ? ['#7aa858', '#82b060'] : ['#5d9e3d', '#66a845'];
      R(base[(x + y) % 2], X, Y, B, B);
      if (z !== 'server' && rnd(x, y) > 0.55) {  // 풀잎
        const gx = X + Math.floor(rnd(y, x) * 12), gy = Y + Math.floor(rnd(x + 3, y) * 12);
        R('#3f7f2a', gx, gy + 1, 1, 3); R('#3f7f2a', gx + 2, gy, 1, 3);
      }
    }
    // 뒤쪽 바위 절벽
    for (let x = 0; x < W; x++) {
      R('#6b5a48', x * B, 0, B, B); R('#8a7660', x * B, 0, B, 4);
      R('#5a4a3a', x * B + 2 + Math.floor(rnd(x, 1) * 8), 6, 5, 4);
    }
    const hedge = (X, Y) => {
      R('#2f6e2a', X, Y, B, B);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = '#3f8a35'; g.beginPath();
        g.arc(X + 4 + Math.floor(rnd(X, Y + k) * 9), Y + 4 + Math.floor(rnd(Y, X + k) * 8), 2.5, 0, Math.PI * 2); g.fill();
      }
      R('#57a845', X, Y, B, 2);
    };
    for (const r of Object.values(ROOM)) {
      if (r.top) {  // 윗줄 방 아래쪽 낮은 울타리 (문 칸은 열림)
        for (let i = 0; i < 7; i++) {
          if (r.x0 + i === r.doorTile.x) continue;
          R('#2f6e2a', (r.x0 + i) * B, 7 * B - 4, B, 6); R('#57a845', (r.x0 + i) * B, 7 * B - 4, B, 2);
        }
      } else {      // 아랫줄 방 위쪽 생울타리 (문 칸은 흙길)
        for (let i = 0; i < 7; i++) {
          const X = (r.x0 + i) * B;
          if (r.x0 + i === r.doorTile.x) R('#aa8250', X, 9 * B, B, B); else hedge(X, 9 * B);
        }
      }
    }
    for (const xb of [7, 14, 21]) for (const [y0, y1] of [[1, 7], [10, 16]]) {  // 구역 사이 울타리
      R('#2f6e2a', xb * B - 3, y0 * B, 6, (y1 - y0) * B); R('#57a845', xb * B - 3, y0 * B, 2, (y1 - y0) * B);
    }
    // 고정 소품
    const T = B;
    g.strokeStyle = '#8a5a32'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(8 * T + 2, 2 * T + 3 + k * 3); g.lineTo(10 * T + 12, 2 * T + 1 + k * 3); g.stroke(); }
    R('#3a2a1a', 8 * T + 4, 4 * T + 4, 15, 15); R('#b07a3a', 8 * T + 5, 4 * T + 5, 13, 13);
    g.fillStyle = '#ffe9a0'; g.font = 'bold 9px Menlo, monospace'; g.textAlign = 'center'; g.fillText('?', 8 * T + 11.5, 4 * T + 15);
    for (const [x, y, c] of [[14, 1, '#d4842e'], [15, 1, '#c26a2a'], [16, 2, '#e0a03a'], [18, 1, '#b8562a'], [19, 2, '#d4842e'], [20, 1, '#c26a2a']]) {
      const X = x * T, Y = y * T;  // 낙엽
      g.fillStyle = c; g.strokeStyle = '#6a3a1a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X + 2, Y + 12); g.lineTo(X + 8, Y + 1); g.lineTo(X + 14, Y + 11); g.lineTo(X + 8, Y + 14); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(X + 8, Y + 2); g.lineTo(X + 8, Y + 13); g.stroke();
    }
    g.fillStyle = '#e03a4a'; g.beginPath(); g.arc(17 * T + 7.5, 3 * T + 8.5, 5.5, 0, Math.PI * 2); g.fill();
    R('#3a6e2a', 17 * T + 7, 3 * T, 2, 4);
    // 작전 바위 + 깃발
    g.fillStyle = '#9a9284'; g.strokeStyle = '#3d3a34';
    g.beginPath(); g.ellipse(24 * T - 1, 3 * T - 1, 1.7 * T, 0.9 * T, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#b8b2a6'; g.beginPath(); g.ellipse(23.3 * T, 2.6 * T, 0.8 * T, 0.4 * T, 0, 0, Math.PI * 2); g.fill();
    R('#5a4a3a', 22 * T + 1, 1 * T, 2, 22);
    g.fillStyle = '#e8663a'; g.beginPath(); g.moveTo(22 * T + 3, T); g.lineTo(22 * T + 12, T + 3); g.lineTo(22 * T + 3, T + 6); g.fill();
    // 꽃밭
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(rnd(k, 2) * 6), y = 10 + Math.floor(rnd(2, k) * 6);
      const X = x * T + Math.floor(rnd(k, 5) * 10), Y = y * T + Math.floor(rnd(5, k) * 10);
      const c = ['#ff8fb0', '#ffffff', '#ffd84a', '#c48aff'][k % 4];
      for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) R(c, X + 2 + dx, Y + 2 + dy, 2, 2);
      R('#f5c842', X + 2, Y + 2, 2, 2);
    }
    g.fillStyle = '#8a5a32'; g.strokeStyle = '#3a2a1a';
    g.beginPath(); g.ellipse(4.9 * T, 13.7 * T, 1.0 * T, 0.6 * T, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#c89a5a'; g.beginPath(); g.ellipse(4.9 * T, 13.55 * T, 0.7 * T, 0.32 * T, 0, 0, Math.PI * 2); g.fill();
    // 연못
    g.fillStyle = '#3a8fd6'; g.strokeStyle = '#24608f'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(17.75 * T, 13.2 * T, 2.75 * T, 2.15 * T, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#4caf3a'; g.beginPath(); g.ellipse(18.6 * T, 11.85 * T, 0.6 * T, 0.38 * T, 0, 0, Math.PI * 2); g.fill();
    return cv;
  }

  // 착륙선 (캡틴 뒤)
  function ship(g, now) {
    const T = B;
    g.fillStyle = '#d9dde6'; g.strokeStyle = '#3a3f4c'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(10.5 * T, 11.6 * T, 2.1 * T, 0.75 * T, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#9fd4ff'; g.beginPath(); g.ellipse(10.5 * T, 11.1 * T, 1.0 * T, 0.7 * T, 0, Math.PI, 0); g.fill(); g.stroke();
    g.fillStyle = '#6b6f7c'; g.fillRect(9 * T, 12.2 * T, 2, 8); g.fillRect(12 * T - 2, 12.2 * T, 2, 8);
    if (Math.floor(now / 500) % 2) { g.fillStyle = '#ffe14a'; g.fillRect(10.5 * T - 2, 10.3 * T, 4, 3); }
  }

  // 움직이는 소품
  function props(g, f, now) {
    const T = B, t = now / 1000;
    const heat = Math.min(f.heat.server.length, 20), dev = Math.min(f.heat.dev.length, 20);
    [1, 2, 4, 5].forEach((x, i) => {  // 배터리: Bash가 많을수록 빨리 출렁
      const X = x * T, Y = T;
      g.fillStyle = '#141418'; g.fillRect(X + 1, Y - 3, 14, 18);
      g.fillStyle = '#2b2f3a'; g.fillRect(X + 2, Y - 2, 12, 16);
      g.fillStyle = '#c9ccd4'; g.fillRect(X + 5, Y - 5, 6, 3);
      const lvl = Math.floor(((Math.sin(t * (1.5 + heat * 0.5) + i * 1.7) + 1) / 2) * 10) + 2;
      g.fillStyle = lvl > 7 ? '#ffe14a' : '#f2a33a'; g.fillRect(X + 4, Y + 12 - lvl, 8, lvl);
    });
    if (Math.floor(t * (3 + heat)) % 2 === 0) {  // 전기 울타리 스파크
      g.strokeStyle = '#fff36a'; g.lineWidth = 1; g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(9 + (k % 2 ? 3 : -3), 3 * T + 4 + k * 5);
      g.stroke();
    }
    const built = Math.floor((t * (0.3 + dev * 0.1)) % 1 * 6) + 2;  // 다리 공사: Edit가 많을수록 빨리
    for (let k = 0; k < 8; k++) {
      g.fillStyle = '#3a2a1a'; g.fillRect(11 * T + k * 5, 3 * T + 4, 4, 10);
      g.fillStyle = k < built ? '#c08a4a' : '#5a4a3a'; g.fillRect(11 * T + k * 5 + 1, 3 * T + 5, 2, 8);
    }
    g.fillStyle = '#ffffff'; g.fillRect(17 * T + 4 + Math.floor(t * 3) % 3, 3 * T + 5, 1, 1);  // 열매 반짝
    g.strokeStyle = '#9fd4ff'; g.lineWidth = 1;  // 연못 물결
    for (let k = 0; k < 5; k++) {
      const r = (t * 10 + k * 7) % 28, cx = 16 * T + 8 + k * 14, cy = 13 * T + (k % 2) * 8;
      g.beginPath(); g.ellipse(cx, cy, r / 2, r / 4 + 0.1, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
  }

  const stageOf = n => STAGES.reduce((s, [name, min]) => (n >= min ? name : s), 'leaf');
  const POND = { cx: 17.75 * B, cy: 13.2 * B, rx: 2.75 * B, ry: 2.15 * B };

  function drawPik(g, c, now, sel) {
    const sheet = img[`${c.pik}-${stageOf(c.toolCount)}`];
    const row = 'durl'.indexOf(c.dir) < 0 ? 0 : 'durl'.indexOf(c.dir);
    const f = c.moving ? Math.floor(now / 140) % 4 : 0;
    const x = Math.round(c.x * B - 13.5), y = Math.round(c.y * B + 6 - FH);
    const fx = c.x * B, fy = c.y * B;
    const swim = !c.moving && ((fx - POND.cx) / POND.rx) ** 2 + ((fy - POND.cy) / POND.ry) ** 2 < 0.9;
    g.fillStyle = 'rgba(0,0,0,0.22)'; if (!swim) g.fillRect(x + 8, y + FH - 2, 12, 2);
    if (sel) { g.fillStyle = '#ffd166'; g.fillRect(x + 6, y + FH, 16, 1); }
    if (!sheet || !sheet.complete) return;
    const h = swim ? 24 : FH;   // 헤엄: 몸 아래쪽은 물 속
    g.drawImage(sheet, f * FW, row * FH, FW, h, x, y + (swim ? 6 : 0), FW, h);
    if (swim) { g.strokeStyle = '#9fd4ff'; g.beginPath(); g.ellipse(fx, y + 6 + h, 8, 2, 0, 0, Math.PI); g.stroke(); }
    if (c.chip === '휴식 중') {  // 졸기
      g.fillStyle = '#ffffff'; g.font = 'bold 7px Menlo, monospace';
      g.fillText('z'.repeat(1 + Math.floor(now / 600) % 3), x + 22, y + 10 - (now / 200) % 4);
    }
  }

  function bounds() { return { x: -20, y: -36, w: W * B * 2 + 40, h: H * B * 2 + 56 }; }

  function draw(g, f, now, selKey) {
    if (!ground) ground = buildGround();
    g.save();
    g.scale(2, 2);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#2a3d22'; g.fillRect(-B, -B, (W + 2) * B, (H + 2) * B);
    g.drawImage(ground, 0, 0);
    props(g, f, now);

    const items = [];
    const pnow = performance.now();
    ROOM.lobby.elevatorTiles.forEach((t, i) => {
      const oi = img[`onion-${['red', 'yellow', 'blue'][i]}`];
      const ox = t.x * B + 8, oy = t.y * B + 8;
      items.push({ y: oy - 1, draw: () => {
        const open = Math.max(0, Math.min(1, (f.elevators[i] - pnow) / 600));
        if (oi.complete) g.drawImage(oi, Math.round(ox - oi.width / 2), Math.round(oy - oi.height));
        if (open > 0) {  // 빛기둥: 출근·퇴근
          g.fillStyle = `rgba(255,240,170,${0.45 * open})`;
          g.fillRect(ox - 6, oy - 16, 12, 16);
        }
      } });
    });
    items.push({ y: 11.6 * B, draw: () => ship(g, now) });
    const me = f.me, cap = img.captain;
    items.push({ y: me.y * B, draw: () => { // captain.png: 앞·뒤·옆 3줄 x 걷기 2칸 (18x24), 왼쪽은 반전
      if (!cap.complete) return;
      const row = { d: 0, u: 1, r: 2, l: 2 }[me.dir] ?? 0, fr = me.moving ? Math.floor(now / 160) % 2 : 0;
      const x = Math.round(me.x * B - 9), y = Math.round(me.y * B + 6 - 24 - (me.moving && fr ? 1 : 0));
      if (me.dir === 'l') { g.save(); g.translate(x + 18, y); g.scale(-1, 1); g.drawImage(cap, fr * 18, row * 24, 18, 24, 0, 0, 18, 24); g.restore(); }
      else g.drawImage(cap, fr * 18, row * 24, 18, 24, x, y, 18, 24);
    } });
    const chars = window.Office.present(f);
    for (const c of chars) items.push({ y: c.y * B, draw: () => drawPik(g, c, now, c.key === selKey) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    g.restore();

    return [me, ...chars].map(c => ({
      c, ax: c.x * B * 2, ay: (c.y * B - 26) * 2,
      tagX: c.x * B * 2, tagY: (c.y * B + 8) * 2,
      hit: { x: (c.x * B - 10) * 2, y: (c.y * B - 26) * 2, w: 40, h: 64 },
    }));
  }

  window.GardenRenderer = { id: 'garden', bounds, draw, bg: '#1f2a1c' };
})();
