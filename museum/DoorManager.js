/**
 * DoorManager — tracks and animates arched double doors.
 *
 * State per door entry:
 *   locked          (boolean) — true: player must pass the quiz first
 *   hasBeenUnlocked (boolean) — true: quiz passed; door is free to toggle forever
 *   state           (string)  — "closed" | "opening" | "open" | "closing"
 *
 * Public API:
 *   handleInteraction(id, onLockedCallback) — routes locked→quiz, unlocked→toggleDoor
 *   unlockDoor(id)                          — permanently unlock: clear flag, glow, toast
 *   toggleDoor(id)                          — open ↔ close (no lock check)
 *   updateCollision(id, open)               — add/remove collision boxes
 *   isLocked(id) / isOpen(id) / isDoorHasBeenUnlocked(id) / getLinkedRoomId(id)
 *
 * Backward-compat aliases (deprecated):
 *   unlock(id)  → unlockDoor(id)
 *   interact(id)→ toggleDoor(id)
 */

import * as THREE from "three";

const OPEN_ANGLE  = Math.PI / 2;   // 90° full swing
const SWING_SPEED = 1.6;           // radians per second

export class DoorManager {
  /**
   * @param {THREE.Box3[]} wallBoxes — shared array from MuseumBuilder / PlayerController
   */
  constructor(wallBoxes) {
    this.wallBoxes = wallBoxes;
    this._doors    = {};     // id → DoorEntry
    this._targets  = [];     // flat list of interactable meshes
    this._toastTimer = null;
    this._toast    = this._buildToast();
  }

  // ── Toast notification ──────────────────────────────────────────────────────

  _buildToast() {
    const el = document.createElement("div");
    el.id = "door-unlock-toast";
    el.style.cssText = [
      "position:fixed",
      "top:50%",
      "left:50%",
      "transform:translate(-50%,-50%) scale(0.88)",
      "z-index:3000",
      "background:linear-gradient(135deg,rgba(30,22,12,0.97),rgba(18,14,8,0.98))",
      "border:1px solid rgba(212,180,80,0.55)",
      "border-radius:14px",
      "padding:1rem 2.4rem",
      "font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      "font-size:1rem",
      "letter-spacing:.07em",
      "color:#f0d888",
      "text-align:center",
      "pointer-events:none",
      "opacity:0",
      "box-shadow:0 0 36px rgba(200,160,40,.22),0 14px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,220,100,.08)",
      "transition:opacity .28s ease,transform .32s cubic-bezier(.22,1,.36,1)",
    ].join(";");
    el.innerHTML = `
      <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.18em;
        color:rgba(200,160,60,.65);margin-bottom:.32rem;">Passage Unsealed</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:.55rem;">
        <span style="font-size:1.1rem;">🔓</span>
        <span>Door Unlocked</span>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  _showUnlockToast() {
    const el = this._toast;
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,-50%) scale(0.88)";
    }, 2400);
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a door.
   * @param {string}        id
   * @param {THREE.Group}   leftPivot
   * @param {THREE.Group}   rightPivot
   * @param {THREE.Mesh[]}  handleMeshes        — for hover highlight
   * @param {THREE.Box3[]}  collisionBoxes       — removed from wallBoxes on open
   * @param {{ linkedRoomId?: string|null, locked?: boolean }|null} [lockMeta]
   */
  register(id, leftPivot, rightPivot, handleMeshes, collisionBoxes, lockMeta = null) {
    const locked       = lockMeta?.locked === true;
    const linkedRoomId = lockMeta?.linkedRoomId ?? null;

    /** @type {DoorEntry} */
    const entry = {
      id,
      leftPivot,
      rightPivot,
      collisionBoxes,
      state:           "closed",   // "closed" | "opening" | "open" | "closing"
      leftAngle:       0,
      rightAngle:      0,
      locked,                      // true → quiz required
      hasBeenUnlocked: false,      // true → quiz passed; free toggle forever
      linkedRoomId,
    };
    this._doors[id] = entry;

    // All interactable meshes already have userData.doorId set by MuseumBuilder
    for (const m of handleMeshes) {
      this._targets.push(m);
    }
  }

  /** All interactable meshes (for InteractionManager raycasting). */
  get targets() { return this._targets; }

  // ── Public query API ──────────────────────────────────────────────────────

  isLocked(id) {
    return !!(this._doors[id]?.locked);
  }

  isOpen(id) {
    const d = this._doors[id];
    return !!(d && (d.state === "open" || d.state === "opening"));
  }

  isDoorHasBeenUnlocked(id) {
    return !!(this._doors[id]?.hasBeenUnlocked);
  }

  getLinkedRoomId(id) {
    return this._doors[id]?.linkedRoomId ?? null;
  }

  // ── Core door operations ──────────────────────────────────────────────────

  /**
   * Main interaction entry point — call this from InteractionManager's callback.
   *
   * Routing:
   *   door.locked       === true  → call onLockedCallback(id, linkedRoomId) (opens quiz)
   *   door.hasBeenUnlocked / never locked → toggleDoor(id) (free open/close)
   *
   * @param {string} id
   * @param {(id: string, roomId: string|null) => void} onLockedCallback
   */
  handleInteraction(id, onLockedCallback) {
    const d = this._doors[id];
    if (!d) return;

    if (d.locked) {
      // Quiz has not been passed yet — delegate to caller
      if (onLockedCallback) onLockedCallback(id, d.linkedRoomId);
      return;
    }

    // Either never locked, or quiz was already passed → free toggle
    this.toggleDoor(id);
  }

  /**
   * Permanently unlock a door.
   * Sets locked = false and hasBeenUnlocked = true, applies handle glow, shows toast.
   * After this call, handleInteraction() will always go to toggleDoor().
   *
   * @param {string} id
   */
  unlockDoor(id) {
    const d = this._doors[id];
    if (!d) return;

    d.locked          = false;
    d.hasBeenUnlocked = true;

    this._applyUnlockGlow(id);
    this._showUnlockToast();
  }

  /**
   * Toggle the door open ↔ closed without any lock check.
   * Safe to call directly after unlockDoor().
   *
   * @param {string} id
   */
  toggleDoor(id) {
    const d = this._doors[id];
    if (!d) return;
    if (d.locked) return;   // safety guard — should not reach here normally

    if (d.state === "closed") {
      d.state = "opening";
      this.updateCollision(id, true);   // opening → remove wall collision
    } else if (d.state === "open") {
      d.state = "closing";
      this.updateCollision(id, false);  // closing → restore wall collision
    }
    // mid-animation states ("opening" / "closing"): ignore new input
  }

  /**
   * Add or remove this door's collision boxes from the shared wallBoxes array.
   *
   * @param {string}  id
   * @param {boolean} open  true = door is opening (remove collision);
   *                        false = door is closing (restore collision)
   */
  updateCollision(id, open) {
    const d = this._doors[id];
    if (!d) return;

    if (open) {
      // Remove collision so the player can walk through
      for (const box of d.collisionBoxes) {
        const idx = this.wallBoxes.indexOf(box);
        if (idx !== -1) this.wallBoxes.splice(idx, 1);
      }
    } else {
      // Restore collision when the door closes
      for (const box of d.collisionBoxes) {
        if (!this.wallBoxes.includes(box)) this.wallBoxes.push(box);
      }
    }
  }

  // ── Backward-compat aliases ───────────────────────────────────────────────

  /** @deprecated Use unlockDoor(id) */
  unlock(id) { this.unlockDoor(id); }

  /** @deprecated Use toggleDoor(id) */
  interact(id) { this.toggleDoor(id); }

  // ── Visual: golden glow on handle meshes when unlocked ───────────────────

  _applyUnlockGlow(id) {
    for (const m of this._targets) {
      if (m.userData.doorId !== id) continue;
      if (!m.material) continue;

      // Clone material once to avoid affecting other meshes sharing the same instance
      if (!m.material._unlockGlowApplied) {
        m.material = m.material.clone();
        m.material._unlockGlowApplied = true;
      }

      // Warm amber emissive glow — subtle, not garish
      if (m.material.emissive) {
        m.material.emissive.setHex(0x5a3808);
        m.material.emissiveIntensity = 0.55;
      }
      m.material.needsUpdate = true;
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  update(delta) {
    for (const d of Object.values(this._doors)) {
      if (d.state === "opening") {
        d.leftAngle  += SWING_SPEED * delta;
        d.rightAngle -= SWING_SPEED * delta;

        if (d.leftAngle >= OPEN_ANGLE) {
          d.leftAngle  =  OPEN_ANGLE;
          d.rightAngle = -OPEN_ANGLE;
          d.state = "open";
        }

        d.leftPivot.rotation.y  = d.leftAngle;
        d.rightPivot.rotation.y = d.rightAngle;

      } else if (d.state === "closing") {
        d.leftAngle  -= SWING_SPEED * delta;
        d.rightAngle += SWING_SPEED * delta;

        if (d.leftAngle <= 0) {
          d.leftAngle  = 0;
          d.rightAngle = 0;
          d.state = "closed";
        }

        d.leftPivot.rotation.y  = d.leftAngle;
        d.rightPivot.rotation.y = d.rightAngle;
      }
    }
  }
}

/**
 * @typedef {Object} DoorEntry
 * @property {string}        id
 * @property {THREE.Group}   leftPivot
 * @property {THREE.Group}   rightPivot
 * @property {THREE.Box3[]}  collisionBoxes
 * @property {"closed"|"opening"|"open"|"closing"} state
 * @property {number}        leftAngle
 * @property {number}        rightAngle
 * @property {boolean}       locked          — true = quiz required to open
 * @property {boolean}       hasBeenUnlocked — true = quiz passed; free toggle forever
 * @property {string|null}   linkedRoomId
 */
