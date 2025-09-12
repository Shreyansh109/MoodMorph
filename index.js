class ColorJourneyGame {
  constructor(canvas, sentiment) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sentiment = sentiment;

    // Inside constructor
    if (this.sentiment === "sad") {
      this.sadMusic = new Audio("sad.mp3");   // replace with your path
      this.happyMusic = new Audio("happy.mp3"); // replace with your path
      this.sadMusic.loop = true;
      this.happyMusic.loop = true;
      this.sadMusic.volume = 1;
      this.happyMusic.volume = 0;
      this.sadMusic.play();
      this.happyMusic.play();
    }


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
    this.targetCollected = 30;
    this.spawnTimer = 0;
    this.nextSpawnAt = this.randomSpawnInterval();

    // Theme
    this.bgTopColor = sentiment === "sad" ? "#4a4a4a" : "#87CEEB";
    this.bgBottomColor = sentiment === "sad" ? "#2b2b2b" : "#00BFFF";
    this.cloudSpeedMultiplier = sentiment === "sad" ? 0.3 : 1;

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

  // --- Color Lerp Helper ---
  lerpColor(a, b, amount) {
    const hexToRgb = (h) => {
      const [r, g, bl] = h.slice(1).match(/\w\w/g).map(x => parseInt(x,16));
      return [r,g,bl];
    };
    const [r1,g1,b1] = hexToRgb(a);
    const [r2,g2,b2] = hexToRgb(b);
    const r = Math.round(r1 + (r2 - r1) * amount);
    const g = Math.round(g1 + (g2 - g1) * amount);
    const bl = Math.round(b1 + (b2 - b1) * amount);
    return `rgb(${r},${g},${bl})`;
  }

  updateTheme() {
    const progressRatio = this.collected / this.targetCollected;

    if (this.sentiment === "sad") {
      this.bgTopColor = this.lerpColor("#4a4a4a", "#87CEEB", progressRatio);
      this.bgBottomColor = this.lerpColor("#2b2b2b", "#00BFFF", progressRatio);
      this.cloudSpeedMultiplier = 0.3 + 0.7 * progressRatio;
      // Gradually blend music
      if(this.sadMusic && this.happyMusic){
        this.sadMusic.volume = 1 - progressRatio;
        this.happyMusic.volume = progressRatio;
      }
    } else {
      this.bgTopColor = "#87CEEB";
      this.bgBottomColor = "#00BFFF";
      this.cloudSpeedMultiplier = 1;
    }
  }

  // --- Lifecycle ---
  start() {
    this.running = true;
    this.lastTime = null;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    this.rafId = requestAnimationFrame(this.animate);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);

    // Stop music
    if(this.sadMusic) this.sadMusic.pause();
    if(this.happyMusic) this.happyMusic.pause();
  }

  onKeyDown(e){ this.keys[e.key]=true; }
  onKeyUp(e){ this.keys[e.key]=false; }

  onResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  randomSpawnInterval() { return 0.8 + Math.random() * 1.5; }

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
      speed: 200 + Math.random() * 300,
      color: `hsl(${Math.floor(Math.random() * 60 + 40)}, 90%, 55%)`,
    });
  }

  animate(ts) {
    if(!this.lastTime) this.lastTime = ts;
    const dt = (ts - this.lastTime)/1000;
    this.lastTime = ts;

    this.update(dt);
    this.draw();
    if(this.running) this.rafId = requestAnimationFrame(this.animate);
  }

  update(dt) {
    const gravity = 1500;

    // Spawn orbs
    this.spawnTimer += dt;
    if(this.spawnTimer >= this.nextSpawnAt){
      this.createOrb();
      this.spawnTimer = 0;
      this.nextSpawnAt = this.randomSpawnInterval();
    }

    // Player movement
    if(this.keys["ArrowLeft"] || this.keys["a"]) this.player.x -= 500*dt;
    if(this.keys["ArrowRight"] || this.keys["d"]) this.player.x += 500*dt;
    if((this.keys[" "] || this.keys["Spacebar"]) && this.player.onGround){
      this.player.vy = -600;
      this.player.onGround = false;
    }

    this.player.vy += gravity * dt;
    this.player.y += this.player.vy * dt;

    const groundY = this.canvas.height - 80;
    if(this.player.y + this.player.size > groundY){
      this.player.y = groundY - this.player.size;
      this.player.vy = 0;
      this.player.onGround = true;
    }

    // Orbs + collision
    this.orbs.forEach(orb => {
      orb.y += orb.speed*dt;
      const dx = orb.x - this.player.x;
      const dy = orb.y - this.player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if(dist < orb.size + this.player.size){
        orb.collected = true;
        this.collected++;
        const progressDiv = document.getElementById("progress");
        if(progressDiv) progressDiv.textContent = `Progress: ${this.collected}/${this.targetCollected}`;
      }
    });

    this.orbs = this.orbs.filter(o => o.y < this.canvas.height && !o.collected);

    // Update theme
    this.updateTheme();

    // Win
    if(this.collected >= this.targetCollected){
      this.stop();
      setTimeout(()=>alert("🎉 Journey Complete!"),100);
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,this.bgTopColor);
    g.addColorStop(1,this.bgBottomColor);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // Clouds
    this.clouds.forEach(c => {
      ctx.fillStyle="rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(c.x,c.y,c.rx,c.ry,0,0,Math.PI*2);
      ctx.fill();
      c.x += c.speed*0.016 * this.cloudSpeedMultiplier;
      if(c.x - c.rx > w) c.x = -c.rx;
    });

    // Ground
    ctx.fillStyle = this.sentiment === "sad" ? "#111" : "#2e8b57";
    ctx.fillRect(0,h-80,w,80);

    // Player
    ctx.fillStyle = this.player.color;
    ctx.beginPath();
    ctx.arc(this.player.x,this.player.y,this.player.size,0,Math.PI*2);
    ctx.fill();

    // Orbs
    this.orbs.forEach(o => {
      ctx.beginPath();
      ctx.fillStyle = o.color;
      ctx.arc(o.x,o.y,o.size,0,Math.PI*2);
      ctx.fill();
    });

    // HUD
    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.fillText(`Progress: ${this.collected}/${this.targetCollected}`,20,30);
  }
}