import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const canvas = document.querySelector("#body");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x355080, 2.5));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1, 2, 3); scene.add(key);
let vrm;
let reactionUntil = 0;
let modelBounds;
let bond = Number(localStorage.getItem("blueBond") || 0);
document.querySelector("#mood").textContent = `Bond ${bond} · click Blue to interact`;

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));
loader.load("../assets/blue_identity.vrm", gltf => {
  vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI;
  for (const hiddenLayer of ["Acc", "gown", "panty", "socks short"]) {
    const object = vrm.scene.getObjectByName(hiddenLayer);
    if (object) object.visible = false;
  }
  const rotation = (x, y, z) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
  vrm.humanoid?.setNormalizedPose({
    spine: { rotation: rotation(0.03, 0, 0) },
    chest: { rotation: rotation(-0.025, 0, 0) },
    leftUpperArm: { rotation: rotation(0.04, 0.04, -1.25) },
    rightUpperArm: { rotation: rotation(0.04, -0.04, 1.25) },
    leftLowerArm: { rotation: rotation(0, 0.08, -0.12) },
    rightLowerArm: { rotation: rotation(0, -0.08, 0.12) },
    leftUpperLeg: { rotation: rotation(0, 0, 0.035) },
    rightUpperLeg: { rotation: rotation(0, 0, -0.035) }
  });
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.reset();
  vrm.scene.updateMatrixWorld(true);
  modelBounds = new THREE.Box3().setFromObject(vrm.scene);
  fitCamera();
}, undefined, error => append("blue", `My 3D body could not load: ${error.message}`));

function fitCamera() {
  if (!modelBounds) return;
  const center = modelBounds.getCenter(new THREE.Vector3());
  const size = modelBounds.getSize(new THREE.Vector3());
  const aspect = Math.max(canvas.clientWidth / canvas.clientHeight, 0.1);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const verticalDistance = size.y * 0.5 / Math.tan(halfFov);
  const horizontalDistance = size.x * 0.5 / (Math.tan(halfFov) * aspect);
  const distance = Math.max(verticalDistance, horizontalDistance) * 1.12;
  camera.aspect = aspect;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const elapsed = clock.getElapsedTime();
  if (vrm) {
    vrm.update(clock.getDelta());
    vrm.scene.position.y = Math.sin(elapsed * 1.4) * 0.015;
    vrm.scene.rotation.y = Math.PI + Math.sin(elapsed * 0.45) * 0.05;
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      head.rotation.z = Math.sin(elapsed * 0.7) * 0.025;
      if (elapsed < reactionUntil) head.rotation.y = Math.sin(elapsed * 9) * 0.12;
    }
    const blink = (elapsed % 5.2) > 5.05 ? 1 : 0;
    vrm.expressionManager?.setValue("blink", blink);
    vrm.expressionManager?.setValue("happy", elapsed < reactionUntil ? 0.75 : 0);
  }
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    fitCamera();
  }
  renderer.render(scene, camera);
}
frame();

const chat = document.querySelector("#chat");
const prompt = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
function append(who, text) {
  const p = document.createElement("p");
  const b = document.createElement("b"); b.textContent = `${who}> `;
  p.append(b, document.createTextNode(text)); messages.append(p);
  messages.scrollTop = messages.scrollHeight;
}
async function send() {
  const text = prompt.value.trim(); if (!text) return;
  prompt.value = ""; append("you", text);
  try { append("blue", await window.bluePet.chat(text)); }
  catch (error) { append("blue", `I couldn’t answer: ${error.message}`); }
}
document.querySelector("#talkButton").onclick = () => { chat.hidden = !chat.hidden; prompt.focus(); };
canvas.onclick = () => {
  bond += 1;
  localStorage.setItem("blueBond", String(bond));
  document.querySelector("#mood").textContent = `Bond ${bond} · Blue noticed you`;
  reactionUntil = clock.getElapsedTime() + 1.8;
  if (bond === 1 || bond % 10 === 0) append("blue", "Hi! I felt that.");
};
document.querySelector("#send").onclick = send;
prompt.onkeydown = event => { if (event.key === "Enter") send(); };
async function shared(action) {
  try { append("blue", await action()); }
  catch (error) { append("blue", `I couldn't share that: ${error.message}`); }
}
document.querySelector("#files").onclick = () => shared(window.bluePet.shareFiles);
document.querySelector("#images").onclick = () => shared(window.bluePet.shareImages);
document.querySelector("#folder").onclick = () => shared(window.bluePet.shareFolder);
document.querySelector("#link").onclick = () => {
  const value = window.prompt("Paste a complete http:// or https:// link:");
  if (value) shared(() => window.bluePet.shareLink(value));
};
document.querySelector("#minimize").onclick = () => window.bluePet.minimize();
document.querySelector("#close").onclick = () => window.bluePet.close();
window.bluePet.ensureSession().catch(error => append("blue", error.message));
