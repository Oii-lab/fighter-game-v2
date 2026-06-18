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

const CHARACTERS = {
  scout: {
    name: 'SCOUT', speed: 380, jumpForce: -860, doubleJumpForce: -720,
    gravity: 2200, maxFallSpeed: 1200, dashSpeed: 720, dashDuration: 0.10,
    dashCooldown: 0.6, shootCooldown: 0.18, maxHP: 90, bulletDamage: 10,
    bulletSpeed: 1000, knockbackX: 680, knockbackY: -480,
    color: '#4cc9f0', label: '快手', desc: '移速快・射速快・血量低',
  },
  tank: {
    name: 'TANK', speed: 290, jumpForce: -760, doubleJumpForce: -640,
    gravity: 2400, maxFallSpeed: 1400, dashSpeed: 560, dashDuration: 0.14,
    dashCooldown: 0.85, shootCooldown: 0.35, maxHP: 130, bulletDamage: 18,
    bulletSpeed: 880, knockbackX: 820, knockbackY: -560,
    color: '#f5c400', label: '重砲', desc: '移速慢・傷害高・血量高',
  },
};

// ── Scene definitions ─────────────────────────────────────────────────────
// Each scene: platforms, hazards, launchPads, movingPlatforms, vanishPlatforms,
//             iceZones, gravityPads, windZones, acidRain, mirrorWall,
//             portals, bombBoxes, spikePlatforms, boostPads, reflectWalls
const SCENES = [
  {
    name: 'NEON CITY', theme: 'neon',
    platforms: [
      { x:0,   y:620, w:1200, h:80, type:'ground' },
      { x:180, y:460, w:200,  h:20, type:'normal' },
      { x:500, y:370, w:200,  h:20, type:'normal' },
      { x:820, y:460, w:200,  h:20, type:'normal' },
      { x:330, y:270, w:160,  h:20, type:'normal' },
      { x:710, y:270, w:160,  h:20, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[], vanishPlatforms:[],
    iceZones:[], gravityPads:[], windZones:[], acidRain:false, mirrorWall:null,
    portals:[ {ax:20,ay:580,bx:1160,by:580,w:24,h:40} ],
    bombBoxes:[ {x:570,y:350,w:30,h:30} ],
    spikePlatforms:[], boostPads:[],
    reflectWalls:[{x:560,y:310,w:80,h:10,type:'diag'}], spawn:[{x:140,y:540},{x:1020,y:540}],
  },
  {
    name: 'LAVA RIFT', theme: 'lava',
    platforms: [
      { x:0,   y:620, w:420, h:80, type:'ground' },
      { x:780, y:620, w:420, h:80, type:'ground' },
      { x:300, y:480, w:180, h:20, type:'normal' },
      { x:720, y:480, w:180, h:20, type:'normal' },
      { x:490, y:370, w:220, h:20, type:'normal' },
      { x:380, y:260, w:140, h:20, type:'normal' },
      { x:680, y:260, w:140, h:20, type:'normal' },
    ],
    hazards:[{x:420,y:630,w:360,h:70}],
    launchPads:[], movingPlatforms:[
      {x:520,y:540,w:160,h:18,vx:90,vy:0,minX:430,maxX:610},
    ],
    vanishPlatforms:[],
    iceZones:[], gravityPads:[], windZones:[], acidRain:false, mirrorWall:null,
    portals:[],
    bombBoxes:[{x:480,y:350,w:30,h:30},{x:700,y:350,w:30,h:30}],
    spikePlatforms:[
      {platformIdx:2, side:'right'},{platformIdx:3, side:'left'},
    ],
    boostPads:[], reflectWalls:[{x:350,y:350,w:100,h:8,type:'hidden'},{x:750,y:350,w:100,h:8,type:'hidden'}],
    spawn:[{x:100,y:540},{x:1060,y:540}],
  },
  {
    name: 'VOID STATION', theme: 'void',
    platforms: [
      { x:0,   y:620, w:300, h:80, type:'ground' },
      { x:900, y:620, w:300, h:80, type:'ground' },
      { x:200, y:450, w:180, h:20, type:'normal' },
      { x:820, y:450, w:180, h:20, type:'normal' },
      { x:490, y:340, w:220, h:20, type:'normal' },
    ],
    hazards:[], launchPads:[
      {x:560,y:600,w:80,h:20},{x:100,y:600,w:80,h:20},{x:1020,y:600,w:80,h:20},
    ],
    movingPlatforms:[
      {x:380,y:530,w:140,h:18,vx:0,vy:-60,minY:400,maxY:560},
      {x:680,y:530,w:140,h:18,vx:0,vy:60, minY:400,maxY:560},
    ],
    vanishPlatforms:[
      {x:310,y:290,w:160,h:18},{x:730,y:290,w:160,h:18},
    ],
    iceZones:[], gravityPads:[], windZones:[], acidRain:false, mirrorWall:null,
    portals:[{ax:20,ay:580,bx:1160,by:580,w:24,h:40}],
    bombBoxes:[], spikePlatforms:[],
    boostPads:[{x:420,y:430,w:60,h:14},{x:720,y:430,w:60,h:14}],
    reflectWalls:[{x:540,y:310,w:120,h:8,type:'hidden'}],
    spawn:[{x:60,y:540},{x:1080,y:540}],
  },
  {
    name: 'ICE FIELD', theme: 'ice',
    platforms: [
      { x:0,   y:620, w:1200, h:80, type:'ground' },
      { x:150, y:490, w:240,  h:18, type:'normal' },
      { x:480, y:400, w:240,  h:18, type:'normal' },
      { x:810, y:490, w:240,  h:18, type:'normal' },
      { x:300, y:300, w:180,  h:18, type:'normal' },
      { x:720, y:300, w:180,  h:18, type:'normal' },
      { x:510, y:200, w:180,  h:18, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[], vanishPlatforms:[],
    iceZones:[{x:0,y:580,w:1200,h:120}],
    gravityPads:[], windZones:[], acidRain:false, mirrorWall:null,
    portals:[{ax:20,ay:580,bx:1160,by:580,w:24,h:40}],
    bombBoxes:[{x:580,y:380,w:30,h:30}],
    spikePlatforms:[
      {platformIdx:1,side:'right'},{platformIdx:3,side:'left'},
      {platformIdx:4,side:'right'},{platformIdx:5,side:'left'},
    ],
    boostPads:[{x:550,y:180,w:80,h:14}],
    reflectWalls:[{x:480,y:230,w:80,h:10,type:'diag'},{x:640,y:230,w:80,h:10,type:'diag',flip:true}],
    spawn:[{x:100,y:540},{x:1060,y:540}],
  },
  {
    name: 'DEATH PITS', theme: 'death',
    platforms: [
      { x:0,   y:620, w:220, h:80, type:'ground' },
      { x:340, y:620, w:200, h:80, type:'ground' },
      { x:660, y:620, w:200, h:80, type:'ground' },
      { x:980, y:620, w:220, h:80, type:'ground' },
      { x:100, y:480, w:140, h:18, type:'normal' },
      { x:530, y:460, w:140, h:18, type:'normal' },
      { x:960, y:480, w:140, h:18, type:'normal' },
      { x:300, y:350, w:120, h:18, type:'normal' },
      { x:780, y:350, w:120, h:18, type:'normal' },
      { x:540, y:250, w:120, h:18, type:'normal' },
    ],
    hazards:[], launchPads:[],
    movingPlatforms:[
      {x:380,y:500,w:100,h:18,vx:70,vy:0,minX:300,maxX:480},
      {x:720,y:500,w:100,h:18,vx:-70,vy:0,minX:640,maxX:740},
    ],
    vanishPlatforms:[{x:530,y:250,w:140,h:18}],
    iceZones:[], gravityPads:[], windZones:[], acidRain:false, mirrorWall:null,
    portals:[],
    bombBoxes:[{x:535,y:440,w:30,h:30}],
    spikePlatforms:[
      {platformIdx:4,side:'both'},{platformIdx:5,side:'both'},{platformIdx:6,side:'both'},
    ],
    boostPads:[],
    reflectWalls:[{x:220,y:580,w:10,h:40,type:'v'},{x:940,y:580,w:10,h:40,type:'v'}],
    spawn:[{x:50,y:540},{x:1090,y:540}],
  },
  {
    name: 'MIRROR MAZE', theme: 'mirror',
    platforms: [
      { x:0,   y:620, w:1200, h:80, type:'ground' },
      { x:80,  y:470, w:180,  h:18, type:'normal' },
      { x:940, y:470, w:180,  h:18, type:'normal' },
      { x:220, y:340, w:160,  h:18, type:'normal' },
      { x:820, y:340, w:160,  h:18, type:'normal' },
      { x:440, y:460, w:140,  h:18, type:'normal' },
      { x:620, y:460, w:140,  h:18, type:'normal' },
      { x:500, y:300, w:200,  h:18, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[],
    vanishPlatforms:[{x:500,y:300,w:200,h:18}],
    iceZones:[], gravityPads:[], windZones:[], acidRain:false,
    mirrorWall:{x:590,y:160,w:20,h:460,visible:true,timer:0,cycleOn:4.0,cycleOff:2.5},
    portals:[{ax:20,ay:580,bx:1160,by:580,w:24,h:40}],
    bombBoxes:[{x:560,y:440,w:30,h:30}],
    spikePlatforms:[
      {platformIdx:1,side:'right'},{platformIdx:2,side:'left'},
    ],
    boostPads:[{x:210,y:320,w:60,h:14},{x:930,y:320,w:60,h:14}],
    reflectWalls:[{x:460,y:380,w:80,h:10,type:'diag'},{x:660,y:380,w:80,h:10,type:'diag',flip:true}],
    spawn:[{x:120,y:540},{x:1040,y:540}],
  },
  {
    name: 'GRAVITY FLIP', theme: 'gravity',
    platforms: [
      { x:0,   y:620, w:1200, h:80, type:'ground' },
      { x:0,   y:0,   w:1200, h:20, type:'ground' },
      { x:180, y:490, w:160,  h:18, type:'normal' },
      { x:860, y:490, w:160,  h:18, type:'normal' },
      { x:400, y:380, w:160,  h:18, type:'normal' },
      { x:640, y:380, w:160,  h:18, type:'normal' },
      { x:520, y:520, w:160,  h:18, type:'normal' },
      { x:180, y:180, w:160,  h:18, type:'normal' },
      { x:860, y:180, w:160,  h:18, type:'normal' },
      { x:520, y:130, w:160,  h:18, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[], vanishPlatforms:[],
    iceZones:[],
    gravityPads:[{x:460,y:600,w:120,h:20},{x:460,y:0,w:120,h:20}],
    windZones:[], acidRain:false, mirrorWall:null,
    portals:[],
    bombBoxes:[{x:575,y:360,w:30,h:30}],
    spikePlatforms:[{platformIdx:4,side:'both'},{platformIdx:5,side:'both'}],
    boostPads:[],
    reflectWalls:[{x:440,y:300,w:320,h:10,type:'h'}],
    spawn:[{x:100,y:540},{x:1060,y:540}],
  },
  {
    name: 'STORM DECK', theme: 'storm',
    platforms: [
      { x:0,   y:620, w:280, h:80, type:'ground' },
      { x:920, y:620, w:280, h:80, type:'ground' },
      { x:160, y:490, w:180, h:18, type:'normal' },
      { x:860, y:490, w:180, h:18, type:'normal' },
      { x:380, y:390, w:160, h:18, type:'normal' },
      { x:660, y:390, w:160, h:18, type:'normal' },
      { x:520, y:280, w:160, h:18, type:'normal' },
      { x:240, y:280, w:140, h:18, type:'normal' },
      { x:820, y:280, w:140, h:18, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[
      {x:450,y:480,w:120,h:18,vx:80,vy:0,minX:350,maxX:650},
    ],
    vanishPlatforms:[{x:520,y:280,w:160,h:18}],
    iceZones:[], gravityPads:[],
    windZones:[{x:280,y:0,w:640,h:700,vy:-320}],
    acidRain:false, mirrorWall:null,
    portals:[{ax:280,ay:580,bx:920,by:580,w:24,h:40}],
    bombBoxes:[],
    spikePlatforms:[{platformIdx:4,side:'right'},{platformIdx:5,side:'left'}],
    boostPads:[{x:540,y:260,w:80,h:14}],
    reflectWalls:[{x:350,y:180,w:500,h:10,type:'h'}],
    spawn:[{x:80,y:540},{x:1080,y:540}],
  },
  {
    name: 'ACID RAIN', theme: 'acid',
    platforms: [
      { x:0,   y:620, w:1200, h:80, type:'ground' },
      { x:160, y:470, w:200,  h:18, type:'normal' },
      { x:840, y:470, w:200,  h:18, type:'normal' },
      { x:400, y:370, w:180,  h:18, type:'normal' },
      { x:620, y:370, w:180,  h:18, type:'normal' },
      { x:510, y:260, w:180,  h:18, type:'normal' },
      { x:260, y:270, w:140,  h:18, type:'normal' },
      { x:800, y:270, w:140,  h:18, type:'normal' },
    ],
    hazards:[], launchPads:[], movingPlatforms:[], vanishPlatforms:[],
    iceZones:[], gravityPads:[], windZones:[],
    acidRain:true, mirrorWall:null,
    portals:[{ax:20,ay:580,bx:1160,by:580,w:24,h:40}],
    bombBoxes:[{x:560,y:240,w:30,h:30}],
    spikePlatforms:[{platformIdx:3,side:'right'},{platformIdx:4,side:'left'}],
    boostPads:[],
    reflectWalls:[{x:350,y:350,w:100,h:8,type:'hidden'},{x:750,y:350,w:100,h:8,type:'hidden'}],
    spawn:[{x:100,y:540},{x:1060,y:540}],
  },
];

const PLAYER_BASE = {
  width:40, height:60,
  coyoteTime:0.1, jumpBuffer:0.12,
  invincibleDuration:0.3,
  accelGround:22, accelAir:12,
};

const LAUNCH_FORCE        = -980;
const LAVA_DAMAGE_SEC     = 30;
const ACID_DAMAGE_SEC     = 25;
const SPIKE_DAMAGE        = 8;   // per touch
const VANISH_STAND_TIME   = 0.8;
const VANISH_GONE_TIME    = 2.0;
const ICE_ACCEL_GROUND    = 4;
const WIND_FORCE_SCALE    = 0.6;
const BOOST_SPEED         = 800;
const BOOST_DURATION      = 0.4;
const BOMB_RADIUS         = 120;
const BOMB_DAMAGE         = 35;
const HEALTHPACK_HEAL     = 30;
const HEALTHPACK_SPAWN_MIN = 8;
const HEALTHPACK_SPAWN_MAX = 15;

const rooms = new Map();

function createPlayer(index, charKey) {
  const ch = CHARACTERS[charKey] || CHARACTERS.scout;
  return {
    index, charKey, char: ch,
    x:0, y:0, vx:0, vy:0,
    hp: ch.maxHP, facing: index===0?1:-1,
    onGround:false, jumping:false, doubleJumped:false,
    dashing:false, dashTimer:0, dashCooldownTimer:0,
    shootCooldownTimer:0, invincibleTimer:0,
    coyoteTimer:0, jumpBufferTimer:0, dead:false,
    gravityFlipped:false,
    boostTimer:0,
    portalCooldown:0,
    aimAngle:0,  // -1=up45, 0=flat, 1=down45
    input:{left:false,right:false,jump:false,attack:false,dash:false,up:false,down:false},
    prevInput:{left:false,right:false,jump:false,attack:false,dash:false,up:false,down:false},
  };
}

function createRoom(roomId) {
  return {
    id:roomId, players:[], sockets:[], charChoices:{}, readyCount:0,
    bullets:[], started:false, winner:null, loopInterval:null,
    bulletIdCounter:0, scene:null,
    movingPlatformStates:[], vanishPlatformStates:[],
    mirrorWallState:null,
    acidDrops:[], acidSpawnTimer:2.0, acidDropIdCounter:0,
    bombBoxStates:[],      // {alive, x,y,w,h, explodeTimer}
    healthPacks:[],        // {id,x,y,r, alive}
    healthPackSpawnTimer:0,
    healthPackIdCounter:0,
  };
}

function pickScene() {
  return JSON.parse(JSON.stringify(SCENES[Math.floor(Math.random()*SCENES.length)]));
}

function getAllPlatforms(room) {
  const scene = room.scene;
  const statics = [...scene.platforms];
  const moving = room.movingPlatformStates.map((s,i)=>({
    x:s.x,y:s.y,w:scene.movingPlatforms[i].w,h:scene.movingPlatforms[i].h,type:'moving',
  }));
  const vanish = room.vanishPlatformStates.map((s,i)=>{
    const b=scene.vanishPlatforms[i];
    return s.visible?{x:b.x,y:b.y,w:b.w,h:b.h,type:'vanish'}:null;
  }).filter(Boolean);
  const pads = scene.launchPads.map(p=>({...p,type:'launchpad'}));
  if(room.mirrorWallState&&room.mirrorWallState.visible){
    const mw=scene.mirrorWall;
    statics.push({x:mw.x,y:mw.y,w:mw.w,h:mw.h,type:'mirrorwall'});
  }
  // Reflect walls are solid for bullets but not players
  return [...statics,...moving,...vanish,...pads];
}

function rectOverlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;
}

function resolvePlayerPlatforms(p, platforms){
  const pw=PLAYER_BASE.width,ph=PLAYER_BASE.height;
  let launched=false;
  for(const plat of platforms){
    if(!rectOverlap(p.x,p.y,pw,ph,plat.x,plat.y,plat.w,plat.h)) continue;
    const oL=(p.x+pw)-plat.x, oR=(plat.x+plat.w)-p.x;
    const oT=(p.y+ph)-plat.y, oB=(plat.y+plat.h)-p.y;
    const minX=Math.min(oL,oR), minY=Math.min(oT,oB);
    if(minY<minX){
      if(oT<oB){
        p.y=plat.y-ph;
        if(p.vy>0)p.vy=0;
        p.onGround=true;
        if(plat.type==='launchpad'&&!launched){
          p.vy=LAUNCH_FORCE;p.jumping=true;p.doubleJumped=false;p.onGround=false;launched=true;
        }
        if(plat.type==='gravitypad'){p.gravityFlipped=false;}
      } else {
        p.y=plat.y+plat.h;
        if(p.vy<0)p.vy=0;
        if(plat.type==='gravitypad'){p.gravityFlipped=true;p.onGround=true;}
        else if(p.gravityFlipped)p.onGround=true;
      }
    } else {
      p.x=oL<oR?plat.x-pw:plat.x+plat.w;
      p.vx=0;
    }
  }
}

function spawnPlayer(p,scene){
  const sp=scene.spawn[p.index];
  p.x=sp.x;p.y=sp.y;p.vx=0;p.vy=0;
  p.facing=p.index===0?1:-1;
  p.onGround=false;p.jumping=false;p.doubleJumped=false;
  p.dashing=false;p.dashTimer=0;p.dashCooldownTimer=0.5;
  p.shootCooldownTimer=0;p.invincibleTimer=1.0;
  p.coyoteTimer=0;p.jumpBufferTimer=0;p.dead=false;
  p.gravityFlipped=false;p.boostTimer=0;p.portalCooldown=0;p.aimAngle=0;
  p.hp=p.char.maxHP;
}

function initRoomState(room){
  room.movingPlatformStates=room.scene.movingPlatforms.map(mp=>({x:mp.x,y:mp.y,vx:mp.vx,vy:mp.vy}));
  room.vanishPlatformStates=room.scene.vanishPlatforms.map(()=>({visible:true,timer:0,respawnTimer:0}));
  room.mirrorWallState=room.scene.mirrorWall?{visible:true,timer:0}:null;
  room.acidDrops=[];room.acidSpawnTimer=2.0;
  room.bombBoxStates=room.scene.bombBoxes.map(b=>({alive:true,x:b.x,y:b.y,w:b.w,h:b.h,explodeTimer:0}));
  room.healthPacks=[];
  room.healthPackSpawnTimer=HEALTHPACK_SPAWN_MIN+Math.random()*(HEALTHPACK_SPAWN_MAX-HEALTHPACK_SPAWN_MIN);
  room.healthPackIdCounter=0;
}

function spawnHealthPack(room){
  // Random x above a platform
  const scene=room.scene;
  const plats=scene.platforms.filter(p=>p.h<40);
  if(plats.length===0) return;
  const plat=plats[Math.floor(Math.random()*plats.length)];
  const hx=plat.x+plat.w*0.2+Math.random()*plat.w*0.6;
  room.healthPacks.push({
    id:room.healthPackIdCounter++,
    x:hx, y:plat.y-18, r:12, alive:true,
  });
}

function tickRoom(room){
  if(!room.started||room.winner!==null) return;
  const scene=room.scene;

  // Moving platforms
  for(let i=0;i<room.movingPlatformStates.length;i++){
    const s=room.movingPlatformStates[i],def=scene.movingPlatforms[i];
    s.x+=s.vx*DT;s.y+=s.vy*DT;
    if(def.minX!==undefined){
      if(s.x<=def.minX||s.x+def.w>=def.maxX)s.vx=-s.vx;
      s.x=Math.max(def.minX,Math.min(def.maxX-def.w,s.x));
    }
    if(def.minY!==undefined){
      if(s.y<=def.minY||s.y+def.h>=def.maxY)s.vy=-s.vy;
      s.y=Math.max(def.minY,Math.min(def.maxY-def.h,s.y));
    }
  }

  // Mirror wall
  if(room.mirrorWallState&&scene.mirrorWall){
    const mw=scene.mirrorWall,ms=room.mirrorWallState;
    ms.timer+=DT;
    if(ms.visible&&ms.timer>=mw.cycleOn){ms.visible=false;ms.timer=0;}
    else if(!ms.visible&&ms.timer>=mw.cycleOff){ms.visible=true;ms.timer=0;}
  }

  // Acid rain
  if(scene.acidRain){
    room.acidSpawnTimer-=DT;
    if(room.acidSpawnTimer<=0){
      room.acidSpawnTimer=1.2+Math.random()*1.5;
      const dw=80+Math.floor(Math.random()*80);
      room.acidDrops.push({
        id:room.acidDropIdCounter++,
        x:Math.random()*(WORLD.width-dw),y:-30,w:dw,h:20,
        vy:200+Math.random()*100,life:3.0,landed:false,
      });
    }
    for(let i=room.acidDrops.length-1;i>=0;i--){
      const d=room.acidDrops[i];
      if(!d.landed){
        d.y+=d.vy*DT;
        if(d.y+d.h>=WORLD.height-80){d.y=WORLD.height-80-d.h;d.landed=true;d.life=2.5;}
      } else {
        d.life-=DT;
        if(d.life<=0)room.acidDrops.splice(i,1);
      }
    }
  }

  // Health pack spawn
  room.healthPackSpawnTimer-=DT;
  if(room.healthPackSpawnTimer<=0&&room.healthPacks.filter(h=>h.alive).length<2){
    spawnHealthPack(room);
    room.healthPackSpawnTimer=HEALTHPACK_SPAWN_MIN+Math.random()*(HEALTHPACK_SPAWN_MAX-HEALTHPACK_SPAWN_MIN);
  }

  const allPlatforms=getAllPlatforms(room);

  // Players
  for(let i=0;i<2;i++){
    const p=room.players[i];
    if(p.dead) continue;
    const ch=p.char,inp=p.input,prev=p.prevInput;

    p.dashTimer          =Math.max(0,p.dashTimer-DT);
    p.dashCooldownTimer  =Math.max(0,p.dashCooldownTimer-DT);
    p.shootCooldownTimer =Math.max(0,p.shootCooldownTimer-DT);
    p.invincibleTimer    =Math.max(0,p.invincibleTimer-DT);
    p.coyoteTimer        =Math.max(0,p.coyoteTimer-DT);
    p.jumpBufferTimer    =Math.max(0,p.jumpBufferTimer-DT);
    p.boostTimer         =Math.max(0,p.boostTimer-DT);
    p.portalCooldown     =Math.max(0,p.portalCooldown-DT);

    if(inp.jump&&!prev.jump)p.jumpBufferTimer=PLAYER_BASE.jumpBuffer;

    // Aim angle: up/down keys
    if(inp.up)        p.aimAngle=-1;
    else if(inp.down) p.aimAngle=1;
    else              p.aimAngle=0;

    // Shoot
    if(inp.attack&&!prev.attack&&p.shootCooldownTimer<=0){
      p.shootCooldownTimer=ch.shootCooldown;
      const aimRad = p.aimAngle * Math.PI / 4; // -45, 0, +45 degrees
      const spd = ch.bulletSpeed;
      const bvx = p.facing * spd * Math.cos(aimRad);
      const bvy = spd * Math.sin(aimRad);
      const bOffY = p.aimAngle === -1 ? p.y + PLAYER_BASE.height*0.1
                  : p.aimAngle ===  1 ? p.y + PLAYER_BASE.height*0.7
                  : p.y + PLAYER_BASE.height*0.4;
      room.bullets.push({
        id:room.bulletIdCounter++,ownerIndex:p.index,
        x:p.x+(p.facing>0?PLAYER_BASE.width+4:-12),
        y:bOffY,
        vx:bvx, vy:bvy,
        life:1.4,damage:ch.bulletDamage,
        knockbackX:ch.knockbackX,knockbackY:ch.knockbackY,
        bounces:0, aimAngle:p.aimAngle,
      });
    }

    // Dash
    if(!p.dashing&&(inp.dash&&!prev.dash)&&p.dashCooldownTimer<=0){
      p.dashing=true;p.dashTimer=ch.dashDuration;
      p.dashCooldownTimer=ch.dashCooldown;
      p.vx=p.facing*ch.dashSpeed;p.vy=0;
      p.invincibleTimer=Math.max(p.invincibleTimer,ch.dashDuration);
    }
    if(p.dashing){
      p.vx=p.facing*ch.dashSpeed;
      if(p.dashTimer<=0){p.dashing=false;p.vx=p.facing*ch.speed*0.3;}
    }

    // Movement
    if(!p.dashing){
      let targetVx=0;
      if(inp.left){targetVx=-ch.speed;p.facing=-1;}
      if(inp.right){targetVx=ch.speed;p.facing=1;}
      // Boost pad override
      if(p.boostTimer>0) targetVx=p.facing*BOOST_SPEED;
      const isIce=scene.iceZones.some(z=>
        p.x+PLAYER_BASE.width/2>z.x&&p.x+PLAYER_BASE.width/2<z.x+z.w&&
        p.y+PLAYER_BASE.height>z.y&&p.y+PLAYER_BASE.height<z.y+z.h
      );
      const accelG=isIce?ICE_ACCEL_GROUND:PLAYER_BASE.accelGround;
      const accel=p.onGround?accelG:PLAYER_BASE.accelAir;
      p.vx+=(targetVx-p.vx)*Math.min(1,accel*DT);
    }

    // Gravity
    const gravDir=p.gravityFlipped?-1:1;
    p.vy+=ch.gravity*gravDir*DT;
    if(p.gravityFlipped){if(p.vy<-ch.maxFallSpeed)p.vy=-ch.maxFallSpeed;}
    else{if(p.vy>ch.maxFallSpeed)p.vy=ch.maxFallSpeed;}

    // Wind
    if(!p.onGround&&!p.dashing){
      for(const wz of scene.windZones){
        const cx=p.x+PLAYER_BASE.width/2,cy=p.y+PLAYER_BASE.height/2;
        if(cx>wz.x&&cx<wz.x+wz.w&&cy>wz.y&&cy<wz.y+wz.h)
          p.vy+=wz.vy*WIND_FORCE_SCALE*DT;
      }
    }

    const wasOnGround=p.onGround;
    p.onGround=false;
    p.x+=p.vx*DT;p.y+=p.vy*DT;
    resolvePlayerPlatforms(p,allPlatforms);

    if(!wasOnGround&&p.onGround){p.jumping=false;p.doubleJumped=false;}
    if(wasOnGround&&!p.onGround)p.coyoteTimer=PLAYER_BASE.coyoteTime;

    // Jump
    if(p.jumpBufferTimer>0){
      const canFirst=p.onGround||p.coyoteTimer>0;
      if(canFirst&&!p.jumping){
        p.vy=p.gravityFlipped?-ch.jumpForce:ch.jumpForce;
        p.jumping=true;p.onGround=false;p.coyoteTimer=0;p.jumpBufferTimer=0;
      } else if(p.jumping&&!p.doubleJumped&&inp.jump&&!prev.jump){
        p.vy=p.gravityFlipped?-ch.doubleJumpForce:ch.doubleJumpForce;
        p.doubleJumped=true;p.jumpBufferTimer=0;
      }
    }

    // Gravity pads
    for(const gp of scene.gravityPads){
      const cx=p.x+PLAYER_BASE.width/2;
      if(cx>gp.x&&cx<gp.x+gp.w){
        if(Math.abs(p.y+PLAYER_BASE.height-gp.y)<8){
          p.gravityFlipped=true;p.vy=-400;p.jumping=true;p.onGround=false;
        } else if(Math.abs(p.y-(gp.y+gp.h))<8){
          p.gravityFlipped=false;p.vy=400;p.jumping=true;p.onGround=false;
        }
      }
    }

    // Boost pads
    for(const bp of scene.boostPads){
      const pw=PLAYER_BASE.width,ph=PLAYER_BASE.height;
      if(Math.abs((p.y+ph)-bp.y)<6&&p.x+pw>bp.x&&p.x<bp.x+bp.w&&p.boostTimer<=0){
        p.boostTimer=BOOST_DURATION;
      }
    }

    // Portal teleport (with cooldown to prevent loop)
    if(p.portalCooldown<=0){
      for(const portal of scene.portals){
        const pw=PLAYER_BASE.width,ph=PLAYER_BASE.height;
        const cx=p.x+pw/2,cy=p.y+ph/2;
        if(cx>portal.ax&&cx<portal.ax+portal.w&&cy>portal.ay-portal.h/2&&cy<portal.ay+portal.h/2){
          p.x=portal.bx+portal.w/2-pw/2;p.y=portal.by-ph;
          p.portalCooldown=1.0; break;
        } else if(cx>portal.bx&&cx<portal.bx+portal.w&&cy>portal.by-portal.h/2&&cy<portal.by+portal.h/2){
          p.x=portal.ax+portal.w/2-pw/2;p.y=portal.ay-ph;
          p.portalCooldown=1.0; break;
        }
      }
    }

    // Spike damage
    if(p.invincibleTimer<=0){
      for(const sp of scene.spikePlatforms){
        const plat=scene.platforms[sp.platformIdx];
        if(!plat) continue;
        const spikeW=12;
        // Check collision with spike edges
        const checkSpike=(sx,sy,sw,sh)=>{
          if(rectOverlap(p.x,p.y,PLAYER_BASE.width,PLAYER_BASE.height,sx,sy,sw,sh)){
            p.hp-=SPIKE_DAMAGE;p.invincibleTimer=0.5;
            if(p.hp<=0){p.hp=0;p.dead=true;}
          }
        };
        if(sp.side==='right'||sp.side==='both')
          checkSpike(plat.x+plat.w,plat.y-8,spikeW,plat.h+16);
        if(sp.side==='left'||sp.side==='both')
          checkSpike(plat.x-spikeW,plat.y-8,spikeW,plat.h+16);
      }

      // Lava hazards
      for(const hz of scene.hazards){
        const px=p.x+PLAYER_BASE.width/2,py=p.y+PLAYER_BASE.height/2;
        if(px>hz.x&&px<hz.x+hz.w&&py>hz.y&&py<hz.y+hz.h){
          p.hp-=LAVA_DAMAGE_SEC*DT;p.invincibleTimer=0.05;
          if(p.hp<=0){p.hp=0;p.dead=true;}
        }
      }

      // Acid drops
      for(const d of room.acidDrops){
        const px=p.x+PLAYER_BASE.width/2,py=p.y+PLAYER_BASE.height/2;
        if(px>d.x&&px<d.x+d.w&&py>d.y&&py<d.y+d.h){
          p.hp-=ACID_DAMAGE_SEC*DT;p.invincibleTimer=0.05;
          if(p.hp<=0){p.hp=0;p.dead=true;}
        }
      }
    }

    // Health pack pickup
    for(const hp of room.healthPacks){
      if(!hp.alive) continue;
      const cx=p.x+PLAYER_BASE.width/2,cy=p.y+PLAYER_BASE.height/2;
      const dx=cx-hp.x,dy=cy-hp.y;
      if(Math.sqrt(dx*dx+dy*dy)<hp.r+20){
        p.hp=Math.min(p.char.maxHP,p.hp+HEALTHPACK_HEAL);
        hp.alive=false;
      }
    }

    // Out of bounds
    if(p.x<-150||p.x>WORLD.width+150||p.y>WORLD.height+120||p.y<-200){
      p.dead=true;p.hp=0;
    }

    p.prevInput={...inp};
  }

  // Vanish platforms
  for(let i=0;i<room.vanishPlatformStates.length;i++){
    const vs=room.vanishPlatformStates[i],base=scene.vanishPlatforms[i];
    if(!vs.visible){vs.respawnTimer-=DT;if(vs.respawnTimer<=0){vs.visible=true;vs.timer=0;}continue;}
    let standing=false;
    for(const p of room.players){
      if(p.dead) continue;
      if(Math.abs((p.y+PLAYER_BASE.height)-base.y)<4&&
         p.x+PLAYER_BASE.width>base.x&&p.x<base.x+base.w){standing=true;break;}
    }
    if(standing){vs.timer+=DT;if(vs.timer>=VANISH_STAND_TIME){vs.visible=false;vs.respawnTimer=VANISH_GONE_TIME;}}
    else vs.timer=Math.max(0,vs.timer-DT*2);
  }

  // Bullets — with wall bounce + bomb box collision
  for(let i=room.bullets.length-1;i>=0;i--){
    const b=room.bullets[i];
    b.x+=b.vx*DT;b.y+=b.vy*DT;b.life-=DT;
    if(b.life<=0){room.bullets.splice(i,1);continue;}
    if(b.x<-50||b.x>WORLD.width+50||b.y<-50||b.y>WORLD.height+50){room.bullets.splice(i,1);continue;}

    // Reflect walls bounce
    let reflected=false;
    for(const rw of scene.reflectWalls){
      if(b.x>rw.x&&b.x<rw.x+rw.w&&b.y>rw.y&&b.y<rw.y+rw.h){
        b.bounces=(b.bounces||0)+1;
        if(b.bounces>4){room.bullets.splice(i,1);reflected=true;break;}
        const t=rw.type||'v';
        if(t==='h'){
          b.vy=-b.vy; b.y+=b.vy*DT*2;
        } else if(t==='diag'){
          // 45deg: swap vx/vy, optionally flip
          const tmp=b.vx; b.vx=rw.flip?b.vy:-b.vy; b.vy=rw.flip?-tmp:tmp;
          b.x+=b.vx*DT*2; b.y+=b.vy*DT*2;
        } else if(t==='hidden'){
          // random reflect direction slightly varied
          b.vx=-b.vx; b.x+=b.vx*DT*2;
        } else {
          // 'v' default: vertical wall, horizontal bounce
          b.vx=-b.vx; b.x+=b.vx*DT*2;
        }
        reflected=true; break;
      }
    }
    if(reflected) continue;

    // Platform collision
    let hitPlat=false;
    for(const plat of allPlatforms){
      if(plat.type==='launchpad') continue;
      if(b.x>plat.x&&b.x<plat.x+plat.w&&b.y>plat.y&&b.y<plat.y+plat.h){
        if(plat.type==='mirrorwall'){
          b.vx=-b.vx;b.bounces=(b.bounces||0)+1;
          if(b.bounces>4){room.bullets.splice(i,1);hitPlat=true;}
        } else {
          room.bullets.splice(i,1);hitPlat=true;
        }
        break;
      }
    }
    if(hitPlat) continue;

    // Bomb box hit
    let hitBomb=false;
    for(const box of room.bombBoxStates){
      if(!box.alive) continue;
      if(b.x>box.x&&b.x<box.x+box.w&&b.y>box.y&&b.y<box.y+box.h){
        box.alive=false;
        // Explosion: damage players in radius
        for(const p of room.players){
          if(p.dead) continue;
          const px=p.x+PLAYER_BASE.width/2,py=p.y+PLAYER_BASE.height/2;
          const dx=px-(box.x+box.w/2),dy=py-(box.y+box.h/2);
          const dist=Math.sqrt(dx*dx+dy*dy);
          if(dist<BOMB_RADIUS){
            const dmg=Math.round(BOMB_DAMAGE*(1-dist/BOMB_RADIUS));
            if(p.invincibleTimer<=0){
              p.hp-=dmg;
              p.vx=(dx/dist)*600;p.vy=(dy/dist)*600-200;
              p.invincibleTimer=0.4;
              if(p.hp<=0){p.hp=0;p.dead=true;}
            }
          }
        }
        room.bullets.splice(i,1);hitBomb=true;break;
      }
    }
    if(hitBomb) continue;

    // Hit player
    const target=room.players[1-b.ownerIndex];
    if(!target.dead&&target.invincibleTimer<=0){
      if(b.x>target.x&&b.x<target.x+PLAYER_BASE.width&&
         b.y>target.y&&b.y<target.y+PLAYER_BASE.height){
        target.hp-=b.damage;
        const dir=b.vx>0?1:-1;
        target.vx=dir*b.knockbackX;target.vy=b.knockbackY;
        target.invincibleTimer=PLAYER_BASE.invincibleDuration;
        target.onGround=false;
        if(target.hp<=0){target.hp=0;target.dead=true;}
        room.bullets.splice(i,1);
      }
    }
  }

  // Winner check
  const p0d=room.players[0].dead,p1d=room.players[1].dead;
  if(p0d||p1d) room.winner=(p0d&&p1d)?-1:(p0d?1:0);

  const state={
    players:room.players.map(p=>({
      index:p.index,charKey:p.charKey,
      x:p.x,y:p.y,vx:p.vx,vy:p.vy,
      hp:p.hp,maxHP:p.char.maxHP,
      facing:p.facing,onGround:p.onGround,dashing:p.dashing,
      doubleJumped:p.doubleJumped,invincible:p.invincibleTimer>0,
      dead:p.dead,gravityFlipped:p.gravityFlipped,boosting:p.boostTimer>0,aimAngle:p.aimAngle,
    })),
    bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerIndex:b.ownerIndex,damage:b.damage,bounces:b.bounces||0})),
    winner:room.winner,
    movingPlatforms:room.movingPlatformStates.map((s,i)=>({
      x:s.x,y:s.y,w:scene.movingPlatforms[i].w,h:scene.movingPlatforms[i].h,
    })),
    vanishPlatforms:room.vanishPlatformStates.map(vs=>({
      visible:vs.visible,shaking:vs.timer>0.3,shake:vs.timer/VANISH_STAND_TIME,
    })),
    mirrorWall:room.mirrorWallState?{visible:room.mirrorWallState.visible}:null,
    acidDrops:room.acidDrops.map(d=>({id:d.id,x:d.x,y:d.y,w:d.w,h:d.h,landed:d.landed,life:d.life})),
    bombBoxes:room.bombBoxStates.map(b=>({alive:b.alive,x:b.x,y:b.y,w:b.w,h:b.h})),
    healthPacks:room.healthPacks.map(h=>({id:h.id,x:h.x,y:h.y,r:h.r,alive:h.alive})),
  };

  io.to(room.id).emit('gameState',state);
  if(room.winner!==null){clearInterval(room.loopInterval);room.loopInterval=null;}
}

function buildScenePayload(room){
  return {
    scene:{
      name:room.scene.name,theme:room.scene.theme,
      platforms:room.scene.platforms,
      hazards:room.scene.hazards,launchPads:room.scene.launchPads,
      movingPlatforms:room.scene.movingPlatforms,
      vanishPlatforms:room.scene.vanishPlatforms,
      iceZones:room.scene.iceZones,
      gravityPads:room.scene.gravityPads,
      windZones:room.scene.windZones,
      acidRain:room.scene.acidRain,
      mirrorWall:room.scene.mirrorWall,
      portals:room.scene.portals,
      bombBoxes:room.scene.bombBoxes,
      spikePlatforms:room.scene.spikePlatforms,
      boostPads:room.scene.boostPads,
      reflectWalls:room.scene.reflectWalls,
      spawn:room.scene.spawn,
    },
    world:WORLD,playerConst:PLAYER_BASE,
    characters:room.players.map(p=>({index:p.index,charKey:p.charKey,char:p.char})),
  };
}

function startRoom(room){
  room.scene=pickScene();initRoomState(room);
  room.started=true;room.winner=null;room.bullets=[];
  room.players.forEach(p=>spawnPlayer(p,room.scene));
  if(room.loopInterval)clearInterval(room.loopInterval);
  room.loopInterval=setInterval(()=>tickRoom(room),1000/TICK_RATE);
  io.to(room.id).emit('gameStart',buildScenePayload(room));
}

function restartRoom(room){
  room.scene=pickScene();initRoomState(room);
  room.winner=null;room.bullets=[];
  room.players.forEach(p=>{p.hp=p.char.maxHP;p.dead=false;spawnPlayer(p,room.scene);});
  if(room.loopInterval)clearInterval(room.loopInterval);
  room.loopInterval=setInterval(()=>tickRoom(room),1000/TICK_RATE);
  io.to(room.id).emit('gameRestart',buildScenePayload(room));
}

io.on('connection',(socket)=>{
  let myRoom=null,myIndex=-1;

  socket.on('joinRoom',({roomId})=>{
    if(!roomId||typeof roomId!=='string') return;
    roomId=roomId.trim().toUpperCase().slice(0,12);
    if(!roomId) return;
    if(!rooms.has(roomId))rooms.set(roomId,createRoom(roomId));
    const room=rooms.get(roomId);
    if(room.sockets.length>=2){socket.emit('roomFull');return;}
    const idx=room.players.length;
    room.players.push(createPlayer(idx,'scout'));
    room.sockets.push(socket.id);
    myRoom=room;myIndex=idx;
    socket.join(roomId);
    socket.emit('joined',{index:idx,roomId});
    socket.emit('charSelect',{characters:CHARACTERS});
  });

  socket.on('charChosen',({charKey})=>{
    if(!myRoom||myIndex<0) return;
    const valid=CHARACTERS[charKey]?charKey:'scout';
    myRoom.players[myIndex].charKey=valid;
    myRoom.players[myIndex].char=CHARACTERS[valid];
    myRoom.players[myIndex].hp=CHARACTERS[valid].maxHP;
    myRoom.charChoices[socket.id]=valid;
    io.to(myRoom.id).emit('charChoiceUpdate',{
      index:myIndex,charKey:valid,
      charName:CHARACTERS[valid].name,charLabel:CHARACTERS[valid].label,
    });
    const chosen=Object.keys(myRoom.charChoices).length;
    if(chosen===2)setTimeout(()=>startRoom(myRoom),500);
    else socket.emit('waitingForOpponent');
  });

  socket.on('input',(inp)=>{
    if(!myRoom||myIndex<0) return;
    const p=myRoom.players[myIndex];
    if(!p) return;
    p.input={left:!!inp.left,right:!!inp.right,jump:!!inp.jump,attack:!!inp.attack,dash:!!inp.dash,up:!!inp.up,down:!!inp.down};
  });

  socket.on('requestRestart',()=>{
    if(!myRoom||myRoom.winner===null) return;
    restartRoom(myRoom);
  });

  socket.on('disconnect',()=>{
    if(!myRoom) return;
    io.to(myRoom.id).emit('playerLeft');
    if(myRoom.loopInterval)clearInterval(myRoom.loopInterval);
    rooms.delete(myRoom.id);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
