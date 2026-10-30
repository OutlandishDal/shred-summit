import * as THREE from 'three';
import { Player } from './Player.js';
import { Terrain } from './Terrain.js';
import { TrickSystem } from './TrickSystem.js';
import { InputManager, isTouchDevice } from './InputManager.js';
import { TouchControls } from './TouchControls.js';
import { SnowParticles } from './Particles.js';
import { initFirebase, isFirebaseConfigured, submitScore, fetchWorldwideScores, createAccount, loginAccount, logoutAccount, resetPassword, onAuthChange, cloudSaveProgress, cloudLoadProgress, submitSummitScore, fetchSummitScores } from './firebase.js';
import { NicknameManager } from './NicknameManager.js';
import { QuestSystem } from './QuestSystem.js';
import { ShopSystem } from './ShopSystem.js';
import { RidePass } from './RidePass.js';
import { createBoardTexture, createJacketLogo } from './BoardGraphics.js';
import { BackcountryTerrain } from './BackcountryTerrain.js';
import { MultiplayerManager } from './MultiplayerManager.js';
import { RemotePlayer } from './RemotePlayer.js';

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
    this.parkTerrain = this.terrain; // keep reference to default park terrain
    this.gameMode = 'park';          // 'park' | 'backcountry'
    this.backcountryChair = null;    // 'peak', 'oldgrowth'
    this.nightMode = false;          // true when local clock says night
    this.nightBlend = 0;             // 0=day, 1=full night (for dawn/dusk lerp)
    this.starField = null;           // night sky stars (backcountry only)
    this.daynightPref = localStorage.getItem('shred-daynight') || 'auto'; // 'auto' | 'day' | 'night'
    this.parkId = 'big-white';       // 'big-white', 'xgames', 'slopestyle'
    this.selectedEquipment = 'snowboard';
    this.selectedStance = 'regular';
    this.player = new Player(this.scene, this.selectedEquipment);
    this.player.stance = this.selectedStance;
    this.player.updateStanceYaw();
    this.loadPlayerModel(); // load GLB character model (async, non-blocking)
    this.tricks = new TrickSystem();
    this.quests = new QuestSystem();
    this.ridePass = new RidePass();
    this.quests.onSeasonReset = () => this.ridePass.reset(this.quests.data.seasonStart);
    this.quests.checkSeasonReset();
    this.syncRidePassSeason();
    this.shop = new ShopSystem(this.ridePass);
    this.particles = new SnowParticles(this.scene);
    this.multiplayer = new MultiplayerManager(this);

    // Mobile: bring camera closer so snowboarder appears bigger on small screens
    if (isTouchDevice) {
      this.cameraOffset = new THREE.Vector3(0, 4.8, 2.8);
      this.mobileLookDir = new THREE.Vector3(0, -6, -8); // fixed angle relative to camera
      this.baseFOV = 45;
    } else {
      this.cameraOffset = new THREE.Vector3(0, 2.2, 2.9);
      this.cameraLookAhead = new THREE.Vector3(0, -1.2, -20);
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

    // Ski patrol chasers
    this.skiPatrol = [];
    this.skiPatrolActive = false;
    this.initSkiPatrol();

    // Dave NPC — river rescue guide (Peak backcountry)
    this.dave = null;
    this.daveState = 'hidden'; // hidden, appearing, leading, waving, departing
    this.daveTimer = 0;
    this.daveWaypointIndex = 0;
    this.daveWaypoints = [];
    this.initDave();

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
      popMeter: document.getElementById('pop-meter'),
      popMeterFill: document.getElementById('pop-meter-fill'),
      popMeterLabel: document.getElementById('pop-meter-label'),
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
      lobbyAccount: document.getElementById('lobby-account'),
      accountPanel: document.getElementById('account-panel'),
      accountBack: document.getElementById('account-back'),
      accountEmail: document.getElementById('account-email'),
      accountNickname: document.getElementById('account-nickname'),
      accountNicknameEdit: document.getElementById('account-nickname-edit'),
      accountNicknameEditRow: document.getElementById('account-nickname-edit-row'),
      accountNicknameInput: document.getElementById('account-nickname-input'),
      accountNicknameSave: document.getElementById('account-nickname-save'),
      accountNicknameCancel: document.getElementById('account-nickname-cancel'),
      accountNicknameError: document.getElementById('account-nickname-error'),
      accountTitleOptions: document.getElementById('account-title-options'),
      accountLogoutBtn: document.getElementById('account-logout-btn'),
      daynightToggle: document.getElementById('daynight-toggle'),
      mapPanel: document.getElementById('map-panel'),
      mapBack: document.getElementById('map-back'),
      lobbyMap: document.getElementById('lobby-map'),
      finishScreen: document.getElementById('finish-screen'),
      finishTitle: document.getElementById('finish-title'),
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
      authForgot: document.getElementById('auth-forgot'),
      // Multiplayer party
      lobbyMultiplayer: document.getElementById('lobby-multiplayer'),
      startMultiplayerBtn: document.getElementById('start-multiplayer-btn'),
      partyPanel: document.getElementById('party-panel'),
      partyJoinView: document.getElementById('party-join-view'),
      partyActiveView: document.getElementById('party-active-view'),
      partyCreate: document.getElementById('party-create'),
      partyJoinInput: document.getElementById('party-join-input'),
      partyJoinBtn: document.getElementById('party-join-btn'),
      partyCode: document.getElementById('party-code'),
      partyCopy: document.getElementById('party-copy'),
      partyMapLabel: document.getElementById('party-map-label'),
      partyMembers: document.getElementById('party-members'),
      partyStart: document.getElementById('party-start'),
      partyLeave: document.getElementById('party-leave'),
      partyError: document.getElementById('party-error'),
      partyBack: document.getElementById('party-back'),
      partyBanner: document.getElementById('party-banner'),
      partyBannerCode: document.getElementById('party-banner-code'),
      partyBannerInfo: document.getElementById('party-banner-info'),
      lobbyPartyHint: document.getElementById('lobby-party-hint'),
      partyHud: document.getElementById('party-hud'),
    };

    // Leaderboard (localStorage)
    this.leaderboard = this.loadLeaderboard();
    this.summitLeaderboard = this.loadSummitLeaderboard();

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
        if (this.state === 'playing' && this.gameMode === 'backcountry') {
          this.openLobby();
        } else if (this.state === 'dead' || this.state === 'finished') {
          this.openLobby();
        } else if (this.state === 'lobby') {
          if (this.ui.partyPanel.classList.contains('active')) {
            this.ui.partyPanel.classList.remove('active');
          } else {
            this.dropIn();
          }
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
    this.setupParty();
    this.setupLeaderboardTabs();
    this.setupNickname();

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupAuth() {
    if (!isFirebaseConfigured()) {
      // No Firebase — skip auth, go straight to start screen
      this.ui.startScreen.style.display = '';
      return;
    }

    // Hide start screen and show auth screen while Firebase resolves auth state
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

    // Forgot password
    this.ui.authForgot.addEventListener('click', async () => {
      const email = this.ui.authEmail.value.trim();
      this.ui.authError.textContent = '';
      if (!email) {
        this.ui.authError.textContent = 'ENTER YOUR EMAIL FIRST';
        return;
      }
      try {
        await resetPassword(email);
        this.ui.authError.style.color = '#5cb85c';
        this.ui.authError.textContent = 'RESET EMAIL SENT! CHECK YOUR INBOX';
        setTimeout(() => { this.ui.authError.style.color = ''; }, 4000);
      } catch (e) {
        const msg = e.code || e.message || 'RESET FAILED';
        const friendly = {
          'auth/user-not-found': 'NO ACCOUNT WITH THAT EMAIL',
          'auth/invalid-email': 'INVALID EMAIL',
          'auth/too-many-requests': 'TOO MANY ATTEMPTS, TRY LATER',
        };
        this.ui.authError.textContent = friendly[msg] || msg.toUpperCase();
      }
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
      this.syncRidePassSeason();
      if (cloudData.leaderboard) {
        this.leaderboard = cloudData.leaderboard;
        try { localStorage.setItem('shred-summit-leaderboard', JSON.stringify(this.leaderboard)); } catch (e) { /* ignore */ }
      }
    } else {
      // First login — upload existing localStorage data to cloud
      this.cloudSaveAll();
    }

    // Init multiplayer
    this.multiplayer.init();

    // Transition to start screen
    this.ui.authScreen.classList.remove('active');
    this.ui.startScreen.style.display = '';
    this.input.disabled = false;
    this.state = 'start';
    this.ui.startMultiplayerBtn.style.display = this.multiplayer.available ? '' : 'none';

    // Opened from an invite link (?party=CODE) → join straight away
    this.joinPartyFromInviteLink();
  }

  onLogout() {
    this.multiplayer.leaveParty();
    this.state = 'auth';
    this.input.disabled = true;
    this.ui.startScreen.style.display = 'none';
    // Hide via classes (not inline styles) so the screens still work after the next login
    this.ui.lobbyScreen.classList.remove('active');
    this.ui.deathScreen.classList.remove('active');
    this.ui.finishScreen.classList.remove('active');
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

  syncRidePassSeason() {
    const questSeason = this.quests.data.seasonStart;
    if (questSeason && this.ridePass.data.seasonStart !== questSeason) {
      this.ridePass.reset(questSeason);
    }
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
    this.ambientLight = new THREE.AmbientLight(0x8ec8f0, 0.5);
    this.scene.add(this.ambientLight);

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
    this._lastSunUpdatePos = { x: 0, y: 0, z: 0 };

    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0xd0e8f0, 0.5);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0xaaccee, 0.3);
    this.rimLight.position.set(-20, 20, -10);
    this.scene.add(this.rimLight);
  }

  // ===== DAY/NIGHT CYCLE =====

  getTimeOfDay() {
    const now = new Date();
    const decimal = now.getHours() + now.getMinutes() / 60;
    // Night: 6:30pm – 5:30am (full dark)
    // Dusk:  5:30pm – 6:30pm (transition)
    // Dawn:  5:30am – 6:30am (transition)
    // Day:   6:30am – 5:30pm
    if (decimal >= 18.5 || decimal < 5.5) return 1.0;        // full night
    if (decimal >= 17.5 && decimal < 18.5) return (decimal - 17.5);  // dusk: 0→1
    if (decimal >= 5.5 && decimal < 6.5) return 1.0 - (decimal - 5.5); // dawn: 1→0
    return 0.0; // day
  }

  updateDaynightButton() {
    const btn = this.ui.daynightToggle;
    if (!btn) return;
    btn.textContent = this.daynightPref.toUpperCase();
    btn.className = 'account-toggle-btn';
    if (this.daynightPref === 'day') btn.classList.add('mode-day');
    if (this.daynightPref === 'night') btn.classList.add('mode-night');
  }

  applyNightAtmosphere() {
    const t = this.nightBlend;
    if (t <= 0) return;

    if (this.gameMode === 'park') {
      // Park night: darker tinted sky, floodlights keep snow bright
      const bg = new THREE.Color(0x8aafc4).lerp(new THREE.Color(0x2a3a50), t);
      this.scene.background.copy(bg);
      const fogC = new THREE.Color(0xbccfe0).lerp(new THREE.Color(0x3a4a60), t);
      this.scene.fog.color.copy(fogC);
      this.scene.fog.density = 0.003 + t * 0.001;
      this.sun.intensity = 1.6 - t * 0.8; // keep at 0.8 — still visible
      this.sun.color.lerp(new THREE.Color(0xaabbdd), t);
      this.ambientLight.intensity = 0.5 - t * 0.1;
      this.ambientLight.color.lerp(new THREE.Color(0x556688), t);
      this.hemiLight.intensity = 0.5 - t * 0.15;
      this.rimLight.intensity = 0.3 - t * 0.1;
      this.renderer.toneMappingExposure = 1.1 - t * 0.15;
    } else {
      // Backcountry night: dark sky for bright stars, terrain still readable
      const bg = new THREE.Color(0x8aafc4).lerp(new THREE.Color(0x080c18), t);
      this.scene.background.copy(bg);
      const fogC = new THREE.Color(0xbccfe0).lerp(new THREE.Color(0x1a2230), t);
      this.scene.fog.color.copy(fogC);
      this.scene.fog.density = 0.003 + t * 0.002;
      this.sun.intensity = 1.6 - t * 0.7;
      this.sun.color.lerp(new THREE.Color(0x99aacc), t);
      this.sun.position.set(30 - t * 50, 50 + t * 10, 20 - t * 10);
      this.ambientLight.intensity = 0.5 - t * 0.1;
      this.ambientLight.color.lerp(new THREE.Color(0x4a5a80), t);
      this.hemiLight.intensity = 0.5 - t * 0.15;
      this.rimLight.intensity = 0.3 - t * 0.1;
      this.renderer.toneMappingExposure = 1.1 - t * 0.15;
      // Stars in the sky
      if (t > 0.3) this.createStarField();
    }
  }

  createStarField() {
    if (this.starField) return;

    // Curved sky dome with star shader
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uWarp;  // 0 = static stars, 1 = full time-warp spin
      uniform float uTime;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      vec2 starPos(vec2 cell, float seed) {
        return cell + vec2(hash(cell + seed), hash(cell + seed + 77.7)) * 0.8 + 0.1;
      }

      float starDist(vec2 uv, vec2 center, float scale) {
        vec2 d = (uv - center) * vec2(scale * 3.5, scale);
        return length(d);
      }

      void main() {
        // Warp effect: rotate UVs around center, stretch into streaks
        vec2 uv = vUv;
        vec2 center = vec2(0.5, 0.5);
        vec2 toCenter = uv - center;

        // Spin the entire star field when warping
        float spinAngle = uWarp * uTime * 0.075;
        float cosA = cos(spinAngle);
        float sinA = sin(spinAngle);
        vec2 rotated = vec2(
          toCenter.x * cosA - toCenter.y * sinA,
          toCenter.x * sinA + toCenter.y * cosA
        );
        vec2 warpUv = rotated + center;

        // Use warped UVs for star lookup
        vec2 sampleUv = mix(uv, warpUv, uWarp);

        float stars = 0.0;
        vec3 starColor = vec3(0.0);

        // When warping: stars stretch into circular streaks
        // Sample multiple points along the rotation arc for motion blur
        int blurSamples = uWarp > 0.05 ? 5 : 1;
        float totalWeight = 0.0;

        for (int s = 0; s < 5; s++) {
          if (s >= blurSamples) break;
          float sampleOffset = float(s) / 5.0 * uWarp * 0.3;
          float sAngle = spinAngle + sampleOffset;
          float scos = cos(sAngle);
          float ssin = sin(sAngle);
          vec2 sRot = vec2(toCenter.x * scos - toCenter.y * ssin,
                           toCenter.x * ssin + toCenter.y * scos) + center;
          vec2 su = mix(uv, sRot, uWarp);
          float weight = 1.0 - float(s) * 0.15;
          totalWeight += weight;

          // Dense dim stars
          {
            float scale = 120.0;
            vec2 cell = floor(su * scale);
            float h = hash(cell + 0.0);
            if (h > 0.965) {
              vec2 ct = starPos(cell, 0.0) / scale;
              float d = starDist(su, ct, scale);
              float b = exp(-d * d * 4.0) * (0.3 + h * 0.3) * weight;
              starColor += vec3(0.7, 0.8, 1.0) * b;
              stars += b;
            }
          }

          // Medium stars
          {
            float scale = 60.0;
            vec2 cell = floor(su * scale);
            float h = hash(cell + 50.0);
            if (h > 0.94) {
              vec2 ct = starPos(cell, 50.0) / scale;
              float d = starDist(su, ct, scale);
              float b = exp(-d * d * 2.5) * (0.5 + h * 0.4) * weight;
              starColor += vec3(0.9, 0.95, 1.0) * b;
              stars += b;
            }
          }

          // Bright stars
          {
            float scale = 25.0;
            vec2 cell = floor(su * scale);
            float h = hash(cell + 200.0);
            if (h > 0.88) {
              vec2 ct = starPos(cell, 200.0) / scale;
              float d = starDist(su, ct, scale);
              float core = exp(-d * d * 3.0);
              float glow = exp(-d * d * 0.5) * 0.3;
              float b = (core + glow) * (0.7 + h * 0.3) * weight;
              float warmth = hash(cell + 300.0);
              vec3 c = warmth > 0.5 ? vec3(1.0, 0.9, 0.75) : vec3(0.75, 0.88, 1.0);
              starColor += c * b;
              stars += b;
            }
          }
        }

        if (totalWeight > 1.0) {
          starColor /= totalWeight;
          stars /= totalWeight;
        }

        // Boost brightness during warp
        starColor *= 1.0 + uWarp * 1.5;

        float vFade = smoothstep(0.0, 0.12, vUv.y);
        float hFade = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);

        float alpha = clamp(stars * vFade * hFade, 0.0, 1.0);
        gl_FragColor = vec4(starColor * vFade * hFade, alpha);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uWarp: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Curved sky dome
    const geo = new THREE.PlaneGeometry(1000, 250, 64, 32);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const angle = (x / 1000) * Math.PI * 1.2;
      const radius = 450;
      pos.setX(i, Math.sin(angle) * radius);
      pos.setZ(i, -Math.cos(angle) * radius - 100);
      pos.setY(i, y + 10);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    this.starField = new THREE.Mesh(geo, material);
    this.starField.renderOrder = -2;
    this.starField.frustumCulled = false;
    this.scene.add(this.starField);
    // Also init shooting stars
    if (!this.shootingStarPool) this.initShootingStars();
  }

  disposeStarField() {
    if (this.starField) {
      this.scene.remove(this.starField);
      this.starField.geometry.dispose();
      this.starField.material.dispose();
      this.starField = null;
    }
  }

  // ===== SHOOTING STARS =====

  initShootingStars() {
    this.shootingStars = [];
    this.shootingStarPool = [];
    // Pre-create a pool of 8 shooting star meshes
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
    });
    for (let i = 0; i < 8; i++) {
      // Elongated trail shape — thin stretched box
      const geo = new THREE.BoxGeometry(0.3, 0.3, 8);
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.shootingStarPool.push(mesh);
    }
  }

  spawnShootingStar() {
    // Find an available mesh from the pool
    const mesh = this.shootingStarPool.find(m => !m.visible);
    if (!mesh) return;

    const px = this.player.position.x;
    const py = this.player.position.y;
    const pz = this.player.position.z;

    // Random start position on the sky dome — in front of the player
    const angle = (Math.random() - 0.5) * 2.0; // spread left-right
    const height = 40 + Math.random() * 80; // above player
    const dist = 100 + Math.random() * 200; // distance ahead

    mesh.position.set(
      px + Math.sin(angle) * dist,
      py + height,
      pz - Math.cos(angle) * dist - 50
    );

    // Random direction — streaking diagonally downward
    const speed = 150 + Math.random() * 200;
    const dirX = (Math.random() - 0.5) * 0.8;
    const dirY = -0.3 - Math.random() * 0.3;
    const dirZ = -0.5 - Math.random() * 0.5;
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

    const vel = {
      x: (dirX / len) * speed,
      y: (dirY / len) * speed,
      z: (dirZ / len) * speed,
    };

    // Orient the mesh along its velocity direction
    mesh.lookAt(
      mesh.position.x + vel.x,
      mesh.position.y + vel.y,
      mesh.position.z + vel.z
    );

    // Scale: bright head + long tail
    const trailLen = 3 + Math.random() * 5;
    mesh.scale.set(1, 1, trailLen);
    mesh.material.opacity = 0.95;
    mesh.visible = true;

    this.shootingStars.push({
      mesh,
      vel,
      life: 0,
      maxLife: 0.6 + Math.random() * 0.5,
    });
  }

  updateShootingStars(dt, heightFeet) {
    if (!this.shootingStars) return;

    // Spawn shooting stars when above 30ft
    if (heightFeet > 30 && this.starField) {
      // Higher = more frequent
      const spawnChance = Math.min(0.15, (heightFeet - 30) / 500);
      if (Math.random() < spawnChance) {
        this.spawnShootingStar();
      }
    }

    // Update active shooting stars
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const star = this.shootingStars[i];
      star.life += dt;

      // Move
      star.mesh.position.x += star.vel.x * dt;
      star.mesh.position.y += star.vel.y * dt;
      star.mesh.position.z += star.vel.z * dt;

      // Fade out in last 30% of life
      const fadeStart = star.maxLife * 0.7;
      if (star.life > fadeStart) {
        star.mesh.material.opacity = 0.95 * (1 - (star.life - fadeStart) / (star.maxLife - fadeStart));
      }

      // Remove when expired
      if (star.life >= star.maxLife) {
        star.mesh.visible = false;
        this.shootingStars.splice(i, 1);
      }
    }
  }

  disposeShootingStars() {
    if (this.shootingStarPool) {
      for (const mesh of this.shootingStarPool) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.shootingStarPool = null;
      this.shootingStars = null;
    }
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
          // Apply color to player (skip if shop item overrides this part)
          const colorVal = parseInt(swatch.dataset.color);
          if (part === 'board' && this.shop.getEquippedItem('board')) {
            // Shop board/ski equipped — don't let swatch override
            return;
          }
          this.player.setColor(part, colorVal);
        });
      });
    });

    // Equipment toggle (snowboard / skis)
    document.querySelectorAll('[data-equipment]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-equipment]').forEach(b => b.classList.remove('selected'));
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
          this.player.stance = this.selectedStance;
          this.player.updateStanceYaw();
          this.loadPlayerModel();
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
          // Show/hide stance row (snowboard only)
          const stanceRow = document.getElementById('stance-row');
          if (stanceRow) {
            stanceRow.style.display = this.selectedEquipment === 'ski' ? 'none' : '';
          }
        }
      });
    });

    // Stance toggle (regular / goofy) — snowboard only
    document.querySelectorAll('[data-stance]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-stance]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedStance = btn.dataset.stance;
        this.player.stance = this.selectedStance;
        this.player.updateStanceYaw();
      });
    });

    // Drop In button — selected park (or the party's map)
    this.ui.lobbyDropIn.addEventListener('click', () => {
      if (!this.multiplayer.active) {
        this.gameMode = 'park';
        this.backcountryChair = null;
      }
      this.dropIn();
    });

    // Customize button → open customize panel
    if (this.ui.lobbyCustomize) {
      this.ui.lobbyCustomize.addEventListener('click', () => {
        this.ui.customizePanel.classList.add('active');
      });
    }

    // Back button → close customize panel
    this.ui.customizeBack.addEventListener('click', () => {
      this.ui.customizePanel.classList.remove('active');
      this.multiplayer.refreshSelf();
    });

    // Map button → open map panel
    this.ui.lobbyMap.addEventListener('click', () => {
      this.ui.mapPanel.classList.add('active');
    });
    this.ui.mapPanel.addEventListener('click', (e) => e.stopPropagation());
    this.ui.mapBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.mapPanel.classList.remove('active');
    });

    // Chair clicks on the map → launch backcountry mode
    document.querySelectorAll('.map-chair[data-chair]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const chairId = el.dataset.chair;
        if (this.multiplayer.active && !this.multiplayer.setMap('backcountry', chairId, this.parkId)) {
          this.showPartyHint('THE PARTY LEADER PICKS THE MAP');
          return;
        }
        this.gameMode = 'backcountry';
        this.backcountryChair = chairId;
        this.ui.mapPanel.classList.remove('active');
        this.dropIn();
      });
    });

    // Map tab switching (BACKCOUNTRY / PARK)
    document.querySelectorAll('.map-tab[data-map-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.mapTab;
        document.querySelectorAll('.map-tab[data-map-tab]').forEach(t =>
          t.classList.toggle('active', t.dataset.mapTab === tabId)
        );
        document.getElementById('map-backcountry-tab').classList.toggle('active', tabId === 'backcountry');
        document.getElementById('map-park-tab').classList.toggle('active', tabId === 'park');
      });
    });

    // Park card selection
    document.querySelectorAll('.park-card[data-park]').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.park-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        if (this.multiplayer.active && !this.multiplayer.setMap('park', null, card.dataset.park)) {
          this.showPartyHint('THE PARTY LEADER PICKS THE MAP');
          this.highlightParkCard(this.multiplayer.map.parkId);
          return;
        }
        this.parkId = card.dataset.park;
        this.gameMode = 'park';
        this.backcountryChair = null;
      });
    });

    // Account button → open account panel
    this.ui.lobbyAccount.addEventListener('click', () => {
      this.renderAccountPanel();
      this.ui.accountPanel.classList.add('active');
    });

    // Account panel — block clicks
    this.ui.accountPanel.addEventListener('click', (e) => e.stopPropagation());

    // Account back button
    this.ui.accountBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.accountPanel.classList.remove('active');
    });

    // Account — edit nickname
    this.ui.accountNicknameEdit.addEventListener('click', () => {
      const current = this.nicknameManager.getNickname() || '';
      this.ui.accountNicknameInput.value = current;
      this.ui.accountNicknameError.textContent = '';
      this.ui.accountNickname.parentElement.style.display = 'none';
      this.ui.accountNicknameEditRow.style.display = 'flex';
      setTimeout(() => this.ui.accountNicknameInput.focus(), 50);
    });

    // Account — save nickname
    this.ui.accountNicknameSave.addEventListener('click', () => {
      const value = this.ui.accountNicknameInput.value.trim();
      if (!this.nicknameManager.validate(value)) {
        this.ui.accountNicknameError.textContent = '3-12 LETTERS, NUMBERS, _ OR -';
        return;
      }
      this.nicknameManager.save(value);
      this.multiplayer.refreshSelf();
      this.ui.accountNickname.textContent = value;
      this.ui.accountNicknameEditRow.style.display = 'none';
      this.ui.accountNickname.parentElement.style.display = 'flex';
      this.ui.accountNicknameError.textContent = '';
    });

    // Account — cancel nickname edit
    this.ui.accountNicknameCancel.addEventListener('click', () => {
      this.ui.accountNicknameEditRow.style.display = 'none';
      this.ui.accountNickname.parentElement.style.display = 'flex';
      this.ui.accountNicknameError.textContent = '';
    });

    // Account — prevent keyboard input from reaching game
    this.ui.accountNicknameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') this.ui.accountNicknameSave.click();
    });
    this.ui.accountNicknameInput.addEventListener('keyup', (e) => e.stopPropagation());

    // Account — log out
    this.ui.accountLogoutBtn.addEventListener('click', async () => {
      this.ui.accountPanel.classList.remove('active');
      await logoutAccount();
    });

    // Day/Night toggle
    this.updateDaynightButton();
    this.ui.daynightToggle.addEventListener('click', () => {
      // Cycle: auto → day → night → auto
      const cycle = { auto: 'day', day: 'night', night: 'auto' };
      this.daynightPref = cycle[this.daynightPref] || 'auto';
      localStorage.setItem('shred-daynight', this.daynightPref);
      this.updateDaynightButton();
    });
  }

  // ---- MULTIPLAYER ----

  setupParty() {
    const mp = this.multiplayer;
    const ui = this.ui;

    // Multiplayer needs Firebase (accounts + Realtime Database)
    ui.startMultiplayerBtn.style.display = isFirebaseConfigured() ? '' : 'none';
    ui.lobbyMultiplayer.style.display = isFirebaseConfigured() ? '' : 'none';

    ui.lobbyMultiplayer.addEventListener('click', () => this.openPartyPanel());
    ui.partyBanner.addEventListener('click', () => this.openPartyPanel());
    ui.partyPanel.addEventListener('click', (e) => e.stopPropagation());
    ui.partyBack.addEventListener('click', () => ui.partyPanel.classList.remove('active'));

    // Start screen → go to the lobby with the multiplayer panel open
    ui.startMultiplayerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ensureNickname(() => {
        this.enterLobbyFromStart();
        this.openPartyPanel();
      });
    });

    ui.partyCreate.addEventListener('click', async () => {
      await this.runPartyAction('CREATING PARTY...', () => mp.createParty());
    });

    const join = async () => {
      const code = ui.partyJoinInput.value;
      await this.runPartyAction('JOINING...', () => mp.joinParty(code));
    };
    ui.partyJoinBtn.addEventListener('click', join);
    ui.partyJoinInput.addEventListener('input', () => {
      ui.partyJoinInput.value = ui.partyJoinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    ui.partyJoinInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') join();
    });
    ui.partyJoinInput.addEventListener('keyup', (e) => e.stopPropagation());

    ui.partyCopy.addEventListener('click', async () => {
      const url = mp.inviteLink;
      if (!url) return;
      try {
        if (isTouchDevice && navigator.share) {
          await navigator.share({ title: 'Shred Summit', text: `Ride with me! Party code ${mp.partyCode}`, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        ui.partyCopy.textContent = 'COPIED!';
      } catch (e) {
        ui.partyCopy.textContent = 'SHARE THE CODE ABOVE';
      }
      setTimeout(() => { ui.partyCopy.textContent = 'COPY INVITE LINK'; }, 1800);
    });

    ui.partyStart.addEventListener('click', () => this.dropIn());

    ui.partyLeave.addEventListener('click', async () => {
      await mp.leaveParty();
      this.setPartyError('');
    });
  }

  async runPartyAction(pendingText, action) {
    const ui = this.ui;
    ui.partyCreate.disabled = true;
    ui.partyJoinBtn.disabled = true;
    this.setPartyError(pendingText, true);
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CONNECTION TIMED OUT, CHECK YOUR INTERNET')), 10000));
      const result = await Promise.race([action(), timeout]);
      this.setPartyError(result.error || '');
    } catch (e) {
      console.warn('[multiplayer]', e);
      const denied = /permission/i.test(e.message || '');
      this.setPartyError(denied ? 'MULTIPLAYER IS NOT SET UP ON THE SERVER YET' : (e.message || 'CONNECTION FAILED'));
    } finally {
      ui.partyCreate.disabled = false;
      ui.partyJoinBtn.disabled = false;
      this.renderPartyPanel();
    }
  }

  setPartyError(text, ok = false) {
    this.ui.partyError.textContent = text;
    this.ui.partyError.classList.toggle('ok', ok);
  }

  openPartyPanel() {
    this.renderPartyPanel();
    this.ui.mapPanel.classList.remove('active');
    this.ui.customizePanel.classList.remove('active');
    this.ui.accountPanel.classList.remove('active');
    this.ui.partyPanel.classList.add('active');
    if (!this.multiplayer.available) this.setPartyError('SIGN IN TO PLAY ONLINE');
  }

  enterLobbyFromStart() {
    if (this.state !== 'start') return;
    this.ui.startScreen.style.display = 'none';
    this.clock.start();
    this.openLobby();
  }

  /** Opened with ?party=CODE → join that party and show the lobby. */
  joinPartyFromInviteLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get('party');
    if (!code) return;
    params.delete('party');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);

    this.ensureNickname(() => {
      this.enterLobbyFromStart();
      this.openPartyPanel();
      this.runPartyAction('JOINING...', () => this.multiplayer.joinParty(code));
    });
  }

  /** Leave the lobby and start riding. In a party, the leader brings everyone waiting along. */
  dropIn() {
    if (this.state !== 'lobby') return;
    if (this.multiplayer.isLeader) this.multiplayer.startRun();
    this.closeLobby();
  }

  applyPartyMap(map) {
    this.gameMode = map.mode;
    this.backcountryChair = map.mode === 'backcountry' ? map.chair : null;
    this.parkId = map.parkId || 'big-white';
  }

  partyMapName(map) {
    const el = map.mode === 'backcountry'
      ? document.querySelector(`.map-chair[data-chair="${map.chair}"] .map-chair-label`)
      : document.querySelector(`.park-card[data-park="${map.parkId}"] .park-card-name`);
    return el ? el.textContent.trim() : 'UNKNOWN MAP';
  }

  highlightParkCard(parkId) {
    document.querySelectorAll('.park-card').forEach(c =>
      c.classList.toggle('selected', c.dataset.park === parkId)
    );
  }

  showPartyHint(text) {
    this.ui.lobbyPartyHint.textContent = text;
    clearTimeout(this._partyHintTimer);
    this._partyHintTimer = setTimeout(() => { this.ui.lobbyPartyHint.textContent = ''; }, 2500);
  }

  // Called by MultiplayerManager whenever members or connection state change
  onPartyChanged() {
    this.renderPartyPanel();
    this.updatePartyHud();
    if (this.state === 'lobby' && this.lobbyGroup) this.syncLobbyRemotePlayers();
  }

  onPartyMapChanged(map) {
    if (this.state === 'lobby' || this.state === 'start') {
      this.parkId = map.parkId || 'big-white';
      this.highlightParkCard(this.parkId);
    }
    this.renderPartyPanel();
  }

  // The leader started a run: anyone waiting drops in with them
  onPartyRunStarted() {
    if (this.state === 'lobby') {
      this.closeLobby();
    } else if (this.state === 'dead' || this.state === 'finished') {
      this.openLobby();
      this.closeLobby();
    }
  }

  renderPartyPanel() {
    const mp = this.multiplayer;
    const ui = this.ui;
    const inParty = mp.active;

    ui.partyJoinView.style.display = inParty ? 'none' : 'flex';
    ui.partyActiveView.style.display = inParty ? 'flex' : 'none';
    ui.partyCreate.disabled = ui.partyCreate.disabled || !mp.available;
    ui.lobbyMultiplayer.textContent = inParty ? `PARTY (${mp.memberCount})` : 'MULTIPLAYER';

    // Lobby banner
    ui.partyBanner.style.display = inParty ? '' : 'none';
    if (inParty) {
      ui.partyBannerCode.textContent = mp.partyCode;
      const riders = mp.memberCount === 1 ? 'JUST YOU SO FAR' : `${mp.memberCount} RIDERS`;
      ui.partyBannerInfo.textContent = `${riders} · ${this.partyMapName(mp.map)}${mp._connected ? '' : ' · RECONNECTING...'}`;
    }

    if (!inParty) return;

    ui.partyCode.textContent = mp.partyCode;
    ui.partyMapLabel.textContent = mp.isLeader
      ? `MAP: ${this.partyMapName(mp.map)} — YOU'RE THE LEADER, PICK MAPS FROM THE MAP MENU`
      : `MAP: ${this.partyMapName(mp.map)} — THE LEADER PICKS THE MAP`;
    ui.partyStart.textContent = mp.isLeader ? 'DROP IN TOGETHER' : 'DROP IN';

    const leader = mp.leaderUid;
    ui.partyMembers.innerHTML = '';
    const uids = Object.keys(mp.members).sort((a, b) => (a === leader ? -1 : b === leader ? 1 : 0));
    for (const uid of uids) {
      const m = mp.members[uid];
      const row = document.createElement('div');
      row.className = 'party-member' + (uid === mp.uid ? ' me' : '');
      const name = document.createElement('span');
      name.textContent = `${uid === leader ? '★ ' : ''}${m.nickname || 'Player'}${uid === mp.uid ? ' (YOU)' : ''}`;
      const status = document.createElement('span');
      status.className = 'party-member-status' + (m.status === 'riding' ? ' riding' : '');
      status.textContent = m.status === 'riding' ? 'RIDING' : 'IN LOBBY';
      row.append(name, status);
      ui.partyMembers.appendChild(row);
    }
  }

  updatePartyHud() {
    const mp = this.multiplayer;
    const show = mp.active && (this.state === 'playing' || this.state === 'dead' || this.state === 'finished');
    const text = show
      ? `PARTY ${mp.partyCode} · ${mp.ridersHere + 1}/${mp.memberCount} ON THIS RUN${mp._connected ? '' : ' · RECONNECTING...'}`
      : '';
    if (this._partyHudText !== text) {
      this._partyHudText = text;
      this.ui.partyHud.textContent = text;
      this.ui.partyHud.style.display = show ? '' : 'none';
    }
  }

  openLobby() {
    this.state = 'lobby';
    // Reset to park mode when returning to lobby
    if (this.gameMode === 'backcountry') {
      this.gameMode = 'park';
      this.backcountryChair = null;
      this.swapTerrain();
    }
    if (this.touchControls) this.touchControls.hide();
    this.hideSkiPatrol();
    this.hideDave();
    this.ui.deathScreen.classList.remove('active');
    this.ui.finishScreen.classList.remove('active');
    this.ui.newRecordLabel.classList.remove('show');
    this.ui.crashVignette.style.opacity = '0';
    this.ui.customizePanel.classList.remove('active');
    this.ui.mapPanel.classList.remove('active');
    // Reset map tabs to backcountry default
    document.querySelectorAll('.map-tab[data-map-tab]').forEach(t =>
      t.classList.toggle('active', t.dataset.mapTab === 'backcountry')
    );
    const bcTab = document.getElementById('map-backcountry-tab');
    const pkTab = document.getElementById('map-park-tab');
    if (bcTab) bcTab.classList.add('active');
    if (pkTab) pkTab.classList.remove('active');
    // Highlight the current parkId card
    document.querySelectorAll('.park-card').forEach(c =>
      c.classList.toggle('selected', c.dataset.park === this.parkId)
    );
    this.ui.accountPanel.classList.remove('active');
    this.ui.partyPanel.classList.remove('active');
    this.ui.lobbyScreen.classList.add('active');
    this.player.cleanupDebris();
    this.player.boardGroup.visible = true;
    this.applyEquippedItems();
    this.setupLobbyScene();

    // Multiplayer: stop sending our position but stay in the party
    this.multiplayer.onLocalReturnedToLobby();
    this.onPartyChanged();
  }

  closeLobby() {
    // Guard against double-calling (e.g. click handler + Firebase callback)
    if (this.state !== 'lobby') return;

    // In a party everyone rides the party's map
    if (this.multiplayer.active) this.applyPartyMap(this.multiplayer.map);

    // Hide lobby UI immediately so it disappears even if teardown errors
    this.ui.lobbyScreen.classList.remove('active');
    this.ui.partyPanel.classList.remove('active');
    this.teardownLobbyScene();
    this.applyEquippedItems();
    // Evaluate day/night: preference overrides real clock
    if (this.daynightPref === 'day') {
      this.nightBlend = 0;
      this.nightMode = false;
    } else if (this.daynightPref === 'night') {
      this.nightBlend = 1.0;
      this.nightMode = true;
    } else {
      // Auto: use real clock
      this.nightBlend = this.getTimeOfDay();
      this.nightMode = this.nightBlend > 0.1;
    }
    console.log('[closeLobby] gameMode:', this.gameMode, 'chair:', this.backcountryChair, 'nightBlend:', this.nightBlend.toFixed(2));
    this.swapTerrain();
    this.player.backcountryMode = this.gameMode === 'backcountry';
    // Reload per-chair/park leaderboard
    if (this.gameMode === 'backcountry') {
      this.summitLeaderboard = this.loadSummitLeaderboard();
    } else {
      this.leaderboard = this.loadLeaderboard();
    }
    this.fullReset();

    // Multiplayer: start sharing our position
    this.multiplayer.onLocalRunStarted();
    this.onPartyChanged();
  }

  swapTerrain() {
    console.log('[swapTerrain] gameMode:', this.gameMode, 'chair:', this.backcountryChair);
    // Always dispose old terrain first
    if (this.terrain && this.terrain.dispose) {
      this.terrain.dispose();
    }

    this.disposeStarField();
    this.disposeShootingStars();

    // Reset all lights to daytime defaults
    this.scene.background = new THREE.Color(0x8aafc4);
    this.scene.fog.color.set(0xbccfe0);
    this.scene.fog.density = 0.003;
    this.sun.intensity = 1.6;
    this.sun.color.set(0xfff4e0);
    this.sun.position.set(30, 50, 20);
    this.ambientLight.intensity = 0.5;
    this.ambientLight.color.set(0x8ec8f0);
    this.hemiLight.intensity = 0.5;
    this.hemiLight.color.set(0x87ceeb);
    this.hemiLight.groundColor.set(0xd0e8f0);
    this.rimLight.intensity = 0.3;
    this.renderer.toneMappingExposure = 1.1;

    const useNight = this.nightMode;

    if (this.gameMode === 'backcountry') {
      console.log('[swapTerrain] Creating BackcountryTerrain, night:', useNight);
      this.terrain = new BackcountryTerrain(this.scene, this.backcountryChair, useNight);
    } else {
      console.log('[swapTerrain] Creating Park Terrain, parkId:', this.parkId, 'night:', useNight);
      // Party members share the park layout via a common seed
      const seed = this.multiplayer.active ? this.multiplayer.map.seed : null;
      this.terrain = new Terrain(this.scene, seed, this.parkId, useNight);
      this.parkTerrain = this.terrain;
    }

    // Apply night atmosphere
    if (useNight) {
      this.applyNightAtmosphere();
    }
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

  initSkiPatrol() {
    const redJacket = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.8 });
    const blackPants = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5c6a0 });
    const whiteCross = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();

      // Legs
      const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), blackPants);
      legL.position.set(-0.1, 0.28, 0); legL.castShadow = true; group.add(legL);
      const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), blackPants);
      legR.position.set(0.1, 0.28, 0); legR.castShadow = true; group.add(legR);

      // Torso
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), redJacket);
      torso.position.set(0, 0.75, 0); torso.castShadow = true; group.add(torso);

      // White cross on jacket
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.01), whiteCross);
      crossH.position.set(0, 0.78, 0.13); group.add(crossH);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.01), whiteCross);
      crossV.position.set(0, 0.78, 0.13); group.add(crossV);

      // Arms
      const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 4, 6), redJacket);
      armL.position.set(-0.27, 0.72, 0); armL.castShadow = true; group.add(armL);
      const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 4, 6), redJacket);
      armR.position.set(0.27, 0.72, 0); armR.castShadow = true; group.add(armR);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skinMat);
      head.position.set(0, 1.12, 0); head.castShadow = true; group.add(head);

      // Red helmet
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
        redJacket);
      helmet.position.set(0, 1.16, 0); group.add(helmet);

      group.visible = false;
      this.scene.add(group);
      this.skiPatrol.push({
        group,
        legL, legR, armL, armR,
        time: 0,
        targetPos: new THREE.Vector3(),
        arrived: false,
        side: i === 0 ? -1 : 1,
      });
    }
  }

  spawnSkiPatrol(crashPos) {
    this.skiPatrolActive = true;
    for (const sp of this.skiPatrol) {
      sp.time = 0;
      sp.arrived = false;
      const startX = crashPos.x + sp.side * 8;
      const startZ = crashPos.z + 6;
      const startY = this.terrain.getHeightAt(startX, startZ);
      sp.group.position.set(startX, startY, startZ);
      sp.targetPos.set(crashPos.x + sp.side * 1.5, crashPos.y, crashPos.z);
      sp.group.visible = true;
      sp.group.rotation.y = sp.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
  }

  updateSkiPatrol(dt) {
    if (!this.skiPatrolActive) return;
    for (const sp of this.skiPatrol) {
      sp.time += dt;

      if (!sp.arrived) {
        // Run toward crash site
        const dx = sp.targetPos.x - sp.group.position.x;
        const dz = sp.targetPos.z - sp.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.3) {
          const speed = 10.0;
          sp.group.position.x += (dx / dist) * speed * dt;
          sp.group.position.z += (dz / dist) * speed * dt;
          const groundY = this.terrain.getHeightAt(sp.group.position.x, sp.group.position.z);
          sp.group.position.y = groundY;
          sp.group.rotation.y = Math.atan2(dx, dz);
          const runCycle = sp.time * 12;
          sp.legL.rotation.x = Math.sin(runCycle) * 0.6;
          sp.legR.rotation.x = Math.sin(runCycle + Math.PI) * 0.6;
          sp.armL.rotation.x = Math.sin(runCycle + Math.PI) * 0.5;
          sp.armR.rotation.x = Math.sin(runCycle) * 0.5;
        } else {
          sp.arrived = true;
          sp.time = 0;
          sp.group.rotation.y = Math.PI; // face camera (uphill)
        }
      } else {
        // Wii Sports bowling celebration
        const groundY = this.terrain.getHeightAt(sp.group.position.x, sp.group.position.z);
        const baseYaw = Math.PI; // face camera
        const cycleDur = 1.8;
        const t = sp.time % cycleDur;
        let jumpH = 0, spinAngle = 0, legTuck = 0, armRaise = 0;

        if (t < 0.35) {
          const p = t / 0.35;
          jumpH = Math.sin(p * Math.PI) * 0.5;
          legTuck = Math.sin(p * Math.PI) * 0.3;
          armRaise = Math.sin(p * Math.PI) * 0.4;
        } else if (t < 0.5) {
          // pause
        } else if (t < 1.1) {
          const p = (t - 0.5) / 0.6;
          jumpH = Math.sin(p * Math.PI) * 0.7;
          spinAngle = p * Math.PI * 2;
          legTuck = Math.sin(p * Math.PI) * 0.4;
          armRaise = 0.8 + Math.sin(p * Math.PI) * 0.3;
        } else if (t < 1.25) {
          armRaise = 0.3;
        } else if (t < 1.55) {
          const p = (t - 1.25) / 0.3;
          jumpH = Math.sin(p * Math.PI) * 0.2;
          legTuck = Math.sin(p * Math.PI) * 0.15;
          armRaise = 0.3 + Math.sin(p * Math.PI) * 0.2;
        } else {
          armRaise = 0.1;
        }

        sp.group.position.y = groundY + jumpH;
        sp.group.rotation.y = baseYaw + spinAngle;
        sp.legL.rotation.x = -legTuck;
        sp.legR.rotation.x = -legTuck;
        sp.armL.rotation.x = -armRaise;
        sp.armR.rotation.x = -armRaise;
        sp.armL.rotation.z = armRaise > 0.3 ? 0.4 : 0;
        sp.armR.rotation.z = armRaise > 0.3 ? -0.4 : 0;
      }
    }
  }

  hideSkiPatrol() {
    this.skiPatrolActive = false;
    for (const sp of this.skiPatrol) {
      sp.group.visible = false;
      sp.legL.rotation.set(0, 0, 0);
      sp.legR.rotation.set(0, 0, 0);
      sp.armL.rotation.set(0, 0, 0);
      sp.armR.rotation.set(0, 0, 0);
    }
  }

  // ---- DAVE NPC — RIVER RESCUE GUIDE ----

  initDave() {
    const blueJacket = new THREE.MeshStandardMaterial({ color: 0x2255cc, roughness: 0.8 });
    const tanPants = new THREE.MeshStandardMaterial({ color: 0xc4a76c, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5c6a0 });
    const beanieMat = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.7 });
    const beardMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 1.0 });

    const group = new THREE.Group();

    // Legs
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), tanPants);
    legL.position.set(-0.1, 0.28, 0); legL.castShadow = true; group.add(legL);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), tanPants);
    legR.position.set(0.1, 0.28, 0); legR.castShadow = true; group.add(legR);

    // Torso — blue jacket
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), blueJacket);
    torso.position.set(0, 0.75, 0); torso.castShadow = true; group.add(torso);

    // Arms
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 4, 6), blueJacket);
    armL.position.set(-0.27, 0.72, 0); armL.castShadow = true; group.add(armL);
    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 4, 6), blueJacket);
    armR.position.set(0.27, 0.72, 0); armR.castShadow = true; group.add(armR);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skinMat);
    head.position.set(0, 1.12, 0); head.castShadow = true; group.add(head);

    // Beanie
    const beanie = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
      beanieMat);
    beanie.position.set(0, 1.16, 0); group.add(beanie);

    // Beard
    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 4, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.4),
      beardMat);
    beard.position.set(0, 1.04, 0.06); group.add(beard);

    group.visible = false;
    this.scene.add(group);
    this.dave = { group, legL, legR, armL, armR };
  }

  spawnDave(riverZone) {
    if (!this.dave) return;
    const wp = riverZone.escapePath;
    if (!wp || wp.length === 0) return;

    this.daveState = 'appearing';
    this.daveTimer = 0;
    this.daveWaypoints = wp;
    this.daveWaypointIndex = 0;

    // Position Dave close to the player (offset ~5 units toward first waypoint)
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const dirX = wp[0].x - px;
    const dirZ = wp[0].z - pz;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const startX = px + (dirX / dirLen) * 5;
    const startZ = pz + (dirZ / dirLen) * 5;
    const startY = this.terrain.getHeightAt(startX, startZ);
    this.dave.group.position.set(startX, startY, startZ);
    this.dave.group.visible = true;

    // Face toward player
    const dx = px - startX;
    const dz = pz - startZ;
    this.dave.group.rotation.y = Math.atan2(dx, dz);
  }

  updateDave(dt) {
    if (this.daveState === 'hidden' || !this.dave) return;

    this.daveTimer += dt;
    const d = this.dave;

    if (this.daveState === 'appearing') {
      // Dave beckons with a waving arm for 2 seconds
      const wave = Math.sin(this.daveTimer * 8) * 0.6;
      d.armR.rotation.x = -1.2 + wave;
      d.armR.rotation.z = -0.5;
      d.armL.rotation.x = 0;

      if (this.daveTimer >= 2.0) {
        // Tell player to start following
        this.player.daveRescuing = true;
        this.daveState = 'leading';
        this.daveTimer = 0;
        this.daveWaypointIndex = 0;
      }
    } else if (this.daveState === 'leading') {
      // Dave walks along escape path waypoints, staying close to player
      if (this.daveWaypointIndex >= this.daveWaypoints.length) {
        this.daveState = 'waving';
        this.daveTimer = 0;
        return;
      }

      const wp = this.daveWaypoints[this.daveWaypointIndex];
      const dx = wp.x - d.group.position.x;
      const dz = wp.z - d.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 2) {
        this.daveWaypointIndex++;
        if (this.daveWaypointIndex >= this.daveWaypoints.length) {
          this.daveState = 'waving';
          this.daveTimer = 0;
          return;
        }
      }

      // Only move when player is close — keeps Dave on screen
      const pDx = d.group.position.x - this.player.position.x;
      const pDz = d.group.position.z - this.player.position.z;
      const playerDist = Math.sqrt(pDx * pDx + pDz * pDz);
      const maxLead = 8; // never get more than 8 units ahead of player

      if (playerDist < maxLead && dist > 0.1) {
        const speed = 9;
        d.group.position.x += (dx / dist) * speed * dt;
        d.group.position.z += (dz / dist) * speed * dt;
      }
      d.group.rotation.y = Math.atan2(dx, dz);
      const groundY = this.terrain.getHeightAt(d.group.position.x, d.group.position.z);
      d.group.position.y = groundY;

      // Run animation (idle when waiting for player)
      if (playerDist < maxLead) {
        const runCycle = this.daveTimer * 12;
        d.legL.rotation.x = Math.sin(runCycle) * 0.6;
        d.legR.rotation.x = Math.sin(runCycle + Math.PI) * 0.6;
        d.armL.rotation.x = Math.sin(runCycle + Math.PI) * 0.5;
        d.armL.rotation.z = 0;
        d.armR.rotation.x = Math.sin(runCycle) * 0.5;
        d.armR.rotation.z = 0;
      } else {
        // Waiting — beckon the player
        const wave = Math.sin(this.daveTimer * 6) * 0.4;
        d.armR.rotation.x = -1.2 + wave;
        d.armR.rotation.z = -0.3;
        d.legL.rotation.x = 0;
        d.legR.rotation.x = 0;
        d.armL.rotation.x = 0;
        d.armL.rotation.z = 0;
        // Face player while waiting
        d.group.rotation.y = Math.atan2(-pDx, -pDz);
      }
    } else if (this.daveState === 'waving') {
      // Dave waves goodbye for 2.5 seconds
      const wave = Math.sin(this.daveTimer * 6) * 0.4;
      d.armR.rotation.x = -1.5 + wave;
      d.armR.rotation.z = -0.3;
      d.armL.rotation.x = 0;
      d.armL.rotation.z = 0;

      // Face player
      const dx = this.player.position.x - d.group.position.x;
      const dz = this.player.position.z - d.group.position.z;
      d.group.rotation.y = Math.atan2(dx, dz);

      if (this.daveTimer >= 2.5) {
        this.daveState = 'departing';
        this.daveTimer = 0;
      }
    } else if (this.daveState === 'departing') {
      // Dave skis away uphill for 2 seconds then hides
      d.group.position.z += 10 * dt; // move uphill (+Z)
      const groundY = this.terrain.getHeightAt(d.group.position.x, d.group.position.z);
      d.group.position.y = groundY;
      d.group.rotation.y = 0; // face uphill

      const runCycle = this.daveTimer * 10;
      d.legL.rotation.x = Math.sin(runCycle) * 0.4;
      d.legR.rotation.x = Math.sin(runCycle + Math.PI) * 0.4;

      if (this.daveTimer >= 2.0) {
        this.hideDave();
      }
    }
  }

  hideDave() {
    if (!this.dave) return;
    this.daveState = 'hidden';
    this.daveTimer = 0;
    this.dave.group.visible = false;
    this.dave.legL.rotation.set(0, 0, 0);
    this.dave.legR.rotation.set(0, 0, 0);
    this.dave.armL.rotation.set(0, 0, 0);
    this.dave.armR.rotation.set(0, 0, 0);
  }

  _createTrailMesh(maxSegs, material) {
    const positions = new Float32Array(maxSegs * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Pre-allocate index buffer as ring buffer — no push/splice per frame
    const maxIndices = maxSegs * 6;
    const indexArray = new Uint16Array(maxIndices);
    const indexAttr = new THREE.BufferAttribute(indexArray, 1);
    geometry.setIndex(indexAttr);
    indexAttr.count = 0;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, indexArray, indexStart: 0, indexCount: 0, maxIndices, index: 0, count: 0, lastPos: null };
  }

  _resetTrail(trail) {
    trail.index = 0;
    trail.count = 0;
    trail.lastPos = null;
    trail.indexStart = 0;
    trail.indexCount = 0;
    const indexAttr = trail.mesh.geometry.index;
    indexAttr.count = 0;
    indexAttr.needsUpdate = true;
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
      // Write 6 indices into ring buffer (no push/splice)
      const writePos = (trail.indexStart + trail.indexCount) % trail.maxIndices;
      trail.indexArray[writePos]     = prev;
      trail.indexArray[writePos + 1] = prev + 1;
      trail.indexArray[writePos + 2] = curr;
      trail.indexArray[writePos + 3] = curr;
      trail.indexArray[writePos + 4] = prev + 1;
      trail.indexArray[writePos + 5] = curr + 1;

      if (trail.indexCount + 6 > trail.maxIndices) {
        // Buffer full — advance start, evict oldest segment
        trail.indexStart = (trail.indexStart + 6) % trail.maxIndices;
      } else {
        trail.indexCount += 6;
      }

      // Update draw range without reallocating
      const indexAttr = trail.mesh.geometry.index;
      indexAttr.needsUpdate = true;
      indexAttr.count = trail.indexCount;
      // Shift updateRange to cover written region
      trail.mesh.geometry.setDrawRange(0, trail.indexCount);
    }

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

      // Backcountry powder spray — stomps and hard carves
      if (this.gameMode === 'backcountry') {
        // Stomp spray — big powder burst on landing
        if (playerState.grounded && !playerState.wasGrounded && playerState.airTime > 0.3) {
          const impactSpeed = Math.abs(playerState.velocityY || 0);
          const stompCount = Math.min(Math.ceil(impactSpeed * 6), 80);
          const spread = Math.min(impactSpeed * 0.8, 6);
          const pos = this.player.position;
          // Spray outward in all directions from landing point
          for (let i = 0; i < stompCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = (1 + Math.random() * spread);
            this.particles.emit(
              { x: pos.x, y: pos.y, z: pos.z },
              { x: Math.cos(angle) * spd, y: 2 + Math.random() * impactSpeed * 0.5, z: Math.sin(angle) * spd },
              1
            );
          }
        }

        // Hard carve spray — powder rooster tail on aggressive turns
        const turnStrength = Math.abs(playerState.turnRate || 0);
        if (playerState.grounded && playerState.speed > 8 && turnStrength > 1.2) {
          const intensity = (turnStrength - 1.2) / (2.3 - 1.2); // 0-1 based on turn range
          const carveCount = Math.ceil(intensity * playerState.speed * 0.4);
          // Spray kicks out to the outside of the turn
          const turnDir = playerState.turnRate > 0 ? -1 : 1;
          const heading = this.player.heading;
          const sideX = Math.cos(heading) * turnDir;
          const sideZ = -Math.sin(heading) * turnDir;
          const pos = this.player.position;
          for (let i = 0; i < Math.min(carveCount, 12); i++) {
            const spraySpeed = 2 + Math.random() * playerState.speed * 0.2;
            this.particles.emit(
              { x: pos.x + sideX * 0.5, y: pos.y + 0.1, z: pos.z + sideZ * 0.5 },
              { x: sideX * spraySpeed + (Math.random() - 0.5), y: 1.5 + Math.random() * 2, z: sideZ * spraySpeed + (Math.random() - 0.5) },
              1
            );
          }
        }
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

      // Tomahawk — snow burst on start, then death after animation
      if (playerState.tomahawking) {
        if (!this._tomahawkStarted) {
          this._tomahawkStarted = true;
          this.particles.emit(this.player.position, { x: 0, y: 5, z: 0 }, 60);
        }
      } else {
        this._tomahawkStarted = false;
      }

      // Crash (old system — still used for obstacle collisions)
      if (playerState.crashed) {
        this.deathTimer += dt;
        this.ui.crashVignette.style.opacity = Math.min(this.deathTimer * 2, 1).toString();

        // Set crash phrase once
        if (!this.crashPhraseSet) {
          this.tricks.pickCrashPhrase();
          this.crashPhraseSet = true;
          // Snow burst at crash point
          this.particles.emit(this.player.position, { x: 0, y: 5, z: 0 }, 80);
          // Ski patrol rushes in
          this.spawnSkiPatrol(this.player.position);
        }
        this.updateSkiPatrol(dt);

        if (this.deathTimer >= this.deathDelay) {
          this.showDeathScreen();
        }
      } else {
        this.ui.crashVignette.style.opacity = '0';
        this.crashPhraseSet = false;
      }

      // Dave NPC — river rescue (Peak backcountry)
      if (playerState.inRiver && !playerState.daveRescuing && this.daveState === 'hidden') {
        if (this.player.riverZone) {
          this.spawnDave(this.player.riverZone);
        }
      }
      this.updateDave(dt);

      // Camera
      this.updateCamera(dt, playerState);

      // Shadow follows player — throttled to reduce GPU shadow map updates
      const _sp = this._lastSunUpdatePos;
      const _dx = this.player.position.x - _sp.x;
      const _dy = this.player.position.y - _sp.y;
      const _dz = this.player.position.z - _sp.z;
      if (_dx * _dx + _dy * _dy + _dz * _dz > 4) { // > 2 units moved
        this.sun.position.set(
          this.player.position.x + 30,
          this.player.position.y + 50,
          this.player.position.z + 20
        );
        this.sun.target.position.copy(this.player.position);
        this.sun.target.updateMatrixWorld();
        _sp.x = this.player.position.x;
        _sp.y = this.player.position.y;
        _sp.z = this.player.position.z;
      }

      // Multiplayer: send local state and update remote players
      this.multiplayer.update(dt, this.camera);

      // Star field follows player (backcountry night)
      if (this.starField) {
        this.starField.position.x = this.player.position.x;
        this.starField.position.y = this.player.position.y;
        this.starField.position.z = this.player.position.z - 50;

        // Star warp effect: stars spin when player is 30+ feet in the air
        const heightFt = playerState.jumpHeightFeet || 0;
        // Gentle start at 30ft, current speed reached at ~200ft, max at 350ft+
        const targetWarp = heightFt > 30 ? Math.min(1.0, (heightFt - 30) / 320) : 0;
        const currentWarp = this.starField.material.uniforms.uWarp.value;
        // Smooth ramp up/down
        this.starField.material.uniforms.uWarp.value +=
          (targetWarp - currentWarp) * Math.min(1, dt * (targetWarp > currentWarp ? 4 : 6));
        this.starField.material.uniforms.uTime.value += dt;
      }

      // Shooting stars when airborne above 30ft at night
      if (this.nightMode) {
        this.updateShootingStars(dt, playerState.jumpHeightFeet || 0);
      }

      // UI
      this.updateUI(trickState, playerState);
    } else if (this.state === 'dead' || this.state === 'finished') {
      this.particles.update(dt);
      this.updateSkiPatrol(dt);
      this.multiplayer.update(dt, this.camera);
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
    const bc = this.gameMode === 'backcountry';
    const speedZoom = Math.min(speed * 0.04, mobile ? 0.6 : 1.8);
    const offset = this.cameraOffset.clone();
    // Backcountry: pull camera higher and further back to see the wide bowl
    if (bc && !mobile) {
      offset.y += 3;
      offset.z += 3;
    }
    if (!mobile) offset.y += speedZoom;
    offset.z += speedZoom * (mobile ? 0.5 : 1.5);

    // Pull camera back when airborne for epic view (minimal on mobile)
    if (playerState.isAirborne) {
      const airPull = Math.min(playerState.airTime * 1.5, mobile ? 1.2 : 3.5);
      if (!mobile) offset.y += airPull * 0.5;
      offset.z += airPull * (mobile ? 0.3 : 1);
    }

    if (playerState.crashed) {
      offset.y += this.deathTimer * 3;
      offset.z += this.deathTimer * 5;
    }

    const targetPos = this.player.position.clone().add(offset);
    // Per-frame follow strength at 60fps, converted so the camera trails the same
    // distance at any frame rate (it used to fall far behind on slow devices)
    const lerpAt60 = mobile ? 0.25 : (playerState.crashed ? 0.02 : 0.1);
    const lerpSpeed = 1 - Math.pow(1 - lerpAt60, dt * 60);
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

    // Backcountry: reset terrain so chunks around checkpoint are loaded
    if (this.gameMode === 'backcountry' && this.terrain.reset) {
      this.terrain.reset(this.lastCheckpointPos.z);
      // Mark already-passed checkpoints as reached so they don't re-trigger
      for (let i = 0; i < Math.min(this.currentCheckpoint, this.terrain.checkpoints.length); i++) {
        this.terrain.checkpoints[i].reached = true;
      }
    }

    this.player.respawn(this.lastCheckpointPos);
    this.currentCameraPos.copy(
      this.lastCheckpointPos.clone().add(this.cameraOffset)
    );
    this.hideSkiPatrol();
    this.hideDave();
  }

  showFinishScreen() {
    this.state = 'finished';
    if (this.touchControls) this.touchControls.hide();
    const finalScore = this.tricks.totalScore;
    const isSummit = this.gameMode === 'backcountry';

    // Pick a finish catchphrase based on score
    let phrase;
    if (finalScore >= 20000) phrase = 'ABSOLUTELY GODLIKE!';
    else if (finalScore >= 10000) phrase = 'LEGENDARY RUN!';
    else if (finalScore >= 5000) phrase = 'THAT WAS SICK!';
    else if (finalScore >= 2000) phrase = 'SOLID RIDING!';
    else phrase = 'YOU MADE IT!';

    // Track quest: run complete
    this.quests.onRunComplete(finalScore);

    // Save to appropriate personal leaderboard
    const isNewRecord = isSummit
      ? this.addToSummitLeaderboard(finalScore)
      : this.addToLeaderboard(finalScore);

    // Title: use terrain name or fallback
    const parkName = this.terrain.config ? this.terrain.config.name : null;
    this.ui.finishTitle.textContent = isSummit ? 'SUMMIT LEADERBOARD' : (parkName || 'RUN COMPLETE');

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

    if (isSummit) {
      // Summit: all-time, no week indicator
      this.ui.weekIndicator.textContent = 'ALL TIME';
      this.renderSummitLeaderboard(finalScore);
      this.switchLeaderboardTab('worldwide');
      this.submitAndFetchSummitWorldwide(finalScore);
    } else {
      // Park: all-time leaderboard
      this.ui.weekIndicator.textContent = 'ALL TIME';
      this.renderLeaderboard(finalScore);
      this.switchLeaderboardTab('worldwide');
      this.submitAndFetchWorldwide(finalScore);
    }
  }

  async submitAndFetchWorldwide(finalScore) {
    const db = this.firebaseDb;
    const nickname = this.nicknameManager.getNickname() || 'ANON';

    // Show loading state
    this.ui.worldwideLoading.style.display = 'block';
    this.ui.worldwideError.style.display = 'none';
    this.ui.worldwideEntries.innerHTML = '';

    try {
      // Submit score to Firebase (include ride pass title and park ID)
      const title = this.ridePass.getSelectedTitle();
      await submitScore(db, nickname, finalScore, title, this.parkId);

      // Fetch worldwide leaderboard (returns null on error, [] on empty)
      const scores = await fetchWorldwideScores(db, 20, this.parkId);

      this.ui.worldwideLoading.style.display = 'none';

      if (scores === null) {
        // Firebase unavailable or query failed
        this.ui.worldwideError.style.display = 'block';
        this.ui.worldwideError.textContent = 'OFFLINE — CHECK CONNECTION';
        return;
      }

      if (scores.length === 0) {
        // Connected but no scores yet
        this.ui.worldwideError.style.display = 'block';
        this.ui.worldwideError.textContent = 'NO SCORES YET — BE THE FIRST!';
        return;
      }

      this.worldwideScores = scores;
      this.renderWorldwideLeaderboard(finalScore, nickname);
    } catch (e) {
      console.warn('Worldwide leaderboard error:', e);
      this.ui.worldwideLoading.style.display = 'none';
      this.ui.worldwideError.style.display = 'block';
      this.ui.worldwideError.textContent = 'OFFLINE — CHECK CONNECTION';
    }
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
      container.innerHTML = '<div class="lb-loading">NO SCORES YET</div>';
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

    // Ensure backcountry mode flag stays in sync
    this.player.backcountryMode = this.gameMode === 'backcountry';

    // Backcountry: reset terrain so chunks at start are loaded
    if (this.gameMode === 'backcountry' && this.terrain.reset) {
      this.terrain.reset(0);
    }

    // Reset checkpoints
    for (const cp of this.terrain.checkpoints) {
      cp.reached = false;
    }

    // Respawn player at start
    const startPos = new THREE.Vector3(0, 5, 0);
    this.lastCheckpointPos.copy(startPos);
    this.player.respawn(startPos);
    this.currentCameraPos.copy(startPos.clone().add(this.cameraOffset));

    this.hideSkiPatrol();
    this.hideDave();

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
    this.player.group.rotation.set(0, Math.PI / 2, 0); // Face directly toward campfire
    this.player.setSittingPose();
    this.player.setBoardVisible(false);

    // === MULTIPLAYER LOBBY MEMBERS ===
    this.lobbyFireX = fireX;
    this.lobbyFireZ = fireZ;
    this.lobbyBaseGroundY = groundY;
    this.lobbyRemotePlayers = {};
    this.lobbyLogs = [];
    if (this.multiplayer.active) {
      this.syncLobbyRemotePlayers();
    }

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

    // Dispose lobby remote players
    if (this.lobbyRemotePlayers) {
      for (const uid of Object.keys(this.lobbyRemotePlayers)) {
        this.lobbyRemotePlayers[uid].dispose();
      }
      this.lobbyRemotePlayers = null;
    }
    this.lobbyLogs = null;

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

  syncLobbyRemotePlayers() {
    if (!this.lobbyGroup || this.state !== 'lobby') return;

    const selfUid = this.currentUser?.uid;
    if (!selfUid) return;

    const members = this.multiplayer.members;
    const fireX = this.lobbyFireX;
    const fireZ = this.lobbyFireZ;
    const R = 1.8;

    // Seat angles for up to 3 remote players (semicircle around fire)
    const REMOTE_SEAT_ANGLES = [3 * Math.PI / 4, Math.PI / 4, Math.PI];
    const remoteMemberUids = Object.keys(members)
      .filter(uid => uid !== selfUid && members[uid].status !== 'riding');

    // Remove players who left
    for (const uid of Object.keys(this.lobbyRemotePlayers)) {
      if (!remoteMemberUids.includes(uid)) {
        this.lobbyRemotePlayers[uid].dispose();
        delete this.lobbyRemotePlayers[uid];
      }
    }

    // Remove old extra logs
    for (const logGroup of this.lobbyLogs) {
      this.lobbyGroup.remove(logGroup);
      logGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material && child.material.dispose) child.material.dispose();
      });
    }
    this.lobbyLogs = [];

    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });

    remoteMemberUids.forEach((uid, index) => {
      if (index >= 3) return;

      const angle = REMOTE_SEAT_ANGLES[index];
      const seatX = fireX + Math.cos(angle) * R;
      const seatZ = fireZ + Math.sin(angle) * R;
      const seatTerrainY = this.terrain.getHeightAt(seatX, seatZ);
      const seatGroundY = seatTerrainY + 0.05;

      // Sitting log
      const logGroup = new THREE.Group();
      logGroup.position.set(seatX, seatGroundY + 0.15, seatZ);
      logGroup.rotation.y = angle;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.18, 1.4, 8),
        logMat.clone()
      );
      log.rotation.z = Math.PI / 2;
      logGroup.add(log);
      this.lobbyGroup.add(logGroup);
      this.lobbyLogs.push(logGroup);

      // Create remote player if new
      if (!this.lobbyRemotePlayers[uid]) {
        const data = members[uid];
        const remote = new RemotePlayer(
          this.scene,
          uid,
          data.nickname || 'Player',
          data.cosmetics || {}
        );
        this.lobbyRemotePlayers[uid] = remote;
      }

      const remote = this.lobbyRemotePlayers[uid];
      remote.player.group.position.set(seatX, seatGroundY - 0.25, seatZ);
      remote.player.group.rotation.set(0, angle, 0);
      remote.player.setSittingPose();
      remote.player.setBoardVisible(false);
      remote.lastUpdateTime = performance.now();
      remote.player.group.visible = true;
    });
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

    // Update lobby remote player nickname positions
    if (this.lobbyRemotePlayers) {
      for (const remote of Object.values(this.lobbyRemotePlayers)) {
        remote.updateNicknamePosition(this.camera);
        if (remote.trickDiv) remote.trickDiv.style.display = 'none';
      }
    }
  }

  // ---- ACCOUNT ----

  renderAccountPanel() {
    // Email
    this.ui.accountEmail.textContent = this.currentUser ? this.currentUser.email : '\u2014';

    // Nickname
    const nick = this.nicknameManager.getNickname();
    this.ui.accountNickname.textContent = nick || '\u2014';
    // Reset edit state
    this.ui.accountNicknameEditRow.style.display = 'none';
    this.ui.accountNickname.parentElement.style.display = 'flex';
    this.ui.accountNicknameError.textContent = '';

    // Titles
    const titles = this.ridePass.getUnlockedTitles();
    const selected = this.ridePass.getSelectedTitle();
    if (titles.length === 0) {
      this.ui.accountTitleOptions.innerHTML = '<span style="color:rgba(255,255,255,0.3); font-family:\'Bebas Neue\',sans-serif; letter-spacing:2px; font-size:14px;">NO TITLES UNLOCKED</span>';
    } else {
      const noneSelected = selected === null;
      let html = `<button class="rp-title-btn${noneSelected ? ' selected' : ''}" data-title="">NONE</button>`;
      html += titles.map(t =>
        `<button class="rp-title-btn${t === selected ? ' selected' : ''}" data-title="${t}">${t}</button>`
      ).join('');
      this.ui.accountTitleOptions.innerHTML = html;

      this.ui.accountTitleOptions.querySelectorAll('.rp-title-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const title = btn.dataset.title || null;
          this.ridePass.selectTitle(title);
          this.ui.accountTitleOptions.querySelectorAll('.rp-title-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }
  }

  loadPlayerModel() {
    // GLB character model disabled — using procedural rider for now
    // To re-enable Human Model 1 (Mixamo GLB):
    // const modelPath = import.meta.env.BASE_URL + 'models/character.glb';
    // this.player.loadCharacterModel(modelPath).catch((err) => {
    //   console.warn('[Game] No GLB character model found, using procedural rider.', err.message || err);
    // });
  }

  applyEquippedItems() {
    const equipped = this.shop.getEquipped();

    // Apply clothing colors + baggy pants + jacket logos + legendary effects
    let isBaggy = false;
    for (const category of ['jacket', 'pants', 'helmet']) {
      const item = this.shop.getEquippedItem(category);
      if (item) {
        this.player.setColor(category, item.color);
        if (category === 'pants' && item.baggy) isBaggy = true;
        if (category === 'jacket') {
          this.player.applyJacketLogo(createJacketLogo(item.brand, item.color));
          this.player.setLegendaryMaterial('jacket', !!item.legendary);
        }
        if (category === 'pants') {
          this.player.setLegendaryMaterial('pants', !!item.legendary);
        }
        if (category === 'helmet') {
          this.player.setHaloMode(item.id === 'legend-halo-helmet');
        }
      } else {
        if (category === 'jacket') {
          this.player.applyJacketLogo(null);
          this.player.setLegendaryMaterial('jacket', false);
        }
        if (category === 'pants') this.player.setLegendaryMaterial('pants', false);
        if (category === 'helmet') this.player.setHaloMode(false);
      }
    }
    this.player.setBaggyPants(isBaggy);

    // Apply board/ski color, stats, graphics, and binding color
    const boardItem = this.shop.getEquippedItem('board');
    if (boardItem && boardItem.stats) {
      const boardTexture = createBoardTexture(boardItem.id, boardItem.color);
      this.player.applyBoardGraphic(boardTexture);
      this.player.setColor('board', boardItem.color);
      this.player.applyBoardStats(boardItem.stats.speed, boardItem.stats.pop, boardItem.stats.flex);
      this.player.setBindingColor(boardItem.bindingColor || 0x222222);
    } else {
      this.player.applyBoardGraphic(null);
      this.player.applyBoardStats(5, 5, 5);
      this.player.setBindingColor(0x222222);
    }
  }

  // ---- LEADERBOARD ----

  loadLeaderboard() {
    const parkId = this.parkId || 'big-white';
    try {
      // Try per-park key first, fall back to legacy key for big-white
      const data = localStorage.getItem(`shred-summit-park-leaderboard-${parkId}`)
        || (parkId === 'big-white' ? localStorage.getItem('shred-summit-leaderboard') : null);
      if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return [];
  }

  saveLeaderboard() {
    const parkId = this.parkId || 'big-white';
    try {
      localStorage.setItem(`shred-summit-park-leaderboard-${parkId}`, JSON.stringify(this.leaderboard));
    } catch (e) { /* ignore */ }
    this.cloudSaveAll();
  }

  // ---- SUMMIT LEADERBOARD (backcountry, all-time) ----

  loadSummitLeaderboard() {
    const chair = this.backcountryChair || 'peak';
    try {
      const data = localStorage.getItem(`shred-summit-summit-leaderboard-${chair}`);
      if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return [];
  }

  saveSummitLeaderboard() {
    const chair = this.backcountryChair || 'peak';
    try {
      localStorage.setItem(`shred-summit-summit-leaderboard-${chair}`, JSON.stringify(this.summitLeaderboard));
    } catch (e) { /* ignore */ }
  }

  addToSummitLeaderboard(score) {
    const entry = { score, date: Date.now() };
    this.summitLeaderboard.push(entry);
    this.summitLeaderboard.sort((a, b) => b.score - a.score);
    if (this.summitLeaderboard.length > 10) this.summitLeaderboard.length = 10;
    this.saveSummitLeaderboard();
    return this.summitLeaderboard[0].score === score && this.summitLeaderboard[0].date === entry.date;
  }

  renderSummitLeaderboard(currentScore) {
    const container = this.ui.leaderboardEntries;
    container.innerHTML = '';
    const entries = this.summitLeaderboard.slice(0, 5);
    let currentMarked = false;

    entries.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'leaderboard-entry';
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

    if (entries.length === 0) {
      container.textContent = 'No summit runs yet!';
    }
  }

  async submitAndFetchSummitWorldwide(finalScore) {
    const db = this.firebaseDb;
    const nickname = this.nicknameManager.getNickname() || 'ANON';

    this.ui.worldwideLoading.style.display = 'block';
    this.ui.worldwideError.style.display = 'none';
    this.ui.worldwideEntries.innerHTML = '';

    try {
      const title = this.ridePass.getSelectedTitle();
      await submitSummitScore(db, nickname, finalScore, this.backcountryChair, title);
      const scores = await fetchSummitScores(db, this.backcountryChair, 20);

      this.ui.worldwideLoading.style.display = 'none';

      if (scores === null) {
        this.ui.worldwideError.style.display = 'block';
        this.ui.worldwideError.textContent = 'OFFLINE — CHECK CONNECTION';
        return;
      }

      if (scores.length === 0) {
        this.ui.worldwideError.style.display = 'block';
        this.ui.worldwideError.textContent = 'NO SUMMIT SCORES YET — BE THE FIRST!';
        return;
      }

      this.worldwideScores = scores;
      this.renderWorldwideLeaderboard(finalScore, nickname);
    } catch (e) {
      console.warn('Summit leaderboard error:', e);
      this.ui.worldwideLoading.style.display = 'none';
      this.ui.worldwideError.style.display = 'block';
      this.ui.worldwideError.textContent = 'OFFLINE — CHECK CONNECTION';
    }
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

  // Pop meter: shows while jump is held, then briefly shows how the pop went
  updatePopMeter() {
    const p = this.player;
    const [lo, hi] = p.popSweetSpot;
    const meter = p.ollieCharge;
    const sincePop = performance.now() - p.lastPopTime;
    const el = this.ui.popMeter;
    if (meter > 0) {
      this._popMeterShown = meter;
      this.ui.popMeterFill.style.width = `${meter * 100}%`;
      el.classList.toggle('in-sweet', meter >= lo && meter <= hi);
      el.classList.toggle('over', meter > hi);
      el.classList.remove('perfect');
      this.ui.popMeterLabel.textContent = meter > hi ? 'TOO LONG' : 'POP';
      el.classList.add('visible');
    } else if (sincePop < 700 && this._popMeterShown) {
      el.classList.toggle('perfect', p.lastPopPerfect);
      this.ui.popMeterLabel.textContent = p.lastPopPerfect ? 'PERFECT POP' : 'POP';
      el.classList.add('visible');
    } else {
      el.classList.remove('visible', 'perfect', 'in-sweet', 'over');
      this._popMeterShown = 0;
    }
  }

  updateUI(trickState, playerState) {
    // Score
    this.ui.score.textContent = trickState.score.toLocaleString();

    // Speed (divide by visual scale so display matches original feel)
    const kmh = Math.round(playerState.speed / 1.2 * 3.6);
    this.ui.speed.textContent = kmh;

    this.updatePopMeter();

    // Altitude
    const alt = Math.round(2400 + this.player.position.y * 0.5);
    this.ui.altitude.textContent = `ALT ${alt}m`;

    // Checkpoint
    const totalCheckpoints = this.terrain.checkpointCount || this.terrain.config?.checkpointCount || 8;
    this.ui.checkpoint.textContent = `CHECKPOINT ${this.currentCheckpoint} / ${totalCheckpoints}`;

    // Checkpoint alert
    const timeSinceCP = performance.now() - this.checkpointAlertTime;
    if (timeSinceCP < 2000) {
      this.ui.checkpointAlert.style.opacity = timeSinceCP < 1500 ? '1' : String(1 - (timeSinceCP - 1500) / 500);
      this.ui.checkpointAlert.textContent = `CHECKPOINT ${this.currentCheckpoint} — +${500 * this.currentCheckpoint} PTS`;
    } else {
      this.ui.checkpointAlert.style.opacity = '0';
    }

    this.updatePartyHud();

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
