# Ambria Workforce — Deploy with GitHub + Supabase
## Only 2 Accounts | Step-by-Step

## STEP 1: GitHub Account (2 min)
1. Go to https://github.com → Sign Up
2. Create username, email, password → Verify email

## STEP 2: Upload Code (5 min)
1. Click + → New repository → Name: ambria-workforce → Public → Create
2. Click "uploading an existing file"
3. Extract zip → Drag ALL files into GitHub → Commit

## STEP 3: Enable GitHub Pages (2 min)
1. Settings → Pages → Source: GitHub Actions
2. Wait 2-3 min → Site live at: yourusername.github.io/ambria-workforce

## STEP 4: Supabase (10 min)
1. Go to supabase.com → Sign up with GitHub
2. New Project → ambria-workforce → Mumbai region
3. Settings → API → Copy Project URL + anon key (SAVE BOTH)
4. SQL Editor → Paste SQL from SUPABASE-GUIDE.md → Run
5. Storage → New Bucket "photos" (Public) → Add policy: Allow all

## STEP 5: Connect ambria.in (optional)
1. GitHub repo → Settings → Pages → Custom domain: ambria.in
2. In domain registrar add A records: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
3. CNAME www → yourusername.github.io
4. Enable HTTPS

## Updating: Edit App.jsx on GitHub → auto-deploys in 2 min

## Logins: abhishek/ambria@2026 (SA) | vicky/vicky@123 | sonu/sonu@123 | mahesh/mahesh@123 | rahees/rahees@123 | sandeep/sandeep@123
