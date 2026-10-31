import { JUMP_POP_MUL } from './Player.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Deterministic pseudo-random number generator (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Top speed in the air (ground top speed before the 25% ground slowdown); see Player.baseMaxSpeed
const RIDER_TOP_AIR_SPEED = 36.11 * 1.2;

const PARK_CONFIGS = {
  'big-white': {
    name: 'BIG WHITE TELUS PARK',
    checkpointCount: 8, checkpointInterval: 600,
    railWidthScale: 1,
    railTypes: ['parkRail', 'parkRail', 'endKink'],
    zones: {
      1: {
        medium: { feet: 40 },
        small:  { feet: 30 },
        big:    { feet: 60 },
      },
      2: {
        medium: { feet: 100 },
        small:  { feet: 75,  lipHeight: 5.0,  lipAngle: 0.45 },
        big:    { feet: 150 },
      },
    },
    zoneThreshold: -2400,
    booterFeet: 200, booterPositions: [-3950, -4200],
    railsPerChunk: [6, 10],
    rollersPerChunk: 1,
  },
  'xgames': {
    name: 'X-GAMES PARK',
    checkpointCount: 6, checkpointInterval: 600,
    railWidthScale: 1,
    railTypes: ['kinkRail', 'downFlatDown', 'down', 'donkeyDick', 'waterfall', 'endKink'],
    zones: {
      1: {
        medium: { feet: 150 },
        small:  { feet: 125, lipHeight: 8.5,  lipAngle: 0.55 },
        big:    { feet: 200 },
      },
      2: {
        medium: { feet: 200 },
        small:  { feet: 150 },
        big:    { feet: 200 },
      },
    },
    zoneThreshold: -1800,
    booterFeet: 200, booterPositions: [-3000, -3250],
    railsPerChunk: [8, 12],
    rollersPerChunk: 1,
  },
  'slopestyle': {
    name: 'SLOPESTYLE COURSE',
    checkpointCount: 6, checkpointInterval: 600,
    railWidthScale: 1,
    railTypes: ['kinkRail', 'downFlatDown', 'flatDownFlat', 'waterfall', 'donkeyDick', 'endKink'],
    zones: {
      1: {
        medium: { feet: 60,  lipHeight: 4.0,  lipAngle: 0.55 },
        small:  { feet: 45,  lipHeight: 3.0,  lipAngle: 0.50 },
        big:    { feet: 80,  lipHeight: 5.5,  lipAngle: 0.60 },
      },
      2: {
        medium: { feet: 100 },
        small:  { feet: 75,  lipHeight: 5.0,  lipAngle: 0.55 },
        big:    { feet: 125, lipHeight: 8.5,  lipAngle: 0.65 },
      },
      3: {
        medium: { feet: 150 },
        small:  { feet: 125, lipHeight: 8.5,  lipAngle: 0.60 },
        big:    { feet: 200 },
      },
    },
    zoneThreshold: -1200,
    zone3Threshold: -2400,
    booterFeet: 250, booterPositions: [-3200, -3500],
    railsPerChunk: [4, 6],
    rollersPerChunk: 2,
    fixedLayout: true,
  },
};

export class Terrain {
  constructor(scene, seed = null, parkId = 'big-white', nightMode = false) {
    this.scene = scene;
    this.parkId = parkId;
    this.nightMode = nightMode;
    this.config = PARK_CONFIGS[parkId] || PARK_CONFIGS['big-white'];
    // Seeded RNG for deterministic terrain in multiplayer
    this.rng = seed != null ? mulberry32(seed) : null;
    this.chunks = [];
    this.chunkLength = 300;
    this.chunkWidth = 120;
    this.slopeAngle = 0.28;
    this.chunksGenerated = 0;
    this.obstacles = [];
    this.ramps = [];
    this.exclusionZones = []; // global across all chunks { x, zStart, zEnd, halfWidth }
    this.rollers = [];        // big snow rollers, part of the ground height (see getHeightAt)
    this.checkpoints = [];
    this.checkpointCount = this.config.checkpointCount;
    this.checkpointInterval = this.config.checkpointInterval;
    this.nextCheckpointZ = -300;

    // Materials — smooth, realistic snow
    this.snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeaf0f6, roughness: 0.75, metalness: 0.02,
    });

    this.treeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a1a, roughness: 1.0, flatShading: true,
    });

    this.darkTreeMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f2a0f, roughness: 1.0, flatShading: true,
    });

    this.trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f, roughness: 1.0,
    });

    this.rampMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8ddef, roughness: 0.3, metalness: 0.05, flatShading: true,
    });

    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6672, roughness: 0.95, flatShading: true,
    });

    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc, metalness: 0.9, roughness: 0.1,
    });

    this.rustyMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x998877, metalness: 0.7, roughness: 0.3,
    });

    this.paintedMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x2266cc, metalness: 0.6, roughness: 0.2,
    });

    this.poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600, roughness: 0.6,
    });

    // Floodlight materials (used day and night, but lights only active at night)
    this.floodlightPoleMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555, roughness: 0.7, metalness: 0.3,
    });
    this.floodlightHeadMaterial = new THREE.MeshStandardMaterial({
      color: nightMode ? 0xffeedd : 0x888888,
      emissive: nightMode ? 0xffeedd : 0x000000,
      emissiveIntensity: nightMode ? 1.0 : 0,
      roughness: 0.3, metalness: 0.5,
    });

    // Night mode: slight blue tint on snow
    if (nightMode) {
      this.snowMaterial.color.set(0xc0ccdd);
      this.rampMaterial.color.set(0xb0c0d8);
    }

    for (let i = 0; i < 5; i++) {
      this.generateChunk();
    }
  }

  // Deterministic random when seeded, otherwise Math.random
  rand() {
    return this.rng ? this.rng() : Math.random();
  }

  generateChunk() {
    const zOffset = -this.chunksGenerated * this.chunkLength;
    const yOffset = -this.chunksGenerated * this.chunkLength * this.slopeAngle;

    // Coarse grid keeps it cheap on Chromebooks; physics samples computeHeight directly
    const geometry = new THREE.PlaneGeometry(this.chunkWidth, this.chunkLength, 48, 96);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const globalZ = zOffset + z;

      // Use global coordinates for continuous terrain across chunks
      const globalHeight = this.computeHeight(x, globalZ);
      positions.setY(i, globalHeight - yOffset);

      // Subtle snow color variation — whites and light blues
      const normalizedX = Math.abs(x) / (this.chunkWidth / 2);
      const base = 0.92 + Math.sin(x * 0.1 + globalZ * 0.05) * 0.04;
      const blueShift = normalizedX > 0.5 ? 0.02 : 0;
      colors[i * 3] = base - blueShift;
      colors[i * 3 + 1] = base + 0.01;
      colors[i * 3 + 2] = base + blueShift * 2 + 0.02;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = this.snowMaterial.clone();
    material.vertexColors = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, yOffset, zOffset);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const chunkId = this.chunksGenerated;
    const chunk = { mesh, zOffset, yOffset, objects: [], chunkId };

    // Exclusion zones — global, persists across chunks

    // Features: jumps and rails
    // Determine zone level for this chunk
    const chunkMidZ = zOffset - this.chunkLength / 2;
    const zoneLevel = this.getZoneLevel(chunkMidZ);

    // --- Slopestyle fixed layout: section-based feature placement ---
    // Rail sections get only rails (no jumps), jump sections get only jumps
    const isFixedLayout = this.config.fixedLayout;
    let fixedSection = null; // 'rails' | 'jumps'
    if (isFixedLayout) {
      // 0 to -600: rails, -600 to -1200: jumps, -1200 to -1800: rails,
      // -1800 to -2400: jumps, -2400 to -3000: jumps (big), -3000+: booters
      const absZ = Math.abs(chunkMidZ);
      if (absZ < 600) fixedSection = 'rails';
      else if (absZ < 1200) fixedSection = 'jumps';
      else if (absZ < 1800) fixedSection = 'rails';
      else fixedSection = 'jumps';
    }

    // --- Phase 1: Jump pairs (left = medium, right = small/big) ---
    // Zone 2 jumps are much bigger (~167 unit footprint for 150ft) —
    // use a single slot per chunk so they don't overlap with landings
    const jumpSlots = (isFixedLayout && fixedSection === 'rails') ? [] : [-150];
    const zoneConfig = this.config.zones[zoneLevel];
    const jumpDefs = {
      medium: { ...zoneConfig.medium, size: 'medium' },
      small:  { ...zoneConfig.small,  size: 'small' },
      big:    { ...zoneConfig.big,    size: 'big' },
    };

    for (const slotZ of jumpSlots) {
      const featureGlobalZ = zOffset + slotZ;
      // Stop regular jumps before the massive booter zone
      const booterStopZ = this.config.booterPositions[0] + 50;
      if (featureGlobalZ <= booterStopZ) continue;
      // Past zone threshold → right jump is big, otherwise small
      const pastCP4 = featureGlobalZ <= this.config.zoneThreshold;
      const pair = [
        { def: jumpDefs.medium, x: -12 },  // left = always medium
        { def: pastCP4 ? jumpDefs.big : jumpDefs.small, x: 12 }, // right = small or big
      ];

      for (const { def, x } of pair) {
        this.placeJump(def.feet, def.size, x, featureGlobalZ, chunk);
      }
    }

    // --- FINAL BOOTERS: massive jumps back to back before finish line ---
    for (const booterGlobalZ of this.config.booterPositions) {
      if (booterGlobalZ < zOffset - this.chunkLength || booterGlobalZ >= zOffset) continue;
      this.placeJump(this.config.booterFeet, 'massive', 0, booterGlobalZ, chunk);
    }

    // --- Phase 1.5: Big rollers with an up rail onto the deck and a down rail off it ---
    const skipRollers = isFixedLayout && fixedSection === 'jumps';
    const rollerTarget = skipRollers ? 0 : (this.config.rollersPerChunk || 0);
    let placedRollers = 0;
    for (let attempt = 0; attempt < rollerTarget * 6 && placedRollers < rollerTarget; attempt++) {
      const roller = this.createRollerData(chunkId);
      const cx = (this.rand() - 0.5) * 24;
      const zTop = zOffset - 30 - this.rand() * (this.chunkLength - 60 - roller.footprint);
      roller.x = cx;
      roller.zTop = zTop;
      const extentTop = zTop + roller.approach;
      const extentBottom = zTop - roller.len - roller.runout;
      const halfW = roller.width / 2 + roller.side + 2;
      let blocked = false;
      for (const zone of this.exclusionZones) {
        if (extentBottom <= zone.zEnd && extentTop >= zone.zStart &&
            Math.abs(cx - zone.x) < zone.halfWidth + halfW) { blocked = true; break; }
      }
      if (blocked) continue;
      this.rollers.push(roller);
      this.exclusionZones.push({ x: cx, zStart: extentBottom - 6, zEnd: extentTop + 6, halfWidth: halfW + 4 });
      this.addRollerRails(roller, chunk);
      placedRollers++;
    }
    if (placedRollers > 0) {
      // Raise the snow mesh over the new rollers
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const globalZ = zOffset + positions.getZ(i);
        positions.setY(i, this.getHeightAt(x, globalZ) - yOffset);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    // --- Phase 2: Park rails with entry lips ---
    // Skip rails in slopestyle jump sections
    const skipRails = isFixedLayout && fixedSection === 'jumps';
    // Helper: check if a position overlaps any exclusion zone (jumps + landings)
    const isInExclusionZone = (ox, oz, halfLen = 0) => {
      for (const zone of this.exclusionZones) {
        if (oz + halfLen >= zone.zStart && oz - halfLen <= zone.zEnd &&
            Math.abs(ox - zone.x) < zone.halfWidth) {
          return true;
        }
      }
      return false;
    };

    const [minRails, maxRails] = this.config.railsPerChunk;
    const targetRails = skipRails ? 0 : minRails + Math.floor(this.rand() * (maxRails - minRails + 1));
    let placedRails = 0;
    const maxAttempts = targetRails * 4; // retry to fill gaps between jumps
    for (let attempt = 0; attempt < maxAttempts && placedRails < targetRails; attempt++) {
      const x = zoneLevel === 2
        ? (this.rand() - 0.5) * 45
        : (this.rand() - 0.5) * 35;
      const z = -20 - this.rand() * (this.chunkLength - 40);

      // Rail dimensions by zone
      let railLength, railHeight, lipHeight;
      if (zoneLevel === 2) {
        railLength = 35 + this.rand() * 10; // 35-45 units
        railHeight = 0.9;
        lipHeight = 0.5;
      } else {
        railLength = 30 + this.rand() * 10; // 30-40 units
        railHeight = 0.7;
        lipHeight = 0.4;
      }

      // Skip if rail overlaps a jump or landing zone
      const featureGlobalZCheck = zOffset + z;
      if (isInExclusionZone(x, featureGlobalZCheck, railLength / 2)) continue;

      const feature = this.createRailByType(railLength, railHeight);
      const width = 4.0;
      const length = railLength;
      // Use actual rail height from geometry (each type sets its own)
      const surfaceHeight = feature.userData.surfaceHeight || railHeight;
      const startHeight = feature.userData.startHeight;
      const endHeight = feature.userData.endHeight;

      // Compute terrain slope at rail endpoints to tilt rail
      const featureGlobalZ = zOffset + z;
      const upY = this.computeHeight(x, featureGlobalZ + railLength / 2);
      const downY = this.computeHeight(x, featureGlobalZ - railLength / 2);
      const midY = (upY + downY) / 2;
      const tiltAngle = Math.atan2(upY - downY, railLength);

      feature.position.set(x, midY, featureGlobalZ);
      feature.rotation.x = -tiltAngle; // match slope angle
      this.scene.add(feature);
      chunk.objects.push(feature);
      const rampData = {
        mesh: feature,
        position: new THREE.Vector3(x, midY, featureGlobalZ),
        type: 'rail', width, length, surfaceHeight,
        lipHeight: 0, lipAngle: 0, chunkId,
      };
      // Variable-height rails store start/end for grind interpolation
      if (startHeight !== undefined && endHeight !== undefined) {
        rampData.startHeight = startHeight;
        rampData.endHeight = endHeight;
      }
      if (feature.userData.profile) rampData.profile = feature.userData.profile;
      if (feature.userData.kickAngle) rampData.kickAngle = feature.userData.kickAngle;
      this.ramps.push(rampData);

      // Register gap-on kicker for collision
      if (feature.userData.lip) {
        const lip = feature.userData.lip;
        const lipWorldZ = featureGlobalZ + lip.zOffset;
        const lipTerrainY = this.computeHeight(x, lipWorldZ);
        this.ramps.push({
          mesh: feature,
          position: new THREE.Vector3(x, lipTerrainY, lipWorldZ),
          type: 'kicker',
          width: lip.width,
          length: lip.length,
          lipHeight: lip.height,
          lipAngle: 0.35,
          railLip: true, railClear: lip.railHeight - lip.height,
          surfaceHeight: 0, chunkId,
        });
      }

      // Exclusion zone: rail + lip + buffer
      const lipExtra = feature.userData.lip ? feature.userData.lip.length + 1.5 : 0;
      const buffer = 6;
      this.exclusionZones.push({
        x, zStart: featureGlobalZ - railLength / 2 - buffer,
        zEnd: featureGlobalZ + railLength / 2 + lipExtra + buffer,
        // Wide sideways so rails are staggered down the run instead of side by side
        halfWidth: width / 2 + 16,
      });
      placedRails++;
    }

    // --- Phase 3: Scenery (placed AFTER features to avoid exclusion zones) ---

    // Standard park scenery: trees and rocks
    const treeCount = 25 + Math.floor(this.rand() * 15);
    for (let i = 0; i < treeCount; i++) {
      const side = this.rand() > 0.5 ? 1 : -1;
      const edgeBias = this.rand() < 0.7;
      const x = edgeBias
        ? side * (28 + this.rand() * 25)
        : (this.rand() - 0.5) * 50;
      const z = (this.rand() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);
      if (Math.abs(x) < 8) continue;
      if (isInExclusionZone(x, globalZ)) continue;

      const tree = this.createPineTree();
      tree.position.set(x, y, globalZ);
      this.scene.add(tree);
      chunk.objects.push(tree);
      this.obstacles.push({
        position: new THREE.Vector3(x, y, globalZ),
        radius: 1.2, type: 'tree', chunkId,
      });
    }

    const rockCount = 3 + Math.floor(this.rand() * 4);
    for (let i = 0; i < rockCount; i++) {
      const x = (this.rand() - 0.5) * 50;
      const z = (this.rand() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);
      if (Math.abs(x) < 6) continue;
      if (isInExclusionZone(x, globalZ)) continue;

      const rock = this.createRock();
      rock.position.set(x, y, globalZ);
      this.scene.add(rock);
      chunk.objects.push(rock);
      this.obstacles.push({
        position: new THREE.Vector3(x, y, globalZ),
        radius: 2.0, type: 'rock', chunkId,
      });
    }

    // Floodlights along the run (always placed, but only lit at night)
    const floodCount = 2 + (this.rand() > 0.5 ? 1 : 0);
    for (let i = 0; i < floodCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (22 + this.rand() * 4);
      const z = -this.chunkLength * (i / floodCount) + (this.rand() - 0.5) * 30;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);
      const light = this.createFloodlight(side);
      light.position.set(x, y, globalZ);
      this.scene.add(light);
      chunk.objects.push(light);
      this.obstacles.push({
        position: new THREE.Vector3(x, y, globalZ),
        radius: 0.5, type: 'tree', chunkId,
      });
    }

    // Checkpoints
    while (this.nextCheckpointZ > zOffset - this.chunkLength) {
      const cpZ = this.nextCheckpointZ;
      const cpY = this.computeHeight(0, cpZ);
      const cpNumber = this.checkpoints.length + 1;
      const isFinish = cpNumber === this.config.checkpointCount;
      const checkpoint = isFinish ? this.createFinishLine() : this.createCheckpoint();
      checkpoint.position.set(0, cpY, cpZ);
      this.scene.add(checkpoint);
      chunk.objects.push(checkpoint);
      this.checkpoints.push({
        position: new THREE.Vector3(0, cpY + 2, cpZ),
        z: cpZ, reached: false, mesh: checkpoint, isFinish,
      });
      this.nextCheckpointZ -= this.checkpointInterval;
    }

    this.chunks.push(chunk);
    this.chunksGenerated++;
  }

  computeHeight(x, globalZ) {
    let height = 0;
    height += Math.sin(x * 0.04 + globalZ * 0.006) * 0.8;
    height += Math.sin(globalZ * 0.02 + x * 0.03) * 0.5;
    height += Math.sin(x * 0.08 + globalZ * 0.015) * 0.25;
    height += globalZ * this.slopeAngle;
    const normalizedX = Math.abs(x) / (this.chunkWidth / 2);
    if (normalizedX > 0.5) {
      height += Math.pow((normalizedX - 0.5) / 0.5, 2.0) * 16;
    }
    return height;
  }

  getZoneLevel(globalZ) {
    if (this.config.zone3Threshold && globalZ <= this.config.zone3Threshold) return 3;
    return globalZ <= this.config.zoneThreshold ? 2 : 1;
  }

  // --- JUMPS (sized by "feet" — 30, 40, 50, 60, 75, 100, 125, 150) ---

  // A table-top kicker built from one profile that both the mesh and the physics use:
  // circular transition up to the lip -> flat deck (the gap) -> rounded knuckle -> landing -> hill.
  // Heights are measured from the hill plane; d is the distance downhill from where the transition starts.
  designJump(feet, size) {
    const lipAngles = { small: 0.55, medium: 0.62, big: 0.68, massive: 0.72 };
    // Speed you hit each jump at, as a share of top speed (riders barely need to scrub)
    const speedShare = { small: 0.82, medium: 0.86, big: 0.9, massive: 0.94 };
    const lipAngle = lipAngles[size] || 0.52;      // takeoff angle relative to the hill
    const lipHeight = 2.5 + feet * 0.04;           // 30ft -> 3.7m, 150ft -> 8.5m
    const designSpeed = RIDER_TOP_AIR_SPEED * (speedShare[size] || 0.86);
    // Gap is sized so a full pop at the design speed lands in the sweet spot
    let lo = 5, hi = 200, j = null;
    for (let i = 0; i < 25; i++) {
      j = this._buildJump(feet, size, lipAngle, lipHeight, (lo + hi) / 2);
      if (this._popLandingAt(j, designSpeed) > j.sweetSpot) lo = j.deckLen; else hi = j.deckLen;
    }
    j.designSpeed = designSpeed;
    return j;
  }

  _buildJump(feet, size, lipAngle, lipHeight, deckLen) {
    const radius = lipHeight / (1 - Math.cos(lipAngle));
    const transLen = radius * Math.sin(lipAngle);
    const deckHeight = lipHeight * 0.9;
    const knuckleLen = 3;
    const landSlope = Math.tan(0.14);              // landing is ~8 deg steeper than the hill (~24 deg)
    const knuckleDrop = landSlope * knuckleLen / 2;
    const landStart = transLen + deckLen + knuckleLen;
    const landEnd = landStart + (deckHeight - knuckleDrop) / landSlope;
    // Wide park kickers: each of a side-by-side pair covers about half the run
    const width = size === 'massive' ? 34 : 20;
    return {
      feet, size, lipAngle, lipHeight, radius, transLen, deckHeight, deckLen, knuckleLen,
      landSlope, knuckleDrop, landStart, landEnd, total: landEnd + 1,
      width, landingWidth: width + 4,
      sweetSpot: landStart + (landEnd - landStart) * 0.4, // 40% of the way down the landing
    };
  }

  // Height above the hill plane at distance d along the jump
  jumpRel(j, d) {
    if (d <= 0) return 0;
    if (d <= j.transLen) return j.radius - Math.sqrt(j.radius * j.radius - d * d);
    if (d <= j.transLen + 1) return j.lipHeight + (j.deckHeight - j.lipHeight) * (d - j.transLen);
    const kStart = j.transLen + j.deckLen;
    if (d <= kStart) return j.deckHeight;
    if (d <= j.landStart) {
      const u = d - kStart;
      return j.deckHeight - j.landSlope * u * u / (2 * j.knuckleLen);
    }
    return Math.max(0, j.deckHeight - j.knuckleDrop - j.landSlope * (d - j.landStart));
  }

  // Which part of the jump d is on: 'kicker' | 'deck' | 'knuckle' | 'landing' | null
  jumpPart(j, d) {
    if (d < 0 || d > j.landEnd) return null;
    if (d <= j.transLen) return 'kicker';
    if (d <= j.transLen + j.deckLen) return 'deck';
    if (d <= j.landStart) return 'knuckle';
    return 'landing';
  }

  // Where a full pop at speed s first touches the jump (distance from the transition start)
  _popLandingAt(j, s) {
    const a = j.lipAngle - Math.atan(this.slopeAngle);
    const pop = 5 * JUMP_POP_MUL; // full ollie on the lip
    const g = 25;
    const vx = s * Math.cos(a);
    let vy = s * Math.sin(a) + pop;
    let d = j.transLen, y = j.lipHeight; // y is height above the hill plane
    const dt = 1 / 120;
    for (let i = 0; i < 2400; i++) {
      d += vx * dt;
      y += (vy + this.slopeAngle * vx) * dt;
      vy -= g * dt;
      if (d > j.transLen + 1 && y <= this.jumpRel(j, d)) return d;
    }
    return d;
  }

  // Build, place and register a jump with its uphill transition start at zStart
  placeJump(feet, size, x, zCenter, chunk) {
    const j = this.designJump(feet, size);
    const zStart = zCenter + j.transLen / 2;
    // Hill plane through the lowest snow under the jump, so it never floats above a dip
    let y0 = Infinity;
    for (let d = 0; d <= j.total; d += 2) {
      for (const sx of [-j.width / 2, 0, j.width / 2]) {
        y0 = Math.min(y0, this.computeHeight(x + sx, zStart - d) + this.slopeAngle * d);
      }
    }
    Object.assign(j, { x, zStart, y0 });

    const group = this.createJumpMesh(j);
    group.position.set(x, y0, zStart);
    this.scene.add(group);
    chunk.objects.push(group);

    this.ramps.push({
      mesh: group,
      position: new THREE.Vector3(x, y0, zStart - j.transLen / 2),
      type: 'kicker', width: j.width, length: j.transLen, size,
      lipHeight: j.lipHeight, lipAngle: j.lipAngle, surfaceHeight: 0,
      jump: j, chunkId: chunk.chunkId,
    });
    const buffer = 6;
    this.exclusionZones.push({
      x, zStart: zStart - j.total - buffer, zEnd: zStart + 40, // keep the in-run clear
      halfWidth: j.landingWidth / 2 + buffer,
    });
  }

  // World-space snow height of the jump at (x, z), or null when off it
  jumpSurfaceAt(ramp, x, z) {
    const j = ramp.jump;
    const d = j.zStart - z;
    if (d < 0 || d > j.total) return null;
    const halfW = this._jumpHalfWidth(j, d);
    if (Math.abs(x - j.x) > halfW) return null;
    return j.y0 - this.slopeAngle * d + this.jumpRel(j, d);
  }

  _jumpHalfWidth(j, d) {
    if (d <= j.transLen) return j.width / 2;
    const k = Math.min(1, (d - j.transLen) / Math.max(1, j.deckLen));
    return (j.width + (j.landingWidth - j.width) * k) / 2;
  }

  createJumpMesh(j) {
    const group = new THREE.Group();
    // Sample densely on the transition and knuckle, coarser on the deck and landing
    const ds = [];
    for (let d = 0; d < j.transLen; d += 0.4) ds.push(d);
    for (let d = j.transLen; d < j.transLen + 1; d += 0.25) ds.push(d);
    for (let d = j.transLen + 1; d < j.transLen + j.deckLen; d += 2) ds.push(d);
    for (let d = j.transLen + j.deckLen; d < j.landStart; d += 0.3) ds.push(d);
    for (let d = j.landStart; d < j.total; d += 1) ds.push(d);
    ds.push(j.total);

    const depth = 6;
    const pos = [];
    const idx = [];
    // Per sample: 0 left-bottom, 1 left-top, 2 right-top, 3 right-bottom
    for (const d of ds) {
      const hw = this._jumpHalfWidth(j, d);
      const y = -this.slopeAngle * d + this.jumpRel(j, d);
      pos.push(-hw, y - depth, -d, -hw, y, -d, hw, y, -d, hw, y - depth, -d);
    }
    for (let i = 0; i < ds.length - 1; i++) {
      const a = i * 4, b = (i + 1) * 4;
      idx.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2); // top
      idx.push(a, b, b + 1, a, b + 1, a + 1);             // left side
      idx.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3); // right side
    }
    // Back face of the kicker start and the end
    idx.push(0, 1, 2, 0, 2, 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.rampMaterial);
    mesh.material.side = THREE.DoubleSide;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Marker poles at the lip and the knuckle
    for (const [d, side] of [[j.transLen, 1], [j.landStart - j.knuckleLen, -1]]) {
      const h = 2.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), this.poleMaterial);
      pole.position.set(side * (this._jumpHalfWidth(j, d) + 0.6), -this.slopeAngle * d + this.jumpRel(j, d) + h / 2 - 0.5, -d);
      group.add(pole);
    }
    return group;
  }


  // --- RAIL TYPES ---

  // Helper: add a snow kicker for gap-on entry at the +Z (uphill) end of a rail
  // Based on real park gap-on: small kicker → 2-3ft gap → rail
  addRailEntryLip(group, railEndZ, entryHeight) {
    const lipHeight = Math.min(entryHeight * 0.65, 0.6);
    if (lipHeight < 0.1) return;
    const lipLen = lipHeight * 3;   // gentle approach slope
    const lipW = 5.0;               // wide enough to hit easily
    const gap = 0.8;                // ~2.5ft gap-on

    // Triangle kicker: slope up from approach (+Z) to peak near rail
    const lipShape = new THREE.Shape();
    lipShape.moveTo(0, 0);
    lipShape.lineTo(lipLen, 0);
    lipShape.lineTo(lipLen, lipHeight);
    lipShape.closePath();

    const geo = new THREE.ExtrudeGeometry(lipShape, { depth: lipW, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-lipW / 2, 0, 0);
    const lip = new THREE.Mesh(geo, this.rampMaterial);
    lip.position.z = railEndZ + gap + lipLen;
    lip.castShadow = true;
    group.add(lip);

    // Store lip metadata for collision registration
    group.userData.lip = {
      zOffset: railEndZ + gap + lipLen / 2,
      width: lipW,
      length: lipLen,
      height: lipHeight,
      railHeight: entryHeight,
    };
  }

  createFlatRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 8 * lengthScale;
    const railHeight = 0.7;

    // Posts (scale count with length)
    const postCount = Math.max(3, Math.round(2 * lengthScale) + 1);
    for (let i = 0; i < postCount; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(0, railHeight / 2, -railLength / 2 + i * (railLength / (postCount - 1)));
      post.castShadow = false;
      group.add(post);
    }

    // Round rail
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, railLength, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = railHeight;
    rail.castShadow = true;
    group.add(rail);

    this.addRailEntryLip(group, railLength / 2, railHeight);
    group.userData.surfaceHeight = railHeight;
    return group;
  }

  createDownRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 10 * lengthScale;
    const startHeight = 1.2;
    const endHeight = 0.5;

    // Posts at varying heights (scale count with length)
    const postCount = Math.max(4, Math.round(3 * lengthScale) + 1);
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const h = THREE.MathUtils.lerp(endHeight, startHeight, t);
      const z = -railLength / 2 + i * (railLength / (postCount - 1));
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, h, 6),
        this.rockMaterial
      );
      post.position.set(0, h / 2, z);
      post.castShadow = false;
      group.add(post);
    }

    // Angled rail
    const midY = (startHeight + endHeight) / 2;
    const angle = Math.atan2(startHeight - endHeight, railLength);
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, railLength * 1.05, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2 - angle;
    rail.position.set(0, midY, 0);
    rail.castShadow = true;
    group.add(rail);

    this.addRailEntryLip(group, railLength / 2, startHeight);
    group.userData.surfaceHeight = startHeight;
    group.userData.startHeight = startHeight;
    group.userData.endHeight = endHeight;
    return group;
  }

  createRainbowRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const segments = Math.round(16 * lengthScale);
    const railLength = 10 * lengthScale;
    const peakHeight = 1.2;

    // Create curved rail using segments
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      const z1 = -railLength / 2 + t1 * railLength;
      const z2 = -railLength / 2 + t2 * railLength;
      const y1 = Math.sin(t1 * Math.PI) * peakHeight + 0.3;
      const y2 = Math.sin(t2 * Math.PI) * peakHeight + 0.3;

      const segLen = Math.sqrt((z2 - z1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, z2 - z1);

      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, segLen, 6),
        this.paintedMetalMaterial
      );
      seg.rotation.x = Math.PI / 2 - angle;
      seg.position.set(0, (y1 + y2) / 2, (z1 + z2) / 2);
      group.add(seg);
    }

    // Support posts
    for (const t of [0.15, 0.5, 0.85]) {
      const z = -railLength / 2 + t * railLength;
      const y = Math.sin(t * Math.PI) * peakHeight + 0.3;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, y, 6),
        this.rockMaterial
      );
      post.position.set(0, y / 2, z);
      group.add(post);
    }

    // Entry lip at +Z end (rainbow ends are low at 0.3)
    this.addRailEntryLip(group, railLength / 2, 0.3);
    group.userData.surfaceHeight = peakHeight + 0.3; // peak of the arc
    group.userData.startHeight = 0.3;
    group.userData.endHeight = 0.3;
    return group;
  }

  createFlatDownFlatRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const totalLength = 12 * lengthScale;
    const flatLen = 3 * lengthScale;
    const railHeight = 0.9;
    const dropHeight = 0.35;

    // First flat section (high, uphill +Z)
    const flat1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flatLen, 8),
      this.metalMaterial
    );
    flat1.rotation.x = Math.PI / 2;
    flat1.position.set(0, railHeight, totalLength / 2 - flatLen / 2);
    flat1.castShadow = true;
    group.add(flat1);

    // Down section (drops from +Z to -Z)
    const downLen = totalLength - flatLen * 2;
    const downAngle = Math.atan2(dropHeight, downLen);
    const downActual = Math.sqrt(downLen ** 2 + dropHeight ** 2);
    const down = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, downActual, 8),
      this.rustyMetalMaterial
    );
    down.rotation.x = Math.PI / 2 - downAngle;
    down.position.set(0, railHeight - dropHeight / 2, 0);
    down.castShadow = true;
    group.add(down);

    // Second flat section (low, downhill -Z)
    const flat2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flatLen, 8),
      this.metalMaterial
    );
    flat2.rotation.x = Math.PI / 2;
    flat2.position.set(0, railHeight - dropHeight, -totalLength / 2 + flatLen / 2);
    flat2.castShadow = true;
    group.add(flat2);

    // Posts (high at +Z, low at -Z)
    for (const z of [-totalLength / 2, -flatLen / 2, flatLen / 2, totalLength / 2]) {
      const h = z > 0 ? railHeight : railHeight - dropHeight;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, Math.max(h, 0.3), 6),
        this.rockMaterial
      );
      post.position.set(0, Math.max(h, 0.3) / 2, z);
      group.add(post);
    }

    this.addRailEntryLip(group, totalLength / 2, railHeight);
    group.userData.surfaceHeight = railHeight;
    group.userData.startHeight = railHeight;
    group.userData.endHeight = railHeight - dropHeight;
    return group;
  }

  createBox(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const boxLength = 8 * lengthScale;
    const boxWidth = 1.2 * widthScale;
    const boxHeight = 0.6;

    // Main box surface
    const boxGeo = new THREE.BoxGeometry(boxWidth, 0.12, boxLength);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x4488cc, roughness: 0.3, metalness: 0.1,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, boxHeight, 0);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    // Side panels
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, boxHeight, boxLength),
        this.rockMaterial
      );
      panel.position.set(side * boxWidth / 2, boxHeight / 2, 0);
      group.add(panel);
    }

    // Entry ramp
    const rampShape = new THREE.Shape();
    rampShape.moveTo(0, 0);
    rampShape.lineTo(2, 0);
    rampShape.lineTo(2, boxHeight);
    rampShape.lineTo(0, 0);
    const rampGeo = new THREE.ExtrudeGeometry(rampShape, { depth: boxWidth, bevelEnabled: false });
    rampGeo.rotateY(Math.PI / 2);
    rampGeo.translate(boxWidth / 2, 0, boxLength / 2);
    const rampMesh = new THREE.Mesh(rampGeo, this.rampMaterial);
    rampMesh.castShadow = true;
    group.add(rampMesh);

    this.addRailEntryLip(group, boxLength / 2, boxHeight);
    group.userData.surfaceHeight = boxHeight;
    return group;
  }

  createCRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railHeight = 0.8;
    const s = lengthScale;

    // C-shaped: forward, sideways, forward
    const segments = [
      { start: [0, 0, -5 * s], end: [0, 0, -1.5 * s] },
      { start: [0, 0, -1.5 * s], end: [2, 0, -1.5 * s] },
      { start: [2, 0, -1.5 * s], end: [2, 0, 5 * s] },
    ];

    for (const seg of segments) {
      const dx = seg.end[0] - seg.start[0];
      const dz = seg.end[2] - seg.start[2];
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, len, 8),
        this.paintedMetalMaterial
      );
      rail.rotation.x = Math.PI / 2;
      rail.rotation.y = angle;
      rail.position.set(
        (seg.start[0] + seg.end[0]) / 2,
        railHeight,
        (seg.start[2] + seg.end[2]) / 2
      );
      rail.castShadow = true;
      group.add(rail);
    }

    // Posts
    for (const pos of [[0, -5 * s], [0, -1.5 * s], [2, -1.5 * s], [2, 2 * s], [2, 5 * s]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(pos[0], railHeight / 2, pos[1]);
      group.add(post);
    }

    this.addRailEntryLip(group, 5 * s, railHeight);
    group.userData.surfaceHeight = railHeight;
    return group;
  }

  createKinkRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railHeight = 1.0;
    const kinkDrop = 0.3;
    const s = lengthScale;

    // Kink: flat (high at +Z), drop, flat (low at -Z)
    // Player enters from +Z (uphill) and rides toward -Z (downhill)

    // Flat 1 (high, uphill +Z)
    const flat1Len = 4 * s;
    const r1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flat1Len, 8),
      this.metalMaterial
    );
    r1.rotation.x = Math.PI / 2;
    r1.position.set(0, railHeight, 3 * s);
    r1.castShadow = true;
    group.add(r1);

    // Kink (drops from +Z to -Z)
    const kinkZLen = 2 * s;
    const kinkLen = Math.sqrt(kinkZLen ** 2 + kinkDrop ** 2);
    const kinkAngle = Math.atan2(kinkDrop, kinkZLen);
    const kink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, kinkLen, 8),
      this.rustyMetalMaterial
    );
    kink.rotation.x = Math.PI / 2 - kinkAngle;
    kink.position.set(0, railHeight - kinkDrop / 2, 0);
    kink.castShadow = true;
    group.add(kink);

    // Flat 2 (low, downhill -Z)
    const flat2Len = 4 * s;
    const r2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flat2Len, 8),
      this.metalMaterial
    );
    r2.rotation.x = Math.PI / 2;
    r2.position.set(0, railHeight - kinkDrop, -3 * s);
    r2.castShadow = true;
    group.add(r2);

    // Posts
    for (const z of [-5 * s, -1 * s, 1 * s, 5 * s]) {
      const h = z >= 1 * s ? railHeight : railHeight - kinkDrop;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, h, 6),
        this.rockMaterial
      );
      post.position.set(0, h / 2, z);
      group.add(post);
    }

    this.addRailEntryLip(group, 5 * s, railHeight);
    group.userData.surfaceHeight = railHeight;
    group.userData.startHeight = railHeight;
    group.userData.endHeight = railHeight - kinkDrop;
    return group;
  }

  // --- DOWN-FLAT-DOWN RAIL: starts high, drops, flat middle, drops again ---
  createDownFlatDownRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const totalLength = 14 * lengthScale;
    const startHeight = 1.3;
    const midHeight = 0.9;
    const endHeight = 0.4;
    const segLen = totalLength / 3;

    // Down section 1 (high end at +Z, drops toward center)
    const drop1Len = Math.sqrt(segLen ** 2 + (startHeight - midHeight) ** 2);
    const drop1Angle = Math.atan2(startHeight - midHeight, segLen);
    const d1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, drop1Len, 8),
      this.metalMaterial
    );
    d1.rotation.x = Math.PI / 2 - drop1Angle;
    d1.position.set(0, (startHeight + midHeight) / 2, segLen);
    d1.castShadow = true;
    group.add(d1);

    // Flat middle section
    const flat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, segLen, 8),
      this.rustyMetalMaterial
    );
    flat.rotation.x = Math.PI / 2;
    flat.position.set(0, midHeight, 0);
    flat.castShadow = true;
    group.add(flat);

    // Down section 2 (drops from center toward -Z low end)
    const drop2Len = Math.sqrt(segLen ** 2 + (midHeight - endHeight) ** 2);
    const drop2Angle = Math.atan2(midHeight - endHeight, segLen);
    const d2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, drop2Len, 8),
      this.metalMaterial
    );
    d2.rotation.x = Math.PI / 2 - drop2Angle;
    d2.position.set(0, (midHeight + endHeight) / 2, -segLen);
    d2.castShadow = true;
    group.add(d2);

    // Posts (high at +Z, low at -Z)
    const postPositions = [-totalLength / 2, -segLen / 2, segLen / 2, totalLength / 2];
    const postHeights = [endHeight, midHeight, midHeight, startHeight];
    for (let i = 0; i < postPositions.length; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, postHeights[i], 6),
        this.rockMaterial
      );
      post.position.set(0, postHeights[i] / 2, postPositions[i]);
      group.add(post);
    }

    this.addRailEntryLip(group, totalLength / 2, startHeight);
    group.userData.surfaceHeight = startHeight;
    group.userData.startHeight = startHeight;
    group.userData.endHeight = endHeight;
    return group;
  }

  // --- DONKEY DICK RAIL: tall thick cylindrical posts with rail on top ---
  createDonkeyDickRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 10 * lengthScale;
    const postHeight = 1.5;
    const postRadius = 0.08 * widthScale;

    // Thick cylindrical posts
    const postCount = Math.max(3, Math.round(2 * lengthScale) + 1);
    for (let i = 0; i < postCount; i++) {
      const z = -railLength / 2 + i * (railLength / (postCount - 1));
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(postRadius, postRadius * 1.1, postHeight, 12),
        this.rustyMetalMaterial
      );
      post.position.set(0, postHeight / 2, z);
      post.castShadow = false;
      group.add(post);

      // Rounded cap on each post
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(postRadius, 8, 6),
        this.metalMaterial
      );
      cap.position.set(0, postHeight, z);
      group.add(cap);
    }

    // Rail tube connecting tops of posts
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * widthScale, 0.08 * widthScale, railLength, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = postHeight;
    rail.castShadow = true;
    group.add(rail);

    this.addRailEntryLip(group, railLength / 2, postHeight);
    group.userData.surfaceHeight = postHeight;
    return group;
  }

  // --- WATERFALL RAIL: stepped descending flat segments like stairs ---
  createWaterfallRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const steps = 4;
    const stepLength = 2.5 * lengthScale;
    const stepDrop = 0.35;
    const startHeight = 1.4;
    const totalLength = steps * stepLength + (steps - 1) * 0.6;

    let currentZ = totalLength / 2;
    for (let i = 0; i < steps; i++) {
      const h = startHeight - i * stepDrop;

      // Flat step segment
      const step = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, stepLength, 8),
        this.paintedMetalMaterial
      );
      step.rotation.x = Math.PI / 2;
      step.position.set(0, h, currentZ - stepLength / 2);
      step.castShadow = false;
      group.add(step);

      // Posts for this step
      for (const pz of [currentZ, currentZ - stepLength]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, h, 6),
          this.rockMaterial
        );
        post.position.set(0, h / 2, pz);
        group.add(post);
      }

      // Connecting drop segment to next step
      if (i < steps - 1) {
        const nextH = h - stepDrop;
        const dropGap = 0.6;
        const dropLen = Math.sqrt(dropGap ** 2 + stepDrop ** 2);
        const dropAngle = Math.atan2(stepDrop, dropGap);
        const drop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, dropLen, 8),
          this.rustyMetalMaterial
        );
        drop.rotation.x = Math.PI / 2 + dropAngle;
        drop.position.set(0, (h + nextH) / 2, currentZ - stepLength - dropGap / 2);
        drop.castShadow = false;
        group.add(drop);

        currentZ -= stepLength + dropGap;
      }
    }

    this.addRailEntryLip(group, totalLength / 2, startHeight);
    const finalHeight = startHeight - (steps - 1) * stepDrop;
    group.userData.surfaceHeight = startHeight;
    group.userData.startHeight = startHeight;
    group.userData.endHeight = finalHeight;
    return group;
  }

  // --- END-KINK RAIL: long flat rail that kinks up at the end and kicks you off like a lip ---
  createEndKinkRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 10 * lengthScale;
    const railHeight = 0.8;
    const kinkRun = 2.2;
    const kickAngle = 0.55;
    const kinkRise = kinkRun * Math.tan(kickAngle);
    const flatLen = railLength - kinkRun;
    const kinkZ = -railLength / 2 + kinkRun; // where the kink starts (rider travels toward -Z)
    const r = 0.08 * widthScale;

    const flat = new THREE.Mesh(new THREE.CylinderGeometry(r, r, flatLen, 8), this.metalMaterial);
    flat.rotation.x = Math.PI / 2;
    flat.position.set(0, railHeight, kinkZ + flatLen / 2);
    flat.castShadow = true;
    group.add(flat);

    const kinkLen = Math.hypot(kinkRun, kinkRise);
    const kink = new THREE.Mesh(new THREE.CylinderGeometry(r, r, kinkLen + 0.05, 8), this.paintedMetalMaterial);
    kink.rotation.x = Math.PI / 2 + kickAngle;
    kink.position.set(0, railHeight + kinkRise / 2, kinkZ - kinkRun / 2);
    kink.castShadow = true;
    group.add(kink);

    const postZs = [];
    const flatPosts = Math.max(2, Math.round(flatLen / 8) + 1);
    for (let i = 0; i < flatPosts; i++) postZs.push([kinkZ + flatLen * (i / (flatPosts - 1)), railHeight]);
    postZs.push([-railLength / 2, railHeight + kinkRise]);
    for (const [z, h] of postZs) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), this.rockMaterial);
      post.position.set(0, h / 2, z);
      group.add(post);
    }

    this.addRailEntryLip(group, railLength / 2, railHeight);
    group.userData.surfaceHeight = railHeight;
    // Height along the rail: t=0 at the entry (+Z), t=1 at the exit (-Z)
    group.userData.profile = [[0, railHeight], [flatLen / railLength, railHeight], [1, railHeight + kinkRise]];
    group.userData.kickAngle = 0.32; // launch angle off the end (gentler than the kink looks)
    return group;
  }

  // --- RAIL TYPE DISPATCHER ---
  createRailByType(railLength, railHeight) {
    const railTypes = this.config.railTypes;
    const railTypeName = railTypes[Math.floor(this.rand() * railTypes.length)];
    const ws = this.config.railWidthScale;
    const ls = railLength / 10; // normalize to lengthScale

    switch (railTypeName) {
      case 'flat':        return this.createFlatRail(ls * 1.25, ws);
      case 'down':        return this.createDownRail(ls, ws);
      case 'rainbow':     return this.createRainbowRail(ls, ws);
      case 'flatDownFlat': return this.createFlatDownFlatRail(ls * 0.83, ws);
      case 'box':         return this.createBox(ls * 1.25, ws);
      case 'cRail':       return this.createCRail(ls, ws);
      case 'kinkRail':    return this.createKinkRail(ls, ws);
      case 'downFlatDown': return this.createDownFlatDownRail(ls * 0.71, ws);
      case 'donkeyDick':  return this.createDonkeyDickRail(ls, ws);
      case 'waterfall':   return this.createWaterfallRail(ls, ws);
      case 'endKink':     return this.createEndKinkRail(ls, ws);
      default:            return this.createParkRail(railLength, railHeight, 0);
    }
  }

  // --- PARK RAIL: flat tube rail with entry lips ---
  createParkRail(railLength, railHeight, lipHeight) {
    const group = new THREE.Group();
    const tubeRadius = 0.1;

    // Main rail tube
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeRadius, tubeRadius, railLength, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = railHeight;
    rail.castShadow = true;
    group.add(rail);

    // Support posts
    const postCount = Math.max(2, Math.round(railLength / 12) + 1);
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const z = -railLength / 2 + t * railLength;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(0, railHeight / 2, z);
      post.castShadow = false;
      group.add(post);
    }

    // Gap-on entry kicker at +Z (uphill) end
    this.addRailEntryLip(group, railLength / 2, railHeight);
    group.userData.surfaceHeight = railHeight;
    return group;
  }

  createPineTree() {
    const group = new THREE.Group();
    const scale = 0.7 + this.rand() * 0.8;
    const mat = this.rand() > 0.5 ? this.treeMaterial : this.darkTreeMaterial;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2.5 * scale, 5),
      this.trunkMaterial
    );
    trunk.position.y = 1.25 * scale;
    group.add(trunk);

    // Bake the cone layers into one mesh per material so each tree is 3 draw calls, not 9
    const cones = [];
    for (let i = 0; i < 5; i++) {
      const radius = (3.0 - i * 0.5) * scale;
      const height = (2.0 - i * 0.15) * scale;
      const g = new THREE.ConeGeometry(radius, height, 6);
      g.rotateY(this.rand() * Math.PI);
      g.translate(0, (2.5 + i * 1.3) * scale, 0);
      cones.push(g);
    }
    const foliage = new THREE.Mesh(mergeGeometries(cones), mat);
    foliage.castShadow = true;
    group.add(foliage);

    const caps = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry((2.2 - i * 0.5) * scale, 0.4 * scale, 6);
      g.translate(0, (3.2 + i * 1.3) * scale, 0);
      caps.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(caps), this.snowMaterial));
    cones.forEach((g) => g.dispose());
    caps.forEach((g) => g.dispose());

    return group;
  }

  // Resort-style floodlight pole for night skiing
  createFloodlight(side) {
    const group = new THREE.Group();

    // Tall pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 10, 6),
      this.floodlightPoleMaterial
    );
    pole.position.y = 5;
    pole.castShadow = false;
    group.add(pole);

    // Cross-arm angled toward the run
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.5, 4),
      this.floodlightPoleMaterial
    );
    arm.position.set(-side * 1.0, 9.5, 0);
    arm.rotation.z = side * 0.4; // angle inward toward run
    group.add(arm);

    // Light fixture head (2 fixtures per pole)
    for (let i = 0; i < 2; i++) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.25, 0.6),
        this.floodlightHeadMaterial
      );
      head.position.set(-side * (1.2 + i * 0.8), 9.6, 0);
      group.add(head);
    }

    // SpotLight pointing down toward the run (only at night)
    if (this.nightMode) {
      const spot = new THREE.SpotLight(0xfff4e8, 5.0, 55, Math.PI / 3, 0.4, 0.8);
      spot.position.set(-side * 1.5, 9.8, 0);
      spot.castShadow = false;
      const target = new THREE.Object3D();
      target.position.set(-side * 8, 0, 0); // aim toward center of run
      group.add(target);
      spot.target = target;
      group.add(spot);
    }

    return group;
  }

  createRock() {
    const group = new THREE.Group();
    const count = 1 + Math.floor(this.rand() * 3);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.DodecahedronGeometry(1.0 + this.rand() * 1.5, 1);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + (this.rand() - 0.5) * 0.4);
        pos.setY(j, pos.getY(j) * 0.5 + (this.rand() - 0.5) * 0.2);
        pos.setZ(j, pos.getZ(j) + (this.rand() - 0.5) * 0.4);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.rockMaterial);
      mesh.position.set((this.rand() - 0.5) * 2, 0, (this.rand() - 0.5) * 2);
      mesh.castShadow = true;
      group.add(mesh);
    }

    const snow = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.4),
      this.snowMaterial
    );
    snow.position.y = 0.5;
    group.add(snow);

    return group;
  }

  createCheckpoint() {
    const group = new THREE.Group();
    const poleHeight = 6;
    for (const side of [-12, 12]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, poleHeight, 6),
        this.poleMaterial
      );
      pole.position.set(side, poleHeight / 2, 0);
      group.add(pole);

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0xff6600, side: THREE.DoubleSide,
          emissive: 0xff4400, emissiveIntensity: 0.2,
        })
      );
      flag.position.set(side + (side > 0 ? -1 : 1) * 0.75, poleHeight - 0.5, 0);
      group.add(flag);
    }

    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 24, 4),
      new THREE.MeshStandardMaterial({
        color: 0x22cc66, emissive: 0x11aa44, emissiveIntensity: 0.5,
      })
    );
    line.rotation.z = Math.PI / 2;
    line.position.y = poleHeight;
    group.add(line);

    return group;
  }

  createFinishLine() {
    const group = new THREE.Group();
    const poleHeight = 8;
    const gateWidth = 30;

    // Finish line material — checkered black and white
    const finishMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
    });
    const finishMatDark = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: 0x000000, emissiveIntensity: 0,
    });

    // Two tall poles
    for (const side of [-gateWidth / 2, gateWidth / 2]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, poleHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6, roughness: 0.2 })
      );
      pole.position.set(side, poleHeight / 2, 0);
      group.add(pole);

      // Gold sphere on top
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 0.3 })
      );
      sphere.position.set(side, poleHeight + 0.4, 0);
      group.add(sphere);
    }

    // Top crossbar
    const crossbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, gateWidth, 8),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6, roughness: 0.2 })
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.y = poleHeight;
    crossbar.castShadow = false;
    group.add(crossbar);

    // Banner — checkered pattern using multiple quads
    const bannerHeight = 1.8;
    const bannerY = poleHeight - bannerHeight / 2 - 0.3;
    const checkerSize = gateWidth / 16;
    const rows = Math.round(bannerHeight / checkerSize);
    const cols = 16;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isBlack = (r + c) % 2 === 0;
        const tile = new THREE.Mesh(
          new THREE.PlaneGeometry(checkerSize, checkerSize),
          isBlack ? finishMatDark : finishMat
        );
        tile.position.set(
          -gateWidth / 2 + checkerSize / 2 + c * checkerSize,
          bannerY + checkerSize / 2 + r * checkerSize - bannerHeight / 2,
          0
        );
        // Double-sided so visible from both directions
        tile.material.side = THREE.DoubleSide;
        group.add(tile);
      }
    }

    // "FINISH" text poles (decorative side markers)
    for (const side of [-gateWidth / 2 - 3, gateWidth / 2 + 3]) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xcc0000, emissiveIntensity: 0.3 })
      );
      marker.position.set(side, 2.5, 0);
      marker.castShadow = false;
      group.add(marker);

      // Red flag
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 1),
        new THREE.MeshStandardMaterial({
          color: 0xff0000, side: THREE.DoubleSide,
          emissive: 0xff2200, emissiveIntensity: 0.3,
        })
      );
      flag.position.set(side + (side > 0 ? -1 : 1) * 1, 4.5, 0);
      group.add(flag);
    }

    // Ground line — bright stripe across the snow
    const groundLine = new THREE.Mesh(
      new THREE.BoxGeometry(gateWidth + 6, 0.05, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 0.4,
      })
    );
    groundLine.position.y = 0.03;
    groundLine.receiveShadow = true;
    group.add(groundLine);

    return group;
  }

  getHeightAt(x, z) {
    let h = this.computeHeight(x, z);
    for (const r of this.rollers) {
      if (z > r.zTop || z < r.zTop - r.len) continue;
      h += this.rollerHeightAt(r, x, z);
    }
    return h;
  }

  // ===== ROLLERS =====
  // A big snow roller across part of the run: smooth up face, flat deck, smooth down face.
  // u is the distance downhill from the top edge of the up face.
  createRollerData(chunkId) {
    const height = 3.2 + this.rand() * 1.0;
    const upLen = 13, deckLen = 10 + this.rand() * 4, downLen = 15;
    return {
      chunkId, height, upLen, deckLen, downLen,
      len: upLen + deckLen + downLen,
      width: 24, side: 5,
      approach: 12, runout: 8,
      footprint: 12 + upLen + deckLen + downLen + 8,
      upRailSide: this.rand() < 0.5 ? -1 : 1,
    };
  }

  rollerHeightAt(r, x, z) {
    const u = r.zTop - z;
    if (u <= 0 || u >= r.len) return 0;
    const smooth = (t) => t * t * (3 - 2 * t);
    let along;
    if (u < r.upLen) along = smooth(u / r.upLen);
    else if (u < r.upLen + r.deckLen) along = 1;
    else along = 1 - smooth((u - r.upLen - r.deckLen) / r.downLen);
    const dx = Math.abs(x - r.x) - r.width / 2;
    const across = dx <= 0 ? 1 : (dx >= r.side ? 0 : 1 - smooth(dx / r.side));
    return r.height * along * across;
  }

  // Up rail from the ground onto the deck in one lane, down rail from the deck in the other
  addRollerRails(r, chunk) {
    const laneX = 7;
    const deckStart = r.zTop - r.upLen;
    const deckEnd = deckStart - r.deckLen;

    const up = this.buildWorldRail(r.x + laneX * r.upRailSide,
      [r.zTop + 6, deckStart - 0.5], [0.5, 0.9], chunk);
    up.ramp.kickAngle = 0.32; // pops you onto the deck like a small kicker

    const down = this.buildWorldRail(r.x - laneX * r.upRailSide,
      [deckStart - 3, deckEnd, deckEnd - r.downLen - 3], [0.8, 0.8, 0.6], chunk);
    return { up, down };
  }

  // Rail in world space through the given z points (entry first, downhill last),
  // each a given height above the snow there, never closer than minClear to the snow.
  buildWorldRail(x, zs, heights, chunk, minClear = 0.45) {
    const pts = zs.map((z, i) => ({ z, y: this.getHeightAt(x, z) + heights[i] }));
    let deficit = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 1; k < 20; k++) {
        const t = k / 20;
        const z = pts[i].z + (pts[i + 1].z - pts[i].z) * t;
        const y = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        deficit = Math.max(deficit, minClear - (y - this.getHeightAt(x, z)));
      }
    }
    if (deficit > 0) for (const p of pts) p.y += deficit;

    const group = new THREE.Group();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(a.z - b.z, a.y - b.y);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len + 0.1, 8),
        i === pts.length - 2 ? this.metalMaterial : this.paintedMetalMaterial);
      seg.position.set(x, (a.y + b.y) / 2, (a.z + b.z) / 2);
      seg.rotation.x = Math.PI / 2 - Math.atan2(a.y - b.y, a.z - b.z);
      seg.castShadow = true;
      group.add(seg);
    }
    // Posts every ~5 units down to the snow
    const zEntry = pts[0].z, zExit = pts[pts.length - 1].z;
    const postCount = Math.max(2, Math.round((zEntry - zExit) / 5) + 1);
    for (let i = 0; i < postCount; i++) {
      const z = zEntry - (zEntry - zExit) * (i / (postCount - 1));
      const top = this._interpRail(pts, z);
      const ground = this.getHeightAt(x, z);
      const h = Math.max(0.05, top - ground);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), this.rockMaterial);
      post.position.set(x, ground + h / 2, z);
      group.add(post);
    }
    this.scene.add(group);
    chunk.objects.push(group);

    const ramp = {
      mesh: group,
      position: new THREE.Vector3(x, (pts[0].y + pts[pts.length - 1].y) / 2, (zEntry + zExit) / 2),
      type: 'rail', width: 4.0, length: zEntry - zExit, surfaceHeight: 0,
      worldPoints: pts, lipHeight: 0, lipAngle: 0, chunkId: chunk.chunkId,
    };
    this.ramps.push(ramp);

    // Gap-on kicker just uphill of the rail, sitting on the snow
    const entryClear = pts[0].y - this.getHeightAt(x, zEntry);
    const lipHeight = Math.min(entryClear * 0.65, 0.6);
    const lipLen = lipHeight * 3, lipW = 5.0, gap = 0.8;
    const lipZ = zEntry + gap + lipLen / 2;
    const lipShape = new THREE.Shape();
    lipShape.moveTo(0, 0);
    lipShape.lineTo(lipLen, 0);
    lipShape.lineTo(lipLen, lipHeight);
    lipShape.closePath();
    const geo = new THREE.ExtrudeGeometry(lipShape, { depth: lipW, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-lipW / 2, 0, lipLen / 2);
    const lip = new THREE.Mesh(geo, this.rampMaterial);
    const yUp = this.getHeightAt(x, lipZ + lipLen / 2), yDown = this.getHeightAt(x, lipZ - lipLen / 2);
    lip.position.set(x, (yUp + yDown) / 2, lipZ);
    lip.rotation.x = -Math.atan2(yUp - yDown, lipLen);
    lip.castShadow = true;
    group.add(lip);
    this.ramps.push({
      mesh: group, position: new THREE.Vector3(x, this.getHeightAt(x, lipZ), lipZ),
      type: 'kicker', width: lipW, length: lipLen, lipHeight, lipAngle: 0.35,
      railLip: true, railClear: entryClear - lipHeight,
      surfaceHeight: 0, chunkId: chunk.chunkId,
    });
    return { group, ramp };
  }

  _interpRail(pts, z) {
    if (z >= pts[0].z) return pts[0].y;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (z <= a.z && z >= b.z) return a.y + (b.y - a.y) * ((a.z - z) / (a.z - b.z));
    }
    return pts[pts.length - 1].y;
  }

  // Rail top in world space at z (handles world-space rails, height profiles and simple rails)
  getRailTopAt(ramp, x, z) {
    if (ramp.worldPoints) return this._interpRail(ramp.worldPoints, z);
    const ground = this.computeHeight(x, z);
    const t = Math.max(0, Math.min(1, 0.5 - (z - ramp.position.z) / ramp.length));
    if (ramp.profile) {
      const pr = ramp.profile;
      for (let i = 0; i < pr.length - 1; i++) {
        if (t <= pr[i + 1][0]) {
          const k = (t - pr[i][0]) / Math.max(1e-6, pr[i + 1][0] - pr[i][0]);
          return ground + pr[i][1] + (pr[i + 1][1] - pr[i][1]) * k;
        }
      }
      return ground + pr[pr.length - 1][1];
    }
    if (ramp.startHeight !== undefined && ramp.endHeight !== undefined) {
      return ground + ramp.startHeight * (1 - t) + ramp.endHeight * t;
    }
    return ground + ramp.surfaceHeight;
  }

  getSlopeNormalAt(x, z) {
    const eps = 0.5;
    const hL = this.getHeightAt(x - eps, z);
    const hR = this.getHeightAt(x + eps, z);
    const hF = this.getHeightAt(x, z - eps);
    const hB = this.getHeightAt(x, z + eps);
    const normal = new THREE.Vector3(hL - hR, 2 * eps, hF - hB);
    normal.normalize();
    return normal;
  }

  // Recursively dispose all geometries and materials in an object tree
  _disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) m.dispose();
      } else {
        obj.material.dispose();
      }
    }
    if (obj.children) {
      for (const child of obj.children) this._disposeObject(child);
    }
  }

  _disposeChunk(chunk) {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    if (chunk.mesh.material) chunk.mesh.material.dispose();
    for (const obj of chunk.objects) {
      this.scene.remove(obj);
      this._disposeObject(obj);
    }
  }

  update(playerZ) {
    const neededChunks = Math.ceil(-playerZ / this.chunkLength) + 4;
    while (this.chunksGenerated < neededChunks) {
      this.generateChunk();
    }
    while (
      this.chunks.length > 0 &&
      this.chunks[0].zOffset > -playerZ + this.chunkLength * 2
    ) {
      const old = this.chunks.shift();
      this._disposeChunk(old);
      // Purge ramps and obstacles belonging to this chunk
      const cid = old.chunkId;
      this.ramps = this.ramps.filter(r => r.chunkId !== cid);
      this.obstacles = this.obstacles.filter(o => o.chunkId !== cid);
      this.rollers = this.rollers.filter(r => r.chunkId !== cid);
    }
  }

  dispose() {
    for (const chunk of this.chunks) {
      this._disposeChunk(chunk);
    }
    this.chunks = [];
    this.obstacles = [];
    this.ramps = [];
    this.rollers = [];
    this.checkpoints = [];
  }
}
