/**
 * MiniGameManager — quiz flow, door unlock coordination, player pause.
 */

import { CONFIG } from "./config.js";
import { getMiniGameForRoom } from "./miniGamesData.js";
import { MiniGameUIManager } from "./MiniGameUIManager.js";

export class MiniGameManager {
  /**
   * @param {*} player PlayerController instance
   * @param {*} doorManager DoorManager instance
   */
  constructor(player, doorManager) {
    this.player = player;
    this.doorManager = doorManager;
    this.ui = new MiniGameUIManager();

    /** @type {string | null} */
    this._activeDoorId = null;
    /** @type {string | null} */
    this._activeRoomId = null;
    /** @type {Set<string>} */
    this._completedQuizRooms = new Set();

    this._pendingCorrectClose = null;

    this._onEsc = (e) => {
      if (!this.isActive() || e.code !== "Escape") return;
      if (this._pendingCorrectClose) return;
      e.preventDefault();
      this.closeGame();
    };
    document.addEventListener("keydown", this._onEsc, true);
  }

  isActive() {
    return this.ui.isVisible();
  }

  /** Room quiz cleared (door permanently unlocked). */
  isRoomQuizDone(roomId) {
    return this._completedQuizRooms.has(roomId);
  }

  /**
   * @param {string} doorId passage id e.g. p1_2
   * @param {string} roomId destination room e.g. r2
   */
  openGame(doorId, roomId) {
    if (this.isActive()) return;
    const pack = getMiniGameForRoom(roomId);
    if (!pack) {
      console.warn("[MiniGameManager] No mini-game for room:", roomId);
      this.doorManager.unlockDoor(doorId);
      this.doorManager.toggleDoor(doorId);
      return;
    }

    this._activeDoorId = doorId;
    this._activeRoomId = roomId;

    this.player.setMovementPaused(true);

    this.ui.setOnExit(() => {
      if (this._pendingCorrectClose) return;
      this.closeGame();
    });

    this.ui.renderGameUI(
      {
        title: pack.title,
        eraLine: pack.eraLine,
        question: pack.entry.question,
        options: [...pack.entry.options],
      },
      (index) => this.checkAnswer(index),
    );
    this.ui.setOptionsEnabled(true);
    this.ui.show();
  }

  /**
   * @param {number} index 0..2
   */
  checkAnswer(index) {
    if (!this.isActive() || !this._activeRoomId) return;
    const pack = getMiniGameForRoom(this._activeRoomId);
    if (!pack) return;

    const correct = pack.entry.answer === index;
    if (correct) {
      this.ui.setOptionsEnabled(false);
      this.ui.updateFeedback("Correct! Passage unlocked — the door swings open.", "success");
      this._playCorrectChime();

      const doorId = this._activeDoorId;
      const roomId = this._activeRoomId;
      if (this._pendingCorrectClose) clearTimeout(this._pendingCorrectClose);

      // ── CRITICAL: resume movement immediately while still inside the ──
      // ── click user-gesture, so controls.lock() is allowed by browser ──
      this._activeDoorId = null;
      this._activeRoomId = null;
      this.player.setMovementPaused(false);   // re-acquires pointer lock NOW

      // Door unlock + UI hide can be deferred safely (no pointer-lock call inside)
      this._pendingCorrectClose = setTimeout(() => {
        this._pendingCorrectClose = null;
        if (roomId) this._completedQuizRooms.add(roomId);
        if (doorId) {
          this.doorManager.unlockDoor(doorId);
          this.doorManager.toggleDoor(doorId);
        }
        // Hide overlay after a brief moment so the player sees the success message
        this.ui.hide();
        this.ui.clearActions();
      }, 650);
    } else {
      this.ui.updateFeedback("Wrong answer — try again.", "error");
      this.ui.clearActions();
      this.ui.addActionButton("Try again", () => {
        this.ui.updateFeedback("", "neutral");
        this.ui.setOptionsEnabled(true);
        this.ui.clearActions();
      });
    }
  }

  closeGame() {
    if (this._pendingCorrectClose) {
      clearTimeout(this._pendingCorrectClose);
      this._pendingCorrectClose = null;
    }
    this._activeDoorId = null;
    this._activeRoomId = null;
    this.ui.hide();
    this.ui.clearActions();
    // Only resume movement if not already resumed (correct-answer path resumes early)
    this.player.setMovementPaused(false);
  }

  _playCorrectChime() {
    if (!CONFIG.audio.enabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 523.25;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t);
      o.stop(t + 0.25);
    } catch (_e) {
      /* ignore */
    }
  }
}
