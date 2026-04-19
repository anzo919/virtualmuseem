/**
 * MuseumAudio — ambient music, UI tick, door SFX, and master volume (persisted).
 * Uses THREE.AudioListener on the camera; buffers load via AudioLoader.
 */

import * as THREE from "three";

const STORAGE_KEY = "carthage-museum-master-volume";
const DEFAULT_MASTER = 0.72;
const STEP = 0.08;
const MUSIC_GAIN = 0.38;
const SFX_GAIN = 0.92;

const PATHS = {
  music: "./audio/rubyzephyr-imperium-aeternum-v1-430851.mp3",
  ui: "./audio/freesound_community-menu-selection-102220.mp3",
  doorOpen: "./audio/soundreality-opening-door-411632 (1).mp3",
  doorClose: "./audio/dragon-studio-close-door-382723.mp3",
};

function loadBuffer(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

export class MuseumAudio {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this._loader = new THREE.AudioLoader();

    /** @type {THREE.Audio|null} */
    this._music = null;
    /** @type {THREE.Audio|null} */
    this._ui = null;
    /** @type {THREE.Audio|null} */
    this._doorOpen = null;
    /** @type {THREE.Audio|null} */
    this._doorClose = null;

    this._master = DEFAULT_MASTER;
    const stored = Number.parseFloat(localStorage.getItem(STORAGE_KEY) || "");
    if (Number.isFinite(stored) && stored >= 0 && stored <= 1) {
      this._master = stored;
    }

    this._musicStarted = false;
    this._volLabel = null;
  }

  /** Attach listener to camera and load all buffers. */
  async init() {
    this.camera.add(this.listener);

    const [musicBuf, uiBuf, openBuf, closeBuf] = await Promise.all([
      loadBuffer(this._loader, PATHS.music),
      loadBuffer(this._loader, PATHS.ui),
      loadBuffer(this._loader, PATHS.doorOpen),
      loadBuffer(this._loader, PATHS.doorClose),
    ]);

    this._music = new THREE.Audio(this.listener);
    this._music.setBuffer(musicBuf);
    this._music.setLoop(true);

    this._ui = new THREE.Audio(this.listener);
    this._ui.setBuffer(uiBuf);

    this._doorOpen = new THREE.Audio(this.listener);
    this._doorOpen.setBuffer(openBuf);

    this._doorClose = new THREE.Audio(this.listener);
    this._doorClose.setBuffer(closeBuf);

    this._applyVolumes();
    return this;
  }

  /** Resume Web Audio (required after user gesture on some browsers). */
  async resumeContext() {
    const ctx = this.listener.context;
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Start looping ambience after a user gesture (call from pointer lock / click). */
  async startMusicIfNeeded() {
    await this.resumeContext();
    if (!this._music || this._musicStarted) return;
    this._music.play();
    this._musicStarted = true;
  }

  getMasterVolume() {
    return this._master;
  }

  setMasterVolume(value) {
    this._master = THREE.MathUtils.clamp(value, 0, 1);
    localStorage.setItem(STORAGE_KEY, String(this._master));
    this._applyVolumes();
    this._syncVolumeLabel();
  }

  nudgeMaster(delta) {
    this.setMasterVolume(this._master + delta);
  }

  playUi() {
    this._playOneShot(this._ui, SFX_GAIN);
  }

  playDoorOpen() {
    this._playOneShot(this._doorOpen, SFX_GAIN);
  }

  playDoorClose() {
    this._playOneShot(this._doorClose, SFX_GAIN);
  }

  _applyVolumes() {
    const m = this._master * MUSIC_GAIN;
    if (this._music) this._music.setVolume(m);
  }

  /**
   * @param {THREE.Audio|null} sound
   * @param {number} gainMul
   */
  _playOneShot(sound, gainMul) {
    if (!sound || !sound.buffer) return;
    void this.resumeContext();
    if (sound.isPlaying) sound.stop();
    sound.setVolume(this._master * gainMul);
    sound.play();
  }

  /** Wire #audio-menu controls and keyboard − / + while pointer-locked. */
  attachVolumeUi() {
    const down = document.getElementById("audio-vol-down");
    const up = document.getElementById("audio-vol-up");
    this._volLabel = document.getElementById("audio-vol-value");
    this._syncVolumeLabel();

    const onBtn = (fn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.resumeContext();
      fn();
      this.playUi();
    };

    if (down) down.addEventListener("click", onBtn(() => this.nudgeMaster(-STEP)));
    if (up) up.addEventListener("click", onBtn(() => this.nudgeMaster(STEP)));

    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const locked = !!document.pointerLockElement;
      if (!locked) return;

      if (e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        this.nudgeMaster(-STEP);
      } else if (e.code === "Equal" || e.code === "NumpadAdd") {
        e.preventDefault();
        this.nudgeMaster(STEP);
      }
    });
  }

  _syncVolumeLabel() {
    if (this._volLabel) {
      this._volLabel.textContent = `${Math.round(this._master * 100)}%`;
    }
  }
}
