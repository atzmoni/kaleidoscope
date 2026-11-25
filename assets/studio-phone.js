/* Kaleidoscope Studio · phone mode
   Opens the full studio on a phone that sits in the phone-kit cradle (see /phone):
   the bottom part of the screen (under the cradle) shows only the source triangle under the mirrors,
   the top part holds the whole studio panel. Adds a selfie flow for the phone: front camera,
   then a few seconds to put the phone back into the cradle before the show starts.
   Activated by kaleidoscope-studio.html?phone=<kit code> (or #kphone=<kit code>). */
(() => {
  "use strict";
  const qs = new URLSearchParams(location.search), hm = location.hash.match(/kphone=([^&]+)/);
  const code = qs.has("phone") ? qs.get("phone") : hm ? hm[1] : null;
  if (code == null) return;

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let kit = null;
  if (code) { try { kit = JSON.parse(decodeURIComponent(escape(atob(code)))); } catch (e) {} }
  if (!kit) kit = ls.get("kphone.appkit", null);
  if (!kit || !kit.sw) kit = { n: "iPhone 15 / 16", sw: 64.9, sh: 140.7, s: 58, tx: 32.45, ty: 23.65, cap: 69, id: "iphone15" };
  ls.set("kphone.appkit", kit);
  const calKey = kit.id || "x";
  const loadCal = () => Object.assign({ dx: 0, dy: 0, px: 1, sz: 1, flip: false }, (ls.get("kphone.cal", {}) || {})[calKey] || {});
  let cal = loadCal();
  const saveCal = () => { const all = ls.get("kphone.cal", {}) || {}; all[calKey] = cal; ls.set("kphone.cal", all); };
  const opt = Object.assign({ back: 8, count: 3 }, ls.get("kphone.studio", {}));
  const saveOpt = () => ls.set("kphone.studio", opt);

  // keep the desktop studio's own settings untouched: the phone always runs in "screen" mode with its own triangle
  const prevMode = (store.get("params", {}) || {}).mode || "tri60";
  const origSet = store.set.bind(store);
  store.set = (k, v) => {
    if (k === "tri" || k === "boxApplied") return;
    if (k === "params" && v && v.mode === "screen") v = Object.assign({}, v, { mode: prevMode });
    origSet(k, v);
  };
  BOX = null;
  P.mode = "screen"; calib = false;
  // ?tab=layers opens the studio on that tab (the phone app's studio pane links straight to a tool)
  const askTab = qs.get("tab") || (location.hash.match(/ktab=([a-z]+)/) || [])[1];
  if (askTab && TABS.some(t => t[0] === askTab)) tab = askTab;

  // ---------- layout ----------
  const css = document.createElement("style");
  css.textContent = `
  body.phonekit #app{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:var(--phTop) var(--phBot)!important}
  body.phonekit.flip #app{grid-template-rows:var(--phBot) var(--phTop)!important}
  body.phonekit #panel{order:-1;border-inline-start:0;border-top:0;border-bottom:1px solid var(--line);display:flex!important}
  body.phonekit.flip #panel{order:1;border-bottom:0;border-top:1px solid var(--line)}
  body.phonekit #hud,body.phonekit #stageBtns,body.phonekit #panel .brand{display:none!important}
  body.phonekit #toast{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));bottom:auto;z-index:60}
  #phBar{display:flex;flex-wrap:nowrap;gap:4px;align-items:center;padding:5px 6px;padding-top:calc(5px + env(safe-area-inset-top,0px));scrollbar-width:none;overflow-x:auto;border-bottom:1px solid var(--line);background:var(--panel)}
  #phBar button,#phBar select{white-space:nowrap;width:auto;min-width:0;font:inherit;font-size:12.5px;border-radius:9px;padding:6px 7px;border:1px solid var(--line);background:var(--well,#0b0e14);color:var(--fg)}
  #phBar button.primary{background:var(--accent,#7cf2dc);color:#032620;border-color:transparent;font-weight:700}
  #phBar .sp{flex:1}
  #phCal{display:none;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px 10px 8px;border-bottom:1px solid var(--line);background:var(--panel)}
  #phCal.on{display:grid}
  #phCal button{font:inherit;font-size:13px;border-radius:9px;padding:7px 0;border:1px solid var(--line);background:var(--well,#0b0e14);color:var(--fg)}
  #phCal label{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted,#9aa5b6)}
  #phCal label input{flex:1}
  /* the whole desk, packed for the half of the screen that stays outside the cradle */
  body.phonekit #panelHead{display:none!important}
  body.phonekit #panel{min-height:0;overflow:hidden}
  body.phonekit #tabs{flex:none;gap:0;padding:2px 4px 0;background:var(--panel);scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
  body.phonekit #tabs::-webkit-scrollbar{display:none}
  body.phonekit #tabs button{flex:none;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:54px;padding:5px 7px 6px;font-size:10.5px;font-weight:600;line-height:1.15;scroll-snap-align:center}
  body.phonekit #tabs button svg{width:19px;height:19px}
  body.phonekit #tabs button[aria-selected="true"]{color:var(--accent)}
  body.phonekit #tabbody{flex:1;min-height:0;padding:8px 8px calc(16px + env(safe-area-inset-bottom,0px));gap:7px;overscroll-behavior:contain}
  body.phonekit section.grp.card{border-radius:10px;padding:0 10px 10px;gap:8px}
  body.phonekit section.grp.card > h3{margin:0 -10px}
  body.phonekit button.fold{padding:10px 10px 4px;font-size:11.5px}
  body.phonekit section.grp.fold > button.fold,body.phonekit section.grp.fold > h3 > button.fold{padding-bottom:10px}
  body.phonekit .ctl{grid-template-columns:88px minmax(0,1fr) 38px;gap:6px}
  body.phonekit .ctl label{font-size:12.5px;line-height:1.2}
  body.phonekit input[type=range]{height:30px;touch-action:pan-y}
  body.phonekit .chips button{padding:8px 8px}
  body.phonekit .note{font-size:12px}
  body.phonekit .phHide{display:none!important}
  .phNote{margin:0;font-size:12.5px;color:var(--muted,#9aa5b6);line-height:1.45}
  .phNote b{color:var(--fg)}
  #phBar button.on{background:var(--accent,#7cf2dc);color:#032620;border-color:transparent}
  body.phExpand #stageWrap{border-top:1px solid var(--line)}
  #phOv{position:fixed;inset:0;z-index:80;background:#000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;text-align:center;padding:20px;font-family:Heebo,system-ui,sans-serif}
  #phOv.on{display:flex}
  #phOv video{width:min(86vw,62vh);aspect-ratio:1;object-fit:cover;border-radius:50%;transform:scaleX(-1);box-shadow:0 0 0 3px rgba(124,242,220,.5)}
  #phOv .big{font-size:min(28vw,170px);font-weight:800;line-height:1}
  #phOv .msg{font-size:20px;max-width:520px}
  #phOv .strip{display:flex;gap:8px}
  #phOv .strip canvas{width:64px;height:64px;border-radius:8px;border:2px solid #fff}
  #phOv button{font:inherit;font-size:16px;border-radius:12px;padding:10px 18px;border:1px solid #2b3446;background:#151b26;color:#fff}
  #phOv button.primary{background:#7cf2dc;color:#032620;border:0;font-weight:700}
  #phOv .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .4s}
  #phOv .flash.on{opacity:1;transition:none}
  `;
  document.head.appendChild(css);
  document.body.classList.add("phonekit");

  const panel = document.getElementById("panel");
  const bar = document.createElement("div"); bar.id = "phBar";
  bar.innerHTML = `<button type="button" class="primary" id="phSelfie">📸 סלפי</button>
    <select id="phMode" aria-label="סוג מופע"><option value="classic">סלפי · אפקטים</option><option value="minute">דקה · 4 סלפי</option></select>
    <select id="phBack" aria-label="זמן להחזרת הטלפון">${[3, 5, 8, 10, 12, 15, 20].map(s => `<option value="${s}">⏱ ${s} שנ׳</option>`).join("")}</select>
    <span class="sp"></span>
    <button type="button" id="phBig" aria-pressed="false" title="עריכה במסך מלא, עם תצוגה של מה שרואים בעינית">⤢ עריכה</button>
    <button type="button" id="phCalB" aria-label="כיול">כיול</button>
    <button type="button" id="phFull" aria-label="מסך מלא">⛶</button>
    <a id="phExit" href="phone#app" style="text-decoration:none"><button type="button" aria-label="חזרה לאפליקציה הפשוטה">✕</button></a>`;
  const calRow = document.createElement("div"); calRow.id = "phCal";
  calRow.innerHTML = `<button data-n="up">▲ למעלה</button><button data-n="down">▼ למטה</button><button data-n="right">▶ ימינה</button><button data-n="left">◀ שמאלה</button>
    <label>קנה מידה <input type="range" id="phPx" min="0.85" max="1.15" step="0.002"></label>
    <label>גודל משולש <input type="range" id="phSz" min="0.9" max="1.1" step="0.002"></label>
    <label><input type="checkbox" id="phFlip" style="flex:none"> תפסנית על הקצה העליון של הטלפון</label>`;
  panel.insertBefore(calRow, panel.firstChild);
  panel.insertBefore(bar, panel.firstChild);
  const $p = id => document.getElementById(id);
  const minuteOK = typeof minuteStart === "function";
  if (!minuteOK) $p("phMode").querySelector('[value="minute"]').remove();
  $p("phMode").value = minuteOK && P.selfMode === "minute" ? "minute" : "classic";
  $p("phBack").value = String(opt.back);
  $p("phMode").onchange = e => { P.selfMode = e.target.value; save(); if (typeof render === "function") render(); };
  $p("phBack").onchange = e => { opt.back = +e.target.value; saveOpt(); };
  $p("phCalB").onclick = () => { if (big) setBig(false); calRow.classList.toggle("on"); showOutline = calRow.classList.contains("on"); layout(); };
  // "edit on the whole screen": phone out of the cradle, the desk takes most of the screen and the stage shows
  // the finished kaleidoscope (what the eye sees through the mirrors) instead of the raw triangle
  let big = false;
  function setBig(on) {
    big = !!on; document.body.classList.toggle("phExpand", big);
    const b = $p("phBig"); b.classList.toggle("on", big); b.setAttribute("aria-pressed", String(big));
    if (big) { calRow.classList.remove("on"); showOutline = false; }
    P.mode = big ? "tri60" : "screen"; // the cradle holds a 60° prism
    if (typeof render === "function") render();
    layout();
  }
  $p("phBig").onclick = () => setBig(!big);

  // one card open at a time: opening a card folds the others, and the opened card scrolls into view
  const body = document.getElementById("tabbody");
  body.addEventListener("click", e => {
    const b = e.target.closest("button.fold"); if (!b) return;
    setTimeout(() => {
      const s = b.closest("section.grp"); if (!s || s.classList.contains("fold")) return;
      body.querySelectorAll("section.grp.card:not(.fold)").forEach(o => { if (o !== s) { const ob = o.querySelector("button.fold"); if (ob) ob.click(); } });
      s.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  });
  // after every desk render: keep only the first open card open, and swap phone-irrelevant cards for a short note
  function tidy() {
    const sel = document.querySelector("#tabs [aria-selected=\"true\"]");
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "center" });
    if (!body.firstElementChild) return;
    [...body.querySelectorAll("section.grp.card:not(.fold)")].slice(1).forEach(o => { const ob = o.querySelector("button.fold"); if (ob) ob.click(); });
    const chips = body.querySelector("[data-mode]"), sec = chips && chips.closest("section.grp");
    if (sec && !big) {
      [...sec.children].forEach(c => { if (!c.matches("h3")) c.classList.add("phHide"); });
      const n = document.createElement("p"); n.className = "phNote";
      n.innerHTML = `בטלפון המראות אמיתיות: <b>משולש 60° בתפסנית</b>. המסך מציג רק את התא שבתוך המנסרה. כדי לראות כאן את הקליידוסקופ המלא לוחצים <b>⤢ עריכה</b>.`;
      sec.appendChild(n);
    }
  }
  let tidyQueued = false;
  new MutationObserver(() => { if (tidyQueued) return; tidyQueued = true; requestAnimationFrame(() => { tidyQueued = false; tidy(); }); }).observe(body, { childList: true });
  $p("phFull").onclick = () => { const el = document.documentElement; try { (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.then?.(() => { try { screen.orientation.lock("portrait").catch(() => {}); } catch (e) {} }).catch?.(() => toast("באייפון: שיתוף ← הוספה למסך הבית")); } catch (e) { toast("באייפון: שיתוף ← הוספה למסך הבית"); } };
  calRow.addEventListener("click", e => {
    const n = e.target.dataset && e.target.dataset.n; if (!n) return;
    const s = .5, f = cal.flip ? -1 : 1;
    if (n === "up") cal.dy += s * f; if (n === "down") cal.dy -= s * f; if (n === "right") cal.dx += s * f; if (n === "left") cal.dx -= s * f;
    saveCal(); layout();
  });
  $p("phPx").value = cal.px; $p("phSz").value = cal.sz; $p("phFlip").checked = !!cal.flip;
  $p("phPx").oninput = e => { cal.px = +e.target.value; saveCal(); layout(); };
  $p("phSz").oninput = e => { cal.sz = +e.target.value; saveCal(); layout(); };
  $p("phFlip").onchange = e => { cal.flip = e.target.checked; saveCal(); layout(); };

  // a thin white outline over the triangle while calibrating (drawn on top of the studio's overlay canvas)
  let showOutline = false, lastTri = null;
  const outline = document.createElement("canvas");
  outline.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3";
  stage.appendChild(outline);
  function drawOutline() {
    const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    outline.width = Math.round(r.width * d); outline.height = Math.round(r.height * d);
    const c = outline.getContext("2d"); c.clearRect(0, 0, outline.width, outline.height);
    if (!showOutline || !lastTri) return;
    c.strokeStyle = "#fff"; c.lineWidth = 1.5 * d; c.beginPath();
    lastTri.forEach((p, i) => c[i ? "lineTo" : "moveTo"](p[0] * d, p[1] * d)); c.closePath(); c.stroke();
    const cx = lastTri.reduce((s, p) => s + p[0], 0) / 3 * d, cy = lastTri.reduce((s, p) => s + p[1], 0) / 3 * d;
    c.strokeStyle = "#ff4f7b"; c.beginPath(); c.moveTo(cx - 8 * d, cy); c.lineTo(cx + 8 * d, cy); c.moveTo(cx, cy - 8 * d); c.lineTo(cx, cy + 8 * d); c.stroke();
  }

  function layout() {
    const W = innerWidth, H = innerHeight, pm = W / (kit.sw || 65) * cal.px;
    if (big) { // preview: a third of the screen shows the finished kaleidoscope, the desk gets the rest
      const bot = Math.round(Math.max(150, H * .32));
      document.body.classList.remove("flip");
      document.documentElement.style.setProperty("--phBot", bot + "px");
      document.documentElement.style.setProperty("--phTop", (H - bot) + "px");
      requestAnimationFrame(() => { lastTri = null; TRI = [[.5, .1], [.25, .9], [.75, .9]]; if (typeof resize === "function") resize(); drawOutline(); });
      return;
    }
    const capPx = Math.min(H - 180, (kit.cap + 1 + Math.abs(cal.dy)) * pm);
    document.body.classList.toggle("flip", !!cal.flip);
    document.documentElement.style.setProperty("--phBot", Math.round(capPx) + "px");
    document.documentElement.style.setProperty("--phTop", Math.max(180, H - Math.round(capPx)) + "px");
    requestAnimationFrame(() => {
      const r = stage.getBoundingClientRect();
      const cyB = (kit.ty + cal.dy) * pm;                         // centroid above the bottom edge of the screen
      let cx = W / 2 + (kit.tx - kit.sw / 2 + cal.dx) * pm - r.left;
      let cy = cal.flip ? cyB - r.top : r.bottom - cyB - r.top;
      if (cal.flip) cx = r.width - cx;
      const side = (kit.s * cal.sz + 2 * Math.sqrt(3) * 1.0) * pm, R = side / Math.sqrt(3), f = cal.flip ? -1 : 1;
      const v = [[cx, cy - R * f], [cx - side / 2 * f, cy + R / 2 * f], [cx + side / 2 * f, cy + R / 2 * f]];
      const vi = [[cx, cy - (R - 2 * pm) * f], [cx - (side / 2 - SQ * pm) * f, cy + (R / 2 - pm) * f], [cx + (side / 2 - SQ * pm) * f, cy + (R / 2 - pm) * f]];
      lastTri = vi; // outline sits on the mirror edge (inside the 1 mm bleed)
      TRI = v.map(p => [p[0] / r.width, p[1] / r.height]);
      if (typeof resize === "function") resize();
      drawOutline();
    });
  }
  const SQ = Math.sqrt(3);
  new ResizeObserver(layout).observe(document.body);
  addEventListener("orientationchange", () => setTimeout(layout, 300));
  layout();

  // the phone has real mirrors on top of it: always output the raw cell
  setInterval(() => {
    if (!big && P.mode !== "screen") { P.mode = "screen"; if (typeof render === "function") render(); }
    if (BOX) BOX = null;
    calib = false;
  }, 300);

  // ---------- selfie for the phone: front camera, then time to put the phone back ----------
  const ov = document.createElement("div"); ov.id = "phOv";
  ov.innerHTML = `<div class="flash"></div><video playsinline muted></video><div class="big"></div><div class="msg"></div><div class="strip"></div><div class="btns"></div>`;
  document.body.appendChild(ov);
  const ovV = ov.querySelector("video"), ovBig = ov.querySelector(".big"), ovMsg = ov.querySelector(".msg"), ovStrip = ov.querySelector(".strip"), ovBtns = ov.querySelector(".btns"), ovFlash = ov.querySelector(".flash");
  let run = 0, stream = null, ac = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function beep(f, d) {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = .0001; o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime; g.gain.exponentialRampToValueAtTime(.25, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.start(t); o.stop(t + d + .02);
    } catch (e) {}
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
  }
  function stopCam() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; ovV.srcObject = null; }
  function close() { run++; stopCam(); ov.classList.remove("on"); }
  function grab() {
    const vw = ovV.videoWidth, vh = ovV.videoHeight, s = document.createElement("canvas"); s.width = s.height = 512;
    if (typeof selfCropFrom === "function") selfCropFrom(s, ovV, vw, vh, null, true);
    else { const c = s.getContext("2d"), m = Math.min(vw, vh); c.translate(512, 0); c.scale(-1, 1); c.drawImage(ovV, (vw - m) / 2, (vh - m) / 2, m, m, 0, 0, 512, 512); }
    ovFlash.classList.add("on"); setTimeout(() => ovFlash.classList.remove("on"), 60); beep(1320, .12);
    const th = document.createElement("canvas"); th.width = th.height = 128; th.getContext("2d").drawImage(s, 0, 0, 128, 128); ovStrip.appendChild(th);
    return s;
  }
  let skip = false; // "start now" ends the put-back countdown early
  async function countdown(n, id, msg) {
    skip = false;
    for (let i = n; i > 0; i--) {
      if (id !== run) return false;
      ovBig.textContent = i; if (msg) ovMsg.textContent = msg; beep(i === 1 ? 990 : 660, .08);
      for (let j = 0; j < 10; j++) { await sleep(100); if (skip || id !== run) break; }
      if (skip) return id === run;
    }
    return id === run;
  }
  async function selfieFlow() {
    const id = ++run, minute = minuteOK && P.selfMode === "minute", nShots = minute ? 4 : 1;
    ov.classList.add("on"); ovStrip.innerHTML = ""; ovBig.textContent = ""; ovBtns.innerHTML = `<button type="button" data-a="cancel">ביטול</button>`;
    ovMsg.textContent = "פותח את המצלמה הקדמית…"; ovV.style.display = "";
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      ovV.srcObject = stream; await ovV.play();
    } catch (e) { ovMsg.textContent = "אין גישה למצלמה. צריך לאשר אותה בדפדפן (ובכתובת https)."; ovBtns.innerHTML = `<button type="button" data-a="cancel">סגירה</button>`; return; }
    for (let t = 0; t < 40 && ovV.readyState < 2; t++) await sleep(50);
    const shots = [];
    for (let k = 0; k < nShots; k++) {
      const msg = nShots > 1 ? `סלפי ${k + 1} מתוך ${nShots}` : "מחייכים למצלמה";
      if (!await countdown(k ? 2 : Math.max(1, P.selfCountdown | 0 || opt.count), id, msg)) return;
      shots.push(grab());
    }
    stopCam(); ovV.style.display = "none";
    // the visitor puts the phone back into the cradle
    ovBtns.innerHTML = `<button type="button" class="primary" data-a="go">התחלה עכשיו</button> <button type="button" data-a="cancel">ביטול</button>`;
    if (!await countdown(opt.back, id, "מחזירים את הטלפון לתפסנית ומסתכלים בעינית")) return;
    start(shots);
  }
  function start(shots) {
    run++; stopCam(); ov.classList.remove("on");
    if (!shots || !shots.length) return;
    const now = performance.now() / 1000;
    if (minuteOK && P.selfMode === "minute") { while (shots.length < 4) shots.push(shots[shots.length - 1]); minuteStart("files", now, shots); return; }
    // classic show: the same steps the studio takes after its own capture
    const shot = shots[0];
    SH.shot = shot; pixX.drawImage(shot, 0, 0, 64, 64); SH.pix = pixX.getImageData(0, 0, 64, 64).data;
    if (P.selfKeep) { SH.gallery.unshift(shot); SH.gallery.length = Math.min(SH.gallery.length, 8); }
    SH.count++;
    SFX.clear(); SFX.image(shot); SH.live = false; SH.w.fade = 0;
    SH.scenes = selfBuild(); SH.scene = 0; SH.state = "show"; SH.t0 = now; SH.flash = 1; flashV = 1.4; burst(2);
    if (P.selfPreset && P.selfPreset !== "keep") { const pr = PRESETS.find(p => p.id === P.selfPreset); if (pr) { SH.saved = { ...P }; applyPreset(pr, true); P.mode = "screen"; } }
  }
  ov.addEventListener("click", e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === "cancel") close();
    if (a === "go") skip = true;
  });
  $p("phSelfie").onclick = () => {
    if (typeof SFX === "undefined" || !SFX) { toast("המופע לא זמין בדפדפן הזה (WebGL)"); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("המצלמה זמינה רק בכתובת https"); return; }
    if (big) setBig(false);
    beep(880, .05); selfieFlow();
  };

  if (typeof render === "function") render(); // moves the tab strip into the panel (body.phonekit) and opens the asked tab
  toast(`מצב טלפון · ${kit.n || ""} · משולש ${kit.s} מ״מ. הכיול בכפתור "כיול".`, 3800);
})();
