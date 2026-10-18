// 声道实验台 · 三维实时频谱（Three.js）
// 由真实音频 AnalyserNode 驱动；F1/F2/F3 发光竖线随共振峰实时移动。
(function () {
const canvas = document.getElementById('spectrum3d');
const wrap = document.getElementById('spectrum3dWrap');
if (!canvas || !wrap) return;
if (typeof THREE === 'undefined') { wrap.classList.add('gl-failed'); return; }

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  wrap.classList.add('gl-failed');
  return;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
camera.position.set(0, 4.2, 12.2);
camera.lookAt(0, 1.5, 0);

const MIN_HZ = 100, MAX_HZ = 5000, BAR_COUNT = 64, SPAN = 16.2;
const MAX_BAR_H = 4.6, BASE_Y = -0.45;

const hzToT = hz => (Math.log(hz) - Math.log(MIN_HZ)) / (Math.log(MAX_HZ) - Math.log(MIN_HZ));
const tToX = t => (t - 0.5) * SPAN;
const hzToX = hz => tToX(hzToT(Math.max(MIN_HZ, Math.min(MAX_HZ, hz))));

const C_MINT = new THREE.Color(0x168fa4), C_YELLOW = new THREE.Color(0xe28b77), C_BLUE = new THREE.Color(0x6598c5);
function barColor(t) {
  const c = new THREE.Color();
  if (t < 0.5) c.copy(C_MINT).lerp(C_YELLOW, t / 0.5);
  else c.copy(C_YELLOW).lerp(C_BLUE, (t - 0.5) / 0.5);
  return c;
}

// 灯光
scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb8c9, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(-4, 9, 7);
scene.add(key);
const rim = new THREE.DirectionalLight(0xb8dfec, 0.4);
rim.position.set(5, 3, -6);
scene.add(rim);

// 地面与网格
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(SPAN + 2, 7),
  new THREE.MeshStandardMaterial({ color: 0xdcecf4, roughness: 0.92, metalness: 0.02, transparent: true, opacity: 0.94 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, BASE_Y, 0);
scene.add(ground);
const grid = new THREE.GridHelper(SPAN, 32, 0x95b8c8, 0xc5dce6);
grid.position.y = BASE_Y + 0.006;
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

// 频谱柱（对数刻度，低频在左、高频在右）
const spacing = SPAN / BAR_COUNT;
const barGeo = new THREE.BoxGeometry(spacing * 0.62, 1, spacing * 0.62);
const bars = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const t = i / (BAR_COUNT - 1), color = barColor(t);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.06, roughness: 0.55, metalness: 0.06, transparent: true
  });
  const bar = new THREE.Mesh(barGeo, mat);
  bar.position.x = tToX(t);
  bar.position.y = BASE_Y;
  bar.scale.y = 0.001;
  scene.add(bar);
  bars.push({ mesh: bar, mat, current: 0.38 });
}

// 共振峰标记线（F1 薄荷 / F2 暖黄 / F3 蓝）
function makeFormantMarker(hex) {
  const group = new THREE.Group();
  const h = MAX_BAR_H + 0.55;
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, h, 0.1),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.08, depthWrite: false })
  );
  glow.position.y = BASE_Y + h / 2;
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, h, 0.035),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.65, depthWrite: false })
  );
  core.position.y = BASE_Y + h / 2;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 18), new THREE.MeshBasicMaterial({ color: hex }));
  tip.position.y = BASE_Y + h + 0.06;
  group.add(glow, core, tip);
  group.visible = false;
  scene.add(group);
  return { group, glow, core, tip };
}
const markers = [makeFormantMarker(0x168fa4), makeFormantMarker(0xe28b77), makeFormantMarker(0x6598c5)];

// 空气粒子（发声时随音量上扬）
const PARTICLES = 90;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PARTICLES * 3), pSeed = new Float32Array(PARTICLES);
for (let i = 0; i < PARTICLES; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * SPAN;
  pPos[i * 3 + 1] = Math.random() * (MAX_BAR_H + 0.4);
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 4;
  pSeed[i] = Math.random();
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0x4f9fb3, size: 0.045, transparent: true, opacity: 0.06, depthWrite: false });
const points = new THREE.Points(pGeo, pMat);
scene.add(points);

let freqData = null;
function getFreq() {
  const lab = window.__vocalLab;
  const a = lab && lab.audio;
  if (a && a.analyser && a.ctx && a.ctx.state !== 'closed') {
    if (!freqData || freqData.length !== a.analyser.frequencyBinCount) freqData = new Uint8Array(a.analyser.frequencyBinCount);
    a.analyser.getByteFrequencyData(freqData);
    return { data: freqData, sampleRate: a.ctx.sampleRate, phonating: !!(lab.state && lab.state.isPhonating) };
  }
  return null;
}
function sampleBins(data, sampleRate) {
  const nyquist = sampleRate / 2, binCount = data.length, out = new Array(BAR_COUNT);
  for (let i = 0; i < BAR_COUNT; i++) {
    const t = i / (BAR_COUNT - 1), hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
    const bin = Math.max(0, Math.min(binCount - 1, Math.floor(hz / nyquist * binCount)));
    let v = data[bin], w = 1;
    if (bin + 1 < binCount) { v += data[bin + 1]; w++; }
    if (bin - 1 >= 0) { v += data[bin - 1]; w++; }
    out[i] = v / (w * 255);
  }
  return out;
}

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);
resize();

let running = true, rafId = 0, last = performance.now(), level = 0;
function loop(now) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  const info = getFreq();
  const bins = info ? sampleBins(info.data, info.sampleRate) : null;
  let targetLevel = 0;
  if (bins) { for (let i = 0; i < bins.length; i++) targetLevel += bins[i]; targetLevel /= bins.length; }
  level += (targetLevel - level) * 0.12;

  const idle = !info || (!info.phonating && level < 0.02);
  for (let i = 0; i < BAR_COUNT; i++) {
    const b = bars[i];
    let target;
    if (idle) {
      target = 0.22 + 0.32 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 0.33));
    } else {
      target = 0.04 + bins[i] * MAX_BAR_H;
    }
    b.current += (target - b.current) * (target > b.current ? 0.34 : 0.14);
    const h = Math.max(0.001, b.current);
    b.mesh.scale.y = h;
    b.mesh.position.y = BASE_Y + h / 2;
    if (idle) {
      b.mat.emissiveIntensity = 0.05;
      b.mat.opacity = 0.82;
    } else {
      b.mat.emissiveIntensity = 0.04 + Math.min(1, bins[i]) * 0.08;
      b.mat.opacity = 0.6 + Math.min(0.4, bins[i] * 1.1);
    }
  }

  // 共振峰标记跟随 F1/F2/F3
  const lab = window.__vocalLab;
  if (lab && lab.acousticValues) {
    try {
      const a = lab.acousticValues();
      [a.f1, a.f2, a.f3].forEach((hz, i) => {
        const m = markers[i];
        m.group.position.x = hzToX(hz);
        m.group.visible = true;
        m.tip.scale.setScalar(0.85 + 0.2 * Math.sin(time * 2.2 + i * 1.2));
        m.core.material.opacity = 0.5 + 0.35 * level;
        m.glow.material.opacity = 0.06 + 0.08 * level;
      });
    } catch (e) { /* 模型未就绪时忽略 */ }
  }

  // 粒子随音量上浮
  pMat.opacity = 0.05 + level * 0.12;
  const arr = pGeo.attributes.position.array;
  for (let i = 0; i < PARTICLES; i++) {
    arr[i * 3 + 1] += dt * (0.06 + level * 0.65) * (0.6 + pSeed[i]);
    arr[i * 3] += Math.sin(time * 0.6 + i) * 0.0016;
    if (arr[i * 3 + 1] > MAX_BAR_H + 0.5) {
      arr[i * 3 + 1] = BASE_Y;
      arr[i * 3] = (Math.random() - 0.5) * SPAN;
    }
  }
  pGeo.attributes.position.needsUpdate = true;

  // 相机极轻微呼吸
  camera.position.x = Math.sin(time * 0.25) * 0.18;
  camera.position.y = 4.2 + Math.sin(time * 0.35) * 0.08 + level * 0.28;
  camera.lookAt(0, 1.5, 0);

  renderer.render(scene, camera);
}
rafId = requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    running = false;
    cancelAnimationFrame(rafId);
  } else if (!document.hidden && !running) {
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
});
})();
