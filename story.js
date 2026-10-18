// ===================================================
// Bakunawa story screen
// Listens to the question screen on the "bakunawa" channel
// and draws the story into the <svg> with each answer.
//
// Stages:
// 0  waiting for a visitor
// 1  seven moons                 (after scene 1 answer)
// 2  serpent rises, eats one     (after scene 2 answer)
// 3  he eats moon after moon     (after scene 3 answer)
// 4  coil wraps the last moon    (when scene 4 opens; noise loosens it)
// 5  he spits the moon out       (when the noise goal is reached)
// 6  zoom into the moon: bamboo  (after scene 5 answer)
// 7  zoom out, haze clears       (a few seconds later)
//
// Testing without the small screen: press 0–7 to jump to a stage,
// N for a noise hit, F for full screen.
// ===================================================

// ---------------- words on screen ----------------

const SUBTITLES = [
    "Begin on the small screen.",
    "Bathala made seven moons to light the night, one for every night of the week.",
    "Bakunawa, ruler of the sea, fell in love with the moons, and swallowed the first.",
    "One by one he swallowed them, until only one was left, and the earth went dark.",
    "The people banged pots and pans to frighten him away.",
    "Frightened, Bakunawa spat the moon back out.",
    "",   // stage 6 depends on the answer, see BAMBOO_TEXT
    "One moon, one serpent still circling. When the haze clears, look up."
  ];
  
  const BAMBOO_TEXT = {
    yes:    "Bathala planted bamboo on the moon. The dark patches you saw are that bamboo.",
    unsure: "Look closer. Those darker patches are bamboo, planted by Bathala to keep the moon safe.",
    cant:   "Even when the city hides them, the bamboo is there, keeping the last moon safe."
  };
  
  const NOISE_GOAL = 10;        // must match NOISE_GOAL in script.js
  const BAMBOO_TIME = 10000;    // how long to stay zoomed in on the moon (ms)
  
  
  // ---------------- what the visitor told us ----------------
  
  const DEFAULT_ANSWERS = { moon: "full", brightness: 40, stars: 5, patches: "yes" };
  let answers = Object.assign({}, DEFAULT_ANSWERS);
  
  // scene 1: how the moons are drawn
  const MOON_STYLES = {
    full:     { line: "painted",  lit: 1 },     // solid moons
    half:     { line: "linework", lit: 0.5 },   // rings
    crescent: { line: "linework", lit: 0.18 },  // thin arcs
    none:     { line: "dotted",   lit: 0.05 }   // dotted outlines
  };
  
  
  // ---------------- picture setup ----------------
  
  const NS = "http://www.w3.org/2000/svg";
  const W = 1028, H = 670, CX = 514, HORIZON = 538;
  
  const stageEl = document.getElementById("stage");
  let svg = document.getElementById("scene");
  const subtitleEl = document.getElementById("subtitle");
  const controls = document.getElementById("controls");
  const soundBtn = document.getElementById("soundBtn");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  // the palette
  const BASE = {
    sky1: "#121443", sky2: "#262170", haze: "#5a3fa6", cloud: "#0e1038",
    arc: "#b9a8ee", lit: "#efe3c8", dark: "#3a3672", crater: "#d9c9b8", star: "#fbecc8",
    mount: "#1c2154", mountA: "#2a3270", mountB: "#33407e", mountC: "#232a63", mountD: "#2b3874", ridge: "#6d8fd0",
    sea: "#1a1c4c", horizon: "#c9b4f0", serpent: "#3fb3a2", gold: "#f6c47c", bamboo: "#8d7f68",
    bands: ["#ef7d5e", "#f49a74", "#d873b4", "#7d55c6", "#5b82db", "#b28be3", "#4a3fa0", "#6fa8e8", "#e08cc8", "#3a3f8f", "#9a6fd6"],
    water: ["#d97fc0", "#ef8a64", "#4f78d0", "#9a78dc", "#2d3378", "#3e8fc0", "#f2b27a"]
  };
  
  // the seven moons sit on an arc. angle 0 is the top (the last moon).
  const SLOTS = [0, -22, 22, -42, 42, -62, 62];
  // the order he eats them in: outer moons first, the top one never
  const EAT_ORDER = [-1, 4, 5, 2, 3, 0, 1];
  
  // moons get smaller and thinner towards the ends of the arc
  // [angle, radius, how lit]
  const MOON_SIZES = [[0, 63, 1], [22, 38, 0.72], [42, 30, 0.48], [62, 20, 0.22], [82, 3, 0]];
  
  // where the bamboo grows on the zoomed-in moon (x, y from the centre, height, lean)
  const BAMBOO = [
    [-120, -40, 120, -6], [-95, -55, 140, -3], [-70, -30, 110, 2], [-140, 10, 80, -8],
    [-40, -110, 90, 4], [-15, -120, 70, 8], [30, -20, 130, 3], [55, -35, 150, -2],
    [80, -5, 110, 6], [105, 30, 70, -4], [-60, 60, 70, -5], [10, 70, 60, 4]
  ];
  // rough dark patches (the real moon's "seas") the bamboo sits in
  const PATCHES = [[-95, -10, 75, 95, -20], [-25, -95, 55, 40, 10], [65, 10, 70, 95, 8], [-30, 75, 60, 32, 0]];
  
  
  // ---------------- small helpers ----------------
  
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  
  // make an svg element with attributes, and add it to a parent
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  
  // a repeatable random number generator, so the scene looks the same every time
  function seededRandom(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  let random = seededRandom(11);
  
  // a smooth curve through a list of points
  function smooth(pts) {
    let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += "C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + "," + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + " " +
           (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + "," + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + " " +
           p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    return d;
  }
  
  // a four-pointed star shape
  function starPath(x, y, s, w = 0.16) {
    return "M" + x + "," + (y - s) + "L" + (x + s * w) + "," + (y - s * w) + "L" + (x + s) + "," + y +
           "L" + (x + s * w) + "," + (y + s * w) + "L" + x + "," + (y + s) + "L" + (x - s * w) + "," + (y + s * w) +
           "L" + (x - s) + "," + y + "L" + (x - s * w) + "," + (y - s * w) + "Z";
  }
  
  // position on the moon arc for an angle
  function arcPos(angle, rx = 400, ry = 372) {
    const a = angle * Math.PI / 180;
    return [CX + rx * Math.sin(a), 472 - ry * Math.cos(a)];
  }
  
  function moonSize(angle) {
    const a = Math.abs(angle);
    for (let i = 0; i < MOON_SIZES.length - 1; i++) {
      const [a0, r0, k0] = MOON_SIZES[i], [a1, r1, k1] = MOON_SIZES[i + 1];
      if (a <= a1) {
        const t = (a - a0) / (a1 - a0);
        return { r: lerp(r0, r1, t), k: lerp(k0, k1, t) };
      }
    }
    return { r: 3, k: 0 };
  }
  
  
  // ---------------- colour: scene 2 brightness tints the sky ----------------
  // the brighter it is outside, the more the whole picture is pulled towards
  // streetlight orange. When the haze clears at the end, the tint goes away.
  
  let hazeCleared = false;
  
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToHex(h, s, l) {
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function tint(hex) {
    const pull = hazeCleared ? 0 : answers.brightness / 100 * 0.5;
    const light = hazeCleared ? 1 : 1 + answers.brightness / 100 * 0.18;
    if (pull === 0 && light === 1) return hex;
    let [h, s, l] = hexToHsl(hex);
    const towardOrange = ((24 - h + 540) % 360) - 180;
    return hslToHex((h + towardOrange * pull + 360) % 360, s, clamp(l * light));
  }
  const C = key => tint(BASE[key]);
  
  // scene 1: fill, ring or dotted outline
  function look(colour, opacity = 1) {
    const line = MOON_STYLES[answers.moon].line;
    if (line === "painted") return { fill: colour, stroke: "none", opacity: opacity };
    if (line === "linework") return { fill: colour, "fill-opacity": 0.06, stroke: colour, "stroke-width": 1.5, opacity: Math.min(1, opacity + 0.1) };
    return { fill: "none", stroke: colour, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-dasharray": "0.1 6.5", opacity: Math.min(1, opacity + 0.1) };
  }
  
  
  // ---------------- textures (made once) ----------------
  
  let textures = {};
  function makeTextures() {
    const r = seededRandom(80);
    function noise(w, h, grey) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d"), img = x.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = grey ? r() * 255 : 90 + r() * 80;
        img.data[i] = v; img.data[i + 1] = grey ? v : v * 0.95; img.data[i + 2] = grey ? v : v * 0.9; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      return c.toDataURL();
    }
    textures.mottle = noise(90, 58, false);
    textures.grain = noise(220, 220, true);
  }
  
  
  // ---------------- story state ----------------
  
  let stage = 0;
  let noiseHits = 0;
  let bambooTimer = null;
  
  // these ease towards their targets every frame (see loop)
  const vis = { sky: 0.4, arc: 0, sea: 0, serpent: 0, land: 0, zoom: 0, clear: 0, haze: 0.6 };
  let serpentLength = 0, eaten = 0, shadow = 0, wrap = 0, moonLit = 1;
  let time = 0, noiseWobble = 0, ripples = [];
  
  let G = {};             // groups in the svg we redraw every frame
  let twinkles = [], seaRows = [], waveEls = [];
  let buildCount = 0, ID = "";
  
  
  // ---------------- build: draws everything that doesn't move ----------------
  // called again whenever an answer changes the style (with a crossfade)
  
  function build(fade) {
    if (fade && svg.childNodes.length && !reduceMotion) {
      const ghost = svg.cloneNode(true);
      ghost.removeAttribute("id");
      ghost.classList.add("ghost");
      stageEl.insertBefore(ghost, svg.nextSibling);
      requestAnimationFrame(() => requestAnimationFrame(() => { ghost.style.opacity = "0"; }));
      setTimeout(() => ghost.remove(), 1600);
    }
    ID = "b" + (++buildCount);           // new ids so gradients don't clash with the ghost
    random = seededRandom(11);
    svg.innerHTML = "";
    twinkles = []; seaRows = []; waveEls = [];
  
    // --- gradients, filters, patterns ---
    const defs = el("defs", {}, svg);
    const sky = el("linearGradient", { id: "sky" + ID, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": C("sky1") }, sky);
    el("stop", { offset: 0.65, "stop-color": C("sky2") }, sky);
    const glow = el("radialGradient", { id: "glow" + ID }, defs);
    el("stop", { offset: 0, "stop-color": C("star"), "stop-opacity": 0.5 }, glow);
    el("stop", { offset: 1, "stop-color": C("star"), "stop-opacity": 0 }, glow);
    const vignette = el("radialGradient", { id: "vig" + ID, cx: 0.5, cy: 0.45, r: 0.75 }, defs);
    el("stop", { offset: 0.55, "stop-color": "#07061a", "stop-opacity": 0 }, vignette);
    el("stop", { offset: 1, "stop-color": "#07061a", "stop-opacity": 0.5 }, vignette);
    const blur = el("filter", { id: "blur" + ID, filterUnits: "userSpaceOnUse", x: -300, y: -300, width: 1628, height: 1270 }, defs);
    el("feGaussianBlur", { stdDeviation: 45 }, blur);
    const soft = el("filter", { id: "soft" + ID, x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: 7 }, soft);
    const grain = el("pattern", { id: "grain" + ID, width: 220, height: 220, patternUnits: "userSpaceOnUse" }, defs);
    el("image", { href: textures.grain, width: 220, height: 220 }, grain);
    const moonClip = el("clipPath", { id: "moonclip" + ID }, defs);
    el("circle", { cx: 0, cy: 0, r: 230 }, moonClip);
  
    // --- sky ---
    el("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: "url(#sky" + ID + ")" }, svg);
    G.sky = el("g", {}, svg);
  
    // haze: soft blurred clouds. scene 2 makes it stronger.
    G.haze = el("g", { filter: "url(#blur" + ID + ")" }, G.sky);
    [[514, 300, 260, 150, "haze", 0.55], [150, 230, 190, 70, "haze", 0.6], [880, 230, 190, 70, "haze", 0.6],
     [120, 40, 240, 60, "cloud", 0.8], [900, 50, 260, 60, "cloud", 0.8], [40, 150, 120, 80, "cloud", 0.7], [1000, 160, 120, 80, "cloud", 0.7]]
      .forEach(([x, y, rx, ry, colour, o]) => el("ellipse", { cx: x, cy: y, rx: rx, ry: ry, fill: C(colour), opacity: o }, G.haze));
  
    // faint dust stars that are always there
    for (let i = 0; i < 30; i++) {
      const s = el("circle", { cx: random() * W, cy: -30 + random() * 450, r: 0.6 + random() * 1.2, fill: C("star") }, G.sky);
      twinkles.push({ el: s, base: 0.2 + random() * 0.4, phase: random() * 6.28, speed: 0.6 + random() * 1.6 });
    }
  
    // scene 3: the stars the visitor counted. They fade in as the moons disappear.
    G.myStars = el("g", { opacity: 0 }, svg);
    const starRandom = seededRandom(answers.stars * 7 + 3);
    for (let i = 0; i < answers.stars; i++) {
      const x = 60 + starRandom() * (W - 120), y = 10 + starRandom() * 380, size = 4 + starRandom() * 5;
      el("circle", { cx: x, cy: y, r: size * 2.4, fill: "url(#glow" + ID + ")" }, G.myStars);
      el("path", { d: starPath(x, y, size, 0.2), fill: C("star") }, G.myStars);
    }
  
    // the end: the haze clears and shows how many stars were there all along
    G.clearStars = el("g", { opacity: 0 }, svg);
    for (let i = 0; i < 160; i++) {
      const s = el("circle", { cx: random() * W, cy: -30 + random() * 470, r: 0.5 + random() * 1.6, fill: "#fbecc8" }, G.clearStars);
      twinkles.push({ el: s, base: 0.3 + random() * 0.6, phase: random() * 6.28, speed: 0.6 + random() * 1.6 });
    }
  
    // these get redrawn every frame
    G.arc = el("g", {}, svg);
    G.serpent = el("g", {}, svg);
    G.moons = el("g", {}, svg);
  
    // --- the colourful fan of waves behind the mountain (village scene) ---
    G.land = el("g", {}, svg);
    G.waves = el("g", {}, G.land);
    for (let i = 0; i < 11; i++) {
      [-1, 1].forEach(side => {
        const p = el("path", look(tint(BASE.bands[i]), 0.9), G.waves);
        waveEls.push({ el: p, i: i, side: side });
      });
    }
  
    // --- mountain ---
    const mountain = el("g", {}, G.land);
    const poly = (pts, colour, o = 1) => el("polygon", Object.assign({ points: pts.map(p => p.join(",")).join(" ") }, look(C(colour), o)), mountain);
    poly([[0, 522], [90, 508], [170, 516], [260, 538], [0, 538]], "mountC", 0.95);
    poly([[1028, 520], [940, 506], [860, 514], [770, 538], [1028, 538]], "mountC", 0.95);
    poly([[190, 538], [300, 505], [380, 490], [430, 465], [490, 438], [520, 452], [560, 443], [620, 470], [700, 500], [800, 520], [860, 538]], "mount");
    poly([[490, 438], [455, 505], [520, 452]], "mountA");
    poly([[560, 443], [540, 500], [620, 470]], "mountB");
    poly([[520, 452], [540, 500], [470, 522], [455, 505]], "mountC");
    poly([[620, 470], [700, 500], [600, 526], [540, 500]], "mountD");
    poly([[300, 505], [380, 490], [350, 530]], "mountA");
  
    // --- sea: rows of little coloured strokes ---
    G.sea = el("g", {}, svg);
    el("rect", { x: -100, y: HORIZON, width: W + 200, height: H - HORIZON + 100, fill: C("sea") }, G.sea);
    el("rect", { x: -100, y: HORIZON - 1, width: W + 200, height: 2.5, fill: C("horizon"), opacity: 0.6 }, G.sea);
    for (let y = HORIZON + 5, row = 0; y < H + 30; row++) {
      const h = 3 + random() * 6, rowGroup = el("g", {}, G.sea);
      const depth = clamp((y - HORIZON) / (H - HORIZON));
      let x = -60 + random() * 40;
      while (x < W + 40) {
        const w = 24 + random() * 190 * (0.6 + depth);
        const colour = tint(BASE.water[Math.floor(random() * BASE.water.length)]);
        if (random() > 0.25) {
          el("rect", Object.assign({ x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: h / 2 }, look(colour, 0.55 + (1 - depth) * 0.4)), rowGroup);
        }
        x += w + 4 + random() * 30;
      }
      seaRows.push({ el: rowGroup, row: row, y: y });
      y += h + 1 + random() * 3;
    }
  
    // noise ripples and the zoomed-in moon sit on top
    G.ripples = el("g", {}, svg);
    G.zoom = el("g", {}, svg);
  
    // --- texture on top of everything ---
    el("image", { href: textures.mottle, x: 0, y: -40, width: W, height: H + 80, preserveAspectRatio: "none", style: "mix-blend-mode:overlay", opacity: 0.3 }, svg);
    el("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: "url(#grain" + ID + ")", style: "mix-blend-mode:overlay", opacity: 0.16 }, svg);
    el("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: "url(#vig" + ID + ")" }, svg);
  
    draw();
  }
  
  
  // ---------------- drawing pieces that move ----------------
  
  // one moon. k = how lit (0 to 1). shadow = the serpent's shadow passing over it.
  function drawMoon(parent, x, y, r, k, side, opacity, shadowAmount, index) {
    if (opacity < 0.01) return;
    const g = el("g", { opacity: opacity.toFixed(2) }, parent);
    if (index === 0 && r > 30) el("circle", { cx: x, cy: y, r: r * 1.9, fill: "url(#glow" + ID + ")", opacity: (0.5 * (1 - shadowAmount)).toFixed(2) }, g);
    el("circle", Object.assign({ cx: x, cy: y, r: r }, look(C("lit"))), g);
  
    // the dark part of the moon
    if (k < 0.995) {
      const semi = side > 0 ? 0 : 1, term = k < 0.5 ? semi : 1 - semi, rx = Math.max(0.01, r * Math.abs(1 - 2 * k));
      const d = "M" + x + "," + (y - r) + "A" + r + "," + r + " 0 0 " + semi + " " + x + "," + (y + r) +
                "A" + rx + "," + r + " 0 0 " + term + " " + x + "," + (y - r) + "Z";
      el("path", { d: d, fill: C("dark"), opacity: 0.9 }, g);
    }
  
    // the serpent's shadow sliding across
    if (shadowAmount > 0.01) {
      const id = "clip" + index + ID, clip = el("clipPath", { id: id }, g);
      el("circle", { cx: x, cy: y, r: r + 0.5 }, clip);
      el("circle", { cx: x + (1 - shadowAmount) * r * 2.1, cy: y - r * 0.12, r: r * 1.04, fill: C("sky1"), opacity: 0.94, "clip-path": "url(#" + id + ")" }, g);
    }
  }
  
  function drawSky() {
    G.arc.innerHTML = ""; G.serpent.innerHTML = ""; G.moons.innerHTML = "";
  
    // the faint arc the moons travel along
    const arcPoints = [];
    for (let a = -82; a <= 82; a += 3) arcPoints.push(arcPos(a, 400, 372));
    el("path", { d: smooth(arcPoints), fill: "none", stroke: C("arc"), "stroke-width": 1, opacity: 0.4 }, G.arc);
  
    // --- Bakunawa ---
    if (serpentLength > 0.01) {
      // at the end he keeps circling slowly along the arc
      const start = stage === 7 ? -104 + (time * 9) % 230 : -104;
      const end = start + serpentLength * 182, body = [];
      for (let a = start; a <= end; a += 2) {
        const wiggle = 8 * Math.sin(a * 0.12 + time * 0.8);
        body.push(arcPos(a, 400 + wiggle, 372 + wiggle));
      }
      if (body.length > 1) {
        // scene 2: the brighter it is outside, the stronger his glow against the haze
        const glowStrength = 0.15 + answers.brightness / 100 * 0.75;
        el("path", { d: smooth(body), fill: "none", stroke: C("serpent"), "stroke-width": 26, "stroke-linecap": "round", opacity: glowStrength.toFixed(2), filter: "url(#soft" + ID + ")" }, G.serpent);
        el("path", { d: smooth(body), fill: "none", stroke: C("serpent"), "stroke-width": 9, "stroke-linecap": "round", opacity: 0.7 }, G.serpent);
        el("path", { d: smooth(body), fill: "none", stroke: tint("#d8fff2"), "stroke-width": 2, "stroke-dasharray": "1 7", "stroke-linecap": "round", opacity: 0.6 }, G.serpent);
        // head + eye
        const [hx, hy] = body[body.length - 1], [px, py] = body[body.length - 2];
        const angle = Math.atan2(hy - py, hx - px) * 180 / Math.PI;
        el("ellipse", { cx: hx, cy: hy, rx: 16, ry: 10, transform: "rotate(" + angle.toFixed(1) + " " + hx.toFixed(1) + " " + hy.toFixed(1) + ")", fill: C("serpent"), opacity: 0.9 }, G.serpent);
        el("circle", { cx: hx + Math.cos((angle - 35) * Math.PI / 180) * 8, cy: hy + Math.sin((angle - 35) * Math.PI / 180) * 8, r: 2, fill: C("star") }, G.serpent);
      }
    }
  
    // --- the seven moons ---
    SLOTS.forEach((angle, i) => {
      let { r, k } = moonSize(angle);
      let [x, y] = arcPos(angle);
      let opacity = clamp((82 - Math.abs(angle)) / 12);
  
      if (i === 0) {
        // the last moon: starts alone and big in the middle, then settles at the top of the arc
        x = lerp(CX, x, vis.arc); y = lerp(300, y, vis.arc); r = lerp(92, r, vis.arc); k = moonLit;
        drawMoon(G.moons, x, y, r, k, 1, opacity * (1 - vis.zoom), shadow, 0);
  
        // stage 4: his coil wrapped around it. Noise loosens it.
        if (wrap > 0.01) {
          const ringR = r * 1.25 + (1 - wrap) * 70;
          el("circle", { cx: x, cy: y, r: ringR, fill: "none", stroke: C("serpent"), "stroke-width": 20, opacity: (wrap * 0.35).toFixed(2), filter: "url(#soft" + ID + ")" }, G.serpent);
          el("circle", { cx: x, cy: y, r: ringR, fill: "none", stroke: C("serpent"), "stroke-width": 8, "stroke-dasharray": "40 10", opacity: (wrap * 0.85).toFixed(2), transform: "rotate(" + (time * 30).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")" }, G.serpent);
        }
      } else {
        const gone = clamp(eaten - EAT_ORDER[i]);
        opacity *= vis.arc * (1 - 0.95 * gone) * (1 - vis.zoom);
        drawMoon(G.moons, x, y, r, k, angle < 0 ? 1 : -1, opacity, 0, i);
      }
    });
  }
  
  // stage 6: zoom into the real moon and show the bamboo
  function drawZoom() {
    G.zoom.innerHTML = "";
    const z = vis.zoom;
    if (z < 0.01) return;
  
    el("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: "#07061a", opacity: (z * 0.85).toFixed(2) }, G.zoom);
    const scale = lerp(0.3, 1, z), cy = lerp(110, 290, z);
    el("circle", { cx: CX, cy: cy, r: 230 * scale * 1.5, fill: "url(#glow" + ID + ")", opacity: z.toFixed(2) }, G.zoom);
  
    // everything inside is drawn as if the moon has radius 230, then scaled
    const moon = el("g", { transform: "translate(" + CX + " " + cy.toFixed(1) + ") scale(" + scale.toFixed(3) + ")", opacity: z.toFixed(2) }, G.zoom);
    el("circle", { cx: 0, cy: 0, r: 230, fill: C("lit") }, moon);
    const inside = el("g", { "clip-path": "url(#moonclip" + ID + ")" }, moon);
  
    // the darker patches
    PATCHES.forEach(([x, y, rx, ry, rot]) => {
      el("ellipse", { cx: x, cy: y, rx: rx, ry: ry, transform: "rotate(" + rot + " " + x + " " + y + ")", fill: C("bamboo"), opacity: 0.35 }, inside);
    });
  
    // scene 5: how the bamboo is shown
    // yes = clear bamboo, unsure = fainter but pointed out, cant = dotted, "it's there even if you can't see it"
    const answer = answers.patches;
    const strength = answer === "yes" ? 0.85 : answer === "unsure" ? 0.55 : 0.6;
    const dash = answer === "cant" ? "1 9" : "none";
    BAMBOO.forEach(([x, y, h, lean], i) => {
      const grow = clamp(z * 1.6 - i * 0.05);    // stalks grow one after another
      const topX = x + lean * grow, topY = y + h / 2 - h * grow;
      const stalk = { stroke: tint("#6f6450"), "stroke-width": 7, "stroke-linecap": "round", "stroke-dasharray": dash, opacity: strength };
      el("line", Object.assign({ x1: x, y1: y + h / 2, x2: topX.toFixed(1), y2: topY.toFixed(1) }, stalk), inside);
      // little joints along the stalk, like constellation dots
      for (let n = 1; n < 4; n++) {
        const t = n / 4;
        if (t > grow) break;
        el("circle", { cx: lerp(x, topX, t / grow).toFixed(1), cy: lerp(y + h / 2, topY, t / grow).toFixed(1), r: 4, fill: tint("#5c523f"), opacity: strength }, inside);
      }
    });
  
    // "not sure": pulsing rings point out where to look
    if (answer === "unsure") {
      PATCHES.slice(0, 3).forEach(([x, y, rx], i) => {
        const pulse = (time * 0.6 + i * 0.33) % 1;
        el("circle", { cx: x, cy: y, r: (rx * (0.8 + pulse * 0.6)).toFixed(1), fill: "none", stroke: "#c2306f", "stroke-width": 3, "stroke-dasharray": "2 10", "stroke-linecap": "round", opacity: ((1 - pulse) * z).toFixed(2) }, moon);
      });
    }
  }
  
  // the fan of waves behind the mountain, rocking a little (more when there's noise)
  function drawWaves() {
    const steps = [];
    for (let u = 26; u <= 600; u += 14) steps.push(u);
    function edge(i, side) {
      return steps.map(u => {
        const t = clamp((u - 28) / 560), ease = 1 - Math.pow(1 - t, 2.4);
        const yCentre = 418 + i * 5, yEdge = 232 + (i > 0 ? 50 + (i - 1) * 27 : 0);
        const wave = (46 + (i % 3) * 7) * (1 + noiseWobble * 0.7) * Math.sin(t * (4.1 + i * 0.04) + i * 0.16 + side * 0.6 + time * (0.35 + (i % 4) * 0.06) * (1 + noiseWobble * 3)) * Math.pow(t, 0.7);
        return [CX + side * u, yCentre + (yEdge - yCentre) * ease + wave];
      });
    }
    waveEls.forEach(({ el: path, i, side }) => {
      const bottom = edge(i + 1, side).reverse();
      path.setAttribute("d", smooth(edge(i, side)) + smooth(bottom).replace(/^M/, "L") + "Z");
    });
  }
  
  // scene 4: noise ripples. They get bigger the more noise the village makes.
  function drawRipples() {
    G.ripples.innerHTML = "";
    ripples = ripples.filter(rp => time - rp.at < 2.4);
    ripples.forEach(rp => {
      const age = time - rp.at, size = age * 560 * rp.power;
      el("path", { d: "M" + (CX - size) + "," + HORIZON + "A" + size + "," + (size * 0.9) + " 0 0 1 " + (CX + size) + "," + HORIZON, fill: "none", stroke: C("gold"), "stroke-width": 2.5 + rp.power * 2, opacity: ((1 - age / 2.4) * 0.6).toFixed(3) }, G.ripples);
    });
  }
  
  function draw() {
    G.sky.setAttribute("opacity", vis.sky.toFixed(3));
    G.haze.setAttribute("opacity", vis.haze.toFixed(3));
    G.arc.setAttribute("opacity", vis.arc.toFixed(3));
    G.serpent.setAttribute("opacity", vis.serpent.toFixed(3));
    G.sea.setAttribute("opacity", vis.sea.toFixed(3));
    G.land.setAttribute("opacity", vis.land.toFixed(3));
    G.myStars.setAttribute("opacity", clamp((eaten - 1) / 4).toFixed(3));
    G.clearStars.setAttribute("opacity", vis.clear.toFixed(3));
  
    if (vis.land > 0.005) drawWaves();
    drawSky();
    drawRipples();
    drawZoom();
  
    seaRows.forEach(({ el: row, y }) => row.setAttribute("transform", "translate(" + (Math.sin(time * 0.7 + y * 0.09) * 4).toFixed(1) + ",0)"));
    twinkles.forEach(s => s.el.setAttribute("opacity", (s.base * (0.55 + 0.45 * Math.sin(time * s.speed + s.phase))).toFixed(2)));
  }
  
  
  // ---------------- moving through the story ----------------
  
  // where each value is heading for the current stage
  function targets() {
    const b = answers.brightness / 100;
    return {
      sky: stage >= 1 ? 1 : 0.4,
      arc: stage >= 1 ? 1 : 0,
      sea: stage >= 2 ? 1 : 0,
      serpent: stage >= 2 && stage !== 6 ? 1 : 0,
      land: stage >= 4 && stage !== 6 ? 1 : 0,
      zoom: stage === 6 ? 1 : 0,
      clear: stage === 7 ? 1 : 0,
      haze: stage === 7 ? 0.1 : 0.35 + b * 0.65,
      serpentLength: stage === 2 ? 0.55 : stage >= 3 && stage <= 4 ? 1 : stage === 5 ? 0.5 : stage === 7 ? 0.35 : 0,
      eaten: stage === 2 ? 1 : stage >= 3 ? 6 : 0,
      shadow: stage === 3 || stage === 4 ? 0.7 : 0,
      wrap: stage === 4 ? 1 - noiseHits / NOISE_GOAL * 0.6 : 0,
      moonLit: stage >= 5 ? 1 : MOON_STYLES[answers.moon].lit
    };
  }
  
  let subtitleTimer = null;
  function setSubtitle(text) {
    clearTimeout(subtitleTimer);
    subtitleEl.classList.add("out");
    subtitleTimer = setTimeout(() => {
      subtitleEl.textContent = text;
      if (text) subtitleEl.classList.remove("out");
    }, reduceMotion ? 0 : 700);
  }
  
  function setStage(n) {
    if (n === stage) return;
    stage = n;
    setSubtitle(n === 6 ? BAMBOO_TEXT[answers.patches] : SUBTITLES[n]);
  
    clearTimeout(bambooTimer);
    if (n === 6) bambooTimer = setTimeout(() => goToEnd(), BAMBOO_TIME);
  }
  
  function goToEnd() {
    hazeCleared = true;
    build(true);      // rebuild without the streetlight tint: the haze clears
    setStage(7);
  }
  
  function resetStory() {
    answers = Object.assign({}, DEFAULT_ANSWERS);
    noiseHits = 0;
    hazeCleared = false;
    clearTimeout(bambooTimer);
    stage = -1;       // so setStage(0) always runs
    setStage(0);
    build(true);
  }
  
  
  // ---------------- messages from the question screen ----------------
  
  let channel = null;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("bakunawa");
    channel.onmessage = function (event) {
      const msg = event.data;
      console.log("received:", msg);
  
      if (msg.type === "reset") resetStory();
      if (msg.type === "scene" && msg.scene === 4 && stage === 3) setStage(4);
      if (msg.type === "noise") noiseHit(msg.hits);
      if (msg.type === "answer") receiveAnswer(msg.scene, msg.answers);
    };
  }
  
  function receiveAnswer(scene, newAnswers) {
    // the glow comes in, the picture changes inside it, then the glow fades
    glowIn();
    setTimeout(function () {
      const before = JSON.stringify([answers.moon, answers.brightness, answers.stars]);
      if (newAnswers.moon) answers.moon = newAnswers.moon;
      if (newAnswers.brightness != null) answers.brightness = newAnswers.brightness;
      if (newAnswers.stars != null) answers.stars = newAnswers.stars;
      if (newAnswers.patches) answers.patches = newAnswers.patches;
  
      // only rebuild when something that changes the drawing has changed
      if (JSON.stringify([answers.moon, answers.brightness, answers.stars]) !== before) build(true);
  
      if (scene === 1) setStage(1);
      if (scene === 2) setStage(2);
      if (scene === 3) setStage(3);
      if (scene === 4 && stage < 5) setStage(5);
      if (scene === 5) setStage(6);
    }, 700);
    setTimeout(glowOut, 2400);
  }
  
  const glowEl = document.createElement("div");
  glowEl.className = "glow";
  stageEl.appendChild(glowEl);
  function glowIn() { glowEl.classList.add("on"); stageEl.classList.add("receiving"); chime(); }
  function glowOut() { glowEl.classList.remove("on"); stageEl.classList.remove("receiving"); }
  
  function noiseHit(hits) {
    if (stage === 3) setStage(4);      // in case the scene message was missed
    if (stage !== 4) return;
    noiseHits = hits;
    noiseWobble = 1;
    ripples.push({ at: time, power: 0.5 + hits / NOISE_GOAL });
    clang();
    if (noiseHits >= NOISE_GOAL) setTimeout(() => setStage(5), 900);
  }
  
  
  // ---------------- sound ----------------
  
  let audio = null, soundOn = true;
  function startAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume().then(updateSoundBtn);
    updateSoundBtn();
  }
  function audioReady() { return audio && audio.state === "running" && soundOn; }
  function updateSoundBtn() { soundBtn.textContent = audioReady() ? "Mute" : "Turn on sound"; }
  
  // a pot or gong being hit
  function clang() {
    if (!audioReady()) return;
    const now = audio.currentTime, out = audio.createGain();
    out.gain.value = 0.22;
    out.connect(audio.destination);
    const base = 150 + Math.random() * 30;
    [1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.frequency.value = base * ratio;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.6 / (i + 1), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4 / (i * 0.6 + 1));
      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + 2.6);
    });
  }
  
  // a soft rising note when an answer arrives
  function chime() {
    if (!audioReady()) return;
    const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 1.3);
  }
  
  
  // ---------------- the animation loop ----------------
  
  let lastFrame = performance.now(), lastDraw = 0;
  
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.06, (now - lastFrame) / 1000);
    lastFrame = now;
    time += dt;
  
    // ease everything a little closer to where it should be
    const T = targets(), rate = reduceMotion ? 1 : Math.min(1, dt * 0.9);
    for (const k in vis) vis[k] += (T[k] - vis[k]) * rate;
    serpentLength += (T.serpentLength - serpentLength) * (reduceMotion ? 1 : Math.min(1, dt * 0.5));
    eaten += clamp(T.eaten - eaten, -dt * 2.4, dt * 0.9);            // one moon at a time
    if (reduceMotion) eaten = T.eaten;
    shadow += (T.shadow - shadow) * (reduceMotion ? 1 : Math.min(1, dt * 0.6));
    wrap += (T.wrap - wrap) * (reduceMotion ? 1 : Math.min(1, dt * 1.5));
    moonLit += (T.moonLit - moonLit) * (reduceMotion ? 1 : Math.min(1, dt * 0.8));
    noiseWobble *= Math.exp(-dt * 2.5);
  
    // about 30 frames a second is plenty for this
    if (now - lastDraw < 33) return;
    lastDraw = now;
    draw();
  }
  
  
  // ---------------- buttons + keys ----------------
  
  soundBtn.addEventListener("click", function () {
    if (audioReady()) soundOn = false;
    else { soundOn = true; startAudio(); }
    updateSoundBtn();
  });
  
  function fullScreen() {
    if (stageEl.requestFullscreen) stageEl.requestFullscreen().catch(() => {});
  }
  document.getElementById("fullBtn").addEventListener("click", fullScreen);
  
  // hide the buttons when the mouse is still
  let hideTimer = null;
  function showControls() {
    controls.classList.remove("hide");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => controls.classList.add("hide"), 3000);
  }
  stageEl.addEventListener("pointermove", showControls);
  stageEl.addEventListener("click", function (e) {
    if (!e.target.closest("button")) startAudio();
  });
  
  document.addEventListener("keydown", function (e) {
    startAudio();
    if (e.key === "f" || e.key === "F") fullScreen();
    if (e.key === "n" || e.key === "N") noiseHit(noiseHits + 1);
    if (e.key >= "0" && e.key <= "7") {
      const n = Number(e.key);
      if (n === 7) { goToEnd(); return; }
      if (hazeCleared) { hazeCleared = false; build(true); }
      setStage(n);
    }
  });
  
  
  // ---------------- start ----------------
  
  makeTextures();
  build(false);
  setSubtitle(SUBTITLES[0]);
  showControls();
  requestAnimationFrame(loop);