import { useState } from "react";
import { C as C_BASE, F, LANGS, PROPS } from "./constants.js";
import { useT } from "./ThemeContext.js";
import { useIsMobile } from "./hooks.js";

// Property specs for calculation
const PROP_SPECS = {
  pp: { banquet: 14000, lawn: 40000, washrooms: 7, glass: 0, label: "Pushpanjali" },
  ex: { banquet: 20500, lawn: 35000, washrooms: 10, glass: 20500, label: "Exotica" },
  mk: { banquet: 26000, lawn: 27000, washrooms: 8, glass: 10000, label: "Manaktala" },
  rs: { banquet: 8000, lawn: 5000, washrooms: 4, glass: 8000, label: "Restro" },
};

// Chemical formulas
// floor cleaner = sqft × 0.002L per wash × 30 days (2 washes/day)
// toilet cleaner = washrooms × 0.5L × 30 days
// etc.
function calcQty(spec) {
  const { banquet, lawn, washrooms, glass } = spec;
  const totalFloor = banquet + (glass > 0 ? glass : 0);

  return [
    {
      code: "K2",
      name: "Hard Surface Floor Cleaner",
      area: "🏛️ Banquet / Tiles / Corridors",
      qty: ((totalFloor * 0.002 * 2 * 30) / 1000).toFixed(1),
      unit: "L",
      formula: `${totalFloor.toLocaleString()} sqft × 0.002L × 2 washes × 30 days`,
      note: "Dilution: 20ml/1L water",
      color: C.blue,
    },
    {
      code: "K1",
      name: "Bathroom Sanitizer",
      area: "🚽 Washrooms / Tiles / Tubs",
      qty: (washrooms * 0.5 * 30).toFixed(0),
      unit: "L",
      formula: `${washrooms} washrooms × 0.5L/day × 30 days`,
      note: "Dilution: 20–50ml/1L water",
      color: C.red,
    },
    {
      code: "K6",
      name: "Toilet Bowl Cleaner",
      area: "🚽 Toilet Bowls / Urinals",
      qty: (washrooms * 0.3 * 30).toFixed(0),
      unit: "L",
      formula: `${washrooms} toilets × 0.3L/day × 30 days`,
      note: "Ready-to-use — pour directly",
      color: C.red,
    },
    {
      code: "K5",
      name: "Air Freshener",
      area: "🌸 All Washrooms + Banquet",
      qty: Math.ceil((washrooms + 2) * 30 / 5),
      unit: "cans",
      formula: `${washrooms + 2} areas × 30 days ÷ 5 days/can`,
      note: "Spray every 2–3 hours in peak hours",
      color: C.accent,
    },
    {
      code: "K3",
      name: "Glass Cleaner",
      area: "🪟 Glass / Mirrors / Partitions",
      qty: (((glass || banquet * 0.2) * 0.003 * 4) / 1000).toFixed(1),
      unit: "L",
      formula: `${Math.round(glass || banquet * 0.2).toLocaleString()} sqft × 0.003L × 4 times/month`,
      note: "Dilution: 20–50ml/1L water",
      color: C.tl,
    },
    {
      code: "K4",
      name: "Wood Maintainer",
      area: "🪑 Furniture / Wooden Floors",
      qty: Math.ceil(banquet / 5000),
      unit: "L",
      formula: `${Math.round(banquet / 5000)} L per ${banquet.toLocaleString()} sqft monthly`,
      note: "Ready-to-use on wooden surfaces",
      color: C.accent,
    },
    {
      code: "K7",
      name: "Stainless Steel Polish",
      area: "🔧 Railings / Fixtures / Grills",
      qty: 2,
      unit: "L",
      formula: "~2L per property per month (standard)",
      note: "Ready-to-use on SS surfaces",
      color: C.tl,
    },
    {
      code: "K101",
      name: "Carpet Shampoo",
      area: "🧶 Carpets / Sofas / Upholstery",
      qty: Math.ceil(banquet * 0.3 * 0.08 / 1000 * 4),
      unit: "L",
      formula: `30% carpet area × 80ml/sqft × 4/month ÷ 1000`,
      note: "Dilution: 50–100ml/1L water",
      color: C.green,
    },
    {
      code: "NPK 19:19:19",
      name: "NPK Fertilizer",
      area: "🌿 All Lawn & Garden Areas",
      qty: (lawn / 1000 * 2).toFixed(0),
      unit: "kg",
      formula: `${lawn.toLocaleString()} sqft lawn ÷ 1000 × 2kg/month`,
      note: "Monthly balanced feed — dilute 2g/L",
      color: C.green,
    },
    {
      code: "Neem Oil",
      name: "Neem Oil (Pest Control)",
      area: "🌺 Lawn / Plants / Trees",
      qty: (lawn / 10000 * 0.5).toFixed(1),
      unit: "L",
      formula: `${(lawn / 10000).toFixed(1)} × 0.5L per 10K sqft`,
      note: "Mix 5ml/1L water — spray monthly",
      color: C.green,
    },
  ];
}

const AREA_COLORS = [
  "#3B6FC0", // Floor Care — blue
  "#C0392B", // Washroom — red
  "#0891B2", // Glass/Mirror/Metal — teal
  "#D97706", // Wood/Furniture — amber
  "#2E8B57", // Carpet — green
  "#F59E0B", // Kitchen — orange
  "#7C3AED", // Laundry — purple
  "#EC4899", // Hand Hygiene — pink
  "#16A34A", // Lawn/Garden — dark green
  "#6B7280", // Car/Parking — gray
];

const CHEM_DATA = [
  {
    area:"🏛️ Floor Care", areaHi:"फ़र्श देखभाल",
    items:[
      {p:"K2 Hard Surface Cleaner (Kleanfix)",u:"Daily mopping — 20ml per 1L water",uHi:"रोज़ पोछा — 20ml प्रति 1L पानी"},
      {p:"K20 Floor Striper (Kleanfix)",u:"Deep clean — 10-20ml in warm water",uHi:"गहरी सफ़ाई — 10-20ml गर्म पानी"},
      {p:"K102 All-in-One (Kleanfix)",u:"Floors, walls, panels, sinks",uHi:"फ़र्श, दीवारें, पैनल, सिंक"},
      {p:"K14 Shiner (Kleanfix)",u:"Marble floor polish — ready to use",uHi:"मार्बल पॉलिश — सीधा उपयोग"},
      {p:"K15 Miracle (Kleanfix)",u:"Stone floor restoration",uHi:"पत्थर फ़र्श रिस्टोर"},
      {p:"Taski R2 (Diversey)",u:"Daily floor cleaner — 20ml/5L",uHi:"रोज़ फ़र्श — 20ml/5L"},
      {p:"Taski R3 (Diversey)",u:"Glass & surface cleaner",uHi:"कांच और सतह"},
      {p:"Taski R4 (Diversey)",u:"Furniture polish",uHi:"फ़र्नीचर पॉलिश"},
      {p:"Taski R6 (Diversey)",u:"Toilet bowl cleaner",uHi:"टॉयलेट क्लीनर"},
      {p:"Floor Sealer / Polish",u:"Monthly — protects marble & granite",uHi:"मासिक — मार्बल ग्रेनाइट सुरक्षा"},
      {p:"Acid-based Tile Cleaner (HCl 10%)",u:"Weekly deep — tiles & grout",uHi:"हफ़्ते गहरी — टाइल ग्राउट"},
      {p:"Oxalic Acid",u:"Rust stain removal from floors",uHi:"फ़र्श से जंग दाग हटाना"},
    ]
  },
  {
    area:"🚽 Washroom & Toilet", areaHi:"शौचालय",
    items:[
      {p:"K1 Bathroom Sanitizer (Kleanfix)",u:"20-50ml/1L — tub, tiles, sink, fittings",uHi:"20-50ml/1L — टब, टाइल, सिंक"},
      {p:"K6 Toilet Bowl Cleaner (Kleanfix)",u:"Ready to use — toilet, urinal, pot",uHi:"सीधा उपयोग — टॉयलेट, यूरिनल"},
      {p:"K5 Air Freshener (Kleanfix)",u:"Ready to use — spray all areas",uHi:"सीधा उपयोग — हर जगह स्प्रे"},
      {p:"Harpic / Domex",u:"Toilet bowl — daily use",uHi:"टॉयलेट बाउल — रोज़"},
      {p:"Sodium Hypochlorite 4%",u:"Surface sanitizer — 50ml/1L",uHi:"सतह सैनिटाइज़ — 50ml/1L"},
      {p:"Draino Drain Cleaner (Kleanfix)",u:"Blocked drains, sinks, pipes",uHi:"बंद नाली, सिंक, पाइप"},
      {p:"Klean Odour (Kleanfix)",u:"Removes urine/vomit/food odour — 1L/10L",uHi:"बदबू हटाना — 1L/10L पानी"},
      {p:"Urinal Cubes / Naphthalene Balls",u:"Urinals & drains — replace weekly",uHi:"यूरिनल — हफ़्ते बदलें"},
      {p:"Phenyl (White/Black)",u:"Floor disinfect — 50ml/1L",uHi:"फ़र्श कीटाणुनाशक — 50ml/1L"},
    ]
  },
  {
    area:"🪟 Glass, Mirror & Metal", areaHi:"कांच, शीशा, धातु",
    items:[
      {p:"K3 Glass Cleaner (Kleanfix)",u:"20-50ml/1L — glass, mirror, appliances",uHi:"20-50ml/1L — कांच, शीशा"},
      {p:"K7 S.S. Polish (Kleanfix)",u:"Ready — steel, grills, railings, stairs",uHi:"सीधा — स्टील, ग्रिल, रेलिंग"},
      {p:"K8 Spark Oil Surface Cleaner (Kleanfix)",u:"20-50ml/1L — greasy surfaces",uHi:"20-50ml/1L — तेल वाली सतह"},
      {p:"K9 Scale Remover (Kleanfix)",u:"100ml/1L — kitchen, bathroom scale",uHi:"100ml/1L — किचन, बाथरूम स्केल"},
      {p:"Colin / Windex",u:"Glass & mirror spray — ready",uHi:"कांच शीशा स्प्रे"},
      {p:"Brasso",u:"Brass & copper polish",uHi:"पीतल तांबा पॉलिश"},
      {p:"Vinegar + Water (1:4)",u:"Natural glass cleaner",uHi:"प्राकृतिक कांच सफ़ाई"},
    ]
  },
  {
    area:"🪑 Wood & Furniture", areaHi:"लकड़ी व फ़र्नीचर",
    items:[
      {p:"K4 Wood Maintainer (Kleanfix)",u:"Ready — furniture, flooring, walls",uHi:"सीधा — फ़र्नीचर, फ़र्श, दीवारें"},
      {p:"Pledge / Pronto",u:"Furniture spray polish",uHi:"फ़र्नीचर स्प्रे पॉलिश"},
      {p:"Beeswax Polish",u:"Natural wood protection — monthly",uHi:"प्राकृतिक लकड़ी — मासिक"},
      {p:"Termite Spray",u:"Wood pest prevention — quarterly",uHi:"दीमक रोकथाम — तिमाही"},
    ]
  },
  {
    area:"🧹 Carpet & Upholstery", areaHi:"कालीन व अपहोल्स्ट्री",
    items:[
      {p:"K101 Carpet Shampoo (Kleanfix)",u:"50-100ml/1L — carpet, sofa, chair",uHi:"50-100ml/1L — कालीन, सोफ़ा"},
      {p:"K103 Carpet Spot Remover (Kleanfix)",u:"50-100ml/1L — spot stains",uHi:"50-100ml/1L — दाग हटाना"},
      {p:"Scotchgard Fabric Protector",u:"After-clean protection coat",uHi:"सफ़ाई बाद सुरक्षा कोट"},
      {p:"Foam Upholstery Cleaner",u:"Spray foam — sofa, curtains",uHi:"फ़ोम स्प्रे — सोफ़ा, पर्दे"},
    ]
  },
  {
    area:"🍳 Kitchen & F&B", areaHi:"किचन",
    items:[
      {p:"Klean Det (Kleanfix)",u:"Dish washing — 20-50ml/1L",uHi:"बर्तन धुलाई — 20-50ml/1L"},
      {p:"Klean Grill Degreaser (Kleanfix)",u:"Oven, fryer, grill, chimney",uHi:"ओवन, फ्रायर, ग्रिल, चिमनी"},
      {p:"Klean Multi (Kleanfix)",u:"Kitchen floor & table — 10-20ml/1L",uHi:"किचन फ़र्श — 10-20ml/1L"},
      {p:"Klean Nova (Kleanfix)",u:"Dishwasher detergent — 3-5ml/1L",uHi:"डिशवॉशर — 3-5ml/1L"},
      {p:"Klean Bac Sanitizer (Kleanfix)",u:"Freezer, food trolley, chopping board",uHi:"फ़्रीज़र, ट्रॉली, चॉपिंग बोर्ड"},
      {p:"Klean Tab Sanitizing Tablets (Kleanfix)",u:"Vegetable/salad wash — 2 tabs/30L",uHi:"सब्जी धुलाई — 2 गोली/30L"},
      {p:"Klean Carbon (Kleanfix)",u:"Grease & carbon from baking trays",uHi:"बेकिंग ट्रे से ग्रीस कार्बन"},
      {p:"Klean Dip Destainer (Kleanfix)",u:"Pre-soak cutlery, crockery — 20-100ml",uHi:"कटलरी भिगोना — 20-100ml"},
      {p:"Klean Scale (Kleanfix)",u:"Coffee machine, ice machine descale",uHi:"कॉफ़ी मशीन डीस्केल"},
      {p:"Klean Gel Hand Wash (Kleanfix)",u:"Food-safe hand wash — kitchen staff",uHi:"किचन स्टाफ़ हैंड वॉश"},
    ]
  },
  {
    area:"👔 Laundry", areaHi:"लॉन्ड्री",
    items:[
      {p:"Kleanpro-L Det (Kleanfix)",u:"Liquid laundry detergent — deep clean",uHi:"तरल कपड़ा धुलाई"},
      {p:"Kleanpro-Det Powder (Kleanfix)",u:"Heavy stain powder detergent",uHi:"भारी दाग पाउडर"},
      {p:"Kleanpro-CL Bleach (Kleanfix)",u:"Chlorine bleach — whitening",uHi:"क्लोरीन ब्लीच — सफ़ेदी"},
      {p:"Kleanpro-Oxi (Kleanfix)",u:"Oxygen bleach — color safe",uHi:"ऑक्सीजन ब्लीच — रंग सुरक्षित"},
      {p:"Kleanpro-Fab Soft (Kleanfix)",u:"Fabric softener — soft & fresh",uHi:"फ़ैब्रिक सॉफ़्टनर"},
      {p:"Kleanpro-Silk (Kleanfix)",u:"Woolen & delicate fabric wash",uHi:"ऊनी व नाज़ुक कपड़े"},
      {p:"Kleanpro-D Boost (Kleanfix)",u:"Detergent booster powder",uHi:"डिटर्जेंट बूस्टर"},
      {p:"Kleanpro Spotoff (Kleanfix)",u:"Rust, ink, blood, curry stain remover",uHi:"जंग, स्याही, खून, हल्दी दाग"},
      {p:"Kleanpro-Emuls (Kleanfix)",u:"Emulsifier — oil & grease from fabric",uHi:"तेल ग्रीस हटाना"},
      {p:"Kleanpro-Neutro (Kleanfix)",u:"pH neutralizer — after wash",uHi:"pH न्यूट्रलाइज़र"},
      {p:"Klean Pro Optical Brightener",u:"Fabric brightening — whiter whites",uHi:"कपड़े चमकाना"},
      {p:"Kleanpro Descaler Powder",u:"Washing machine descale",uHi:"वॉशिंग मशीन डीस्केल"},
    ]
  },
  {
    area:"🧴 Hand Hygiene & Germ Control", areaHi:"हाथ स्वच्छता",
    items:[
      {p:"K21 Max Pink Pearl Soap (Kleanfix)",u:"Washroom dispenser — gentle hand wash",uHi:"वॉशरूम — हैंड वॉश"},
      {p:"K22 Gentle Soap (Kleanfix)",u:"Luxury pearlized hand soap",uHi:"लक्ज़री हैंड सोप"},
      {p:"K23 Green Apple Soap (Kleanfix)",u:"pH balanced — mild on skin",uHi:"pH संतुलित — त्वचा हल्का"},
      {p:"Klean Foam (Kleanfix)",u:"Foam hand soap dispenser refill",uHi:"फ़ोम हैंड सोप"},
      {p:"Klean San Sanitizer (Kleanfix)",u:"Alcohol-based hand sanitizer",uHi:"अल्कोहल सैनिटाइज़र"},
      {p:"Klean Rub (Kleanfix)",u:"Alcohol disinfectant — no water needed",uHi:"अल्कोहल कीटाणुनाशक"},
      {p:"Klean Viro (Kleanfix)",u:"Silver ion disinfectant — surfaces",uHi:"सिल्वर आयन — सतह कीटाणुनाशक"},
    ]
  },
  {
    area:"🌿 Lawn & Garden", areaHi:"लॉन व बगीचा",
    items:[
      {p:"NPK 19:19:19 Fertilizer",u:"Monthly balanced feed — all plants",uHi:"मासिक संतुलित खाद"},
      {p:"Urea (46-0-0)",u:"Nitrogen boost — lawn greening",uHi:"नाइट्रोजन — लॉन हरापन"},
      {p:"DAP (18-46-0)",u:"Root development — new plants",uHi:"जड़ विकास — नए पौधे"},
      {p:"SSP (Single Super Phosphate)",u:"Flowering boost",uHi:"फूल बढ़ाना"},
      {p:"Potash (MOP)",u:"Plant strength & disease resistance",uHi:"पौधा मज़बूती"},
      {p:"Neem Oil Spray",u:"Organic pest control — 5ml/1L",uHi:"जैविक कीट — 5ml/1L"},
      {p:"Neem Cake",u:"Soil pest prevention",uHi:"मिट्टी कीट रोकथाम"},
      {p:"2,4-D Weedkiller",u:"Lawn weed removal — 2ml/1L",uHi:"खरपतवार — 2ml/1L"},
      {p:"Fungicide (Mancozeb)",u:"Fungus/disease cure — 2g/1L",uHi:"फफूंद — 2g/1L"},
      {p:"Vermicompost",u:"Organic nutrition — flower beds",uHi:"जैविक पोषण — क्यारी"},
      {p:"Bone Meal",u:"Phosphorus — bloom boost",uHi:"फ़ॉस्फ़ोरस — फूल"},
      {p:"Cow Dung Manure",u:"Soil enrichment — monthly",uHi:"मिट्टी सुधार — मासिक"},
      {p:"Micronutrient Mix",u:"Iron, zinc, manganese spray",uHi:"सूक्ष्म पोषक स्प्रे"},
      {p:"Humic Acid",u:"Root growth stimulator",uHi:"जड़ विकास उत्तेजक"},
    ]
  },
  {
    area:"🚗 Car & Parking", areaHi:"कार व पार्किंग",
    items:[
      {p:"Greno Car Shampoo (Kleanfix)",u:"Vehicle wash — concentrated",uHi:"वाहन धुलाई"},
      {p:"Greno Dashboard Shiner (Kleanfix)",u:"Dashboard, plastic, rubber",uHi:"डैशबोर्ड, प्लास्टिक"},
      {p:"Greno Tyre Polish (Kleanfix)",u:"Tyre shine — spray/sponge",uHi:"टायर चमक"},
      {p:"Pressure Washer Detergent",u:"Parking deep wash — monthly",uHi:"पार्किंग गहरी धुलाई — मासिक"},
      {p:"Oil Stain Remover / TSP",u:"Parking oil stain removal",uHi:"पार्किंग तेल दाग"},
    ]
  },
];

export default function ChemicalGuide({ lang }) {
  const C = useT();
  const L = LANGS[lang];
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("calc");
  const [selectedProp, setSelectedProp] = useState("pp");
  const [openAreas, setOpenAreas] = useState({0:true});

  const spec = PROP_SPECS[selectedProp];
  const chemicals = calcQty(spec);
  const totalLitres = chemicals.filter(c => c.unit === "L").reduce((s, c) => s + parseFloat(c.qty), 0).toFixed(1);
  const totalKg = chemicals.filter(c => c.unit === "kg").reduce((s, c) => s + parseFloat(c.qty), 0).toFixed(0);

  return (
    <div style={{ fontFamily: F.b }}>
      <h1 style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.maroon, margin: "0 0 4px" }}>
        🧪 {lang === "hi" ? "केमिकल गाइड" : "Chemical Guide"}
      </h1>
      <p style={{ fontSize:10, color: C.tl, margin: "0 0 12px" }}>
        Kleanfix Industries · kleanfix.com · +91 98189 98806
      </p>

      {/* ── Tab Toggle ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 16, background: C.maroonSoft, borderRadius: 10, padding: 3, width: "fit-content" }}>
        {[
          { id: "calc", label: lang === "hi" ? "🧮 कैलकुलेटर" : "🧮 Calculator" },
          { id: "guide", label: lang === "hi" ? "📖 प्रोडक्ट गाइड" : "📖 Product Guide" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: F.b, fontSize:12, fontWeight: 700,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "calc" && (
        <div>
          {/* ── Property Selector ── */}
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14, marginBottom: 14 }}>
            <div style={{ fontFamily: F.d, fontSize:13, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
              🏛️ {L.selectPropertyCalc}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
              {Object.entries(PROP_SPECS).map(([k, s]) => (
                <button key={k} onClick={() => setSelectedProp(k)} style={{
                  padding: "10px 6px", borderRadius: 10, cursor: "pointer", fontFamily: F.b,
                  border: `2px solid ${selectedProp === k ? C.maroon : C.border}`,
                  background: selectedProp === k ? C.maroonSoft : C.white,
                  color: selectedProp === k ? C.maroon : C.text
                }}>
                  <div style={{ fontSize:18, marginBottom: 2 }}>{PROPS[k]?.icon}</div>
                  <div style={{ fontSize:10, fontWeight: 700 }}>{s.label}</div>
                </button>
              ))}
            </div>

            {/* Specs summary */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 6 }}>
              {[
                { label: "Banquet", val: `${spec.banquet.toLocaleString()} sqft`, icon: "🏛️" },
                { label: "Lawn", val: `${spec.lawn.toLocaleString()} sqft`, icon: "🌿" },
                { label: "Washrooms", val: spec.washrooms, icon: "🚽" },
                { label: "Glass/Hall", val: spec.glass > 0 ? `${spec.glass.toLocaleString()} sqft` : "N/A", icon: "🪟" },
              ].map(s => (
                <div key={s.label} style={{ padding: 8, background: C.bg, borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize:16, marginBottom: 2 }}>{s.icon}</div>
                  <div style={{ fontSize:11, fontWeight: 700, color: C.text }}>{s.val}</div>
                  <div style={{ fontSize:9, color: C.tl }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Monthly totals ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: C.bBg, borderRadius: 12, padding: "10px 14px", border: `1px solid ${C.blue}30` }}>
              <div style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.blue }}>{totalLitres} L</div>
              <div style={{ fontSize:10, color: C.blue, fontWeight: 600 }}>Total Liquid Chemicals / Month</div>
            </div>
            <div style={{ background: C.gBg, borderRadius: 12, padding: "10px 14px", border: `1px solid ${C.green}30` }}>
              <div style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.green }}>{totalKg} kg</div>
              <div style={{ fontSize:10, color: C.green, fontWeight: 600 }}>Total Dry / Solid Chemicals / Month</div>
            </div>
          </div>

          {/* ── Chemical breakdown ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {chemicals.map((c, i) => (
              <div key={i} style={{
                background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
                borderLeft: `4px solid ${c.color}`, overflow: "hidden"
              }}>
                <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: c.color + "20", color: c.color, fontSize:9, fontWeight: 700 }}>{c.code}</span>
                      <span style={{ fontSize:11, fontWeight: 700 }}>{c.name}</span>
                    </div>
                    <div style={{ fontSize:9, color: C.tl, marginBottom: 4 }}>{c.area}</div>
                    <div style={{ fontSize:9, color: C.tl, fontStyle: "italic" }}>📐 {c.formula}</div>
                    <div style={{ fontSize:9, color: C.tl, marginTop: 2 }}>💧 {c.note}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: c.color }}>{c.qty}</div>
                    <div style={{ fontSize:9, color: C.tl, fontWeight: 600 }}>{c.unit}/month</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "guide" && (
        <div>
          <div style={{fontSize:10,color:C.tl,fontFamily:F.b,marginBottom:12}}>
            {lang==="hi"
              ? "Kleanfix, Diversey और अन्य ब्रांड · kleanfix.com · +91 98189 98806"
              : "Kleanfix, Diversey & other brands · kleanfix.com · +91 98189 98806"}
          </div>
          {CHEM_DATA.map((section, si) => {
            const isOpen = openAreas[si] !== false;
            const color = AREA_COLORS[si % AREA_COLORS.length];
            return (
              <div key={si} style={{marginBottom:8}}>
                <button
                  onClick={() => setOpenAreas(p => ({...p, [si]: !isOpen}))}
                  style={{width:"100%",padding:"10px 14px",background:C.white,
                    border:`1px solid ${C.border}`,borderLeft:`4px solid ${color}`,
                    borderRadius:isOpen?"10px 10px 0 0":"10px",cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    fontFamily:F.b,fontSize:13,fontWeight:700,color,textAlign:"left"
                  }}>
                  <span>{lang==="hi" ? section.areaHi : section.area}</span>
                  <span style={{fontSize:10,color:C.tl,fontWeight:400}}>
                    {isOpen ? "▲" : "▼"} {section.items.length} {lang==="hi"?"उत्पाद":"products"}
                  </span>
                </button>
                {isOpen && (
                  <div style={{background:C.white,border:`1px solid ${C.border}`,
                    borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
                    {section.items.map((item, ii) => (
                      <div key={ii} style={{
                        padding:"9px 14px",
                        borderBottom: ii < section.items.length-1 ? `1px solid ${C.border}` : "none",
                        display:"flex",gap:10,alignItems:"flex-start"
                      }}>
                        <div style={{width:3,alignSelf:"stretch",background:color,borderRadius:2,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.text}}>{item.p}</div>
                          <div style={{fontSize:10,color:C.tl,marginTop:2}}>
                            💧 {lang==="hi" ? item.uHi : item.u}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
