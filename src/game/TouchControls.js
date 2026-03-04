import { isTouchDevice } from './InputManager.js';

export class TouchControls {
  constructor(inputManager) {
    this.input = inputManager;
    this.activeTouches = new Map(); // touchId → buttonId
    this._wasAirborne = false;
    this.visible = false;

    this.container = document.getElementById('touch-controls');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'touch-controls';
      this.container.className = 'touch-controls';
      document.body.appendChild(this.container);
    }

    this.buildGroundControls();
    this.buildAirControls();
    this.hide();
  }

  // === GROUND CONTROLS (always visible during play) ===
  buildGroundControls() {
    this.groundGroup = document.createElement('div');
    this.groundGroup.className = 'touch-ground-controls';

    // --- Steer Zone ---
    const steerZone = document.createElement('div');
    steerZone.className = 'touch-steer-zone';
    const steerL = document.createElement('div');
    steerL.className = 'steer-half steer-left';
    steerL.textContent = '◄';
    const steerR = document.createElement('div');
    steerR.className = 'steer-half steer-right';
    steerR.textContent = '►';
    steerZone.appendChild(steerL);
    steerZone.appendChild(steerR);
    this.setupSteerZone(steerZone);
    this.groundGroup.appendChild(steerZone);

    // --- Brake ---
    const brake = this.createButton('BRAKE', 'brake-btn', 'touch-btn');
    this.setupHoldButton(brake, 'KeyS', 'brake');
    this.groundGroup.appendChild(brake);

    // --- Jump ---
    const jump = this.createButton('JUMP', 'jump-btn', 'touch-btn jump-btn-size');
    this.setupTapButton(jump, 'jump');
    this.groundGroup.appendChild(jump);

    // --- Tuck ---
    const tuck = this.createButton('TUCK', 'tuck-btn', 'touch-btn');
    this.setupHoldButton(tuck, 'ShiftLeft', 'tuck');
    this.groundGroup.appendChild(tuck);

    this.container.appendChild(this.groundGroup);
  }

  // === AIR CONTROLS (shown only when airborne) ===
  buildAirControls() {
    this.airGroup = document.createElement('div');
    this.airGroup.className = 'touch-air-controls';

    // --- Flips (left side) ---
    const flipFwd = this.createButton('FLIP▲', 'flip-fwd-btn', 'touch-btn air-btn');
    this.setupHoldButton(flipFwd, 'KeyW', 'flipFwd');
    this.airGroup.appendChild(flipFwd);

    const flipBack = this.createButton('FLIP▼', 'flip-back-btn', 'touch-btn air-btn');
    this.setupHoldButton(flipBack, 'KeyS', 'flipBack');
    this.airGroup.appendChild(flipBack);

    // --- Spins (right side) ---
    const spinL = this.createButton('SPIN◄', 'spin-l-btn', 'touch-btn air-btn');
    this.setupHoldButton(spinL, 'KeyQ', 'spinL');
    this.airGroup.appendChild(spinL);

    const spinR = this.createButton('SPIN►', 'spin-r-btn', 'touch-btn air-btn');
    this.setupHoldButton(spinR, 'KeyE', 'spinR');
    this.airGroup.appendChild(spinR);

    // --- Grab buttons (center arc) ---
    const grabs = [
      { label: 'INDY', key: 'KeyG', id: 'grab-indy' },
      { label: 'METHOD', key: 'KeyR', id: 'grab-method' },
      { label: 'STALE', key: 'KeyF', id: 'grab-stale' },
      { label: 'MELON', key: 'KeyT', id: 'grab-melon' },
      { label: 'NOSE', key: 'KeyV', id: 'grab-nose' },
      { label: 'TAIL', key: 'KeyC', id: 'grab-tail' },
    ];

    this.grabContainer = document.createElement('div');
    this.grabContainer.className = 'touch-grab-arc';

    grabs.forEach((g) => {
      const btn = this.createButton(g.label, g.id, 'touch-btn grab-btn');
      this.setupHoldButton(btn, g.key, g.id);
      this.grabContainer.appendChild(btn);
    });

    this.airGroup.appendChild(this.grabContainer);
    this.container.appendChild(this.airGroup);
  }

  // === BUTTON HELPERS ===
  createButton(label, id, className) {
    const btn = document.createElement('div');
    btn.className = className;
    btn.id = id;
    btn.textContent = label;
    return btn;
  }

  setupHoldButton(btn, keyCode, buttonId) {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of e.changedTouches) {
        this.activeTouches.set(touch.identifier, buttonId);
      }
      this.input.setTouchKey(keyCode, true);
      btn.classList.add('active');
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      let stillHeld = false;
      for (const touch of e.changedTouches) {
        if (this.activeTouches.get(touch.identifier) === buttonId) {
          this.activeTouches.delete(touch.identifier);
        }
      }
      // Check if another finger is still on this button
      for (const [, id] of this.activeTouches) {
        if (id === buttonId) { stillHeld = true; break; }
      }
      if (!stillHeld) {
        this.input.setTouchKey(keyCode, false);
        btn.classList.remove('active');
      }
    }, { passive: false });

    btn.addEventListener('touchcancel', (e) => {
      for (const touch of e.changedTouches) {
        this.activeTouches.delete(touch.identifier);
      }
      this.input.setTouchKey(keyCode, false);
      btn.classList.remove('active');
    }, { passive: false });
  }

  setupTapButton(btn, buttonId) {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.triggerTouchJump();
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 150);
    }, { passive: false });
  }

  setupSteerZone(zone) {
    const getDir = (touch) => {
      const rect = zone.getBoundingClientRect();
      const relX = touch.clientX - rect.left;
      return relX < rect.width / 2 ? 'left' : 'right';
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of e.changedTouches) {
        const dir = getDir(touch);
        this.activeTouches.set(touch.identifier, 'steer-' + dir);
        this.input.setTouchKey(dir === 'left' ? 'KeyA' : 'KeyD', true);
      }
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const prev = this.activeTouches.get(touch.identifier);
        if (prev && prev.startsWith('steer-')) {
          const newDir = getDir(touch);
          const oldDir = prev.replace('steer-', '');
          if (newDir !== oldDir) {
            this.input.setTouchKey(oldDir === 'left' ? 'KeyA' : 'KeyD', false);
            this.input.setTouchKey(newDir === 'left' ? 'KeyA' : 'KeyD', true);
            this.activeTouches.set(touch.identifier, 'steer-' + newDir);
          }
        }
      }
    }, { passive: false });

    const endSteer = (e) => {
      for (const touch of e.changedTouches) {
        const prev = this.activeTouches.get(touch.identifier);
        if (prev && prev.startsWith('steer-')) {
          const dir = prev.replace('steer-', '');
          this.activeTouches.delete(touch.identifier);
          // Check if another finger still steers this direction
          let stillHeld = false;
          for (const [, id] of this.activeTouches) {
            if (id === prev) { stillHeld = true; break; }
          }
          if (!stillHeld) {
            this.input.setTouchKey(dir === 'left' ? 'KeyA' : 'KeyD', false);
          }
        }
      }
    };

    zone.addEventListener('touchend', (e) => { e.preventDefault(); endSteer(e); }, { passive: false });
    zone.addEventListener('touchcancel', (e) => { endSteer(e); }, { passive: false });
  }

  // === STATE MANAGEMENT ===
  update(playerState) {
    if (!playerState) return;
    const airborne = playerState.isAirborne;
    if (airborne !== this._wasAirborne) {
      this._wasAirborne = airborne;
      if (airborne) {
        this.showAirControls();
      } else {
        this.hideAirControls();
      }
    }
  }

  showAirControls() {
    this.airGroup.classList.add('visible');
  }

  hideAirControls() {
    this.airGroup.classList.remove('visible');
    // Release all air-specific keys to prevent stuck inputs
    const airKeys = ['KeyW', 'KeyS', 'KeyQ', 'KeyE', 'KeyG', 'KeyR', 'KeyF', 'KeyT', 'KeyV', 'KeyC'];
    airKeys.forEach(k => this.input.setTouchKey(k, false));
    // Clean up active touches for air buttons
    const airIds = ['flipFwd', 'flipBack', 'spinL', 'spinR', 'grab-indy', 'grab-method', 'grab-stale', 'grab-melon', 'grab-nose', 'grab-tail'];
    for (const [touchId, btnId] of this.activeTouches) {
      if (airIds.includes(btnId)) {
        this.activeTouches.delete(touchId);
      }
    }
    // Remove active class from all air buttons
    this.airGroup.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
  }

  show() {
    this.container.style.display = '';
    this.visible = true;
    this._wasAirborne = false;
    this.hideAirControls();
  }

  hide() {
    this.container.style.display = 'none';
    this.visible = false;
    // Release everything
    this.activeTouches.clear();
    const allKeys = ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyQ', 'KeyE', 'ShiftLeft', 'Space', 'KeyG', 'KeyR', 'KeyF', 'KeyT', 'KeyV', 'KeyC'];
    allKeys.forEach(k => this.input.setTouchKey(k, false));
    this.container.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
  }
}
