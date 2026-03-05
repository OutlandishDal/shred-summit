import * as THREE from 'three';

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
    this.baseMaxSpeed = 35;
    this.maxSpeed = 35;  // ~126 km/h — fast but not absurd
    this.gravity = -25;
    this.baseJumpForce = 8;
    this.jumpForce = 8;
    this.flexMultiplier = 1.0;

    // Carving system — smooth laid-down carves
    this.turnRate = 0;            // current turning angular velocity (rad/s)
    this.turnRateMax = 2.3;       // ~130 deg/s — smooth carving
    this.turnAccel = 16.0;        // snappy edge engagement
    this.turnDecel = 10.0;        // smooth decay on release
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
    this.boardslideType = null;   // null, 'frontside', 'backside'
    this.boardslideAngle = 0;     // visual rotation for boardslide
    this.grindTime = 0;           // how long current grind has lasted
    this.wasGrinding = false;
    this.landedOnRail = false;     // one-shot flag: air → rail transition
    this.frontswapCount = 0;       // number of frontside↔backside swaps during grind

    // Cork tracking
    this.isCorkingThisJump = false;

    // Kicker launch cooldown — prevents re-launch when landing back on same kicker
    this.kickerCooldown = 0;
    this.kickerPopBoost = 0; // extra air from pressing space on a kicker

    // Landing zone tracking
    this.landingQuality = null; // null, 'perfect', 'clean'
    this.landingZoneSlopeAbsorb = 0; // 0-0.7 slope absorption factor

    // Crash
    this.crashed = false;
    this.crashTimer = 0;
    this.crashDebris = [];
    this.landingTolerance = Math.PI * (45 / 180); // 45 degrees — forgiving landings
    this.rollLandingTolerance = Math.PI * (90 / 180); // 90 degrees — roll is hard to control

    // Capsule hitbox: center = position, radius, half-height
    this.capsuleRadius = 0.4;
    this.capsuleHalfH = 0.8;

    // Stance depends on equipment
    this.STANCE_YAW = this.equipmentType === 'ski' ? 0 : 1.3;
    this.HEAD_YAW = this.equipmentType === 'ski' ? 0 : -0.6;

    // Landing impact spring system
    this.landingImpact = 0;
    this.landingImpactVel = 0;

    this.group = new THREE.Group();
    this.boardGroup = new THREE.Group();
    this.riderGroup = new THREE.Group();

    this.buildModel();
    this.scene.add(this.group);
  }

  lerpJoint(joint, axis, target, speed) {
    joint.rotation[axis] = THREE.MathUtils.lerp(joint.rotation[axis], target, speed);
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

    // === RIDER ===
    this.jacketMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.8 });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9 });
    const jacketMat = this.jacketMat;
    const pantsMat = this.pantsMat;
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5c6a0 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    this.bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // Stance rotation
    this.riderGroup.rotation.y = this.STANCE_YAW;

    // Hips
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.22), pantsMat);
    hips.position.set(0, 0.55, 0); this.riderGroup.add(hips);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), jacketMat);
    torso.position.set(0, 0.85, 0); torso.castShadow = true; this.riderGroup.add(torso);

    // Neck + Head
    this.neckGroup = new THREE.Group();
    this.neckGroup.position.set(0, 1.15, 0);
    this.riderGroup.add(this.neckGroup);

    this.headGroup = new THREE.Group();
    this.headGroup.rotation.y = this.HEAD_YAW;
    this.neckGroup.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skinMat);
    head.position.set(0, 0.17, 0); head.castShadow = true; this.headGroup.add(head);

    this.helmetMat = new THREE.MeshStandardMaterial({ color: 0x212121 });
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.helmetMat);
    helmet.position.set(0, 0.21, 0); this.headGroup.add(helmet);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff9800, metalness: 0.7, roughness: 0.1 }));
    goggles.position.set(0, 0.17, 0.14); this.headGroup.add(goggles);

    // === SEGMENTED ARMS ===
    // Left arm: shoulderL → upperArmL → elbowL → forearmL → gloveL
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.28, 1.05, 0);
    this.riderGroup.add(this.shoulderL);

    const upperArmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 6), jacketMat);
    upperArmL.position.set(0, -0.12, 0); upperArmL.castShadow = true;
    this.shoulderL.add(upperArmL);

    this.elbowL = new THREE.Group();
    this.elbowL.position.set(0, -0.24, 0);
    this.shoulderL.add(this.elbowL);

    const forearmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 4, 6), jacketMat);
    forearmL.position.set(0, -0.11, 0); forearmL.castShadow = true;
    this.elbowL.add(forearmL);

    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), this.gloveMat);
    gloveL.position.set(0, -0.22, 0);
    this.elbowL.add(gloveL);

    // Right arm: shoulderR → upperArmR → elbowR → forearmR → gloveR
    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.28, 1.05, 0);
    this.riderGroup.add(this.shoulderR);

    const upperArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 6), jacketMat);
    upperArmR.position.set(0, -0.12, 0); upperArmR.castShadow = true;
    this.shoulderR.add(upperArmR);

    this.elbowR = new THREE.Group();
    this.elbowR.position.set(0, -0.24, 0);
    this.shoulderR.add(this.elbowR);

    const forearmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 4, 6), jacketMat);
    forearmR.position.set(0, -0.11, 0); forearmR.castShadow = true;
    this.elbowR.add(forearmR);

    const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), this.gloveMat);
    gloveR.position.set(0, -0.22, 0);
    this.elbowR.add(gloveR);

    // Default arm pose — arms spread OUTWARD from body
    if (this.equipmentType === 'ski') {
      // Ski: moderate spread for holding poles, slight forward lean
      this.shoulderL.rotation.z = -0.75;
      this.shoulderL.rotation.x = 0.2;
      this.elbowL.rotation.x = -0.3;
      this.shoulderR.rotation.z = 0.75;
      this.shoulderR.rotation.x = 0.2;
      this.elbowR.rotation.x = -0.3;
    } else {
      // Snowboard: arms angled out and down for balance
      this.shoulderL.rotation.z = -0.7;
      this.shoulderL.rotation.x = 0.15;
      this.elbowL.rotation.x = -0.3;
      this.shoulderR.rotation.z = 0.7;
      this.shoulderR.rotation.x = 0.15;
      this.elbowR.rotation.x = -0.3;
    }

    // Ski poles (attached to forearms)
    if (this.equipmentType === 'ski') {
      this.buildPoles();
    }

    // === SEGMENTED LEGS ===
    const isSki = this.equipmentType === 'ski';
    // Left leg: hipL → thighL → kneeL → calfL → bootL
    this.hipL = new THREE.Group();
    this.hipL.position.set(isSki ? -0.12 : -0.1, 0.48, isSki ? 0 : 0.08);
    this.riderGroup.add(this.hipL);

    const thighL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 3, 6), pantsMat);
    thighL.position.set(0, -0.1, 0); thighL.castShadow = true;
    this.hipL.add(thighL);

    this.kneeL = new THREE.Group();
    this.kneeL.position.set(0, -0.22, 0);
    this.hipL.add(this.kneeL);

    const calfL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 3, 6), pantsMat);
    calfL.position.set(0, -0.1, 0); calfL.castShadow = true;
    this.kneeL.add(calfL);

    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), this.bootMat);
    bootL.position.set(0, -0.22, 0.03);
    this.kneeL.add(bootL);

    // Right leg: hipR → thighR → kneeR → calfR → bootR
    this.hipR = new THREE.Group();
    this.hipR.position.set(isSki ? 0.12 : 0.1, 0.48, isSki ? 0 : -0.08);
    this.riderGroup.add(this.hipR);

    const thighR = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 3, 6), pantsMat);
    thighR.position.set(0, -0.1, 0); thighR.castShadow = true;
    this.hipR.add(thighR);

    this.kneeR = new THREE.Group();
    this.kneeR.position.set(0, -0.22, 0);
    this.hipR.add(this.kneeR);

    const calfR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 3, 6), pantsMat);
    calfR.position.set(0, -0.1, 0); calfR.castShadow = true;
    this.kneeR.add(calfR);

    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), this.bootMat);
    bootR.position.set(0, -0.22, 0.03);
    this.kneeR.add(bootR);

    // Default leg pose: knees bent for riding stance
    this.hipL.rotation.x = -0.3;
    this.kneeL.rotation.x = 0.6;
    this.hipR.rotation.x = -0.3;
    this.kneeR.rotation.x = 0.6;

    this.boardGroup.add(this.riderGroup);
    this.group.add(this.boardGroup);
  }

  buildSnowboard() {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 1.9), this.boardMat);
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

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.2), this.boardMat);
    nose.position.set(0, 0.04, 0.95); nose.rotation.x = 0.3; board.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.2), this.boardMat);
    tail.position.set(0, 0.04, -0.95); tail.rotation.x = -0.3; board.add(tail);

    const bindMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    for (const z of [0.35, -0.3]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.18), bindMat);
      b.position.set(0, 0.06, z); board.add(b);
    }
    this.boardGroup.add(board);
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
    // Arms: spread outward from body (negative Z = outward for left, positive Z = outward for right)
    this.lerpJoint(this.shoulderL, 'z', isSki ? -0.75 : -0.7, s);
    this.lerpJoint(this.shoulderL, 'x', isSki ? 0.2 : 0.15, s);
    this.lerpJoint(this.elbowL, 'x', -0.3, s);

    this.lerpJoint(this.shoulderR, 'z', isSki ? 0.75 : 0.7, s);
    this.lerpJoint(this.shoulderR, 'x', isSki ? 0.2 : 0.15, s);
    this.lerpJoint(this.elbowR, 'x', -0.3, s);

    // Legs: default riding bend
    this.lerpJoint(this.hipL, 'x', -0.3, s);
    this.lerpJoint(this.kneeL, 'x', 0.6, s);
    this.lerpJoint(this.hipR, 'x', -0.3, s);
    this.lerpJoint(this.kneeR, 'x', 0.6, s);

    // Head look
    this.lerpJoint(this.headGroup, 'y', -0.6, s);
  }

  update(dt, input, terrain) {
    if (this.crashed) {
      this.updateDebris(dt);
      return this.getState(terrain);
    }

    this.wasGrounded = this.grounded;
    this.wasGrinding = this.grinding;
    this.landedOnRail = false; // one-shot: cleared each frame, set by _initGrindFromAir
    this.isTucking = input.tuck;

    const groundOffset = 0.08; // board rests on snow

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

      // Detect landing zone and compute slope absorption
      this.landingZoneSlopeAbsorb = 0;
      this.landingQuality = null;

      if (wasInAir && this.airTime > 0.4) {
        for (const ramp of terrain.ramps) {
          if (ramp.type !== 'kicker' || ramp.landingZoneStartZ === undefined) continue;
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
          this.triggerCrash();
          return this.getState(terrain);
        }
      }

      // Fall damage — landing zone slope absorbs vertical impact
      const effectiveVY = this.velocity.y * (1 - this.landingZoneSlopeAbsorb);
      if (effectiveVY < -35) {
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
      let slopeAccel = this.isTucking ? 16 : 11;

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

      // Standard friction
      let frictionMul;
      if (input.brake) {
        frictionMul = 0.94;
        this.turnRate *= 0.90;
      } else {
        frictionMul = this.isTucking ? 0.998 : 0.995;
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
      // Snap board Y rotation back to neutral (prevents residual spin drift)
      this.boardGroup.rotation.y = THREE.MathUtils.lerp(
        this.boardGroup.rotation.y, 0, 0.25
      );

      // --- GROUNDED RIDER ANIMATIONS ---
      const lean = this.edgeLeanSmooth;
      const impactBend = this.landingImpact * 0.8;

      if (this.isTucking) {
        // Ground tuck: deep crouch
        this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, -0.15, 0.12);
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0.3, 0.12);
        // Deep knee bend
        this.lerpJoint(this.hipL, 'x', -0.7, 0.12);
        this.lerpJoint(this.kneeL, 'x', 1.2, 0.12);
        this.lerpJoint(this.hipR, 'x', -0.7, 0.12);
        this.lerpJoint(this.kneeR, 'x', 1.2, 0.12);
        // Arms fold in for tuck (but still out from body)
        this.lerpJoint(this.shoulderL, 'z', -0.5, 0.12);
        this.lerpJoint(this.shoulderL, 'x', 0.3, 0.12);
        this.lerpJoint(this.elbowL, 'x', -0.9, 0.12);
        this.lerpJoint(this.shoulderR, 'z', 0.5, 0.12);
        this.lerpJoint(this.shoulderR, 'x', 0.3, 0.12);
        this.lerpJoint(this.elbowR, 'x', -0.9, 0.12);
      } else {
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0, 0.1);
        // Legs: carving + landing impact
        const frontKnee = 0.6 + impactBend + lean * 0.15;
        const rearKnee = 0.6 + impactBend - lean * 0.15;
        const frontHip = -0.3 - impactBend * 0.5;
        const rearHip = -0.3 - impactBend * 0.5;

        this.lerpJoint(this.hipL, 'x', frontHip, 0.12);
        this.lerpJoint(this.kneeL, 'x', frontKnee, 0.12);
        this.lerpJoint(this.hipR, 'x', rearHip, 0.12);
        this.lerpJoint(this.kneeR, 'x', rearKnee, 0.12);

        // Arms: spread outward, sway with turns
        const armZ = this.equipmentType === 'ski' ? 0.75 : 0.7;
        const armX = this.equipmentType === 'ski' ? 0.2 : 0.15;
        this.lerpJoint(this.shoulderL, 'z', -armZ - lean * 0.15, 0.1);
        this.lerpJoint(this.shoulderL, 'x', armX - lean * 0.15, 0.1);
        this.lerpJoint(this.elbowL, 'x', -0.3 - lean * 0.2, 0.1);

        this.lerpJoint(this.shoulderR, 'z', armZ - lean * 0.15, 0.1);
        this.lerpJoint(this.shoulderR, 'x', armX + lean * 0.15, 0.1);
        this.lerpJoint(this.elbowR, 'x', -0.3 + lean * 0.2, 0.1);
      }

      // Rider body drop from landing impact
      const dropY = this.isTucking ? -0.15 : (-impactBend * 0.15);
      this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, dropY, 0.12);

      // Rider leans into carve (shoulder rotation + body lean)
      this.riderGroup.rotation.z = THREE.MathUtils.lerp(
        this.riderGroup.rotation.z, this.edgeLeanSmooth * 0.3, 0.15
      );

      // Head looks into turns slightly
      this.lerpJoint(this.headGroup, 'y', -0.6 - lean * 0.2, 0.1);

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
          this.grinding = false;
          this.grindRail = null;
          this.grounded = false;
          this.peakHeight = 0;
          // Exit kicker pop — launch ~3-5 feet upward (about character height)
          this.velocity.y = 7.0;
        }
      }

      if (!railEnded && this.grinding) {
        // Lock X position to rail center (smooth lerp so it feels natural)
        const railX = this.grindRail.position.x;
        this.position.x = THREE.MathUtils.lerp(this.position.x, railX, 0.15);
        this.velocity.x *= 0.8; // dampen lateral drift

        // Lock Y to rail surface height at player's Z (follows terrain slope)
        const terrainAtPlayer = terrain.computeHeight(this.position.x, this.position.z);
        const railTop = terrainAtPlayer + this.grindRail.surfaceHeight;
        this.position.y = railTop + 0.2;
        this.velocity.y = 0;

        // Maintain forward speed, slight friction
        this.velocity.multiplyScalar(0.998);

        // Track grind duration
        this.grindTime += dt;

        // A/D for boardslide tricks while grinding
        const prevBoardslideType = this.boardslideType;
        if (input.steer > 0) {
          // D key = frontside boardslide
          this.boardslideType = 'frontside';
          this.boardslideAngle = THREE.MathUtils.lerp(this.boardslideAngle, Math.PI / 2, 0.15);
        } else if (input.steer < 0) {
          // A key = backside boardslide
          this.boardslideType = 'backside';
          this.boardslideAngle = THREE.MathUtils.lerp(this.boardslideAngle, -Math.PI / 2, 0.15);
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

        // Detect frontswap: switching between frontside ↔ backside
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

        // Can do spins while grinding (Q/E)
        if (input.spinLeft) this.angularVelocity.y = 4.0;
        else if (input.spinRight) this.angularVelocity.y = -4.0;

        this.trickRotation.y += this.angularVelocity.y * dt;
        this.angularVelocity.multiplyScalar(0.95);

        // Combine spin rotation with boardslide angle
        this.boardGroup.rotation.y = this.trickRotation.y + this.boardslideAngle;

        // Grind rider animations: arms spread wide for balance
        this.lerpJoint(this.shoulderL, 'z', -0.9, 0.12);
        this.lerpJoint(this.shoulderL, 'x', 0, 0.12);
        this.lerpJoint(this.elbowL, 'x', -0.15, 0.12);
        this.lerpJoint(this.shoulderR, 'z', 0.9, 0.12);
        this.lerpJoint(this.shoulderR, 'x', 0, 0.12);
        this.lerpJoint(this.elbowR, 'x', -0.15, 0.12);

        // Legs: slight crouch
        this.lerpJoint(this.hipL, 'x', -0.4, 0.1);
        this.lerpJoint(this.kneeL, 'x', 0.7, 0.1);
        this.lerpJoint(this.hipR, 'x', -0.4, 0.1);
        this.lerpJoint(this.kneeR, 'x', 0.7, 0.1);

        // Maintain stance yaw
        this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, this.STANCE_YAW, 0.1);
        this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, 0, 0.1);
        this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0, 0.1);

        // Jump off rail
        if (input.jump) {
          this.velocity.y = this.jumpForce * 0.7;
          this.grinding = false;
          this.grindRail = null;
          this.grounded = false;
          this.peakHeight = 0;
        }
      }

    } else {
      // ===== AIRBORNE =====
      this.velocity.multiplyScalar(0.9998);

      // --- SMOOTH SPIN/FLIP SYSTEM ---
      // Spins and flips ramp up smoothly and STOP when keys are released.
      // Player must time their inputs to land clean rotations.
      // Shift = tuck in air → 1.5x faster spins/flips/corks
      const tuckMul = (input.tuck || input.grab) ? 1.5 : 1.0;
      const flipTarget = 6.0 * tuckMul;     // target flip angular vel
      const spinTarget = 6.5 * tuckMul;     // target spin angular vel
      const rampUp = 14.0 * tuckMul;        // how fast rotation builds (rad/s²)
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

        // --- SPIN (Q/E) — ramp up while held, hard stop on release ---
        const spinDir = input.spinLeft ? 1 : input.spinRight ? -1 : 0;
        this.angularVelocity.y = rampOrBrake(
          this.angularVelocity.y, spinDir * spinTarget, spinning
        );

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

      // --- AIRBORNE RIDER ANIMATIONS ---
      // Maintain sideways stance in air
      this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, this.STANCE_YAW, 0.1);
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

    // Snap to terrain after movement when grounded (prevents 1-frame float/clip)
    if (this.grounded && !this.grinding) {
      const newSurfaceH = this.getSurfaceHeight(terrain);
      this.position.y = newSurfaceH + groundOffset;
    }

    // Hard floor clamp (absolute safety net)
    const floorH = terrain.getHeightAt(this.position.x, this.position.z);
    if (this.position.y < floorH + groundOffset) {
      this.position.y = floorH + groundOffset;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (!this.grinding) this.grounded = true;
    }

    this.position.x = THREE.MathUtils.clamp(this.position.x, -50, 50);

    // Grab & tuck & default air animations
    if (this.isGrabbing && !this.grounded) {
      this.applyGrabPose(this.grabType);
    } else if (this.isTucking && !this.grounded && !this.grinding) {
      // Air tuck — crouched tight for faster rotation
      this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, -0.2, 0.15);
      this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0.4, 0.15);
      // Arms fold in tight (but clear of body)
      this.lerpJoint(this.shoulderL, 'z', -0.6, 0.15);
      this.lerpJoint(this.shoulderL, 'x', 0.4, 0.15);
      this.lerpJoint(this.elbowL, 'x', -1.1, 0.15);
      this.lerpJoint(this.shoulderR, 'z', 0.6, 0.15);
      this.lerpJoint(this.shoulderR, 'x', 0.4, 0.15);
      this.lerpJoint(this.elbowR, 'x', -1.1, 0.15);
      // Legs tuck up
      this.lerpJoint(this.hipL, 'x', -0.8, 0.15);
      this.lerpJoint(this.kneeL, 'x', 1.4, 0.15);
      this.lerpJoint(this.hipR, 'x', -0.8, 0.15);
      this.lerpJoint(this.kneeR, 'x', 1.4, 0.15);
    } else if (!this.grounded && !this.grinding) {
      // Default air pose: arms spread WIDE for balance/style
      this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, 0, 0.1);
      this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, 0.1, 0.1);
      // Arms spread wide out to sides — one slightly higher for style
      this.lerpJoint(this.shoulderL, 'z', -1.05, 0.12);
      this.lerpJoint(this.shoulderL, 'x', 0.1, 0.12);
      this.lerpJoint(this.elbowL, 'x', -0.2, 0.12);
      this.lerpJoint(this.shoulderR, 'z', 0.95, 0.12);
      this.lerpJoint(this.shoulderR, 'x', -0.1, 0.12);
      this.lerpJoint(this.elbowR, 'x', -0.2, 0.12);
      // Legs slightly tucked
      this.lerpJoint(this.hipL, 'x', -0.4, 0.1);
      this.lerpJoint(this.kneeL, 'x', 0.7, 0.1);
      this.lerpJoint(this.hipR, 'x', -0.4, 0.1);
      this.lerpJoint(this.kneeR, 'x', 0.7, 0.1);
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
    let boost = 0;

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'kicker') continue;

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

          if (landingH > baseH) {
            boost = Math.max(boost, landingH - baseH);
          }
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
    const dz = this.position.z - ramp.position.z;
    const halfL = ramp.length / 2;
    const t = 1.0 - (dz + halfL) / ramp.length;

    // Player has passed the lip — launch!
    if (t >= 0.95) {
      const rawSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      // Cap effective launch speed so kickers don't send you to orbit
      const speed = Math.min(rawSpeed, 25);

      // Launch angle based on jump size (bigger = steeper lip)
      const lipAngle = ramp.lipAngle || 0.55;

      // Redirect velocity through the lip angle
      const launchSpeed = speed * 0.85;
      this.velocity.y = Math.sin(lipAngle) * launchSpeed;
      const horizFactor = Math.cos(lipAngle);
      // Preserve horizontal speed but reduce it
      const hScale = horizFactor * Math.min(1, 25 / Math.max(rawSpeed, 1));
      this.velocity.x *= hScale;
      this.velocity.z *= hScale;

      // Small pop bonus
      this.velocity.y += Math.min(speed * 0.04, 2);

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
    if (this.grinding) return;

    for (const ramp of terrain.ramps) {
      if (ramp.type !== 'rail') continue;

      const dx = this.position.x - ramp.position.x;
      const dz = this.position.z - ramp.position.z;
      // Use terrain height at player's Z for accurate rail top on tilted rails
      const terrainH = terrain.computeHeight(this.position.x, this.position.z);
      const railTop = terrainH + ramp.surfaceHeight;
      const dy = this.position.y - railTop;

      // Check if player is within rail XZ footprint
      if (Math.abs(dx) < ramp.width + this.capsuleRadius &&
          Math.abs(dz) < ramp.length / 2 + 0.5) {

        if (this.grounded && dy < 0.5) {
          // Grounded player hitting rail — auto-hop onto it
          this.position.y = railTop + 0.2;
          this.velocity.y = 0;
          this.grinding = true;
          this.grindRail = ramp;
          this.grounded = false;
          this.peakHeight = 0;
          this.grindTime = 0;
          this.frontswapCount = 0;
          if (this.equipmentType === 'ski') {
            // Skis can't 50-50 — default to frontside boardslide
            this.boardslideType = 'frontside';
            this.boardslideAngle = Math.PI / 2;
          } else {
            this.boardslideType = null;
            this.boardslideAngle = 0;
          }
          break;
        } else if (!this.grounded && this.velocity.y <= 0 &&
                   dy > -1.0 && dy < 3.0) {
          // Airborne descending player — snap onto rail (generous catch window)
          this.position.y = railTop + 0.2;
          this.velocity.y = 0;
          this.grinding = true;
          this.grindRail = ramp;
          this.peakHeight = 0;
          this.grindTime = 0;
          this._initGrindFromAir();
          break;
        } else if (!this.grounded && this.velocity.y > 0 &&
                   dy > -0.5 && dy < 1.5) {
          // Airborne ascending player passing through rail height — catch on the way up too
          this.position.y = railTop + 0.2;
          this.velocity.y = 0;
          this.grinding = true;
          this.grindRail = ramp;
          this.peakHeight = 0;
          this.grindTime = 0;
          this._initGrindFromAir();
          break;
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

    // Signal to TrickSystem that we landed on a rail from air
    this.landedOnRail = true;

    // Reset trickRotation so Q/E spins during grind accumulate fresh
    this.trickRotation.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  applyGrabPose(type) {
    const L = 0.18; // lerp speed for smooth transitions
    let crouchY = -0.35;
    let leanX = 0.3;

    // All grabs: legs pull up to meet the hand
    const grabHipX = -0.6;
    const grabKneeX = 1.2;

    this.lerpJoint(this.hipL, 'x', grabHipX, L);
    this.lerpJoint(this.kneeL, 'x', grabKneeX, L);
    this.lerpJoint(this.hipR, 'x', grabHipX, L);
    this.lerpJoint(this.kneeR, 'x', grabKneeX, L);

    switch (type) {
      case 'indy':
        // Right hand grabs toe edge between feet — arm reaches down/inward
        this.lerpJoint(this.shoulderR, 'z', 1.2, L);
        this.lerpJoint(this.shoulderR, 'x', 0.2, L);
        this.lerpJoint(this.elbowR, 'x', -1.3, L);
        // Left arm relaxed / balanced outward
        this.lerpJoint(this.shoulderL, 'z', -0.75, L);
        this.lerpJoint(this.shoulderL, 'x', 0, L);
        this.lerpJoint(this.elbowL, 'x', -0.3, L);
        break;

      case 'method':
        // Left hand reaches behind and up to heel edge — classic tweaked method
        this.lerpJoint(this.shoulderL, 'z', -1.1, L);
        this.lerpJoint(this.shoulderL, 'x', -0.8, L);
        this.lerpJoint(this.elbowL, 'x', -1.4, L);
        // Right arm forward for balance
        this.lerpJoint(this.shoulderR, 'z', 0.6, L);
        this.lerpJoint(this.shoulderR, 'x', 0.4, L);
        this.lerpJoint(this.elbowR, 'x', -0.3, L);
        leanX = 0.45;
        break;

      case 'stalefish':
        // Right hand crosses body to grab heel edge
        this.lerpJoint(this.shoulderR, 'z', 1.0, L);
        this.lerpJoint(this.shoulderR, 'x', -0.3, L);
        this.lerpJoint(this.elbowR, 'x', -1.4, L);
        // Left arm out for balance
        this.lerpJoint(this.shoulderL, 'z', -0.85, L);
        this.lerpJoint(this.shoulderL, 'x', 0.2, L);
        this.lerpJoint(this.elbowL, 'x', -0.3, L);
        crouchY = -0.4;
        break;

      case 'melon':
        // Left hand grabs heel edge — arm reaches down/inward
        this.lerpJoint(this.shoulderL, 'z', -1.2, L);
        this.lerpJoint(this.shoulderL, 'x', 0.2, L);
        this.lerpJoint(this.elbowL, 'x', -1.3, L);
        // Right arm relaxed / balanced outward
        this.lerpJoint(this.shoulderR, 'z', 0.75, L);
        this.lerpJoint(this.shoulderR, 'x', 0, L);
        this.lerpJoint(this.elbowR, 'x', -0.3, L);
        break;

      case 'nosegrab':
        // Right hand reaches forward and down to grab board nose
        this.lerpJoint(this.shoulderR, 'z', 1.0, L);
        this.lerpJoint(this.shoulderR, 'x', 0.8, L);
        this.lerpJoint(this.elbowR, 'x', -1.2, L);
        // Left arm back for balance
        this.lerpJoint(this.shoulderL, 'z', -0.7, L);
        this.lerpJoint(this.shoulderL, 'x', -0.4, L);
        this.lerpJoint(this.elbowL, 'x', -0.3, L);
        leanX = 0.55;
        crouchY = -0.3;
        break;

      case 'tailgrab':
        // Right hand reaches backward and down to grab board tail
        this.lerpJoint(this.shoulderR, 'z', 1.0, L);
        this.lerpJoint(this.shoulderR, 'x', -0.8, L);
        this.lerpJoint(this.elbowR, 'x', -1.2, L);
        // Left arm forward for balance
        this.lerpJoint(this.shoulderL, 'z', -0.7, L);
        this.lerpJoint(this.shoulderL, 'x', 0.4, L);
        this.lerpJoint(this.elbowL, 'x', -0.3, L);
        leanX = -0.15;
        crouchY = -0.3;
        break;

      default:
        // Generic grab
        this.lerpJoint(this.shoulderL, 'z', -1.05, L);
        this.lerpJoint(this.shoulderL, 'x', 0, L);
        this.lerpJoint(this.elbowL, 'x', -1.3, L);
        this.lerpJoint(this.shoulderR, 'z', 1.05, L);
        this.lerpJoint(this.shoulderR, 'x', 0, L);
        this.lerpJoint(this.elbowR, 'x', -1.3, L);
    }

    // Crouch body down and lean
    this.riderGroup.position.y = THREE.MathUtils.lerp(this.riderGroup.position.y, crouchY, 0.15);
    this.riderGroup.rotation.x = THREE.MathUtils.lerp(this.riderGroup.rotation.x, leanX, 0.15);
  }

  setColor(part, colorHex) {
    const color = new THREE.Color(colorHex);
    switch (part) {
      case 'jacket': this.jacketMat.color.copy(color); break;
      case 'pants': this.pantsMat.color.copy(color); break;
      case 'board': this.boardMat.color.copy(color); break;
      case 'helmet': this.helmetMat.color.copy(color); break;
    }
  }

  applyBoardStats(speed, pop, flex) {
    this.maxSpeed = this.baseMaxSpeed * (0.85 + speed * 0.03);
    this.jumpForce = this.baseJumpForce * (0.85 + pop * 0.03);
    this.flexMultiplier = 0.85 + flex * 0.03;
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
    this.boardslideType = null;
    this.boardslideAngle = 0;
    this.grindTime = 0;
    this.landingImpact = 0;
    this.landingImpactVel = 0;

    this.boardGroup.rotation.set(0, 0, 0);
    this.riderGroup.position.set(0, 0, 0);
    this.riderGroup.rotation.set(0, this.STANCE_YAW, 0);

    // Reset all joints to default riding pose — arms spread outward
    if (this.equipmentType === 'ski') {
      this.shoulderL.rotation.set(0.15, 0, 0.8);
      this.elbowL.rotation.set(-0.2, 0, 0);
      this.shoulderR.rotation.set(0.15, 0, -0.8);
      this.elbowR.rotation.set(-0.2, 0, 0);
    } else {
      this.shoulderL.rotation.set(0.1, 0, 0.7);
      this.elbowL.rotation.set(-0.2, 0, 0);
      this.shoulderR.rotation.set(0.1, 0, -0.7);
      this.elbowR.rotation.set(-0.2, 0, 0);
    }
    this.hipL.rotation.set(-0.3, 0, 0);
    this.kneeL.rotation.set(0.6, 0, 0);
    this.hipR.rotation.set(-0.3, 0, 0);
    this.kneeR.rotation.set(0.6, 0, 0);
    this.headGroup.rotation.set(0, this.HEAD_YAW, 0);

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
    this.hipL.rotation.set(-1.5, 0.1, 0);
    this.kneeL.rotation.set(1.6, 0, 0);
    this.hipR.rotation.set(-1.5, -0.1, 0);
    this.kneeR.rotation.set(1.6, 0, 0);

    // Arms: resting on knees, elbows out slightly
    this.shoulderL.rotation.set(0.5, 0.2, -0.2);
    this.elbowL.rotation.set(-0.9, 0, 0);
    this.shoulderR.rotation.set(0.5, -0.2, 0.2);
    this.elbowR.rotation.set(-0.9, 0, 0);

    // Head: looking slightly toward fire (forward and down)
    this.headGroup.rotation.set(0, 0, 0);
    this.neckGroup.rotation.set(-0.2, 0, 0);
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
      position: this.position.clone(),
      jumpHeightFeet: heightFeet,
      peakHeightFeet: peakFeet,
      isAirborne: !this.grounded && !this.grinding && this.airTime > 0.1,
      grinding: this.grinding,
      wasGrinding: this.wasGrinding,
      boardslideType: this.boardslideType,
      grindTime: this.grindTime,
      frontswapCount: this.frontswapCount,
      isCork: this.isCorkingThisJump,
      flexMultiplier: this.flexMultiplier,
      landingQuality: this.landingQuality,
      landedOnRail: this.landedOnRail,
    };
  }
}
