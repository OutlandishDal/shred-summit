import * as THREE from 'three';

// Deterministic pseudo-random number generator (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---- CHAIR CONFIGURATIONS ----
const CHAIRS = {
  peak: {
    name: 'PEAK BACKCOUNTRY',
    slopeAngle: 0.40,             // base slope (overridden by slopeZones)
    chunkWidth: 2400,             // very wide bowl
    chunkLength: 75,
    totalChunks: 56,
    seed: 256,
    bowlStrength: 8,              // gentle bowl sides — wide open terrain
    bowlWidth: 800,               // flat floor extends 800 units each side
    cliffs: [],                   // using partialCliffs instead
    treeLineZ: 0,                 // trees everywhere from the start
    rockDensity: 0.8,
    treeDensity: 60.0,            // dense forest
    checkpointInterval: 340,
    checkpointCount: 12,
    generateRadius: 1,            // one chunk at a time for performance

    // Variable slope zones — steepness changes down the mountain
    // Each zone: { endZ: where it ends (negative), slope: steepness }
    // Zones are in order from top (z=0) to bottom
    slopeZones: [
      { endZ: -500,  slope: 0.45 },   // steep entry — fast start
      { endZ: -1100, slope: 0.28 },   // park-like mellow section
      { endZ: -1600, slope: 0.55 },   // steep chutes
      { endZ: -2200, slope: 0.30 },   // mellow tree runs
      { endZ: -3200, slope: 0.50 },   // steep cliff section
      { endZ: -4200, slope: 0.35 },   // final runout
    ],

    // Partial-width cliffs — avoidable by riding around them
    // Mix of small 25-footers to massive 200-footers across the whole run
    partialCliffs: [
      // --- Zone 1: Steep entry (z 0 to -500) — warm-up drops ---
      { zStart: -120,  drop: 8,   xCenter: 80,   xWidth: 200 },
      { zStart: -200,  drop: 12,  xCenter: -150,  xWidth: 250 },
      { zStart: -280,  drop: 10,  xCenter: 250,  xWidth: 220 },
      { zStart: -350,  drop: 15,  xCenter: -50,  xWidth: 280 },
      { zStart: -440,  drop: 18,  xCenter: 180,  xWidth: 260 },

      // --- Zone 2: Mellow section (z -500 to -1100) — medium drops ---
      { zStart: -530,  drop: 22,  xCenter: -200, xWidth: 300 },
      { zStart: -600,  drop: 14,  xCenter: 350,  xWidth: 200 },
      { zStart: -680,  drop: 30,  xCenter: 50,   xWidth: 350 },
      { zStart: -760,  drop: 10,  xCenter: -400, xWidth: 180 },
      { zStart: -830,  drop: 35,  xCenter: 300,  xWidth: 400 },
      { zStart: -920,  drop: 18,  xCenter: -250, xWidth: 240 },
      { zStart: -1000, drop: 25,  xCenter: 150,  xWidth: 300 },
      { zStart: -1070, drop: 12,  xCenter: -350, xWidth: 200 },

      // --- Zone 3: Steep chutes (z -1100 to -1600) — big drops ---
      { zStart: -1140, drop: 45,  xCenter: -100, xWidth: 380 },
      { zStart: -1220, drop: 20,  xCenter: 400,  xWidth: 250 },
      { zStart: -1300, drop: 55,  xCenter: -250, xWidth: 400 },
      { zStart: -1380, drop: 15,  xCenter: 200,  xWidth: 220 },
      { zStart: -1450, drop: 65,  xCenter: 50,   xWidth: 450 },
      { zStart: -1550, drop: 30,  xCenter: -400, xWidth: 300 },

      // --- Zone 4: Mellow tree runs (z -1600 to -2200) — varied ---
      { zStart: -1650, drop: 40,  xCenter: 350,  xWidth: 320 },
      { zStart: -1730, drop: 12,  xCenter: -150, xWidth: 200 },
      { zStart: -1810, drop: 50,  xCenter: -300, xWidth: 380 },
      { zStart: -1900, drop: 18,  xCenter: 250,  xWidth: 240 },
      { zStart: -1980, drop: 35,  xCenter: 0,    xWidth: 300 },
      { zStart: -2060, drop: 22,  xCenter: -450, xWidth: 260 },
      { zStart: -2140, drop: 28,  xCenter: 400,  xWidth: 280 },

      // --- Zone 5: Steep cliff section (z -2200 to -3200) — massive drops ---
      { zStart: -2250, drop: 60,  xCenter: -200, xWidth: 400 },
      { zStart: -2330, drop: 25,  xCenter: 300,  xWidth: 250 },
      { zStart: -2420, drop: 80,  xCenter: 100,  xWidth: 500 },
      { zStart: -2520, drop: 15,  xCenter: -400, xWidth: 200 },
      { zStart: -2600, drop: 70,  xCenter: -150, xWidth: 450 },
      { zStart: -2700, drop: 35,  xCenter: 350,  xWidth: 300 },
      { zStart: -2780, drop: 90,  xCenter: 50,   xWidth: 500 },
      { zStart: -2880, drop: 20,  xCenter: -350, xWidth: 240 },
      { zStart: -2960, drop: 100, xCenter: 200,  xWidth: 550 },
      { zStart: -3060, drop: 40,  xCenter: -250, xWidth: 300 },
      { zStart: -3150, drop: 75,  xCenter: 0,    xWidth: 480 },

      // --- Zone 6: Final runout (z -3200 to -4200) — tapering off ---
      { zStart: -3280, drop: 50,  xCenter: 300,  xWidth: 350 },
      { zStart: -3360, drop: 30,  xCenter: -200, xWidth: 280 },
      { zStart: -3450, drop: 65,  xCenter: -50,  xWidth: 420 },
      { zStart: -3550, drop: 18,  xCenter: 400,  xWidth: 220 },
      { zStart: -3640, drop: 45,  xCenter: -300, xWidth: 350 },
      { zStart: -3730, drop: 55,  xCenter: 150,  xWidth: 400 },
      { zStart: -3820, drop: 12,  xCenter: -400, xWidth: 200 },
      { zStart: -3900, drop: 35,  xCenter: 250,  xWidth: 300 },
      { zStart: -3980, drop: 20,  xCenter: -100, xWidth: 250 },
      { zStart: -4060, drop: 10,  xCenter: 100,  xWidth: 200 },
      { zStart: -4130, drop: 8,   xCenter: -50,  xWidth: 180 },
    ],

    // Frozen rivers — gap type (jumpable V-channels) and basin type (wide icy flats)
    rivers: [
      { type: 'gap',   z: -700,  xCenter: 0,    gapWidth: 13, depth: 9,
        escapePath: [{ x: 30, z: -700 }, { x: 80, z: -720 }, { x: 120, z: -750 }, { x: 100, z: -800 }] },
      { type: 'basin', z: -1400, xCenter: -50,  basinWidth: 32, basinLength: 90, depth: 4.5,
        escapePath: [{ x: -50, z: -1400 }, { x: -120, z: -1420 }, { x: -180, z: -1450 }, { x: -200, z: -1500 }] },
      { type: 'gap',   z: -2000, xCenter: 100,  gapWidth: 14, depth: 10,
        escapePath: [{ x: 100, z: -2000 }, { x: 50, z: -2020 }, { x: -20, z: -2060 }, { x: -50, z: -2100 }] },
      { type: 'basin', z: -2900, xCenter: 200,  basinWidth: 35, basinLength: 80, depth: 5,
        escapePath: [{ x: 200, z: -2900 }, { x: 260, z: -2920 }, { x: 320, z: -2960 }, { x: 300, z: -3010 }] },
      { type: 'gap',   z: -3600, xCenter: -150, gapWidth: 12, depth: 8,
        escapePath: [{ x: -150, z: -3600 }, { x: -200, z: -3620 }, { x: -260, z: -3660 }, { x: -240, z: -3710 }] },
    ],
  },

  oldgrowth: {
    name: 'OLD GROWTH GLADES',
    slopeAngle: 0.48,
    chunkWidth: 1600,
    chunkLength: 75,
    totalChunks: 56,
    seed: 314,
    bowlStrength: 6,
    bowlWidth: 600,
    treeLineZ: -50,
    treeDensity: 40.0,
    rockDensity: 1.5,
    checkpointInterval: 330,
    checkpointCount: 12,
    generateRadius: 1,
    oldGrowthTrees: true,

    slopeZones: [
      { endZ: -350,  slope: 0.55 },
      { endZ: -800,  slope: 0.40 },
      { endZ: -1300, slope: 0.58 },
      { endZ: -1800, slope: 0.38 },
      { endZ: -2400, slope: 0.55 },
      { endZ: -2900, slope: 0.36 },
      { endZ: -3500, slope: 0.56 },
      { endZ: -4200, slope: 0.42 },
    ],

    terrainNoise: {
      rollerAmplitude: 2.0,
      rollerFreqZ: 0.035,
      rollerFreqX: 0.008,
      mediumAmplitude: 1.5,
      mediumFreqX: 0.045,
      mediumFreqZ: 0.05,
      smallAmplitude: 0.6,
      smallFreqX: 0.10,
      smallFreqZ: 0.12,
    },

    // No terrain pop — berms and banked turns shouldn't launch the player;
    // all air comes from the gap jumps and hip jumps

    treeDensityZones: [
      { endZ: -350,  density: 38 },
      { endZ: -800,  density: 22 },
      { endZ: -1300, density: 50 },
      { endZ: -1800, density: 22 },
      { endZ: -2400, density: 45 },
      { endZ: -2900, density: 18 },
      { endZ: -3500, density: 50 },
      { endZ: -4200, density: 25 },
    ],

    pathCorridors: [
      // Main center line
      { waypoints: [
          { x: 0, z: 0 }, { x: -10, z: -300 }, { x: 5, z: -600 },
          { x: -15, z: -900 }, { x: 10, z: -1200 }, { x: -5, z: -1500 },
          { x: 0, z: -1800 }, { x: -10, z: -2100 }, { x: 5, z: -2400 },
          { x: 0, z: -2700 }, { x: -5, z: -3000 }, { x: 10, z: -3300 },
          { x: 0, z: -3600 }, { x: -5, z: -3900 }, { x: 0, z: -4200 },
        ],
        width: 14, indent: 0.8,
      },
      // Left branching path
      { waypoints: [
          { x: -5, z: -300 }, { x: -60, z: -500 }, { x: -80, z: -700 },
          { x: -40, z: -800 },
          { x: -50, z: -1300 }, { x: -100, z: -1500 }, { x: -70, z: -1700 },
          { x: -20, z: -1800 },
          { x: -40, z: -2400 }, { x: -90, z: -2600 }, { x: -60, z: -2800 },
          { x: -10, z: -2900 },
          { x: -50, z: -3500 }, { x: -80, z: -3700 }, { x: -30, z: -3900 },
          { x: -5, z: -4000 },
        ],
        width: 12, indent: 0.6,
      },
      // Right branching path
      { waypoints: [
          { x: 5, z: -300 }, { x: 50, z: -500 }, { x: 70, z: -700 },
          { x: 30, z: -800 },
          { x: 40, z: -1300 }, { x: 90, z: -1500 }, { x: 60, z: -1700 },
          { x: 15, z: -1800 },
          { x: 35, z: -2400 }, { x: 80, z: -2600 }, { x: 50, z: -2800 },
          { x: 5, z: -2900 },
          { x: 45, z: -3500 }, { x: 75, z: -3700 }, { x: 25, z: -3900 },
          { x: 5, z: -4000 },
        ],
        width: 12, indent: 0.6,
      },
    ],

    // Banked slalom trails — flowing carved channels with massive banked walls
    bankedTrails: [
      // Main flow trail — long sweeping turns through the center
      {
        xPath: [0, -5, -12, -18, -15, -8, 0, 8, 15, 18, 12, 5, 0, -5, -12, -18, -15, -8, 0, 8, 15, 12, 5, 0, -5, -10, -8, 0, 5, 0],
        zStart: -100, zEnd: -4100,
        halfWidth: 10, channelDepth: 2.0, bankHeight: 3.5,
      },
      // Left branch — sweeps through the left corridor
      {
        xPath: [-50, -55, -62, -70, -75, -72, -65, -58, -55, -58, -65, -72, -68, -60, -52, -48],
        zStart: -400, zEnd: -1700,
        halfWidth: 9, channelDepth: 1.8, bankHeight: 3.2,
      },
      // Right branch — sweeps through the right corridor
      {
        xPath: [45, 50, 58, 65, 70, 68, 62, 55, 50, 53, 60, 68, 65, 58, 50, 42],
        zStart: -400, zEnd: -1700,
        halfWidth: 9, channelDepth: 1.8, bankHeight: 3.2,
      },
    ],

    mogulFields: [],

    partialCliffs: [
      { zStart: -300,  drop: 3,  xCenter: -40,  xWidth: 80 },
      { zStart: -500,  drop: 2,  xCenter: 30,   xWidth: 60 },
      { zStart: -950,  drop: 4,  xCenter: -25,  xWidth: 100 },
      { zStart: -1150, drop: 3,  xCenter: 50,   xWidth: 70 },
      { zStart: -1600, drop: 4,  xCenter: -30,  xWidth: 90 },
      { zStart: -2000, drop: 3,  xCenter: 20,   xWidth: 80 },
      { zStart: -2500, drop: 4,  xCenter: -50,  xWidth: 100 },
      { zStart: -3000, drop: 3,  xCenter: 35,   xWidth: 70 },
      { zStart: -3400, drop: 4,  xCenter: -20,  xWidth: 90 },
      { zStart: -3800, drop: 2,  xCenter: 10,   xWidth: 60 },
    ],

    fallenLogs: [
      { z: -150,  x: -10, length: 14, angle: 0.3 },
      { z: -270,  x: 20,  length: 10, angle: -0.5 },
      { z: -380,  x: -55, length: 16, angle: 0.1 },
      { z: -480,  x: 35,  length: 12, angle: -0.3 },
      { z: -620,  x: -30, length: 11, angle: 0.6 },
      { z: -750,  x: 15,  length: 13, angle: -0.2 },
      { z: -880,  x: -65, length: 15, angle: 0.4 },
      { z: -1020, x: 45,  length: 10, angle: -0.6 },
      { z: -1150, x: -20, length: 14, angle: 0.2 },
      { z: -1300, x: 60,  length: 12, angle: -0.4 },
      { z: -1420, x: -45, length: 16, angle: 0.5 },
      { z: -1570, x: 10,  length: 11, angle: -0.1 },
      { z: -1700, x: -70, length: 13, angle: 0.3 },
      { z: -1850, x: 30,  length: 15, angle: -0.5 },
      { z: -1980, x: -15, length: 10, angle: 0.6 },
      { z: -2120, x: 50,  length: 14, angle: -0.2 },
      { z: -2250, x: -40, length: 12, angle: 0.4 },
      { z: -2400, x: 25,  length: 16, angle: -0.3 },
      { z: -2530, x: -60, length: 11, angle: 0.1 },
      { z: -2680, x: 40,  length: 13, angle: -0.6 },
      { z: -2800, x: -25, length: 15, angle: 0.5 },
      { z: -2950, x: 15,  length: 10, angle: -0.4 },
      { z: -3100, x: -50, length: 14, angle: 0.2 },
      { z: -3230, x: 35,  length: 12, angle: -0.1 },
      { z: -3380, x: -15, length: 16, angle: 0.6 },
      { z: -3500, x: 55,  length: 11, angle: -0.3 },
      { z: -3650, x: -35, length: 13, angle: 0.4 },
      { z: -3800, x: 20,  length: 15, angle: -0.5 },
      { z: -3950, x: -10, length: 10, angle: 0.2 },
      { z: -4080, x: 30,  length: 14, angle: -0.4 },
    ],

    frozenCreeks: [
      { startZ: -400,  endZ: -700,   xPath: [-20, -40, -60, -30, 0],     halfWidth: 15, depth: 2.5 },
      { startZ: -1600, endZ: -1900,  xPath: [30, 50, 70, 40, 10],        halfWidth: 18, depth: 2.0 },
      { startZ: -2700, endZ: -2950,  xPath: [-10, -30, -50, -20, 5],     halfWidth: 14, depth: 3.0 },
      { startZ: -3600, endZ: -3800,  xPath: [20, 40, 30, 10, -10],       halfWidth: 16, depth: 2.0 },
    ],

    jumps: [
      { z: -200,  x: -10, feet: 10 }, { z: -320,  x: 25,  feet: 8 },
      { z: -480,  x: -30, feet: 12 }, { z: -630,  x: 15,  feet: 10 },
      { z: -780,  x: -20, feet: 14 }, { z: -920,  x: 35,  feet: 10 },
      { z: -1080, x: -45, feet: 12 }, { z: -1220, x: 10,  feet: 8 },
      { z: -1380, x: -15, feet: 16 }, { z: -1520, x: 30,  feet: 12 },
      { z: -1680, x: -40, feet: 10 }, { z: -1830, x: 20,  feet: 14 },
      { z: -1980, x: -10, feet: 12 }, { z: -2150, x: 40,  feet: 10 },
      { z: -2300, x: -25, feet: 16 }, { z: -2450, x: 15,  feet: 12 },
      { z: -2620, x: -35, feet: 10 }, { z: -2780, x: 30,  feet: 14 },
      { z: -2920, x: -10, feet: 18 }, { z: -3080, x: 45,  feet: 12 },
      { z: -3250, x: -30, feet: 10 }, { z: -3400, x: 20,  feet: 14 },
      { z: -3570, x: -15, feet: 12 }, { z: -3750, x: 35,  feet: 10 },
      { z: -3900, x: -20, feet: 8 },
    ],

    gapJumps: [
      // Center of run — every ~200z, mixed sizes
      { z: -180,  x: 0,   feet: 28, gapLength: 16 },
      { z: -350,  x: 0,   feet: 32, gapLength: 20 },
      { z: -530,  x: 0,   feet: 35, gapLength: 22 },
      { z: -720,  x: 3,   feet: 30, gapLength: 18 },
      { z: -900,  x: -2,  feet: 38, gapLength: 24 },
      { z: -1100, x: 0,   feet: 40, gapLength: 26 },
      { z: -1280, x: 2,   feet: 32, gapLength: 20 },
      { z: -1450, x: 0,   feet: 35, gapLength: 22 },
      { z: -1650, x: -3,  feet: 42, gapLength: 28 },
      { z: -1830, x: 0,   feet: 35, gapLength: 22 },
      { z: -2020, x: 2,   feet: 38, gapLength: 24 },
      { z: -2200, x: 0,   feet: 45, gapLength: 30 },
      { z: -2380, x: -2,  feet: 35, gapLength: 22 },
      { z: -2560, x: 0,   feet: 40, gapLength: 26 },
      { z: -2750, x: 3,   feet: 48, gapLength: 32 },
      { z: -2930, x: 0,   feet: 35, gapLength: 22 },
      { z: -3120, x: -2,  feet: 42, gapLength: 28 },
      { z: -3300, x: 0,   feet: 38, gapLength: 24 },
      { z: -3480, x: 2,   feet: 45, gapLength: 30 },
      { z: -3660, x: 0,   feet: 40, gapLength: 26 },
      { z: -3850, x: -3,  feet: 35, gapLength: 22 },
      { z: -4050, x: 0,   feet: 42, gapLength: 28 },
    ],

    hipJumps: [
      // Sides of run — alternating left/right, offset from center
      { z: -250,  x: 12,  feet: 28, hipDirection: 'right', hipAngle: 0.5 },
      { z: -420,  x: -10, feet: 25, hipDirection: 'left',  hipAngle: 0.55 },
      { z: -600,  x: 14,  feet: 30, hipDirection: 'right', hipAngle: 0.5 },
      { z: -780,  x: -12, feet: 28, hipDirection: 'left',  hipAngle: 0.6 },
      { z: -960,  x: 10,  feet: 32, hipDirection: 'right', hipAngle: 0.45 },
      { z: -1150, x: -14, feet: 30, hipDirection: 'left',  hipAngle: 0.55 },
      { z: -1350, x: 12,  feet: 28, hipDirection: 'right', hipAngle: 0.5 },
      { z: -1530, x: -10, feet: 32, hipDirection: 'left',  hipAngle: 0.6 },
      { z: -1720, x: 14,  feet: 30, hipDirection: 'right', hipAngle: 0.5 },
      { z: -1900, x: -12, feet: 35, hipDirection: 'left',  hipAngle: 0.55 },
      { z: -2080, x: 10,  feet: 28, hipDirection: 'right', hipAngle: 0.5 },
      { z: -2270, x: -14, feet: 32, hipDirection: 'left',  hipAngle: 0.6 },
      { z: -2460, x: 12,  feet: 35, hipDirection: 'right', hipAngle: 0.45 },
      { z: -2640, x: -10, feet: 30, hipDirection: 'left',  hipAngle: 0.55 },
      { z: -2820, x: 14,  feet: 32, hipDirection: 'right', hipAngle: 0.5 },
      { z: -3010, x: -12, feet: 28, hipDirection: 'left',  hipAngle: 0.6 },
      { z: -3200, x: 10,  feet: 35, hipDirection: 'right', hipAngle: 0.5 },
      { z: -3380, x: -14, feet: 30, hipDirection: 'left',  hipAngle: 0.55 },
      { z: -3560, x: 12,  feet: 32, hipDirection: 'right', hipAngle: 0.5 },
      { z: -3750, x: -10, feet: 28, hipDirection: 'left',  hipAngle: 0.6 },
      { z: -3930, x: 14,  feet: 35, hipDirection: 'right', hipAngle: 0.45 },
      { z: -4100, x: -12, feet: 30, hipDirection: 'left',  hipAngle: 0.55 },
    ],

    rootDrops: [
      // Stumps
      { z: -170,  x: -20,  type: 'stump', height: 0.8, radius: 0.5 },
      { z: -380,  x: 15,   type: 'stump', height: 1.0, radius: 0.6 },
      { z: -560,  x: -45,  type: 'stump', height: 0.7, radius: 0.45 },
      { z: -720,  x: 30,   type: 'stump', height: 0.9, radius: 0.55 },
      { z: -1020, x: -15,  type: 'stump', height: 1.0, radius: 0.6 },
      { z: -1280, x: 50,   type: 'stump', height: 0.8, radius: 0.5 },
      { z: -1550, x: -35,  type: 'stump', height: 0.9, radius: 0.55 },
      { z: -1820, x: 10,   type: 'stump', height: 0.7, radius: 0.45 },
      { z: -2080, x: -25,  type: 'stump', height: 1.0, radius: 0.6 },
      { z: -2350, x: 40,   type: 'stump', height: 0.8, radius: 0.5 },
      { z: -2600, x: -10,  type: 'stump', height: 0.9, radius: 0.55 },
      { z: -2880, x: 25,   type: 'stump', height: 0.7, radius: 0.45 },
      { z: -3150, x: -40,  type: 'stump', height: 1.0, radius: 0.6 },
      { z: -3420, x: 15,   type: 'stump', height: 0.8, radius: 0.5 },
      { z: -3680, x: -20,  type: 'stump', height: 0.9, radius: 0.55 },
      // Root mounds
      { z: -250,  x: -30,  type: 'rootMound', feet: 6 },
      { z: -500,  x: 20,   type: 'rootMound', feet: 8 },
      { z: -830,  x: -10,  type: 'rootMound', feet: 7 },
      { z: -1150, x: 35,   type: 'rootMound', feet: 6 },
      { z: -1450, x: -50,  type: 'rootMound', feet: 8 },
      { z: -1750, x: 15,   type: 'rootMound', feet: 7 },
      { z: -2050, x: -35,  type: 'rootMound', feet: 6 },
      { z: -2420, x: 25,   type: 'rootMound', feet: 8 },
      { z: -2780, x: -15,  type: 'rootMound', feet: 7 },
      { z: -3100, x: 30,   type: 'rootMound', feet: 6 },
      { z: -3500, x: -25,  type: 'rootMound', feet: 8 },
      { z: -3850, x: 10,   type: 'rootMound', feet: 7 },
      // Root rails
      { z: -420,  x: -10,  type: 'rootRail', length: 5, angle: 0.4 },
      { z: -700,  x: 25,   type: 'rootRail', length: 6, angle: -0.3 },
      { z: -1080, x: -40,  type: 'rootRail', length: 5, angle: 0.5 },
      { z: -1350, x: 15,   type: 'rootRail', length: 7, angle: -0.2 },
      { z: -1680, x: -25,  type: 'rootRail', length: 5, angle: 0.6 },
      { z: -2000, x: 35,   type: 'rootRail', length: 6, angle: -0.4 },
      { z: -2350, x: -15,  type: 'rootRail', length: 5, angle: 0.3 },
      { z: -2700, x: 20,   type: 'rootRail', length: 7, angle: -0.5 },
      { z: -3050, x: -30,  type: 'rootRail', length: 5, angle: 0.4 },
      { z: -3350, x: 40,   type: 'rootRail', length: 6, angle: -0.3 },
      { z: -3650, x: -10,  type: 'rootRail', length: 5, angle: 0.5 },
      { z: -3950, x: 25,   type: 'rootRail', length: 7, angle: -0.2 },
    ],

    naturalKickerDensity: 3,
    naturalKickerSpread: 800,
  },
};

export class BackcountryTerrain {
  constructor(scene, chairId, nightMode = false) {
    this.scene = scene;
    this.chairId = chairId;
    this.nightMode = nightMode;
    this.config = CHAIRS[chairId];
    if (!this.config) throw new Error(`Unknown chair: ${chairId}`);

    this.chunks = [];
    this.chunkLength = this.config.chunkLength;
    this.chunkWidth = this.config.chunkWidth;
    this.slopeAngle = this.config.slopeAngle;
    this.chunksGenerated = 0;
    this.obstacles = [];
    this.ramps = [];       // no man-made ramps in backcountry
    this.checkpoints = [];
    this.nextCheckpointZ = -this.config.checkpointInterval;

    // Seeded RNG for deterministic placement
    this.rng = mulberry32(this.config.seed);

    // Materials
    this.snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeaf0f6, roughness: 0.75, metalness: 0.02,
    });
    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6672, roughness: 0.95, flatShading: true,
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
    this.cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5568, roughness: 0.9, flatShading: true,
    });
    this.iceMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccee, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.7,
    });
    this.poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600, roughness: 0.6,
    });
    // Old Growth Glades materials
    this.logMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3520, roughness: 1.0, flatShading: true,
    });
    this.mossyTrunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d1f0f, roughness: 1.0,
    });
    // Frozen creek material
    this.frozenIceMaterial = new THREE.MeshStandardMaterial({
      color: 0x6699cc, roughness: 0.1, metalness: 0.15,
      transparent: true, opacity: 0.75,
    });

    // Night mode: slight blue tint
    if (nightMode) {
      this.snowMaterial.color.set(0xb8c8dd);
      this.rockMaterial.color.set(0x506070);
      this.treeMaterial.color.set(0x122812);
      this.darkTreeMaterial.color.set(0x0c1e0c);
    }

    // River zones — populated during chunk generation for collision detection
    this.riverZones = [];

    // Lazy chunk generation — keep generateRadius chunks around the player
    this.generateRadius = this.config.generateRadius || 3;
    const initialChunks = Math.min(this.generateRadius, this.config.totalChunks);
    for (let i = 0; i < initialChunks; i++) {
      this.generateChunk();
    }

    // Populate riverZones from config for collision detection in Player.js
    if (this.config.rivers) {
      for (const river of this.config.rivers) {
        if (river.type === 'gap') {
          this.riverZones.push({
            type: 'gap',
            z: river.z,
            xCenter: river.xCenter,
            halfGapZ: river.gapWidth / 2,
            halfWidthX: river.gapWidth * 3,
            depth: river.depth,
            lipHeight: this.computeHeight(river.xCenter, river.z + river.gapWidth / 2),
            escapePath: river.escapePath,
          });
        } else if (river.type === 'basin') {
          this.riverZones.push({
            type: 'basin',
            z: river.z,
            xCenter: river.xCenter,
            halfLenZ: river.basinLength / 2,
            halfWidthX: river.basinWidth / 2,
            depth: river.depth,
            escapePath: river.escapePath,
          });
        }
      }
    }

  }

  // ---- VARIABLE SLOPE ----
  // Piecewise integration of slopeZones to get cumulative height drop at globalZ
  integratedSlope(globalZ) {
    const zones = this.config.slopeZones;
    if (!zones) return globalZ * this.config.slopeAngle;

    let height = 0;
    let prevEnd = 0; // top of the mountain (z=0)
    const transitionLen = 50; // blend between zones over 50 units

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const zoneStart = prevEnd;
      const zoneEnd = zone.endZ;

      // If globalZ hasn't reached this zone yet, compute partial contribution
      if (globalZ >= zoneStart) {
        // Player is above this zone — no contribution
        prevEnd = zoneEnd;
        continue;
      }

      // How far into this zone does globalZ reach?
      const entryZ = Math.max(globalZ, zoneEnd);
      const dz = zoneStart - entryZ; // positive distance into zone

      // Get effective slope (blend with previous zone near boundary)
      let slope = zone.slope;
      if (i > 0 && dz < transitionLen) {
        const prevSlope = zones[i - 1].slope;
        const blend = dz / transitionLen;
        slope = prevSlope + (zone.slope - prevSlope) * (blend * blend * (3 - 2 * blend)); // smoothstep
      }

      height -= dz * slope;

      if (globalZ >= zoneEnd) {
        // globalZ is within this zone — done
        break;
      }

      prevEnd = zoneEnd;
    }

    return height;
  }

  // ---- HEIGHT FUNCTION ----
  // Deterministic — no randomness, purely mathematical
  computeHeight(x, globalZ) {
    const cfg = this.config;
    let height = 0;

    // Base slope — use variable zones if available, otherwise constant
    if (cfg.slopeZones) {
      height += this.integratedSlope(globalZ);
    } else {
      height += globalZ * cfg.slopeAngle;
    }

    // Very subtle terrain variation — smooth bowl, no bumps
    height += Math.sin(x * 0.005 + globalZ * 0.002) * 0.4;

    // Multi-octave terrain noise — natural rollers, bumps, and micro-terrain
    if (cfg.terrainNoise) {
      const tn = cfg.terrainNoise;
      // Large rollers perpendicular to slope — create natural air opportunities
      const rollerPhase = Math.sin(x * tn.rollerFreqX) * 2.0;
      const roller = Math.sin(globalZ * tn.rollerFreqZ + rollerPhase) * tn.rollerAmplitude;
      // Vary roller amplitude across width so it's not uniform
      const rollerMod = 0.5 + 0.5 * Math.sin(x * tn.rollerFreqX * 3.7 + globalZ * 0.003);
      height += roller * rollerMod;

      // Medium bumps — offset frequencies for organic feel
      const med1 = Math.sin(x * tn.mediumFreqX + 1.7) * Math.cos(globalZ * tn.mediumFreqZ + 0.9);
      const med2 = Math.cos(x * tn.mediumFreqX * 0.6 + 3.2) * Math.sin(globalZ * tn.mediumFreqZ * 1.4 + 2.1);
      height += (med1 + med2 * 0.6) * tn.mediumAmplitude;

      // Small terrain detail — crunchy surface variation
      const sm1 = Math.sin(x * tn.smallFreqX + 3.1) * Math.sin(globalZ * tn.smallFreqZ + 2.3);
      const sm2 = Math.cos(x * tn.smallFreqX * 1.3 + 0.5) * Math.cos(globalZ * tn.smallFreqZ * 0.8 + 1.7);
      height += (sm1 + sm2 * 0.5) * tn.smallAmplitude;
    }

    // Bowl shape — terrain curves up on the sides
    const distFromCenter = Math.abs(x);
    if (distFromCenter > cfg.bowlWidth) {
      const excess = (distFromCenter - cfg.bowlWidth) / (cfg.chunkWidth / 2 - cfg.bowlWidth);
      height += Math.pow(Math.min(excess, 1.0), 1.8) * cfg.bowlStrength;
    }

    // Cliff bands — near-vertical rock drops at specific Z ranges
    for (const cliff of (cfg.cliffs || [])) {
      if (globalZ < cliff.zStart && globalZ > cliff.zEnd) {
        const progress = (cliff.zStart - globalZ) / (cliff.zStart - cliff.zEnd);
        // Very steep sigmoid — nearly vertical drop
        const dropFactor = 1 / (1 + Math.exp(-25 * (progress - 0.5)));
        height -= cliff.drop * dropFactor;
      } else if (globalZ <= cliff.zEnd) {
        // Below the cliff — permanently lowered
        height -= cliff.drop;
      }
    }

    // Partial-width cliffs — only affect part of the terrain width
    if (cfg.partialCliffs) {
      for (const cliff of cfg.partialCliffs) {
        const cliffEnd = cliff.zStart - cliff.drop * 0.6; // length proportional to drop
        if (globalZ < cliff.zStart && globalZ > cliffEnd) {
          // Horizontal fade — only affects xCenter ± xWidth/2 with 80-unit smooth edges
          const dx = Math.abs(x - cliff.xCenter);
          const halfW = cliff.xWidth / 2;
          let xFade = 1;
          if (dx > halfW) {
            xFade = Math.max(0, 1 - (dx - halfW) / 80);
          }
          if (xFade > 0) {
            const progress = (cliff.zStart - globalZ) / (cliff.zStart - cliffEnd);
            const dropFactor = 1 / (1 + Math.exp(-25 * (progress - 0.5)));
            height -= cliff.drop * dropFactor * xFade;
          }
        } else if (globalZ <= cliffEnd) {
          const dx = Math.abs(x - cliff.xCenter);
          const halfW = cliff.xWidth / 2;
          let xFade = 1;
          if (dx > halfW) {
            xFade = Math.max(0, 1 - (dx - halfW) / 80);
          }
          if (xFade > 0) {
            height -= cliff.drop * xFade;
          }
        }
      }
    }

    // Frozen rivers — V-shaped gaps and wide basins
    if (cfg.rivers) {
      for (const river of cfg.rivers) {
        if (river.type === 'gap') {
          const dz = globalZ - river.z;
          const halfGap = river.gapWidth / 2;
          if (Math.abs(dz) < halfGap) {
            // V-shaped channel perpendicular to slope
            const dx = Math.abs(x - river.xCenter);
            if (dx < river.gapWidth * 3) { // river width in X is ~3x gap width
              const xFade = Math.max(0, 1 - dx / (river.gapWidth * 3));
              const vShape = 1 - Math.abs(dz) / halfGap; // 1 at center, 0 at edges
              height -= river.depth * vShape * xFade;
            }
          }
        } else if (river.type === 'basin') {
          const dz = globalZ - river.z;
          const halfLen = river.basinLength / 2;
          const halfW = river.basinWidth / 2;
          if (Math.abs(dz) < halfLen) {
            const dx = Math.abs(x - river.xCenter);
            if (dx < halfW) {
              // Smooth basin depression
              const zFade = 1 - Math.pow(Math.abs(dz) / halfLen, 2);
              const xFade = 1 - Math.pow(dx / halfW, 2);
              height -= river.depth * zFade * xFade;
            }
          }
        }
      }
    }

    // Mogul fields — slushy bump runs
    if (cfg.mogulFields) {
      for (const mf of cfg.mogulFields) {
        if (globalZ < mf.zStart && globalZ > mf.zEnd) {
          const dx = Math.abs(x - mf.xCenter);
          if (dx < mf.xWidth / 2) {
            const xFade = 1 - Math.pow(dx / (mf.xWidth / 2), 2);
            const mogulH = Math.abs(Math.sin(globalZ * mf.frequency * Math.PI) *
                           Math.cos(x * mf.frequency * Math.PI * 0.8)) * mf.amplitude;
            height += mogulH * xFade;
          }
        }
      }
    }

    // Frozen creek beds — U-shaped halfpipe channels
    if (cfg.frozenCreeks) {
      for (const fc of cfg.frozenCreeks) {
        if (globalZ < fc.startZ && globalZ > fc.endZ) {
          const t = (fc.startZ - globalZ) / (fc.startZ - fc.endZ);
          const pathIdx = t * (fc.xPath.length - 1);
          const i0 = Math.floor(pathIdx);
          const i1 = Math.min(i0 + 1, fc.xPath.length - 1);
          const frac = pathIdx - i0;
          const creekCenterX = fc.xPath[i0] * (1 - frac) + fc.xPath[i1] * frac;

          const dx = Math.abs(x - creekCenterX);
          if (dx < fc.halfWidth * 2) {
            const normDx = dx / fc.halfWidth;
            if (normDx < 1) {
              height -= fc.depth * (1 - normDx * normDx);
            } else if (normDx < 2) {
              const wallT = normDx - 1;
              height -= fc.depth * 0.1 * (1 - wallT);
            }
          }
        }
      }
    }

    // Path corridor indent — worn rut from previous riders (Old Growth)
    if (cfg.pathCorridors) {
      for (const corridor of cfg.pathCorridors) {
        const wps = corridor.waypoints;
        for (let wi = 0; wi < wps.length - 1; wi++) {
          const w0 = wps[wi];
          const w1 = wps[wi + 1];
          if (globalZ <= w0.z && globalZ >= w1.z) {
            const wt = (w0.z - globalZ) / (w0.z - w1.z);
            const corridorX = w0.x + (w1.x - w0.x) * wt;
            const cdx = Math.abs(x - corridorX);
            const hw = corridor.width / 2;
            if (cdx < hw) {
              const indent = corridor.indent || 0.5;
              const normDx = cdx / hw;
              // Smooth bowl profile — deepest in center, fades at edges
              height -= indent * (1 - normDx * normDx);
            }
            break;
          }
        }
      }
    }

    // Banked slalom trails — continuous carved winding channels (Old Growth)
    if (cfg.bankedTrails) {
      for (const trail of cfg.bankedTrails) {
        if (globalZ < trail.zStart && globalZ > trail.zEnd) {
          // Interpolate center X from xPath waypoints
          const t = (trail.zStart - globalZ) / (trail.zStart - trail.zEnd);
          const pathIdx = t * (trail.xPath.length - 1);
          const i0 = Math.floor(pathIdx);
          const i1 = Math.min(i0 + 1, trail.xPath.length - 1);
          const frac = pathIdx - i0;
          const trailCenterX = trail.xPath[i0] * (1 - frac) + trail.xPath[i1] * frac;

          const dx = x - trailCenterX;
          const absDx = Math.abs(dx);
          const hw = trail.halfWidth;

          if (absDx < hw * 2.5) {
            // Compute turn direction from path derivative
            const eps = 0.01;
            const tNext = Math.min(t + eps, 1);
            const tPrev = Math.max(t - eps, 0);
            const idxN = tNext * (trail.xPath.length - 1);
            const idxP = tPrev * (trail.xPath.length - 1);
            const i0n = Math.floor(idxN); const i1n = Math.min(i0n + 1, trail.xPath.length - 1);
            const i0p = Math.floor(idxP); const i1p = Math.min(i0p + 1, trail.xPath.length - 1);
            const xNext = trail.xPath[i0n] * (1 - (idxN - i0n)) + trail.xPath[i1n] * (idxN - i0n);
            const xPrev = trail.xPath[i0p] * (1 - (idxP - i0p)) + trail.xPath[i1p] * (idxP - i0p);
            const turnDirection = xNext - xPrev; // positive = turning right, negative = turning left

            if (absDx < hw) {
              // Inside the channel — carve it down
              const normDx = absDx / hw;
              height -= trail.channelDepth * (1 - normDx * normDx);
            } else if (absDx < hw * 2.5) {
              // Outside the channel — bank up on the outside of the turn
              const wallDist = (absDx - hw) / (hw * 1.5);
              // Bank is stronger on the outside of the turn
              const isOutside = (dx > 0 && turnDirection > 0) || (dx < 0 && turnDirection < 0);
              const bankMul = isOutside ? 1.0 : 0.3;
              const bankProfile = Math.pow(wallDist, 1.3) * (1 - wallDist);
              height += trail.bankHeight * bankProfile * bankMul * 4;
            }
          }
        }
      }
    }

    // Runout zone — flatten at the bottom
    const totalLength = cfg.totalChunks * cfg.chunkLength;
    const runoutStart = -(totalLength - 400);
    if (globalZ < runoutStart) {
      const runoutProgress = Math.min((runoutStart - globalZ) / 300, 1.0);
      // Gradually reduce slope to near-flat
      const slopeReduction = cfg.slopeAngle * 0.7 * runoutProgress;
      height -= (globalZ - runoutStart) * slopeReduction;
    }

    // Soft terrain rise at far edges (invisible to player — just prevents falling off world)
    const edgeDist = cfg.chunkWidth / 2 - distFromCenter;
    if (edgeDist < 30) {
      height += Math.pow((30 - edgeDist) / 30, 2) * 12;
    }

    return height;
  }

  getHeightAt(x, z) {
    return this.computeHeight(x, z);
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

  // ---- CHUNK GENERATION ----
  generateChunk() {
    const zOffset = -this.chunksGenerated * this.chunkLength;
    // yOffset must match computeHeight at center (x=0) for correct mesh placement
    const yOffset = this.config.slopeZones
      ? -this.integratedSlope(zOffset)
      : -this.chunksGenerated * this.chunkLength * this.slopeAngle;

    const xSegs = Math.min(200, Math.ceil(this.chunkWidth / 4));
    const zSegs = Math.min(200, Math.ceil(this.chunkLength / 2.5));
    const geometry = new THREE.PlaneGeometry(this.chunkWidth, this.chunkLength, xSegs, zSegs);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const cfg = this.config;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const globalZ = zOffset + z;

      const globalHeight = this.computeHeight(x, globalZ);
      positions.setY(i, globalHeight - yOffset);

      // Snow color — slightly bluer in shadows (bowl sides), whiter on open faces
      const distFromCenter = Math.abs(x) / (this.chunkWidth / 2);
      const base = 0.93 + Math.sin(x * 0.08 + globalZ * 0.04) * 0.03;
      const shadowTint = distFromCenter > 0.5 ? 0.04 : 0;
      colors[i * 3] = base - shadowTint * 1.5;
      colors[i * 3 + 1] = base - shadowTint * 0.5;
      colors[i * 3 + 2] = base + shadowTint;

      // Full-width cliff faces get dark rock color
      for (const cliff of (cfg.cliffs || [])) {
        if (globalZ < cliff.zStart && globalZ > cliff.zEnd) {
          const progress = (cliff.zStart - globalZ) / (cliff.zStart - cliff.zEnd);
          if (progress > 0.2 && progress < 0.8) {
            const rockBlend = 0.8;
            colors[i * 3] = base * (1 - rockBlend) + 0.28 * rockBlend;
            colors[i * 3 + 1] = base * (1 - rockBlend) + 0.30 * rockBlend;
            colors[i * 3 + 2] = base * (1 - rockBlend) + 0.33 * rockBlend;
          }
        }
      }

      // Partial cliff faces get dark rock color within their X range
      if (cfg.partialCliffs) {
        for (const cliff of cfg.partialCliffs) {
          const cliffEnd = cliff.zStart - cliff.drop * 0.6;
          if (globalZ < cliff.zStart && globalZ > cliffEnd) {
            const progress = (cliff.zStart - globalZ) / (cliff.zStart - cliffEnd);
            if (progress > 0.2 && progress < 0.8) {
              const dx = Math.abs(x - cliff.xCenter);
              const halfW = cliff.xWidth / 2;
              let xFade = 1;
              if (dx > halfW) xFade = Math.max(0, 1 - (dx - halfW) / 80);
              if (xFade > 0.1) {
                const rockBlend = 0.8 * xFade;
                colors[i * 3] = base * (1 - rockBlend) + 0.28 * rockBlend;
                colors[i * 3 + 1] = base * (1 - rockBlend) + 0.30 * rockBlend;
                colors[i * 3 + 2] = base * (1 - rockBlend) + 0.33 * rockBlend;
              }
            }
          }
        }
      }

      // River ice tint — blend toward blue in river zones
      if (cfg.rivers) {
        for (const river of cfg.rivers) {
          let inRiver = 0;
          if (river.type === 'gap') {
            const dz = globalZ - river.z;
            const halfGap = river.gapWidth / 2;
            if (Math.abs(dz) < halfGap) {
              const dx = Math.abs(x - river.xCenter);
              if (dx < river.gapWidth * 3) {
                inRiver = (1 - dx / (river.gapWidth * 3)) * (1 - Math.abs(dz) / halfGap);
              }
            }
          } else if (river.type === 'basin') {
            const dz = globalZ - river.z;
            const halfLen = river.basinLength / 2;
            const halfW = river.basinWidth / 2;
            if (Math.abs(dz) < halfLen && Math.abs(x - river.xCenter) < halfW) {
              const zF = 1 - Math.pow(Math.abs(dz) / halfLen, 2);
              const xF = 1 - Math.pow(Math.abs(x - river.xCenter) / halfW, 2);
              inRiver = zF * xF;
            }
          }
          if (inRiver > 0.05) {
            const iceBlend = inRiver * 0.6;
            colors[i * 3] = colors[i * 3] * (1 - iceBlend) + 0.53 * iceBlend;
            colors[i * 3 + 1] = colors[i * 3 + 1] * (1 - iceBlend) + 0.80 * iceBlend;
            colors[i * 3 + 2] = colors[i * 3 + 2] * (1 - iceBlend) + 0.93 * iceBlend;
          }
        }
      }

      // Old Growth — path corridor, banked trail, and creek coloring
      if (this.chairId === 'oldgrowth') {
        // Path corridor surfaces: icy blue packed snow — clear worn tracks
        if (cfg.pathCorridors) {
          for (const corridor of cfg.pathCorridors) {
            const wps = corridor.waypoints;
            for (let wi = 0; wi < wps.length - 1; wi++) {
              const w0 = wps[wi];
              const w1 = wps[wi + 1];
              if (globalZ <= w0.z && globalZ >= w1.z) {
                const wt = (w0.z - globalZ) / (w0.z - w1.z);
                const corridorX = w0.x + (w1.x - w0.x) * wt;
                const cdx = Math.abs(x - corridorX);
                const hw = corridor.width / 2;
                if (cdx < hw) {
                  const normDx = cdx / hw;
                  const blend = (1 - normDx * normDx) * 0.35;
                  // Icy blue packed snow: reduce red, boost green+blue
                  colors[i * 3]     -= blend * 0.25;  // less red
                  colors[i * 3 + 1] += blend * 0.05;  // slightly more green
                  colors[i * 3 + 2] += blend * 0.30;  // strong blue tint
                }
                break;
              }
            }
          }
        }
        // Banked trail surfaces: strong icy blue in the carved channel
        if (cfg.bankedTrails) {
          for (const trail of cfg.bankedTrails) {
            if (globalZ < trail.zStart && globalZ > trail.zEnd) {
              const t = (trail.zStart - globalZ) / (trail.zStart - trail.zEnd);
              const pathIdx = t * (trail.xPath.length - 1);
              const pi0 = Math.floor(pathIdx);
              const pi1 = Math.min(pi0 + 1, trail.xPath.length - 1);
              const frac = pathIdx - pi0;
              const trailCX = trail.xPath[pi0] * (1 - frac) + trail.xPath[pi1] * frac;
              const dx = Math.abs(x - trailCX);
              if (dx < trail.halfWidth * 1.5) {
                const normDx = dx / (trail.halfWidth * 1.5);
                const blend = (1 - normDx * normDx) * 0.4;
                // Strong icy blue packed snow
                colors[i * 3]     -= blend * 0.30;  // less red
                colors[i * 3 + 1] += blend * 0.08;  // slightly more green
                colors[i * 3 + 2] += blend * 0.35;  // strong blue
              }
            }
          }
        }
        // Frozen creek beds: muddier blue-brown forest creek
        if (cfg.frozenCreeks) {
          for (const fc of cfg.frozenCreeks) {
            if (globalZ < fc.startZ && globalZ > fc.endZ) {
              const t = (fc.startZ - globalZ) / (fc.startZ - fc.endZ);
              const pathIdx = t * (fc.xPath.length - 1);
              const i0 = Math.floor(pathIdx);
              const i1 = Math.min(i0 + 1, fc.xPath.length - 1);
              const frac = pathIdx - i0;
              const ccX = fc.xPath[i0] * (1 - frac) + fc.xPath[i1] * frac;
              const dx = Math.abs(x - ccX);
              if (dx < fc.halfWidth * 1.5) {
                const iceBlend = Math.max(0, 1 - dx / (fc.halfWidth * 1.5)) * 0.4;
                colors[i * 3]     = colors[i * 3] * (1 - iceBlend) + 0.50 * iceBlend;
                colors[i * 3 + 1] = colors[i * 3 + 1] * (1 - iceBlend) + 0.65 * iceBlend;
                colors[i * 3 + 2] = colors[i * 3 + 2] * (1 - iceBlend) + 0.80 * iceBlend;
              }
            }
          }
        }
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = this.snowMaterial.clone();
    material.vertexColors = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, yOffset, zOffset);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const chunk = { mesh, zOffset, yOffset, objects: [], chunkObstacles: [] };

    // ---- Place obstacles (deterministic via seeded RNG) ----
    this.placeCliffWalls(chunk, zOffset);
    this.placePartialCliffWalls(chunk, zOffset);
    this.placeRocks(chunk, zOffset);
    this.placeTrees(chunk, zOffset);
    this.placeRiverVisuals(chunk, zOffset);
    this.placeJumps(chunk, zOffset);
    this.placeNaturalKickers(chunk, zOffset);
    this.placeFrozenCreekVisuals(chunk, zOffset);
    this.placeFallenLogs(chunk, zOffset);
    this.placeRootDrops(chunk, zOffset);
    this.placeGapJumps(chunk, zOffset);
    this.placeHipJumps(chunk, zOffset);
    this.placePathTracks(chunk, zOffset);

    // ---- Checkpoints ----
    while (this.nextCheckpointZ > zOffset - this.chunkLength &&
           this.checkpoints.length < this.config.checkpointCount) {
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
      this.nextCheckpointZ -= this.config.checkpointInterval;
    }

    this.chunks.push(chunk);
    this.chunksGenerated++;
  }

  // ---- CLIFF WALL MESHES — 3D rock faces at cliff bands ----
  placeCliffWalls(chunk, zOffset) {
    const cfg = this.config;
    if (!cfg.cliffs) return;
    for (const cliff of cfg.cliffs) {
      const cliffMidZ = (cliff.zStart + cliff.zEnd) / 2;
      // Only place wall if this cliff falls within this chunk's Z range
      if (cliffMidZ > zOffset || cliffMidZ < zOffset - this.chunkLength) continue;

      // Build a rock wall spanning the rideable bowl width
      const wallWidth = cfg.bowlWidth * 2;
      const segments = 20;
      const segWidth = wallWidth / segments;

      for (let s = 0; s < segments; s++) {
        const segX = -wallWidth / 2 + segWidth * s + segWidth / 2;
        const segSeed = Math.abs(Math.sin(segX * 0.37 + cliff.zStart * 0.13));
        const segW = segWidth * (0.9 + segSeed * 0.2);

        // Compute top and bottom heights of the cliff face at this X position
        const topY = this.computeHeight(segX, cliff.zStart);
        const bottomY = this.computeHeight(segX, cliff.zEnd);
        // Wall sits below the snow line — only the exposed rock face
        const wallH = Math.max(topY - bottomY, cliff.drop * 0.2) * (0.35 + segSeed * 0.15);
        const centerY = bottomY + wallH / 2;

        const geo = new THREE.BoxGeometry(segW, wallH, 3);
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const vy = pos.getY(v);
          const vx = pos.getX(v);
          const vz = pos.getZ(v);
          if (vz > 0) {
            pos.setZ(v, vz + Math.sin(vx * 2.1 + vy * 1.7) * 0.6);
          }
          if (vy > 0) {
            pos.setY(v, vy + Math.sin(vx * 3.0) * 0.4);
          }
        }
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, this.cliffMaterial);
        mesh.position.set(segX, centerY, cliffMidZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        chunk.objects.push(mesh);
      }
    }
  }

  // ---- PARTIAL CLIFF WALLS — rock faces constrained to X range ----
  placePartialCliffWalls(chunk, zOffset) {
    const cfg = this.config;
    if (!cfg.partialCliffs) return;

    for (const cliff of cfg.partialCliffs) {
      const cliffEnd = cliff.zStart - cliff.drop * 0.6;
      const cliffMidZ = (cliff.zStart + cliffEnd) / 2;
      if (cliffMidZ > zOffset || cliffMidZ < zOffset - this.chunkLength) continue;

      const wallWidth = cliff.xWidth;
      const segments = Math.max(8, Math.ceil(wallWidth / 20));
      const segWidth = wallWidth / segments;

      for (let s = 0; s < segments; s++) {
        const segX = cliff.xCenter - wallWidth / 2 + segWidth * s + segWidth / 2;
        const segSeed = Math.abs(Math.sin(segX * 0.37 + cliff.zStart * 0.13));
        const segW = segWidth * (0.9 + segSeed * 0.2);

        const topY = this.computeHeight(segX, cliff.zStart);
        const bottomY = this.computeHeight(segX, cliffEnd);
        const wallH = Math.max(topY - bottomY, cliff.drop * 0.15) * (0.3 + segSeed * 0.2);
        if (wallH < 1) continue;
        const centerY = bottomY + wallH / 2;

        const geo = new THREE.BoxGeometry(segW, wallH, 3);
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const vy = pos.getY(v);
          const vx = pos.getX(v);
          const vz = pos.getZ(v);
          if (vz > 0) pos.setZ(v, vz + Math.sin(vx * 2.1 + vy * 1.7) * 0.6);
          if (vy > 0) pos.setY(v, vy + Math.sin(vx * 3.0) * 0.4);
        }
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, this.cliffMaterial);
        mesh.position.set(segX, centerY, cliffMidZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        chunk.objects.push(mesh);
      }
    }
  }

  // ---- RIVER VISUALS — ice plane meshes at river floors ----
  placeRiverVisuals(chunk, zOffset) {
    const cfg = this.config;
    if (!cfg.rivers) return;

    for (const river of cfg.rivers) {
      // Check if this river falls within this chunk's Z range
      if (river.type === 'gap') {
        if (river.z > zOffset || river.z < zOffset - this.chunkLength) continue;
        // Ice plane at bottom of V-channel
        const iceWidth = river.gapWidth * 5;
        const iceLength = river.gapWidth * 0.8;
        const geo = new THREE.PlaneGeometry(iceWidth, iceLength);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.iceMaterial);
        const iceY = this.computeHeight(river.xCenter, river.z) + 0.1;
        mesh.position.set(river.xCenter, iceY, river.z);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        chunk.objects.push(mesh);
      } else if (river.type === 'basin') {
        const basinStart = river.z + river.basinLength / 2;
        const basinEnd = river.z - river.basinLength / 2;
        if (basinStart < zOffset - this.chunkLength || basinEnd > zOffset) continue;
        // Large ice plane covering basin floor
        const geo = new THREE.PlaneGeometry(river.basinWidth * 0.9, river.basinLength * 0.8);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.iceMaterial);
        const iceY = this.computeHeight(river.xCenter, river.z) + 0.1;
        mesh.position.set(river.xCenter, iceY, river.z);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        chunk.objects.push(mesh);
      }
    }
  }

  // ---- JUMP PLACEMENT (fixed positions from config) ----
  placeJumps(chunk, zOffset) {
    const cfg = this.config;
    if (!cfg.jumps) return;

    for (const jump of cfg.jumps) {
      if (jump.z > zOffset || jump.z < zOffset - this.chunkLength) continue;

      const feet = jump.feet;
      const scale = feet / 30;
      const width = 4.0 * scale;
      const length = 5.0 * scale;
      const lipHeight = 2.0 * scale;
      const lipAngle = 0.45;

      const feature = this.createBackcountryJump(feet);

      // Embed in terrain — sample height across footprint
      const halfW = width / 2;
      const halfL = length / 2;
      let minY = Infinity;
      for (const sx of [-halfW, 0, halfW]) {
        for (const sz of [-halfL, 0, halfL]) {
          const h = this.computeHeight(jump.x + sx, jump.z + sz);
          if (h < minY) minY = h;
        }
      }
      minY -= 0.2;

      feature.position.set(jump.x, minY, jump.z);
      this.scene.add(feature);
      chunk.objects.push(feature);

      // Register as kicker for Player.js physics
      const rampData = {
        mesh: feature,
        position: new THREE.Vector3(jump.x, minY, jump.z),
        type: 'kicker',
        width,
        length,
        size: 'small',
        lipHeight,
        lipAngle,
        surfaceHeight: 0,
      };
      this.ramps.push(rampData);

      if (!chunk.chunkRamps) chunk.chunkRamps = [];
      chunk.chunkRamps.push(rampData);
    }
  }

  // ---- NATURAL KICKER PLACEMENT (procedural wind lips, snow mounds, pillows) ----
  placeNaturalKickers(chunk, zOffset) {
    const cfg = this.config;
    if (!cfg.naturalKickerDensity) return;

    const count = cfg.naturalKickerDensity;
    const spread = cfg.naturalKickerSpread || (cfg.bowlWidth * 1.4);

    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * spread;
      const z = (this.rng() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;

      // Skip if too close to center line
      if (Math.abs(x) < 5) continue;

      // Random size: 15-40 foot equivalent
      const feet = 15 + this.rng() * 25;
      const scale = feet / 30;
      const width = 4.5 * scale;
      const length = 5.5 * scale;
      const lipHeight = 2.2 * scale;
      const lipAngle = 0.38 + this.rng() * 0.18;

      // 65% natural mounds, 35% man-made kickers
      const isNatural = this.rng() > 0.35;
      const feature = isNatural
        ? this.createNaturalMound(feet)
        : this.createBackcountryJump(feet);

      // Embed in terrain
      const halfW = width / 2;
      const halfL = length / 2;
      let minY = Infinity;
      for (const sx of [-halfW, 0, halfW]) {
        for (const sz of [-halfL, 0, halfL]) {
          const h = this.computeHeight(x + sx, globalZ + sz);
          if (h < minY) minY = h;
        }
      }
      minY -= 0.3;

      feature.position.set(x, minY, globalZ);
      this.scene.add(feature);
      chunk.objects.push(feature);

      // Register as kicker ramp for player physics
      const rampData = {
        mesh: feature,
        position: new THREE.Vector3(x, minY, globalZ),
        type: 'kicker',
        width,
        length,
        size: 'small',
        lipHeight,
        lipAngle,
        surfaceHeight: 0,
      };
      this.ramps.push(rampData);
      if (!chunk.chunkRamps) chunk.chunkRamps = [];
      chunk.chunkRamps.push(rampData);
    }
  }

  // ---- ROCK PLACEMENT (deterministic) ----
  placeRocks(chunk, zOffset) {
    const count = Math.floor(12 * this.config.rockDensity * (this.chunkLength / 300));
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * (this.config.bowlWidth * 1.8);
      const z = (this.rng() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);

      // Skip if too close to center line
      if (Math.abs(x) < 6) continue;

      const rock = this.createRock();
      rock.position.set(x, y, globalZ);
      this.scene.add(rock);
      chunk.objects.push(rock);
      const obs = { position: new THREE.Vector3(x, y, globalZ), radius: 2.0, type: 'rock' };
      this.obstacles.push(obs);
      chunk.chunkObstacles.push(obs);
    }
  }

  // ---- TREE PLACEMENT (deterministic, sparse at top, dense at bottom) ----
  placeTrees(chunk, zOffset) {
    const cfg = this.config;
    const chunkBottomZ = zOffset - this.chunkLength;
    if (chunkBottomZ > cfg.treeLineZ) return;

    // Zone-varied tree density
    let effectiveDensity = cfg.treeDensity;
    if (cfg.treeDensityZones) {
      const midZ = zOffset - this.chunkLength / 2;
      for (const zone of cfg.treeDensityZones) {
        if (midZ >= zone.endZ) {
          effectiveDensity = zone.density;
          break;
        }
      }
    }
    const count = Math.floor(20 * effectiveDensity * (this.chunkLength / 300));
    // For wide terrain with dense trees, spread within bowl width not full chunk width
    const treeSpreadX = cfg.partialCliffs ? cfg.bowlWidth * 1.8 : cfg.chunkWidth * 0.8;
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * treeSpreadX;
      const z = (this.rng() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;

      if (globalZ > cfg.treeLineZ) continue;

      // Sparse near top, dense near bottom (skip fade for peak — dense everywhere)
      if (!cfg.partialCliffs) {
        const belowTreeline = (cfg.treeLineZ - globalZ) / 600;
        if (this.rng() > Math.min(belowTreeline, 1.0)) continue;
      }

      // Trees prefer the sides of the bowl — fewer in center
      // Peak terrain has tight tree runs so allow trees much closer to center
      // Old Growth skips center clearance — trees fill everywhere outside corridors
      if (!cfg.pathCorridors) {
        const absX = Math.abs(x);
        const centerClearance = cfg.partialCliffs ? 3 : 15;
        if (absX < centerClearance && this.rng() > 0.15) continue;
      }

      // Skip trees inside path corridors
      if (cfg.pathCorridors && this.isInPathCorridor(x, globalZ)) continue;

      // Skip trees inside banked trail channels
      if (cfg.bankedTrails) {
        let inTrail = false;
        for (const trail of cfg.bankedTrails) {
          if (globalZ < trail.zStart && globalZ > trail.zEnd) {
            const t = (trail.zStart - globalZ) / (trail.zStart - trail.zEnd);
            const pathIdx = t * (trail.xPath.length - 1);
            const ti0 = Math.floor(pathIdx);
            const ti1 = Math.min(ti0 + 1, trail.xPath.length - 1);
            const frac = pathIdx - ti0;
            const trailCX = trail.xPath[ti0] * (1 - frac) + trail.xPath[ti1] * frac;
            if (Math.abs(x - trailCX) < trail.halfWidth * 2.5) {
              inTrail = true;
              break;
            }
          }
        }
        if (inTrail) continue;
      }

      // Skip trees inside frozen creek zones
      if (cfg.frozenCreeks) {
        let inCreek = false;
        for (const fc of cfg.frozenCreeks) {
          if (globalZ < fc.startZ && globalZ > fc.endZ) {
            const t = (fc.startZ - globalZ) / (fc.startZ - fc.endZ);
            const pathIdx = t * (fc.xPath.length - 1);
            const i0 = Math.floor(pathIdx);
            const i1 = Math.min(i0 + 1, fc.xPath.length - 1);
            const frac = pathIdx - i0;
            const ccX = fc.xPath[i0] * (1 - frac) + fc.xPath[i1] * frac;
            if (Math.abs(x - ccX) < fc.halfWidth * 2) {
              inCreek = true;
              break;
            }
          }
        }
        if (inCreek) continue;
      }


      // Skip trees inside river zones
      if (cfg.rivers) {
        let inRiver = false;
        for (const river of cfg.rivers) {
          if (river.type === 'gap') {
            if (Math.abs(globalZ - river.z) < river.gapWidth && Math.abs(x - river.xCenter) < river.gapWidth * 4) {
              inRiver = true; break;
            }
          } else if (river.type === 'basin') {
            if (Math.abs(globalZ - river.z) < river.basinLength / 2 + 5 && Math.abs(x - river.xCenter) < river.basinWidth / 2 + 5) {
              inRiver = true; break;
            }
          }
        }
        if (inRiver) continue;
      }

      const y = this.computeHeight(x, globalZ);

      const tree = cfg.oldGrowthTrees ? this.createOldGrowthTree() : this.createSnowPineTree();
      tree.position.set(x, y, globalZ);
      this.scene.add(tree);
      chunk.objects.push(tree);
      const treeRadius = cfg.oldGrowthTrees ? 1.8 : 1.2;
      const obs = { position: new THREE.Vector3(x, y, globalZ), radius: treeRadius, type: 'tree' };
      this.obstacles.push(obs);
      chunk.chunkObstacles.push(obs);
    }

    // Extra dense tree pass for Old Growth: pack trees between corridors to form walls
    if (cfg.pathCorridors) {
      const extraCount = Math.floor(28 * effectiveDensity * (this.chunkLength / 300));
      for (let i = 0; i < extraCount; i++) {
        const x = (this.rng() - 0.5) * treeSpreadX;
        const z = (this.rng() - 0.5) * this.chunkLength;
        const globalZ = zOffset + z;
        if (globalZ > cfg.treeLineZ) continue;
        // Only place in areas OUTSIDE path corridors (between the paths)
        if (this.isInPathCorridor(x, globalZ)) continue;
        // Also skip banked trails and frozen creeks
        if (cfg.bankedTrails) {
          let inTrail = false;
          for (const trail of cfg.bankedTrails) {
            if (globalZ < trail.zStart && globalZ > trail.zEnd) {
              const t = (trail.zStart - globalZ) / (trail.zStart - trail.zEnd);
              const pIdx = t * (trail.xPath.length - 1);
              const ti0 = Math.floor(pIdx);
              const ti1 = Math.min(ti0 + 1, trail.xPath.length - 1);
              const frac = pIdx - ti0;
              const trailCX = trail.xPath[ti0] * (1 - frac) + trail.xPath[ti1] * frac;
              if (Math.abs(x - trailCX) < trail.halfWidth * 2.5) { inTrail = true; break; }
            }
          }
          if (inTrail) continue;
        }
        if (cfg.frozenCreeks) {
          let inCreek = false;
          for (const fc of cfg.frozenCreeks) {
            if (globalZ < fc.startZ && globalZ > fc.endZ) {
              const t = (fc.startZ - globalZ) / (fc.startZ - fc.endZ);
              const pIdx = t * (fc.xPath.length - 1);
              const ci0 = Math.floor(pIdx);
              const ci1 = Math.min(ci0 + 1, fc.xPath.length - 1);
              const frac = pIdx - ci0;
              const ccX = fc.xPath[ci0] * (1 - frac) + fc.xPath[ci1] * frac;
              if (Math.abs(x - ccX) < fc.halfWidth * 2) { inCreek = true; break; }
            }
          }
          if (inCreek) continue;
        }
        const y = this.computeHeight(x, globalZ);
        const tree = this.createOldGrowthTree();
        tree.position.set(x, y, globalZ);
        this.scene.add(tree);
        chunk.objects.push(tree);
        const obs = { position: new THREE.Vector3(x, y, globalZ), radius: 1.8, type: 'tree' };
        this.obstacles.push(obs);
        chunk.chunkObstacles.push(obs);
      }
    }
  }

  // ---- FROZEN CREEK VISUALS ----
  placeFrozenCreekVisuals(chunk, zOffset) {
    if (!this.config.frozenCreeks) return;
    // Old Growth uses vertex coloring for creek beds instead of ice planes
    if (this.chairId === 'oldgrowth') return;
    for (const fc of this.config.frozenCreeks) {
      // Place ice segments along the winding path
      const segCount = 8;
      for (let s = 0; s < segCount; s++) {
        const t0 = s / segCount;
        const t1 = (s + 1) / segCount;
        const z0 = fc.startZ - t0 * (fc.startZ - fc.endZ);
        const z1 = fc.startZ - t1 * (fc.startZ - fc.endZ);
        const midZ = (z0 + z1) / 2;
        if (midZ > zOffset || midZ < zOffset - this.chunkLength) continue;

        const tMid = (t0 + t1) / 2;
        const pathIdx = tMid * (fc.xPath.length - 1);
        const i0 = Math.floor(pathIdx);
        const i1 = Math.min(i0 + 1, fc.xPath.length - 1);
        const frac = pathIdx - i0;
        const cx = fc.xPath[i0] * (1 - frac) + fc.xPath[i1] * frac;

        const segLen = Math.abs(z1 - z0);
        const geo = new THREE.PlaneGeometry(fc.halfWidth * 1.6, segLen);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.frozenIceMaterial);
        mesh.position.set(cx, this.computeHeight(cx, midZ) + 0.05, midZ);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        chunk.objects.push(mesh);
      }
    }
  }

  // ---- OBJECT CREATION (same style as Terrain.js) ----

  createRock() {
    const group = new THREE.Group();
    const count = 1 + Math.floor(this.rng() * 3);
    for (let i = 0; i < count; i++) {
      const size = 1.0 + this.rng() * 2.0;
      const geo = new THREE.DodecahedronGeometry(size, 1);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + (this.rng() - 0.5) * 0.4);
        pos.setY(j, pos.getY(j) * 0.5 + (this.rng() - 0.5) * 0.2);
        pos.setZ(j, pos.getZ(j) + (this.rng() - 0.5) * 0.4);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.rockMaterial);
      mesh.position.set((this.rng() - 0.5) * 2, 0, (this.rng() - 0.5) * 2);
      mesh.castShadow = true;
      group.add(mesh);
    }
    // Snow cap
    const snow = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.4),
      this.snowMaterial
    );
    snow.position.y = 0.5;
    group.add(snow);
    return group;
  }

  createPineTree() {
    const group = new THREE.Group();
    const scale = 0.7 + this.rng() * 0.8;
    const mat = this.rng() > 0.5 ? this.treeMaterial : this.darkTreeMaterial;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2.5 * scale, 5),
      this.trunkMaterial
    );
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    group.add(trunk);

    for (let i = 0; i < 5; i++) {
      const radius = (3.0 - i * 0.5) * scale;
      const height = (2.0 - i * 0.15) * scale;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6), mat
      );
      cone.position.y = (2.5 + i * 1.3) * scale;
      cone.rotation.y = this.rng() * Math.PI;
      cone.castShadow = true;
      group.add(cone);
    }

    for (let i = 0; i < 3; i++) {
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry((2.2 - i * 0.5) * scale, 0.4 * scale, 6),
        this.snowMaterial
      );
      snow.position.y = (3.2 + i * 1.3) * scale;
      group.add(snow);
    }

    return group;
  }

  // ---- OLD GROWTH CHUTES: Fallen logs & big trees ----

  placeFallenLogs(chunk, zOffset) {
    if (!this.config.fallenLogs) return;
    const chunkBottomZ = zOffset - this.chunkLength;

    for (const log of this.config.fallenLogs) {
      if (log.z > zOffset || log.z < chunkBottomZ) continue;

      const y = this.computeHeight(log.x, log.z);
      const logMesh = this.createFallenLog(log.length, log.angle);
      logMesh.position.set(log.x, y, log.z);
      this.scene.add(logMesh);
      chunk.objects.push(logMesh);

      // Register as grindable rail
      const cosA = Math.cos(log.angle);
      const sinA = Math.sin(log.angle);
      this.ramps.push({
        mesh: logMesh,
        position: new THREE.Vector3(log.x, y, log.z),
        type: 'rail',
        width: 1.5,
        length: log.length * Math.abs(cosA) + 0.6 * Math.abs(sinA),
        surfaceHeight: 0.6,
        lipHeight: 0, lipAngle: 0,
      });
    }
  }

  createFallenLog(length, angle) {
    const group = new THREE.Group();
    const logRadius = 0.25 + this.rng() * 0.1;

    // Main log trunk — cylinder on its side
    const logGeo = new THREE.CylinderGeometry(logRadius, logRadius * 1.1, length, 8);
    const logMesh = new THREE.Mesh(logGeo, this.logMaterial);
    logMesh.rotation.x = Math.PI / 2; // lie on side
    logMesh.position.y = logRadius;
    logMesh.castShadow = true;
    group.add(logMesh);

    // Snow on top of log
    const snowGeo = new THREE.CylinderGeometry(logRadius * 0.7, logRadius * 0.9, length * 0.95, 8,
      1, true, -Math.PI * 0.3, Math.PI * 0.6);
    const snowMesh = new THREE.Mesh(snowGeo, this.snowMaterial);
    snowMesh.rotation.x = Math.PI / 2;
    snowMesh.position.y = logRadius + logRadius * 0.15;
    group.add(snowMesh);

    // Root ball at one end
    const rootCount = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < rootCount; i++) {
      const root = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + this.rng() * 0.12, 5, 4),
        this.logMaterial
      );
      root.position.set(
        (this.rng() - 0.5) * 0.5,
        logRadius * 0.5 + this.rng() * 0.3,
        length / 2 + this.rng() * 0.3
      );
      group.add(root);
    }

    // Broken branch stubs sticking up
    const branchCount = 2 + Math.floor(this.rng() * 3);
    for (let i = 0; i < branchCount; i++) {
      const bz = (this.rng() - 0.5) * length * 0.7;
      const bLen = 0.4 + this.rng() * 0.5;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, bLen, 4),
        this.logMaterial
      );
      branch.position.set(
        (this.rng() - 0.5) * logRadius,
        logRadius * 2 + bLen / 2,
        bz
      );
      branch.rotation.z = (this.rng() - 0.5) * 0.4;
      group.add(branch);
    }

    // Apply the angle rotation
    group.rotation.y = angle;

    return group;
  }

  createOldGrowthTree() {
    const group = new THREE.Group();
    const scale = 1.2 + this.rng() * 1.0; // much bigger than normal trees (1.2-2.2 vs 0.6-1.3)

    // Massive trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4 * scale, 0.7 * scale, 3.0 * scale, 6),
      this.mossyTrunkMaterial
    );
    trunk.position.y = 1.5 * scale;
    trunk.castShadow = true;
    group.add(trunk);

    // 6-7 tree layers — darker green, ancient feel
    const layers = 6 + Math.floor(this.rng() * 2);
    for (let i = 0; i < layers; i++) {
      const radius = (3.5 - i * 0.4) * scale;
      const height = (2.2 - i * 0.12) * scale;

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6),
        this.darkTreeMaterial
      );
      cone.position.y = (3.0 + i * 1.4) * scale;
      cone.rotation.y = this.rng() * Math.PI;
      cone.castShadow = true;
      group.add(cone);

      // Heavy snow on each layer
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.8, 0.6 * scale, 6),
        this.snowMaterial
      );
      snow.position.y = (3.5 + i * 1.4) * scale;
      snow.rotation.y = cone.rotation.y;
      group.add(snow);
    }

    // Big snow cap
    const topSnow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9 * scale, 5, 4, 0, Math.PI * 2, 0, Math.PI * 0.5),
      this.snowMaterial
    );
    topSnow.position.y = (3.0 + layers * 1.4) * scale;
    group.add(topSnow);

    return group;
  }

  createSnowPineTree() {
    const group = new THREE.Group();
    const scale = 0.6 + this.rng() * 0.7;

    // Trunk — mostly buried in snow
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.5 * scale, 5),
      this.trunkMaterial
    );
    trunk.position.y = 0.75 * scale;
    group.add(trunk);

    // Tree layers — alternating green and thick snow
    for (let i = 0; i < 5; i++) {
      const radius = (2.8 - i * 0.45) * scale;
      const height = (1.8 - i * 0.12) * scale;

      // Green cone (barely visible under snow)
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6),
        this.darkTreeMaterial
      );
      cone.position.y = (2.0 + i * 1.2) * scale;
      cone.rotation.y = this.rng() * Math.PI;
      cone.castShadow = true;
      group.add(cone);

      // Heavy snow layer on every tier
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.85, 0.5 * scale, 6),
        this.snowMaterial
      );
      snow.position.y = (2.4 + i * 1.2) * scale;
      snow.rotation.y = cone.rotation.y;
      group.add(snow);
    }

    // Snow cap on top
    const topSnow = new THREE.Mesh(
      new THREE.SphereGeometry(0.6 * scale, 5, 4, 0, Math.PI * 2, 0, Math.PI * 0.5),
      this.snowMaterial
    );
    topSnow.position.y = (7.5) * scale;
    group.add(topSnow);

    return group;
  }

  createBackcountryJump(feet) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const rampHeight = 2.0 * scale;
    const rampLength = 5.0 * scale;
    const rampWidth = 4.0 * scale;
    const halfW = rampWidth / 2;

    const segments = 8;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const px = t * rampLength;
      const py = rampHeight * Math.pow(t, 0.7);
      shape.lineTo(px, py);
    }
    // Backside drops down smoothly — natural snow mound shape
    shape.lineTo(rampLength * 1.1, rampHeight * 0.6);
    shape.lineTo(rampLength * 1.2, 0);
    shape.lineTo(0, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: rampWidth, bevelEnabled: false,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-halfW, 0, rampLength / 2);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.snowMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  createNaturalMound(feet) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const moundHeight = 1.8 * scale;
    const moundWidth = 4.0 * scale;
    const moundLength = 5.0 * scale;

    // Organic snow mound shape using extruded profile
    const segments = 10;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    // Gradual ramp up — more natural than a man-made kicker
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Asymmetric profile: gentle rise, steeper lip
      const px = t * moundLength;
      const py = moundHeight * Math.sin(t * Math.PI * 0.55);
      shape.lineTo(px, py);
    }
    // Back side rolls off naturally
    shape.lineTo(moundLength * 1.15, moundHeight * 0.4);
    shape.lineTo(moundLength * 1.3, 0);
    shape.lineTo(0, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: moundWidth, bevelEnabled: false,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-moundWidth / 2, 0, moundLength / 2);

    // Distort vertices for organic feel
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      // Wobble edges for natural snow shape
      pos.setX(i, vx + Math.sin(vz * 1.8 + vy * 2.5) * 0.2 * scale);
      pos.setZ(i, vz + Math.cos(vx * 2.1 + vy * 1.3) * 0.15 * scale);
    }
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.snowMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

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
      pole.castShadow = true;
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

    const finishMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
    });
    const finishMatDark = new THREE.MeshStandardMaterial({
      color: 0x111111,
    });

    for (const side of [-gateWidth / 2, gateWidth / 2]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, poleHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6, roughness: 0.2 })
      );
      pole.position.set(side, poleHeight / 2, 0);
      pole.castShadow = true;
      group.add(pole);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 0.3 })
      );
      sphere.position.set(side, poleHeight + 0.4, 0);
      group.add(sphere);
    }

    const crossbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, gateWidth, 8),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6, roughness: 0.2 })
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.y = poleHeight;
    crossbar.castShadow = true;
    group.add(crossbar);

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
        tile.material.side = THREE.DoubleSide;
        group.add(tile);
      }
    }

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

  // ---- TERRAIN LIFECYCLE ----

  update(playerZ) {
    // Generate chunks ahead of the player (keep generateRadius ahead)
    const playerChunkIdx = Math.floor(-playerZ / this.chunkLength);
    const target = Math.min(playerChunkIdx + this.generateRadius + 1, this.config.totalChunks);
    while (this.chunksGenerated < target) {
      this.generateChunk();
    }

    // Remove chunks far behind the player
    while (
      this.chunks.length > 0 &&
      this.chunks[0].zOffset > playerZ + this.chunkLength * 2
    ) {
      const old = this.chunks.shift();
      this._disposeChunk(old);
      // Clean up obstacles belonging to this chunk
      if (old.chunkObstacles && old.chunkObstacles.length > 0) {
        const toRemove = new Set(old.chunkObstacles);
        this.obstacles = this.obstacles.filter(o => !toRemove.has(o));
      }
      // Clean up ramps belonging to this chunk
      if (old.chunkRamps && old.chunkRamps.length > 0) {
        const toRemove = new Set(old.chunkRamps);
        this.ramps = this.ramps.filter(r => !toRemove.has(r));
      }
    }
  }

  // Reset terrain back to initial state (for respawn / restart)
  reset(spawnZ = 0) {
    // Dispose all existing chunks
    for (const chunk of this.chunks) {
      this._disposeChunk(chunk);
    }
    this.chunks = [];
    this.obstacles = [];
    this.ramps = [];
    this.checkpoints = [];
    this.chunksGenerated = 0;
    this.nextCheckpointZ = -this.config.checkpointInterval;

    // Re-seed RNG so terrain is identical
    this.rng = mulberry32(this.config.seed);

    // Generate chunks from the top down to cover the spawn position
    const spawnChunkIdx = Math.floor(-spawnZ / this.chunkLength);
    const target = Math.min(spawnChunkIdx + this.generateRadius + 1, this.config.totalChunks);
    const initialChunks = Math.max(target, Math.min(this.generateRadius, this.config.totalChunks));
    for (let i = 0; i < initialChunks; i++) {
      this.generateChunk();
    }
  }

  // ---- PERMANENT PATH TRACKS (wide rider tracks that mark the corridors) ----
  placePathTracks(chunk, zOffset) {
    if (!this.config.pathCorridors) return;
    const chunkBottomZ = zOffset - this.chunkLength;

    if (!this.trackMaterial) {
      this.trackMaterial = new THREE.MeshBasicMaterial({
        color: 0x9ab0c0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
    }

    // Place multiple parallel tracks per corridor to simulate well-ridden paths
    // Each track is ~4x wider than a standard snowboard trail (0.2 -> 0.8)
    const trackHalfWidth = 0.8;
    // 3 parallel tracks per corridor: center and two offset
    const trackOffsets = [0, -2.2, 2.2];

    for (const corridor of this.config.pathCorridors) {
      const wps = corridor.waypoints;
      for (let wi = 0; wi < wps.length - 1; wi++) {
        const w0 = wps[wi];
        const w1 = wps[wi + 1];
        if (w0.z < chunkBottomZ || w1.z > zOffset) continue;

        const segTopZ = Math.min(w0.z, zOffset);
        const segBotZ = Math.max(w1.z, chunkBottomZ);
        if (segTopZ <= segBotZ) continue;

        // Path tangent for perpendicular offset
        const tdx = w1.x - w0.x;
        const tdz = w1.z - w0.z;
        const tlen = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
        const perpX = -tdz / tlen;
        const perpZ = tdx / tlen;

        for (const offset of trackOffsets) {
          const stepZ = 2.0;
          const steps = Math.max(2, Math.ceil((segTopZ - segBotZ) / stepZ));
          const positions = [];
          const indices = [];

          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const z = segTopZ - t * (segTopZ - segBotZ);
            const segT = (w0.z - z) / (w0.z - w1.z);
            const cx = w0.x + (w1.x - w0.x) * segT + perpX * offset;
            const cz = z + perpZ * offset;
            const y = this.computeHeight(cx, cz) + 0.04;

            positions.push(
              cx - perpX * trackHalfWidth, y, cz - perpZ * trackHalfWidth,
              cx + perpX * trackHalfWidth, y, cz + perpZ * trackHalfWidth,
            );

            if (s > 0) {
              const vi = (s - 1) * 2;
              indices.push(vi, vi + 1, vi + 2);
              indices.push(vi + 2, vi + 1, vi + 3);
            }
          }

          if (positions.length < 6) continue;

          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geo.setIndex(indices);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, this.trackMaterial);
          mesh.frustumCulled = false;
          this.scene.add(mesh);
          chunk.objects.push(mesh);
        }
      }
    }
  }

  // ---- PATH CORRIDOR HELPER ----
  isInPathCorridor(x, globalZ) {
    const cfg = this.config;
    if (!cfg.pathCorridors) return false;
    for (const corridor of cfg.pathCorridors) {
      const wps = corridor.waypoints;
      for (let i = 0; i < wps.length - 1; i++) {
        const w0 = wps[i];
        const w1 = wps[i + 1];
        if (globalZ <= w0.z && globalZ >= w1.z) {
          const t = (w0.z - globalZ) / (w0.z - w1.z);
          const corridorX = w0.x + (w1.x - w0.x) * t;
          if (Math.abs(x - corridorX) < corridor.width / 2) return true;
          break;
        }
      }
    }
    return false;
  }

  // ---- ROOT DROPS / STUMPS / ROOT RAILS ----
  placeRootDrops(chunk, zOffset) {
    if (!this.config.rootDrops) return;
    const chunkBottomZ = zOffset - this.chunkLength;
    for (const rd of this.config.rootDrops) {
      if (rd.z > zOffset || rd.z < chunkBottomZ) continue;
      const y = this.computeHeight(rd.x, rd.z);

      if (rd.type === 'stump') {
        const stump = this.createTreeStump(rd.height, rd.radius);
        stump.position.set(rd.x, y, rd.z);
        this.scene.add(stump);
        chunk.objects.push(stump);
        const obs = { position: new THREE.Vector3(rd.x, y, rd.z), radius: rd.radius, type: 'stump' };
        this.obstacles.push(obs);
        chunk.chunkObstacles.push(obs);
      } else if (rd.type === 'rootMound') {
        const mound = this.createRootMound(rd.feet);
        const scale = rd.feet / 30;
        const width = 3.0 * scale;
        const length = 3.5 * scale;
        const lipHeight = 1.0 * scale;
        let minY = Infinity;
        for (const sx of [-width / 2, 0, width / 2]) {
          for (const sz of [-length / 2, 0, length / 2]) {
            const h = this.computeHeight(rd.x + sx, rd.z + sz);
            if (h < minY) minY = h;
          }
        }
        mound.position.set(rd.x, minY - 0.1, rd.z);
        this.scene.add(mound);
        chunk.objects.push(mound);
        this.ramps.push({
          mesh: mound,
          position: new THREE.Vector3(rd.x, minY - 0.1, rd.z),
          type: 'kicker', width, length, size: 'small',
          lipHeight, lipAngle: 0.35, surfaceHeight: 0,
        });
      } else if (rd.type === 'rootRail') {
        const rootLog = this.createRootRail(rd.length);
        rootLog.position.set(rd.x, y, rd.z);
        rootLog.rotation.y = rd.angle || 0;
        this.scene.add(rootLog);
        chunk.objects.push(rootLog);
        const cosA = Math.cos(rd.angle || 0);
        const sinA = Math.sin(rd.angle || 0);
        this.ramps.push({
          mesh: rootLog,
          position: new THREE.Vector3(rd.x, y, rd.z),
          type: 'rail', width: 1.2,
          length: rd.length * Math.abs(cosA) + 0.5 * Math.abs(sinA),
          surfaceHeight: 0.35, lipHeight: 0, lipAngle: 0,
        });
      }
    }
  }

  createTreeStump(height, radius) {
    const group = new THREE.Group();
    const stumpGeo = new THREE.CylinderGeometry(radius, radius * 1.2, height, 8);
    const pos = stumpGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > height * 0.3) {
        pos.setX(v, pos.getX(v) + (this.rng() - 0.5) * 0.1);
        pos.setZ(v, pos.getZ(v) + (this.rng() - 0.5) * 0.1);
      }
    }
    stumpGeo.computeVertexNormals();
    const stump = new THREE.Mesh(stumpGeo, this.logMaterial);
    stump.position.y = height / 2;
    stump.castShadow = true;
    group.add(stump);
    // Snow cap
    const snowCap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius * 1.0, 0.15, 8),
      this.snowMaterial
    );
    snowCap.position.y = height + 0.07;
    group.add(snowCap);
    // Root bumps at base
    const rootCount = 2 + Math.floor(this.rng() * 2);
    for (let r = 0; r < rootCount; r++) {
      const angle = (r / rootCount) * Math.PI * 2 + this.rng() * 0.5;
      const root = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + this.rng() * 0.1, 4, 3),
        this.logMaterial
      );
      root.position.set(Math.cos(angle) * (radius + 0.1), 0.05, Math.sin(angle) * (radius + 0.1));
      root.scale.y = 0.5;
      group.add(root);
    }
    return group;
  }

  createRootMound(feet) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const moundH = 0.8 * scale;
    const moundR = 2.0 * scale;
    const geo = new THREE.SphereGeometry(moundR, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setY(v, pos.getY(v) * (moundH / moundR));
      pos.setX(v, pos.getX(v) + (this.rng() - 0.5) * 0.15);
      pos.setZ(v, pos.getZ(v) + (this.rng() - 0.5) * 0.15);
    }
    geo.computeVertexNormals();
    const mound = new THREE.Mesh(geo, this.snowMaterial);
    mound.castShadow = true;
    group.add(mound);
    // Exposed root ribs
    const ribCount = 2 + Math.floor(this.rng() * 2);
    for (let r = 0; r < ribCount; r++) {
      const ribAngle = this.rng() * Math.PI * 2;
      const rib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, moundR * 0.8, 4),
        this.logMaterial
      );
      rib.rotation.z = Math.PI / 2 - 0.3;
      rib.rotation.y = ribAngle;
      rib.position.set(Math.cos(ribAngle) * moundR * 0.3, moundH * 0.4, Math.sin(ribAngle) * moundR * 0.3);
      group.add(rib);
    }
    return group;
  }

  createRootRail(length) {
    const group = new THREE.Group();
    const rootRadius = 0.15 + this.rng() * 0.05;
    const rootGeo = new THREE.CylinderGeometry(rootRadius, rootRadius * 1.3, length, 6);
    const pos = rootGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setX(v, pos.getX(v) + Math.sin(pos.getY(v) * 3) * 0.05);
      pos.setZ(v, pos.getZ(v) + Math.cos(pos.getY(v) * 2.7) * 0.05);
    }
    rootGeo.computeVertexNormals();
    const rootMesh = new THREE.Mesh(rootGeo, this.logMaterial);
    rootMesh.rotation.x = Math.PI / 2;
    rootMesh.position.y = rootRadius;
    rootMesh.castShadow = true;
    group.add(rootMesh);
    // Offshooting roots
    const offCount = 3 + Math.floor(this.rng() * 3);
    for (let o = 0; o < offCount; o++) {
      const offZ = (this.rng() - 0.5) * length * 0.8;
      const offshoot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.04, 0.5 + this.rng() * 0.3, 3),
        this.logMaterial
      );
      offshoot.position.set((this.rng() > 0.5 ? 1 : -1) * (rootRadius + 0.1), rootRadius * 0.5, offZ);
      offshoot.rotation.z = (this.rng() - 0.5) * 0.8;
      group.add(offshoot);
    }
    return group;
  }

  // ---- GAP JUMPS — wide dirt mound jumps with landings to clear ----
  placeGapJumps(chunk, zOffset) {
    if (!this.config.gapJumps) return;
    const chunkBottomZ = zOffset - this.chunkLength;
    for (const gj of this.config.gapJumps) {
      if (gj.z > zOffset || gj.z < chunkBottomZ) continue;
      const scale = gj.feet / 30;
      const lipHeight = 3.5 * scale;

      const rampL = 8.0 * scale;
      const rampW = 12.0 * scale;
      const landLocalZ = -rampL * 0.6 - gj.gapLength;
      const landL = rampL * 0.8;
      const landH = lipHeight * 0.7;

      // Compute ground height at landing Z to fix the visual position
      const centerY = this.computeHeight(gj.x, gj.z);
      const landWorldZ = gj.z + landLocalZ;
      const landGroundY = this.computeHeight(gj.x, landWorldZ);

      const feature = this.createGapJump(gj.feet, gj.gapLength, centerY - landGroundY);
      feature.position.set(gj.x, centerY, gj.z);
      this.scene.add(feature);
      chunk.objects.push(feature);
      // Takeoff ramp — hitbox matches visual footprint
      this.ramps.push({
        mesh: feature,
        position: new THREE.Vector3(gj.x, centerY, gj.z),
        type: 'kicker', width: rampW, length: rampL, size: 'small',
        lipHeight, lipAngle: 0.55, surfaceHeight: 0,
      });
      // Landing ramp — solid surface on the ground past the gap
      this.ramps.push({
        mesh: feature,
        position: new THREE.Vector3(gj.x, landGroundY, landWorldZ - landL * 0.3),
        type: 'kicker', width: rampW * 0.9, length: landL, size: 'small',
        lipHeight: landH, lipAngle: 0.3, surfaceHeight: 0,
      });
    }
  }

  createGapJump(feet, gapLength, landingYDrop = 0) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const rampW = 12.0 * scale;
    const rampL = 8.0 * scale;
    const lipH = 3.5 * scale;

    // === TAKEOFF RAMP — proper kicker shape ===
    const segs = 10;
    const takeoffShape = new THREE.Shape();
    takeoffShape.moveTo(0, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      takeoffShape.lineTo(t * rampL, lipH * Math.pow(t, 0.65));
    }
    // Lip rolls over and drops away
    takeoffShape.lineTo(rampL * 1.05, lipH * 0.85);
    takeoffShape.lineTo(rampL * 1.1, lipH * 0.4);
    takeoffShape.lineTo(rampL * 1.12, 0);
    takeoffShape.lineTo(0, 0);

    const takeoffGeo = new THREE.ExtrudeGeometry(takeoffShape, {
      depth: rampW, bevelEnabled: false,
    });
    takeoffGeo.rotateY(Math.PI / 2);
    takeoffGeo.translate(-rampW / 2, 0, rampL / 2);
    takeoffGeo.computeVertexNormals();
    const takeoffMesh = new THREE.Mesh(takeoffGeo, this.snowMaterial);
    takeoffMesh.castShadow = true;
    takeoffMesh.receiveShadow = true;
    group.add(takeoffMesh);

    // === LANDING RAMP — downslope mound past the gap ===
    const landW = rampW * 0.9;
    const landL = rampL * 0.8;
    const landH = lipH * 0.7;
    const landZ = -rampL * 0.6 - gapLength;

    const landShape = new THREE.Shape();
    landShape.moveTo(0, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Inverted — tall at front, slopes down (landing transition)
      landShape.lineTo(t * landL, landH * (1 - Math.pow(t, 1.5)));
    }
    landShape.lineTo(landL, 0);
    landShape.lineTo(0, 0);

    const landGeo = new THREE.ExtrudeGeometry(landShape, {
      depth: landW, bevelEnabled: false,
    });
    landGeo.rotateY(Math.PI / 2);
    landGeo.translate(-landW / 2, 0, 0);
    landGeo.computeVertexNormals();
    const landMesh = new THREE.Mesh(landGeo, this.snowMaterial);
    landMesh.position.set(0, -landingYDrop, landZ);
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    group.add(landMesh);

    return group;
  }

  // ---- HIP JUMPS — MTB style angled takeoff ----
  placeHipJumps(chunk, zOffset) {
    if (!this.config.hipJumps) return;
    const chunkBottomZ = zOffset - this.chunkLength;
    for (const hj of this.config.hipJumps) {
      if (hj.z > zOffset || hj.z < chunkBottomZ) continue;
      const scale = hj.feet / 30;
      const lipHeight = 3.0 * scale;

      const feature = this.createHipJump(hj.feet, hj.hipDirection, hj.hipAngle);
      const centerY = this.computeHeight(hj.x, hj.z);
      feature.position.set(hj.x, centerY, hj.z);
      // No rotation — the asymmetric shape already handles the hip direction
      this.scene.add(feature);
      chunk.objects.push(feature);
      // Hitbox matches visual: rampW=9, rampL=7
      this.ramps.push({
        mesh: feature,
        position: new THREE.Vector3(hj.x, centerY, hj.z),
        type: 'kicker', width: 9.0 * scale, length: 7.0 * scale, size: 'small',
        lipHeight, lipAngle: 0.48, surfaceHeight: 0,
      });
    }
  }

  createHipJump(feet, hipDirection, hipAngle) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const rampW = 9.0 * scale;
    const rampL = 7.0 * scale;
    const lipH = 3.2 * scale;

    // Asymmetric kicker shape — one side taller like a hip/berm
    const segs = 10;
    const slices = 8;
    const sideSign = hipDirection === 'left' ? -1 : 1;

    // Build custom geometry with asymmetric height across width
    const positions = [];
    const indices = [];
    for (let si = 0; si <= slices; si++) {
      const sx = (si / slices - 0.5) * rampW;
      // Hip side is taller
      const hipBoost = 1.0 + (sx * sideSign / rampW) * 0.5;
      const localLipH = lipH * Math.max(0.4, hipBoost);
      for (let ti = 0; ti <= segs; ti++) {
        const t = ti / segs;
        const pz = (0.5 - t) * rampL; // front to back
        let py;
        if (t <= 0.85) {
          py = localLipH * Math.pow(t / 0.85, 0.65);
        } else {
          // Lip rollover
          const fallT = (t - 0.85) / 0.15;
          py = localLipH * (1 - fallT * fallT * 0.8);
        }
        positions.push(sx, py, pz);
      }
    }
    // Ground ring around the base
    for (let si = 0; si <= slices; si++) {
      const sx = (si / slices - 0.5) * rampW;
      positions.push(sx, 0, rampL * 0.5);   // front ground
    }

    // Build faces
    const cols = segs + 1;
    for (let si = 0; si < slices; si++) {
      for (let ti = 0; ti < segs; ti++) {
        const a = si * cols + ti;
        const b = a + 1;
        const c = (si + 1) * cols + ti;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.snowMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
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

  // Clean up everything when switching back to park
  dispose() {
    for (const chunk of this.chunks) {
      this._disposeChunk(chunk);
    }
    this.chunks = [];
    this.obstacles = [];
    this.ramps = [];
    this.checkpoints = [];
  }
}
