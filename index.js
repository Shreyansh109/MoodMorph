// =============== Chatbot Mock ===============
const chatWindow = document.getElementById("chat-window");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const playBtn = document.getElementById("play-btn");
const container = document.querySelector(".container");
let detectedSentiment = null;
let gameInstance = null;

window.addEventListener("DOMContentLoaded", () => {
  addMessage("Hello! I’m MoodBot 🤖. How are you feeling today?", "bot");
});

function addMessage(msg, type) {
  const div = document.createElement("div");
  div.classList.add("chat-msg", type);
  div.textContent = msg;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function detectSentiment(text) {
  text = text.toLowerCase();
  if (text.includes("happy") || text.includes("good") || text.includes("great")) {
    return "happy";
  } else if (text.includes("sad") || text.includes("bad") || text.includes("upset")) {
    return "sad";
  }
  return null;
}

sendBtn.addEventListener("click", () => {
  const userText = chatInput.value.trim();
  if (!userText) return;
  addMessage(userText, "user");
  chatInput.value = "";

  const sentiment = detectSentiment(userText);
  if (sentiment) {
    detectedSentiment = sentiment;
    addMessage(`I see you are feeling ${sentiment}. Click 'Play MoodMorph 🎮' to continue!`, "bot");
    playBtn.style.display = "block";
  } else {
    addMessage("Tell me more about how you feel...", "bot");
  }
});

playBtn.addEventListener("click", () => {
  if (detectedSentiment) {
    addMessage("Launching MoodMorph game for you!", "bot");
    playBtn.style.display = "none";

    // 🔥 Animate layout
    container.classList.remove("full-chat");
    container.classList.add("split-view");

    startGame(detectedSentiment);
  }
});

// =============== Game Setup ===============
class Game {
  constructor(canvas, sentiment = "sad") {
    // bind only once
    this.loop = this.loop.bind(this);

    // core
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sentiment = sentiment;
    this.dpr = window.devicePixelRatio || 1;

    // set size (will try to use canvas parent size; fallback to window)
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // player will be positioned relative to this.h (set by resize)
    this.player = {
      x: 150,
      y: this.h - 140,
      r: 26,
      vy: 0,
      onGround: true,
      doubleJumped: false,
      gradientOffset: 0,
      animationTime: 0,
      pulsePhase: 0,
      colorShiftSpeed: 1.5,
      glowIntensity: 1,
      jumpTimer: 0
    };

    // safe audio loader (no crash if files missing or unsupported)
    const safeAudio = (file) => {
      try {
        const a = new Audio(file);
        a.volume = 0.4;
        return a;
      } catch (e) {
        return null;
      }
    };
    var soundVar=this.sentiment === "sad" ? "sad.mp3" : "happy.mp3";//deciding which music will play
    this.sfx = {
      collect: safeAudio("collect.mp3"),
      jump: safeAudio("jump.mp3"),
      gameover: safeAudio("gameover.mp3"),
      bg: safeAudio(soundVar)
    };
    if (this.sfx.bg) this.sfx.bg.loop = true;

    // game state
    this.state = "menu"; // menu | playing | paused | gameover
    this.lastTs = 0;
    this.raf = null;
    this.shake = 0;

    this.score = 0;
    this.level = 1;
    this.collected = 0;
    this.target = 15;

    // world
    this.orbs = [];
    this.obstacles = [];
    this.particles = [];
    this.trail = [];

    // timers
    this.spawnTimer = 0;
    this.spawnInterval = 1.6;
    this.obSpawnTimer = 0;
    this.obSpawnInterval = 4.0;
    this.difficultyTimer = 0;

    // physics & tuning
    this.gravity = 1800;
    this.playerSpeed = 420;
    this.jumpVel = -620;

    // colors
    this.topColor = this.sentiment === "sad" ? "#30343a" : "#87CEEB";
    this.bottomColor = this.sentiment === "sad" ? "#0f1113" : "#00BFFF";

    // input state
    this.keys = {};
    this.spaceHeld = false; // prevent repeated jumps while holding space

    // bound input handlers so we can remove them later if needed
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointer = this._onPointer.bind(this);

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    this.canvas.addEventListener("pointerdown", this._onPointer);

    // start loop
    requestAnimationFrame((t) => { this.lastTs = t; this.raf = requestAnimationFrame(this.loop); });
  }

  // ---------- sizing ----------
  resize() {
    // try to respect canvas DOM size (parent layout may change)
    const parentRect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
    this.w = parentRect && parentRect.width ? parentRect.width : Math.max(window.innerWidth * 0.7, 400);
    this.h = parentRect && parentRect.height ? parentRect.height : window.innerHeight;
    const dpr = this.dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // if player exists, clamp its Y to ground
    if (this.player) {
      this.player.y = Math.min(this.player.y, this.h - 80 - this.player.r);
    }
  }

  // ---------- input ----------
  _onKeyDown(e) {
    // // prevent repeated jumps while holding
    // if ((e.key === " " || e.code === "Space" || e.key === "Spacebar") && !this.spaceHeld) {
    //   this.jump();
    //   this.spaceHeld = true;
    // }

    // P pause toggle
    if (e.key === "p" || e.key === "P") {
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
      return;
    }

    // Enter to start/restart
    if (this.state === "menu" && (e.key === "Enter")) { this.start(); return; }
    if (this.state === "gameover" && (e.key === "Enter")) { this.restart(); return; }

    this.keys[e.key] = true;
  }

  _onKeyUp(e) {
    // if (e.key === " " || e.code === "Space" || e.key === "Spacebar") this.spaceHeld = false;
    this.keys[e.key] = false;
  }

  _onPointer(e) {
    if (this.state === "menu") this.start();
    else if (this.state === "gameover") this.restart();
    else if (this.state === "playing") this.jump();
    else if (this.state === "paused") this.resume();
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
    this.state = "gameover";
    if (this.sfx.gameover) try { this.sfx.gameover.play(); } catch (e) {}
    if (this.sfx.bg) try { this.sfx.bg.pause(); } catch (e) {}
  }
  restart() {
    this.resetGame();
    this.state = "playing";
    if (this.sfx.bg) try { this.sfx.bg.currentTime = 0; this.sfx.bg.play(); } catch (e) {}
  }

  resetGame() {
    this.score = 0; this.level = 1; this.collected = 0; this.target = 15;
    this.orbs.length = 0;
    this.obstacles.length = 0;
    this.particles.length = 0;
    this.trail.length = 0;
    this.spawnTimer = 0;
    this.obSpawnTimer = 0;
    this.difficultyTimer = 0;
    this.player.x = 150;
    this.player.y = this.h - 140;
    this.player.vy = 0;
    this.player.onGround = true;
    this.player.doubleJumped = false;
    this.shake = 0;
    this.spawnInterval = 1.6;
    this.obSpawnInterval = 4;
    this.player.animationTime = 0;
    this.player.pulsePhase = 0;
    this.player.glowIntensity = 1;
    this.player.jumpTimer = 0;
  }

  // ---------- gameplay helpers ----------
  jump() {
    if (this.state !== "playing") return;
    if (this.player.onGround) {
      this.player.vy = this.jumpVel;
      this.player.onGround = false;
      this.player.doubleJumped = false;
      this.player.glowIntensity = 1.5;
      if (this.sfx.jump) try { this.sfx.jump.play(); } catch (e) {}
    } else if (!this.player.doubleJumped) {
      this.player.vy = this.jumpVel * 0.85;
      this.player.doubleJumped = true;
      this.player.glowIntensity = 2.0;
      if (this.sfx.jump) try { this.sfx.jump.play(); } catch (e) {}
    }
  }

  spawnOrb() {
    const tRand = Math.random();
    const type = tRand < 0.75 ? "normal" : (tRand < 0.92 ? "slow" : "gold");
    const color = type === "normal" ? `hsl(${40 + Math.random()*80}, 90%, 55%)`
                : (type === "slow" ? `hsl(210, 90%, 60%)` : `#ffd700`);
    this.orbs.push({
      x: Math.random() * (this.w - 120) + 80,
      y: -20 - Math.random() * 80,
      r: 12 + Math.random() * 8,
      speed: 160 + Math.random() * 180,
      type, color
    });
  }

  spawnObstacle() {
    const groundY = this.h - 80;
    if (Math.random() < 0.6) {
      const w = 36, x = Math.random() * (this.w - 200) + 200;
      this.obstacles.push({ kind: "spike", x, y: groundY - 16, w, h: 32 });
    } else {
      const w = 70, h = 28;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const x = direction > 0 ? -w : this.w + w;
      const speed = 90 + Math.random() * 140;
      this.obstacles.push({ kind: "block", x, y: groundY - h, w, h, vx: speed * direction });
    }
  }

  collectOrb(orb) {
    if (orb.type === "normal") {
      this.score += 1; this.collected += 1;
    } else if (orb.type === "slow") {
      this.score += 1; this.collected += 1;
      this.obstacles.forEach(o => { if (o.kind === "block") o.vx *= 0.35; });
      setTimeout(() => { this.obstacles.forEach(o => { if (o.kind === "block") o.vx *= (1 / 0.35); }); }, 2200);
    } else if (orb.type === "gold") {
      this.score += 3; this.collected += 2;
    }

    this.player.glowIntensity = 2.5;
    this.player.colorShiftSpeed = 3.0;

    this.emitParticles(orb.x, orb.y, orb.color, 18);
    if (this.sfx.collect) try { this.sfx.collect.play(); } catch (e) {}

    if (this.collected >= this.target) this.levelUp();
  }

  levelUp() {
    this.level++;
    this.collected = 0;
    this.target = Math.max(10, 12 + Math.floor(this.level * 1.5));
    this.spawnInterval = Math.max(0.9, this.spawnInterval - 0.1);
    this.obSpawnInterval = Math.max(2.0, this.obSpawnInterval - 0.15);

    this.player.glowIntensity = 3.0;
    this.player.colorShiftSpeed = 4.0;

    this.emitParticles(this.player.x, this.player.y - 40, "#fff", 28);
  }

  getPlayerGradientColors() {
  const time = this.player.animationTime;
  const pulse = this.player.pulsePhase;
  const levelProgress = Math.min(1, (this.level - 1) * 0.12 + (this.collected / Math.max(1, this.target)) * 0.4);
  
  let primaryColors, secondaryColors;
  
  if (this.sentiment === "sad") {
    // Sad mode: cool blues to warm pinks/purples
    primaryColors = [
      "#00f0ff", // cyan
      "#0080ff", // blue
      "#8000ff", // purple  
      "#ff00ff", // magenta
      "#ff69b4"  // pink
    ];
    secondaryColors = [
      "#004080", // dark blue
      "#200040", // dark purple
      "#400020", // dark magenta
      "#800040", // dark pink
      "#004060"  // dark cyan
    ];
  } else {
  // Happy mode: vibrant gradient colors
  primaryColors = [
    "#FFB852", // warm orange (top-left gradient)
    "#C165D0", // purple (top-second gradient)  
    "#2AFE67", // bright green (top-third gradient)
    "#5681F1", // blue (top-right gradient)
    "#FFE324"  // yellow (bottom-right gradient)
  ];
  secondaryColors = [
    "#FF7B02", // deeper orange
    "#5C2FEE", // deeper purple
    "#08C792", // deeper green
    "#1153FC", // deeper blue
    "#FFB539"  // deeper yellow
  ];
  }

  // Animated color selection
  const colorIndex = (time * this.player.colorShiftSpeed + levelProgress * 2) % primaryColors.length;
  const currentIndex = Math.floor(colorIndex);
  const nextIndex = (currentIndex + 1) % primaryColors.length;
  const blend = colorIndex - currentIndex;

  // Interpolate between current and next color
  const primaryColor = this.lerpColor(primaryColors[currentIndex], primaryColors[nextIndex], blend);
  const secondaryColor = this.lerpColor(secondaryColors[currentIndex], secondaryColors[nextIndex], blend);

  // Add pulsing effect
  const pulseIntensity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(pulse * 4));
  const glowColor = this.lerpColor(primaryColor, "#f2b142ff", pulseIntensity * 0.4);

  return {
    inner: "#facd80a3",
    mid: glowColor,
    outer: secondaryColor,
    glow: primaryColor
  };
}

  emitParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 420,
        vy: (Math.random() - 0.8) * 420,
        r: 2 + Math.random() * 4,
        life: 0.6 + Math.random() * 0.8,
        color
      });
    }
  }

  // ---------- main loop ----------
  loop(ts) {
    const dt = Math.min(0.04, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    if (this.state === "playing") this.update(dt);
    this.draw(dt);

    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {

    this.player.animationTime += dt;
    this.player.pulsePhase += dt;
    this.player.glowIntensity = Math.max(1.0, this.player.glowIntensity - dt * 2);
    this.player.colorShiftSpeed = Math.max(1.5, this.player.colorShiftSpeed - dt * 1.5);

    // Add continuous jumping logic:
    this.player.jumpTimer += dt;
    if (this.keys[" "] || this.keys["Space"] || this.keys["Spacebar"]) {
      if (this.player.jumpTimer > 0.15) { // Jump every 150ms when holding space
        this.jump();
        this.player.jumpTimer = 0;
      }
    }

    // movement left/right
    if (this.keys["ArrowLeft"] || this.keys["a"]) this.player.x -= this.playerSpeed * dt;
    if (this.keys["ArrowRight"] || this.keys["d"]) this.player.x += this.playerSpeed * dt;
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
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.35, this.spawnInterval + (Math.random() - 0.5) * 0.15);
      this.spawnOrb();
    }

    // spawn obstacles
    this.obSpawnTimer += dt;
    if (this.obSpawnTimer >= this.obSpawnInterval) {
      this.obSpawnTimer = 0;
      this.obSpawnInterval = Math.max(1.0, this.obSpawnInterval - 0.02);
      this.spawnObstacle();
    }

    // update orbs and collisions
    for (let orb of this.orbs) {
      orb.y += orb.speed * dt;
      const dx = orb.x - this.player.x, dy = orb.y - this.player.y;
      if ((dx * dx + dy * dy) < ((orb.r + this.player.r) * (orb.r + this.player.r))) {
        orb.collected = true;
        this.collectOrb(orb);
      }
    }
    this.orbs = this.orbs.filter(o => !o.collected && o.y - o.r < this.h + 80);

    // update obstacles and collisions
    for (let ob of this.obstacles) {
      if (ob.kind === "block") ob.x += ob.vx * dt;

      // circle vs AABB collision
      const cx = this.player.x, cy = this.player.y;
      const closestX = Math.max(ob.x, Math.min(cx, ob.x + ob.w));
      const closestY = Math.max(ob.y, Math.min(cy, ob.y + ob.h));
      const ddx = cx - closestX, ddy = cy - closestY;
      if (ddx * ddx + ddy * ddy < (this.player.r * this.player.r)) {
        this.shake = 10;
        this.emitParticles(this.player.x, this.player.y, "#f28b8ba5", 18);
        this.gameOver();
      }
    }
    // remove offscreen moving blocks
    this.obstacles = this.obstacles.filter(ob => !(ob.kind === "block" && (ob.x + ob.w < -120 || ob.x > this.w + 120)));
    if (this.obstacles.length > 14) this.obstacles.shift();

    // update particles
    for (let p of this.particles) {
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // trail
    this.trail.unshift({ x: this.player.x, y: this.player.y, life: 0.35 });
    if (this.trail.length > 18) this.trail.pop();
    for (let t of this.trail) t.life -= dt / 0.6;
    this.trail = this.trail.filter(t => t.life > 0);

    // difficulty tweak
    this.difficultyTimer += dt;
    if (this.difficultyTimer > 8) {
      this.difficultyTimer = 0;
      this.spawnInterval = Math.max(0.4, this.spawnInterval - 0.02);
      this.obSpawnInterval = Math.max(1.0, this.obSpawnInterval - 0.03);
    }

    // reduce shake
    this.shake = Math.max(0, this.shake - 40 * dt);
    // gradient offset
    this.player.gradientOffset = (this.player.gradientOffset + dt * 0.6) % 1;
  }

  draw() {
    if (this.state === "gameover") {
      this.shake = 0;   // 🔥 cancel shake
    }

    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(sx, sy);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    const prog = Math.min(1, this.level * 0.08);
    const top = this.lerpColor(this.topColor, "#1e1f2a", prog * 0.5);
    const bottom = this.lerpColor(this.bottomColor, "#030405", prog);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // subtle decorative clouds / stars
    if (this.sentiment === "sad") {
      ctx.globalAlpha = 0.06;
      for (let i = 0; i < 30; i++) {
        const x = (i * 37 + (Date.now() * 0.02 * (i % 7))) % w;
        const y = (i * 23 + (Date.now() * 0.015 * (i % 11))) % (h * 0.6);
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // ground
    ctx.fillStyle = "#0b0f13";
    ctx.fillRect(0, h - 80, w, 80);
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath();
    ctx.moveTo(0, h - 80);
    ctx.lineTo(w, h - 80);
    ctx.stroke();

    // obstacles
    for (let ob of this.obstacles) {
      if (ob.kind === "spike") {
        ctx.fillStyle = "#b22222";
        ctx.beginPath();
        ctx.moveTo(ob.x, ob.y + ob.h);
        ctx.lineTo(ob.x + ob.w * 0.5, ob.y);
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
      const y = o.y + Math.sin((Date.now() + o.x) * 0.003) * 6;
      const g = ctx.createRadialGradient(o.x, y, 1, o.x, y, o.r * 2.6);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.2, o.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(o.x - o.r * 0.15, y - o.r * 0.6, 2, 2);
      ctx.globalAlpha = 1;
    }

    // trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      const alpha = Math.max(0, t.life);
      const r = this.player.r * (0.9 - i * 0.02);
      const grad = ctx.createRadialGradient(t.x, t.y, r * 0.2, t.x, t.y, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
      grad.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const pr = this.player.r;
    const colors = this.getPlayerGradientColors();
    const glowRadius = pr * this.player.glowIntensity;

    const outerGlow = ctx.createRadialGradient(this.player.x, this.player.y, pr * 0.5, 
                                         this.player.x, this.player.y, glowRadius * 1.8);
    outerGlow.addColorStop(0, colors.glow.replace('rgb(', 'rgba(').replace(')', ',0.4)'));
    outerGlow.addColorStop(0.6, colors.glow.replace('rgb(', 'rgba(').replace(')', ',0.2)'));
    outerGlow.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.globalAlpha = Math.min(1, this.player.glowIntensity * 0.8);
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, glowRadius * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Main player ball with animated gradient
    const playerGrad = ctx.createRadialGradient(
      this.player.x, this.player.y, pr * 0.1,
      this.player.x, this.player.y, pr
    );
    playerGrad.addColorStop(0, colors.inner);
    playerGrad.addColorStop(0.3, colors.mid);
    playerGrad.addColorStop(0.7, colors.glow);
    playerGrad.addColorStop(1, colors.outer);

    ctx.fillStyle = playerGrad;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, pr, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight (centered and no pulse)
    const highlightSize = pr * 0.3;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = colors.inner;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, highlightSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // particles
    for (let p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "18px Inter, Arial";
    ctx.fillText(`Score: ${this.score}`, 20, 34);
    ctx.fillText(`Level: ${this.level}`, 20, 60);

    // progress bar
    const barW = 220, barH = 12;
    const bx = this.w - barW - 24, by = 24;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, by, barW, barH);
    const pratio = Math.min(1, this.collected / Math.max(1, this.target));
    ctx.fillStyle = this.lerpColor("#4ade80", "#facc15", pratio);
    ctx.fillRect(bx, by, barW * pratio, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(bx, by, barW, barH);

    // overlays
    if (this.state === "menu") {
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = "#fff";
      ctx.font = "36px Inter, Arial";
      ctx.fillText("MoodMorph: Color Journey", this.w / 2 - 230, this.h / 2 - 40);
      ctx.font = "18px Inter, Arial";
      ctx.fillText("Collect orbs, jump over obstacles, and shift the world from sad → happy.", this.w / 2 - 320, this.h / 2);
      ctx.fillStyle = "#8ef";
      ctx.fillRect(this.w / 2 - 70, this.h / 2 + 40, 140, 46);
      ctx.fillStyle = "#001";
      ctx.font = "20px Inter, Arial";
      ctx.fillText("PLAY", this.w / 2 - 26, this.h / 2 + 72);
    }

    if (this.state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = "#ffec99";
      ctx.font = "36px Inter, Arial";
      ctx.fillText("PAUSED", this.w / 2 - 72, this.h / 2);
      ctx.font = "16px Inter, Arial";
      ctx.fillStyle = "#fff";
      ctx.fillText("Press P to resume or tap to continue", this.w / 2 - 170, this.h / 2 + 30);
    }

    if (this.state === "gameover") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = "#fff";
      ctx.font = "40px Inter, Arial";
      ctx.fillText("Game Over", this.w / 2 - 110, this.h / 2 - 20);
      ctx.font = "20px Inter, Arial";
      ctx.fillText(`Your Score: ${this.score}`, this.w / 2 - 80, this.h / 2 + 14);
      ctx.fillStyle = "#8ef";
      ctx.fillRect(this.w / 2 - 70, this.h / 2 + 40, 140, 46);
      ctx.fillStyle = "#001";
      ctx.font = "20px Inter, Arial";
      ctx.fillText("Restart", this.w / 2 - 35, this.h / 2 + 72);
    }

    ctx.restore();
  }

  // ---------- util ----------
  lerpColor(a, b, t) {
    // expects hex like #rrggbb; safe-guard for short form
    function hexToRgb(h) {
      if (!h) return [0, 0, 0];
      h = h.replace("#", "");
      if (h.length === 3) h = h.split("").map(c => c + c).join("");
      const r = parseInt(h.substr(0, 2), 16) || 0;
      const g = parseInt(h.substr(2, 2), 16) || 0;
      const bl = parseInt(h.substr(4, 2), 16) || 0;
      return [r, g, bl];
    }
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t);
    const g = Math.round(A[1] + (B[1] - A[1]) * t);
    const bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  // optional cleanup (not required, but handy)
  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.canvas.removeEventListener("pointerdown", this._onPointer);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.sfx.bg) try { this.sfx.bg.pause(); } catch (e) {}
  }
}

// =============== Launch ===============
function startGame(sentiment) {
  const canvas = document.getElementById("game-canvas");
  gameInstance = new Game(canvas, sentiment);
}