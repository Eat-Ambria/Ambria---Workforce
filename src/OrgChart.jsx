import { useState } from "react";
import { C, F } from "./constants.js";

// ── CSS injected once — handles tree connecting lines via ::before / ::after ──
const CHART_CSS = `
.oc { overflow-x: auto; padding-bottom: 20px; }
.oc-inner { display: inline-flex; flex-direction: column; align-items: center;
  padding: 8px 20px 8px; min-width: max-content; }
.oc-grp { display: flex; flex-direction: column; align-items: center; }
.oc-card {
  padding: 9px 14px; border-radius: 10px; min-width: 110px;
  font-family: 'Outfit', sans-serif; text-align: center;
  cursor: pointer; user-select: none; white-space: nowrap;
  transition: opacity 0.12s, transform 0.12s;
}
.oc-card:active { opacity: 0.8; transform: scale(0.97); }
.oc-card-name { font-weight: 700; font-size: 12px; color: #2D2D2D; line-height: 1.3; }
.oc-card-role { font-size: 9px; margin-top: 2px; line-height: 1.3; }
.oc-card-exp  { font-size: 9px; margin-top: 3px; color: #7A7A7A; }
.oc-vbar { width: 2px; height: 20px; background: #7B1E2F; }
.oc-row  { display: flex; align-items: flex-start; justify-content: center; }
.oc-slot {
  display: flex; flex-direction: column; align-items: center;
  padding: 0 6px; position: relative; padding-top: 20px;
}
.oc-slot::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0;
  height: 2px; background: #7B1E2F;
}
.oc-slot:first-child::before  { left: 50%; }
.oc-slot:last-child::before   { right: 50%; }
.oc-slot:only-child::before   { display: none; }
.oc-slot::after {
  content: ''; position: absolute; top: 0; left: 50%;
  transform: translateX(-50%); width: 2px; height: 20px; background: #7B1E2F;
}
`;

// ── Org data ────────────────────────────────────────────────────────────────
const ORG_DATA = {
  name:"Harsh Vardhan", role:"Founder", color:"#7B1E2F",
  children:[{
    name:"Vicky Arya", role:"Overall Head", color:"#7B1E2F",
    children:[
      { name:"Abhishek", role:"Efficiency Manager", color:"#7B1E2F" },
      {
        name:"Sonu Mali", role:"Site Head — Pushpanjali", color:"#0891B2",
        children:[
          { name:"Pawan",       role:"Horticulture",  color:"#16A34A" },
          { name:"Dayashankar", role:"Horticulture",  color:"#16A34A" },
          { name:"Sunil",       role:"Horticulture",  color:"#16A34A" },
          { name:"Poonam",      role:"HK — 2IC",      color:"#2563EB" },
          { name:"Neeru",       role:"Housekeeping",  color:"#2563EB" },
          { name:"Umesh",       role:"Housekeeping",  color:"#2563EB" },
          { name:"Dinesh",      role:"Housekeeping",  color:"#2563EB" },
          { name:"Lalita",      role:"Housekeeping",  color:"#2563EB" },
        ]
      },
      {
        name:"Mahesh", role:"Supervisor — Exotica", color:"#D97706",
        children:[
          { name:"Sonu 2",  role:"Horticulture", color:"#16A34A" },
          { name:"Dhruv",   role:"Horticulture", color:"#16A34A" },
          { name:"Kamlesh", role:"Horticulture", color:"#16A34A" },
          { name:"Sunita",  role:"Housekeeping", color:"#2563EB" },
          { name:"Brijesh", role:"Housekeeping", color:"#2563EB" },
          { name:"Ragini",  role:"Housekeeping", color:"#2563EB" },
          { name:"Rani",    role:"Housekeeping", color:"#2563EB" },
        ]
      },
      {
        name:"Rahees", role:"Supervisor — Manaktala", color:"#059669",
        children:[
          { name:"Mukesh",   role:"Horticulture", color:"#16A34A" },
          { name:"Tulsi",    role:"Horticulture", color:"#16A34A" },
          { name:"Akash(H)", role:"Horticulture", color:"#16A34A" },
          { name:"Sadna",    role:"Housekeeping", color:"#2563EB" },
          { name:"Lovekush", role:"Housekeeping", color:"#2563EB" },
          { name:"Akash",    role:"Housekeeping", color:"#2563EB" },
          { name:"Ajay",     role:"Housekeeping", color:"#2563EB" },
        ]
      },
      {
        name:"Sandeep", role:"Security Head — All", color:"#6B21A8",
        children:[
          { name:"Santosh",         role:"Security — Restro",    color:"#6B21A8" },
          { name:"Bhupender",       role:"Security — Exotica",   color:"#6B21A8" },
          { name:"Ajay (Sec)",      role:"Security — Manaktala", color:"#6B21A8" },
          { name:"3rd Party Guards",role:"All Venues",            color:"#888888" },
        ]
      },
      // Restro staff report directly to Vicky
      { name:"Suresh", role:"HK — Restro",   color:"#2563EB" },
      { name:"Roma",   role:"HK — Restro",   color:"#2563EB" },
      { name:"Anita",  role:"HK — Restro",   color:"#2563EB" },
      { name:"Arjun",  role:"HK — Restro",   color:"#2563EB" },
      { name:"Vinay",  role:"HK — Restro",   color:"#2563EB" },
      { name:"Ramu",   role:"Hort — Restro", color:"#16A34A" },
    ]
  }]
};

// ── Collect all node names for expand-all ──────────────────────────────────
function collectKeys(node, acc = []) {
  acc.push(node.name);
  node.children?.forEach(c => collectKeys(c, acc));
  return acc;
}
const ALL_KEYS = collectKeys(ORG_DATA);

// ── Single tree branch (recursive) ────────────────────────────────────────
function Branch({ node, expanded, toggle }) {
  const hasKids = !!(node.children?.length);
  const isOpen  = !!expanded[node.name];
  const isMgr   = hasKids; // managers have children; staff are leaf nodes

  const cardStyle = isMgr ? {
    background: node.color + "18",
    border: `2px solid ${node.color}`,
  } : {
    background: "#fff",
    borderLeft: `4px solid ${node.color}`,
    border: `1px solid #EDEDED`,
    borderLeftWidth: 4,
    borderLeftColor: node.color,
  };

  return (
    <div className="oc-grp">
      {/* Node card */}
      <div
        className="oc-card"
        style={cardStyle}
        onClick={() => hasKids && toggle(node.name)}
      >
        <div className="oc-card-name">{node.name}</div>
        <div className="oc-card-role" style={{ color: node.color }}>{node.role}</div>
        {hasKids && (
          <div className="oc-card-exp">
            {isOpen ? "▾ collapse" : `▸ ${node.children.length} people`}
          </div>
        )}
      </div>

      {/* Children */}
      {hasKids && isOpen && (
        <>
          <div className="oc-vbar" />
          <div className="oc-row">
            {node.children.map((child, i) => (
              <div key={i} className="oc-slot">
                <Branch node={child} expanded={expanded} toggle={toggle} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function OrgChart({ lang }) {
  const H = lang === "hi";
  // Start with only root expanded → Vicky visible; everything else collapsed
  const [expanded, setExpanded] = useState({ "Harsh Vardhan": true });

  const toggle = name =>
    setExpanded(p => ({ ...p, [name]: !p[name] }));

  const expandAll  = () =>
    setExpanded(Object.fromEntries(ALL_KEYS.map(k => [k, true])));

  const collapseAll = () =>
    setExpanded({});

  return (
    <div style={{ fontFamily: F.b }}>
      {/* Inject CSS */}
      <style>{CHART_CSS}</style>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: "0 0 3px" }}>
          🏢 {H ? "संगठन संरचना" : "Org Chart"}
        </h1>
        <p style={{ fontSize: 11, color: C.tl, margin: 0 }}>
          {H ? "नाम पर टैप करें — टीम देखें" : "Tap any name to expand the team below"}
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { c: "#7B1E2F", l: "👑 Management" },
          { c: "#0891B2", l: "🏛️ Pushpanjali" },
          { c: "#D97706", l: "🌴 Exotica"      },
          { c: "#059669", l: "✨ Manaktala"    },
          { c: "#16A34A", l: "🌱 Horticulture" },
          { c: "#2563EB", l: "🧹 Housekeeping" },
          { c: "#6B21A8", l: "🛡️ Security"     },
        ].map(leg => (
          <span key={leg.l} style={{
            fontSize: 9, padding: "3px 8px", borderRadius: 6, fontWeight: 700,
            background: leg.c + "15", color: leg.c, border: `1px solid ${leg.c}28`,
          }}>
            {leg.l}
          </span>
        ))}
      </div>

      {/* Expand / Collapse controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={expandAll} style={{
          padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
          background: C.white, fontFamily: F.b, fontSize: 11, cursor: "pointer", color: C.text,
        }}>
          ⊞ {H ? "सब खोलें" : "Expand All"}
        </button>
        <button onClick={collapseAll} style={{
          padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
          background: C.white, fontFamily: F.b, fontSize: 11, cursor: "pointer", color: C.text,
        }}>
          ⊟ {H ? "सब बंद करें" : "Collapse All"}
        </button>
      </div>

      {/* Tree */}
      <div style={{
        background: C.white, borderRadius: 14,
        border: `1px solid ${C.border}`, padding: 16,
      }}>
        <div className="oc">
          <div className="oc-inner">
            <Branch node={ORG_DATA} expanded={expanded} toggle={toggle} />
          </div>
        </div>
      </div>

      {/* Mobile hint */}
      <p style={{ fontSize: 10, color: C.tl, margin: "8px 0 0", textAlign: "center" }}>
        {H ? "← बाएं/दाएं स्क्रॉल करें →" : "← Scroll left/right to see full tree →"}
      </p>
    </div>
  );
}
