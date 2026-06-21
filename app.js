/* =====================================================================
   টালিখাতা Viral Quiz Campaign — front-end portal
   ---------------------------------------------------------------------
   (1) screen router + step counter, (2) quiz/timer/share logic, and
   (3) a MOCK BACKEND (the `API` object) faking the server via localStorage.
   To go live, replace the `API.*` method bodies with real fetch() calls.
   ===================================================================== */

/* ----------------------------- CONFIG ----------------------------- */
const CONFIG = {
  campaignId: "july",
  // Fallback portal URL. The share link normally uses the LIVE page URL
  // (see portalBase()), so this only matters when opened via file://.
  portalUrl: "http://localhost:8123/",
  appStoreUrl: "https://play.google.com/store/apps/details?id=com.progoti.tallykhata",
  fbPage: "https://www.facebook.com/TallyKhataApp",
  minShares: 1,            // one WhatsApp share unlocks the next step
  minReferralsToWin: 3,    // win condition reminder
  totalSteps: 10,          // for the top-right step counter (X/১০)
  prizeBn: "১০,০০০",
};

/* --------------------------- UTILITIES ---------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

function normalizeMobile(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("88")) d = d.slice(2);
  if (d.length === 10 && d[0] === "1") d = "0" + d;
  return d;
}
const isValidMobile = (d) => /^01[3-9]\d{8}$/.test(d);

function genCode(mobile) {
  let h = 0;
  for (const ch of mobile) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(0, 6).toUpperCase();
}

// duration in ms -> "M:SS"
function fmtDuration(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${toBn(m)}:${toBn(String(s % 60).padStart(2, "0"))}`;
}
// timestamp -> "DD/MM/YYYY, HH:MM" in Bengali digits
function fmtDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return toBn(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2600);
}

/* =====================================================================
   MOCK BACKEND  (swap these bodies for real API calls when going live)
   ===================================================================== */
const API = (() => {
  const KEY = "tk_campaign_db_v2";
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{"participants":{},"codes":{}}');
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));

  return {
    getParticipant(mobile) { return load().participants[mobile] || null; },

    register(mobile, profession) {
      const db = load();
      if (!db.participants[mobile]) {
        const code = genCode(mobile);
        db.participants[mobile] = {
          mobile, profession, code,
          lastTimeMs: null, lastAt: null,
          bestTimeMs: null, bestAt: null,
          shares: 0,
          selfRegistered: false,
          referredInstalls: 0,
          completed: false,
          createdAt: Date.now(),
        };
        db.codes[code] = mobile;
        save(db);
      } else if (profession) {
        db.participants[mobile].profession = profession;
        save(db);
      }
      return db.participants[mobile];
    },

    update(mobile, patch) {
      const db = load();
      if (db.participants[mobile]) { Object.assign(db.participants[mobile], patch); save(db); }
      return db.participants[mobile];
    },

    /** Record a finished quiz run: keep last time + lowest (best) time, each with date. */
    recordQuizTime(mobile, timeMs) {
      const db = load();
      const p = db.participants[mobile];
      if (!p) return null;
      const now = Date.now();
      p.lastTimeMs = timeMs; p.lastAt = now;
      if (p.bestTimeMs == null || timeMs < p.bestTimeMs) { p.bestTimeMs = timeMs; p.bestAt = now; }
      save(db);
      return p;
    },

    /** Mark this person registered TallyKhata, and credit their inviter. */
    confirmInstall(mobile, inviterCode) {
      const db = load();
      const p = db.participants[mobile];
      if (!p) return null;
      p.selfRegistered = true;
      p.completed = true;
      if (inviterCode && db.codes[inviterCode]) {
        const inviter = db.codes[inviterCode];
        if (inviter !== mobile) {
          db.participants[inviter].referredInstalls = (db.participants[inviter].referredInstalls || 0) + 1;
        }
      }
      save(db);
      return p;
    },

    stats(mobile) {
      const db = load();
      const p = db.participants[mobile];
      if (!p) return null;
      const ranks = Object.values(db.participants).map((x) => x.referredInstalls || 0).sort((a, b) => b - a);
      return {
        referredInstalls: p.referredInstalls || 0,
        rank: ranks.indexOf(p.referredInstalls || 0) + 1,
        total: ranks.length,
        lastTimeMs: p.lastTimeMs, lastAt: p.lastAt,
        bestTimeMs: p.bestTimeMs, bestAt: p.bestAt,
        selfRegistered: !!p.selfRegistered,
      };
    },
  };
})();

/* =====================================================================
   QUIZ DATA
   - single-answer: options are strings, correct = index 0
   - multi-answer (multi:true): options are {text, correct}, all must match
   ===================================================================== */
const QUIZ = [
  {
    q: "টালিখাতা অ্যাপে কিসের হিসাব রাখা যায়?",
    options: ["ব্যবসার বাকির হিসাব", "নিজের হিসাব"],
  },
  {
    q: "বাকির হিসাবে কি কি সুবিধা পাওয়া যায়?",
    multi: true,
    options: [
      { text: "এন্ট্রি করলেই মেসেজ যায়", correct: true },
      { text: "মোট বাকির পরিমাণ জানা যায়", correct: true },
      { text: "কার কাছে কত বাকি সব জানা যায়", correct: true },
    ],
  },
  {
    q: "আনলিমিটেড এন্ট্রি প্যাকেজ এর দাম কত?",
    options: ["৭৯ টাকা", "১২৯ টাকা", "১০০ টাকা"],
  },
  {
    q: "টালিপে কিউআর-এ নিচের কোন কোন অ্যাপ থেকে পেমেন্ট নেয়া যায়?",
    multi: true,
    options: [
      { text: "নগদ", correct: true },
      { text: "বিকাশ", correct: true },
      { text: "রকেট", correct: true },
      { text: "সব ব্যাংক অ্যাপ", correct: true },
    ],
  },
  {
    q: "টালিপে কিউআর কিভাবে পাওয়া যায়?",
    options: ["টালিখাতা অ্যাপ থেকে আবেদনের সাথে সাথে", "অফিসে গিয়ে আবেদন করে ৭ দিন পর"],
  },
];

const PROFESSIONS = [
  { name: "মুদি ব্যবসায়ী", icon: "🛒" },
  { name: "ফার্মেসি ব্যবসায়ী", icon: "💊" },
  { name: "হার্ডওয়্যার ব্যবসায়ী", icon: "🔧" },
  { name: "রেস্তোরাঁ ব্যবসায়ী", icon: "🍽️" },
  { name: "ডিলার / ডিস্ট্রিবিউটর", icon: "🚚" },
  { name: "জুতা ব্যবসায়ী", icon: "👟" },
  { name: "চাকুরি", icon: "💼" },
  { name: "শিক্ষার্থী", icon: "🎓" },
  { name: "অন্যান্য", icon: "🔖" },
];

/* =============================== STATE =============================== */
const state = {
  mobile: null,
  profession: null,
  inviterCode: new URLSearchParams(location.search).get("ref") || null,
  quizStart: 0,
  quizIndex: 0,
  lastQuizMs: null,
  shares: 0,
  downloaded: false,
  timerId: null,
};

/* ===================== STEP COUNTER + PROGRESS ====================== */
// Map each screen to its position in the 10-step main flow.
function stepOf(screen) {
  switch (screen) {
    case "intro": return 1;
    case "mobile": return 2;
    case "profession": return 3;
    case "quiz": return 4 + state.quizIndex;     // q1..q5 -> 4..8
    case "wrong": return 4 + state.quizIndex;
    case "correct": return 9;
    case "download": return 10;
    case "final": return 10;
    default: return null;                         // repeat -> no counter
  }
}

/* ============================== ROUTER ============================== */
function show(screen) {
  if (screen !== "quiz") stopTimer();
  $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
  $("#app").scrollTop = 0;
  $$(".screen-body").forEach((b) => (b.scrollTop = 0));

  const step = stepOf(screen);
  const counter = $("#stepCounter");
  if (step) {
    counter.hidden = false;
    counter.textContent = `${toBn(step)}/${toBn(CONFIG.totalSteps)}`;
    $("#progressBar").style.width = ((step - 1) / (CONFIG.totalSteps - 1)) * 100 + "%";
    $("#progressWrap").style.visibility = "visible";
  } else {
    counter.hidden = true;
    $("#progressWrap").style.visibility = "hidden";
  }

  if (screen === "quiz") renderQuestion();
}

/* ============================ INTRO / TERMS ========================= */
function refreshStartGate() { $("#startBtn").disabled = !$("#termsCheck").checked; }

function startFlow() {
  show("mobile");
  setTimeout(() => $("#mobileInput").focus(), 250);
}

/* =========================== MOBILE ENTRY =========================== */
function submitMobile() {
  const m = normalizeMobile($("#mobileInput").value);
  const err = $("#mobileError");
  if (!isValidMobile(m)) { err.hidden = false; return; }
  err.hidden = true;
  state.mobile = m;

  const existing = API.getParticipant(m);
  if (existing && existing.completed) { showRepeat(m); return; }
  API.register(m, null);
  show("profession");
}

/* ===================== REPEAT (already participated) ================ */
function showRepeat(mobile) {
  const s = API.stats(mobile);
  $("#rpLastTime").textContent = fmtDuration(s.lastTimeMs);
  $("#rpLastDate").textContent = s.lastAt ? "রেকর্ড: " + fmtDateTime(s.lastAt) : "";
  $("#rpBestTime").textContent = fmtDuration(s.bestTimeMs);
  $("#rpBestDate").textContent = s.bestAt ? "রেকর্ড: " + fmtDateTime(s.bestAt) : "";
  $("#rpReferrals").textContent = toBn(s.referredInstalls);

  const reg = $("#rpRegStatus");
  const dl = $("#rpDownloadBtn");
  if (s.selfRegistered) {
    reg.innerHTML = "আপনি টালিখাতা রেজিস্ট্রেশন <b>করেছেন</b>। ✓";
    dl.hidden = true;
  } else {
    reg.innerHTML = "আপনি টালিখাতা রেজিস্ট্রেশন <b>করেননি</b>। জিততে হলে ডাউনলোড ও রেজিস্ট্রেশন করুন:";
    dl.hidden = false;
  }
  show("repeat");
}

/* ============================ PROFESSION ============================ */
function renderProfessions() {
  const grid = $("#professionGrid");
  grid.innerHTML = "";
  PROFESSIONS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "prof-btn";
    b.dataset.name = p.name;
    b.innerHTML = `<span class="prof-icon">${p.icon}</span><span class="prof-name">${p.name}</span>`;
    b.onclick = () => selectProfession(b);
    grid.appendChild(b);
  });
}
function selectProfession(btn) {
  $$(".prof-btn").forEach((x) => x.classList.remove("selected"));
  btn.classList.add("selected");
  state.profession = btn.dataset.name;
  $("#professionNextBtn").disabled = false;
}
// pre-select a profession by name (used when a returning participant replays)
function preselectProfession(name) {
  state.profession = null;
  $("#professionNextBtn").disabled = true;
  $$(".prof-btn").forEach((x) => x.classList.remove("selected"));
  const btn = $$(".prof-btn").find((b) => b.dataset.name === name);
  if (btn) selectProfession(btn);
}
function professionNext() {
  if (!state.profession) return;
  API.register(state.mobile, state.profession);
  startQuiz();
}

/* =============================== QUIZ =============================== */
function startQuiz() {
  state.quizIndex = 0;
  state.quizStart = Date.now();   // ▶ clock starts on the first question
  show("quiz");
  startTimer();
}

function startTimer() {
  stopTimer();
  const tick = () => { $("#quizTimer").textContent = "⏱ " + fmtDuration(Date.now() - state.quizStart); };
  tick();
  state.timerId = setInterval(tick, 1000);
}
function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

function normalizeOptions(item) {
  if (item.multi) return item.options.map((o) => ({ text: o.text, correct: !!o.correct }));
  return item.options.map((t, i) => ({ text: t, correct: i === 0 }));
}

function renderQuestion() {
  const item = QUIZ[state.quizIndex];
  const isMulti = !!item.multi;
  $("#quizCount").textContent = `প্রশ্ন ${toBn(state.quizIndex + 1)} / ${toBn(QUIZ.length)}`;
  $("#quizQuestion").textContent = item.q;
  $("#quizBg").style.backgroundImage = item.bg ? `url("${item.bg}")` : "none";

  $("#quizHint").hidden = !isMulti;
  const confirmBtn = $("#quizConfirmBtn");
  confirmBtn.hidden = !isMulti;
  confirmBtn.disabled = true;

  const wrap = $("#quizOptions");
  wrap.innerHTML = "";
  const opts = normalizeOptions(item);
  for (let i = opts.length - 1; i > 0; i--) {          // shuffle order
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  opts.forEach((o) => {
    const b = document.createElement("button");
    b.className = "quiz-opt" + (isMulti ? " multi" : "");
    b.textContent = o.text;
    b.dataset.correct = o.correct ? "1" : "0";
    if (isMulti) {
      b.onclick = () => {
        b.classList.toggle("selected");
        confirmBtn.disabled = wrap.querySelector(".quiz-opt.selected") === null;
      };
    } else {
      b.onclick = () => answer(o.correct);
    }
    wrap.appendChild(b);
  });
}

function quizConfirm() {
  const all = $$(".quiz-opt", $("#quizOptions"));
  const ok = all.every((b) => (b.dataset.correct === "1") === b.classList.contains("selected"));
  answer(ok);
}

function answer(correct) {
  if (!correct) { stopTimer(); show("wrong"); return; }
  if (state.quizIndex < QUIZ.length - 1) {
    state.quizIndex++;
    show("quiz");
  } else {
    // finished the last question — stop the clock and record the time
    stopTimer();
    state.lastQuizMs = Date.now() - state.quizStart;
    API.recordQuizTime(state.mobile, state.lastQuizMs);
    $("#correctTime").textContent = fmtDuration(state.lastQuizMs);
    state.shares = 0;
    updateShareUI();
    show("correct");
  }
}

function retryQuiz() {
  state.quizIndex = 0;
  state.quizStart = Date.now();   // fresh attempt -> reset the clock
  show("quiz");
  startTimer();
}

/* ============================== SHARE =============================== */
function portalBase() {
  if (location.origin && location.origin !== "null") return location.origin + location.pathname;
  return CONFIG.portalUrl;
}
function shareUrl() {
  const p = API.getParticipant(state.mobile);
  const code = p ? p.code : genCode(state.mobile || "");
  return `${portalBase()}?ref=${code}`;
}
function shareMessage() {
  return `জিতে নিন ক্যাশ ${CONFIG.prizeBn} টাকা পুরস্কার!\n` +
         `টালিখাতা রেফার করুন ন্যূনতম ১০ জনকে। এ সুযোগ সীমিত সময়ের জন্য।\n` +
         shareUrl();
}

function doShare() {
  const text = shareMessage(), url = shareUrl();
  const link = `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (navigator.share) navigator.share({ text, url }).catch(() => window.open(link, "_blank"));
  else window.open(link, "_blank");
}
function shareFromCorrect() {
  doShare();
  state.shares++;
  API.update(state.mobile, { shares: state.shares });
  if (state.shares === CONFIG.minShares) toast("দারুণ! এবার পরবর্তী ধাপে যান।");
  updateShareUI();
}
function updateShareUI() {
  const done = state.shares >= CONFIG.minShares;
  $("#correctNextBtn").disabled = !done;
  $("#correctHint").style.display = done ? "none" : "block";
}

/* ============================= DOWNLOAD ============================= */
function buildDownloadUrl() {
  const p = API.getParticipant(state.mobile);
  const trail = `tk_${CONFIG.campaignId}_${p ? p.code : ""}`;
  const u = new URL(CONFIG.appStoreUrl);
  u.searchParams.set("referrer", trail);
  return u.toString();
}
function onDownloadTap() {
  window.open(buildDownloadUrl(), "_blank");
  state.downloaded = true;
  // enable the final "complete" button once download is tapped
  const finalBtn = $("#finalBtn");
  if (finalBtn) { finalBtn.disabled = false; $("#downloadHint").style.display = "none"; }
  toast("ডাউনলোড ও রেজিস্ট্রেশন শেষে নিচের বোতামে ট্যাপ করুন।");
}
function finish() {
  API.confirmInstall(state.mobile, state.inviterCode);
  show("final");
}

/* ============================ REPLAY ============================== */
function playAgain() {
  // returning participant re-runs the same path, with their previous profession pre-selected
  show("profession");
  const p = API.getParticipant(state.mobile);
  preselectProfession(p && p.profession);
}

function reshareWhatsapp() { doShare(); }

/* ============================= ACTIONS ============================= */
const ACTIONS = {
  "open-terms": (e) => { e && e.preventDefault(); $("#termsModal").hidden = false; },
  "close-terms": () => { $("#termsModal").hidden = true; },
  "start": startFlow,
  "submit-mobile": submitMobile,
  "play-again": playAgain,
  "profession-next": professionNext,
  "quiz-confirm": quizConfirm,
  "retry-quiz": retryQuiz,
  "correct-next": () => { state.downloaded = false; $("#finalBtn").disabled = true; $("#downloadHint").style.display = "block"; show("download"); },
  "finish": finish,
  "reshare-whatsapp": reshareWhatsapp,
  "goto-home": () => show("intro"),
};

/* ============================== INIT =============================== */
function init() {
  renderProfessions();

  $$("[data-action]").forEach((el) => {
    const name = el.dataset.action;
    if (name === "download") {
      el.addEventListener("click", (e) => { e.preventDefault(); onDownloadTap(); });
    } else if (ACTIONS[name]) {
      el.addEventListener("click", (e) => ACTIONS[name](e));
    }
  });

  $$("[data-share]").forEach((el) => el.addEventListener("click", shareFromCorrect));

  $("#termsCheck").addEventListener("change", refreshStartGate);
  $("#mobileInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitMobile(); });

  show("intro");
}

document.addEventListener("DOMContentLoaded", init);
