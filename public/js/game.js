/* game.js — client v2: char select, scenes, hazards, visual upgrade */
const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────
const lobbyEl          = document.getElementById('lobby');
const charSelectEl     = document.getElementById('charSelect');
const gameScreenEl     = document.getElementById('gameScreen');
const roomInput        = document.getElementById('roomInput');
const joinBtn          = document.getElementById('joinBtn');
const lobbyStatus      = document.getElementById('lobbyStatus');
const canvas           = document.getElementById('gameCanvas');
const ctx              = canvas.getContext('2d');
const waitingOverlay   = document.getElementById('waitingOverlay');
const waitingText      = document.getElementById('waitingText');
const resultOverlay    = document.getElementById('resultOverlay');
const resultText       = document.getElementById('resultText');
const restartBtn       = document.getElementById('restartBtn');
const roomLabel        = document.getElementById('roomLabel');
const sceneLabel       = document.getElementById('sceneLabel');
const charCards        = document.getElementById('charCards');
const charOpponentStatus = document.getElementById('charOpponentStatus');
const charSelectSubtitle = document.getElementById('charSelectSubtitle');

// ── State ─────────────────────────────────────────────────────────────────
let myIndex    = -1;
let sceneData  = null;  // { platforms, hazards, launchPads, movingPlatforms, vanishPlatforms, spawn, theme, bgColor, gridColor, name }
let world      = { width: 1200, height: 700 };
let PLAYER_BASE = {};
let charDefs   = {};    // { scout: {...}, tank: {...} }
let myCharKey  = null;
let playerChars = {};   // index → charDef (populated from gameStart)
let gameState  = null;
let inGame     = false;

// ── Input ─────────────────────────────────────────────────────────────────
const keys = {};
const prevSent = { left:false, right:false, jump:false, attack:false, dash:false };

window.addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function readInput() {
  return {
    left:   !!(keys['KeyA'] || keys['ArrowLeft']),
    right:  !!(keys['KeyD'] || keys['ArrowRight']),
    jump:   !!(keys['KeyW'] || keys['ArrowUp'] || keys['Space']),
    attack: !!(keys['KeyJ'] || keys['KeyZ']),
    dash:   !!(keys['KeyK'] || keys['KeyX']),
  };
}

setInterval(() => {
  if (!inGame) return;
  const inp = readInput();
  if (inp.left !== prevSent.left || inp.right !== prevSent.right ||
      inp.jump !== prevSent.jump || inp.attack !== prevSent.attack ||
      inp.dash !== prevSent.dash) {
    socket.emit('input', inp);
    Object.assign(prevSent, inp);
  }
}, 1000 / 60);

// ── Canvas ────────────────────────────────────────────────────────────────
function resizeCanvas() {
  const scale = Math.min(window.innerWidth / world.width, window.innerHeight / world.height) * 0.95;
  canvas.width  = world.width;
  canvas.height = world.height;
  canvas.style.width  = Math.floor(world.width  * scale) + 'px';
  canvas.style.height = Math.floor(world.height * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);

// ── roundRect polyfill ────────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);
  ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x,   y+r);
  ctx.arcTo(x,   y,   x+r, y,     r);
  ctx.closePath();
}

// ── Camera shake ──────────────────────────────────────────────────────────
let shakeAmt = 0;

function addShake(amt) { shakeAmt = Math.max(shakeAmt, amt); }

// ── Particles ─────────────────────────────────────────────────────────────
const CHAR_COLORS = { scout: '#4cc9f0', tank: '#f72585' };
const CHAR_DARKS  = { scout: '#0d4f66', tank: '#5c0a30' };

let particles = [];

function spawnHitParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 300;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 100,
      life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
      color, size: 3 + Math.random() * 6,
    });
  }
}

function spawnMuzzleFlash(x, y, dir, color) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x, y,
      vx: dir * (200 + Math.random() * 300), vy: (Math.random() - 0.5) * 180,
      life: 0.08 + Math.random() * 0.08, maxLife: 0.16,
      color, size: 4 + Math.random() * 6,
    });
  }
}

// Floating damage numbers
let damageNumbers = [];

function spawnDmgNumber(x, y, dmg, color) {
  damageNumbers.push({
    x, y, vy: -120,
    text: `-${dmg}`,
    color, life: 0.9, maxLife: 0.9,
    size: 18 + Math.min(dmg, 20),
  });
}

// ── Bullet trails ─────────────────────────────────────────────────────────
const bulletTrails = {};

// ── Render ────────────────────────────────────────────────────────────────
let prevHPs     = {};
let lastTs      = null;
let prevBullets = [];

function getPlayerColor(ps) {
  return (playerChars[ps.index] && playerChars[ps.index].color) || CHAR_COLORS[ps.charKey] || '#4cc9f0';
}
function getPlayerDark(ps) {
  return CHAR_DARKS[ps.charKey] || '#0d4f66';
}

function drawBackground() {
  const theme = sceneData ? sceneData.theme : 'neon';
  const W = world.width, H = world.height;

  if (theme === 'lava') {
    // Dark fiery bg
    const bg = ctx.createRadialGradient(W/2, H, 0, W/2, H*0.3, H);
    bg.addColorStop(0, '#1a0800');
    bg.addColorStop(1, '#0d0500');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Glow strips near bottom
    ctx.save();
    ctx.globalAlpha = 0.15;
    const lava = ctx.createLinearGradient(0, H-120, 0, H);
    lava.addColorStop(0, 'transparent');
    lava.addColorStop(1, '#ff4400');
    ctx.fillStyle = lava;
    ctx.fillRect(0, H-120, W, 120);
    ctx.restore();
  } else if (theme === 'void') {
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W*0.7);
    bg.addColorStop(0, '#050510');
    bg.addColorStop(1, '#020208');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Stars
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    // Use a seeded pattern (fixed positions based on simple hash)
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137 + 17) % W);
      const sy = ((i * 89  + 41) % (H * 0.85));
      const sr = 0.5 + (i % 3) * 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  } else {
    // Neon city
    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, W, H);
  }

  // Grid
  const gridColor = (sceneData && sceneData.gridColor) || 'rgba(42,42,64,0.4)';
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 80) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 80) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }
}

function drawPlatform(p, extra) {
  const theme = sceneData ? sceneData.theme : 'neon';
  const shakeX = extra && extra.shakeX || 0;
  const isGround = p.h > 40;
  const type = p.type || 'normal';

  if (type === 'launchpad') {
    // Glowing launch pad
    roundRect(p.x + shakeX, p.y, p.w, p.h, 4);
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    g.addColorStop(0, '#00ffcc');
    g.addColorStop(1, '#007755');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // Arrow up indicator
    ctx.save();
    ctx.fillStyle = '#00ffcc';
    ctx.globalAlpha = 0.9;
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('▲', p.x + p.w/2 + shakeX, p.y + p.h/2 + 5);
    ctx.restore();
    return;
  }

  if (isGround) {
    roundRect(p.x + shakeX, p.y, p.w, p.h, 0);
    if (theme === 'lava') ctx.fillStyle = '#1c0800';
    else if (theme === 'void') ctx.fillStyle = '#080820';
    else ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    const lineColor = theme === 'lava' ? '#3a1500' : theme === 'void' ? '#1a1a50' : '#2a2a50';
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = theme === 'lava' ? '#5a2500' : theme === 'void' ? '#2a2a70' : '#3a3a70';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x + shakeX, p.y+1); ctx.lineTo(p.x+p.w + shakeX, p.y+1); ctx.stroke();
  } else {
    // Floating platform
    const isMoving  = type === 'moving';
    const isVanish  = type === 'vanish';
    const platColor = isMoving
      ? (theme === 'lava' ? '#4a1a00' : theme === 'void' ? '#1a1a5a' : '#3a2a60')
      : (theme === 'lava' ? '#3a1800' : theme === 'void' ? '#141438' : '#2d2d50');
    const edgeColor = isMoving
      ? (theme === 'lava' ? '#cc4400' : theme === 'void' ? '#4466ff' : '#7744cc')
      : (theme === 'lava' ? '#884400' : theme === 'void' ? '#3344cc' : '#4a4a90');

    roundRect(p.x + shakeX, p.y, p.w, p.h, 6);
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y+p.h);
    g.addColorStop(0, platColor);
    if (theme === 'lava') g.addColorStop(1, '#1a0800');
    else if (theme === 'void') g.addColorStop(1, '#0a0a28');
    else g.addColorStop(1, '#1a1a30');
    ctx.fillStyle = g; ctx.fill();

    if (isVanish) {
      ctx.save();
      ctx.globalAlpha = extra && extra.shake ? 0.6 + Math.sin(Date.now() * 0.03) * 0.3 : 1;
    }

    ctx.save();
    if (isMoving) { ctx.shadowColor = edgeColor; ctx.shadowBlur = 8; }
    ctx.strokeStyle = edgeColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x+6 + shakeX, p.y); ctx.lineTo(p.x+p.w-6 + shakeX, p.y); ctx.stroke();
    ctx.restore();

    if (isVanish) ctx.restore();

    // Corner dots
    const dotColor = isMoving ? edgeColor : (theme === 'lava' ? '#aa5500' : theme === 'void' ? '#4455dd' : '#5a5aaa');
    ctx.fillStyle = dotColor;
    ctx.fillRect(p.x+8 + shakeX, p.y+7, 4, 4);
    ctx.fillRect(p.x+p.w-12 + shakeX, p.y+7, 4, 4);
  }
}

function drawHazards() {
  if (!sceneData) return;
  for (const hz of sceneData.hazards) {
    // Lava pool
    const now = Date.now() / 1000;
    ctx.save();
    const lg = ctx.createLinearGradient(hz.x, hz.y, hz.x, hz.y + hz.h);
    lg.addColorStop(0, `rgba(255,${80 + Math.sin(now*3)*30},0,0.9)`);
    lg.addColorStop(0.5, `rgba(200,${40 + Math.sin(now*2)*20},0,0.7)`);
    lg.addColorStop(1, 'rgba(100,10,0,0.5)');
    ctx.fillStyle = lg;
    ctx.fillRect(hz.x, hz.y, hz.w, hz.h);

    // Animated bubbles
    ctx.fillStyle = `rgba(255,${120 + Math.sin(now*4)*40},0,0.5)`;
    for (let b = 0; b < 6; b++) {
      const bx = hz.x + hz.w * ((b * 0.17 + now * 0.08 + b * 0.03) % 1);
      const by = hz.y + hz.h * 0.5 + Math.sin(now * 2 + b) * hz.h * 0.3;
      ctx.beginPath(); ctx.arc(bx, by, 5 + Math.sin(now + b) * 2, 0, Math.PI*2); ctx.fill();
    }

    // Glow
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(255,100,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hz.x, hz.y, hz.w, hz.h);
    ctx.restore();

    // DANGER text
    ctx.save();
    ctx.fillStyle = `rgba(255,200,0,${0.5 + Math.sin(now*3)*0.3})`;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ LAVA ⚠', hz.x + hz.w/2, hz.y + hz.h/2 + 5);
    ctx.restore();
  }
}

function render(ts) {
  requestAnimationFrame(render);
  const now = ts / 1000;
  const dt  = lastTs ? Math.min(now - lastTs, 0.05) : 0;
  lastTs = now;

  const W = world.width, H = world.height;

  // Camera shake
  let sx = 0, sy = 0;
  if (shakeAmt > 0.5) {
    sx = (Math.random() - 0.5) * shakeAmt;
    sy = (Math.random() - 0.5) * shakeAmt;
    shakeAmt *= 0.85;
  } else { shakeAmt = 0; }

  ctx.save();
  ctx.translate(sx, sy);

  drawBackground();

  // Static + special platforms
  if (sceneData) {
    for (const p of sceneData.platforms) drawPlatform(p, {});

    // Vanish platforms
    if (gameState && gameState.vanishPlatforms) {
      gameState.vanishPlatforms.forEach((vs, i) => {
        if (!vs.visible) return;
        const base = sceneData.vanishPlatforms[i];
        const shakeX = vs.shaking ? (Math.random() - 0.5) * 4 : 0;
        ctx.save();
        if (vs.shaking) ctx.globalAlpha = 0.7;
        drawPlatform({ ...base, type: 'vanish' }, { shake: vs.shake, shakeX });
        ctx.restore();
      });
    }

    // Moving platforms
    if (gameState && gameState.movingPlatforms) {
      gameState.movingPlatforms.forEach((mp) => {
        drawPlatform({ ...mp, type: 'moving' }, {});
      });
    }

    // Launch pads
    for (const lp of sceneData.launchPads) drawPlatform({ ...lp, type: 'launchpad' }, {});

    drawHazards();
  }

  if (!gameState) { updateParticles(dt); ctx.restore(); return; }

  // ── Bullets ──
  const curBullets = gameState.bullets || [];
  const prevIds = new Set(prevBullets.map(b => b.id));

  for (const b of curBullets) {
    const color = getCharColor(b.ownerIndex);
    if (!prevIds.has(b.id)) spawnMuzzleFlash(b.x, b.y, b.vx > 0 ? 1 : -1, color);
    if (!bulletTrails[b.id]) bulletTrails[b.id] = [];
    bulletTrails[b.id].push({ x: b.x, y: b.y });
    if (bulletTrails[b.id].length > 8) bulletTrails[b.id].shift();
  }

  const curIds = new Set(curBullets.map(b => b.id));
  for (const pb of prevBullets) {
    if (!curIds.has(pb.id)) {
      delete bulletTrails[pb.id];
      if (pb.x > 0 && pb.x < world.width) {
        spawnHitParticles(pb.x, pb.y, getCharColor(pb.ownerIndex), 18);
        addShake(8);
      }
    }
  }
  prevBullets = [...curBullets];

  for (const b of curBullets) {
    const trail = bulletTrails[b.id] || [];
    const color = getCharColor(b.ownerIndex);
    for (let t = 0; t < trail.length - 1; t++) {
      ctx.save();
      ctx.globalAlpha = (t / trail.length) * 0.6;
      ctx.strokeStyle = color; ctx.lineWidth = 3 * (t / trail.length);
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(trail[t].x, trail[t].y); ctx.lineTo(trail[t+1].x, trail[t+1].y); ctx.stroke();
      ctx.restore();
    }
    // Heavy bullet for tank, small for scout
    const isDamaging = b.damage >= 15;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = isDamaging ? 24 : 16;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, isDamaging ? 7 : 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(b.x, b.y, isDamaging ? 5 : 3, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Players ──
  for (const ps of gameState.players) {
    const PW = PLAYER_BASE.width || 40;
    const PH = PLAYER_BASE.height || 60;
    const color = getPlayerColor(ps);
    const dark  = getPlayerDark(ps);
    if (ps.dead) continue;

    const prevHP = prevHPs[ps.index] !== undefined ? prevHPs[ps.index] : ps.hp;
    const dmgTaken = Math.round(prevHP - ps.hp);
    if (dmgTaken > 0) {
      spawnHitParticles(ps.x + PW/2, ps.y + PH/2, color, 20);
      spawnDmgNumber(ps.x + PW/2, ps.y - 10, dmgTaken, color);
      addShake(dmgTaken * 0.6);
    }
    prevHPs[ps.index] = ps.hp;

    // Dash trail
    if (ps.dashing) {
      for (let t = 1; t <= 5; t++) {
        ctx.save();
        ctx.globalAlpha = (6 - t) / 14;
        roundRect(ps.x - ps.facing * t * 12, ps.y + PH*0.2, PW, PH*0.6, 4);
        ctx.fillStyle = color; ctx.fill();
        ctx.restore();
      }
    }

    if (ps.invincible && Math.floor(now * 14) % 2 === 0) continue;

    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 12;

    // Body
    roundRect(ps.x, ps.y + PH*0.3, PW, PH*0.7, 6);
    const bodyG = ctx.createLinearGradient(ps.x, ps.y, ps.x+PW, ps.y+PH);
    bodyG.addColorStop(0, color); bodyG.addColorStop(1, dark);
    ctx.fillStyle = bodyG; ctx.fill();

    // Legs indicator (two rects at bottom when on ground)
    if (ps.onGround) {
      ctx.fillStyle = dark;
      ctx.fillRect(ps.x + 5, ps.y + PH*0.88, 12, PH*0.12);
      ctx.fillRect(ps.x + PW - 17, ps.y + PH*0.88, 12, PH*0.12);
    }

    // Head
    const hW = PW * 0.7, hH = PH * 0.35;
    const hX = ps.x + (PW - hW)/2, hY = ps.y;
    roundRect(hX, hY, hW, hH, 8);
    ctx.fillStyle = color; ctx.fill();

    // Visor / eye
    ctx.fillStyle = '#fff';
    const eyeOX = ps.facing > 0 ? hW*0.6 : hW*0.15;
    ctx.beginPath(); ctx.arc(hX + eyeOX, hY + hH*0.45, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(hX + eyeOX + ps.facing*1.5, hY + hH*0.45, 2, 0, Math.PI*2); ctx.fill();

    // Gun barrel — tank has thicker barrel
    const isTank = ps.charKey === 'tank';
    const gunH = isTank ? 8 : 6;
    const gunW = isTank ? 22 : 18;
    const gunY = ps.y + PH * 0.38 - (gunH - 6) / 2;
    ctx.fillStyle = isTank ? '#ccc' : '#aaa';
    ctx.fillRect(
      ps.facing > 0 ? ps.x + PW - 2 : ps.x + 2 - gunW,
      gunY, gunW, gunH
    );
    // Muzzle tip
    ctx.fillStyle = color;
    ctx.fillRect(
      ps.facing > 0 ? ps.x + PW + gunW - 4 : ps.x + 2 - gunW,
      gunY, 4, gunH
    );

    ctx.restore();

    // Double jump indicator
    if (!ps.onGround && ps.doubleJumped) {
      ctx.save(); ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([4,4]);
      ctx.strokeRect(ps.x-2, ps.y-2, PW+4, PH+4);
      ctx.restore();
    }

    // YOU label
    if (ps.index === myIndex) {
      ctx.save();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center'; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.fillText('YOU', ps.x + PW/2, ps.y - 8);
      ctx.restore();
    }
  }

  // ── Damage numbers ──
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.y += dn.vy * dt;
    dn.vy *= 0.9;
    dn.life -= dt;
    if (dn.life <= 0) { damageNumbers.splice(i, 1); continue; }
    const alpha = dn.life / dn.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${dn.size}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = dn.color; ctx.shadowBlur = 10;
    ctx.fillText(dn.text, dn.x, dn.y);
    ctx.restore();
  }

  // HUD update
  for (const ps of gameState.players) {
    const bar = document.getElementById(`hpBar${ps.index}`);
    const num = document.getElementById(`hpNum${ps.index}`);
    const maxHP = ps.maxHP || 100;
    const pct = Math.max(0, ps.hp) / maxHP * 100;
    if (bar) {
      bar.style.width = pct + '%';
      // Color shift: green → yellow → red
      if (pct > 60) bar.style.background = ps.index === 0 ? 'var(--p1color)' : 'var(--p2color)';
      else if (pct > 30) bar.style.background = '#ffaa00';
      else bar.style.background = '#ff3333';
    }
    if (num) num.textContent = Math.max(0, Math.round(ps.hp));
  }

  // Winner
  if (gameState.winner !== null && resultOverlay.style.display === 'none') {
    inGame = false;
    resultOverlay.style.display = 'flex';
    if (gameState.winner === -1) {
      resultText.textContent = 'DRAW'; resultText.style.color = '#aaa';
    } else if (gameState.winner === myIndex) {
      resultText.textContent = '🏆 YOU WIN'; resultText.style.color = getCharColor(myIndex);
    } else {
      resultText.textContent = 'YOU LOSE'; resultText.style.color = '#666';
    }
  }

  updateParticles(dt);
  ctx.restore(); // end camera shake
}

function getCharColor(index) {
  const ch = playerChars[index];
  return ch ? ch.color : (index === 0 ? '#4cc9f0' : '#f72585');
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 500 * dt; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const alpha = p.life / (p.maxLife || 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    ctx.restore();
  }
}

requestAnimationFrame(render);

// ── Char Select ───────────────────────────────────────────────────────────
function buildCharSelect(characters) {
  charCards.innerHTML = '';
  for (const [key, ch] of Object.entries(characters)) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.char = key;

    // Mini canvas avatar
    const avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = 60; avatarCanvas.height = 80;
    const ac = avatarCanvas.getContext('2d');
    drawCharAvatar(ac, key, ch.color, 60, 80);
    card.appendChild(avatarCanvas);

    const name = document.createElement('div');
    name.className = 'char-name'; name.textContent = ch.name;
    card.appendChild(name);
    const label = document.createElement('div');
    label.className = 'char-label'; label.textContent = ch.label;
    card.appendChild(label);
    const desc = document.createElement('div');
    desc.className = 'char-desc'; desc.textContent = ch.desc;
    card.appendChild(desc);

    // Stats
    const stat = document.createElement('div');
    stat.className = 'char-stat';
    const stats = [
      { name: '速度', val: key === 'scout' ? 80 : 45 },
      { name: '傷害', val: key === 'scout' ? 50 : 85 },
      { name: '血量', val: key === 'scout' ? 45 : 80 },
      { name: '射速', val: key === 'scout' ? 82 : 40 },
    ];
    for (const s of stats) {
      const row = document.createElement('div');
      row.className = 'char-stat-row';
      row.innerHTML = `<span class="char-stat-name">${s.name}</span>
        <div class="char-stat-bar-wrap"><div class="char-stat-bar" style="width:${s.val}%"></div></div>`;
      stat.appendChild(row);
    }
    card.appendChild(stat);

    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      myCharKey = key;
      socket.emit('charChosen', { charKey: key });
      charSelectSubtitle.textContent = `已選擇 ${ch.label}，等待對手…`;
    });

    charCards.appendChild(card);
  }
}

function drawCharAvatar(ac, charKey, color, W, H) {
  // Body
  ac.fillStyle = color;
  ac.fillRect(8, 24, 44, 46);
  // Head
  ac.fillStyle = color;
  ac.beginPath(); ac.roundRect ? ac.roundRect(12, 2, 36, 22, 6) : ac.rect(12, 2, 36, 22);
  ac.fill();
  // Eye
  ac.fillStyle = '#fff';
  ac.beginPath(); ac.arc(38, 14, 5, 0, Math.PI*2); ac.fill();
  ac.fillStyle = '#000';
  ac.beginPath(); ac.arc(40, 14, 3, 0, Math.PI*2); ac.fill();
  // Gun
  if (charKey === 'tank') {
    ac.fillStyle = '#ccc';
    ac.fillRect(50, 34, 14, 9);
  } else {
    ac.fillStyle = '#aaa';
    ac.fillRect(52, 36, 10, 6);
  }
  // Glow
  ac.save();
  ac.shadowColor = color; ac.shadowBlur = 16;
  ac.strokeStyle = color; ac.lineWidth = 1.5;
  ac.beginPath(); ac.roundRect ? ac.roundRect(8, 24, 44, 46, 4) : ac.rect(8, 24, 44, 46);
  ac.stroke();
  ac.restore();
}

// ── Lobby ─────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', () => {
  const rid = roomInput.value.trim().toUpperCase() || randomRoomId();
  roomInput.value = rid;
  lobbyStatus.textContent = 'Connecting…';
  socket.emit('joinRoom', { roomId: rid });
});
roomInput.addEventListener('keydown', e => { if (e.code === 'Enter') joinBtn.click(); });

function randomRoomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

// ── Socket events ─────────────────────────────────────────────────────────
socket.on('joined', ({ index, roomId }) => {
  myIndex = index;
  lobbyEl.style.display = 'none';
  roomLabel.textContent = roomId;
  document.getElementById('youLabel0').textContent = index === 0 ? '(YOU)' : '';
  document.getElementById('youLabel1').textContent = index === 1 ? '(YOU)' : '';
});

socket.on('charSelect', ({ characters }) => {
  charDefs = characters;
  charSelectEl.style.display = 'flex';
  buildCharSelect(characters);
});

socket.on('charChoiceUpdate', ({ index, charKey, charLabel }) => {
  if (index !== myIndex) {
    charOpponentStatus.textContent = `對手選了 ${charLabel}`;
  }
});

socket.on('waitingForOpponent', () => {
  charOpponentStatus.textContent = '等待對手選擇…';
});

socket.on('roomFull', () => { lobbyStatus.textContent = '❌ 房間已滿'; });

function applyScenePayload(payload) {
  sceneData = payload.scene;
  world = payload.world;
  PLAYER_BASE = payload.playerConst;
  playerChars = {};
  for (const c of payload.characters) {
    playerChars[c.index] = c.char;
    const labelEl = document.getElementById(`charLabel${c.index}`);
    if (labelEl) labelEl.textContent = c.char.label || '';
  }
  if (sceneLabel) sceneLabel.textContent = sceneData.name || '';
  resizeCanvas();
}

socket.on('gameStart', (payload) => {
  applyScenePayload(payload);
  inGame = true;
  prevHPs = {};
  for (const c of payload.characters) prevHPs[c.index] = c.char.maxHP;
  charSelectEl.style.display = 'none';
  gameScreenEl.style.display = 'flex';
  waitingOverlay.style.display = 'none';
  resultOverlay.style.display  = 'none';
});

socket.on('gameRestart', (payload) => {
  applyScenePayload(payload);
  resultOverlay.style.display = 'none';
  particles = []; prevBullets = []; damageNumbers = [];
  prevHPs = {};
  for (const c of payload.characters) prevHPs[c.index] = c.char.maxHP;
  inGame = true;
  if (gameState) gameState.winner = null;
});

socket.on('gameState', (state) => { gameState = state; });

socket.on('playerLeft', () => {
  inGame = false;
  resultOverlay.style.display = 'flex';
  resultText.textContent = 'OPPONENT LEFT';
  resultText.style.color = '#888';
});

restartBtn.addEventListener('click', () => { socket.emit('requestRestart'); });
