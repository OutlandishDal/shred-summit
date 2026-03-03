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

      // Gentle, smooth rolling terrain — no moguls
      let height = 0;
      height += Math.sin(x * 0.04 + this.chunksGenerated * 1.7) * 2.0;
      height += Math.sin(z * 0.02 + x * 0.03) * 1.5;
      height += Math.sin(x * 0.08 + z * 0.015) * 0.6;

      // Smooth side walls
      const normalizedX = Math.abs(x) / (this.chunkWidth / 2);
      if (normalizedX > 0.5) {
        height += Math.pow((normalizedX - 0.5) / 0.5, 2.0) * 16;
      }

      height += z * this.slopeAngle;

      positions.setY(i, height);

      // Subtle snow color variation — whites and light blues
      const base = 0.92 + Math.sin(x * 0.1 + z * 0.05) * 0.04;
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
      const y = this.computeLocalHeight(x, z, this.chunksGenerated);
      if (Math.abs(x) < 8) continue;

      const tree = this.createPineTree();
      tree.position.set(x, yOffset + y, zOffset + z);
      this.scene.add(tree);
      chunk.objects.push(tree);
      this.obstacles.push({
        position: new THREE.Vector3(x, yOffset + y, zOffset + z),
        radius: 1.2, type: 'tree',
      });
    }

    // Rocks
    const rockCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < rockCount; i++) {
      const x = (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * this.chunkLength;
      const y = this.computeLocalHeight(x, z, this.chunksGenerated);
      if (Math.abs(x) < 6) continue;

      const rock = this.createRock();
      rock.position.set(x, yOffset + y, zOffset + z);
      this.scene.add(rock);
      chunk.objects.push(rock);
      this.obstacles.push({
        position: new THREE.Vector3(x, yOffset + y, zOffset + z),
        radius: 2.0, type: 'rock',
      });
    }

    // Features: jumps and rails
    const featureCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < featureCount; i++) {
      const x = (Math.random() - 0.5) * 35;
      const z = -20 - Math.random() * (this.chunkLength - 40);
      const y = this.computeLocalHeight(x, z, this.chunksGenerated);
      const roll = Math.random();

      let feature, type, width, length, size;

      // Extra data for physics
      let lipHeight = 0, lipAngle = 0, surfaceHeight = 0;

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
        feature = this.createFlatRail();
        type = 'rail'; width = 1.5; length = 8; surfaceHeight = 1.2;
      } else if (roll < 0.65) {
        feature = this.createDownRail();
        type = 'rail'; width = 1.5; length = 10; surfaceHeight = 1.5;
      } else if (roll < 0.73) {
        feature = this.createRainbowRail();
        type = 'rail'; width = 1.5; length = 10; surfaceHeight = 2.0;
      } else if (roll < 0.8) {
        feature = this.createFlatDownFlatRail();
        type = 'rail'; width = 1.5; length = 12; surfaceHeight = 1.5;
      } else if (roll < 0.87) {
        feature = this.createBox();
        type = 'rail'; width = 2; length = 8; surfaceHeight = 1.0;
      } else if (roll < 0.93) {
        feature = this.createCRail();
        type = 'rail'; width = 2; length = 10; surfaceHeight = 1.3;
      } else {
        feature = this.createKinkRail();
        type = 'rail'; width = 1.5; length = 10; surfaceHeight = 1.8;
      }

      // Place feature flush on the ground
      feature.position.set(x, yOffset + y, zOffset + z);
      this.scene.add(feature);
      chunk.objects.push(feature);
      this.ramps.push({
        mesh: feature,
        position: new THREE.Vector3(x, yOffset + y, zOffset + z),
        type, width, length, size, lipHeight, lipAngle, surfaceHeight,
      });
    }

    // Checkpoints
    while (this.nextCheckpointZ > zOffset - this.chunkLength) {
      const cpZ = this.nextCheckpointZ;
      const cpY = this.computeLocalHeight(0, cpZ - zOffset, this.chunksGenerated);
      const checkpoint = this.createCheckpoint();
      checkpoint.position.set(0, yOffset + cpY, cpZ);
      this.scene.add(checkpoint);
      chunk.objects.push(checkpoint);
      this.checkpoints.push({
        position: new THREE.Vector3(0, yOffset + cpY + 2, cpZ),
        z: cpZ, reached: false, mesh: checkpoint,
      });
      this.nextCheckpointZ -= this.checkpointInterval;
    }

    this.chunks.push(chunk);
    this.chunksGenerated++;
  }

  computeLocalHeight(x, z, chunkIndex) {
    let height = 0;
    height += Math.sin(x * 0.04 + chunkIndex * 1.7) * 2.0;
    height += Math.sin(z * 0.02 + x * 0.03) * 1.5;
    height += Math.sin(x * 0.08 + z * 0.015) * 0.6;
    height += z * this.slopeAngle;
    const normalizedX = Math.abs(x) / (this.chunkWidth / 2);
    if (normalizedX > 0.5) {
      height += Math.pow((normalizedX - 0.5) / 0.5, 2.0) * 16;
    }
    return height;
  }

  // --- JUMPS (sized by "feet" — 30, 40, 50, 60) ---

  createJump(feet) {
    const group = new THREE.Group();
    const scale = feet / 30;
    const rampHeight = 2.0 * scale;
    const rampLength = 5.0 * scale;
    const rampWidth = 4.0 * scale;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(rampLength, 0);
    shape.lineTo(rampLength, rampHeight);
    shape.lineTo(0, 0);

    const extrudeSettings = { depth: rampWidth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(rampWidth / 2, 0, -rampLength / 2);

    const mesh = new THREE.Mesh(geometry, this.rampMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Size label pole
    const labelPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, rampHeight + 2, 4),
      this.poleMaterial
    );
    labelPole.position.set(rampWidth / 2 + 0.5, (rampHeight + 2) / 2, -rampLength / 2);
    group.add(labelPole);

    return group;
  }

  // --- RAIL TYPES ---

  createFlatRail() {
    const group = new THREE.Group();
    const railLength = 8;
    const railHeight = 1.2;

    // Posts
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(0, railHeight / 2, -railLength / 2 + i * (railLength / 2));
      post.castShadow = true;
      group.add(post);
    }

    // Round rail
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, railLength, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = railHeight;
    rail.castShadow = true;
    group.add(rail);

    return group;
  }

  createDownRail() {
    const group = new THREE.Group();
    const railLength = 10;
    const startHeight = 2.0;
    const endHeight = 0.8;

    // Posts at varying heights
    const postCount = 4;
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const h = THREE.MathUtils.lerp(startHeight, endHeight, t);
      const z = -railLength / 2 + i * (railLength / (postCount - 1));
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, h, 6),
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
      new THREE.CylinderGeometry(0.06, 0.06, railLength * 1.05, 8),
      this.metalMaterial
    );
    rail.rotation.x = Math.PI / 2 - angle;
    rail.position.set(0, midY, 0);
    rail.castShadow = true;
    group.add(rail);

    return group;
  }

  createRainbowRail() {
    const group = new THREE.Group();
    const segments = 16;
    const railLength = 10;
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
        new THREE.CylinderGeometry(0.06, 0.06, segLen, 6),
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
        new THREE.CylinderGeometry(0.05, 0.07, y, 6),
        this.rockMaterial
      );
      post.position.set(0, y / 2, z);
      group.add(post);
    }

    return group;
  }

  createFlatDownFlatRail() {
    const group = new THREE.Group();
    const totalLength = 12;
    const flatLen = 3;
    const railHeight = 1.5;
    const dropHeight = 0.7;

    // First flat section
    const flat1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, flatLen, 8),
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
      new THREE.CylinderGeometry(0.06, 0.06, downActual, 8),
      this.rustyMetalMaterial
    );
    down.rotation.x = Math.PI / 2 - downAngle;
    down.position.set(0, railHeight - dropHeight / 2, 0);
    down.castShadow = true;
    group.add(down);

    // Second flat section
    const flat2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, flatLen, 8),
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
        new THREE.CylinderGeometry(0.05, 0.07, Math.max(h, 0.3), 6),
        this.rockMaterial
      );
      post.position.set(0, Math.max(h, 0.3) / 2, z);
      group.add(post);
    }

    return group;
  }

  createBox() {
    const group = new THREE.Group();
    const boxLength = 8;
    const boxWidth = 1.2;
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

  createCRail() {
    const group = new THREE.Group();
    const railHeight = 1.3;
    const segLength = 3.5;

    // C-shaped: forward, sideways, forward
    const segments = [
      { start: [0, 0, -5], end: [0, 0, -1.5] },
      { start: [0, 0, -1.5], end: [2, 0, -1.5] },
      { start: [2, 0, -1.5], end: [2, 0, 5] },
    ];

    for (const seg of segments) {
      const dx = seg.end[0] - seg.start[0];
      const dz = seg.end[2] - seg.start[2];
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, len, 8),
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
    for (const pos of [[0, -5], [0, -1.5], [2, -1.5], [2, 2], [2, 5]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, railHeight, 6),
        this.rockMaterial
      );
      post.position.set(pos[0], railHeight / 2, pos[1]);
      group.add(post);
    }

    return group;
  }

  createKinkRail() {
    const group = new THREE.Group();
    const railHeight = 1.8;
    const kinkDrop = 0.6;

    // Kink: flat, drop, flat
    const sections = [
      { z1: -5, z2: -1, y: railHeight },
      { z1: -1, z2: 1, y1: railHeight, y2: railHeight - kinkDrop },
      { z1: 1, z2: 5, y: railHeight - kinkDrop },
    ];

    // Flat 1
    const r1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
      this.metalMaterial
    );
    r1.rotation.x = Math.PI / 2;
    r1.position.set(0, railHeight, -3);
    r1.castShadow = true;
    group.add(r1);

    // Kink
    const kinkLen = Math.sqrt(4 + kinkDrop ** 2);
    const kinkAngle = Math.atan2(kinkDrop, 2);
    const kink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, kinkLen, 8),
      this.rustyMetalMaterial
    );
    kink.rotation.x = Math.PI / 2 - kinkAngle;
    kink.position.set(0, railHeight - kinkDrop / 2, 0);
    kink.castShadow = true;
    group.add(kink);

    // Flat 2
    const r2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
      this.metalMaterial
    );
    r2.rotation.x = Math.PI / 2;
    r2.position.set(0, railHeight - kinkDrop, 3);
    r2.castShadow = true;
    group.add(r2);

    // Posts
    for (const z of [-5, -1, 1, 5]) {
      const h = z <= -1 ? railHeight : railHeight - kinkDrop;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, h, 6),
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

  getHeightAt(x, z) {
    let height = 0;
    height += Math.sin(x * 0.04 + Math.floor(-z / this.chunkLength) * 1.7) * 2.0;
    height += Math.sin(z * 0.02 + x * 0.03) * 1.5;
    height += Math.sin(x * 0.08 + z * 0.015) * 0.6;
    height += z * this.slopeAngle;

    const normalizedX = Math.abs(x) / (this.chunkWidth / 2);
    if (normalizedX > 0.5) {
      height += Math.pow((normalizedX - 0.5) / 0.5, 2.0) * 16;
    }
    return height;
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
