/**
 * ZoneManager — detects which era room the player occupies,
 * shows the era title HUD, shows narration on first entry,
 * and updates the 7-dot progress bar in the UI.
 */

import * as THREE from "three";
import { ROOMS, PASSAGES } from "./config.js";

export class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.currentZone = null;
    this.visitedZones = new Set();
    this._roomInfoPanel = null;

    this.roomList = Object.values(ROOMS);

    // DOM references
    this.zoneHud      = document.getElementById("zone-hud");
    this.zoneName     = document.getElementById("zone-name");
    this.zoneSubtitle = document.getElementById("zone-subtitle");
    this.narration    = document.getElementById("zone-narration");
    this.eraYear      = document.getElementById("era-year");
    this.eraProgress  = document.getElementById("era-progress");
    this.eraDots      = document.querySelectorAll(".era-dot");

    this._narrationTimer   = 0;
    this._narrationVisible = false;
  }

  /** Connect the RoomInfoPanel so it receives onRoomEnter callbacks. */
  setRoomInfoPanel(panel) {
    this._roomInfoPanel = panel;
  }

  /** Call every frame with player position. Returns current room id. */
  update(delta, playerPos) {
    const room = this._detectRoom(playerPos);
    if (room && room.id !== this.currentZone) {
      this.currentZone = room.id;
      this._onEnterRoom(room);
    }

    // Auto-hide narration after 7 seconds
    if (this._narrationVisible) {
      this._narrationTimer -= delta;
      if (this._narrationTimer <= 0) {
        this.narration.classList.remove("visible");
        this._narrationVisible = false;
      }
    }

    return this.currentZone;
  }

  _detectRoom(pos) {
    for (const r of this.roomList) {
      const b = r.bounds;
      if (pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ) {
        return r;
      }
    }
    return null;
  }

  _onEnterRoom(room) {
    // Notify the room info panel first (before marking visited) so it can
    // determine first-visit state independently.
    if (this._roomInfoPanel) this._roomInfoPanel.onRoomEnter(room);

    // Zone HUD
    this.zoneName.textContent     = room.name;
    this.zoneSubtitle.textContent = room.subtitle;
    this.zoneHud.classList.add("visible");

    // Era year display and progress bar visibility
    if (this.eraYear) this.eraYear.textContent = room.year;
    if (this.eraProgress) this.eraProgress.classList.add("visible");

    // Progress dots — highlight current room
    if (this.eraDots && this.eraDots.length > 0) {
      this.eraDots.forEach(dot => dot.classList.remove("active"));
      const idx = room.roomNumber - 1;
      if (this.eraDots[idx]) this.eraDots[idx].classList.add("active");
    }

    // First-visit narration
    if (!this.visitedZones.has(room.id)) {
      this.visitedZones.add(room.id);
      this.narration.textContent     = room.narration;
      this.narration.classList.add("visible");
      this._narrationVisible = true;
      this._narrationTimer   = 7;
    }
  }
}
