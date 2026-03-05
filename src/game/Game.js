import * as THREE from 'three';
import { Player } from './Player.js';
import { Terrain } from './Terrain.js';
import { TrickSystem } from './TrickSystem.js';
import { InputManager, isTouchDevice } from './InputManager.js';
import { TouchControls } from './TouchControls.js';
import { SnowParticles } from './Particles.js';
import { initFirebase, isFirebaseConfigured, submitScore, fetchWorldwideScores, getWeekId, getFirebaseAuth, createAccount, loginAccount, logoutAccount, onAuthChange, cloudSaveProgress, cloudLoadProgress } from './firebase.js';
import { NicknameManager } from './NicknameManager.js';
import { QuestSystem } from './QuestSystem.js';
import { ShopSystem } from './ShopSystem.js';
import { RidePass } from './RidePass.js';

export class Game {
  constructor() {
    this.started = false;
    this.state = isFirebaseConfigured() ? 'auth' : 'start'; // 'auth', 'start', 'playing', 'dead', 'finished'
    this.currentUser = null; // Firebase user object
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
    this.selectedEquipment = 'snowboard';
    this.player = new Player(this.scene, this.selectedEquipment);
    this.tricks = new TrickSystem();
    this.quests = new QuestSystem();
    this.ridePass = new RidePass();
    this.shop = new ShopSystem(this.ridePass);
    this.activeShopTab = 'jacket';
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
    this.checkpointScore = 0; // score saved at last checkpoint

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
      customizePanel: document.getElementById('customize-panel'),
      customizeBack: document.getElementById('customize-back'),
      lobbyCustomize: document.getElementById('lobby-customize'),
      lobbyQuests: document.getElementById('lobby-quests'),
      questsPanel: document.getElementById('quests-panel'),
      questList: document.getElementById('quest-list'),
      questsBack: document.getElementById('quests-back'),
      questXpLabel: document.getElementById('quest-xp-label'),
      shopPanel: document.getElementById('shop-panel'),
      shopBack: document.getElementById('shop-back'),
      lobbyShop: document.getElementById('lobby-shop'),
      shopItemList: document.getElementById('shop-item-list'),
      shopS1Count: document.getElementById('shop-s1-count'),
      shopS2Count: document.getElementById('shop-s2-count'),
      shopS3Count: document.getElementById('shop-s3-count'),
      shopBoardCount: document.getElementById('shop-board-count'),
      ridepassPanel: document.getElementById('ridepass-panel'),
      ridepassBack: document.getElementById('ridepass-back'),
      lobbyRidepass: document.getElementById('lobby-ridepass'),
      rpLevelList: document.getElementById('rp-level-list'),
      rpLevelLabel: document.getElementById('rp-level-label'),
      rpProgressFill: document.getElementById('rp-progress-fill'),
      rpXpLabel: document.getElementById('rp-xp-label'),
      rpS1Count: document.getElementById('rp-s1-count'),
      rpS2Count: document.getElementById('rp-s2-count'),
      rpBoardCount: document.getElementById('rp-board-count'),
      rpTitleSection: document.getElementById('rp-title-section'),
      rpTitleOptions: document.getElementById('rp-title-options'),
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
      // Auth
      authScreen: document.getElementById('auth-screen'),
      authEmail: document.getElementById('auth-email'),
      authPassword: document.getElementById('auth-password'),
      authLoginBtn: document.getElementById('auth-login-btn'),
      authSignupBtn: document.getElementById('auth-signup-btn'),
      authError: document.getElementById('auth-error'),
      authLoading: document.getElementById('auth-loading'),
      lobbyLogout: document.getElementById('lobby-logout'),
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
      // Request fullscreen on mobile for immersive experience
      if (isTouchDevice && !document.fullscreenElement) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
      }
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
      // Don't intercept keys when typing in form inputs
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
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

    // Auth + cloud save setup
    this.setupAuth();
    this.setupCloudSaveHooks();

    // Lobby setup
    this.setupLobby();
    this.setupLeaderboardTabs();
    this.setupNickname();

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupAuth() {
    if (!isFirebaseConfigured()) {
      // No Firebase — skip auth, go straight to start screen
      this.ui.startScreen.style.display = '';
      if (this.ui.lobbyLogout) this.ui.lobbyLogout.style.display = 'none';
      return;
    }

    // Hide start screen until auth completes
    this.ui.startScreen.style.display = 'none';
    this.ui.authScreen.classList.add('active');
    this.input.disabled = true; // Let keyboard input go to auth fields

    // Auth buttons
    const doAuth = async (action) => {
      const email = this.ui.authEmail.value.trim();
      const password = this.ui.authPassword.value;
      this.ui.authError.textContent = '';
      if (!email || !password) {
        this.ui.authError.textContent = 'ENTER EMAIL AND PASSWORD';
        return;
      }
      if (password.length < 6) {
        this.ui.authError.textContent = 'PASSWORD MUST BE 6+ CHARACTERS';
        return;
      }
      this.setAuthLoading(true);
      try {
        if (action === 'signup') {
          await createAccount(email, password);
        } else {
          await loginAccount(email, password);
        }
        // onAuthStateChanged will handle the rest
      } catch (e) {
        this.setAuthLoading(false);
        const msg = e.code || e.message || 'AUTH FAILED';
        const friendly = {
          'auth/email-already-in-use': 'EMAIL ALREADY IN USE',
          'auth/invalid-email': 'INVALID EMAIL',
          'auth/user-not-found': 'NO ACCOUNT WITH THAT EMAIL',
          'auth/wrong-password': 'WRONG PASSWORD',
          'auth/invalid-credential': 'INVALID EMAIL OR PASSWORD',
          'auth/too-many-requests': 'TOO MANY ATTEMPTS, TRY LATER',
          'auth/weak-password': 'PASSWORD TOO WEAK (6+ CHARS)',
        };
        this.ui.authError.textContent = friendly[msg] || msg.toUpperCase();
      }
    };

    this.ui.authLoginBtn.addEventListener('click', () => doAuth('login'));
    this.ui.authSignupBtn.addEventListener('click', () => doAuth('signup'));
    this.ui.authPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAuth('login');
    });

    // Logout button
    this.ui.lobbyLogout.addEventListener('click', async () => {
      await logoutAccount();
      // onAuthChange will handle showing auth screen
    });

    // Listen for auth state changes
    onAuthChange(async (user) => {
      if (user) {
        this.currentUser = user;
        await this.onAuthSuccess(user);
      } else {
        this.currentUser = null;
        this.onLogout();
      }
    });
  }

  setAuthLoading(loading) {
    this.ui.authLoginBtn.disabled = loading;
    this.ui.authSignupBtn.disabled = loading;
    this.ui.authLoading.style.display = loading ? 'block' : 'none';
    this.ui.authEmail.disabled = loading;
    this.ui.authPassword.disabled = loading;
  }

  async onAuthSuccess(user) {
    this.setAuthLoading(false);

    // Load cloud data
    const cloudData = await cloudLoadProgress(user.uid);
    if (cloudData) {
      if (cloudData.nickname) this.nicknameManager.setData(cloudData.nickname);
      if (cloudData.shop) this.shop.setData(cloudData.shop);
      if (cloudData.ridePass) this.ridePass.setData(cloudData.ridePass);
      if (cloudData.quests) this.quests.setData(cloudData.quests);
      if (cloudData.leaderboard) {
        this.leaderboard = cloudData.leaderboard;
        try { localStorage.setItem('shred-summit-leaderboard', JSON.stringify(this.leaderboard)); } catch (e) { /* ignore */ }
      }
    } else {
      // First login — upload existing localStorage data to cloud
      this.cloudSaveAll();
    }

    // Transition to start screen
    this.ui.authScreen.classList.remove('active');
    this.ui.startScreen.style.display = '';
    this.input.disabled = false;
    this.state = 'start';
  }

  onLogout() {
    this.state = 'auth';
    this.input.disabled = true;
    this.ui.startScreen.style.display = 'none';
    this.ui.lobbyScreen.style.display = 'none';
    this.ui.deathScreen.style.display = 'none';
    this.ui.finishScreen.style.display = 'none';
    this.ui.authScreen.classList.add('active');
    this.ui.authEmail.value = '';
    this.ui.authPassword.value = '';
    this.ui.authError.textContent = '';
    this.setAuthLoading(false);
  }

  setupCloudSaveHooks() {
    if (!isFirebaseConfigured()) return;
    const save = () => this.cloudSaveAll();
    this.shop.onSave = save;
    this.ridePass.onSave = save;
    this.quests.onSave = save;
    this.nicknameManager.onSave = save;
  }

  cloudSaveAll() {
    if (!this.currentUser) return;
    const data = {
      nickname: this.nicknameManager.getNickname(),
      shop: this.shop.data,
      ridePass: this.ridePass.data,
      quests: this.quests.data,
      leaderboard: this.leaderboard,
    };
    cloudSaveProgress(this.currentUser.uid, data);
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

    // Equipment toggle (snowboard / skis)
    document.querySelectorAll('.equipment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.equipment-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const newType = btn.dataset.equipment;
        if (newType !== this.selectedEquipment) {
          this.selectedEquipment = newType;
          // Save current colors from lobby swatches
          const savedColors = {};
          document.querySelectorAll('.color-options').forEach(group => {
            const part = group.dataset.part;
            const sel = group.querySelector('.color-swatch.selected');
            if (sel) savedColors[part] = parseInt(sel.dataset.color);
          });
          // Rebuild player with new equipment
          this.scene.remove(this.player.group);
          this.player = new Player(this.scene, this.selectedEquipment);
          // Re-apply saved colors then shop items
          for (const [part, color] of Object.entries(savedColors)) {
            this.player.setColor(part, color);
          }
          this.applyEquippedItems();
          // Update "Board"/"Skis" label
          const boardRow = document.querySelector('[data-part="board"]');
          if (boardRow) {
            boardRow.closest('.lobby-row').querySelector('label').textContent =
              this.selectedEquipment === 'ski' ? 'Skis' : 'Board';
          }
        }
      });
    });

    // Drop In button
    this.ui.lobbyDropIn.addEventListener('click', () => {
      this.closeLobby();
    });

    // Customize button → open customize panel
    this.ui.lobbyCustomize.addEventListener('click', () => {
      this.ui.customizePanel.classList.add('active');
    });

    // Back button → close customize panel
    this.ui.customizeBack.addEventListener('click', () => {
      this.ui.customizePanel.classList.remove('active');
    });

    // Quests button → open quests panel
    this.ui.lobbyQuests.addEventListener('click', () => {
      this.activeQuestTab = 'daily';
      document.querySelectorAll('.quest-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === 'daily')
      );
      this.renderQuestList('daily');
      this.ui.questsPanel.classList.add('active');
    });

    // Quests back button
    this.ui.questsBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.questsPanel.classList.remove('active');
    });

    // Shop button → open shop panel
    this.ui.lobbyShop.addEventListener('click', () => {
      this.openShopPanel();
    });

    // Shop panel — block clicks
    this.ui.shopPanel.addEventListener('click', (e) => e.stopPropagation());

    // Shop back button
    this.ui.shopBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.shopPanel.classList.remove('active');
    });

    // Shop tab switching
    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeShopTab = tab.dataset.shopTab;
        document.querySelectorAll('.shop-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.shopTab === this.activeShopTab)
        );
        this.renderShopItems(this.activeShopTab);
      });
    });

    // Ride Pass button → open ridepass panel
    this.ui.lobbyRidepass.addEventListener('click', () => {
      this.openRidePassPanel();
    });

    // Panels — block clicks from reaching lobby buttons underneath
    this.ui.ridepassPanel.addEventListener('click', (e) => e.stopPropagation());
    this.ui.questsPanel.addEventListener('click', (e) => e.stopPropagation());

    // Ride Pass back button
    this.ui.ridepassBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.ridepassPanel.classList.remove('active');
    });

    // Quest tab switching
    document.querySelectorAll('.quest-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeQuestTab = tab.dataset.tab;
        document.querySelectorAll('.quest-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.tab === this.activeQuestTab)
        );
        this.renderQuestList(this.activeQuestTab);
      });
    });
  }

  openLobby() {
    this.state = 'lobby';
    if (this.touchControls) this.touchControls.hide();
    this.ui.deathScreen.classList.remove('active');
    this.ui.finishScreen.classList.remove('active');
    this.ui.newRecordLabel.classList.remove('show');
    this.ui.crashVignette.style.opacity = '0';
    this.ui.customizePanel.classList.remove('active');
    this.ui.questsPanel.classList.remove('active');
    this.ui.ridepassPanel.classList.remove('active');
    this.ui.shopPanel.classList.remove('active');
    this.ui.lobbyScreen.classList.add('active');
    this.player.cleanupDebris();
    this.player.boardGroup.visible = true;
    this.applyEquippedItems();
    this.setupLobbyScene();
  }

  closeLobby() {
    this.teardownLobbyScene();
    this.ui.lobbyScreen.classList.remove('active');
    this.applyEquippedItems();
    this.fullReset();
  }

  initCarveTrail() {
    const MAX_TRAIL = 2000;
    this.trailMax = MAX_TRAIL;

    const material = new THREE.MeshBasicMaterial({
      color: 0xc8dde8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    // Trail 1 (snowboard single trail, or ski left trail)
    this.trail1 = this._createTrailMesh(MAX_TRAIL, material);
    // Trail 2 (ski right trail only)
    this.trail2 = this._createTrailMesh(MAX_TRAIL, material);
    this.trail2.mesh.visible = false;
  }

  _createTrailMesh(maxSegs, material) {
    const positions = new Float32Array(maxSegs * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, indices: [], index: 0, count: 0, lastPos: null };
  }

  _resetTrail(trail) {
    trail.index = 0;
    trail.count = 0;
    trail.lastPos = null;
    trail.indices = [];
    trail.mesh.geometry.setIndex([]);
  }

  updateCarveTrail(playerState) {
    if (!playerState.grounded || playerState.speed < 2) {
      this.trail1.lastPos = null;
      this.trail2.lastPos = null;
      return;
    }

    const pos = this.player.position;
    const heading = this.player.heading;

    // Don't add points too close together
    if (this.trail1.lastPos) {
      const dx = pos.x - this.trail1.lastPos.x;
      const dz = pos.z - this.trail1.lastPos.z;
      if (dx * dx + dz * dz < 0.25) return;
    }

    const perpX = Math.cos(heading);
    const perpZ = -Math.sin(heading);
    const y = pos.y - 0.06;

    if (this.selectedEquipment === 'ski') {
      // Two separate ski trails with gap between them
      const skiSpacing = 0.18; // distance from center to each ski
      const skiWidth = 0.06;   // narrow ski edge width
      this.trail2.mesh.visible = true;

      // Left ski
      const lx = pos.x - perpX * skiSpacing;
      const lz = pos.z - perpZ * skiSpacing;
      this._addTrailSegment(this.trail1, lx, y, lz, perpX * skiWidth, perpZ * skiWidth);

      // Right ski
      const rx = pos.x + perpX * skiSpacing;
      const rz = pos.z + perpZ * skiSpacing;
      this._addTrailSegment(this.trail2, rx, y, rz, perpX * skiWidth, perpZ * skiWidth);
    } else {
      // Single snowboard trail
      const halfWidth = 0.2;
      this.trail2.mesh.visible = false;
      this._addTrailSegment(this.trail1, pos.x, y, pos.z, perpX * halfWidth, perpZ * halfWidth);
    }

    this.trail1.lastPos = { x: pos.x, z: pos.z };
    this.trail2.lastPos = { x: pos.x, z: pos.z };
  }

  _addTrailSegment(trail, cx, y, cz, offX, offZ) {
    const positions = trail.mesh.geometry.attributes.position;
    const i = trail.index;
    const vi = i * 2;

    positions.setXYZ(vi, cx - offX, y, cz - offZ);
    positions.setXYZ(vi + 1, cx + offX, y, cz + offZ);

    if (trail.lastPos !== null) {
      const prev = ((i - 1 + this.trailMax) % this.trailMax) * 2;
      const curr = vi;
      trail.indices.push(prev, prev + 1, curr);
      trail.indices.push(curr, prev + 1, curr + 1);

      const maxIndices = this.trailMax * 6;
      if (trail.indices.length > maxIndices) {
        trail.indices.splice(0, 6);
      }
    }

    trail.mesh.geometry.setIndex(trail.indices);
    positions.needsUpdate = true;

    trail.index = (trail.index + 1) % this.trailMax;
    trail.count = Math.min(trail.count + 1, this.trailMax);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.state === 'auth' || this.state === 'start') {
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

      // Quest tracking — consume scored tricks/grinds
      if (this.tricks.lastScoredTrick) {
        this.quests.onTrickLanded(this.tricks.lastScoredTrick);
        this.tricks.lastScoredTrick = null;
      }
      if (this.tricks.lastScoredGrind) {
        this.quests.onGrind(this.tricks.lastScoredGrind.type, this.tricks.lastScoredGrind.duration);
        this.tricks.lastScoredGrind = null;
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
          // Snow burst at crash point
          this.particles.emit(this.player.position, { x: 0, y: 5, z: 0 }, 80);
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
    } else if (this.state === 'lobby') {
      this.updateLobby(dt);
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
        this.checkpointScore = this.tricks.totalScore;

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

    // Restore score to checkpoint value
    this.tricks.totalScore = this.checkpointScore;

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

    // Track quest: run complete
    this.quests.onRunComplete(finalScore);

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

    // Submit score to Firebase (include ride pass title)
    const title = this.ridePass.getSelectedTitle();
    await submitScore(db, nickname, finalScore, title);

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

      const nameWrap = document.createElement('span');
      nameWrap.className = 'lb-name';
      const nameText = document.createElement('span');
      nameText.textContent = entry.nickname || 'ANON';
      nameWrap.appendChild(nameText);
      if (entry.title) {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'lb-title';
        titleSpan.textContent = entry.title;
        nameWrap.appendChild(titleSpan);
      }

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'lb-score';
      scoreSpan.textContent = entry.score.toLocaleString();

      const labelSpan = document.createElement('span');
      labelSpan.className = 'lb-label';
      labelSpan.textContent = 'PTS';

      div.appendChild(rankSpan);
      div.appendChild(nameWrap);
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

    // Reset trick score and quest run tracking
    this.tricks.totalScore = 0;
    this.checkpointScore = 0;
    this.quests.onRunStart();
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
    this._resetTrail(this.trail1);
    this._resetTrail(this.trail2);
  }

  // ---- 3D LOBBY SCENE ----

  setupLobbyScene() {
    this.lobbyGroup = new THREE.Group();
    this.lobbyTime = 0;

    // Position the lobby scene at the player's current location
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const terrainY = this.terrain.getHeightAt(px, pz);
    const groundY = terrainY + 0.05;

    // Place campfire in front of the player (in -Z direction which is downhill)
    const fireX = px;
    const fireZ = pz - 1.8;
    const fireY = this.terrain.getHeightAt(fireX, fireZ) + 0.05;

    // === CAMPFIRE ===
    const firePit = new THREE.Group();
    firePit.position.set(fireX, fireY, fireZ);
    this.lobbyGroup.add(firePit);

    // Stone ring
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stone = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 4, 3),
        stoneMat
      );
      stone.position.set(Math.cos(angle) * 0.35, 0, Math.sin(angle) * 0.35);
      stone.scale.set(1, 0.6, 1);
      firePit.add(stone);
    }

    // Logs in teepee arrangement
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.035, 0.6, 5),
        logMat
      );
      log.position.set(Math.cos(angle) * 0.08, 0.25, Math.sin(angle) * 0.08);
      log.rotation.z = 0.3;
      log.rotation.y = angle;
      firePit.add(log);
    }

    // Flame cones (animated)
    this.lobbyFlames = [];
    const flameMat1 = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const flameMat3 = new THREE.MeshBasicMaterial({ color: 0xffdd33 });

    const flameMats = [flameMat1, flameMat2, flameMat3];
    const flameHeights = [0.4, 0.3, 0.25];
    const flameRadii = [0.12, 0.08, 0.06];

    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(flameRadii[i], flameHeights[i], 5),
        flameMats[i]
      );
      flame.position.set(
        (Math.random() - 0.5) * 0.08,
        0.15 + i * 0.05,
        (Math.random() - 0.5) * 0.08
      );
      firePit.add(flame);
      this.lobbyFlames.push(flame);
    }

    // Embers glow on the ground
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const ember = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 8),
      emberMat
    );
    ember.rotation.x = -Math.PI / 2;
    ember.position.y = 0.02;
    firePit.add(ember);

    // Fire point light
    this.lobbyFireLight = new THREE.PointLight(0xff8833, 2.5, 10);
    this.lobbyFireLight.position.set(fireX, fireY + 0.5, fireZ);
    this.lobbyGroup.add(this.lobbyFireLight);

    // Dim ambient for cozy feel
    this.lobbyAmbient = new THREE.AmbientLight(0x334455, 0.3);
    this.lobbyGroup.add(this.lobbyAmbient);

    // === SITTING LOG ===
    const sittingLog = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 1.4, 8),
      logMat
    );
    sittingLog.rotation.z = Math.PI / 2;
    sittingLog.position.set(px, groundY + 0.15, pz);
    this.lobbyGroup.add(sittingLog);

    // === PROP BOARD (leaning against a rock) ===
    const boardPropMat = this.player.boardMat;
    if (this.selectedEquipment === 'ski') {
      // Two skis leaning
      for (const dx of [-0.08, 0.08]) {
        const ski = new THREE.Mesh(
          new THREE.BoxGeometry(0.10, 0.035, 1.2),
          boardPropMat
        );
        ski.position.set(px + 1.0 + dx, groundY + 0.6, pz - 0.5);
        ski.rotation.x = -0.3;
        ski.rotation.z = 0.15;
        this.lobbyGroup.add(ski);
      }
    } else {
      const boardProp = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.05, 1.5),
        boardPropMat
      );
      boardProp.position.set(px + 1.0, groundY + 0.6, pz - 0.3);
      boardProp.rotation.x = -0.3;
      boardProp.rotation.z = 0.25;
      this.lobbyGroup.add(boardProp);
    }

    // === A couple rocks for scenery ===
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
    const rock1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 5, 4), rockMat);
    rock1.scale.set(1, 0.6, 0.8);
    rock1.position.set(px + 0.9, groundY + 0.1, pz - 0.4);
    this.lobbyGroup.add(rock1);

    const rock2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 3), rockMat);
    rock2.scale.set(1, 0.5, 1.2);
    rock2.position.set(fireX - 0.6, fireY + 0.05, fireZ + 0.3);
    this.lobbyGroup.add(rock2);

    this.scene.add(this.lobbyGroup);

    // === POSE THE PLAYER ===
    // Position player so hips land on the sitting log top
    // Log top ≈ groundY + 0.30; hip joint is at riderGroup.y + 0.55 in local space
    this.player.group.position.set(px, groundY - 0.25, pz);
    this.player.group.rotation.set(0, Math.PI + 0.4, 0); // Face toward fire
    this.player.setSittingPose();
    this.player.setBoardVisible(false);

    // === CAMERA ===
    // Store the lobby focus point (midpoint between player and fire)
    this.lobbyCenterX = (px + fireX) / 2;
    this.lobbyCenterY = groundY + 0.8;
    this.lobbyCenterZ = (pz + fireZ) / 2;
    this.lobbyCamDist = 3.5;
    this.lobbyCamHeight = 1.8;
    this.lobbyCamAngle = 0.5; // Starting angle

    // Save original scene settings to restore later
    this._origBg = this.scene.background.clone();
    this._origFog = this.scene.fog ? { color: this.scene.fog.color.clone(), density: this.scene.fog.density } : null;

    // Darken scene for evening/campfire mood
    this.scene.background = new THREE.Color(0x0a1628);
    if (this.scene.fog) {
      this.scene.fog.color.set(0x0a1628);
      this.scene.fog.density = 0.008;
    }
  }

  teardownLobbyScene() {
    if (!this.lobbyGroup) return;

    // Remove lobby objects
    this.lobbyGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.dispose) child.material.dispose();
      }
    });
    this.scene.remove(this.lobbyGroup);
    this.lobbyGroup = null;
    this.lobbyFlames = null;
    this.lobbyFireLight = null;
    this.lobbyAmbient = null;

    // Restore scene settings
    if (this._origBg) this.scene.background.copy(this._origBg);
    if (this._origFog && this.scene.fog) {
      this.scene.fog.color.copy(this._origFog.color);
      this.scene.fog.density = this._origFog.density;
    }

    // Restore player board
    this.player.setBoardVisible(true);
  }

  updateLobby(dt) {
    this.lobbyTime += dt;

    // Animate flames
    if (this.lobbyFlames) {
      for (let i = 0; i < this.lobbyFlames.length; i++) {
        const flame = this.lobbyFlames[i];
        const t = this.lobbyTime * 3 + i * 2.1;
        flame.scale.x = 0.8 + Math.sin(t) * 0.3;
        flame.scale.y = 0.7 + Math.sin(t * 1.3 + 0.5) * 0.4;
        flame.scale.z = 0.8 + Math.cos(t * 0.9) * 0.3;
        flame.position.y = 0.15 + i * 0.05 + Math.sin(t * 1.5) * 0.03;
      }
    }

    // Flicker fire light
    if (this.lobbyFireLight) {
      this.lobbyFireLight.intensity = 2.5 + Math.sin(this.lobbyTime * 5) * 0.5
        + Math.sin(this.lobbyTime * 7.3) * 0.3;
    }

    // Gentle camera orbit
    this.lobbyCamAngle += dt * 0.08;
    const camX = this.lobbyCenterX + Math.sin(this.lobbyCamAngle) * this.lobbyCamDist;
    const camZ = this.lobbyCenterZ + Math.cos(this.lobbyCamAngle) * this.lobbyCamDist;
    const camY = this.lobbyCenterY + this.lobbyCamHeight + Math.sin(this.lobbyTime * 0.3) * 0.1;

    this.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.03);
    this.camera.lookAt(this.lobbyCenterX, this.lobbyCenterY, this.lobbyCenterZ);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 50, 0.05);
    this.camera.updateProjectionMatrix();

    // Keep rendering shadows near the scene
    this.sun.position.set(
      this.lobbyCenterX + 5,
      this.lobbyCenterY + 15,
      this.lobbyCenterZ + 5
    );
    this.sun.target.position.set(this.lobbyCenterX, this.lobbyCenterY, this.lobbyCenterZ);
    this.sun.target.updateMatrixWorld();
  }

  // ---- QUEST RENDERING ----

  renderQuestList(tab) {
    this.quests.checkDailyReset();
    const quests = tab === 'daily' ? this.quests.getDailyQuests() : this.quests.getSeasonQuests();
    this.ui.questXpLabel.textContent = `${this.quests.getTotalXP()} XP`;

    this.ui.questList.innerHTML = quests.map(q => {
      const pct = Math.min((q.current / q.target) * 100, 100);
      const cls = q.completed ? 'quest-item completed' : 'quest-item';
      const progressText = q.completed ? 'COMPLETE' : `${Math.floor(q.current)} / ${q.target}`;
      return `<div class="${cls}">
        <div class="quest-item-info">
          <div class="quest-item-desc">${q.desc}</div>
          <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
          <div class="quest-progress-text">${progressText}</div>
        </div>
        <div class="quest-xp-badge">${q.completed ? '' : q.xp + ' XP'}</div>
        <div class="quest-check">&check;</div>
      </div>`;
    }).join('');
  }

  // ---- RIDE PASS ----

  openRidePassPanel() {
    const totalXP = this.quests.getTotalXP();
    this.ridePass.claimAvailable(totalXP);

    const level = this.ridePass.getLevel(totalXP);
    const progress = this.ridePass.getLevelProgress(totalXP);
    const xpPerLevel = this.ridePass.getXPPerLevel();
    const tokens = this.ridePass.getTokens();

    // Header
    this.ui.rpLevelLabel.textContent = level >= 60 ? 'LEVEL 60 — MAX' : `LEVEL ${level}`;
    const pct = level >= 60 ? 100 : (progress / xpPerLevel) * 100;
    this.ui.rpProgressFill.style.width = `${pct}%`;
    this.ui.rpXpLabel.textContent = level >= 60 ? `${xpPerLevel} / ${xpPerLevel} XP` : `${progress} / ${xpPerLevel} XP`;

    // Tokens
    this.ui.rpS1Count.textContent = tokens.steezeL1;
    this.ui.rpS2Count.textContent = tokens.steezeL2;
    this.ui.rpBoardCount.textContent = tokens.board;

    this.renderRidePassLevels(level);
    this.renderRidePassTitles();
    this.ui.ridepassPanel.classList.add('active');
  }

  renderRidePassLevels(currentLevel) {
    const rewards = this.ridePass.getAllRewards();
    const rewardLabel = (r) => {
      if (r.type === 'steezeL1') return { icon: '&#9733;', desc: `Steeze L1 x${r.qty}`, cls: 'rp-icon-s1' };
      if (r.type === 'steezeL2') return { icon: '&#9733;', desc: `Steeze L2 x${r.qty}`, cls: 'rp-icon-s2' };
      if (r.type === 'steezeL3') return { icon: '&#11088;', desc: `Steeze L3${r.title ? ' + "' + r.title + '"' : ''}`, cls: 'rp-icon-s3' };
      if (r.type === 'board') return { icon: '&#9830;', desc: `Board Token x${r.qty}`, cls: 'rp-icon-board' };
      if (r.type === 'title') return { icon: '&#127942;', desc: `Title: "${r.title}"`, cls: 'rp-icon-title' };
      return { icon: '?', desc: '???', cls: '' };
    };

    this.ui.rpLevelList.innerHTML = rewards.map((r, i) => {
      const lvl = i + 1;
      const claimed = this.ridePass.isLevelClaimed(lvl);
      const isCurrent = lvl === currentLevel + 1;
      const locked = lvl > currentLevel && !claimed;
      const info = rewardLabel(r);

      let cls = 'rp-level-item';
      if (claimed) cls += ' claimed';
      else if (isCurrent) cls += ' current';
      else if (locked) cls += ' locked';

      return `<div class="${cls}">
        <div class="rp-level-num">${lvl}</div>
        <div class="rp-reward-icon ${info.cls}">${info.icon}</div>
        <div class="rp-reward-desc">${info.desc}</div>
        <div class="rp-claim-badge">&#10003;</div>
      </div>`;
    }).join('');

    // Auto-scroll to current level area
    const target = this.ui.rpLevelList.querySelector('.rp-level-item.current') ||
                   this.ui.rpLevelList.querySelector('.rp-level-item.claimed:last-child');
    if (target) {
      setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    }
  }

  renderRidePassTitles() {
    const titles = this.ridePass.getUnlockedTitles();
    const selected = this.ridePass.getSelectedTitle();

    if (titles.length === 0) {
      this.ui.rpTitleSection.style.display = 'none';
      return;
    }

    this.ui.rpTitleSection.style.display = 'block';
    const noneSelected = selected === null;
    let html = `<button class="rp-title-btn${noneSelected ? ' selected' : ''}" data-title="">NONE</button>`;
    html += titles.map(t =>
      `<button class="rp-title-btn${t === selected ? ' selected' : ''}" data-title="${t}">${t}</button>`
    ).join('');

    this.ui.rpTitleOptions.innerHTML = html;

    this.ui.rpTitleOptions.querySelectorAll('.rp-title-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const title = btn.dataset.title || null;
        this.ridePass.selectTitle(title);
        this.ui.rpTitleOptions.querySelectorAll('.rp-title-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // ---- SHOP ----

  openShopPanel() {
    this.activeShopTab = 'jacket';
    document.querySelectorAll('.shop-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.shopTab === 'jacket')
    );
    this.updateShopTokens();
    this.renderShopItems('jacket');
    this.ui.shopPanel.classList.add('active');
  }

  updateShopTokens() {
    const tokens = this.ridePass.getTokens();
    this.ui.shopS1Count.textContent = tokens.steezeL1;
    this.ui.shopS2Count.textContent = tokens.steezeL2;
    this.ui.shopS3Count.textContent = tokens.steezeL3;
    this.ui.shopBoardCount.textContent = tokens.board;
  }

  renderShopItems(category) {
    const container = this.ui.shopItemList;
    const equipType = this.selectedEquipment;
    let items = this.shop.getItemsByCategory(category, category === 'board' ? equipType : null);

    // Sort: equipped first, then owned, then by tier (S3 > S2 > S1 > Board)
    const tierOrder = { steezeL3: 0, steezeL2: 1, steezeL1: 2, board: 3 };
    items = [...items].sort((a, b) => {
      const aEquipped = this.shop.isEquipped(a.id) ? 0 : 1;
      const bEquipped = this.shop.isEquipped(b.id) ? 0 : 1;
      if (aEquipped !== bEquipped) return aEquipped - bEquipped;
      const aOwned = this.shop.isOwned(a.id) ? 0 : 1;
      const bOwned = this.shop.isOwned(b.id) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return (tierOrder[a.tier] || 9) - (tierOrder[b.tier] || 9);
    });

    container.innerHTML = items.map(item => {
      const owned = this.shop.isOwned(item.id);
      const equipped = this.shop.isEquipped(item.id);
      const tokens = this.ridePass.getTokens();
      const canAfford = (tokens[item.tier] || 0) >= item.cost;

      let classes = 'shop-item';
      if (equipped) classes += ' equipped';
      else if (owned) classes += ' owned';
      if (item.legendary) classes += ' legendary';

      const colorHex = '#' + item.color.toString(16).padStart(6, '0');

      // Stats HTML for boards
      let statsHtml = '';
      if (item.stats) {
        statsHtml = `<div class="shop-stats">
          <div class="shop-stat">SPD <div class="shop-stat-bar"><div class="shop-stat-fill speed" style="width:${item.stats.speed * 10}%"></div></div></div>
          <div class="shop-stat">POP <div class="shop-stat-bar"><div class="shop-stat-fill pop" style="width:${item.stats.pop * 10}%"></div></div></div>
          <div class="shop-stat">FLX <div class="shop-stat-bar"><div class="shop-stat-fill flex" style="width:${item.stats.flex * 10}%"></div></div></div>
        </div>`;
      }

      // Style tag for boards
      const styleTag = item.style ? `<div class="shop-item-style">${item.style}</div>` : '';

      // Button
      let btnHtml;
      if (equipped) {
        btnHtml = `<button class="shop-btn shop-btn-equipped">EQUIPPED</button>`;
      } else if (owned) {
        btnHtml = `<button class="shop-btn shop-btn-equip" data-shop-equip="${item.id}">EQUIP</button>`;
      } else {
        const disabledClass = canAfford ? '' : ' disabled';
        const priceIcon = this.shop.getTierIcon(item.tier);
        const tierClass = this.shop.getTierClass(item.tier);
        btnHtml = `<span class="shop-price ${tierClass}">${priceIcon} ${item.cost}</span>
          <button class="shop-btn shop-btn-buy${disabledClass}" data-shop-buy="${item.id}">BUY</button>`;
      }

      return `<div class="${classes}">
        <div class="shop-color-swatch" style="background:${colorHex}"></div>
        <div class="shop-item-info">
          <div class="shop-item-brand">${item.brand}</div>
          <div class="shop-item-name">${item.name}</div>
          ${styleTag}
          ${statsHtml}
        </div>
        ${btnHtml}
      </div>`;
    }).join('');

    // Add board/ski sub-tabs for the board category
    if (category === 'board') {
      const subTabHtml = `<div style="display:flex;gap:6px;margin-bottom:8px;justify-content:center">
        <button class="shop-btn ${equipType === 'snowboard' ? 'shop-btn-equip' : 'shop-btn-equipped'}" data-shop-equip-type="snowboard" style="font-size:12px;padding:4px 12px">SNOWBOARDS</button>
        <button class="shop-btn ${equipType === 'ski' ? 'shop-btn-equip' : 'shop-btn-equipped'}" data-shop-equip-type="ski" style="font-size:12px;padding:4px 12px">SKIS</button>
      </div>`;
      container.insertAdjacentHTML('afterbegin', subTabHtml);
    }

    // Attach click handlers
    container.querySelectorAll('[data-shop-buy]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.shopBuy;
        this.handleShopPurchase(id);
      });
    });
    container.querySelectorAll('[data-shop-equip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.shopEquip;
        this.handleShopEquip(id);
      });
    });
    container.querySelectorAll('[data-shop-equip-type]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Switch equipment type filter for board tab display only
        const type = btn.dataset.shopEquipType;
        this.renderShopItems('board');
        // Re-render with correct equipment type would need the buttons to toggle selectedEquipment
        // For now, filter the display
        const items2 = this.shop.getItemsByCategory('board', type);
        // Just re-render with the selected type
        this._shopBoardFilter = type;
        this.renderShopBoardsFiltered(type);
      });
    });
  }

  renderShopBoardsFiltered(equipType) {
    const container = this.ui.shopItemList;
    let items = this.shop.getItemsByCategory('board', equipType);

    const tierOrder = { steezeL3: 0, steezeL2: 1, steezeL1: 2, board: 3 };
    items = [...items].sort((a, b) => {
      const aEquipped = this.shop.isEquipped(a.id) ? 0 : 1;
      const bEquipped = this.shop.isEquipped(b.id) ? 0 : 1;
      if (aEquipped !== bEquipped) return aEquipped - bEquipped;
      const aOwned = this.shop.isOwned(a.id) ? 0 : 1;
      const bOwned = this.shop.isOwned(b.id) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return (tierOrder[a.tier] || 9) - (tierOrder[b.tier] || 9);
    });

    const subTabHtml = `<div style="display:flex;gap:6px;margin-bottom:8px;justify-content:center">
      <button class="shop-btn ${equipType === 'snowboard' ? 'shop-btn-equip' : 'shop-btn-equipped'}" data-shop-equip-type="snowboard" style="font-size:12px;padding:4px 12px">SNOWBOARDS</button>
      <button class="shop-btn ${equipType === 'ski' ? 'shop-btn-equip' : 'shop-btn-equipped'}" data-shop-equip-type="ski" style="font-size:12px;padding:4px 12px">SKIS</button>
    </div>`;

    let itemsHtml = items.map(item => {
      const owned = this.shop.isOwned(item.id);
      const equipped = this.shop.isEquipped(item.id);
      const tokens = this.ridePass.getTokens();
      const canAfford = (tokens[item.tier] || 0) >= item.cost;

      let classes = 'shop-item';
      if (equipped) classes += ' equipped';
      else if (owned) classes += ' owned';

      const colorHex = '#' + item.color.toString(16).padStart(6, '0');

      const statsHtml = `<div class="shop-stats">
        <div class="shop-stat">SPD <div class="shop-stat-bar"><div class="shop-stat-fill speed" style="width:${item.stats.speed * 10}%"></div></div></div>
        <div class="shop-stat">POP <div class="shop-stat-bar"><div class="shop-stat-fill pop" style="width:${item.stats.pop * 10}%"></div></div></div>
        <div class="shop-stat">FLX <div class="shop-stat-bar"><div class="shop-stat-fill flex" style="width:${item.stats.flex * 10}%"></div></div></div>
      </div>`;

      const styleTag = item.style ? `<div class="shop-item-style">${item.style}</div>` : '';

      let btnHtml;
      if (equipped) {
        btnHtml = `<button class="shop-btn shop-btn-equipped">EQUIPPED</button>`;
      } else if (owned) {
        btnHtml = `<button class="shop-btn shop-btn-equip" data-shop-equip="${item.id}">EQUIP</button>`;
      } else {
        const disabledClass = canAfford ? '' : ' disabled';
        const priceIcon = this.shop.getTierIcon(item.tier);
        const tierClass = this.shop.getTierClass(item.tier);
        btnHtml = `<span class="shop-price ${tierClass}">${priceIcon} ${item.cost}</span>
          <button class="shop-btn shop-btn-buy${disabledClass}" data-shop-buy="${item.id}">BUY</button>`;
      }

      return `<div class="${classes}">
        <div class="shop-color-swatch" style="background:${colorHex}"></div>
        <div class="shop-item-info">
          <div class="shop-item-brand">${item.brand}</div>
          <div class="shop-item-name">${item.name}</div>
          ${styleTag}
          ${statsHtml}
        </div>
        ${btnHtml}
      </div>`;
    }).join('');

    container.innerHTML = subTabHtml + itemsHtml;

    // Re-attach click handlers
    container.querySelectorAll('[data-shop-buy]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleShopPurchase(btn.dataset.shopBuy);
      });
    });
    container.querySelectorAll('[data-shop-equip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleShopEquip(btn.dataset.shopEquip);
      });
    });
    container.querySelectorAll('[data-shop-equip-type]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renderShopBoardsFiltered(btn.dataset.shopEquipType);
      });
    });
  }

  handleShopPurchase(itemId) {
    const item = this.shop.getItem(itemId);
    if (!item) return;

    // Confirm legendary purchase
    if (item.legendary) {
      if (!confirm('This is your only Legendary token. Are you sure you want to buy this?')) return;
    }

    if (this.shop.purchase(itemId)) {
      this.updateShopTokens();
      this.renderShopItems(this.activeShopTab);
    }
  }

  handleShopEquip(itemId) {
    const item = this.shop.getItem(itemId);
    if (!item) return;

    // If already equipped, unequip
    if (this.shop.isEquipped(itemId)) {
      this.shop.unequip(item.category);
    } else {
      this.shop.equip(itemId);
    }
    this.applyEquippedItems();
    this.renderShopItems(this.activeShopTab);
  }

  applyEquippedItems() {
    const equipped = this.shop.getEquipped();

    // Apply clothing colors
    for (const category of ['jacket', 'pants', 'helmet']) {
      const item = this.shop.getEquippedItem(category);
      if (item) {
        this.player.setColor(category, item.color);
      }
    }

    // Apply board color and stats
    const boardItem = this.shop.getEquippedItem('board');
    if (boardItem && boardItem.stats) {
      this.player.setColor('board', boardItem.color);
      this.player.applyBoardStats(boardItem.stats.speed, boardItem.stats.pop, boardItem.stats.flex);
    } else {
      // Default stats (5/5/5 = 1.0x multipliers)
      this.player.applyBoardStats(5, 5, 5);
    }
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
    this.cloudSaveAll();
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
