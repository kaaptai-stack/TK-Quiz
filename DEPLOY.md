# Publishing the prototype on GitHub Pages

The site is a plain static site, so GitHub Pages hosts it for free. The WhatsApp
share link **auto-detects the live URL**, so once the page is online the link is
correct automatically — no code change needed for it.

> Your public URL will be: **`https://<USER>.github.io/<REPO>/`**
> (`<USER>` = your GitHub username, `<REPO>` = the repository name you choose).

---

## Step 1 — Create a GitHub account (skip if you have one)
Go to https://github.com and sign up.

## Step 2 — Create a new repository
1. Click **+** (top-right) → **New repository**.
2. **Repository name**: e.g. `tk-quiz` (this becomes part of the URL).
3. Set it to **Public** (required for free Pages).
4. **Do NOT** check "Add a README" / .gitignore / license (this folder already has them).
5. Click **Create repository**.

## Step 3 — Push this folder to GitHub
The folder is already a git repo with a commit. In a terminal in this folder, run
(replace `<USER>` and `<REPO>`):

```bash
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

If git asks you to sign in: GitHub no longer accepts your account password here.
Use one of these once, then the push works:
- **Easiest:** install **GitHub CLI** (https://cli.github.com), run `gh auth login`, then push; **or**
- Install **GitHub Desktop** (https://desktop.github.com) and "Add → push" with clicks; **or**
- Create a **Personal Access Token** (GitHub → Settings → Developer settings → Tokens)
  and paste it as the password when prompted.

## Step 4 — Turn on GitHub Pages
1. In the repo on github.com: **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. **Branch**: `main`, folder **`/ (root)`** → **Save**.
4. Wait ~1 minute, refresh. The page shows your live link:
   **`https://<USER>.github.io/<REPO>/`**

✅ Open that link on your phone — the full quiz works, and sharing to WhatsApp
posts the live link automatically. You can demo it to the public now.

## Step 5 — (Optional) Show the TallyKhata logo in the WhatsApp link preview
The link works without this; this step just makes the shared link show the logo
thumbnail. In `index.html`, find the `og:image` line and replace the placeholders
with your real values:

```html
<meta property="og:image" content="https://<USER>.github.io/<REPO>/assets/tk-logo-vertical.png" />
```

Then push the change:

```bash
git add index.html
git commit -m "Set og:image to live URL"
git push
```

(WhatsApp caches previews; if an old one shows, test the link in a fresh chat or use
https://developers.facebook.com/tools/debug/ to refresh it.)

---

### Updating the site later
Edit files → `git add .` → `git commit -m "..."` → `git push`. Pages redeploys in ~1 min.

### Notes
- This is a **prototype**: data lives in the visitor's browser (localStorage) and the
  OTP is shown on screen for demo. See `README.md` for wiring a real backend before a
  live campaign.
- The repo must stay **Public** for free Pages hosting.
