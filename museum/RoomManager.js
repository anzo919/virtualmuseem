/**
 * RoomManager — smooth room streaming with background preloading.
 *
 * Core idea:
 * - The current room is visible in the scene.
 * - Adjacent rooms are preloaded in the background but kept off-scene.
 * - Entering a room becomes an instant "attach/show" operation because the
 *   expensive IO + parse + mesh setup already happened earlier.
 *
 * This removes the classic freeze caused by loading GLB files inside the room
 * transition itself.
 */

import * as THREE from "three";
import { ROOMS, PASSAGES } from "./config.js";
import { GLTFAssetLoader, disposeSceneGraph, prepareSceneGraph, yieldToMainThread } from "./MuseumAssetLoader.js";

const PRELOAD_DEPTH = 1;
const KEEP_DEPTH = 2;
const DEBUG_COLOR = 0x00ffcc;
const MAX_CONCURRENT_LOADS = 1;
const ROOM_STATES = Object.freeze({
  UNLOADED: "unloaded",
  LOADING: "loading",
  LOADED: "loaded",
});

export class RoomManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Record<string,THREE.Group>} roomGroups
   * @param {THREE.Box3[]} wallBoxes
   */
  constructor(scene, roomGroups, wallBoxes) {
    this._scene = scene;
    this._wallBoxes = wallBoxes;
    this._assetLoader = new GLTFAssetLoader();

    /** @type {Record<string, RoomEntry>} */
    this._rooms = {};

    this._currentId = null;
    this._visibleRooms = new Set();
    this._preloadTargetSet = new Set();
    this._keepResidentSet = new Set();

    this._loadQueue = [];
    this._activeLoadCount = 0;
    this._queueSerial = 0;

    this._stateListeners = new Set();
    this._debugMeshes = {};
    this._debugVisible = false;

    for (const [id, cfg] of Object.entries(ROOMS)) {
      const group = roomGroups[id] ?? null;

      /** @type {RoomEntry} */
      this._rooms[id] = {
        id,
        name: cfg.name,
        bounds: cfg.bounds,
        neighbors: this._computeNeighbors(id),
        type: "procedural",
        glbPath: null,
        sceneObject: group,
        residentObject: group,
        state: group ? ROOM_STATES.LOADED : ROOM_STATES.UNLOADED,
        isInScene: !!group,
        queued: false,
        queuePriority: Number.POSITIVE_INFINITY,
        queueOrder: 0,
        loadPromise: null,
      };

      if (group) this._visibleRooms.add(id);
    }
  }

  /**
   * Register a GLB-backed room. The room becomes unloaded until background
   * preloading picks it up.
   *
   * @param {string} id
   * @param {string} glbPath
   */
  registerGLB(id, glbPath) {
    const room = this._rooms[id];
    if (!room) {
      console.warn(`[RoomManager] registerGLB: unknown room id "${id}"`);
      return;
    }

    if (room.sceneObject) {
      this._scene.remove(room.sceneObject);
    }

    room.type = "glb";
    room.glbPath = glbPath;
    room.sceneObject = null;
    room.residentObject = null;
    room.state = ROOM_STATES.UNLOADED;
    room.isInScene = false;
    room.queued = false;
    room.queuePriority = Number.POSITIVE_INFINITY;
    room.loadPromise = null;
    this._visibleRooms.delete(id);
    this._emitStateChange();
  }

  /**
   * Subscribe to room streaming updates for UI/debug tooling.
   *
   * @param {(status: RoomManagerStatus) => void} listener
   * @returns {() => void}
   */
  onStateChange(listener) {
    this._stateListeners.add(listener);
    listener(this.getStatus());
    return () => this._stateListeners.delete(listener);
  }

  /** Snapshot for UI and diagnostics. */
  getStatus() {
    const rooms = Object.fromEntries(
      Object.values(this._rooms).map((room) => [
        room.id,
        {
          state: room.state,
          queued: room.queued,
          inScene: room.isInScene,
          type: room.type,
        },
      ])
    );

    return {
      currentRoomId: this._currentId,
      visibleRooms: [...this._visibleRooms],
      loadingRooms: Object.values(this._rooms)
        .filter((room) => room.state === ROOM_STATES.LOADING)
        .map((room) => room.id),
      queuedRooms: this._loadQueue
        .map((id) => this._rooms[id])
        .filter((room) => room?.queued)
        .map((room) => room.id),
      activeLoadCount: this._activeLoadCount,
      rooms,
    };
  }

  get currentRoomId() { return this._currentId; }

  get activeRooms() { return [...this._visibleRooms]; }

  getRoomState(id) {
    return this._rooms[id]?.state ?? ROOM_STATES.UNLOADED;
  }

  toggleDebug() {
    this._debugVisible = !this._debugVisible;

    for (const [id, cfg] of Object.entries(ROOMS)) {
      if (!this._debugMeshes[id]) {
        this._debugMeshes[id] = this._makeDebugBox(cfg.bounds, cfg.height);
        this._scene.add(this._debugMeshes[id]);
      }
      this._debugMeshes[id].visible = this._debugVisible;
    }

    console.log(`[RoomManager] Debug bounds ${this._debugVisible ? "ON" : "OFF"}`);
  }

  /**
   * Called every frame.
   *
   * Important: this method never loads directly inside a collision trigger.
   * It only updates desired preload/visibility sets and lets the queue perform
   * the actual background IO work.
   *
   * @param {THREE.Vector3} playerPos
   */
  update(playerPos) {
    const detectedRoomId = this._detectRoom(playerPos);
    const previousRoomId = this._currentId;

    if (detectedRoomId) {
      this._currentId = detectedRoomId;
    }

    if (!this._currentId) {
      this._pumpLoadQueue();
      return;
    }

    this._preloadTargetSet = this._getRoomSet(this._currentId, PRELOAD_DEPTH);
    this._keepResidentSet = this._getRoomSet(this._currentId, KEEP_DEPTH);

    if (previousRoomId !== this._currentId) {
      this._applyRoomVisibility(this._currentId);
    }

    this._schedulePreloads();
    this._releaseFarRooms();
    this._pumpLoadQueue();
  }

  _detectRoom(pos) {
    for (const [id, room] of Object.entries(this._rooms)) {
      const { minX, maxX, minZ, maxZ } = room.bounds;
      if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
        return id;
      }
    }
    return this._currentId;
  }

  _getRoomSet(startId, depth) {
    const result = new Set([startId]);
    let frontier = [startId];

    for (let d = 0; d < depth; d += 1) {
      const next = [];
      for (const id of frontier) {
        for (const neighborId of this._rooms[id]?.neighbors ?? []) {
          if (!result.has(neighborId)) {
            result.add(neighborId);
            next.push(neighborId);
          }
        }
      }
      frontier = next;
    }

    return result;
  }

  _computeNeighbors(roomId) {
    return PASSAGES
      .filter((passage) => passage.from === roomId || passage.to === roomId)
      .map((passage) => (passage.from === roomId ? passage.to : passage.from));
  }

  _schedulePreloads() {
    for (const id of this._preloadTargetSet) {
      const room = this._rooms[id];
      if (!room) continue;

      if (room.type === "procedural") {
        this._ensureProceduralVisibleState(id);
        continue;
      }

      if (room.state === ROOM_STATES.UNLOADED) {
        this._enqueueLoad(id, this._getLoadPriority(id));
      } else if (room.queued) {
        room.queuePriority = this._getLoadPriority(id);
        this._sortLoadQueue();
      }
    }
  }

  _applyRoomVisibility(currentRoomId) {
    for (const [id, room] of Object.entries(this._rooms)) {
      if (room.type === "procedural") {
        const shouldBeVisible = room.state === ROOM_STATES.LOADED && this._preloadTargetSet.has(id);
        if (room.sceneObject) {
          room.sceneObject.visible = shouldBeVisible;
          if (shouldBeVisible) {
            this._visibleRooms.add(id);
          } else {
            this._visibleRooms.delete(id);
          }
        }
        continue;
      }

      if (id === currentRoomId) {
        this._attachLoadedRoomToScene(id);
      } else {
        this._detachLoadedRoomFromScene(id);
      }
    }

    this._emitStateChange();
  }

  _ensureProceduralVisibleState(id) {
    const room = this._rooms[id];
    if (!room?.sceneObject) return;

    room.sceneObject.visible = this._preloadTargetSet.has(id);
    room.state = ROOM_STATES.LOADED;

    if (room.sceneObject.visible) {
      this._visibleRooms.add(id);
    } else {
      this._visibleRooms.delete(id);
    }
  }

  _enqueueLoad(id, priority) {
    const room = this._rooms[id];
    if (!room || room.type !== "glb" || room.state !== ROOM_STATES.UNLOADED) return;

    if (room.queued) {
      room.queuePriority = Math.min(room.queuePriority, priority);
      this._sortLoadQueue();
      this._emitStateChange();
      return;
    }

    room.queued = true;
    room.queuePriority = priority;
    room.queueOrder = this._queueSerial += 1;
    this._loadQueue.push(id);
    this._sortLoadQueue();
    this._emitStateChange();
  }

  _sortLoadQueue() {
    this._loadQueue.sort((a, b) => {
      const roomA = this._rooms[a];
      const roomB = this._rooms[b];
      if (!roomA || !roomB) return 0;
      return roomA.queuePriority - roomB.queuePriority || roomA.queueOrder - roomB.queueOrder;
    });
  }

  _getLoadPriority(id) {
    if (!this._currentId || id === this._currentId) return 0;
    const currentRoom = this._rooms[this._currentId];
    return currentRoom?.neighbors.includes(id) ? 1 : 2;
  }

  _pumpLoadQueue() {
    while (this._activeLoadCount < MAX_CONCURRENT_LOADS && this._loadQueue.length > 0) {
      const id = this._loadQueue.shift();
      const room = this._rooms[id];

      if (!room || !room.queued || !this._preloadTargetSet.has(id)) {
        if (room) room.queued = false;
        continue;
      }

      room.queued = false;
      room.loadPromise = this._preloadRoom(id)
        .catch((error) => {
          console.error(`[RoomManager] Failed to preload room ${id}:`, error);
        })
        .finally(() => {
          room.loadPromise = null;
          this._pumpLoadQueue();
        });
    }
  }

  async _preloadRoom(id) {
    const room = this._rooms[id];
    if (!room || room.type !== "glb" || !room.glbPath || room.state !== ROOM_STATES.UNLOADED) {
      return;
    }

    this._activeLoadCount += 1;
    room.state = ROOM_STATES.LOADING;
    this._emitStateChange();
    console.log(`[RoomManager] Loading room ${id}...`);

    try {
      await yieldToMainThread();
      const gltf = await this._assetLoader.loadGLTFAsync(room.glbPath);
      const sceneObject = gltf.scene;
      sceneObject.name = `room-${id}`;

      await prepareSceneGraph(sceneObject, {
        onMesh: (mesh) => {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        },
      });

      if (!this._keepResidentSet.has(id) && id !== this._currentId) {
        disposeSceneGraph(sceneObject);
        room.state = ROOM_STATES.UNLOADED;
        this._emitStateChange();
        return;
      }

      room.residentObject = sceneObject;
      room.sceneObject = sceneObject;
      room.state = ROOM_STATES.LOADED;
      room.isInScene = false;
      console.log(`[RoomManager] Room ${id} loaded`);

      if (id === this._currentId) {
        this._attachLoadedRoomToScene(id);
      }
    } catch (error) {
      room.state = ROOM_STATES.UNLOADED;
      room.sceneObject = null;
      room.residentObject = null;
      throw error;
    } finally {
      this._activeLoadCount -= 1;
      this._emitStateChange();
    }
  }

  _attachLoadedRoomToScene(id) {
    const room = this._rooms[id];
    if (!room || room.type !== "glb" || room.state !== ROOM_STATES.LOADED || !room.residentObject) return;
    if (room.isInScene) return;

    this._scene.add(room.residentObject);
    room.isInScene = true;
    this._visibleRooms.add(id);
    console.log(`[RoomManager] Room ${id} added to scene`);
  }

  _detachLoadedRoomFromScene(id) {
    const room = this._rooms[id];
    if (!room || room.type !== "glb" || !room.residentObject || !room.isInScene) return;

    this._scene.remove(room.residentObject);
    room.isInScene = false;
    this._visibleRooms.delete(id);
  }

  _releaseFarRooms() {
    for (const [id, room] of Object.entries(this._rooms)) {
      if (room.type === "procedural") {
        if (room.sceneObject) {
          const shouldShow = this._preloadTargetSet.has(id);
          room.sceneObject.visible = shouldShow;
          if (shouldShow) {
            this._visibleRooms.add(id);
          } else {
            this._visibleRooms.delete(id);
          }
        }
        continue;
      }

      if (this._keepResidentSet.has(id) || id === this._currentId) continue;

      if (room.queued) {
        room.queued = false;
        this._loadQueue = this._loadQueue.filter((roomId) => roomId !== id);
      }

      if (room.isInScene) {
        this._scene.remove(room.residentObject);
        room.isInScene = false;
      }

      if (room.state === ROOM_STATES.LOADED && room.residentObject) {
        disposeSceneGraph(room.residentObject);
        room.residentObject = null;
        room.sceneObject = null;
        room.state = ROOM_STATES.UNLOADED;
        this._visibleRooms.delete(id);
        console.log(`[RoomManager] Room ${id} unloaded`);
      }
    }
  }

  _emitStateChange() {
    if (this._stateListeners.size === 0) return;
    const snapshot = this.getStatus();
    for (const listener of this._stateListeners) {
      listener(snapshot);
    }
  }

  _makeDebugBox(bounds, height) {
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    const geo = new THREE.BoxGeometry(w, height, d);
    const mat = new THREE.MeshBasicMaterial({
      color: DEBUG_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (bounds.minX + bounds.maxX) / 2,
      height / 2,
      (bounds.minZ + bounds.maxZ) / 2
    );
    mesh.visible = false;
    return mesh;
  }
}

/**
 * @typedef {Object} RoomEntry
 * @property {string} id
 * @property {string} name
 * @property {{ minX:number, maxX:number, minZ:number, maxZ:number }} bounds
 * @property {string[]} neighbors
 * @property {"procedural"|"glb"} type
 * @property {string|null} glbPath
 * @property {THREE.Object3D|null} sceneObject
 * @property {THREE.Object3D|null} residentObject
 * @property {"unloaded"|"loading"|"loaded"} state
 * @property {boolean} isInScene
 * @property {boolean} queued
 * @property {number} queuePriority
 * @property {number} queueOrder
 * @property {Promise<void>|null} loadPromise
 */

/**
 * @typedef {Object} RoomManagerStatus
 * @property {string|null} currentRoomId
 * @property {string[]} visibleRooms
 * @property {string[]} loadingRooms
 * @property {string[]} queuedRooms
 * @property {number} activeLoadCount
 * @property {Record<string, { state: "unloaded"|"loading"|"loaded", queued: boolean, inScene: boolean, type: "procedural"|"glb" }>} rooms
 */
