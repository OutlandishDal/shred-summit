import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Pop on a jump lip adds this much of your ollie on top of the lip's own throw (keep in sync with Terrain)
export const JUMP_POP_MUL = 1.4;

// Scratch objects for the rider rig (IK runs every frame, so no allocations)
const _ik = {
  d: new THREE.Vector3(), p: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(),
  w: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
  m: new THREE.Matrix4(), e: new THREE.Euler(), qUpper: new THREE.Quaternion(), qLower: new THREE.Quaternion(),
};
const _rig = {
  t: new THREE.Vector3(), pole: new THREE.Vector3(), inv: new THREE.Matrix4(),
  qFeet: new THREE.Quaternion(), qKnee: new THREE.Quaternion(), qYaw: new THREE.Quaternion(),
  up: new THREE.Vector3(0, 1, 0),
  tw: new THREE.Vector3(), hw: new THREE.Vector3(), sw: new THREE.Vector3(), pw: new THREE.Vector3(),
  qa: new THREE.Quaternion(), qb: new THREE.Quaternion(),
};

export class Player {
  constructor(scene, equipmentType = 'snowboard') {
    this.scene = scene;
    this.equipmentType = equipmentType;

    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3(0, 0, -5);
    this.heading = Math.PI; // direction the board faces (radians, PI = down the slope -Z)
    this.visualYaw = Math.PI;
    this.angularVelocity = new THREE.Vector3(0, 0, 0);

    this.grounded = false;
    this.airTime = 0;
    this.visualSpeedScale = 1.2; // player moves 1.2x faster than displayed speed
    // Ground speed relative to the original tuning. Jumps compensate for it
    // (see _launchSpeed / _airSpeedBoost) so air height and distance stay the same.
    this.groundSpeedScale = 0.75;
    this._airSpeedBoost = 1;      // horizontal speed multiplier while in the air
    this.baseMaxSpeed = 36.11 * 1.2 * this.groundSpeedScale;
    this.maxSpeed = this.baseMaxSpeed;
    this.gravity = -25;
    this.baseJumpForce = 8;
    this.jumpForce = 8;
    this.baseOllieForce = 5;   // flat ground ollie (~6 feet on slopes)
    this.ollieForce = 5;
    this.launchedFromKicker = false; // true = kicker/terrain pop, false = flat ollie/rail
    this.flexMultiplier = 1.0;

    // Carving system — smooth laid-down carves
    this.turnRate = 0;            // current turning angular velocity (rad/s)
    this.turnRateMax = 2.3;       // ~130 deg/s — smooth carving
    this.turnAccel = 16.0;        // snappy edge engagement
    this.turnDecel = 10.0;        // smooth decay on release
    this.railSlopeAccel = 12;     // speed gain on down rails per unit of slope beyond the hill
    this.carveScrub = 0.003;      // speed lost per frame (at 60fps) per rad/s of turn
    this.edgeLean = 0;            // visual lean for carving (-1 to 1)
    this.edgeLeanSmooth = 0;      // smoothed lean for rendering

    this.trickRotation = new THREE.Vector3(0, 0, 0);
    this.isGrabbing = false;
    this.grabType = null;
    this.wasGrabbing = false;
    this.grabWindup = 0; // wind-up timer before grab pose connects
    this.wasGrounded = false;
    this.isTucking = false;

    // Jump height tracking
    this.peakHeight = 0;
    this.currentHeightAboveGround = 0;

    // Kicker state — player "rides" the kicker surface
    this.onKicker = null;       // reference to the ramp object we're riding
    this.kickerProgress = 0;    // 0..1 progress along the kicker

    // Rail grind state
    this.grinding = false;
    this.grindRail = null;
    this.boardslideType = null;   // null, 'frontside', 'backside'
    this.boardslideAngle = 0;     // visual rotation for boardslide
    this.grindTime = 0;           // how long current grind has lasted
    this.wasGrinding = false;
    this.landedOnRail = false;     // one-shot flag: air → rail transition
    this.frontswapCount = 0;       // number of frontside↔backside swaps during grind
    this.isLayingOut = false;      // holding jump during a backflip (straight body)
    this.lastJumpLayout = false;
    this._backflipTime = 0;
    this._layoutTime = 0;
    this.grindExitTimer = 0;       // cooldown after jumping off rail
    this._grindedRails = new Set(); // rails already grinded this run — no re-snap
    this.grindAborted = false;     // true when fell off rail due to low speed (no points)

    // Stance & switch
    this.stance = 'regular';     // 'regular' or 'goofy' — set from Game.js
    this.isSwitch = false;       // toggled by odd spins on landing

    // Cork tracking
    this.isCorkingThisJump = false;
    this.corkFlipDirection = 0;  // -1 = frontflip (W), +1 = backflip (S)
    this.corkSpinDirection = 0;  // +1 = frontside (Q), -1 = backside (E)

    // Kicker launch cooldown — prevents re-launch when landing back on same kicker
    this.kickerCooldown = 0;
    this.kickerPopBoost = 0; // ollie charge (0..1) released on a kicker, used at the lip
    this.ollieCharge = 0;    // pop meter 0..1 while jump is held on the ground
    this.ollieChargeTime = 0.7;  // seconds to fill the meter
    this.popSweetSpot = [0.72, 0.88]; // release (or reach the lip) inside this for a perfect pop
    this.lastPopPerfect = false;
    this.lastPopTime = -1;
    // Rail timing: the pop meter fills on its own before a rail lip / rail end; tap jump in the gold
    this.railTiming = null;      // { kind: 'on' | 'off', meter } while active
    this.railTimingWindow = 0.7; // seconds before the lip / end that the meter shows
    this._railOnLocked = false;  // jump already tapped for this rail lip
    this._pendingPerfectOn = false;
    this.railPerfectOn = false;
    this.railPerfectOff = false;
    this._swapTimer = 0;         // frontswap in progress (seconds left)
    this.swapDuration = 0.25;    // a frontswap takes this long; no new swap until it finishes
    this.swapHopHeight = 0.3;
    // Setting a trick: holding a spin/flip key while loading the pop winds the shoulders up.
    // Hucking off the lip with it set starts the rotation right away and faster; starting a
    // rotation later in the air spins slower (see _launchRotation)
    this._set = { spin: 0, flip: 0, amt: 0 };  // wound-up direction (-1/0/1) and how far (0..1)
    this._rotMul = 1;           // rotation speed for this jump
    this._rotMulLocked = false; // decided at takeoff (set) or at the first rotation input (late)
    this._launched = false;     // takeoff handled for this airtime
    this._huckT = 0;            // time left in the takeoff huck animation
    this._huck = { spin: 0, flip: 0 };
    this._fromRail = false;    // this airtime started off a rail
    // Rider rig dimensions (see _buildRig)
    this.THIGH_LEN = 0.34; this.SHIN_LEN = 0.3;     // hip→knee, knee→ankle
    this.UPPER_ARM_LEN = 0.3; this.FOREARM_LEN = 0.3; // shoulder→elbow, elbow→glove
    this.ANKLE_Y = 0.1;                              // ankle height above the board (board mesh space)    // how high the board hops off the rail during a frontswap
    this.terrainPopCooldown = 0; // cooldown for terrain bump pops

    // Landing zone tracking
    this.landingQuality = null; // null, 'perfect', 'clean'
    this.landingZoneSlopeAbsorb = 0; // 0-0.7 slope absorption factor

    // Crash
    this.crashed = false;
    this.crashTimer = 0;
    this.crashDebris = [];
    this.landingTolerance = Math.PI * (45 / 180); // 45 degrees — forgiving landings
    this.rollLandingTolerance = Math.PI * (90 / 180); // 90 degrees — roll is hard to control

    // Tomahawk — tumbling recovery instead of death (backcountry only)
    this.tomahawking = false;
    this.tomahawkTimer = 0;
    this.tomahawkRotation = 0;
    this.tomahawkDuration = 2.0;  // seconds for 3 full rotations
    this.tomahawkCount = 3;       // number of tumble rotations
    this.backcountryMode = false; // set by Game.js — enables tomahawk instead of crash

    // River rescue state (Peak backcountry)
    this.inRiver = false;
    this.riverZone = null;       // reference to the river zone data
    this.daveRescuing = false;   // true when following Dave out
    this.daveWaypoints = [];     // escape path waypoints
    this.daveWaypointIndex = 0;

    // Surface type (ice on frozen creeks)
    this.surfaceType = 'snow'; // 'snow', 'ice'

    // Capsule hitbox: center = position, radius, half-height
    this.capsuleRadius = 0.4;
    this.capsuleHalfH = 0.8;

    // Stance depends on equipment — base values (overridden by stance/switch)
    this.BASE_STANCE_YAW = this.equipmentType === 'ski' ? 0 : 1.3;
    this.BASE_HEAD_YAW = this.equipmentType === 'ski' ? 0 : -0.785;
    this.STANCE_YAW = this.BASE_STANCE_YAW;
    this.HEAD_YAW = this.BASE_HEAD_YAW;

    // Landing impact spring system
    this.landingImpact = 0;
    this.landingImpactVel = 0;

    this.group = new THREE.Group();
    this.boardGroup = new THREE.Group();
    this.riderGroup = new THREE.Group();

    this.buildModel();
    this.scene.add(this.group);
  }

  // Returns the rest-pose offset for a given joint and axis (GLB bones only)
  _boneRest(joint, axis) {
    if (!this.glbLoaded || !this._boneRestX) return 0;
    const restMap = { x: this._boneRestX, y: this._boneRestY, z: this._boneRestZ };
    for (const key of ['shoulderL','elbowL','shoulderR','elbowR','hipL','kneeL','hipR','kneeR','headGroup','neckGroup']) {
      if (this[key] === joint && restMap[axis][key] !== undefined) {
        return restMap[axis][key];
      }
    }
    return 0;
  }

  // Set a joint's rotation, adding rest-pose offset for GLB bones
  setJoint(joint, x, y, z) {
    if (this.glbLoaded) {
      const isKnee = (joint === this.kneeL || joint === this.kneeR);
      if (isKnee) x = -x;
    }
    joint.rotation.set(
      x + this._boneRest(joint, 'x'),
      y + this._boneRest(joint, 'y'),
      z + this._boneRest(joint, 'z')
    );
  }

  lerpJoint(joint, axis, target, speed) {
    if (this.glbLoaded) {
      // Mixamo shin (knee) bones have inverted X axis
      if (axis === 'x') {
        const isKnee = (joint === this.kneeL || joint === this.kneeR);
        if (isKnee) target = -target;
      }
    }
    target += this._boneRest(joint, axis);
    joint.rotation[axis] = THREE.MathUtils.lerp(joint.rotation[axis], target, speed);
  }

  /**
   * Every frame, measure where foot bones ended up after animation,
   * then offset the GLB model so feet sit on the binding positions.
   * Bindings are at (0, 0.10, ±0.22) in riderGroup-local space.
   */
  _snapFeetToBindings() {
    if (!this.glbModel || !this._boneFootL || !this._boneFootR || !this.glbPivot) return;

    // Apply hip Z rest offsets that lerpJoint doesn't touch
    // (animation only drives hip X for forward bend)
    if (this.hipL) this.hipL.rotation.z = this._boneRestZ['hipL'] || 0;
    if (this.hipR) this.hipR.rotation.z = this._boneRestZ['hipR'] || 0;

    // Let riderGroup lean show through — only counter-rotate slightly
    // so feet stay planted but torso visibly hunches over toes
    this.glbPivot.rotation.x = -this.riderGroup.rotation.x * 0.15;
    this.glbPivot.rotation.z = -this.riderGroup.rotation.z * 0.15;

    // Reset model position so we measure bone locations cleanly
    this.glbModel.position.set(0, 0, 0);
    this.glbPivot.updateMatrixWorld(true);

    // Get binding world positions from boardMesh
    const bindWorldL = new THREE.Vector3(0, 0.20, 0.22);
    const bindWorldR = new THREE.Vector3(0, 0.20, -0.22);
    this.boardMesh.localToWorld(bindWorldL);
    this.boardMesh.localToWorld(bindWorldR);

    // Get foot world positions
    const footWorldL = new THREE.Vector3();
    const footWorldR = new THREE.Vector3();
    this._boneFootL.getWorldPosition(footWorldL);
    this._boneFootR.getWorldPosition(footWorldR);

    // Snap each foot individually to its binding
    // First pass: snap midpoint to get model roughly in place
    const feetMid = footWorldL.clone().add(footWorldR).multiplyScalar(0.5);
    const bindMid = bindWorldL.clone().add(bindWorldR).multiplyScalar(0.5);
    const worldOffset = bindMid.clone().sub(feetMid);

    // Apply offset in model's local space
    this.glbModel.position.copy(worldOffset);
    // Transform world offset into glbModel's parent (glbPivot) local space
    const parentInv = new THREE.Matrix4().copy(this.glbPivot.matrixWorld).invert();
    // We need direction only, not position transform
    const zero = new THREE.Vector3().applyMatrix4(parentInv);
    this.glbModel.position.applyMatrix4(parentInv).sub(zero);
  }

  updatePonytail(dt) {
    if (!this.ponytailJoints || this.ponytailJoints.length === 0) return;
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    // Wind direction: ponytail trails opposite to velocity (in local head space)
    // Use a simplified world-to-local approximation via heading
    const cos = Math.cos(this.visualYaw);
    const sin = Math.sin(this.visualYaw);
    const localVz = this.velocity.x * sin + this.velocity.z * cos;
    const localVx = this.velocity.x * cos - this.velocity.z * sin;

    for (let i = 0; i < this.ponytailJoints.length; i++) {
      const joint = this.ponytailJoints[i];
      const segFactor = (i + 1) * 0.35; // progressive lag per segment
      const lerpSpeed = 0.12 - i * 0.03; // slower for tip (whip effect)

      // Spring target: trail behind based on velocity
      let targetX = -localVz * 0.04 * segFactor + this.velocity.y * 0.03 * segFactor;
      let targetZ = localVx * 0.03 * segFactor;

      // Clamp targets to prevent extreme angles
      targetX = THREE.MathUtils.clamp(targetX, -0.8, 0.8);
      targetZ = THREE.MathUtils.clamp(targetZ, -0.5, 0.5);

      // Damped spring
      const springK = 8;
      const damping = 4;
      const dx = targetX - joint.rotation.x;
      const dz = targetZ - joint.rotation.z;
      this._ponytailVelX[i] += dx * springK * dt;
      this._ponytailVelZ[i] += dz * springK * dt;
      this._ponytailVelX[i] *= Math.max(0, 1 - damping * dt);
      this._ponytailVelZ[i] *= Math.max(0, 1 - damping * dt);
      joint.rotation.x += this._ponytailVelX[i] * dt;
      joint.rotation.z += this._ponytailVelZ[i] * dt;

      // Gravity pull — ponytail hangs down slightly when slow
      if (speed < 5) {
        joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, 0.1 * segFactor, lerpSpeed);
      }
    }
  }

  // Materials stored for color customization
  buildModel() {
    this.boardMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.2, metalness: 0.5 });

    // Build equipment based on type
    if (this.equipmentType === 'ski') {
      this.buildSkis();
    } else {
      this.buildSnowboard();
    }

    // === RIDER — realistic human proportions ===
    // Total height ~1.75 units (feet to top of head)
    // Proportions: head=0.22, neck=0.08, torso=0.55, legs=0.90
    this.jacketMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.8 });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9 });
    const jacketMat = this.jacketMat;
    const pantsMat = this.pantsMat;
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5c6a0 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    this.bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // Stance rotation
    this.riderGroup.rotation.y = this.STANCE_YAW;

    // Hips / pelvis — wide oval
    this.hipsMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.05, 5, 10), pantsMat);
    this.hipsMesh.scale.set(1.0, 0.8, 0.7);
    this.hipsMesh.position.set(0, 0.62, 0); this.riderGroup.add(this.hipsMesh);

    // Lower torso / waist — baggy jacket hangs wide
    const waistMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.12, 5, 10), jacketMat);
    waistMesh.scale.set(1, 1, 0.7);
    waistMesh.position.set(0, 0.82, 0); this.riderGroup.add(waistMesh);

    // Upper torso / chest — puffy jacket, broader
    this.torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.22, 6, 10), jacketMat);
    this.torsoMesh.scale.set(1.05, 1, 0.75);
    this.torsoMesh.position.set(0, 1.05, 0); this.torsoMesh.castShadow = true;
    this.riderGroup.add(this.torsoMesh);

    // Jacket wrinkle/fold lines — subtle ridges for fabric detail
    const jacketFoldMat = new THREE.MeshStandardMaterial({
      color: 0xb71c1c, roughness: 0.85 // slightly darker than jacket for shadow in folds
    });
    this._jacketFoldMat = jacketFoldMat; // keep ref for color sync

    // Horizontal fold ridges across torso (fabric bunching) — thin solid bands
    for (const y of [0.92, 1.0, 1.1]) {
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.014, 14), jacketFoldMat);
      fold.position.set(0, y, 0); this.riderGroup.add(fold);
    }
    // Vertical seam lines on torso (side seams)
    for (const x of [-0.19, 0.19]) {
      const seam = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.28, 3, 4), jacketFoldMat);
      seam.position.set(x, 1.02, 0.06); this.riderGroup.add(seam);
    }
    // Center front zipper line
    const zipper = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.35, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.3 }));
    zipper.position.set(0, 1.0, 0.155); this.riderGroup.add(zipper);

    // Jacket collar at neckline
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.06, 10, 1, true), jacketMat);
    collar.position.set(0, 1.28, 0); this.riderGroup.add(collar);

    // Jacket waist band / hem — solid band
    const waistBand = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.19, 0.035, 12), jacketMat);
    waistBand.position.set(0, 0.74, 0); this.riderGroup.add(waistBand);

    // Jacket brand logo decal (thin plane on chest)
    this.jacketLogoMat = new THREE.MeshStandardMaterial({
      transparent: true, alphaTest: 0.5, depthWrite: false, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.jacketLogoPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.18), this.jacketLogoMat
    );
    this.jacketLogoPlane.position.set(0, 1.05, 0.13);
    this.jacketLogoPlane.visible = false;
    this.riderGroup.add(this.jacketLogoPlane);

    // === HEAD — Riders Republic style: balaclava + helmet + big goggles ===
    this.neckGroup = new THREE.Group();
    this.neckGroup.position.set(0, 1.32, 0);
    this.riderGroup.add(this.neckGroup);

    // Balaclava material — covers entire head/neck, no exposed skin
    const balaclavaMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    const gaiterMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });

    // Neck gaiter — visible tube between jacket collar and balaclava head
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.14, 10), gaiterMat);
    neckMesh.position.set(0, 0.0, 0); this.neckGroup.add(neckMesh);

    this.headGroup = new THREE.Group();
    this.headGroup.rotation.y = this.HEAD_YAW;
    this.neckGroup.add(this.headGroup);

    // Head base — fully covered by balaclava (no skin visible)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), balaclavaMat);
    head.scale.set(1, 1.05, 0.95);
    head.position.set(0, 0.15, 0); head.castShadow = true; this.headGroup.add(head);

    // Chin/jaw shape under balaclava
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), balaclavaMat);
    jaw.position.set(0, 0.08, 0.02); jaw.scale.set(1, 0.6, 0.7); this.headGroup.add(jaw);

    // === Helmet — full coverage, sits on top of balaclava ===
    this.helmetMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.4, metalness: 0.1 });

    // Main helmet shell — full rounded top
    this.helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      this.helmetMat);
    this.helmetMesh.position.set(0, 0.17, 0); this.headGroup.add(this.helmetMesh);

    // Helmet back lip — extends down to cover nape
    const helmetBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.35),
      this.helmetMat);
    helmetBack.position.set(0, 0.15, -0.02); helmetBack.scale.set(1, 1, 1.1);
    this.headGroup.add(helmetBack);

    // Helmet brim — angular visor lip
    const brim = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.015, 0.06), this.helmetMat);
    brim.position.set(0, 0.135, 0.11); brim.rotation.x = -0.15;
    this.headGroup.add(brim);

    // Helmet side vents (subtle detail)
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.04), this.helmetMat);
      vent.position.set(side * 0.13, 0.2, 0.04);
      this.headGroup.add(vent);
    }

    // Hood bunched behind helmet
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), jacketMat);
    hood.position.set(0, 0.12, -0.13); hood.scale.set(1.2, 0.65, 0.9);
    this.headGroup.add(hood);
    // Hood collar connecting to jacket neckline
    const hoodCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.04, 10), jacketMat);
    hoodCollar.position.set(0, 0.04, -0.04);
    this.headGroup.add(hoodCollar);

    // === Halo mode hair — sculpted volume, not individual spheres ===
    this.hairGroup = new THREE.Group();
    this.hairGroup.visible = false;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.95 });

    // Main hair volume — elongated cap sitting on top of head
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairCap.position.set(0, 0.18, -0.01); hairCap.scale.set(1.05, 1.0, 1.1);
    this.hairGroup.add(hairCap);

    // Side volume — adds width for a messy/textured look
    for (const side of [-1, 1]) {
      const sideHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6), hairMat);
      sideHair.position.set(side * 0.09, 0.16, -0.02);
      sideHair.scale.set(1, 1.1, 1.2);
      this.hairGroup.add(sideHair);
    }

    // Back volume — hair flowing down the back
    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    backHair.position.set(0, 0.13, -0.08); backHair.scale.set(1, 1.1, 1.0);
    backHair.rotation.x = 0.3;
    this.hairGroup.add(backHair);

    // Top texture ridges — suggests messy/wavy hair strands
    for (let i = 0; i < 5; i++) {
      const ridge = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.015, 0.10, 3, 6), hairMat);
      ridge.position.set(-0.05 + i * 0.025, 0.26, -0.01 + Math.sin(i) * 0.02);
      ridge.rotation.z = -0.3 + i * 0.15;
      ridge.rotation.x = -0.2;
      this.hairGroup.add(ridge);
    }
    this.headGroup.add(this.hairGroup);

    this.haloMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.018, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.1 })
    );
    this.haloMesh.rotation.x = -Math.PI / 2;
    this.haloMesh.position.set(0, 0.35, 0);
    this.haloMesh.visible = false;
    this.headGroup.add(this.haloMesh);

    // Ponytail removed — physics update guarded by empty joints check
    this.ponytailJoints = [];
    this._ponytailVelX = [];
    this._ponytailVelZ = [];

    // === Goggles — black frame, lens tinted to jacket color ===
    const goggleFrameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.1 });

    // Goggle frame — larger, rounded box wrapping across face
    const goggleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.075, 0.05), goggleFrameMat);
    goggleFrame.position.set(0, 0.125, 0.10); this.headGroup.add(goggleFrame);

    // Top frame edge — thicker brow line
    const goggleBrow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.04), goggleFrameMat);
    goggleBrow.position.set(0, 0.165, 0.10); this.headGroup.add(goggleBrow);

    // Side wraps — deeper, wrapping around the face
    for (const side of [-1, 1]) {
      const sideWrap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.10), goggleFrameMat);
      sideWrap.position.set(side * 0.13, 0.125, 0.065); this.headGroup.add(sideWrap);
    }

    // Goggle lens — tinted to match jacket color, sits proud of frame
    const lensColor = this.jacketMat.color.clone().lerp(new THREE.Color(0xffffff), 0.3);
    this.goggleLensMat = new THREE.MeshStandardMaterial({
      color: lensColor, emissive: this.jacketMat.color.clone().multiplyScalar(0.15),
      metalness: 0.85, roughness: 0.08 });
    const goggleLens = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.065, 0.015), this.goggleLensMat);
    goggleLens.position.set(0, 0.125, 0.13); this.headGroup.add(goggleLens);

    // Foam padding visible at bottom edge
    const goggleFoam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0 }));
    goggleFoam.position.set(0, 0.085, 0.095); this.headGroup.add(goggleFoam);

    // Goggle strap — thick band around back of head
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const goggleStrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.035, 14, 1, true, Math.PI * 0.25, Math.PI * 1.5), strapMat);
    goggleStrap.position.set(0, 0.125, 0); goggleStrap.rotation.x = Math.PI / 2;
    this.headGroup.add(goggleStrap);

    // === SEGMENTED ARMS — longer, slimmer ===
    // Left arm
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.22, 1.22, 0);
    this.riderGroup.add(this.shoulderL);

    const shoulderCapL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), jacketMat);
    this.shoulderL.add(shoulderCapL);

    const upperArmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 5, 8), jacketMat);
    upperArmL.position.set(0, -0.15, 0); upperArmL.castShadow = true;
    this.shoulderL.add(upperArmL);

    this.elbowL = new THREE.Group();
    this.elbowL.position.set(0, -0.3, 0);
    this.shoulderL.add(this.elbowL);

    // Elbow joint ball
    const elbowBallL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), jacketMat);
    this.elbowL.add(elbowBallL);

    // Elbow crease wrinkles (inside of bend)
    const elbowCreaseL1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.04, 3, 4), jacketFoldMat);
    elbowCreaseL1.position.set(0, 0.01, 0.035); elbowCreaseL1.rotation.z = Math.PI / 2;
    this.elbowL.add(elbowCreaseL1);
    const elbowCreaseL2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.035, 3, 4), jacketFoldMat);
    elbowCreaseL2.position.set(0, -0.01, 0.03); elbowCreaseL2.rotation.z = Math.PI / 2;
    this.elbowL.add(elbowCreaseL2);

    const forearmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.2, 5, 8), jacketMat);
    forearmL.position.set(0, -0.14, 0); forearmL.castShadow = true;
    this.elbowL.add(forearmL);

    // Sleeve cuff
    const cuffL = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.025, 8), jacketMat);
    cuffL.position.set(0, -0.26, 0); this.elbowL.add(cuffL);

    // Glove — mitten with thumb
    const gloveL = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.04, 4, 6), this.gloveMat);
    gloveL.scale.set(1, 1, 0.8);
    gloveL.position.set(0, -0.3, 0); this.elbowL.add(gloveL);
    const thumbL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), this.gloveMat);
    thumbL.position.set(-0.035, -0.28, 0.01); this.elbowL.add(thumbL);

    // Right arm
    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.22, 1.22, 0);
    this.riderGroup.add(this.shoulderR);

    const shoulderCapR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), jacketMat);
    this.shoulderR.add(shoulderCapR);

    const upperArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 5, 8), jacketMat);
    upperArmR.position.set(0, -0.15, 0); upperArmR.castShadow = true;
    this.shoulderR.add(upperArmR);

    this.elbowR = new THREE.Group();
    this.elbowR.position.set(0, -0.3, 0);
    this.shoulderR.add(this.elbowR);

    const elbowBallR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), jacketMat);
    this.elbowR.add(elbowBallR);

    const elbowCreaseR1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.04, 3, 4), jacketFoldMat);
    elbowCreaseR1.position.set(0, 0.01, 0.035); elbowCreaseR1.rotation.z = Math.PI / 2;
    this.elbowR.add(elbowCreaseR1);
    const elbowCreaseR2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.035, 3, 4), jacketFoldMat);
    elbowCreaseR2.position.set(0, -0.01, 0.03); elbowCreaseR2.rotation.z = Math.PI / 2;
    this.elbowR.add(elbowCreaseR2);

    const forearmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.2, 5, 8), jacketMat);
    forearmR.position.set(0, -0.14, 0); forearmR.castShadow = true;
    this.elbowR.add(forearmR);

    const cuffR = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.025, 8), jacketMat);
    cuffR.position.set(0, -0.26, 0); this.elbowR.add(cuffR);

    const gloveR = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.04, 4, 6), this.gloveMat);
    gloveR.scale.set(1, 1, 0.8);
    gloveR.position.set(0, -0.3, 0); this.elbowR.add(gloveR);
    const thumbR = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), this.gloveMat);
    thumbR.position.set(0.035, -0.28, 0.01); this.elbowR.add(thumbR);

    // Default arm pose
    if (this.equipmentType === 'ski') {
      this.shoulderL.rotation.z = -0.75;
      this.shoulderL.rotation.x = 0.2;
      this.elbowL.rotation.x = -0.3;
      this.shoulderR.rotation.z = 0.75;
      this.shoulderR.rotation.x = 0.2;
      this.elbowR.rotation.x = -0.3;
    } else {
      this.shoulderL.rotation.z = -0.35;
      this.shoulderL.rotation.x = 0.15;
      this.elbowL.rotation.x = -0.4;
      this.shoulderR.rotation.z = 0.35;
      this.shoulderR.rotation.x = 0.15;
      this.elbowR.rotation.x = -0.4;
    }

    // Ski poles (attached to forearms)
    if (this.equipmentType === 'ski') {
      this.buildPoles();
    }

    // === SEGMENTED LEGS — longer, realistic proportions ===
    const isSki = this.equipmentType === 'ski';

    // Pants wrinkle material — slightly darker for fold shadows
    // Fold materials — darker shade for creases, lighter highlight for ridges
    const pantsFoldMat = new THREE.MeshStandardMaterial({ color: 0x1a252e, roughness: 0.95 });
    this._pantsFoldMat = pantsFoldMat;
    const pantsRidgeMat = new THREE.MeshStandardMaterial({ color: 0x2e3d45, roughness: 0.75 });
    const pantsSeamMat = new THREE.MeshStandardMaterial({ color: 0x1e2a30, roughness: 0.98 });

    // Helper: add wrinkle detail to a leg
    this._pantsWrinkles = this._pantsWrinkles || [];
    const addLegWrinkles = (hipGroup, kneeGroup, side) => {
      // --- THIGH ---
      // Horizontal fabric folds (bunching from movement)
      for (const y of [-0.04, -0.12, -0.20, -0.27]) {
        const fold = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 4, 12), pantsFoldMat);
        fold.rotation.x = Math.PI / 2; fold.position.set(0, y, 0);
        fold.userData.pantsWrinkle = true;
        hipGroup.add(fold); this._pantsWrinkles.push(fold);
      }
      // Ridge highlights between folds (catch light on top of wrinkle)
      for (const y of [-0.08, -0.16, -0.24]) {
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.007, 4, 12), pantsRidgeMat);
        ridge.rotation.x = Math.PI / 2; ridge.position.set(0, y, 0);
        ridge.userData.pantsWrinkle = true;
        hipGroup.add(ridge); this._pantsWrinkles.push(ridge);
      }
      // Outer seam line (vertical stitch down outside of thigh)
      const outerSeam = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.28, 3, 4), pantsSeamMat);
      outerSeam.position.set(side * 0.095, -0.15, 0);
      outerSeam.userData.pantsWrinkle = true;
      hipGroup.add(outerSeam); this._pantsWrinkles.push(outerSeam);
      // Inner seam
      const innerSeam = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.28, 3, 4), pantsSeamMat);
      innerSeam.position.set(side * -0.095, -0.15, 0);
      innerSeam.userData.pantsWrinkle = true;
      hipGroup.add(innerSeam); this._pantsWrinkles.push(innerSeam);
      // Diagonal stress creases on front thigh (from knee bend)
      for (const [y, angle] of [[-0.10, 0.4], [-0.22, -0.3]]) {
        const crease = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.08, 3, 4), pantsFoldMat);
        crease.position.set(0, y, 0.08);
        crease.rotation.z = angle; crease.rotation.y = Math.PI / 2;
        crease.userData.pantsWrinkle = true;
        hipGroup.add(crease); this._pantsWrinkles.push(crease);
      }

      // --- KNEE ---
      // Behind-knee crease folds (3 creases for more realism)
      for (const [y, r, len] of [[0.015, 0.009, 0.09], [-0.01, 0.008, 0.08], [-0.03, 0.007, 0.07]]) {
        const crease = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 5), pantsFoldMat);
        crease.position.set(0, y, -0.07); crease.rotation.z = Math.PI / 2;
        crease.userData.pantsWrinkle = true;
        kneeGroup.add(crease); this._pantsWrinkles.push(crease);
      }
      // Front knee stress crease (fabric pulling when bent)
      const frontKneeCrease = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.07, 3, 4), pantsRidgeMat);
      frontKneeCrease.position.set(0, 0, 0.075); frontKneeCrease.rotation.z = Math.PI / 2;
      frontKneeCrease.userData.pantsWrinkle = true;
      kneeGroup.add(frontKneeCrease); this._pantsWrinkles.push(frontKneeCrease);

      // --- CALF ---
      // Horizontal folds (more of them, varied spacing)
      for (const y of [-0.05, -0.12, -0.19, -0.25]) {
        const fold = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.010, 4, 12), pantsFoldMat);
        fold.rotation.x = Math.PI / 2; fold.position.set(0, y, 0);
        fold.userData.pantsWrinkle = true;
        kneeGroup.add(fold); this._pantsWrinkles.push(fold);
      }
      // Ridge highlights on calves
      for (const y of [-0.08, -0.16]) {
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.006, 4, 12), pantsRidgeMat);
        ridge.rotation.x = Math.PI / 2; ridge.position.set(0, y, 0);
        ridge.userData.pantsWrinkle = true;
        kneeGroup.add(ridge); this._pantsWrinkles.push(ridge);
      }
      // Outer calf seam
      const calfSeam = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.25, 3, 4), pantsSeamMat);
      calfSeam.position.set(side * 0.08, -0.15, 0);
      calfSeam.userData.pantsWrinkle = true;
      kneeGroup.add(calfSeam); this._pantsWrinkles.push(calfSeam);
    };

    // Left leg (front foot) — hip over front binding
    this.hipL = new THREE.Group();
    this.hipL.position.set(isSki ? -0.1 : -0.14, 0.62, isSki ? 0 : 0.05);
    this.riderGroup.add(this.hipL);

    // Thigh — long capsule that overlaps up into hips and down past knee pivot
    this.thighL = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.30, 5, 8), pantsMat);
    this.thighL.position.set(0, -0.20, 0); this.thighL.castShadow = true;
    this.hipL.add(this.thighL);

    this.kneeL = new THREE.Group();
    this.kneeL.position.set(0, -0.34, 0);
    this.hipL.add(this.kneeL);

    // Calf — overlaps up past knee pivot for seamless joint
    this.calfL = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.28, 5, 8), pantsMat);
    this.calfL.position.set(0, -0.14, 0); this.calfL.castShadow = true;
    this.kneeL.add(this.calfL);

    addLegWrinkles(this.hipL, this.kneeL, -1);

    // Boot — positioned to sit inside binding
    const bootBodyL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.05, 4, 6), this.bootMat);
    bootBodyL.scale.set(1, 1, 1.2);
    bootBodyL.position.set(0, -0.30, 0.01); this.kneeL.add(bootBodyL);
    const soleL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.18), this.bootMat);
    soleL.position.set(0, -0.34, 0.02); this.kneeL.add(soleL);

    // Right leg (rear foot) — hip over rear binding
    this.hipR = new THREE.Group();
    this.hipR.position.set(isSki ? 0.1 : 0.14, 0.62, isSki ? 0 : -0.10);
    this.riderGroup.add(this.hipR);

    this.thighR = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.30, 5, 8), pantsMat);
    this.thighR.position.set(0, -0.20, 0); this.thighR.castShadow = true;
    this.hipR.add(this.thighR);

    this.kneeR = new THREE.Group();
    this.kneeR.position.set(0, -0.34, 0);
    this.hipR.add(this.kneeR);

    this.calfR = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.28, 5, 8), pantsMat);
    this.calfR.position.set(0, -0.14, 0); this.calfR.castShadow = true;
    this.kneeR.add(this.calfR);

    addLegWrinkles(this.hipR, this.kneeR, 1);

    const bootBodyR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.05, 4, 6), this.bootMat);
    bootBodyR.scale.set(1, 1, 1.2);
    bootBodyR.position.set(0, -0.30, 0.01); this.kneeR.add(bootBodyR);
    const soleR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.18), this.bootMat);
    soleR.position.set(0, -0.34, 0.02); this.kneeR.add(soleR);

    // Default leg pose: straight down, knees bent forward — like reference images
    this.hipL.rotation.x = -0.3;
    this.kneeL.rotation.x = 0.6;
    this.hipR.rotation.x = -0.3;
    this.kneeR.rotation.x = 0.6;

    this._buildRig();

    this.boardGroup.add(this.riderGroup);
    this.group.add(this.boardGroup);
  }

  // Turns the procedural rider into a small rig: a spine that bends at the waist, ankles that keep
  // the boots flat in the bindings, and two-bone IK so the feet never leave the board and a grabbing
  // hand lands on the actual spot of the board it grabs.
  _buildRig() {
    // Leans are in the rider's own frame: rotation.x tips toward the toes, rotation.z toward the left foot
    this.riderGroup.rotation.order = 'YXZ';

    this.spineGroup = new THREE.Group();
    this.spineGroup.position.set(0, 0.7, 0);
    for (const child of [...this.riderGroup.children]) {
      if (child === this.hipL || child === this.hipR || child.position.y < 0.7) continue;
      this.riderGroup.remove(child);
      child.position.y -= 0.7;
      this.spineGroup.add(child);
    }
    this.riderGroup.add(this.spineGroup);

    this._spinePose = { x: 0, y: 0, z: 0 };
    this._armIK = { L: { w: 0, rate: 0.2, target: null, last: null }, R: { w: 0, rate: 0.2, target: null, last: null } };
    this.legIK = this.equipmentType !== 'ski';
    if (this.legIK) {
      this.ankleL = this._makeAnkle(this.kneeL);
      this.ankleR = this._makeAnkle(this.kneeR);
    }
  }

  _makeAnkle(knee) {
    const ankle = new THREE.Group();
    ankle.position.set(0, -this.SHIN_LEN, 0);
    for (const child of [...knee.children]) {
      if (child.position.y > -0.29) continue; // boot and sole
      knee.remove(child);
      child.position.y += this.SHIN_LEN;
      ankle.add(child);
    }
    knee.add(ankle);
    return ankle;
  }

  // Which way the board's toe edge (+1 = board +x) and nose (+1 = board +z) sit for the current stance
  _toeSign() { return Math.sign(Math.sin(this.riderGroup.rotation.y)) || 1; }
  _frontSign() {
    const yaw = this.riderGroup.rotation.y;
    return Math.sign(0.14 * Math.sin(yaw) + 0.05 * Math.cos(yaw)) || 1;
  }

  // Pose requests, made each frame by the animation code and applied in _updateRig
  _setSpine(x, y = 0, z = 0) { this._spinePose.x = x; this._spinePose.y = y; this._spinePose.z = z; }

  // Put a hand ('L'/'R') on a point, in 'board' space (board mesh local) or 'rider' space (riderGroup local)
  _reach(hand, space, x, y, z, rate = 0.2) {
    const ik = this._armIK[hand];
    ik.target = { space, x, y, z };
    ik.rate = rate;
  }

  // Two-bone IK. target and pole are in the upper joint's parent space; the limb hangs along the
  // joint's local -y. hingeSign: +1 when the lower joint bends with +x (knees), -1 for -x (elbows).
  // Leaves the solved rotations in _ik.qUpper / _ik.qLower.
  _solveTwoBone(upper, target, a, b, pole, hingeSign) {
    const { d, p, u, v, w, x, y, m, e } = _ik;
    d.copy(target).sub(upper.position);
    const dist = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 0.01, a + b - 0.002);
    d.normalize();
    p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
    u.copy(d).multiplyScalar(cosA).addScaledVector(p, Math.sqrt(1 - cosA * cosA)); // upper limb (bulges toward pole)
    v.copy(d).multiplyScalar(dist).addScaledVector(u, -a).normalize();             // lower limb
    const bend = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
    w.copy(v).addScaledVector(u, -u.dot(v));
    if (w.lengthSq() < 1e-8) w.copy(p).negate();
    w.normalize().multiplyScalar(-hingeSign);  // local +z
    y.copy(u).negate();                        // local +y
    x.crossVectors(y, w);
    m.makeBasis(x, y, w);
    _ik.qUpper.setFromRotationMatrix(m);
    _ik.qLower.setFromEuler(e.set(hingeSign * bend, 0, 0));
  }

  _updateRig() {
    if (!this.spineGroup) return;
    const lerp = THREE.MathUtils.lerp;
    const sp = this._spinePose, sr = this.spineGroup.rotation;
    sr.x = lerp(sr.x, sp.x, 0.15);
    sr.y = lerp(sr.y, sp.y, 0.15);
    sr.z = lerp(sr.z, sp.z, 0.15);
    this.group.updateMatrixWorld(true);

    // Legs: feet locked into the bindings whatever the body is doing, knees out over the toes
    if (this.legIK) {
      _rig.inv.copy(this.riderGroup.matrixWorld).invert();
      this.boardMesh.getWorldQuaternion(_rig.qFeet);
      _rig.qFeet.multiply(_rig.qYaw.setFromAxisAngle(_rig.up, this.STANCE_YAW)); // boots stay across the board
      const front = this._frontSign();
      for (const [hip, knee, ankle, side, bz] of [
        [this.hipL, this.kneeL, this.ankleL, -1, front * 0.22],
        [this.hipR, this.kneeR, this.ankleR, 1, -front * 0.22],
      ]) {
        _rig.t.set(0, this.ANKLE_Y, bz);
        this.boardMesh.localToWorld(_rig.t).applyMatrix4(_rig.inv);
        _rig.pole.set(side * 0.12, 0, 1);
        this._solveTwoBone(hip, _rig.t, this.THIGH_LEN, this.SHIN_LEN, _rig.pole, 1);
        hip.quaternion.copy(_ik.qUpper);
        knee.quaternion.copy(_ik.qLower);
        hip.updateMatrixWorld(true);
        // Boots stay flat on the board
        knee.getWorldQuaternion(_rig.qKnee);
        ankle.quaternion.copy(_rig.qKnee.invert().multiply(_rig.qFeet));
      }
    }

    // Arms: blend from the animated pose into a hand placed on a target
    for (const hand of ['L', 'R']) {
      const ik = this._armIK[hand];
      if (ik.target) ik.last = ik.target;
      ik.w = lerp(ik.w, ik.target ? 1 : 0, ik.rate);
      ik.target = null; // poses re-request every frame
      if (ik.w < 0.01 || !ik.last) continue;
      const shoulder = hand === 'L' ? this.shoulderL : this.shoulderR;
      const elbow = hand === 'L' ? this.elbowL : this.elbowR;
      const t = ik.last;
      _rig.tw.set(t.x, t.y, t.z);
      (t.space === 'board' ? this.boardMesh : this.riderGroup).localToWorld(_rig.tw);
      if (ik.w > 0.97) ik.w = 1;
      // A grab locks the hand on: if the spot is out of arm's reach (spins twist the shoulders
      // away), fold the torso toward it until the hand gets there.
      const lock = t.space === 'board' && ik.w === 1;
      for (let pass = 0; pass < (lock ? 4 : 1); pass++) {
        _rig.t.copy(_rig.tw);
        this.spineGroup.worldToLocal(_rig.t);
        _rig.pole.set(hand === 'L' ? -1 : 1, -0.3, -0.5); // elbows out and back
        this._solveTwoBone(shoulder, _rig.t, this.UPPER_ARM_LEN, this.FOREARM_LEN, _rig.pole, -1);
        shoulder.quaternion.slerp(_ik.qUpper, ik.w);
        elbow.quaternion.slerp(_ik.qLower, ik.w);
        if (!lock) break;
        const reach = (this.UPPER_ARM_LEN + this.FOREARM_LEN) * 0.97;
        shoulder.getWorldPosition(_rig.sw);
        const gap = _rig.sw.distanceTo(_rig.tw) - reach;
        if (gap <= 0.003) break;
        // Swing the spine about its base so the shoulder moves toward the spot by the missing distance
        this.spineGroup.getWorldPosition(_rig.pw);
        const vs = _rig.hw.copy(_rig.sw).sub(_rig.pw);
        const vt = _rig.sw.copy(_rig.tw).sub(_rig.pw);
        const ang = Math.min(vs.angleTo(vt), gap / vs.length() * 1.3);
        const axis = vs.cross(vt).normalize();
        if (axis.lengthSq() < 1e-6) break;
        this.riderGroup.getWorldQuaternion(_rig.qa);
        axis.applyQuaternion(_rig.qb.copy(_rig.qa).invert()); // into the spine's parent frame
        this.spineGroup.quaternion.premultiply(_rig.qb.setFromAxisAngle(axis, ang));
        this.spineGroup.updateMatrixWorld(true);
      }
    }
  }

  /**
   * Load a GLB character model (e.g. Ready Player Me avatar) and replace
   * the procedural rider geometry.  The existing animation system continues
   * to work because lerpJoint operates on any object with a .rotation —
   * THREE.Bone qualifies, so we simply swap the joint references.
   *
   * @param {string} url  Path or URL to a .glb file
   * @returns {Promise<void>}
   */
  async loadCharacterModel(url) {
    const loader = new GLTFLoader();

    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    const model = gltf.scene;

    // --- Hide all procedural rider meshes (keep groups for positioning) ---
    this.riderGroup.traverse((child) => {
      if (child.isMesh) child.visible = false;
    });

    // --- Scale & position the GLB to match the procedural rider ---
    // The procedural rider had hips at y=0.62, feet in bindings at z=±0.22, y≈0.10
    // We scale so head reaches ~1.65 above bindings, then position feet onto bindings.
    const box = new THREE.Box3().setFromObject(model);
    const glbHeight = box.max.y - box.min.y;
    const targetHeight = 1.65; // total rider height from feet to head top
    const scale = targetHeight / glbHeight;
    model.scale.setScalar(scale);

    // No model-level rotation needed — the riderGroup's STANCE_YAW handles board stance.
    // RPM / Mixamo avatars face +Z natively which matches the procedural rider.

    // Enable shadows on all meshes
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        // Ensure proper material rendering
        if (child.material) {
          child.material.needsUpdate = true;
        }
      }
    });

    // Wrap GLB in a pivot so we can counter-rotate against riderGroup lean
    this.glbPivot = new THREE.Group();
    this.glbPivot.add(model);
    this.riderGroup.add(this.glbPivot);
    this.glbModel = model;

    // --- Map skeleton bones to existing joint references ---
    // Support both RPM names ("Hips") and Mixamo-prefixed ("mixamorigHips")
    const boneNames = {
      // Spine & head
      'Hips':          '_boneHips',
      'Spine':         '_boneSpine',
      'Spine1':        '_boneSpine1',
      'Spine2':        '_boneSpine2',
      'Neck':          '_boneNeck',
      'Head':          '_boneHead',
      // Left arm
      'LeftShoulder':  '_boneShoulderCapL',
      'LeftArm':       '_boneUpperArmL',
      'LeftForeArm':   '_boneForeArmL',
      'LeftHand':      '_boneHandL',
      // Right arm
      'RightShoulder': '_boneShoulderCapR',
      'RightArm':      '_boneUpperArmR',
      'RightForeArm':  '_boneForeArmR',
      'RightHand':     '_boneHandR',
      // Left leg
      'LeftUpLeg':     '_boneThighL',
      'LeftLeg':       '_boneShinL',
      'LeftFoot':      '_boneFootL',
      // Right leg
      'RightUpLeg':    '_boneThighR',
      'RightLeg':      '_boneShinR',
      'RightFoot':     '_boneFootR',
    };
    // Build lookup that accepts both "Hips" and "mixamorigHips"
    const boneMap = {};
    for (const [name, prop] of Object.entries(boneNames)) {
      boneMap[name] = prop;
      boneMap['mixamorig' + name] = prop;
    }

    // Find bones in the loaded model
    model.traverse((child) => {
      if (child.isBone) {
        const mapped = boneMap[child.name];
        if (mapped) this[mapped] = child;
      }
    });

    // Store rest-pose quaternions so we can apply deltas properly
    this._boneRestPose = {};
    for (const key of Object.values(boneMap)) {
      if (this[key]) {
        this._boneRestPose[key] = this[key].quaternion.clone();
      }
    }

    // --- Reassign joint references so existing animation code drives bones ---
    // The animation calls lerpJoint(this.shoulderL, 'x', val, speed) etc.
    // We point those references at the corresponding bones.
    if (this._boneUpperArmL) this.shoulderL = this._boneUpperArmL;
    if (this._boneForeArmL)  this.elbowL    = this._boneForeArmL;
    if (this._boneUpperArmR) this.shoulderR = this._boneUpperArmR;
    if (this._boneForeArmR)  this.elbowR    = this._boneForeArmR;
    if (this._boneThighL)    this.hipL      = this._boneThighL;
    if (this._boneShinL)     this.kneeL     = this._boneShinL;
    if (this._boneThighR)    this.hipR      = this._boneThighR;
    if (this._boneShinR)     this.kneeR     = this._boneShinR;
    if (this._boneHead)      this.headGroup = this._boneHead;
    if (this._boneNeck)      this.neckGroup = this._boneNeck;

    // Store materials from the GLB for color customization
    this._glbMaterials = [];
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!this._glbMaterials.includes(mat)) this._glbMaterials.push(mat);
        }
      }
    });

    // --- Store rest-pose rotations for every mapped bone ---
    // Mixamo bones have non-identity rest rotations that orient the skeleton.
    // The procedural rider assumes identity rest (rotation 0,0,0 = straight down).

    // Change shoulder rotation order to YXZ so the large Y rotation (arms down
    // from T-pose) is applied first, avoiding gimbal lock that corrupts X/Z.
    if (this.shoulderL) this.shoulderL.rotation.order = 'YXZ';
    if (this.shoulderR) this.shoulderR.rotation.order = 'YXZ';

    // We store the rest values so lerpJoint can apply deltas on top.
    this._boneRestX = {};
    this._boneRestY = {};
    this._boneRestZ = {};
    const jointKeys = ['shoulderL','elbowL','shoulderR','elbowR','hipL','kneeL','hipR','kneeR','headGroup','neckGroup'];
    for (const key of jointKeys) {
      if (this[key] && this[key].isBone) {
        this._boneRestX[key] = this[key].rotation.x;
        this._boneRestY[key] = this[key].rotation.y;
        this._boneRestZ[key] = this[key].rotation.z;
      }
    }

    // Arm offsets tuned via in-game bone posing tool to match natural
    // snowboard riding stance (asymmetric — regular stance, left foot forward).
    // These offsets are added to the T-pose rest values so the procedural
    // animation deltas (lean sway, impact, etc.) layer cleanly on top.
    this._boneRestX['shoulderL'] = (this._boneRestX['shoulderL'] || 0) + 0.02;
    this._boneRestY['shoulderL'] = (this._boneRestY['shoulderL'] || 0) + 0.04;
    this._boneRestZ['shoulderL'] = (this._boneRestZ['shoulderL'] || 0) + 0.60;
    this._boneRestX['shoulderR'] = (this._boneRestX['shoulderR'] || 0) + 0.53;
    this._boneRestY['shoulderR'] = (this._boneRestY['shoulderR'] || 0) - 0.33;
    this._boneRestZ['shoulderR'] = (this._boneRestZ['shoulderR'] || 0) - 1.01;
    // Elbows
    this._boneRestX['elbowL'] = (this._boneRestX['elbowL'] || 0) + 0.88;
    this._boneRestY['elbowL'] = (this._boneRestY['elbowL'] || 0) + 0.23;
    this._boneRestZ['elbowL'] = (this._boneRestZ['elbowL'] || 0) + 0.73;
    this._boneRestX['elbowR'] = (this._boneRestX['elbowR'] || 0) + 0.73;
    this._boneRestY['elbowR'] = (this._boneRestY['elbowR'] || 0) - 0.11;
    this._boneRestZ['elbowR'] = (this._boneRestZ['elbowR'] || 0) - 0.50;
    // Hip Z offsets to spread legs along the board so feet land in bindings
    // Mixamo hips have ±π Z rest; additional Z offset splays legs along board length
    this._boneRestZ['hipL'] = (this._boneRestZ['hipL'] || 0) + 0.25; // front foot
    this._boneRestZ['hipR'] = (this._boneRestZ['hipR'] || 0) - 0.22; // back foot

    // Position starts at origin — _snapFeetToBindings() handles per-frame alignment
    model.position.set(0, 0, 0);

    this.glbLoaded = true;
    console.log('[Player] GLB character model loaded successfully');
    console.log('[Player] Bones found:', Object.values(boneMap).filter(k => this[k]).length, '/', Object.keys(boneMap).length);
  }


  buildSnowboard() {
    // Shaped board with sidecut profile using ExtrudeGeometry
    const shape = new THREE.Shape();
    // Board profile: nose → waist → tail with sidecut
    const noseW = 0.15, waistW = 0.13, tailW = 0.145;
    const noseZ = 0.828, tailZ = -0.828;
    shape.moveTo(-waistW, tailZ + 0.15);
    shape.quadraticCurveTo(-tailW, tailZ + 0.05, -tailW * 0.7, tailZ);
    shape.quadraticCurveTo(0, tailZ - 0.06, tailW * 0.7, tailZ);
    shape.quadraticCurveTo(tailW, tailZ + 0.05, waistW, tailZ + 0.15);
    shape.lineTo(waistW, 0);
    shape.quadraticCurveTo(noseW + 0.01, noseZ * 0.3, noseW, noseZ - 0.15);
    shape.quadraticCurveTo(noseW, noseZ - 0.05, noseW * 0.7, noseZ);
    shape.quadraticCurveTo(0, noseZ + 0.06, -noseW * 0.7, noseZ);
    shape.quadraticCurveTo(-noseW, noseZ - 0.05, -noseW, noseZ - 0.15);
    shape.quadraticCurveTo(-noseW - 0.01, noseZ * 0.3, -waistW, 0);
    shape.lineTo(-waistW, tailZ + 0.15);

    const extrudeSettings = {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 1,
      curveSegments: 8
    };
    const boardGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Rotate so the board lies flat (extrude goes along Y, we want it along Y axis as thickness)
    boardGeo.rotateX(-Math.PI / 2);
    boardGeo.translate(0, 0.025, 0);
    this.boardMesh = new THREE.Mesh(boardGeo, this.boardMat);
    this.boardMesh.castShadow = true;

    // Nose rocker (curved tip)
    const noseRocker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.035, 8, 1, false, 0, Math.PI),
      this.boardMat);
    noseRocker.rotation.z = Math.PI / 2;
    noseRocker.rotation.y = Math.PI / 2;
    noseRocker.position.set(0, 0.04, 0.794);
    this.boardMesh.add(noseRocker);

    // Tail rocker
    const tailRocker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8, 1, false, 0, Math.PI),
      this.boardMat);
    tailRocker.rotation.z = Math.PI / 2;
    tailRocker.rotation.y = -Math.PI / 2;
    tailRocker.position.set(0, 0.04, -0.794);
    this.boardMesh.add(tailRocker);

    // Bindings with highback and straps
    this.bindingMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    this.bindings = [];
    for (const z of [0.22, -0.22]) {
      // Base plate
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.16), this.bindingMat);
      b.position.set(0, 0.06, z); this.boardMesh.add(b);
      this.bindings.push(b);

      // Highback plate
      const highback = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.015), this.bindingMat);
      highback.position.set(0, 0.12, z - 0.075);
      highback.rotation.x = 0.25; // angled back
      this.boardMesh.add(highback);

      // Ankle strap arc
      const ankleStrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.06, 0.012, 4, 8, Math.PI), this.bindingMat);
      ankleStrap.position.set(0, 0.1, z);
      ankleStrap.rotation.y = Math.PI / 2;
      this.boardMesh.add(ankleStrap);

      // Toe strap arc
      const toeStrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.01, 4, 8, Math.PI), this.bindingMat);
      toeStrap.position.set(0, 0.08, z + 0.06);
      toeStrap.rotation.y = Math.PI / 2;
      this.boardMesh.add(toeStrap);
    }
    this.boardGroup.add(this.boardMesh);
  }

  buildSkis() {
    const bindMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    for (const side of [-1, 1]) {
      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.035, 1.7), this.boardMat);
      ski.position.set(side * 0.14, 0, 0);
      ski.castShadow = true;

      // Nose and tail tips
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.15), this.boardMat);
      nose.position.set(0, 0.03, 0.85); nose.rotation.x = 0.35; ski.add(nose);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.12), this.boardMat);
      tail.position.set(0, 0.025, -0.85); tail.rotation.x = -0.3; ski.add(tail);

      // One binding per ski
      const bind = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.16), bindMat);
      bind.position.set(0, 0.05, 0.05); ski.add(bind);

      this.boardGroup.add(ski);
    }
  }

  buildPoles() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.3 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const basketMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });

    for (const elbow of [this.elbowL, this.elbowR]) {
      const poleGroup = new THREE.Group();
      poleGroup.position.set(0, -0.15, 0.05);
      poleGroup.rotation.x = 0.2; // slight forward tilt

      // Shaft
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.9, 6), poleMat);
      shaft.position.set(0, -0.45, 0);
      poleGroup.add(shaft);

      // Grip at top
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.1, 6), gripMat);
      grip.position.set(0, 0, 0);
      poleGroup.add(grip);

      // Basket near bottom
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 8), basketMat);
      basket.position.set(0, -0.85, 0);
      poleGroup.add(basket);

      elbow.add(poleGroup);
    }
  }

  resetJointsToRiding(speed) {
    const s = speed || 0.1;
    const isSki = this.equipmentType === 'ski';
    // Arms: hanging down at sides, angled downward
    const glbArm = 0.35;
    const armFwd = 0.15;
    this.lerpJoint(this.shoulderL, 'z', isSki ? -0.75 : -glbArm, s);
    this.lerpJoint(this.shoulderL, 'x', armFwd, s);
    this.lerpJoint(this.elbowL, 'x', -0.3, s);

    this.lerpJoint(this.shoulderR, 'z', isSki ? 0.75 : glbArm, s);
    this.lerpJoint(this.shoulderR, 'x', armFwd, s);
    this.lerpJoint(this.elbowR, 'x', -0.3, s);

    // Legs: athletic bend
    this.lerpJoint(this.hipL, 'x', -0.5, s);
    this.lerpJoint(this.kneeL, 'x', 0.8, s);
    this.lerpJoint(this.hipR, 'x', -0.5, s);
    this.lerpJoint(this.kneeR, 'x', 0.8, s);

    // Head look
    this.lerpJoint(this.headGroup, 'y', -0.6, s);
  }

  // Jumps launch at the original ground speed so air height and distance are
  // unchanged by the slower groundSpeedScale. Undone as soon as we touch down.
  boostAirSpeed() {
    if (this._airSpeedBoost !== 1) return;
    this._airSpeedBoost = 1 / this.groundSpeedScale;
    this.velocity.x *= this._airSpeedBoost;
    this.velocity.z *= this._airSpeedBoost;
  }

  restoreGroundSpeed() {
    if (this._airSpeedBoost === 1) return;
    this.velocity.x /= this._airSpeedBoost;
    this.velocity.z /= this._airSpeedBoost;
    this._airSpeedBoost = 1;
  }

  update(dt, input, terrain) {
    if (!this.grounded && !this.grinding) this.railTiming = null; // timing meter is only for the ground and rails
    // Rails keep air speed; it's restored to ground speed on the next landing
    if (this.grounded && !this.grinding && !this.onKicker) this.restoreGroundSpeed();

    if (this.crashed) {
      this.updateDebris(dt);
      return this.getState(terrain);
    }

    if (this.tomahawking) {
      this.updateTomahawk(dt, terrain);
      return this.getState(terrain);
    }

    this.wasGrounded = this.grounded;
    this.wasGrinding = this.grinding;
    this.landedOnRail = false; // one-shot: cleared each frame, set by _initGrindFromAir
    if (this.grindExitTimer > 0) this.grindExitTimer -= dt;
    this.isTucking = input.tuck;

    const groundOffset = 0.08; // board rests on snow

    // Tick kicker cooldown
    this.kickerCooldown = Math.max(0, this.kickerCooldown - dt);
    this.terrainPopCooldown = Math.max(0, this.terrainPopCooldown - dt);

    // ===== SURFACE TYPE QUERY =====
    if (this.grounded && terrain.config && terrain.config.frozenCreeks) {
      // Frozen creeks give ice physics
      let onIce = false;
      for (const fc of terrain.config.frozenCreeks) {
        if (this.position.z < fc.startZ && this.position.z > fc.endZ) {
          const t = (fc.startZ - this.position.z) / (fc.startZ - fc.endZ);
          const pathIdx = t * (fc.xPath.length - 1);
          const i0 = Math.floor(pathIdx);
          const i1 = Math.min(i0 + 1, fc.xPath.length - 1);
          const frac = pathIdx - i0;
          const cx = fc.xPath[i0] * (1 - frac) + fc.xPath[i1] * frac;
          if (Math.abs(this.position.x - cx) < fc.halfWidth * 1.5) { onIce = true; break; }
        }
      }
      this.surfaceType = onIce ? 'ice' : 'snow';
    } else if (!this.grounded) {
      // Keep last surface type while airborne (for particle effects)
    } else {
      this.surfaceType = 'snow';
    }

    // ===== EFFECTIVE SURFACE HEIGHT =====
    // Includes kicker surfaces — player rides up ramps naturally
    const surfaceH = this.getSurfaceHeight(terrain);

    // ===== GRAVITY =====
    this.velocity.y += this.gravity * dt;

    // ===== GROUND STICKINESS =====
    // When already grounded with no upward velocity, snap to surface.
    // Prevents little hops when turning fast across terrain variations.
    if (this.grounded && this.velocity.y <= 0 && !this.grinding) {
      this.position.y = surfaceH + groundOffset;
      this.velocity.y = 0;
    }

    // ===== TERRAIN POP — natural air from riding over bump crests =====
    if (this.grounded && !this.grinding && !this.onKicker &&
        this.kickerCooldown <= 0 && this.terrainPopCooldown <= 0) {
      const pop = terrain.config?.terrainPop;
      if (pop) {
        const groundSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        const speed = groundSpeed / this.groundSpeedScale; // pop as if at original speed
        if (speed > (pop.minSpeed || 8)) {
          const eps = pop.sampleDist || 2.0;
          const dirX = this.velocity.x / groundSpeed;
          const dirZ = this.velocity.z / groundSpeed;
          const hBehind = terrain.getHeightAt(
            this.position.x - dirX * eps, this.position.z - dirZ * eps);
          const hHere = terrain.getHeightAt(this.position.x, this.position.z);
          const hAhead = terrain.getHeightAt(
            this.position.x + dirX * eps, this.position.z + dirZ * eps);
          // Negative curvature = convex = crest of a bump
          const curvature = (hAhead - 2 * hHere + hBehind) / (eps * eps);
          if (curvature < -(pop.curvatureThreshold || 0.01)) {
            const popStrength = Math.min(
              -curvature * speed * (pop.popFactor || 12),
              pop.maxPop || 12
            );
            if (popStrength > 1.5) {
              this.velocity.y = popStrength;
              this.boostAirSpeed();
              this.grounded = false;
              this.peakHeight = 0;
              this.launchedFromKicker = true;
              this.terrainPopCooldown = 0.8;
            }
          }
        }
      }
    }

    // ===== GROUND / SURFACE COLLISION =====
    const wasInAir = !this.grounded && !this.grinding;
    if (this.grounded) this._rolledRailLip = false;
    const nextY = this.position.y + this.velocity.y * dt;

    if (nextY <= surfaceH + groundOffset) {
      this.position.y = surfaceH + groundOffset;

      // Detect landing zone and compute slope absorption
      this.landingZoneSlopeAbsorb = 0;
      this.landingQuality = null;

      if (wasInAir && this.airTime > 0.4) {
        for (const ramp of terrain.ramps) {
          if (!ramp.jump) continue;
          const j = ramp.jump;
          const d = j.zStart - this.position.z;
          const part = terrain.jumpPart(j, d);
          if (!part || terrain.jumpSurfaceAt(ramp, this.position.x, this.position.z) === null) continue;
          if (part === 'landing') {
            // Landing slope soaks up the drop; middle of it is the sweet spot
            const worldSlope = j.landSlope + terrain.slopeAngle;
            this.landingZoneSlopeAbsorb = Math.min(worldSlope * 0.8, 0.7);
            const t = (d - j.landStart) / (j.landEnd - j.landStart);
            this.landingQuality = (t >= 0.15 && t <= 0.7) ? 'perfect' : 'clean';
          } else if (part === 'knuckle') {
            // Casing the knuckle: rough but the rounded edge soaks up some of it
            this.landingZoneSlopeAbsorb = 0.45;
            this.landingQuality = 'clean';
          } else if (part !== 'kicker') {
            // Deck: flat and harsh — you came up short
            this.landingZoneSlopeAbsorb = 0;
            this.landingQuality = 'clean';
          }
          break;
        }
        for (const ramp of terrain.ramps) {
          if (ramp.type !== 'kicker' || ramp.landingZoneStartZ === undefined) continue;
          if (this.position.z > ramp.position.z + 50) continue;
          if (this.position.z < ramp.landingZoneEndZ - 5) continue;
          const dx = this.position.x - ramp.position.x;
          const z = this.position.z;
          if (Math.abs(dx) < ramp.landingWidth / 2 &&
              z < ramp.landingZoneStartZ && z > ramp.landingZoneEndZ) {
            const totalLen = ramp.landingZoneStartZ - ramp.landingZoneEndZ;
            const t = (ramp.landingZoneStartZ - z) / totalLen;
            // Piecewise: flat table then linear slope
            const tableFrac = ramp.landingGap / (ramp.landingGap + ramp.landingLength);
            if (t <= tableFrac) {
              // On the knuckle/table — no slope absorption, harsh landing
              this.landingZoneSlopeAbsorb = 0;
              this.landingQuality = 'clean';
            } else {
              // On the slope — linear slope gives constant absorption
              const heightDrop = ramp.landingTopHeight - ramp.landingBottomHeight;
              const slopeLen = ramp.landingLength;
              const slopeAngle = heightDrop / slopeLen; // rise/run
              this.landingZoneSlopeAbsorb = Math.min(slopeAngle * 0.8, 0.7);
              // Sweet spot: middle of the slope section (slopeT 0.3-0.7)
              const slopeT = (t - tableFrac) / (1 - tableFrac);
              this.landingQuality = (slopeT >= 0.25 && slopeT <= 0.75) ? 'perfect' : 'clean';
            }
            break;
          }
        }
      }

      if (wasInAir) this._latchLayout();

      // Crash check on landing — must land within 35° of clean rotation
      if (wasInAir && this.airTime > 0.4) {
        const rawFlip = this.trickRotation.x;
        const nearestFlipRot = Math.round(rawFlip / (Math.PI * 2)) * Math.PI * 2;
        const flipRemainder = Math.abs(rawFlip - nearestFlipRot);

        const rawSpin = this.trickRotation.y;
        const nearestSpinRot = Math.round(rawSpin / Math.PI) * Math.PI;
        const spinRemainder = Math.abs(rawSpin - nearestSpinRot);

        const rawRoll = this.trickRotation.z;
        const nearestRollRot = Math.round(rawRoll / (Math.PI * 2)) * Math.PI * 2;
        const rollRemainder = Math.abs(rawRoll - nearestRollRot);

        if (flipRemainder > this.landingTolerance ||
            spinRemainder > this.landingTolerance ||
            rollRemainder > this.rollLandingTolerance) {
          if (this.backcountryMode) {
            this.triggerTomahawk(terrain);
          } else {
            this.triggerCrash();
          }
          return this.getState(terrain);
        }
      }

      // Fall damage — backcountry: no fall damage (survive big drops if landed clean)
      const effectiveVY = this.velocity.y * (1 - this.landingZoneSlopeAbsorb);
      if (effectiveVY < -35 && !this.backcountryMode) {
        this.triggerCrash();
        return this.getState(terrain);
      }

      // Landing impact spring — trigger on landing
      if (wasInAir && this.airTime > 0.2) {
        this.landingImpact = Math.min(Math.abs(effectiveVY) / 20, 1.0);
        this.landingImpactVel = 0;
      }

      // Slope-aware landing: convert downward speed to forward speed
      if (this.velocity.y < 0) {
        const downSpeed = -this.velocity.y;
        if (this.landingZoneSlopeAbsorb > 0) {
          // Landing zone: slope absorbs more impact, converts to speed
          this.velocity.z -= this.landingZoneSlopeAbsorb * downSpeed * 0.8;
        } else {
          // Normal terrain landing
          const normal = terrain.getSlopeNormalAt(this.position.x, this.position.z);
          this.velocity.z -= (1.0 - normal.y) * downSpeed * 0.3;
        }
        this.velocity.y = 0;
      }

      if (!this.grounded) {
        // Detect switch landing: odd spin count (180, 540, 900...) toggles switch
        const spins = Math.floor(Math.abs(this.trickRotation.y) / Math.PI);
        if (spins % 2 === 1) {
          this.isSwitch = !this.isSwitch;
          this.updateStanceYaw();
        }

        // Just landed — snap board rotation clean and sync heading
        this.trickRotation.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.boardGroup.rotation.set(0, 0, 0);

        const landingHeading = Math.atan2(this.velocity.x, this.velocity.z);
        this.heading = landingHeading;
        this.peakHeight = Math.max(this.peakHeight, this.currentHeightAboveGround);
      }

      this.grounded = true;
      this.grinding = false;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
      this.currentHeightAboveGround = this.position.y - surfaceH;
      if (this.currentHeightAboveGround > this.peakHeight) {
        this.peakHeight = this.currentHeightAboveGround;
      }
    }

    // ===== KICKER RIDE-UP =====
    // Check if we're on a kicker and adjust position/velocity to follow ramp surface
    this.updateKickerRide(terrain, dt);
    if (this.grounded && !this.grinding) this._inrunSpeedCheck(terrain, dt);

    // ===== RAIL GRIND CHECK =====
    this.updateRailGrind(terrain, dt);

    // ===== LANDING IMPACT SPRING =====
    if (this.landingImpact > 0.01) {
      const springK = 12;
      const damping = 6;
      const springForce = -springK * this.landingImpact;
      this.landingImpactVel += springForce * dt;
      this.landingImpactVel *= (1 - damping * dt);
      this.landingImpact += this.landingImpactVel * dt;
      if (this.landingImpact < 0) { this.landingImpact = 0; this.landingImpactVel = 0; }
    }

    if (this.grounded && !this.grinding) {
      // ===== GROUND MOVEMENT (CARVING SYSTEM) =====
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

      // Auto-accelerate downhill
      let slopeAccel = (this.isTucking ? 16 : 11) * this.groundSpeedScale;

      // Setting a trick while loading the pop (holding jump, or a pop saved for the lip)
      const loadingPop = this.ollieCharge > 0 || this.kickerPopBoost > 0 || this.onKicker;
      const setSpin = loadingPop ? (input.spinLeft ? 1 : input.spinRight ? -1 : 0) : 0;
      const setFlip = loadingPop ? (input.flipForward ? -1 : input.flipBackward ? 1 : 0) : 0;
      if (setSpin || setFlip) {
        if (setSpin !== this._set.spin || setFlip !== this._set.flip) this._set.amt = 0;
        this._set.spin = setSpin;
        this._set.flip = setFlip;
        this._set.amt = Math.min(1, this._set.amt + dt / 0.35); // full wind-up in 0.35 s
      } else {
        this._set.amt = Math.max(0, this._set.amt - dt * 3);
        if (this._set.amt === 0) { this._set.spin = 0; this._set.flip = 0; }
      }
      const settingTrick = !!(setSpin || setFlip);
      this._backOpen = 0;
      this._fromRail = false;
      this._launched = false;
      this._rotMulLocked = false;

      // S = brake on ground (NOT flip — that's air only). While setting a backflip it's the set instead.
      if (input.brake && !wasInAir && !settingTrick) {
        slopeAccel = 3 * this.groundSpeedScale;
      }

      // ---- CARVING TURN ----
      // Smoothly ramp the turn rate up/down (like digging in an edge)
      // Setting a spin stops the carve: A/D wind up the shoulders instead
      const steerInput = setSpin ? 0 : input.steer; // -1..+1

      if (steerInput !== 0) {
        // Ramp toward target turn rate
        const targetTurnRate = steerInput * this.turnRateMax;
        const accel = this.turnAccel * dt;
        if (Math.abs(targetTurnRate - this.turnRate) < accel) {
          this.turnRate = targetTurnRate;
        } else {
          this.turnRate += Math.sign(targetTurnRate - this.turnRate) * accel;
        }
      } else {
        // Smoothly decay turn rate back to zero
        const decel = this.turnDecel * dt;
        if (Math.abs(this.turnRate) < decel) {
          this.turnRate = 0;
        } else {
          this.turnRate -= Math.sign(this.turnRate) * decel;
        }
      }

      // Speed affects turning: slower = tighter, faster = wider arcs
      const speedRatio = Math.max(0.2, Math.min(hSpeed / (50 * this.groundSpeedScale), 1.0));
      const effectiveTurnRate = this.turnRate * (1.2 - speedRatio * 0.3);

      // Rotate the heading (subtract so A=left, D=right from camera view)
      this.heading -= effectiveTurnRate * dt;

      // Apply gravity/slope acceleration along the heading direction
      // Decompose slope force into the heading direction
      const headSinH = Math.sin(this.heading);
      const headCosH = Math.cos(this.heading);

      // Slope pulls you downhill (-Z). How much of that goes along your heading?
      const downhillComponent = -headCosH; // how much of -Z projects onto heading
      const lateralDrift = headSinH;

      // Apply acceleration along heading
      const forwardAccel = slopeAccel * Math.max(0, downhillComponent);
      const speed = hSpeed + forwardAccel * dt;

      // Convert heading + speed back to velocity
      this.velocity.x = headSinH * speed;
      this.velocity.z = headCosH * speed;

      // Carving: turning at speed creates a slight speed scrub (edge friction).
      // Per-second loss, so it doesn't depend on frame rate.
      const carveFriction = Math.pow(1.0 - Math.abs(this.turnRate) * this.carveScrub, dt * 60);

      // Standard friction — modified by surface type
      let frictionMul;
      if (input.brake && !settingTrick) {
        frictionMul = 0.94;
        this.turnRate *= 0.90;
      } else {
        let baseFriction = this.isTucking ? 0.998 : 0.995;
        if (this.surfaceType === 'ice') {
          baseFriction = this.isTucking ? 0.999 : 0.998;
          this.turnRate *= 0.7; // harder to turn on ice
        }
        frictionMul = baseFriction;
      }
      this.velocity.x *= frictionMul * carveFriction;
      this.velocity.z *= frictionMul * carveFriction;

      // Ollie / Pop: hold jump to load (rider crouches), release to pop. Longer hold = bigger pop.
      // Riding at a rail lip, the meter fills by itself instead: tap jump when it's in the gold.
      const jumpHeld = input.jumpHeld ?? input.jump;
      this._updateRailOnTiming(terrain);
      if (this.railTiming) {
        this.ollieCharge = 0;
        if (input.jump && !this._railOnLocked) {
          this.kickerPopBoost = Math.max(0.3, this._popStrength(this.railTiming.meter));
          this._pendingPerfectOn = this.lastPopPerfect;
          this._railOnLocked = true;
        }
      } else if (jumpHeld) {
        this.ollieCharge = Math.min(1, this.ollieCharge + dt / this.ollieChargeTime);
      } else if (this.ollieCharge > 0) {
        if (this.onKicker || this._jumpAhead(terrain)) {
          // Released on a kicker, a rail lip, or the run-in to a jump: saved for the lip
          // (you can't pop off a jump before its lip)
          this.kickerPopBoost = this._popStrength(this.ollieCharge);
          this.ollieCharge = 0;
        } else if (this.ollieCharge >= 0.15) {
          // Backcountry: full jump (pillows, bumps, drops need big air)
          // Park flat ground: reduced ollie (~6 feet)
          const force = this.backcountryMode ? this.jumpForce : this.ollieForce;
          this.velocity.y = force * this._popStrength(this.ollieCharge);
          this.ollieCharge = 0;
          this.grounded = false;
          this.peakHeight = 0;
          this.launchedFromKicker = this.backcountryMode;
        } else {
          this.ollieCharge = 0; // a quick tap doesn't pop
        }
      }

      // Speed cap
      const newHSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (newHSpeed > this.maxSpeed) {
        const s = this.maxSpeed / newHSpeed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }

      // Reset trick rotation and cork state
      this.trickRotation.set(0, 0, 0);
      this.angularVelocity.multiplyScalar(0.7);
      this.isCorkingThisJump = false;
      this.corkFlipDirection = 0;
      this.corkSpinDirection = 0;
      this.isLayingOut = false;
      this._backflipTime = 0;
      this._layoutTime = 0;

      // ---- VISUAL: smooth edge lean & board tilt ----
      this.edgeLean = this.turnRate / this.turnRateMax; // -1 to 1
      this.edgeLeanSmooth = THREE.MathUtils.lerp(this.edgeLeanSmooth, this.edgeLean, 0.12);

      // Board tilts into the turn (laid-down carve feel)
      this.boardGroup.rotation.z = THREE.MathUtils.lerp(
        this.boardGroup.rotation.z, -this.edgeLeanSmooth * 0.7, 0.18
      );
      // Forward tilt when carving hard
      this.boardGroup.rotation.x = THREE.MathUtils.lerp(
        this.boardGroup.rotation.x, Math.abs(this.edgeLeanSmooth) * 0.15, 0.15
      );
      // Snap board Y rotation back to neutral (prevents residual spin drift)
      this.boardGroup.rotation.y = THREE.MathUtils.lerp(
        this.boardGroup.rotation.y, 0, 0.25
      );

      // --- GROUNDED RIDER ANIMATIONS ---
      const lean = this.edgeLeanSmooth;
      const impactBend = this.landingImpact * 0.8;

      if (!this._rideTime) this._rideTime = 0;
      this._rideTime += dt;
      const breathe = Math.sin(this._rideTime * 1.5) * 0.015;
      const rg = this.riderGroup;
      // The body leans with the board on edge; counter a little so the rider angulates instead of toppling
      rg.rotation.x = THREE.MathUtils.lerp(rg.rotation.x, -lean * 0.3, 0.15);
      rg.rotation.z = THREE.MathUtils.lerp(rg.rotation.z, 0, 0.15);

      if (this.isTucking || this.ollieCharge > 0.05) {
        // Speed tuck / loading an ollie: knees deep, chest folded over the board, hands in front of the knees
        const crouch = this.isTucking ? 1 : Math.min(1, this.ollieCharge * 1.5);
        // (hand spots are in riderGroup space, which already drops with the crouch)
        rg.position.y = THREE.MathUtils.lerp(rg.position.y, -0.06 - 0.16 * crouch, 0.15);
        // Setting a trick: shoulders wind up against the spin, the chest loads for a flip
        const set = this._set;
        const windUp = -set.spin * 0.6 * set.amt;
        const flipLoad = set.flip * 0.25 * set.amt;  // backflip: chest drops to load; frontflip: chest up
        this._setSpine(0.3 + 0.45 * crouch + flipLoad, -lean * 0.2 + windUp, 0);
        if (set.spin) {
          // Arms open out so the wind-up reads, ready to throw
          this.lerpJoint(this.shoulderL, 'z', -0.7, 0.15);
          this.lerpJoint(this.shoulderL, 'x', 0.3, 0.15);
          this.lerpJoint(this.elbowL, 'x', -0.5, 0.15);
          this.lerpJoint(this.shoulderR, 'z', 0.7, 0.15);
          this.lerpJoint(this.shoulderR, 'x', 0.3, 0.15);
          this.lerpJoint(this.elbowR, 'x', -0.5, 0.15);
        } else {
          this._reach('L', 'rider', -0.09, 0.62, 0.42, 0.2);
          this._reach('R', 'rider', 0.09, 0.6, 0.4, 0.2);
        }
        this.lerpJoint(this.headGroup, 'x', -0.35 * crouch, 0.12); // chin up, eyes down the hill
      } else {
        // Carving. Toeside (lean > 0): knees drive over the toes, chest stays fairly tall.
        // Heelside (lean < 0): sit down low, fold at the waist, arms reach forward for balance.
        const toe = Math.max(0, lean), heel = Math.max(0, -lean);
        rg.position.y = THREE.MathUtils.lerp(rg.position.y,
          -0.06 - 0.08 * toe - 0.16 * heel - impactBend * 0.15 + breathe, 0.12);
        this._setSpine(0.22 + 0.08 * toe + 0.15 * heel + impactBend * 0.3, -lean * 0.3, 0);

        // Arms: relaxed and athletic; the leading arm points into the turn
        const armZ = this.equipmentType === 'ski' ? 0.75 : 0.4;
        const armFwd = 0.15 + heel * 0.7 + impactBend * 0.3;
        this.lerpJoint(this.shoulderL, 'z', -armZ - toe * 0.35, 0.1);
        this.lerpJoint(this.shoulderL, 'x', armFwd - toe * 0.2, 0.1);
        this.lerpJoint(this.elbowL, 'x', -0.35 - heel * 0.3, 0.1);
        this.lerpJoint(this.elbowL, 'z', 0, 0.1);
        this.lerpJoint(this.shoulderR, 'z', armZ + heel * 0.2, 0.1);
        this.lerpJoint(this.shoulderR, 'x', armFwd + toe * 0.3, 0.1);
        this.lerpJoint(this.elbowR, 'x', -0.35 - toe * 0.3, 0.1);
        this.lerpJoint(this.elbowR, 'z', 0, 0.1);

        if (!this.legIK) {
          this.lerpJoint(this.hipL, 'x', -0.5 - impactBend * 0.5, 0.12);
          this.lerpJoint(this.kneeL, 'x', 0.8 + impactBend + lean * 0.2, 0.12);
          this.lerpJoint(this.hipR, 'x', -0.5 - impactBend * 0.5, 0.12);
          this.lerpJoint(this.kneeR, 'x', 0.8 + impactBend - lean * 0.2, 0.12);
        }
      }

      // Head looks into turns more aggressively + dips on landing impact
      const headLookY = -0.6 - lean * 0.35;
      this.lerpJoint(this.headGroup, 'y', headLookY, 0.1);
      const headRestX = this._boneRest(this.headGroup, 'x');
      if (impactBend > 0.1) {
        this.headGroup.rotation.x = THREE.MathUtils.lerp(
          this.headGroup.rotation.x, impactBend * 0.15 + headRestX, 0.15);
      } else if (!this.isTucking && this.ollieCharge <= 0.05) {
        this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, headRestX, 0.08);
      }

      // Keep stance yaw
      this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, this.STANCE_YAW, 0.15);

    } else if (this.grinding) {
      // ===== RAIL GRIND =====
      // Check if player has passed the end of the rail
      let railEnded = false;
      if (this.grindRail) {
        const dz = this.position.z - this.grindRail.position.z;
        if (Math.abs(dz) > this.grindRail.length / 2 + 0.5) {
          railEnded = true;
          this.railTiming = null;
          const endedRail = this.grindRail;
          this.grinding = false;
          this.grindRail = null;
          this.grounded = false;
          this.peakHeight = 0;
          if (endedRail.kickAngle) {
            // Kinked / up rail: the end kicks you off like a jump lip
            this._launchOffLip(endedRail.kickAngle, true);
            this.kickerCooldown = 0.5;
          } else {
            // Exit kicker pop — launch ~3-5 feet upward (about character height)
            this.velocity.y = 4.5;
          }
        }
      }

      if (!railEnded && this.grinding) {
        // Lock X position to rail center (smooth lerp so it feels natural)
        const railX = this.grindRail.position.x;
        this.position.x = THREE.MathUtils.lerp(this.position.x, railX, 0.15);
        // Dampen lateral drift, but turn it into speed along the rail instead of losing it
        const railHSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        this.velocity.x *= 0.8;
        this.velocity.z = (this.velocity.z <= 0 ? -1 : 1) * Math.sqrt(Math.max(0, railHSpeed ** 2 - this.velocity.x ** 2));

        // Lock Y to rail surface height at player's Z (follows terrain slope)
        const railTop = this._getRailTop(this.grindRail, terrain);
        // A frontswap is a little hop: the board lifts off the rail and lands back on it
        const swapHop = this._swapTimer > 0
          ? Math.sin(Math.PI * (1 - this._swapTimer / this.swapDuration)) * this.swapHopHeight : 0;
        this.position.y = railTop + 0.2 + swapHop;
        this.velocity.y = 0;

        // Maintain forward speed — very light friction so momentum carries
        this.velocity.z *= Math.pow(0.9998, dt * 60);

        // Rails steeper than the hill (down rails) speed you up a little
        if (terrain.getRailTopAt) {
          const railDir = this.velocity.z <= 0 ? -1 : 1;
          const railDrop = this._getRailTop(this.grindRail, terrain) - terrain.getRailTopAt(
            this.grindRail, this.position.x, this.position.z + railDir * 0.5);
          const extraSlope = railDrop / 0.5 - terrain.slopeAngle;
          const railMax = this.baseMaxSpeed / this.groundSpeedScale;
          if (extraSlope > 0 && Math.abs(this.velocity.z) < railMax) {
            this.velocity.z += railDir * extraSlope * this.railSlopeAccel * dt;
          }
        }

        // Minimum speed check: hop off rail below 20 km/h (5.556 m/s) — no points
        const grindSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (grindSpeed < 5.556 * this.visualSpeedScale * this.groundSpeedScale) {
          this.grinding = false;
          this.grindAborted = true; // signal TrickSystem to skip scoring
          this._grindedRails.add(this.grindRail);
          this.grindRail = null;
          this.grounded = false;
          this.peakHeight = 0;
          this.velocity.y = 2.0; // small hop off
          this.velocity.x += (Math.random() < 0.5 ? -1 : 1) * 3.0; // push to random side
          this.grindExitTimer = 0.3; // short cooldown — only blocks same rail re-snap
        }

        // Track grind duration
        this.grindTime += dt;
        this._fromRail = true;
        this._launched = false;
        this._rotMulLocked = false;

        // A/D for boardslide tricks while grinding.
        // Switching sides is a frontswap: it takes swapDuration and can't be interrupted, so it can't be spammed.
        const prevBoardslideType = this.boardslideType;
        this._swapTimer = Math.max(0, this._swapTimer - dt);
        const swapping = this._swapTimer > 0;
        let want = null;
        if (input.steer > 0) want = 'frontside';      // D key = frontside boardslide
        else if (input.steer < 0) want = 'backside';  // A key = backside boardslide
        if (swapping || want) {
          if (!swapping && want !== this.boardslideType) {
            if (this.boardslideType) this._swapTimer = this.swapDuration; // start a frontswap
            this.boardslideType = want;
          }
          const target = this.boardslideType === 'frontside' ? Math.PI / 2 : -Math.PI / 2;
          // Rotate at a steady rate: a full 180 swap takes swapDuration
          const rate = Math.PI / this.swapDuration;
          const diff = target - this.boardslideAngle;
          this.boardslideAngle += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
        } else if (this.boardslideType) {
          // No A/D but already in a boardslide (from spin-on or previous input) — hold angle
        } else if (this.equipmentType === 'ski') {
          // Skis can't 50-50 — default to frontside boardslide
          this.boardslideType = 'frontside';
          this.boardslideAngle = THREE.MathUtils.lerp(this.boardslideAngle, Math.PI / 2, 0.15);
        } else {
          // No A/D and no boardslide = regular 50-50 grind, settle toward 0
          this.boardslideAngle = THREE.MathUtils.lerp(this.boardslideAngle, 0, 0.15);
        }

        // Count a frontswap when one starts (switching between frontside ↔ backside)
        if (prevBoardslideType && this.boardslideType &&
            prevBoardslideType !== this.boardslideType) {
          this.frontswapCount = (this.frontswapCount || 0) + 1;
        }

        // Slight body lean during boardslide
        this.boardGroup.rotation.z = THREE.MathUtils.lerp(
          this.boardGroup.rotation.z,
          this.boardslideType ? Math.sign(this.boardslideAngle) * 0.15 : 0,
          0.1
        );

        // No spinning on the rail (A/D are boardslides here)
        this.angularVelocity.y = 0;
        this.boardGroup.rotation.y = this.trickRotation.y + this.boardslideAngle;

        // Grind rider animations: arms spread wide for balance
        this.lerpJoint(this.shoulderL, 'z', -0.9, 0.12);
        this.lerpJoint(this.shoulderL, 'x', 0, 0.12);
        this.lerpJoint(this.elbowL, 'x', -0.15, 0.12);
        this.lerpJoint(this.shoulderR, 'z', 0.9, 0.12);
        this.lerpJoint(this.shoulderR, 'x', 0, 0.12);
        this.lerpJoint(this.elbowR, 'x', -0.15, 0.12);

        // Slight crouch, chest over the rail; tuck the knees up for the frontswap hop
        const hopping = this._swapTimer > 0 ? Math.sin(Math.PI * (1 - this._swapTimer / this.swapDuration)) : 0;
        this._setSpine(0.2 + hopping * 0.2, 0, 0);

        // Maintain stance yaw
        this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, this.STANCE_YAW, 0.1);
        this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, -0.1 - hopping * 0.12, 0.2);
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0, 0.1);
        this.riderGroup.rotation.z = THREE.MathUtils.lerp(this.riderGroup.rotation.z, 0, 0.1);

        // Timing meter for popping off the end of the rail
        this._updateRailOffTiming();

        // Jump off rail: tapping in the gold near the end is a perfect pop off
        if (input.jump) {
          let pop = 0.55;
          if (this.railTiming) {
            const strength = this._popStrength(this.railTiming.meter);
            this.railPerfectOff = this.lastPopPerfect;
            pop = 0.55 + 0.4 * strength; // perfect = 0.95: enough air for a backflip off the end
            if (this.grindRail.kickAngle && this.railTiming.meter > 0.6) {
              // Popping off a kinked / up rail end adds to its kick
              this._launchOffLip(this.grindRail.kickAngle, true);
              pop = 0.2 * strength;
            } else {
              this.velocity.y = 0;
            }
            this.railTiming = null;
          } else {
            this.velocity.y = 0;
          }
          this.velocity.y += this.jumpForce * pop;
          this.grinding = false;
          this._grindedRails.add(this.grindRail);
          this.grindRail = null;
          this.grounded = false;
          this.peakHeight = 0;
          this.launchedFromKicker = true; // full trick rotation off rails
          this.grindExitTimer = 0.3; // short cooldown — only blocks same rail re-snap
        }
      }

    } else {
      // ===== AIRBORNE =====
      this.velocity.multiplyScalar(0.9998);

      // --- SMOOTH SPIN/FLIP SYSTEM ---
      // Spins and flips ramp up smoothly and STOP when keys are released.
      // Player must time their inputs to land clean rotations.
      // Shift = tuck in air → 1.5x faster spins/flips/corks
      // Flat ground ollie → 1.5x slower rotation (no flip-worthy air without a kicker)
      // Holding jump in the air opens you up: rotation slows down, and a backflip is laid out
      const openUp = !!(input.jumpHeld ?? false);
      this._launchRotation(input);
      const setMul = this._rotMul;
      const tuckMul = (input.tuck || input.grab) ? 1.5 : 1.0;
      const flatMul = this.launchedFromKicker ? 1.0 : 0.83;
      // Open up: spins slow right down; a backflip stays the same speed but is laid out
      const spinOpenMul = openUp ? 0.8 : tuckMul;
      const flipOpenMul = openUp ? 1.0 : tuckMul; // a layout flips as fast as a normal backflip
      const flipTarget = 6.5 * flipOpenMul * flatMul * setMul; // target flip angular vel
      const spinTarget = 4.8 * spinOpenMul * flatMul * setMul; // target spin angular vel (was 6.5: too fast)
      const rampUp = 20.0 * flipOpenMul * flatMul * setMul; // how fast rotation builds (rad/s²)
      // Layout backflip: backflip (S) with jump held for most of the flip
      this.isLayingOut = openUp && input.flipBackward && !(input.spinLeft || input.spinRight);
      if (input.flipBackward) this._backflipTime += dt;
      if (this.isLayingOut) this._layoutTime += dt;
      const stopSpeed = 18.0;     // how fast rotation stops on release (rad/s²)

      const flipping = input.flipForward || input.flipBackward;
      const spinning = input.spinLeft || input.spinRight;

      // --- CORK DETECTION ---
      // Cork = flip + spin pressed simultaneously. Off-axis diagonal rotation.
      const isCork = flipping && spinning;
      this.isCorkingThisJump = this.isCorkingThisJump || isCork;
      if (isCork && this.corkFlipDirection === 0) {
        // W = frontflip (-1), S = backflip (+1)
        this.corkFlipDirection = input.flipForward ? -1 : 1;
        this.corkSpinDirection = input.spinLeft ? 1 : -1;
      }

      // Helper: ramp toward target, or brake to zero on release
      const rampOrBrake = (current, target, hasInput) => {
        if (hasInput) {
          // Ramp toward target
          if (Math.abs(target - current) < rampUp * dt) return target;
          return current + Math.sign(target - current) * rampUp * dt;
        } else {
          // No input — hard brake to zero
          if (Math.abs(current) < stopSpeed * dt) return 0;
          return current - Math.sign(current) * stopSpeed * dt;
        }
      };

      if (isCork) {
        // Cork: flip + spin simultaneously → off-axis diagonal rotation
        const corkFlipTarget = (input.flipForward ? -1 : 1) * flipTarget * 0.7;
        const corkSpinTarget = (input.spinLeft ? 1 : -1) * spinTarget * 0.85;
        const corkRollTarget = (input.spinLeft ? 1 : -1) * 2.5;

        // Ramp all three axes — all stop when keys release
        this.angularVelocity.x = rampOrBrake(this.angularVelocity.x, corkFlipTarget, true);
        this.angularVelocity.y = rampOrBrake(this.angularVelocity.y, corkSpinTarget, true);
        this.angularVelocity.z = rampOrBrake(this.angularVelocity.z, corkRollTarget, true);
      } else {
        // --- FLIP (W/S) — ramp up while held, auto-snap on release ---
        // Negative X = frontflip (W), Positive X = backflip (S)
        if (flipping) {
          const flipDir = input.flipForward ? -1 : 1;
          this.angularVelocity.x = rampOrBrake(
            this.angularVelocity.x, flipDir * flipTarget, true
          );
        } else {
          // Auto-snap flip toward nearest clean 360°
          const nearestCleanFlip = Math.round(this.trickRotation.x / (Math.PI * 2)) * Math.PI * 2;
          const flipError = nearestCleanFlip - this.trickRotation.x;
          if (Math.abs(flipError) > 0.05 && Math.abs(this.angularVelocity.x) < 3.0) {
            const snapTarget = Math.sign(flipError) * Math.min(Math.abs(flipError) * 4, 5.0);
            this.angularVelocity.x = rampOrBrake(this.angularVelocity.x, snapTarget, true);
          } else {
            this.angularVelocity.x = rampOrBrake(this.angularVelocity.x, 0, false);
          }
        }

        // --- SPIN (A/D) — ramp up while held, auto-snap on release ---
        if (spinning) {
          const spinDir = input.spinLeft ? 1 : -1;
          this.angularVelocity.y = rampOrBrake(
            this.angularVelocity.y, spinDir * spinTarget, true
          );
        } else {
          // Auto-snap spin toward nearest clean 180°
          const nearestCleanSpin = Math.round(this.trickRotation.y / Math.PI) * Math.PI;
          const spinError = nearestCleanSpin - this.trickRotation.y;
          if (Math.abs(spinError) > 0.05 && Math.abs(this.angularVelocity.y) < 3.0) {
            const snapTarget = Math.sign(spinError) * Math.min(Math.abs(spinError) * 4, 5.0);
            this.angularVelocity.y = rampOrBrake(this.angularVelocity.y, snapTarget, true);
          } else {
            this.angularVelocity.y = rampOrBrake(this.angularVelocity.y, 0, false);
          }
        }

        // Roll auto-snaps toward nearest clean 360° when not corking
        const nearestCleanRoll = Math.round(this.trickRotation.z / (Math.PI * 2)) * Math.PI * 2;
        const rollError = nearestCleanRoll - this.trickRotation.z;
        if (Math.abs(rollError) > 0.05) {
          // Steer roll toward nearest clean rotation
          const snapTarget = Math.sign(rollError) * Math.min(Math.abs(rollError) * 4, 6.0);
          this.angularVelocity.z = rampOrBrake(this.angularVelocity.z, snapTarget, true);
        } else {
          this.angularVelocity.z = rampOrBrake(this.angularVelocity.z, 0, false);
        }
      }

      // (No air steering: A/D spin you in the air)

      // Apply angular velocity to trick rotation
      this.trickRotation.x += this.angularVelocity.x * dt;
      this.trickRotation.y += this.angularVelocity.y * dt;
      this.trickRotation.z += this.angularVelocity.z * dt;

      // Apply to board visual
      this.boardGroup.rotation.x = this.trickRotation.x;
      this.boardGroup.rotation.y = this.trickRotation.y;
      this.boardGroup.rotation.z = this.trickRotation.z;

      // Decay turn rate while airborne so you land neutral
      this.turnRate *= 0.95;

      this.isGrabbing = input.grab;
      this.grabType = input.grabType;

      // --- AIRBORNE RIDER ANIMATIONS ---
      // Maintain sideways stance in air
      this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, this.STANCE_YAW, 0.1);

      // A straight backflip: the rider turns board and body 65° toward where they're going, flips
      // straight over their back (not a sideways wildcat), then turns back to land. Visual only:
      // the flip axis stays across the direction of travel because x is the outer Euler rotation.
      this._straightBack = !(input.spinLeft || input.spinRight) && !this.isGrabbing &&
        (input.flipBackward || this.angularVelocity.x > 2.5);
      this._backOpen = THREE.MathUtils.lerp(this._backOpen || 0, this._straightBack ? 1 : 0, 0.15);
      const openDir = Math.sign(this.STANCE_YAW) || 1;
      this.boardGroup.rotation.y = this.trickRotation.y + openDir * THREE.MathUtils.degToRad(65) * this._backOpen;
    }

    // ===== OBSTACLE COLLISIONS (capsule vs cylinder/sphere) =====
    for (const obs of terrain.obstacles) {
      const dx = this.position.x - obs.position.x;
      const dz = this.position.z - obs.position.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);
      const minDist = this.capsuleRadius + obs.radius;

      // Vertical overlap check: player capsule vs obstacle height
      const playerBottom = this.position.y;
      const playerTop = this.position.y + this.capsuleHalfH * 2;
      const obsBottom = obs.position.y;
      const obsTop = obs.position.y + (obs.type === 'tree' ? 8 : 2.5);

      if (dist2D < minDist && playerBottom < obsTop && playerTop > obsBottom) {
        this.triggerCrash();
        return this.getState(terrain);
      }
    }

    // ===== RIVER COLLISION (Peak backcountry) =====
    if (terrain.riverZones && terrain.riverZones.length > 0 && !this.inRiver) {
      this.checkRiverCollision(terrain);
      if (this.inRiver) {
        return this.getState(terrain);
      }
    }
    if (this.inRiver) {
      this.updateRiverState(dt, terrain);
      return this.getState(terrain);
    }

    // ===== MOVE (sub-stepped for steep terrain) =====
    const moveVec = this.velocity.clone().multiplyScalar(dt);
    const moveDistZ = Math.abs(moveVec.z);
    // Sub-step if moving fast enough to skip over cliff bands (~3 unit steps)
    const subSteps = Math.max(1, Math.ceil(moveDistZ / 3));
    const stepVec = moveVec.clone().divideScalar(subSteps);

    for (let step = 0; step < subSteps; step++) {
      this.position.add(stepVec);

      const stepFloorH = terrain.getHeightAt(this.position.x, this.position.z);
      if (this.position.y < stepFloorH + groundOffset) {
        this.position.y = stepFloorH + groundOffset;
        if (this.velocity.y < 0) this.velocity.y = 0;
        if (!this.grinding) this.grounded = true;
      }
    }

    // Snap to terrain after movement when grounded (prevents 1-frame float/clip)
    if (this.grounded && !this.grinding) {
      const newSurfaceH = this.getSurfaceHeight(terrain);
      this.position.y = newSurfaceH + groundOffset;
    }

    // Final floor clamp safety net
    const floorH = terrain.getHeightAt(this.position.x, this.position.z);
    if (this.position.y < floorH + groundOffset) {
      this.position.y = floorH + groundOffset;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (!this.grinding) this.grounded = true;
    }

    const xBound = terrain.chunkWidth ? (terrain.chunkWidth / 2 - 10) : 50;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -xBound, xBound);

    // Grab wind-up timer
    if (this.isGrabbing && !this.wasGrabbing) {
      this.grabWindup = 0.15; // 150ms wind-up before grab connects
    }
    if (this.grabWindup > 0) this.grabWindup -= dt;
    this.wasGrabbing = this.isGrabbing;

    // Grab, layout, tuck and default air animations
    if (!this.grounded && !this.grinding) {
      const rg = this.riderGroup;
      const L = THREE.MathUtils.lerp;
      // Spins: the upper body leads the rotation and the arms come in
      const spinRate = this.angularVelocity.y;
      // Huck off the takeoff: shoulders and arms throw hard into the set rotation, then settle
      this._huckT = Math.max(0, this._huckT - dt);
      const huck = this._huckT / 0.3;
      const spinTwist = THREE.MathUtils.clamp(spinRate * 0.1 + this._huck.spin * 0.6 * huck, -0.9, 0.9);
      const flipThrow = -this._huck.flip * 0.5 * huck; // backflip: head and chest thrown back
      const spinIn = Math.min(1, Math.abs(spinRate) / 4);
      const flipping = Math.abs(this.angularVelocity.x) + Math.abs(this.angularVelocity.z) > 2.5;
      this.lerpJoint(this.headGroup, 'y', this.HEAD_YAW + spinTwist * 0.8, 0.1);

      if (this.isGrabbing) {
        // Wind-up: reaching toward the grab before it connects
        this.applyGrabPose(this.grabType, this.grabWindup > 0, spinTwist);
        this.lerpJoint(this.headGroup, 'x', 0.25, 0.1);
      } else if (this.isLayingOut) {
        // Layout: legs long, hips driven forward, back arched hard, shoulders and arms thrown back, head back
        const openTwist = (Math.sign(this.STANCE_YAW) || 1) * 0.2 * this._backOpen; // square the shoulders up
        rg.position.y = L(rg.position.y, 0.02, 0.15);
        rg.rotation.x = L(rg.rotation.x, -0.15, 0.12);
        rg.rotation.z = L(rg.rotation.z, 0, 0.12);
        this._setSpine(-0.6 + flipThrow * 0.5, openTwist, 0);
        this.lerpJoint(this.shoulderL, 'z', -1.35, 0.15);
        this.lerpJoint(this.shoulderL, 'x', -0.75, 0.15);
        this.lerpJoint(this.elbowL, 'x', -0.1, 0.15);
        this.lerpJoint(this.elbowL, 'z', 0, 0.15);
        this.lerpJoint(this.shoulderR, 'z', 1.35, 0.15);
        this.lerpJoint(this.shoulderR, 'x', -0.75, 0.15);
        this.lerpJoint(this.elbowR, 'x', -0.1, 0.15);
        this.lerpJoint(this.elbowR, 'z', 0, 0.15);
        this.lerpJoint(this.headGroup, 'x', -0.5, 0.12);
      } else if (this._straightBack && !this.isTucking) {
        // Backflip: chest open to the sky, shoulders back, knees soft (layout it by holding jump)
        const openTwist = (Math.sign(this.STANCE_YAW) || 1) * 0.2 * this._backOpen; // square the shoulders up
        rg.position.y = L(rg.position.y, -0.16, 0.15);
        rg.rotation.x = L(rg.rotation.x, -0.05, 0.12);
        rg.rotation.z = L(rg.rotation.z, 0, 0.12);
        this._setSpine(-0.3 + flipThrow, openTwist, 0);
        this.lerpJoint(this.shoulderL, 'z', -1.1, 0.15);
        this.lerpJoint(this.shoulderL, 'x', -0.55, 0.15);
        this.lerpJoint(this.elbowL, 'x', -0.4, 0.15);
        this.lerpJoint(this.elbowL, 'z', 0, 0.15);
        this.lerpJoint(this.shoulderR, 'z', 1.1, 0.15);
        this.lerpJoint(this.shoulderR, 'x', -0.55, 0.15);
        this.lerpJoint(this.elbowR, 'x', -0.4, 0.15);
        this.lerpJoint(this.elbowR, 'z', 0, 0.15);
        this.lerpJoint(this.headGroup, 'x', -0.4, 0.12);
      } else if (this.isTucking || flipping) {
        // Tuck: knees pulled up to the chest, hands holding the shins, compact so it rotates fast
        rg.position.y = L(rg.position.y, -0.34, 0.18);
        rg.rotation.x = L(rg.rotation.x, 0, 0.12);
        rg.rotation.z = L(rg.rotation.z, 0, 0.12);
        this._setSpine(0.6 + flipThrow, spinTwist, 0);
        this._reach('L', 'rider', -0.15, 0.58, 0.36, 0.25);
        this._reach('R', 'rider', 0.15, 0.58, 0.36, 0.25);
        this.lerpJoint(this.headGroup, 'x', 0.2, 0.12);
      } else {
        // Default air: knees soft, arms out for balance (pulled in while spinning)
        rg.position.y = L(rg.position.y, -0.12 - spinIn * 0.06, 0.12);
        rg.rotation.x = L(rg.rotation.x, 0, 0.1);
        rg.rotation.z = L(rg.rotation.z, 0, 0.1);
        this._setSpine(0.2 + spinIn * 0.1 + flipThrow, spinTwist, 0);
        this.lerpJoint(this.shoulderL, 'z', -1.05 + spinIn * 0.5, 0.12);
        this.lerpJoint(this.shoulderL, 'x', 0.1 + spinIn * 0.3, 0.12);
        this.lerpJoint(this.elbowL, 'x', -0.25 - spinIn * 0.8, 0.12);
        this.lerpJoint(this.elbowL, 'z', 0, 0.12);
        this.lerpJoint(this.shoulderR, 'z', 0.95 - spinIn * 0.45, 0.12);
        this.lerpJoint(this.shoulderR, 'x', -0.1 + spinIn * 0.4, 0.12);
        this.lerpJoint(this.elbowR, 'x', -0.25 - spinIn * 0.8, 0.12);
        this.lerpJoint(this.elbowR, 'z', 0, 0.12);
        this.lerpJoint(this.headGroup, 'x', 0, 0.1);
      }
    }

    // Ponytail physics
    this.updatePonytail(dt);

    // Update visual
    this.group.position.copy(this.position);

    // Use heading for yaw when grounded (smooth carving), velocity when airborne
    let targetYaw;
    if (this.grounded || this.grinding) {
      targetYaw = this.heading + Math.PI;
    } else {
      targetYaw = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
    }

    // Smooth yaw interpolation (fast on ground for responsive carving feel)
    const yawSpeed = this.grounded ? 0.35 : 0.08;
    // Handle angle wrapping for smooth interpolation
    let yawDiff = targetYaw - this.visualYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.visualYaw += yawDiff * yawSpeed;

    this.group.rotation.y = this.visualYaw;

    this._updateRig();

    // Snap GLB feet onto bindings every frame
    this._snapFeetToBindings();

    return this.getState(terrain);
  }

  // ===== KICKER SURFACE RIDE =====
  // Instead of instant launch, the player RIDES UP the kicker surface.
  // The ramp raises them gradually. When they exit the lip, gravity takes over.
  getSurfaceHeight(terrain) {
    const baseH = terrain.getHeightAt(this.position.x, this.position.z);
    let boost = 0;

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'kicker') continue;
      if (ramp.jump) {
        const j = ramp.jump;
        const d = j.zStart - this.position.z;
        if (d < 0 || d > j.total) continue;
        const onKickerPart = d <= j.transLen;
        if (onKickerPart && this.kickerCooldown > 0) continue; // just launched
        const y = terrain.jumpSurfaceAt(ramp, this.position.x, this.position.z);
        if (y === null) continue;
        boost = Math.max(boost, y - baseH);
        if (onKickerPart && this.grounded && d > j.transLen * 0.1) {
          this.onKicker = ramp;
          this.kickerProgress = d / j.transLen;
        }
        continue;
      }
      // Asymmetric cull: 50 uphill is plenty; downhill must reach landing zone end
      if (this.position.z > ramp.position.z + 50) continue;
      const downhillLimit = ramp.landingZoneEndZ !== undefined
        ? ramp.landingZoneEndZ - 5
        : ramp.position.z - 50;
      if (this.position.z < downhillLimit) continue;

      // Check kicker ramp surface (skip during cooldown to prevent re-launch)
      if (this.kickerCooldown <= 0) {
        const dx = this.position.x - ramp.position.x;
        const dz = this.position.z - ramp.position.z;

        const halfW = ramp.width / 2;
        const halfL = ramp.length / 2;
        if (Math.abs(dx) < halfW && Math.abs(dz) < halfL) {
          const t = 1.0 - (dz + halfL) / ramp.length;
          const clampedT = Math.max(0, Math.min(1, t));
          const rampH = ramp.lipHeight * Math.pow(clampedT, 0.65);
          boost = Math.max(boost, rampH);

          if (this.grounded && clampedT > 0.1) {
            this.onKicker = ramp;
            this.kickerProgress = clampedT;
          }
        }
      }

      // Check landing zone surface (always active, even during cooldown)
      if (ramp.landingZoneStartZ !== undefined) {
        const dx = this.position.x - ramp.position.x;
        const z = this.position.z;

        if (Math.abs(dx) < ramp.landingWidth / 2 &&
            z < ramp.landingZoneStartZ && z > ramp.landingZoneEndZ) {
          const totalLen = ramp.landingZoneStartZ - ramp.landingZoneEndZ;
          const t = (ramp.landingZoneStartZ - z) / totalLen; // 0=top, 1=bottom
          // Piecewise: flat table then linear slope (matching visual mesh)
          const tableFrac = ramp.landingGap / (ramp.landingGap + ramp.landingLength);
          let landingH;
          if (t <= tableFrac) {
            landingH = ramp.landingTopHeight; // flat table/knuckle
          } else {
            const slopeT = (t - tableFrac) / (1 - tableFrac);
            landingH = ramp.landingTopHeight * (1 - slopeT) + ramp.landingBottomHeight * slopeT;
          }

          // Ensure landing surface always stays above terrain (prevents cutoff)
          landingH = Math.max(landingH, baseH + 0.3);
          boost = Math.max(boost, landingH - baseH);
        }
      }
    }

    return baseH + boost;
  }

  updateKickerRide(terrain, dt) {
    if (!this.onKicker || !this.grounded) {
      this.onKicker = null;
      return;
    }

    const ramp = this.onKicker;
    if (ramp.jump) {
      if (ramp.jump.zStart - this.position.z >= ramp.jump.transLen - 0.05) {
        this._launchOffJump(ramp.jump, terrain);
        this.kickerCooldown = 1.0;
      }
      return;
    }
    const dz = this.position.z - ramp.position.z;
    const halfL = ramp.length / 2;
    const t = 1.0 - (dz + halfL) / ramp.length;

    // Player has passed the lip — launch!
    if (t >= 0.95 && ramp.railLip) {
      this._popOntoRail(ramp, terrain);
      this.kickerCooldown = 1.0;
    } else if (t >= 0.95) {
      this._launchOffLip(ramp.lipAngle || 0.55);
      this.kickerCooldown = 1.5; // ignore kicker surfaces for 1.5s after launch
    }
  }

  // Launch off a lip (kicker, kinked rail end, up rail end) at the given angle
  // Leave the lip moving along it: speed is kept and pointed up the lip angle.
  // Popping (jump on the kicker) uses the full lip angle plus your ollie; without it you
  // soak up the lip and only get about half the angle, so you land on the deck.
  _launchOffJump(j, terrain) {
    this.boostAirSpeed();
    const s = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const dirX = this.velocity.x / s, dirZ = this.velocity.z / s;
    const charge = this._takePopCharge();
    const popped = charge > 0;
    // The lip always throws you up at its angle; the pop adds your ollie on top
    const angle = j.lipAngle - Math.atan(terrain.slopeAngle);
    this.velocity.x = dirX * s * Math.cos(angle);
    this.velocity.z = dirZ * s * Math.cos(angle);
    this.velocity.y = s * Math.sin(angle) + this.ollieForce * JUMP_POP_MUL * charge;
    this.grounded = false;
    this.onKicker = null;
    this.peakHeight = 0;
    this.launchedFromKicker = true;
    this.lastJumpPopped = popped;
  }

  // Was the backflip on this jump laid out (jump held for most of it)?
  _latchLayout() {
    this.lastJumpLayout = this._backflipTime > 0.2 && this._layoutTime > this._backflipTime * 0.5;
    this._backflipTime = 0;
    this._layoutTime = 0;
    this.isLayingOut = false;
  }

  // Rail lip ahead: show the pop meter filling so it hits the middle of the gold at the lip
  _updateRailOnTiming(terrain) {
    this.railTiming = null;
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed < 1 || this.velocity.z >= 0) { this._railOnLocked = false; return; }
    for (const ramp of terrain.ramps) {
      if (!ramp.railLip) continue;
      if (Math.abs(this.position.x - ramp.position.x) > ramp.width / 2) continue;
      const lipEnd = ramp.position.z - ramp.length / 2;
      const timeToLip = (this.position.z - lipEnd) / hSpeed;
      if (timeToLip < 0 || timeToLip > this.railTimingWindow) continue;
      this.railTiming = { kind: 'on', meter: this._timingMeter(timeToLip) };
      return;
    }
    this._railOnLocked = false; // left the approach without reaching a lip
  }

  // Near the end of a rail: meter fills so it hits the middle of the gold at the end
  _updateRailOffTiming() {
    this.railTiming = null;
    const rail = this.grindRail;
    if (!rail) return;
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed < 1) return;
    const railEnd = rail.position.z - rail.length / 2;
    const timeToEnd = (this.position.z - railEnd) / hSpeed;
    if (timeToEnd < 0 || timeToEnd > this.railTimingWindow) return;
    this.railTiming = { kind: 'off', meter: this._timingMeter(timeToEnd) };
  }

  _timingMeter(timeLeft) {
    const [lo, hi] = this.popSweetSpot;
    const center = (lo + hi) / 2;
    return Math.min(1, center * (1 - timeLeft / this.railTimingWindow));
  }

  // Pop strength from the pop meter: builds up to the sweet spot (perfect = 1), weaker if overloaded
  _popStrength(meter) {
    const [lo, hi] = this.popSweetSpot;
    this.lastPopTime = performance.now();
    this.lastPopPerfect = meter >= lo && meter <= hi;
    if (meter < 0.15) return 0;
    if (meter < lo) return 0.25 + 0.45 * (meter / lo); // early: up to 0.7
    if (meter <= hi) return 1;                         // perfect pop: clearly the most height
    return 0.65;                                       // held too long
  }

  // A jump kicker just ahead on the run-in (or under you): pops are saved for its lip
  _jumpAhead(terrain) {
    for (const ramp of terrain.ramps) {
      const j = ramp.jump;
      if (!j) continue;
      const before = this.position.z - j.zStart;
      if (before < -j.transLen || before > 40) continue;
      if (Math.abs(this.position.x - j.x) > j.width / 2 + 1) continue;
      return ramp;
    }
    return null;
  }

  // Pop strength at a lip: an ollie released on the kicker, or one still being held (0 = no pop)
  _takePopCharge() {
    let strength = this.kickerPopBoost;
    if (this.ollieCharge >= 0.15) strength = this._popStrength(this.ollieCharge);
    this.kickerPopBoost = 0;
    this.ollieCharge = 0;
    return strength;
  }

  // Speed check on the in-run: riders gently scrub any extra speed before the kicker
  _inrunSpeedCheck(terrain, dt) {
    for (const ramp of terrain.ramps) {
      const j = ramp.jump;
      if (!j) continue;
      const before = this.position.z - j.zStart; // distance uphill of the transition
      if (before < -j.transLen || before > 70) continue;
      if (Math.abs(this.position.x - j.x) > j.width / 2 + 2) continue;
      const target = j.designSpeed * this.groundSpeedScale;
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (hSpeed <= target) return;
      const newSpeed = Math.max(target, hSpeed - 5 * dt);
      this.velocity.x *= newSpeed / hSpeed;
      this.velocity.z *= newSpeed / hSpeed;
      return;
    }
  }

  // Gap-on lip in front of a rail: a small pop that just clears onto the rail at any speed
  _popOntoRail(ramp, terrain) {
    // No air-speed boost here: you start the rail at your riding speed and down rails speed you up gradually
    // Follow the slope (otherwise the hill drops away under you at speed), then pop just enough to clear the rail
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const dirX = this.velocity.x / hSpeed, dirZ = this.velocity.z / hSpeed;
    const slopeDrop = terrain.getHeightAt(this.position.x + dirX, this.position.z + dirZ)
      - terrain.getHeightAt(this.position.x, this.position.z);
    // You have to ollie to get onto the rail; without one you just roll off the lip
    const charge = this._takePopCharge();
    const rise = charge > 0 ? Math.max(0.3, (ramp.railClear || 0.5) + 0.3 + 0.4 * charge) : 0.1;
    this._rolledRailLip = charge === 0; // no ollie: can't lock onto the rail
    this.velocity.y = slopeDrop * hSpeed + Math.sqrt(2 * -this.gravity * rise);
    this.grounded = false;
    this.onKicker = null;
    this.peakHeight = 0;
    this.launchedFromKicker = true;
  }

  // keepSpeed: rail kicks keep their horizontal speed instead of the kicker's landing-zone damping
  _launchOffLip(lipAngle, keepSpeed = false) {
    // Launch as if riding at the original (faster) ground speed so air is unchanged
    this.boostAirSpeed();
    const rawSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    // Cap effective launch speed — allow fast approach to matter
    const speed = Math.min(rawSpeed, 32);

    // Redirect velocity through the lip angle
    const launchSpeed = speed * 0.92;
    this.velocity.y = Math.sin(lipAngle) * launchSpeed;
    const horizFactor = Math.cos(lipAngle);
    // Dampen horizontal speed — smaller jumps (lower lipAngle) get more reduction
    // so the rider lands on the landing zone instead of overshooting
    const horizDamp = 0.3 + lipAngle * 0.8; // small(0.45)→0.66, big(0.65)→0.82
    const hScale = keepSpeed ? horizFactor
      : horizFactor * horizDamp * Math.min(1, 32 / Math.max(rawSpeed, 1));
    this.velocity.x *= hScale;
    this.velocity.z *= hScale;

    // Pop bonus from speed
    this.velocity.y += Math.min(speed * 0.05, 3);

    // Ollie pop if the player loaded one on the kicker
    const charge = this._takePopCharge();
    if (charge > 0) this.velocity.y += this.jumpForce * 0.6 * charge;

    this.grounded = false;
    this.onKicker = null;
    this.peakHeight = 0;
    this.launchedFromKicker = true;
  }

  // World-space rail top under the player (rollers, kinks and height profiles included)
  _getRailTop(ramp, terrain) {
    if (terrain.getRailTopAt) return terrain.getRailTopAt(ramp, this.position.x, this.position.z);
    return terrain.computeHeight(this.position.x, this.position.z) + this._getRailHeightAtZ(ramp, this.position.z);
  }

  // Get rail surface height at a given Z, interpolating for variable-height rails
  _getRailHeightAtZ(ramp, z) {
    if (ramp.startHeight !== undefined && ramp.endHeight !== undefined) {
      // Variable-height rail: interpolate from start (+Z/uphill) to end (-Z/downhill)
      const dz = z - ramp.position.z;
      const halfLen = ramp.length / 2;
      // t=0 at +Z (entry/uphill), t=1 at -Z (exit/downhill)
      const t = Math.max(0, Math.min(1, 0.5 - dz / ramp.length));
      return ramp.startHeight * (1 - t) + ramp.endHeight * t;
    }
    return ramp.surfaceHeight;
  }

  // ===== RAIL GRIND =====
  updateRailGrind(terrain, dt) {
    if (this.grinding) return;

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'rail') continue;
      if (Math.abs(this.position.z - ramp.position.z) > 50) continue;
      // Skip any rail already grinded this run — prevents jitter re-snap
      if (this._grindedRails.has(ramp)) continue;

      const dx = this.position.x - ramp.position.x;
      const dz = this.position.z - ramp.position.z;
      // Use terrain height at player's Z for accurate rail top on tilted rails
      const railTop = this._getRailTop(ramp, terrain);
      const dy = this.position.y - railTop;

      const absDx = Math.abs(dx);
      const absDz = Math.abs(dz);
      const halfLen = ramp.length / 2 + 0.5;
      const hitWidth = ramp.width + this.capsuleRadius;

      // Check if player is within rail XZ footprint
      if (absDx < hitWidth && absDz < halfLen) {

        if (!this.grounded && this.velocity.y <= 0 &&
                   dy > -1.0 && dy < 3.0) {
          // Airborne descending player — snap onto rail
          // Only catch on the way DOWN so player can trick off kickers first
          // Must be within 20° of level (no headslides)
          const flipAbs = Math.abs(this.trickRotation.x % (Math.PI * 2));
          const rollAbs = Math.abs(this.trickRotation.z % (Math.PI * 2));
          const flipDev = Math.min(flipAbs, Math.PI * 2 - flipAbs);
          const rollDev = Math.min(rollAbs, Math.PI * 2 - rollAbs);
          if (flipDev > 0.349 || rollDev > 0.349) break; // too tilted — skip lock-on
          if (this._rolledRailLip) break; // rolled the gap-on lip without an ollie
          this.position.y = railTop + 0.2;
          this.velocity.y = 0;
          this.grinding = true;
          this.grindAborted = false;
          this.grindRail = ramp;
          this.peakHeight = 0;
          this.grindTime = 0;
          this._initGrindFromAir();
          break;
        }

        // Grounded player hitting the actual rail body from the side — crash
        // Use tight hitbox (0.5 units) matching the physical rail, not the wide footprint
        if (this.grounded && absDx < 0.5 + this.capsuleRadius && this.position.y < railTop + 0.3) {
          this.triggerCrash();
          return;
        }
      }
    }
  }

  // Convert air spin rotation into initial grind angle when landing on a rail
  _initGrindFromAir() {
    // Normalize trickRotation.y into -PI..PI range to get board angle relative to rail
    let angle = this.trickRotation.y % (Math.PI * 2);
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;

    // Determine boardslide type from the landing angle
    // Near 0 or full 360 = 50-50, near +/-90 = boardslide
    const absAngle = Math.abs(angle);
    if (absAngle > Math.PI * 0.25 && absAngle < Math.PI * 0.75) {
      // ~45-135 degrees = boardslide
      this.boardslideType = angle > 0 ? 'backside' : 'frontside';
      this.boardslideAngle = angle;
    } else if (absAngle >= Math.PI * 0.75) {
      // ~135-180 degrees = switch boardslide (treat as boardslide too)
      this.boardslideType = angle > 0 ? 'backside' : 'frontside';
      this.boardslideAngle = angle;
    } else if (this.equipmentType === 'ski') {
      // Skis can't 50-50 — default to frontside boardslide
      this.boardslideType = 'frontside';
      this.boardslideAngle = angle || Math.PI / 2;
    } else {
      // Near straight = 50-50
      this.boardslideType = null;
      this.boardslideAngle = angle;
    }

    this.frontswapCount = 0;
    this._swapTimer = 0;
    this._railOnLocked = false;
    this.railPerfectOn = this._pendingPerfectOn;
    this._pendingPerfectOn = false;
    this.railPerfectOff = false;
    this.railTiming = null;

    this._latchLayout();

    // Signal to TrickSystem that we landed on a rail from air
    this.landedOnRail = true;

    // Reset trickRotation for the grind
    this.trickRotation.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  // Takeoff and rotation speed for this jump.
  // A trick set during the pop (key held while loading, still held at takeoff) is hucked: the
  // rotation starts at once and runs up to 30% faster. Starting a rotation later in the air,
  // without a set, only gets 95% down to 70% the later it starts. Real life: the takeoff sets the spin.
  _launchRotation(input) {
    const spinKey = input.spinLeft ? 1 : input.spinRight ? -1 : 0;
    const flipKey = input.flipForward ? -1 : input.flipBackward ? 1 : 0;
    if (!this._launched) {
      this._launched = true;
      const set = this._set;
      // Still holding the set direction at takeoff (or holding a key off a rail) counts as a set
      const heldSpin = spinKey && (spinKey === set.spin || this._fromRail) ? spinKey : 0;
      const heldFlip = flipKey && (flipKey === set.flip || this._fromRail) ? flipKey : 0;
      const amt = Math.max(set.amt, this._fromRail ? 0.5 : 0);
      if ((heldSpin || heldFlip) && amt > 0.15) {
        this._rotMul = 1 + 0.3 * amt;
        this._rotMulLocked = true;
        this._huck.spin = heldSpin;
        this._huck.flip = heldFlip;
        this._huckT = 0.3;
        // The huck: rotation is already going as you leave the lip
        if (heldSpin) this.angularVelocity.y = heldSpin * 4.8 * this._rotMul * (0.5 + 0.4 * amt);
        if (heldFlip) this.angularVelocity.x = heldFlip * 6.5 * this._rotMul * (0.5 + 0.4 * amt);
      }
      set.spin = 0; set.flip = 0; set.amt = 0;
    }
    if (!this._rotMulLocked && (spinKey || flipKey)) {
      this._rotMulLocked = true;
      this._rotMul = THREE.MathUtils.clamp(0.95 - 0.4 * this.airTime, 0.7, 0.95);
    }
    if (!this._rotMulLocked) this._rotMul = 1;
  }

  // Grabs: the grabbing hand is IK'd onto the real spot on the board, the body folds down to reach it,
  // and the free arm styles it out. All spots are in board space so they work in either stance.
  applyGrabPose(type, windUp = false, twist = 0) {
    const rate = windUp ? 0.1 : 0.25;
    const toe = this._toeSign() * 0.16;   // board x of the toe edge
    const heel = -toe;
    const nose = this._frontSign();       // +1: the nose (board +z) is on the rider's left-hand side
    const frontHand = nose > 0 ? 'L' : 'R';
    const rearHand = nose > 0 ? 'R' : 'L';
    const edgeY = 0.09;

    // hand, board spot [x, z], crouch, body lean (x toes, z nose side), spine bend (x fwd, y twist, z side), free arm
    let g;
    switch (type) {
      case 'method':  // front hand, heel edge; board tweaked up behind, chest arched open
        g = { hand: frontHand, x: heel, z: 0.02, drop: -0.4, lx: -0.6, lz: 0, sx: 0.7, sy: 0.35, sz: 0.1 * nose, free: [1.5, -0.3] };
        break;
      case 'stalefish':  // rear hand reaches behind the legs to the heel edge
        g = { hand: rearHand, x: heel, z: -0.06, drop: -0.4, lx: -0.35, lz: 0, sx: 0.8, sy: -0.35, sz: -0.15 * nose, free: [1.3, -0.2] };
        break;
      case 'melon':  // front hand, heel edge between the feet
        g = { hand: frontHand, x: heel, z: 0.06, drop: -0.38, lx: -0.35, lz: 0, sx: 0.7, sy: 0.35, sz: 0.15 * nose, free: [1.25, 0.2] };
        break;
      case 'nosegrab':  // front hand to the nose, body leaning over the front foot
        g = { hand: frontHand, x: 0, z: 0.68, drop: -0.3, lx: 0, lz: 0.3 * nose, sx: 0.35, sy: 0, sz: 0.5 * nose, free: [1.3, -0.4] };
        break;
      case 'tailgrab':  // rear hand to the tail, body over the back foot
        g = { hand: rearHand, x: 0, z: -0.68, drop: -0.3, lx: 0, lz: -0.3 * nose, sx: 0.35, sy: 0, sz: -0.5 * nose, free: [1.3, 0.4] };
        break;
      case 'indy':
      default:  // rear hand, toe edge between the feet
        g = { hand: rearHand, x: toe, z: -0.03, drop: -0.4, lx: 0.1, lz: 0, sx: 0.8, sy: -0.2, sz: 0, free: [1.3, -0.3] };
    }

    this._reach(g.hand, 'board', g.x, edgeY, g.z, rate);
    this._setSpine(g.sx, g.sy * nose + twist, g.sz);

    // Free arm out to the side for style (FK)
    const free = g.hand === 'L' ? 'R' : 'L';
    const side = free === 'L' ? -1 : 1;
    const sh = free === 'L' ? this.shoulderL : this.shoulderR;
    const el = free === 'L' ? this.elbowL : this.elbowR;
    this.lerpJoint(sh, 'z', side * g.free[0], 0.15);
    this.lerpJoint(sh, 'x', g.free[1], 0.15);
    this.lerpJoint(el, 'x', -0.3, 0.15);
    this.lerpJoint(el, 'z', 0, 0.15);

    const L = windUp ? 0.1 : 0.18;
    this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, g.drop, L);
    this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, g.lx, L);
    this.riderGroup.rotation.z = THREE.MathUtils.lerp(this.riderGroup.rotation.z, g.lz, L);
  }

  setColor(part, colorHex) {
    const color = new THREE.Color(colorHex);
    switch (part) {
      case 'jacket':
        this.jacketMat.color.copy(color);
        // Darken fold material to match new jacket color
        if (this._jacketFoldMat) {
          this._jacketFoldMat.color.copy(color).multiplyScalar(0.75);
        }
        // Update goggle lens tint to match jacket (brightened)
        if (this.goggleLensMat) {
          this.goggleLensMat.color.copy(color).lerp(new THREE.Color(0xffffff), 0.3);
          this.goggleLensMat.emissive.copy(color).multiplyScalar(0.15);
        }
        break;
      case 'pants':
        this.pantsMat.color.copy(color);
        if (this._pantsFoldMat) {
          this._pantsFoldMat.color.copy(color).multiplyScalar(0.8);
        }
        break;
      case 'board':
        if (this.boardMat.map) {
          // Texture applied — set white so canvas colors show true
          this.boardMat.color.set(0xffffff);
        } else {
          this.boardMat.color.copy(color);
        }
        break;
      case 'helmet': this.helmetMat.color.copy(color); break;
    }
  }

  applyBoardGraphic(texture) {
    this.boardMat.map = texture || null;
    this.boardMat.needsUpdate = true;
    if (texture) {
      this.boardMat.color.set(0xffffff);
    }
  }

  applyJacketLogo(texture) {
    if (texture) {
      this.jacketLogoMat.map = texture;
      this.jacketLogoMat.needsUpdate = true;
      this.jacketLogoPlane.visible = true;
    } else {
      this.jacketLogoPlane.visible = false;
    }
  }

  setBindingColor(colorHex) {
    if (this.bindingMat) {
      this.bindingMat.color.set(colorHex);
    }
  }

  setBaggyPants(isBaggy) {
    // Baggy pants: scale thighs, calves, and hips wider for a loose fit
    const s = isBaggy ? 1.875 : 1.0;
    for (const mesh of [this.thighL, this.thighR, this.calfL, this.calfR]) {
      mesh.scale.set(s, 1, s);
    }
    // Slightly widen hips (keep subtle so no big rectangle)
    const hipS = isBaggy ? 1.15 : 1.0;
    this.hipsMesh.scale.set(hipS, 1, hipS);

    // Hide skinny wrinkles when baggy, show when skinny
    if (this._pantsWrinkles) {
      for (const w of this._pantsWrinkles) w.visible = !isBaggy;
    }

    // Add/remove baggy-specific ridges (just a few subtle ones)
    if (isBaggy && !this._baggyRidges) {
      this._baggyRidges = [];
      const mat = this._pantsFoldMat;
      // A couple ridges on each thigh
      for (const [group, ys] of [[this.hipL, [-0.10, -0.24]], [this.hipR, [-0.10, -0.24]]]) {
        for (const y of ys) {
          const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 4, 14), mat);
          ridge.rotation.x = Math.PI / 2; ridge.position.set(0, y, 0);
          group.add(ridge); this._baggyRidges.push(ridge);
        }
      }
      // One ridge on each calf near the knee
      for (const group of [this.kneeL, this.kneeR]) {
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 14), mat);
        ridge.rotation.x = Math.PI / 2; ridge.position.set(0, -0.08, 0);
        group.add(ridge); this._baggyRidges.push(ridge);
      }
    }
    if (this._baggyRidges) {
      for (const r of this._baggyRidges) r.visible = isBaggy;
    }
  }

  setHaloMode(enabled) {
    this.helmetMesh.visible = !enabled;
    this.hairGroup.visible = enabled;
    this.haloMesh.visible = enabled;
  }

  setLegendaryMaterial(part, enabled) {
    if (part === 'jacket') {
      this.jacketMat.metalness = enabled ? 0.8 : 0;
      this.jacketMat.roughness = enabled ? 0.15 : 0.8;
    } else if (part === 'pants') {
      this.pantsMat.metalness = enabled ? 0.9 : 0;
      this.pantsMat.roughness = enabled ? 0.1 : 0.9;
    }
  }

  applyBoardStats(speed, pop, flex) {
    this.maxSpeed = this.baseMaxSpeed * (0.85 + speed * 0.03);
    this.jumpForce = this.baseJumpForce * (0.85 + pop * 0.03);
    this.ollieForce = this.baseOllieForce * (0.85 + pop * 0.03);
    this.flexMultiplier = 0.85 + flex * 0.03;
  }

  updateStanceYaw() {
    if (this.equipmentType === 'ski') {
      // Skiers: face forward normally, face backward when switch
      this.STANCE_YAW = this.isSwitch ? Math.PI : 0;
      this.HEAD_YAW = 0;
    } else {
      // Snowboard: regular = 1.3, goofy = -1.3; switch negates it
      const baseYaw = this.stance === 'goofy' ? -1.3 : 1.3;
      this.STANCE_YAW = this.isSwitch ? -baseYaw : baseYaw;
      this.HEAD_YAW = this.isSwitch ? -this.BASE_HEAD_YAW : this.BASE_HEAD_YAW;
    }
  }

  triggerTomahawk(terrain) {
    this.tomahawking = true;
    this.tomahawkTimer = 0;
    this.tomahawkRotation = 0;
    this.grounded = true;
    this.onKicker = null;
    this.grinding = false;
    this.grindRail = null;
    this.isGrabbing = false;
    this.grabType = null;
    // Keep forward momentum — slide downhill while tumbling
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    this.velocity.set(0, 0, -Math.max(speed * 0.5, 8));
  }

  updateTomahawk(dt, terrain) {
    this.tomahawkTimer += dt;

    // Clear trick rotation after first frame
    if (this.tomahawkTimer <= dt * 2) {
      this.trickRotation.set(0, 0, 0);
      this.isCorkingThisJump = false;
      this.corkFlipDirection = 0;
      this.corkSpinDirection = 0;
    }

    // Rotate the whole group forward (tomahawk = forward tumble)
    const totalRot = this.tomahawkCount * Math.PI * 2;
    const progress = Math.min(this.tomahawkTimer / this.tomahawkDuration, 1.0);
    this.tomahawkRotation = totalRot * progress;
    this.group.rotation.x = -this.tomahawkRotation;

    // Keep sliding downhill, stick to terrain
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const groundY = terrain.getHeightAt(this.position.x, this.position.z);
    this.position.y = groundY + 1.0;
    this.group.position.copy(this.position);

    // Slow down during tumble
    this.velocity.x *= 0.98;
    this.velocity.z *= 0.98;

    // After tumble animation finishes, trigger death (crash)
    if (progress >= 1.0) {
      this.tomahawking = false;
      this.tomahawkTimer = 0;
      this.tomahawkRotation = 0;
      this.group.rotation.x = 0;
      this.position.y = groundY + 0.5;
      this.group.position.copy(this.position);
      this.triggerCrash();
    }
  }

  triggerCrash() {
    this.crashed = true;
    this.crashTimer = 0;
    this.velocity.set(0, 0, 0);
    this.onKicker = null;
    this.grinding = false;
    this.grindRail = null;
    this.explodeRider();
  }

  explodeRider() {
    this.group.updateMatrixWorld(true);

    const meshes = [];
    this.riderGroup.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    // Board/ski meshes (skip riderGroup which is already handled)
    for (const child of this.boardGroup.children) {
      if (child === this.riderGroup) continue;
      if (child.isMesh) meshes.push(child);
      child.traverse((c) => { if (c.isMesh && c !== child) meshes.push(c); });
    }

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    const crashCenter = this.position.clone();

    for (const mesh of meshes) {
      mesh.getWorldPosition(worldPos);
      mesh.getWorldQuaternion(worldQuat);
      mesh.getWorldScale(worldScale);

      const clone = mesh.clone();
      // Strip children — traverse already handles nested meshes individually
      while (clone.children.length > 0) clone.remove(clone.children[0]);
      clone.position.copy(worldPos);
      clone.quaternion.copy(worldQuat);
      clone.scale.copy(worldScale);
      this.scene.add(clone);

      const dir = worldPos.clone().sub(crashCenter);
      if (dir.lengthSq() < 0.001) dir.set(Math.random() - 0.5, 1, Math.random() - 0.5);
      dir.normalize();

      const speed = 3 + Math.random() * 5;
      const velocity = new THREE.Vector3(
        dir.x * speed + (Math.random() - 0.5) * 2,
        Math.abs(dir.y) * speed + 2 + Math.random() * 3,
        dir.z * speed + (Math.random() - 0.5) * 2
      );
      const angularVel = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      this.crashDebris.push({ mesh: clone, velocity, angularVel });
    }

    this.boardGroup.visible = false;
  }

  updateDebris(dt) {
    for (const piece of this.crashDebris) {
      piece.mesh.position.x += piece.velocity.x * dt;
      piece.mesh.position.y += piece.velocity.y * dt;
      piece.mesh.position.z += piece.velocity.z * dt;

      piece.velocity.y += this.gravity * dt;

      // Simple ground bounce
      if (piece.mesh.position.y < this.position.y - 1) {
        piece.mesh.position.y = this.position.y - 1;
        piece.velocity.y *= -0.3;
        piece.velocity.x *= 0.8;
        piece.velocity.z *= 0.8;
      }

      piece.mesh.rotation.x += piece.angularVel.x * dt;
      piece.mesh.rotation.y += piece.angularVel.y * dt;
      piece.mesh.rotation.z += piece.angularVel.z * dt;
      piece.angularVel.multiplyScalar(0.98);
    }
  }

  cleanupDebris() {
    for (const piece of this.crashDebris) {
      this.scene.remove(piece.mesh);
      if (piece.mesh.geometry) piece.mesh.geometry.dispose();
    }
    this.crashDebris = [];
  }

  respawn(checkpointPos) {
    this.cleanupDebris();
    this.boardGroup.visible = true;
    this.crashed = false;
    this.crashTimer = 0;
    this.position.copy(checkpointPos);
    this.position.y += 2;
    this.velocity.set(0, 0, -5);
    this.heading = Math.PI;
    this.visualYaw = Math.PI;
    this.angularVelocity.set(0, 0, 0);
    this.trickRotation.set(0, 0, 0);
    this.turnRate = 0;
    this.edgeLean = 0;
    this.edgeLeanSmooth = 0;
    this.isCorkingThisJump = false;
    this.corkFlipDirection = 0;
    this.corkSpinDirection = 0;
    this.isSwitch = false;
    this.updateStanceYaw();
    this.kickerCooldown = 0;
    this.kickerPopBoost = 0;
    this.ollieCharge = 0;
    this.railTiming = null;
    this._railOnLocked = false;
    this._pendingPerfectOn = false;
    this.terrainPopCooldown = 0;
    this._airSpeedBoost = 1;
    this.launchedFromKicker = false;
    this.grounded = false;
    this.airTime = 0;
    this.isGrabbing = false;
    this.grabType = null;
    this.peakHeight = 0;
    this.currentHeightAboveGround = 0;
    this.onKicker = null;
    this.grinding = false;
    this.grindAborted = false;
    this.grindRail = null;
    this._grindedRails.clear();
    this.boardslideType = null;
    this.boardslideAngle = 0;
    this.grindTime = 0;
    this.landingImpact = 0;
    this.landingImpactVel = 0;
    this.inRiver = false;
    this.riverZone = null;
    this.daveRescuing = false;
    this.daveWaypoints = [];
    this.daveWaypointIndex = 0;

    this.boardGroup.rotation.set(0, 0, 0);
    this.riderGroup.position.set(0, 0, 0);
    this.riderGroup.rotation.set(0, this.STANCE_YAW, 0);
    if (this.spineGroup) this.spineGroup.rotation.set(0, 0, 0);

    // Reset all joints to default riding pose — arms spread outward
    if (this.equipmentType === 'ski') {
      this.setJoint(this.shoulderL, 0.15, 0, 0.8);
      this.setJoint(this.elbowL, -0.2, 0, 0);
      this.setJoint(this.shoulderR, 0.15, 0, -0.8);
      this.setJoint(this.elbowR, -0.2, 0, 0);
    } else {
      this.setJoint(this.shoulderL, 0.1, 0, 0.7);
      this.setJoint(this.elbowL, -0.2, 0, 0);
      this.setJoint(this.shoulderR, 0.1, 0, -0.7);
      this.setJoint(this.elbowR, -0.2, 0, 0);
    }
    this.setJoint(this.hipL, -0.3, 0, 0);
    this.setJoint(this.kneeL, 0.6, 0, 0);
    this.setJoint(this.hipR, -0.3, 0, 0);
    this.setJoint(this.kneeR, 0.6, 0, 0);
    this.setJoint(this.headGroup, 0, this.HEAD_YAW, 0);

    this.group.position.copy(this.position);
    this.group.rotation.set(0, Math.PI, 0);
    this.visualYaw = Math.PI;
  }

  setSittingPose() {
    // Reset crash state visuals
    this.boardGroup.rotation.set(0, 0, 0);
    this.riderGroup.rotation.set(0, this.STANCE_YAW, 0);

    // Lower riderGroup so hips (y=0.55) sit on the log surface
    this.riderGroup.position.set(0, 0, 0);
    // Lean torso forward for natural sitting posture
    this.riderGroup.rotation.x = 0.3;

    // Legs: bent forward at hips, knees bent so feet touch ground
    this.setJoint(this.hipL, -1.5, 0.1, 0);
    this.setJoint(this.kneeL, 1.6, 0, 0);
    this.setJoint(this.hipR, -1.5, -0.1, 0);
    this.setJoint(this.kneeR, 1.6, 0, 0);

    // Arms: resting on knees, elbows out slightly
    this.setJoint(this.shoulderL, 0.5, 0.2, -0.2);
    this.setJoint(this.elbowL, -0.9, 0, 0);
    this.setJoint(this.shoulderR, 0.5, -0.2, 0.2);
    this.setJoint(this.elbowR, -0.9, 0, 0);

    // Head: looking slightly toward fire (forward and down)
    this.setJoint(this.headGroup, 0, 0, 0);
    this.setJoint(this.neckGroup, -0.2, 0, 0);
  }

  setBoardVisible(visible) {
    // Hide/show only the board/ski meshes — skip riderGroup and all its descendants
    for (const child of this.boardGroup.children) {
      if (child === this.riderGroup) continue;
      child.visible = visible;
      if (child.traverse) {
        child.traverse(c => { if (c.isMesh) c.visible = visible; });
      }
    }
  }

  // ---- RIVER RESCUE SYSTEM ----

  checkRiverCollision(terrain) {
    for (const zone of terrain.riverZones) {
      if (zone.type === 'gap') {
        const dz = this.position.z - zone.z;
        const dx = Math.abs(this.position.x - zone.xCenter);
        // Check if player is inside the gap channel AND below the lip (fell in, not jumping over)
        if (Math.abs(dz) < zone.halfGapZ && dx < zone.halfWidthX) {
          const lipHeight = terrain.getHeightAt(zone.xCenter, zone.z + zone.halfGapZ);
          if (this.position.y < lipHeight - 1) {
            this.enterRiver(zone);
            return;
          }
        }
      } else if (zone.type === 'basin') {
        const dz = Math.abs(this.position.z - zone.z);
        const dx = Math.abs(this.position.x - zone.xCenter);
        if (dz < zone.halfLenZ && dx < zone.halfWidthX) {
          this.enterRiver(zone);
          return;
        }
      }
    }
  }

  enterRiver(zone) {
    this.inRiver = true;
    this.riverZone = zone;
    this.daveRescuing = false;
    this.daveWaypoints = zone.escapePath || [];
    this.daveWaypointIndex = 0;
    // Kill most velocity — stuck in the river
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.airTime = 0;
  }

  updateRiverState(dt, terrain) {
    if (!this.daveRescuing) {
      // Waiting for Dave — player nearly stops, can wiggle slightly
      this.velocity.multiplyScalar(0.9);
      // Snap to terrain
      const h = terrain.getHeightAt(this.position.x, this.position.z);
      this.position.y = h + 0.08;
      this.group.position.copy(this.position);
      return;
    }

    // Following Dave along escape waypoints
    if (this.daveWaypointIndex >= this.daveWaypoints.length) {
      this.exitRiver();
      return;
    }

    const wp = this.daveWaypoints[this.daveWaypointIndex];
    const targetX = wp.x;
    const targetZ = wp.z;
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 3) {
      this.daveWaypointIndex++;
      if (this.daveWaypointIndex >= this.daveWaypoints.length) {
        this.exitRiver();
        return;
      }
    }

    // Move toward waypoint at speed 8
    const speed = 8;
    const dirX = dx / dist;
    const dirZ = dz / dist;
    this.position.x += dirX * speed * dt;
    this.position.z += dirZ * speed * dt;
    const h = terrain.getHeightAt(this.position.x, this.position.z);
    this.position.y = h + 0.08;

    // Face movement direction
    this.heading = Math.atan2(-dirX, -dirZ);
    this.visualYaw = this.heading;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.visualYaw;
  }

  exitRiver() {
    this.inRiver = false;
    this.riverZone = null;
    this.daveRescuing = false;
    this.daveWaypoints = [];
    this.daveWaypointIndex = 0;
    // Give a forward push to resume riding
    this.velocity.set(0, 0, -12);
    this.heading = Math.PI;
    this.visualYaw = Math.PI;
  }

  getState(terrain) {
    const terrainH = terrain ? terrain.getHeightAt(this.position.x, this.position.z) : 0;
    const heightAbove = Math.max(0, this.position.y - terrainH - 0.08);
    const heightFeet = Math.round(heightAbove * 3.28);
    const peakFeet = Math.round(this.peakHeight * 3.28);

    return {
      grounded: this.grounded,
      wasGrounded: this.wasGrounded,
      airTime: this.airTime,
      trickRotation: this.trickRotation.clone(),
      isGrabbing: this.isGrabbing,
      grabType: this.grabType,
      speed: Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2),
      crashed: this.crashed,
      tomahawking: this.tomahawking,
      position: this.position.clone(),
      jumpHeightFeet: heightFeet,
      peakHeightFeet: peakFeet,
      isAirborne: !this.grounded && !this.grinding && this.airTime > 0.1,
      grinding: this.grinding,
      wasGrinding: this.wasGrinding,
      boardslideType: this.boardslideType,
      grindTime: this.grindTime,
      frontswapCount: this.frontswapCount,
      isLayout: this.lastJumpLayout,
      railPerfectOn: this.railPerfectOn,
      railPerfectOff: this.railPerfectOff,
      isCork: this.isCorkingThisJump,
      corkFlipDirection: this.corkFlipDirection,
      corkSpinDirection: this.corkSpinDirection,
      flexMultiplier: this.flexMultiplier,
      landingQuality: this.landingQuality,
      landedOnRail: this.landedOnRail,
      isSwitch: this.isSwitch,
      turnRate: this.turnRate,
      velocityY: this.velocity.y,
      grindAborted: this.grindAborted,
      inRiver: this.inRiver,
      daveRescuing: this.daveRescuing,
      surfaceType: this.surfaceType,
    };
  }
}
