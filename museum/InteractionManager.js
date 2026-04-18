/**
 * InteractionManager — artwork hover glow, click-to-inspect panel,
 * and distance-gated interactions.
 *
 * Since PointerLock keeps the cursor at screen centre, we raycast
 * from (0, 0) every frame to detect what the player is looking at.
 */

import * as THREE from "three";
import { CONFIG, ARTWORK_DATA, CATEGORIES } from "./config.js";

export class InteractionManager {
  /**
   * @param {THREE.Camera}   camera
   * @param {THREE.Mesh[]}   artworkTargets — meshes with userData.artworkId
   * @param {() => boolean}  isLockedFn
   * @param {(id:string)=>void} [onDoorInteract] — called when a door is clicked
   * @param {() => boolean} [shouldBlockWorldInput] — true while modal UI owns input (mini-game)
   */
  constructor(camera, artworkTargets, isLockedFn, onDoorInteract, shouldBlockWorldInput) {
    this.camera = camera;
    this.artworkTargets = artworkTargets;
    this.isLockedFn = isLockedFn;
    this.onDoorInteract = onDoorInteract || null;
    this.shouldBlockWorldInput = shouldBlockWorldInput || (() => false);

    /** @type {number} */
    this._doorInteractCooldownUntil = 0;

    this.raycaster = new THREE.Raycaster();
    this.centre    = new THREE.Vector2(0, 0);

    // Door targets (meshes with userData.doorId) — set via setDoorTargets()
    this.doorTargets = [];

    // Currently highlighted thing
    this.highlightedId   = null;
    this.highlightedType = null;   // "artwork" | "door"

    // Panel state
    this.panelOpen = false;

    // Build a lookup map: id → artwork data
    this.artworkMap = {};
    for (const a of ARTWORK_DATA) this.artworkMap[a.id] = a;

    // DOM
    this.crosshair    = document.getElementById("crosshair");
    this.hint         = document.getElementById("interact-hint");
    this.doorPrompt   = document.getElementById("door-prompt");
    this.doorPromptSub = document.getElementById("door-prompt-sub");
    this.panel        = document.getElementById("artwork-panel");
    this.panelTitle  = document.getElementById("artwork-title");
    this.panelCategory = document.getElementById("artwork-category");
    this.panelOrigin = document.getElementById("artwork-origin");
    this.panelDesc   = document.getElementById("artwork-desc");
    this.panelContext = document.getElementById("artwork-context");
    this.closeBtn    = document.getElementById("artwork-close");

    this._bindEvents();
  }

  /** Call after DoorManager is set up. */
  setDoorTargets(meshes) {
    this.doorTargets = meshes;
  }

  _bindEvents() {
    this.closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._closePanel();
    });

    document.addEventListener("click", () => {
      if (this.shouldBlockWorldInput()) return;
      if (!this.isLockedFn()) return;
      if (this.panelOpen) return;
      if (this.highlightedType === "door" && this.highlightedId && this.onDoorInteract) {
        if (!this._consumeDoorInteractCooldown()) return;
        this.onDoorInteract(this.highlightedId);
      } else if (this.highlightedType === "artwork" && this.highlightedId) {
        this._openPanel(this.highlightedId);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (this.shouldBlockWorldInput()) return;
      if (e.code === "KeyE") {
        if (this.panelOpen) {
          this._closePanel();
        } else if (this.highlightedType === "door" && this.highlightedId && this.onDoorInteract) {
          if (!this._consumeDoorInteractCooldown()) return;
          this.onDoorInteract(this.highlightedId);
        } else if (this.highlightedType === "artwork" && this.highlightedId) {
          this._openPanel(this.highlightedId);
        }
      }
      if (e.code === "Escape" && this.panelOpen) this._closePanel();
    });
  }

  // ── Hover detection (called every frame) ──────────────────────────────────

  update(delta) {
    if (!this.isLockedFn() || this.panelOpen) {
      this._clearHighlight();
      return;
    }

    this.raycaster.setFromCamera(this.centre, this.camera);

    // Doors checked first — higher priority (player must open them to progress)
    const allTargets = [...this.doorTargets, ...this.artworkTargets];
    const hits = this.raycaster.intersectObjects(allTargets, false);

    if (hits.length > 0 && hits[0].distance < CONFIG.interaction.maxDistance) {
      const obj    = hits[0].object;
      const doorId = obj.userData.doorId;
      const artId  = obj.userData.artworkId;

      if (doorId && doorId !== this.highlightedId) {
        this._clearHighlight();
        this._setHighlight(doorId, obj, "door");
      } else if (!doorId && artId && artId !== this.highlightedId) {
        this._clearHighlight();
        this._setHighlight(artId, obj, "artwork");
      } else if (!doorId && !artId) {
        this._clearHighlight();
      }
    } else {
      this._clearHighlight();
    }
  }

  // ── Highlight (emissive glow) ─────────────────────────────────────────────

  _setHighlight(id, mesh, type) {
    this.highlightedId   = id;
    this.highlightedType = type;

    // Artwork only: apply emissive glow to the hovered mesh
    if (type === "artwork") {
      for (const m of this.artworkTargets) {
        if (m.userData.artworkId === id && m.material) {
          m.material._origEmissive          = m.material.emissive?.clone();
          m.material._origEmissiveIntensity = m.material.emissiveIntensity;
          m.material.emissive?.setHex(0x332200);
          m.material.emissiveIntensity      = 0.4;
        }
      }
      this.doorPrompt.classList.remove("visible");
      this.hint.classList.add("visible");
    } else {
      // Door: no emissive glow — just show the UI prompt
      this.hint.classList.remove("visible");
      const isOpen = this._doorManager && this._doorManager.isOpen(id);
      const isLocked = this._doorManager && this._doorManager.isLocked(id);
      if (isLocked) {
        this.doorPromptSub.textContent = "Press E — Unlock the passage";
      } else {
        this.doorPromptSub.textContent = isOpen ? "Close Door" : "Open Door";
      }
      this.doorPrompt.classList.add("visible");
    }

    this.crosshair.classList.add("highlight");
  }

  /** Pass DoorManager reference so the prompt knows open/closed state. */
  setDoorManager(dm) { this._doorManager = dm; }

  _consumeDoorInteractCooldown() {
    const now = performance.now();
    if (now < this._doorInteractCooldownUntil) return false;
    this._doorInteractCooldownUntil = now + 520;
    return true;
  }

  _clearHighlight() {
    if (!this.highlightedId) return;

    // Only artwork highlights have emissive state to restore
    if (this.highlightedType === "artwork") {
      for (const m of this.artworkTargets) {
        if (m.userData.artworkId === this.highlightedId && m.material && m.material._origEmissive) {
          m.material.emissive?.copy(m.material._origEmissive);
          m.material.emissiveIntensity = m.material._origEmissiveIntensity ?? 0;
          delete m.material._origEmissive;
          delete m.material._origEmissiveIntensity;
        }
      }
    }

    this.highlightedId   = null;
    this.highlightedType = null;
    this.crosshair.classList.remove("highlight");
    this.hint.classList.remove("visible");
    this.doorPrompt.classList.remove("visible");
  }

  // ── Detail panel ──────────────────────────────────────────────────────────

  _openPanel(id) {
    const art = this.artworkMap[id];
    if (!art) return;

    this.panelTitle.textContent = art.name;
    const cat = CATEGORIES[art.category];
    this.panelCategory.textContent = cat ? cat.label : art.category;
    if (cat) this.panelCategory.style.borderColor = cat.color;
    this.panelOrigin.textContent = art.origin || "Carthage";
    this.panelDesc.textContent = art.description;
    this.panelContext.textContent = art.context;
    this.panel.classList.add("open");
    this.panelOpen = true;
  }

  _closePanel() {
    this.panel.classList.remove("open");
    this.panelOpen = false;
  }
}
