// ===================================================
// Bakunawa question screen
// The visitor answers here; the big story screen listens
// on the "bakunawa" channel and changes how it draws.
// ===================================================

// everything the visitor tells us
const answers = {
  moon: null,        // full / half / crescent / none
  brightness: null,  // 0 to 100
  stars: null,       // 0 to 20
  noise: 0,          // number of hits
  patches: null      // yes / unsure / cant
};

// what to show on the "look up" screen after each scene
const watchTexts = [
  { eyebrow: "Seven moons",        title: "Look up at the big screen.",   text: "Bathala made seven moons, one for every night of the week." },
  { eyebrow: "The serpent rises",  title: "Something stirs in the sea.",  text: "Bakunawa has fallen in love with the moons." },
  { eyebrow: "The dark comes",     title: "Watch the moons go dark.",     text: "One by one he swallows them, until only one is left." },
  { eyebrow: "The last moon",      title: "He's letting go!",             text: "Frightened by the noise, Bakunawa spits the moon back out." }
];

const NOISE_GOAL = 10;   // how many hits it takes to scare him off
let currentScene = 0;    // 0 = intro, 1 to 5 = scenes

// talk to the story screen (works when both are open in the same browser)
let channel = null;
if ("BroadcastChannel" in window) {
  channel = new BroadcastChannel("bakunawa");
}
function send(message) {
  if (channel) channel.postMessage(message);
  console.log("sent:", message);
}

// a new visitor: tell the story screen to start from the beginning
send({ type: "reset" });


// ---------------- moving between screens ----------------

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function (screen) {
    screen.classList.remove("active");
  });
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
  updateProgress();
}

function goToScene(number) {
  currentScene = number;
  showScreen("scene" + number);
  send({ type: "scene", scene: number });
}

function updateProgress() {
  const bar = document.getElementById("progress");
  const pips = bar.querySelectorAll("span");
  bar.classList.toggle("show", currentScene > 0);
  pips.forEach(function (pip, i) {
    pip.classList.toggle("done", i + 1 < currentScene);
    pip.classList.toggle("now", i + 1 === currentScene);
  });
}

// show the "look up" screen, then let them carry on after a few seconds
let watchTimer = null;
function showWatch(sceneJustDone) {
  const info = watchTexts[sceneJustDone - 1];
  document.getElementById("watchEyebrow").textContent = info.eyebrow;
  document.getElementById("watchTitle").textContent = info.title;
  document.getElementById("watchText").textContent = info.text;

  const next = document.getElementById("watchNext");
  next.classList.remove("show");
  showScreen("watch");

  clearTimeout(watchTimer);
  watchTimer = setTimeout(function () {
    next.classList.add("show");
  }, 6000);   // roughly how long that part of the story takes
}

document.getElementById("watchNext").addEventListener("click", function () {
  goToScene(currentScene + 1);
});

document.getElementById("begin").addEventListener("click", function () {
  goToScene(1);
});

// every "Continue your story" button
document.querySelectorAll(".continue").forEach(function (button) {
  button.addEventListener("click", function () {
    send({ type: "answer", scene: currentScene, answers: answers });
    if (currentScene < 5) {
      showWatch(currentScene);
    } else {
      showScreen("end");
    }
  });
});

// every back button
document.querySelectorAll(".back").forEach(function (button) {
  button.addEventListener("click", function () {
    goToScene(currentScene - 1);
  });
});

// turn on the continue button for the scene we're on
function allowContinue() {
  const scene = document.getElementById("scene" + currentScene);
  scene.querySelector(".continue").disabled = false;
}


// ---------------- scenes 1 + 5: pick a card ----------------

document.querySelectorAll(".cards").forEach(function (group) {
  const key = group.dataset.key;   // "moon" or "patches"
  const cards = group.querySelectorAll(".card");

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      cards.forEach(function (c) { c.classList.remove("picked"); });
      card.classList.add("picked");
      group.classList.add("has-pick");
      answers[key] = card.dataset.answer;
      allowContinue();
    });
  });
});


// ---------------- scene 2: brightness slider ----------------

const slider = document.getElementById("brightness");
const brightWord = document.getElementById("brightWord");
const skyPreview = document.getElementById("skyPreview");

slider.addEventListener("input", function () {
  const value = Number(slider.value);
  answers.brightness = value;

  // the preview box glows more as it gets brighter
  skyPreview.style.setProperty("--b", value / 100);

  if (value < 20) brightWord.textContent = "Pitch dark";
  else if (value < 45) brightWord.textContent = "A soft glow";
  else if (value < 70) brightWord.textContent = "Streetlight orange";
  else brightWord.textContent = "Bright as day";

  allowContinue();
});


// ---------------- scene 3: star counter ----------------

const countText = document.getElementById("count");
const starRow = document.getElementById("starRow");
let stars = 0;

function setStars(number) {
  stars = Math.max(0, Math.min(20, number));   // keep it between 0 and 20
  answers.stars = stars;
  countText.textContent = stars === 20 ? "20+" : stars;
  starRow.textContent = "✦".repeat(stars);
  allowContinue();
}

document.getElementById("plus").addEventListener("click", function () { setStars(stars + 1); });
document.getElementById("minus").addEventListener("click", function () { setStars(stars - 1); });
document.getElementById("noStars").addEventListener("click", function () { setStars(0); });


// ---------------- scene 4: make noise ----------------

const meter = document.getElementById("meter");
const pot = document.getElementById("pot");
const noiseMsg = document.getElementById("noiseMsg");

// make the row of diamonds
for (let i = 0; i < NOISE_GOAL; i++) {
  meter.appendChild(document.createElement("span"));
}

function hit() {
  if (answers.noise >= NOISE_GOAL) return;
  answers.noise++;
  send({ type: "noise", hits: answers.noise });

  // light up the next diamond
  meter.children[answers.noise - 1].classList.add("lit");

  // restart the ripple animation
  pot.classList.remove("hit");
  void pot.offsetWidth;
  pot.classList.add("hit");

  if (answers.noise >= NOISE_GOAL) {
    noiseMsg.textContent = "He's afraid! Bakunawa lets go of the moon.";
    stopMic();
    allowContinue();
  }
}

pot.addEventListener("click", hit);

// optional: claps and shouts through the microphone count as hits
// (needs the page served from https or localhost)
const micBtn = document.getElementById("micBtn");
let micStream = null;
let micLoop = null;

micBtn.addEventListener("click", async function () {
  if (micStream) { stopMic(); return; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    micBtn.textContent = "Mic not available, tap instead";
    return;
  }
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  audio.createMediaStreamSource(micStream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let lastHit = 0;

  micBtn.textContent = "Listening… tap to stop";
  micBtn.classList.add("listening");

  micLoop = setInterval(function () {
    analyser.getByteTimeDomainData(data);
    // find the loudest point (128 is silence)
    let loudest = 0;
    for (let i = 0; i < data.length; i++) {
      loudest = Math.max(loudest, Math.abs(data[i] - 128));
    }
    // a loud sound, and not straight after the last one
    if (loudest > 60 && Date.now() - lastHit > 300) {
      lastHit = Date.now();
      hit();
    }
  }, 50);
});

function stopMic() {
  clearInterval(micLoop);
  if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
  micStream = null;
  micBtn.textContent = "Use the microphone";
  micBtn.classList.remove("listening");
}


// ---------------- start again ----------------

document.getElementById("again").addEventListener("click", function () {
  location.reload();   // simplest way to clear everything for the next visitor
});