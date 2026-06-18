const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../public')));

const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const WORLD = { width: 1200, height: 700 };

// ── Characters ────────────────────────────────────────────────────────────
const CHARACTERS = {
  scout: {
    name: 'SCOUT',
    speed: 380,
    jumpForce: -860,
    doubleJumpForce: -720,
    gravity: 2200,
    maxFallSpeed: 1200,
    dashSpeed: 720,
    dashDuration: 0.10,
    dashCooldown: 0.6,
    shootCooldown: 0.18,
    maxHP: 90,
    bulletDamage: 10,
    bulletSpeed: 1000,
    knockbackX: 680,
    knockbackY: -480,
    color: '#4cc9f0',
    label: '快手',
    desc: '移速快・射速快・血量低',
  },
  tank: {
    name: 'TANK',
    speed: 290,
    jumpForce: -760,
    doubleJumpForce: -640,
    gravity: 2400,
    maxFallSpeed: 1400,
    dashSpeed: 560,
    dashDuration: 0.14,
    dashCooldown: 0.85,
    shootCooldown: 0.35,
    maxHP: 130,
    bulletDamage: 18,
    bulletSpeed: 880,
    knockbackX: 820,
    knockbackY: -560,
    color: '#f72585',
    label: '重砲',
    desc: '移速慢・傷害高・血量高',
  },
};

// ── Scenes ────────────────────────────────────────────────────────────────
const SCENES = [
  {
    name: 'NEON CITY',
    theme: 'neon',
    bgColor: '#06060c',
    gridColor: 'rgba(42,42,80,0.35)',
    platforms: [
      { x: 0,   y: 620, w: 1200, h: 80, type: 'ground' },
      { x: 180, y: 460, w: 200,  h: 20, type: 'normal' },
      { x: 500, y: 370, w: 200,  h: 20, type: 'normal' },
      { x: 820, y: 460, w: 200,  h: 20, type: 'normal' },
      { x: 330, y: 270, w: 160,  h: 20, type: 'normal' },
      { x: 710, y: 270, w: 160,  h: 20, type: 'normal' },
    ],
    hazards: [],
    launchPads: [],
    movingPlatforms: [],
    vanishPlatforms: [],
    spawn: [{ x: 140, y: 540 }, { x: 1020, y: 540 }],
  },
  {
    name: 'LAVA RIFT',
    theme: 'lava',
    bgColor: '#0d0500',
    gridColor: 'rgba(80,30,0,0.3)',
    platforms: [
      { x: 0,   y: 620, w: 420, h: 80, type: 'ground' },
      { x: 780, y: 620, w: 420, h: 80, type: 'ground' },
      { x: 300, y: 480, w: 180, h: 20, type: 'normal' },
      { x: 720, y: 480, w: 180, h: 20, type: 'normal' },
      { x: 490, y: 370, w: 220, h: 20, type: 'normal' },
      { x: 380, y: 260, w: 140, h: 20, type: 'normal' },
      { x: 680, y: 260, w: 140, h: 20, type: 'normal' },
    ],
    hazards: [{ x: 420, y: 630, w: 360, h: 70 }], // lava pit
    launchPads: [],
    movingPlatforms: [
      { x: 520, y: 540, w: 160, h: 18, vx: 90, vy: 0, minX: 430, maxX: 610 },
    ],
    vanishPlatforms: [],
    spawn: [{ x: 100, y: 540 }, { x: 1060, y: 540 }],
  },
  {
    name: 'VOID STATION',
    theme: 'void',
    bgColor: '#020208',
    gridColor: 'rgba(20,20,60,0.3)',
    platforms: [
      { x: 0,   y: 620, w: 300, h: 80, type: 'ground' },
      { x: 900, y: 620, w: 300, h: 80, type: 'ground' },
      { x: 200, y: 450, w: 180, h: 20, type: 'normal' },
      { x: 820, y: 450, w: 180, h: 20, type: 'normal' },
      { x: 490, y: 340, w: 220, h: 20, type: 'normal' },
    ],
    hazards: [],
    launchPads: [
      { x: 560, y: 600, w: 80, h: 20 }, // center launch pad
      { x: 100, y: 600, w: 80, h: 20 },
      { x: 1020, y: 600, w: 80, h: 20 },
    ],
    movingPlatforms: [
      { x: 380, y: 530, w: 140, h: 18, vx: 0, vy: -60, minY: 400, maxY: 560 },
      { x: 680, y: 530, w: 140, h: 18, vx: 0, vy: 60,  minY: 400, maxY: 560 },
    ],
    vanishPlatforms: [
      { x: 310, y: 290, w: 160, h: 18, timer: 0, visible: true, respawnTimer: 0 },
      { x: 730, y: 290, w: 160, h: 18, timer: 0, visible: true, respawnTimer: 0 },
    ],
    spawn: [{ x: 60, y: 540 }, { x: 1080, y: 540 }],
  },
];

const PLAYER_BASE = {
  width: 40,
  height: 60,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  invincibleDuration: 0.3,
  accelGround: 22,
  accelAir: 12,
};

const LAUNCH_FORCE = -980;
const LAVA_DAMAGE_PER_SEC = 30;
const VANISH_STAND_TIME = 0.8;
const VANISH_GONE_TIME  = 2.0;

const rooms = new Map();

function createPlayer(index, charKey) {
  const ch = CHARACTERS[charKey] || CHARACTERS.scout;
  return {
    index,
    charKey,
    char: ch,
    x: 0, y: 0,
    vx: 0, vy: 0,
    hp: ch.maxHP,
    facing: index === 0 ? 1 : -1,
    onGround: false,
    jumping: false,
    doubleJumped: false,
    dashing: false,
    dashTimer: 0,
    dashCooldownTimer: 0,
    shootCooldownTimer: 0,
    invincibleTimer: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    dead: false,
    input: { left:false, right:false, jump:false, attack:false, dash:false },
    prevInput: { left:false, right:false, jump:false, attack:false, dash:false },
  };
}

function createRoom(roomId) {
  return {
    id: roomId,
    players: [],
    sockets: [],
    charChoices: {},       // socketId → charKey
    readyCount: 0,
    bullets: [],
    started: false,
    winner: null,
    loopInterval: null,
    bulletIdCounter: 0,
    scene: null,           // resolved at start
    movingPlatformStates: [],
    vanishPlatformStates: [],
  };
}

function pickScene() {
  return JSON.parse(JSON.stringify(SCENES[Math.floor(Math.random() * SCENES.length)]));
}

function getAllPlatforms(room) {
  const scene = room.scene;
  const statics = scene.platforms;
  const moving = room.movingPlatformStates.map((s, i) => ({
    x: s.x, y: s.y,
    w: scene.movingPlatforms[i].w,
    h: scene.movingPlatforms[i].h,
    type: 'moving',
  }));
  const vanish = room.vanishPlatformStates.map((s, i) => {
    const base = scene.vanishPlatforms[i];
    return s.visible ? { x: base.x, y: base.y, w: base.w, h: base.h, type: 'vanish' } : null;
  }).filter(Boolean);
  const pads = scene.launchPads.map(p => ({ ...p, type: 'launchpad' }));
  return [...statics, ...moving, ...vanish, ...pads];
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function resolvePlayerPlatforms(p, platforms) {
  const pw = PLAYER_BASE.width, ph = PLAYER_BASE.height;
  let launched = false;
  for (const plat of platforms) {
    if (!rectOverlap(p.x, p.y, pw, ph, plat.x, plat.y, plat.w, plat.h)) continue;
    const oL = (p.x+pw) - plat.x;
    const oR = (plat.x+plat.w) - p.x;
    const oT = (p.y+ph) - plat.y;
    const oB = (plat.y+plat.h) - p.y;
    const minX = Math.min(oL, oR);
    const minY = Math.min(oT, oB);
    if (minY < minX) {
      if (oT < oB) {
        p.y = plat.y - ph;
        if (p.vy > 0) p.vy = 0;
        p.onGround = true;
        if (plat.type === 'launchpad' && !launched) {
          p.vy = LAUNCH_FORCE;
          p.jumping = true;
          p.doubleJumped = false;
          p.onGround = false;
          launched = true;
        }
      } else {
        p.y = plat.y + plat.h;
        if (p.vy < 0) p.vy = 0;
      }
    } else {
      p.x = oL < oR ? plat.x - pw : plat.x + plat.w;
      p.vx = 0;
    }
  }
}

function spawnPlayer(p, scene) {
  const sp = scene.spawn[p.index];
  p.x = sp.x; p.y = sp.y;
  p.vx = 0; p.vy = 0;
  p.facing = p.index === 0 ? 1 : -1;
  p.onGround = false;
  p.jumping = false;
  p.doubleJumped = false;
  p.dashing = false;
  p.dashTimer = 0;
  p.dashCooldownTimer = 0.5;
  p.shootCooldownTimer = 0;
  p.invincibleTimer = 1.0;
  p.coyoteTimer = 0;
  p.jumpBufferTimer = 0;
  p.dead = false;
  p.hp = p.char.maxHP;
}

function initMovingPlatforms(room) {
  room.movingPlatformStates = room.scene.movingPlatforms.map(mp => ({
    x: mp.x, y: mp.y, vx: mp.vx, vy: mp.vy,
  }));
  room.vanishPlatformStates = room.scene.vanishPlatforms.map(() => ({
    visible: true, timer: 0, respawnTimer: 0,
  }));
}

function tickRoom(room) {
  if (!room.started || room.winner !== null) return;
  const scene = room.scene;

  // ── Moving platforms ──
  for (let i = 0; i < room.movingPlatformStates.length; i++) {
    const s = room.movingPlatformStates[i];
    const def = scene.movingPlatforms[i];
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    if (def.minX !== undefined) {
      if (s.x <= def.minX || s.x + def.w >= def.maxX) s.vx = -s.vx;
      s.x = Math.max(def.minX, Math.min(def.maxX - def.w, s.x));
    }
    if (def.minY !== undefined) {
      if (s.y <= def.minY || s.y + def.h >= def.maxY) s.vy = -s.vy;
      s.y = Math.max(def.minY, Math.min(def.maxY - def.h, s.y));
    }
  }

  const allPlatforms = getAllPlatforms(room);

  // ── Players ──
  for (let i = 0; i < 2; i++) {
    const p = room.players[i];
    if (p.dead) continue;
    const ch = p.char;
    const inp = p.input, prev = p.prevInput;

    p.dashTimer           = Math.max(0, p.dashTimer - DT);
    p.dashCooldownTimer   = Math.max(0, p.dashCooldownTimer - DT);
    p.shootCooldownTimer  = Math.max(0, p.shootCooldownTimer - DT);
    p.invincibleTimer     = Math.max(0, p.invincibleTimer - DT);
    p.coyoteTimer         = Math.max(0, p.coyoteTimer - DT);
    p.jumpBufferTimer     = Math.max(0, p.jumpBufferTimer - DT);

    if (inp.jump && !prev.jump) p.jumpBufferTimer = PLAYER_BASE.jumpBuffer;

    // Shoot
    if (inp.attack && !prev.attack && p.shootCooldownTimer <= 0) {
      p.shootCooldownTimer = ch.shootCooldown;
      room.bullets.push({
        id: room.bulletIdCounter++,
        ownerIndex: p.index,
        x: p.x + (p.facing > 0 ? PLAYER_BASE.width + 4 : -12),
        y: p.y + PLAYER_BASE.height * 0.4,
        vx: p.facing * ch.bulletSpeed,
        vy: 0,
        life: 1.2,
        damage: ch.bulletDamage,
        knockbackX: ch.knockbackX,
        knockbackY: ch.knockbackY,
      });
    }

    // Dash
    if (!p.dashing && (inp.dash && !prev.dash) && p.dashCooldownTimer <= 0) {
      p.dashing = true;
      p.dashTimer = ch.dashDuration;
      p.dashCooldownTimer = ch.dashCooldown;
      p.vx = p.facing * ch.dashSpeed;
      p.vy = 0;
      p.invincibleTimer = Math.max(p.invincibleTimer, ch.dashDuration);
    }
    if (p.dashing) {
      p.vx = p.facing * ch.dashSpeed;
      if (p.dashTimer <= 0) { p.dashing = false; p.vx = p.facing * ch.speed * 0.3; }
    }

    // Movement
    if (!p.dashing) {
      let targetVx = 0;
      if (inp.left)  { targetVx = -ch.speed; p.facing = -1; }
      if (inp.right) { targetVx =  ch.speed; p.facing =  1; }
      const accel = p.onGround ? PLAYER_BASE.accelGround : PLAYER_BASE.accelAir;
      p.vx += (targetVx - p.vx) * Math.min(1, accel * DT);
    }

    // Gravity
    p.vy += ch.gravity * DT;
    if (p.vy > ch.maxFallSpeed) p.vy = ch.maxFallSpeed;

    const wasOnGround = p.onGround;
    p.onGround = false;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    resolvePlayerPlatforms(p, allPlatforms);

    if (!wasOnGround && p.onGround) { p.jumping = false; p.doubleJumped = false; }
    if (wasOnGround && !p.onGround) p.coyoteTimer = PLAYER_BASE.coyoteTime;

    // Jump / double jump
    if (p.jumpBufferTimer > 0) {
      const canFirst = p.onGround || p.coyoteTimer > 0;
      if (canFirst && !p.jumping) {
        p.vy = ch.jumpForce;
        p.jumping = true; p.onGround = false;
        p.coyoteTimer = 0; p.jumpBufferTimer = 0;
      } else if (p.jumping && !p.doubleJumped && inp.jump && !prev.jump) {
        p.vy = ch.doubleJumpForce;
        p.doubleJumped = true; p.jumpBufferTimer = 0;
      }
    }

    // Lava hazards
    if (p.invincibleTimer <= 0) {
      for (const hz of scene.hazards) {
        const px = p.x + PLAYER_BASE.width/2, py = p.y + PLAYER_BASE.height/2;
        if (px > hz.x && px < hz.x+hz.w && py > hz.y && py < hz.y+hz.h) {
          p.hp -= LAVA_DAMAGE_PER_SEC * DT;
          p.invincibleTimer = 0.05; // short flicker
          if (p.hp <= 0) { p.hp = 0; p.dead = true; }
        }
      }
    }

    // Out of bounds
    if (p.x < -150 || p.x > WORLD.width + 150 || p.y > WORLD.height + 120) {
      p.dead = true; p.hp = 0;
    }

    p.prevInput = { ...inp };
  }

  // ── Vanish platforms (step on timer) ──
  for (let i = 0; i < room.vanishPlatformStates.length; i++) {
    const vs = room.vanishPlatformStates[i];
    const base = room.scene.vanishPlatforms[i];
    if (!vs.visible) {
      vs.respawnTimer -= DT;
      if (vs.respawnTimer <= 0) { vs.visible = true; vs.timer = 0; }
      continue;
    }
    // Check if any player standing on it
    let standing = false;
    for (const p of room.players) {
      if (p.dead) continue;
      const pw = PLAYER_BASE.width, ph = PLAYER_BASE.height;
      // Player bottom touching platform top
      if (Math.abs((p.y + ph) - base.y) < 4 &&
          p.x + pw > base.x && p.x < base.x + base.w) {
        standing = true; break;
      }
    }
    if (standing) {
      vs.timer += DT;
      if (vs.timer >= VANISH_STAND_TIME) {
        vs.visible = false;
        vs.respawnTimer = VANISH_GONE_TIME;
      }
    } else {
      vs.timer = Math.max(0, vs.timer - DT * 2);
    }
  }

  // ── Bullets ──
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0 || b.x < -50 || b.x > WORLD.width + 50) {
      room.bullets.splice(i, 1); continue;
    }
    // Hit platform
    let hitPlat = false;
    for (const plat of allPlatforms) {
      if (plat.type === 'launchpad') continue;
      if (b.x > plat.x && b.x < plat.x+plat.w && b.y > plat.y && b.y < plat.y+plat.h) {
        hitPlat = true; break;
      }
    }
    if (hitPlat) { room.bullets.splice(i, 1); continue; }
    // Hit player
    const target = room.players[1 - b.ownerIndex];
    if (!target.dead && target.invincibleTimer <= 0) {
      const tx = target.x, ty = target.y;
      if (b.x > tx && b.x < tx+PLAYER_BASE.width && b.y > ty && b.y < ty+PLAYER_BASE.height) {
        target.hp -= b.damage;
        const dir = b.vx > 0 ? 1 : -1;
        target.vx = dir * b.knockbackX;
        target.vy = b.knockbackY;
        target.invincibleTimer = PLAYER_BASE.invincibleDuration;
        target.onGround = false;
        if (target.hp <= 0) { target.hp = 0; target.dead = true; }
        room.bullets.splice(i, 1); continue;
      }
    }
  }

  // Check winner
  const p0dead = room.players[0].dead;
  const p1dead = room.players[1].dead;
  if (p0dead || p1dead) {
    room.winner = (p0dead && p1dead) ? -1 : (p0dead ? 1 : 0);
  }

  const state = {
    players: room.players.map(p => ({
      index: p.index, charKey: p.charKey,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      hp: p.hp, maxHP: p.char.maxHP,
      facing: p.facing,
      onGround: p.onGround,
      dashing: p.dashing,
      doubleJumped: p.doubleJumped,
      invincible: p.invincibleTimer > 0,
      dead: p.dead,
    })),
    bullets: room.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, ownerIndex: b.ownerIndex, damage: b.damage })),
    winner: room.winner,
    movingPlatforms: room.movingPlatformStates.map((s, i) => ({
      x: s.x, y: s.y,
      w: room.scene.movingPlatforms[i].w,
      h: room.scene.movingPlatforms[i].h,
    })),
    vanishPlatforms: room.vanishPlatformStates.map((vs, i) => ({
      visible: vs.visible,
      shaking: vs.timer > 0.3,
      shake: vs.timer / VANISH_STAND_TIME,
    })),
  };

  io.to(room.id).emit('gameState', state);
  if (room.winner !== null) { clearInterval(room.loopInterval); room.loopInterval = null; }
}

function buildScenePayload(room) {
  return {
    scene: {
      name: room.scene.name,
      theme: room.scene.theme,
      bgColor: room.scene.bgColor,
      gridColor: room.scene.gridColor,
      platforms: room.scene.platforms,
      hazards: room.scene.hazards,
      launchPads: room.scene.launchPads,
      movingPlatforms: room.scene.movingPlatforms,
      vanishPlatforms: room.scene.vanishPlatforms,
      spawn: room.scene.spawn,
    },
    world: WORLD,
    playerConst: PLAYER_BASE,
    characters: room.players.map(p => ({ index: p.index, charKey: p.charKey, char: p.char })),
  };
}

function startRoom(room) {
  room.scene = pickScene();
  initMovingPlatforms(room);
  room.started = true;
  room.winner = null;
  room.bullets = [];
  room.players.forEach(p => spawnPlayer(p, room.scene));
  if (room.loopInterval) clearInterval(room.loopInterval);
  room.loopInterval = setInterval(() => tickRoom(room), 1000 / TICK_RATE);
  io.to(room.id).emit('gameStart', buildScenePayload(room));
}

function restartRoom(room) {
  room.scene = pickScene();
  initMovingPlatforms(room);
  room.winner = null;
  room.bullets = [];
  room.players.forEach(p => { p.hp = p.char.maxHP; p.dead = false; spawnPlayer(p, room.scene); });
  if (room.loopInterval) clearInterval(room.loopInterval);
  room.loopInterval = setInterval(() => tickRoom(room), 1000 / TICK_RATE);
  io.to(room.id).emit('gameRestart', buildScenePayload(room));
}

io.on('connection', (socket) => {
  let myRoom = null, myIndex = -1;

  socket.on('joinRoom', ({ roomId }) => {
    if (!roomId || typeof roomId !== 'string') return;
    roomId = roomId.trim().toUpperCase().slice(0, 12);
    if (!roomId) return;
    if (!rooms.has(roomId)) rooms.set(roomId, createRoom(roomId));
    const room = rooms.get(roomId);
    if (room.sockets.length >= 2) { socket.emit('roomFull'); return; }
    const idx = room.players.length;
    // Temporarily placeholder — will be replaced after char select
    room.players.push(createPlayer(idx, 'scout'));
    room.sockets.push(socket.id);
    myRoom = room; myIndex = idx;
    socket.join(roomId);
    socket.emit('joined', { index: idx, roomId });
    // Send character options to this player
    socket.emit('charSelect', { characters: CHARACTERS });
  });

  socket.on('charChosen', ({ charKey }) => {
    if (!myRoom || myIndex < 0) return;
    const valid = CHARACTERS[charKey] ? charKey : 'scout';
    myRoom.players[myIndex].charKey = valid;
    myRoom.players[myIndex].char = CHARACTERS[valid];
    myRoom.players[myIndex].hp = CHARACTERS[valid].maxHP;
    myRoom.charChoices[socket.id] = valid;
    io.to(myRoom.id).emit('charChoiceUpdate', {
      index: myIndex, charKey: valid,
      charName: CHARACTERS[valid].name,
      charLabel: CHARACTERS[valid].label,
    });
    const chosen = Object.keys(myRoom.charChoices).length;
    if (chosen === 2) {
      setTimeout(() => startRoom(myRoom), 500);
    } else {
      socket.emit('waitingForOpponent');
    }
  });

  socket.on('input', (inp) => {
    if (!myRoom || myIndex < 0) return;
    const p = myRoom.players[myIndex];
    if (!p) return;
    p.input = { left:!!inp.left, right:!!inp.right, jump:!!inp.jump, attack:!!inp.attack, dash:!!inp.dash };
  });

  socket.on('requestRestart', () => {
    if (!myRoom || myRoom.winner === null) return;
    restartRoom(myRoom);
  });

  socket.on('disconnect', () => {
    if (!myRoom) return;
    io.to(myRoom.id).emit('playerLeft');
    if (myRoom.loopInterval) clearInterval(myRoom.loopInterval);
    rooms.delete(myRoom.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
