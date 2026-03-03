import * as THREE from 'three';

export class Player {
  constructor(scene) {
    this.scene = scene;

    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3(0, 0, -8);
    this.heading = Math.PI; // direction the board faces (radians, PI = down the slope -Z)
    this.visualYaw = Math.PI;
    this.angularVelocity = new THREE.Vector3(0, 0, 0);

    this.grounded = false;
    this.airTime = 0;
    this.maxSpeed = 100;
    this.gravity = -22;
    this.jumpForce = 10;

    // Carving system — smooth laid-down carves
    this.turnRate = 0;            // current turning angular velocity (rad/s)
    this.turnRateMax = 3.5;       // ~200 deg/s — fast carving, not spinning
    this.turnAccel = 25.0;        // snappy edge engagement
    this.turnDecel = 15.0;        // quick decay on release
    this.edgeLean = 0;            // visual lean for carving (-1 to 1)
    this.edgeLeanSmooth = 0;      // smoothed lean for rendering

    this.trickRotation = new THREE.Vector3(0, 0, 0);
    this.isGrabbing = false;
    this.grabType = null;
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

    // Cork tracking
    this.isCorkingThisJump = false;

    // Kicker launch cooldown — prevents re-launch when landing back on same kicker
    this.kickerCooldown = 0;
    this.kickerPopBoost = 0; // extra air from pressing space on a kicker

    // Crash
    this.crashed = false;
    this.crashTimer = 0;
    this.landingTolerance = Math.PI * 0.42;

    // Capsule hitbox: center = position, radius, half-height
    this.capsuleRadius = 0.4;
    this.capsuleHalfH = 0.8;

    this.group = new THREE.Group();
    this.boardGroup = new THREE.Group();
    this.riderGroup = new THREE.Group();

    this.buildModel();
    this.scene.add(this.group);
  }

  buildModel() {
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.2, metalness: 0.5 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 1.9), boardMat);
    board.castShadow = true;

    const frontPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.065, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xff5722 })
    );
    frontPad.position.set(0, 0.005, 0.3);
    board.add(frontPad);

    const rearPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.065, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xffc107 })
    );
    rearPad.position.set(0, 0.005, -0.4);
    board.add(rearPad);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.2), boardMat);
    nose.position.set(0, 0.04, 0.95); nose.rotation.x = 0.3; board.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.2), boardMat);
    tail.position.set(0, 0.04, -0.95); tail.rotation.x = -0.3; board.add(tail);

    const bindMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    for (const z of [0.35, -0.3]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.18), bindMat);
      b.position.set(0, 0.06, z); board.add(b);
    }
    this.boardGroup.add(board);

    const jacketMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.25), jacketMat);
    torso.position.set(0, 0.85, 0); torso.castShadow = true; this.riderGroup.add(torso);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.22), pantsMat);
    hips.position.set(0, 0.55, 0); this.riderGroup.add(hips);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xf5c6a0 }));
    head.position.set(0, 1.32, 0); head.castShadow = true; this.riderGroup.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x212121 }));
    helmet.position.set(0, 1.36, 0); this.riderGroup.add(helmet);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff9800, metalness: 0.7, roughness: 0.1 }));
    goggles.position.set(0, 1.33, 0.15); this.riderGroup.add(goggles);

    const armGeo = new THREE.CapsuleGeometry(0.06, 0.4, 3, 6);
    this.leftArm = new THREE.Mesh(armGeo, jacketMat);
    this.leftArm.position.set(-0.3, 0.9, 0); this.leftArm.rotation.z = 0.5;
    this.leftArm.castShadow = true; this.riderGroup.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, jacketMat);
    this.rightArm.position.set(0.3, 0.9, 0); this.rightArm.rotation.z = -0.5;
    this.rightArm.castShadow = true; this.riderGroup.add(this.rightArm);

    const legGeo = new THREE.CapsuleGeometry(0.08, 0.35, 3, 6);
    const ll = new THREE.Mesh(legGeo, pantsMat); ll.position.set(-0.1, 0.28, 0.2); this.riderGroup.add(ll);
    const rl = new THREE.Mesh(legGeo, pantsMat); rl.position.set(0.1, 0.28, -0.2); this.riderGroup.add(rl);

    this.boardGroup.add(this.riderGroup);
    this.group.add(this.boardGroup);
  }

  update(dt, input, terrain) {
    if (this.crashed) return this.getState(terrain);

    this.wasGrounded = this.grounded;
    this.isTucking = input.tuck;

    const groundOffset = 0.35; // keep board visually above snow

    // Tick kicker cooldown
    this.kickerCooldown = Math.max(0, this.kickerCooldown - dt);

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

    // ===== GROUND / SURFACE COLLISION =====
    const wasInAir = !this.grounded && !this.grinding;
    const nextY = this.position.y + this.velocity.y * dt;

    if (nextY <= surfaceH + groundOffset) {
      this.position.y = surfaceH + groundOffset;

      // Crash check on landing — must land roughly upright
      if (wasInAir && this.airTime > 0.4) {
        // Check flip axis (forward/back rotation)
        const rawFlip = this.trickRotation.x;
        const fullFlipRots = Math.round(rawFlip / (Math.PI * 2));
        const flipRemainder = rawFlip - fullFlipRots * Math.PI * 2;

        // Check roll axis (sideways tilt from corks)
        const rawRoll = this.trickRotation.z;
        const fullRollRots = Math.round(rawRoll / (Math.PI * 2));
        const rollRemainder = rawRoll - fullRollRots * Math.PI * 2;

        if (Math.abs(flipRemainder) > this.landingTolerance ||
            Math.abs(rollRemainder) > this.landingTolerance) {
          this.triggerCrash();
          return this.getState(terrain);
        }
      }

      // Slope-aware landing: convert some downward speed to forward speed
      if (this.velocity.y < 0) {
        const normal = terrain.getSlopeNormalAt(this.position.x, this.position.z);
        const downSpeed = -this.velocity.y;
        this.velocity.z -= (1.0 - normal.y) * downSpeed * 0.4;
        this.velocity.y = 0;
      }

      if (!this.grounded) {
        // Just landed — sync heading to actual velocity direction
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

    // ===== RAIL GRIND CHECK =====
    this.updateRailGrind(terrain, dt);

    if (this.grounded && !this.grinding) {
      // ===== GROUND MOVEMENT (CARVING SYSTEM) =====
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

      // Auto-accelerate downhill (faster base speed)
      let slopeAccel = this.isTucking ? 30 : 22;

      // S = brake on ground (NOT flip — that's air only)
      if (input.brake && !wasInAir) {
        slopeAccel = 3;
      }

      // ---- CARVING TURN ----
      // Smoothly ramp the turn rate up/down (like digging in an edge)
      const steerInput = input.steer; // -1, 0, +1

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
      const speedRatio = Math.max(0.2, Math.min(hSpeed / 50, 1.0));
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

      // Carving: turning at speed creates a slight speed scrub (edge friction)
      const carveFriction = 1.0 - Math.abs(this.turnRate) * 0.012;

      // Standard friction — less friction = faster feel
      let frictionMul;
      if (input.brake) {
        frictionMul = 0.96;
        this.turnRate *= 0.92;
      } else {
        frictionMul = this.isTucking ? 0.9995 : 0.998;
      }
      this.velocity.x *= frictionMul * carveFriction;
      this.velocity.z *= frictionMul * carveFriction;

      // Ollie / Pop
      if (input.jump) {
        if (this.onKicker) {
          // On a kicker: store pop boost — applied at lip for extra air
          this.kickerPopBoost = this.jumpForce * 0.6;
        } else {
          // Flat ground ollie
          this.velocity.y = this.jumpForce;
          this.grounded = false;
          this.peakHeight = 0;
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

      if (this.isTucking) {
        this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, -0.15, 0.12);
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0.3, 0.12);
      } else {
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0, 0.1);
      }

      // Rider leans into carve (shoulder rotation + body lean)
      this.riderGroup.rotation.z = THREE.MathUtils.lerp(
        this.riderGroup.rotation.z, this.edgeLeanSmooth * 0.3, 0.15
      );

    } else if (this.grinding) {
      // ===== RAIL GRIND =====
      // Maintain forward speed, slight friction, can still spin
      this.velocity.y = 0;
      this.velocity.multiplyScalar(0.998);

      // A/D for balance wobble (cosmetic)
      this.boardGroup.rotation.z = THREE.MathUtils.lerp(
        this.boardGroup.rotation.z, input.steer * 0.2, 0.1
      );

      // Can do spins while grinding
      if (input.spinLeft) this.angularVelocity.y = 4.0;
      else if (input.spinRight) this.angularVelocity.y = -4.0;

      this.trickRotation.y += this.angularVelocity.y * dt;
      this.angularVelocity.multiplyScalar(0.95);
      this.boardGroup.rotation.y = this.trickRotation.y;

      // Jump off rail
      if (input.jump) {
        this.velocity.y = this.jumpForce * 0.7;
        this.grinding = false;
        this.grindRail = null;
        this.grounded = false;
        this.peakHeight = 0;
      }

    } else {
      // ===== AIRBORNE =====
      this.velocity.multiplyScalar(0.9998);

      // --- SMOOTH SPIN/FLIP SYSTEM ---
      // Spins and flips ramp up smoothly and STOP when keys are released.
      // Player must time their inputs to land clean rotations.
      const flipTarget = 6.0;     // target flip angular vel
      const spinTarget = 6.5;     // target spin angular vel
      const rampUp = 14.0;        // how fast rotation builds (rad/s²)
      const stopSpeed = 18.0;     // how fast rotation stops on release (rad/s²)

      const flipping = input.flipForward || input.flipBackward;
      const spinning = input.spinLeft || input.spinRight;

      // --- CORK DETECTION ---
      // Cork = flip + spin pressed simultaneously. Off-axis diagonal rotation.
      const isCork = flipping && spinning;
      this.isCorkingThisJump = this.isCorkingThisJump || isCork;

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
        const corkFlipTarget = (input.flipForward ? 1 : -1) * flipTarget * 0.7;
        const corkSpinTarget = (input.spinLeft ? 1 : -1) * spinTarget * 0.85;
        const corkRollTarget = (input.spinLeft ? 1 : -1) * 2.5;

        // Ramp all three axes — all stop when keys release
        this.angularVelocity.x = rampOrBrake(this.angularVelocity.x, corkFlipTarget, true);
        this.angularVelocity.y = rampOrBrake(this.angularVelocity.y, corkSpinTarget, true);
        this.angularVelocity.z = rampOrBrake(this.angularVelocity.z, corkRollTarget, true);
      } else {
        // --- FLIP (W/S) — ramp up while held, hard stop on release ---
        const flipDir = input.flipForward ? 1 : input.flipBackward ? -1 : 0;
        this.angularVelocity.x = rampOrBrake(
          this.angularVelocity.x, flipDir * flipTarget, flipping
        );

        // --- SPIN (Q/E) — ramp up while held, hard stop on release ---
        const spinDir = input.spinLeft ? 1 : input.spinRight ? -1 : 0;
        this.angularVelocity.y = rampOrBrake(
          this.angularVelocity.y, spinDir * spinTarget, spinning
        );

        // Roll decays when not corking
        this.angularVelocity.z = rampOrBrake(this.angularVelocity.z, 0, false);
      }

      // Air steer — meaningful directional control while airborne
      if (input.steer !== 0) {
        this.velocity.x += input.steer * 8.0 * dt;
        this.heading -= input.steer * 2.0 * dt;
      }

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

    // ===== MOVE =====
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Hard floor clamp (absolute safety net)
    const floorH = terrain.getHeightAt(this.position.x, this.position.z);
    if (this.position.y < floorH + groundOffset) {
      this.position.y = floorH + groundOffset;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (!this.grinding) this.grounded = true;
    }

    this.position.x = THREE.MathUtils.clamp(this.position.x, -50, 50);

    // Grab animations
    if (this.isGrabbing && !this.grounded) {
      this.applyGrabPose(this.grabType);
    } else if (!this.isTucking && !this.grinding) {
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.5, 0.1);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.5, 0.1);
      this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, 0, 0.1);
    }

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

    return this.getState(terrain);
  }

  // ===== KICKER SURFACE RIDE =====
  // Instead of instant launch, the player RIDES UP the kicker surface.
  // The ramp raises them gradually. When they exit the lip, gravity takes over.
  getSurfaceHeight(terrain) {
    const baseH = terrain.getHeightAt(this.position.x, this.position.z);

    // Skip kicker surface during cooldown (prevents re-launch loops)
    if (this.kickerCooldown > 0) return baseH;

    let kickerBoost = 0;

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'kicker') continue;

      const dx = this.position.x - ramp.position.x;
      const dz = this.position.z - ramp.position.z;

      if (Math.abs(dx) < ramp.width && Math.abs(dz) < ramp.length) {
        // Player is within the kicker footprint
        // t = 0 at entry (positive Z side), t = 1 at lip (negative Z side)
        const t = 1.0 - (dz + ramp.length) / (ramp.length * 2);
        const clampedT = Math.max(0, Math.min(1, t));

        // Ramp surface: smooth curve from 0 to lipHeight
        const rampH = ramp.lipHeight * Math.sin(clampedT * Math.PI * 0.5);
        kickerBoost = Math.max(kickerBoost, rampH);

        if (this.grounded && clampedT > 0.1) {
          this.onKicker = ramp;
          this.kickerProgress = clampedT;
        }
      }
    }

    return baseH + kickerBoost;
  }

  updateKickerRide(terrain, dt) {
    if (!this.onKicker || !this.grounded) {
      this.onKicker = null;
      return;
    }

    const ramp = this.onKicker;
    const dz = this.position.z - ramp.position.z;
    const t = 1.0 - (dz + ramp.length) / (ramp.length * 2);

    // Player has passed the lip — launch!
    if (t >= 0.95) {
      const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

      // Launch angle based on jump size (bigger = steeper lip)
      const lipAngle = ramp.lipAngle || 0.55;

      // Redirect velocity through the lip angle
      const launchSpeed = speed * 0.93;
      this.velocity.y = Math.sin(lipAngle) * launchSpeed;
      const horizFactor = Math.cos(lipAngle);
      this.velocity.x *= horizFactor;
      this.velocity.z *= horizFactor;

      // Small pop bonus based on approach speed
      this.velocity.y += Math.min(speed * 0.06, 3);

      // Apply ollie pop boost if player pressed space on the kicker
      if (this.kickerPopBoost > 0) {
        this.velocity.y += this.kickerPopBoost;
        this.kickerPopBoost = 0;
      }

      this.grounded = false;
      this.onKicker = null;
      this.peakHeight = 0;
      this.kickerCooldown = 1.5; // ignore kicker surfaces for 1.5s after launch
    }
  }

  // ===== RAIL GRIND =====
  updateRailGrind(terrain, dt) {
    if (this.grounded || this.grinding) return;
    if (this.velocity.y > 0) return; // only grind when descending

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'rail') continue;

      const dx = this.position.x - ramp.position.x;
      const dz = this.position.z - ramp.position.z;
      const dy = this.position.y - (ramp.position.y + ramp.surfaceHeight);

      // Check if player is close enough to rail in all axes
      if (Math.abs(dx) < ramp.width + this.capsuleRadius &&
          Math.abs(dz) < ramp.length / 2 + 0.5 &&
          dy > -0.3 && dy < 1.5) {
        // Snap onto rail
        this.position.y = ramp.position.y + ramp.surfaceHeight + 0.2;
        this.velocity.y = 0;
        this.grinding = true;
        this.grindRail = ramp;
        this.peakHeight = 0;
        break;
      }
    }
  }

  applyGrabPose(type) {
    switch (type) {
      case 'indy':
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -1.8, 0.2);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.8, 0.2);
        break;
      case 'method':
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.8, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.8, 0.2);
        break;
      case 'stalefish':
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.5, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -1.2, 0.2);
        break;
      case 'melon':
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.6, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.5, 0.2);
        break;
      case 'nosegrab':
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.0, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -1.6, 0.2);
        break;
      case 'tailgrab':
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.6, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -1.0, 0.2);
        break;
      default:
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 1.4, 0.2);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -1.4, 0.2);
    }
    this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, -0.2, 0.15);
  }

  triggerCrash() {
    this.crashed = true;
    this.crashTimer = 0;
    this.velocity.set(0, 0, 0);
    this.onKicker = null;
    this.grinding = false;
    this.grindRail = null;
    this.boardGroup.rotation.x = Math.PI * 0.7;
    this.boardGroup.rotation.z = Math.random() * Math.PI - Math.PI / 2;
  }

  respawn(checkpointPos) {
    this.crashed = false;
    this.crashTimer = 0;
    this.position.copy(checkpointPos);
    this.position.y += 2;
    this.velocity.set(0, 0, -10);
    this.heading = Math.PI;
    this.visualYaw = Math.PI;
    this.angularVelocity.set(0, 0, 0);
    this.trickRotation.set(0, 0, 0);
    this.turnRate = 0;
    this.edgeLean = 0;
    this.edgeLeanSmooth = 0;
    this.isCorkingThisJump = false;
    this.kickerCooldown = 0;
    this.kickerPopBoost = 0;
    this.grounded = false;
    this.airTime = 0;
    this.isGrabbing = false;
    this.grabType = null;
    this.peakHeight = 0;
    this.currentHeightAboveGround = 0;
    this.onKicker = null;
    this.grinding = false;
    this.grindRail = null;

    this.boardGroup.rotation.set(0, 0, 0);
    this.riderGroup.position.set(0, 0, 0);
    this.riderGroup.rotation.set(0, 0, 0);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, Math.PI, 0);
    this.visualYaw = Math.PI;
  }

  getState(terrain) {
    const terrainH = terrain ? terrain.getHeightAt(this.position.x, this.position.z) : 0;
    const heightAbove = Math.max(0, this.position.y - terrainH - 0.35);
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
      position: this.position.clone(),
      jumpHeightFeet: heightFeet,
      peakHeightFeet: peakFeet,
      isAirborne: !this.grounded && !this.grinding && this.airTime > 0.1,
      grinding: this.grinding,
      isCork: this.isCorkingThisJump,
    };
  }
}
