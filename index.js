class ColorJourneyGame {
  constructor(canvas, sentiment) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sentiment = sentiment;

    // State
    this.running = false;
    this.lastTime = null;
    this.rafId = null;

    // Player
    this.player = {
      x: canvas.width / 6,
      y: canvas.height - 100,
      size: 30,
      vx: 0,
      vy: 0,
      onGround: true,
      color: "#fff",
    };

    // Clouds & Orbs
    this.clouds = [];
    this.orbs = [];
    this.collected = 0;
    this.targetCollected = 20;
    this.spawnTimer = 0;
    this.nextSpawnAt = this.randomSpawnInterval();

    // Bind methods
    this.animate = this.animate.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onResize = this.onResize.bind(this);

    // Keys
    this.keys = {};

    this.onResize();
    this.initClouds();
  }

  // --- Lifecycle ---
  start() {
    this.running = true;
    this.lastTime = null;

    // Listeners
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);

    this.rafId = requestAnimationFrame(this.animate);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);

    // Remove listeners
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
  }

  // --- Input ---
  onKeyDown(e) {
    this.keys[e.key] = true;
  }
  onKeyUp(e) {
    this.keys[e.key] = false;
  }

  // --- Resize ---
  onResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // --- Game Logic ---
  randomSpawnInterval() {
    return 0.8 + Math.random() * 1.5;
  }

  initClouds() {
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      this.clouds.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height * 0.3,
        rx: 100 + Math.random() * 150,
        ry: 40 + Math.random() * 60,
        speed: 20 + Math.random() * 50,
      });
    }
  }

  createOrb() {
    this.orbs.push({
      x: Math.random() * (this.canvas.width - 40) + 20,
      y: -20,
      size: 12 + Math.random() * 8,
      speed: 80 + Math.random() * 160,
      color: `hsl(${Math.floor(Math.random() * 60 + 40)}, 90%, 55%)`,
    });
  }

  // --- Loop ---
  animate(ts) {
    if (!this.lastTime) this.lastTime = ts;
    const dt = (ts - this.lastTime) / 1000;
    this.lastTime = ts;

    this.update(dt);
    this.draw();

    if (this.running) {
      this.rafId = requestAnimationFrame(this.animate);
    }
  }

  update(dt) {
    const gravity = 1500;

    // Spawn orbs
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnAt) {
      this.createOrb();
      this.spawnTimer = 0;
      this.nextSpawnAt = this.randomSpawnInterval();
    }

    // Player movement
    if (this.keys["ArrowLeft"] || this.keys["a"]) this.player.x -= 320 * dt;
    if (this.keys["ArrowRight"] || this.keys["d"]) this.player.x += 320 * dt;
    if ((this.keys[" "] || this.keys["Spacebar"]) && this.player.onGround) {
      this.player.vy = -600;
      this.player.onGround = false;
    }

    this.player.vy += gravity * dt;
    this.player.y += this.player.vy * dt;

    const groundY = this.canvas.height - 80;
    if (this.player.y + this.player.size > groundY) {
      this.player.y = groundY - this.player.size;
      this.player.vy = 0;
      this.player.onGround = true;
    }

    // Orb movement + collisions
    this.orbs.forEach((orb) => {
      orb.y += orb.speed * dt;
      const dx = orb.x - this.player.x;
      const dy = orb.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < orb.size + this.player.size) {
        orb.collected = true;
        this.collected++;
      }
    });
    this.orbs = this.orbs.filter((orb) => orb.y < this.canvas.height && !orb.collected);

    // Win condition
    if (this.collected >= this.targetCollected) {
      this.stop();
      setTimeout(() => alert("🎉 Journey Complete!"), 100);
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (this.sentiment === "sad") {
      g.addColorStop(0, "#4a4a4a");
      g.addColorStop(1, "#2b2b2b");
    } else {
      g.addColorStop(0, "#87CEEB");
      g.addColorStop(1, "#00BFFF");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Clouds
    this.clouds.forEach((c) => {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      c.x += c.speed * 0.016 * (this.sentiment === "sad" ? 0.3 : 1);
      if (c.x - c.rx > w) c.x = -c.rx;
    });

    // Ground
    ctx.fillStyle = this.sentiment === "sad" ? "#111" : "#2e8b57";
    ctx.fillRect(0, h - 80, w, 80);

    // Player
    ctx.fillStyle = this.player.color;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.size, 0, Math.PI * 2);
    ctx.fill();

    // Orbs
    this.orbs.forEach((o) => {
      ctx.beginPath();
      ctx.fillStyle = o.color;
      ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // HUD
    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.fillText(`Progress: ${this.collected}/${this.targetCollected}`, 20, 30);
  }
}