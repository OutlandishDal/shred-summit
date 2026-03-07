import * as THREE from 'three';

// Cache generated textures by item ID / brand
const boardTextureCache = new Map();
const jacketLogoCache = new Map();

// ---- BOARD TEXTURES ----

export function createBoardTexture(itemId, baseColorHex) {
  if (boardTextureCache.has(itemId)) return boardTextureCache.get(itemId);

  // Canvas matches board aspect ratio: width=0.35, length=1.9 → ~1:5.4
  const w = 256;
  const h = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Fill with base color
  const baseColor = '#' + new THREE.Color(baseColorHex).getHexString();
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // Draw board-specific graphic
  const drawFn = BOARD_DRAWS[itemId] || drawGenericBoard;
  drawFn(ctx, w, h, baseColor, baseColorHex);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  boardTextureCache.set(itemId, texture);
  return texture;
}

// Helper: draw centered text
function drawText(ctx, text, x, y, font, color, align = 'center') {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Helper: lighten/darken a hex color
function shadeColor(hex, amt) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, Math.max(0, c.r + amt));
  c.g = Math.min(1, Math.max(0, c.g + amt));
  c.b = Math.min(1, Math.max(0, c.b + amt));
  return '#' + c.getHexString();
}

// ---- PER-BOARD DRAW FUNCTIONS ----

const BOARD_DRAWS = {
  'burton-custom': (ctx, w, h) => {
    // Dark blue base with white BURTON text and mountain chevron
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(20, 80 + i * 16); ctx.lineTo(w - 20, 80 + i * 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, h - 80 - i * 16); ctx.lineTo(w - 20, h - 80 - i * 16); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 400); ctx.lineTo(w - 20, 600); ctx.lineTo(w / 2, 560);
    ctx.lineTo(20, 600); ctx.closePath(); ctx.fill();
    drawText(ctx, 'BURTON', w / 2, h * 0.55, 'bold 44px Impact', '#ffffff');
    drawText(ctx, 'CUSTOM', w / 2, h * 0.62, '24px Arial', 'rgba(255,255,255,0.6)');
  },

  'yes-greats': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) {
      const y = 200 + i * 200;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y + 100); ctx.lineTo(0, y + 200); ctx.closePath(); ctx.fill();
    }
    drawText(ctx, 'YES.', w / 2, h * 0.48, 'bold 72px Impact', '#ffffff');
    drawText(ctx, 'GREATS', w / 2, h * 0.56, 'bold 28px Arial', 'rgba(255,255,255,0.7)');
  },

  'capita-doa': (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 12;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(-40, 160 + i * 160); ctx.lineTo(w + 40, 160 + i * 160 - 120);
      ctx.stroke();
    }
    drawText(ctx, 'DOA', w / 2, h * 0.42, 'bold 80px Impact', '#000000');
    drawText(ctx, 'CAPiTA', w / 2, h * 0.55, 'bold 36px Impact', '#ffffff');
  },

  'jones-mtn-twin': (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const cy = 200 + i * 100;
      const rx = 60 + Math.sin(i * 0.8) * 30;
      const ry = 40 + Math.cos(i * 0.5) * 20;
      ctx.beginPath();
      ctx.ellipse(w / 2, cy, rx, ry, 0.2 * i, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 300); ctx.lineTo(60, 120); ctx.lineTo(100, 180);
    ctx.lineTo(160, 80); ctx.lineTo(w, 260); ctx.lineTo(w, 300); ctx.closePath(); ctx.fill();
    drawText(ctx, 'JONES', w / 2, h * 0.55, 'bold 44px Impact', '#ffffff');
    drawText(ctx, 'MTN TWIN', w / 2, h * 0.62, '22px Arial', 'rgba(255,255,255,0.5)');
  },

  'burton-process': (ctx, w, h) => {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(30, h - 400 + i * 80, w - 60, 30);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 160, w, 60);
    drawText(ctx, 'BURTON', w / 2, h * 0.45, 'bold 40px Impact', '#ffffff');
    drawText(ctx, 'PROCESS', w / 2, h * 0.52, '24px Arial', 'rgba(255,255,255,0.7)');
  },

  'capita-mega-merc': (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    let y = 120;
    ctx.moveTo(40, y);
    while (y < h - 120) {
      ctx.lineTo(w - 40, y + 60);
      ctx.lineTo(40, y + 120);
      y += 120;
    }
    ctx.stroke();
    drawText(ctx, 'CAPiTA', w / 2, h * 0.48, 'bold 40px Impact', '#ffffff');
    drawText(ctx, 'MEGA MERC', w / 2, h * 0.55, 'bold 22px Arial', 'rgba(255,255,255,0.6)');
  },

  'yes-standard': (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(40, h * 0.65); ctx.lineTo(w - 40, h * 0.65); ctx.stroke();
    drawText(ctx, 'YES.', w / 2, h * 0.48, 'bold 72px Impact', '#000000');
    drawText(ctx, 'STANDARD', w / 2, h * 0.58, '22px Arial', 'rgba(0,0,0,0.5)');
  },

  'yes-eiki': (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const purple = '#8b00ff';
    const purpleLight = '#a855f7';
    ctx.lineCap = 'round';

    const claws = [
      { x: 30, y: 240, angle: 0.15, len: 800 },
      { x: 70, y: 180, angle: 0.12, len: 900 },
      { x: 120, y: 260, angle: 0.18, len: 760 },
      { x: 170, y: 200, angle: 0.10, len: 840 },
    ];

    for (const claw of claws) {
      ctx.strokeStyle = purple;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(claw.x, claw.y);
      ctx.lineTo(claw.x - Math.sin(claw.angle) * claw.len,
                 claw.y + claw.len);
      ctx.stroke();

      ctx.strokeStyle = purpleLight;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(claw.x + 2, claw.y + 20);
      ctx.lineTo(claw.x - Math.sin(claw.angle) * claw.len + 2,
                 claw.y + claw.len - 20);
      ctx.stroke();

      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(claw.x, claw.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    drawText(ctx, 'YES.', w / 2, h * 0.78, 'bold 60px Impact', '#ffffff');
    drawText(ctx, 'EIKI PRO', w / 2, h * 0.84, 'bold 26px Arial', purple);
  },

  // ---- SKIS ----
  '1000skis-rival': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, 16, h);
    drawText(ctx, '1000', w / 2, h * 0.45, 'bold 36px Impact', '#ffffff');
    drawText(ctx, 'RIVAL', w / 2, h * 0.52, '20px Arial', 'rgba(255,255,255,0.7)');
  },

  'faction-prodigy': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(w - 16, 0, 16, h);
    drawText(ctx, 'FACTION', w / 2, h * 0.45, 'bold 28px Impact', '#ffffff');
    drawText(ctx, 'PRODIGY', w / 2, h * 0.52, '18px Arial', 'rgba(255,255,255,0.6)');
  },

  'atomic-bent': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, 12, h);
    ctx.fillRect(w - 12, 0, 12, h);
    drawText(ctx, 'ATOMIC', w / 2, h * 0.45, 'bold 28px Impact', '#ffffff');
    drawText(ctx, 'BENT 100', w / 2, h * 0.52, '18px Arial', 'rgba(255,255,255,0.6)');
  },

  'faction-dancer': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(0, i * 140, w, 8);
    }
    drawText(ctx, 'FACTION', w / 2, h * 0.45, 'bold 28px Impact', '#ffffff');
    drawText(ctx, 'DANCER', w / 2, h * 0.52, '18px Arial', 'rgba(255,255,255,0.6)');
  },

  'atomic-maverick': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, 8, h);
    drawText(ctx, 'ATOMIC', w / 2, h * 0.45, 'bold 28px Impact', '#ffffff');
    drawText(ctx, 'MAVERICK', w / 2, h * 0.52, '18px Arial', 'rgba(255,255,255,0.6)');
  },

  '1000skis-icon': (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(w - 12, 0, 12, h);
    drawText(ctx, '1000', w / 2, h * 0.45, 'bold 36px Impact', '#ffffff');
    drawText(ctx, 'ICON', w / 2, h * 0.52, '20px Arial', 'rgba(255,255,255,0.7)');
  },
};

function drawGenericBoard(ctx, w, h, baseColor, baseColorHex) {
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, h * 0.35, w, 6);
  ctx.fillRect(0, h * 0.65, w, 6);
}

// ---- JACKET LOGOS ----

export function createJacketLogo(brand, baseColorHex) {
  const cacheKey = brand;
  if (jacketLogoCache.has(cacheKey)) return jacketLogoCache.get(cacheKey);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Draw brand logo
  const drawFn = JACKET_LOGOS[brand] || drawGenericLogo;
  drawFn(ctx, size, brand);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  jacketLogoCache.set(cacheKey, texture);
  return texture;
}

const JACKET_LOGOS = {
  'DOPE SNOW': (ctx, s) => {
    drawText(ctx, 'DOPE', s / 2, s * 0.42, 'bold 64px Impact', '#ffffff');
    drawText(ctx, 'SNOW', s / 2, s * 0.62, '28px Arial', 'rgba(255,255,255,0.7)');
  },
  'BURTON': (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.2); ctx.lineTo(s * 0.7, s * 0.4);
    ctx.lineTo(s / 2, s * 0.35); ctx.lineTo(s * 0.3, s * 0.4);
    ctx.closePath(); ctx.fill();
    drawText(ctx, 'BURTON', s / 2, s * 0.6, 'bold 44px Impact', '#ffffff');
  },
  'JONES': (ctx, s) => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.15); ctx.lineTo(s * 0.7, s * 0.4); ctx.lineTo(s * 0.3, s * 0.4);
    ctx.closePath(); ctx.fill();
    drawText(ctx, 'JONES', s / 2, s * 0.6, 'bold 48px Impact', '#ffffff');
  },
  'SNOWVERB': (ctx, s) => {
    drawText(ctx, 'SNOWVERB', s / 2, s / 2, 'bold 36px Arial', '#ffffff');
  },
  'YES.': (ctx, s) => {
    drawText(ctx, 'YES.', s / 2, s / 2, 'bold 72px Impact', '#ffffff');
  },
  'CAPiTA': (ctx, s) => {
    drawText(ctx, 'CAPiTA', s / 2, s / 2, 'bold 44px Impact', '#ffffff');
  },
  'SHRED SUMMIT': (ctx, s) => {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(s * 0.25, s * 0.45); ctx.lineTo(s * 0.3, s * 0.25);
    ctx.lineTo(s * 0.4, s * 0.38); ctx.lineTo(s * 0.5, s * 0.2);
    ctx.lineTo(s * 0.6, s * 0.38); ctx.lineTo(s * 0.7, s * 0.25);
    ctx.lineTo(s * 0.75, s * 0.45); ctx.closePath(); ctx.fill();
    drawText(ctx, 'SHRED', s / 2, s * 0.62, 'bold 36px Impact', '#ffd700');
    drawText(ctx, 'SUMMIT', s / 2, s * 0.76, '22px Arial', 'rgba(255,215,0,0.7)');
  },
  '1000 SKIS': (ctx, s) => {
    drawText(ctx, '1000', s / 2, s * 0.4, 'bold 56px Impact', '#ffffff');
    drawText(ctx, 'SKIS', s / 2, s * 0.6, '28px Arial', 'rgba(255,255,255,0.7)');
  },
  'FACTION': (ctx, s) => {
    drawText(ctx, 'FACTION', s / 2, s / 2, 'bold 40px Impact', '#ffffff');
  },
  'ATOMIC': (ctx, s) => {
    drawText(ctx, 'ATOMIC', s / 2, s / 2, 'bold 44px Impact', '#ffffff');
  },
};

function drawGenericLogo(ctx, s, brand) {
  drawText(ctx, brand, s / 2, s / 2, 'bold 32px Arial', '#ffffff');
}
