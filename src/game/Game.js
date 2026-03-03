import * as THREE from 'three';
import { Player } from './Player.js';
import { Terrain } from './Terrain.js';
import { TrickSystem } from './TrickSystem.js';
import { InputManager } from './InputManager.js';
import { SnowParticles } from './Particles.js';

export class Game {
  constructor() {
    this.started = false;
    this.state = 'start'; // 'start', 'playing', 'dead'
    this.clock = new THREE.Clock();
    this.input = new InputManager();

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();

    this.terrain = new Terrain(this.scene);
    this.player = new Player(this.scene);
    this.tricks = new TrickSystem();
    this.particles = new SnowParticles(this.scene);

    this.cameraOffset = new THREE.Vector3(0, 6, 10);
    this.cameraLookAhead = new THREE.Vector3(0, -2, -20);
    this.currentCameraPos = new THREE.Vector3(0, 12, 15);

    // Carve trail system — ribbon mesh that leaves marks in the snow
    this.initCarveTrail();

    // Checkpoint tracking
    this.currentCheckpoint = 0;
    this.lastCheckpointPos = new THREE.Vector3(0, 5, 0);
    this.checkpointAlertTime = 0;

    // Crash state
    this.deathTimer = 0;
    this.deathDelay = 1.0;
    this.crashPhraseSet = false;

    // UI elements
    this.ui = {
      score: document.getElementById('score-display'),
      combo: document.getElementById('combo-display'),
      landingAnnounce: document.getElementById('landing-announce'),
      stompedLabel: document.getElementById('stomped-label'),
      trickName: document.getElementById('trick-name'),
      trickPoints: document.getElementById('trick-points'),
      catchphrase: document.getElementById('catchphrase'),
      jumpHeight: document.getElementById('jump-height'),
      jumpHeightValue: document.getElementById('jump-height-value'),
      speed: document.getElementById('speed-display'),
      meterFill: document.getElementById('trick-meter-fill'),
      startScreen: document.getElementById('start-screen'),
      deathScreen: document.getElementById('death-screen'),
      deathScore: document.getElementById('death-score'),
      crashCatchphrase: document.getElementById('crash-catchphrase'),
      crashVignette: document.getElementById('crash-vignette'),
      altitude: document.getElementById('altitude-display'),
      checkpoint: document.getElementById('checkpoint-display'),
      checkpointAlert: document.getElementById('checkpoint-alert'),
    };

    // Input handlers — Space OR click to start/respawn
    this._spaceConsumed = false; // prevent ollie on first frame after start

    const handleStart = (e) => {
      if (this.state === 'start') {
        e.preventDefault();
        this.startGame();
      } else if (this.state === 'dead') {
        e.preventDefault();
        this.respawn();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') handleStart(e);
    });

    // Click/tap anywhere on start or death screen
    this.ui.startScreen.style.pointerEvents = 'auto';
    this.ui.startScreen.addEventListener('click', (e) => handleStart(e));
    this.ui.deathScreen.addEventListener('click', (e) => handleStart(e));

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  startGame() {
    this.state = 'playing';
    this.ui.startScreen.style.display = 'none';
    this.clock.start();
    // Consume current Space press so player doesn't ollie on first frame
    this.input.keys['Space'] = false;
    this.input.justPressed['Space'] = false;
    this.input._previousKeys['Space'] = true;
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    document.body.appendChild(this.renderer.domElement);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8aafc4);
    this.scene.fog = new THREE.FogExp2(0xbccfe0, 0.003);
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 1200
    );
    this.camera.position.set(0, 12, 15);
  }

  initLights() {
    const ambient = new THREE.AmbientLight(0x8ec8f0, 0.5);
    this.scene.add(ambient);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 250;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0xd0e8f0, 0.5);
    this.scene.add(hemi);

    const rim = new THREE.DirectionalLight(0xaaccee, 0.3);
    rim.position.set(-20, 20, -10);
    this.scene.add(rim);
  }

  initCarveTrail() {
    const MAX_TRAIL = 2000; // max trail segments
    this.trailMax = MAX_TRAIL;
    this.trailIndex = 0;
    this.trailCount = 0;
    this.lastTrailPos = null;

    // Two parallel lines (left and right edge of board)
    const positions = new Float32Array(MAX_TRAIL * 2 * 3); // 2 verts per segment
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([]);

    const material = new THREE.MeshBasicMaterial({
      color: 0xc8dde8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.trailMesh = new THREE.Mesh(geometry, material);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
    this.trailIndices = [];
  }

  updateCarveTrail(playerState) {
    if (!playerState.grounded || playerState.speed < 2) {
      this.lastTrailPos = null;
      return;
    }

    const pos = this.player.position;
    const heading = this.player.heading;

    // Don't add points too close together
    if (this.lastTrailPos) {
      const dx = pos.x - this.lastTrailPos.x;
      const dz = pos.z - this.lastTrailPos.z;
      if (dx * dx + dz * dz < 0.25) return; // min 0.5m between points
    }

    // Board width offset perpendicular to heading
    const halfWidth = 0.2;
    const perpX = Math.cos(heading) * halfWidth;
    const perpZ = -Math.sin(heading) * halfWidth;
    const y = pos.y - 0.3; // just above snow surface

    const positions = this.trailMesh.geometry.attributes.position;
    const i = this.trailIndex;
    const vi = i * 2; // 2 verts per segment

    // Left edge
    positions.setXYZ(vi, pos.x - perpX, y, pos.z - perpZ);
    // Right edge
    positions.setXYZ(vi + 1, pos.x + perpX, y, pos.z + perpZ);

    // Build triangle strip indices connecting to previous segment
    if (this.lastTrailPos !== null) {
      const prev = ((i - 1 + this.trailMax) % this.trailMax) * 2;
      const curr = vi;
      // Two triangles forming a quad between prev and curr
      this.trailIndices.push(prev, prev + 1, curr);
      this.trailIndices.push(curr, prev + 1, curr + 1);

      // Limit indices to prevent unbounded growth
      const maxIndices = this.trailMax * 6;
      if (this.trailIndices.length > maxIndices) {
        this.trailIndices.splice(0, 6); // remove oldest quad
      }
    }

    this.trailMesh.geometry.setIndex(this.trailIndices);
    positions.needsUpdate = true;

    this.trailIndex = (this.trailIndex + 1) % this.trailMax;
    this.trailCount = Math.min(this.trailCount + 1, this.trailMax);
    this.lastTrailPos = { x: pos.x, z: pos.z };
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.state === 'start') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();

    if (this.state === 'playing') {
      const playerState = this.player.update(dt, this.input, this.terrain);
      const trickState = this.tricks.update(dt, playerState);
      this.terrain.update(this.player.position.z);
      this.particles.update(dt);

      // Carve trail
      this.updateCarveTrail(playerState);

      // Snow spray
      if (playerState.grounded && playerState.speed > 5) {
        const sprayCount = Math.ceil(playerState.speed * 0.12);
        this.particles.emit(this.player.position, this.player.velocity, sprayCount);
      }

      // Checkpoints
      this.updateCheckpoints();

      // Crash
      if (playerState.crashed) {
        this.deathTimer += dt;
        this.ui.crashVignette.style.opacity = Math.min(this.deathTimer * 2, 1).toString();

        // Set crash phrase once
        if (!this.crashPhraseSet) {
          this.tricks.pickCrashPhrase();
          this.crashPhraseSet = true;
        }

        if (this.deathTimer >= this.deathDelay) {
          this.showDeathScreen();
        }
      } else {
        this.ui.crashVignette.style.opacity = '0';
        this.crashPhraseSet = false;
      }

      // Camera
      this.updateCamera(dt, playerState);

      // Shadow follows player
      this.sun.position.set(
        this.player.position.x + 30,
        this.player.position.y + 50,
        this.player.position.z + 20
      );
      this.sun.target.position.copy(this.player.position);
      this.sun.target.updateMatrixWorld();

      // UI
      this.updateUI(trickState, playerState);
    } else if (this.state === 'dead') {
      this.particles.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateCheckpoints() {
    for (const cp of this.terrain.checkpoints) {
      if (!cp.reached && this.player.position.z < cp.z) {
        cp.reached = true;
        this.lastCheckpointPos.copy(cp.position);
        this.currentCheckpoint++;
        this.checkpointAlertTime = performance.now();
        this.tricks.totalScore += 500 * this.currentCheckpoint;
      }
    }
  }

  updateCamera(dt, playerState) {
    const speed = playerState.speed;
    const dynamicFOV = 60 + Math.min(speed * 0.15, 12);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, dynamicFOV, 0.05);
    this.camera.updateProjectionMatrix();

    const speedZoom = Math.min(speed * 0.04, 3);
    const offset = this.cameraOffset.clone();
    offset.y += speedZoom;
    offset.z += speedZoom * 1.5;

    // Pull camera back when airborne for epic view
    if (playerState.isAirborne) {
      const airPull = Math.min(playerState.airTime * 1.5, 5);
      offset.y += airPull * 0.5;
      offset.z += airPull;
    }

    if (playerState.crashed) {
      offset.y += this.deathTimer * 3;
      offset.z += this.deathTimer * 5;
    }

    const targetPos = this.player.position.clone().add(offset);
    this.currentCameraPos.lerp(targetPos, playerState.crashed ? 0.02 : 0.06);
    this.camera.position.copy(this.currentCameraPos);

    const lookTarget = this.player.position.clone().add(this.cameraLookAhead);
    this.camera.lookAt(lookTarget);
  }

  showDeathScreen() {
    this.state = 'dead';
    this.ui.deathScreen.classList.add('active');
    this.ui.deathScore.textContent = this.tricks.totalScore.toLocaleString();
    this.ui.crashCatchphrase.textContent = this.tricks.crashPhrase;
  }

  respawn() {
    this.state = 'playing';
    this.deathTimer = 0;
    this.crashPhraseSet = false;
    this.ui.deathScreen.classList.remove('active');
    this.ui.crashVignette.style.opacity = '0';

    // Consume Space so player doesn't ollie on respawn
    this.input.keys['Space'] = false;
    this.input.justPressed['Space'] = false;
    this.input._previousKeys['Space'] = true;

    this.player.respawn(this.lastCheckpointPos);
    this.currentCameraPos.copy(
      this.lastCheckpointPos.clone().add(this.cameraOffset)
    );
  }

  updateUI(trickState, playerState) {
    // Score
    this.ui.score.textContent = trickState.score.toLocaleString();

    // Speed
    const kmh = Math.round(playerState.speed * 3.6);
    this.ui.speed.textContent = kmh;

    // Altitude
    const alt = Math.round(2400 + this.player.position.y * 0.5);
    this.ui.altitude.textContent = `ALT ${alt}m`;

    // Checkpoint
    this.ui.checkpoint.textContent = `CHECKPOINT ${this.currentCheckpoint}`;

    // Checkpoint alert
    const timeSinceCP = performance.now() - this.checkpointAlertTime;
    if (timeSinceCP < 2000) {
      this.ui.checkpointAlert.style.opacity = timeSinceCP < 1500 ? '1' : String(1 - (timeSinceCP - 1500) / 500);
      this.ui.checkpointAlert.textContent = `CHECKPOINT ${this.currentCheckpoint} — +${500 * this.currentCheckpoint} PTS`;
    } else {
      this.ui.checkpointAlert.style.opacity = '0';
    }

    // Combo
    if (trickState.combo > 1 && trickState.comboTimer > 0) {
      this.ui.combo.style.opacity = '1';
      this.ui.combo.textContent = `${trickState.combo.toFixed(1)}x COMBO`;
    } else {
      this.ui.combo.style.opacity = '0';
    }

    // Jump height (show while airborne)
    if (playerState.isAirborne && playerState.jumpHeightFeet > 3) {
      this.ui.jumpHeight.style.opacity = '1';
      this.ui.jumpHeightValue.textContent = playerState.jumpHeightFeet;
    } else {
      this.ui.jumpHeight.style.opacity = '0';
    }

    // Landing trick announcement (unified container with pop animation)
    const timeSinceTrick = performance.now() - trickState.lastTrickTime;
    if (timeSinceTrick < 3000 && trickState.lastTrick) {
      // Set content
      this.ui.trickName.textContent = trickState.lastTrick;
      this.ui.trickPoints.textContent = `+${trickState.lastTrickPoints} PTS`;

      // Catchphrase (appears slightly after trick name)
      if (trickState.catchphrase && timeSinceTrick > 150) {
        this.ui.catchphrase.textContent = trickState.catchphrase;
        this.ui.catchphrase.style.opacity = '1';
      } else {
        this.ui.catchphrase.style.opacity = '0';
      }

      // Show container with pop animation on first frame, fade out at end
      if (timeSinceTrick < 100) {
        // Trigger pop-in animation
        this.ui.landingAnnounce.classList.remove('fade-out');
        this.ui.landingAnnounce.classList.remove('show');
        void this.ui.landingAnnounce.offsetWidth; // force reflow for re-trigger
        this.ui.landingAnnounce.classList.add('show');
      } else if (timeSinceTrick > 2400) {
        // Fade out
        this.ui.landingAnnounce.classList.remove('show');
        this.ui.landingAnnounce.classList.add('fade-out');
      }
    } else {
      this.ui.landingAnnounce.classList.remove('show');
      this.ui.landingAnnounce.classList.add('fade-out');
    }

    // Trick meter
    this.ui.meterFill.style.width = `${trickState.trickMeter * 100}%`;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
