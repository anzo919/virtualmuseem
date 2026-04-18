import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const DEFAULT_BATCH_SIZE = 24;

/**
 * Promise-based GLTF loader used by the room streamer.
 *
 * Keeping this wrapper separate makes room loading testable and ensures
 * every caller uses the same async/await flow.
 */
export class GLTFAssetLoader {
  constructor(loadingManager) {
    this._loader = new GLTFLoader(loadingManager);
  }

  /**
   * Load a GLB/GLTF file without blocking the render loop.
   *
   * @param {string} path
   * @returns {Promise<import("three/addons/loaders/GLTFLoader.js").GLTF>}
   */
  loadGLTFAsync(path) {
    return new Promise((resolve, reject) => {
      this._loader.load(path, resolve, undefined, reject);
    });
  }
}

/**
 * Yield to the next frame so expensive setup work is spread across multiple
 * frames instead of landing in one long hitch.
 *
 * @returns {Promise<void>}
 */
export function yieldToMainThread() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Prepare meshes in small batches. This is the critical step that prevents
 * "loaded in one callback" from turning into one giant post-load frame spike.
 *
 * @param {import("three").Object3D} root
 * @param {{ batchSize?: number, onMesh?: (mesh: any) => void }} [options]
 * @returns {Promise<void>}
 */
export async function prepareSceneGraph(root, options = {}) {
  const { batchSize = DEFAULT_BATCH_SIZE, onMesh } = options;
  const meshes = [];

  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  for (let i = 0; i < meshes.length; i += 1) {
    onMesh?.(meshes[i]);

    if ((i + 1) % batchSize === 0) {
      await yieldToMainThread();
    }
  }
}

/**
 * Dispose a room graph completely when it is far away. This keeps both CPU
 * memory and GPU memory under control instead of accumulating unloaded rooms.
 *
 * @param {import("three").Object3D} root
 */
export function disposeSceneGraph(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    child.geometry?.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;

      const textureSlots = [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "emissiveMap",
        "aoMap",
        "envMap",
        "lightMap",
        "displacementMap",
        "alphaMap",
      ];

      for (const slot of textureSlots) {
        material[slot]?.dispose();
      }

      material.dispose();
    }
  });
}
