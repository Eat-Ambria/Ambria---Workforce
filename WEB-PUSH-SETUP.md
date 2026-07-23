# Web Push setup (Phase 2)

The app code is done. Push banners (alerts when the app is **closed**) need these
one-time setup steps. In-app notifications (the 🔔 bell) already work without any
of this — push is an extra delivery channel on top.

## The pieces (already built in the repo)
- `push_subscriptions` table — `SUPABASE-MIGRATION-PUSH.sql`
- Client subscribe/unsubscribe — `src/lib/push.js`, toggle in **My Account**
- Service-worker banner handlers — `public/push-sw.js` (wired via `vite.config.js`)
- Sender — `supabase/functions/send-push/index.ts`

## Steps you must do

### 1. Generate VAPID keys (once)
```bash
npx web-push generate-vapid-keys
```
Copy the **Public Key** and **Private Key** it prints.

### 2. Frontend: add the PUBLIC key
In `.env`:
```
VITE_VAPID_PUBLIC_KEY=<public key>
```
Rebuild / redeploy the site. (Until this is set, the push toggle stays hidden.)

### 3. Database: create the subscriptions table
Run **SUPABASE-MIGRATION-PUSH.sql** in Supabase → SQL Editor.

### 4. Deploy the Edge Function
Needs the Supabase CLI (`npm i -g supabase`, then `supabase login` and
`supabase link --project-ref kwqbgymqbcfvtvelunxo`):
```bash
supabase functions deploy send-push --no-verify-jwt
supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:software@ambria.in
```
> `--no-verify-jwt` lets the webhook call it without a user token.
> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — do NOT set them.

### 5. Wire the trigger: Database Webhook
Supabase Dashboard → **Database → Webhooks → Create a new hook**:
- **Table:** `notifications`
- **Events:** `Insert`
- **Type:** Supabase Edge Function → **send-push**
- Method `POST`. Save.

Now every new notification row automatically calls the function.

## Test it
1. Open the app on a phone/laptop → **My Account → Push notifications → Enable** → allow the browser prompt.
2. Close the app/tab completely.
3. Trigger a notification (e.g. as staff, submit a task for approval).
4. The admin device should get an OS banner. Tapping it opens the right screen.

Check delivery: Supabase → **Edge Functions → send-push → Logs** (should show `ok`),
and `select * from push_subscriptions;` to confirm devices are registered.

## Platform notes
- **Android / desktop Chrome, Edge, Firefox:** works.
- **iPhone/iPad:** only when the app is **Added to Home Screen** (installed as a PWA)
  on **iOS 16.4+**. Safari-tab push is not supported by Apple.
- HTTPS only (your GitHub Pages URL qualifies; `localhost` also works for testing).
