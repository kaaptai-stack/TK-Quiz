# টালিখাতা Viral Quiz Campaign — Web Portal

Mobile-first, Bengali campaign portal for the TallyKhata WhatsApp referral quiz.
Built to match the creative in `TK Viral Campaign WhatsApp 0426.pptx`.

Intended to be served from a TallyKhata subdomain, e.g. **`quiz.tallykhata.com/july/verified`**.

## How to run / preview

It is a plain static site — **no build step**. Open `index.html` directly, or serve the
folder with any static server:

```bash
python -m http.server 8123     # then open http://localhost:8123
```

To deploy: upload `index.html`, `styles.css`, `app.js`, and `assets/` to the subdomain host.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All screens (shown/hidden via JS), Open Graph tags for the WhatsApp share card |
| `styles.css` | TallyKhata theme — red `#D81F26`, gold `#FDD517`, pink `#FDE9F1` |
| `app.js` | Screen router, quiz logic, share gate, **and a mock backend** (`API` object) |
| `assets/` | Logo, quiz background, app preview (cropped from the deck) |

## The flow (10 steps — shown as a `X/১০` counter top-right)

1. **Intro** — hero creative + a single **Terms & Conditions link** (opens a modal) and an
   **accept checkbox** that gates the *আমি আগ্রহী* button
2. **Mobile number** — `+88 01XXXXXXXXX`, validated. Returning participant → **Repeat screen**
3. **Profession** — tap to select one, then **পরবর্তী** to continue
4–8. **Quiz** — 5 questions; a **live timer** starts on Q1; questions 2 and 4 are
   multi-select (all options correct). Wrong answer → retry (timer resets)
9. **Correct** — shows the recorded time + the two win conditions (fastest-correct ✓,
   refer ≥3 installs ☐) + WhatsApp share; one share unlocks **পরবর্তী**
10. **Download** — TallyKhata app UI on top; download card (`com.progoti.tallykhata`, with a
   `referrer` trail). The **final "complete" button activates only after the download is tapped**
- **Final** — congratulations + WhatsApp reshare
- **Repeat (already participated)** — enter mobile → shows last time + best (lowest) time with
  date/time, referral-install count, registration status (*করেছেন/করেননি*, with a download link
  if not registered), a reminder of the win conditions, and **আবার অংশগ্রহণ করুন** (replays the flow,
  keeping the best time)

## Winning logic

Winner = highest number of **referred friends who installed/registered TallyKhata**
(`referredInstalls`), with **lowest quiz time** (`bestTimeMs`) as the tiebreak. The backend
records both per participant; a minimum of **3 referral installs** is required to qualify.

## ⚠️ Going live — replace the mock backend

`app.js` contains a self-contained **mock backend** (the `API` object) that fakes the
server using `localStorage`. To go live, replace each `API.*` method body with a real
`fetch()` to your server — the rest of the app is unchanged. Methods to implement:

- `getParticipant(mobile)` — detect a returning participant
- `register(mobile, profession)` — create participant + referral code
- `update(mobile, patch)` — store share count, etc.
- `recordQuizTime(mobile, ms)` — keep last time + lowest (best) time, each with date
- `confirmInstall(mobile, inviterCode)` — mark self-registered + credit the inviter's `referredInstalls`
- `stats(mobile)` — referral count, rank, last/best times, registration status

Also update `CONFIG` at the top of `app.js`:
`portalUrl` (fallback only — the share link uses the live page URL automatically),
`appStoreUrl`, `fbPage`, `minShares`, `minReferralsToWin`, `totalSteps`, `campaignId`.
The `og:image`/`og:url` in `index.html` must be absolute, public URLs (set to the GitHub
Pages address) for the WhatsApp link preview to show the TallyKhata logo.

### Demo notes (replace with real signals for production)
- **Registration status** (`selfRegistered`) is set optimistically when the user taps download +
  completes. A real backend should set it from actual TallyKhata install/registration
  attribution (via the `referrer` trail) — that is what drives the *করেছেন/করেননি* branch.
- **Share counting** increments on each share tap (client-side); a real backend should verify
  actual referral visits/installs rather than trusting the tap count.
