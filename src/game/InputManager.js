export class InputManager {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    this._previousKeys = {};

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      e.preventDefault();
    });
  }

  update() {
    for (const key in this.keys) {
      this.justPressed[key] = this.keys[key] && !this._previousKeys[key];
    }
    this._previousKeys = { ...this.keys };
  }

  isDown(code) {
    return !!this.keys[code];
  }

  wasPressed(code) {
    return !!this.justPressed[code];
  }

  // ---- GROUND CONTROLS ----
  // A/D = steer. Auto-accelerate downhill. S = brake. Space = ollie. Shift = tuck.

  get steer() {
    let val = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) val -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) val += 1;
    return val;
  }

  get brake() {
    return this.isDown('KeyS');
  }

  get jump() {
    return this.wasPressed('Space');
  }

  get tuck() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  // ---- AIR CONTROLS ----
  // W/S = flip forward/backward. Q/E = spin left/right.

  get flipForward() {
    return this.isDown('KeyW');
  }

  get flipBackward() {
    return this.isDown('KeyS');
  }

  get spinLeft() {
    return this.isDown('KeyQ');
  }

  get spinRight() {
    return this.isDown('KeyE');
  }

  // ---- GRABS (hold in air) ----
  // G=Indy, R=Method, F=Stalefish, T=Melon, V=NoseGrab, C=TailGrab

  get grab() {
    return this.isDown('KeyG') || this.isDown('KeyR') || this.isDown('KeyF') ||
           this.isDown('KeyT') || this.isDown('KeyV') || this.isDown('KeyC');
  }

  get grabType() {
    if (this.isDown('KeyG')) return 'indy';
    if (this.isDown('KeyR')) return 'method';
    if (this.isDown('KeyF')) return 'stalefish';
    if (this.isDown('KeyT')) return 'melon';
    if (this.isDown('KeyV')) return 'nosegrab';
    if (this.isDown('KeyC')) return 'tailgrab';
    return null;
  }
}
