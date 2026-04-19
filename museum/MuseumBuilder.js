/**
 * MuseumBuilder — constructs 7 chronological era rooms with connecting
 * corridors, unique architecture, lighting, and data-driven artifacts.
 *
 * Room progression (player walks in −Z direction):
 *   r1 → r2 → r3 → r4 (grand hall) → r5 → r6 (ruins) → r7 (legacy)
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ROOMS, PASSAGES, ARTWORK_DATA, CATEGORIES } from "./config.js";
import { installWallMuralFrames } from "./posters/museum-wall-murals.js";

/** Room overview PNGs: skip files larger than this (generated art is often huge and can freeze the tab during decode). */
const POSTER_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Longest edge after decode — canvas compositing stays cheap. */
const POSTER_MAX_EDGE_PX = 2048;
const POSTER_FETCH_MS = 12000;

// Shared geometries reused across the museum
const G = {
  colShaft: new THREE.CylinderGeometry(0.28, 0.36, 1, 14),
  colBase:  new THREE.BoxGeometry(0.9, 0.22, 0.9),
  colCap:   new THREE.CylinderGeometry(0.44, 0.32, 0.2, 14),
  torus:    new THREE.TorusGeometry(0.36, 0.05, 8, 20),
  pedestal: new THREE.BoxGeometry(0.8, 1.0, 0.8),
  torch:    new THREE.CylinderGeometry(0.04, 0.06, 0.5, 8),
};

export class MuseumBuilder {
  constructor(scene) {
    this.scene = scene;
    /** @type {{ frames: import("./posters/carthage-gallery-frames.js").MuseumFrame[], animate: (n: number) => void }|null} */
    this._muralAnim = null;
    this.wallBoxes = [];
    this.artworkTargets = [];
    this.artworkPositions = [];
    this.torchLights = [];
    this.rotatingArtifact = null;

    // Texture cache — prevents regenerating identical canvas textures per room
    this._texCache = {};
    /** @type {Map<string, CanvasImageSource>} Decoded hero images: posterImage + wall `url` (see config). */
    this._panelImageCache = new Map();

    this._initTextures();
    this._initMaterials();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCEDURAL TEXTURES
  // ═══════════════════════════════════════════════════════════════════════════

  _noise2D(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  _smoothNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this._noise2D(ix, iy), b = this._noise2D(ix + 1, iy);
    const c = this._noise2D(ix, iy + 1), d = this._noise2D(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  _fbm(x, y, o) {
    let v = 0, a = 0.5, f = 1, m = 0;
    for (let i = 0; i < o; i++) { v += a * this._smoothNoise(x * f, y * f); m += a; a *= 0.5; f *= 2; }
    return v / m;
  }

  _proceduralFloor() {
    const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const tW = 128, tH = 128, gr = 2;
    for (let py = 0; py < s; py++) for (let px = 0; px < s; px++) {
      const i = (py * s + px) * 4;
      const tx = px % tW, ty = py % tH;
      const tC = Math.floor(px / tW), tR = Math.floor(py / tH);
      const tS = this._noise2D(tC * 7.3, tR * 11.1);
      const baseR = 210 + (tS - 0.5) * 14, baseG = 195 + (tS - 0.5) * 12, baseB = 168 + (tS - 0.5) * 10;
      if (tx < gr || ty < gr) {
        const gn = (Math.random() - 0.5) * 5;
        img.data[i] = 175 + gn; img.data[i+1] = 162 + gn; img.data[i+2] = 142 + gn; img.data[i+3] = 255; continue;
      }
      const vein = this._fbm(px * 0.012 + tC, py * 0.008 + tR, 4);
      const vs = Math.pow(Math.abs(Math.sin(vein * 12 + tS * 6)), 8) * 10;
      const grain = (this._fbm(px * 0.05, py * 0.05, 3) - 0.5) * 10;
      const ed = Math.min(tx - gr, tW - tx, ty - gr, tH - ty);
      const edgeDark = ed < 5 ? (1 - ed / 5) * 5 : 0;
      const stain = this._fbm(px * 0.02 + 50, py * 0.02 + 50, 3);
      const stainD = stain > 0.7 ? (stain - 0.7) * 25 : 0;
      img.data[i]   = Math.min(255, Math.max(150, baseR + grain - vs - edgeDark - stainD));
      img.data[i+1] = Math.min(255, Math.max(140, baseG + grain - vs * 0.8 - edgeDark - stainD));
      img.data[i+2] = Math.min(255, Math.max(125, baseB + grain - vs * 0.6 - edgeDark - stainD * 0.7));
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 5); t.anisotropy = 8;
    return t;
  }

  _proceduralWall() {
    const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const bW = 128, bH = 48, mo = 2;
    for (let py = 0; py < s; py++) for (let px = 0; px < s; px++) {
      const i = (py * s + px) * 4;
      const row = Math.floor(py / bH), rOff = row % 2 === 0 ? 0 : bW / 2;
      const bx = ((px + rOff) % bW), by = py % bH, bC = Math.floor((px + rOff) / bW);
      if (bx < mo || by < mo) {
        const mn = (Math.random() - 0.5) * 5;
        img.data[i] = 192 + mn; img.data[i+1] = 178 + mn; img.data[i+2] = 158 + mn; img.data[i+3] = 255; continue;
      }
      const bS = this._noise2D(bC * 5.7, row * 9.3), bS2 = this._noise2D(bC * 13.1, row * 3.7);
      const baseR = 220 + (bS - 0.5) * 14, baseG = 206 + (bS - 0.5) * 12, baseB = 184 + (bS - 0.5) * 10;
      const coarse = (this._fbm(px * 0.015, py * 0.02, 4) - 0.5) * 12;
      const fine = (this._fbm(px * 0.06, py * 0.06, 2) - 0.5) * 6;
      const sed = Math.sin(py * 0.15 + bS * 20) * 3 + Math.sin(py * 0.4 + bS2 * 30) * 1.5;
      const edX = Math.min(bx - mo, bW - bx), edY = Math.min(by - mo, bH - by);
      const edD = edX < 4 ? (1 - edX / 4) * 6 : 0;
      const crack = this._fbm(px * 0.005 + row, py * 0.08, 3);
      const crackL = Math.abs(crack - 0.5) < 0.002 ? 15 : 0;
      img.data[i]   = Math.min(255, Math.max(165, baseR + coarse + fine + sed - edD - crackL));
      img.data[i+1] = Math.min(255, Math.max(155, baseG + coarse + fine + sed * 0.9 - edD - crackL));
      img.data[i+2] = Math.min(255, Math.max(140, baseB + coarse * 0.8 + fine + sed * 0.7 - edD - crackL));
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }

  _proceduralMosaic() {
    const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#d4c4a0"; ctx.fillRect(0, 0, s, s);
    const tS = 10;
    const warm = ["#c8a46a","#b8945a","#d4b880","#a8864e","#c4a060","#dcc090","#b09058","#cc9c5c"];
    const accent = ["#8a5a2a","#6a4a28","#704830","#5c3c20"];
    for (let y = 0; y < s; y += tS) for (let x = 0; x < s; x += tS) {
      const jx = (Math.random() - 0.5) * 1.5, jy = (Math.random() - 0.5) * 1.5;
      ctx.fillStyle = warm[Math.floor(Math.random() * warm.length)];
      ctx.fillRect(x + 0.8 + jx, y + 0.8 + jy, tS - 1.6, tS - 1.6);
    }
    const db = (ins, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.strokeRect(ins, ins, s - ins*2, s - ins*2); };
    db(25, 4, "#5a3818"); db(32, 2, "#7a5a30"); db(38, 1.5, "#9a7a48");
    ctx.strokeStyle = "#6a4420"; ctx.lineWidth = 2;
    const step = 20, band = 46;
    for (let x = band; x < s - band; x += step * 2) {
      ctx.beginPath(); ctx.moveTo(x, band); ctx.lineTo(x, band-8); ctx.lineTo(x+step, band-8); ctx.lineTo(x+step, band+8); ctx.lineTo(x+step*2, band+8); ctx.lineTo(x+step*2, band); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, s-band); ctx.lineTo(x, s-band+8); ctx.lineTo(x+step, s-band+8); ctx.lineTo(x+step, s-band-8); ctx.lineTo(x+step*2, s-band-8); ctx.lineTo(x+step*2, s-band); ctx.stroke();
    }
    const cx = s/2, cy = s/2;
    for (let a = 0; a < Math.PI*2; a += 0.08) for (let r = 60; r < 75; r += tS) { ctx.fillStyle = accent[Math.floor(Math.random()*accent.length)]; ctx.fillRect(cx+Math.cos(a)*r-4, cy+Math.sin(a)*r-4, 8, 8); }
    for (let a = 0; a < Math.PI*2; a += 0.1) { ctx.fillStyle = "#dcc890"; ctx.fillRect(cx+Math.cos(a)*50-3, cy+Math.sin(a)*50-3, 7, 7); }
    ctx.strokeStyle = "#4a2a10"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx-32, cy+40); ctx.lineTo(cx, cy-15); ctx.lineTo(cx+32, cy+40); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy-25, 14, 0, Math.PI*2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy-46, 22, Math.PI+0.3, -0.3); ctx.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }

  _floorNormalMap() {
    const s = 512, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const tW = 64, tH = 64, gr = 1;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y*s+x)*4, tx = x%tW, ty = y%tH;
      let nx = 128, ny = 128;
      if (tx < gr || ty < gr) { nx = tx < gr ? 118 : 128; ny = ty < gr ? 118 : 128; }
      else {
        const ex = Math.min(tx-gr, tW-tx), ey = Math.min(ty-gr, tH-ty);
        if (ex < 3) nx = 128 + (tx-gr < tW-tx ? 8 : -8) * (1-ex/3);
        if (ey < 3) ny = 128 + (ty-gr < tH-ty ? 8 : -8) * (1-ey/3);
        const g = this._fbm(x*0.08, y*0.08, 2); nx += (g-0.5)*6; ny += (g-0.5)*6;
      }
      img.data[i] = Math.min(255, Math.max(0, nx)); img.data[i+1] = Math.min(255, Math.max(0, ny)); img.data[i+2] = 255; img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 5); return t;
  }

  _wallNormalMap() {
    const s = 512, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const bW = 64, bH = 24, mo = 1;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y*s+x)*4, row = Math.floor(y/bH), rO = row%2===0?0:bW/2;
      const bx = (x+rO)%bW, by = y%bH;
      let nx = 128, ny = 128;
      if (bx < mo || by < mo) { nx = bx<mo?115:128; ny = by<mo?115:128; }
      else {
        const ex = Math.min(bx-mo, bW-bx), ey = Math.min(by-mo, bH-by);
        if (ex < 3) nx = 128 + (bx-mo < bW-bx ? 10 : -10) * (1-ex/3);
        if (ey < 3) ny = 128 + (by-mo < bH-by ? 10 : -10) * (1-ey/3);
        const r = this._fbm(x*0.1, y*0.12, 3); nx += (r-0.5)*8; ny += (r-0.5)*8;
      }
      img.data[i] = Math.min(255,Math.max(0,nx)); img.data[i+1] = Math.min(255,Math.max(0,ny)); img.data[i+2] = 255; img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,4); return t;
  }

  _floorRoughnessMap() {
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const tW = 32, tH = 32, gr = 1;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y*s+x)*4, tx = x%tW, ty = y%tH;
      const v = (tx<gr||ty<gr) ? 195+Math.random()*10 : 165 + (1-Math.min(tx-gr,tW-tx,ty-gr,tH-ty)/(tW/2))*20 + (Math.random()-0.5)*10;
      img.data[i] = img.data[i+1] = img.data[i+2] = Math.min(255,Math.max(0,v)); img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6,5); return t;
  }

  _wallRoughnessMap() {
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
    const bW = 32, bH = 12, mo = 1;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y*s+x)*4, row = Math.floor(y/bH), rO = row%2===0?0:bW/2;
      const bx = (x+rO)%bW, by = y%bH;
      const v = (bx<mo||by<mo) ? 200+Math.random()*10 : 170 + this._noise2D(Math.floor((x+rO)/bW), row)*25 + (Math.random()-0.5)*10;
      img.data[i] = img.data[i+1] = img.data[i+2] = Math.min(255,Math.max(0,v)); img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,4); return t;
  }

  _sunsetEnvMap() {
    const c = document.createElement("canvas"); c.width = 2; c.height = 512;
    const ctx = c.getContext("2d"), g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#4a3a6b"); g.addColorStop(.35, "#c76b4e"); g.addColorStop(.65, "#e8a060"); g.addColorStop(1, "#f5e6c8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping; return t;
  }

  _initTextures() {
    this.floorTex  = this._proceduralFloor();
    this.wallTex   = this._proceduralWall();
    this.mosaicTex = this._proceduralMosaic();
    this.floorNorm = this._floorNormalMap();
    this.wallNorm  = this._wallNormalMap();
    this.floorRough = this._floorRoughnessMap();
    this.wallRough  = this._wallRoughnessMap();
    this.envMap    = this._sunsetEnvMap();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MATERIALS
  // ═══════════════════════════════════════════════════════════════════════════

  _initMaterials() {
    const fN = new THREE.Vector2(0.35, 0.35), wN = new THREE.Vector2(0.4, 0.4);
    const env = this.envMap;
    this.mat = {
      floor:      new THREE.MeshStandardMaterial({ map: this.floorTex, normalMap: this.floorNorm, normalScale: fN, roughnessMap: this.floorRough, roughness: 0.82, metalness: 0.02, envMap: env, envMapIntensity: 0.04 }),
      mosaic:     new THREE.MeshStandardMaterial({ map: this.mosaicTex, normalMap: this.floorNorm, normalScale: new THREE.Vector2(0.15,0.15), roughness: 0.72, metalness: 0.02, envMap: env, envMapIntensity: 0.05 }),
      wall:       new THREE.MeshStandardMaterial({ map: this.wallTex, normalMap: this.wallNorm, normalScale: wN, roughnessMap: this.wallRough, roughness: 0.8, metalness: 0.02, envMap: env, envMapIntensity: 0.04 }),
      trim:       new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.72, metalness: 0.05, envMap: env, envMapIntensity: 0.15 }),
      gold:       new THREE.MeshStandardMaterial({ color: 0xd4a830, roughness: 0.35, metalness: 0.55, emissive: 0x8a6010, emissiveIntensity: 0.25, envMap: env, envMapIntensity: 0.5 }),
      bronze:     new THREE.MeshStandardMaterial({ color: 0xb08848, roughness: 0.4,  metalness: 0.6,  emissive: 0x5a3a18, emissiveIntensity: 0.2,  envMap: env, envMapIntensity: 0.45 }),
      ceiling:    new THREE.MeshStandardMaterial({ color: 0xd8cbb4, roughness: 0.9, metalness: 0.01, normalMap: this.wallNorm, normalScale: new THREE.Vector2(0.12,0.12) }),
      frame:      new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.45, metalness: 0.35, emissive: 0x3a2810, emissiveIntensity: 0.2, envMap: env, envMapIntensity: 0.3 }),
      dark:       new THREE.MeshStandardMaterial({ color: 0x4a3820, roughness: 0.82, metalness: 0.08 }),
      glass:      new THREE.MeshStandardMaterial({ color: 0xc8e0f0, transparent: true, opacity: 0.18, roughness: 0.02, metalness: 0.15, envMap: env, envMapIntensity: 0.6 }),
      red:        new THREE.MeshStandardMaterial({ color: 0xa03a3a, roughness: 0.65, metalness: 0.12, emissive: 0x400808, emissiveIntensity: 0.15 }),
      terracotta: new THREE.MeshStandardMaterial({ color: 0xc07848, roughness: 0.78, metalness: 0.03, emissive: 0x4a1808, emissiveIntensity: 0.12 }),
      ruins:      new THREE.MeshStandardMaterial({ color: 0xa09080, roughness: 0.92, metalness: 0.02 }),
      dome:       new THREE.MeshStandardMaterial({ color: 0xd0c4b0, roughness: 0.8,  metalness: 0.02, side: THREE.BackSide }),
      stone:      new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.85, metalness: 0.02, emissive: 0x181410, emissiveIntensity: 0.1 }),
      purple:     new THREE.MeshStandardMaterial({ color: 0x7a3a7a, roughness: 0.65, metalness: 0.08, emissive: 0x280828, emissiveIntensity: 0.15 }),
      ember:      new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.5,  metalness: 0.0,  emissive: 0xff3300, emissiveIntensity: 1.1 }),
    };

    // Per-room wall colour tints
    this.mat.wallR1 = this.mat.wall.clone(); this.mat.wallR1.color.setHex(0xd8c8a8);
    this.mat.wallR2 = this.mat.wall.clone(); this.mat.wallR2.color.setHex(0xd4b870);
    this.mat.wallR3 = this.mat.wall.clone(); this.mat.wallR3.color.setHex(0xc8a070);
    this.mat.wallR4 = this.mat.wall.clone(); this.mat.wallR4.color.setHex(0xdcd0a0);
    this.mat.wallR5 = this.mat.wall.clone(); this.mat.wallR5.color.setHex(0xb09070);
    this.mat.wallR6 = this.mat.wall.clone(); this.mat.wallR6.color.setHex(0xa09080);
    this.mat.wallR7 = this.mat.wall.clone(); this.mat.wallR7.color.setHex(0xe0d8c8);

    // Column caps per room
    this.mat.capR4 = this.mat.gold.clone();
    this.mat.capR7 = new THREE.MeshStandardMaterial({ color: 0xddd8cc, roughness: 0.55, metalness: 0.08, envMap: env, envMapIntensity: 0.2 });

    // Floor tints per room
    this.mat.floorR3 = this.mat.floor.clone(); this.mat.floorR3.color.setHex(0xc0a888);
    this.mat.floorR5 = this.mat.floor.clone(); this.mat.floorR5.color.setHex(0xb0a080);
    this.mat.floorR6 = this.mat.floor.clone(); this.mat.floorR6.color.setHex(0x909080);

    // Ceiling tints
    this.mat.ceilR4 = new THREE.MeshStandardMaterial({ color: 0xc8baa0, roughness: 0.88, metalness: 0.01, side: THREE.BackSide });
    this.mat.ceilR7 = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, metalness: 0.01 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC BUILD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Async progressive build — yields to the browser between every room so
   * the page stays responsive and no startup freeze occurs.
   *
   * @param {(progress: number, label: string) => void} [onProgress]
   *   Called with a 0–1 progress value and a label string after each step.
   * @returns {Promise<object>}  Same shape as build()
   */
  async buildDeferred(onProgress) {
    this._pendingDoors = [];
    const roomGroups  = {};

    const steps = [
      { id: "r1", label: "Room I — Phoenician Origins", fn: () => this._buildRoom1() },
      { id: "r2", label: "Room II — Expansion",         fn: () => this._buildRoom2() },
      { id: "r3", label: "Room III — Greek Conflicts",  fn: () => this._buildRoom3() },
      { id: "r4", label: "Room IV — Apogee",            fn: () => this._buildRoom4() },
      { id: "r5", label: "Room V — Punic Wars",         fn: () => this._buildRoom5() },
      { id: "r6", label: "Room VI — Fall of Carthage",  fn: () => this._buildRoom6() },
      { id: "r7", label: "Room VII — Roman Legacy",     fn: () => this._buildRoom7() },
      { id: "_passages", label: "Passages & Doorways",  fn: () => { for (const p of PASSAGES) this._buildPassage(p); } },
      {
        id: "_artworks",
        label: "Artworks & Artifacts",
        fn: async () => {
          // Posters: bounded fetch + downscale so huge generated PNGs cannot lock the main thread.
          await Promise.race([
            this._preloadPanelImages(),
            new Promise((resolve) => setTimeout(resolve, POSTER_FETCH_MS + 4000)),
          ]);
          this._loadArtworks();
        },
      },
      {
        id: "_murals",
        label: "Wall mural frames (posters)",
        fn: () => {
          this._muralAnim = installWallMuralFrames(roomGroups, this.envMap);
        },
      },
      {
        id: "_glbProps",
        label: "Imported 3D exhibits",
        fn: async () => {
          await this._placeImportedGlbProps(roomGroups);
        },
      },
    ];

    const total = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const { id, label, fn } = steps[i];

      // Progress at step start so the bar moves during long synchronous room geometry (not only after each room).
      onProgress?.((i + 0.15) / total, label);

      if (id.startsWith("r")) {
        roomGroups[id] = this._buildRoomWithGroup(id, fn);
      } else {
        await fn();
      }

      onProgress?.((i + 1) / total, label);

      // Yield to browser — prevents janky long-frame freezes
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return {
      wallBoxes:        this.wallBoxes,
      artworkTargets:   this.artworkTargets,
      artworkPositions: this.artworkPositions,
      torchLights:      this.torchLights,
      rotatingArtifact: this.rotatingArtifact,
      envMap:           this.envMap,
      doors:            this._pendingDoors,
      roomGroups,
      muralAnim:        this._muralAnim,
    };
  }

  /**
   * Wraps a room-build function so that every Three.js object the function
   * adds to the scene is automatically collected into a named THREE.Group.
   * This lets RoomManager show/hide or dispose individual rooms without
   * touching any of the room-build methods themselves.
   *
   * Strategy: snapshot scene.children before the build, diff after, move
   * newly added top-level objects into a Group, re-add the Group.
   */
  _buildRoomWithGroup(roomId, buildFn) {
    // Snapshot of current direct children
    const before = new Set(this.scene.children);

    // Build the room — all objects land directly in this.scene
    buildFn();

    // Collect what was added
    const added = this.scene.children.filter(c => !before.has(c));

    // Re-parent into a named Group
    const group = new THREE.Group();
    group.name  = `room-${roomId}`;
    for (const obj of added) {
      this.scene.remove(obj);
      group.add(obj);
    }

    this.scene.add(group);
    return group;
  }

  build() {
    this._pendingDoors = [];   // populated by _buildPassage calls

    // Build each room into its own Group so RoomManager can stream them
    const roomGroups = {
      r1: this._buildRoomWithGroup("r1", () => this._buildRoom1()),
      r2: this._buildRoomWithGroup("r2", () => this._buildRoom2()),
      r3: this._buildRoomWithGroup("r3", () => this._buildRoom3()),
      r4: this._buildRoomWithGroup("r4", () => this._buildRoom4()),
      r5: this._buildRoomWithGroup("r5", () => this._buildRoom5()),
      r6: this._buildRoomWithGroup("r6", () => this._buildRoom6()),
      r7: this._buildRoomWithGroup("r7", () => this._buildRoom7()),
    };

    // Passages (corridors + doors) are kept always visible — they're small
    // and serve as transitions between rooms
    for (const p of PASSAGES) this._buildPassage(p);

    this._loadArtworks();
    this._muralAnim = installWallMuralFrames(roomGroups, this.envMap);

    return {
      wallBoxes:        this.wallBoxes,
      artworkTargets:   this.artworkTargets,
      artworkPositions: this.artworkPositions,
      torchLights:      this.torchLights,
      rotatingArtifact: this.rotatingArtifact,
      envMap:           this.envMap,
      doors:            this._pendingDoors,
      roomGroups,                             // ← new: one Group per room
      muralAnim:        this._muralAnim,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 1 — Foundation & Phoenician Origins (814 BC)
  // Warm golden lighting, calm discovery feeling, Punic symbols
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom1() {
    const r = ROOMS.r1, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR1;

    this._addFloor(cx, cz, W, D);
    this._addCeiling(cx, cz, W, D, H);

    // Back wall (solid — has founding stele artwork)
    this._addWall(cx, H/2, b.maxZ, W, H, T, 0, wm);
    // Front wall with gap (→ Corridor to Room 2)
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    // Side walls
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // 2 pairs of modest Phoenician columns
    [cz - 3, cz + 3].forEach(z => {
      this._addColumn(b.minX + 1.5, z, H);
      this._addColumn(b.maxX - 1.5, z, H);
    });

    // Warm golden torches
    this._addTorch(b.minX + 0.5, 3.5, cz - 2.5, 0xff9944, 0.8, 10);
    this._addTorch(b.maxX - 0.5, 3.5, cz - 2.5, 0xff9944, 0.8, 10);
    this._addTorch(b.minX + 0.5, 3.5, cz + 2.5, 0xff9944, 0.8, 10);
    this._addTorch(b.maxX - 0.5, 3.5, cz + 2.5, 0xff9944, 0.8, 10);

    this._addPointLight(cx, H - 1, cz, 0xffd4a0, 0.7, 14);

    // Punic wall engravings
    this._addWallEngraving(cx, H * 0.75, b.maxZ - 0.15, 3.5, 1.4, 0);
    this._addWallEngraving(b.minX + 0.15, H * 0.6, cz, 1.5, 2.5, Math.PI/2);

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 2 — Rise of Commerce (750–500 BC)
  // Busy, rich environment — amber lighting, trade goods
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom2() {
    const r = ROOMS.r2, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR2;

    this._addFloor(cx, cz, W, D);
    this._addCeiling(cx, cz, W, D, H);
    this._addCeilingBeams(cx, cz, W, D, H, 3);

    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // 3 pairs of merchant-era columns
    [-5, 0, 5].forEach(zOff => {
      this._addColumn(b.minX + 1.8, cz + zOff, H);
      this._addColumn(b.maxX - 1.8, cz + zOff, H);
    });

    // Trade goods decorations — stacked amphorae along walls
    [-4, -1, 2, 5].forEach(zOff => {
      this._addAmphora(b.minX + 1.2, 0, cz + zOff);
    });
    [-4, 0, 4].forEach(zOff => {
      this._addAmphora(b.maxX - 1.2, 0, cz + zOff);
    });

    // Trade crates stacked near walls
    this._addCrates(b.minX + 2.5, cz + 6);
    this._addCrates(b.maxX - 2.5, cz + 6);

    // Bright amber lighting (prosperous atmosphere)
    this._addPointLight(cx, H - 1, cz + 5, 0xffe0a0, 0.8, 16);
    this._addPointLight(cx, H - 1, cz - 5, 0xffe0a0, 0.6, 14);
    this._addTorch(b.minX + 0.5, 4, cz, 0xffaa44, 0.7, 12);
    this._addTorch(b.maxX - 0.5, 4, cz, 0xffaa44, 0.7, 12);

    this._addWallEngraving(cx, H * 0.7, b.maxZ - 0.15, 4, 1.4, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 3 — Conflicts with the Greeks (580–340 BC)
  // Darker tone — red/orange torches, shields on walls, war table
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom3() {
    const r = ROOMS.r3, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR3;

    this._addFloor(cx, cz, W, D, this.mat.floorR3);
    this._addCeiling(cx, cz, W, D, H);

    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // 2 pairs of battle-worn columns
    [cz - 4, cz + 4].forEach(z => {
      this._addColumn(b.minX + 1.8, z, H);
      this._addColumn(b.maxX - 1.8, z, H);
    });

    // Shield displays on left wall (military feel)
    [cz - 5, cz - 1, cz + 4].forEach(z => {
      this._addShield(b.minX + 0.3, H * 0.5, z);
    });

    // War planning table at centre
    const table = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 2), this.mat.dark);
    table.position.set(cx, 0.85, cz + 2); table.castShadow = true; this.scene.add(table);
    [[-1.2,-0.8],[1.2,-0.8],[-1.2,0.8],[1.2,0.8]].forEach(([dx, dz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.8,8), this.mat.dark);
      leg.position.set(cx+dx, 0.4, cz+2+dz); this.scene.add(leg);
    });
    // Flat "map" surface on table
    const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xd4a870, roughness: 0.9 }));
    mapPlane.rotation.x = -Math.PI/2; mapPlane.position.set(cx, 0.92, cz+2); this.scene.add(mapPlane);

    // Weapon rack on right wall
    this._addWeaponRack(b.maxX - 0.4, H * 0.45, cz + 5);

    // Red-orange dramatic torches
    this._addTorch(b.minX + 0.5, 4, cz - 4, 0xff5511, 0.9, 10);
    this._addTorch(b.minX + 0.5, 4, cz + 4, 0xff5511, 0.9, 10);
    this._addTorch(b.maxX - 0.5, 4, cz + 4, 0xee6622, 0.7, 10);
    this._addPointLight(cx, H - 1, cz, 0xff9966, 0.5, 16);

    this._addWallEngraving(cx, H * 0.7, b.maxZ - 0.15, 4, 1.4, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 4 — Apogee of Carthage (400–264 BC) — THE GRAND HALL
  // Wide majestic room with dome, grand columns, mosaic floor, Tanit obelisk
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom4() {
    const r = ROOMS.r4, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR4;

    // Grand mosaic floor in centre
    this._addMosaicFloor(cx, cz, 14, 14);
    this._addFloor(cx, cz, W, D);

    // Partial dome ceiling
    const halfDiag = Math.sqrt((W/2)**2 + (D/2)**2);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(halfDiag + 1, 40, 24, 0, Math.PI*2, 0, Math.PI/2), this.mat.ceilR4);
    dome.position.set(cx, H, cz); dome.scale.y = 0.4; this.scene.add(dome);

    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // Grand columns — 5 pairs
    const count = 5;
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const z = b.minZ + t * D;
      this._addColumn(b.minX + 2.2, z, H, this.mat.trim, this.mat.capR4);
      this._addColumn(b.maxX - 2.2, z, H, this.mat.trim, this.mat.capR4);
    }

    // Grand arches at back and front gaps
    this._addArch(cx, b.maxZ - 0.2, H, 3.5, this.mat.gold);
    this._addArch(cx, b.minZ + 0.2, H, 3.5, this.mat.gold);

    // ── Rotating Tanit Obelisk — centerpiece ────────────────────────────────
    const pedGroup = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 1.2, 16), this.mat.trim);
    ped.position.y = 0.6; ped.castShadow = true; pedGroup.add(ped);

    const obelisk = this._buildTanitObelisk();
    obelisk.position.y = 1.5; pedGroup.add(obelisk);

    const caseGeo = new THREE.CylinderGeometry(0.75, 0.75, 2.4, 16, 1, true);
    const caseMesh = new THREE.Mesh(caseGeo, this.mat.glass);
    caseMesh.position.y = 1.4;
    caseMesh.userData.artworkId = "tanit-obelisk-r4";
    pedGroup.add(caseMesh);
    this.artworkTargets.push(caseMesh);

    pedGroup.position.set(cx, 0, cz - 3);
    this.scene.add(pedGroup);
    this.rotatingArtifact = pedGroup;
    this.artworkPositions.push(new THREE.Vector3(cx, 1.5, cz - 3));

    // Punic inscriptions high on walls
    this._addWallEngraving(b.minX + 0.15, H * 0.6, cz - 6, 2, 4, Math.PI/2);
    this._addWallEngraving(b.maxX - 0.15, H * 0.6, cz + 6, 2, 4, -Math.PI/2);
    this._addWallEngraving(cx, H * 0.7, b.maxZ - 0.15, 5, 1.4, 0);

    // Brilliant warm lighting
    this._addPointLight(cx, H - 1, cz, 0xffeedd, 1.0, 14);
    this._addPointLight(cx, 3.5, cz - 3, 0xffd4a0, 0.5, 6);
    this._addTorch(b.minX + 0.5, 4, cz - 4, 0xffcc44, 0.8, 12);
    this._addTorch(b.maxX - 0.5, 4, cz - 4, 0xffcc44, 0.8, 12);
    this._addTorch(b.minX + 0.5, 4, cz + 4, 0xffcc44, 0.7, 12);
    this._addTorch(b.maxX - 0.5, 4, cz + 4, 0xffcc44, 0.7, 12);

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 5 — The Punic Wars (264–146 BC)
  // Dramatic, dark, high contrast — red torches, war elephant, battle maps
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom5() {
    const r = ROOMS.r5, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR5;

    this._addFloor(cx, cz, W, D, this.mat.floorR5);
    this._addCeiling(cx, cz, W, D, H);

    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // 2 pairs of war-era columns (darker)
    [cz - 5, cz + 5].forEach(z => {
      this._addColumn(b.minX + 2, z, H);
      this._addColumn(b.maxX - 2, z, H);
    });

    // ── War Elephant — prominent centrepiece ─────────────────────────────────
    const elePed = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.1, 14), this.mat.trim);
    elePed.position.set(cx, 0.55, cz - 5); elePed.castShadow = true; this.scene.add(elePed);
    this.wallBoxes.push(new THREE.Box3(new THREE.Vector3(cx-0.9, 0, cz-5-0.9), new THREE.Vector3(cx+0.9, 1.1, cz-5+0.9)));

    const eleGroup = new THREE.Group();
    this._buildElephant(eleGroup);
    eleGroup.position.set(cx, 1.15, cz - 5); eleGroup.scale.setScalar(1.8); eleGroup.castShadow = true;
    this.scene.add(eleGroup);

    const eleCaseGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.0, 14, 1, true);
    const eleCase = new THREE.Mesh(eleCaseGeo, this.mat.glass);
    eleCase.position.set(cx, 1.1, cz - 5);
    eleCase.userData.artworkId = "war-elephant-r5";
    this.scene.add(eleCase);
    this.artworkTargets.push(eleCase);
    this.artworkPositions.push(new THREE.Vector3(cx, 1.1, cz - 5));

    // Dramatic torch lighting (strong red/orange contrast)
    this._addTorch(b.minX + 0.5, 4, cz - 6, 0xff3300, 1.1, 10);
    this._addTorch(b.minX + 0.5, 4, cz + 2, 0xff4411, 0.9, 10);
    this._addTorch(b.maxX - 0.5, 4, cz - 6, 0xff3300, 1.1, 10);
    this._addTorch(b.maxX - 0.5, 4, cz + 2, 0xff4411, 0.9, 10);
    this._addPointLight(cx, H - 1, cz, 0xff6633, 0.4, 18);
    this._addPointLight(cx, 4, cz - 5, 0xffaa44, 0.5, 8);

    this._addWallEngraving(cx, H * 0.7, b.maxZ - 0.15, 5, 1.4, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 6 — The Fall of Carthage (146 BC)
  // Ruins, broken columns, rubble, ash particles, very dim
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom6() {
    const r = ROOMS.r6, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR6;

    // Cracked dark floor
    this._addFloor(cx, cz, W, D, this.mat.floorR6);
    const crackOverlay = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mat.ruins);
    crackOverlay.rotation.x = -Math.PI/2; crackOverlay.position.set(cx, 0.01, cz); crackOverlay.receiveShadow = true; this.scene.add(crackOverlay);

    // Partial ceiling (destruction feel)
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, D * 0.4), this.mat.ceiling);
    c1.rotation.x = Math.PI/2; c1.position.set(cx - 2, H, cz - 2); this.scene.add(c1);
    const c2 = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.4, D * 0.35), this.mat.ceiling);
    c2.rotation.x = Math.PI/2; c2.position.set(cx + 2, H, cz + 4); this.scene.add(c2);

    // Entry wall (from Room 5 corridor) with gap
    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    // End wall (toward Room 7 corridor)
    this._addWallWithGap(cx, H/2, b.minZ, W, H, T, 0, 4, wm);
    // Side walls — partially intact (use gap to simulate destruction)
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // Broken columns
    this._addBrokenColumn(cx - 5, cz - 4, H, 0.15, 0.10);
    this._addBrokenColumn(cx + 4, cz - 6, H, -0.10, 0.18);
    this._addBrokenColumn(cx - 3, cz + 5, H, 0.08, -0.12);

    // Fallen column piece
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 4, 12), this.mat.ruins);
    fallen.position.set(cx + 3, 0.3, cz + 2); fallen.rotation.z = Math.PI/2; fallen.rotation.y = 0.5;
    fallen.castShadow = true; this.scene.add(fallen);

    // Rubble chunks scattered across the floor
    for (let i = 0; i < 12; i++) {
      const size = 0.15 + Math.random() * 0.45;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size * 0.9), this.mat.ruins);
      chunk.position.set(cx + (Math.random() - 0.5) * (W - 4), size * 0.3, cz + (Math.random() - 0.5) * (D - 3));
      chunk.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
      chunk.castShadow = true; chunk.receiveShadow = true; this.scene.add(chunk);
    }

    // Smouldering embers (tiny glowing cubes)
    for (let i = 0; i < 6; i++) {
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), this.mat.ember);
      ember.position.set(cx + (Math.random()-0.5)*(W-4), 0.04, cz + (Math.random()-0.5)*(D-3));
      this.scene.add(ember);
    }

    // Very dim, smoky lighting
    this._addTorch(b.minX + 0.5, 3, cz - 3, 0xaa6633, 0.35, 7);
    this._addTorch(b.maxX - 0.5, 3, cz + 3, 0xaa5522, 0.3, 6);
    this._addPointLight(cx, H - 2, cz, 0xbb8855, 0.3, 14);

    // Faded Punic inscriptions on one wall
    this._addWallEngraving(b.minX + 0.15, H * 0.5, cz - 3, 1.5, 2.5, Math.PI/2);

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM 7 — Roman Carthage & Legacy (44 BC+)
  // Rebirth: clean white-gold, Roman columns, soft light, reflective ending
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRoom7() {
    const r = ROOMS.r7, b = r.bounds, H = r.height, T = r.thickness;
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const cx = 0, cz = (b.minZ + b.maxZ) / 2;
    const wm = this.mat.wallR7;

    // Small mosaic section near the far wall
    this._addMosaicFloor(cx, b.minZ + 5, W * 0.6, 6);
    this._addFloor(cx, cz, W, D);
    this._addCeiling(cx, cz, W, D, H, this.mat.ceilR7);

    // Coffered ceiling panels (Roman style)
    const cofferMat = new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.85, metalness: 0.02 });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const coffer = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.06, 4), cofferMat);
        coffer.position.set(cx - 4.5 + i * 4.5, H - 0.08, cz - 4 + j * 8);
        this.scene.add(coffer);
      }
    }

    // Entry wall (gap — from Room 6 corridor)
    this._addWallWithGap(cx, H/2, b.maxZ, W, H, T, 0, 4, wm);
    // Far wall (solid — player's journey ends here, has theatre artwork)
    this._addWall(cx, H/2, b.minZ, W, H, T, 0, wm);
    this._addWall(b.minX, H/2, cz, D, H, T, Math.PI/2, wm);
    this._addWall(b.maxX, H/2, cz, D, H, T, Math.PI/2, wm);

    // Roman-style columns (3 pairs, cleaner design)
    [-5, 0, 5].forEach(zOff => {
      this._addColumn(b.minX + 2, cz + zOff, H, this.mat.wallR7, this.mat.capR7);
      this._addColumn(b.maxX - 2, cz + zOff, H, this.mat.wallR7, this.mat.capR7);
    });

    // Grand arch at the entry point of this room
    this._addArch(cx, b.maxZ - 0.2, H, 3.5, this.mat.capR7);

    // Soft, reflective white-gold lighting
    this._addPointLight(cx, H - 1, cz + 4, 0xfff8e8, 0.9, 16);
    this._addPointLight(cx, H - 1, cz - 4, 0xfff8e8, 0.7, 14);
    this._addPointLight(cx, 4, b.minZ + 4, 0xffeedd, 0.5, 8);
    this._addTorch(b.minX + 0.5, 4, cz, 0xffddaa, 0.5, 10);
    this._addTorch(b.maxX - 0.5, 4, cz, 0xffddaa, 0.5, 10);

    // Final engraving — "Memory endures"
    this._addWallEngraving(cx, H * 0.7, b.minZ + 0.15, 4, 1.4, Math.PI);

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARCHED DOORWAYS — double doors with interactive swing animation
  // ═══════════════════════════════════════════════════════════════════════════

  /** Warm oak door texture — visible in dark rooms. */
  _doorWoodTexture() {
    // All 6 doorways share the same texture — generate once, cache forever
    if (this._texCache.doorWood) return this._texCache.doorWood;

    const cw = 256, ch = 512;
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext("2d");

    // Warm honey-oak — reads clearly even in low-light passages
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0,   "#8c5c28");
    bg.addColorStop(0.3, "#a06a30");
    bg.addColorStop(0.7, "#8a5824");
    bg.addColorStop(1,   "#70461c");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

    // Fine vertical grain (subtle light/dark streaks)
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * cw;
      const a = 0.05 + Math.random() * 0.10;
      const light = Math.random() > 0.5;
      ctx.strokeStyle = light
        ? `rgba(160,110,55,${a})`
        : `rgba(10,5,0,${a})`;
      ctx.lineWidth = 0.4 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(
        x + (Math.random()-0.5)*4, ch*0.33,
        x + (Math.random()-0.5)*4, ch*0.66,
        x + (Math.random()-0.5)*6, ch
      );
      ctx.stroke();
    }

    // Raised panel insets (carved rectangles for classic door look)
    const pad = 18, panH = (ch - pad*3) / 2;
    [[pad, pad], [pad, pad*2 + panH]].forEach(([px, py]) => {
      const pw = cw - pad*2;
      // Drop shadow
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px+3, py+3, pw, panH);
      // Panel face (slightly lighter)
      const pFace = ctx.createLinearGradient(px, py, px+pw, py+panH);
      pFace.addColorStop(0, "rgba(140,90,40,0.30)");
      pFace.addColorStop(1, "rgba(30,15,5,0.20)");
      ctx.fillStyle = pFace; ctx.fillRect(px, py, pw, panH);
      // Bevel highlight
      ctx.strokeStyle = "rgba(180,130,60,0.50)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py+panH); ctx.lineTo(px, py); ctx.lineTo(px+pw, py); ctx.stroke();
      // Bevel shadow
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px+pw, py); ctx.lineTo(px+pw, py+panH); ctx.lineTo(px, py+panH); ctx.stroke();
    });

    // Edge darkening
    const vign = ctx.createLinearGradient(0, 0, cw, 0);
    vign.addColorStop(0,    "rgba(0,0,0,0.45)");
    vign.addColorStop(0.08, "rgba(0,0,0,0)");
    vign.addColorStop(0.92, "rgba(0,0,0,0)");
    vign.addColorStop(1,    "rgba(0,0,0,0.45)");
    ctx.fillStyle = vign; ctx.fillRect(0, 0, cw, ch);

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    this._texCache.doorWood = t;   // cache: reused by all doorways
    return t;
  }

  /** Build a voussoir-arch double doorway with carved pilasters. */
  /**
   * Custom BufferGeometry for one voussoir (arch wedge).
   * Arch center sits at mesh.position — no rotation needed.
   * t0 / t1 are angles measured from +X axis CCW (0 = right foot, π = left foot).
   */
  _makeVoussoirGeo(innerR, outerR, t0, t1, depth) {
    const d  = depth / 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);

    // 8 vertices: front (z=+d) then back (z=-d)
    // 0=fi_t0  1=fi_t1  2=fo_t0  3=fo_t1   (f=front, i=inner, o=outer)
    // 4=bi_t0  5=bi_t1  6=bo_t0  7=bo_t1
    const pos = new Float32Array([
      innerR*c0, innerR*s0, +d,
      innerR*c1, innerR*s1, +d,
      outerR*c0, outerR*s0, +d,
      outerR*c1, outerR*s1, +d,
      innerR*c0, innerR*s0, -d,
      innerR*c1, innerR*s1, -d,
      outerR*c0, outerR*s0, -d,
      outerR*c1, outerR*s1, -d,
    ]);

    const idx = [
      0, 2, 3,  0, 3, 1,   // front  (+Z)
      4, 7, 6,  4, 5, 7,   // back   (-Z)
      0, 1, 5,  0, 5, 4,   // inner arc (soffit)
      2, 6, 7,  2, 7, 3,   // outer arc
      0, 4, 6,  0, 6, 2,   // left  side (t0 joint)
      1, 3, 7,  1, 7, 5,   // right side (t1 joint)
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build a full Phoenician/Carthaginian arched entrance with animated double
   * doors.  Returns door pivot/handle/collision data for DoorManager.
   *
   *  createArchedEntrance(cx, cz, openingW, doorH, totalH, passageId)
   */
  _buildDoorway(cx, cz, openingW, doorH, totalH, passageId) {
    const halfOpen = openingW / 2;
    const panelW   = halfOpen;
    const thick    = 0.13;       // door panel thickness
    const depth    = 0.62;       // stone portal depth (Z)
    const colW     = 0.52;       // column face width

    // ── Materials ────────────────────────────────────────────────────────────
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xd2bc98, roughness: 0.88, metalness: 0.00,
      emissive: new THREE.Color(0x1e180a), emissiveIntensity: 0.08,
    });
    const mortarMat = new THREE.MeshStandardMaterial({
      color: 0x9a8868, roughness: 0.95, metalness: 0.00,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc8a030, roughness: 0.28, metalness: 0.68,
      emissive: new THREE.Color(0x5a3a08), emissiveIntensity: 0.38,
    });
    const woodTex = this._doorWoodTexture();
    const doorMat = new THREE.MeshStandardMaterial({
      map: woodTex, roughness: 0.58, metalness: 0.02,
      emissive: new THREE.Color(0x3a2008), emissiveIntensity: 0.13,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x3e2a10, roughness: 0.58, metalness: 0.55,
    });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xa07828, roughness: 0.30, metalness: 0.72,
      emissive: new THREE.Color(0x2a1800), emissiveIntensity: 0.14,
    });

    // ── Stacked stone columns (left & right) ─────────────────────────────────
    const blkH  = 0.44;   // stone block height
    const blkGp = 0.022;  // mortar gap
    const nBlk  = Math.ceil((doorH + 0.1) / blkH);

    [-1, +1].forEach(side => {
      const colX = cx + side * (halfOpen + colW / 2);

      for (let b = 0; b < nBlk; b++) {
        const by = b * blkH;
        const bh = Math.min(blkH - blkGp, doorH + 0.05 - by);
        if (bh <= 0) break;

        // Stone block
        const blk = new THREE.Mesh(new THREE.BoxGeometry(colW, bh, depth), stoneMat);
        blk.position.set(colX, by + bh / 2, cz);
        blk.castShadow = true; blk.receiveShadow = true;
        this.scene.add(blk);

        // Horizontal mortar line
        const hg = new THREE.Mesh(
          new THREE.BoxGeometry(colW + 0.02, blkGp * 0.65, depth + 0.02), mortarMat);
        hg.position.set(colX, by, cz);
        this.scene.add(hg);

        // Vertical mortar groove (one seam per block, alternating side)
        const vOff = side * (b % 2 === 0 ? 0.10 : -0.10);
        const vg   = new THREE.Mesh(
          new THREE.BoxGeometry(blkGp * 0.65, bh + blkGp, depth + 0.02), mortarMat);
        vg.position.set(colX + vOff, by + bh / 2, cz);
        this.scene.add(vg);
      }

      // Two-step base plinth
      [{ w: colW + 0.22, h: 0.07, y: 0.035 },
       { w: colW + 0.12, h: 0.14, y: 0.15  }].forEach(p => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, depth + 0.14), stoneMat);
        m.position.set(colX, p.y, cz);
        m.castShadow = true; this.scene.add(m);
      });

      // Capital
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(colW + 0.18, 0.18, depth + 0.10), stoneMat);
      cap.position.set(colX, doorH + 0.09, cz);
      cap.castShadow = true; this.scene.add(cap);

      // Gold strip on capital
      const capStrip = new THREE.Mesh(
        new THREE.BoxGeometry(colW + 0.20, 0.030, depth + 0.12), goldMat);
      capStrip.position.set(colX, doorH + 0.17, cz);
      this.scene.add(capStrip);

      // Decorative panel carved on column face
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(colW * 0.46, doorH * 0.70, 0.026), mortarMat);
      panel.position.set(colX, doorH * 0.48, cz + depth / 2 + 0.013);
      this.scene.add(panel);
    });

    // ── Voussoir arch (proper trapezoid wedges via custom BufferGeometry) ─────
    const innerR    = halfOpen + 0.04;  // slight clearance from column top
    const archThick = 0.44;
    const outerR    = innerR + archThick;
    const nVoussoir = 13;               // odd so index 6 is the keystone

    for (let i = 0; i < nVoussoir; i++) {
      const t0 = (i       / nVoussoir) * Math.PI;
      const t1 = ((i + 1) / nVoussoir) * Math.PI;
      const isKey = (i === (nVoussoir - 1) / 2);

      const geo = this._makeVoussoirGeo(innerR, outerR, t0, t1, depth);
      const mat = isKey ? goldMat.clone() : stoneMat.clone();
      if (isKey) { mat.emissive = new THREE.Color(0x7a4810); mat.emissiveIntensity = 0.55; }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, doorH, cz);  // arch centre = (cx, doorH)
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Mortar joints between voussoirs (thin dark strips, radially oriented)
    for (let i = 1; i < nVoussoir; i++) {
      const t   = (i / nVoussoir) * Math.PI;
      const mid = innerR + archThick / 2;
      const jt  = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, archThick + 0.06, depth + 0.02), mortarMat);
      jt.position.set(cx + mid * Math.cos(t), doorH + mid * Math.sin(t), cz);
      jt.rotation.z = t - Math.PI / 2;  // align Y-axis radially outward at angle t
      this.scene.add(jt);
    }

    // Gold soffit ring on inside of arch
    const soffitRing = new THREE.Mesh(
      new THREE.TorusGeometry(halfOpen + 0.02, 0.028, 6, 32, Math.PI), goldMat);
    soffitRing.position.set(cx, doorH, cz);
    this.scene.add(soffitRing);

    // ── Frieze above arch ─────────────────────────────────────────────────────
    const archTopY = doorH + outerR;
    const friezeH  = 0.40;
    const friezeW  = openingW + colW * 2 + 0.20;

    const frieze = new THREE.Mesh(
      new THREE.BoxGeometry(friezeW, friezeH, depth), stoneMat);
    frieze.position.set(cx, archTopY + friezeH / 2, cz);
    frieze.castShadow = true; this.scene.add(frieze);

    // Gold strip at bottom of frieze
    const fStrip = new THREE.Mesh(
      new THREE.BoxGeometry(friezeW + 0.04, 0.030, depth + 0.06), goldMat);
    fStrip.position.set(cx, archTopY + 0.015, cz);
    this.scene.add(fStrip);

    // Tanit symbol on frieze face
    const fz = cz + depth / 2 + 0.022;
    const fy = archTopY + friezeH / 2;
    const tanitTri = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 3), goldMat);
    tanitTri.position.set(cx, fy - 0.03, fz);
    tanitTri.rotation.z = Math.PI; this.scene.add(tanitTri);
    const tanitCirc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.056, 0.040, 10), goldMat);
    tanitCirc.rotation.x = Math.PI / 2;
    tanitCirc.position.set(cx, fy + 0.20, fz); this.scene.add(tanitCirc);
    const tanitCres = new THREE.Mesh(
      new THREE.TorusGeometry(0.082, 0.018, 5, 12, Math.PI), goldMat);
    tanitCres.position.set(cx, fy + 0.30, fz);
    tanitCres.rotation.z = Math.PI; this.scene.add(tanitCres);

    // Fill to ceiling
    const fillerBot = archTopY + friezeH;
    if (totalH > fillerBot + 0.15) {
      const fH = totalH - fillerBot;
      const filler = new THREE.Mesh(
        new THREE.BoxGeometry(friezeW, fH, depth), stoneMat);
      filler.position.set(cx, fillerBot + fH / 2, cz);
      this.scene.add(filler);
    }

    // ── Double door panels ────────────────────────────────────────────────────
    const makeDoor = (side) => {
      // side +1 = left leaf (hinge at cx - halfOpen)
      // side -1 = right leaf (hinge at cx + halfOpen)
      const pivot = new THREE.Group();
      pivot.position.set(cx - side * halfOpen, 0, cz);
      this.scene.add(pivot);

      // Main panel (wood)
      const panelMesh = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, doorH, thick), doorMat);
      panelMesh.position.set(side * panelW / 2, doorH / 2, 0);
      panelMesh.castShadow = true; panelMesh.receiveShadow = true;
      panelMesh.userData.doorId = passageId;
      pivot.add(panelMesh);

      // Vertical plank divisions (3 strips = 4 planks)
      [0.25, 0.50, 0.75].forEach(xf => {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.034, doorH * 0.94, thick + 0.014), ironMat);
        strip.position.set(side * panelW * xf, doorH / 2, 0.005);
        pivot.add(strip);
      });

      // Horizontal iron bands (3 bands)
      [0.18, 0.50, 0.82].forEach(yf => {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(panelW - 0.025, 0.056, thick + 0.016), ironMat);
        band.position.set(side * panelW / 2, yf * doorH, 0.006);
        band.userData.doorId = passageId;
        pivot.add(band);

        // Rivets along each band
        [0.15, 0.38, 0.62, 0.85].forEach(rx => {
          const rivet = new THREE.Mesh(
            new THREE.SphereGeometry(0.020, 6, 4), ironMat);
          rivet.position.set(side * panelW * rx, yf * doorH, thick / 2 + 0.020);
          pivot.add(rivet);
        });
      });

      // Horizontal pull-bar handle
      const handleY = doorH * 0.46;
      const handleX = side * (panelW - 0.20);
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.30, 10), bronzeMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(handleX, handleY, thick / 2 + 0.065);
      bar.userData.doorId = passageId;
      pivot.add(bar);

      [-0.15, 0.15].forEach(ox => {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), bronzeMat);
        cap.position.set(handleX + ox, handleY, thick / 2 + 0.065);
        cap.userData.doorId = passageId;
        pivot.add(cap);
        const bracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.040, 0.072, 0.095), bronzeMat);
        bracket.position.set(handleX + ox, handleY, thick / 2 + 0.020);
        pivot.add(bracket);
      });

      return { pivot, panel: panelMesh, bar };
    };

    const left  = makeDoor(+1);
    const right = makeDoor(-1);

    // ── Entrance torch lights (left & right, at 1.25 × door height) ──────────
    [-1, +1].forEach(side => {
      const lx = cx + side * (halfOpen + colW + 0.5);
      const ly = doorH * 1.25;
      const torchLight = new THREE.PointLight(0xff9040, 0.85, 7, 2);
      torchLight.position.set(lx, ly, cz + 0.8);
      this.scene.add(torchLight);
    });

    // Soft frontal spotlight for door readability
    const dSpot = new THREE.SpotLight(0xfff0e0, 0.80, 9, Math.PI / 5, 0.55, 1.8);
    dSpot.position.set(cx, doorH * 0.85, cz + 3.5);
    dSpot.target.position.set(cx, doorH * 0.38, cz);
    this.scene.add(dSpot); this.scene.add(dSpot.target);

    // ── Collision boxes (removed when doors open) ────────────────────────────
    const lBox = new THREE.Box3(
      new THREE.Vector3(cx - halfOpen, 0, cz - thick),
      new THREE.Vector3(cx,            doorH, cz + thick)
    );
    const rBox = new THREE.Box3(
      new THREE.Vector3(cx,            0, cz - thick),
      new THREE.Vector3(cx + halfOpen, doorH, cz + thick)
    );
    this.wallBoxes.push(lBox, rBox);

    return {
      leftPivot:     left.pivot,
      rightPivot:    right.pivot,
      handles:       [left.panel, right.panel, left.bar, right.bar],
      collisionBoxes:[lBox, rBox],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSAGE BUILDER — with year labels and height transitions
  // ═══════════════════════════════════════════════════════════════════════════

  _buildPassage(p) {
    const fromRoom = ROOMS[p.from], toRoom = ROOMS[p.to];
    const h1 = fromRoom?.height || p.h, h2 = toRoom?.height || p.h;
    const maxH = Math.max(h1, h2, p.h);

    // Floor and ceiling of corridor
    this._addFloor(p.cx, p.cz, p.w + 0.4, p.d + 0.4);
    this._addCeiling(p.cx, p.cz, p.w, p.d, maxH);

    // Side walls (Z-aligned corridor: walls are along Z axis)
    this._addWall(p.cx - p.w/2, maxH/2, p.cz, p.d, maxH, 0.28, Math.PI/2, this.mat.wall);
    this._addWall(p.cx + p.w/2, maxH/2, p.cz, p.d, maxH, 0.28, Math.PI/2, this.mat.wall);

    // Year labels on both side walls at eye-level
    this._addYearLabel(p.cx - p.w/2 + 0.14, maxH * 0.45, p.cz, p.year, Math.PI/2);
    this._addYearLabel(p.cx + p.w/2 - 0.14, maxH * 0.45, p.cz, p.year, -Math.PI/2);

    // Subtle engraving stripe on corridor walls
    this._addWallEngraving(p.cx - p.w/2 + 0.14, maxH * 0.65, p.cz, 0.8, p.d * 0.7, Math.PI/2);

    // Torch in the passage
    this._addTorch(0, maxH * 0.55, p.cz, 0xffbb66, 0.4, 6);

    // Height transition filler panels at room boundaries
    [p.from, p.to].forEach(roomId => {
      const room = ROOMS[roomId];
      if (!room || room.height >= maxH) return;
      const diff = maxH - room.height;
      const ty = room.height + diff / 2;
      const b = room.bounds;
      const wallZ = p.cz > (b.minZ + b.maxZ) / 2 ? b.maxZ : b.minZ;
      this._addWall(p.cx, ty, wallZ, p.w + 0.2, diff, 0.38, 0, this.mat.wall);
    });

    // ── Arched double door ─────────────────────────────────────────────────
    // Place at passage midpoint, opening width = passage clear gap (3.6m)
    const openingW = p.w - 0.4;        // 3.6m clear opening inside jambs
    const doorH    = Math.min(3.4, maxH * 0.52);
    const doorData = this._buildDoorway(p.cx, p.cz, openingW, doorH, maxH, p.id);
    this._pendingDoors.push({ passageId: p.id, ...doorData });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARTWORK LOADING — data-driven from ARTWORK_DATA
  // Skips "centerpiece" type (built directly in room methods)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Loads panel images: room `posterImage` and wall exhibit `url` (local or https),
   * via fetch so file size / resolution can be capped before canvas compositing.
   */
  async _preloadPanelImages() {
    const toLoad = ARTWORK_DATA.filter((a) => this._panelImageSource(a));

    const loadOne = async (art) => {
      const url = this._panelImageSource(art);
      if (!url) return;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), POSTER_FETCH_MS);
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          console.warn("[MuseumBuilder] Poster not found or blocked:", res.status, url);
          return;
        }
        const cl = res.headers.get("content-length");
        if (cl && Number(cl) > POSTER_MAX_FILE_BYTES) {
          console.warn(
            `[MuseumBuilder] Poster too large (${cl} bytes max ${POSTER_MAX_FILE_BYTES}), skipping:`,
            url,
          );
          return;
        }
        const blob = await res.blob();
        if (blob.size > POSTER_MAX_FILE_BYTES) {
          console.warn(
            `[MuseumBuilder] Poster file too large (${(blob.size / (1024 * 1024)).toFixed(1)} MB; max ~${POSTER_MAX_FILE_BYTES / (1024 * 1024)} MB). Compress or resize the image:`,
            url,
          );
          return;
        }

        let bmp;
        try {
          bmp = await createImageBitmap(blob);
        } catch (e) {
          console.warn("[MuseumBuilder] Unsupported or corrupt poster image:", url, e);
          return;
        }

        const drawable = this._clampDrawableForPoster(bmp, POSTER_MAX_EDGE_PX);
        if (bmp !== drawable && typeof bmp.close === "function") bmp.close();
        this._panelImageCache.set(art.id, drawable);
      } catch (e) {
        if (e.name === "AbortError") {
          console.warn("[MuseumBuilder] Poster fetch timed out:", url);
        } else {
          console.warn("[MuseumBuilder] Poster load failed:", url, e);
        }
      } finally {
        clearTimeout(timer);
      }
    };

    await Promise.all(toLoad.map((a) => loadOne(a)));
  }

  /**
   * @param {HTMLImageElement | ImageBitmap | HTMLCanvasElement} source
   * @returns {HTMLCanvasElement | ImageBitmap | HTMLImageElement}
   */
  _clampDrawableForPoster(source, maxEdge) {
    const w = source.width;
    const h = source.height;
    if (!w || !h) return source;
    const m = Math.max(w, h);
    if (m <= maxEdge) return source;

    const scale = maxEdge / m;
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const cv = document.createElement("canvas");
    cv.width = tw;
    cv.height = th;
    const ctx = cv.getContext("2d");
    if (!ctx) return source;
    ctx.drawImage(source, 0, 0, tw, th);
    return cv;
  }

  /**
   * Imported GLBs from `museum/3d/` — parented to room Groups (same visibility as room geometry).
   * Scroll in r1; gold + spell book in r2 — all three sit in the first two rooms so streaming shows them together.
   *
   * @param {Record<string, THREE.Group>} roomGroups
   */
  async _placeImportedGlbProps(roomGroups) {
    const loader = new GLTFLoader();
    const envMap = this.envMap;

    /** Resolve next to this module so loads work even when the HTML base URL differs. */
    const glbUrl = (filename) => new URL(`3d/${filename}`, import.meta.url).href;

    const loadGltf = (filename) =>
      new Promise((resolve, reject) => {
        loader.load(glbUrl(filename), resolve, undefined, reject);
      });

    const applyEnvAndShadows = (object) => {
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          if ("envMap" in mat) {
            mat.envMap = envMap;
            mat.envMapIntensity = typeof mat.envMapIntensity === "number"
              ? Math.min(1.0, mat.envMapIntensity + 0.32)
              : 0.52;
            mat.needsUpdate = true;
          }
        }
      });
    };

    /**
     * @param {import("three/addons/loaders/GLTFLoader.js").GLTF} gltf
     * @param {string} roomId
     * @param {THREE.Vector3} worldPos  model base rests at this y (pedestal top)
     * @param {number} rotationY
     * @param {number} targetHeight
     */
    const addExhibit = (gltf, roomId, worldPos, rotationY, targetHeight) => {
      const root = gltf.scene;
      applyEnvAndShadows(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const baseH = Math.max(size.y, 1e-4);
      root.scale.setScalar(targetHeight / baseH);
      root.rotation.y = rotationY;
      root.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(root);
      root.position.set(worldPos.x, worldPos.y - box2.min.y, worldPos.z);
      const grp = roomGroups[roomId];
      if (grp) grp.add(root);
      else console.warn("[MuseumBuilder] Missing room group for GLB prop:", roomId);
    };

    const addPlinth = (roomId, x, z, w, h, d) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat.trim);
      mesh.position.set(x, h * 0.5, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const grp = roomGroups[roomId];
      if (grp) grp.add(mesh);
    };

    const entries = [
      {
        file: "pixellabs-scroll-3468.glb",
        roomId: "r1",
        plinth: { x: 4.35, z: 73.8, w: 0.55, h: 0.42, d: 0.55 },
        exhibit: { x: 4.35, yPed: 0.42, z: 73.8, rot: -0.65, height: 0.32 },
      },
      {
        file: "jeremywoodsster-gold-2548.glb",
        roomId: "r2",
        plinth: { x: -5.35, z: 57.2, w: 0.62, h: 0.28, d: 0.62 },
        exhibit: { x: -5.35, yPed: 0.28, z: 57.2, rot: 0.5, height: 0.38 },
      },
      {
        file: "pixellabs-spell-book-3508.glb",
        roomId: "r2",
        plinth: { x: 5.45, z: 54.0, w: 0.58, h: 0.38, d: 0.58 },
        exhibit: { x: 5.45, yPed: 0.38, z: 54.0, rot: -Math.PI * 0.22, height: 0.34 },
      },
    ];

    const results = await Promise.allSettled(entries.map((e) => loadGltf(e.file)));

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const e = entries[i];
      if (res.status !== "fulfilled") {
        console.warn("[MuseumBuilder] GLB exhibit failed to load:", glbUrl(e.file), res.reason);
        continue;
      }
      addPlinth(e.roomId, e.plinth.x, e.plinth.z, e.plinth.w, e.plinth.h, e.plinth.d);
      addExhibit(
        res.value,
        e.roomId,
        new THREE.Vector3(e.exhibit.x, e.exhibit.yPed, e.exhibit.z),
        e.exhibit.rot,
        e.exhibit.height,
      );
    }
  }

  _loadArtworks() {
    for (const art of ARTWORK_DATA) {
      if (art.type === "centerpiece") continue;
      const room = ROOMS[art.zone];
      if (!room) continue;

      switch (art.type) {
        case "wall":     this._placeWallArtwork(art, room);     break;
        case "pedestal": this._placePedestalArtifact(art, room); break;
        case "case":     this._placeCaseArtifact(art, room);     break;
        default:         this._placeWallArtwork(art, room);
      }
    }
  }

  _placeWallArtwork(art, room) {
    const pos   = this._artPos(art, room);
    const rotY  = this._artRot(art);
    this._addFramedArtwork(null, art, pos, rotY);

    const lx   = pos.x + Math.sin(rotY) * 1.2;
    const lz   = pos.z + Math.cos(rotY) * 1.2;
    const spot = new THREE.SpotLight(0xfff0d8, 1.4, 10, Math.PI / 8, 0.35, 1.4);
    spot.position.set(lx, room.height - 0.4, lz);
    spot.target.position.copy(pos);
    this.scene.add(spot); this.scene.add(spot.target);

    this.artworkPositions.push(pos.clone());
  }

  _placePedestalArtifact(art, room) {
    const pos = this._artPosFloor(art, room);
    const pedH = 1.0;

    // Stepped marble pedestal: base slab → shaft → top slab
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xd8cdb8, roughness: 0.55, metalness: 0.04,
      emissive: 0x302818, emissiveIntensity: 0.08,
    });
    const baseSlab = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.78), marbleMat);
    baseSlab.position.set(pos.x, 0.05, pos.z); baseSlab.castShadow = true; this.scene.add(baseSlab);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.52, pedH - 0.2, 0.52), marbleMat);
    shaft.position.set(pos.x, 0.1 + (pedH - 0.2) / 2, pos.z); shaft.castShadow = true; this.scene.add(shaft);
    const topSlab = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.68), marbleMat);
    topSlab.position.set(pos.x, pedH, pos.z); topSlab.castShadow = true; this.scene.add(topSlab);
    // Gold trim strip around top slab
    const goldRim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.72), this.mat.gold);
    goldRim.position.set(pos.x, pedH + 0.06, pos.z); this.scene.add(goldRim);
    this.wallBoxes.push(new THREE.Box3(
      new THREE.Vector3(pos.x - 0.42, 0, pos.z - 0.42),
      new THREE.Vector3(pos.x + 0.42, pedH + 1.1, pos.z + 0.42)
    ));

    // Artifact on top
    const artifact = this._buildArtifactByCategory(art);
    artifact.position.set(pos.x, pedH + 0.1, pos.z);
    artifact.castShadow = true;
    this.scene.add(artifact);

    // Glass case (open-top cylinder)
    const caseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 1.05, 16, 1, true),
      this.mat.glass
    );
    caseMesh.position.set(pos.x, pedH + 0.52, pos.z);
    caseMesh.userData.artworkId = art.id;
    this.scene.add(caseMesh);
    this.artworkTargets.push(caseMesh);

    // Case top disc
    const caseLid = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), this.mat.glass);
    caseLid.rotation.x = -Math.PI / 2;
    caseLid.position.set(pos.x, pedH + 1.06, pos.z);
    this.scene.add(caseLid);

    // Dedicated spotlight directly above
    const spot = new THREE.SpotLight(0xfff2d8, 1.6, 8, Math.PI / 7, 0.35, 1.5);
    spot.position.set(pos.x, room.height - 0.3, pos.z);
    spot.target.position.set(pos.x, pedH + 0.5, pos.z);
    spot.castShadow = false;
    this.scene.add(spot); this.scene.add(spot.target);

    // Warm fill from slightly in front
    this._addPointLight(pos.x, pedH + 1.3, pos.z + 0.6, 0xffe4b0, 0.6, 3.5);


    this.artworkPositions.push(new THREE.Vector3(pos.x, pedH, pos.z));
  }

  _placeCaseArtifact(art, room) {
    const pos = this._artPosFloor(art, room);
    const baseH = 0.78;

    // Stepped display table
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xd0c8b0, roughness: 0.58, metalness: 0.04,
      emissive: 0x281e10, emissiveIntensity: 0.08,
    });
    const tableBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, baseH - 0.08, 0.72), marbleMat);
    tableBase.position.set(pos.x, (baseH - 0.08) / 2, pos.z); tableBase.castShadow = true; this.scene.add(tableBase);
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.66), marbleMat);
    tableTop.position.set(pos.x, baseH - 0.02, pos.z); tableTop.castShadow = true; this.scene.add(tableTop);
    const goldEdge = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.022, 0.70), this.mat.gold);
    goldEdge.position.set(pos.x, baseH + 0.02, pos.z); this.scene.add(goldEdge);
    this.wallBoxes.push(new THREE.Box3(
      new THREE.Vector3(pos.x - 0.38, 0, pos.z - 0.38),
      new THREE.Vector3(pos.x + 0.38, baseH + 0.65, pos.z + 0.38)
    ));

    // Small artifact inside
    const item = this._buildSmallArtifact(art);
    item.position.set(pos.x, baseH + 0.12, pos.z);
    this.scene.add(item);

    // Glass dome
    const domeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.30, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.mat.glass
    );
    domeMesh.position.set(pos.x, baseH + 0.01, pos.z);
    domeMesh.userData.artworkId = art.id;
    this.scene.add(domeMesh);
    this.artworkTargets.push(domeMesh);

    // Spotlight
    const spot = new THREE.SpotLight(0xfff2d8, 1.2, 5, Math.PI / 9, 0.4, 1.5);
    spot.position.set(pos.x, room.height - 0.5, pos.z);
    spot.target.position.set(pos.x, baseH + 0.3, pos.z);
    this.scene.add(spot); this.scene.add(spot.target);

    this._addPointLight(pos.x, baseH + 0.9, pos.z + 0.5, 0xffe4b0, 0.45, 3.0);
    this.artworkPositions.push(new THREE.Vector3(pos.x, baseH, pos.z));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARTWORK POSITION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _artPos(art, room) {
    const b = room.bounds, H = room.height;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    switch (art.wall) {
      case "back":  return new THREE.Vector3(cx + (art.offset || 0), H * art.heightFactor, b.maxZ - 0.3);
      case "front": return new THREE.Vector3(cx + (art.offset || 0), H * art.heightFactor, b.minZ + 0.3);
      case "left":  return new THREE.Vector3(b.minX + 0.3, H * art.heightFactor, cz + (art.offset || 0));
      case "right": return new THREE.Vector3(b.maxX - 0.3, H * art.heightFactor, cz + (art.offset || 0));
      default:      return new THREE.Vector3(cx + (art.offset || 0), H * (art.heightFactor || 0.45), b.minZ + 0.3);
    }
  }

  _artPosFloor(art, room) {
    const b = room.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const margin = 2.5;
    switch (art.wall) {
      case "center": return { x: cx + (art.offset || 0), z: cz };
      case "left":   return { x: b.minX + margin, z: cz + (art.offset || 0) };
      case "right":  return { x: b.maxX - margin, z: cz + (art.offset || 0) };
      case "back":   return { x: cx + (art.offset || 0), z: b.maxZ - margin };
      case "front":  return { x: cx + (art.offset || 0), z: b.minZ + margin };
      default:       return { x: cx + (art.offset || 0), z: b.minZ + margin };
    }
  }

  _artRot(art) {
    switch (art.wall) {
      case "back":  return Math.PI;
      case "front": return 0;
      case "left":  return Math.PI / 2;
      case "right": return -Math.PI / 2;
      default:      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAMED ARTWORK — parchment panels; hero image from posterImage / wall url
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Local `./…` poster file, or wall artwork `url` (same-origin / CORS).
   * `posterImage` wins if both are set.
   */
  _panelImageSource(art) {
    if (art.posterImage) return art.posterImage;
    if (art.type === "wall" && art.url) return art.url;
    return null;
  }

  _addFramedArtwork(_loader, art, pos, rotY) {
    const pad   = 0.14;
    const depth = 0.12;
    const group = new THREE.Group();
    group.position.copy(pos); group.rotation.y = rotY;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(art.w + pad * 2, art.h + pad * 2, depth),
      this.mat.frame,
    );
    frame.position.z = -depth / 2;
    frame.castShadow = true;
    frame.userData.artworkId = art.id;
    group.add(frame);

    const tex = this._makeArtworkPanel(art, Math.round(art.w * 256), Math.round(art.h * 256));
    const panelMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.80, metalness: 0.0,
      emissive: new THREE.Color(0xd4b07a), emissiveIntensity: 0.18,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(art.w, art.h), panelMat);
    plane.position.z = depth / 2 + 0.015;
    plane.userData.artworkId = art.id;
    group.add(plane);

    this.artworkTargets.push(frame, plane);
    this.scene.add(group);
  }

  /**
   * Generates a rich canvas texture for a wall-mounted artwork panel.
   * Renders: decorative border, category illustration, title, and description.
   */
  _makeArtworkPanel(art, cw, ch) {
    cw = Math.max(256, cw); ch = Math.max(256, ch);
    if (art.poster && Array.isArray(art.poster.rows)) {
      return this._makeInfoPosterPanel(art, cw, ch);
    }

    const cv  = document.createElement("canvas");
    cv.width  = cw; cv.height = ch;
    const ctx = cv.getContext("2d");

    // ── Background — light aged parchment ────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, cw, ch);
    // Warm cream tones, slightly varied per category
    const bgColors = {
      religion:     ["#f5ead4", "#ede0c4"],
      trade:        ["#f4ecca", "#eae3ba"],
      military:     ["#f0e8d8", "#e8dcc8"],
      daily:        ["#f3ecd8", "#eae4cc"],
      architecture: ["#f2ead6", "#e8e0cc"],
    };
    const [c1, c2] = bgColors[art.category] || ["#f2e8d2", "#e8dfc4"];
    bg.addColorStop(0, c1); bg.addColorStop(1, c2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

    // Subtle parchment grain (dark specks instead of light on dark)
    for (let i = 0; i < 1800; i++) {
      const nx = Math.random() * cw, ny = Math.random() * ch;
      const a  = Math.random() * 0.035;
      ctx.fillStyle = `rgba(80,50,20,${a})`;
      ctx.fillRect(nx, ny, 1, 1);
    }

    // ── Ornamental border — dark gold/brown on light background ───────────────
    const bw = Math.max(8, Math.round(cw * 0.03));
    ctx.strokeStyle = "rgba(110,75,20,0.80)"; ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, cw - bw, ch - bw);
    ctx.strokeStyle = "rgba(110,75,20,0.35)"; ctx.lineWidth = Math.max(1, bw * 0.4);
    const bi = bw * 1.6;
    ctx.strokeRect(bi, bi, cw - bi * 2, ch - bi * 2);

    // Corner ornaments
    const crnr = [[bw, bw], [cw - bw, bw], [bw, ch - bw], [cw - bw, ch - bw]];
    ctx.fillStyle = "rgba(130,90,25,0.75)";
    crnr.forEach(([cx2, cy2]) => {
      const s = bw * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - s); ctx.lineTo(cx2 + s, cy2);
      ctx.lineTo(cx2, cy2 + s); ctx.lineTo(cx2 - s, cy2);
      ctx.closePath(); ctx.fill();
    });

    // ── Hero image (local / remote `url`) or category illustration ─────────
    const illArea = ch * 0.44;
    const heroW = cw - bw * 4;
    const heroH = illArea * 0.9;
    const heroX = bw * 2;
    const heroY = bw * 3;
    const wallImg = this._panelImageCache.get(art.id);
    if (wallImg && wallImg.width) {
      ctx.save();
      ctx.strokeStyle = "rgba(90,55,20,0.28)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(heroX, heroY, heroW, heroH);
      this._drawCoverFitInRect(ctx, wallImg, heroX, heroY, heroW, heroH);
      ctx.restore();
    } else {
      const illX = cw / 2;
      const illY = bw * 3 + illArea * 0.44;
      ctx.save();
      ctx.translate(illX, illY);
      ctx.scale(Math.min(cw, ch) / 360, Math.min(cw, ch) / 360);
      this._drawCategoryIllustration(ctx, art);
      ctx.restore();
    }

    // ── Decorative divider ────────────────────────────────────────────────────
    const divY = bw * 3 + illArea;
    ctx.strokeStyle = "rgba(110,75,20,0.50)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bw * 3, divY); ctx.lineTo(cw - bw * 3, divY); ctx.stroke();
    ctx.fillStyle = "rgba(110,75,20,0.60)";
    ctx.beginPath(); ctx.arc(cw / 2, divY, 4, 0, Math.PI * 2); ctx.fill();

    // ── Title — large, dark, fully legible ───────────────────────────────────
    const titleY = divY + ch * 0.06;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const titleSize = Math.max(16, Math.round(ch * 0.062));
    ctx.font        = `bold ${titleSize}px "Palatino Linotype", Georgia, serif`;
    ctx.fillStyle   = "#1a0e04";          // near-black dark brown
    ctx.shadowColor = "rgba(240,220,180,0.6)";
    ctx.shadowBlur  = 3;
    this._wrapText(ctx, art.name || "", cw / 2, titleY, cw - bw * 6, titleSize * 1.4);
    ctx.restore();

    // ── Category / origin badge ───────────────────────────────────────────────
    if (art.category) {
      const badgeY = ch - bw * 2.5;
      ctx.save();
      ctx.textAlign    = "center";
      ctx.textBaseline = "bottom";
      const badgeSize  = Math.max(11, Math.round(ch * 0.040));
      ctx.font         = `${badgeSize}px "Palatino Linotype", Georgia, serif`;
      ctx.fillStyle    = "rgba(90,55,15,0.80)";  // dark readable brown
      ctx.fillText(
        art.category.toUpperCase() + (art.origin ? "  ·  " + art.origin : ""),
        cw / 2, badgeY
      );
      ctx.restore();
    }

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }

  /** Cover-fit `img` into axis-aligned rect (image larger than box is cropped). */
  _drawCoverFitInRect(ctx, img, x, y, boxW, boxH) {
    const iw = img.width;
    const ih = img.height;
    if (!iw || !ih) return;
    const scale = Math.max(boxW / iw, boxH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (boxW - dw) / 2;
    const dy = y + (boxH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /**
   * Draws a loaded bitmap (cover-fit) in the top “hero” band of an info poster.
   */
  _drawPosterHeroImage(ctx, img, cw, bw, illH, illY) {
    const pad = bw * 3;
    const boxW = cw - pad * 2;
    const boxH = illH * 1.08;
    const x = pad;
    const y = illY - boxH / 2;
    const iw = img.width;
    const ih = img.height;
    if (!iw || !ih) return;

    ctx.save();
    ctx.strokeStyle = "rgba(90,55,20,0.28)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, boxW, boxH);
    this._drawCoverFitInRect(ctx, img, x, y, boxW, boxH);
    ctx.restore();
  }

  /**
   * Dense “museum guide” poster — same parchment frame language as normal
   * panels, but with labelled rows (period, key idea, figures, fun fact).
   */
  _makeInfoPosterPanel(art, cw, ch) {
    const room = ROOMS[art.zone];
    const p = art.poster;
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext("2d");

    const bw = Math.max(8, Math.round(cw * 0.028));
    const bgColors = {
      religion:     ["#f5ead4", "#ede0c4"],
      trade:        ["#f4ecca", "#eae3ba"],
      military:     ["#f0e8d8", "#e8dcc8"],
      daily:        ["#f3ecd8", "#eae4cc"],
      architecture: ["#f2ead6", "#e8e0cc"],
    };
    const [c1, c2] = bgColors[art.category] || ["#f2e8d2", "#e8dfc4"];
    const bg = ctx.createLinearGradient(0, 0, cw, ch);
    bg.addColorStop(0, c1);
    bg.addColorStop(1, c2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    for (let i = 0; i < 900; i++) {
      const nx = Math.random() * cw;
      const ny = Math.random() * ch;
      ctx.fillStyle = `rgba(80,50,20,${Math.random() * 0.032})`;
      ctx.fillRect(nx, ny, 1, 1);
    }

    ctx.strokeStyle = "rgba(110,75,20,0.82)";
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, cw - bw, ch - bw);
    ctx.strokeStyle = "rgba(110,75,20,0.32)";
    ctx.lineWidth = Math.max(1, bw * 0.38);
    const bi = bw * 1.55;
    ctx.strokeRect(bi, bi, cw - bi * 2, ch - bi * 2);

    const illH = ch * 0.17;
    const illY = bw * 2.2 + illH * 0.48;
    const heroImg = this._panelImageCache.get(art.id);
    if (heroImg && heroImg.width) {
      this._drawPosterHeroImage(ctx, heroImg, cw, bw, illH, illY);
    } else {
      ctx.save();
      ctx.translate(cw / 2, illY);
      ctx.scale(Math.min(cw, ch) / 340, Math.min(cw, ch) / 340);
      this._drawCategoryIllustration(ctx, art);
      ctx.restore();
    }

    const divY = bw * 2.2 + illH + bw * 0.6;
    ctx.strokeStyle = "rgba(110,75,20,0.48)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bw * 2.5, divY);
    ctx.lineTo(cw - bw * 2.5, divY);
    ctx.stroke();

    const padX = bw * 2.8;
    const maxTextW = cw - padX * 2;
    let y = divY + ch * 0.02;

    const rn = room?.roomNumber ?? "?";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${Math.max(10, Math.round(ch * 0.028))}px "Palatino Linotype", Georgia, serif`;
    ctx.fillStyle = "rgba(95,60,18,0.72)";
    ctx.fillText(`ROOM ${String(rn).padStart(2, "0")}  ·  AT-A-GLANCE`, cw / 2, y);
    y += Math.round(ch * 0.036);

    ctx.font = `600 ${Math.max(11, Math.round(ch * 0.032))}px "Palatino Linotype", Georgia, serif`;
    ctx.fillStyle = "rgba(70,42,12,0.88)";
    ctx.fillText(`Period: ${p.period}`, cw / 2, y);
    y += Math.round(ch * 0.044);

    const titleSize = Math.max(15, Math.round(ch * 0.046));
    const titleLH = titleSize * 1.2;
    ctx.font = `700 ${titleSize}px "Palatino Linotype", Georgia, serif`;
    ctx.fillStyle = "#1a0e04";
    const titleLines = this._countWrapLines(ctx, art.name || "", maxTextW);
    this._wrapText(ctx, art.name || "", cw / 2, y, maxTextW, titleLH);
    y += titleLines * titleLH + Math.round(ch * 0.012);

    if (room?.subtitle) {
      const subSize = Math.max(10, Math.round(ch * 0.03));
      const subLH = Math.round(ch * 0.034);
      ctx.font = `italic ${subSize}px "Palatino Linotype", Georgia, serif`;
      ctx.fillStyle = "rgba(70,42,12,0.78)";
      const nSub = this._countWrapLines(ctx, room.subtitle, maxTextW);
      this._wrapText(ctx, room.subtitle, cw / 2, y, maxTextW, subLH);
      y += nSub * subLH + Math.round(ch * 0.016);
    }

    y += Math.round(ch * 0.014);
    const labelSize = Math.max(9, Math.round(ch * 0.026));
    const valueSize = Math.max(10, Math.round(ch * 0.03));
    const valueLH = valueSize * 1.28;

    ctx.textAlign = "left";
    for (const row of p.rows) {
      if (!row || row.length < 2) continue;
      const [label, value] = row;
      ctx.font = `700 ${labelSize}px "Palatino Linotype", Georgia, serif`;
      ctx.fillStyle = "rgba(120,75,20,0.92)";
      ctx.fillText(String(label).toUpperCase(), padX, y);
      y += labelSize * 1.35;
      ctx.font = `400 ${valueSize}px "Palatino Linotype", Georgia, serif`;
      ctx.fillStyle = "#2a1808";
      const nVal = this._countWrapLines(ctx, String(value), maxTextW);
      this._wrapTextLeft(ctx, String(value), padX, y, maxTextW, valueLH);
      y += nVal * valueLH + Math.round(ch * 0.012);
    }

    if (p.funFact) {
      y += Math.round(ch * 0.008);
      ctx.strokeStyle = "rgba(110,75,20,0.25)";
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(cw - padX, y);
      ctx.stroke();
      y += Math.round(ch * 0.02);
      const ffSize = Math.max(10, Math.round(ch * 0.028));
      const ffLH = Math.round(ch * 0.032);
      ctx.font = `italic ${ffSize}px "Palatino Linotype", Georgia, serif`;
      ctx.fillStyle = "rgba(90,55,15,0.88)";
      const nFf = this._countWrapLines(ctx, `"${p.funFact}"`, maxTextW);
      this._wrapTextLeft(ctx, `"${p.funFact}"`, padX, y, maxTextW, ffLH);
      y += nFf * ffLH;
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const badgeY = ch - bw * 1.8;
    ctx.font = `${Math.max(10, Math.round(ch * 0.03))}px "Palatino Linotype", Georgia, serif`;
    ctx.fillStyle = "rgba(90,55,15,0.75)";
    ctx.fillText(
      art.category.toUpperCase() + (art.origin ? "  ·  " + art.origin : ""),
      cw / 2,
      badgeY,
    );

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /** Left-aligned word wrap. */
  _wrapTextLeft(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(" ");
    let line = "";
    let lineIndex = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + lineIndex * lineH);
        lineIndex += 1;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y + lineIndex * lineH);
  }

  /** Line count for wrapped text at current ctx.font (matches _wrapText). */
  _countWrapLines(ctx, text, maxW) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
    return Math.max(1, lines.length);
  }

  /** Draw a category-specific symbolic illustration centred at (0,0). */
  _drawCategoryIllustration(ctx, art) {
    const id = art.id || "";
    const gold = "rgba(140,95,10,0.90)";
    const goldD = "rgba(100,65,8,0.70)";

    // Compact “room guide” seal — all overview posters share this motif
    if (id.startsWith("room-overview-")) {
      const n = (art.zone && String(art.zone).replace("r", "")) || "?";
      ctx.strokeStyle = gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = goldD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '700 22px "Palatino Linotype", Georgia, serif';
      ctx.fillStyle = gold;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n, 0, 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      return;
    }

    // Dark, saturated colours that read clearly on the light parchment background
    const red    = "rgba(160,40,25,0.88)";
    const stone  = "rgba(80,65,50,0.75)";
    const bronze = "rgba(110,75,20,0.88)";

    if (art.category === "religion" || id.includes("tanit") || id.includes("stele")) {
      // Tanit symbol
      ctx.strokeStyle = gold; ctx.fillStyle = "rgba(210,170,60,0.18)"; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-42, 48); ctx.lineTo(0, -28); ctx.lineTo(42, 48); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -50, 18, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -72, 28, Math.PI + 0.4, -0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-48, 14); ctx.lineTo(48, 14); ctx.stroke();
      // glow dots
      ctx.fillStyle = gold;
      [[0,-50],[0,-28],[-42,48],[42,48]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.fill();
      });

    } else if (art.category === "trade" || id.includes("amphora") || id.includes("map")) {
      if (id.includes("map") || id.includes("route")) {
        // Simplified Mediterranean map outline
        ctx.strokeStyle = gold; ctx.lineWidth = 2.5;
        // Coastline suggestion
        ctx.beginPath();
        ctx.moveTo(-65, 10); ctx.quadraticCurveTo(-40, -30, 0, -20);
        ctx.quadraticCurveTo(35, -10, 65, 15); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-65, 20); ctx.quadraticCurveTo(-20, 50, 10, 35);
        ctx.quadraticCurveTo(40, 25, 65, 30); ctx.stroke();
        // Trade route dots
        ctx.fillStyle = gold;
        [[-55,15],[-20, 5],[0,5],[20,-5],[55,18]].forEach(([x,y]) => {
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
        });
        ctx.strokeStyle = goldD; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(-55,15); ctx.lineTo(55,18); ctx.stroke();
        ctx.setLineDash([]);
        // Compass rose
        ctx.strokeStyle = gold; ctx.lineWidth = 1.5;
        [0, Math.PI/2, Math.PI, -Math.PI/2].forEach(a => {
          ctx.beginPath(); ctx.moveTo(55*Math.cos(a), 55*Math.sin(a) - 30);
          ctx.lineTo(62*Math.cos(a), 62*Math.sin(a) - 30); ctx.stroke();
        });
      } else {
        // Amphora
        ctx.strokeStyle = bronze; ctx.fillStyle = "rgba(160,90,50,0.25)"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -60); ctx.lineTo(0, -50);
        ctx.quadraticCurveTo(28, -40, 32, -10);
        ctx.quadraticCurveTo(36, 20, 10, 50);
        ctx.lineTo(6, 60); ctx.lineTo(-6, 60);
        ctx.lineTo(-10, 50);
        ctx.quadraticCurveTo(-36, 20, -32, -10);
        ctx.quadraticCurveTo(-28, -40, 0, -50);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // Handles
        ctx.beginPath(); ctx.arc(20, -28, 14, -0.4, Math.PI + 0.4, true); ctx.stroke();
        ctx.beginPath(); ctx.arc(-20, -28, 14, Math.PI - 0.4 , 0.4, false); ctx.stroke();
        // Rim
        ctx.strokeStyle = goldD;
        ctx.beginPath(); ctx.ellipse(0, -50, 8, 3.5, 0, 0, Math.PI*2); ctx.stroke();
      }

    } else if (art.category === "military" || id.includes("helmet") || id.includes("shield") || id.includes("weapon")) {
      if (id.includes("helmet")) {
        // Montefortino helmet
        ctx.strokeStyle = bronze; ctx.fillStyle = "rgba(140,110,60,0.2)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -5, 44, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -5, 44, 12, 0, 0, Math.PI); ctx.stroke();
        // Cheek guards
        ctx.beginPath(); ctx.moveTo(-44, -5); ctx.quadraticCurveTo(-52, 15, -38, 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 44, -5); ctx.quadraticCurveTo( 52, 15,  38, 30); ctx.stroke();
        // Crest
        ctx.fillStyle = red;
        ctx.beginPath(); ctx.ellipse(0, -52, 6, 18, 0, 0, Math.PI*2); ctx.fill();
        // Neck guard
        ctx.strokeStyle = goldD;
        ctx.beginPath(); ctx.moveTo(-44,-5); ctx.lineTo(-55, 5); ctx.lineTo(55,5); ctx.lineTo(44,-5); ctx.stroke();
      } else if (id.includes("warship") || id.includes("ship")) {
        // Bireme / warship silhouette
        ctx.strokeStyle = bronze; ctx.fillStyle = "rgba(100,70,30,0.2)"; ctx.lineWidth = 3;
        // Hull
        ctx.beginPath();
        ctx.moveTo(-60, 10); ctx.quadraticCurveTo(-20, 30, 60, 10);
        ctx.quadraticCurveTo(70, 5, 65, -5);
        ctx.quadraticCurveTo(50, -15, -50, -10);
        ctx.lineTo(-65, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Ram
        ctx.beginPath(); ctx.moveTo(-60, 10); ctx.lineTo(-80, 5); ctx.stroke();
        // Mast
        ctx.strokeStyle = goldD;
        ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-5, -55); ctx.stroke();
        // Sail
        ctx.fillStyle = "rgba(200,160,60,0.3)"; ctx.strokeStyle = gold; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-5,-50); ctx.lineTo(25,-30); ctx.lineTo(-5,-10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Oars
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(i*12, 5); ctx.lineTo(i*12 + 8, 22); ctx.stroke();
        }
      } else {
        // Shield — Punic round shield
        ctx.strokeStyle = bronze; ctx.fillStyle = "rgba(140,110,60,0.18)"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        // Rim rings
        ctx.strokeStyle = goldD; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI*2); ctx.stroke();
        // Boss
        ctx.fillStyle = gold; ctx.strokeStyle = gold; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        // Crescent symbol
        ctx.strokeStyle = goldD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -30, 10, Math.PI + 0.4, -0.4); ctx.stroke();
      }

    } else if (art.category === "daily") {
      if (id.includes("earring") || id.includes("jewelry") || id.includes("gold")) {
        // Earrings on a display stand
        ctx.strokeStyle = gold; ctx.fillStyle = "rgba(210,170,60,0.15)"; ctx.lineWidth = 3;
        // Stand
        ctx.fillStyle = bronze;
        ctx.fillRect(-4, -10, 8, 50);
        ctx.beginPath(); ctx.ellipse(0, 40, 22, 5, 0, 0, Math.PI*2); ctx.fill();
        // Earrings
        ctx.strokeStyle = gold; ctx.lineWidth = 3.5;
        [-25, 25].forEach(x => {
          ctx.beginPath(); ctx.arc(x, -20, 16, 0.3, Math.PI*2 - 0.3); ctx.stroke();
          // Pendant drop
          ctx.beginPath(); ctx.arc(x, -2, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "rgba(210,170,60,0.6)";
        });
        // Crescent motif on each
        ctx.strokeStyle = goldD; ctx.lineWidth = 2;
        [-25, 25].forEach(x => {
          ctx.beginPath(); ctx.arc(x, -38, 7, Math.PI + 0.5, -0.5); ctx.stroke();
        });
      } else {
        // Pottery set: bowl, jug, lamp
        ctx.strokeStyle = "rgba(180,100,60,0.85)"; ctx.fillStyle = "rgba(180,100,60,0.18)"; ctx.lineWidth = 2.5;
        // Bowl
        ctx.beginPath(); ctx.arc(-32, 20, 20, Math.PI, 0); ctx.lineTo(-12, 20); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-32, 20, 20, 5, 0, 0, Math.PI*2); ctx.stroke();
        // Jug
        ctx.beginPath();
        ctx.moveTo(8, -30); ctx.lineTo(8, -20);
        ctx.quadraticCurveTo(24, -15, 26, 5);
        ctx.quadraticCurveTo(28, 20, 18, 30);
        ctx.lineTo(16, 35); ctx.lineTo(0, 35);
        ctx.lineTo(-2, 30);
        ctx.quadraticCurveTo(-12, 20, -10, 5);
        ctx.quadraticCurveTo(-8, -15, 8, -20);
        ctx.fill(); ctx.stroke();
        // Handle
        ctx.beginPath(); ctx.arc(22, 5, 10, -0.8, 0.8, false); ctx.stroke();
        // Oil lamp
        ctx.fillStyle = "rgba(180,100,60,0.25)";
        ctx.beginPath(); ctx.ellipse(50, 15, 14, 8, -0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(58, 12); ctx.lineTo(66, 6); ctx.stroke();
        ctx.strokeStyle = "rgba(255,160,40,0.7)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(66, 6); ctx.quadraticCurveTo(70, 0, 68, -6); ctx.stroke();
      }

    } else if (art.category === "architecture") {
      // Column + arch
      ctx.strokeStyle = stone; ctx.fillStyle = "rgba(180,165,140,0.15)"; ctx.lineWidth = 3;
      // Two columns
      [-30, 30].forEach(x => {
        // Base
        ctx.fillStyle = "rgba(180,165,140,0.25)";
        ctx.fillRect(x - 9, 42, 18, 6);
        // Shaft
        ctx.fillRect(x - 6, -20, 12, 62);
        ctx.strokeRect(x - 6, -20, 12, 62);
        // Capital
        ctx.fillRect(x - 10, -26, 20, 6); ctx.strokeRect(x - 10, -26, 20, 6);
      });
      // Arch
      ctx.strokeStyle = "rgba(180,165,140,0.8)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, -26, 30, Math.PI, 0); ctx.stroke();
      // Keystone
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(-5, -55); ctx.lineTo(0, -65); ctx.lineTo(5, -55); ctx.closePath(); ctx.fill();
      // Carved pattern on arch
      ctx.strokeStyle = goldD; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -26, 24, Math.PI, 0); ctx.stroke();

    } else {
      // Generic — decorative Punic rosette
      ctx.strokeStyle = gold; ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a + Math.PI/8) * 38, Math.sin(a + Math.PI/8) * 38,
          Math.cos(a) * 52, Math.sin(a) * 52
        );
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2);
      ctx.fillStyle = "rgba(210,170,60,0.3)"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI*2); ctx.stroke();
    }
  }

  /** Word-wrap helper for canvas text rendering. */
  _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(" "), lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCEDURAL 3D ARTIFACTS
  // ═══════════════════════════════════════════════════════════════════════════

  _buildArtifactByCategory(art) {
    const g = new THREE.Group();
    switch (art.category) {
      case "religion":     this._artifactReligion(g, art); break;
      case "trade":        this._artifactTrade(g, art); break;
      case "military":     this._artifactMilitary(g, art); break;
      case "daily":        this._artifactDaily(g); break;
      case "architecture": this._artifactArchitecture(g); break;
      default:             this._artifactGeneric(g); break;
    }
    return g;
  }

  _artifactReligion(g, art) {
    if (art.id.includes("tanit") || art.id.includes("dido") || art.id.includes("queen")) {
      // Tanit figurine — detailed votive statuette
      // Triangular robe body
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 3, 1), this.mat.stone);
      body.position.y = 0.24; body.castShadow = true; g.add(body);
      // Waist belt
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.04, 10), this.mat.gold);
      belt.position.y = 0.32; g.add(belt);
      // Arms raised (two tapered cylinders)
      [-1, 1].forEach(side => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.22, 6), this.mat.stone);
        arm.position.set(side * 0.14, 0.38, 0);
        arm.rotation.z = -side * 1.1; g.add(arm);
      });
      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.06, 8), this.mat.stone);
      neck.position.y = 0.46; g.add(neck);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), this.mat.stone);
      head.position.y = 0.56; g.add(head);
      // Crescent crown
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 6, 14, Math.PI), this.mat.gold);
      crown.position.y = 0.63; crown.rotation.z = Math.PI; g.add(crown);
      // Crown disc (sun symbol)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 10), this.mat.gold);
      disc.position.y = 0.65; g.add(disc);
    } else {
      // Votive stele — carved limestone slab with Tanit symbol
      const stele = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 0.06), this.mat.stone);
      stele.position.y = 0.3; stele.rotation.z = 0.04; stele.castShadow = true; g.add(stele);
      // Tanit symbol engraved on face (gold overlay)
      const sym = new THREE.Group();
      sym.position.set(0, 0.3, 0.035);
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 3), this.mat.gold);
      tri.position.y = -0.04; sym.add(tri);
      const circ = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 10), this.mat.gold);
      circ.position.y = 0.11; sym.add(circ);
      const cres2 = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 5, 10, Math.PI), this.mat.gold);
      cres2.position.y = 0.155; cres2.rotation.z = Math.PI; sym.add(cres2);
      g.add(sym);
    }
  }

  _artifactTrade(g, art) {
    if (art.id.includes("amphora")) {
      this._buildAmphoraGroup(g);
    } else if (art.id.includes("purple") || art.id.includes("murex")) {
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), this.mat.purple);
      shell.position.y = 0.2; shell.rotation.z = 0.3; g.add(shell);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 6), this.mat.purple);
      spire.position.set(0, 0.38, 0); g.add(spire);
    } else {
      this._artifactGeneric(g);
    }
  }

  _artifactMilitary(g, art) {
    if (art.id.includes("helmet")) {
      // Montefortino helmet — full detailed build
      // Main dome
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        this.mat.bronze
      );
      dome.position.y = 0.28; dome.castShadow = true; g.add(dome);

      // Neck guard (brim flare)
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.215, 0.24, 0.04, 14, 1, false, 0, Math.PI * 2),
        this.mat.bronze
      );
      brim.position.y = 0.18; g.add(brim);

      // Top knob/crest holder
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 8), this.mat.bronze);
      knob.position.y = 0.44; g.add(knob);

      // Horsehair crest (red, elongated cone-ish)
      const crestMat = new THREE.MeshStandardMaterial({
        color: 0xcc2200, roughness: 0.85, metalness: 0.0,
        emissive: 0x660800, emissiveIntensity: 0.25,
      });
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.22, 8), crestMat);
      crest.position.y = 0.59; g.add(crest);

      // Cheek guards (left and right)
      [-1, 1].forEach(side => {
        const cheek = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.45),
          this.mat.bronze
        );
        cheek.position.set(side * 0.15, 0.22, 0.05);
        cheek.rotation.z = side * 0.6; cheek.rotation.y = side * 0.5;
        g.add(cheek);
      });

      // Gold trim ring around dome base
      const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.012, 6, 18), this.mat.gold);
      trimRing.position.y = 0.22; trimRing.rotation.x = Math.PI / 2; g.add(trimRing);

      // Punic crescent embossed on front
      const crescent = new THREE.Mesh(
        new THREE.TorusGeometry(0.04, 0.008, 5, 10, Math.PI),
        this.mat.gold
      );
      crescent.position.set(0, 0.33, 0.155); crescent.rotation.z = Math.PI; g.add(crescent);

    } else if (art.id.includes("shield") || art.id.includes("boss")) {
      // Round Punic shield mounted vertically
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 20), this.mat.red);
      shield.rotation.x = Math.PI / 2; shield.position.y = 0.28; g.add(shield);
      // Concentric bronze rings
      [0.18, 0.12].forEach(r => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 18), this.mat.bronze);
        ring.position.y = 0.295; ring.rotation.x = Math.PI / 2; g.add(ring);
      });
      // Central boss
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.mat.gold);
      boss.position.set(0, 0.305, 0); g.add(boss);
      // Tanit crescent on face
      const cres = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 5, 10, Math.PI), this.mat.gold);
      cres.position.set(0, 0.34, 0); cres.rotation.z = Math.PI; g.add(cres);
    } else {
      this._artifactGeneric(g);
    }
  }

  _artifactDaily(g) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8), this.mat.dark);
    stand.position.y = 0.2; g.add(stand);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 12), this.mat.gold);
    r1.position.y = 0.38; r1.rotation.x = Math.PI/4; g.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 10), this.mat.gold);
    r2.position.y = 0.32; r2.rotation.x = -Math.PI/6; r2.rotation.z = 0.5; g.add(r2);
  }

  _artifactArchitecture(g) {
    for (let i = 0; i < 6; i++) {
      const w = 0.06 + Math.random()*0.08, h = 0.1 + Math.random()*0.2;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), this.mat.stone);
      block.position.set((Math.random()-0.5)*0.3, h/2 + 0.05, (Math.random()-0.5)*0.3);
      g.add(block);
    }
  }

  _artifactGeneric(g) {
    // Punic votive bowl on a ring stand
    const standRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 7, 16), this.mat.bronze);
    standRing.rotation.x = Math.PI / 2; standRing.position.y = 0.02; g.add(standRing);
    // Bowl body
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.mat.terracotta
    );
    bowl.rotation.x = Math.PI; bowl.position.y = 0.13; g.add(bowl);
    // Rim
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.01, 6, 16), this.mat.bronze);
    rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.13; g.add(rimRing);
    // Small gold disc ornament inside bowl
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 12), this.mat.gold);
    disc.position.y = 0.07; g.add(disc);
  }

  _buildSmallArtifact(art) {
    const g = new THREE.Group();
    if (art.id.includes("coin")) {
      for (let i = 0; i < 4; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), this.mat.gold);
        coin.position.set((i-1.5)*0.05, 0.02+i*0.012, (Math.random()-0.5)*0.03); g.add(coin);
      }
    } else if (art.id.includes("glass") || art.id.includes("bead")) {
      const cols = [0x3366aa, 0x44aa66, 0xcc6633, 0x6633aa, 0xaa3344];
      for (let i = 0; i < 7; i++) {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshStandardMaterial({ color: cols[i%cols.length], roughness: 0.2, metalness: 0.1 }));
        bead.position.set((i-3)*0.03, 0.025, Math.sin(i)*0.02); g.add(bead);
      }
    } else if (art.id.includes("shield")) {
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.mat.bronze);
      boss.position.y = 0.06; g.add(boss);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 12), this.mat.bronze);
      ring.position.y = 0.05; ring.rotation.x = Math.PI/2; g.add(ring);
    } else if (art.id.includes("pottery") || art.id.includes("ceramic")) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 8), this.mat.terracotta);
      pot.position.set(-0.03, 0.035, 0); g.add(pot);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), this.mat.terracotta);
      lamp.scale.y = 0.5; lamp.position.set(0.04, 0.02, 0); g.add(lamp);
    } else if (art.id.includes("earth") || art.id.includes("salt")) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 8), this.mat.terracotta);
      jar.position.y = 0.05; g.add(jar);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.015, 8), this.mat.dark);
      lid.position.y = 0.095; g.add(lid);
    } else if (art.id.includes("earn") || art.id.includes("jewelry") || art.id.includes("earring")) {
      const stand2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 8), this.mat.dark);
      stand2.position.y = 0.06; g.add(stand2);
      [-0.04, 0.04].forEach(x => {
        const ear = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 10), this.mat.gold);
        ear.position.set(x, 0.12, 0); g.add(ear);
      });
    } else {
      const obj = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), this.mat.bronze);
      obj.position.y = 0.05; g.add(obj);
    }
    return g;
  }

  _buildAmphoraGroup(g) {
    // Shoulder
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), this.mat.terracotta);
    shoulder.position.y = 0.3; shoulder.scale.set(1, 0.7, 1); shoulder.castShadow = true; g.add(shoulder);
    // Belly (main body)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), this.mat.terracotta);
    belly.position.y = 0.22; belly.scale.set(1, 1.1, 1); g.add(belly);
    // Tapered lower body
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.01, 0.18, 10), this.mat.terracotta);
    lower.position.y = 0.06; g.add(lower);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.06, 0.14, 10), this.mat.terracotta);
    neck.position.y = 0.44; g.add(neck);
    // Lip / rim
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.04, 10), this.mat.terracotta);
    rim.position.y = 0.52; g.add(rim);
    // Painted band decoration (dark stripe around belly)
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x3a1a08, roughness: 0.9, emissive: 0x100800, emissiveIntensity: 0.1,
    });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.131, 0.012, 6, 20), bandMat);
    band.position.y = 0.24; band.rotation.x = Math.PI / 2; g.add(band);
    const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.009, 6, 20), bandMat);
    band2.position.y = 0.35; band2.rotation.x = Math.PI / 2; g.add(band2);
    // Handles
    [-0.11, 0.11].forEach(x => {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.013, 6, 10, Math.PI), this.mat.terracotta);
      handle.position.set(x, 0.39, 0);
      handle.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(handle);
    });
  }

  _buildTanitObelisk() {
    const g = new THREE.Group();
    const ob = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.0, 8), this.mat.gold);
    ob.position.y = 1.0; ob.castShadow = true; g.add(ob);
    const symbolGrp = new THREE.Group();
    const triShape = new THREE.Shape();
    triShape.moveTo(-0.09,-0.05); triShape.lineTo(0,0.13); triShape.lineTo(0.09,-0.05); triShape.closePath();
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd700, emissiveIntensity: 0.5 });
    symbolGrp.add(new THREE.Mesh(new THREE.ShapeGeometry(triShape), glowMat));
    const circ = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), glowMat);
    circ.position.y = 0.18; symbolGrp.add(circ);
    const cres = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 6, 12, Math.PI), glowMat);
    cres.position.y = 0.25; cres.rotation.z = Math.PI; symbolGrp.add(cres);
    symbolGrp.position.set(0, 0.65, 0.24); g.add(symbolGrp);
    return g;
  }

  _buildElephant(g) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), this.mat.bronze);
    body.position.y = 0.25; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), this.mat.bronze);
    head.position.set(0.19, 0.32, 0); g.add(head);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 7), this.mat.bronze);
    trunk.position.set(0.29, 0.2, 0); trunk.rotation.z = Math.PI/2 - 0.3; g.add(trunk);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), this.mat.gold);
    tower.position.y = 0.41; g.add(tower);
    [[-0.1,-0.07],[-0.1,0.07],[0.08,-0.07],[0.08,0.07]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6), this.mat.bronze);
      leg.position.set(x, 0.09, z); g.add(leg);
    });
    [-0.07, 0.07].forEach(z => {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0xfffff0, roughness: 0.6 }));
      tusk.position.set(0.3, 0.28, z); tusk.rotation.z = Math.PI/2 - 0.3; tusk.rotation.y = z > 0 ? 0.3 : -0.3; g.add(tusk);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUNIC SYMBOLS & ENGRAVINGS
  // ═══════════════════════════════════════════════════════════════════════════

  _punicWallEngraving() {
    const s = 256, cv = document.createElement("canvas"); cv.width = s; cv.height = s;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(160,130,90,0.28)"; ctx.lineWidth = 1.5;
    const symbols = [
      ctx => { ctx.beginPath(); ctx.moveTo(-8,12); ctx.lineTo(0,-6); ctx.lineTo(8,12); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0,-10,4,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(0,-16,8,Math.PI,0); ctx.stroke(); },
      ctx => { ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(0,-14,10,Math.PI+0.4,-0.4); ctx.stroke(); },
      ctx => { ctx.beginPath(); ctx.moveTo(-6,10); ctx.lineTo(0,-10); ctx.lineTo(6,10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-4,2); ctx.lineTo(4,2); ctx.stroke(); },
      ctx => { ctx.beginPath(); ctx.moveTo(0,12); ctx.lineTo(0,-4); ctx.stroke(); for (let a=-2;a<=2;a++){ctx.beginPath();ctx.moveTo(0,-4);ctx.quadraticCurveTo(a*5,-10,a*8,-6);ctx.stroke();} },
    ];
    for (let r = 0; r < 6; r++) for (let cl = 0; cl < 5; cl++) {
      const sx = (cl+0.5)*(s/5), sy = (r+0.5)*(s/6);
      const sym = symbols[Math.floor(Math.random()*symbols.length)];
      ctx.save(); ctx.translate(sx, sy); ctx.scale(0.8, 0.8); sym(ctx); ctx.restore();
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // YEAR LABEL CANVAS TEXTURE
  // ═══════════════════════════════════════════════════════════════════════════

  _addYearLabel(x, y, z, yearText, rotY) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 80;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 512, 80);
    ctx.fillStyle = "rgba(200,160,80,0.1)"; ctx.fillRect(0, 0, 512, 80);
    ctx.font = 'bold 24px "Palatino Linotype", Georgia, serif';
    ctx.fillStyle = "rgba(240, 200, 140, 0.88)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(yearText, 256, 40);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.44), mat);
    plane.position.set(x, y, z); plane.rotation.y = rotY; this.scene.add(plane);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _addFloor(x, z, w, d, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || this.mat.floor);
    m.rotation.x = -Math.PI/2; m.position.set(x, 0, z); m.receiveShadow = true; this.scene.add(m);
  }

  _addMosaicFloor(x, z, w, d) {
    const mt = this.mosaicTex.clone(); mt.repeat.set(w/6, d/6);
    const mat = new THREE.MeshStandardMaterial({ map: mt, roughness: 0.72, metalness: 0.02 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI/2; m.position.set(x, 0.005, z); m.receiveShadow = true; this.scene.add(m);
  }

  _addCeiling(x, z, w, d, h, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || this.mat.ceiling);
    m.rotation.x = Math.PI/2; m.position.set(x, h, z); this.scene.add(m);
  }

  _addCeilingBeams(cx, cz, w, d, h, count) {
    const geo = new THREE.BoxGeometry(w * 0.9, 0.18, 0.14);
    for (let i = 0; i < count; i++) {
      const t = (i+1)/(count+1);
      const beam = new THREE.Mesh(geo, this.mat.trim);
      beam.position.set(cx, h - 0.09, cz - d/2 + t*d); beam.castShadow = true; this.scene.add(beam);
    }
  }

  _addWall(x, y, z, len, h, t, rotY, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, t), mat || this.mat.wall);
    m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m); this.wallBoxes.push(new THREE.Box3().setFromObject(m));
  }

  _hexToCss(hex, alpha = 1) {
    const color = new THREE.Color(hex);
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _addWallWithGap(x, y, z, totalLen, h, t, rotY, gapW, mat) {
    const segLen = (totalLen - gapW) / 2;
    if (segLen < 0.1) return;
    const isV = Math.abs(Math.sin(rotY)) > 0.5;
    if (isV) {
      this._addWall(x, y, z - gapW/2 - segLen/2, segLen, h, t, rotY, mat);
      this._addWall(x, y, z + gapW/2 + segLen/2, segLen, h, t, rotY, mat);
    } else {
      this._addWall(x - gapW/2 - segLen/2, y, z, segLen, h, t, rotY, mat);
      this._addWall(x + gapW/2 + segLen/2, y, z, segLen, h, t, rotY, mat);
    }
  }

  _addWallEngraving(x, y, z, w, h, rotY) {
    const tex = this._punicWallEngraving();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x, y, z); plane.rotation.y = rotY; this.scene.add(plane);
  }

  _addColumn(x, z, H, shaftMat, capMat) {
    const colH = H - 0.8;
    const sm = shaftMat || this.mat.trim, cm = capMat || this.mat.gold;
    const base = new THREE.Mesh(G.colBase, sm); base.position.set(x, 0.11, z); base.castShadow = true; this.scene.add(base);
    const shaft = new THREE.Mesh(G.colShaft, sm); shaft.position.set(x, 0.22 + colH/2, z); shaft.scale.y = colH; shaft.castShadow = true; this.scene.add(shaft);
    const ring = new THREE.Mesh(G.torus, sm); ring.position.set(x, 0.22 + colH, z); ring.rotation.x = Math.PI/2; this.scene.add(ring);
    const cap = new THREE.Mesh(G.colCap, cm); cap.position.set(x, 0.22 + colH + 0.18, z); this.scene.add(cap);
    this.wallBoxes.push(new THREE.Box3(new THREE.Vector3(x-0.45, 0, z-0.45), new THREE.Vector3(x+0.45, H, z+0.45)));
  }

  _addBrokenColumn(x, z, H, tiltX, tiltZ) {
    const colH = H * (0.35 + Math.random() * 0.3);
    const g = new THREE.Group();
    const base = new THREE.Mesh(G.colBase, this.mat.ruins); base.position.y = 0.11; g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, colH, 12), this.mat.ruins);
    shaft.position.y = 0.22 + colH/2; g.add(shaft);
    g.position.set(x, 0, z); g.rotation.x = tiltX; g.rotation.z = tiltZ;
    this.scene.add(g);
    this.wallBoxes.push(new THREE.Box3(new THREE.Vector3(x-0.5, 0, z-0.5), new THREE.Vector3(x+0.5, colH, z+0.5)));
  }

  _addArch(x, z, H, archW, mat) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(archW/2, 0.15, 8, 16, Math.PI), mat);
    arch.position.set(x, H - 0.3, z); arch.rotation.x = -Math.PI/2; arch.rotation.z = Math.PI;
    arch.castShadow = true; this.scene.add(arch);
  }

  _addPedestal(x, z, h, mat) {
    const ped = new THREE.Mesh(G.pedestal, mat);
    ped.position.set(x, h/2, z); ped.scale.y = h; ped.castShadow = true; ped.receiveShadow = true; this.scene.add(ped);
    this.wallBoxes.push(new THREE.Box3(new THREE.Vector3(x-0.45, 0, z-0.45), new THREE.Vector3(x+0.45, h, z+0.45)));
  }

  _addAmphora(x, baseY, z) {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    this._buildAmphoraGroup(g);
    g.scale.setScalar(1.7);
    g.castShadow = true;
    this.scene.add(g);
  }

  _addCrates(x, z) {
    [[0, 0, 0.35], [0.4, 0, 0.35], [-0.4, 0, 0.35], [0.2, 0.4, 0.35]].forEach(([dx, dy, size]) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.mat.dark);
      crate.position.set(x + dx, dy + size/2, z); crate.castShadow = true; crate.receiveShadow = true; this.scene.add(crate);
    });
  }

  _addShield(x, y, z) {
    const shield = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), this.mat.red);
    shield.position.set(x, y, z); shield.rotation.y = Math.PI/2; shield.castShadow = true; this.scene.add(shield);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.mat.gold);
    boss.position.set(x + 0.05, y, z); this.scene.add(boss);
  }

  _addWeaponRack(x, y, z) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), this.mat.dark);
    rack.position.set(x, y, z); rack.castShadow = true; this.scene.add(rack);
    for (let i = 0; i < 3; i++) {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5), this.mat.dark);
      spear.position.set(x, y + 0.1, z - 0.25 + i * 0.25); spear.rotation.z = Math.PI/2 - 0.05; this.scene.add(spear);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 5), this.mat.bronze);
      tip.position.set(x + 0.72, y + 0.1, z - 0.25 + i * 0.25); tip.rotation.z = -Math.PI/2; this.scene.add(tip);
    }
  }

  _addTorch(x, y, z, color, intensity, distance) {
    const torchMesh = new THREE.Mesh(G.torch, this.mat.dark);
    torchMesh.position.set(x, y, z); torchMesh.castShadow = true; this.scene.add(torchMesh);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), this.mat.ember);
    fire.position.set(x, y + 0.32, z); this.scene.add(fire);
    const light = new THREE.PointLight(color, intensity, distance, 1.5);
    light.position.set(x, y + 0.3, z); this.scene.add(light); this.torchLights.push(light);
  }

  _addPointLight(x, y, z, color, intensity, distance) {
    const light = new THREE.PointLight(color, intensity, distance, 1.5);
    light.position.set(x, y, z); this.scene.add(light);
  }
}
