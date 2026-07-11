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
  minReferralsToWin: 3,    // win condition reminder
  totalSteps: 10,          // for the top-right step counter (X/১০)
  prizeBn: "১০,০০০",

  // Campaign schedule (calendar time). Edit these to the real dates.
  campaignStart: "2026-07-01T10:00:00",
  campaignEnd:   "2026-07-31T23:59:00",

  // Winners list — added one per day from the campaign's 2nd day onward.
  // Each: { date: "YYYY-MM-DD", name, district, photo (optional URL) }
  winners: [
    // { date: "2026-07-02", name: "রহিম উদ্দিন", district: "ঢাকা", photo: "" },
  ],
};

/* --------------------------- UTILITIES ---------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];

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

    /** Top-N participants for a given day (default today), ranked by
        referral installs (desc) then best time (asc). */
    leaderboard(dayKey, limit = 10) {
      const db = load();
      return Object.values(db.participants)
        .filter((p) => p.bestTimeMs != null && (!dayKey || dayKeyOf(p.bestAt) === dayKey))
        .sort((a, b) =>
          (b.referredInstalls || 0) - (a.referredInstalls || 0) ||
          (a.bestTimeMs || Infinity) - (b.bestTimeMs || Infinity))
        .slice(0, limit);
    },
  };
})();

// local calendar day key "YYYY-MM-DD" for a timestamp
function dayKeyOf(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function maskMobile(m) {
  return m && m.length === 11 ? m.slice(0, 5) + "***" + m.slice(8) : m;
}

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
    q: "টালিখাতা অ্যাপে আনলিমিটেড এন্ট্রি প্যাকেজ এর দাম কত?",
    options: ["৭৯ টাকা", "১২৯ টাকা", "১০০ টাকা"],
  },
  {
    q: "টালিপে QR-এ নিচের কোন কোন অ্যাপ থেকে পেমেন্ট নেয়া যায়?",
    multi: true,
    options: [
      { text: "নগদ", correct: true },
      { text: "বিকাশ", correct: true },
      { text: "রকেট", correct: true },
      { text: "সব ব্যাংক অ্যাপ", correct: true },
    ],
  },
  {
    q: "টালিপে QR কিভাবে পাওয়া যায়?",
    options: ["আবেদন করার পর সবচেয়ে দ্রুত পাওয়া যায়।", "অফিসে গিয়ে আবেদন করে ৭ দিন পর"],
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
  renderSchedule("rpSchedule");
  renderLeaderboard();
  renderWinners();
  show("repeat");
}

/* ============= schedule / leaderboard / winners renderers ============ */
function fmtScheduleDate(iso) {
  const d = new Date(iso);
  let h = d.getHours(); const ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${toBn(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}, ${toBn(h)}:${toBn(mm)} ${ampm}`;
}
function renderSchedule(elId) {
  const el = $("#" + elId);
  if (!el) return;
  el.innerHTML =
    `<span><b>শুরু:</b> ${fmtScheduleDate(CONFIG.campaignStart)}</span>` +
    `<span><b>শেষ:</b> ${fmtScheduleDate(CONFIG.campaignEnd)}</span>`;
}
function renderLeaderboard() {
  const box = $("#leaderboard");
  if (!box) return;
  const rows = API.leaderboard(dayKeyOf(Date.now()), 10);
  if (!rows.length) { box.innerHTML = '<div class="lb-empty">আজ এখনো কোনো অংশগ্রহণকারী নেই।</div>'; return; }
  box.innerHTML = rows.map((p, i) => `
    <div class="lb-row">
      <span class="lb-rank">${toBn(i + 1)}</span>
      <span class="lb-name">${maskMobile(p.mobile)}</span>
      <span class="lb-ref">${toBn(p.referredInstalls || 0)} রেফার</span>
      <span class="lb-time">${fmtDuration(p.bestTimeMs)}</span>
    </div>`).join("");
}
function fmtWinDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${toBn(d)} ${BN_MONTHS[m - 1]} ${toBn(y)}`;
}
function renderWinners() {
  const box = $("#winnersList");
  if (!box) return;
  if (!CONFIG.winners.length) {
    box.innerHTML = '<div class="lb-empty">ক্যাম্পেইনের দ্বিতীয় দিন থেকে বিজয়ীদের নাম প্রকাশ করা হবে।</div>';
    return;
  }
  box.innerHTML = CONFIG.winners.map((w) => `
    <div class="winner-row">
      <div class="winner-photo">${w.photo ? `<img src="${w.photo}" alt="">` : "👤"}</div>
      <div class="winner-info">
        <div class="winner-name">${w.name} <span class="winner-badge">🏆</span></div>
        <div class="winner-meta">${w.district} · ${fmtWinDate(w.date)}</div>
      </div>
    </div>`).join("");
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
  show("steps");   // show the three campaign steps before the quiz
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
  confirmBtn.hidden = false;          // every question is now select-then-submit
  confirmBtn.disabled = true;

  const wrap = $("#quizOptions");
  wrap.innerHTML = "";
  const opts = normalizeOptions(item);
  for (let i = opts.length - 1; i > 0; i--) {          // shuffle order
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const syncConfirm = () => { confirmBtn.disabled = wrap.querySelector(".quiz-opt.selected") === null; };
  opts.forEach((o) => {
    const b = document.createElement("button");
    b.className = "quiz-opt" + (isMulti ? " multi" : "");
    b.textContent = o.text;
    b.dataset.correct = o.correct ? "1" : "0";
    b.onclick = () => {
      if (isMulti) {
        b.classList.toggle("selected");
      } else {                                          // single = radio select
        wrap.querySelectorAll(".quiz-opt").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
      }
      syncConfirm();
    };
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
  const p = API.getParticipant(state.mobile);
  API.update(state.mobile, { shares: (p ? p.shares || 0 : 0) + 1 });
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
  "steps-next": startQuiz,
  "correct-next": () => show("download"),
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

  renderSchedule("introSchedule");
  show("intro");
}

document.addEventListener("DOMContentLoaded", init);
