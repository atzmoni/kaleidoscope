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
  w: { pull: 0, twirl: 0, flow: 0, ripple: 0, melt: 0, shatter: 0, holo: 0, ppull: 0, colorize: 0, fade: 0, smix: 0, mask: .5 }, style: 0,
  scenes: [], scene: -1, shot: null, pix: null, live: false, count: 0, saved: null, gallery: [], ghostI: 0, ghostT: 0,
  flash: 0, wake: null, retry: 0, motion: null, fcx: SRC / 2, fcy: SRC / 2, label: ""
};
// crop canvas: the face, centred, mirrored like a mirror if asked; 512 px square
const selfC = document.createElement("canvas"); selfC.width = selfC.height = 512; const selfX = selfC.getContext("2d");
const pixC = document.createElement("canvas"); pixC.width = pixC.height = 64; const pixX = pixC.getContext("2d", { willReadFrequently: true });
function selfCrop(dst, face) { return selfCropFrom(dst, selfV, selfV.videoWidth, selfV.videoHeight, face, P.selfMirror); }
function selfCropFrom(dst, src, vw, vh, face, mirror) {
  if (!vw || !vh) return false;
  const f = face || { x: .3, y: .2, w: .4, h: .5 };
  const side = clamp(f.w * vw / .42, Math.min(vw, vh) * .25, Math.max(vw, vh) * 1.4);
  const cx = (f.x + f.w / 2) * vw, cy = (f.y + f.h / 2) * vh - f.h * vh * .04;
  const c = dst.getContext("2d"), S2 = dst.width; c.save(); c.fillStyle = "#000"; c.fillRect(0, 0, S2, S2);
  if (mirror) { c.translate(S2, 0); c.scale(-1, 1); }
  c.drawImage(src, cx - side / 2, cy - side / 2, side, side, 0, 0, S2, S2); c.restore(); return true;
}
// ---- the effect renderer: its own small WebGL canvas with a feedback buffer, composited into the source cell
const SFX = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 512;
  const g = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!g) return null;
  const FX = `precision highp float;
uniform sampler2D uImg, uPrev; uniform vec2 uC;
uniform float uT, uPull, uTwirl, uFlow, uRipple, uMelt, uShatter, uHolo, uFade, uKick, uBass, uStyle, uStyleMix, uMaskR;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
vec2 curl(vec2 p){ const float e = .07; float a = noise(p + vec2(0., e)), b = noise(p - vec2(0., e)), c = noise(p + vec2(e, 0.)), d = noise(p - vec2(e, 0.)); return vec2(a - b, d - c) / (2. * e); }
vec3 holo(float l, float t){ return .5 + .5 * cos(6.2831853 * (l * 1.4 + t * .05 + vec3(0., .33, .67))); }
// picture styles: the selfie redrawn as a comic, watercolour, ink, pop art, neon, pencil, hologram or stained glass
vec3 tx(vec2 p){ return texture2D(uImg, p).rgb; }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
float sobel(vec2 p, float r){ float e = r / 512.;
  float tl = lum(tx(p + vec2(-e, e))), t = lum(tx(p + vec2(0., e))), tr = lum(tx(p + vec2(e, e))), l = lum(tx(p - vec2(e, 0.))), rr = lum(tx(p + vec2(e, 0.)));
  float bl = lum(tx(p - vec2(e, e))), b = lum(tx(p - vec2(0., e))), br = lum(tx(p + vec2(e, -e)));
  return length(vec2(tr + 2. * rr + br - tl - 2. * l - bl, tl + 2. * t + tr - bl - 2. * b - br)); }
vec3 blur(vec2 p, float r){ vec3 a = tx(p) * 2.; for (int i = 0; i < 8; i++){ float an = float(i) * .785398; a += tx(p + vec2(cos(an), sin(an)) * r / 512.); } return a / 10.; }
vec3 stylize(vec2 s, vec3 col, float st){
  float l = lum(col); vec2 fc = gl_FragCoord.xy;
  if (st < 1.5){ // comic: flat colour, black ink lines, halftone dots in the shadows
    vec3 c = floor(blur(s, 1.5) * 4. + .5) / 4.; c = clamp(mix(vec3(lum(c)), c, 1.6), 0., 1.);
    vec2 g = mat2(.707, -.707, .707, .707) * fc * .33; float ht = step(length(fract(g) - .5), (1. - l) * .62) * step(l, .55);
    c *= 1. - .55 * ht; return mix(c, vec3(.02), smoothstep(.25, .55, sobel(s, 1.6))); }
  if (st < 2.5){ // watercolour: soft pigment that bleeds, darker rims, paper grain
    vec2 w = s + (vec2(noise(s * 40.), noise(s * 40. + 5.)) - .5) * .014;
    vec3 c = blur(w, 5.); c = floor(c * 6.) / 6. * .6 + c * .4;
    c = mix(c, c * c * .85, smoothstep(.05, .3, sobel(w, 4.)) * .7);
    return mix(vec3(.96, .93, .86), c * 1.15, .82) * (.9 + .1 * noise(fc * .35)); }
  if (st < 3.5){ // ink: sumi brush on rice paper
    float th = .42 + .18 * (noise(s * 28. + uT * .2) - .5); float ink = max(smoothstep(th + .04, th - .04, lum(blur(s, 1.2))), smoothstep(.2, .5, sobel(s, 1.4)));
    return mix(vec3(.95, .92, .84) * (.92 + .08 * noise(fc * .2)), vec3(.05, .04, .06), ink); }
  if (st < 4.5){ // pop art: three flat inks and a dot screen
    vec3 c = l < .33 ? vec3(.08, .05, .2) : l < .55 ? vec3(.98, .15, .55) : l < .75 ? vec3(.1, .85, .95) : vec3(1., .9, .1);
    c *= .85 + .15 * step(length(fract(fc * .25) - .5), .3); return mix(c, vec3(0.), smoothstep(.3, .6, sobel(s, 1.8))); }
  if (st < 5.5){ // neon: glowing outlines
    vec3 h = .5 + .5 * cos(6.2831853 * (s.y * 1.5 + uT * .2 + vec3(0., .33, .67))); return h * smoothstep(.08, .5, sobel(s, 1.5)) * 1.6 + col * .08; }
  if (st < 6.5){ // pencil sketch with cross-hatching
    float e = smoothstep(.05, .45, sobel(s, 1.2));
    float hatch = step(.5, fract((fc.x + fc.y) * .18)) * step(l, .45) * .35 + step(.5, fract((fc.x - fc.y) * .18)) * step(l, .25) * .35;
    return vec3(.93, .92, .9) * (1. - e * .85 - hatch); }
  if (st < 7.5) return holo(l, uT) * (.15 + l * 1.05);
  // stained glass: triangle cells of flat colour with dark lead between them
  vec2 g = s * 14.; vec2 sk = vec2(g.x - g.y * .57735, g.y * 1.1547); vec2 id = floor(sk), f = fract(sk); float up = step(1., f.x + f.y);
  vec2 cc = id + (up > .5 ? vec2(2. / 3.) : vec2(1. / 3.)); vec2 cen = vec2(cc.x + cc.y * .5, cc.y * .866) / 14.;
  return mix(vec3(.02), tx(cen) * 1.2, smoothstep(.02, .07, min(min(f.x, f.y), abs(1. - f.x - f.y)))); }
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
  if (uStyle > .5 && uStyleMix > .01) col = mix(col, stylize(s, col, uStyle), uStyleMix);
  float m = smoothstep(uMaskR, uMaskR - .16, length(s - uC)) * inb;
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
  const U = {}; ["uImg", "uPrev", "uC", "uT", "uPull", "uTwirl", "uFlow", "uRipple", "uMelt", "uShatter", "uHolo", "uFade", "uKick", "uBass", "uStyle", "uStyleMix", "uMaskR"].forEach(n => U[n] = g.getUniformLocation(pf, n));
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
      g.uniform1f(U.uStyle, SH.style); g.uniform1f(U.uStyleMix, w.smix); g.uniform1f(U.uMaskR, w.mask);
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
  const tw = { pull: 0, twirl: 0, flow: 0, ripple: 0, melt: 0, shatter: 0, holo: 0, ppull: 0, colorize: 0, fade: 0, smix: 0, mask: .5 };
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
    if (SH.near >= P.selfHold && el > 1) { if (P.selfMode === "minute") minuteStart("camera", now); else { SH.state = P.selfCountdown > 0 ? "count" : "snap"; SH.t0 = now; } }
  } else if (SH.state === "count") {
    SH.live = true; tw.fade = Math.max(P.selfLive, .55); tw.colorize = 0;
    if (!seen && now - SH.faceT > 1.5) { SH.state = "watch"; SH.t0 = now; SH.near = 0; }
    else if (el >= P.selfCountdown) { SH.state = "snap"; SH.t0 = now; }
  }
  if (SH.state === "booth" || SH.state === "minute") minuteTick(now, dt, tw, seen);
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
    SH.approach = 0; minuteAfter(el);
    if (el > P.selfRest && (!P.selfLeave || SH.absent > 1.5 || el > P.selfRest + 60)) { SH.state = SH.armed ? "watch" : "off"; SH.t0 = now; SH.near = 0; }
  }
  const k = 1 - Math.exp(-dt / .7);
  for (const key in SH.w) SH.w[key] += (tw[key] - SH.w[key]) * (key === "fade" && SH.state === "count" ? 1 : k);
  // where the face sits in the source cell (particles are pulled there)
  SH.fcx = SRC / 2; SH.fcy = SRC / 2;
  if (SH.live && SH.stream && selfV.readyState >= 2 && SH.w.fade > .01 && !SH.freeze) { selfCrop(selfC, seen ? SH.face : null); SFX.image(selfC); }
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
  if (RENDER || !SH.armed && SH.flash < .01 && SH.state !== "booth" && SH.state !== "minute") return;
  const w = ov.width, h = ov.height; let cx = w / 2, cy = h / 2, R = Math.min(w, h) * .32;
  if (P.mode === "screen") { cx = TRI.reduce((s, p) => s + p[0], 0) / TRI.length * w; cy = TRI.reduce((s, p) => s + p[1], 0) / TRI.length * h; R = Math.min(w, h) * .18; }
  if (SH.flash > .01) { ox.fillStyle = `rgba(255,255,255,${(SH.flash * .85).toFixed(3)})`; ox.fillRect(0, 0, w, h); }
  minuteOverlay(cx, cy, R, w, h);
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
  const st = { off: "כבוי", watch: SH.size ? (SH.size >= P.selfNear ? "מישהו קרוב, מחזיק…" : "רואה פנים, מחכה שיתקרבו") : "מחכה למישהו שיתקרב", count: "ספירה לאחור", snap: "מצלם", show: "מופע: " + (SH.scenes[SH.scene] ? ({ reveal: "חשיפה", dust: "התפוררות" }[SH.scenes[SH.scene].k] || SFX_LIST.find(f => f[0] === SH.scenes[SH.scene].k)?.[1] || "") : ""), rest: "הפסקה עד המבקר הבא", booth: `צילום ${SH.shots ? SH.shots.length : 0} מתוך 4`, minute: "מופע דקה: " + (MIN_SEQ[SH.sec] ? STYLES[STYLE_NUM[MIN_SEQ[SH.sec].st]][1] : "סיום") }[SH.state] || SH.state;
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
    <div class="row"><button type="button" id="selfArmB" class="${SH.armed ? "" : "primary"}" aria-pressed="${SH.armed}">${SH.armed ? "■ עצור את המופע" : "▶ הפעל מופע סלפי"}</button><button type="button" id="selfSnapB"${SH.armed ? "" : " disabled"}>📸 ${P.selfMode === "minute" ? "מופע דקה עכשיו" : "צלם עכשיו"} (C)</button><button type="button" id="selfKioskB"${SH.armed ? "" : " disabled"}>מסך מלא למיצג</button></div>
    <canvas class="mini" id="selfPrev" width="640" height="360" style="height:auto;aspect-ratio:16/9" aria-label="תצוגה מקדימה של המצלמה וזיהוי הפנים"></canvas>
    <div class="sens" id="selfStat">—</div>${tog("selfAuto", "להפעיל את המופע לבד בכל פתיחה של הדף")}</section>`;
  h += `<section class="grp"><h3>מצלמה</h3><div class="ctl"><label for="selfDev">מצלמה</label><select id="selfDev" style="grid-column: span 2"></select></div>
    <div class="row"><button type="button" id="selfDevR">רענן רשימה</button></div>${tog("selfMirror", "היפוך כמו מראה")}
    <p class="note">מצלמת USB: מחברים לפני שפותחים את הדף (או לוחצים "רענן רשימה"), בוחרים אותה כאן, והבחירה נשמרת. אם מנתקים אותה באמצע, הדף מתחבר אליה שוב לבד.</p></section>`;
  h += `<section class="grp"><h3>זיהוי פנים והפעלה</h3>` + rng("selfNear", "קרבה להפעלה", .06, .6, .01) + rng("selfHold", "זמן עמידה (שנ׳)", .2, 4, .1) + rng("selfCountdown", "ספירה לאחור", 0, 5, 1)
    + rng("selfRest", "הפסקה בין מופעים", 0, 60, 1) + tog("selfLeave", "לחכות שהמבקר יתרחק לפני מופע חדש") + rng("selfLive", "השתקפות חיה בהתקרבות", 0, 1, .01) + tog("selfHint", "רמזים על המסך: התקרבו, 3·2·1, הבזק")
    + `<p class="note"><b>קרבה להפעלה</b> היא רוחב הפנים מתוך רוחב התמונה: הפס הכתום בתצוגה המקדימה הוא המבקר, הקו הטורקיז הוא הסף. 0.2 בערך מטר מהמצלמה.</p></section>`;
  h += `<section class="grp"><h3>סוג המופע</h3><div class="ctl"><label for="c_selfMode">מופע</label><select id="c_selfMode" data-k="selfMode" style="grid-column: span 2"><option value="classic"${P.selfMode !== "minute" ? " selected" : ""}>סלפי אחד ואפקטים (כ-40 שנ׳)</option><option value="minute"${P.selfMode === "minute" ? " selected" : ""}>מופע דקה: 4 סלפי ומוזיקה</option></select></div>
    <p class="note"><b>מופע דקה:</b> ארבעה צילומים על הביט, כמו בתא צילום (3·2·1 ושאטר), ואחריהם דקה שבה הסלפי מתחלפים כל שתי תיבות בין ${STYLES.slice(1).map(s => s[1]).join(", ")}, יחד עם המראות והפריסטים של הסטודיו. הפסקול דאון טמפו 90 BPM, עם שאטר ופעמון לכל צילום ובכל מעבר, ודרופ באמצע.</p>
    ${tog("selfMinPresets", "להחליף מראות ופריסטים עם המוזיקה")}${tog("selfRec", "להקליט כל מופע לסרטון ולהוריד אותו בסוף")}
    <div class="row"><label class="row" style="gap:0"><button type="button" id="selfFilesB">🎞 סרטון מ-4 תמונות</button><input type="file" id="selfFiles" accept="image/*" multiple hidden></label><button type="button" id="selfMidiB">⬇ MIDI</button><button type="button" id="selfWavB">⬇ WAV</button></div>
    <p class="note"><b>סרטון מ-4 תמונות</b> לא צריך מצלמה: בוחרים עד 4 תמונות, המופע רץ ומוקלט, והסרטון (MP4 או WebM, עם הסאונד) יורד בסוף. MIDI ו-WAV הם הפסקול של המופע.</p></section>`;
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
  else if (b.id === "selfSnapB") { if (SH.armed) selfManual(); }
  else if (b.id === "selfFilesB") $("#selfFiles").click();
  else if (b.id === "selfMidiB") saveBlob(songMidi(), "kaleidoscope-selfie-minute.mid");
  else if (b.id === "selfWavB") { toast("מכין את הפסקול…"); songWav().then(bl => saveBlob(bl, "kaleidoscope-selfie-minute.wav")); }
  else if (b.id === "selfKioskB") selfKiosk();
  else if (b.id === "selfDevR") selfDevices();
  else if (b.id === "selfSaveB" && SH.shot) SH.shot.toBlob(bl => bl && saveBlob(bl, `selfie-${Date.now()}.png`));
});
function selfManual() { if (SH.state === "booth" || SH.state === "minute") return; if (P.selfMode === "minute") minuteStart("camera", performance.now() / 1000); else SH.state = "snap"; }
$("#panel").addEventListener("change", e => { if (e.target.id === "selfFiles" && e.target.files.length) { minuteFromFiles(e.target.files); e.target.value = ""; } });
$("#panel").addEventListener("change", e => { if (e.target.id === "selfDev") { store.set("selfDev", e.target.value); if (SH.armed) selfCamStart(); } });
window.addEventListener("keydown", e => { if (e.target.matches("input, textarea, select")) return; if (e.code === "KeyC" && SH.armed) selfManual(); if (e.code === "Escape") document.body.classList.remove("selfrun"); });
function selfBoot() {
  const want = /[?&]selfie=1/.test(location.search) || /\/show\/?$/.test(location.pathname) || location.hash === "#selfie" || P.selfAuto;
  if (!want) return;
  tab = "selfie"; render(); selfKiosk(); selfArm(true);
}
// ---- minute show: 4 selfies taken on the beat, then 60 s of picture styles and mirrors cut to an original downtempo score
// The score is data (songScore): the same notes play through the synth below, export as a MIDI file, and drive the cuts.
const SONG = { bpm: 90, booth: 16, beats: 106 }; // 4 bars of photo booth, 22.5 bars (60 s) of show, then the last chord
const STYLES = [["none", "מקור"], ["comic", "קומיקס"], ["water", "צבעי מים"], ["ink", "דיו"], ["pop", "פופ ארט"], ["neon", "ניאון"], ["sketch", "רישום בעיפרון"], ["holo", "הולוגרמה"], ["glass", "ויטראז׳"]];
const STYLE_NUM = Object.fromEntries(STYLES.map((s, i) => [s[0], i]));
// one section every 2 bars: which selfie (or the 2x2 grid), the picture style, the motion and a studio preset
const MIN_SEQ = [
  { img: 0, st: "comic", w: { pull: .5, ppull: .6 }, pr: "dt-drift" },
  { img: 1, st: "water", w: { flow: .7, colorize: .6 }, pr: "dt-ink" },
  { img: 2, st: "ink", w: { ripple: .6 }, pr: "box" },
  { img: 3, st: "pop", w: { twirl: .6 }, pr: "eq" },
  { img: "grid", st: "neon", w: { shatter: .35 }, pr: "sphere" },
  { img: 0, st: "water", w: { melt: .9, colorize: .5 }, pr: "dt-breath", calm: true },
  { img: "grid", st: "comic", w: { shatter: .8, ppull: .4 }, pr: "fireworks", drop: true },
  { img: 1, st: "sketch", w: { twirl: 1 }, pr: "plasma" },
  { img: 2, st: "holo", w: { flow: 1, colorize: .8 }, pr: "hyp" },
  { img: 3, st: "glass", w: { ripple: 1 }, pr: "ht-ring" },
  { img: "grid", st: "ink", w: { pull: 1, ppull: 1 }, pr: "sphere-out" }
];
const SONG_INST = { kick: { ch: 9 }, clap: { ch: 9 }, shaker: { ch: 9 }, shutter: { ch: 9 }, crash: { ch: 9 }, sub: { ch: 0, prog: 38 }, pad: { ch: 1, prog: 89 }, pluck: { ch: 2, prog: 10 }, bell: { ch: 3, prog: 14 }, beep: { ch: 4, prog: 80 }, riser: { ch: 5, prog: 119 } };
function songScore() {
  const ev = [], add = (inst, b, dur, note, vel) => ev.push({ inst, b, dur, note, vel });
  const chords = [[0, 3, 7, 10, 14], [-4, 0, 3, 7, 10], [-7, -3, 0, 3, 7], [-2, 2, 5, 9, 12]], N = n => 35 + n; // same harmony as the downtempo demo
  for (let bar = 0; bar < 27; bar++) {
    const b0 = bar * 4, booth = bar < 4, sec = booth ? -1 : (bar - 4) >> 1, ch = chords[(bar >> 1) % 4], breakdown = sec === 5, build = bar === 15;
    if (bar === 26) { // the last chord, two beats after the minute: one more shutter
      ch.slice(0, 4).forEach(n => add("pad", b0, 6, N(n + 12), 95)); add("sub", b0, 4, N(ch[0] - 12), 100); add("kick", b0, .5, 36, 120);
      add("bell", b0, 4, N(ch[0] + 36), 110); add("bell", b0 + .5, 4, N(ch[2] + 36), 90); add("shutter", b0 + 1, .25, 75, 120); break;
    }
    if (bar % 2 === 0) ch.slice(0, 4).forEach(n => add("pad", b0, 8, N(n + 12), breakdown ? 105 : 85));
    if (booth) {
      for (let k = 0; k < 8; k++) add("shaker", b0 + k * .5, .1, 70, k % 2 ? 40 : 62);
      if (bar >= 2) add("sub", b0, 3.6, N(ch[0] - 12), 80);
      [76, 79, 83].forEach((n, k) => add("beep", b0 + k + 1, .15, n, 90)); // 3 · 2 · 1
    } else if (!breakdown) {
      add("kick", b0, .5, 36, 120); add("kick", b0 + 2.5, .5, 36, 105); add("clap", b0 + 2, .3, 39, 100);
      for (let k = 0; k < 16; k++) add("shaker", b0 + k * .25, .06, 70, k % 2 ? 36 : 62);
      add("sub", b0, 3.6, N(ch[0] - 12), 100);
    }
    if (build) { for (let k = 8; k < 16; k += 2) add("clap", b0 + k * .25, .2, 39, 40 + k * 5); add("riser", b0, 4, 60, 110); }
    if (!booth && (bar % 4 >= 2 || breakdown)) for (let k = 0; k < 8; k++) add("pluck", b0 + k * .5, .5, N(ch[(k + bar * 3) % 5] + 24 + (bar % 2 ? 12 : 0)), 72);
    if (bar >= 1 && bar <= 4) { add("shutter", b0, .25, 75, 127); add("bell", b0, 2, N(ch[0] + 43), 100); } // the four shots
    if (!booth && (bar - 4) % 2 === 0) { add("shutter", b0, .2, 75, 70); add("bell", b0 + .75, 1.5, N(ch[2] + 36), 70); } // a soft shutter on every cut
    if (bar === 16) add("crash", b0, 2, 49, 120);
  }
  return ev.sort((a, b) => a.b - b.b);
}
function songVoice(ctx, out, kit, e, t, spb) {
  const hz = m => 440 * Math.pow(2, (m - 69) / 12), v = e.vel / 127, d = e.dur * spb;
  const env = (node, a, peak, dec, at = t) => { const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(.0008, at + a + dec); node.connect(g); g.connect(out); return g; };
  const noise = (type, fq, q, vol, len, at = t) => { const n = ctx.createBufferSource(); n.buffer = kit.noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = fq; f.Q.value = q; n.connect(f); env(f, .003, vol, len, at); n.start(at); n.stop(at + len + .05); return f; };
  const osc = (type, f0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f0; return o; };
  if (e.inst === "kick") { const o = osc("sine", 110); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + .18); env(o, .003, .95 * v, .55); o.start(t); o.stop(t + .65); }
  else if (e.inst === "clap") { noise("bandpass", 1500, .8, .34 * v, .3); noise("highpass", 5000, .5, .08 * v, .45); }
  else if (e.inst === "shaker") noise("highpass", 8000, .7, .1 * v, .06);
  else if (e.inst === "shutter") { // a camera: mirror slap, a second click, a little low thunk
    noise("highpass", 3200, .6, .55 * v, .025); noise("bandpass", 2400, 1.2, .4 * v, .035, t + .07);
    const o = osc("sine", 190); o.frequency.exponentialRampToValueAtTime(60, t + .07); env(o, .002, .25 * v, .08); o.start(t); o.stop(t + .12); }
  else if (e.inst === "crash") noise("highpass", 4000, .3, .22 * v, 1.8);
  else if (e.inst === "sub") { const o = osc("sine", hz(e.note)); env(o, .02, .5 * v, d); o.start(t); o.stop(t + d + .1); }
  else if (e.inst === "pad") { for (const det of [-7, 7]) { const o = osc("sawtooth", hz(e.note)), f = ctx.createBiquadFilter(); o.detune.value = det; f.type = "lowpass"; f.frequency.value = 900 + 600 * (v - .6); o.connect(f); env(f, spb * 1.5, .028 * v, d * .8); o.start(t); o.stop(t + d + .2); } }
  else if (e.inst === "pluck") { const o = osc("sine", hz(e.note)); env(o, .005, .12 * v, .5); o.start(t); o.stop(t + .6); }
  else if (e.inst === "bell") { // FM bell: the selfie chime
    const c = osc("sine", hz(e.note)), m = osc("sine", hz(e.note) * 3.5), mg = ctx.createGain(); mg.gain.setValueAtTime(hz(e.note) * 2.2, t); mg.gain.exponentialRampToValueAtTime(1, t + d);
    m.connect(mg); mg.connect(c.frequency); env(c, .003, .1 * v, d * 1.4); c.start(t); m.start(t); c.stop(t + d * 1.5 + .1); m.stop(t + d * 1.5 + .1); }
  else if (e.inst === "beep") { const o = osc("sine", hz(e.note)); env(o, .003, .13 * v, .14); o.start(t); o.stop(t + .2); }
  else if (e.inst === "riser") { const f = noise("bandpass", 400, 2, .0001, d); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3 * v, t + d); g.gain.linearRampToValueAtTime(0, t + d + .05); f.connect(g); g.connect(out); }
}
const song = { on: false, ev: null, i: 0, t0: 0, wall0: 0, prev: "none" };
function songStart() {
  ensureAudio(); try { actx.resume(); } catch (e) {} song.prev = A.src; stopSources();
  const out = actx.createGain(); out.gain.value = .8; out.connect(master);
  const kit = demoKit(actx), spb = 60 / SONG.bpm, t0 = actx.currentTime + .15;
  Object.assign(song, { on: true, ev: songScore(), i: 0, t0, wall0: performance.now() / 1000 + .15 });
  demo = { out, t0, spb, next: 0 }; B.bpm = SONG.bpm; B._lastIdx = -1;
  const sched = () => { const ahead = actx.currentTime + .3; while (song.i < song.ev.length && t0 + song.ev[song.i].b * spb < ahead) { const e = song.ev[song.i++]; songVoice(actx, out, kit, e, t0 + e.b * spb, spb); } };
  sched(); demo.timer = setInterval(sched, 50); A.src = "song"; updAudioUI();
}
// the show follows the audio clock when sound is running (kiosk without autoplay permission: the wall clock)
function songBeats() { return ((actx && actx.state === "running" ? actx.currentTime - song.t0 : performance.now() / 1000 - song.wall0) * SONG.bpm / 60); }
function songStop() { if (!song.on) return; song.on = false; if (A.src === "song") stopSources(); if (song.prev === "demo") startDemo(); }
function songBeat(idx) { // visual kicks that match the score
  if (idx < SONG.booth) { if (idx % 4 === 0 && idx > 0) burst(.4); return; }
  const bar = idx >> 2, sec = (bar - 4) >> 1;
  if (sec === 5) { if (bar === 15 && idx % 4 === 3) flashV = Math.max(flashV, .6); return; }
  if (idx % 4 === 0) onKick(); else if (idx % 4 === 2) { burst(.3); flashV = Math.max(flashV, .45); }
  if (bar === 16 && idx % 4 === 0) dropNow();
}
function minuteStart(src, now, files) {
  SH.mode = src; SH.files = files || null; SH.shots = []; SH.grid = null; SH.sec = -1; SH.freeze = false; SH.style = 0;
  SH.state = "booth"; SH.t0 = now; SH.near = 0; SH.saved = { ...P }; SH.endAt = 0;
  SFX.clear(); if (files) SFX.image(files[0]); SH.live = src === "camera";
  songStart(); flashV = .8;
  if ((P.selfRec || SH.recNext) && !rec) { toggleRec(); SH.recMine = !!rec; } SH.recNext = false;
}
function minuteShot(k) {
  let shot;
  if (SH.files) shot = SH.files[k % SH.files.length];
  else { shot = document.createElement("canvas"); shot.width = shot.height = 512; selfCrop(shot, SH.face); }
  SH.shots.push(shot); SH.shot = shot; SH.flash = 1; flashV = 1.2; burst(1.2);
  SFX.image(shot); SH.freeze = true; SH.freezeB = SONG.booth; // hold the picture for a beat
  if (P.selfKeep && !SH.files) { SH.gallery.unshift(shot); SH.gallery.length = Math.min(SH.gallery.length, 8); }
  if (k === 0) { SH.count++; pixX.drawImage(shot, 0, 0, 64, 64); SH.pix = pixX.getImageData(0, 0, 64, 64).data; }
}
function minuteGrid() {
  const g = document.createElement("canvas"); g.width = g.height = 512; const c = g.getContext("2d");
  SH.shots.slice(0, 4).forEach((s, i) => c.drawImage(s, 64, 64, 384, 384, (i % 2) * 256, (i >> 1) * 256, 256, 256));
  return g;
}
function minuteTick(now, dt, tw, seen) {
  const b = songBeats();
  if (SH.state === "booth") {
    const k = SH.shots.length;
    if (k < 4 && b >= (k + 1) * 4) { minuteShot(k); SH.freezeAt = b; }
    if (SH.freeze && b - SH.freezeAt > 1.6 && SH.shots.length < 4) { SH.freeze = false; if (SH.files) SFX.image(SH.files[SH.shots.length % SH.files.length]); }
    tw.fade = SH.freeze ? 1 : SH.files ? .35 : .9; tw.flow = SH.freeze ? 0 : .1; tw.holo = SH.files && !SH.freeze ? .6 : 0;
    if (b >= SONG.booth) { SH.state = "minute"; SH.grid = minuteGrid(); SH.freeze = false; SH.live = false; }
    return;
  }
  const mb = b - SONG.booth, sec = Math.floor(mb / 8);
  if (sec >= MIN_SEQ.length) { // the last two beats: everything crumbles into particles on the final chord
    const ls = mb - MIN_SEQ.length * 8; tw.fade = clamp(1 - ls / 3, 0, 1); tw.flow = .6; tw.colorize = 1; tw.smix = .4; tw.mask = .5;
    if (ls < 3) { const n = Math.round(30 * dt * 60 * (1 - ls / 3)); for (let j = 0; j < n; j++) selfDust(); }
    if (ls > 4.5) { SH.state = "rest"; SH.t0 = now; SH.endAt = now; selfRestore(); }
    return;
  }
  const S = MIN_SEQ[sec];
  if (sec !== SH.sec) {
    SH.sec = sec; SH.style = STYLE_NUM[S.st] || 0;
    const img = S.img === "grid" ? SH.grid : SH.shots[S.img % SH.shots.length]; if (img) SFX.image(img);
    pixX.drawImage(img, 0, 0, 64, 64); SH.pix = pixX.getImageData(0, 0, 64, 64).data;
    if (P.selfMinPresets) { const pr = PRESETS.find(p => p.id === S.pr), mode = P.mode; if (pr) { applyPreset(pr, true); if (mode === "screen") P.mode = "screen"; } }
    burst(S.drop ? 2.5 : .8); flashV = Math.max(flashV, S.drop ? 1.4 : .7);
  }
  Object.assign(tw, S.w); tw.fade = 1; tw.mask = S.img === "grid" ? .72 : .5;
  // the style snaps in on the downbeat of the section and breathes with the second bar
  const ib = mb - sec * 8; tw.smix = S.calm ? .85 : (ib < 4 ? 1 : .75 + .25 * Math.cos((ib - 4) * Math.PI / 2));
  if (ib < .15) SH.w.smix = Math.max(SH.w.smix, .9);
}
function minuteAfter(el) {
  if (SH.endAt && SH.recMine && rec && el > 1.5) { rec.stop(); SH.recMine = false; }
  if (SH.endAt && song.on && el > 3) { songStop(); SH.endAt = 0; }
}
function minuteOverlay(cx, cy, R, w, h) {
  if (SH.state !== "booth" && !(SH.state === "minute" && songBeats() < SONG.booth + 2)) return;
  const b = songBeats(), bt = ((b % 4) + 4) % 4;
  ox.save(); ox.textAlign = "center"; ox.textBaseline = "middle"; ox.shadowColor = "rgba(0,0,0,.7)"; ox.shadowBlur = 12 * DPR;
  if (SH.state === "booth" && bt >= 1 && SH.shots.length < 4) { const n = 4 - Math.floor(bt), f = 1 - (bt % 1);
    ox.fillStyle = `rgba(255,255,255,${(.5 + .5 * f).toFixed(3)})`; ox.font = `800 ${Math.round(R * (.6 + .25 * f))}px Heebo, sans-serif`; ox.fillText(String(n), cx, cy); }
  // the photo-booth strip: four frames that fill up shot by shot
  const s = Math.min(w, h) * .13, gap = s * .12, x0 = w / 2 - (4 * s + 3 * gap) / 2, y0 = h - s - gap * 2;
  for (let i = 0; i < 4; i++) { const x = x0 + i * (s + gap); ox.fillStyle = "rgba(8,10,14,.6)"; ox.fillRect(x, y0, s, s);
    if (SH.shots[i]) ox.drawImage(SH.shots[i], x, y0, s, s); ox.strokeStyle = "rgba(255,255,255,.85)"; ox.lineWidth = 2 * DPR; ox.strokeRect(x, y0, s, s); }
  ox.restore();
}
// make a video from four photos: crop each one around its face, then play and record the minute show
async function minuteFromFiles(list) {
  const fl = [...list].filter(f => f.type.startsWith("image")).slice(0, 4); if (!fl.length) { toast("בחרו 1 עד 4 תמונות"); return; }
  toast("מכין את התמונות…"); const det = await selfLoadDetector(), out = [];
  for (const f of fl) {
    const img = new Image(); img.src = URL.createObjectURL(f); try { await img.decode(); } catch (e) { continue; }
    const w = img.naturalWidth, h = img.naturalHeight; let face = null;
    try {
      if (SH.detKind === "mediapipe") { const r = det.detectForVideo(img, performance.now()); for (const d of r.detections || []) { const bb = d.boundingBox, q = { x: bb.originX / w, y: bb.originY / h, w: bb.width / w, h: bb.height / h }; if (!face || q.w > face.w) face = q; } }
      else if (SH.detKind === "native") { const r = await det.detect(img); for (const d of r) { const bb = d.boundingBox, q = { x: bb.x / w, y: bb.y / h, w: bb.width / w, h: bb.height / h }; if (!face || q.w > face.w) face = q; } }
    } catch (e) {}
    if (!face) { const side = Math.min(w, h) * .42; face = { x: (w - side) / 2 / w, y: (h - side) / 2.4 / h, w: side / w, h: side / h }; }
    const c = document.createElement("canvas"); c.width = c.height = 512; selfCropFrom(c, img, w, h, face, false); out.push(c);
  }
  if (!out.length) { toast("לא הצלחתי לקרוא את התמונות"); return; }
  while (out.length < 4) out.push(out[out.length % fl.length]);
  SH.recNext = true; minuteStart("files", performance.now() / 1000, out);
  toast("מופע דקה מ-4 תמונות. מקליט, והסרטון יירד בסוף.", 4000);
}
async function songWav() {
  const spb = 60 / SONG.bpm, sr = 44100, secs = SONG.beats * spb + 4, ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr), out = ctx.createGain(); out.gain.value = .8; out.connect(ctx.destination);
  const kit = demoKit(ctx); for (const e of songScore()) songVoice(ctx, out, kit, e, e.b * spb + .05, spb);
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R2 = buf.getChannelData(1), n = L.length, ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab);
  const w = (o, s2) => { for (let i = 0; i < s2.length; i++) v.setUint8(o + i, s2.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, clamp(L[i] * .9, -1, 1) * 32767, true); v.setInt16(46 + i * 4, clamp(R2[i] * .9, -1, 1) * 32767, true); }
  return new Blob([ab], { type: "audio/wav" });
}
function songMidi() {
  const PPQ = 480, tracks = {}, bytes = s => [...s].map(c => c.charCodeAt(0));
  for (const e of songScore()) (tracks[e.inst] = tracks[e.inst] || []).push(e);
  const vlq = n => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
  const chunk = (id, d) => [...bytes(id), (d.length >>> 24) & 255, (d.length >> 16) & 255, (d.length >> 8) & 255, d.length & 255, ...d];
  const meta = s => [0xff, 3, s.length, ...bytes(s)], us = Math.round(6e7 / SONG.bpm);
  const trk = [chunk("MTrk", [0, ...meta("Kaleidoscope Selfie Minute"), 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0])];
  for (const [inst, list] of Object.entries(tracks)) {
    const k = SONG_INST[inst], msgs = [];
    for (const e of list) { msgs.push([Math.round(e.b * PPQ), 1, [0x90 | k.ch, e.note, clamp(e.vel | 0, 1, 127)]]); msgs.push([Math.round((e.b + e.dur) * PPQ), 0, [0x80 | k.ch, e.note, 0]]); }
    msgs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const d = [0, ...meta(inst)]; if (k.prog != null) d.push(0, 0xc0 | k.ch, k.prog);
    let last = 0; for (const [t, , m] of msgs) { d.push(...vlq(t - last), ...m); last = t; }
    d.push(0, 0xff, 0x2f, 0); trk.push(chunk("MTrk", d));
  }
  return new Blob([new Uint8Array([...chunk("MThd", [0, 1, 0, trk.length, PPQ >> 8, PPQ & 255]), ...trk.flat()])], { type: "audio/midi" });
}
