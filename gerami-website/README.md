# Dr. Amir Houshang Gerami — Personal Website

**Live:** https://YOUR-GITHUB-USERNAME.github.io/gerami-website

A bilingual (Farsi/English) personal website for Dr. Amir Houshang Gerami,
Internal Medicine Resident at Shahid Beheshti University of Medical Sciences.

---

## Pages
- `index.html` — Home
- `pages/about.html` — About Me
- `pages/services.html` — Medical Services
- `pages/appointments.html` — Book Appointments
- `pages/blog.html` — Medical Tips & Articles
- `pages/beyond.html` — Beyond the Clinic (Guitar/Music)
- `pages/contact.html` — Contact Form

## Features
- Bilingual FA/EN with one-click language toggle (RTL/LTR aware)
- Dark cinematic navy × gold design
- Floating right-side hamburger menu
- Scroll-reveal animations, cursor glow, floating particles
- Contact form via Formspree (free, email + mobile notification)
- Iranian medical booking platform links
- Fully responsive (mobile, tablet, desktop)
- Pure HTML/CSS/JS — no framework needed

---

## 🚀 Deploy to GitHub Pages (Free Hosting)

### Step 1 — Create GitHub Account
Go to https://github.com and sign up (free).

### Step 2 — Create a New Repository
1. Click the **+** icon → **New repository**
2. Name it: `gerami-website`
3. Set to **Public**
4. Click **Create repository**

### Step 3 — Upload Files
1. In your new repo, click **Add file** → **Upload files**
2. Drag and drop the entire `gerami-website` folder contents
3. Make sure to upload `index.html` at the root level
4. Click **Commit changes**

### Step 4 — Enable GitHub Pages
1. Go to **Settings** → **Pages** (in the left sidebar)
2. Under **Source**, select **Deploy from a branch**
3. Branch: **main**, Folder: **/ (root)**
4. Click **Save**
5. Wait ~2 minutes, then visit: `https://YOUR-USERNAME.github.io/gerami-website`

---

## 📧 Set Up Contact Form (Formspree)

1. Go to https://formspree.io and sign up free
2. Create a new form — enter your email address
3. Copy the **Form ID** (looks like: `xrgjakbp`)
4. Open `js/main.js`
5. Find line: `https://formspree.io/f/YOUR_FORMSPREE_ID`
6. Replace `YOUR_FORMSPREE_ID` with your actual ID
7. In Formspree dashboard → Integrations → enable **Email notifications**
8. You will get email + can set up mobile push notifications

---

## 🌐 Custom Domain (When Ready)

When you purchase a domain (e.g., `drgerami.com`):
1. In GitHub repo → Settings → Pages → Custom domain → enter your domain
2. At your domain registrar, add these DNS records:
   ```
   A     185.199.108.153
   A     185.199.109.153
   A     185.199.110.153
   A     185.199.111.153
   CNAME www → YOUR-USERNAME.github.io
   ```
3. Check **Enforce HTTPS**

---

## 📱 Add to iPhone (for notifications from Formspree)

Install the **Formspree** app or use the **PushOver** integration in Formspree
dashboard to receive instant iPhone notifications when someone submits the form.

---

## 📸 Adding Your Photo

When ready to add your professional photo:
1. Name the photo: `assets/img/dr-gerami.jpg`
2. In `pages/about.html`, replace the `.photo-placeholder` div with:
```html
<img src="../assets/img/dr-gerami.jpg" alt="Dr. Amir Houshang Gerami"
     style="width:100%;border-radius:var(--radius-lg);border:1px solid var(--navy-border);" />
```

---

## 🎬 Adding YouTube Videos (Beyond the Clinic)

When your channel is ready, in `pages/beyond.html` replace the `.youtube-placeholder` div with:
```html
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:var(--radius-md);">
  <iframe style="position:absolute;top:0;left:0;width:100%;height:100%;"
    src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
    frameborder="0" allowfullscreen></iframe>
</div>
```

---

## 📬 Updating Social Media Links

Search for `href="#"` in all HTML files and replace with your actual:
- Instagram: `https://www.instagram.com/YOUR_HANDLE`
- Telegram: `https://t.me/YOUR_HANDLE`
- YouTube: `https://www.youtube.com/@YOUR_CHANNEL`
