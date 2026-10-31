import * as THREE from 'three';
import { Player } from './Player.js';
import { createBoardTexture, createJacketLogo } from './BoardGraphics.js';

export class RemotePlayer {
  constructor(scene, uid, nickname, cosmetics) {
    this.scene = scene;
    this.uid = uid;
    this.nickname = nickname;

    // Create visual-only player model
    this.player = new Player(scene, cosmetics.equipType || 'snowboard');
    this.player.stance = cosmetics.stance || 'regular';
    this.player.updateStanceYaw();
    this.applyCosmetics(cosmetics);

    // Interpolation state
    this.targetPos = new THREE.Vector3(0, 5, 0);
    this.currentPos = new THREE.Vector3(0, 5, 0);
    this.targetHeading = Math.PI;
    this.currentHeading = Math.PI;
    this.targetTrickRot = new THREE.Vector3();
    this.currentTrickRot = new THREE.Vector3();

    // Animation state from network
    this.grounded = true;
    this.grinding = false;
    this.isGrabbing = false;
    this.grabType = null;
    this.isSwitch = false;
    this.crashed = false;
    this.tomahawking = false;
    this.edgeLean = 0;
    this.isTucking = false;
    this.boardslideType = null;
    this.boardslideAngle = 0;
    this.trickName = null;

    // Nickname label (HTML overlay)
    this.nicknameDiv = null;
    this.trickDiv = null;
    this.createNicknameOverlay();

    // Timing
    this.lastUpdateTime = 0;
    this.interpolationSpeed = 12;
    this.staleTimeout = 5000;
    this._hasExploded = false;
    this._tomahawkAngle = 0;
    this._lastTrick = null;
    this._trickShowTime = 0;
  }

  applyCosmetics(cosmetics) {
    const p = this.player;

    if (cosmetics.jacketColor != null) p.setColor('jacket', cosmetics.jacketColor);
    if (cosmetics.pantsColor != null) p.setColor('pants', cosmetics.pantsColor);
    if (cosmetics.helmetColor != null) p.setColor('helmet', cosmetics.helmetColor);
    if (cosmetics.boardColor != null) p.setColor('board', cosmetics.boardColor);

    // Jacket: logo + legendary
    if (cosmetics.jacketBrand) {
      p.applyJacketLogo(createJacketLogo(cosmetics.jacketBrand, cosmetics.jacketColor));
    }
    if (cosmetics.jacketLegendary) p.setLegendaryMaterial('jacket', true);

    // Fit, then shop pants that are always baggy
    if (cosmetics.jacketFit) p.setFit('jacket', cosmetics.jacketFit);
    if (cosmetics.pantsFit) p.setFit('pants', cosmetics.pantsFit);
    if (cosmetics.pantsBaggy) p.setBaggyPants(true);
    if (cosmetics.pantsLegendary) p.setLegendaryMaterial('pants', true);

    // Helmet: halo
    if (cosmetics.helmetHalo) p.setHaloMode(true);

    // Board: texture + stats + binding
    if (cosmetics.boardItemId) {
      const tex = createBoardTexture(cosmetics.boardItemId, cosmetics.boardColor);
      p.applyBoardGraphic(tex);
    }
    if (cosmetics.boardStats) {
      p.applyBoardStats(cosmetics.boardStats.speed, cosmetics.boardStats.pop, cosmetics.boardStats.flex);
    }
    if (cosmetics.bindingColor != null) p.setBindingColor(cosmetics.bindingColor);
  }

  createNicknameOverlay() {
    this.nicknameDiv = document.createElement('div');
    this.nicknameDiv.className = 'remote-nickname';
    this.nicknameDiv.textContent = this.nickname;
    document.body.appendChild(this.nicknameDiv);

    this.trickDiv = document.createElement('div');
    this.trickDiv.className = 'remote-trick';
    document.body.appendChild(this.trickDiv);
  }

  receiveState(data) {
    this.targetPos.set(data.x, data.y, data.z);
    // Snap instead of gliding on the first update and after respawns
    if (this.lastUpdateTime === 0 || this.currentPos.distanceTo(this.targetPos) > 40) {
      this.currentPos.copy(this.targetPos);
      this.currentHeading = data.h;
    }
    this.targetHeading = data.h;
    this.targetTrickRot.set(data.tx || 0, data.ty || 0, data.tz || 0);
    this.grounded = !!data.g;
    this.grinding = !!data.gr;
    this.isGrabbing = !!data.gb;
    this.grabType = data.gt || null;
    this.isSwitch = !!data.sw;
    this.crashed = !!data.cr;
    this.tomahawking = !!data.tm;
    this.edgeLean = data.el || 0;
    this.isTucking = !!data.tk;
    this.boardslideType = data.bs || null;
    this.boardslideAngle = data.ba || 0;
    this.trickName = data.trick || null;
    this.lastUpdateTime = performance.now();
  }

  update(dt, camera) {
    const lerpSpeed = Math.min(this.interpolationSpeed * dt, 1.0);

    // Position interpolation
    this.currentPos.lerp(this.targetPos, lerpSpeed);
    this.player.group.position.copy(this.currentPos);

    // Heading interpolation (angle-wrap aware)
    let headingDiff = this.targetHeading - this.currentHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.currentHeading += headingDiff * lerpSpeed;
    this.player.group.rotation.y = this.currentHeading + Math.PI;

    // Trick rotation interpolation
    this.currentTrickRot.lerp(this.targetTrickRot, lerpSpeed);

    if (this.crashed) {
      // Show crash explosion
      if (!this._hasExploded) {
        this.player.explodeRider();
        this._hasExploded = true;
      }
      this.player.updateDebris(dt);
    } else if (this.tomahawking) {
      // Tomahawk tumble animation
      this._tomahawkAngle += (Math.PI * 3) * dt;
      this.player.group.rotation.x = -this._tomahawkAngle;
      this._hasExploded = false;
    } else {
      // Reset crash/tomahawk state
      if (this._hasExploded) {
        this.player.cleanupDebris();
        this.player.boardGroup.visible = true;
        this._hasExploded = false;
      }
      this._tomahawkAngle = 0;
      this.player.group.rotation.x = 0;

      if (this.grounded && !this.grinding) {
        this.applyGroundedPose(lerpSpeed);
      } else if (this.grinding) {
        this.applyGrindPose(lerpSpeed);
      } else {
        this.applyAirbornePose(lerpSpeed);
      }
    }

    // Nickname overlay position
    this.updateNicknamePosition(camera);
    this.updateTrickDisplay();

    // Hide if stale (no updates for 5s)
    const age = performance.now() - this.lastUpdateTime;
    this.player.group.visible = age < this.staleTimeout;
    this.nicknameDiv.style.display = age < this.staleTimeout ? '' : 'none';
  }

  applyGroundedPose(speed) {
    const p = this.player;
    const lean = this.edgeLean;

    // Board tilt from carving
    p.boardGroup.rotation.z = THREE.MathUtils.lerp(p.boardGroup.rotation.z, -lean * 0.7, speed);
    p.boardGroup.rotation.x = THREE.MathUtils.lerp(p.boardGroup.rotation.x, Math.abs(lean) * 0.15, speed);
    p.boardGroup.rotation.y = THREE.MathUtils.lerp(p.boardGroup.rotation.y, 0, speed);

    if (this.isTucking) {
      p.riderGroup.position.y = THREE.MathUtils.lerp(p.riderGroup.position.y, -0.15, speed);
      p.riderGroup.rotation.x = THREE.MathUtils.lerp(p.riderGroup.rotation.x, 0.3, speed);
      p.lerpJoint(p.hipL, 'x', -0.7, speed);
      p.lerpJoint(p.kneeL, 'x', 1.2, speed);
      p.lerpJoint(p.hipR, 'x', -0.7, speed);
      p.lerpJoint(p.kneeR, 'x', 1.2, speed);
    } else {
      p.riderGroup.position.y = THREE.MathUtils.lerp(p.riderGroup.position.y, 0, speed);
      p.riderGroup.rotation.x = THREE.MathUtils.lerp(p.riderGroup.rotation.x, 0, speed);
      p.lerpJoint(p.hipL, 'x', -0.3, speed);
      p.lerpJoint(p.kneeL, 'x', 0.6 + lean * 0.15, speed);
      p.lerpJoint(p.hipR, 'x', -0.3, speed);
      p.lerpJoint(p.kneeR, 'x', 0.6 - lean * 0.15, speed);
    }

    p.riderGroup.rotation.z = THREE.MathUtils.lerp(p.riderGroup.rotation.z, lean * 0.3, speed);
    p.riderGroup.rotation.y = THREE.MathUtils.lerp(p.riderGroup.rotation.y, p.STANCE_YAW, speed);
    p.resetJointsToRiding(speed);
  }

  applyGrindPose(speed) {
    const p = this.player;
    p.boardGroup.rotation.y = THREE.MathUtils.lerp(p.boardGroup.rotation.y, this.boardslideAngle, speed);
    p.boardGroup.rotation.x = THREE.MathUtils.lerp(p.boardGroup.rotation.x, 0, speed);
    p.boardGroup.rotation.z = THREE.MathUtils.lerp(p.boardGroup.rotation.z, 0, speed);
    p.riderGroup.rotation.y = THREE.MathUtils.lerp(p.riderGroup.rotation.y, p.STANCE_YAW, speed);
    p.lerpJoint(p.hipL, 'x', -0.4, speed);
    p.lerpJoint(p.kneeL, 'x', 0.8, speed);
    p.lerpJoint(p.hipR, 'x', -0.4, speed);
    p.lerpJoint(p.kneeR, 'x', 0.8, speed);
  }

  applyAirbornePose(speed) {
    const p = this.player;
    // Apply trick rotation to board group
    p.boardGroup.rotation.x = THREE.MathUtils.lerp(p.boardGroup.rotation.x, this.currentTrickRot.x, speed);
    p.boardGroup.rotation.y = THREE.MathUtils.lerp(p.boardGroup.rotation.y, this.currentTrickRot.y, speed);
    p.boardGroup.rotation.z = THREE.MathUtils.lerp(p.boardGroup.rotation.z, this.currentTrickRot.z, speed);

    if (this.isGrabbing) {
      // Simplified grab pose: knees tucked, one arm reaching down
      p.lerpJoint(p.hipL, 'x', -0.6, speed);
      p.lerpJoint(p.kneeL, 'x', 1.0, speed);
      p.lerpJoint(p.hipR, 'x', -0.6, speed);
      p.lerpJoint(p.kneeR, 'x', 1.0, speed);
      p.lerpJoint(p.shoulderR, 'x', 0.8, speed);
      p.lerpJoint(p.elbowR, 'x', -1.2, speed);
    } else {
      // Default air pose
      p.lerpJoint(p.hipL, 'x', -0.2, speed);
      p.lerpJoint(p.kneeL, 'x', 0.4, speed);
      p.lerpJoint(p.hipR, 'x', -0.2, speed);
      p.lerpJoint(p.kneeR, 'x', 0.4, speed);
      p.resetJointsToRiding(speed);
    }

    p.riderGroup.rotation.y = THREE.MathUtils.lerp(p.riderGroup.rotation.y, p.STANCE_YAW, speed);
  }

  updateNicknamePosition(camera) {
    const worldPos = this.currentPos.clone();
    worldPos.y += 2.2;
    const screenPos = worldPos.clone().project(camera);

    if (screenPos.z > 1) {
      this.nicknameDiv.style.display = 'none';
      this.trickDiv.style.display = 'none';
      return;
    }

    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

    this.nicknameDiv.style.display = '';
    this.nicknameDiv.style.left = x + 'px';
    this.nicknameDiv.style.top = y + 'px';

    this.trickDiv.style.left = x + 'px';
    this.trickDiv.style.top = (y + 20) + 'px';
  }

  updateTrickDisplay() {
    if (this.trickName && this.trickName !== this._lastTrick) {
      this._lastTrick = this.trickName;
      this._trickShowTime = performance.now();
      this.trickDiv.textContent = this.trickName;
      this.trickDiv.style.display = '';
    }
    if (this._trickShowTime && performance.now() - this._trickShowTime > 3000) {
      this.trickDiv.style.display = 'none';
    }
  }

  dispose() {
    this.scene.remove(this.player.group);
    this.player.cleanupDebris();
    if (this.nicknameDiv) this.nicknameDiv.remove();
    if (this.trickDiv) this.trickDiv.remove();
  }
}
