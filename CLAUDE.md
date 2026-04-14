# CLAUDE.md — Ambria Workforce Management App

## Project Overview
Ambria (Get Your Venue Events Pvt Ltd) workforce management app for 4 luxury event venues in New Delhi. Built with React + Vite, deployed on GitHub Pages, database on Supabase.

## Brand
- Colors: Maroon (#7B1E2F) on white. Never black backgrounds.
- Font: Outfit (display) + Inter (body)
- Tone: Professional, clean, mobile-first

## Organization Structure
- **Overall Head:** Vicky Arya (founder: Harsh Vardhan)
- **Super Admin:** Abhishek (efficiency manager) — sees everything
- **Security Head:** Sandeep (all venues, Ambria payroll)

### Properties & Staff:
**Pushpanjali (pp):** 3 Acres, 14K sqft banquet, 40K sqft lawn, 125+ parking
- Site Head: Sonu Mali
- Horticulture: Pawan, Dayashankar, Sunil
- Housekeeping: Poonam (2IC), Neeru, Umesh, Dinesh, Lalita
- Security: 2 third-party day, 2 third-party night

**Exotica (ex):** 4 Acres, Aura (8.5K+27K sqft), Valencia (12K+8K sqft), 300-350 parking
- Supervisor: Mahesh
- Horticulture: Sonu2, Dhruv, Kamlesh
- Housekeeping: Sunita, Brijesh, Ragini, Rani
- Security: Bhupender (Ambria) day + 1 third-party kitchen day, 2 third-party night

**Manaktala (mk):** 3 Acres, Emerald (10K+27K sqft), Alstonia (16K sqft), 250+ parking
- Supervisor: Rahees
- Horticulture: Mukesh, Tulsi, Akash(H)
- Housekeeping: Sadna, Lovekush, Akash, Ajay
- Security: Ajay Sec (Ambria) day, 1 third-party night

**Restro (rs):** 0.75 Acre, 8K sqft glasshouse, 100+ parking
- Managed by: Vicky Arya directly
- Housekeeping: Suresh, Roma, Anita, Arjun, Vinay
- Horticulture: Ramu
- Security: Santosh (Ambria) day, third-party night

## Tech Stack
- React 18 + Vite 5
- Supabase (database + auth + storage)
- GitHub Pages (hosting via GitHub Actions)
- PWA (installable on phones)

## Departments (4)
- 🌱 Horticulture (h)
- 🧹 Housekeeping (k)
- 📋 Admin (a)
- 🛡️ Security (s)

## Features Built
1. Login with Remember Me
2. 4 property tabs
3. Daily/Weekly/Monthly SOP tasks (color-coded: blue/green/maroon)
4. Photo proof for tasks
5. Attendance with mandatory photo at check-in/out
6. Assigned tasks (SA→Admin) with approval workflow
7. Training module (videos + Kleanfix chemical guide)
8. Members management
9. Areas with SOP completion highlighting
10. Hindi/English toggle
11. Dashboard with dept progress

## Features Pending (build these next)
1. Professional dashboard with deep-dive analytics
2. Dynamic chemical calculator per property (based on sqft)
3. Duty roster with shift management
4. Leave/absent tracking + dashboard widget
5. Joining date + past members
6. Training completion % per person
7. Supabase integration (persistent data)
8. Push notifications
9. WhatsApp daily summary

## Login Credentials
- SA: abhishek / ambria@2026
- Admins: vicky/vicky@123, sonu/sonu@123, mahesh/mahesh@123, rahees/rahees@123, sandeep/sandeep@123
- Staff pattern: firstname / firstname@123

## Key Rules
- Mobile-first design (staff use phones)
- Hindi/English bilingual always
- Photo proof mandatory for task completion
- Each admin sees only their own pending task count
- SA sees consolidated count
- Completed assigned tasks sort to bottom, never removed
- Task category visual: blue border=daily, green=weekly, maroon=monthly

## Database (Supabase)
10 tables: users, tasks, photos, attendance, assigned_tasks, assigned_task_replies, notifications, duty_roster, leaves, training_progress
See SUPABASE-GUIDE.md for full SQL schema.

## Deploy
Push to main branch → GitHub Actions auto-builds → GitHub Pages serves the app.
