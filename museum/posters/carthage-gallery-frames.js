/**
 * Museum wall-mounted picture frames — 3D geometry (wood rails, bevel, backing, canvas plane)
 * + optional texture. Based on the original Carthage gallery snippet, adapted for ES modules
 * and three.js r170 (ColorManagement). Parent to a room Group for visibility streaming.
 */

import * as THREE from "three";

export class MuseumFrame {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Vector3} position
   * @param {number} rotY
   * @param {string|null} imageUrl  If null, canvas stays a neutral mat (no remote images).
   * @param {THREE.Texture|null} envMap
   * @param {object} [options]
   */
  constructor(parent, position, rotY, imageUrl, envMap, options = {}) {
    this.imageUrl = imageUrl;
    this.envMap = envMap;
    this.width = options.width ?? 4;
    this.height = options.height ?? 3;
    this.frameColor = options.frameColor ?? 0x8b6914;
    this.frameThickness = options.frameThickness ?? 0.15;
    this.frameDepth = options.frameDepth ?? 0.2;
    this.addPictureLights = options.addPictureLights !== false;

    this.group = new THREE.Group();
    this.group.name = options.name ?? "museum-frame";

    this.createFrame();
    this.createCanvas();
    if (this.addPictureLights) this.createLighting();

    this.group.position.copy(position);
    this.group.rotation.y = rotY;
    parent.add(this.group);
  }

  _mat(overrides = {}) {
    const m = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.6,
      envMap: this.envMap ?? undefined,
      envMapIntensity: 0.55,
      ...overrides,
    });
    return m;
  }

  createFrame() {
    const frameMat = this._mat({ color: this.frameColor });
    const w = this.width;
    const h = this.height;
    const ft = this.frameThickness;
    const fd = this.frameDepth;

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w + ft * 2, ft, fd),
      frameMat,
    );
    top.position.y = h / 2 + ft / 2;
    top.castShadow = true;
    this.group.add(top);

    const bottom = new THREE.Mesh(
      new THREE.BoxGeometry(w + ft * 2, ft, fd),
      frameMat,
    );
    bottom.position.y = -h / 2 - ft / 2;
    bottom.castShadow = true;
    this.group.add(bottom);

    const left = new THREE.Mesh(new THREE.BoxGeometry(ft, h, fd), frameMat);
    left.position.x = -w / 2 - ft / 2;
    left.castShadow = true;
    this.group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(ft, h, fd), frameMat);
    right.position.x = w / 2 + ft / 2;
    right.castShadow = true;
    this.group.add(right);

    const bevelMat = this._mat({ color: 0xc4a882, roughness: 0.2, metalness: 0.8, envMapIntensity: 0.45 });
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.05), bevelMat);
    bevel.position.z = fd / 2 - 0.02;
    this.group.add(bevel);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.9, metalness: 0 }),
    );
    back.position.z = -0.05;
    this.group.add(back);
  }

  createCanvas() {
    const w = this.width;
    const h = this.height;
    const fd = this.frameDepth;
    const canvasGeo = new THREE.PlaneGeometry(w - 0.1, h - 0.1);

    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x2c2416,
      roughness: 0.9,
      envMap: this.envMap ?? undefined,
      envMapIntensity: 0.12,
    });

    this.canvas = new THREE.Mesh(canvasGeo, placeholderMat);
    this.canvas.position.z = fd / 2 + 0.01;
    this.group.add(this.canvas);

    if (!this.imageUrl) return;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      this.imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        // Slight self-illumination so paintings read in dim rooms (e.g. r6).
        const imageMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.82,
          metalness: 0,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: texture,
          emissiveIntensity: 0.28,
          envMap: this.envMap ?? undefined,
          envMapIntensity: 0.22,
        });
        this.canvas.material.dispose();
        this.canvas.material = imageMat;
      },
      undefined,
      (err) => {
        console.warn("[MuseumFrame] Texture failed:", this.imageUrl, err);
      },
    );
  }

  createLighting() {
    const h = this.height;
    const fd = this.frameDepth;
    this.spotLight = new THREE.SpotLight(0xfff5e6, 1.5, 15, Math.PI / 6, 0.5, 1);
    this.spotLight.position.set(0, h / 2 + 1, 2);
    this.spotLight.target = this.canvas;
    this.spotLight.castShadow = false;
    this.spotLight.shadow.mapSize.width = 512;
    this.spotLight.shadow.mapSize.height = 512;
    this.group.add(this.spotLight);

    this.rimLight = new THREE.PointLight(0xffddaa, 0.3, 5);
    this.rimLight.position.set(0, 0, 1.5);
    this.group.add(this.rimLight);
  }

  /** @param {number} time */
  animate(time) {
    if (this.spotLight) {
      this.spotLight.intensity = 1.5 + Math.sin(time * 2) * 0.1;
    }
  }
}
