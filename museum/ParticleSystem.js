/**
 * DustParticleSystem — room-aware floating particles.
 * Room 1–4: warm golden dust motes (discovery, prosperity)
 * Room 5:   embers and sparks (war and fire)
 * Room 6:   dark ash particles (destruction and smoke)
 * Room 7:   soft golden sparkles (legacy and rebirth)
 */

import * as THREE from "three";
import { CONFIG } from "./config.js";

export class DustParticleSystem {
  constructor(scene) {
    const { count, spread, height } = CONFIG.particles;
    this.count  = count;
    this.spread = spread;
    this.height = height;
    this._frame = 0;   // frame counter for GPU-upload throttle

    this.positions  = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this._centerX   = 0;
    this._centerZ   = 0;
    this._lastRoom  = null;
    this._velScale  = 1.0;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.positions[i3]     = (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = Math.random() * height;
      this.positions[i3 + 2] = (Math.random() - 0.5) * spread;
      this.velocities[i3]     = (Math.random() - 0.5) * 0.06;
      this.velocities[i3 + 1] = 0.015 + Math.random() * 0.035;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.06;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.04, color: 0xffecd2,
      transparent: true, opacity: 0.22,
      depthWrite: false, sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    scene.add(this.points);
  }

  update(delta, playerPos, roomId) {
    if (playerPos) {
      this._centerX = playerPos.x;
      this._centerZ = playerPos.z;
    }

    // Switch particle style on room change
    if (roomId && roomId !== this._lastRoom) {
      this._lastRoom = roomId;
      this._adaptToRoom(roomId);
    }

    const pos = this.positions, vel = this.velocities;
    const hs  = this.spread / 2;
    const vs  = this._velScale;
    const isAsh = roomId === "r6";

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      pos[i3]     += vel[i3]     * delta * vs;
      pos[i3 + 1] += vel[i3 + 1] * delta * vs;
      pos[i3 + 2] += vel[i3 + 2] * delta * vs;

      // Ash particles drift randomly and fall slowly
      if (isAsh) {
        vel[i3]     += (Math.random() - 0.5) * 0.004;
        vel[i3 + 2] += (Math.random() - 0.5) * 0.004;
      }

      // Wrap height
      if (pos[i3 + 1] > this.height) {
        pos[i3 + 1] = 0;
        pos[i3]     = this._centerX + (Math.random() - 0.5) * this.spread;
        pos[i3 + 2] = this._centerZ + (Math.random() - 0.5) * this.spread;
      }

      // Clamp velocity drift
      vel[i3]     = Math.max(-0.15, Math.min(0.15, vel[i3]));
      vel[i3 + 2] = Math.max(-0.15, Math.min(0.15, vel[i3 + 2]));

      // Wrap around player
      if (pos[i3]     > this._centerX + hs) pos[i3]     -= this.spread;
      if (pos[i3]     < this._centerX - hs) pos[i3]     += this.spread;
      if (pos[i3 + 2] > this._centerZ + hs) pos[i3 + 2] -= this.spread;
      if (pos[i3 + 2] < this._centerZ - hs) pos[i3 + 2] += this.spread;
    }

    // Upload to GPU every 3 frames — invisible difference, big CPU/bus saving
    this._frame = (this._frame + 1) % 3;
    if (this._frame === 0) {
      this.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  _adaptToRoom(roomId) {
    switch (roomId) {
      case "r1":
        this.material.color.setHex(0xffe8b0);
        this.material.size    = 0.04;
        this.material.opacity = 0.20;
        this._velScale        = 0.9;
        break;
      case "r2":
        this.material.color.setHex(0xffd88a);
        this.material.size    = 0.045;
        this.material.opacity = 0.25;
        this._velScale        = 1.1;
        break;
      case "r3":
        this.material.color.setHex(0xffaa66);
        this.material.size    = 0.042;
        this.material.opacity = 0.20;
        this._velScale        = 1.0;
        break;
      case "r4":
        this.material.color.setHex(0xffe8b0);
        this.material.size    = 0.05;
        this.material.opacity = 0.28;
        this._velScale        = 0.8;
        break;
      case "r5":
        // Sparks and embers
        this.material.color.setHex(0xff8844);
        this.material.size    = 0.055;
        this.material.opacity = 0.35;
        this._velScale        = 1.6;
        break;
      case "r6":
        // Dark ash / soot particles
        this.material.color.setHex(0x888888);
        this.material.size    = 0.05;
        this.material.opacity = 0.38;
        this._velScale        = 1.4;
        break;
      case "r7":
        // Soft golden sparkles
        this.material.color.setHex(0xfff0cc);
        this.material.size    = 0.038;
        this.material.opacity = 0.18;
        this._velScale        = 0.65;
        break;
      default:
        this.material.color.setHex(0xffecd2);
        this.material.size    = 0.04;
        this.material.opacity = 0.22;
        this._velScale        = 1.0;
    }
    this.material.needsUpdate = true;
  }
}
