// ---------------------------------------------------------------- 12 · desk, layers, effect builder, captions
// The desk: a top tab bar, a side panel of collapsible cards (a bottom sheet on a phone), a hide / swap-side toggle.
// Layers: a stack composited over the engine's source cell just before it goes to the mirrors (PRO.src → texImage2D).
//   Every layer is drawn in "cell space", locked to the mirror triangle: the mirror shader rotates and pans the source
//   (uRot, uPan), and the layer applies the same transform, so what you place in the triangle stays in the triangle.
// Effect builder: a chain of up to 6 warp / colour stages plus a feedback "flow" field (the previous frame is pushed
//   along the field, re-coloured and smeared, then the new frame is laid over it). Same building blocks as the selfie
//   show engine (pull, twirl, flow, ripple, melt, shatter, holo), generalised and modulated by kick / bass / voice / LFO.
// Captions: text locked to the cell (ring, globe with orbiting text, arc around a 60° vertex, ticker, word bursts, smear),
//   typed or from live speech (Web Speech API), plus triangle video in / out for the physical box.
const PRO = (() => {
  const CELL = SRC, HALF = CELL / 2, RTL_RE = /[֐-ࣿ]/;
  const IN_R = HALF / 2, TRI_H = HALF * 1.5, TRI_W = HALF * Math.sqrt(3) / 2; // tri60 cell: circumradius 256 px, inradius 128 px
  const svg = d => `<svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    mirrors: svg('<polygon points="11,2.5 2.5,18.5 19.5,18.5"/><path d="M11 2.5 V18.5"/>'),
    source: svg('<rect x="3" y="3" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="2"/><path d="M4 16 L9 11 L13 15 L15 13 L19 17"/>'),
    layers: svg('<path d="M11 3 L20 7.5 L11 12 L2 7.5 Z"/><path d="M2 11.5 L11 16 L20 11.5"/><path d="M2 15.5 L11 20 L20 15.5"/>'),
    fx: svg('<path d="M4 18 L14 8"/><path d="M15 3 V6 M13.5 4.5 H16.5 M19 8 V10 M18 9 H20 M8 3 V5 M7 4 H9"/><path d="M13 9 L15 7"/>'),
    caption: svg('<circle cx="11" cy="11" r="4.5"/><path d="M3.5 9 A8 8 0 0 1 18.5 9"/><path d="M18.5 13 A8 8 0 0 1 3.5 13"/><path d="M17 6.5 L18.5 9 L20.5 7"/>'),
    particles: svg('<circle cx="6" cy="7" r="1.6"/><circle cx="15" cy="5" r="1.2"/><circle cx="11" cy="12" r="2"/><circle cx="17" cy="15" r="1.5"/><circle cx="6" cy="17" r="1.2"/>'),
    music: svg('<path d="M8 17 V5 L18 3 V15"/><circle cx="6" cy="17" r="2.2"/><circle cx="16" cy="15" r="2.2"/>'),
    sensors: svg('<rect x="6" y="2.5" width="10" height="17" rx="2"/><path d="M10 16.5 H12"/>'),
    selfie: svg('<circle cx="11" cy="9" r="3.5"/><path d="M4.5 19 C5.5 15 16.5 15 17.5 19"/>'),
    presets: svg('<path d="M11 3 L13.2 8 L18.5 8.5 L14.5 12 L15.7 17.5 L11 14.6 L6.3 17.5 L7.5 12 L3.5 8.5 L8.8 8 Z"/>'),
    out: svg('<rect x="2.5" y="4" width="17" height="11" rx="1.5"/><path d="M8 18.5 H14 M11 15 V18.5"/>')
  };
  const chev = '<svg class="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 5.5 L7 9 L10.5 5.5"/></svg>';
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BLENDS = [["source-over", "רגיל"], ["lighter", "הוספת אור"], ["screen", "מסך"], ["multiply", "הכפלה"], ["overlay", "שכבת־על"], ["soft-light", "אור רך"], ["hard-light", "אור חזק"],
    ["difference", "הפרש"], ["exclusion", "החרגה"], ["color-dodge", "הבהרת צבע"], ["hue", "גוון"], ["color", "צבע"], ["luminosity", "בהירות"], ["destination-out", "מחיקה (מסכה)"]];
  const MODS = [["none", "קבוע"], ["kick", "קיק"], ["bass", "בס"], ["mid", "אמצע"], ["high", "גבוהים"], ["beat", "ביט"], ["heart", "לב"], ["voice", "קול"], ["lfo", "גל איטי"]];
  const COLORS = [["palette", "פלטת הסטודיו"], ["rainbow", "קשת זורמת"], ["solid", "צבע אחד"]];
  let rotNow = 0, beatsNow = 0;
  const modVal = (m, rate = 1) => { switch (m) { case "kick": return A.kick; case "bass": return A.bass; case "mid": return A.mid; case "high": return A.high; case "beat": return B.beat; case "heart": return H.env; case "voice": return CR.level; case "lfo": return .5 + .5 * Math.sin(T * 1.3 * rate); default: return 1; } };
  const modAmt = (a, m, rate) => m && m !== "none" ? a * (.2 + 1.6 * modVal(m, rate)) : a;
  const palC = (i, t, x, y) => pcol(i, t, x || 0, y || 0);
  const colorFn = (mode, solid) => mode === "solid" ? () => solid : mode === "rainbow" ? (i, t) => `hsl(${(i * 24 + t * 50) % 360},100%,64%)` : (i, t, x, y) => palC(i, t, x, y);

  // ------------------------------------------------ desk
  const desk = { folds: store.get("folds", {}) };
  function tabsHtml() { return TABS.map(([id, n]) => `<button type="button" role="tab" id="t_${id}" aria-selected="${tab === id}" data-tab="${id}" title="${n}">${ICON[id] || ""}<span>${n}</span></button>`).join(""); }
  function placeTabs() {
    const t = $("#tabs"), phone = document.body.classList.contains("phonekit");
    if (phone) { if (t.parentNode !== $("#panel")) $("#panel").insertBefore(t, $("#panelHead")); }
    else if (t.parentNode !== $("#topTabs")) $("#topTabs").appendChild(t);
    const cur = $("#t_" + tab); if (cur && cur.scrollIntoView && !placeTabs.done) { placeTabs.done = 1; cur.scrollIntoView({ block: "nearest", inline: "center" }); }
  }
  function cardify() {
    for (const s of $("#tabbody").querySelectorAll("section.grp")) {
      const h = s.querySelector(":scope > h3"); if (!h || h.querySelector(".fold")) continue;
      const key = tab + ":" + h.textContent.trim(); s.classList.add("card");
      h.innerHTML = `<button type="button" class="fold" data-fold="${esc(key)}"><span>${h.innerHTML}</span>${chev}</button>`;
      setFold(s, !!desk.folds[key]);
    }
    const n = TABS.find(x => x[0] === tab); $("#panelTitle").innerHTML = n ? (ICON[tab] || "") + `<span>${n[1]}</span>` : "";
  }
  function setFold(s, f) { s.classList.toggle("fold", f); const b = s.querySelector(".fold"); if (b) b.setAttribute("aria-expanded", String(!f)); }
  function deskApply() {
    document.body.classList.toggle("deskHidden", !!store.get("deskHidden", false));
    document.body.classList.toggle("deskLeft", !!store.get("deskLeft", false));
    const b = $("#panelTog"); if (b) { const hid = document.body.classList.contains("deskHidden"); b.setAttribute("aria-pressed", String(!hid)); b.title = hid ? "הצג את הפאנל (P)" : "הסתר את הפאנל (P)"; }
    setTimeout(resize, 0);
  }
  $("#topbar").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; store.set("tab", tab); if (document.body.classList.contains("deskHidden")) { store.set("deskHidden", false); deskApply(); } render(); return; }
    if (b.id === "panelTog") { store.set("deskHidden", !document.body.classList.contains("deskHidden")); deskApply(); }
    if (b.id === "panelSide") { store.set("deskLeft", !document.body.classList.contains("deskLeft")); deskApply(); }
  });
  $("#panelHead").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const all = [...$("#tabbody").querySelectorAll("section.grp.card")], f = b.id === "foldAll";
    if (b.id === "foldAll" || b.id === "openAll") { for (const s of all) { const k = s.querySelector(".fold")?.dataset.fold; if (k) { if (f) desk.folds[k] = 1; else delete desk.folds[k]; } setFold(s, f); } store.set("folds", desk.folds); }
  });
  window.addEventListener("keydown", e => {
    if (e.target.matches && e.target.matches("input, textarea, select")) return;
    if (e.code === "KeyP" && !e.metaKey && !e.ctrlKey) { store.set("deskHidden", !document.body.classList.contains("deskHidden")); deskApply(); }
  });

  // ------------------------------------------------ generic controls bound to an object: data-pk="ns:key"
  const fmtv = (v, step) => (+v).toFixed(step < 1 ? (step < .1 ? 2 : 1) : 0);
  const pid = (ns, k) => `p_${ns}_${k}`;
  function prg(ns, o, k, label, min, max, step) { const id = pid(ns, k); return `<div class="ctl"><label for="${id}">${label}</label><input type="range" id="${id}" data-pk="${ns}:${k}" min="${min}" max="${max}" step="${step}" value="${o[k]}"><output id="${id}_o">${fmtv(o[k], step)}</output></div>`; }
  function psl(ns, o, k, label, opts, num) { const id = pid(ns, k); return `<div class="ctl"><label for="${id}">${label}</label><select id="${id}" data-pk="${ns}:${k}"${num ? " data-num" : ""} style="grid-column: span 2">${opts.map(([v, n]) => `<option value="${v}"${String(o[k]) === String(v) ? " selected" : ""}>${n}</option>`).join("")}</select></div>`; }
  function ptg(ns, o, k, label) { return `<label class="tog"><input type="checkbox" id="${pid(ns, k)}" data-pk="${ns}:${k}"${o[k] ? " checked" : ""}> ${label}</label>`; }
  function pcl(ns, o, k, label) { const id = pid(ns, k); return `<div class="ctl"><label for="${id}">${label}</label><input type="color" id="${id}" data-pk="${ns}:${k}" value="${esc(o[k])}" style="grid-column: span 2;width:100%;height:30px;background:var(--well);border:1px solid var(--line);border-radius:7px"></div>`; }
  function ptx(ns, o, k, label, area) { const id = pid(ns, k); return area ? `<label class="lab" for="${id}">${label}</label><textarea id="${id}" data-pk="${ns}:${k}" rows="2" class="txt" spellcheck="false">${esc(o[k])}</textarea>` : `<div class="ctl"><label for="${id}">${label}</label><input type="text" id="${id}" data-pk="${ns}:${k}" value="${esc(o[k])}" class="txt" style="grid-column: span 2"></div>`; }
  function target(ns) {
    if (ns === "l") return selLayer(); if (ns === "b") return LY.base; if (ns === "c") return CAP;
    if (ns === "fx") return curFx(); if (ns === "f") return curFx()?.fl; if (ns[0] === "s") return curFx()?.st[+ns.slice(1)]; return null;
  }
  function saveNs(ns) { if (ns === "l" || ns === "b") lsave(); else if (ns === "c") csave(); else fxsave(); }

  // ------------------------------------------------ layers
  const LDEF = { on: true, op: 1, blend: "source-over", x: 0, y: 0, sc: 1, rot: 0, spin: 0, lock: true, react: "none", ra: .3, trail: 0, fx: "" };
  const LTYPES = {
    text: { n: "טקסט", d: { text: "קליידוסקופ", size: 56, weight: 800, color: "palette", col: "#ffffff", glow: .6, stroke: 0, arc: 0 } },
    shape: { n: "צורה", d: { shape: "flower", count: 6, size: 90, width: 3, color: "palette", col: "#7cf2dc", glow: .5, fill: false } },
    grad: { n: "צבע", d: { kind: "radial", hs: .2, color: "palette", col: "#7cf2dc", blend: "screen", op: .6 } },
    media: { n: "תמונה / וידאו", d: { fit: "cover", tri: 0, flip: false } },
    camera: { n: "מצלמה", d: { fit: "cover" } },
    caption: { n: "כיתוב", d: {} },
    adjust: { n: "אפקט על מה שמתחת", d: { fx: "river" } }
  };
  const TICON = { text: "T", shape: "✦", grad: "◐", media: "▣", camera: "◉", caption: "◌", adjust: "≈" };
  const LY = Object.assign({ base: { on: true, op: 1, blend: "source-over" }, list: [], sel: null }, store.get("layers", {}));
  LY.list = (LY.list || []).filter(l => LTYPES[l.type]);
  const LR = new Map();
  let uid = Math.floor(Date.now() % 1e7);
  function lsave() { store.set("layers", { base: LY.base, list: LY.list, sel: LY.sel }); }
  function selLayer() { return LY.list.find(l => l.id === LY.sel) || null; }
  function addLayer(type, extra = {}, at) {
    const l = Object.assign({ id: "L" + (++uid), type, name: LTYPES[type].n }, LDEF, LTYPES[type].d, extra);
    if (at == null) LY.list.push(l); else LY.list.splice(at, 0, l);
    LY.sel = l.id; lsave(); return l;
  }
  function rt(l) { let r = LR.get(l.id); if (!r) { const cv = document.createElement("canvas"); cv.width = cv.height = CELL; r = { cv, cx: cv.getContext("2d"), el: null, fi: {} }; LR.set(l.id, r); } return r; }
  function dropLayer(id) { const r = LR.get(id); if (r) { FX.free(r.fi); if (r.el && r.el.src && r.el.src.startsWith("blob:")) URL.revokeObjectURL(r.el.src); LR.delete(id); } }
  // cell space: x right, y down, origin at the triangle centroid, 1 unit = 1 source pixel; follows the mirror rotation
  function cellXf(c, lock, t) {
    const panx = Math.sin(t * .05) * .05, pany = Math.cos(t * .04) * .05;
    if (lock) { const co = Math.cos(rotNow), s = Math.sin(rotNow); c.setTransform(co, s, -s, co, HALF + CELL * panx, HALF - CELL * pany); }
    else c.setTransform(1, 0, 0, 1, HALF, HALF);
  }
  const triPath = (c, k = 1) => { c.beginPath(); c.moveTo(0, -HALF * k); c.lineTo(-TRI_W * k, IN_R * k); c.lineTo(TRI_W * k, IN_R * k); c.closePath(); };
  function cover(c, el, w, h, mirror) {
    const s = Math.max(CELL / w, CELL / h); c.save(); if (mirror) c.scale(-1, 1); c.drawImage(el, -w * s / 2, -h * s / 2, w * s, h * s); c.restore();
  }
  // affine map from three source points to three destination points
  function affine(s, d) {
    const [x0, y0] = s[0], [x1, y1] = s[1], [x2, y2] = s[2], det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(det) < 1e-9) return [1, 0, 0, 1, 0, 0];
    const sol = (v0, v1, v2) => { const a = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det, b = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det; return [a, b, v0 - a * x0 - b * y0]; };
    const X = sol(d[0][0], d[1][0], d[2][0]), Y = sol(d[0][1], d[1][1], d[2][1]);
    return [X[0], Y[0], X[1], Y[1], X[2], Y[2]];
  }
  const CELL_TRI = [[0, -HALF], [-TRI_W, IN_R], [TRI_W, IN_R]];
  function glowText(c, s, x, y, col, glow, stroke) {
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = glow * 28;
    if (stroke > 0) { c.lineWidth = stroke; c.strokeStyle = "rgba(0,0,0,.85)"; c.strokeText(s, x, y); }
    c.fillText(s, x, y);
  }
  function paintLayer(l, c, r, t, m) {
    const cf = colorFn(l.color, l.col);
    if (l.type === "text") {
      c.font = `${l.weight} ${l.size}px Heebo, "Segoe UI", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      if (l.arc > 0) { ringText(c, String(l.text).replace(/\n/g, " ") + "  ", l.arc * IN_R * 1.8, -Math.PI / 2 + l.spin * t * 0, l.size, cf, t, l.glow, l.stroke, false); return; }
      const lines = String(l.text || "").split("\n");
      lines.forEach((s, i) => glowText(c, s, 0, (i - (lines.length - 1) / 2) * l.size * 1.12, cf(i, t, i * 40, 0), l.glow, l.stroke));
    } else if (l.type === "shape") {
      const n = Math.max(1, l.count | 0), R = l.size; c.lineWidth = l.width; c.shadowBlur = l.glow * 24;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, col = cf(i, t, Math.cos(a) * R, Math.sin(a) * R); c.strokeStyle = c.fillStyle = c.shadowColor = col; c.beginPath();
        if (l.shape === "flower") c.arc(Math.cos(a) * R * .5, Math.sin(a) * R * .5, R * .5, 0, TAU);
        else if (l.shape === "rays") { c.moveTo(Math.cos(a) * R * .15, Math.sin(a) * R * .15); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
        else if (l.shape === "dots") c.arc(Math.cos(a + t * .5) * R, Math.sin(a + t * .5) * R, l.width * 2.2, 0, TAU);
        else if (l.shape === "rings") c.arc(0, 0, R * (i + 1) / n, 0, TAU);
        else if (l.shape === "star" || l.shape === "poly") {
          if (i) continue; const k = l.shape === "star" ? 2 : 1, pts = n < 3 ? 3 : n;
          for (let j = 0; j <= pts * k; j++) { const aa = -Math.PI / 2 + j * TAU / (pts * k), rr = l.shape === "star" && j % 2 ? R * .45 : R; j ? c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : c.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
          c.closePath();
        }
        if (l.fill && l.shape !== "rays") { c.globalAlpha = .35; c.fill(); c.globalAlpha = 1; }
        c.stroke();
      }
    } else if (l.type === "grad") {
      const pal = (PALETTES[P.palette] || {}).c, cols = l.color === "solid" ? [l.col, "#000000"] : pal || ["hsl(" + (t * 40 % 360) + ",100%,60%)", "hsl(" + ((t * 40 + 120) % 360) + ",100%,55%)", "hsl(" + ((t * 40 + 240) % 360) + ",100%,50%)"];
      let g;
      if (l.kind === "sweep" && c.createConicGradient) g = c.createConicGradient(t * l.hs * 2, 0, 0);
      else if (l.kind === "linear") { const a = t * l.hs; g = c.createLinearGradient(Math.cos(a) * -HALF, Math.sin(a) * -HALF, Math.cos(a) * HALF, Math.sin(a) * HALF); }
      else g = c.createRadialGradient(0, 0, 0, 0, 0, HALF * (.7 + .3 * Math.sin(t * l.hs * 3)));
      const k = Math.floor(t * l.hs * 2); cols.forEach((col, i) => g.addColorStop(i / Math.max(1, cols.length - (l.kind === "sweep" ? 0 : 1)), cols[(i + k) % cols.length]));
      if (l.kind === "sweep") g.addColorStop(1, cols[k % cols.length]);
      c.fillStyle = g; c.fillRect(-CELL, -CELL, CELL * 2, CELL * 2);
    } else if (l.type === "media" || l.type === "camera") {
      const el = l.type === "camera" ? (cam.on && camV.readyState >= 2 ? camV : null) : r.el;
      if (!el) return; const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight; if (!w || !h) return;
      if (l.type === "media" && l.fit === "tri") {
        // the frame holds a triangle (apex at the top centre, base along the bottom): map it onto the mirror cell
        const src = [[w / 2, 0], [0, h], [w, h]], k = ((l.tri | 0) % 3 + 3) % 3, dst = [0, 1, 2].map(i => CELL_TRI[(i + k) % 3]);
        if (l.flip) { const tmp = src[1]; src[1] = src[2]; src[2] = tmp; }
        c.save(); triPath(c); c.clip(); c.transform(...affine(src, dst)); c.drawImage(el, 0, 0); c.restore();
      } else cover(c, el, w, h, l.type === "camera" ? cam.facing === "user" : l.flip);
    } else if (l.type === "caption") capPaint(c, t);
  }
  const lc = document.createElement("canvas"); lc.width = lc.height = CELL; const lx = lc.getContext("2d");
  function src() {
    const t = T; capTick();
    const vis = LY.list.filter(l => l.on);
    if (!vis.length && LY.base.on && LY.base.op >= 1 && LY.base.blend === "source-over") return sc;
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = "source-over"; lx.globalAlpha = 1; lx.fillStyle = "#000"; lx.fillRect(0, 0, CELL, CELL);
    if (LY.base.on) { lx.globalAlpha = LY.base.op; lx.globalCompositeOperation = LY.base.blend; lx.drawImage(sc, 0, 0); }
    for (const l of vis) {
      let out = null;
      try {
        const r = rt(l), m = l.react === "none" ? 0 : modVal(l.react);
        if (l.type === "adjust") { lx.globalAlpha = 1; lx.globalCompositeOperation = "source-over"; out = FX.run(r.fi, lc, l.fx, t); }
        else {
          const c = r.cx; c.setTransform(1, 0, 0, 1, 0, 0); c.shadowBlur = 0; c.globalAlpha = 1;
          if (l.trail > 0) { c.globalCompositeOperation = "destination-out"; c.fillStyle = `rgba(0,0,0,${(1 - l.trail).toFixed(3)})`; c.fillRect(0, 0, CELL, CELL); } else c.clearRect(0, 0, CELL, CELL);
          c.globalCompositeOperation = "source-over";
          cellXf(c, l.lock, t);
          const k = l.sc * (1 + l.ra * m); c.translate(l.x * HALF, l.y * HALF); c.rotate(l.rot + l.spin * t); c.scale(k, k);
          paintLayer(l, c, r, t, m); c.setTransform(1, 0, 0, 1, 0, 0); c.shadowBlur = 0;
          out = l.fx && fxGet(l.fx) ? FX.run(r.fi, r.cv, l.fx, t) : r.cv;
        }
      } catch (e) { console.warn(e); }
      if (!out) continue;
      lx.globalAlpha = clamp(l.op, 0, 1); lx.globalCompositeOperation = l.blend || "source-over"; lx.drawImage(out, 0, 0);
    }
    lx.globalAlpha = 1; lx.globalCompositeOperation = "source-over";
    return lc;
  }
  function moveLayer(id, to) { const i = LY.list.findIndex(l => l.id === id); if (i < 0) return; const [l] = LY.list.splice(i, 1); LY.list.splice(clamp(to, 0, LY.list.length), 0, l); lsave(); }
  function mediaInto(l, f) {
    const r = rt(l), url = URL.createObjectURL(f);
    if (r.el && r.el.src && r.el.src.startsWith("blob:")) URL.revokeObjectURL(r.el.src);
    if (f.type.startsWith("video")) { const v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.src = url; v.play().catch(() => {}); r.el = v; }
    else { const i = new Image(); i.src = url; r.el = i; }
    l.name = f.name.replace(/\.[^.]+$/, "").slice(0, 40); lsave();
  }
  let fileFor = null; // which layer (or "new" / "newTri") the hidden file picker loads into
  const filePick = document.createElement("input"); filePick.type = "file"; filePick.accept = "image/*,video/*"; filePick.hidden = true; document.body.appendChild(filePick);
  filePick.addEventListener("change", () => {
    const f = filePick.files[0]; filePick.value = ""; if (!f) return;
    let l = fileFor && fileFor.id ? fileFor : null;
    if (!l) { const capI = LY.list.findIndex(x => x.type === "caption"); l = addLayer("media", fileFor === "newTri" ? { fit: "tri" } : {}, fileFor === "newTri" && capI >= 0 ? capI : undefined); }
    mediaInto(l, f); render(); toast("נטען: " + f.name);
  });
  function layersTab() {
    let h = `<section class="grp"><h3>הוספת שכבה</h3><div class="addrow">
      ${["text", "shape", "grad", "media", "camera", "caption", "adjust"].map(t => `<button type="button" data-ladd="${t}"><span class="ti">${TICON[t]}</span>${t === "adjust" ? "אפקט" : LTYPES[t].n}</button>`).join("")}</div>
      <p class="note">כל שכבה נכנסת לתא שבין המראות, מעל הסצנה. השכבה העליונה ברשימה מצוירת אחרונה. גוררים שורה כדי לשנות סדר.</p></section>`;
    const rows = LY.list.slice().reverse().map(l => {
      const fx = l.fx && fxGet(l.fx);
      return `<div class="lyr${l.on ? "" : " off"}" draggable="true" data-lsel="${l.id}" aria-selected="${LY.sel === l.id}" role="option">
        <button type="button" data-la="vis" data-lid="${l.id}" aria-pressed="${l.on}" aria-label="${l.on ? "הסתר" : "הצג"} את ${esc(l.name)}">${l.on ? "👁" : "◌"}</button>
        <span class="ti">${TICON[l.type]}</span>
        <span class="nm">${esc(l.name)}<small>${(BLENDS.find(b => b[0] === l.blend) || BLENDS[0])[1]} · ${Math.round(l.op * 100)}%${fx ? " · " + esc(fx.name) : ""}</small></span>
        <span class="acts"><button type="button" data-la="up" data-lid="${l.id}" aria-label="העלה">▲</button><button type="button" data-la="down" data-lid="${l.id}" aria-label="הורד">▼</button><button type="button" data-la="dup" data-lid="${l.id}" aria-label="שכפל">⧉</button><button type="button" data-la="del" data-lid="${l.id}" aria-label="מחק">✕</button></span></div>`;
    }).join("");
    h += `<section class="grp"><h3>ערימת השכבות</h3><div class="lyrs" id="lyrs" role="listbox" aria-label="שכבות">${rows}
      <div class="lyr base${LY.base.on ? "" : " off"}"><button type="button" data-la="basevis" aria-pressed="${LY.base.on}" aria-label="הצג או הסתר את הסצנה">${LY.base.on ? "👁" : "◌"}</button><span class="ti">◇</span><span class="nm">הסצנה<small>רקע, חלקיקים, מצלמה ומדיה מלשונית מקור</small></span><span></span></div></div>
      ${prg("b", LY.base, "op", "שקיפות הסצנה", 0, 1, .01)}${psl("b", LY.base, "blend", "מיזוג הסצנה", BLENDS)}
      ${LY.list.length ? "" : `<p class="note">עוד אין שכבות. התחילו ב<b>טקסט</b>, ב<b>כיתוב</b> או ב<b>אפקט</b> שזורם על כל התמונה.</p>`}</section>`;
    const l = selLayer();
    if (l) {
      h += `<section class="grp"><h3>מאפייני השכבה · ${esc(LTYPES[l.type].n)}</h3>` + ptx("l", l, "name", "שם") + prg("l", l, "op", "שקיפות", 0, 1, .01) + psl("l", l, "blend", "מיזוג", BLENDS);
      if (l.type !== "adjust") {
        h += prg("l", l, "x", "מיקום ימינה", -1, 1, .01) + prg("l", l, "y", "מיקום למטה", -1, 1, .01) + prg("l", l, "sc", "גודל", .1, 4, .01) + prg("l", l, "rot", "סיבוב", -3.14, 3.14, .01) + prg("l", l, "spin", "סיבוב רציף", -2, 2, .01)
          + psl("l", l, "react", "מגיב ל", MODS) + (l.react !== "none" ? prg("l", l, "ra", "עוצמת התגובה", 0, 2, .01) : "") + prg("l", l, "trail", "שובל", 0, .98, .01) + ptg("l", l, "lock", "נעול לתא המראות (מסתובב איתו)");
      }
      if (l.type === "text") h += ptx("l", l, "text", "הטקסט", true) + prg("l", l, "size", "גודל אות", 10, 200, 1) + psl("l", l, "weight", "עובי", [["400", "רגיל"], ["600", "בינוני"], ["800", "עבה"], ["900", "שחור"]]) + prg("l", l, "arc", "עיגול (0 = שורה)", 0, 1, .01) + prg("l", l, "glow", "זוהר", 0, 1.5, .01) + prg("l", l, "stroke", "קו מתאר", 0, 12, .5);
      if (l.type === "shape") h += psl("l", l, "shape", "צורה", [["flower", "פרח"], ["rings", "טבעות"], ["star", "כוכב"], ["poly", "מצולע"], ["rays", "קרניים"], ["dots", "נקודות במסלול"]]) + prg("l", l, "count", "כמות", 1, 24, 1) + prg("l", l, "size", "רדיוס", 10, 260, 1) + prg("l", l, "width", "עובי קו", .5, 20, .5) + prg("l", l, "glow", "זוהר", 0, 1.5, .01) + ptg("l", l, "fill", "מילוי");
      if (l.type === "grad") h += psl("l", l, "kind", "סוג", [["radial", "עגול"], ["linear", "קווי"], ["sweep", "מניפה"]]) + prg("l", l, "hs", "מהירות", 0, 2, .01);
      if (l.type === "text" || l.type === "shape" || l.type === "grad") h += psl("l", l, "color", "צבע", COLORS) + (l.color === "solid" ? pcl("l", l, "col", "בחירת צבע") : "");
      if (l.type === "media") h += psl("l", l, "fit", "התאמה", [["cover", "ממלא את התא"], ["tri", "משולש בווידאו ← משולש המראות"]]) + (l.fit === "tri" ? psl("l", l, "tri", "סיבוב המשולש", [["0", "קודקוד למעלה"], ["1", "120°"], ["2", "240°"]], true) : "") + ptg("l", l, "flip", "היפוך מראה")
        + `<div class="row"><button type="button" data-la="file" data-lid="${l.id}">${rt(l).el ? "החלף קובץ" : "טען קובץ"}</button></div>${rt(l).el ? "" : `<p class="note">קבצים לא נשמרים בדפדפן. אחרי רענון טוענים אותם שוב.</p>`}`;
      if (l.type === "camera") h += `<div class="row"><button type="button" data-la="cam">${cam.on ? "■ עצור מצלמה" : "📷 הפעל מצלמה"}</button></div>`;
      if (l.type === "caption") h += `<div class="row"><button type="button" data-tab="caption">עריכת הכיתוב ←</button></div>`;
      h += psl("l", l, "fx", l.type === "adjust" ? "האפקט" : "אפקט על השכבה", [["", "בלי"], ...FXL.map(f => [f.id, f.name])]) + `<div class="row"><button type="button" data-la="editfx" data-lid="${l.id}"${l.fx ? "" : " disabled"}>ערוך את האפקט בבונה ←</button></div></section>`;
    }
    return h;
  }

  // ------------------------------------------------ effect builder
  const OPS = [[0, "—"], [1, "מערבולת"], [2, "שאיבה למרכז"], [3, "אדוות"], [4, "קליידו פנימי"], [5, "שברי מראה"], [6, "גל"], [7, "פיקסלים"], [8, "מראה כפולה"], [9, "נמס"], [10, "עדשה"],
    [20, "סיבוב גוון"], [21, "הולוגרמה"], [22, "פוסטר"], [23, "קווי ניאון"], [24, "היפוך"], [25, "פיצול RGB"], [26, "זוהר"], [27, "הבזק בקיק"], [28, "רוויה"], [29, "קשת צבעים"]];
  const FIELDS = [[0, "בלי זרימה"], [1, "זרימה אורגנית"], [2, "מערבולת"], [3, "התפשטות החוצה"], [4, "שאיבה פנימה"], [5, "רוח בכיוון"], [6, "חום עולה"], [7, "גלקסיה ספירלית"]];
  const INJ = [[0, "מעל: השכבה משאירה שובל"], [1, "מיזוג: כל התמונה נמרחת"], [2, "הבהיר מבין השניים"]];
  const stg = (op, a, o = {}) => Object.assign({ op, a, m: "none", sp: 1, de: .5 }, o);
  const flw = o => Object.assign({ f: 1, a: 1, m: "none", keep: .9, sc: 3, sp: 1, hue: 0, smear: 0, dir: 1.57, inj: 1 }, o);
  const FX_PRESETS = [
    { id: "capSmear", name: "מריחת כיתוב", st: [stg(20, .25, { sp: .4 }), stg(27, .7)], fl: flw({ f: 1, a: 1.2, keep: .9, sc: 3.2, hue: .5, smear: .5, inj: 0 }) },
    { id: "river", name: "נהר צבעים", st: [stg(29, .35, { sp: .6 })], fl: flw({ f: 1, a: 1, keep: .9, inj: 1, hue: .25 }) },
    { id: "vortex", name: "מערבולת", st: [stg(1, .45, { sp: 1 })], fl: flw({ f: 2, a: 1.5, keep: .88, inj: 1, smear: .5 }) },
    { id: "galaxy", name: "גלקסיה", st: [stg(26, .5, { de: .5 })], fl: flw({ f: 7, a: 1.2, keep: .93, inj: 2, hue: .3 }) },
    { id: "heat", name: "חום עולה", st: [stg(9, .35)], fl: flw({ f: 6, a: 1.3, keep: .9, inj: 0, sc: 4 }) },
    { id: "shards", name: "שברים בקיק", st: [stg(5, .6, { m: "kick" }), stg(25, .5, { m: "kick" })], fl: flw({ f: 3, a: .8, keep: .7, inj: 2 }) },
    { id: "neon", name: "ניאון פועם", st: [stg(23, .9), stg(20, .3, { sp: .3 })], fl: flw({ f: 4, a: .6, keep: .8, inj: 2 }) },
    { id: "dream", name: "חלום", st: [stg(6, .5, { sp: .5 }), stg(10, .4)], fl: flw({ f: 1, a: .7, keep: .86, inj: 1, smear: 1 }) }
  ];
  const clone = o => JSON.parse(JSON.stringify(o));
  let FXL = store.get("fxlib", null); if (!Array.isArray(FXL) || !FXL.length) FXL = clone(FX_PRESETS);
  let fxCur = store.get("fxCur", FXL[0].id);
  const fxGet = id => FXL.find(f => f.id === id);
  const curFx = () => fxGet(fxCur) || FXL[0];
  function fxsave() { store.set("fxlib", FXL); store.set("fxCur", fxCur); }
  const FX = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = CELL;
    const g = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!g) return { run: (i, input) => input, free() {} };
    const FSRC = `precision highp float;
uniform sampler2D uImg, uPrev; uniform vec2 uC; uniform float uT, uBass, uKick, uFirst;
uniform float uOp[6], uAmt[6]; uniform vec4 uPar[6];
uniform float uField, uFlow, uKeep, uFScale, uFSpeed, uHueDrift, uSmear, uFDir, uInject;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
vec2 curl(vec2 p){ const float e = .07; float a = noise(p + vec2(0., e)), b = noise(p - vec2(0., e)), c = noise(p + vec2(e, 0.)), d = noise(p - vec2(e, 0.)); return vec2(a - b, d - c) / (2. * e); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 hueRot(vec3 c, float a){
  const mat3 toY = mat3(.299,.596,.211, .587,-.274,-.523, .114,-.322,.312);
  const mat3 toR = mat3(1.,1.,1., .956,-.272,-1.106, .621,-.647,1.703);
  vec3 y = toY * c; float h = atan(y.z, y.y + 1e-6) + a, ch = length(y.yz);
  return toR * vec3(y.x, ch * cos(h), ch * sin(h)); }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec2 field(vec2 uv){
  vec2 d = uv - uC; float r = length(d) + 1e-4;
  if (uField < .5) return vec2(0.);
  if (uField < 1.5) return curl(uv * uFScale + vec2(uT * .11, -uT * .07) * uFSpeed);
  if (uField < 2.5) return vec2(-d.y, d.x) / r * smoothstep(0., .25, r) * (1. + .3 * sin(r * uFScale * 4. - uT * uFSpeed * 2.));
  if (uField < 3.5) return d / r * (.4 + .6 * noise(vec2(atan(d.y, d.x) * 3., uT * uFSpeed)));
  if (uField < 4.5) return -d / r * smoothstep(0., .15, r);
  if (uField < 5.5) return vec2(cos(uFDir), sin(uFDir)) + .35 * curl(uv * uFScale + uT * .1 * uFSpeed);
  if (uField < 6.5) return vec2((noise(uv * uFScale * 2. + uT * .3 * uFSpeed) - .5) * 1.2, 1.);
  return (vec2(-d.y, d.x) * 1.5 - d * .6) / r;
}
void main(){
  vec2 uv = gl_FragCoord.xy / 512., s = uv;
  for (int i = 0; i < 6; i++){
    float op = uOp[i], a = uAmt[i]; vec4 q = uPar[i];
    if (op < .5 || op > 19.5 || a < .001) continue;
    vec2 d = s - uC; float r = length(d);
    if (op < 1.5){ float an = a * 3.4 * pow(max(0., 1. - r / .7), 2.) * sin(uT * q.x * .5 + 1.); s = uC + rot(an) * d; }
    else if (op < 2.5) s = uC + d * (1. + a * .9 * smoothstep(.7, 0., r) * (.55 + .45 * sin(uT * q.x)));
    else if (op < 3.5) s += d / (r + 1e-4) * sin(r * 96. * q.y - uT * 5. * q.x) * .011 * a * (1. + 2.5 * uBass);
    else if (op < 4.5){ float n = floor(3. + q.y * 9.), w = 3.14159265 / n, an = atan(d.y, d.x) + uT * q.x * .2; an = mod(an, 2. * w); an = abs(an - w); s = mix(s, uC + r * vec2(cos(an), sin(an)), a); }
    else if (op < 5.5){ vec2 g = s * (3. + q.y * 10.); vec2 sk = vec2(g.x - g.y * .57735, g.y * 1.1547); vec2 id = floor(sk); float up = step(1., fract(sk.x) + fract(sk.y));
      vec2 cid = id * 2. + up; vec2 o = vec2(hash(cid), hash(cid + 7.)) - .5; float ph = sin(uT * .8 * q.x + hash(cid + 3.) * 6.2831853); s += o * .1 * a * (.3 + .7 * ph * ph + uKick * .6); }
    else if (op < 6.5){ s.x += sin(s.y * (6. + q.y * 30.) + uT * 3. * q.x) * .03 * a; s.y += cos(s.x * (6. + q.y * 30.) * .7 + uT * 2. * q.x) * .015 * a; }
    else if (op < 7.5){ float px = mix(256., 10., a); s = (floor(s * px) + .5) / px; }
    else if (op < 8.5){ if (a > .5) s = uC + abs(d) * vec2(1., 1.); }
    else if (op < 9.5) s.y += a * .07 * noise(vec2(s.x * 16. * (.5 + q.y), uT * .2 * q.x));
    else s = uC + d * (1. - a * .6 * smoothstep(.45, 0., r));
  }
  vec4 c4 = texture2D(uImg, s); vec3 col = c4.rgb; float al = c4.a;
  for (int i = 0; i < 6; i++){
    float op = uOp[i], a = uAmt[i]; vec4 q = uPar[i];
    if (op < 19.5 || a < .001) continue;
    if (op < 20.5) col = hueRot(col, a * 3.14159 + uT * q.x);
    else if (op < 21.5){ float l = lum(col) / max(al, .001); col = mix(col, (.5 + .5 * cos(6.2831853 * (l * 1.4 + uT * .05 * q.x + vec3(0., .33, .67)))) * (.15 + l * 1.05) * al, a); }
    else if (op < 22.5){ float lv = 2. + (1. - q.y) * 8.; col = mix(col, floor(col * lv + .5) / lv, a); }
    else if (op < 23.5){ float e = 1.5 / 512.;
      float gx = lum(texture2D(uImg, s + vec2(e, 0.)).rgb) - lum(texture2D(uImg, s - vec2(e, 0.)).rgb), gy = lum(texture2D(uImg, s + vec2(0., e)).rgb) - lum(texture2D(uImg, s - vec2(0., e)).rgb);
      float ed = smoothstep(.03, .25, length(vec2(gx, gy)));
      vec3 h = .5 + .5 * cos(6.2831853 * (s.y * 1.5 + uT * .2 * q.x + vec3(0., .33, .67)));
      col = mix(col, h * ed * 1.6, a); al = max(al, ed * a); }
    else if (op < 24.5) col = mix(col, vec3(al) - col, a);
    else if (op < 25.5){ vec2 o = (s - uC) * .07 * a * (1. + 2. * uKick); col.r = texture2D(uImg, s + o).r; col.b = texture2D(uImg, s - o).b; }
    else if (op < 26.5){ vec4 b = vec4(0.); float rr = (3. + q.y * 10.) / 512.; for (int k = 0; k < 8; k++){ float an = float(k) * .785398; b += texture2D(uImg, s + vec2(cos(an), sin(an)) * rr); } col += b.rgb / 8. * a; al = max(al, b.a / 8. * a); }
    else if (op < 27.5) col *= 1. + a * uKick * 1.5;
    else if (op < 28.5){ float l = lum(col); col = mix(vec3(l), col, 1. + a * 1.5); }
    else col *= mix(vec3(1.), .6 + .6 * cos(6.2831853 * (uv.x + uv.y) * (.5 + q.y * 2.) + uT * q.x + vec3(0., 2.1, 4.2)), a);
  }
  // the flow: last frame pushed along the field, recoloured and smeared, then the new frame goes over / into it
  vec2 f = field(uv);
  vec2 pa = uv - f * .006 * uFlow;
  vec4 pv = texture2D(uPrev, pa);
  if (uSmear > .001){ vec2 o = normalize(f + 1e-5) * .004 * uSmear; pv = (pv * 2. + texture2D(uPrev, pa + o) + texture2D(uPrev, pa - o) + texture2D(uPrev, pa + vec2(-o.y, o.x))) / 5.; }
  pv.rgb = hueRot(pv.rgb, uHueDrift * .06);
  pv *= uFirst;
  vec4 fr = vec4(clamp(col, 0., 1.), clamp(al, 0., 1.)); fr.rgb = min(fr.rgb, vec3(fr.a));
  vec4 o;
  if (uInject < .5) o = fr + pv * uKeep * (1. - fr.a);
  else if (uInject < 1.5) o = mix(fr, pv, uKeep * uFirst);
  else o = max(fr, pv * uKeep);
  gl_FragColor = clamp(o, 0., 1.);
}`;
    const CP = `precision mediump float; uniform sampler2D uPrev; void main(){ gl_FragColor = texture2D(uPrev, gl_FragCoord.xy / 512.); }`;
    const V = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
    const mk = fs => { const p = g.createProgram(); for (const [t, s] of [[g.VERTEX_SHADER, V], [g.FRAGMENT_SHADER, fs]]) { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) console.error(g.getShaderInfoLog(o)); g.attachShader(p, o); } g.linkProgram(p); return p; };
    const pf = mk(FSRC), pc = mk(CP);
    const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const texOf = () => { const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v); return t; };
    const img = texOf();
    const UN = ["uImg", "uPrev", "uC", "uT", "uBass", "uKick", "uFirst", "uOp[0]", "uAmt[0]", "uPar[0]", "uField", "uFlow", "uKeep", "uFScale", "uFSpeed", "uHueDrift", "uSmear", "uFDir", "uInject"];
    const U2 = {}; UN.forEach(n => U2[n] = g.getUniformLocation(pf, n)); const Uc = g.getUniformLocation(pc, "uPrev");
    const bindA = p => { g.useProgram(p); const l = g.getAttribLocation(p, "a"); g.bindBuffer(g.ARRAY_BUFFER, buf); g.enableVertexAttribArray(l); g.vertexAttribPointer(l, 2, g.FLOAT, false, 0, 0); };
    const mkFb = () => [0, 1].map(() => { const t = texOf(); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, CELL, CELL, 0, g.RGBA, g.UNSIGNED_BYTE, null); const f = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, f); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); return { t, f }; });
    return {
      run(I, input, id, t) {
        const d = fxGet(id); if (!d) return input;
        if (!I.fb) { I.fb = mkFb(); I.cur = 0; I.first = 0; }
        const nx = 1 - I.cur; g.viewport(0, 0, CELL, CELL);
        g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, img); g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, input);
        bindA(pf); g.bindFramebuffer(g.FRAMEBUFFER, I.fb[nx].f);
        g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, I.fb[I.cur].t);
        g.uniform1i(U2.uImg, 0); g.uniform1i(U2.uPrev, 1);
        g.uniform2f(U2.uC, .5 + Math.sin(t * .05) * .05, .5 + Math.cos(t * .04) * .05); g.uniform1f(U2.uT, t); g.uniform1f(U2.uBass, A.bass); g.uniform1f(U2.uKick, A.kick); g.uniform1f(U2.uFirst, I.first ? 1 : 0);
        const op = new Float32Array(6), am = new Float32Array(6), pa = new Float32Array(24);
        d.st.slice(0, 6).forEach((s, i) => { op[i] = s.op; am[i] = modAmt(s.a, s.m, s.sp); pa.set([s.sp, s.de, 0, 0], i * 4); });
        g.uniform1fv(U2["uOp[0]"], op); g.uniform1fv(U2["uAmt[0]"], am); g.uniform4fv(U2["uPar[0]"], pa);
        const fl = d.fl; g.uniform1f(U2.uField, fl.f); g.uniform1f(U2.uFlow, modAmt(fl.a, fl.m)); g.uniform1f(U2.uKeep, fl.keep);
        g.uniform1f(U2.uFScale, fl.sc); g.uniform1f(U2.uFSpeed, fl.sp); g.uniform1f(U2.uHueDrift, fl.hue); g.uniform1f(U2.uSmear, fl.smear); g.uniform1f(U2.uFDir, fl.dir); g.uniform1f(U2.uInject, fl.inj);
        g.drawArrays(g.TRIANGLES, 0, 3);
        bindA(pc); g.bindFramebuffer(g.FRAMEBUFFER, null); g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, I.fb[nx].t); g.uniform1i(Uc, 1);
        g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLES, 0, 3); g.activeTexture(g.TEXTURE0);
        I.cur = nx; I.first = 1; return cv;
      },
      free(I) { if (I && I.fb) { for (const b of I.fb) { g.deleteTexture(b.t); g.deleteFramebuffer(b.f); } I.fb = null; } }
    };
  })();
  // the same field in JS, for the flow preview
  const fr = x => x - Math.floor(x), h2 = (x, y) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
  function noise(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function curl(x, y) { const e = .07; return [(noise(x, y + e) - noise(x, y - e)) / (2 * e), (noise(x - e, y) - noise(x + e, y)) / (2 * e)]; }
  function fieldJS(fl, x, y, t) {
    const dx = x - .5, dy = y - .5, r = Math.hypot(dx, dy) + 1e-4, ss = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
    switch (fl.f | 0) {
      case 1: return curl(x * fl.sc + t * .11 * fl.sp, y * fl.sc - t * .07 * fl.sp);
      case 2: { const k = ss(0, .25, r) * (1 + .3 * Math.sin(r * fl.sc * 4 - t * fl.sp * 2)) / r; return [-dy * k, dx * k]; }
      case 3: { const k = (.4 + .6 * noise(Math.atan2(dy, dx) * 3, t * fl.sp)) / r; return [dx * k, dy * k]; }
      case 4: { const k = -ss(0, .15, r) / r; return [dx * k, dy * k]; }
      case 5: { const c = curl(x * fl.sc + t * .1 * fl.sp, y * fl.sc + t * .1 * fl.sp); return [Math.cos(fl.dir) + .35 * c[0], Math.sin(fl.dir) + .35 * c[1]]; }
      case 6: return [(noise(x * fl.sc * 2 + t * .3 * fl.sp, y * fl.sc * 2 + t * .3 * fl.sp) - .5) * 1.2, 1];
      case 7: return [(-dy * 1.5 - dx * .6) / r, (dx * 1.5 - dy * .6) / r];
      default: return [0, 0];
    }
  }
  const flowP = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), age: Math.random() * 80 }));
  const prevI = {};
  function fxPreview() {
    const d = curFx(), cF = $("#fxFlow"), cP = $("#fxPrev"); if (!d) return;
    if (cF) {
      const x = cF.getContext("2d"), W = cF.width, Hh = cF.height, fl = d.fl, sp = .005 * Math.max(.5, fl.a) * (fl.f ? 1 : 0);
      x.fillStyle = `rgba(4,6,10,${.04 + (1 - fl.keep) * .25})`; x.fillRect(0, 0, W, Hh);
      x.lineWidth = 2.2; x.globalCompositeOperation = "lighter";
      flowP.forEach((p, i) => {
        const v = fieldJS(fl, p.x, p.y, T), ox = p.x, oy = p.y; p.x += v[0] * sp; p.y += v[1] * sp; p.age++;
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || p.age > 90 + (i % 60) || !fl.f) { p.x = Math.random(); p.y = Math.random(); p.age = 0; return; }
        x.strokeStyle = fl.hue ? `hsl(${(i * 3 + p.age * fl.hue * 12 + T * 30) % 360},100%,62%)` : pcol(i, T, p.x * 300, p.y * 300); x.globalAlpha = .8;
        x.beginPath(); x.moveTo(ox * W, (1 - oy) * Hh); x.lineTo(p.x * W, (1 - p.y) * Hh); x.stroke();
      });
      x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    }
    if (cP) { const out = FX.run(prevI, sc, d.id, T); const x = cP.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, cP.width, cP.height); x.drawImage(out, 0, 0, cP.width, cP.height); }
  }
  function fxTab() {
    const d = curFx();
    let h = `<section class="grp"><h3>ספריית אפקטים</h3><div class="chips fxl">${FXL.map(f => `<button type="button" data-fxsel="${f.id}" aria-pressed="${f.id === d.id}">${esc(f.name)}</button>`).join("")}</div>
      <div class="row"><button type="button" data-fa="new">+ חדש</button><button type="button" data-fa="dup">⧉ שכפל</button><button type="button" data-fa="del"${FXL.length > 1 ? "" : " disabled"}>✕ מחק</button><button type="button" data-fa="reset">שחזר את המקוריים</button></div>
      ${ptx("fx", d, "name", "שם האפקט")}
      <p class="note">האפקט בנוי מ<b>שרשרת</b> של עיוותים וצבעים, ומ<b>זרימה</b>: בכל פריים התמונה הקודמת נדחפת לאורך שדה, משנה גוון ונמרחת, והפריים החדש נכנס מעליה. אלה אותן אבני בניין של מנוע מופע הסלפי (משיכה, מערבולת, זרימה, אדוות, נמס, שברים, הולוגרמה), פתוחות לעריכה.</p></section>`;
    h += `<section class="grp"><h3>תצוגה חיה</h3><div class="two"><figure class="fig"><canvas class="fxp" id="fxPrev" width="256" height="256" aria-label="האפקט על התא"></canvas><figcaption>האפקט על הסצנה</figcaption></figure><figure class="fig"><canvas class="fxp" id="fxFlow" width="256" height="256" aria-label="שדה הזרימה"></canvas><figcaption>הזרימה שהאפקט יוצר</figcaption></figure></div></section>`;
    h += `<section class="grp"><h3>שרשרת · ${d.st.length}/6</h3>` + d.st.map((s, i) => `<div class="stg"><div class="stgh"><b>${i + 1}</b>${psl("s" + i, s, "op", "שלב", OPS, true)}<span class="acts"><button type="button" data-fa="sup" data-i="${i}" aria-label="העלה שלב">▲</button><button type="button" data-fa="sdel" data-i="${i}" aria-label="מחק שלב">✕</button></span></div>`
      + prg("s" + i, s, "a", "עוצמה", 0, 1, .01) + prg("s" + i, s, "sp", "מהירות", 0, 3, .01) + prg("s" + i, s, "de", "צפיפות", 0, 1, .01) + psl("s" + i, s, "m", "מגיב ל", MODS) + `</div>`).join("")
      + `<div class="row"><button type="button" data-fa="sadd"${d.st.length >= 6 ? " disabled" : ""}>+ הוסף שלב</button></div></section>`;
    const fl = d.fl;
    h += `<section class="grp"><h3>הזרימה</h3>` + psl("f", fl, "f", "שדה", FIELDS, true) + (fl.f ? prg("f", fl, "a", "עוצמה", 0, 4, .01) + psl("f", fl, "m", "מגיב ל", MODS) + prg("f", fl, "keep", "זיכרון (אורך השובל)", 0, .99, .01)
      + prg("f", fl, "sc", "גודל המערבולות", .5, 10, .1) + prg("f", fl, "sp", "מהירות השדה", 0, 3, .01) + (fl.f === 5 ? prg("f", fl, "dir", "כיוון הרוח", -3.14, 3.14, .01) : "") + prg("f", fl, "hue", "שינוי צבע בזרימה", -2, 2, .01) + prg("f", fl, "smear", "מריחה", 0, 3, .01) + psl("f", fl, "inj", "הכנסת הפריים", INJ, true) : `<p class="note">בלי זרימה האפקט רק מעוות וצובע, בלי זיכרון בין פריימים.</p>`) + `</section>`;
    const l = selLayer();
    h += `<section class="grp"><h3>שימוש באפקט</h3><div class="row"><button type="button" class="primary" data-fa="apply">החל על כל התמונה</button><button type="button" data-fa="attach"${l && l.type !== "adjust" ? "" : " disabled"}>הצמד לשכבה ${l && l.type !== "adjust" ? "«" + esc(l.name) + "»" : "הנבחרת"}</button><button type="button" data-fa="cap">הצמד לכיתוב</button></div>
      <p class="note"><b>על כל התמונה</b> מוסיף שכבת אפקט מעל הכול. <b>הצמדה לשכבה</b> מריצה את האפקט רק על השכבה (למשל טקסט שנמרח וזורם בלי למרוח את הרקע).</p>
      <textarea id="fxJson" aria-label="JSON של האפקט" spellcheck="false" dir="ltr">${esc(JSON.stringify(d))}</textarea><div class="row"><button type="button" data-fa="copy">העתק JSON</button><button type="button" data-fa="load">טען מה-JSON</button></div></section>`;
    return h;
  }
  function fxAction(a, b) {
    const d = curFx();
    if (a === "new") { const n = { id: "u" + (++uid), name: "אפקט " + (FXL.length + 1), st: [stg(1, .3)], fl: flw({}) }; FXL.push(n); fxCur = n.id; }
    else if (a === "dup") { const n = clone(d); n.id = "u" + (++uid); n.name = d.name + " (עותק)"; FXL.push(n); fxCur = n.id; }
    else if (a === "del" && FXL.length > 1) { FXL = FXL.filter(f => f !== d); fxCur = FXL[0].id; LY.list.forEach(l => { if (l.fx === d.id) l.fx = l.type === "adjust" ? fxCur : ""; }); lsave(); }
    else if (a === "reset") { const mine = FXL.filter(f => !FX_PRESETS.some(p => p.id === f.id)); FXL = clone(FX_PRESETS).concat(mine); fxCur = FXL[0].id; }
    else if (a === "sadd" && d.st.length < 6) d.st.push(stg(20, .3));
    else if (a === "sdel") d.st.splice(+b.dataset.i, 1);
    else if (a === "sup") { const i = +b.dataset.i; if (i > 0) d.st.splice(i - 1, 0, d.st.splice(i, 1)[0]); }
    else if (a === "apply") { addLayer("adjust", { fx: d.id, name: d.name }); toast("נוספה שכבת אפקט: " + d.name); }
    else if (a === "attach") { const l = selLayer(); if (l) { l.fx = d.id; lsave(); toast("האפקט הוצמד ל" + l.name); } }
    else if (a === "cap") { const l = capLayer(true); l.fx = d.id; lsave(); toast("האפקט הוצמד לכיתוב"); }
    else if (a === "copy") { const t = $("#fxJson"); navigator.clipboard?.writeText(t.value).then(() => toast("הועתק"), () => { t.select(); toast("סמנו והעתיקו ידנית"); }); return; }
    else if (a === "load") { try { const n = JSON.parse($("#fxJson").value); if (!Array.isArray(n.st) || !n.fl) throw 0; n.st = n.st.slice(0, 6).map(s => stg(+s.op || 0, +s.a || 0, s)); n.fl = flw(n.fl); n.id = "u" + (++uid); n.name = String(n.name || "מיובא").slice(0, 40); FXL.push(n); fxCur = n.id; toast("נטען"); } catch (e) { toast("ה-JSON לא תקין"); return; } }
    fxsave(); render();
  }

  // ------------------------------------------------ captions: rotating ring / globe / vertex arc / ticker / bursts / smear
  const CAP = Object.assign({ text: "ברוכים הבאים לקליידוסקופ ✦ ", src: "typed", shape: "globe", size: 30, radius: .86, ball: .46, tilt: .36, speed: .5, sync: true, bars: 4,
    glow: .6, color: "palette", col: "#ffffff", weight: "800", lang: "he-IL", cycle: false, cycleBars: 8, keepWords: 14, micDrive: false, ballStyle: "holo" }, store.get("caption", {}));
  const CR = { rec: null, want: false, interim: "", finals: [], level: 0, bursts: [], phase: 0, shape: CAP.shape, bar: -1, pop: 0, spawned: 0, lastT: 0 };
  const SHAPES = [["globe", "כדור עם כיתוב סובב", '<circle cx="11" cy="11" r="5"/><ellipse cx="11" cy="12" rx="9.5" ry="3.2"/>'], ["ring", "טבעת", '<circle cx="11" cy="11" r="8"/><circle cx="11" cy="11" r="4.5" stroke-dasharray="2 2"/>'],
    ["vertex", "קשת בקודקוד 60°", '<polygon points="11,2 3,18 19,18"/><path d="M7 10 A6 6 0 0 0 15 10"/>'], ["ticker", "פס רץ", '<polygon points="11,2 3,18 19,18"/><path d="M5 13 H17"/>'],
    ["burst", "מילים שמתפוצצות", '<path d="M11 11 L4 5 M11 11 L18 4 M11 11 L19 15 M11 11 L5 18"/><circle cx="11" cy="11" r="1.6"/>'], ["smear", "מריחה גדולה", '<path d="M3 9 C7 6 9 13 13 10 S19 8 19 8"/><path d="M3 14 C7 11 9 17 13 14 S19 13 19 13"/>']];
  function csave() { store.set("caption", CAP); }
  function capLayer(make) {
    let l = LY.list.find(x => x.type === "caption");
    if (!l && make) l = addLayer("caption", { name: "כיתוב", fx: CAP.shape === "smear" || CAP.shape === "burst" ? "capSmear" : "" });
    if (l && make) l.on = true; return l;
  }
  function capText() {
    if (CAP.src !== "speech") return CAP.text || "";
    const words = CR.finals.join(" ").split(/\s+/).filter(Boolean).slice(-CAP.keepWords).join(" ");
    const s = (words + (CR.interim ? " " + CR.interim : "")).trim();
    return s ? s + "  ✦  " : (CR.rec ? "מקשיב…  " : "דברו אל המיקרופון  ");
  }
  function capPhrase(tx) {
    tx = String(tx || "").trim(); if (!tx) return;
    CR.finals.push(tx); if (CR.finals.length > 30) CR.finals.shift(); CR.pop = 1; CR.level = 1;
    tx.split(/\s+/).forEach((w, i) => CR.bursts.push({ w, t0: T + i * .14, a: Math.random() * TAU, i: CR.spawned++ }));
    if (CR.bursts.length > 60) CR.bursts.splice(0, CR.bursts.length - 60);
    capLive();
  }
  function capTick() {
    const dt = clamp(T - CR.lastT, 0, .1); CR.lastT = T;
    CR.level *= Math.pow(.15, dt); CR.pop *= Math.pow(.05, dt);
    if (CAP.micDrive && A.src === "mic") CR.level = Math.max(CR.level, A.mid);
    beatsNow = (B.beatIdx | 0) + (B.phase || 0);
    const dir = CAP.speed < 0 ? -1 : 1;
    if (CAP.sync) { const target = dir * beatsNow / (4 * Math.max(1, CAP.bars)) * TAU; const dd = ((target - CR.phase + Math.PI) % TAU + TAU) % TAU - Math.PI; CR.phase += Math.abs(dd) > 1 ? dd : dd * Math.min(1, dt * 6); }
    else CR.phase += dt * CAP.speed * .8;
    if (CAP.cycle) { const bar = Math.floor(beatsNow / 4 / Math.max(1, CAP.cycleBars)); if (bar !== CR.bar) { if (CR.bar >= 0) { const i = SHAPES.findIndex(s => s[0] === CR.shape); CR.shape = SHAPES[(i + 1) % SHAPES.length][0]; CR.pop = 1; } CR.bar = bar; } }
    else CR.shape = CAP.shape;
    if (exp.rec) expDraw();
  }
  // text along a circle; dir +1 runs clockwise on screen (y down). up: +1 letters' tops point outward, -1 inward
  function arcText(c, str, cx, cy, R, a0, dir, up, size, cf, t, glow, keep) {
    const ch = [...str]; if (!ch.length) return;
    c.font = `${CAP.weight} ${size}px Heebo, "Segoe UI", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    const w = ch.map(x => c.measureText(x).width + size * .04), tot = w.reduce((s, v) => s + v, 0);
    const reps = Math.max(1, Math.floor(TAU * R / tot)), k = keep ? 1 : TAU * R / (reps * tot);
    let a = a0;
    for (let r = 0; r < (keep ? 1 : reps); r++) for (let i = 0; i < ch.length; i++) {
      const da = w[i] * k / R, am = a + dir * da / 2; a += dir * da;
      if (keep && keep(am) === false) continue;
      const x = cx + Math.cos(am) * R, y = cy + Math.sin(am) * R;
      c.save(); c.translate(x, y); c.rotate(am + (up > 0 ? Math.PI / 2 : -Math.PI / 2)); glowText(c, ch[i], 0, 0, cf(i + r * 7, t, x, y), glow, 0); c.restore();
    }
  }
  function ringText(c, str, R, a0, size, cf, t, glow, stroke) { const rtl = RTL_RE.test(str); arcText(c, str, 0, 0, R, a0, rtl ? -1 : 1, 1, size, cf, t, glow); }
  function drawBall(c, rb, t) {
    const pal = (PALETTES[P.palette] || {}).c, c0 = pal ? pal[0] : `hsl(${t * 30 % 360},90%,60%)`, c1 = pal ? pal[1 % pal.length] : `hsl(${(t * 30 + 140) % 360},90%,45%)`;
    const g = c.createRadialGradient(-rb * .35, -rb * .4, rb * .1, 0, 0, rb);
    g.addColorStop(0, "#ffffff"); g.addColorStop(.18, c0); g.addColorStop(.75, c1); g.addColorStop(1, "#05060a");
    c.save(); c.shadowBlur = 0; c.fillStyle = g; c.beginPath(); c.arc(0, 0, rb, 0, TAU); c.fill(); c.clip();
    c.lineWidth = Math.max(1, rb * .03); c.strokeStyle = "rgba(255,255,255,.35)";
    for (let k = 0; k < 6; k++) { const ph = (k / 6 * Math.PI + CR.phase * .5) % Math.PI, rx = Math.abs(Math.cos(ph)) * rb; c.beginPath(); c.ellipse(0, 0, Math.max(.5, rx), rb, 0, 0, TAU); c.stroke(); }
    for (let k = -2; k <= 2; k++) { const y = k * rb * .35, rx = Math.sqrt(Math.max(0, rb * rb - y * y)); c.beginPath(); c.ellipse(0, y, rx, rx * CAP.tilt * .6 + .5, 0, 0, TAU); c.stroke(); }
    c.restore();
  }
  function capPaint(c, t) {
    const shape = CR.shape, str = capText(), cf = colorFn(CAP.color, CAP.col), rtl = RTL_RE.test(str);
    const size = CAP.size * (1 + .25 * CR.level + .3 * CR.pop), R = CAP.radius * IN_R, glow = CAP.glow;
    if (shape === "globe") {
      // text on an equator band around a ball: letters behind the ball are mirrored and dim, in front they read normally
      const rb = R * CAP.ball, ch = [...str]; c.font = `${CAP.weight} ${size}px Heebo, "Segoe UI", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      const w = ch.map(x => c.measureText(x).width + size * .05), tot = w.reduce((s, v) => s + v, 0) || 1, reps = Math.max(1, Math.floor(TAU * R / tot)), k = TAU * R / (reps * tot);
      const gl = []; let a = CR.phase + Math.PI / 2, dir = rtl ? 1 : -1;
      for (let r = 0; r < reps; r++) for (let i = 0; i < ch.length; i++) { const da = w[i] * k / R; gl.push([ch[i], a + dir * da / 2, i + r * 7]); a += dir * da; }
      const put = (front) => { for (const [s, am, i] of gl) { const z = Math.sin(am); if ((z >= 0) !== front) continue;
        const x = Math.cos(am) * R, y = z * R * CAP.tilt, sc = .72 + .28 * (z + 1) / 2;
        c.save(); c.translate(x, y); c.scale(Math.sign(z || 1) * Math.max(.3, Math.abs(z)) * sc, sc); c.globalAlpha = front ? 1 : .3; glowText(c, s, 0, 0, cf(i, t, x, y), front ? glow : 0, front ? 3 : 0); c.restore(); } };
      put(false); if (CAP.ball > .02) drawBall(c, rb, t); put(true); c.globalAlpha = 1;
    } else if (shape === "ring") ringText(c, str, R, CR.phase - Math.PI / 2, size, cf, t, glow);
    else if (shape === "vertex") {
      // an arc in the corner at the apex: the two mirrors that meet there turn it into a whole ring (6 × 60°)
      const Rv = IN_R * .55 + CAP.radius * IN_R * 1.15, cx = 0, cy = -HALF, L = Math.PI / 3, a0 = Math.PI / 3, ch = [...str];
      c.font = `${CAP.weight} ${size}px Heebo, "Segoe UI", sans-serif`; const tot = ch.reduce((s, x) => s + c.measureText(x).width + size * .04, 0) || 1;
      const span = tot / Rv, off = ((CR.phase * Rv * .6) % (tot + L * Rv) + tot + L * Rv) % (tot + L * Rv) / Rv;
      arcText(c, str, cx, cy, Rv, rtl ? a0 - span + off : a0 + L + span - off, rtl ? 1 : -1, -1, size, cf, t, glow, am => am > a0 - .05 && am < a0 + L + .05);
    } else if (shape === "ticker") {
      c.save(); triPath(c); c.clip(); c.font = `${CAP.weight} ${size}px Heebo, "Segoe UI", sans-serif`; c.textAlign = "left"; c.textBaseline = "middle";
      const y = (CAP.radius - .5) * IN_R * 1.4, wid = c.measureText(str).width + size, dir = rtl ? 1 : -1, x0 = ((dir * CR.phase * 60) % wid + wid) % wid - wid;
      for (let x = x0 - wid; x < TRI_W + wid; x += wid) { const xx = x - TRI_W; glowText(c, str, xx, y, cf(Math.floor(x / 40), t, xx, y), glow, 0); }
      c.restore();
    } else if (shape === "burst") {
      c.textAlign = "center"; c.textBaseline = "middle";
      const list = CR.bursts.length ? CR.bursts : [...str.split(/\s+/).filter(Boolean)].map((w, i) => ({ w, t0: Math.floor(t / 6) * 6 + i * .3, a: i * 2.4, i }));
      for (const b of list) {
        const age = t - b.t0, life = 4.5; if (age < 0 || age > life) continue;
        const e = age / life, ease = 1 - Math.pow(1 - e, 3), d = ease * R * 1.25, x = Math.cos(b.a + CR.phase * .3) * d, y = Math.sin(b.a + CR.phase * .3) * d;
        c.font = `${CAP.weight} ${size * (.6 + 1.4 * Math.min(1, age * 3)) * (1 - .35 * e)}px Heebo, sans-serif`; c.globalAlpha = Math.min(1, age * 5) * (1 - e * e);
        c.save(); c.translate(x, y); c.rotate(Math.sin(b.a) * .3 * e); glowText(c, b.w, 0, 0, cf(b.i, t, x, y), glow, 0); c.restore();
      }
      c.globalAlpha = 1;
    } else if (shape === "smear") {
      const last = CAP.src === "speech" ? (CR.interim || CR.finals[CR.finals.length - 1] || str) : str, words = last.trim().split(/\s+/), lines = [];
      let cur = ""; for (const w of words) { if ((cur + " " + w).trim().length > 11 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) lines.push(cur);
      const sz = size * 1.8 * (1 + .4 * CR.pop); c.font = `900 ${sz}px Heebo, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      lines.slice(-3).forEach((s, i, arr) => { const y = (i - (arr.length - 1) / 2) * sz * 1.05 + IN_R * .1; c.save(); c.translate(0, y); c.rotate(Math.sin(t * .7 + i) * .06); glowText(c, s, 0, 0, cf(i, t, 0, y), glow, 0); c.restore(); });
    }
  }
  // ---- live speech → text (Web Speech API: Chrome / Edge / Safari; Chrome sends the audio to its speech service)
  function speechOK() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function speechStart() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("הדפדפן לא תומך בזיהוי דיבור. נסו Chrome או Edge, או הקלידו בשורה החיה.", 5000); return; }
    if (CR.rec) return;
    const r = new SR(); r.lang = CAP.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i], tx = res[0].transcript.trim(); if (res.isFinal) capPhrase(tx); else interim += tx + " "; } CR.interim = interim.trim(); CR.level = 1; capLive(); };
    r.onspeechstart = () => { CR.level = 1; };
    r.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { CR.want = false; toast("אין הרשאה למיקרופון או לשירות הדיבור. זה עובד רק בכתובת https או בשרת המקומי.", 6000); } else if (e.error === "network") toast("זיהוי הדיבור צריך חיבור לאינטרנט", 5000); else if (e.error === "language-not-supported") { CR.want = false; toast("השפה לא נתמכת בדפדפן הזה"); } };
    r.onend = () => { CR.rec = null; CR.interim = ""; if (CR.want) setTimeout(() => CR.want && speechStart(), 250); else if (tab === "caption") render(); };
    try { r.start(); CR.rec = r; CR.want = true; } catch (e) { toast("לא הצלחתי להפעיל את זיהוי הדיבור"); }
    if (tab === "caption") render();
  }
  function speechStop() { CR.want = false; if (CR.rec) try { CR.rec.stop(); } catch (e) {} CR.rec = null; if (tab === "caption") render(); }
  function capLive() {
    const el = $("#capLiveTxt"); if (!el) return;
    const fin = CR.finals.slice(-3).join(" · ");
    el.innerHTML = fin || CR.interim ? `${esc(fin)} <i>${esc(CR.interim)}</i>` : `<i>${CR.rec ? "מקשיב… דברו עכשיו" : "כאן יופיע מה שנאמר"}</i>`;
  }
  function liveShow() {
    CAP.src = "speech"; CAP.cycle = true; if (!["burst", "smear", "globe"].includes(CAP.shape)) CAP.shape = "burst"; CR.shape = CAP.shape; csave();
    const l = capLayer(true); if (!l.fx) l.fx = "capSmear"; lsave();
    if (!fxGet("capSmear")) { FXL.push(clone(FX_PRESETS[0])); fxsave(); }
    speechStart(); toast("מופע כיתוב חי: דברו, והמילים נכנסות למראות");
  }
  // ---- triangle video out: the cell exactly as the mirrors see it, apex up, for the screen behind the real mirrors
  const exp = { cv: null, cx: null, rec: null, chunks: [] };
  function expDraw() {
    const c = exp.cx, W = exp.cv.width, Hh = exp.cv.height, k = W / 2 / TRI_W, panx = Math.sin(T * .05) * .05, pany = Math.cos(T * .04) * .05;
    const co = Math.cos(rotNow), s = Math.sin(rotNow), ox = HALF + CELL * panx, oy = HALF - CELL * pany;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#000"; c.fillRect(0, 0, W, Hh);
    c.save(); c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(0, Hh); c.lineTo(W, Hh); c.closePath(); c.clip();
    c.setTransform(k * co, -k * s, k * s, k * co, W / 2 - k * (co * ox + s * oy), HALF * k - k * (-s * ox + co * oy)); c.drawImage(lastSrc || sc, 0, 0); c.restore();
  }
  let lastSrc = null;
  function expToggle() {
    if (exp.rec) { exp.rec.stop(); return; }
    if (typeof MediaRecorder === "undefined") { toast("הדפדפן לא תומך בהקלטה"); return; }
    if (!exp.cv) { exp.cv = document.createElement("canvas"); exp.cv.width = 1024; exp.cv.height = Math.round(1024 * Math.sqrt(3) / 2); exp.cx = exp.cv.getContext("2d"); }
    expDraw(); const st = exp.cv.captureStream(30); if (recDest) recDest.stream.getAudioTracks().forEach(t => st.addTrack(t));
    const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "", mp4 = mime.startsWith("video/mp4");
    exp.chunks = []; exp.rec = new MediaRecorder(st, mime ? { mimeType: mime, videoBitsPerSecond: 10e6 } : undefined);
    exp.rec.ondataavailable = e => e.data.size && exp.chunks.push(e.data);
    exp.rec.onstop = () => { const b = new Blob(exp.chunks, { type: mp4 ? "video/mp4" : "video/webm" }); exp.rec = null; render(); saveBlob(b, `kaleidoscope-triangle-${Date.now()}.${mp4 ? "mp4" : "webm"}`); };
    exp.rec.start(500); render(); toast("מקליט את המשולש… לחצו שוב כדי לעצור");
  }
  function captionTab() {
    const l = capLayer(false), on = !!(l && l.on);
    let h = `<section class="grp"><h3>כיתוב מסתובב על הכדור</h3><p class="note">הכיתוב נכתב בתוך המשולש, נעול למראות 60°, ומסתובב יחד עם הביט. במראות הוא נסגר לטבעת שמקיפה את הכדור שהמבקר רואה. הכי מדויק במצב <b>משולש 60°</b> עם <b>מראות אמיתיות</b>, או במסך למוצר.</p>
      <div class="row"><button type="button" class="${on ? "" : "primary"}" data-ca="toggle" aria-pressed="${on}">${on ? "✓ הכיתוב מוצג" : "הצג כיתוב"}</button><button type="button" data-ca="real">הצג כמו במיצג</button></div>
      <div class="chips shapes">${SHAPES.map(([id, n, d]) => `<button type="button" data-cshape="${id}" aria-pressed="${CAP.shape === id}">${svg(d)}<span>${n}</span></button>`).join("")}</div>
      ${CAP.src === "typed" ? ptx("c", CAP, "text", "הטקסט", true) : ""}
      ${prg("c", CAP, "size", "גודל אות", 8, 80, 1)}${prg("c", CAP, "radius", "רדיוס הטבעת", .2, 1.6, .01)}${CAP.shape === "globe" ? prg("c", CAP, "ball", "גודל הכדור", 0, .95, .01) + prg("c", CAP, "tilt", "הטיית הטבעת", 0, .9, .01) : ""}
      ${prg("c", CAP, "speed", CAP.sync ? "כיוון ומהירות" : "מהירות סיבוב", -2, 2, .01)}${ptg("c", CAP, "sync", "מסונכרן לביט")}${CAP.sync ? prg("c", CAP, "bars", "תיבות לסיבוב שלם", 1, 32, 1) : ""}
      ${prg("c", CAP, "glow", "זוהר", 0, 1.5, .01)}${psl("c", CAP, "color", "צבע", COLORS)}${CAP.color === "solid" ? pcl("c", CAP, "col", "בחירת צבע") : ""}
      ${psl("c", CAP, "weight", "עובי", [["400", "רגיל"], ["600", "בינוני"], ["800", "עבה"], ["900", "שחור"]])}
      ${ptg("c", CAP, "cycle", "גרפיקה מתחלפת: צורה חדשה כל כמה תיבות")}${CAP.cycle ? prg("c", CAP, "cycleBars", "תיבות לכל צורה", 1, 32, 1) : ""}</section>`;
    const listening = !!CR.rec;
    h += `<section class="grp"><h3>כיתוב חי מהדיבור</h3>
      <div class="row"><button type="button" class="primary" data-ca="live">▶ מופע כיתוב חי</button><button type="button" data-ca="listen" aria-pressed="${listening}">${listening ? "■ עצור האזנה" : "🎤 האזן לדיבור"}</button></div>
      ${psl("c", CAP, "src", "מקור הטקסט", [["typed", "טקסט קבוע"], ["speech", "דיבור חי"]])}
      ${psl("c", CAP, "lang", "שפת הדיבור", [["he-IL", "עברית"], ["en-US", "English"], ["ar-IL", "العربية"], ["ru-RU", "Русский"], ["fr-FR", "Français"], ["es-ES", "Español"]])}
      <div class="capLive" id="capLiveTxt" aria-live="polite"></div>
      <div class="row" style="flex-wrap:nowrap"><input type="text" id="capType" class="txt" placeholder="או הקלידו משפט ולחצו Enter" style="flex:1;min-width:0"><button type="button" data-ca="say">שלח</button><button type="button" data-ca="clear">נקה</button></div>
      ${prg("c", CAP, "keepWords", "מילים בטבעת", 3, 40, 1)}${ptg("c", CAP, "micDrive", "עוצמת הקול מגדילה את הכיתוב (כשהמיקרופון הוא מקור הקול)")}
      <p class="note">${speechOK() ? "הדיבור הופך לטקסט בזמן אמת, וכל משפט נכנס למראות: מילים מתפוצצות מהמרכז, נמרחות ומשנות צבע לפי האפקט שמוצמד לכיתוב. ב-Chrome הקול נשלח לשירות הזיהוי של Google, ולכן צריך אינטרנט; ב-Safari הזיהוי יכול לרוץ במכשיר." : "הדפדפן הזה לא תומך בזיהוי דיבור. ב-Chrome, Edge או Safari זה עובד. בינתיים אפשר להקליד בשורה למעלה."}</p></section>`;
    h += `<section class="grp"><h3>אפקט על הכיתוב</h3>${psl("cl", l || { fx: "" }, "fx", "אפקט", [["", "בלי"], ...FXL.map(f => [f.id, f.name])])}<div class="row"><button type="button" data-tab="fx">בונה האפקטים ←</button></div></section>`;
    h += `<section class="grp"><h3>וידאו משולש למראות</h3><p class="note">וידאו שבו המשולש ממלא את הפריים (קודקוד למעלה באמצע, הבסיס לאורך התחתית) נמתח בדיוק על התא שבין המראות, והכיתוב רץ מעליו. אפשר גם להקליט את התא כמו שהמראות רואות אותו, כקובץ למסך שמאחורי המראות.</p>
      <div class="row"><button type="button" data-ca="vid">🎞 טען וידאו משולש</button><button type="button" data-ca="exp" aria-pressed="${!!exp.rec}">${exp.rec ? "■ עצור הקלטה" : "⏺ הקלט וידאו משולש"}</button></div></section>`;
    return h;
  }

  // ------------------------------------------------ panel events for the new tabs
  const panel = $("#panel");
  panel.addEventListener("click", e => {
    const b = e.target.closest("button"); const row = e.target.closest("[data-lsel]");
    if (b && b.dataset.fold) { const s = b.closest("section.grp"), f = !s.classList.contains("fold"); setFold(s, f); if (f) desk.folds[b.dataset.fold] = 1; else delete desk.folds[b.dataset.fold]; store.set("folds", desk.folds); return; }
    if (b && b.dataset.ladd) {
      const t = b.dataset.ladd;
      if (t === "media") { fileFor = "new"; filePick.click(); return; }
      if (t === "caption") { capLayer(true); lsave(); render(); return; }
      const fd = fxGet("river") || curFx(), l = addLayer(t, t === "adjust" ? { fx: fd.id, name: fd.name } : {});
      if (t === "camera" && !cam.on) startCamera().then(render); render(); return;
    }
    if (b && b.dataset.la) {
      const a = b.dataset.la, l = LY.list.find(x => x.id === b.dataset.lid), i = LY.list.indexOf(l);
      if (a === "basevis") LY.base.on = !LY.base.on;
      else if (a === "vis" && l) l.on = !l.on;
      else if (a === "up" && l) moveLayer(l.id, i + 1);
      else if (a === "down" && l) moveLayer(l.id, i - 1);
      else if (a === "dup" && l) { if (l.type === "caption") { toast("יש כיתוב אחד. אפשר להוסיף שכבת טקסט."); return; } const n = Object.assign(clone(l), { id: "L" + (++uid), name: l.name + " ⧉" }); LY.list.splice(i + 1, 0, n); LY.sel = n.id; if (LR.get(l.id)?.el) rt(n).el = LR.get(l.id).el; }
      else if (a === "del" && l) { dropLayer(l.id); LY.list.splice(i, 1); if (LY.sel === l.id) LY.sel = (LY.list[i] || LY.list[i - 1] || {}).id || null; }
      else if (a === "file" && l) { fileFor = l; filePick.click(); return; }
      else if (a === "cam") { cam.on ? stopCamera() : startCamera().then(render); }
      else if (a === "editfx" && l && l.fx) { fxCur = l.fx; fxsave(); tab = "fx"; store.set("tab", tab); }
      lsave(); render(); return;
    }
    if (row && !b) { LY.sel = row.dataset.lsel; lsave(); render(); return; }
    if (!b) return;
    if (b.dataset.fxsel) { fxCur = b.dataset.fxsel; fxsave(); render(); return; }
    if (b.dataset.fa) { fxAction(b.dataset.fa, b); return; }
    if (b.dataset.cshape) { CAP.shape = CR.shape = b.dataset.cshape; csave(); const l = capLayer(true); if ((CAP.shape === "smear" || CAP.shape === "burst") && !l.fx) l.fx = "capSmear"; lsave(); render(); return; }
    if (b.dataset.ca) {
      const a = b.dataset.ca;
      if (a === "toggle") { const l = capLayer(false); if (l) l.on = !l.on; else capLayer(true); lsave(); }
      else if (a === "real") { P.mode = "tri60"; P.real = true; save(); capLayer(true); lsave(); toast("משולש 60° עם מראות אמיתיות, כמו שהמבקר רואה"); }
      else if (a === "live") liveShow();
      else if (a === "listen") { if (CR.rec || CR.want) speechStop(); else { CAP.src = "speech"; csave(); capLayer(true); lsave(); speechStart(); } return; }
      else if (a === "say") { const i = $("#capType"); capPhrase(i.value); if (CAP.src !== "speech") { CAP.src = "speech"; csave(); } capLayer(true); lsave(); i.value = ""; return; }
      else if (a === "clear") { CR.finals = []; CR.interim = ""; CR.bursts = []; capLive(); return; }
      else if (a === "vid") { fileFor = "newTri"; capLayer(true); filePick.click(); return; }
      else if (a === "exp") { expToggle(); return; }
      render(); return;
    }
  });
  panel.addEventListener("keydown", e => { if (e.target.id === "capType" && e.key === "Enter") { e.preventDefault(); panel.querySelector('[data-ca="say"]')?.click(); } });
  const onPk = (e, commit) => {
    const el = e.target, pk = el.dataset && el.dataset.pk; if (!pk) return;
    const [ns, k] = pk.split(":"), o = ns === "cl" ? capLayer(true) : target(ns); if (!o) return;
    const v = el.type === "checkbox" ? el.checked : el.type === "range" || el.dataset.num != null ? +el.value : el.value;
    o[k] = v; const out = $("#" + el.id + "_o"); if (out) out.textContent = fmtv(v, +el.step || 1);
    if (ns === "fx" && k === "name") { const c = panel.querySelector(`[data-fxsel="${fxCur}"]`); if (c) c.textContent = v; }
    saveNs(ns === "cl" ? "l" : ns);
    if (ns === "c" && k === "shape") CR.shape = v;
    if (ns === "c" && k === "lang" && CR.rec) { speechStop(); CR.want = true; setTimeout(speechStart, 300); }
    if (commit && (el.tagName === "SELECT" || el.type === "checkbox")) render();
    if (ns === "fx" || ns === "f" || ns[0] === "s") { const j = $("#fxJson"); if (j && document.activeElement !== j) j.value = JSON.stringify(curFx()); }
  };
  panel.addEventListener("input", e => onPk(e, false));
  panel.addEventListener("change", e => onPk(e, true));
  // drag to reorder layers (desktop); the ▲▼ buttons do the same on touch
  let dragId = null;
  panel.addEventListener("dragstart", e => { const r = e.target.closest && e.target.closest(".lyr[data-lsel]"); if (!r) return; dragId = r.dataset.lsel; r.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (er) {} });
  panel.addEventListener("dragover", e => { const r = e.target.closest && e.target.closest(".lyr[data-lsel]"); if (!r || !dragId) return; e.preventDefault(); panel.querySelectorAll(".lyr.over").forEach(x => x.classList.remove("over")); r.classList.add("over"); });
  panel.addEventListener("drop", e => { const r = e.target.closest && e.target.closest(".lyr[data-lsel]"); if (!r || !dragId) return; e.preventDefault(); const to = LY.list.findIndex(l => l.id === r.dataset.lsel); if (to >= 0 && r.dataset.lsel !== dragId) moveLayer(dragId, to); dragId = null; render(); });
  panel.addEventListener("dragend", () => { dragId = null; panel.querySelectorAll(".lyr.drag, .lyr.over").forEach(x => x.classList.remove("drag", "over")); });

  deskApply();
  return {
    tabsHtml,
    tabHtml(id) { return id === "layers" ? layersTab() : id === "fx" ? fxTab() : id === "caption" ? captionTab() : ""; },
    after() { placeTabs(); cardify(); if (tab === "caption") capLive(); },
    rot(r) { rotNow = r; },
    src() { lastSrc = src(); return lastSrc; },
    tick() { if (tab === "fx") fxPreview(); },
    // for scripts and tests
    layers: LY, caption: CAP, captionState: CR, effects: () => FXL, addLayer, say: capPhrase
  };
})();
