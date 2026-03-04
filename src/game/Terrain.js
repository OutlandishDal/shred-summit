import * as THREE from 'three';

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];
    this.chunkLength = 300;
    this.chunkWidth = 120;
    this.slopeAngle = 0.28;
    this.chunksGenerated = 0;
    this.obstacles = [];
    this.ramps = [];
    this.checkpoints = [];
    this.checkpointInterval = 600;
    this.nextCheckpointZ = -300;

    // Procedural snow normal map — wind-blown ripples
    this.snowNormalMap = this.createSnowNormalMap();
    this.snowRoughnessMap = this.createSnowRoughnessMap();

    // Materials — smooth, realistic snow with normal + roughness maps
    this.snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeaf0f6, roughness: 0.75, metalness: 0.02,
      normalMap: this.snowNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughnessMap: this.snowRoughnessMap,
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

    for (let i = 0; i < 5; i++) {
      this.generateChunk();
    }
  }

  generateChunk() {
    const zOffset = -this.chunksGenerated * this.chunkLength;
    const yOffset = -this.chunksGenerated * this.chunkLength * this.slopeAngle;

    // Higher resolution for smooth snow surface
    const geometry = new THREE.PlaneGeometry(this.chunkWidth, this.chunkLength, 120, 120);
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

    const chunk = { mesh, zOffset, yOffset, objects: [] };

    // Trees
    const treeCount = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < treeCount; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const edgeBias = Math.random() < 0.7;
      const x = edgeBias
        ? side * (28 + Math.random() * 25)
        : (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);
      if (Math.abs(x) < 8) continue;

      const tree = this.createPineTree();
      tree.position.set(x, y, globalZ);
      this.scene.add(tree);
      chunk.objects.push(tree);
      this.obstacles.push({
        position: new THREE.Vector3(x, y, globalZ),
        radius: 1.2, type: 'tree',
      });
    }

    // Rocks
    const rockCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < rockCount; i++) {
      const x = (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ);
      if (Math.abs(x) < 6) continue;

      const rock = this.createRock();
      rock.position.set(x, y, globalZ);
      this.scene.add(rock);
      chunk.objects.push(rock);
      this.obstacles.push({
        position: new THREE.Vector3(x, y, globalZ),
        radius: 2.0, type: 'rock',
      });
    }

    // Features: jumps and rails
    // Determine zone level for this chunk
    const chunkMidZ = zOffset - this.chunkLength / 2;
    const zoneLevel = this.getZoneLevel(chunkMidZ);

    const featureCount = zoneLevel === 2
      ? 6 + Math.floor(Math.random() * 4)   // 6-9 features for competition course
      : 5 + Math.floor(Math.random() * 4);  // 5-8 features for freeride

    for (let i = 0; i < featureCount; i++) {
      const x = zoneLevel === 2
        ? (Math.random() - 0.5) * 45   // wider spread for bigger features
        : (Math.random() - 0.5) * 35;
      const z = -20 - Math.random() * (this.chunkLength - 40);
      const roll = Math.random();

      let feature, type, width, length, size;

      // Extra data for physics
      let lipHeight = 0, lipAngle = 0, surfaceHeight = 0;

      if (zoneLevel === 2) {
        // ===== LEVEL 2: Competition slopestyle course =====
        // Bigger jumps (2.5x), longer & wider rails, more complex rail types
        const ws = 3; // rail width scale

        if (roll < 0.10) {
          feature = this.createJump(75);
          type = 'kicker'; width = 10; length = 12.5; size = 'medium';
          lipHeight = 5.0; lipAngle = 0.45;
        } else if (roll < 0.20) {
          feature = this.createJump(100);
          type = 'kicker'; width = 12.5; length = 17.5; size = 'big';
          lipHeight = 6.75; lipAngle = 0.55;
        } else if (roll < 0.27) {
          feature = this.createJump(125);
          type = 'kicker'; width = 15; length = 22.5; size = 'big';
          lipHeight = 8.25; lipAngle = 0.62;
        } else if (roll < 0.32) {
          feature = this.createJump(150);
          type = 'kicker'; width = 17.5; length = 27.5; size = 'big';
          lipHeight = 10.0; lipAngle = 0.65;
        } else if (roll < 0.40) {
          const rs = 3 + Math.random() * 4;
          feature = this.createFlatRail(rs, ws);
          type = 'rail'; width = 1.5 * ws; length = 8 * rs; surfaceHeight = 1.2;
        } else if (roll < 0.47) {
          const rs = 3 + Math.random() * 4;
          feature = this.createDownRail(rs, ws);
          type = 'rail'; width = 1.5 * ws; length = 10 * rs; surfaceHeight = 1.5;
        } else if (roll < 0.55) {
          const rs = 3 + Math.random() * 4;
          feature = this.createRainbowRail(rs, ws);
          type = 'rail'; width = 1.5 * ws; length = 10 * rs; surfaceHeight = 2.0;
        } else if (roll < 0.65) {
          const rs = 3 + Math.random() * 4;
          feature = this.createFlatDownFlatRail(rs, ws);
          type = 'rail'; width = 1.5 * ws; length = 12 * rs; surfaceHeight = 1.5;
        } else if (roll < 0.73) {
          const rs = 3 + Math.random() * 4;
          feature = this.createBox(rs, ws);
          type = 'rail'; width = 2 * ws; length = 8 * rs; surfaceHeight = 1.0;
        } else if (roll < 0.85) {
          const rs = 3 + Math.random() * 4;
          feature = this.createCRail(rs, ws);
          type = 'rail'; width = 2 * ws; length = 10 * rs; surfaceHeight = 1.3;
        } else {
          const rs = 3 + Math.random() * 4;
          feature = this.createKinkRail(rs, ws);
          type = 'rail'; width = 1.5 * ws; length = 10 * rs; surfaceHeight = 1.8;
        }
      } else {
        // ===== LEVEL 1: Freeride course (current sizes) =====
        if (roll < 0.15) {
          feature = this.createJump(30);
          type = 'kicker'; width = 4; length = 5; size = 'small';
          lipHeight = 2.0; lipAngle = 0.45;
        } else if (roll < 0.3) {
          feature = this.createJump(40);
          type = 'kicker'; width = 5; length = 7; size = 'medium';
          lipHeight = 2.7; lipAngle = 0.55;
        } else if (roll < 0.4) {
          feature = this.createJump(50);
          type = 'kicker'; width = 6; length = 9; size = 'big';
          lipHeight = 3.3; lipAngle = 0.62;
        } else if (roll < 0.47) {
          feature = this.createJump(60);
          type = 'kicker'; width = 7; length = 11; size = 'big';
          lipHeight = 4.0; lipAngle = 0.65;
        } else if (roll < 0.57) {
          const rs = 2 + Math.random() * 3;
          feature = this.createFlatRail(rs);
          type = 'rail'; width = 1.5; length = 8 * rs; surfaceHeight = 1.2;
        } else if (roll < 0.65) {
          const rs = 2 + Math.random() * 3;
          feature = this.createDownRail(rs);
          type = 'rail'; width = 1.5; length = 10 * rs; surfaceHeight = 1.5;
        } else if (roll < 0.73) {
          const rs = 2 + Math.random() * 3;
          feature = this.createRainbowRail(rs);
          type = 'rail'; width = 1.5; length = 10 * rs; surfaceHeight = 2.0;
        } else if (roll < 0.8) {
          const rs = 2 + Math.random() * 3;
          feature = this.createFlatDownFlatRail(rs);
          type = 'rail'; width = 1.5; length = 12 * rs; surfaceHeight = 1.5;
        } else if (roll < 0.87) {
          const rs = 2 + Math.random() * 3;
          feature = this.createBox(rs);
          type = 'rail'; width = 2; length = 8 * rs; surfaceHeight = 1.0;
        } else if (roll < 0.93) {
          const rs = 2 + Math.random() * 3;
          feature = this.createCRail(rs);
          type = 'rail'; width = 2; length = 10 * rs; surfaceHeight = 1.3;
        } else {
          const rs = 2 + Math.random() * 3;
          feature = this.createKinkRail(rs);
          type = 'rail'; width = 1.5; length = 10 * rs; surfaceHeight = 1.8;
        }
      }

      // Sample min height across the feature footprint and sink slightly to embed in snow
      const halfW = width / 2;
      const halfL = length / 2;
      const featureGlobalZ = zOffset + z;
      let minY = Infinity;
      for (const sx of [-halfW, 0, halfW]) {
        for (const sz of [-halfL, -halfL / 2, 0, halfL / 2, halfL]) {
          const h = this.computeHeight(x + sx, featureGlobalZ + sz);
          if (h < minY) minY = h;
        }
      }
      minY -= 0.3; // sink into snow so edges never float

      feature.position.set(x, minY, featureGlobalZ);
      this.scene.add(feature);
      chunk.objects.push(feature);
      this.ramps.push({
        mesh: feature,
        position: new THREE.Vector3(x, minY, featureGlobalZ),
        type, width, length, size, lipHeight, lipAngle, surfaceHeight,
      });
    }

    // Checkpoints
    while (this.nextCheckpointZ > zOffset - this.chunkLength) {
      const cpZ = this.nextCheckpointZ;
      const cpY = this.computeHeight(0, cpZ);
      const cpNumber = this.checkpoints.length + 1;
      const isFinish = cpNumber === 8;
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

    // Snow sparkles — tiny glints on the surface
    this.createSnowSparkles(chunk, zOffset);

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
    return globalZ <= -2400 ? 2 : 1;
  }

  // --- JUMPS (sized by "feet" — 30, 40, 50, 60) ---

  createJump(feet) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const rampHeight = 2.0 * scale;
    const rampLength = 5.0 * scale;
    const rampWidth = 4.0 * scale;
    const halfW = rampWidth / 2;
    const lipThick = 0.3 * scale;

    // Curved ramp profile — smooth transition like a real kicker
    const segments = 10;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(rampLength * 0.15, 0); // flat approach
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const px = rampLength * 0.15 + t * rampLength * 0.85;
      const py = rampHeight * Math.pow(t, 0.65); // smooth ease-in curve
      shape.lineTo(px, py);
    }
    shape.lineTo(rampLength + lipThick, rampHeight); // flat lip
    shape.lineTo(rampLength + lipThick, rampHeight * 0.3); // back drops down
    shape.lineTo(rampLength * 0.85, 0);
    shape.lineTo(0, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: rampWidth, bevelEnabled: false,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-halfW, 0, rampLength / 2);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.rampMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Snow side walls
    for (const side of [-1, 1]) {
      const wallShape = new THREE.Shape();
      wallShape.moveTo(0, 0);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const wz = -rampLength / 2 + t * rampLength;
        const wy = rampHeight * Math.pow(t, 0.65) + 0.2 * scale;
        wallShape.lineTo(wz + rampLength / 2, wy);
      }
      wallShape.lineTo(rampLength, 0);
      wallShape.lineTo(0, 0);

      const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
        depth: 0.3 * scale, bevelEnabled: false,
      });
      wallGeo.rotateY(Math.PI / 2);
      wallGeo.translate(side * (halfW + 0.15 * scale), 0, rampLength / 2);
      const wall = new THREE.Mesh(wallGeo, this.snowMaterial);
      wall.castShadow = true;
      group.add(wall);
    }

    // Size label pole
    const labelPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, rampHeight + 2, 6),
      this.poleMaterial
    );
    labelPole.position.set(halfW + 0.8, (rampHeight + 2) / 2, -rampLength * 0.4);
    group.add(labelPole);

    return group;
  }

  // --- RAIL TYPES ---

  createFlatRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 8 * lengthScale;
    const railHeight = 1.2;

    // Posts (scale count with length)
    const postCount = Math.max(3, Math.round(2 * lengthScale) + 1);
    for (let i = 0; i < postCount; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.08 * widthScale, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(0, railHeight / 2, -railLength / 2 + i * (railLength / (postCount - 1)));
      post.castShadow = true;
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

    return group;
  }

  createDownRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railLength = 10 * lengthScale;
    const startHeight = 2.0;
    const endHeight = 0.8;

    // Posts at varying heights (scale count with length)
    const postCount = Math.max(4, Math.round(3 * lengthScale) + 1);
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const h = THREE.MathUtils.lerp(startHeight, endHeight, t);
      const z = -railLength / 2 + i * (railLength / (postCount - 1));
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.08 * widthScale, h, 6),
        this.rockMaterial
      );
      post.position.set(0, h / 2, z);
      post.castShadow = true;
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

    return group;
  }

  createRainbowRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const segments = Math.round(16 * lengthScale);
    const railLength = 10 * lengthScale;
    const peakHeight = 2.5;

    // Create curved rail using segments
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      const z1 = -railLength / 2 + t1 * railLength;
      const z2 = -railLength / 2 + t2 * railLength;
      const y1 = Math.sin(t1 * Math.PI) * peakHeight + 0.5;
      const y2 = Math.sin(t2 * Math.PI) * peakHeight + 0.5;

      const segLen = Math.sqrt((z2 - z1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, z2 - z1);

      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, segLen, 6),
        this.paintedMetalMaterial
      );
      seg.rotation.x = Math.PI / 2 - angle;
      seg.position.set(0, (y1 + y2) / 2, (z1 + z2) / 2);
      seg.castShadow = true;
      group.add(seg);
    }

    // Support posts
    for (const t of [0.15, 0.5, 0.85]) {
      const z = -railLength / 2 + t * railLength;
      const y = Math.sin(t * Math.PI) * peakHeight + 0.5;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * widthScale, 0.07 * widthScale, y, 6),
        this.rockMaterial
      );
      post.position.set(0, y / 2, z);
      group.add(post);
    }

    return group;
  }

  createFlatDownFlatRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const totalLength = 12 * lengthScale;
    const flatLen = 3 * lengthScale;
    const railHeight = 1.5;
    const dropHeight = 0.7;

    // First flat section
    const flat1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flatLen, 8),
      this.metalMaterial
    );
    flat1.rotation.x = Math.PI / 2;
    flat1.position.set(0, railHeight, -totalLength / 2 + flatLen / 2);
    flat1.castShadow = true;
    group.add(flat1);

    // Down section
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

    // Second flat section
    const flat2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flatLen, 8),
      this.metalMaterial
    );
    flat2.rotation.x = Math.PI / 2;
    flat2.position.set(0, railHeight - dropHeight, totalLength / 2 - flatLen / 2);
    flat2.castShadow = true;
    group.add(flat2);

    // Posts
    for (const z of [-totalLength / 2, -flatLen / 2, flatLen / 2, totalLength / 2]) {
      const t = (z + totalLength / 2) / totalLength;
      const h = t < 0.3 ? railHeight : railHeight - dropHeight * ((t - 0.3) / 0.7);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * widthScale, 0.07 * widthScale, Math.max(h, 0.3), 6),
        this.rockMaterial
      );
      post.position.set(0, Math.max(h, 0.3) / 2, z);
      group.add(post);
    }

    return group;
  }

  createBox(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const boxLength = 8 * lengthScale;
    const boxWidth = 1.2 * widthScale;
    const boxHeight = 1.0;

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

    return group;
  }

  createCRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railHeight = 1.3;
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
        new THREE.CylinderGeometry(0.05 * widthScale, 0.07 * widthScale, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(pos[0], railHeight / 2, pos[1]);
      group.add(post);
    }

    return group;
  }

  createKinkRail(lengthScale = 1, widthScale = 1) {
    const group = new THREE.Group();
    const railHeight = 1.8;
    const kinkDrop = 0.6;
    const s = lengthScale;

    // Kink: flat, drop, flat
    const sections = [
      { z1: -5 * s, z2: -1 * s, y: railHeight },
      { z1: -1 * s, z2: 1 * s, y1: railHeight, y2: railHeight - kinkDrop },
      { z1: 1 * s, z2: 5 * s, y: railHeight - kinkDrop },
    ];

    // Flat 1
    const flat1Len = 4 * s;
    const r1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flat1Len, 8),
      this.metalMaterial
    );
    r1.rotation.x = Math.PI / 2;
    r1.position.set(0, railHeight, -3 * s);
    r1.castShadow = true;
    group.add(r1);

    // Kink
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

    // Flat 2
    const flat2Len = 4 * s;
    const r2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * widthScale, 0.06 * widthScale, flat2Len, 8),
      this.metalMaterial
    );
    r2.rotation.x = Math.PI / 2;
    r2.position.set(0, railHeight - kinkDrop, 3 * s);
    r2.castShadow = true;
    group.add(r2);

    // Posts
    for (const z of [-5 * s, -1 * s, 1 * s, 5 * s]) {
      const h = z <= -1 * s ? railHeight : railHeight - kinkDrop;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * widthScale, 0.07 * widthScale, h, 6),
        this.rockMaterial
      );
      post.position.set(0, h / 2, z);
      group.add(post);
    }

    return group;
  }

  createPineTree() {
    const group = new THREE.Group();
    const scale = 0.7 + Math.random() * 0.8;
    const mat = Math.random() > 0.5 ? this.treeMaterial : this.darkTreeMaterial;

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
      cone.rotation.y = Math.random() * Math.PI;
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

  createRock() {
    const group = new THREE.Group();
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.DodecahedronGeometry(1.0 + Math.random() * 1.5, 1);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + (Math.random() - 0.5) * 0.4);
        pos.setY(j, pos.getY(j) * 0.5 + (Math.random() - 0.5) * 0.2);
        pos.setZ(j, pos.getZ(j) + (Math.random() - 0.5) * 0.4);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.rockMaterial);
      mesh.position.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
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
      pole.castShadow = true;
      group.add(pole);

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0xff6600, side: THREE.DoubleSide,
          emissive: 0xff4400, emissiveIntensity: 0.6,
        })
      );
      flag.position.set(side + (side > 0 ? -1 : 1) * 0.75, poleHeight - 0.5, 0);
      group.add(flag);
    }

    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 24, 4),
      new THREE.MeshStandardMaterial({
        color: 0x22cc66, emissive: 0x11aa44, emissiveIntensity: 1.0,
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
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8,
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
      pole.castShadow = true;
      group.add(pole);

      // Gold sphere on top
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 1.0 })
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
    crossbar.castShadow = true;
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
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xcc0000, emissiveIntensity: 0.8 })
      );
      marker.position.set(side, 2.5, 0);
      marker.castShadow = true;
      group.add(marker);

      // Red flag
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 1),
        new THREE.MeshStandardMaterial({
          color: 0xff0000, side: THREE.DoubleSide,
          emissive: 0xff2200, emissiveIntensity: 0.8,
        })
      );
      flag.position.set(side + (side > 0 ? -1 : 1) * 1, 4.5, 0);
      group.add(flag);
    }

    // Ground line — bright stripe across the snow
    const groundLine = new THREE.Mesh(
      new THREE.BoxGeometry(gateWidth + 6, 0.05, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 1.0,
      })
    );
    groundLine.position.y = 0.03;
    groundLine.receiveShadow = true;
    group.add(groundLine);

    return group;
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

  createSnowNormalMap() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = 0.02;
        const h1 = Math.sin(x * s * 3.7 + y * s * 2.1) * 0.5;
        const h2 = Math.sin(x * s * 7.3 + y * s * 5.9) * 0.25;
        const h3 = Math.sin(x * s * 13.1 + y * s * 11.7 + h1 * 2) * 0.125;
        const h4 = Math.pow(Math.abs(Math.sin(x * 0.31 + y * 0.47)), 8) * 0.3;

        const eps = 1;
        const hR = Math.sin((x + eps) * s * 3.7 + y * s * 2.1) * 0.5 +
                   Math.sin((x + eps) * s * 7.3 + y * s * 5.9) * 0.25;
        const hU = Math.sin(x * s * 3.7 + (y + eps) * s * 2.1) * 0.5 +
                   Math.sin(x * s * 7.3 + (y + eps) * s * 5.9) * 0.25;

        const dx = (hR - (h1 + h2)) * 4;
        const dy = (hU - (h1 + h2)) * 4;

        const nx = -dx * 0.5 + 0.5;
        const ny = -dy * 0.5 + 0.5;

        const idx = (y * size + x) * 4;
        data[idx] = Math.floor(Math.min(1, Math.max(0, nx)) * 255);
        data[idx + 1] = Math.floor(Math.min(1, Math.max(0, ny)) * 255);
        data[idx + 2] = 192; // nz — mostly pointing up
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  createSnowRoughnessMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const noise = Math.sin(x * 0.05 + y * 0.03) * 0.15 +
                      Math.sin(x * 0.11 + y * 0.07) * 0.1;
        const roughness = Math.floor(Math.min(255, Math.max(0, (0.7 + noise) * 255)));
        const idx = (y * size + x) * 4;
        data[idx] = roughness;
        data[idx + 1] = roughness;
        data[idx + 2] = roughness;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    return texture;
  }

  createSnowSparkles(chunk, zOffset) {
    const sparkleCount = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(sparkleCount * 3);

    for (let i = 0; i < sparkleCount; i++) {
      const x = (Math.random() - 0.5) * this.chunkWidth * 0.8;
      const z = (Math.random() - 0.5) * this.chunkLength;
      const globalZ = zOffset + z;
      const y = this.computeHeight(x, globalZ) + 0.05;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = globalZ;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sparkles = new THREE.Points(geo, mat);
    sparkles.frustumCulled = false;
    this.scene.add(sparkles);
    chunk.objects.push(sparkles);
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
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      for (const obj of old.objects) this.scene.remove(obj);
    }
  }
}
