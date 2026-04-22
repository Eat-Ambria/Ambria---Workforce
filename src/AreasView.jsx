import { useState } from "react";
import { C, F, LANGS } from "./constants.js";

// ── Area type → gradient & icon ─────────────────────────────────────────────
const TYPE = {
  hall:    { bg:"linear-gradient(135deg,#7B1E2F,#A0344A)", icon:"🏛️" },
  lawn:    { bg:"linear-gradient(135deg,#16A34A,#4ADE80)", icon:"🌿" },
  villa:   { bg:"linear-gradient(135deg,#D97706,#F59E0B)", icon:"🏠" },
  parking: { bg:"linear-gradient(135deg,#4B5563,#9CA3AF)", icon:"🅿️" },
  wash:    { bg:"linear-gradient(135deg,#2563EB,#60A5FA)", icon:"🚿" },
  office:  { bg:"linear-gradient(135deg,#7C3AED,#A78BFA)", icon:"🏢" },
  food:    { bg:"linear-gradient(135deg,#B45309,#D97706)", icon:"🍽️" },
  neutral: { bg:"linear-gradient(135deg,#6B7280,#9CA3AF)", icon:"🚪" },
};

// ── Map area ID → type ───────────────────────────────────────────────────────
const AREA_TYPE = {
  bq:"hall", ag:"hall", vg:"hall", eg:"hall", ao:"hall", b1:"hall", gl:"hall", hn:"hall",
  lw:"lawn", al:"lawn", vl2:"lawn", el:"lawn", gd:"lawn",
  pk:"parking", dr:"parking", wk:"parking",
  vw:"wash", gw:"wash", wc:"wash", vp:"wash",
  vl:"villa",
  of:"office",
  re:"food", ca:"food", ki:"food", rt:"neutral",
  en:"neutral",
};

// ── Block type colours for venue map ─────────────────────────────────────────
const MAP_COLORS = {
  hall:    { bg:"#7B1E2F15", border:"#7B1E2F", text:"#7B1E2F" },
  lawn:    { bg:"#16A34A15", border:"#16A34A", text:"#166534" },
  parking: { bg:"#6B728015", border:"#6B7280", text:"#374151" },
  villa:   { bg:"#D9770615", border:"#D97706", text:"#92400E" },
  wash:    { bg:"#2563EB15", border:"#2563EB", text:"#1D4ED8" },
  office:  { bg:"#7C3AED15", border:"#7C3AED", text:"#6D28D9" },
  food:    { bg:"#B4530915", border:"#B45309", text:"#92400E" },
  neutral: { bg:"#9CA3AF15", border:"#9CA3AF", text:"#6B7280" },
};

// ── Per-property venue layout definitions ────────────────────────────────────
const VENUE_LAYOUTS = {
  pp: {
    name: "Pushpanjali · 3 Acres",
    gridCols: "1fr 1.8fr",
    gridRows: "auto auto auto auto",
    blocks: [
      { areaId:"en",  label:"Entrance Gate",      sub:"",              type:"neutral", col:"1",   row:"1" },
      { areaId:"pk",  label:"🅿️ Parking",         sub:"125+ cars",     type:"parking", col:"2",   row:"1" },
      { areaId:"bq",  label:"Banquet Hall",        sub:"14,000 sqft",   type:"hall",    col:"1",   row:"2 / span 2" },
      { areaId:"lw",  label:"Main Lawn",           sub:"40,000 sqft",   type:"lawn",    col:"2",   row:"2 / span 2" },
      { areaId:"vl",  label:"Villa",               sub:"4 Rooms",       type:"villa",   col:"1",   row:"4" },
      { areaId:"of",  label:"Offices",             sub:"5 Units",       type:"office",  col:"2",   row:"4" },
      { areaId:"vw",  label:"Washrooms",           sub:"7 M+F",         type:"wash",    col:"1 / span 2", row:"5" },
    ],
  },
  ex: {
    name: "Exotica · 4 Acres",
    gridCols: "1fr 1.6fr",
    gridRows: "auto auto auto auto auto",
    blocks: [
      { areaId:"en",  label:"Entrance",            sub:"",              type:"neutral", col:"1",   row:"1" },
      { areaId:"pk",  label:"🅿️ Parking",         sub:"300–350 cars",  type:"parking", col:"2",   row:"1" },
      { areaId:"ag",  label:"Aura Hall",           sub:"8,500 sqft",    type:"hall",    col:"1",   row:"2" },
      { areaId:"al",  label:"Aura Lawn",           sub:"27,000 sqft",   type:"lawn",    col:"2",   row:"2" },
      { areaId:"vg",  label:"Valencia Hall",       sub:"12,000 sqft",   type:"hall",    col:"1",   row:"3" },
      { areaId:"vl2", label:"Valencia Lawn",       sub:"8,000 sqft",    type:"lawn",    col:"2",   row:"3" },
      { areaId:"vp",  label:"Poolside",            sub:"2,000 sqft",    type:"wash",    col:"1",   row:"4" },
      { areaId:"wc",  label:"Washrooms",           sub:"10 washrooms",  type:"wash",    col:"2",   row:"4" },
    ],
  },
  mk: {
    name: "Manaktala · 3 Acres",
    gridCols: "1fr 1.8fr",
    gridRows: "auto auto auto auto",
    blocks: [
      { areaId:"en",  label:"Entrance",            sub:"",              type:"neutral", col:"1",   row:"1" },
      { areaId:"pk",  label:"🅿️ Parking",         sub:"250+ cars",     type:"parking", col:"2",   row:"1" },
      { areaId:"eg",  label:"Emerald Hall",        sub:"10,000 sqft",   type:"hall",    col:"1",   row:"2" },
      { areaId:"el",  label:"Emerald Lawn",        sub:"27,000 sqft",   type:"lawn",    col:"2",   row:"2" },
      { areaId:"ao",  label:"Alstonia Hall",       sub:"16,000 sqft",   type:"hall",    col:"1",   row:"3" },
      { areaId:"hn",  label:"Hangar",              sub:"8,000 sqft",    type:"hall",    col:"2",   row:"3" },
      { areaId:"wc",  label:"Washrooms",           sub:"8 washrooms",   type:"wash",    col:"1 / span 2", row:"4" },
    ],
  },
  rs: {
    name: "Restro · 0.75 Acre",
    gridCols: "1.4fr 1fr",
    gridRows: "auto auto auto",
    blocks: [
      { areaId:"en",  label:"Entrance",            sub:"",              type:"neutral", col:"1",   row:"1" },
      { areaId:"pk",  label:"🅿️ Parking",         sub:"100+ cars",     type:"parking", col:"2",   row:"1" },
      { areaId:"gl",  label:"Glasshouse",          sub:"8,000 sqft",    type:"hall",    col:"1 / span 2", row:"2" },
      { areaId:"lw",  label:"Lawn",                sub:"5,000 sqft",    type:"lawn",    col:"1",   row:"3" },
      { areaId:"wc",  label:"Washrooms",           sub:"4 washrooms",   type:"wash",    col:"2",   row:"3" },
    ],
  },
};

// ── Venue Map Block ──────────────────────────────────────────────────────────
function MapBlock({ block, stat, onClick }) {
  const [hover, setHover] = useState(false);
  const mc = MAP_COLORS[block.type] || MAP_COLORS.neutral;
  const allDone = stat?.allDone;
  const hasIssue = stat?.hasIssue;
  const pc = stat?.pc ?? 0;
  const total = stat?.at?.length ?? 0;
  const done = stat?.ad ?? 0;

  const borderColor = allDone ? C.green : hasIssue ? C.red : mc.border;
  const shadowStyle = allDone
    ? "0 0 0 2px #2E8B5740, 0 2px 10px #2E8B5720"
    : hasIssue
    ? "0 0 0 2px #C0392B40, 0 2px 10px #C0392B20"
    : "none";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: mc.bg,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        padding: "8px 10px",
        cursor: "pointer",
        position: "relative",
        minHeight: 58,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        transition: "box-shadow 0.2s, border-color 0.2s",
        boxShadow: hover
          ? `0 0 0 3px ${mc.border}40, 0 4px 12px rgba(0,0,0,0.12)`
          : shadowStyle,
        animation: hasIssue ? "pulse-red 2s infinite" : "none",
      }}
    >
      <div style={{ fontSize:10, fontWeight:700, color: mc.text, lineHeight:1.3 }}>
        {block.label}
      </div>
      {block.sub && (
        <div style={{ fontSize:9, color: mc.text, opacity:0.75, marginTop:2 }}>
          {block.sub}
        </div>
      )}
      {allDone && (
        <div style={{
          position:"absolute", top:4, right:6,
          fontSize:9, color: C.green, fontWeight:700,
        }}>✅</div>
      )}
      {hasIssue && (
        <div style={{
          position:"absolute", top:4, right:6,
          fontSize:9, color: C.red, fontWeight:700,
        }}>⚠️</div>
      )}
      {hover && total > 0 && (
        <div style={{
          position:"absolute", bottom:"110%", left:"50%",
          transform:"translateX(-50%)",
          background:"rgba(0,0,0,0.8)", color:"#fff",
          borderRadius:7, padding:"5px 9px",
          fontSize:9, fontWeight:600,
          whiteSpace:"nowrap", zIndex:10,
          pointerEvents:"none",
        }}>
          {done}/{total} tasks ({pc}%)
          {allDone ? " · ✅ All done" : hasIssue ? " · ⚠️ Issues" : ""}
        </div>
      )}
    </div>
  );
}

// ── Venue Map ────────────────────────────────────────────────────────────────
function VenueMap({ prop, areaStats, onBlockClick }) {
  const layout = VENUE_LAYOUTS[prop.id];
  if (!layout) return null;

  const statsMap = {};
  areaStats.forEach(s => { statsMap[s.a.id] = s; });

  return (
    <div style={{
      background: C.white,
      borderRadius: 14,
      border: `2px dashed ${C.border}`,
      padding: 12,
      marginBottom: 14,
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      <div style={{
        fontSize:9, fontWeight:700, color:C.tl, marginBottom:10,
        textTransform:"uppercase", letterSpacing:"0.8px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
      }}>
        <span>📐 {layout.name}</span>
        <span style={{ fontSize:9, color:C.tl, fontWeight:400 }}>
          Click a block to jump to its SOPs
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: layout.gridCols,
        gap: 8,
        minWidth: 340,
      }}>
        {layout.blocks.map(block => (
          <div
            key={block.areaId}
            style={{
              gridColumn: block.col,
              gridRow: block.row,
            }}
          >
            <MapBlock
              block={block}
              stat={statsMap[block.areaId]}
              onClick={() => onBlockClick(block.areaId)}
            />
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{
        display:"flex", gap:8, flexWrap:"wrap", marginTop:10,
        paddingTop:8, borderTop:`1px solid ${C.border}`,
      }}>
        {[
          { label:"Hall/Banquet", type:"hall" },
          { label:"Lawn",         type:"lawn" },
          { label:"Parking",      type:"parking" },
          { label:"Washroom",     type:"wash" },
          { label:"Villa/Room",   type:"villa" },
          { label:"Office",       type:"office" },
        ].map(l => {
          const mc = MAP_COLORS[l.type];
          return (
            <div key={l.type} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{
                width:10, height:10, borderRadius:3,
                background:mc.bg, border:`1.5px solid ${mc.border}`,
              }}/>
              <span style={{ fontSize:9, color:C.tl }}>{l.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function AreasView({ tasks, prop, lang }) {
  const L = LANGS[lang];
  const [viewMode, setViewMode] = useState("map");

  const areas = prop?.areas || [];

  const areaStats = areas.map(a => {
    const at = tasks.filter(t => t.area === a.id);
    const ad = at.filter(t => t.status === "completed").length;
    const ai = at.filter(t => t.status === "issue").length;
    const ap = at.filter(t => t.status === "pending").length;
    const pc = at.length ? Math.round((ad / at.length) * 100) : 0;
    const allDone  = pc === 100 && at.length > 0;
    const hasIssue = ai > 0;
    return { a, at, ad, ai, ap, pc, allDone, hasIssue };
  });

  const sumComplete = areaStats.filter(s => s.allDone).length;
  const sumProgress = areaStats.filter(s => s.pc > 0 && !s.allDone && !s.hasIssue).length;
  const sumIssue    = areaStats.filter(s => s.hasIssue).length;

  const scrollToArea = (areaId) => {
    const el = document.getElementById(`area-card-${areaId}`);
    if (el) {
      setViewMode("cards");
      setTimeout(() => el.scrollIntoView({ behavior:"smooth", block:"center" }), 80);
    } else {
      setViewMode("cards");
    }
  };

  return (
    <div style={{ fontFamily: F.b }}>
      <style>{`
        @keyframes pulse-red {
          0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0); }
          50% { box-shadow: 0 0 0 4px rgba(192,57,43,0.3); }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
          <div>
            <h1 style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.maroon, margin: "0 0 2px" }}>
              🏗️ {L.areas} — {prop.sn}
            </h1>
            <p style={{ fontSize:10, color: C.tl, margin: 0 }}>
              Green = all SOPs done · Yellow = in progress · Red = issues
            </p>
          </div>
          {/* Toggle */}
          <div style={{ display:"flex", gap:4, background:C.maroonSoft, borderRadius:8, padding:3 }}>
            <button onClick={() => setViewMode("map")} style={{
              padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer",
              fontFamily:F.b, fontSize:10, fontWeight:600,
              background: viewMode==="map" ? C.maroon : "transparent",
              color: viewMode==="map" ? C.white : C.maroon,
            }}>📐 Venue Map</button>
            <button onClick={() => setViewMode("cards")} style={{
              padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer",
              fontFamily:F.b, fontSize:10, fontWeight:600,
              background: viewMode==="cards" ? C.maroon : "transparent",
              color: viewMode==="cards" ? C.white : C.maroon,
            }}>📋 Area Details</button>
          </div>
        </div>
      </div>

      {/* Venue Map */}
      {viewMode === "map" && (
        <VenueMap prop={prop} areaStats={areaStats} onBlockClick={scrollToArea} />
      )}

      {/* Area grid */}
      {viewMode === "cards" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
          gap: 12,
          marginBottom: 16,
        }}>
          {areaStats.map(({ a, at, ad, ai, ap, pc, allDone, hasIssue }) => {
            const typeKey = AREA_TYPE[a.id] || "neutral";
            const t       = TYPE[typeKey];
            const icon    = a.i || t.icon;

            const borderC = allDone ? C.green
              : hasIssue ? C.red
              : pc > 50   ? C.yellow
              : C.border;

            const barC = allDone ? C.green
              : hasIssue ? C.red
              : pc > 50   ? C.yellow
              : C.blue;

            return (
              <div key={a.id} id={`area-card-${a.id}`} style={{
                borderRadius: 12,
                overflow: "hidden",
                border: `2px solid ${borderC}`,
                background: C.white,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                scrollMarginTop: 80,
              }}>
                <div style={{
                  background: t.bg,
                  height: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  position: "relative",
                }}>
                  <span style={{ fontSize:44, filter:"drop-shadow(0 2px 5px rgba(0,0,0,0.35))", lineHeight:1 }}>
                    {icon}
                  </span>
                  {a.s && (
                    <span style={{
                      fontSize:11, color:"rgba(255,255,255,0.97)", fontWeight:700,
                      background:"rgba(0,0,0,0.28)", borderRadius:6, padding:"2px 9px",
                    }}>
                      {a.s}
                    </span>
                  )}
                  {(allDone || hasIssue) && (
                    <div style={{
                      position:"absolute", top:8, right:8,
                      background:"rgba(255,255,255,0.22)", borderRadius:7,
                      padding:"2px 8px", fontSize:9, color:"#FFF", fontWeight:700,
                      border:"1px solid rgba(255,255,255,0.4)", backdropFilter:"blur(2px)",
                    }}>
                      {allDone ? "✅ SOP Done" : "⚠️ Issues"}
                    </div>
                  )}
                  {at.length === 0 && (
                    <div style={{
                      position:"absolute", bottom:6, left:0, right:0,
                      textAlign:"center", fontSize:9,
                      color:"rgba(255,255,255,0.65)", fontStyle:"italic",
                    }}>
                      No SOPs assigned
                    </div>
                  )}
                </div>
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ fontFamily:F.d, fontSize:13, fontWeight:700, color:C.maroon, marginBottom:8 }}>
                    {a.n}
                  </div>
                  {at.length > 0 && (
                    <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden", marginBottom:7 }}>
                      <div style={{ height:"100%", width:`${pc}%`, background:barC, borderRadius:3, transition:"width 0.4s" }} />
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:C.gBg, color:C.green, fontWeight:600 }}>✅ {ad}</span>
                      <span style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:C.yBg, color:C.yellow, fontWeight:600 }}>⏳ {ap}</span>
                      {ai > 0 && <span style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:C.rBg, color:C.red, fontWeight:600 }}>⚠️ {ai}</span>}
                    </div>
                    {at.length > 0 && (
                      <span style={{ fontSize:12, fontWeight:700, color:allDone ? C.green : C.maroon }}>{pc}%</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary row — always visible */}
      <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:14 }}>
        <div style={{ fontFamily:F.d, fontSize:13, fontWeight:700, color:C.maroon, marginBottom:10 }}>
          📊 Area Summary — {prop.sn}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[
            { label:"100% Complete", count:sumComplete, color:C.green,  bg:C.gBg,  icon:"✅" },
            { label:"In Progress",   count:sumProgress, color:C.yellow, bg:C.yBg,  icon:"⏳" },
            { label:"Has Issues",    count:sumIssue,    color:C.red,    bg:C.rBg,  icon:"⚠️" },
          ].map(s => (
            <div key={s.label} style={{ padding:10, background:s.bg, borderRadius:8, textAlign:"center" }}>
              <div style={{ fontFamily:F.d, fontSize:22, fontWeight:700, color:s.color }}>{s.count}</div>
              <div style={{ fontSize:10, color:s.color, fontWeight:600 }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
