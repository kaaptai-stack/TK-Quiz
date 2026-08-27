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
  appStoreUrl: "https://www.tallykhata.com/app",
  fbPage: "https://www.facebook.com/TallyKhataApp",
  minReferralsToWin: 3,    // win condition reminder
  totalSteps: 8,           // progress-bar denominator
  prizeBn: "১০,০০০",

  // Campaign schedule (calendar time). Edit these to the real dates.
  campaignStart: "2026-07-01T10:00:00",
  campaignEnd:   "2026-07-31T23:59:00",

  // Winners list — added one per day from the campaign's 2nd day onward.
  // Each: { date: "YYYY-MM-DD", name, district, registrations, time }
  winners: [
    // { date: "2026-07-02", name: "রহিম উদ্দিন", district: "ঢাকা", registrations: 12, time: "১:০৫" },
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
          plays: 0,
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

    /** Ranked participant list for a scope:
        'daily'  -> completed today, ranked by shortest answer time (daily winner rule)
        'weekly' -> current Sat–Fri week, ranked by registrations (weekly winner rule)
        'mega'   -> whole campaign, ranked by registrations (mega winner rule)
        Returns the FULL ranked list (caller slices to top 10 + self row). */
    ranked(scope) {
      const db = load();
      let list = Object.values(db.participants).filter((p) => p.bestTimeMs != null);
      if (scope === "daily") {
        const dk = dayKeyOf(Date.now());
        list = list.filter((p) => dayKeyOf(p.bestAt) === dk).sort((a, b) => a.bestTimeMs - b.bestTimeMs);
      } else if (scope === "weekly") {
        const start = weekStart(Date.now());
        list = list.filter((p) => p.bestAt >= start).sort(byScoreThenTime);
      } else {
        list = list.sort(byScoreThenTime);
      }
      return list;
    },
  };
})();

function byScoreThenTime(a, b) {
  return scoreOf(b) - scoreOf(a) || (a.bestTimeMs || Infinity) - (b.bestTimeMs || Infinity);
}
// Start (ms) of the current campaign week — weeks run Saturday→Friday.
function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 1) % 7;   // days since last Saturday (Sat=6 -> 0)
  d.setDate(d.getDate() - back);
  return d.getTime();
}

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
// Score = 100 points per TallyKhata registration (weekly & mega winner ranking).
function scoreOf(p) {
  return (p.referredInstalls || 0) * 100;
}

/* =====================================================================
   QUIZ DATA
   - single-answer: options are strings, correct = index 0
   - multi-answer (multi:true): options are {text, correct}, all must match
   ===================================================================== */
const QUIZ = [
  {
    q: "টালিখাতা অ্যাপে বাকির হিসাব রাখলে কি কি সুবিধা পাওয়া যায়?",
    multi: true,
    options: [
      { text: "এন্ট্রি করলেই মেসেজ যায়", correct: true },
      { text: "কাস্টমারের সাথে ভুল বোঝাবুঝি দূর হয়", correct: true },
      { text: "কার কাছে কত বাকি সব জানা যায়", correct: true },
      { text: "লুডু গেমস খেলা যায়", correct: false },
    ],
  },
  {
    q: "টালিপে বাংলা QR-এ নিচের কোন কোন অ্যাপ থেকে পেমেন্ট নেয়া যায়?",
    multi: true,
    options: [
      { text: "নগদ", correct: true },
      { text: "বিকাশ", correct: true },
      { text: "রকেট", correct: true },
      { text: "সব ব্যাংক অ্যাপ", correct: true },
      { text: "ক্যামেরা অ্যাপ", correct: false },
    ],
  },
  {
    q: "টালিপে বাংলা QR এ কি কি সুবিধাগুলো আছে?",
    multi: true,
    options: [
      { text: "টালিখাতা অ্যাপ থেকে আবেদন করে সবচেয়ে দ্রুত পাওয়া যায়।", correct: true },
      { text: "সব ব্যাংক একাউন্ট, বিকাশ, নগদ, রকেটে ইনস্ট্যান্ট ট্রান্সফার করা যায়।", correct: true },
      { text: "পেমেন্ট পেলে সাউন্ড নোটিফিকেশন পাওয়া যায়।", correct: true },
      { text: "এখানের একটিও সঠিক নয়।", correct: false },
    ],
  },
];

const PROFESSIONS = [
  { name: "ব্যবসা", icon: "🏪" },
  { name: "চাকরি", icon: "💼" },
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

/* ===================== PROGRESS BAR MAPPING ========================= */
function stepOf(screen) {
  switch (screen) {
    case "intro": return 1;
    case "quiz": return 2 + state.quizIndex;     // q1..q5 -> 2..6
    case "share": return 7;
    case "register": return 8;
    case "final": return 8;
    default: return null;                         // steps / list / performance
  }
}

/* ============================== ROUTER ============================== */
function show(screen) {
  if (screen !== "quiz") stopTimer();
  $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
  $("#app").scrollTop = 0;
  $$(".screen-body").forEach((b) => (b.scrollTop = 0));

  // progress bar (step counter removed)
  const step = stepOf(screen);
  if (step) {
    $("#progressBar").style.width = ((step - 1) / (CONFIG.totalSteps - 1)) * 100 + "%";
    $("#progressWrap").style.visibility = "visible";
  } else {
    $("#progressWrap").style.visibility = "hidden";
  }

  if (screen === "quiz") renderQuestion();
}

/* ======================= INTRO (mobile + profession + terms) ======= */
function updateIntroGate() {
  const okMobile = isValidMobile(normalizeMobile($("#mobileInput").value));
  const okProf = !!state.profession;
  const okTerms = $("#termsCheck").checked;
  $("#startBtn").disabled = !(okMobile && okProf && okTerms);
}

function startFlow() {
  const m = normalizeMobile($("#mobileInput").value);
  if (!isValidMobile(m) || !state.profession || !$("#termsCheck").checked) return;
  state.mobile = m;
  const existing = API.getParticipant(m);
  API.register(m, state.profession);
  if (existing && existing.completed) {
    // repeat participant -> straight to the WhatsApp sharing step
    $("#correctTime").textContent = fmtDuration(existing.bestTimeMs);
    $("#shareNextBtn").disabled = true;
    show("share");
  } else {
    show("steps");
  }
}

/* ================== leaderboard / winners (tables) ================== */
// Daily board ranks by time (no registration column); weekly & mega rank by
// registration score (no time column).
function lbCells(p, rank, daily) {
  return daily
    ? [toBn(rank), maskMobile(p.mobile), fmtDuration(p.bestTimeMs)]
    : [toBn(rank), maskMobile(p.mobile), toBn(p.referredInstalls || 0), toBn(scoreOf(p))];
}
function renderLeaderboard(scope, elId, emptyMsg) {
  const box = $("#" + elId);
  if (!box) return;
  const daily = scope === "daily";
  const cols = daily ? ["ক্রম", "মোবাইল নম্বর", "সময়"] : ["ক্রম", "মোবাইল নম্বর", "রেজিস্ট্রেশন", "স্কোর"];
  const all = API.ranked(scope);
  const head = `<table class="data-table"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  const row = (p, rank, me) =>
    `<tr class="${me ? "lb-me" : ""}">${lbCells(p, rank, daily).map((c) => `<td>${c}</td>`).join("")}</tr>`;
  if (!all.length) { box.innerHTML = head + `<tr><td colspan="${cols.length}" class="tbl-empty">${emptyMsg}</td></tr></tbody></table>`; return; }
  let body = all.slice(0, 10).map((p, i) => row(p, i + 1, p.mobile === state.mobile)).join("");
  if (state.mobile) {   // current participant's own rank as an 11th row if outside top 10
    const idx = all.findIndex((p) => p.mobile === state.mobile);
    if (idx >= 10) body += `<tr class="lb-sep"><td colspan="${cols.length}">⋯</td></tr>` + row(all[idx], idx + 1, true);
  }
  box.innerHTML = head + body + `</tbody></table>`;
}
function renderAllLeaderboards() {
  renderLeaderboard("daily", "lbDaily", "আজ এখনো কোনো অংশগ্রহণকারী নেই।");
  renderLeaderboard("weekly", "lbWeekly", "এই সপ্তাহে এখনো কোনো অংশগ্রহণকারী নেই।");
  renderLeaderboard("mega", "lbMega", "এখনো কোনো অংশগ্রহণকারী নেই।");
  renderWinners();
}
function switchListTab(tab) {
  $$(".lb-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".lb-panel").forEach((p) => (p.hidden = p.dataset.panel !== tab));
}
function fmtWinDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${toBn(d)} ${BN_MONTHS[m - 1]} ${toBn(y)}`;
}
function renderWinners() {
  const box = $("#winnersList");
  if (!box) return;
  const head = `<table class="data-table"><thead><tr>
      <th>তারিখ</th><th>নাম</th><th>জেলা</th><th>টালিখাতা রেজিস্ট্রেশন</th><th>উত্তর দেয়ার সময়</th>
    </tr></thead><tbody>`;
  const body = CONFIG.winners.length
    ? CONFIG.winners.map((w) =>
        `<tr><td>${fmtWinDate(w.date)}</td><td>${w.name}</td><td>${w.district}</td><td>${toBn(w.registrations || 0)}</td><td>${w.time || "—"}</td></tr>`).join("")
    : `<tr><td colspan="5" class="tbl-empty">ক্যাম্পেইনের দ্বিতীয় দিন থেকে বিজয়ীদের নাম প্রকাশ করা হবে।</td></tr>`;
  box.innerHTML = head + body + `</tbody></table>`;
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
  updateIntroGate();
}

/* =============================== QUIZ =============================== */
function startQuiz() {
  state.quizIndex = 0;
  state.quizStart = Date.now();   // ▶ clock starts on the first question
  show("quiz");
  startTimer();
}

const MAX_QUIZ_MS = 5 * 60 * 1000;   // max answering time: 5 minutes, else restart
function startTimer() {
  stopTimer();
  const tick = () => {
    const elapsed = Date.now() - state.quizStart;
    if (elapsed >= MAX_QUIZ_MS) {
      stopTimer();
      toast("৫ মিনিট পার হয়ে গেছে — কুইজ আবার শুরু হচ্ছে।");
      retryQuiz();
      return;
    }
    $("#quizTimer").textContent = "⏱ " + fmtDuration(elapsed);
  };
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

function openWrongPopup() { $("#wrongModal").hidden = false; }
function closeWrongPopup() { $("#wrongModal").hidden = true; }  // same question, clock keeps running

function answer(correct) {
  if (!correct) { openWrongPopup(); return; }   // popup only — timer never stops/resets
  if (state.quizIndex < QUIZ.length - 1) {
    state.quizIndex++;
    show("quiz");
  } else {
    // finished the last question — stop the clock and record the time
    stopTimer();
    state.lastQuizMs = Date.now() - state.quizStart;
    API.recordQuizTime(state.mobile, state.lastQuizMs);
    $("#correctTime").textContent = fmtDuration(state.lastQuizMs);
    // flow: quiz -> WhatsApp share -> TallyKhata registration -> final
    $("#shareNextBtn").disabled = true;     // re-locked until a WhatsApp share
    show("share");
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
  return `সহজ তিনটি প্রশ্নের উত্তর দিন আর রেফার করুন টালিখাতা অ্যাপ পরিচিতজনকে।\n` +
         `আর জিতে নিন সর্বোচ্চ ১০,০০০ টাকা ক্যাশ পুরস্কার!* এ সুযোগ সীমিত সময়ের জন্য। জলদি করুন।\n` +
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
  // unlock the "পরবর্তী" button once the participant has shared on WhatsApp
  const next = $("#shareNextBtn");
  if (next) next.disabled = false;
}

/* ===================== REGISTRATION (last step) ==================== */
function buildDownloadUrl() {
  const p = API.getParticipant(state.mobile);
  const trail = `tk_${CONFIG.campaignId}_${p ? p.code : ""}`;
  const u = new URL(CONFIG.appStoreUrl);
  u.searchParams.set("referrer", trail);
  return u.toString();
}
function goToRegister() {
  $("#finalBtn").disabled = true;
  $("#regChoice").hidden = false;
  $("#regDownloadWrap").hidden = true;
  const s3 = $("#regStep3");
  s3.classList.remove("done"); s3.classList.add("active");
  $("#regStep3 .tl-node").textContent = "";
  show("register");
}
function markRegStep3Done() {
  const s3 = $("#regStep3");
  s3.classList.remove("active"); s3.classList.add("done");
  $("#regStep3 .tl-node").textContent = "✓";
  $("#finalBtn").disabled = false;
}
function haveApp() {           // user already has TallyKhata registered
  $("#regChoice").hidden = true;
  $("#regDownloadWrap").hidden = true;
  state.downloaded = true;
  markRegStep3Done();
}
function noApp() {             // reveal the download box; button stays locked until tapped
  $("#regChoice").hidden = true;
  $("#regDownloadWrap").hidden = false;
}
function onDownloadTap() {
  window.open(buildDownloadUrl(), "_blank");
  state.downloaded = true;
  markRegStep3Done();          // tick step 3 + unlock "জমা দিন"
}
function finish() {
  const p = API.confirmInstall(state.mobile, state.inviterCode);
  API.update(state.mobile, { plays: ((p && p.plays) || 0) + 1 });
  show("final");
}

function reshareWhatsapp() { doShare(); }

/* ============================= ACTIONS ============================= */
const ACTIONS = {
  "open-terms": (e) => { e && e.preventDefault(); $("#termsModal").hidden = false; },
  "close-terms": () => { $("#termsModal").hidden = true; },
  "close-wrong": closeWrongPopup,
  "start": startFlow,
  "quiz-confirm": quizConfirm,
  "steps-next": startQuiz,
  "share-next": goToRegister,
  "have-app": haveApp,
  "no-app": noApp,
  "finish": finish,
  "reshare-whatsapp": reshareWhatsapp,
  "goto-home": () => show("intro"),
  "goto-list": () => { renderAllLeaderboards(); switchListTab("daily"); show("list"); },
  "list-back": () => show("intro"),
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
  $$(".lb-tab").forEach((el) => el.addEventListener("click", () => switchListTab(el.dataset.tab)));

  $("#termsCheck").addEventListener("change", updateIntroGate);
  $("#mobileInput").addEventListener("input", updateIntroGate);

  show("intro");
}

document.addEventListener("DOMContentLoaded", init);
