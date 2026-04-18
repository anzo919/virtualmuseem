/**
 * PlayerController — first-person movement with sprint, head bob,
 * camera sway, footstep timing, and AABB wall collision.
 */

import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { CONFIG } from "./config.js";

export class PlayerController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Box3[]} wallBoxes
   * @param {HTMLCanvasElement|null} viewCanvas WebGL canvas — kept non-interactive until lock so #blocker receives clicks.
   */
  constructor(camera, wallBoxes, viewCanvas = null) {
    this.camera = camera;
    this.wallBoxes = wallBoxes;
    this._viewCanvas = viewCanvas;
    // Lock on document.body so requestPointerLock succeeds when the user clicks #blocker
    // (same user gesture; locking the canvas from a non-canvas click often fails in Chromium).
    this.controls = new PointerLockControls(camera, document.body);

    // Input state
    this.keys = { forward: false, backward: false, left: false, right: false, sprint: false };

    // Physics
    this.velocity = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._worldDir = new THREE.Vector3();

    // Head bob state
    this.bobPhase = 0;
    this.bobOffset = 0;

    // Camera sway state
    this.swayTime = 0;
    this.swayOffset = 0;

    // Footstep timing
    this.footstepTimer = 0;
    this.footstepCount = 0;

    // Sprint energy (drains while sprinting, recharges when not)
    this.energy = 1.0;

    /** When true, movement and look are frozen (e.g. mini-game overlay). */
    this._movementPaused = false;
    /** Skip blocker/crosshair restore when unlock() is used only to free the cursor for UI. */
    this._skipNextUnlockUi = false;

    // DOM
    this.blocker = document.getElementById("blocker");
    this.crosshair = document.getElementById("crosshair");
    this.energyContainer = document.getElementById("energy-container");
    this.energyFill = document.getElementById("energy-fill");

    this._bindEvents();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  /**
   * Pause FPS controls: exit pointer lock, disable look, clear velocity/keys.
   * @param {boolean} paused
   */
  setMovementPaused(paused) {
    this._movementPaused = paused;
    this.controls.enabled = !paused;
    if (paused) {
      this.velocity.set(0, 0, 0);
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
      if (this.controls.isLocked) {
        this._skipNextUnlockUi = true;
        this.controls.unlock();
      }
    } else {
      // Re-acquire pointer lock so the player can move again.
      // _skipNextUnlockUi stays false here — no blocker shown when we
      // re-lock, the lock event handler already hides the blocker.
      if (!this.controls.isLocked) {
        this.controls.lock();
      }
    }
  }

  // ── Event bindings ────────────────────────────────────────────────────────

  _bindEvents() {
    const tryLock = () => {
      if (this.controls.isLocked) return;
      this.controls.lock();
    };

    const loadingHidden = () => {
      const el = document.getElementById("loading-screen");
      if (!el) return true;
      return getComputedStyle(el).display === "none";
    };

    const canStartGameplay = () => {
      if (this.controls.isLocked) return false;
      if (!this.blocker) return false;
      if (this.blocker.classList.contains("fade-out")) return false;
      if (!loadingHidden()) return false;
      return true;
    };

    /** Capture phase: runs even if a child or stacking would otherwise swallow the gesture. */
    const startFromOverlay = (e) => {
      if (!e.isTrusted) return;
      if (!canStartGameplay()) return;
      if (!this.blocker.contains(e.target)) return;
      tryLock();
    };

    this.blocker.addEventListener("click", tryLock);
    this.blocker.addEventListener("pointerdown", tryLock);
    document.addEventListener("pointerdown", startFromOverlay, true);
    document.addEventListener("click", startFromOverlay, true);

    this.controls.addEventListener("lock", () => {
      if (this._viewCanvas) {
        this._viewCanvas.style.pointerEvents = "auto";
      }
      // main.js setGameplayStartEnabled() sets inline opacity/pointer-events on #blocker;
      // those beat the .fade-out rule in CSS, so clear them or the overlay never disappears.
      this.blocker.style.removeProperty("opacity");
      this.blocker.style.removeProperty("pointer-events");
      this.blocker.classList.add("fade-out");
      this.crosshair.classList.remove("hidden");
    });

    this.controls.addEventListener("unlock", () => {
      if (this._skipNextUnlockUi) {
        this._skipNextUnlockUi = false;
        return;
      }
      if (this._viewCanvas) {
        this._viewCanvas.style.pointerEvents = "none";
      }
      this.blocker.classList.remove("fade-out");
      this.blocker.style.pointerEvents = "auto";
      this.blocker.style.opacity = "1";
      this.crosshair.classList.add("hidden");
    });

    const onKeyDown = (e) => {
      if (e.code === "Enter" && canStartGameplay()) {
        e.preventDefault();
        tryLock();
        return;
      }
      switch (e.code) {
        case "KeyW": case "KeyZ": this.keys.forward  = true; break;
        case "KeyS":              this.keys.backward = true; break;
        case "KeyA": case "KeyQ": this.keys.left     = true; break;
        case "KeyD":              this.keys.right    = true; break;
        case "ShiftLeft": case "ShiftRight": this.keys.sprint = true; break;
      }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case "KeyW": case "KeyZ": this.keys.forward  = false; break;
        case "KeyS":              this.keys.backward = false; break;
        case "KeyA": case "KeyQ": this.keys.left     = false; break;
        case "KeyD":              this.keys.right    = false; break;
        case "ShiftLeft": case "ShiftRight": this.keys.sprint = false; break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  // ── Main update (call every frame) ────────────────────────────────────────

  update(delta) {
    if (!this.controls.isLocked || this._movementPaused) return;

    const cfg = CONFIG.player;
    const isSprinting = this.keys.sprint && this.energy > 0;
    const maxSpeed = isSprinting ? cfg.sprintSpeed : cfg.walkSpeed;

    // ── Build desired direction ──────────────────────────────────────────
    this._dir.set(0, 0, 0);
    if (this.keys.forward)  this._dir.z -= 1;
    if (this.keys.backward) this._dir.z += 1;
    if (this.keys.left)     this._dir.x -= 1;
    if (this.keys.right)    this._dir.x += 1;

    const hasInput = this._dir.lengthSq() > 0;
    if (hasInput) this._dir.normalize();

    // Camera-relative → world-space direction
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    this._right.crossVectors(this._forward, this.camera.up).normalize();

    this._worldDir.set(0, 0, 0);
    this._worldDir.addScaledVector(this._forward, -this._dir.z);
    this._worldDir.addScaledVector(this._right, this._dir.x);

    // ── Acceleration / deceleration with inertia ─────────────────────────
    if (hasInput) {
      this.velocity.x += this._worldDir.x * cfg.acceleration * delta;
      this.velocity.z += this._worldDir.z * cfg.acceleration * delta;

      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (hSpeed > maxSpeed) {
        this.velocity.x *= maxSpeed / hSpeed;
        this.velocity.z *= maxSpeed / hSpeed;
      }
    } else {
      const decay = Math.max(1 - cfg.deceleration * delta, 0);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
      if (Math.abs(this.velocity.x) < 0.005) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.005) this.velocity.z = 0;
    }

    // ── Collision detection (test X and Z separately for wall sliding) ───
    const pos = this.camera.position;
    const r = cfg.radius;
    const h = cfg.height;
    const newX = pos.x + this.velocity.x * delta;
    const newZ = pos.z + this.velocity.z * delta;

    let hitX = false, hitZ = false;
    const bxMin = new THREE.Vector3(newX - r, 0, pos.z - r);
    const bxMax = new THREE.Vector3(newX + r, h, pos.z + r);
    const bzMin = new THREE.Vector3(pos.x - r, 0, newZ - r);
    const bzMax = new THREE.Vector3(pos.x + r, h, newZ + r);
    const boxX = new THREE.Box3(bxMin, bxMax);
    const boxZ = new THREE.Box3(bzMin, bzMax);

    for (const wall of this.wallBoxes) {
      if (boxX.intersectsBox(wall)) hitX = true;
      if (boxZ.intersectsBox(wall)) hitZ = true;
    }

    if (!hitX) pos.x = newX; else this.velocity.x = 0;
    if (!hitZ) pos.z = newZ; else this.velocity.z = 0;

    // Lock camera Y to player height (no bob, no sway — clean stable view)
    pos.y = cfg.height;

    // ── Footstep timing ──────────────────────────────────────────────────
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.5) {
      const interval = isSprinting ? cfg.footstepInterval * 0.7 : cfg.footstepInterval;
      this.footstepTimer += delta;
      if (this.footstepTimer >= interval) {
        this.footstepTimer = 0;
        this.footstepCount++;
        // Future: play footstep audio here
        // if (CONFIG.audio.enabled) AudioSystem.playFootstep();
      }
    } else {
      this.footstepTimer = 0;
    }

    // ── Energy bar (always visible while playing) ─────────────────────
    this.energyContainer.classList.toggle("visible", this.controls.isLocked);

    if (isSprinting && hasInput && this.energy > 0) {
      this.energy = Math.max(this.energy - delta * 0.18, 0);
      this.energyFill.classList.add("depleting");
    } else {
      this.energy = Math.min(this.energy + delta * 0.12, 1);
      this.energyFill.classList.remove("depleting");
    }
    this.energyFill.style.transform = `scaleX(${this.energy})`;
  }
}
