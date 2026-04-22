import { useState } from "react";
import { C, F, LANGS, PROPS } from "./constants.js";

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

const KLEANFIX_FULL = [
  { code: "K1", name: "Bathroom Sanitizer", use: "WC tiles, tubs, washrooms", dilution: "20–50ml/1L" },
  { code: "K2", name: "Hard Surface Cleaner", use: "Floors, walls, counters", dilution: "20ml/1L" },
  { code: "K3", name: "Glass Cleaner", use: "Glass, mirrors, windows", dilution: "20–50ml/1L" },
  { code: "K4", name: "Wood Maintainer", use: "Wooden furniture, floors", dilution: "Ready-to-use" },
  { code: "K5", name: "Air Freshener", use: "Washrooms, lobbies", dilution: "Ready-to-use" },
  { code: "K6", name: "Toilet Bowl Cleaner", use: "Toilet bowls, urinals", dilution: "Ready-to-use" },
  { code: "K7", name: "S.S. Polish", use: "Stainless steel fixtures", dilution: "Ready-to-use" },
  { code: "K8", name: "Drain Opener", use: "Clogged drains", dilution: "Pour neat" },
  { code: "K9", name: "Mould Remover", use: "Wall mould, grout", dilution: "Ready-to-use" },
  { code: "K10", name: "Odour Neutralizer", use: "General deodorising", dilution: "10ml/1L" },
  { code: "K20", name: "Floor Stripper", use: "Deep clean — strip wax", dilution: "10–20ml warm water" },
  { code: "K101", name: "Carpet Shampoo", use: "Carpets, sofas, upholstery", dilution: "50–100ml/1L" },
  { code: "K102", name: "All-in-One Cleaner", use: "Floors, walls, sinks", dilution: "20ml/1L" },
  { code: "K103", name: "Heavy Duty Degreaser", use: "Kitchen, grease, engines", dilution: "Neat or 1:5" },
];

export default function ChemicalGuide({ lang }) {
  const L = LANGS[lang];
  const [tab, setTab] = useState("calc");
  const [selectedProp, setSelectedProp] = useState("pp");

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {KLEANFIX_FULL.map((p, i) => (
              <div key={i} style={{
                background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
                padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start"
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: C.maroon,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: C.white, fontFamily: F.b, fontSize:9, fontWeight: 700,
                  flexShrink: 0, textAlign: "center", padding: 2
                }}>{p.code}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize:10, color: C.tl, marginTop: 2 }}>📋 {p.use}</div>
                  <div style={{ fontSize:9, color: C.blue, marginTop: 2 }}>💧 {p.dilution}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
