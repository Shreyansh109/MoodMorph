// Final polished canvas game — replace previous index.js
class Game {
  constructor(canvas, sentiment = "sad") {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sentiment = sentiment; // 'sad' or 'happy' (affects palette and music)
    this.devicePixelRatio = window.devicePixelRatio || 1;

    // sizing
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // audio (placeholders; drop your files in folder)
    this.sfx = {
      collect: new Audio("collect.mp3"),
      jump: new Audio("jump.mp3"),
      gameover: new Audio("gameover.mp3"),
      bg: new Audio("bg_loop.mp3")
    };
    if (this.sfx.bg) {
      this.sfx.bg.loop = true;
      this.sfx.bg.volume = 0.3;
      // played only when game starts
    }

    // game state
    this.state = "menu"; // menu, playing, paused, gameover
    this.lastTs = 0;
    this.raf = null;
    this.shake = 0;

    // gameplay
    this.score = 0;
    this.level = 1;
    this.collected = 0;
    this.target = 15;
    this.difficultyTimer = 0;

    // player
    this.player = {
      x: 150, y: this.h - 140, r: 26, vy: 0, onGround: true,
      doubleJumped: false, gradientOffset: 0
    };

    // world
    this.orbs = [];
    this.obstacles = []; // ground spikes and moving blocks
    this.particles = [];
    this.trail = [];

    // timers
    this.spawnTimer = 0;
    this.spawnInterval = 0.9;
    this.obSpawnTimer = 0;
    this.obSpawnInterval = 2.5;

    // tuning
    this.gravity = 1800;
    this.playerSpeed = 420;
    this.jumpVel = -620;

    // visuals
    this.topColor = this.sentiment === "sad" ? "#30343a" : "#87CEEB";
    this.bottomColor = this.sentiment === "sad" ? "#0f1113" : "#00BFFF";

    // input
    this.keys = {};
    window.addEventListener("keydown", e => this.onKeyDown(e));
    window.addEventListener("keyup", e => this.onKeyUp(e));
    this.canvas.addEventListener("pointerdown", e => this.onPointerDown(e));

    // start loop
    this.loop = this.loop.bind(this);
    requestAnimationFrame((t) => { this.lastTs = t; this.raf = requestAnimationFrame(this.loop); });
  }

  // ---------- size ----------
  resize() {
    const dpr = this.devicePixelRatio;
    this.w = Math.max(window.innerWidth, 320);
    this.h = Math.max(window.innerHeight, 400);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- input ----------
  onKeyDown(e) {
    if (e.key === "p" || e.key === "P") {
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
      return;
    }
    if (this.state === "menu" && (e.key === "Enter" || e.key === " ")) {
      this.start();
      return;
    }
    if (this.state === "gameover" && (e.key === "Enter" || e.key === " ")) {
      this.restart();
      return;
    }
    this.keys[e.key] = true;
  }
  onKeyUp(e) { this.keys[e.key] = false; }
  onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.state === "menu") {
      // treat any click on canvas as start
      this.start();
    } else if (this.state === "gameover") {
      this.restart();
    } else if (this.state === "playing") {
      // touch -> jump
      this.jump();
    } else if (this.state === "paused") {
      this.resume();
    }
  }

  // ---------- game control ----------
  start() {
    this.resetGame();
    this.state = "playing";
    if (this.sfx.bg) { try { this.sfx.bg.currentTime = 0; this.sfx.bg.play(); } catch (e) {} }
  }
  pause() { this.state = "paused"; }
  resume() { if (this.state === "paused") this.state = "playing"; }
  gameOver() {
    if (this.sfx.gameover) { try { this.sfx.gameover.play(); } catch(e){} }
    this.state = "gameover";
    if (this.sfx.bg) { try { this.sfx.bg.pause(); } catch(e){} }
  }
  restart() {
    this.resetGame();
    this.state = "playing";
    if (this.sfx.bg) { try { this.sfx.bg.currentTime = 0; this.sfx.bg.play(); } catch(e){} }
  }
  resetGame() {
    this.score = 0; this.level = 1; this.collected = 0; this.target = 15;
    this.orbs = []; this.obstacles = []; this.particles = []; this.trail = [];
    this.spawnTimer = 0; this.obSpawnTimer = 0; this.difficultyTimer = 0;
    this.player.x = 150; this.player.y = this.h - 140; this.player.vy = 0;
    this.player.onGround = true; this.player.doubleJumped = false;
    this.shake = 0;
    this.spawnInterval = 0.9;
    this.obSpawnInterval = 2.5;
  }

  // ---------- gameplay helpers ----------
  jump() {
    if (this.player.onGround) {
      this.player.vy = this.jumpVel;
      this.player.onGround = false;
      this.player.doubleJumped = false;
      if (this.sfx.jump) try { this.sfx.jump.play(); } catch(e){}
    } else if (!this.player.doubleJumped) {
      this.player.vy = this.jumpVel * 0.85;
      this.player.doubleJumped = true;
      if (this.sfx.jump) try { this.sfx.jump.play(); } catch(e){}
    }
  }

  spawnOrb() {
    // type: normal, slow, gold
    const tRand = Math.random();
    const type = tRand < 0.75 ? "normal" : (tRand < 0.92 ? "slow" : "gold");
    const color = type === "normal" ? `hsl(${40 + Math.random()*80}, 90%, 55%)`
                : (type === "slow" ? `hsl(210, 90%, 60%)` : `#ffd700`);
    this.orbs.push({
      x: Math.random() * (this.w - 120) + 80,
      y: -20 - Math.random()*80,
      r: 12 + Math.random()*8,
      speed: 160 + Math.random()*180,
      type, color
    });
  }
  spawnObstacle() {
    // ground spike or moving block
    const groundY = this.h - 80;
    if (Math.random() < 0.6) {
      // spike: small triangle
      const w = 36, x = Math.random() * (this.w - 200) + 200;
      this.obstacles.push({ kind: "spike", x, y: groundY - 16, w, h: 32 });
    } else {
      // moving block
      const w = 70, h = 28;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const x = direction > 0 ? -w : this.w + w;
      const speed = 90 + Math.random()*140;
      this.obstacles.push({ kind:"block", x, y: groundY - h, w, h, vx: speed*direction });
    }
  }

  collectOrb(orb) {
    // handle based on type
    if (orb.type === "normal") {
      this.score += 1;
      this.collected += 1;
    } else if (orb.type === "slow") {
      this.score += 1;
      // slow obstacles temporarily
      this.obstacles.forEach(o => { if (o.kind === "block") o.vx *= 0.35; });
      // restore after 2.2s
      setTimeout(() => {
        this.obstacles.forEach(o => { if (o.kind === "block") o.vx *= (1/0.35); });
      }, 2200);
      this.collected += 1;
    } else if (orb.type === "gold") {
      this.score += 3;
      this.collected += 2;
    }

    // particle burst
    this.emitParticles(orb.x, orb.y, orb.color, 18);

    // sound
    try { this.sfx.collect.play(); } catch(e) {}

    // level up check
    if (this.collected >= this.target) {
      this.levelUp();
    }
  }

  levelUp() {
    this.level++;
    this.collected = 0;
    this.target = Math.max(10, 12 + Math.floor(this.level * 1.5));
    // tighten spawn / obstacle
    this.spawnInterval = Math.max(0.45, this.spawnInterval - 0.08);
    this.obSpawnInterval = Math.max(1.1, this.obSpawnInterval - 0.12);
    // small celebratory particles
    this.emitParticles(this.player.x, this.player.y - 40, "#fff", 28);
    // short speed boost
    // visual cue later by gradient shift
  }

  emitParticles(x,y,color,count=10) {
    for (let i=0;i<count;i++){
      this.particles.push({
        x,y,
        vx: (Math.random()-0.5) * 420,
        vy: (Math.random()-0.8) * 420,
        r: 2 + Math.random()*4,
        life: 0.6 + Math.random()*0.8,
        color
      });
    }
  }

  // ---------- game loop ----------
  loop(ts) {
    const dt = Math.min(0.04, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    if (this.state === "playing") this.update(dt);
    this.draw(dt);

    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    // input
    if (this.keys["ArrowLeft"] || this.keys["a"]) this.player.x -= this.playerSpeed * dt;
    if (this.keys["ArrowRight"] || this.keys["d"]) this.player.x += this.playerSpeed * dt;
    if (this.keys[" "] || this.keys["Space"]) {
      if (this._spaceWasUp) { this.jump(); this._spaceWasUp = false; }
    } else this._spaceWasUp = true;
    // touch handled via pointerdown

    // clamp
    this.player.x = Math.max(40, Math.min(this.w - 40, this.player.x));

    // physics
    this.player.vy += this.gravity * dt;
    this.player.y += this.player.vy * dt;

    const groundY = this.h - 80;
    if (this.player.y + this.player.r > groundY) {
      this.player.y = groundY - this.player.r;
      this.player.vy = 0;
      this.player.onGround = true;
      this.player.doubleJumped = false;
    } else {
      this.player.onGround = false;
    }

    // spawn orbs
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0; this.spawnInterval = Math.max(0.35, this.spawnInterval + (Math.random()-0.5)*0.15);
      this.spawnOrb();
    }

    // spawn obstacles
    this.obSpawnTimer += dt;
    if (this.obSpawnTimer >= this.obSpawnInterval) {
      this.obSpawnTimer = 0;
      this.obSpawnInterval = Math.max(1.0, this.obSpawnInterval - 0.02);
      this.spawnObstacle();
    }

    // update orbs
    for (let orb of this.orbs) {
      orb.y += orb.speed * dt;
      // collision with player
      const dx = orb.x - this.player.x, dy = orb.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < orb.r + this.player.r) {
        orb.collected = true;
        this.collectOrb(orb);
      }
    }
    this.orbs = this.orbs.filter(o => !o.collected && o.y - o.r < this.h + 80);

    // update obstacles
    for (let ob of this.obstacles) {
      if (ob.kind === "block") {
        ob.x += ob.vx * dt;
      }
      // collision check: simple AABB vs circle
      const cx = this.player.x, cy = this.player.y;
      const closestX = Math.max(ob.x, Math.min(cx, ob.x + ob.w));
      const closestY = Math.max(ob.y, Math.min(cy, ob.y + ob.h));
      const dx = cx - closestX, dy = cy - closestY;
      if (dx*dx + dy*dy < (this.player.r * this.player.r)) {
        // hit
        this.shake = 10;
        this.emitParticles(this.player.x, this.player.y, "#ff5555", 18);
        this.gameOver();
      }
    }
    // remove offscreen moving blocks
    this.obstacles = this.obstacles.filter(ob => !(ob.kind === "block" && (ob.x + ob.w < -120 || ob.x > this.w + 120)));
    // keep spikes reasonable
    if (this.obstacles.length > 12) this.obstacles.shift();

    // particles
    for (let p of this.particles) {
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // trail (store previous positions)
    this.trail.unshift({ x: this.player.x, y: this.player.y, life: 0.35 });
    if (this.trail.length > 18) this.trail.pop();
    for (let t of this.trail) t.life -= dt / 0.6;
    this.trail = this.trail.filter(t => t.life > 0);

    // difficulty gradual increase
    this.difficultyTimer += dt;
    if (this.difficultyTimer > 8) {
      this.difficultyTimer = 0;
      // slightly increase spawn rate
      this.spawnInterval = Math.max(0.4, this.spawnInterval - 0.02);
      this.obSpawnInterval = Math.max(1.0, this.obSpawnInterval - 0.03);
    }

    // reduce screen shake
    this.shake = Math.max(0, this.shake - 40 * dt);
    // gradient offset for player glow
    this.player.gradientOffset = (this.player.gradientOffset + dt * 0.6) % 1;
  }

  // ---------- drawing ----------
  draw() {
    const ctx = this.ctx;
    // small shake offset
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    ctx.clearRect(0,0,this.w,this.h);

    ctx.save();
    ctx.translate(sx, sy);

    // background gradient (animated by level)
    const bg = ctx.createLinearGradient(0,0,0,this.h);
    const prog = Math.min(1, this.level * 0.08);
    const top = this.lerpColor(this.topColor, "#1e1f2a", prog * 0.5);
    const bottom = this.lerpColor(this.bottomColor, "#030405", prog);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,this.w,this.h);

    // subtle moving stars if sad
    if (this.sentiment === "sad") {
      ctx.globalAlpha = 0.06;
      for (let i=0;i<40;i++){
        const x = (i*37 + (Date.now()*0.02*(i%7))) % this.w;
        const y = (i*23 + (Date.now()*0.015*(i%11))) % (this.h*0.6);
        ctx.fillRect(x, y, 1,1);
      }
      ctx.globalAlpha = 1;
    }

    // clouds (simple moving ellipses)
    for (let i=0;i<6;i++){
      const cx = (i*221 + (Date.now()*0.02*(i%4))) % (this.w + 300) - 150;
      const cy = 60 + (i%3)*30;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 160 - (i%3)*30, 40, 0,0,Math.PI*2);
      ctx.fill();
    }

    // ground
    ctx.fillStyle = "#0b0f13";
    ctx.fillRect(0, this.h - 80, this.w, 80);
    // ground line
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath();
    ctx.moveTo(0, this.h - 80);
    ctx.lineTo(this.w, this.h - 80);
    ctx.stroke();

    // obstacles
    for (let ob of this.obstacles) {
      if (ob.kind === "spike") {
        ctx.fillStyle = "#b22222";
        ctx.beginPath();
        ctx.moveTo(ob.x, ob.y + ob.h);
        ctx.lineTo(ob.x + ob.w*0.5, ob.y);
        ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
        ctx.closePath();
        ctx.fill();
      } else if (ob.kind === "block") {
        ctx.fillStyle = "#8b2d2d";
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      }
    }

    // orbs
    for (let o of this.orbs) {
      // small float animation
      const y = o.y + Math.sin((Date.now() + o.x) * 0.003) * 6;
      // glow
      const g = ctx.createRadialGradient(o.x, y, 1, o.x, y, o.r * 2.6);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.2, o.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, y, o.r, 0, Math.PI*2);
      ctx.fill();
      // sparkle
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(o.x - o.r*0.15, y - o.r*0.6, 2,2);
      ctx.globalAlpha = 1;
    }

    // trail (draw older faded circles)
    for (let i = this.trail.length - 1; i >=0; i--) {
      const t = this.trail[i];
      const alpha = Math.max(0, t.life);
      const r = this.player.r * (0.9 - i * 0.02);
      const grad = ctx.createRadialGradient(t.x, t.y, r*0.2, t.x, t.y, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
      grad.addColorStop(1, `rgba(255,255,255,${0.0})`);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // player with gradient color grid-ish glow
    const pr = this.player.r;
    const offset = this.player.gradientOffset;
    const playerGrad = ctx.createRadialGradient(this.player.x - pr*0.2, this.player.y - pr*0.2, pr*0.12,
      this.player.x, this.player.y, pr);
    // color shifts with progress/level
    const pProg = Math.min(1, (this.level - 1) * 0.12 + (this.collected / Math.max(1,this.target))*0.4);
    const startColor = this.sentiment === "sad" ? this.lerpColor("#00f0ff", "#ff69b4", pProg) : this.lerpColor("#00ff7f", "#ffd700", pProg);
    playerGrad.addColorStop(0, "#ffffff");
    playerGrad.addColorStop(0.4, startColor);
    playerGrad.addColorStop(1, this.lerpColor(startColor, "#000000", 0.85));
    ctx.fillStyle = playerGrad;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, pr, 0, Math.PI*2);
    ctx.fill();

    // overlay UI: score, level, progress bar
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "18px Inter, Arial";
    ctx.fillText(`Score: ${this.score}`, 20, 34);
    ctx.fillText(`Level: ${this.level}`, 20, 60);

    // progress bar
    const barW = 220, barH = 12;
    const bx = this.w - barW - 24, by = 24;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, by, barW, barH);
    const pratio = Math.min(1, this.collected / Math.max(1,this.target));
    ctx.fillStyle = this.lerpColor("#4ade80", "#facc15", pratio);
    ctx.fillRect(bx, by, barW * pratio, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(bx, by, barW, barH);

    // paused overlay
    if (this.state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fillRect(0,0,this.w,this.h);
      ctx.fillStyle = "#ffec99";
      ctx.font = "36px Inter, Arial";
      ctx.fillText("PAUSED", this.w/2 - 72, this.h/2);
      ctx.font = "16px Inter, Arial";
      ctx.fillStyle = "#fff";
      ctx.fillText("Press P to resume or tap to continue", this.w/2 - 170, this.h/2 + 30);
    }

    // menu
    if (this.state === "menu") {
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fillRect(0,0,this.w,this.h);
      ctx.fillStyle = "#fff";
      ctx.font = "48px Inter, Arial";
      ctx.fillText("MoodMorph: Color Journey", this.w/2 - 320, this.h/2 - 40);
      ctx.font = "18px Inter, Arial";
      ctx.fillText("Collect orbs, jump over obstacles, and shift the world from sad → happy.", this.w/2 - 320, this.h/2);
      ctx.fillStyle = "#8ef";
      ctx.fillRect(this.w/2 - 70, this.h/2 + 40, 140, 46);
      ctx.fillStyle = "#001";
      ctx.font = "20px Inter, Arial";
      ctx.fillText("PLAY", this.w/2 - 26, this.h/2 + 72);
      ctx.fillStyle = "#fff";
      ctx.font = "13px Inter, Arial";
      ctx.fillText("Controls: Arrow keys / A,D to move, Space to jump (double jump). P to pause.", this.w/2 - 260, this.h/2 + 110);
    }

    // gameover
    if (this.state === "gameover") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0,0,this.w,this.h);
      ctx.fillStyle = "#fff";
      ctx.font = "40px Inter, Arial";
      ctx.fillText("Game Over", this.w/2 - 110, this.h/2 - 20);
      ctx.font = "20px Inter, Arial";
      ctx.fillText(`Your Score: ${this.score}`, this.w/2 - 80, this.h/2 + 14);
      ctx.fillStyle = "#8ef";
      ctx.fillRect(this.w/2 - 70, this.h/2 + 40, 140, 46);
      ctx.fillStyle = "#001";
      ctx.font = "20px Inter, Arial";
      ctx.fillText("Restart", this.w/2 - 35, this.h/2 + 72);
    }

    ctx.restore();
  }

  // ---------- small util ----------
  lerpColor(a, b, t) {
    // a,b hex like #rrggbb or rgb strings; assume hex
    const hexToRgb = (h) => {
      const s = h.replace("#",""); return [parseInt(s.substring(0,2),16), parseInt(s.substring(2,4),16), parseInt(s.substring(4,6),16)];
    };
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A[0] + (B[0]-A[0]) * t);
    const g = Math.round(A[1] + (B[1]-A[1]) * t);
    const bl = Math.round(A[2] + (B[2]-A[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
}

// Initialize when DOM ready
window.addEventListener("load", () => {
  const canvas = document.getElementById("game-canvas");
  // sentiment could be passed from chatbot detection; default to sad
  const game = new Game(canvas, "sad");
  // pointer events to jump on mobile: already hooked; optional on-screen buttons could be added later
});