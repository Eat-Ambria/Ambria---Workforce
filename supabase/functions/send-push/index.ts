// Supabase Edge Function: send-push
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: sending a Web Push must be signed with the VAPID *private*
// key, which can never live in the frontend. So this server-side function is
// the only place that can actually deliver a push.
//
// FLOW:  notifications INSERT  ->  Database Webhook  ->  this function
//        -> look up the recipient's devices in push_subscriptions
//        -> send an encrypted Web Push to each device (banner even if app closed)
//
// DEPLOY:  supabase functions deploy send-push --no-verify-jwt
// SECRETS: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//                               VAPID_SUBJECT=mailto:software@ambria.in
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const BASE = '/Ambria---Workforce/' // must match the frontend `base` in vite.config.js

// Venue names. A copy of PROPERTIES in src/constants/org.js, because this runs
// on Deno and cannot import from the app — keep the two in step when a venue is
// added. An unknown code falls back to the code itself rather than vanishing.
const VENUES: Record<string, [string, string]> = {
  pp: ['Pushpanjali', 'पुष्पांजलि'],
  ex: ['Exotica', 'एक्सोटिका'],
  mk: ['Manaktala', 'मनकतला'],
  rs: ['Restro', 'रेस्ट्रो'],
  jp: ['Janakpuri', 'जनकपुरी'],
}
// FIRST in the body, not appended. Seven job titles in this database have
// already been notified from more than one venue — "Vendor Coordination Calls
// and coordination" has fired from all five — so five identical banners stack
// up and the venue is the only thing telling them apart. An OS banner truncates
// its tail, so the part that differs has to lead.
const venuePrefix = (code: unknown, hi: boolean) => {
  const c = typeof code === 'string' ? code : ''
  if (!c || c === 'all') return ''
  const v = VENUES[c]
  return `${v ? (hi ? v[1] : v[0]) : c} · `
}

// Map a notification row -> the title / body / deep-link shown in the OS banner,
// localized to the recipient's language (`lang` = 'hi' | 'en').
function render(n: Record<string, unknown>, lang: string) {
  const hi = lang === 'hi'
  const item = (n.task_text as string) || ''
  const who = n.by_name ? ` · ${n.by_name}` : ''
  // type -> [ english title, hindi title, deep-link path ]
  const M: Record<string, [string, string, string]> = {
    task_assigned: ['New task assigned', 'नया टास्क सौंपा गया', 'my-tasks'],
    task_sent_back: ['Task sent back — please redo', 'टास्क वापस भेजा गया — दोबारा करें', 'my-tasks'],
    task_approved: ['Your work was approved', 'आपका काम मंज़ूर हुआ', 'my-tasks'],
    task_closed_by_admin: ['Admin marked your task complete', 'एडमिन ने आपका टास्क पूरा मार्क किया', 'my-tasks'],
    fix_closed_by_admin: ['Admin marked your repair complete', 'एडमिन ने आपकी रिक्वेस्ट पूरी मार्क की', 'task-board'],
    task_done: ['Staff completed a task', 'स्टाफ ने टास्क पूरा किया', 'tasks'],
    task_submitted: ['Task submitted for approval', 'मंज़ूरी के लिए टास्क आया', 'tasks'],
    task_issue: ['Staff reported an issue', 'स्टाफ ने समस्या बताई', 'tasks'],
    issue_working: ['Admin is working on your issue', 'एडमिन आपकी समस्या पर काम कर रहा है', 'my-tasks'],
    issue_resolved: ['Your issue was resolved', 'आपकी समस्या हल हो गई', 'my-tasks'],
    task_due: ['Task due / overdue', 'टास्क की समय-सीमा', 'my-tasks'],
    fix_assigned: ['Fix request assigned to you', 'फिक्स रिक्वेस्ट सौंपी गई', 'task-board'],
    fix_new: ['New fix request raised', 'नई फिक्स रिक्वेस्ट', 'task-board'],
    fix_approval: ['Fix awaiting approval', 'फिक्स मंज़ूरी के लिए', 'task-board'],
    fix_logged: ['Work done and logged', 'काम हो गया — दर्ज किया', 'task-board'],
    fix_reminder: ['Reminder — still pending', 'याद दिलाया — अब भी बाकी', 'task-board'],
    fix_approved: ['Your fix was approved', 'आपकी फिक्स मंज़ूर हुई', 'task-board'],
    fix_update: ['New update on a repair', 'मरम्मत पर नया अपडेट', 'task-board'],
    valet_booking: ['New valet booking', 'नई वैले बुकिंग', 'valet'],
    quiz_completed: ['Quiz completed', 'क्विज़ पूरा हुआ', 'training'],
    training_assigned: ['New training assigned', 'नई ट्रेनिंग सौंपी गई', 'training'],
  }
  // daily due digest: one row for the whole day whose task_text is the count and
  // which points at no single task (see db/migrations/SUPABASE-MIGRATION-DUE-DIGEST.sql)
  if (n.type === 'task_due' && !n.entity_id) {
    // No venue on this one: a digest is a count across whatever the person has
    // on today, so naming one venue in front of it would be a claim about the
    // whole number that is not true.
    return {
      title: hi ? 'टास्क की समय-सीमा' : 'Task due / overdue',
      body: hi ? `${item} टास्क आज ड्यू हैं` : `${item} tasks due today`,
      url: BASE + 'my-tasks',
      tag: 'task_due-digest',
    }
  }

  const entry = M[n.type as string]
  const title = entry ? (hi ? entry[1] : entry[0]) : 'Ambria WorkForce'
  const path = entry ? entry[2] : 'dashboard'
  const needsWho = ['task_done', 'task_submitted', 'task_issue', 'fix_new', 'fix_approval', 'fix_logged', 'fix_reminder', 'quiz_completed', 'fix_update'].includes(n.type as string)
  // The notification's own id rides along, so the tap can open the exact task or
  // request rather than the page it lives on. The app reads ?n= on arrival, and
  // the service worker hands the same url to an already-open window.
  const url = BASE + path + (n.id ? `?n=${n.id}` : '')
  return {
    title,
    body: venuePrefix(n.property, hi) + item + (needsWho ? who : ''),
    url,
    tag: `${n.type}-${n.entity_id ?? ''}`,
  }
}

Deno.serve(async (req) => {
  try {
    // 1) the Database Webhook posts the inserted row under `record`
    const payload = await req.json()
    const n = payload.record
    console.log('send-push invoked:', JSON.stringify({ type: n?.type, for_user: n?.for_user }))
    if (!n?.for_user) { console.log('no recipient — stopping'); return new Response('no recipient', { status: 200 }) }

    // 2) auth the push with the VAPID keys (kept as function secrets)
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    console.log('vapid present?', { pub: !!pub, priv: !!priv })
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') || 'mailto:software@ambria.in',
      pub!,
      priv!,
    )

    // 3) service-role client (bypasses RLS) to read the recipient's devices
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', n.for_user)

    if (subErr) console.log('subscription query error:', subErr.message)
    console.log('subscriptions found:', subs?.length ?? 0, 'for user', n.for_user)
    if (!subs?.length) return new Response('no subscriptions', { status: 200 })

    // 4) look up the recipient's language, then send to every device
    //    (drop dead subscriptions on 404/410)
    const { data: urow } = await supabase.from('users').select('lang').eq('id', n.for_user).maybeSingle()
    const lang = urow?.lang || 'en'
    const msg = JSON.stringify(render(n, lang))
    let sent = 0
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          msg,
          // 'high' urgency = deliver EVERY notification immediately (FCM/Android
          // & Apple), instead of batching to save battery. TTL 5min so a stale
          // push expires rather than arriving much later.
          { urgency: 'high', TTL: 300 },
        )
        sent++
        console.log('sent OK to', s.endpoint.slice(0, 40))
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        console.log('send FAILED:', code, (err as { body?: string }).body || (err as Error).message)
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }))

    console.log(`done — ${sent}/${subs.length} pushed`)
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('send-push crashed:', (e as Error).message)
    return new Response(`error: ${(e as Error).message}`, { status: 500 })
  }
})
