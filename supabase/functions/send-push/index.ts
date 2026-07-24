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
    task_submitted: ['Task submitted for approval', 'मंज़ूरी के लिए टास्क आया', 'tasks'],
    task_issue: ['Staff reported an issue', 'स्टाफ ने समस्या बताई', 'tasks'],
    issue_working: ['Admin is working on your issue', 'एडमिन आपकी समस्या पर काम कर रहा है', 'my-tasks'],
    issue_resolved: ['Your issue was resolved', 'आपकी समस्या हल हो गई', 'my-tasks'],
    task_due: ['Task due / overdue', 'टास्क की समय-सीमा', 'my-tasks'],
    fix_assigned: ['Fix request assigned to you', 'फिक्स रिक्वेस्ट सौंपी गई', 'task-board'],
    fix_new: ['New fix request raised', 'नई फिक्स रिक्वेस्ट', 'task-board'],
    fix_approval: ['Fix awaiting approval', 'फिक्स मंज़ूरी के लिए', 'task-board'],
    fix_approved: ['Your fix was approved', 'आपकी फिक्स मंज़ूर हुई', 'task-board'],
    valet_booking: ['New valet booking', 'नई वैले बुकिंग', 'valet'],
    quiz_completed: ['Quiz completed', 'क्विज़ पूरा हुआ', 'training'],
    training_assigned: ['New training assigned', 'नई ट्रेनिंग सौंपी गई', 'training'],
  }
  const entry = M[n.type as string]
  const title = entry ? (hi ? entry[1] : entry[0]) : 'Ambria Ops'
  const path = entry ? entry[2] : 'dashboard'
  const needsWho = ['task_submitted', 'task_issue', 'fix_new', 'fix_approval', 'quiz_completed'].includes(n.type as string)
  return { title, body: item + (needsWho ? who : ''), url: BASE + path, tag: `${n.type}-${n.entity_id ?? ''}` }
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
