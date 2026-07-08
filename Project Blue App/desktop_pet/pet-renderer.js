import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  facingYawForDirection,
  gaitProfile,
  movementLabel
} from "./motion-core.mjs";

const canvas = document.querySelector("#body");
const live2DCanvas = document.querySelector("#live2dBody");
const petBubble = document.querySelector("#petBubble");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x355080, 2.7));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1, 2, 3);
scene.add(key);

let vrm;
let twoDModel;
let live2DModel;
let live2DApp;
let live2DBaseScale = 1;
let live2DExpression = "";
let live2DAnimations = { expressions: [], motions: [] };
let live2DSize = { width: 0, height: 0 };
let live2DRuntimePromise;
let modelBounds;
let elapsed = 0;
let reactionUntil = 0;
let wandering = false;
let walking = false;
let walkWeight = 0;
let runWeight = 0;
let gaitPhase = 0;
let motion = { x: 1, y: 0, speed: 0, mode: "idle", turn: 0, braking: false };
let bodyYaw = 0;
let bodyYawVelocity = 0;
let turnLean = 0;
let speaking = false;
let action = null;
const actionQueue = [];
let nextIdleAction = 4;
let proactivity = "balanced";
let blinkStart = -1;
let nextBlink = 2.5 + Math.random() * 2.5;
let pointer = { x: 0, y: 0 };
let bond = Number(localStorage.getItem("blueBond") || 0);
const softBones = [];
const motionBones = {};
document.querySelector("#mood").textContent = `Bond ${bond}`;
let bubbleTimer;

function showBubble(message, durationMs = 5200) {
  const text = String(message || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!text) return;
  petBubble.textContent = text;
  petBubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    petBubble.hidden = true;
  }, Math.max(1200, Math.min(Number(durationMs) || 5200, 12000)));
}

function clearModelState() {
  if (vrm?.scene) scene.remove(vrm.scene);
  if (twoDModel?.group) scene.remove(twoDModel.group);
  if (live2DModel) {
    live2DModel.destroy({ children: true, texture: false, baseTexture: false });
  }
  if (live2DApp) {
    live2DApp.destroy(false, { children: true, texture: false, baseTexture: false });
  }
  vrm = null;
  twoDModel = null;
  live2DModel = null;
  live2DApp = null;
  live2DBaseScale = 1;
  live2DExpression = "";
  live2DAnimations = { expressions: [], motions: [] };
  live2DSize = { width: 0, height: 0 };
  modelBounds = null;
  canvas.hidden = false;
  live2DCanvas.hidden = true;
  softBones.length = 0;
  for (const key of Object.keys(motionBones)) delete motionBones[key];
}

function fitCamera() {
  if (!modelBounds) return;
  const center = modelBounds.getCenter(new THREE.Vector3());
  const size = modelBounds.getSize(new THREE.Vector3());
  const aspect = Math.max(canvas.clientWidth / canvas.clientHeight, 0.1);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const verticalDistance = size.y * 0.5 / Math.tan(halfFov);
  const horizontalDistance = size.x * 0.5 / (Math.tan(halfFov) * aspect);
  const distance = Math.max(verticalDistance, horizontalDistance) * 0.9;
  camera.aspect = aspect;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

async function loadSelectedModel(model) {
  clearModelState();
  const selected = model || await window.bluePet.currentVtuberModel();
  document.querySelector("#handle").firstChild.textContent =
    `${selected.name || "BLUE"} `;
  document.querySelector("#mood").textContent =
    `Bond ${bond} - loading ${selected.type === "2d" ? "2D" : "3D"}`;
  if (selected.type === "2d") {
    if (selected.format === "live2d") {
      loadLive2DModel(selected).catch(error => {
        document.querySelector("#mood").textContent = `Live2D load error: ${error.message}`;
      });
    } else {
      load2DModel(selected);
    }
  } else {
    loadVRMModel(selected);
  }
}

function loadScriptOnce(src, globalCheck) {
  if (globalCheck()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-blue-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.dataset.blueSrc = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function ensureLive2DRuntime() {
  if (!live2DRuntimePromise) {
    live2DRuntimePromise = loadScriptOnce(
      "./vendor/live2dcubismcore.min.js",
      () => Boolean(window.Live2DCubismCore)
    )
      .then(() => loadScriptOnce(
        "./node_modules/pixi.js/dist/browser/pixi.min.js",
        () => Boolean(window.PIXI)
      ))
      .then(() => {
        window.PIXI = window.PIXI;
        return loadScriptOnce(
          "./node_modules/pixi-live2d-display/dist/cubism4.min.js",
          () => Boolean(window.PIXI?.live2d?.Live2DModel)
        );
      });
  }
  return live2DRuntimePromise;
}

function fitLive2DModel() {
  if (!live2DApp || !live2DModel) return;
  const width = Math.max(live2DCanvas.clientWidth, 1);
  const height = Math.max(live2DCanvas.clientHeight, 1);
  live2DSize = { width, height };
  live2DApp.renderer.resize(width, height);
  live2DModel.anchor?.set(0.5, 0.5);
  const modelWidth = Math.max(live2DModel.internalModel?.width || live2DModel.width || 1, 1);
  const modelHeight = Math.max(live2DModel.internalModel?.height || live2DModel.height || 1, 1);
  live2DBaseScale = Math.min(width / modelWidth, height / modelHeight) * 0.92;
  live2DModel.position.set(width * 0.5, height * 0.52);
  live2DModel.scale.set(live2DBaseScale);
}

function availableLive2DExpression(name) {
  return live2DAnimations.expressions.find(
    expression => expression.toLowerCase() === name.toLowerCase()
  );
}

function expressionForAction(name) {
  const wanted = {
    smile: ["Happy"],
    cheer: ["Happy"],
    dance: ["Happy"],
    lean: ["Disappointed", "Sad"],
    look: ["Disappointed"],
    nod: ["Happy"],
    edge: ["Disappointed", "Sad"],
    sad: ["Sad"],
    chair: ["Chair"],
    outfit: ["Outfit 2", "Outfit", "Costume", "Clothes"]
  }[name] || [];
  return wanted.map(availableLive2DExpression).find(Boolean) || "";
}

function live2DIdleActions() {
  return [
    availableLive2DExpression("Happy") ? "smile" : "",
    availableLive2DExpression("Disappointed") || availableLive2DExpression("Sad") ? "look" : "",
    availableLive2DExpression("Outfit 2") || availableLive2DExpression("Outfit") ? "outfit" : ""
  ].filter(Boolean);
}

async function loadLive2DModel(model) {
  canvas.hidden = true;
  live2DCanvas.hidden = false;
  await ensureLive2DRuntime();
  if (!live2DApp) {
    live2DApp = new window.PIXI.Application({
      view: live2DCanvas,
      autoStart: true,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2)
    });
  }
  live2DModel = await window.PIXI.live2d.Live2DModel.from(model.path, {
    autoInteract: false
  });
  live2DAnimations = {
    expressions: Array.isArray(model.animations?.expressions)
      ? model.animations.expressions
      : [],
    motions: Array.isArray(model.animations?.motions)
      ? model.animations.motions
      : []
  };
  live2DModel.anchor?.set(0.5, 0.5);
  live2DApp.stage.addChild(live2DModel);
  fitLive2DModel();
  document.querySelector("#mood").textContent =
    `Bond ${bond} - ${model.name} Live2D ready`;
}

function load2DModel(model) {
  new THREE.TextureLoader().load(model.path, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const aspect = texture.image.width / Math.max(texture.image.height, 1);
    const height = 2.6;
    const width = height * aspect;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    twoDModel = { group, mesh, material, baseScale: 1 };
    modelBounds = new THREE.Box3().setFromObject(group);
    fitCamera();
    document.querySelector("#mood").textContent =
      `Bond ${bond} - ${model.name} ready`;
  }, undefined, error => {
    document.querySelector("#mood").textContent = `2D model load error: ${error.message}`;
  });
}

function loadVRMModel(model) {
  loader.load(model.path || "../assets/blue_identity.vrm", gltf => {
  vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI;

  for (const hiddenLayer of ["Acc", "gown", "panty", "socks short"]) {
    const object = vrm.scene.getObjectByName(hiddenLayer);
    if (object) object.visible = false;
  }
  const top = vrm.scene.getObjectByName("top");
  if (top) top.scale.multiplyScalar(1.012);

  const rotation = (x, y, z) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
  vrm.humanoid?.setNormalizedPose({
    spine: { rotation: rotation(0.03, 0, 0) },
    chest: { rotation: rotation(-0.025, 0, 0) },
    leftUpperArm: { rotation: rotation(0.04, 0.04, 1.34) },
    rightUpperArm: { rotation: rotation(0.04, -0.04, -1.34) },
    leftLowerArm: { rotation: rotation(0, 0.08, 0.12) },
    rightLowerArm: { rotation: rotation(0, -0.08, -0.12) },
    leftUpperLeg: { rotation: rotation(0, 0, 0.025) },
    rightUpperLeg: { rotation: rotation(0, 0, -0.025) }
  });

  // The supplied spring setup becomes unstable after normalized posing.
  // Replace it with bounded deterministic sway so hair never explodes.
  vrm.springBoneManager = null;
  const stableSoftRoots = /^(hair root|back hair L|back hair R|back hair 046|FrontHair1\.003|Tail|Tail\.001|Tail\.002)$/i;
  vrm.scene.traverse(object => {
    if (!object.isBone) return;
    if (stableSoftRoots.test(object.name)) {
      softBones.push({
        object,
        base: object.quaternion.clone(),
        phase: softBones.length * 0.37,
        amount: /Tail/i.test(object.name)
          ? 0.045
          : (/FrontHair/i.test(object.name) ? 0.012 : 0.024),
        angle: 0,
        velocity: 0
      });
    }
  });
  for (const name of [
    "hips", "spine", "chest", "head",
    "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm",
    "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg",
    "leftFoot", "rightFoot", "leftToes", "rightToes"
  ]) {
    const object = vrm.humanoid?.getNormalizedBoneNode(name);
    if (object) motionBones[name] = { object, base: object.quaternion.clone() };
  }

  vrm.scene.updateMatrixWorld(true);
  modelBounds = new THREE.Box3().setFromObject(vrm.scene);
  fitCamera();
  document.querySelector("#mood").textContent =
    `Bond ${bond} - ${model.name || "Blue 3D"} ready`;
}, undefined, error => {
  document.querySelector("#mood").textContent = `Body load error: ${error.message}`;
  });
}

const clock = new THREE.Clock();
function springStep(position, velocity, target, delta, frequency = 2.5, damping = 0.85) {
  const omega = Math.PI * 2 * frequency;
  const acceleration = omega * omega * (target - position)
    - 2 * damping * omega * velocity;
  const nextVelocity = velocity + acceleration * delta;
  return {
    position: position + nextVelocity * delta,
    velocity: nextVelocity
  };
}

function triggerAction(name, duration = 2.4) {
  const durations = {
    wave: 2.6, smile: 2.8, look: 2.8, lean: 2.2,
    stretch: 3.2, dance: 4.5, edge: 1.2, nod: 1.8, cheer: 3.1,
    outfit: 4.5, chair: 4.5, sad: 3.0
  };
  if (!Object.hasOwn(durations, name)) return;
  if (action && name !== "edge") {
    if (actionQueue.length < 4 && !actionQueue.includes(name)) actionQueue.push(name);
    return;
  }
  const actualDuration = durations[name] || duration;
  action = { name, start: elapsed, end: elapsed + actualDuration };
  reactionUntil = Math.max(reactionUntil, action.end);
}

function scheduleNextIdleAction() {
  const intervals = {
    off: [Number.POSITIVE_INFINITY, 0],
    quiet: [18, 14],
    balanced: [8, 10],
    social: [4, 6]
  };
  const [minimum, spread] = intervals[proactivity] || intervals.balanced;
  nextIdleAction = elapsed + minimum + Math.random() * spread;
}

function frame() {
  requestAnimationFrame(frame);
  const delta = Math.min(clock.getDelta(), 1 / 20);
  elapsed += delta;
  if (vrm) {
    vrm.update(delta);
    const gait = gaitProfile(motion.speed, motion.mode);
    const movingTarget = walking ? gait.weight : 0;
    walkWeight += (movingTarget - walkWeight) * (1 - Math.exp(-delta * 7.0));
    runWeight += (((motion.mode === "run" && walking) ? gait.weight : 0) - runWeight)
      * (1 - Math.exp(-delta * 6.5));
    gaitPhase += delta * gait.cadence * Math.max(walkWeight, 0.08);
    const cycle = Math.sin(gaitPhase);
    const oppositeCycle = Math.sin(gaitPhase + Math.PI);
    const doubleCycle = Math.sin(gaitPhase * 2);
    const turnTarget = THREE.MathUtils.clamp((Number(motion.turn) || 0) * 8, -0.18, 0.18);
    turnLean += (turnTarget - turnLean) * (1 - Math.exp(-delta * 8));
    const yawTarget = facingYawForDirection(motion.x, walking, bodyYaw);
    const yawSpring = springStep(bodyYaw, bodyYawVelocity, yawTarget, delta, 2.2, 0.9);
    bodyYaw = yawSpring.position;
    bodyYawVelocity = yawSpring.velocity;
    vrm.scene.position.y = Math.sin(elapsed * 1.4) * 0.012;
    vrm.scene.rotation.y = Math.PI + bodyYaw + Math.sin(elapsed * 0.45) * 0.018;
    for (const bone of Object.values(motionBones)) {
      bone.object.quaternion.copy(bone.base);
    }
    const addMotion = (name, x, y = 0, z = 0) => {
      const bone = motionBones[name];
      if (!bone) return;
      bone.object.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))
      );
    };
    if (walkWeight > 0.001) {
      const stride = gait.stride * walkWeight;
      const knee = gait.knee * walkWeight;
      const armSwing = gait.arm * walkWeight;
      const leftSwing = Math.max(0, cycle);
      const rightSwing = Math.max(0, oppositeCycle);
      const lift = Math.max(0, doubleCycle) * gait.bounce;
      const verticalIntent = THREE.MathUtils.clamp(Number(motion.y) || 0, -1, 1);
      const arrivalSettle = motion.braking ? 1 - gait.weight : 0;
      addMotion("leftUpperLeg", cycle * stride);
      addMotion("rightUpperLeg", -cycle * stride);
      addMotion("leftLowerLeg", rightSwing * knee);
      addMotion("rightLowerLeg", leftSwing * knee);
      // Counter-rotate the planted foot to reduce the skating look while the
      // desktop window moves; toes add a small push-off at the end of stance.
      addMotion("leftFoot", -cycle * stride * 0.42 - rightSwing * knee * 0.22);
      addMotion("rightFoot", cycle * stride * 0.42 - leftSwing * knee * 0.22);
      addMotion("leftToes", rightSwing * 0.10 * walkWeight);
      addMotion("rightToes", leftSwing * 0.10 * walkWeight);
      addMotion("leftUpperArm", -cycle * armSwing);
      addMotion("rightUpperArm", cycle * armSwing);
      addMotion(
        "hips",
        -0.025 * runWeight + verticalIntent * 0.016,
        turnLean * 0.25,
        cycle * 0.032 * walkWeight - turnLean
      );
      addMotion(
        "spine",
        0.04 * runWeight - arrivalSettle * 0.018,
        -turnLean * 0.35,
        -cycle * 0.017 * walkWeight + turnLean * 0.52
      );
      addMotion(
        "chest",
        0.03 * runWeight - arrivalSettle * 0.022,
        -cycle * 0.017 - turnLean * 0.25,
        -cycle * 0.015 * walkWeight + turnLean * 0.28
      );
      vrm.scene.position.y += lift;
    }
    const idleWeight = 1 - walkWeight;
    if (idleWeight > 0.001) {
      addMotion("chest", Math.sin(elapsed * 1.3) * 0.012 * idleWeight);
      addMotion("hips", 0, 0, Math.sin(elapsed * 0.55) * 0.012 * idleWeight);
      addMotion("head", pointer.y * 0.08, pointer.x * 0.14, 0);
      if (!action && proactivity !== "off" && elapsed >= nextIdleAction) {
        const options = proactivity === "social"
          ? ["look", "wave", "smile", "lean", "nod", "cheer"]
          : ["look", "wave", "smile", "lean", "nod"];
        triggerAction(options[Math.floor(Math.random() * options.length)]);
        scheduleNextIdleAction();
      }
    }

    let actionWeight = 0;
    if (action) {
      const progress = (elapsed - action.start) / (action.end - action.start);
      if (progress >= 1) {
        action = null;
        const queued = actionQueue.shift();
        if (queued) triggerAction(queued);
      } else {
        actionWeight = Math.sin(Math.PI * Math.max(0, progress));
        if (action.name === "wave") {
          addMotion("rightUpperArm", 0, 0, 0.95 * actionWeight);
          addMotion(
            "rightLowerArm",
            0,
            0,
            (0.72 + Math.sin(progress * Math.PI * 6) * 0.18) * actionWeight
          );
          addMotion("head", 0, -0.1 * actionWeight, -0.04 * actionWeight);
        } else if (action.name === "smile") {
          addMotion("head", 0.03 * actionWeight, 0, -0.045 * actionWeight);
          addMotion("chest", -0.025 * actionWeight, 0, 0);
        } else if (action.name === "look") {
          addMotion("head", -0.04 * actionWeight, Math.sin(progress * Math.PI * 2) * 0.38, 0);
          addMotion("chest", 0, Math.sin(progress * Math.PI * 2) * 0.08, 0);
        } else if (action.name === "nod") {
          const nod = Math.sin(progress * Math.PI * 4) * actionWeight;
          addMotion("head", nod * 0.16, 0, 0);
          addMotion("chest", nod * 0.025, 0, 0);
        } else if (action.name === "cheer") {
          const bounce = Math.max(0, Math.sin(progress * Math.PI * 5)) * actionWeight;
          addMotion("leftUpperArm", -0.2 * actionWeight, 0, -1.1 * actionWeight);
          addMotion("rightUpperArm", -0.2 * actionWeight, 0, 1.1 * actionWeight);
          addMotion("leftLowerArm", 0, 0, -0.2 * actionWeight);
          addMotion("rightLowerArm", 0, 0, 0.2 * actionWeight);
          addMotion("chest", -0.06 * actionWeight, 0, 0);
          vrm.scene.position.y += bounce * 0.035;
        } else if (action.name === "lean") {
          addMotion("hips", 0, 0, -0.06 * actionWeight);
          addMotion("spine", 0, 0, 0.12 * actionWeight);
          addMotion("head", 0, 0.12 * actionWeight, -0.08 * actionWeight);
        } else if (action.name === "edge") {
          addMotion("hips", 0, 0, 0.08 * actionWeight);
          addMotion("chest", -0.08 * actionWeight, 0, -0.13 * actionWeight);
          addMotion("leftUpperArm", 0, 0, -0.22 * actionWeight);
        } else if (action.name === "stretch") {
          addMotion("leftUpperArm", -0.08 * actionWeight, 0, -0.75 * actionWeight);
          addMotion("rightUpperArm", -0.08 * actionWeight, 0, 0.75 * actionWeight);
          addMotion("chest", -0.1 * actionWeight, 0, 0);
          addMotion("head", 0.06 * actionWeight, 0, 0);
        } else if (action.name === "dance") {
          const beat = Math.sin(progress * Math.PI * 8);
          addMotion("hips", 0, 0.16 * beat * actionWeight, 0.16 * beat * actionWeight);
          addMotion("chest", 0, -0.1 * beat * actionWeight, -0.08 * beat * actionWeight);
          addMotion("leftUpperArm", 0.12 * beat * actionWeight, 0, -0.45 * actionWeight);
          addMotion("rightUpperArm", -0.12 * beat * actionWeight, 0, 0.45 * actionWeight);
        }
      }
    }
    addMotion("head", 0, 0, Math.sin(elapsed * 0.7) * 0.018);

    for (const bone of softBones) {
      const target = (
        Math.sin(elapsed * 1.05 + bone.phase) * 0.35
        - bodyYawVelocity * 0.09
        - cycle * walkWeight * 0.18
        - turnLean * 0.55
      ) * bone.amount;
      const spring = springStep(bone.angle, bone.velocity, target, delta, 2.0, 0.78);
      bone.angle = THREE.MathUtils.clamp(spring.position, -bone.amount * 2, bone.amount * 2);
      bone.velocity = spring.velocity;
      bone.object.quaternion.copy(bone.base).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(bone.angle * 0.4, 0, bone.angle))
      );
    }
    if (blinkStart < 0 && elapsed >= nextBlink) blinkStart = elapsed;
    let blink = 0;
    if (blinkStart >= 0) {
      const blinkProgress = (elapsed - blinkStart) / 0.19;
      if (blinkProgress >= 1) {
        blinkStart = -1;
        nextBlink = elapsed + 2.6 + Math.random() * 4.6;
      } else {
        blink = Math.sin(Math.PI * Math.max(0, blinkProgress));
      }
    }
    vrm.expressionManager?.setValue("blink", blink);
    vrm.expressionManager?.setValue(
      "happy",
      action?.name === "smile" || action?.name === "cheer"
        ? Math.max(0.72, actionWeight)
        : (action?.name === "wave" || elapsed < reactionUntil
          ? Math.max(0.55, actionWeight)
          : 0)
    );
    vrm.expressionManager?.setValue(
      "aa",
      speaking ? 0.2 + Math.abs(Math.sin(elapsed * 11.5)) * 0.35 : 0
    );
  }
  if (twoDModel) {
    const gait = gaitProfile(motion.speed, motion.mode);
    const movingTarget = walking ? gait.weight : 0;
    walkWeight += (movingTarget - walkWeight) * (1 - Math.exp(-delta * 7.0));
    gaitPhase += delta * gait.cadence * Math.max(walkWeight, 0.08);
    const cycle = Math.sin(gaitPhase);
    const yawTarget = facingYawForDirection(motion.x, walking, bodyYaw);
    const yawSpring = springStep(bodyYaw, bodyYawVelocity, yawTarget, delta, 2.0, 0.9);
    bodyYaw = yawSpring.position;
    bodyYawVelocity = yawSpring.velocity;
    const actionPulse = action
      ? Math.sin(Math.PI * Math.max(0, Math.min(1, (elapsed - action.start) / (action.end - action.start))))
      : 0;
    if (action && elapsed >= action.end) {
      action = null;
      const queued = actionQueue.shift();
      if (queued) triggerAction(queued);
    }
    const speechPulse = speaking ? Math.abs(Math.sin(elapsed * 11.5)) * 0.055 : 0;
    const bounce = Math.sin(elapsed * 1.4) * 0.035
      + Math.max(0, Math.sin(gaitPhase * 2)) * gait.bounce * 1.8 * walkWeight
      + (action?.name === "cheer" || action?.name === "dance" ? actionPulse * 0.08 : 0);
    const tilt = cycle * 0.08 * walkWeight
      + pointer.x * 0.06
      + (action?.name === "lean" ? actionPulse * 0.18 : 0)
      + (action?.name === "dance" ? Math.sin(elapsed * 8) * 0.18 * actionPulse : 0);
    const wave = action?.name === "wave" ? Math.sin(elapsed * 16) * 0.035 * actionPulse : 0;
    twoDModel.group.position.set(0, bounce, 0);
    twoDModel.group.rotation.set(pointer.y * 0.03, bodyYaw * 0.18, tilt + wave);
    const scale = 1 + speechPulse + (action?.name === "smile" ? actionPulse * 0.035 : 0);
    twoDModel.group.scale.set(scale, scale, scale);
    const idleDue = !action && proactivity !== "off" && elapsed >= nextIdleAction;
    if (idleDue) {
      const options = proactivity === "social"
        ? ["look", "wave", "smile", "lean", "nod", "cheer"]
        : ["look", "wave", "smile", "lean", "nod"];
      triggerAction(options[Math.floor(Math.random() * options.length)]);
      scheduleNextIdleAction();
    }
  }
  if (live2DModel) {
    if (action && elapsed >= action.end) {
      action = null;
      const queued = actionQueue.shift();
      if (queued) triggerAction(queued);
    }
    const speechPulse = speaking ? Math.abs(Math.sin(elapsed * 11.5)) : 0;
    const centerX = live2DApp.renderer.width * 0.5;
    const centerY = live2DApp.renderer.height * 0.52;
    live2DModel.position.set(centerX, centerY);
    live2DModel.rotation = 0;
    live2DModel.scale.set(live2DBaseScale);
    const coreModel = live2DModel.internalModel?.coreModel;
    if (coreModel) {
      coreModel.setParameterValueById("ParamMouthOpenY", speaking ? 0.25 + speechPulse * 0.75 : 0);
    }
    const wantedExpression = action ? expressionForAction(action.name) : "";
    if (wantedExpression && live2DExpression !== wantedExpression) {
      live2DExpression = wantedExpression;
      live2DModel.expression(wantedExpression).catch(() => {});
    } else if (!wantedExpression && live2DExpression) {
      live2DExpression = "";
      live2DModel.internalModel?.motionManager?.expressionManager?.resetExpression?.();
    }
    const idleDue = !action && proactivity !== "off" && elapsed >= nextIdleAction;
    if (idleDue) {
      const options = live2DIdleActions();
      if (options.length) {
        const outfitAction = options.includes("outfit") && Math.random() < 0.25;
        triggerAction(outfitAction ? "outfit" : options[Math.floor(Math.random() * options.length)]);
      }
      scheduleNextIdleAction();
    }
  }
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    fitCamera();
  }
  if (
    live2DModel
    && (live2DCanvas.clientWidth !== live2DSize.width
      || live2DCanvas.clientHeight !== live2DSize.height)
  ) {
    fitLive2DModel();
  }
  renderer.render(scene, camera);
}
frame();
loadSelectedModel().catch(error => {
  document.querySelector("#mood").textContent = `Model setup error: ${error.message}`;
});

canvas.onclick = () => {
  bond += 1;
  localStorage.setItem("blueBond", String(bond));
  document.querySelector("#mood").textContent = `Bond ${bond} - Blue noticed you`;
  reactionUntil = elapsed + 1.8;
  triggerAction("wave", 2.6);
};
canvas.onmousemove = event => {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
  pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
};
document.body.onmouseenter = () => window.bluePet.setHover(true);
document.body.onmouseleave = () => window.bluePet.setHover(false);
document.querySelector("#control").onclick = window.bluePet.showControl;
document.querySelector("#wander").onclick = window.bluePet.toggleWander;
window.bluePet.onWanderState(value => {
  wandering = value;
  if (!wandering) walking = false;
  document.querySelector("#wander").textContent = wandering ? "Pause" : "Roam";
});
window.bluePet.onWalking(value => {
  walking = value;
  document.querySelector("#mood").textContent =
    `Bond ${bond} - ${movementLabel(motion, walking)}`;
});
window.bluePet.onEdge(() => triggerAction("edge", 1.2));
window.bluePet.onMotion(value => {
  if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
    motion = value;
    if (walking) {
      document.querySelector("#mood").textContent =
        `Bond ${bond} - ${movementLabel(motion, walking)}`;
    }
  }
});
window.bluePet.onAction(name => triggerAction(name));
window.bluePet.onSpeaking(value => { speaking = value; });
window.bluePet.onModelChanged(model => {
  loadSelectedModel(model).catch(error => {
    document.querySelector("#mood").textContent = `Model switch error: ${error.message}`;
  });
});
window.bluePet.onBubble(value => {
  if (typeof value === "string") showBubble(value);
  else showBubble(value?.message, value?.durationMs);
});
window.bluePet.onPresence(value => {
  if (!value || typeof value !== "object") return;
  if (["off", "quiet", "balanced", "social"].includes(value.proactivity)) {
    const changed = proactivity !== value.proactivity;
    proactivity = value.proactivity;
    if (changed) scheduleNextIdleAction();
  }
  const state = String(value.state || "idle");
  const label = state === "idle" ? "resting" : state;
  document.querySelector("#mood").textContent = `Bond ${bond} - ${label}`;
});
