/* Kaleidoscope i18n: the apps are written in Hebrew; this script translates them at runtime.
   Load it as the first script in <head>. For a language other than Hebrew it loads assets/i18n/<lang>.js,
   a dictionary keyed by the Hebrew text, and translates text nodes, a few attributes, canvas text, dialogs
   and text files the app saves. Hebrew UI code stays untouched, so new Hebrew strings simply show in Hebrew
   until they are added to the dictionaries (tools/i18n-extract.py lists the missing ones).
   Choice order: ?lang=xx, then localStorage "kscope.lang", then the browser language, else Hebrew. */
(function () {
  "use strict";
  var LANGS = {
    he: { name: "עברית", dir: "rtl", tag: "he-IL" },
    en: { name: "English", dir: "ltr", tag: "en-US" },
    zh: { name: "中文", dir: "ltr", tag: "zh-CN" },
    hi: { name: "हिन्दी", dir: "ltr", tag: "hi-IN" },
    es: { name: "Español", dir: "ltr", tag: "es-ES" },
    ar: { name: "العربية", dir: "rtl", tag: "ar" }
  };
  var STORE = "kscope.lang";
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function pick() {
    var m = /[?&#]lang=([a-z]{2})/.exec(location.search + location.hash);
    if (m && LANGS[m[1]]) { ls(STORE, m[1]); return m[1]; }
    var s = ls(STORE);
    if (s && LANGS[s]) return s;
    var nl = (navigator.languages || [navigator.language || "he"]).map(function (x) { return String(x).slice(0, 2).toLowerCase(); });
    if (nl.indexOf("he") >= 0 || nl.indexOf("iw") >= 0) return "he";
    return LANGS[nl[0]] ? nl[0] : "he";
  }
  var lang = pick();
  var me = document.currentScript;
  var base = me && me.src ? me.src.replace(/[^\/]*$/, "") : "assets/";
  var D = null, cache = new Map();
  var HEB = /[֐-׿יִ-ﭏ]/;
  // Same run tokenizer as tools/i18n-extract.py: Hebrew words joined by spaces, punctuation or gershayim.
  var RUN = /[֐-׿יִ-ﭏ]+(?:(?:['"׳״]|[ \t\r\n\-–—,.:;!?\/…]+)[֐-׿יִ-ﭏ]+)*(?:['"׳״](?!\w))?/g;
  var SEP = /^[ \t\r\n\-–—,.:;!?\/…]+$/;

  function look(k) { return Object.prototype.hasOwnProperty.call(D, k) ? D[k] : null; }
  // A run missing from the dictionary is usually two literals glued together: translate the longest known pieces.
  function greedy(k) {
    var parts = k.split(/([ \-–—,.:;!?\/…]+)/), out = "", i = 0;
    while (i < parts.length) {
      var hit = -1, val = null;
      for (var j = parts.length - 1; j >= i; j -= 2) {
        var cand = parts.slice(i, j + 1).join("");
        var v = look(cand);
        if (v == null) { var c2 = cand.replace(/['"]$/, ""); if (c2 !== cand && (v = look(c2)) != null) v += cand.slice(c2.length); }
        if (v != null) { hit = j; val = v; break; }
      }
      if (hit < 0) { out += parts[i] + (i + 1 < parts.length ? parts[i + 1] : ""); i += 2; }
      else { out += val + (hit + 1 < parts.length ? parts[hit + 1] : ""); i = hit + 2; }
    }
    return out;
  }
  function run(m) {
    var k = m.replace(/\s+/g, " ");
    if (cache.has(k)) return cache.get(k);
    var t = look(k);
    if (t == null) { var k2 = k.replace(/['"]$/, ""); if (k2 !== k && (t = look(k2)) != null) t += k.slice(k2.length); }
    if (t == null) t = greedy(k);
    cache.set(k, t);
    return t;
  }
  var CAP = /^(en|es)$/.test(lang);
  function tr(s, lead) {
    if (!D || s == null || typeof s !== "string" || !HEB.test(s)) return s;
    return s.replace(RUN, function (m, off) {
      var t = run(m);
      // A label that starts its element ("משולש 60°") gets a capital; the same word mid-sentence stays lower case.
      if (CAP && lead && t !== m && !/\S/.test(s.slice(0, off))) t = t.charAt(0).toUpperCase() + t.slice(1);
      return t;
    });
  }

  var ATTRS = ["title", "placeholder", "aria-label", "alt", "label", "data-tip", "data-title", "data-label"];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  var flip = LANGS[lang].dir === "ltr";
  function el(e) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = e.getAttribute(ATTRS[i]);
      if (v && HEB.test(v)) e.setAttribute(ATTRS[i], tr(v, true));
    }
    if (e.tagName === "INPUT" && (e.type === "button" || e.type === "submit") && HEB.test(e.value)) e.value = tr(e.value);
    if (flip && e.getAttribute("dir") === "rtl") e.setAttribute("dir", "ltr");
    if (e.getAttribute("lang") === "he") e.setAttribute("lang", lang);
  }
  function text(n) {
    var p = n.parentNode;
    if (!p || SKIP[p.nodeName] || p.isContentEditable || (p.closest && p.closest("[data-noi18n]"))) return;
    var v = n.nodeValue;
    if (!HEB.test(v)) return;
    var t = tr(v, !n.previousSibling);
    if (t !== v) n.nodeValue = t;
  }
  function walk(root) {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP[root.nodeName] && root.nodeName !== "TEXTAREA") return; el(root); }
    var w = document.createTreeWalker(root, 5, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) text(n); else el(n); }
  }
  function observe() {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === "childList") for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
        else if (r.type === "characterData") text(r.target);
        else if (r.type === "attributes") el(r.target);
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["dir", "lang", "value"]) });
    walk(document.documentElement);
  }
  function hooks() {
    var C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (C) ["fillText", "strokeText", "measureText"].forEach(function (f) {
      var o = C[f]; if (!o) return;
      C[f] = function (s) { var a = Array.prototype.slice.call(arguments); a[0] = tr(String(s)); return o.apply(this, a); };
    });
    ["alert", "confirm", "prompt"].forEach(function (f) {
      var o = window[f]; if (!o) return;
      window[f] = function (s) { var a = Array.prototype.slice.call(arguments); if (a.length) a[0] = tr(String(a[0])); return o.apply(window, a); };
    });
    // Text files the apps write (SVG sheets, CSV cut list, steps, HTML): translate the Hebrew runs in them.
    var B = window.Blob;
    if (B) {
      var NB = function (parts, opt) {
        var ty = opt && opt.type || "";
        if (parts && /^(text\/|image\/svg)/.test(ty)) parts = Array.prototype.map.call(parts, function (p) { return typeof p === "string" ? tr(p) : p; });
        return new B(parts, opt);
      };
      NB.prototype = B.prototype;
      try { window.Blob = NB; } catch (e) {}
    }
  }

  function make() {
    var w = document.createElement("label");
    w.className = "ki18n"; w.setAttribute("data-noi18n", ""); w.title = "Language";
    w.innerHTML = '<span aria-hidden="true">\uD83C\uDF10</span>';
    var sel = document.createElement("select");
    sel.setAttribute("aria-label", "Language");
    Object.keys(LANGS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = LANGS[k].name; if (k === lang) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { set(sel.value); };
    w.appendChild(sel);
    return w;
  }
  // Pages mark where the picker goes with data-ki18n-switch; otherwise it joins the app's .brand header, else it floats.
  function switcher() {
    if (document.querySelector(".ki18n")) return;
    var st = document.createElement("style");
    st.textContent = ".ki18n{display:inline-flex;align-items:center;gap:4px;font:12px/1 system-ui,sans-serif;color:#e8edf4;vertical-align:middle}" +
      ".ki18n select{background:#11151d;color:#e8edf4;border:1px solid #252d3b;border-radius:8px;padding:4px 6px;font:inherit;cursor:pointer;max-width:120px}" +
      ".brand>.ki18n{margin-inline-start:auto;flex:none;align-self:center}" +
      ":root[lang=ar] *,:root[lang=hi] *{letter-spacing:0!important}" +
      ".ki18n.float{position:fixed;inset-block-start:10px;inset-inline-end:10px;z-index:2147483000;background:rgba(7,9,13,.72);padding:4px 6px;border-radius:10px;border:1px solid #252d3b}";
    document.head.appendChild(st);
    var hosts = document.querySelectorAll("[data-ki18n-switch]");
    if (!hosts.length) hosts = Array.prototype.filter.call(document.querySelectorAll(".brand"), function (b) { return b.tagName !== "A"; }).slice(0, 1);
    if (hosts.length) Array.prototype.forEach.call(hosts, function (h) { h.appendChild(make()); });
    else { var f = make(); f.classList.add("float"); document.body.appendChild(f); }
  }
  function set(l) {
    if (!LANGS[l]) return;
    ls(STORE, l);
    var u = new URL(location.href);
    if (u.searchParams.has("lang")) u.searchParams.set("lang", l);
    if (/[#&]lang=/.test(u.hash)) u.hash = u.hash.replace(/lang=[a-z]{2}/, "lang=" + l);
    if (u.href !== location.href) location.href = u.href; else location.reload();
  }

  window.KI18N = {
    lang: lang, langs: LANGS, dir: LANGS[lang].dir, tag: LANGS[lang].tag, set: set,
    t: function (s) { return tr(s); },
    load: function (dict) { D = dict || {}; hooks(); observe(); }
  };
  var h = document.documentElement;
  if (lang !== "he") {
    h.setAttribute("lang", lang); h.setAttribute("dir", LANGS[lang].dir);
    document.write('<script src="' + base + "i18n/" + lang + '.js"><\/script>');
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", switcher); else switcher();
})();
