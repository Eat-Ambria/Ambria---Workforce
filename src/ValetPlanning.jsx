import { useState } from "react";
import { C, F } from "./constants.js";

// ─── VALET ALLOCATION DATA ──────────────────────────────────────────────────
// Each venue: array of { pax, keyMan, driver, guard, rider, gunMan, bouncer }
const VALET_DATA = {
  pp: [
    { pax:100,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:4,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:7,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:10, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:12, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:14, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:16, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:18, guard:4, rider:2, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:20, guard:4, rider:2, gunMan:0, bouncer:0 },
  ],
  mk: [
    { pax:100,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:4,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:6,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:8,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:11, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:13, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:15, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:17, guard:4, rider:2, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:19, guard:4, rider:2, gunMan:0, bouncer:0 },
  ],
  ex: [
    { pax:100,  keyMan:1, driver:2,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:6,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:8,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:10, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:12, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:14, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:17, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:19, guard:3, rider:1, gunMan:0, bouncer:0 },
  ],
  rs: [
    { pax:100, keyMan:1, driver:5, guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:150, keyMan:1, driver:6, guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200, keyMan:1, driver:6, guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:215, keyMan:1, driver:7, guard:1, rider:0, gunMan:0, bouncer:0 },
  ],
};

const VENUE_CFG = {
  pp: { name:"Pushpanjali", sn:"PP", icon:"🏛️", min:100, max:1000, step:50 },
  mk: { name:"Manaktala",   sn:"MK", icon:"✨", min:100, max:1000, step:50 },
  ex: { name:"Exotica",     sn:"EX", icon:"🌴", min:100, max:1000, step:50 },
  rs: { name:"Restro",      sn:"RS", icon:"🍽️", min:100, max:215,  step:25 },
};

const ROLE_META = {
  keyMan:  { label:"Key Man",  labelHi:"की मैन",   icon:"🔑" },
  driver:  { label:"Driver",   labelHi:"ड्राइवर",  icon:"🚗" },
  guard:   { label:"Guard",    labelHi:"गार्ड",    icon:"🛡️" },
  rider:   { label:"Rider",    labelHi:"राइडर",    icon:"🏍️" },
  gunMan:  { label:"Gun Man",  labelHi:"गन मैन",   icon:"🔫" },
  bouncer: { label:"Bouncer",  labelHi:"बाउंसर",  icon:"💪" },
};

const LABELS = {
  en: {
    title:"Valet Planning",
    venue:"Venue", pax:"Expected Guests (Pax)",
    totalStaff:"Total Valet Staff", staffBreakdown:"Staff Breakdown",
    carEstimate:"Car Estimate",
    carsFor4:"4 per car (family)", carsFor3:"3 per car (avg)", carsFor2:"2 per car (couple/VIP)",
    estimatedCars:"Estimated Cars",
    costEstimator:"Cost Estimator", toggleCost:"Show Cost Estimate",
    hideCost:"Hide Cost Estimate",
    ratePerEvent:"Rate (₹/event)",
    totalCost:"Estimated Total Cost",
    refTable:"Full Reference Table", paxRow:"Pax",
    guests:"guests", cars:"cars", total:"Total",
    interpolated:"(interpolated)", exact:"(exact)",
    note:"Staff counts rounded up — always better to have more than less.",
    noteHi:"स्टाफ की संख्या ऊपर की ओर गोल की गई है — ज़्यादा बेहतर है कम से।",
  },
  hi: {
    title:"वैलेट प्लानिंग",
    venue:"वेन्यू", pax:"अपेक्षित मेहमान (पैक्स)",
    totalStaff:"कुल वैलेट स्टाफ", staffBreakdown:"स्टाफ विवरण",
    carEstimate:"कार अनुमान",
    carsFor4:"4 प्रति कार (परिवार)", carsFor3:"3 प्रति कार (औसत)", carsFor2:"2 प्रति कार (कपल/VIP)",
    estimatedCars:"अनुमानित कारें",
    costEstimator:"लागत अनुमान", toggleCost:"लागत अनुमान दिखाएं",
    hideCost:"लागत छुपाएं",
    ratePerEvent:"रेट (₹/इवेंट)",
    totalCost:"कुल अनुमानित लागत",
    refTable:"पूरी संदर्भ तालिका", paxRow:"पैक्स",
    guests:"मेहमान", cars:"कारें", total:"कुल",
    interpolated:"(अनुमानित)", exact:"(सटीक)",
    note:"Staff counts rounded up — always better to have more than less.",
    noteHi:"स्टाफ की संख्या ऊपर की ओर गोल की गई है — ज़्यादा बेहतर है कम से।",
  },
};

// ─── LINEAR INTERPOLATION HELPER ─────────────────────────────────────────────
function interpolate(data, pax) {
  // Clamp to data range
  const minPt = data[0];
  const maxPt = data[data.length - 1];
  if (pax <= minPt.pax) return { ...minPt, isExact: true };
  if (pax >= maxPt.pax) return { ...maxPt, isExact: true };

  // Find exact match
  const exact = data.find(d => d.pax === pax);
  if (exact) return { ...exact, isExact: true };

  // Find surrounding points
  let lo = data[0], hi = data[data.length - 1];
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i].pax <= pax && data[i + 1].pax >= pax) {
      lo = data[i]; hi = data[i + 1]; break;
    }
  }

  const t = (pax - lo.pax) / (hi.pax - lo.pax);
  const roles = ["keyMan","driver","guard","rider","gunMan","bouncer"];
  const result = { pax, isExact: false };
  roles.forEach(r => {
    result[r] = Math.ceil(lo[r] + t * (hi[r] - lo[r]));
  });
  return result;
}

// ─── ROLE CARD ────────────────────────────────────────────────────────────────
function RoleCard({ roleKey, count, lang }) {
  const meta = ROLE_META[roleKey];
  const label = lang === "hi" ? meta.labelHi : meta.label;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10,
      padding:"12px 14px", background:C.white, borderRadius:10,
      border:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width:38, height:38, borderRadius:10,
        background:C.maroonSoft, display:"flex", alignItems:"center",
        justifyContent:"center", fontSize:18, flexShrink:0,
      }}>{meta.icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, color:C.tl, fontFamily:F.b, fontWeight:500 }}>{label}</div>
        <div style={{ fontSize:22, fontWeight:700, fontFamily:F.d, color:C.maroon, lineHeight:1.1 }}>{count}</div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ValetPlanning({ user, lang }) {
  const L = LABELS[lang] || LABELS.en;

  // Determine default venue from user's property
  const defaultVenue = (() => {
    const p = user?.prop || user?.property || "pp";
    return VENUE_CFG[p] ? p : "pp";
  })();

  const [venue, setVenue] = useState(defaultVenue);
  const [pax, setPax] = useState(300);
  const [showCost, setShowCost] = useState(false);
  const [rates, setRates] = useState({ keyMan:1500, driver:1200, guard:1000, rider:800, gunMan:2000, bouncer:1500 });

  const cfg = VENUE_CFG[venue];
  const data = VALET_DATA[venue];

  // Clamp pax to venue range whenever venue changes
  const clampedPax = Math.min(Math.max(pax, cfg.min), cfg.max);
  const allocation = interpolate(data, clampedPax);
  const roles = ["keyMan","driver","guard","rider","gunMan","bouncer"];
  const activeRoles = roles.filter(r => allocation[r] > 0);
  const totalStaff = roles.reduce((s, r) => s + (allocation[r] || 0), 0);

  const cars4 = Math.ceil(clampedPax / 4);
  const cars3 = Math.ceil(clampedPax / 3);
  const cars2 = Math.ceil(clampedPax / 2);

  const totalCost = roles.reduce((s, r) => s + (allocation[r] || 0) * (rates[r] || 0), 0);

  // Slider gradient fill
  const pct = ((clampedPax - cfg.min) / (cfg.max - cfg.min)) * 100;

  return (
    <div style={{ maxWidth:680, margin:"0 auto" }}>
      {/* ── Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontFamily:F.d, fontSize:24, fontWeight:700, color:C.maroon, margin:"0 0 4px" }}>
          🚗 {L.title}
        </h1>
        <div style={{ fontSize:11, color:C.tl, fontFamily:F.b }}>
          {lang==="hi" ? L.noteHi : L.note}
        </div>
      </div>

      {/* ── Venue Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {Object.entries(VENUE_CFG).map(([k, v]) => {
          const active = venue === k;
          return (
            <button key={k} onClick={() => { setVenue(k); setPax(v.min + Math.round((v.max - v.min) * 0.3 / v.step) * v.step); }}
              style={{
                display:"flex", alignItems:"center", gap:5,
                padding:"8px 14px", borderRadius:10,
                border: active ? `2px solid ${C.maroon}` : `1px solid ${C.border}`,
                background: active ? C.maroonSoft : C.white,
                cursor:"pointer", fontFamily:F.b, fontSize:12,
                fontWeight: active ? 700 : 400,
                color: active ? C.maroon : C.tl,
                boxShadow: active ? `0 2px 8px ${C.maroon}22` : "none",
              }}>
              <span style={{ fontSize:15 }}>{v.icon}</span>
              <span>{v.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── PAX SLIDER */}
      <div style={{
        background:C.white, borderRadius:14, padding:"18px 18px 20px",
        border:`1px solid ${C.border}`, marginBottom:16,
        boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.tl, fontFamily:F.b }}>{L.pax}</div>
          <div style={{
            fontSize:32, fontWeight:700, fontFamily:F.d, color:C.maroon,
            lineHeight:1, display:"flex", alignItems:"baseline", gap:4,
          }}>
            {clampedPax}
            <span style={{ fontSize:12, color:C.tl, fontWeight:400 }}>{L.guests}</span>
          </div>
        </div>

        {/* Custom styled range slider */}
        <div style={{ position:"relative", height:6, borderRadius:3, background:C.border, marginBottom:8 }}>
          <div style={{
            position:"absolute", left:0, top:0, height:"100%",
            width:`${pct}%`, borderRadius:3,
            background:`linear-gradient(90deg,${C.maroon},${C.maroonLight})`,
          }}/>
        </div>
        <input type="range"
          min={cfg.min} max={cfg.max} step={cfg.step}
          value={clampedPax}
          onChange={e => setPax(Number(e.target.value))}
          style={{
            width:"100%", margin:"0 0 6px",
            WebkitAppearance:"none", appearance:"none",
            height:20, background:"transparent", cursor:"pointer", outline:"none",
          }}
        />
        <style>{`
          input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:${C.maroon};cursor:pointer;box-shadow:0 2px 6px ${C.maroon}55;margin-top:-9px;}
          input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:${C.maroon};cursor:pointer;border:none;box-shadow:0 2px 6px ${C.maroon}55;}
          input[type=range]::-webkit-slider-runnable-track{height:4px;background:transparent;}
          input[type=range]::-moz-range-track{height:4px;background:transparent;}
        `}</style>

        {/* Tick marks */}
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
          {data.map(d => (
            <div key={d.pax} style={{
              fontSize:8, color: d.pax === clampedPax ? C.maroon : C.tl,
              fontWeight: d.pax === clampedPax ? 700 : 400, fontFamily:F.b,
            }}>{d.pax >= 1000 ? "1K" : d.pax}</div>
          ))}
        </div>

        {/* Quick-pick PAX buttons */}
        <div style={{ display:"flex", gap:4, marginTop:12, flexWrap:"wrap" }}>
          {data.map(d => (
            <button key={d.pax} onClick={() => setPax(d.pax)}
              style={{
                padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer",
                fontFamily:F.b, fontSize:10, fontWeight:600,
                background: clampedPax === d.pax ? C.maroon : C.bg,
                color: clampedPax === d.pax ? C.white : C.tl,
              }}>{d.pax}</button>
          ))}
        </div>
      </div>

      {/* ── RESULTS CARD */}
      <div style={{
        background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,
        borderRadius:14, padding:"18px 18px 14px",
        marginBottom:16, boxShadow:`0 4px 16px ${C.maroon}44`,
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontFamily:F.b, fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>
              {cfg.icon} {cfg.name} · {clampedPax} {L.guests}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontFamily:F.b, marginTop:2 }}>
              {allocation.isExact ? L.exact : L.interpolated}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontFamily:F.b }}>{L.totalStaff}</div>
            <div style={{ fontSize:52, fontWeight:700, fontFamily:F.d, color:"#fff", lineHeight:1 }}>{totalStaff}</div>
          </div>
        </div>

        {/* Staff role pills */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {activeRoles.map(r => (
            <div key={r} style={{
              display:"flex", alignItems:"center", gap:4,
              padding:"5px 10px", borderRadius:8,
              background:"rgba(255,255,255,0.15)",
              backdropFilter:"blur(4px)",
            }}>
              <span style={{ fontSize:13 }}>{ROLE_META[r].icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", fontFamily:F.b }}>
                {allocation[r]} {lang==="hi" ? ROLE_META[r].labelHi : ROLE_META[r].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STAFF BREAKDOWN CARDS */}
      {activeRoles.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.tl, fontFamily:F.b, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
            {L.staffBreakdown}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
            {activeRoles.map(r => (
              <RoleCard key={r} roleKey={r} count={allocation[r]} lang={lang} />
            ))}
          </div>
        </div>
      )}

      {/* ── CAR ESTIMATE */}
      <div style={{
        background:C.white, borderRadius:14, padding:16,
        border:`1px solid ${C.border}`, marginBottom:16,
        boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.tl, fontFamily:F.b, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>
          🚘 {L.carEstimate}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[
            { gpcar:4, cars:cars4, label:L.carsFor4, bg:"#EBF5F0", c:C.green },
            { gpcar:3, cars:cars3, label:L.carsFor3, bg:C.bBg, c:C.blue },
            { gpcar:2, cars:cars2, label:L.carsFor2, bg:C.maroonSoft, c:C.maroon },
          ].map(({ gpcar, cars, label, bg, c }) => (
            <div key={gpcar} style={{ textAlign:"center", padding:"12px 6px", background:bg, borderRadius:10 }}>
              <div style={{ fontSize:28, fontWeight:700, fontFamily:F.d, color:c, lineHeight:1 }}>{cars}</div>
              <div style={{ fontSize:9, color:c, fontFamily:F.b, fontWeight:600, marginTop:2 }}>{L.cars}</div>
              <div style={{ fontSize:9, color:C.tl, fontFamily:F.b, marginTop:4, lineHeight:1.3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── COST ESTIMATOR */}
      <div style={{
        background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
        marginBottom:16, overflow:"hidden",
        boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
      }}>
        <button onClick={() => setShowCost(!showCost)}
          style={{
            width:"100%", padding:"14px 16px", border:"none", background:"transparent",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
            fontFamily:F.b, fontSize:13, fontWeight:600, color:C.maroon,
          }}>
          <span>💰 {showCost ? L.hideCost : L.toggleCost}</span>
          <span style={{ fontSize:11, color:C.tl }}>{showCost ? "▲" : "▼"}</span>
        </button>

        {showCost && (
          <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${C.border}` }}>
            <div style={{ paddingTop:12, display:"flex", flexDirection:"column", gap:8 }}>
              {activeRoles.map(r => (
                <div key={r} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14 }}>{ROLE_META[r].icon}</span>
                  <span style={{ flex:1, fontSize:12, fontFamily:F.b, fontWeight:500 }}>
                    {lang==="hi" ? ROLE_META[r].labelHi : ROLE_META[r].label}
                    <span style={{ color:C.tl, fontWeight:400 }}> × {allocation[r]}</span>
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:11, color:C.tl }}>₹</span>
                    <input type="number" min={0} step={100}
                      value={rates[r]}
                      onChange={e => setRates(p => ({ ...p, [r]: Number(e.target.value) }))}
                      style={{
                        width:80, padding:"5px 8px", borderRadius:7,
                        border:`1px solid ${C.border}`, fontFamily:F.b,
                        fontSize:12, textAlign:"right", outline:"none",
                      }}
                    />
                  </div>
                  <div style={{ width:70, textAlign:"right", fontSize:12, fontWeight:600, color:C.maroon, fontFamily:F.b }}>
                    ₹{(allocation[r] * rates[r]).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop:12, padding:"12px 14px", borderRadius:10,
              background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#fff", fontFamily:F.b }}>
                💰 {L.totalCost}
              </span>
              <span style={{ fontSize:20, fontWeight:700, fontFamily:F.d, color:"#fff" }}>
                ₹{totalCost.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── QUICK REFERENCE TABLE */}
      <div style={{
        background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
        marginBottom:24, overflow:"hidden",
        boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          padding:"12px 16px", borderBottom:`1px solid ${C.border}`,
          fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon,
          display:"flex", alignItems:"center", gap:6,
        }}>
          📋 {L.refTable} — {cfg.icon} {cfg.name}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:F.b, fontSize:11 }}>
            <thead>
              <tr style={{ background:C.maroonSoft }}>
                <th style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:C.maroon, whiteSpace:"nowrap" }}>{L.paxRow}</th>
                {["keyMan","driver","guard","rider","gunMan","bouncer"].map(r => (
                  <th key={r} style={{ padding:"8px 8px", textAlign:"center", fontWeight:700, color:C.maroon, whiteSpace:"nowrap" }}>
                    {ROLE_META[r].icon}
                    <div style={{ fontSize:9, fontWeight:600, color:C.tl }}>
                      {lang==="hi" ? ROLE_META[r].labelHi : ROLE_META[r].label}
                    </div>
                  </th>
                ))}
                <th style={{ padding:"8px 8px", textAlign:"center", fontWeight:700, color:C.maroon }}>{L.total}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => {
                const rowTotal = roles.reduce((s, r) => s + d[r], 0);
                const isActive = d.pax === clampedPax;
                return (
                  <tr key={d.pax}
                    onClick={() => setPax(d.pax)}
                    style={{
                      background: isActive ? C.maroonSoft : i % 2 === 0 ? C.white : C.bg,
                      cursor:"pointer",
                      transition:"background 0.1s",
                    }}>
                    <td style={{ padding:"8px 10px", fontWeight: isActive ? 700 : 500, color: isActive ? C.maroon : C.text }}>
                      {d.pax}
                    </td>
                    {roles.map(r => (
                      <td key={r} style={{ padding:"8px 8px", textAlign:"center", color: d[r]>0 ? C.text : C.border, fontWeight: d[r]>0 ? 600 : 400 }}>
                        {d[r] > 0 ? d[r] : "—"}
                      </td>
                    ))}
                    <td style={{ padding:"8px 8px", textAlign:"center", fontWeight:700, color:C.maroon }}>{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"8px 12px", fontSize:10, color:C.tl, fontFamily:F.b, borderTop:`1px solid ${C.border}` }}>
          👆 {lang==="hi" ? "किसी पंक्ति पर टैप करके पैक्स सेट करें" : "Tap any row to jump to that pax"}
        </div>
      </div>
    </div>
  );
}
