# 🚀 Ambria Workforce App — Deployment Guide
## For Non-Developers | Step-by-Step

---

## What You'll Get
- App live at **ambria.in** (or any domain you own)
- Works on all phones as a web app — no Play Store needed
- Staff can "Add to Home Screen" on their phones and it works like a native app
- Free hosting (Vercel) — no monthly server cost
- HTTPS security included automatically

---

## OPTION A: Easiest — Deploy on Vercel (Recommended)
### Time: 15 minutes | Cost: FREE

### Step 1: Create a GitHub Account (if you don't have one)
1. Go to **https://github.com** and click **Sign Up**
2. Use your email, create a username and password
3. Verify your email

### Step 2: Upload the Code to GitHub
1. Click the **+** icon (top right) → **New repository**
2. Name it: `ambria-workforce`
3. Keep it **Private**
4. Click **Create repository**
5. On the next page, click **"uploading an existing file"** link
6. Drag and drop ALL files from the `ambria-deploy` folder:
   - `package.json`
   - `vite.config.js`
   - `index.html`
   - `.gitignore`
   - `public/` folder (with manifest.json inside)
   - `src/` folder (with main.jsx and App.jsx inside)
7. Click **Commit changes**

### Step 3: Deploy on Vercel
1. Go to **https://vercel.com** and click **Sign Up**
2. Sign up with your **GitHub account** (click "Continue with GitHub")
3. Click **"Add New Project"**
4. You'll see your `ambria-workforce` repo — click **Import**
5. Framework Preset: It will auto-detect **Vite** — leave as is
6. Click **Deploy**
7. Wait 1-2 minutes — Vercel will build and deploy your app
8. You'll get a URL like: `ambria-workforce.vercel.app` — **your app is LIVE!**

### Step 4: Connect ambria.in Domain
1. In Vercel dashboard, click your project → **Settings** → **Domains**
2. Type `ambria.in` and click **Add**
3. Vercel will show you DNS records to add. You need to add these in your domain registrar:
   - Go to where you bought ambria.in (GoDaddy / Namecheap / etc.)
   - Go to **DNS Settings** or **Domain Management**
   - Add these records:
     ```
     Type: A      | Name: @    | Value: 76.76.21.21
     Type: CNAME  | Name: www  | Value: cname.vercel-dns.com
     ```
4. Save and wait 5-30 minutes for DNS to propagate
5. Go to **ambria.in** — your app is live! 🎉

### Step 5: Install on Staff Phones
1. On each staff member's phone, open **Chrome browser**
2. Go to **ambria.in**
3. Chrome will show a banner "Add to Home Screen" — tap it
4. Or tap the **⋮** menu → **"Add to Home Screen"**
5. The app icon appears on their phone like a regular app
6. They can now open it daily, login, and start using

---

## OPTION B: Deploy on Netlify (Alternative)
### Same as Vercel but different platform

1. Go to **https://netlify.com** → Sign up with GitHub
2. Click **"Add new site"** → **Import an existing project**
3. Select your GitHub repo `ambria-workforce`
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Click **Deploy**
7. Connect domain same way as Vercel (Netlify gives you DNS instructions)

---

## FUTURE: Adding New Features After Deployment

Once deployed, to add new features:

1. Open the code on GitHub → navigate to `src/App.jsx`
2. Click the **pencil icon** (Edit) 
3. Make your changes
4. Click **Commit changes**
5. Vercel automatically detects the change and re-deploys in 1-2 minutes
6. Your live site updates automatically!

Or — come back to Claude and say "update my ambria app" with the new feature request. I'll give you the updated code to paste into GitHub.

---

## What's Next: Features to Add After Deployment

With no size limit, here's what we'll build next:

1. ✅ **Duty Roster** — shift assignment, timing customization
2. ✅ **Leave/Absent Dashboard Widget** — who's off today
3. ✅ **Joining Date & Past Members** — full HR tracking
4. ✅ **Training Completion Tracking** — percentage per person
5. ✅ **Real Database** — data persists across sessions (Supabase/Firebase)
6. ✅ **Push Notifications** — real notifications on phones
7. ✅ **WhatsApp Integration** — daily summary to your WhatsApp
8. ✅ **Offline Mode** — app works even without internet

---

## Login Credentials (for testing)

### Super Admin
| Username | Password | Role |
|----------|----------|------|
| abhishek | ambria@2026 | Super Admin — Full access |

### Admin
| Username | Password | Property |
|----------|----------|----------|
| vicky | vicky@123 | All Properties |
| sonu | sonu@123 | Pushpanjali |
| mahesh | mahesh@123 | Exotica |
| rahees | rahees@123 | Manaktala |
| sandeep | sandeep@123 | Security — All |

### Employees (sample)
| Username | Password | Property | Dept |
|----------|----------|----------|------|
| pawan | pawan@123 | Pushpanjali | Horticulture |
| poonam | poonam@123 | Pushpanjali | Housekeeping |
| santosh | santosh@123 | Restro | Security |
| bhupender | bhupender@123 | Exotica | Security |

Pattern: firstname / firstname@123

---

## Troubleshooting

**App not loading after deploy?**
- Check Vercel build logs — click on the deployment → "Build Logs"
- Most common issue: file not uploaded correctly to GitHub

**Domain not working?**
- DNS takes up to 48 hours (usually 30 min)
- Double-check DNS records in your domain registrar match exactly

**Want to update the app?**
- Edit App.jsx on GitHub → commit → auto-deploys in 2 min

---

## Need Help?
Come back to this Claude conversation anytime — all your app history, staff data, and feature decisions are saved here. Just say "update my Ambria app" and we'll continue.
