/**
 * Minimap — 2D canvas overlay showing the 7-room linear floor plan,
 * player position/direction, and NPC position.
 * Portrait orientation to match the museum's long Z-axis layout.
 */

import { ROOMS, PASSAGES } from "./config.js";

// Short display labels for each room
const ROOM_LABELS = {
  r1: "I",  r2: "II",  r3: "III",
  r4: "IV", r5: "V",   r6: "VI",  r7: "VII",
};

const ROOM_COLORS = {
  r1: "rgba(220,180,100,0.22)",
  r2: "rgba(210,160, 60,0.22)",
  r3: "rgba(180,100, 60,0.20)",
  r4: "rgba(240,200,120,0.26)",
  r5: "rgba(160, 60, 40,0.20)",
  r6: "rgba( 90, 80, 70,0.22)",
  r7: "rgba(220,200,160,0.24)",
};

export class Minimap {
  constructor() {
    this.canvas    = document.getElementById("minimap-canvas");
    this.ctx       = this.canvas.getContext("2d");
    this.container = document.getElementById("minimap");

    this.W = 90;
    this.H = 240;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;

    // Compute world extents across all rooms + passages
    let wMin = Infinity, wMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const r of Object.values(ROOMS)) {
      const b = r.bounds;
      wMin = Math.min(wMin, b.minX); wMax = Math.max(wMax, b.maxX);
      zMin = Math.min(zMin, b.minZ); zMax = Math.max(zMax, b.maxZ);
    }
    this.worldMinX = wMin - 2; this.worldMaxX = wMax + 2;
    this.worldMinZ = zMin - 2; this.worldMaxZ = zMax + 2;
    this.worldW = this.worldMaxX - this.worldMinX;
    this.worldD = this.worldMaxZ - this.worldMinZ;

    this.staticImage = null;
    this._drawStaticPlan();
  }

  _worldToCanvas(wx, wz) {
    return {
      x: ((wx - this.worldMinX) / this.worldW) * this.W,
      y: ((this.worldMaxZ - wz) / this.worldD) * this.H,
    };
  }

  _drawStaticPlan() {
    const off = document.createElement("canvas");
    off.width = this.W; off.height = this.H;
    const ctx = off.getContext("2d");
    ctx.clearRect(0, 0, this.W, this.H);

    const wallColor = "rgba(200,170,120,0.5)";

    // Draw passages (corridors)
    for (const p of PASSAGES) {
      const tl = this._worldToCanvas(p.cx - p.w/2, p.cz + p.d/2);
      const br = this._worldToCanvas(p.cx + p.w/2, p.cz - p.d/2);
      ctx.fillStyle = "rgba(200,170,120,0.14)";
      ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }

    // Draw rooms
    for (const [id, r] of Object.entries(ROOMS)) {
      const b = r.bounds;
      const tl = this._worldToCanvas(b.minX, b.maxZ);
      const br = this._worldToCanvas(b.maxX, b.minZ);
      const w = br.x - tl.x, h = br.y - tl.y;

      ctx.fillStyle = ROOM_COLORS[id] || "rgba(200,170,120,0.18)";
      ctx.fillRect(tl.x, tl.y, w, h);
      ctx.strokeStyle = wallColor; ctx.lineWidth = 1.2;
      ctx.strokeRect(tl.x, tl.y, w, h);

      // Room number label
      const cx = this._worldToCanvas((b.minX+b.maxX)/2, (b.minZ+b.maxZ)/2);
      ctx.fillStyle = "rgba(240,200,140,0.55)";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ROOM_LABELS[id] || id, cx.x, cx.y);
    }

    this.staticImage = off;
  }

  update(playerPos, playerRotY, npcPos, currentRoomId) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.container.classList.add("visible");

    if (this.staticImage) ctx.drawImage(this.staticImage, 0, 0);

    // Highlight current room
    if (currentRoomId && ROOMS[currentRoomId]) {
      const b = ROOMS[currentRoomId].bounds;
      const tl = this._worldToCanvas(b.minX, b.maxZ);
      const br = this._worldToCanvas(b.maxX, b.minZ);
      ctx.strokeStyle = "rgba(240,200,100,0.7)"; ctx.lineWidth = 1.8;
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }

    // NPC dot
    if (npcPos) {
      const np = this._worldToCanvas(npcPos.x, npcPos.z);
      ctx.fillStyle = "#c9a227";
      ctx.beginPath(); ctx.arc(np.x, np.y, 3, 0, Math.PI*2); ctx.fill();
    }

    // Player arrow
    const pp = this._worldToCanvas(playerPos.x, playerPos.z);
    ctx.save(); ctx.translate(pp.x, pp.y); ctx.rotate(-playerRotY);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, 3.5); ctx.lineTo(3, 3.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 5, 0, Math.PI*2); ctx.fill();
  }
}
