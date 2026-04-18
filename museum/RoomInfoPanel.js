/**
 * RoomInfoPanel — top-center HUD panel that introduces each room.
 *
 * State rules:
 *   • Opens automatically on the FIRST visit to a room.
 *   • Stays open until the player closes it (Y key).
 *   • After closing, it will NOT reopen automatically for that room again.
 *   • The Y key toggles the panel at any time — reopen for the current room.
 *   • Only one instance ever exists (singleton DOM element).
 */
export class RoomInfoPanel {
  constructor() {
    this._panel      = document.getElementById("room-info-panel");
    this._numberEl   = document.getElementById("room-info-number");
    this._titleEl    = document.getElementById("room-info-title");
    this._subtitleEl = document.getElementById("room-info-subtitle");
    this._yearEl     = document.getElementById("room-info-year");

    if (!this._panel) {
      console.warn("[RoomInfoPanel] #room-info-panel element not found in DOM.");
      return;
    }

    // Per-room auto-open tracking — once closed, stays closed for that room
    this._visitedRooms = new Set();
    this._isOpen       = false;
    this._currentRoom  = null;

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyY") this.toggleRoomUI();
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call from ZoneManager every time the player enters a room.
   * Handles first-visit auto-open; subsequent visits never auto-open.
   */
  onRoomEnter(room) {
    this._currentRoom = room;
    this._populate(room);

    const firstVisit = !this._visitedRooms.has(room.id);
    this._visitedRooms.add(room.id);

    if (firstVisit) {
      // If the panel is already showing a previous room, just update the content
      // in place. Otherwise slide it in fresh.
      if (this._isOpen) {
        this._animateRefresh();
      } else {
        this.openRoomUI();
      }
    }
    // Non-first visits: never auto-open, player must press Y.
  }

  /** Slide the panel into view. Idempotent. */
  openRoomUI() {
    this._isOpen = true;
    this._panel.classList.add("open");
  }

  /** Slide the panel out. Idempotent. */
  closeRoomUI() {
    this._isOpen = false;
    this._panel.classList.remove("open");
  }

  /** Toggle open/closed for the current room. */
  toggleRoomUI() {
    if (this._isOpen) {
      this.closeRoomUI();
    } else if (this._currentRoom) {
      this._populate(this._currentRoom);
      this.openRoomUI();
    }
  }

  get isOpen() { return this._isOpen; }

  // ─── Private ────────────────────────────────────────────────────────────────

  _populate(room) {
    if (this._numberEl)   this._numberEl.textContent   = String(room.roomNumber).padStart(2, "0");
    if (this._titleEl)    this._titleEl.textContent    = room.name;
    if (this._subtitleEl) this._subtitleEl.textContent = room.subtitle;
    if (this._yearEl)     this._yearEl.textContent     = room.year;
  }

  /**
   * Brief shimmer pulse when the content changes while the panel is already
   * visible — signals to the player that the room info just updated.
   */
  _animateRefresh() {
    this._panel.classList.remove("rip-refresh");
    // Force reflow so the animation re-triggers
    void this._panel.offsetWidth;
    this._panel.classList.add("rip-refresh");
  }
}
