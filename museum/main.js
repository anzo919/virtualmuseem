/**
 * Main — entry point for the Carthage Virtual Museum.
 * Chronological journey: 7 era rooms from 814 BC to Roman legacy.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG, ROOMS, PASSAGES } from "./config.js";
import { PlayerController }    from "./PlayerController.js";
import { NPCController }       from "./NPCController.js";
import { MuseumBuilder }       from "./MuseumBuilder.js";
import { InteractionManager }  from "./InteractionManager.js";
import { DustParticleSystem }  from "./ParticleSystem.js";
import { Minimap }             from "./Minimap.js";
import { ZoneManager }         from "./ZoneManager.js";
import { DoorManager }         from "./DoorManager.js";
import { MiniGameManager }     from "./MiniGameManager.js";
import { RoomManager }         from "./RoomManager.js";
import { RoomInfoPanel }       from "./RoomInfoPanel.js";
import { MuseumAudio }         from "./MuseumAudio.js";

// ═══════════════════════════════════════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════════════════════════════════════

function createRenderer() {
  // Ask browser for a high-performance GPU context first.
  try {
    return new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
  } catch (_err) {
    // Fallback keeps the app runnable on weaker machines.
    console.warn("High-performance WebGL context unavailable. Falling back to default context.");
    return new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
  }
}

function warnIfSoftwareRenderer(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) {
    return;
  }

  const gpuVendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "");
  const gpuRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
  const gpuInfo = `${gpuVendor} ${gpuRenderer}`.toLowerCase();
  const softwareRendererPattern = /swiftshader|llvmpipe|software|microsoft basic render/;

  if (softwareRendererPattern.test(gpuInfo)) {
    console.warn(`Software WebGL renderer detected: ${gpuVendor} | ${gpuRenderer}`);
    console.warn("Enable browser hardware acceleration and update GPU drivers to use the GPU.");
  } else {
    console.info(`WebGL renderer in use: ${gpuVendor} | ${gpuRenderer}`);
  }
}

const renderer = createRenderer();
warnIfSoftwareRenderer(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap pixel ratio at 1 on high-DPI screens — biggest single GPU saver
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
// Let clicks reach #blocker until pointer lock (canvas is appended last in <body>).
renderer.domElement.style.pointerEvents = "none";

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, CONFIG.player.height, 76);

// ═══════════════════════════════════════════════════════════════════════════
// LIGHTING
// ═══════════════════════════════════════════════════════════════════════════

scene.add(new THREE.HemisphereLight(0xeeddbb, 0x4a3a2a, 0.5));
scene.add(new THREE.AmbientLight(0xffe8cc, 0.12));

// Directional fill — small local frustum that follows the player.
// Shadow camera covers only 14×14 m around the player → 16× less shadow work
// compared to the old 40×160 m static frustum.
const dirLight = new THREE.DirectionalLight(0xffdcaa, 0.35);
dirLight.castShadow              = true;
dirLight.shadow.mapSize.setScalar(CONFIG.shadows.mapSize);  // 512×512
dirLight.shadow.camera.left      = -10;
dirLight.shadow.camera.right     = 10;
dirLight.shadow.camera.top       = 10;
dirLight.shadow.camera.bottom    = -10;
dirLight.shadow.camera.near      = 0.5;
dirLight.shadow.camera.far       = 30;
dirLight.shadow.bias             = -0.002;
scene.add(dirLight);
scene.add(dirLight.target);

// ═══════════════════════════════════════════════════════════════════════════
// ASYNC MUSEUM BUILD  — one room per frame, never blocks the thread
// ═══════════════════════════════════════════════════════════════════════════

const loadScreen = document.getElementById("loading-screen");
const loadLabel  = document.getElementById("loading-label");
const loadBar    = document.getElementById("loading-bar-fill");
const loadStageEls = {
  build: document.getElementById("loading-stage-build"),
  glb: document.getElementById("loading-stage-glb"),
  shaders: document.getElementById("loading-stage-shaders"),
  gpu: document.getElementById("loading-stage-gpu"),
};
const blocker = document.getElementById("blocker");
const blockerPrompt = document.querySelector("#blocker .prompt");

function setLoadingProgress(label, progress01) {
  if (loadLabel && label) loadLabel.textContent = label;
  if (loadBar) loadBar.style.width = `${Math.round(Math.min(Math.max(progress01, 0), 1) * 100)}%`;
}

function setLoadingStageState(stageId, state) {
  const el = loadStageEls[stageId];
  if (!el) return;
  el.dataset.state = state;
}

function setGameplayStartEnabled(enabled) {
  if (!blocker) return;

  blocker.style.pointerEvents = enabled ? "auto" : "none";
  blocker.style.opacity = enabled ? "1" : "0.92";
  blocker.style.cursor = enabled ? "pointer" : "wait";

  if (blockerPrompt) {
    blockerPrompt.textContent = enabled
      ? "Click anywhere — or press Enter — to begin your journey"
      : "Preparing the full museum experience…";
  }
}

function loadGLTFAsync(loader, path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

async function preloadHannibalStatue(envMap) {
  const gltf = await loadGLTFAsync(new GLTFLoader(), new URL("./3d/hannibal.glb", import.meta.url).href);
  const statue = gltf.scene;
  const box1 = new THREE.Box3().setFromObject(statue);
  const naturalH = box1.max.y - box1.min.y;
  if (naturalH > 0) statue.scale.setScalar(3.5 / naturalH);
  const box2 = new THREE.Box3().setFromObject(statue);
  statue.position.set(0, -box2.min.y, -21.5);
  statue.rotation.y = Math.PI;

  statue.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material) {
      child.material.envMap = envMap;
      child.material.envMapIntensity = 0.6;
      child.material.needsUpdate = true;
    }
  });

  scene.add(statue);

  const keySpot = new THREE.SpotLight(0xffe0c0, 3.5, 14, Math.PI / 8, 0.35, 1.8);
  keySpot.position.set(0, 9, -17);
  keySpot.target.position.set(0, 1.8, -21.5);
  keySpot.castShadow = false; // statue has its own light; no shadow needed
  scene.add(keySpot);
  scene.add(keySpot.target);
  scene.add(Object.assign(new THREE.PointLight(0xaa5522, 0.6, 8, 2), { position: new THREE.Vector3(0, 0.5, -24) }));
  console.log("✓ Hannibal statue preloaded");
}

async function warmupRoomRendering(roomGroups) {
  const originalPos  = camera.position.clone();
  const originalQuat = camera.quaternion.clone();

  const roomList = Object.values(ROOMS);
  const roomIds  = roomList.map((r) => r.id);

  // Compute neighbor sets (same logic as RoomManager) so warmup matches gameplay visibility
  const neighborsOf = {};
  for (const id of roomIds) {
    neighborsOf[id] = PASSAGES
      .filter((p) => p.from === id || p.to === id)
      .map((p) => (p.from === id ? p.to : p.from));
  }

  // Hide every room group before starting isolated renders
  for (const id of roomIds) {
    if (roomGroups[id]) roomGroups[id].visible = false;
  }

  for (let i = 0; i < roomList.length; i += 1) {
    const room = roomList[i];
    const id   = room.id;
    const { minX, maxX, minZ, maxZ } = room.bounds;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    setLoadingProgress(
      `Warming GPU (${i + 1}/${roomList.length}) — ${room.name}…`,
      0.88 + ((i + 1) / roomList.length) * 0.12,
    );

    // Show this room + its immediate neighbors (matches RoomManager PRELOAD_DEPTH=1)
    const toShow = [id, ...neighborsOf[id]];
    for (const rid of toShow) {
      if (roomGroups[rid]) roomGroups[rid].visible = true;
    }

    // Position camera at room centre facing forward
    camera.position.set(cx, CONFIG.player.height, cz);
    camera.lookAt(cx, CONFIG.player.height, cz - 1);
    camera.updateMatrixWorld(true);

    // Two frames: first triggers GPU upload, second confirms pipeline is settled
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Hide all rooms again before the next iteration
    for (const rid of toShow) {
      if (roomGroups[rid]) roomGroups[rid].visible = false;
    }
  }

  // Restore camera
  camera.position.copy(originalPos);
  camera.quaternion.copy(originalQuat);
  camera.updateMatrixWorld(true);

  // Leave all rooms visible — RoomManager.update() will set proper visibility on first frame
  for (const id of roomIds) {
    if (roomGroups[id]) roomGroups[id].visible = true;
  }
}

async function compileScenePrograms() {
  // Precompile shader programs while loading UI is visible.
  if (typeof renderer.compileAsync === "function") {
    await renderer.compileAsync(scene, camera);
    return;
  }

  renderer.compile(scene, camera);
}

function createRoomStreamingIndicator() {
  const root = document.createElement("div");
  root.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:1200",
    "min-width:220px",
    "padding:10px 12px",
    "border:1px solid rgba(212,180,131,.22)",
    "border-radius:10px",
    "background:rgba(14,12,10,.78)",
    "backdrop-filter:blur(8px)",
    "font-family:Georgia,serif",
    "color:#d4b483",
    "pointer-events:none",
    "opacity:0",
    "transform:translateY(6px)",
    "transition:opacity .18s ease, transform .18s ease",
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText = "font-size:.72rem; letter-spacing:.14em; text-transform:uppercase;";

  const meta = document.createElement("div");
  meta.style.cssText = "margin-top:4px; font-size:.78rem; opacity:.72;";

  root.append(title, meta);
  document.body.appendChild(root);

  let lastBusy = false;
  let hideTimer = null;

  const show = (headline, detail) => {
    title.textContent = headline;
    meta.textContent = detail;
    root.style.opacity = "1";
    root.style.transform = "translateY(0)";
  };

  const hide = () => {
    root.style.opacity = "0";
    root.style.transform = "translateY(6px)";
  };

  return {
    update(status) {
      const loadingCount = status.loadingRooms.length;
      const queuedCount = status.queuedRooms.length;
      const busy = loadingCount > 0 || queuedCount > 0;

      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      if (busy) {
        const detail = [
          loadingCount > 0 ? `${loadingCount} loading` : null,
          queuedCount > 0 ? `${queuedCount} queued` : null,
        ].filter(Boolean).join("  •  ");

        show("Streaming Rooms", detail);
        lastBusy = true;
        return;
      }

      if (lastBusy) {
        show("Rooms Ready", status.currentRoomId ? `Active area: ${status.currentRoomId}` : "Streaming idle");
        hideTimer = setTimeout(() => {
          hide();
          lastBusy = false;
        }, 1200);
        return;
      }

      hide();
    },
  };
}

function createRoomTransitionMask() {
  const mask = document.createElement("div");
  mask.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:1100",
    "pointer-events:none",
    "opacity:0",
    "background:radial-gradient(circle at center, rgba(14,12,10,0.08), rgba(14,12,10,0.36))",
    "transition:opacity .18s ease",
  ].join(";");
  document.body.appendChild(mask);

  let activeRoomId = null;
  let clearTimer = null;

  return {
    update(currentRoomId) {
      if (!currentRoomId || currentRoomId === activeRoomId) return;

      activeRoomId = currentRoomId;
      mask.style.opacity = "1";

      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        mask.style.opacity = "0";
      }, 140);
    },
  };
}

let buildResult;
try {
  // Block pointer-lock start until all assets/shaders are prepared.
  setGameplayStartEnabled(false);
  setLoadingStageState("build", "active");

  // Constructor generates large procedural textures synchronously — update UI so the bar does not sit at 0%.
  setLoadingProgress("Generating surfaces & materials…", 0.05);

  const builder = new MuseumBuilder(scene);

  buildResult = await builder.buildDeferred((progress, label) => {
    // Keep headroom for explicit post-build preloading/warmup steps below.
    setLoadingProgress(label, progress * 0.78);
  });
  setLoadingStageState("build", "done");
} catch (e) {
  console.error("Museum build failed:", e);
  setLoadingStageState("build", "error");
  setLoadingProgress("Build failed — see the browser console (F12).", 1);
  throw e;
}

const {
  wallBoxes, artworkTargets, artworkPositions,
  torchLights, rotatingArtifact, envMap, doors, roomGroups,
  muralAnim,
} = buildResult;

scene.background  = new THREE.Color(0x0e0c0a);
scene.environment = envMap;

// ── Blocking preload of heavy GLB assets before gameplay starts ───────────
setLoadingProgress("Loading 3D assets…", 0.82);
setLoadingStageState("glb", "active");
try {
  await preloadHannibalStatue(envMap);
  setLoadingStageState("glb", "done");
} catch (err) {
  setLoadingStageState("glb", "error");
  console.error("Failed to preload hannibal.glb:", err);
}

setLoadingProgress("Preparing shader programs…", 0.86);
setLoadingStageState("shaders", "active");
try {
  await compileScenePrograms();
  setLoadingStageState("shaders", "done");
} catch (err) {
  setLoadingStageState("shaders", "error");
  throw err;
}

// Warm up texture uploads + shader compilation while loading UI is visible.
setLoadingProgress("Compiling shaders & uploading textures…", 0.88);
setLoadingStageState("gpu", "active");
try {
  await warmupRoomRendering(roomGroups);
  setLoadingStageState("gpu", "done");
} catch (err) {
  setLoadingStageState("gpu", "error");
  throw err;
}
setLoadingProgress("Ready", 1);

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO (buffers load here — failures are non-fatal)
// ═══════════════════════════════════════════════════════════════════════════

const museumAudio = new MuseumAudio(camera);
try {
  await museumAudio.init();
} catch (err) {
  console.warn("Museum audio failed to load (game continues without sound):", err);
}
museumAudio.attachVolumeUi();
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement) void museumAudio.startMusicIfNeeded();
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════

const roomManager = new RoomManager(scene, roomGroups, wallBoxes);
const roomStreamingIndicator = createRoomStreamingIndicator();
const roomTransitionMask = createRoomTransitionMask();

// Example linear streaming setup:
// room1 <-> room2 <-> room3
//
// Replace these placeholder paths with real GLB files when available.
// The manager will preload neighbors off-scene in the background so room entry
// becomes an instant add/show instead of a blocking load.
const ROOM_STREAMING_EXAMPLE = {
  room1: { id: "r1", neighbors: ["r2"], glbPath: "./3d/room1.glb" },
  room2: { id: "r2", neighbors: ["r1", "r3"], glbPath: "./3d/room2.glb" },
  room3: { id: "r3", neighbors: ["r2"], glbPath: "./3d/room3.glb" },
};

// Production usage example:
// roomManager.registerGLB(ROOM_STREAMING_EXAMPLE.room1.id, ROOM_STREAMING_EXAMPLE.room1.glbPath);
// roomManager.registerGLB(ROOM_STREAMING_EXAMPLE.room2.id, ROOM_STREAMING_EXAMPLE.room2.glbPath);
// roomManager.registerGLB(ROOM_STREAMING_EXAMPLE.room3.id, ROOM_STREAMING_EXAMPLE.room3.glbPath);

roomManager.onStateChange((status) => {
  roomStreamingIndicator.update(status);
  roomTransitionMask.update(status.currentRoomId);
});

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyB") roomManager.toggleDebug();
});

const doorManager = new DoorManager(wallBoxes, {
  onDoorOpen: () => museumAudio.playDoorOpen(),
  onDoorClose: () => museumAudio.playDoorClose(),
});
for (const d of doors) {
  const passage = PASSAGES.find((p) => p.id === d.passageId);
  const linkedRoomId = passage ? passage.to : null;
  doorManager.register(
    d.passageId,
    d.leftPivot,
    d.rightPivot,
    d.handles,
    d.collisionBoxes,
    { linkedRoomId, locked: Boolean(linkedRoomId) },
  );
}

const player = new PlayerController(camera, wallBoxes, renderer.domElement);
const miniGameManager = new MiniGameManager(player, doorManager);
const npc         = new NPCController(scene, wallBoxes, artworkPositions);
const interaction = new InteractionManager(
  camera,
  artworkTargets,
  () => player.isLocked && !miniGameManager.isActive(),
  // Delegate all door routing to DoorManager.handleInteraction():
  //   locked (quiz not yet done) → opens mini-game
  //   unlocked (quiz passed or never locked) → toggleDoor() directly
  (id) => doorManager.handleInteraction(id, (doorId, roomId) => {
    if (roomId) miniGameManager.openGame(doorId, roomId);
  }),
  () => miniGameManager.isActive(),
);
interaction.setDoorTargets(doorManager.targets);
interaction.setDoorManager(doorManager);
interaction.setMuseumAudio(museumAudio);
const particles   = new DustParticleSystem(scene);
const minimap        = new Minimap();
const zoneManager    = new ZoneManager(scene);
const roomInfoPanel  = new RoomInfoPanel();
zoneManager.setRoomInfoPanel(roomInfoPanel);

// Prime the streaming system before the first rendered gameplay frame.
roomManager.update(camera.position);

// Hide loading screen and allow gameplay only when fully ready.
if (loadScreen) loadScreen.style.display = "none";
setGameplayStartEnabled(true);

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════════════════

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.06);

  // Shadow camera follows player — keeps the 20×20 m frustum centred on them
  const px = camera.position.x, pz = camera.position.z;
  dirLight.position.set(px + 6, 18, pz + 4);
  dirLight.target.position.set(px, 0, pz);
  dirLight.target.updateMatrixWorld();
  dirLight.shadow.camera.updateProjectionMatrix();

  player.update(delta);
  doorManager.update(delta);
  roomManager.update(camera.position);

  const currentRoom = zoneManager.update(delta, camera.position);

  npc.update(delta, camera.position);
  interaction.update(delta);
  particles.update(delta, camera.position, currentRoom);

  if (rotatingArtifact) rotatingArtifact.rotation.y += delta * 0.28;

  if (muralAnim) muralAnim.animate(performance.now() * 0.001);

  // Torch flicker
  const t = performance.now();
  for (let i = 0; i < torchLights.length; i++) {
    const l    = torchLights[i];
    const base = currentRoom === "r6" ? 0.28 : (currentRoom === "r5" ? 0.75 : 0.55);
    l.intensity = l.intensity * 0.90 + (base + Math.sin(t * 0.007 + i * 3.7) * 0.22 + Math.random() * 0.12) * 0.10;
  }

  if (player.isLocked) {
    minimap.update(camera.position, camera.rotation.y, npc.mesh.position, currentRoom);
  }

  renderer.render(scene, camera);
}

animate();

// ═══════════════════════════════════════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
