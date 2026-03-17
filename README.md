# 🔗 YourName — Link-in-Bio

Premium glassmorphism link-in-bio page, hosted on **GitHub Pages**, with music powered by **hifi-api** (Tidal) running on **Render**.

---

## 📁 Repository layout

```
your-links-repo/              ← this repo (GitHub Pages)
├── index.html
├── style.css
├── script.js
└── assets/
    ├── avatar.jpg            ← your profile picture
    ├── summer.jpg            ← seasonal background images
    ├── winter.jpg
    ├── spring.jpg
    └── autumn.jpg            ← optional: summer-rain.jpg etc.
```

The hifi-api backend lives in a **separate repo** — your fork of  
[`binimum/hifi-api`](https://github.com/binimum/hifi-api).

---

## 🚀 Full Setup — Step by Step

### Part 1 — Deploy hifi-api on Render

#### 1a. Fork hifi-api

1. Go to [github.com/binimum/hifi-api](https://github.com/binimum/hifi-api)
2. Click **Fork** → create a fork in your own GitHub account

#### 1b. Add CORS middleware

Your GitHub Pages site is on a different domain than Render, so  
the browser will block requests unless hifi-api sends CORS headers.

Open `main.py` in your fork and add these lines **immediately after**  
the `app = FastAPI()` line:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    # Replace with your actual GitHub Pages URL once you know it,
    # e.g. "https://yourusername.github.io"
    # Use ["*"] during testing, then lock it down.
    allow_origins=["https://yourusername.github.io"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

Commit and push this change to your fork.

#### 1c. Add deployment files to your fork

Copy `render.yaml` and `start.sh` (provided alongside this README)  
into the **root** of your hifi-api fork. Commit and push them.

```bash
cp render.yaml start.sh /path/to/your-hifi-api-fork/
cd /path/to/your-hifi-api-fork/
chmod +x start.sh
git add render.yaml start.sh
git commit -m "Add Render deployment config"
git push
```

#### 1d. Generate your Tidal token **locally**

This must be done on your own machine — Render cannot open a browser for OAuth.

```bash
# Clone your fork locally (if you haven't already)
git clone https://github.com/yourusername/hifi-api
cd hifi-api

# Install auth dependencies
cd tidal_auth
pip install -r requirements.txt

# Run the auth script — it will open a Tidal login URL
python3 tidal_auth.py
# Follow the prompts, log in with your Tidal account
# When done, token.json is written to the current directory
```

> **Keep `token.json` safe. Never commit it to any git repository.**  
> It contains your Tidal login credentials.

#### 1e. Base64-encode token.json

Render can't receive files directly — you must encode it as a string:

```bash
# macOS / Linux
base64 -i token.json | tr -d '\n'

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("token.json"))
```

Copy the entire output string to your clipboard.

#### 1f. Deploy on Render

1. Go to [render.com](https://render.com) and create a free account
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select your **hifi-api fork**
4. Render will detect `render.yaml` automatically → click **Apply**
5. Once the service is created, go to:  
   **Dashboard → your hifi-api service → Environment**
6. Click **Add Environment Variable**:
   - **Key:** `TOKEN_JSON`
   - **Value:** paste the base64 string from step 1e
7. Click **Save Changes** — Render will redeploy automatically

#### 1g. Get your Render URL

Once the deploy turns green, find your URL at the top of the service page:

```
https://hifi-api.onrender.com        ← example, yours will differ
```

Test it works:

```
https://hifi-api.onrender.com/search/?s=lofi
```

You should see a JSON response with track results.

---

### Part 2 — Configure the linktree site

#### 2a. Set your Render URL in script.js

Open `script.js` and replace line 29:

```js
// Before:
const HIFI_BASE = 'https://your-hifi-api.onrender.com';

// After (use your actual URL):
const HIFI_BASE = 'https://hifi-api-xxxx.onrender.com';
```

#### 2b. Personalise your content

In `index.html`, find and replace:

| Placeholder | Replace with |
|---|---|
| `YourName` | Your actual name/handle |
| `Creator · Builder · Developer` | Your own bio tagline |
| `YOUR_SERVER_ID` | Your Discord server ID |
| `https://discord.gg/yourserver` | Your Discord invite link |
| `https://youtube.com/@yourchannel` | Your YouTube URL |
| `https://tiktok.com/@yourmain` | Your main TikTok URL |
| `https://tiktok.com/@yourclips` | Your clips TikTok URL |
| `hello@yourdomain.com` | Your contact email |
| `dQw4w9WgXcQ` | Your featured YouTube video ID |
| `https://yourusername.github.io` | Your GitHub Pages URL (also in main.py CORS) |

#### 2c. Add your assets

Drop your files into the `assets/` folder:

```
assets/avatar.jpg          ← square profile photo, ~500×500px
assets/summer.jpg          ← landscape background, ≥1920×1080px
assets/winter.jpg
assets/spring.jpg
assets/autumn.jpg
```

Optional weather-specific variants (the player falls back to season-only  
if these don't exist — completely safe to skip):

```
assets/summer-sun.jpg
assets/summer-rain.jpg
assets/winter-snow.jpg
assets/autumn-cloudy.jpg
# etc.
```

---

### Part 3 — Publish on GitHub Pages

#### 3a. Create your repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `yourusername.github.io` **or** any name (e.g. `links`)
3. Set visibility to **Public** (required for free GitHub Pages)
4. Click **Create repository**

#### 3b. Push your files

```bash
cd /path/to/your-linktree-folder

git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/links.git
git push -u origin main
```

#### 3c. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Branch: `main` / Folder: `/ (root)`
4. Click **Save**

Your site will be live at:
```
https://yourusername.github.io/links/
```

*(If you named the repo `yourusername.github.io` exactly, it'll be at `https://yourusername.github.io/`)*

---

## ⚡ Cold-start behaviour (Render free tier)

Render's free tier **spins down** instances after 15 minutes of inactivity.  
The first music request after idle takes **30–50 seconds** to wake up.

The player handles this gracefully:
- Shows `"Loading track…"` immediately
- After 6 seconds with no response, switches to `"Waking up server…"` so users know it's not broken
- Uses a 55-second timeout before giving up and showing `"Radio Offline"`
- The **shuffle button stays enabled** in the error state so users can retry instantly

To eliminate cold starts entirely, upgrade to Render's **Starter plan** ($7/month).

---

## 🔄 Refreshing your Tidal token

Tidal tokens expire. When music stops working:

```bash
cd tidal_auth
python3 tidal_auth.py      # re-authenticate
```

Then re-encode and update the `TOKEN_JSON` env var on Render:

```bash
base64 -i token.json | tr -d '\n'
# Paste result into Render → Environment → TOKEN_JSON → Save
```

Render will redeploy automatically.

---

## ❓ Troubleshooting

| Symptom | Fix |
|---|---|
| Music bar shows "Radio Offline" immediately | Check your Render service is deployed and `TOKEN_JSON` is set |
| CORS error in browser console | Make sure your GitHub Pages URL is in the `allow_origins` list in `main.py` |
| `/search/` returns 500 | Your Tidal token has expired — regenerate it (see above) |
| Render deploy fails | Check the Render build logs; usually a missing `uvicorn` in requirements.txt |
| Cover art missing | Normal — Dicebear fallback activates automatically |
| `"Waking up server…"` for >60 s | Render is overloaded; wait or shuffle retry |

---

## 📜 Licence

MIT — do whatever you want with the linktree code.  
hifi-api is also MIT — respect Tidal's ToS (use with an active account only).
