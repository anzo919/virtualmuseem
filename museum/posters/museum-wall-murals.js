/**
 * Places 3D gallery frames from carthage-gallery-frames.js (MuseumFrame) on museum walls.
 * Each frame loads a thematic image (Wikimedia / stable CDN, CORS-friendly where possible).
 */

import * as THREE from "three";
import { ROOMS } from "../config.js";
import { MuseumFrame } from "./carthage-gallery-frames.js";

/** Art for the three wall frames — HTTPS, suitable for TextureLoader + crossOrigin anonymous. */
const MURAL_IMAGES = {
  /** r1 — founding / Dido */
  r1: "https://upload.wikimedia.org/wikipedia/commons/8/82/Pierre-Narcisse_Gu%C3%A9rin_-_Dido_and_Aeneas_-_WGA10972.jpg",
  /** r2 — Carthage / trade (archaeological site; hash path 7/78 on Commons) */
  r2: "https://upload.wikimedia.org/wikipedia/commons/7/78/Carthage_ruins.jpg",
  /** r6 — decline / fall of Carthage (Turner, public domain on Commons) */
  r6: "https://upload.wikimedia.org/wikipedia/commons/a/a8/William_Turner_-_The_Decline_of_the_Carthaginian_Empire.JPG",
};

/**
 * @param {import("../config.js").ROOMS[string]} room
 * @param {"back"|"front"|"left"|"right"} wall
 * @param {number} offset
 * @param {number} heightFactor
 * @param {number} [wallInset]
 */
export function muralPlacement(room, wall, offset, heightFactor, wallInset = 0.26) {
  const b = room.bounds;
  const H = room.height;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  switch (wall) {
    case "back":
      return {
        pos: new THREE.Vector3(cx + offset, H * heightFactor, b.maxZ - wallInset),
        rotY: Math.PI,
      };
    case "front":
      return {
        pos: new THREE.Vector3(cx + offset, H * heightFactor, b.minZ + wallInset),
        rotY: 0,
      };
    case "left":
      return {
        pos: new THREE.Vector3(b.minX + wallInset, H * heightFactor, cz + offset),
        rotY: Math.PI / 2,
      };
    case "right":
      return {
        pos: new THREE.Vector3(b.maxX - wallInset, H * heightFactor, cz + offset),
        rotY: -Math.PI / 2,
      };
    default:
      return {
        pos: new THREE.Vector3(cx + offset, H * heightFactor, b.maxZ - wallInset),
        rotY: Math.PI,
      };
  }
}

/**
 * @param {Record<string, THREE.Group>} roomGroups
 * @param {THREE.Texture} envMap
 * @returns {{ frames: MuseumFrame[], animate: (t: number) => void }}
 */
export function installWallMuralFrames(roomGroups, envMap) {
  const frames = [];

  {
    const room = ROOMS.r1;
    const { pos, rotY } = muralPlacement(room, "back", -3.15, 0.46);
    frames.push(
      new MuseumFrame(roomGroups.r1, pos, rotY, MURAL_IMAGES.r1, envMap, {
        width: 1.9,
        height: 1.45,
        frameColor: 0x6b4423,
        frameThickness: 0.12,
        frameDepth: 0.18,
        name: "frame-r1-founding",
      }),
    );
  }

  {
    const room = ROOMS.r2;
    const { pos, rotY } = muralPlacement(room, "back", -3.8, 0.44);
    frames.push(
      new MuseumFrame(roomGroups.r2, pos, rotY, MURAL_IMAGES.r2, envMap, {
        width: 2.1,
        height: 1.4,
        frameColor: 0x8b7355,
        frameThickness: 0.12,
        frameDepth: 0.18,
        name: "frame-r2-commerce",
      }),
    );
  }

  {
    const room = ROOMS.r6;
    const { pos, rotY } = muralPlacement(room, "right", -1.5, 0.42);
    frames.push(
      new MuseumFrame(roomGroups.r6, pos, rotY, MURAL_IMAGES.r6, envMap, {
        width: 1.95,
        height: 1.5,
        frameColor: 0x3a2818,
        frameThickness: 0.12,
        frameDepth: 0.18,
        name: "frame-r6-fall",
      }),
    );
  }

  return {
    frames,
    animate(t) {
      for (const f of frames) f.animate(t);
    },
  };
}
