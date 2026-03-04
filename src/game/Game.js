import * as THREE from 'three';
import { Player } from './Player.js';
import { Terrain } from './Terrain.js';
import { TrickSystem } from './TrickSystem.js';
import { InputManager, isTouchDevice } from './InputManager.js';
import { TouchControls } from './TouchControls.js';
import { SnowParticles } from './Particles.js';
import { initFirebase, submitScore, fetchWorldwideScores, getWeekId } from './firebase.js';
import { NicknameManager } from './NicknameManager.js';

export class Game {
  constructor() {
    this.started = false;
    this.state = 'start'; // 'start', 'playing', 'dead', 'finished'
    this.clock = new THREE.Clock();
    this.input = new InputManager();

    // Touch controls for mobile
    this.touchControls = null;
    if (isTouchDevice) {
      document.body.classList.add('touch-device');
      this.touchControls = new TouchControls(this.input);
    }

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();

    this.terrain = new Terrain(this.scene);
    this.player = new Player(this.scene);
    this.tricks = new TrickSystem();
    this.particles = new SnowParticles(this.scene);

    // Mobile: bring camera closer so snowboarder appears bigger on small screens
    if (isTouchDevice) {
      this.cameraOffset = new THREE.Vector3(0, 6, 3.5);
      this.mobileLookDir = new THREE.Vector3(0, -6, -8); // fixed angle relative to camera
      this.baseFOV = 45;
    } else {
      this.cameraOffset = new THREE.Vector3(0, 6, 10);
      this.cameraLookAhead = new THREE.Vector3(0, -2, -20);
      this.baseFOV = 60;
    }
    this.camera.fov = this.baseFOV;
    this.camera.updateProjectionMatrix();
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
      lobbyScreen: document.getElementById('lobby-screen'),
      lobbyDropIn: document.getElementById('lobby-drop-in'),
      finishScreen: document.getElementById('finish-screen'),
      finishScore: document.getElementById('finish-score'),
      finishCatchphrase: document.getElementById('finish-catchphrase'),
      newRecordLabel: document.getElementById('new-record-label'),
      leaderboardEntries: document.getElementById('leaderboard-entries'),
      // Nickname + worldwide leaderboard
      nicknameOverlay: document.getElementById('nickname-overlay'),
      nicknameInput: document.getElementById('nickname-input'),
      nicknameSubmit: document.getElementById('nickname-submit'),
      nicknameError: document.getElementById('nickname-error'),
      lbPlayerName: document.getElementById('leaderboard-player-name'),
      lbWorldwide: document.getElementById('lb-worldwide'),
      lbPersonal: document.getElementById('lb-personal'),
      worldwideEntries: document.getElementById('worldwide-entries'),
      worldwideLoading: document.getElementById('worldwide-loading'),
      worldwideError: document.getElementById('worldwide-error'),
      weekIndicator: document.getElementById('lb-week-indicator'),
    };

    // Leaderboard (localStorage)
    this.leaderboard = this.loadLeaderboard();

    // Firebase and nickname
    this.nicknameManager = new NicknameManager();
    this.firebaseDb = initFirebase();
    this.worldwideScores = [];
    this.activeLeaderboardTab = 'worldwide';

    // Input handlers — Space OR click to start/respawn, ESC for lobby
    this._spaceConsumed = false;

    const handleStart = (e) => {
      if (this.state === 'start') {
        e.preventDefault();
        this.startGame();
      } else if (this.state === 'dead') {
        e.preventDefault();
        this.respawn();
      } else if (this.state === 'finished') {
        e.preventDefault();
        this.restartFromFinish();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') handleStart(e);
      if (e.code === 'Escape') {
        if (this.state === 'dead' || this.state === 'finished') {
          this.openLobby();
        } else if (this.state === 'lobby') {
          this.closeLobby();
        }
      }
    });

    // Click/tap anywhere on start, death, or finish screen
    this.ui.startScreen.style.pointerEvents = 'auto';
    this.ui.startScreen.addEventListener('click', (e) => handleStart(e));
    this.ui.deathScreen.addEventListener('click', (e) => handleStart(e));
    this.ui.finishScreen.addEventListener('click', (e) => {
      // Don't restart if clicking on tab buttons or leaderboard content
      if (e.target.closest('.lb-tab') || e.target.closest('.lb-entries') || e.target.closest('.lb-tab-content')) return;
      handleStart(e);
    });

    // Mobile "CUSTOMIZE" buttons to replace ESC key
    if (isTouchDevice) {
      const deathCustomize = document.getElementById('death-customize-btn');
      if (deathCustomize) {
        deathCustomize.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openLobby();
        });
      }
      const finishCustomize = document.getElementById('finish-customize-btn');
      if (finishCustomize) {
        finishCustomize.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openLobby();
        });
      }
    }

    // Lobby setup
    this.setupLobby();
    this.setupLeaderboardTabs();
    this.setupNickname();

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  startGame() {
    this.ensureNickname(() => {
      this.state = 'playing';
      this.ui.startScreen.style.display = 'none';
      this.clock.start();
      // Consume current Space press so player doesn't ollie on first frame
      this.input.keys['Space'] = false;
      this.input.justPressed['Space'] = false;
      this.input._previousKeys['Space'] = true;
      // Show touch controls on mobile
      if (this.touchControls) this.touchControls.show();
    });
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

  setupLobby() {
    // Color swatch click handling
    document.querySelectorAll('.color-options').forEach(group => {
      const part = group.dataset.part;
      group.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
          // Deselect siblings
          group.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          swatch.classList.add('selected');
          // Apply color to player
          const colorVal = parseInt(swatch.dataset.color);
          this.player.setColor(part, colorVal);
        });
      });
    });

    // Drop In button
    this.ui.lobbyDropIn.addEventListener('click', () => {
      this.closeLobby();
    });
  }

  openLobby() {
    this.state = 'lobby';
    if (this.touchControls) this.touchControls.hide();
    this.ui.deathScreen.classList.remove('active');
    this.ui.finishScreen.classList.remove('active');
    this.ui.newRecordLabel.classList.remove('show');
    this.ui.crashVignette.style.opacity = '0';
    this.ui.lobbyScreen.classList.add('active');
  }

  closeLobby() {
    this.ui.lobbyScreen.classList.remove('active');
    this.fullReset();
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
    const y = pos.y - 0.06; // just above snow surface

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

      // Touch controls update (show/hide air buttons)
      if (this.touchControls) this.touchControls.update(playerState);

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
    } else if (this.state === 'dead' || this.state === 'finished') {
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

        // Finish line reached!
        if (cp.isFinish) {
          this.showFinishScreen();
          return;
        }
      }
    }
  }

  updateCamera(dt, playerState) {
    const speed = playerState.speed;
    const dynamicFOV = this.baseFOV + Math.min(speed * 0.15, 12);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, dynamicFOV, 0.05);
    this.camera.updateProjectionMatrix();

    const mobile = isTouchDevice;
    const speedZoom = Math.min(speed * 0.04, mobile ? 0.8 : 3);
    const offset = this.cameraOffset.clone();
    if (!mobile) offset.y += speedZoom;
    offset.z += speedZoom * (mobile ? 0.5 : 1.5);

    // Pull camera back when airborne for epic view (minimal on mobile)
    if (playerState.isAirborne) {
      const airPull = Math.min(playerState.airTime * 1.5, mobile ? 1.5 : 5);
      if (!mobile) offset.y += airPull * 0.5;
      offset.z += airPull * (mobile ? 0.3 : 1);
    }

    if (playerState.crashed) {
      offset.y += this.deathTimer * 3;
      offset.z += this.deathTimer * 5;
    }

    const targetPos = this.player.position.clone().add(offset);
    const lerpSpeed = mobile ? 0.25 : (playerState.crashed ? 0.02 : 0.06);
    this.currentCameraPos.lerp(targetPos, lerpSpeed);
    this.camera.position.copy(this.currentCameraPos);

    if (mobile) {
      // Look direction relative to CAMERA position — angle stays constant regardless of lerp lag
      const lookTarget = this.camera.position.clone().add(this.mobileLookDir);
      this.camera.lookAt(lookTarget);
    } else {
      const lookTarget = this.player.position.clone().add(this.cameraLookAhead);
      this.camera.lookAt(lookTarget);
    }
  }

  showDeathScreen() {
    this.state = 'dead';
    if (this.touchControls) this.touchControls.hide();
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

    // Show touch controls on mobile
    if (this.touchControls) this.touchControls.show();

    this.player.respawn(this.lastCheckpointPos);
    this.currentCameraPos.copy(
      this.lastCheckpointPos.clone().add(this.cameraOffset)
    );
  }

  showFinishScreen() {
    this.state = 'finished';
    if (this.touchControls) this.touchControls.hide();
    const finalScore = this.tricks.totalScore;

    // Pick a finish catchphrase based on score
    let phrase;
    if (finalScore >= 20000) phrase = 'ABSOLUTELY GODLIKE!';
    else if (finalScore >= 10000) phrase = 'LEGENDARY RUN!';
    else if (finalScore >= 5000) phrase = 'THAT WAS SICK!';
    else if (finalScore >= 2000) phrase = 'SOLID RIDING!';
    else phrase = 'YOU MADE IT!';

    // Save to personal leaderboard and check if new record
    const isNewRecord = this.addToLeaderboard(finalScore);

    this.ui.finishScreen.classList.add('active');
    this.ui.finishScore.textContent = finalScore.toLocaleString();
    this.ui.finishCatchphrase.textContent = phrase;

    if (isNewRecord) {
      this.ui.newRecordLabel.classList.add('show');
    } else {
      this.ui.newRecordLabel.classList.remove('show');
    }

    // Display nickname
    const nick = this.nicknameManager.getNickname();
    this.ui.lbPlayerName.textContent = nick ? `RIDER: ${nick}` : '';

    // Update week indicator
    const weekId = getWeekId();
    const parts = weekId.split('-W');
    this.ui.weekIndicator.textContent = `WEEK ${parseInt(parts[1])} OF ${parts[0]}`;

    // Render personal leaderboard tab
    this.renderLeaderboard(finalScore);

    // Default to worldwide tab
    this.switchLeaderboardTab('worldwide');

    // Submit to Firebase and fetch worldwide scores (async, non-blocking)
    this.submitAndFetchWorldwide(finalScore);
  }

  async submitAndFetchWorldwide(finalScore) {
    const db = this.firebaseDb;
    const nickname = this.nicknameManager.getNickname() || 'ANON';

    // Show loading state
    this.ui.worldwideLoading.style.display = 'block';
    this.ui.worldwideError.style.display = 'none';
    this.ui.worldwideEntries.innerHTML = '';

    // Submit score to Firebase
    await submitScore(db, nickname, finalScore);

    // Fetch worldwide leaderboard
    const scores = await fetchWorldwideScores(db, 20);

    if (scores.length === 0 && !db) {
      // Firebase not available
      this.ui.worldwideLoading.style.display = 'none';
      this.ui.worldwideError.style.display = 'block';
      this.ui.worldwideError.textContent = 'OFFLINE — CHECK CONNECTION';
      return;
    }

    this.ui.worldwideLoading.style.display = 'none';
    this.worldwideScores = scores;
    this.renderWorldwideLeaderboard(finalScore, nickname);
  }

  renderWorldwideLeaderboard(currentScore, currentNickname) {
    const container = this.ui.worldwideEntries;
    container.innerHTML = '';
    const entries = this.worldwideScores.slice(0, 10);
    let currentMarked = false;

    entries.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'leaderboard-entry';

      // Highlight the current player's just-submitted score
      if (!currentMarked && entry.score === currentScore && entry.nickname === currentNickname) {
        div.classList.add('current');
        currentMarked = true;
      }

      const rankSpan = document.createElement('span');
      rankSpan.className = 'lb-rank';
      if (i === 0) rankSpan.classList.add('gold');
      else if (i === 1) rankSpan.classList.add('silver');
      else if (i === 2) rankSpan.classList.add('bronze');
      rankSpan.textContent = `#${i + 1}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'lb-name';
      nameSpan.textContent = entry.nickname || 'ANON';

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'lb-score';
      scoreSpan.textContent = entry.score.toLocaleString();

      const labelSpan = document.createElement('span');
      labelSpan.className = 'lb-label';
      labelSpan.textContent = 'PTS';

      div.appendChild(rankSpan);
      div.appendChild(nameSpan);
      div.appendChild(scoreSpan);
      div.appendChild(labelSpan);
      container.appendChild(div);
    });

    if (entries.length === 0) {
      container.innerHTML = '<div class="lb-loading">NO SCORES THIS WEEK YET</div>';
    }
  }

  restartFromFinish() {
    this.ui.finishScreen.classList.remove('active');
    this.ui.newRecordLabel.classList.remove('show');
    this.fullReset();
  }

  fullReset() {
    this.state = 'playing';
    this.deathTimer = 0;
    this.crashPhraseSet = false;
    this.currentCheckpoint = 0;
    this.ui.deathScreen.classList.remove('active');
    this.ui.finishScreen.classList.remove('active');
    this.ui.crashVignette.style.opacity = '0';

    // Consume Space
    this.input.keys['Space'] = false;
    this.input.justPressed['Space'] = false;
    this.input._previousKeys['Space'] = true;

    // Show touch controls on mobile
    if (this.touchControls) this.touchControls.show();

    // Reset trick score
    this.tricks.totalScore = 0;
    this.tricks.comboMultiplier = 1;
    this.tricks.comboTimer = 0;

    // Reset checkpoints
    for (const cp of this.terrain.checkpoints) {
      cp.reached = false;
    }

    // Respawn player at start
    const startPos = new THREE.Vector3(0, 5, 0);
    this.lastCheckpointPos.copy(startPos);
    this.player.respawn(startPos);
    this.currentCameraPos.copy(startPos.clone().add(this.cameraOffset));

    // Reset trail
    this.trailIndex = 0;
    this.trailCount = 0;
    this.lastTrailPos = null;
    this.trailIndices = [];
    this.trailMesh.geometry.setIndex([]);
  }

  // ---- LEADERBOARD ----

  loadLeaderboard() {
    try {
      const data = localStorage.getItem('shred-summit-leaderboard');
      if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return [];
  }

  saveLeaderboard() {
    try {
      localStorage.setItem('shred-summit-leaderboard', JSON.stringify(this.leaderboard));
    } catch (e) { /* ignore */ }
  }

  addToLeaderboard(score) {
    const entry = { score, date: Date.now() };
    this.leaderboard.push(entry);
    this.leaderboard.sort((a, b) => b.score - a.score);
    // Keep top 10
    if (this.leaderboard.length > 10) this.leaderboard.length = 10;
    this.saveLeaderboard();
    // Check if this score is the new #1
    return this.leaderboard[0].score === score && this.leaderboard[0].date === entry.date;
  }

  renderLeaderboard(currentScore) {
    const container = this.ui.leaderboardEntries;
    container.innerHTML = '';
    const entries = this.leaderboard.slice(0, 5);
    let currentMarked = false;

    entries.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'leaderboard-entry';

      // Highlight current run's entry (first matching score)
      if (!currentMarked && entry.score === currentScore) {
        div.classList.add('current');
        currentMarked = true;
      }

      const rankSpan = document.createElement('span');
      rankSpan.className = 'lb-rank';
      if (i === 0) rankSpan.classList.add('gold');
      else if (i === 1) rankSpan.classList.add('silver');
      else if (i === 2) rankSpan.classList.add('bronze');
      rankSpan.textContent = `#${i + 1}`;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'lb-score';
      scoreSpan.textContent = entry.score.toLocaleString();

      const labelSpan = document.createElement('span');
      labelSpan.className = 'lb-label';
      labelSpan.textContent = 'PTS';

      div.appendChild(rankSpan);
      div.appendChild(scoreSpan);
      div.appendChild(labelSpan);
      container.appendChild(div);
    });

    // If no entries yet (shouldn't happen since we just added one)
    if (entries.length === 0) {
      container.textContent = 'No runs yet!';
    }
  }

  // ---- LEADERBOARD TABS ----

  setupLeaderboardTabs() {
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchLeaderboardTab(tab.dataset.tab);
      });
    });
  }

  switchLeaderboardTab(tabName) {
    this.activeLeaderboardTab = tabName;
    document.querySelectorAll('.lb-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    this.ui.lbWorldwide.classList.toggle('active', tabName === 'worldwide');
    this.ui.lbPersonal.classList.toggle('active', tabName === 'personal');
    this.ui.lbWorldwide.style.display = tabName === 'worldwide' ? 'block' : 'none';
    this.ui.lbPersonal.style.display = tabName === 'personal' ? 'block' : 'none';
    this.ui.weekIndicator.style.display = tabName === 'worldwide' ? 'block' : 'none';
  }

  // ---- NICKNAME ----

  setupNickname() {
    this.ui.nicknameSubmit.addEventListener('click', () => this.submitNickname());
    this.ui.nicknameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') this.submitNickname();
    });
    this.ui.nicknameInput.addEventListener('keyup', (e) => e.stopPropagation());
  }

  submitNickname() {
    const value = this.ui.nicknameInput.value.trim();
    if (!this.nicknameManager.validate(value)) {
      this.ui.nicknameError.textContent = 'USE 3-12 LETTERS, NUMBERS, _ OR -';
      return;
    }
    this.nicknameManager.save(value);
    this.ui.nicknameOverlay.classList.remove('active');
    this.input.disabled = false;
    this.pendingNicknameCallback?.();
    this.pendingNicknameCallback = null;
  }

  ensureNickname(callback) {
    if (this.nicknameManager.hasNickname()) {
      callback();
      return;
    }
    // Show nickname prompt
    this.input.disabled = true;
    this.ui.nicknameOverlay.classList.add('active');
    this.ui.nicknameInput.value = '';
    this.ui.nicknameError.textContent = '';
    setTimeout(() => this.ui.nicknameInput.focus(), 100);
    this.pendingNicknameCallback = callback;
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
    this.ui.checkpoint.textContent = `CHECKPOINT ${this.currentCheckpoint} / 8`;

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
