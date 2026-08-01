import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useColors } from '../../../context/ThemeContext'
import { useLang, useT } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { isAdminRole, propName } from '../../../constants/org'
import { colors } from '../../../constants/colors'
import { Card, Button, Field, inputStyle } from '../../../components/common/UI'
import Modal from '../../../components/common/Modal'
import Icon from '../../../components/common/Icon'
import { useConfirm } from '../../../components/common/ConfirmDialog'

// Per-property specs used by the sqft-based calculator.
const PROP_SPECS = {
  pp: { banquet: 14000, lawn: 40000, washrooms: 7, glass: 0, label: 'Pushpanjali' },
  ex: { banquet: 20500, lawn: 35000, washrooms: 10, glass: 20500, label: 'Exotica' },
  mk: { banquet: 26000, lawn: 27000, washrooms: 8, glass: 10000, label: 'Manaktala' },
  rs: { banquet: 8000, lawn: 5000, washrooms: 4, glass: 8000, label: 'Restro' },
  // TODO: real dimensions for Janakpuri — these are placeholders, so the
  // chemical quantities it calculates are indicative only
  jp: { banquet: 10000, lawn: 10000, washrooms: 5, glass: 0, label: 'Janakpuri' },
}

// Units in words, so "L/month" reads "लीटर/माह" rather than staying English.
const UNIT_HI = { L: 'लीटर', kg: 'किलो', cans: 'कैन' }
export const unitLabel = (unit, hi) => (hi ? (UNIT_HI[unit] || unit) : unit)
const perMonth = (hi) => (hi ? 'माह' : 'month')


// ---------------------------------------------------------------------------
// Data-driven version of calcQty. One row of chemical_formulas describes any
// product:  qty = (base × share + offset) × rate × freq × days ÷ divisor
// The formula LINE under each card is generated from the same numbers, so it
// can never drift out of step with the figure above it — which is exactly what
// would happen if the text stayed hard-coded and an admin edited a rate.
// ---------------------------------------------------------------------------
const BASE_VALUE = {
  floor: (sp) => sp.banquet + (sp.glass > 0 ? sp.glass : 0),
  banquet: (sp) => sp.banquet,
  lawn: (sp) => sp.lawn,
  washrooms: (sp) => sp.washrooms,
  glass: (sp) => sp.glass,
  fixed: () => 1,
}
const BASE_LABEL = { floor: 'sqft', banquet: 'sqft', lawn: 'sqft', glass: 'sqft', washrooms: '', fixed: '' }

function rowQty(f, spec) {
  const n = (v, d = 0) => (v == null || v === '' ? d : Number(v))
  let base = (BASE_VALUE[f.base] || BASE_VALUE.banquet)(spec)
  // a venue with no glass still needs glass cleaner for its mirrors
  if (f.base === 'glass' && !base && n(f.glass_fallback_pct) > 0) base = spec.banquet * n(f.glass_fallback_pct)
  if (f.base === 'fixed') return { qty: n(f.rate).toFixed(n(f.decimals)), baseValue: null }
  const raw = (base * n(f.share, 1) + n(f.offset_val)) * n(f.rate, 1) * n(f.freq, 1) * n(f.days, 1) / (n(f.divisor, 1) || 1)
  const val = f.round_up ? Math.ceil(raw) : raw
  return { qty: Number(val).toFixed(n(f.decimals)), baseValue: base }
}

// "14,000 sqft × 0.002 × 2 × 30 ÷ 1000" — only the parts that actually apply
function rowFormula(f, spec, hi) {
  const n = (v, d = 0) => (v == null || v === '' ? d : Number(v))
  if (f.base === 'fixed') return hi ? `${n(f.rate)} प्रति प्रॉपर्टी प्रति माह` : `${n(f.rate)} per property per month`
  const { baseValue } = rowQty(f, spec)
  const parts = [`${Math.round(baseValue).toLocaleString()}${BASE_LABEL[f.base] ? ' ' + BASE_LABEL[f.base] : ''}`]
  if (n(f.share, 1) !== 1) parts.push(`× ${n(f.share, 1)}`)
  if (n(f.offset_val)) parts.push(`+ ${n(f.offset_val)}`)
  if (n(f.rate, 1) !== 1) parts.push(`× ${n(f.rate, 1)}`)
  if (n(f.freq, 1) !== 1) parts.push(`× ${n(f.freq, 1)}`)
  if (n(f.days, 1) !== 1) parts.push(`× ${n(f.days, 1)} ${hi ? 'दिन' : 'days'}`)
  if (n(f.divisor, 1) !== 1) parts.push(`÷ ${n(f.divisor, 1)}`)
  return parts.join(' ')
}

// Monthly quantity formulas derived from property dimensions.
// Built-in fallback for when chemical_formulas has not been seeded yet.
function calcQty(spec, hi = false) {
  const { banquet, lawn, washrooms, glass } = spec
  const totalFloor = banquet + (glass > 0 ? glass : 0)
  return [
    {
      code: 'K2', name: 'Hard Surface Floor Cleaner', nameHi: 'हार्ड सरफ़ेस फ़र्श क्लीनर',
      area: 'Banquet / Tiles / Corridors', areaHi: 'बैंक्वेट / टाइल / गलियारे',
      qty: ((totalFloor * 0.002 * 2 * 30) / 1000).toFixed(1), unit: 'L',
      formula: hi ? `${totalFloor.toLocaleString()} sqft × 0.002 लीटर × 2 बार × 30 दिन`
        : `${totalFloor.toLocaleString()} sqft × 0.002L × 2 washes × 30 days`,
      note: 'Dilution: 20ml/1L water', noteHi: 'घोल: 20ml प्रति 1 लीटर पानी', color: colors.blue,
    },
    {
      code: 'K1', name: 'Bathroom Sanitizer', nameHi: 'बाथरूम सैनिटाइज़र',
      area: 'Washrooms / Tiles / Tubs', areaHi: 'वॉशरूम / टाइल / टब',
      qty: (washrooms * 0.5 * 30).toFixed(0), unit: 'L',
      formula: hi ? `${washrooms} वॉशरूम × 0.5 लीटर/दिन × 30 दिन`
        : `${washrooms} washrooms × 0.5L/day × 30 days`,
      note: 'Dilution: 20–50ml/1L water', noteHi: 'घोल: 20–50ml प्रति 1 लीटर पानी', color: colors.red,
    },
    {
      code: 'K6', name: 'Toilet Bowl Cleaner', nameHi: 'टॉयलेट बाउल क्लीनर',
      area: 'Toilet Bowls / Urinals', areaHi: 'टॉयलेट बाउल / यूरिनल',
      qty: (washrooms * 0.3 * 30).toFixed(0), unit: 'L',
      formula: hi ? `${washrooms} टॉयलेट × 0.3 लीटर/दिन × 30 दिन`
        : `${washrooms} toilets × 0.3L/day × 30 days`,
      note: 'Ready-to-use — pour directly', noteHi: 'सीधा उपयोग — सीधे डालें', color: colors.red,
    },
    {
      code: 'K5', name: 'Air Freshener', nameHi: 'एयर फ़्रेशनर',
      area: 'All Washrooms + Banquet', areaHi: 'सभी वॉशरूम + बैंक्वेट',
      qty: Math.ceil(((washrooms + 2) * 30) / 5), unit: 'cans',
      formula: hi ? `${washrooms + 2} जगह × 30 दिन ÷ 5 दिन/कैन`
        : `${washrooms + 2} areas × 30 days ÷ 5 days/can`,
      note: 'Spray every 2–3 hours in peak hours', noteHi: 'व्यस्त समय में हर 2–3 घंटे स्प्रे करें', color: colors.accent,
    },
    {
      code: 'K3', name: 'Glass Cleaner', nameHi: 'ग्लास क्लीनर',
      area: 'Glass / Mirrors / Partitions', areaHi: 'कांच / शीशे / पार्टीशन',
      qty: (((glass || banquet * 0.2) * 0.003 * 4) / 1000).toFixed(1), unit: 'L',
      formula: hi ? `${Math.round(glass || banquet * 0.2).toLocaleString()} sqft × 0.003 लीटर × 4 बार/माह`
        : `${Math.round(glass || banquet * 0.2).toLocaleString()} sqft × 0.003L × 4 times/month`,
      note: 'Dilution: 20–50ml/1L water', noteHi: 'घोल: 20–50ml प्रति 1 लीटर पानी', color: colors.tl,
    },
    {
      code: 'K4', name: 'Wood Maintainer', nameHi: 'वुड मेंटेनर',
      area: 'Furniture / Wooden Floors', areaHi: 'फ़र्नीचर / लकड़ी के फ़र्श',
      qty: Math.ceil(banquet / 5000), unit: 'L',
      formula: hi ? `${Math.round(banquet / 5000)} लीटर प्रति ${banquet.toLocaleString()} sqft महीना`
        : `${Math.round(banquet / 5000)} L per ${banquet.toLocaleString()} sqft monthly`,
      note: 'Ready-to-use on wooden surfaces', noteHi: 'लकड़ी की सतह पर सीधा उपयोग', color: colors.accent,
    },
    {
      code: 'K7', name: 'Stainless Steel Polish', nameHi: 'स्टेनलेस स्टील पॉलिश',
      area: 'Railings / Fixtures / Grills', areaHi: 'रेलिंग / फ़िक्सचर / ग्रिल',
      qty: 2, unit: 'L', formula: hi ? '~2 लीटर प्रति प्रॉपर्टी प्रति माह (मानक)' : '~2L per property per month (standard)',
      note: 'Ready-to-use on SS surfaces', noteHi: 'स्टील की सतह पर सीधा उपयोग', color: colors.tl,
    },
    {
      code: 'K101', name: 'Carpet Shampoo', nameHi: 'कारपेट शैम्पू',
      area: 'Carpets / Sofas / Upholstery', areaHi: 'कालीन / सोफ़ा / अपहोल्स्ट्री',
      qty: Math.ceil(((banquet * 0.3 * 0.08) / 1000) * 4), unit: 'L',
      formula: hi ? '30% कालीन क्षेत्र × 80ml/sqft × 4/माह ÷ 1000' : '30% carpet area × 80ml/sqft × 4/month ÷ 1000',
      note: 'Dilution: 50–100ml/1L water', noteHi: 'घोल: 50–100ml प्रति 1 लीटर पानी', color: colors.green,
    },
    {
      code: 'NPK 19:19:19', name: 'NPK Fertilizer', nameHi: 'एनपीके खाद',
      area: 'All Lawn & Garden Areas', areaHi: 'सभी लॉन और बग़ीचे',
      qty: ((lawn / 1000) * 2).toFixed(0), unit: 'kg',
      formula: hi ? `${lawn.toLocaleString()} sqft लॉन ÷ 1000 × 2 किलो/माह`
        : `${lawn.toLocaleString()} sqft lawn ÷ 1000 × 2kg/month`,
      note: 'Monthly balanced feed — dilute 2g/L', noteHi: 'मासिक संतुलित खुराक — 2g प्रति लीटर', color: colors.green,
    },
    {
      code: 'Neem Oil', name: 'Neem Oil (Pest Control)', nameHi: 'नीम तेल (कीट नियंत्रण)',
      area: 'Lawn / Plants / Trees', areaHi: 'लॉन / पौधे / पेड़',
      qty: ((lawn / 10000) * 0.5).toFixed(1), unit: 'L',
      formula: hi ? `${(lawn / 10000).toFixed(1)} × 0.5 लीटर प्रति 10K sqft`
        : `${(lawn / 10000).toFixed(1)} × 0.5L per 10K sqft`,
      note: 'Mix 5ml/1L water — spray monthly', noteHi: '5ml प्रति 1 लीटर पानी — महीने में एक बार स्प्रे', color: colors.green,
    },
  ]
}

const AREA_COLORS = [
  '#3B6FC0', '#C0392B', '#0891B2', '#D97706', '#2E8B57',
  '#F59E0B', '#7C3AED', '#EC4899', '#16A34A', '#6B7280',
]

// Product reference guide (Kleanfix + hotel-industry brands), grouped by area.
const CHEM_DATA = [
  { area: 'Floor Care', areaHi: 'फ़र्श देखभाल', items: [
    { p: 'K2 Hard Surface Cleaner (Kleanfix)', u: 'Daily mopping — 20ml per 1L water', uHi: 'रोज़ पोछा — 20ml प्रति 1L पानी' },
    { p: 'K20 Floor Striper (Kleanfix)', u: 'Deep clean — 10-20ml in warm water', uHi: 'गहरी सफ़ाई — 10-20ml गर्म पानी' },
    { p: 'K102 All-in-One (Kleanfix)', u: 'Floors, walls, panels, sinks', uHi: 'फ़र्श, दीवारें, पैनल, सिंक' },
    { p: 'K14 Shiner (Kleanfix)', u: 'Marble floor polish — ready to use', uHi: 'मार्बल पॉलिश — सीधा उपयोग' },
    { p: 'K15 Miracle (Kleanfix)', u: 'Stone floor restoration', uHi: 'पत्थर फ़र्श रिस्टोर' },
    { p: 'Taski R2 (Diversey)', u: 'Daily floor cleaner — 20ml/5L', uHi: 'रोज़ फ़र्श — 20ml/5L' },
    { p: 'Taski R3 (Diversey)', u: 'Glass & surface cleaner', uHi: 'कांच और सतह' },
    { p: 'Taski R4 (Diversey)', u: 'Furniture polish', uHi: 'फ़र्नीचर पॉलिश' },
    { p: 'Taski R6 (Diversey)', u: 'Toilet bowl cleaner', uHi: 'टॉयलेट क्लीनर' },
    { p: 'Floor Sealer / Polish', u: 'Monthly — protects marble & granite', uHi: 'मासिक — मार्बल ग्रेनाइट सुरक्षा' },
    { p: 'Acid-based Tile Cleaner (HCl 10%)', u: 'Weekly deep — tiles & grout', uHi: 'हफ़्ते गहरी — टाइल ग्राउट' },
    { p: 'Oxalic Acid', u: 'Rust stain removal from floors', uHi: 'फ़र्श से जंग दाग हटाना' },
  ] },
  { area: 'Washroom & Toilet', areaHi: 'शौचालय', items: [
    { p: 'K1 Bathroom Sanitizer (Kleanfix)', u: '20-50ml/1L — tub, tiles, sink, fittings', uHi: '20-50ml/1L — टब, टाइल, सिंक' },
    { p: 'K6 Toilet Bowl Cleaner (Kleanfix)', u: 'Ready to use — toilet, urinal, pot', uHi: 'सीधा उपयोग — टॉयलेट, यूरिनल' },
    { p: 'K5 Air Freshener (Kleanfix)', u: 'Ready to use — spray all areas', uHi: 'सीधा उपयोग — हर जगह स्प्रे' },
    { p: 'Harpic / Domex', u: 'Toilet bowl — daily use', uHi: 'टॉयलेट बाउल — रोज़' },
    { p: 'Sodium Hypochlorite 4%', u: 'Surface sanitizer — 50ml/1L', uHi: 'सतह सैनिटाइज़ — 50ml/1L' },
    { p: 'Draino Drain Cleaner (Kleanfix)', u: 'Blocked drains, sinks, pipes', uHi: 'बंद नाली, सिंक, पाइप' },
    { p: 'Klean Odour (Kleanfix)', u: 'Removes urine/vomit/food odour — 1L/10L', uHi: 'बदबू हटाना — 1L/10L पानी' },
    { p: 'Urinal Cubes / Naphthalene Balls', u: 'Urinals & drains — replace weekly', uHi: 'यूरिनल — हफ़्ते बदलें' },
    { p: 'Phenyl (White/Black)', u: 'Floor disinfect — 50ml/1L', uHi: 'फ़र्श कीटाणुनाशक — 50ml/1L' },
  ] },
  { area: 'Glass, Mirror & Metal', areaHi: 'कांच, शीशा, धातु', items: [
    { p: 'K3 Glass Cleaner (Kleanfix)', u: '20-50ml/1L — glass, mirror, appliances', uHi: '20-50ml/1L — कांच, शीशा' },
    { p: 'K7 S.S. Polish (Kleanfix)', u: 'Ready — steel, grills, railings, stairs', uHi: 'सीधा — स्टील, ग्रिल, रेलिंग' },
    { p: 'K8 Spark Oil Surface Cleaner (Kleanfix)', u: '20-50ml/1L — greasy surfaces', uHi: '20-50ml/1L — तेल वाली सतह' },
    { p: 'K9 Scale Remover (Kleanfix)', u: '100ml/1L — kitchen, bathroom scale', uHi: '100ml/1L — किचन, बाथरूम स्केल' },
    { p: 'Colin / Windex', u: 'Glass & mirror spray — ready', uHi: 'कांच शीशा स्प्रे' },
    { p: 'Brasso', u: 'Brass & copper polish', uHi: 'पीतल तांबा पॉलिश' },
    { p: 'Vinegar + Water (1:4)', u: 'Natural glass cleaner', uHi: 'प्राकृतिक कांच सफ़ाई' },
  ] },
  { area: 'Wood & Furniture', areaHi: 'लकड़ी व फ़र्नीचर', items: [
    { p: 'K4 Wood Maintainer (Kleanfix)', u: 'Ready — furniture, flooring, walls', uHi: 'सीधा — फ़र्नीचर, फ़र्श, दीवारें' },
    { p: 'Pledge / Pronto', u: 'Furniture spray polish', uHi: 'फ़र्नीचर स्प्रे पॉलिश' },
    { p: 'Beeswax Polish', u: 'Natural wood protection — monthly', uHi: 'प्राकृतिक लकड़ी — मासिक' },
    { p: 'Termite Spray', u: 'Wood pest prevention — quarterly', uHi: 'दीमक रोकथाम — तिमाही' },
  ] },
  { area: 'Carpet & Upholstery', areaHi: 'कालीन व अपहोल्स्ट्री', items: [
    { p: 'K101 Carpet Shampoo (Kleanfix)', u: '50-100ml/1L — carpet, sofa, chair', uHi: '50-100ml/1L — कालीन, सोफ़ा' },
    { p: 'K103 Carpet Spot Remover (Kleanfix)', u: '50-100ml/1L — spot stains', uHi: '50-100ml/1L — दाग हटाना' },
    { p: 'Scotchgard Fabric Protector', u: 'After-clean protection coat', uHi: 'सफ़ाई बाद सुरक्षा कोट' },
    { p: 'Foam Upholstery Cleaner', u: 'Spray foam — sofa, curtains', uHi: 'फ़ोम स्प्रे — सोफ़ा, पर्दे' },
  ] },
  { area: 'Kitchen & F&B', areaHi: 'किचन', items: [
    { p: 'Klean Det (Kleanfix)', u: 'Dish washing — 20-50ml/1L', uHi: 'बर्तन धुलाई — 20-50ml/1L' },
    { p: 'Klean Grill Degreaser (Kleanfix)', u: 'Oven, fryer, grill, chimney', uHi: 'ओवन, फ्रायर, ग्रिल, चिमनी' },
    { p: 'Klean Multi (Kleanfix)', u: 'Kitchen floor & table — 10-20ml/1L', uHi: 'किचन फ़र्श — 10-20ml/1L' },
    { p: 'Klean Nova (Kleanfix)', u: 'Dishwasher detergent — 3-5ml/1L', uHi: 'डिशवॉशर — 3-5ml/1L' },
    { p: 'Klean Bac Sanitizer (Kleanfix)', u: 'Freezer, food trolley, chopping board', uHi: 'फ़्रीज़र, ट्रॉली, चॉपिंग बोर्ड' },
    { p: 'Klean Tab Sanitizing Tablets (Kleanfix)', u: 'Vegetable/salad wash — 2 tabs/30L', uHi: 'सब्जी धुलाई — 2 गोली/30L' },
    { p: 'Klean Carbon (Kleanfix)', u: 'Grease & carbon from baking trays', uHi: 'बेकिंग ट्रे से ग्रीस कार्बन' },
    { p: 'Klean Dip Destainer (Kleanfix)', u: 'Pre-soak cutlery, crockery — 20-100ml', uHi: 'कटलरी भिगोना — 20-100ml' },
    { p: 'Klean Scale (Kleanfix)', u: 'Coffee machine, ice machine descale', uHi: 'कॉफ़ी मशीन डीस्केल' },
    { p: 'Klean Gel Hand Wash (Kleanfix)', u: 'Food-safe hand wash — kitchen staff', uHi: 'किचन स्टाफ़ हैंड वॉश' },
  ] },
  { area: 'Laundry', areaHi: 'लॉन्ड्री', items: [
    { p: 'Kleanpro-L Det (Kleanfix)', u: 'Liquid laundry detergent — deep clean', uHi: 'तरल कपड़ा धुलाई' },
    { p: 'Kleanpro-Det Powder (Kleanfix)', u: 'Heavy stain powder detergent', uHi: 'भारी दाग पाउडर' },
    { p: 'Kleanpro-CL Bleach (Kleanfix)', u: 'Chlorine bleach — whitening', uHi: 'क्लोरीन ब्लीच — सफ़ेदी' },
    { p: 'Kleanpro-Oxi (Kleanfix)', u: 'Oxygen bleach — color safe', uHi: 'ऑक्सीजन ब्लीच — रंग सुरक्षित' },
    { p: 'Kleanpro-Fab Soft (Kleanfix)', u: 'Fabric softener — soft & fresh', uHi: 'फ़ैब्रिक सॉफ़्टनर' },
    { p: 'Kleanpro-Silk (Kleanfix)', u: 'Woolen & delicate fabric wash', uHi: 'ऊनी व नाज़ुक कपड़े' },
    { p: 'Kleanpro-D Boost (Kleanfix)', u: 'Detergent booster powder', uHi: 'डिटर्जेंट बूस्टर' },
    { p: 'Kleanpro Spotoff (Kleanfix)', u: 'Rust, ink, blood, curry stain remover', uHi: 'जंग, स्याही, खून, हल्दी दाग' },
    { p: 'Kleanpro-Emuls (Kleanfix)', u: 'Emulsifier — oil & grease from fabric', uHi: 'तेल ग्रीस हटाना' },
    { p: 'Kleanpro-Neutro (Kleanfix)', u: 'pH neutralizer — after wash', uHi: 'pH न्यूट्रलाइज़र' },
    { p: 'Klean Pro Optical Brightener', u: 'Fabric brightening — whiter whites', uHi: 'कपड़े चमकाना' },
    { p: 'Kleanpro Descaler Powder', u: 'Washing machine descale', uHi: 'वॉशिंग मशीन डीस्केल' },
  ] },
  { area: 'Hand Hygiene & Germ Control', areaHi: 'हाथ स्वच्छता', items: [
    { p: 'K21 Max Pink Pearl Soap (Kleanfix)', u: 'Washroom dispenser — gentle hand wash', uHi: 'वॉशरूम — हैंड वॉश' },
    { p: 'K22 Gentle Soap (Kleanfix)', u: 'Luxury pearlized hand soap', uHi: 'लक्ज़री हैंड सोप' },
    { p: 'K23 Green Apple Soap (Kleanfix)', u: 'pH balanced — mild on skin', uHi: 'pH संतुलित — त्वचा हल्का' },
    { p: 'Klean Foam (Kleanfix)', u: 'Foam hand soap dispenser refill', uHi: 'फ़ोम हैंड सोप' },
    { p: 'Klean San Sanitizer (Kleanfix)', u: 'Alcohol-based hand sanitizer', uHi: 'अल्कोहल सैनिटाइज़र' },
    { p: 'Klean Rub (Kleanfix)', u: 'Alcohol disinfectant — no water needed', uHi: 'अल्कोहल कीटाणुनाशक' },
    { p: 'Klean Viro (Kleanfix)', u: 'Silver ion disinfectant — surfaces', uHi: 'सिल्वर आयन — सतह कीटाणुनाशक' },
  ] },
  { area: 'Lawn & Garden', areaHi: 'लॉन व बगीचा', items: [
    { p: 'NPK 19:19:19 Fertilizer', u: 'Monthly balanced feed — all plants', uHi: 'मासिक संतुलित खाद' },
    { p: 'Urea (46-0-0)', u: 'Nitrogen boost — lawn greening', uHi: 'नाइट्रोजन — लॉन हरापन' },
    { p: 'DAP (18-46-0)', u: 'Root development — new plants', uHi: 'जड़ विकास — नए पौधे' },
    { p: 'SSP (Single Super Phosphate)', u: 'Flowering boost', uHi: 'फूल बढ़ाना' },
    { p: 'Potash (MOP)', u: 'Plant strength & disease resistance', uHi: 'पौधा मज़बूती' },
    { p: 'Neem Oil Spray', u: 'Organic pest control — 5ml/1L', uHi: 'जैविक कीट — 5ml/1L' },
    { p: 'Neem Cake', u: 'Soil pest prevention', uHi: 'मिट्टी कीट रोकथाम' },
    { p: '2,4-D Weedkiller', u: 'Lawn weed removal — 2ml/1L', uHi: 'खरपतवार — 2ml/1L' },
    { p: 'Fungicide (Mancozeb)', u: 'Fungus/disease cure — 2g/1L', uHi: 'फफूंद — 2g/1L' },
    { p: 'Vermicompost', u: 'Organic nutrition — flower beds', uHi: 'जैविक पोषण — क्यारी' },
    { p: 'Bone Meal', u: 'Phosphorus — bloom boost', uHi: 'फ़ॉस्फ़ोरस — फूल' },
    { p: 'Cow Dung Manure', u: 'Soil enrichment — monthly', uHi: 'मिट्टी सुधार — मासिक' },
    { p: 'Micronutrient Mix', u: 'Iron, zinc, manganese spray', uHi: 'सूक्ष्म पोषक स्प्रे' },
    { p: 'Humic Acid', u: 'Root growth stimulator', uHi: 'जड़ विकास उत्तेजक' },
  ] },
  { area: 'Car & Parking', areaHi: 'कार व पार्किंग', items: [
    { p: 'Greno Car Shampoo (Kleanfix)', u: 'Vehicle wash — concentrated', uHi: 'वाहन धुलाई' },
    { p: 'Greno Dashboard Shiner (Kleanfix)', u: 'Dashboard, plastic, rubber', uHi: 'डैशबोर्ड, प्लास्टिक' },
    { p: 'Greno Tyre Polish (Kleanfix)', u: 'Tyre shine — spray/sponge', uHi: 'टायर चमक' },
    { p: 'Pressure Washer Detergent', u: 'Parking deep wash — monthly', uHi: 'पार्किंग गहरी धुलाई — मासिक' },
    { p: 'Oil Stain Remover / TSP', u: 'Parking oil stain removal', uHi: 'पार्किंग तेल दाग' },
  ] },
]

// Which property specs this user is allowed to see.
export default function ChemicalGuide({ visibleProps }) {
  const t = useT()
  const { user } = useAuth()
  const admin = isAdminRole(user?.role)
  const C = useColors()
  const { lang } = useLang()
  const hi = lang === 'hi'

  // property codes the user can view; fall back to all four
  const propKeys = useMemo(() => {
    const codes = (visibleProps && visibleProps.length ? visibleProps.map((p) => p.code) : Object.keys(PROP_SPECS))
    return codes.filter((c) => PROP_SPECS[c])
  }, [visibleProps])

  // Venue dimensions live in `chemical_specs` so an admin can correct them.
  // Missing table or missing row -> the built-in PROP_SPECS still apply.
  const [specs, setSpecs] = useState(PROP_SPECS)
  const [editingSpec, setEditingSpec] = useState(false)
  const loadSpecs = useCallback(async () => {
    const { data } = await supabase.from('chemical_specs').select('*')
    if (!data?.length) return
    const merged = { ...PROP_SPECS }
    data.forEach((r) => {
      merged[r.property] = {
        ...(PROP_SPECS[r.property] || {}),
        banquet: r.banquet, lawn: r.lawn, washrooms: r.washrooms, glass: r.glass,
        label: PROP_SPECS[r.property]?.label || r.property,
      }
    })
    setSpecs(merged)
  }, [])
  useEffect(() => { loadSpecs() }, [loadSpecs])

  // Editable formulas. Absent table (migration not run) -> built-in calcQty.
  const [formulas, setFormulas] = useState(null)
  const [editingFormula, setEditingFormula] = useState(null)
  const loadFormulas = useCallback(async () => {
    const { data } = await supabase.from('chemical_formulas').select('*').eq('is_active', true).order('sort_order')
    setFormulas(data?.length ? data : null)
  }, [])
  useEffect(() => { loadFormulas() }, [loadFormulas])

  const [view, setView] = useState('calc') // 'calc' | 'guide'
  const [selectedProp, setSelectedProp] = useState(propKeys[0] || 'pp')
  const [openAreas, setOpenAreas] = useState({ 0: true })
  // staff are tied to one venue — there is no choice to offer them
  const onlyProp = propKeys.length <= 1

  // The guide lives in `chemical_products` so admins can edit it. If that table
  // isn't there yet (migration not run) we fall back to the built-in list, so
  // the page never comes up empty.
  const [products, setProducts] = useState(null) // null = still loading
  const [editing, setEditing] = useState(null)   // product row | 'new'

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('chemical_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    setProducts(error || !data?.length ? [] : data)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  // group flat rows back into the { area, areaHi, items } shape the UI renders,
  // preserving sort_order; an empty table means "use the built-in constant"
  const sections = useMemo(() => {
    if (!products?.length) return CHEM_DATA
    const byArea = new Map()
    products.forEach((r) => {
      if (!byArea.has(r.area)) byArea.set(r.area, { area: r.area, areaHi: r.area_hi || r.area, items: [] })
      byArea.get(r.area).items.push({ id: r.id, p: r.name, pHi: r.name_hi, u: r.usage_en, uHi: r.usage_hi, row: r })
    })
    return [...byArea.values()]
  }, [products])

  const editable = !!products?.length // only rows that exist in the table can be edited

  const spec = specs[selectedProp] || PROP_SPECS[selectedProp] || PROP_SPECS.pp
  const chemicals = useMemo(() => {
    if (!formulas) return calcQty(spec, hi)
    return formulas.map((f, i) => ({
      row: f,
      code: f.code,
      name: f.name, nameHi: f.name_hi,
      area: f.area, areaHi: f.area_hi,
      note: f.note, noteHi: f.note_hi,
      unit: f.unit,
      qty: rowQty(f, spec).qty,
      formula: rowFormula(f, spec, hi),
      color: AREA_COLORS[i % AREA_COLORS.length],
    }))
  }, [formulas, spec, hi])
  const totalLitres = chemicals.filter((c) => c.unit === 'L').reduce((s, c) => s + parseFloat(c.qty), 0).toFixed(1)
  const totalKg = chemicals.filter((c) => c.unit === 'kg').reduce((s, c) => s + parseFloat(c.qty), 0).toFixed(0)

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 14 }}>
        Kleanfix Industries · kleanfix.com · +91 98189 98806
      </div>

      {/* Calculator / Product Guide toggle */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: C.maroonSoft, borderRadius: 12, padding: 3, width: 'fit-content' }}>
        {[
          { id: 'calc', label: lang === 'hi' ? 'कैलकुलेटर' : 'Calculator' },
          { id: 'guide', label: lang === 'hi' ? 'प्रोडक्ट गाइड' : 'Product Guide' },
        ].map((tb) => (
          <button
            key={tb.id}
            onClick={() => setView(tb.id)}
            style={{
              padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: 700,
              background: view === tb.id ? C.maroon : 'transparent',
              color: view === tb.id ? '#fff' : C.maroon,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {view === 'calc' && (
        <div>
          {/* Property selector + specs */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>
              <Icon name="pin" size={16} color={C.maroon} />
              {onlyProp ? propName(selectedProp, lang) : (lang === 'hi' ? 'प्रॉपर्टी चुनें' : 'Select Property')}
              {admin && (
                <button
                  type="button"
                  onClick={() => setEditingSpec(true)}
                  title={t.editDimensions}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color: C.tl, fontSize: 12.5, fontWeight: 600, padding: 0 }}
                >
                  <Icon name="edit" size={14} color={C.tl} /> {t.edit}
                </button>
              )}
            </div>
            {!onlyProp && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(propKeys.length, 4)}, 1fr)`, gap: 8, marginBottom: 12 }}>
                {propKeys.map((k) => (
                  <button
                    key={k}
                    onClick={() => setSelectedProp(k)}
                    style={{
                      padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${selectedProp === k ? C.maroon : C.border}`,
                      background: selectedProp === k ? C.maroonSoft : C.card,
                      color: selectedProp === k ? C.maroon : C.text,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Icon name="flask" size={20} color={selectedProp === k ? C.maroon : C.tl} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{propName(k, lang)}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {[
                { label: lang === 'hi' ? 'बैंक्वेट' : 'Banquet', val: `${spec.banquet.toLocaleString()} sqft` },
                { label: lang === 'hi' ? 'लॉन' : 'Lawn', val: `${spec.lawn.toLocaleString()} sqft` },
                { label: lang === 'hi' ? 'वॉशरूम' : 'Washrooms', val: spec.washrooms },
                { label: lang === 'hi' ? 'ग्लास/हॉल' : 'Glass/Hall', val: spec.glass > 0 ? `${spec.glass.toLocaleString()} sqft` : 'N/A' },
              ].map((s) => (
                <div key={s.label} style={{ padding: 10, background: C.bg, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{s.val}</div>
                  <div style={{ fontSize: 11.5, color: C.tl, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Monthly totals */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ background: C.bBg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.blue}30` }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.blue, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{totalLitres} {unitLabel('L', hi)}</div>
              <div style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>{lang === 'hi' ? 'कुल तरल केमिकल / माह' : 'Total Liquid Chemicals / Month'}</div>
            </div>
            <div style={{ background: C.gBg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.green}30` }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.green, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{totalKg} {unitLabel('kg', hi)}</div>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{lang === 'hi' ? 'कुल सूखे/ठोस केमिकल / माह' : 'Total Dry / Solid Chemicals / Month'}</div>
            </div>
          </div>

          {/* Chemical breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {chemicals.map((c) => (
              <Card
                key={c.code + c.name}
                onClick={admin && c.row ? () => setEditingFormula(c.row) : undefined}
                style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${c.color}`, cursor: admin && c.row ? 'pointer' : 'default' }}
              >
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ padding: '2px 7px', borderRadius: 5, background: c.color + '20', color: c.color, fontSize: 10.5, fontWeight: 700 }}>{c.code}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{hi && c.nameHi ? c.nameHi : c.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.tl, marginBottom: 5 }}>{hi && c.areaHi ? c.areaHi : c.area}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{c.formula}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{hi && c.noteHi ? c.noteHi : c.note}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{c.qty}</div>
                    <div style={{ fontSize: 11, color: C.tl, fontWeight: 600 }}>{unitLabel(c.unit, hi)}/{perMonth(hi)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {editingFormula && (
        <FormulaModal
          row={editingFormula}
          spec={spec}
          onClose={() => setEditingFormula(null)}
          onSaved={() => { setEditingFormula(null); loadFormulas() }}
        />
      )}

      {editingSpec && (
        <SpecModal
          code={selectedProp}
          spec={spec}
          user={user}
          onClose={() => setEditingSpec(false)}
          onSaved={() => { setEditingSpec(false); loadSpecs() }}
        />
      )}

      {view === 'guide' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: C.tl, flex: 1, minWidth: 200 }}>
              {lang === 'hi'
                ? 'Kleanfix, Diversey और अन्य ब्रांड · kleanfix.com · +91 98189 98806'
                : 'Kleanfix, Diversey & other brands · kleanfix.com · +91 98189 98806'}
            </div>
            {admin && editable && (
              <Button variant="soft" onClick={() => setEditing('new')} style={{ flexShrink: 0 }}>
                <Icon name="plus" size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {t.addProduct}
              </Button>
            )}
          </div>
          {admin && products && !editable && (
            <div style={{ fontSize: 12, color: C.tl, background: C.yBg, border: `1px solid ${C.yellow}33`, borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
              <Icon name="info" size={13} color={C.yellow} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
              {t.guideReadOnly}
            </div>
          )}
          {sections.map((section, si) => {
            const isOpen = openAreas[si] !== false
            const color = AREA_COLORS[si % AREA_COLORS.length]
            return (
              <div key={section.area} style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setOpenAreas((p) => ({ ...p, [si]: !isOpen }))}
                  style={{
                    width: '100%', padding: '12px 14px', background: C.card,
                    border: `1px solid ${C.border}`, borderLeft: `4px solid ${color}`,
                    borderRadius: isOpen ? '12px 12px 0 0' : 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 14, fontWeight: 700, color, textAlign: 'left',
                  }}
                >
                  <span>{lang === 'hi' ? section.areaHi : section.area}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.tl, fontWeight: 500 }}>
                    {section.items.length} {lang === 'hi' ? 'उत्पाद' : 'products'}
                    <Icon name="chevronRight" size={15} color={C.tl} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </span>
                </button>
                {isOpen && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                    {section.items.map((item, ii) => (
                      <div
                        key={item.id || item.p}
                        onClick={admin && editable ? () => setEditing(item.row) : undefined}
                        style={{
                          padding: '10px 14px',
                          borderBottom: ii < section.items.length - 1 ? `1px solid ${C.border}` : 'none',
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                          cursor: admin && editable ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ width: 3, alignSelf: 'stretch', background: color, borderRadius: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{(lang === 'hi' && item.pHi) || item.p}</div>
                          <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>{lang === 'hi' ? item.uHi : item.u}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {editing && (
            <ProductModal
              record={editing === 'new' ? null : editing}
              sectionList={sections.map((x) => ({ area: x.area, areaHi: x.areaHi }))}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); loadProducts() }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Add / edit one product in the guide. Both languages are typed by hand — a
// product name like "K2 Hard Surface Cleaner (Kleanfix)" is a brand string, and
// machine translation would mangle it.
function ProductModal({ record, sectionList, onClose, onSaved }) {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const NEW = '__new__'
  const known = sectionList.some((x) => x.area === record?.area)

  const [form, setForm] = useState({
    // an existing product always starts on its own section
    areaPick: record ? (known ? record.area : NEW) : (sectionList[0]?.area || NEW),
    area: record?.area || '',
    area_hi: record?.area_hi || '',
    name: record?.name || '',
    name_hi: record?.name_hi || '',
    usage_en: record?.usage_en || '',
    usage_hi: record?.usage_hi || '',
    sort_order: record?.sort_order ?? 999,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const creatingSection = form.areaPick === NEW

  // choosing an existing section fills its Hindi heading automatically, so every
  // product in a section keeps the same one
  function pickSection(e) {
    const areaPick = e.target.value
    if (areaPick === NEW) { setForm((f) => ({ ...f, areaPick, area: '', area_hi: '' })); return }
    const match = sectionList.find((x) => x.area === areaPick)
    setForm((f) => ({ ...f, areaPick, area: areaPick, area_hi: match?.areaHi || '' }))
  }

  async function save() {
    const area = (creatingSection ? form.area : form.areaPick).trim()
    if (!form.name.trim()) { setErr(`${t.productName} ${t.isRequired}`); return }
    if (!area) { setErr(`${t.guideArea} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const payload = {
      area,
      area_hi: form.area_hi.trim() || null,
      name: form.name.trim(),
      name_hi: form.name_hi.trim() || null,
      usage_en: form.usage_en.trim() || null,
      usage_hi: form.usage_hi.trim() || null,
      sort_order: Number(form.sort_order) || 999,
    }
    const { error } = record
      ? await supabase.from('chemical_products').update(payload).eq('id', record.id)
      : await supabase.from('chemical_products').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  // soft delete, so a removed product can be restored from the table
  async function remove() {
    if (!(await confirm({ message: t.deleteProductConfirm, confirmLabel: t.remove }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('chemical_products').update({ is_active: false }).eq('id', record.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={record ? t.editProduct : t.addProduct}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          {record && (
            <Button variant="danger" onClick={remove} disabled={busy} title={t.delete} aria-label={t.delete} style={{ flexShrink: 0 }}>
              <Icon name="trash" size={16} color="#fff" />
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      <Field label={t.guideArea}>
        <select style={inputStyle(C)} value={form.areaPick} onChange={pickSection}>
          {sectionList.map((x) => <option key={x.area} value={x.area}>{x.area}</option>)}
          <option value={NEW}>+ {t.newSection}</option>
        </select>
      </Field>

      {/* only a brand-new section needs its headings typed */}
      {creatingSection && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label={t.guideArea}>
              <input style={inputStyle(C)} value={form.area} onChange={set('area')} placeholder="Pest Control" />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label={`${t.guideArea} (हिंदी)`}>
              <input style={inputStyle(C)} value={form.area_hi} onChange={set('area_hi')} placeholder="कीट नियंत्रण" />
            </Field>
          </div>
        </div>
      )}

      <Field label={t.productName}>
        <input style={inputStyle(C)} value={form.name} onChange={set('name')} placeholder="K2 Hard Surface Cleaner (Kleanfix)" />
      </Field>
      <Field label={`${t.productName} (हिंदी)`} hint={t.hindiOptionalHint}>
        <input style={inputStyle(C)} value={form.name_hi} onChange={set('name_hi')} placeholder="K2 हार्ड सरफ़ेस क्लीनर" />
      </Field>

      <Field label={t.howToUse}>
        <input style={inputStyle(C)} value={form.usage_en} onChange={set('usage_en')} placeholder="Daily mopping — 20ml per 1L water" />
      </Field>
      <Field label={`${t.howToUse} (हिंदी)`} hint={t.hindiOptionalHint}>
        <input style={inputStyle(C)} value={form.usage_hi} onChange={set('usage_hi')} placeholder="रोज़ पोछा — 20ml प्रति 1L पानी" />
      </Field>

      <Field label={t.sortOrder} hint={t.sortOrderHint}>
        <input type="number" style={inputStyle(C)} value={form.sort_order} onChange={set('sort_order')} />
      </Field>

      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

// Admin: correct a venue's dimensions. These drive every quantity on the
// calculator, so the modal states that rather than leaving it to be discovered.
function SpecModal({ code, spec, user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [form, setForm] = useState({
    banquet: String(spec.banquet ?? 0),
    lawn: String(spec.lawn ?? 0),
    washrooms: String(spec.washrooms ?? 0),
    glass: String(spec.glass ?? 0),
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const num = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }))

  async function save() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('chemical_specs').upsert({
      property: code,
      banquet: Number(form.banquet) || 0,
      lawn: Number(form.lawn) || 0,
      washrooms: Number(form.washrooms) || 0,
      glass: Number(form.glass) || 0,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    }, { onConflict: 'property' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const FIELDS = [
    { k: 'banquet', label: lang === 'hi' ? 'बैंक्वेट (sqft)' : 'Banquet (sqft)' },
    { k: 'lawn', label: lang === 'hi' ? 'लॉन (sqft)' : 'Lawn (sqft)' },
    { k: 'washrooms', label: lang === 'hi' ? 'वॉशरूम (संख्या)' : 'Washrooms (count)' },
    { k: 'glass', label: lang === 'hi' ? 'ग्लास/हॉल (sqft)' : 'Glass / Hall (sqft)' },
  ]

  return (
    <Modal
      open onClose={onClose} title={`${t.editDimensions} — ${propName(code, lang)}`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 12, lineHeight: 1.5 }}>{t.dimensionsHint}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {FIELDS.map((f) => (
          <Field key={f.k} label={f.label}>
            <input style={inputStyle(C)} value={form[f.k]} inputMode="numeric" onChange={num(f.k)} />
          </Field>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{t.glassZeroHint}</div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

// Admin: edit one calculator product — its labels and the numbers behind it.
// The live result is shown as you type, because a rate like 0.002 means nothing
// on its own; what matters is the litres it produces for this venue.
function FormulaModal({ row, spec, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const confirm = useConfirm()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const [form, setForm] = useState({ ...row })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') }))

  const preview = rowQty(form, spec)

  async function save() {
    if (!String(form.name || '').trim()) { setErr(`${t.productName} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const num = (v, d = 0) => (v === '' || v == null ? d : Number(v))
    const { error } = await supabase.from('chemical_formulas').update({
      name: String(form.name).trim(),
      name_hi: String(form.name_hi || '').trim() || null,
      area: String(form.area || '').trim() || null,
      area_hi: String(form.area_hi || '').trim() || null,
      note: String(form.note || '').trim() || null,
      note_hi: String(form.note_hi || '').trim() || null,
      unit: form.unit || 'L',
      base: form.base || 'banquet',
      share: num(form.share, 1),
      offset_val: num(form.offset_val),
      rate: num(form.rate, 1),
      freq: num(form.freq, 1),
      days: num(form.days, 1),
      divisor: num(form.divisor, 1) || 1,
      round_up: !!form.round_up,
      decimals: num(form.decimals),
      glass_fallback_pct: num(form.glass_fallback_pct),
      updated_at: new Date().toISOString(),
    }).eq('code', row.code)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function remove() {
    if (!(await confirm({ message: t.deleteChemicalConfirm, detail: `${row.code} · ${row.name}`, confirmLabel: t.remove }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('chemical_formulas')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('code', row.code)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const NUMS = [
    { k: 'rate', label: hi ? 'दर (प्रति यूनिट)' : 'Rate (per unit)' },
    { k: 'freq', label: hi ? 'बार' : 'Times' },
    { k: 'days', label: hi ? 'दिन' : 'Days' },
    { k: 'divisor', label: hi ? 'भाग' : 'Divide by' },
    { k: 'share', label: hi ? 'हिस्सा (0–1)' : 'Share (0–1)' },
    { k: 'offset_val', label: hi ? 'जोड़ें' : 'Add' },
  ]

  return (
    <Modal
      open onClose={onClose} maxWidth={560}
      title={`${t.edit} — ${row.code}`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="danger" onClick={remove} disabled={busy} title={t.delete} aria-label={t.delete} style={{ flexShrink: 0 }}>
            <Icon name="trash" size={16} color="#fff" />
          </Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      {/* live result — the number the venue will actually see */}
      <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {preview.qty} {unitLabel(form.unit, hi)}<span style={{ fontSize: 12, fontWeight: 600, color: C.tl }}>/{hi ? 'माह' : 'month'}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>{rowFormula(form, spec, hi)}</div>
      </div>

      <Field label={t.productName}><input style={inputStyle(C)} value={form.name || ''} onChange={set('name')} /></Field>
      <Field label={`${t.productName} (हिंदी)`}><input style={inputStyle(C)} value={form.name_hi || ''} onChange={set('name_hi')} /></Field>
      <Field label={t.guideArea}><input style={inputStyle(C)} value={form.area || ''} onChange={set('area')} /></Field>
      <Field label={`${t.guideArea} (हिंदी)`}><input style={inputStyle(C)} value={form.area_hi || ''} onChange={set('area_hi')} /></Field>
      <Field label={t.howToUse}><input style={inputStyle(C)} value={form.note || ''} onChange={set('note')} /></Field>
      <Field label={`${t.howToUse} (हिंदी)`}><input style={inputStyle(C)} value={form.note_hi || ''} onChange={set('note_hi')} /></Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={hi ? 'किस माप पर' : 'Scales with'}>
            <select style={inputStyle(C)} value={form.base} onChange={set('base')}>
              <option value="floor">{hi ? 'बैंक्वेट + ग्लास' : 'Banquet + Glass'}</option>
              <option value="banquet">{hi ? 'बैंक्वेट' : 'Banquet'}</option>
              <option value="lawn">{hi ? 'लॉन' : 'Lawn'}</option>
              <option value="washrooms">{hi ? 'वॉशरूम' : 'Washrooms'}</option>
              <option value="glass">{hi ? 'ग्लास/हॉल' : 'Glass / Hall'}</option>
              <option value="fixed">{hi ? 'तय मात्रा' : 'Fixed amount'}</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={hi ? 'यूनिट' : 'Unit'}>
            <select style={inputStyle(C)} value={form.unit} onChange={set('unit')}>
              {['L', 'kg', 'cans'].map((u) => <option key={u} value={u}>{unitLabel(u, hi)}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {NUMS.map((f) => (
          <Field key={f.k} label={f.label}>
            <input style={inputStyle(C)} inputMode="decimal" value={form[f.k] ?? ''} onChange={setNum(f.k)} />
          </Field>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.tl }}>
          <input type="checkbox" checked={!!form.round_up} onChange={(e) => setForm((f) => ({ ...f, round_up: e.target.checked }))} />
          {hi ? 'ऊपर पूर्णांक करें' : 'Round up to a whole unit'}
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.tl }}>
          {hi ? 'दशमलव' : 'Decimals'}
          <input style={{ ...inputStyle(C), width: 62, padding: '6px 8px' }} inputMode="numeric" value={form.decimals ?? 0} onChange={setNum('decimals')} />
        </label>
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
    </Modal>
  )
}
