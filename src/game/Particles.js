import * as THREE from 'three';

export class SnowParticles {
  constructor(scene) {
    this.scene = scene;
    this.particleCount = 500;

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

    for (let i = 0; i < this.particleCount; i++) {
      if (this.lifetimes[i] > 0) {
        this.lifetimes[i] -= dt;

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
