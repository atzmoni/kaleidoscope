// ---------------------------------------------------------------- 11 · selfie show (face-triggered installation)
// An unattended show for the exhibit: a webcam (USB or built-in) watches the space in front of the box. When a face comes
// close enough and stays for a moment, the page counts down, takes a selfie, and plays it through the mirrors with a
// sequence of effects (pull, flow, swirl, ripple, melt, mirror shards, hologram) before it dissolves into particles.
// Everything runs in the browser: face detection is MediaPipe (served from vendor/mediapipe), with the browser's own
// FaceDetector or plain motion detection as fallbacks. No picture leaves the computer.
const selfV = document.createElement("video"); selfV.playsInline = true; selfV.muted = true; selfV.setAttribute("playsinline", "");
selfV.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none"; document.body.appendChild(selfV);
const SFX_LIST = [["pull", "משיכה לסלפי"], ["flow", "זרימה"], ["swirl", "מערבולת"], ["ripple", "אדוות"], ["melt", "נמס"], ["shatter", "שברי מראה"], ["holo", "הולוגרמה"]];
const SFX_W = {
  pull: { pull: 1, ppull: 1, colorize: .5 }, flow: { flow: 1, colorize: .9 }, swirl: { twirl: 1, colorize: .3 }, ripple: { ripple: 1 },
  melt: { melt: 1, colorize: .4 }, shatter: { shatter: 1 }, holo: { holo: 1, flow: .25 }
};
const SH = {
  armed: false, stream: null, devices: [], det: null, detKind: "", detBusy: false, detLast: 0, loading: null,
  face: null, faceT: 0, size: 0, near: 0, absent: 0, state: "off", t0: 0, approach: 0,
  w: { pull: 0, twirl: 0, flow: 0, ripple: 0, melt: 0, shatter: 0, holo: 0, ppull: 0, colorize: 0, fade: 0 },
  scenes: [], scene: -1, shot: null, pix: null, live: false, count: 0, saved: null, gallery: [], ghostI: 0, ghostT: 0,
  flash: 0, wake: null, retry: 0, motion: null, fcx: SRC / 2, fcy: SRC / 2, label: ""
};
// crop canvas: the face, centred, mirrored like a mirror if asked; 512 px square
const selfC = document.createElement("canvas"); selfC.width = selfC.height = 512; const selfX = selfC.getContext("2d");
const pixC = document.createElement("canvas"); pixC.width = pixC.height = 64; const pixX = pixC.getContext("2d", { willReadFrequently: true });
function selfCrop(dst, face) {
  const vw = selfV.videoWidth, vh = selfV.videoHeight; if (!vw || !vh) return false;
  const f = face || { x: .3, y: .2, w: .4, h: .5 };
  const side = clamp(f.w * vw / .42, Math.min(vw, vh) * .25, Math.max(vw, vh) * 1.4);
  const cx = (f.x + f.w / 2) * vw, cy = (f.y + f.h / 2) * vh - f.h * vh * .04;
  const c = dst.getContext("2d"), S2 = dst.width; c.save(); c.fillStyle = "#000"; c.fillRect(0, 0, S2, S2);
  if (P.selfMirror) { c.translate(S2, 0); c.scale(-1, 1); }
  c.drawImage(selfV, cx - side / 2, cy - side / 2, side, side, 0, 0, S2, S2); c.restore(); return true;
}
// ---- the effect renderer: its own small WebGL canvas with a feedback buffer, composited into the source cell
const SFX = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 512;
  const g = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!g) return null;
  const FX = `precision highp float;
uniform sampler2D uImg, uPrev; uniform vec2 uC;
uniform float uT, uPull, uTwirl, uFlow, uRipple, uMelt, uShatter, uHolo, uFade, uKick, uBass;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
vec2 curl(vec2 p){ const float e = .07; float a = noise(p + vec2(0., e)), b = noise(p - vec2(0., e)), c = noise(p + vec2(e, 0.)), d = noise(p - vec2(e, 0.)); return vec2(a - b, d - c) / (2. * e); }
vec3 holo(float l, float t){ return .5 + .5 * cos(6.2831853 * (l * 1.4 + t * .05 + vec3(0., .33, .67))); }
void main(){
  vec2 uv = gl_FragCoord.xy / 512.;
  vec2 d = uv - uC; float r = length(d);
  // pull: the room around the face is sucked into it, spiralling
  float suck = uPull * (.55 + .45 * sin(uT * 1.1));
  vec2 q = d * (1. + suck * 1.1 * smoothstep(.7, 0., r));
  float a = uPull * 2.4 * exp(-r * 4.) * sin(uT * .6 + 1.) + uTwirl * 3.4 * pow(max(0., 1. - r / .62), 2.) * sin(uT * .45);
  float ca = cos(a), sa = sin(a); q = mat2(ca, -sa, sa, ca) * q;
  q += d / (r + 1e-4) * sin(r * 48. - uT * 5.) * .011 * uRipple * (1. + 2.5 * uBass);
  vec2 s = uC + q;
  if (uShatter > .001){
    vec2 g = s * 6.; vec2 sk = vec2(g.x - g.y * .57735, g.y * 1.1547); vec2 id = floor(sk); float up = step(1., fract(sk.x) + fract(sk.y));
    vec2 cid = id * 2. + up; vec2 o = vec2(hash(cid), hash(cid + 7.)) - .5; float ph = sin(uT * .8 + hash(cid + 3.) * 6.2831853);
    s += o * .1 * uShatter * (.3 + .7 * ph * ph + uKick * .6);
  }
  vec2 fl = curl(s * 3.2 + vec2(uT * .11, -uT * .07));
  s += fl * .02 * uFlow;
  s.y += uMelt * .07 * noise(vec2(s.x * 16., uT * .2)) * (.6 + .4 * sin(uT * .5));
  float inb = step(0., s.x) * step(s.x, 1.) * step(0., s.y) * step(s.y, 1.);
  vec3 col = texture2D(uImg, s).rgb;
  float m = smoothstep(.5, .34, length(s - uC)) * inb;
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(col, holo(l, uT) * (.15 + l * 1.05), uHolo * .7);
  col *= 1. + .25 * uKick;
  float ka = m * uFade * (1. - .4 * max(uFlow, uMelt));
  vec4 fresh = vec4(col * ka, ka);
  // feedback: the last frame drifts along the flow and drips down, so the face leaves trails
  vec2 pa = uv - fl * .0045 * uFlow + vec2(0., .006 * uMelt * (.4 + noise(vec2(uv.x * 22., 3.))));
  float keep = clamp(max(uFlow * .9, uMelt * .93), 0., .95);
  vec4 pv = texture2D(uPrev, pa) * keep * .985;
  gl_FragColor = clamp(fresh + pv * (1. - fresh.a), 0., 1.);
}`;
  const CP = `precision mediump float; uniform sampler2D uPrev; void main(){ gl_FragColor = texture2D(uPrev, gl_FragCoord.xy / 512.); }`;
  const V = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
  const mk = (fs) => { const p = g.createProgram(); for (const [t, s] of [[g.VERTEX_SHADER, V], [g.FRAGMENT_SHADER, fs]]) { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) console.error(g.getShaderInfoLog(o)); g.attachShader(p, o); } g.linkProgram(p); return p; };
  const pf = mk(FX), pc = mk(CP);
  const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  const texOf = () => { const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v); return t; };
  const img = texOf(), fb = [0, 1].map(() => { const t = texOf(); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 512, 512, 0, g.RGBA, g.UNSIGNED_BYTE, null); const f = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, f); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0); return { t, f }; });
  g.bindFramebuffer(g.FRAMEBUFFER, null);
  const U = {}; ["uImg", "uPrev", "uC", "uT", "uPull", "uTwirl", "uFlow", "uRipple", "uMelt", "uShatter", "uHolo", "uFade", "uKick", "uBass"].forEach(n => U[n] = g.getUniformLocation(pf, n));
  const Uc = g.getUniformLocation(pc, "uPrev");
  let cur = 0;
  const bindA = (p) => { g.useProgram(p); const l = g.getAttribLocation(p, "a"); g.bindBuffer(g.ARRAY_BUFFER, buf); g.enableVertexAttribArray(l); g.vertexAttribPointer(l, 2, g.FLOAT, false, 0, 0); };
  return {
    cv,
    image(src) { g.bindTexture(g.TEXTURE_2D, img); g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src); },
    clear() { for (const b of fb) { g.bindFramebuffer(g.FRAMEBUFFER, b.f); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); } g.bindFramebuffer(g.FRAMEBUFFER, null); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); },
    draw(t, w) {
      const nx = 1 - cur; g.viewport(0, 0, 512, 512);
      bindA(pf); g.bindFramebuffer(g.FRAMEBUFFER, fb[nx].f);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, img); g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, fb[cur].t);
      g.uniform1i(U.uImg, 0); g.uniform1i(U.uPrev, 1); g.uniform2f(U.uC, .5, .5); g.uniform1f(U.uT, t);
      g.uniform1f(U.uPull, w.pull); g.uniform1f(U.uTwirl, w.twirl); g.uniform1f(U.uFlow, w.flow); g.uniform1f(U.uRipple, w.ripple); g.uniform1f(U.uMelt, w.melt);
      g.uniform1f(U.uShatter, w.shatter); g.uniform1f(U.uHolo, w.holo); g.uniform1f(U.uFade, w.fade); g.uniform1f(U.uKick, A.kick); g.uniform1f(U.uBass, A.bass);
      g.drawArrays(g.TRIANGLES, 0, 3);
      bindA(pc); g.bindFramebuffer(g.FRAMEBUFFER, null); g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, fb[nx].t); g.uniform1i(Uc, 1);
      g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLES, 0, 3); g.activeTexture(g.TEXTURE0);
      cur = nx;
    }
  };
})();
// ---- camera
async function selfDevices() {
  try { const all = await navigator.mediaDevices.enumerateDevices(); SH.devices = all.filter(d => d.kind === "videoinput"); } catch (e) { SH.devices = []; }
  if (tab === "selfie") selfDevSelect();
}
function selfDevSelect() {
  const s = $("#selfDev"); if (!s) return;
  const cur = store.get("selfDev", "");
  s.innerHTML = `<option value="">ברירת מחדל (מצלמת המחשב)</option>` + SH.devices.map((d, i) => `<option value="${d.deviceId}"${d.deviceId === cur ? " selected" : ""}>${(d.label || "מצלמה " + (i + 1)).replace(/</g, "&lt;")}${/usb|logi|c9[0-9]{2}|brio|webcam|elgato|razer/i.test(d.label) ? " · USB" : ""}</option>`).join("");
}
async function selfCamStart() {
  if (!navigator.mediaDevices?.getUserMedia) { toast("המצלמה זמינה רק בכתובת https או בשרת המקומי"); return false; }
  selfCamStop();
  const id = store.get("selfDev", ""), base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  let st = null;
  try { st = await navigator.mediaDevices.getUserMedia({ video: id ? { ...base, deviceId: { exact: id } } : { ...base, facingMode: "user" }, audio: false }); }
  catch (e) { if (id) { try { st = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); toast("המצלמה שנבחרה לא נמצאה. עובר למצלמת ברירת המחדל."); } catch (e2) {} } }
  if (!st) { toast("אין גישה למצלמה. אשרו גישה בדפדפן."); return false; }
  SH.stream = st; selfV.srcObject = st; try { await selfV.play(); } catch (e) {}
  const tr = st.getVideoTracks()[0]; SH.label = tr ? tr.label : "";
  if (tr) tr.onended = () => { SH.stream = null; if (SH.armed) SH.retry = performance.now() / 1000 + 3; };
  selfDevices(); return true;
}
function selfCamStop() { if (SH.stream) SH.stream.getTracks().forEach(t => t.stop()); SH.stream = null; }
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", () => { selfDevices(); if (SH.armed && !SH.stream) SH.retry = performance.now() / 1000 + 1; });
// ---- face detection: MediaPipe → browser FaceDetector → motion
async function selfLoadDetector() {
  if (SH.det) return SH.det; if (SH.loading) return SH.loading;
  SH.loading = (async () => {
    const local = new URL("vendor/mediapipe/", location.href).href, cdn = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/";
    const model = { [local]: local + "blaze_face_short_range.tflite", [cdn]: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" };
    for (const b of [local, cdn]) {
      try {
        const mp = await import(b + "vision_bundle.mjs"), fs = await mp.FilesetResolver.forVisionTasks(b + "wasm");
        for (const delegate of ["GPU", "CPU"]) {
          try { const d = await mp.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: model[b], delegate }, runningMode: "VIDEO", minDetectionConfidence: .55 }); SH.detKind = "mediapipe"; return SH.det = d; } catch (e) { console.warn("face detector", delegate, e); }
        }
      } catch (e) { console.warn("mediapipe from", b, e); }
    }
    if ("FaceDetector" in window) { try { const d = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 }); SH.detKind = "native"; return SH.det = d; } catch (e) {} }
    SH.detKind = "motion"; return SH.det = "motion";
  })();
  const d = await SH.loading; SH.loading = null; if (tab === "selfie") selfStatus(); return d;
}
const motC = document.createElement("canvas"); motC.width = 64; motC.height = 48; const motX = motC.getContext("2d", { willReadFrequently: true });
function selfMotion() {
  // fallback without a face model: a big change in the middle of the picture counts as someone close
  motX.drawImage(selfV, 0, 0, 64, 48); const d = motX.getImageData(0, 0, 64, 48).data, g = new Float32Array(64 * 48);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
  const prev = SH.motion; SH.motion = g; if (!prev) return null;
  let n = 0, sx2 = 0, sy2 = 0, x0 = 64, x1 = 0, y0 = 48, y1 = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const i = y * 64 + x; if (Math.abs(g[i] - prev[i]) > 22) { n++; sx2 += x; sy2 += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  if (n < 64 * 48 * .06) return SH.face && performance.now() / 1000 - SH.faceT < 1.5 ? SH.face : null;
  const cx = sx2 / n / 64, cy = sy2 / n / 48, w = clamp((x1 - x0) / 64 * .5, .15, .6);
  return { x: cx - w / 2, y: clamp(cy - .2, 0, 1) - w * .6, w, h: w * 1.25, motion: true };
}
async function selfDetect(now) {
  if (SH.detBusy || !SH.det || selfV.readyState < 2 || now - SH.detLast < .1) return;
  SH.detBusy = true; SH.detLast = now;
  try {
    const vw = selfV.videoWidth, vh = selfV.videoHeight; let best = null;
    if (SH.detKind === "mediapipe") {
      const r = SH.det.detectForVideo(selfV, performance.now());
      for (const d of r.detections || []) { const b = d.boundingBox; const f = { x: b.originX / vw, y: b.originY / vh, w: b.width / vw, h: b.height / vh }; if (!best || f.w > best.w) best = f; }
    } else if (SH.detKind === "native") {
      const r = await SH.det.detect(selfV);
      for (const d of r) { const b = d.boundingBox; const f = { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh }; if (!best || f.w > best.w) best = f; }
    } else best = selfMotion();
    if (best) { SH.face = SH.face && !best.motion ? { x: SH.face.x + (best.x - SH.face.x) * .6, y: SH.face.y + (best.y - SH.face.y) * .6, w: SH.face.w + (best.w - SH.face.w) * .6, h: SH.face.h + (best.h - SH.face.h) * .6 } : best; SH.faceT = now; }
  } catch (e) { console.warn(e); }
  SH.detBusy = false;
}
// ---- arming, kiosk, wake lock
async function selfArm(on) {
  if (!on) { SH.armed = false; SH.state = "off"; selfCamStop(); SH.w.fade = 0; SH.live = false; if (SH.saved) selfRestore(); try { SH.wake && SH.wake.release(); } catch (e) {} SH.wake = null; render(); return; }
  if (!SFX) { toast("הדפדפן לא תומך ב-WebGL למופע הסלפי"); return; }
  if (!await selfCamStart()) { render(); return; }
  SH.armed = true; SH.state = "watch"; SH.t0 = performance.now() / 1000; SH.near = 0; SFX.clear(); render();
  try { if (navigator.wakeLock) SH.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  toast(SH.det ? "המופע פעיל. מחכה למישהו שיתקרב." : "טוען את זיהוי הפנים…");
  await selfLoadDetector();
  if (SH.detKind === "motion") toast("זיהוי הפנים לא נטען. עובד לפי תנועה מול המצלמה.", 4500);
}
document.addEventListener("visibilitychange", async () => { if (SH.armed && document.visibilityState === "visible") { try { if (navigator.wakeLock) SH.wake = await navigator.wakeLock.request("screen"); } catch (e) {} } });
function selfKiosk() {
  document.body.classList.add("show", "selfrun"); resize();
  const el = document.documentElement; try { (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.catch?.(() => {}); } catch (e) {}
}
// ---- the show
function selfBuild() {
  let fx = SFX_LIST.map(f => f[0]).filter(k => P["fx_" + k]); if (!fx.length) fx = ["flow"];
  if (P.selfShuffle) fx.sort(() => Math.random() - .5);
  const mid = Math.max(3, (P.selfLen - 9) / fx.length), sc2 = [{ k: "reveal", d: 4, w: { colorize: .2 } }];
  for (const k of fx) sc2.push({ k, d: mid, w: SFX_W[k] });
  sc2.push({ k: "dust", d: 5, w: { flow: .6, colorize: 1 } });
  return sc2;
}
function selfCapture(now) {
  if (selfV.readyState < 2) return;
  const shot = document.createElement("canvas"); shot.width = shot.height = 512; selfCrop(shot, SH.face);
  SH.shot = shot; pixX.drawImage(shot, 0, 0, 64, 64); SH.pix = pixX.getImageData(0, 0, 64, 64).data;
  if (P.selfKeep) { SH.gallery.unshift(shot); SH.gallery.length = Math.min(SH.gallery.length, 8); }
  SH.count++; store.set("selfCount", (store.get("selfCount", 0) | 0) + 1);
  SFX.clear(); SFX.image(shot); SH.live = false; SH.w.fade = 0;
  SH.scenes = selfBuild(); SH.scene = 0; SH.state = "show"; SH.t0 = now; SH.flash = 1; flashV = 1.4; burst(2);
  if (P.selfPreset && P.selfPreset !== "keep") { const pr = PRESETS.find(p => p.id === P.selfPreset); if (pr) { SH.saved = { ...P }; applyPreset(pr, true); } }
}
function selfRestore() { const s = SH.saved; SH.saved = null; if (!s) return; const keepSelf = {}; for (const k in P) if (/^(self|fx_)/.test(k)) keepSelf[k] = P[k]; Object.assign(P, s, keepSelf); save(); resetParticles(); if (!document.body.classList.contains("show")) render(); }
function selfTick(now, dt) {
  if (RENDER || !SFX) return;
  SH.flash *= Math.pow(.02, dt);
  if (SH.armed) {
    if (!SH.stream && SH.retry && now > SH.retry) { SH.retry = now + 5; selfCamStart(); }
    if (SH.stream) selfDetect(now);
  }
  const seen = SH.face && now - SH.faceT < .5, size = seen ? SH.face.w : 0; SH.size = size;
  const close = seen && size >= P.selfNear;
  SH.absent = seen && size > P.selfNear * .6 ? 0 : SH.absent + dt;
  const tw = { pull: 0, twirl: 0, flow: 0, ripple: 0, melt: 0, shatter: 0, holo: 0, ppull: 0, colorize: 0, fade: 0 };
  const el = now - SH.t0;
  if (SH.state === "watch") {
    SH.near = close ? SH.near + dt : Math.max(0, SH.near - dt * 2);
    SH.approach += ((seen ? clamp(size / P.selfNear, 0, 1) : 0) - SH.approach) * Math.min(1, dt * 3);
    if (P.selfLive > 0 && SH.approach > .05) { SH.live = true; tw.fade = P.selfLive * SH.approach * SH.approach; tw.flow = .15; }
    else if (P.selfKeep && SH.gallery.length && SH.absent > 8) {
      // nobody around: earlier visitors drift by as soft ghosts
      if (now - SH.ghostT > 7) { SH.ghostT = now; SH.ghostI = (SH.ghostI + 1) % SH.gallery.length; SFX.image(SH.gallery[SH.ghostI]); SH.live = false; }
      const ph = (now - SH.ghostT) / 7; tw.fade = .35 * Math.sin(ph * Math.PI); tw.flow = .7; tw.holo = .5;
    }
    if (SH.near >= P.selfHold && el > 1) { SH.state = P.selfCountdown > 0 ? "count" : "snap"; SH.t0 = now; }
  } else if (SH.state === "count") {
    SH.live = true; tw.fade = Math.max(P.selfLive, .55); tw.colorize = 0;
    if (!seen && now - SH.faceT > 1.5) { SH.state = "watch"; SH.t0 = now; SH.near = 0; }
    else if (el >= P.selfCountdown) { SH.state = "snap"; SH.t0 = now; }
  }
  if (SH.state === "snap") { selfCapture(now); }
  if (SH.state === "show") {
    let acc = 0, i = 0; for (; i < SH.scenes.length; i++) { if (el < acc + SH.scenes[i].d) break; acc += SH.scenes[i].d; }
    if (i >= SH.scenes.length) { SH.state = "rest"; SH.t0 = now; SH.scene = -1; selfRestore(); }
    else {
      const s = SH.scenes[i], ls = el - acc; SH.scene = i; Object.assign(tw, s.w); tw.fade = 1;
      if (s.k === "reveal") tw.fade = clamp(ls / 1.2, 0, 1);
      if (s.k === "dust") { tw.fade = clamp(1 - ls / 3.5, 0, 1); const n = Math.round(30 * clamp(1 - ls / 4, 0, 1) * dt * 60); for (let j = 0; j < n; j++) selfDust(); }
      if (i !== SH._lastScene) { SH._lastScene = i; if (i > 0) { burst(.8); flashV = Math.max(flashV, .7); } }
    }
  }
  if (SH.state === "rest") {
    SH.approach = 0;
    if (el > P.selfRest && (!P.selfLeave || SH.absent > 1.5 || el > P.selfRest + 60)) { SH.state = SH.armed ? "watch" : "off"; SH.t0 = now; SH.near = 0; }
  }
  const k = 1 - Math.exp(-dt / .7);
  for (const key in SH.w) SH.w[key] += (tw[key] - SH.w[key]) * (key === "fade" && SH.state === "count" ? 1 : k);
  // where the face sits in the source cell (particles are pulled there)
  SH.fcx = SRC / 2; SH.fcy = SRC / 2;
  if (SH.live && SH.stream && selfV.readyState >= 2 && SH.w.fade > .01) { selfCrop(selfC, seen ? SH.face : null); SFX.image(selfC); }
  if (SH.w.fade > .004 || SH.w.flow > .05 || SH.w.melt > .05) SFX.draw(T, SH.w);
}
function selfColor(x, y) {
  const z = SRC * P.selfZoom, u = clamp((x - (SRC - z) / 2) / z, 0, .999), v = clamp((y - (SRC - z) / 2) / z, 0, .999);
  const i = ((v * 64 | 0) * 64 + (u * 64 | 0)) * 4, d = SH.pix, b = 1.25;
  return `rgb(${Math.min(255, d[i] * b + 20) | 0},${Math.min(255, d[i + 1] * b + 20) | 0},${Math.min(255, d[i + 2] * b + 20) | 0})`;
}
function selfDust() {
  const r = Math.random, a = r() * TAU, d = Math.sqrt(r()) * SRC * P.selfZoom * .22, x = SRC / 2 + Math.cos(a) * d, y = SRC / 2 + Math.sin(a) * d;
  parts.push({ t: "sdust", x, y, vx: Math.cos(a) * (.4 + r() * 1.6), vy: Math.sin(a) * (.4 + r() * 1.6), a: 0, va: 0, s: 1.5 + r() * 3, life: 2 + r() * 2.5, age: 0, ci: 0, k: r(), col: SH.pix ? selfColor(x, y) : "#fff" });
}
// drawn into the source cell between the backdrop and the particles
function selfDraw(c) {
  if (!SFX || RENDER || P.selfMix <= 0 || (SH.w.fade < .004 && SH.w.flow < .05 && SH.w.melt < .05)) return;
  const z = SRC * P.selfZoom; c.save(); c.globalCompositeOperation = "source-over"; c.globalAlpha = clamp(P.selfMix, 0, 1);
  c.drawImage(SFX.cv, (SRC - z) / 2, (SRC - z) / 2, z, z); c.restore();
}
// hints on top of the stage (not mirrored): "come closer", the countdown, the shutter flash
function selfOverlay() {
  if (RENDER || !SH.armed && SH.flash < .01) return;
  const w = ov.width, h = ov.height; let cx = w / 2, cy = h / 2, R = Math.min(w, h) * .32;
  if (P.mode === "screen") { cx = TRI.reduce((s, p) => s + p[0], 0) / TRI.length * w; cy = TRI.reduce((s, p) => s + p[1], 0) / TRI.length * h; R = Math.min(w, h) * .18; }
  if (SH.flash > .01) { ox.fillStyle = `rgba(255,255,255,${(SH.flash * .85).toFixed(3)})`; ox.fillRect(0, 0, w, h); }
  if (!P.selfHint) return;
  ox.save(); ox.textAlign = "center"; ox.textBaseline = "middle"; ox.shadowColor = "rgba(0,0,0,.7)"; ox.shadowBlur = 12 * DPR;
  const t = performance.now() / 1000;
  if (SH.state === "count") {
    const el = t - SH.t0, n = Math.max(1, Math.ceil(P.selfCountdown - el)), f = 1 - (el % 1);
    ox.fillStyle = `rgba(255,255,255,${(.55 + .45 * f).toFixed(3)})`; ox.font = `800 ${Math.round(R * (.7 + .25 * f))}px Heebo, sans-serif`; ox.fillText(String(n), cx, cy);
  } else if (SH.state === "watch" && SH.approach > .12) {
    const p = clamp(SH.near / Math.max(.05, P.selfHold), 0, 1);
    ox.strokeStyle = "rgba(124,242,220,.85)"; ox.lineWidth = 4 * DPR; ox.beginPath(); ox.arc(cx, cy, R * .9, -Math.PI / 2, -Math.PI / 2 + TAU * p); ox.stroke();
    if (SH.size < P.selfNear) { ox.fillStyle = `rgba(232,237,244,${(.55 + .35 * Math.sin(t * 3)).toFixed(3)})`; ox.font = `700 ${Math.round(R * .2)}px Heebo, sans-serif`; ox.fillText("התקרבו ✦", cx, cy + R * 1.05); }
  }
  ox.restore();
}
// ---- the desk tab
function selfStatus() {
  const s = $("#selfStat"); if (!s) return;
  const st = { off: "כבוי", watch: SH.size ? (SH.size >= P.selfNear ? "מישהו קרוב, מחזיק…" : "רואה פנים, מחכה שיתקרבו") : "מחכה למישהו שיתקרב", count: "ספירה לאחור", snap: "מצלם", show: "מופע: " + (SH.scenes[SH.scene] ? ({ reveal: "חשיפה", dust: "התפוררות" }[SH.scenes[SH.scene].k] || SFX_LIST.find(f => f[0] === SH.scenes[SH.scene].k)?.[1] || "") : ""), rest: "הפסקה עד המבקר הבא" }[SH.state] || SH.state;
  const dk = { mediapipe: "MediaPipe (בדפדפן)", native: "FaceDetector של הדפדפן", motion: "גיבוי: תנועה", "": SH.loading ? "טוען…" : "לא נטען" }[SH.detKind];
  s.textContent = `${st} · זיהוי: ${dk} · פנים ${Math.round(SH.size * 100)}% מהרוחב · מופעים: ${SH.count}`;
}
function selfPreview() {
  const c = $("#selfPrev"); if (!c) return; const x = c.getContext("2d"), w = c.width, h = c.height;
  x.fillStyle = "#0a0d13"; x.fillRect(0, 0, w, h);
  if (SH.stream && selfV.readyState >= 2) {
    x.save(); if (P.selfMirror) { x.translate(w, 0); x.scale(-1, 1); } x.drawImage(selfV, 0, 0, w, h);
    const f = SH.face, now = performance.now() / 1000;
    if (f && now - SH.faceT < .5) { x.strokeStyle = f.w >= P.selfNear ? "#7cf2dc" : "#ffb547"; x.lineWidth = 3; x.strokeRect(f.x * w, f.y * h, f.w * w, f.h * h); }
    x.restore();
    x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, h - 10, w, 10); x.fillStyle = "#ffb547"; x.fillRect(0, h - 10, clamp(SH.size / .6, 0, 1) * w, 10);
    x.fillStyle = "#7cf2dc"; x.fillRect(clamp(P.selfNear / .6, 0, 1) * w - 2, h - 14, 4, 14);
  } else { x.fillStyle = "#8b96a8"; x.font = "600 22px Heebo, sans-serif"; x.textAlign = "center"; x.fillText("המצלמה כבויה", w / 2, h / 2); }
  if (SH.shot) { const s = h * .42; x.drawImage(SH.shot, 8, 8, s, s); x.strokeStyle = "#fff"; x.lineWidth = 2; x.strokeRect(8, 8, s, s); }
  selfStatus();
}
function selfTab() {
  let h = `<section class="grp"><h3>מופע סלפי אוטומטי</h3><p class="note">מצלמה מול המיצג מזהה פנים. מי שמתקרב ונשאר רגע מקבל ספירה לאחור, סלפי, ומופע שבו הפנים שלו נמשכות, זורמות ומתפוררות בתוך המראות. הכול רץ בדפדפן, ושום תמונה לא יוצאת מהמחשב.</p>
    <div class="row"><button type="button" id="selfArmB" class="${SH.armed ? "" : "primary"}" aria-pressed="${SH.armed}">${SH.armed ? "■ עצור את המופע" : "▶ הפעל מופע סלפי"}</button><button type="button" id="selfSnapB"${SH.armed ? "" : " disabled"}>📸 צלם עכשיו (C)</button><button type="button" id="selfKioskB"${SH.armed ? "" : " disabled"}>מסך מלא למיצג</button></div>
    <canvas class="mini" id="selfPrev" width="640" height="360" style="height:auto;aspect-ratio:16/9" aria-label="תצוגה מקדימה של המצלמה וזיהוי הפנים"></canvas>
    <div class="sens" id="selfStat">—</div>${tog("selfAuto", "להפעיל את המופע לבד בכל פתיחה של הדף")}</section>`;
  h += `<section class="grp"><h3>מצלמה</h3><div class="ctl"><label for="selfDev">מצלמה</label><select id="selfDev" style="grid-column: span 2"></select></div>
    <div class="row"><button type="button" id="selfDevR">רענן רשימה</button></div>${tog("selfMirror", "היפוך כמו מראה")}
    <p class="note">מצלמת USB: מחברים לפני שפותחים את הדף (או לוחצים "רענן רשימה"), בוחרים אותה כאן, והבחירה נשמרת. אם מנתקים אותה באמצע, הדף מתחבר אליה שוב לבד.</p></section>`;
  h += `<section class="grp"><h3>זיהוי פנים והפעלה</h3>` + rng("selfNear", "קרבה להפעלה", .06, .6, .01) + rng("selfHold", "זמן עמידה (שנ׳)", .2, 4, .1) + rng("selfCountdown", "ספירה לאחור", 0, 5, 1)
    + rng("selfRest", "הפסקה בין מופעים", 0, 60, 1) + tog("selfLeave", "לחכות שהמבקר יתרחק לפני מופע חדש") + rng("selfLive", "השתקפות חיה בהתקרבות", 0, 1, .01) + tog("selfHint", "רמזים על המסך: התקרבו, 3·2·1, הבזק")
    + `<p class="note"><b>קרבה להפעלה</b> היא רוחב הפנים מתוך רוחב התמונה: הפס הכתום בתצוגה המקדימה הוא המבקר, הקו הטורקיז הוא הסף. 0.2 בערך מטר מהמצלמה.</p></section>`;
  h += `<section class="grp"><h3>המופע</h3>` + rng("selfLen", "אורך (שנ׳)", 15, 120, 1) + rng("selfZoom", "גודל הפנים בתא", .5, 2, .01) + rng("selfMix", "עוצמת הסלפי", 0, 1, .01)
    + `<div class="ctl"><label for="c_selfPreset">פריסט למופע</label><select id="c_selfPreset" data-k="selfPreset" style="grid-column: span 2"><option value="keep"${P.selfPreset === "keep" ? " selected" : ""}>המצב הנוכחי</option>${PRESETS.filter(p => p.id !== "cam").map(p => `<option value="${p.id}"${P.selfPreset === p.id ? " selected" : ""}>${p.name}</option>`).join("")}</select></div>
    <div class="chips">${SFX_LIST.map(([k, n]) => `<label class="tog"><input type="checkbox" data-k="fx_${k}"${P["fx_" + k] ? " checked" : ""}> ${n}</label>`).join("")}</div>`
    + tog("selfShuffle", "סדר אפקטים אקראי בכל מופע") + tog("selfKeep", "לזכור את 8 הסלפי האחרונים (בזיכרון בלבד) ולהציג אותם כשאין אף אחד")
    + `<div class="row"><button type="button" id="selfSaveB"${SH.shot ? "" : " disabled"}>⬇ שמור את הסלפי האחרון</button></div>
    <p class="note">החלקיקים של המופע מקבלים את הצבעים מהפנים. במצב <b>מסך למוצר</b> הסלפי נכנס לתא שמאחורי המראות האמיתיות. למיצג בלי מגע: פותחים את <b>/show</b>, והמופע מתחיל לבד.</p></section>`;
  return h;
}
$("#panel").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "selfArmB") selfArm(!SH.armed);
  else if (b.id === "selfSnapB") { if (SH.armed) { SH.state = "snap"; } }
  else if (b.id === "selfKioskB") selfKiosk();
  else if (b.id === "selfDevR") selfDevices();
  else if (b.id === "selfSaveB" && SH.shot) SH.shot.toBlob(bl => bl && saveBlob(bl, `selfie-${Date.now()}.png`));
});
$("#panel").addEventListener("change", e => { if (e.target.id === "selfDev") { store.set("selfDev", e.target.value); if (SH.armed) selfCamStart(); } });
window.addEventListener("keydown", e => { if (e.target.matches("input, textarea, select")) return; if (e.code === "KeyC" && SH.armed) SH.state = "snap"; if (e.code === "Escape") document.body.classList.remove("selfrun"); });
function selfBoot() {
  const want = /[?&]selfie=1/.test(location.search) || /\/show\/?$/.test(location.pathname) || location.hash === "#selfie" || P.selfAuto;
  if (!want) return;
  tab = "selfie"; render(); selfKiosk(); selfArm(true);
}
