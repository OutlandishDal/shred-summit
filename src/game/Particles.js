import * as THREE from 'three';

// Generate a soft circular particle texture procedurally
function createParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const particleTexture = createParticleTexture();

export class SnowParticles {
  constructor(scene) {
    this.scene = scene;
    this.particleCount = 2000;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);
    const lifetimes = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      sizes[i] = 0;
      lifetimes[i] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.velocities = velocities;
    this.lifetimes = lifetimes;

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      map: particleTexture,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    this.nextParticle = 0;
  }

  emit(position, velocity, count = 5) {
    const positions = this.points.geometry.attributes.position;
    const sizes = this.points.geometry.attributes.size;

    for (let i = 0; i < count; i++) {
      const idx = this.nextParticle;

      positions.setXYZ(
        idx,
        position.x + (Math.random() - 0.5) * 1.5,
        position.y + Math.random() * 0.5,
        position.z + (Math.random() - 0.5) * 1.5
      );

      this.velocities[idx * 3] = (Math.random() - 0.5) * 3 + velocity.x * 0.3;
      this.velocities[idx * 3 + 1] = Math.random() * 3 + 1;
      this.velocities[idx * 3 + 2] = (Math.random() - 0.5) * 3 + velocity.z * 0.1;

      sizes.setX(idx, 0.2 + Math.random() * 0.3);
      this.lifetimes[idx] = 1.0 + Math.random() * 0.5;

      this.nextParticle = (this.nextParticle + 1) % this.particleCount;
    }

    positions.needsUpdate = true;
    sizes.needsUpdate = true;
  }

  update(dt) {
    const positions = this.points.geometry.attributes.position;
    const sizes = this.points.geometry.attributes.size;

    // Wind drift
    const time = performance.now() * 0.001;
    const windX = Math.sin(time * 0.3) * 2.0;
    const windZ = Math.cos(time * 0.5) * 1.0;

    for (let i = 0; i < this.particleCount; i++) {
      if (this.lifetimes[i] > 0) {
        this.lifetimes[i] -= dt;

        // Apply wind
        this.velocities[i * 3] += windX * dt * 0.5;
        this.velocities[i * 3 + 2] += windZ * dt * 0.5;

        positions.setX(i, positions.getX(i) + this.velocities[i * 3] * dt);
        positions.setY(i, positions.getY(i) + this.velocities[i * 3 + 1] * dt);
        positions.setZ(i, positions.getZ(i) + this.velocities[i * 3 + 2] * dt);

        // Gravity on particles
        this.velocities[i * 3 + 1] -= 5 * dt;

        // Fade out
        const life = Math.max(0, this.lifetimes[i]);
        sizes.setX(i, sizes.getX(i) * (0.98 + life * 0.01));

        if (this.lifetimes[i] <= 0) {
          positions.setY(i, -100);
          sizes.setX(i, 0);
        }
      }
    }

    positions.needsUpdate = true;
    sizes.needsUpdate = true;
  }
}

// Ambient falling snowflakes — atmospheric background particles
export class AmbientSnow {
  constructor(scene) {
    this.scene = scene;
    this.count = 800;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      sizes[i] = 0.08 + Math.random() * 0.15;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      map: particleTexture,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Store base Y speeds per particle for variation
    this.fallSpeeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.fallSpeeds[i] = 0.6 + Math.random() * 0.6;
    }
  }

  update(dt, cameraPosition) {
    // Follow camera horizontally
    this.points.position.x = cameraPosition.x;
    this.points.position.z = cameraPosition.z;

    const positions = this.points.geometry.attributes.position;
    const time = performance.now() * 0.001;
    const windX = Math.sin(time * 0.2) * 0.4;
    const windZ = Math.cos(time * 0.35) * 0.2;

    for (let i = 0; i < this.count; i++) {
      let y = positions.getY(i) - this.fallSpeeds[i] * dt;
      let x = positions.getX(i) + windX * dt;
      // Gentle sway
      x += Math.sin(time * 0.5 + i * 0.37) * 0.02;

      // Wrap vertically
      if (y < -5) {
        y = 75 + Math.random() * 5;
        x = (Math.random() - 0.5) * 120;
        positions.setZ(i, (Math.random() - 0.5) * 120);
      }
      positions.setX(i, x);
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }
}
