
let board, context;

//여러 맵
const MAPS = {
  easy_field: [
    "XXXXXXXXXXXXXXXXXXXX","X   XX          d  X","X                  X","X   XXXX   XXXX    X",
    "X                  X","X  XXX        XXX  X","X                  X","X     XXX  XXX     X",
    "X   gm           gfX","X                  X","X   XXX      XXX   X","X                  X",
    "X  XXX        XXX  X","X                  X","X    XXXX    XXXX  X","X                  X",
    "X        do        X","X                  X","X  XXX        XXX  X","X                  X","XXXXXXXXXXXXXXXXXXXX"
  ],
  zigzag: [
    "XXXXXXXXXXXXXXXXXXXX","X d                X","XXXXXXX  XXXXXXXX  X","X      X X      X  X",
    "X XXXX X X XXXX X  X","X X    X X    X X  X","X X XXXX XXXX X X  X","X X X          X   X",
    "X X X gm  gf    XXXX","X X X            doX","X X XXXXXXXXXXXXX  X","X X                X",
    "X XXXXXXX  XXXXXXX X","X       X  X       X","X XXXXX X  X XXXXX X","X X     X  X     X X",
    "X X XXXXX  XXXXX X X","X X              X X","X XXXXXXXXXXXXXXXX X","X                  X","XXXXXXXXXXXXXXXXXXXX"
  ]
};

const MAP_BACKS = {
  easy_field: "./back1.png",
  zigzag: "./back2.png",
};

const MAP_ORDER = Object.keys(MAPS);
let currentMapIndex = 0;
let floreMap = MAPS[MAP_ORDER[currentMapIndex]];

// 4) 보드/타일 치수
const tileSize = 32;
let rowCount = floreMap.length;
let columnCount = floreMap[0].length;
let boardWidth  = columnCount * tileSize;
let boardHeight = rowCount    * tileSize;

// 에디터 토큰(미사용이어도 보관)
let editMode = false;
let brush = 'X';
const singleTokens = new Set(['X',' ','m','d']);
const doubleTokens = new Set(['gm','gf','do']);

// 이미지 핸들
let momImage, dadImage, grandfatherImage, grandmotherImage;
let dotyUpImage, dotyDownImage, dotyLeftImage, dotyRightImage;
let wallImage;

// 컨테이너
const walls = new Set();
const coins = new Set();
const family = new Set();
let doty = null;

// 충돌 최적화
let wallGrid = [];

// 상태
let score = 0;
let gameOver = false;
let gameOverReason = "";
let keys = Object.create(null);

// 사운드(연속 이동 1.5초 후 1회 재생)
let movementAudio = null;
let audioUnlocked = false;
let movementTimer = 0;
let playedAfter1_5s = false;
const MOVE_SOUND_THRESHOLD = 1.5;

// 속도/시간
const PLAYER_SPEED = 180;
const ENEMY_SPEED  = 120;
let lastTime = 0;

// 블록
class Block{
  constructor(image, x, y, width, height){
    this.image = image;
    this.x = x; this.y = y;
    this.width = width; this.height = height;
    this.startx = x; this.starty = y;
    this.aiTick = 0;
  }
  get rect(){ return {x:this.x, y:this.y, w:this.width, h:this.height}; }
}

// 충돌
function moveWithCollisionGrid(obj, dx, dy){
  let moved = false;
  if (dx !== 0){
    const nx = obj.x + dx;
    if (!collidesGrid(nx, obj.y, obj.width, obj.height)){ obj.x = nx; moved = true; }
    else { obj.x = snapX(obj, dx); }
  }
  if (dy !== 0){
    const ny = obj.y + dy;
    if (!collidesGrid(obj.x, ny, obj.width, obj.height)){ obj.y = ny; moved = true; }
    else { obj.y = snapY(obj, dy); }
  }
  return moved;
}

function collidesGrid(x, y, w, h){
  const left   = Math.floor(x / tileSize);
  const right  = Math.floor((x + w - 1) / tileSize);
  const top    = Math.floor(y / tileSize);
  const bottom = Math.floor((y + h - 1) / tileSize);
  for (let r = top; r <= bottom; r++){
    for (let c = left; c <= right; c++){
      if (r < 0 || c < 0 || r >= rowCount || c >= columnCount) return true;
      if (wallGrid[r][c]) return true;
    }
  }
  return false;
}

function snapX(obj, dx){
  if (dx > 0){
    const rightEdge = obj.x + obj.width - 1 + dx;
    const tile = Math.floor(rightEdge / tileSize);
    const tileLeft = tile * tileSize;
    return tileLeft - obj.width;
  } else {
    const leftEdge = obj.x + dx;
    const tile = Math.floor(leftEdge / tileSize);
    const tileRight = (tile + 1) * tileSize;
    return tileRight;
  }
}

function snapY(obj, dy){
  if (dy > 0){
    const bottomEdge = obj.y + obj.height - 1 + dy;
    const tile = Math.floor(bottomEdge / tileSize);
    const tileTop = tile * tileSize;
    return tileTop - obj.height;
  } else {
    const topEdge = obj.y + dy;
    const tile = Math.floor(topEdge / tileSize);
    const tileBottom = (tile + 1) * tileSize;
    return tileBottom;
  }
}

function rectOverlap(a, b){
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

//사운드 보조
function updateMoveTimerAndMaybePlay(moved, dt){
  if (moved) {
    movementTimer += dt;
    if (!playedAfter1_5s && movementTimer >= MOVE_SOUND_THRESHOLD) {
      playMovementSoundOnce();
      playedAfter1_5s = true;
    }
  } else {
    movementTimer = 0;
    playedAfter1_5s = false;
  }
}

function playMovementSoundOnce(){
  try {
    const a = movementAudio.cloneNode();
    a.volume = movementAudio.volume;
    a.play();
  } catch (e) {}
}

//맵 교체
function applyMapByIndex(idx){
  currentMapIndex = ((idx % MAP_ORDER.length) + MAP_ORDER.length) % MAP_ORDER.length;
  floreMap = MAPS[MAP_ORDER[currentMapIndex]];

  rowCount = floreMap.length;
  columnCount = floreMap[0].length;
  boardWidth  = columnCount * tileSize;
  boardHeight = rowCount    * tileSize;

  // 캔버스 리사이즈
  board.width = boardWidth;
  board.height = boardHeight;

  // 벽 이미지 교체
  wallImage = new Image();
  wallImage.src = MAP_BACKS[MAP_ORDER[currentMapIndex]];

  // 리로드
  loadMapWithMultiToken();
  lastTime = performance.now();
}
function nextMap(){ applyMapByIndex(currentMapIndex + 1); }
function setMapByName(name){
  const idx = MAP_ORDER.indexOf(name);
  if (idx !== -1) applyMapByIndex(idx);
}

//부팅
window.onload = function(){
  board = document.getElementById("board");
  board.width = boardWidth;
  board.height = boardHeight;
  context = board.getContext("2d");
  context.imageSmoothingEnabled = false;

  // 사운드 준비
  movementAudio = new Audio('./doott.mp4');
  movementAudio.preload = 'auto';
  movementAudio.volume = 0.6;

  // 최초 벽 이미지 세팅
  wallImage = new Image();
  wallImage.src = MAP_BACKS[MAP_ORDER[currentMapIndex]];

  // 입력: keydown
  window.addEventListener('keydown', (e) => {
    if (!audioUnlocked) {
      audioUnlocked = true;
      movementAudio.play().then(() => {
        movementAudio.pause();
        movementAudio.currentTime = 0;
      }).catch(() => {
        audioUnlocked = false;
      });
    }

    const k = (e.key || "").toLowerCase();
    const code = e.code || "";

    // WASD
    if (k === 'w' || code === 'KeyW') keys['w'] = true;
    if (k === 'a' || code === 'KeyA') keys['a'] = true;
    if (k === 's' || code === 'KeyS') keys['s'] = true;
    if (k === 'd' || code === 'KeyD') keys['d'] = true;

    // 화살표 → WASD 매핑
    if (code === 'ArrowUp')    { keys['w'] = true; e.preventDefault(); }
    if (code === 'ArrowLeft')  { keys['a'] = true; e.preventDefault(); }
    if (code === 'ArrowDown')  { keys['s'] = true; e.preventDefault(); }
    if (code === 'ArrowRight') { keys['d'] = true; e.preventDefault(); }

    // 재시작
    if (gameOver && (k === 'r' || code === 'KeyR')) restartGame();

    // 맵 단축키: 1~2, N
    if (k === '1') setMapByName('easy_field');
    if (k === '2') setMapByName('zigzag');
    if (k === 'n' || code === 'KeyN') nextMap();
  });

  // 입력: keyup
  window.addEventListener('keyup', (e) => {
    const k = (e.key || "").toLowerCase();
    const code = e.code || "";
    if (k === 'w' || code === 'KeyW' || code === 'ArrowUp')    keys['w'] = false;
    if (k === 'a' || code === 'KeyA' || code === 'ArrowLeft')  keys['a'] = false;
    if (k === 's' || code === 'KeyS' || code === 'ArrowDown')  keys['s'] = false;
    if (k === 'd' || code === 'KeyD' || code === 'ArrowRight') keys['d'] = false;
  });

  loadImages(() => {
    loadMapWithMultiToken();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });
};

// 이미지 로더
function loadImages(onReady){
  let loaded = 0, need = 8;
  const done = () => { if (++loaded === need) onReady(); };
  const add = (img, src) => {
    img.onload = done;
    img.onerror = done; // 실패해도 진행
    img.src = src;
  };

  momImage = new Image(); add(momImage, "./mom.png");
  dadImage = new Image(); add(dadImage, "./dad.png");
  grandfatherImage = new Image(); add(grandfatherImage, "./grandfather.png");
  grandmotherImage = new Image(); add(grandmotherImage, "./grandmother.png");
  dotyUpImage = new Image(); add(dotyUpImage, "./dotyUp.png");
  dotyDownImage = new Image(); add(dotyDownImage, "./dotyDown.png");
  dotyLeftImage = new Image(); add(dotyLeftImage, "./dotyLeft.png");
  dotyRightImage = new Image(); add(dotyRightImage, "./dotyRight.png");
}

//맵 로드,
function loadMapWithMultiToken(){
  walls.clear(); coins.clear(); family.clear(); doty = null; score = 0; gameOver = false;
  wallGrid = Array.from({length: rowCount}, () => Array(columnCount).fill(null));

  for (let r = 0; r < rowCount; r++){
    const line = floreMap[r];
    let c = 0;
    while (c < line.length){
      let token = line[c];
      let step = 1;

      if (c + 1 < line.length) {
        const two = line[c] + line[c+1];
        if (two === "gm" || two === "gf" || two === "do") {
          token = two;
          step = 2;
        }
      }
      const x = c * tileSize;
      const y = r * tileSize;

      if (token === 'X'){
        const b = new Block(wallImage, x, y, tileSize, tileSize);
        walls.add(b);
        wallGrid[r][c] = b;
      } else if (token === 'm'){
        family.add(spawnEnemy(momImage, x, y));
      } else if (token === 'd'){
        family.add(spawnEnemy(dadImage, x, y));
      } else if (token === 'gm'){
        family.add(spawnEnemy(grandmotherImage, x, y));
      } else if (token === 'gf'){
        family.add(spawnEnemy(grandfatherImage, x, y));
      } else if (token === 'do'){
        doty = new Block(dotyRightImage, x, y, tileSize, tileSize);
      } else if (token === ' '){
        coins.add({ x: x + 14, y: y + 14, size: 4 });
      }
      c += step;
    }
  }

  if (!doty){
    throw new Error('플레이어 토큰 "do"가 맵에 없습니다.');
  }
}

function spawnEnemy(img, x, y){
  const b = new Block(img, x, y, tileSize, tileSize);
  b.aiTick = Math.floor(Math.random()*60);
  return b;
}

//루프
function loop(now){
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  logic(dt);
  draw();
  requestAnimationFrame(loop);
}

//로직
function logic(dt){
  if (!doty || gameOver) return;
  handlePlayer(dt);
  handleCoins();
  handleEnemies(dt);
  checkGameOver();
}

//플레이어
function handlePlayer(dt){
  if (!doty) return;

  let vx = 0, vy = 0;
  if (keys['w']) { vy -= PLAYER_SPEED; doty.image = dotyUpImage; }
  if (keys['s']) { vy += PLAYER_SPEED; doty.image = dotyDownImage; }
  if (keys['a']) { vx -= PLAYER_SPEED; doty.image = dotyLeftImage; }
  if (keys['d']) { vx += PLAYER_SPEED; doty.image = dotyRightImage; }

  const oldX = doty.x, oldY = doty.y;
  moveWithCollisionGrid(doty, vx*dt, vy*dt);

  const moved = (doty.x !== oldX || doty.y !== oldY);
  updateMoveTimerAndMaybePlay(moved, dt);
}

// 코인
function handleCoins(){
  const p = doty.rect;
  for (const coin of Array.from(coins)){
    const c = {x: coin.x, y: coin.y, w: coin.size, h: coin.size};
    if (rectOverlap(p, c)){
      coins.delete(coin);
      score += 10;
    }
  }
}

//적
function handleEnemies(dt){
  for (const e of family){
    e.aiTick++;

    const dx = doty.x - e.x;
    const dy = doty.y - e.y;

    let vx = 0, vy = 0;
    if (Math.abs(dx) > Math.abs(dy)) vx = Math.sign(dx) * ENEMY_SPEED;
    else                             vy = Math.sign(dy) * ENEMY_SPEED;

    if (e.aiTick % 45 === 0){
      if (vx !== 0 && Math.random() < 0.4){ vy = Math.sign(dy) * ENEMY_SPEED; vx = 0; }
      if (vy !== 0 && Math.random() < 0.4){ vx = Math.sign(dx) * ENEMY_SPEED; vy = 0; }
    }

    if (!moveWithCollisionGrid(e, vx*dt, vy*dt)){
      moveWithCollisionGrid(e, 0, Math.sign(dy)*ENEMY_SPEED*dt) ||
      moveWithCollisionGrid(e, Math.sign(dx)*ENEMY_SPEED*dt, 0);
    }
  }
}

//게임오버 체크
function checkGameOver(){


  const p = doty.rect;
  for (const e of family){
    if (rectOverlap(p, e.rect)){
      gameOver = true;
      gameOverReason = "호잇짜 실패!";
      return;
    }
  }
  if (coins.size === 0){
    gameOver = true;
    gameOverReason = "클리어! 호잇짜잇호잇짜!! 🎉";
  }
}

//렌더
function draw(){
  context.clearRect(0, 0, boardWidth, boardHeight);

  // 벽
  for (const w of walls){
    if (w.image && w.image.complete) {
      context.drawImage(w.image, w.x, w.y, w.width, w.height);
    } else {
      context.fillRect(w.x, w.y, w.width, w.height);
    }
  }

  // 코인
  for (const coin of coins){
    context.fillRect(coin.x, coin.y, coin.size, coin.size);
  }

  // 가족
  for (const f of family){
    if (f.image && f.image.complete) {
      context.drawImage(f.image, f.x, f.y, f.width, f.height);
    } else {
      context.fillRect(f.x, f.y, f.width, f.height);
    }
  }

  // 플레이어
  if (doty){
    if (doty.image && doty.image.complete) {
      context.drawImage(doty.image, doty.x, doty.y, doty.width, doty.height);
    } else {
      context.fillRect(doty.x, doty.y, doty.width, doty.height);
    }
  }

  // HUD
  context.font = '16px sans-serif';
  context.fillStyle = '#000';
  context.fillText('Score: ' + score, 8, 18);

  // 게임오버 오버레이
  if (gameOver){
    context.save();
    context.globalAlpha = 0.7;
    context.fillStyle = '#000';
    context.fillRect(0, 0, boardWidth, boardHeight);
    context.restore();

    context.fillStyle = '#fff';
    context.font = '28px sans-serif';
    context.fillText(gameOverReason, 40, boardHeight/2 - 20);

    context.font = '22px sans-serif';
    context.fillText('Score: ' + score, 40, boardHeight/2 + 10);

    context.font = '18px sans-serif';
    context.fillText('다시 시작하려면 1 또는 2 키를 누르세요', 40, boardHeight/2 + 40);
  }
}
