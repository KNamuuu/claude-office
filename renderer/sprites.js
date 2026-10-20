// 문자열 스프라이트로 그린 16x16 픽셀 고양이. (렌더러와 scripts/make-icon.js가 함께 쓴다)
(function (root) {
  const HEAD = [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obnboooooobnbo.',
    '.obbbbbbbbbbbbo.',
  ];
  const FRONT = [
    ...HEAD,
    'obbdbbbbbbbbdbbo',
    'obbbbbbbbbbbbbbo',
    'obbeebbbbbbeebbo',
    'obbeebbbbbbeebbo',
    'obbbbbwnnwbbbbbo',
    '.obbbwwwwwwbbbo.',
    '..oobbbbbbbboo..',
    '..obbbwwwwbbbo..',
    '.obbbwwwwwwbbbo.',
    '.obbbwwwwwwbbbo.',
    '.obbbbbbbbbbbbo.',
  ];
  const BACK = [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbdbbdbbdbbdbbo',
    'obbbbbbbbbbbbbbo',
    'obbdbbdbbdbbdbbo',
    'obbbbbbbbbbbbbbo',
    'obbbbbbbbbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '..oobbbbbbbboo..',
    '..obbbbbbbbbbo..',
    '.obbbdbbbbdbbbo.',
    '.obbbbbbbbbbbbo.',
    '.obbbbbbbbbbbbo.',
  ];
  // 옆모습(오른쪽): 얼굴이 오른쪽, 꼬리가 왼쪽 뒤
  const SIDE = [
    '......oo...oo...',
    '.....obbo.obbo..',
    '.....obnbobnbo..',
    '....obbbbbbbbbo.',
    '...obbdbbdbbbbbo',
    '...obbbbbbbbbbbo',
    '...obbbbbbbbeebo',
    '...obbbbbbbbeebo',
    '...obbbbbbbbbwno',
    '....obbbbbbbwwo.',
    '.....oobbbbbbo..',
    'ddo..obbbbbbbo..',
    '.dddobbwwwwbbo..',
    '..ddobbwwwwbbo..',
    '....obbbbbbbbo..',
  ];
  const SIDE_FEET = ['.....owwoowwo...', '....owwo..owwo..'];
  const FEET = ['.oowwoooooowwoo.', '..owwoo..oowwo..'];
  const TAIL = ['.oobboooooodddoo', '.oobbooooodddo..'];

  const FRAMES = {
    d: [0, 1].map(f => [...FRONT, FEET[f]]),
    u: [0, 1].map(f => [...BACK, TAIL[f]]),
    l: [0, 1].map(f => [...SIDE, SIDE_FEET[f]].map(r => [...r].reverse().join(''))),
    r: [0, 1].map(f => [...SIDE, SIDE_FEET[f]]),
  };

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function palette(body) {
    return { o: '#1c1418', b: body, d: shade(body, -0.28), w: shade(body, 0.72), e: '#141018', n: '#f39bb4' };
  }

  const COLORS = {
    claude: '#e07a3f',
    codex: '#10a37f',
    me: '#8d97ab',
    subs: ['#5b8def', '#4fbf7f', '#a070e6', '#e86fa6', '#3fbab2', '#e2c044', '#d9d2c5', '#4a4a58', '#7fb5ff', '#c08a5a'],
  };

  const api = { FRAMES, palette, shade, COLORS, SIZE: 16 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
