/* =====================================================================
   টালিখাতা Viral Quiz Campaign — front-end portal
   ---------------------------------------------------------------------
   This file holds (1) the screen flow/router, (2) the quiz + share logic,
   and (3) a MOCK BACKEND (the `API` object) that fakes everything a real
   server would do, using localStorage. To go live, replace the bodies of
   the `API.*` methods with real `fetch()` calls — nothing else changes.
   ===================================================================== */

/* ----------------------------- CONFIG ----------------------------- */
const CONFIG = {
  campaignId: "july",
  // Fallback portal URL. The share link normally uses the LIVE page URL
  // (see portalBase()), so this only matters when opened via file://.
  portalUrl: "http://localhost:8123/",
  // TallyKhata app download link. The `referrer` carries the trail so a
  // real backend can attribute the install to the inviter.
  appStoreUrl: "https://play.google.com/store/apps/details?id=com.progoti.tallykhata",
  // Official TallyKhata Facebook page (winners are announced here).
  fbPage: "https://www.facebook.com/TallyKhataApp",
  minShares: 1,           // one WhatsApp share is enough to proceed
  prizeBn: "১০,০০০",
};

/* --------------------------- UTILITIES ---------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Bengali numerals
const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

function normalizeMobile(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("88")) d = d.slice(2);          // strip country code
  if (d.length === 10 && d[0] === "1") d = "0" + d; // 1XXXXXXXXX -> 01XXXXXXXXX
  return d;
}
const isValidMobile = (d) => /^01[3-9]\d{8}$/.test(d);

function genCode(mobile) {
  // short, stable referral code derived from the mobile number
  let h = 0;
  for (const ch of mobile) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(0, 6).toUpperCase();
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
  const KEY = "tk_campaign_db_v1";
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{"participants":{},"codes":{}}');
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));

  return {
    /** Has this mobile already completed participation? */
    getParticipant(mobile) {
      return load().participants[mobile] || null;
    },

    /** Register a participant (idempotent). Returns the participant record. */
    register(mobile, profession) {
      const db = load();
      if (!db.participants[mobile]) {
        const code = genCode(mobile);
        db.participants[mobile] = {
          mobile, profession,
          code,
          quizTimeMs: null,
          shares: 0,
          installed: false,
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
      if (db.participants[mobile]) {
        Object.assign(db.participants[mobile], patch);
        save(db);
      }
      return db.participants[mobile];
    },

    /** Mark this person as having installed TallyKhata, and credit their
        inviter with one referred install (the winning metric). */
    confirmInstall(mobile, inviterCode) {
      const db = load();
      const p = db.participants[mobile];
      if (p && !p.installed) {
        p.installed = true;
        p.completed = true;
        if (inviterCode && db.codes[inviterCode]) {
          const inviterMobile = db.codes[inviterCode];
          if (inviterMobile !== mobile) {
            db.participants[inviterMobile].referredInstalls =
              (db.participants[inviterMobile].referredInstalls || 0) + 1;
          }
        }
        save(db);
      }
      return p;
    },

    /** "Send" an OTP. Returns the code (in real life the SMS gateway does
        this server-side and never returns it to the client). */
    sendOtp(mobile) {
      const db = load();
      // deterministic 6-digit so the demo note can show it
      const otp = String(((parseInt(mobile.slice(-6)) || 123456) % 900000) + 100000);
      db._otp = { mobile, otp, at: Date.now() };
      save(db);
      return otp;
    },

    verifyOtp(mobile, otp) {
      const db = load();
      return db._otp && db._otp.mobile === mobile && db._otp.otp === String(otp);
    },

    /** Referral count + crude live rank for this mobile. */
    stats(mobile) {
      const db = load();
      const p = db.participants[mobile];
      if (!p) return null;
      const all = Object.values(db.participants)
        .map((x) => x.referredInstalls || 0)
        .sort((a, b) => b - a);
      const rank = all.indexOf(p.referredInstalls || 0) + 1;
      return { referredInstalls: p.referredInstalls || 0, rank, total: all.length };
    },
  };
})();

/* =====================================================================
   QUIZ DATA  (correct option is index 0; order is shuffled at render)
   ===================================================================== */
const QUIZ = [
  {
    q: "বাংলাদেশের কোথায় সুন্দরবন অবস্থিত?",
    options: ["খুলনা", "চট্টগ্রাম"],
    bg: "assets/q-sundarban.jpg",
  },
  {
    q: "টালিখাতা কি ধরনের অ্যাপ?",
    options: ["হিসাব রাখার", "খাবার ডেলিভারির"],
  },
  {
    q: "টালিপে QR কোডে কোন কোন অ্যাপ থেকে পেমেন্ট করা যায়?",
    multi: true,   // multiple correct answers — all of these are accepted
    options: [
      { text: "বিকাশ", correct: true },
      { text: "নগদ", correct: true },
      { text: "রকেট", correct: true },
      { text: "ব্যাংক অ্যাপ", correct: true },
    ],
  },
  {
    q: "টালিপে QR কোড কিভাবে পাওয়া যায়?",
    options: ["টালিখাতা অ্যাপ থেকে অ্যাপ্লাই করে সাথে সাথে", "অফিসে গিয়ে এক সপ্তাহ পর"],
  },
];

const PROFESSIONS = [
  "মুদি ব্যবসায়ী", "ফার্মেসি ব্যবসায়ী", "হার্ডওয়্যার ব্যবসায়ী",
  "রেস্তোরাঁ ব্যবসায়ী", "ডিলার / ডিস্ট্রিবিউটর", "জুতা ব্যবসায়ী",
  "চাকুরি", "শিক্ষার্থী", "অন্যান্য",
];

// progress % per screen (matches the creative's bottom bar)
const PROGRESS = {
  intro: 0, mobile: 5, profession: 10,
  quiz: null,            // computed from question index (20 → 60)
  wrong: 50, share: 70, download: 90, final: 100,
  already: 100, myinfo: null, otp: null, myresult: null,
};

/* =============================== STATE =============================== */
const state = {
  mobile: null,
  profession: null,
  inviterCode: new URLSearchParams(location.search).get("ref") || null,
  quizStart: 0,
  quizIndex: 0,
  shares: 0,
  myinfoMobile: null,
};

/* ============================== ROUTER ============================== */
function show(screen) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
  $("#app").scrollTop = 0;
  $$(".screen-body").forEach((b) => (b.scrollTop = 0));

  // progress bar
  let pct = PROGRESS[screen];
  if (screen === "quiz") pct = 20 + Math.round((state.quizIndex / QUIZ.length) * 40);
  const infoScreens = ["myinfo", "otp", "myresult"];
  $("#app").classList.toggle("hide-progress", infoScreens.includes(screen));
  if (pct != null) setProgress(pct);

  if (screen === "quiz") renderQuestion();
}

function setProgress(pct) {
  $("#progressBar").style.width = pct + "%";
  $("#progressPct").textContent = toBn(pct) + "%";
}

/* ============================ INTRO / START ========================= */
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
  if (existing && existing.completed) {
    // one-time participation rule
    const s = API.stats(m);
    $("#alreadyRefCount").textContent = toBn(s ? s.referredInstalls : 0);
    show("already");
    return;
  }
  API.register(m, null);   // create draft record
  show("profession");
}

/* ============================ PROFESSION ============================ */
function renderProfessions() {
  const grid = $("#professionGrid");
  grid.innerHTML = "";
  PROFESSIONS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "prof-btn";
    b.textContent = p;
    b.onclick = () => {
      state.profession = p;
      API.register(state.mobile, p);
      state.quizIndex = 0;
      state.quizStart = Date.now();
      show("quiz");
    };
    grid.appendChild(b);
  });
}

/* =============================== QUIZ =============================== */
// Normalize both question shapes to [{text, correct}]:
//  - single-answer: options are strings, correct = index 0
//  - multi-answer:  options are {text, correct}
function normalizeOptions(item) {
  if (item.multi) return item.options.map((o) => ({ text: o.text, correct: !!o.correct }));
  return item.options.map((t, i) => ({ text: t, correct: i === 0 }));
}

function renderQuestion() {
  const item = QUIZ[state.quizIndex];
  const isMulti = !!item.multi;
  $("#quizCount").textContent = `প্রশ্ন ${toBn(state.quizIndex + 1)} / ${toBn(QUIZ.length)}`;
  $("#quizQuestion").textContent = item.q;

  const bg = $("#quizBg");
  bg.style.backgroundImage = item.bg ? `url("${item.bg}")` : "none";

  $("#quizHint").hidden = !isMulti;
  const confirmBtn = $("#quizConfirmBtn");
  confirmBtn.hidden = !isMulti;
  confirmBtn.disabled = true;

  const wrap = $("#quizOptions");
  wrap.innerHTML = "";
  const opts = normalizeOptions(item);
  for (let i = opts.length - 1; i > 0; i--) {   // shuffle order
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
        const anySelected = wrap.querySelector(".quiz-opt.selected") !== null;
        confirmBtn.disabled = !anySelected;
      };
    } else {
      b.onclick = () => answer(o.correct);
    }
    wrap.appendChild(b);
  });
}

// Multi-select submit: correct only if the chosen set exactly matches the
// set of correct options (i.e. all correct ones picked, none of the wrong).
function quizConfirm() {
  const all = $$(".quiz-opt", $("#quizOptions"));
  const ok = all.every((b) =>
    (b.dataset.correct === "1") === b.classList.contains("selected"));
  answer(ok);
}

function answer(correct) {
  if (!correct) { show("wrong"); return; }
  if (state.quizIndex < QUIZ.length - 1) {
    state.quizIndex++;
    show("quiz");
  } else {
    // all correct — record the time taken (fastest-correct tiebreak metric)
    const timeMs = Date.now() - state.quizStart;
    API.update(state.mobile, { quizTimeMs: timeMs });
    state.shares = 0;
    updateShareUI();
    show("share");
  }
}

function retryQuiz() {
  state.quizIndex = 0;
  state.quizStart = Date.now();   // restart timer — fastest correct attempt counts
  show("quiz");
}

/* ============================== SHARE =============================== */
// Base URL of the live page (origin + path, no query/hash). Using the actual
// page location means the WhatsApp share link is automatically correct wherever
// this is hosted — GitHub Pages, a custom domain, or localhost. Falls back to
// CONFIG.portalUrl for unusual contexts (e.g. opened via file://).
function portalBase() {
  if (location.origin && location.origin !== "null") {
    return location.origin + location.pathname;
  }
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

function doShare(channel) {
  const text = shareMessage();
  const url = shareUrl();
  let link;
  switch (channel) {
    case "whatsapp": link = `https://wa.me/?text=${encodeURIComponent(text)}`; break;
    case "imo":      link = `https://imo.im/share?text=${encodeURIComponent(text)}`; break;
    case "messenger":link = `fb-messenger://share?link=${encodeURIComponent(url)}`; break;
    case "facebook": link = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`; break;
  }
  // Native share sheet first (best on mobile), else open the channel link
  if (navigator.share && (channel === "whatsapp" || channel === "imo")) {
    navigator.share({ text, url }).catch(() => window.open(link, "_blank"));
  } else {
    window.open(link, "_blank");
  }
  if (channel !== "facebook") registerShare();
}

function registerShare() {
  state.shares++;
  API.update(state.mobile, { shares: state.shares });
  const justUnlocked = state.shares === CONFIG.minShares;
  updateShareUI();
  if (justUnlocked) toast("দারুণ! এবার পরবর্তী ধাপে যান।");
}

// One WhatsApp share unlocks the next step (no 10-tap counting).
function updateShareUI() {
  const done = state.shares >= CONFIG.minShares;
  $("#shareNextBtn").disabled = !done;
  $("#shareHint").style.display = done ? "none" : "block";
}

/* ============================= DOWNLOAD ============================= */
function buildDownloadUrl() {
  // reference trail so installs can be attributed back to the campaign + inviter
  const p = API.getParticipant(state.mobile);
  const trail = `tk_${CONFIG.campaignId}_${p ? p.code : ""}`;
  const u = new URL(CONFIG.appStoreUrl);
  u.searchParams.set("referrer", trail);
  return u.toString();
}

/* =========================== MY INFO / OTP ========================== */
function sendOtp() {
  const m = normalizeMobile($("#myinfoMobile").value);
  const err = $("#myinfoError");
  if (!isValidMobile(m)) { err.textContent = "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।"; err.hidden = false; return; }
  if (!API.getParticipant(m)) {
    err.textContent = "এই নম্বরে কোনো অংশগ্রহণ পাওয়া যায়নি।"; err.hidden = false; return;
  }
  err.hidden = true;
  state.myinfoMobile = m;
  const otp = API.sendOtp(m);
  $("#otpMobileLabel").textContent = "+88 " + m;
  $("#otpInput").value = "";
  $("#otpError").hidden = true;
  // DEMO ONLY: real OTP is sent via SMS and never shown on screen.
  $("#otpDemoNote").textContent = `ডেমো: আপনার OTP হলো ${otp}`;
  show("otp");
  setTimeout(() => $("#otpInput").focus(), 250);
}

function verifyOtp() {
  const otp = $("#otpInput").value.trim();
  if (!API.verifyOtp(state.myinfoMobile, otp)) { $("#otpError").hidden = false; return; }
  const s = API.stats(state.myinfoMobile);
  $("#myRefCount").textContent = toBn(s.referredInstalls);
  $("#myRankLine").textContent = s.referredInstalls > 0
    ? `বর্তমানে আপনার অবস্থান: ${toBn(s.rank)} নম্বরে (মোট ${toBn(s.total)} জন অংশগ্রহণকারীর মধ্যে)।`
    : "এখনো কেউ আপনার রেফারেলে টালিখাতা ইনস্টল করেননি।";
  show("myresult");
}

/* ====================== reshare from any screen ===================== */
function reshareWhatsapp() {
  // if we don't have an active mobile (e.g. from My Info), use that one
  if (!state.mobile && state.myinfoMobile) state.mobile = state.myinfoMobile;
  doShareNoCount("whatsapp");
}
function doShareNoCount(channel) {
  const prev = state.shares;
  doShare(channel);
  state.shares = prev; // don't affect the 10-share gate when resharing later
}

/* ============================ ACTIONS ============================== */
const ACTIONS = {
  "start": startFlow,
  "submit-mobile": submitMobile,
  "quiz-confirm": quizConfirm,
  "retry-quiz": retryQuiz,
  "share-next": () => show("download"),
  "download": null, // handled as link
  "confirm-installed": () => {
    API.confirmInstall(state.mobile, state.inviterCode);
    show("final");
  },
  "share-facebook": () => doShareNoCount("facebook"),
  "reshare-whatsapp": reshareWhatsapp,
  "goto-myinfo": () => { $("#myinfoMobile").value = ""; $("#myinfoError").hidden = true; show("myinfo"); },
  "goto-home": () => show("intro"),
  "send-otp": sendOtp,
  "verify-otp": verifyOtp,
};

/* ============================== INIT =============================== */
function init() {
  renderProfessions();

  // wire data-action buttons
  $$("[data-action]").forEach((el) => {
    const name = el.dataset.action;
    if (name === "download") {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(buildDownloadUrl(), "_blank");
        toast("ডাউনলোড সম্পন্ন হলে নিচের বোতামে ট্যাপ করুন।");
      });
    } else if (ACTIONS[name]) {
      el.addEventListener("click", ACTIONS[name]);
    }
  });

  // share-channel buttons
  $$("[data-share]").forEach((el) =>
    el.addEventListener("click", () => doShare(el.dataset.share)));

  // enter key on inputs
  $("#mobileInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitMobile(); });
  $("#myinfoMobile").addEventListener("keydown", (e) => { if (e.key === "Enter") sendOtp(); });
  $("#otpInput").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyOtp(); });

  show("intro");
}

document.addEventListener("DOMContentLoaded", init);
