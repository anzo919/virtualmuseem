/**
 * NPCController — Carthaginian historian guide.
 * Era-aware: slower and quieter in war/destruction rooms,
 * energetic and guiding in commerce and apogee rooms.
 * Follows player through the entire linear museum.
 */

import * as THREE from "three";
import { CONFIG, ROOMS, NPC_DIALOGUES } from "./config.js";

const S = { IDLE: 0, WANDER: 1, OBSERVE: 2, FOLLOW: 3 };

export class NPCController {
  constructor(scene, wallBoxes, artworkPositions) {
    this.scene = scene;
    this.wallBoxes = wallBoxes;
    this.artworkPositions = artworkPositions;

    this.state = S.IDLE;
    this.stateTimer = 2;
    this.velocity = new THREE.Vector3();
    this.targetDir = new THREE.Vector3(1, 0, 0);
    this.targetPos = null;
    this.currentRoom = "r1";

    this.npcNearby = false;
    this.npcAlert  = document.getElementById("npc-alert");
    this.dialogueText = document.getElementById("npc-dialogue-text");

    this._dialogueCooldown = 0;
    this._dialogueTimer    = 0;
    this._spokenInRoom = {};

    // Wander bounds: updated per-room; global bounds for FOLLOW state
    this.wanderBounds  = { minX: -6, maxX: 6, minZ: 70, maxZ: 80 };
    this.globalBounds  = { minX: -12, maxX: 12, minZ: -79, maxZ: 82 };

    this.mesh = this._buildModel();
    this.mesh.position.set(2, 0, 78);
    scene.add(this.mesh);
  }

  // ── Era-aware speed/timing ────────────────────────────────────────────────

  _eraFactor() {
    switch (this.currentRoom) {
      case "r6": return { speed: 0.45, idle: 8, wander: 2 }; // slow, silent in ruins
      case "r5": return { speed: 0.85, idle: 3, wander: 3 }; // tense in war room
      case "r4": return { speed: 1.3, idle: 2, wander: 5 }; // lively at zenith
      case "r2": return { speed: 1.2, idle: 2, wander: 4 }; // busy commerce
      case "r7": return { speed: 0.8, idle: 5, wander: 3 }; // reflective in legacy
      default:   return { speed: 1.0, idle: 3, wander: 4 };
    }
  }

  // ── NPC model (Carthaginian historian in toga) ───────────────────────────

  _buildModel() {
    const g = new THREE.Group();
    const skin   = new THREE.MeshStandardMaterial({ color: 0xc9956a, roughness: 0.65, metalness: 0.05 });
    const toga   = new THREE.MeshStandardMaterial({ color: 0xf5efe4, roughness: 0.75, metalness: 0.02 });
    const inner  = new THREE.MeshStandardMaterial({ color: 0xd2c4ab, roughness: 0.8 });
    const belt   = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6, metalness: 0.1 });
    const buckle = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.5 });
    const hair   = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.9 });
    const eye    = new THREE.MeshStandardMaterial({ color: 0x1a1410 });
    const sandal = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.8 });

    [-0.1, 0.1].forEach(x => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.28), sandal);
      s.position.set(x, 0.025, 0); s.castShadow = true; g.add(s);
    });

    const legG = new THREE.CylinderGeometry(0.07, 0.08, 0.75, 10);
    this.leftLeg  = new THREE.Mesh(legG, skin); this.leftLeg.position.set(-0.1, 0.43, 0); g.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(legG, skin); this.rightLeg.position.set(0.1, 0.43, 0); g.add(this.rightLeg);

    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.55, 12), toga);
    skirt.position.y = 0.88; g.add(skirt);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.65, 12), toga);
    torso.position.y = 1.38; g.add(torso);
    const nkl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.12, 12), inner);
    nkl.position.y = 1.72; g.add(nkl);
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.28), inner);
    drape.position.set(-0.08, 1.35, 0.05); drape.rotation.z = 0.3; g.add(drape);
    const beltM = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 12), belt);
    beltM.position.y = 1.1; g.add(beltM);
    const buck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.05), buckle);
    buck.position.set(0, 1.1, 0.22); g.add(buck);

    [-0.24, 0.24].forEach(x => {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toga);
      sh.position.set(x, 1.66, 0); g.add(sh);
    });
    const armG = new THREE.CylinderGeometry(0.055, 0.065, 0.4, 8);
    this.leftArm  = new THREE.Mesh(armG, skin); this.leftArm.position.set(-0.27, 1.42, 0); this.leftArm.rotation.z = 0.12; g.add(this.leftArm);
    this.rightArm = new THREE.Mesh(armG, skin); this.rightArm.position.set(0.27, 1.42, 0); this.rightArm.rotation.z = -0.12; g.add(this.rightArm);

    const faG = new THREE.CylinderGeometry(0.045, 0.055, 0.35, 8);
    [[-0.29,0.06],[0.29,0.06]].forEach(([x,z]) => {
      const fa = new THREE.Mesh(faG, skin); fa.position.set(x, 1.12, z); fa.rotation.x = -0.2; g.add(fa);
    });
    const handG = new THREE.SphereGeometry(0.045, 6, 5);
    [[-0.30,0.1],[0.30,0.1]].forEach(([x,z]) => { g.add(new THREE.Mesh(handG, skin).translateX(x).translateY(0.94).translateZ(z)); });

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skin); neck.position.y = 1.82; g.add(neck);
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
    this.headMesh.position.y = 2.0; this.headMesh.scale.set(1, 1.08, 0.95); this.headMesh.castShadow = true; g.add(this.headMesh);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI*2, 0, Math.PI*0.55), hair);
    hairM.position.y = 2.06; g.add(hairM);
    [-0.055, 0.055].forEach(x => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eye); e.position.set(x, 2.02, 0.14); g.add(e);
    });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 6), skin); nose.position.set(0, 1.97, 0.16); nose.rotation.x = -0.3; g.add(nose);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI*2, Math.PI*0.45, Math.PI*0.35), hair);
    beard.position.set(0, 1.89, 0.04); beard.scale.set(1, 1.2, 0.8); g.add(beard);
    const earring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 10), buckle);
    earring.position.set(-0.16, 1.98, 0.02); earring.rotation.y = Math.PI/2; g.add(earring);
    return g;
  }

  // ── Room detection ────────────────────────────────────────────────────────

  _detectRoom() {
    const p = this.mesh.position;
    for (const r of Object.values(ROOMS)) {
      const b = r.bounds;
      if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) {
        if (r.id !== this.currentRoom) {
          this.currentRoom = r.id;
          // Update wander bounds to current room (inset from walls)
          this.wanderBounds = {
            minX: b.minX + 1.5, maxX: b.maxX - 1.5,
            minZ: b.minZ + 1.5, maxZ: b.maxZ - 1.5,
          };
        }
        return;
      }
    }
    // In corridor — keep existing room bounds for wandering
  }

  // ── FSM ───────────────────────────────────────────────────────────────────

  _setState(s) {
    this.state = s;
    const f = this._eraFactor();
    switch (s) {
      case S.IDLE:    this.stateTimer = f.idle + Math.random() * 2; this.velocity.set(0,0,0); break;
      case S.WANDER:  this.stateTimer = f.wander + Math.random() * 3; this._pickDir(); break;
      case S.OBSERVE: this.stateTimer = CONFIG.npc.observeTime + Math.random() * 3; this.targetPos = this._nearestArt(); break;
      case S.FOLLOW:  this.stateTimer = 6 + Math.random() * 3; break;
    }
  }

  _pickDir() { const a = Math.random() * Math.PI * 2; this.targetDir.set(Math.cos(a), 0, Math.sin(a)); }

  _nearestArt() {
    if (!this.artworkPositions.length) return null;
    let best = null, bd = Infinity;
    for (const ap of this.artworkPositions) {
      const d = this.mesh.position.distanceTo(ap);
      if (d < bd) { bd = d; best = ap; }
    }
    return best;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta, playerPosition) {
    this._detectRoom();
    const f = this._eraFactor();

    switch (this.state) {
      case S.IDLE:    this._idle(delta); break;
      case S.WANDER:  this._wander(delta, f); break;
      case S.OBSERVE: this._observe(delta, f); break;
      case S.FOLLOW:  this._follow(delta, playerPosition, f); break;
    }

    this._animate(delta);
    this._proximity(delta, playerPosition);
    this._updateDialogue(delta);
  }

  _idle(delta) {
    this.stateTimer -= delta;
    this.mesh.rotation.y += Math.sin(performance.now() * 0.0006) * 0.002;
    if (this.stateTimer <= 0) {
      const r = Math.random();
      if (r < 0.4) this._setState(S.WANDER);
      else if (r < 0.7 && this.artworkPositions.length) this._setState(S.OBSERVE);
      else this._setState(S.WANDER);
    }
  }

  _wander(delta, f) {
    this.stateTimer -= delta;
    this.velocity.lerp(this.targetDir, 2.5 * delta);
    this.velocity.normalize().multiplyScalar(CONFIG.npc.speed * f.speed);
    if (!this._tryMove(delta, this.wanderBounds)) this._pickDir();
    this._rotateToVel(delta);
    if (this.stateTimer <= 0) this._setState(S.IDLE);
  }

  _observe(delta, f) {
    this.stateTimer -= delta;
    if (this.targetPos) {
      const to = new THREE.Vector3().subVectors(this.targetPos, this.mesh.position); to.y = 0;
      if (to.length() > 2.5) {
        to.normalize();
        this.velocity.lerp(to, 3 * delta);
        this.velocity.normalize().multiplyScalar(CONFIG.npc.speed * f.speed * 0.8);
        this._tryMove(delta, this.globalBounds);
      } else {
        this.velocity.set(0, 0, 0);
        this._rotateTo(Math.atan2(to.x, to.z), delta);
        if (this.rightArm) {
          this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.8, 3 * delta);
          this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.5, 3 * delta);
        }
      }
    }
    if (this.headMesh) {
      this.headMesh.rotation.x = THREE.MathUtils.lerp(this.headMesh.rotation.x, -0.25, 2 * delta);
      this.headMesh.rotation.y = Math.sin(performance.now() * 0.0005) * 0.2;
    }
    if (this.stateTimer <= 0) this._setState(S.IDLE);
  }

  _follow(delta, pp, f) {
    this.stateTimer -= delta;
    const to = new THREE.Vector3().subVectors(pp, this.mesh.position); to.y = 0;
    const d = to.length();
    if (d > 2.2) {
      to.normalize();
      this.velocity.lerp(to, 3 * delta);
      this.velocity.normalize().multiplyScalar(CONFIG.npc.followSpeed * f.speed);
      this._tryMove(delta, this.globalBounds);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this._rotateToVel(delta);
    if (d > CONFIG.npc.followDistance || this.stateTimer <= 0) this._setState(S.IDLE);
  }

  // ── Movement with collision ───────────────────────────────────────────────

  _tryMove(delta, bounds) {
    const p = this.mesh.position;
    const nx = p.x + this.velocity.x * delta;
    const nz = p.z + this.velocity.z * delta;
    if (nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) { this._pickDir(); return false; }
    const r = 0.38;
    const tb = new THREE.Box3(new THREE.Vector3(nx-r, 0, nz-r), new THREE.Vector3(nx+r, 2.2, nz+r));
    for (const w of this.wallBoxes) { if (tb.intersectsBox(w)) { this._pickDir(); return false; } }
    p.x = nx; p.z = nz;
    return true;
  }

  _rotateToVel(dt) {
    if (this.velocity.lengthSq() < 0.01) return;
    this._rotateTo(Math.atan2(this.velocity.x, this.velocity.z), dt);
  }

  _rotateTo(a, dt) {
    let d = a - this.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.mesh.rotation.y += d * 4 * dt;
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  _animate(delta) {
    const spd = this.velocity.length(), t = performance.now();
    if (spd > 0.2) {
      this.mesh.position.y = Math.max(Math.sin(t * 0.006) * 0.03, 0);
      const sw = Math.sin(t * 0.007) * 0.3;
      if (this.leftLeg)  this.leftLeg.rotation.x  = sw;
      if (this.rightLeg) this.rightLeg.rotation.x = -sw;
      if (this.leftArm)  this.leftArm.rotation.x  = -sw * 0.5;
      if (this.state !== S.OBSERVE && this.rightArm) this.rightArm.rotation.x = sw * 0.5;
    } else {
      this.mesh.position.y = 0;
      [this.leftLeg, this.rightLeg, this.leftArm].forEach(m => { if (m) m.rotation.x *= 0.9; });
      if (this.state !== S.OBSERVE && this.rightArm) {
        this.rightArm.rotation.x *= 0.9;
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.12, 3 * delta);
      }
    }
    if (this.state !== S.OBSERVE && this.headMesh) {
      this.headMesh.rotation.y = Math.sin(t * 0.0008) * 0.35;
      this.headMesh.rotation.x = THREE.MathUtils.lerp(this.headMesh.rotation.x, Math.sin(t * 0.0005) * 0.08, 3 * delta);
    }
  }

  // ── Proximity & dialogue ──────────────────────────────────────────────────

  _proximity(delta, pp) {
    const d = pp.distanceTo(this.mesh.position);
    const near = d < CONFIG.npc.alertDistance;
    if (near && !this.npcNearby) {
      this.npcNearby = true;
      if (this.state === S.IDLE || this.state === S.WANDER) this._setState(S.FOLLOW);
      this._triggerDialogue();
    } else if (!near && this.npcNearby) {
      this.npcNearby = false;
    }
  }

  _triggerDialogue() {
    if (this._dialogueCooldown > 0) return;
    const lines = NPC_DIALOGUES[this.currentRoom];
    if (!lines || lines.length === 0) return;
    if (!this._spokenInRoom[this.currentRoom]) this._spokenInRoom[this.currentRoom] = 0;
    const idx = this._spokenInRoom[this.currentRoom] % lines.length;
    this._spokenInRoom[this.currentRoom]++;
    this._dialogueTimer    = 6;
    this._dialogueCooldown = 14;
    if (this.dialogueText) this.dialogueText.textContent = lines[idx];
    if (this.npcAlert)    this.npcAlert.classList.add("visible");
  }

  _updateDialogue(delta) {
    if (this._dialogueCooldown > 0) this._dialogueCooldown -= delta;
    if (this._dialogueTimer > 0) {
      this._dialogueTimer -= delta;
      if (this._dialogueTimer <= 0 && this.npcAlert) this.npcAlert.classList.remove("visible");
    } else if (!this.npcNearby && this.npcAlert) {
      this.npcAlert.classList.remove("visible");
    }
  }
}
