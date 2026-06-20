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

## The flow (matches the deck slides)

1. **Intro** — prize + terms → *আমি আগ্রহী* · also links to *আমার তথ্য*
2. **Mobile number** — `+88 01XXXXXXXXX`, validated
3. **Profession** — 9 options
4. **Quiz** — 4 questions; Q3 is multiple-choice (বিকাশ/নগদ/রকেট/ব্যাংক অ্যাপ, all correct); total time recorded for the *fastest-correct* tiebreak; wrong answer → retry screen
5. **Share** — WhatsApp only; one share unlocks the next step; share link carries `?ref=<code>`
6. **Download** — TallyKhata app link (`com.progoti.tallykhata`) with a `referrer` trail for install attribution
7. **Final** — WhatsApp reshare + winner-announcement note (winners announced on the TallyKhata Facebook page)
8. **Already participated** — returning user (one-time rule) sees their referral count and is nudged to share more
9. **My Info** — mobile → OTP → "how many TallyKhata users you referred" + live rank

## Winning logic

Winner = highest number of **referred friends who installed TallyKhata**
(`referredInstalls`), with fastest-correct quiz time (`quizTimeMs`) as the tiebreak.
Both are recorded per participant by the mock backend.

## ⚠️ Going live — replace the mock backend

`app.js` contains a self-contained **mock backend** (the `API` object) that fakes the
server using `localStorage`. To go live, replace each `API.*` method body with a real
`fetch()` to your server — the rest of the app is unchanged. Methods to implement:

- `getParticipant(mobile)` — enforce one-time participation
- `register(mobile, profession)` — create participant + referral code
- `update(mobile, patch)` — store quiz time, share count
- `confirmInstall(mobile, inviterCode)` — credit the inviter's `referredInstalls`
- `sendOtp` / `verifyOtp` — **use a real SMS gateway**; never return the OTP to the client
- `stats(mobile)` — referral count + leaderboard rank

Also update `CONFIG` at the top of `app.js`:
`portalUrl` (currently `http://localhost:8123/` for testing — change to the real subdomain),
`appStoreUrl`, `fbPage`, `minShares`, `campaignId`.
The `og:image` in `index.html` must be an absolute, public URL for the WhatsApp link
preview to show the TallyKhata logo — update its origin to the real domain on deploy.

### Demo notes (remove for production)
- The OTP screen shows the code on-screen (`ডেমো: আপনার OTP হলো ...`) because there is no
  real SMS gateway yet. Real OTP must be sent via SMS and verified server-side.
- Share counting increments on each share tap (client-side); a real backend should verify
  actual referral visits/installs rather than trusting the tap count.
