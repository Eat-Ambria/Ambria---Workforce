import { useState } from "react";
import { C, F } from "./constants.js";

// ── CSS injected once — Power BI decomposition-tree style ────────────────────
const CSS = `
.dc-outer { overflow-x: auto; overflow-y: visible; padding-bottom: 20px; }
.dc-inner { display: inline-flex; padding: 8px 20px; min-width: max-content; }

/* Branch: horizontal row = card + (optional) connector + children column */
.dc-branch { display: flex; align-items: center; }

/* Node card */
.dc-card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  border-left: 5px solid #7B1E2F;
  padding: 10px 28px 10px 12px;
  min-width: 148px;
  max-width: 175px;
  min-height: 56px;
  cursor: pointer;
  box-shadow: 0 1px 5px rgba(0,0,0,0.06);
  transition: box-shadow 0.15s, transform 0.15s;
  user-select: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-shrink: 0;
}
.dc-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.13); transform: translateY(-1px); }
.dc-card-leaf { cursor: default; }
.dc-card-leaf:hover { box-shadow: 0 1px 5px rgba(0,0,0,0.06); transform: none; }

.dc-name { font-weight: 700; font-size: 13px; color: #1F2937; line-height: 1.3; }
.dc-role { font-size: 10px; margin-top: 3px; line-height: 1.3; font-weight: 500; }

/* Expand / collapse chevron — positioned absolute inside card */
.dc-chev {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  font-size: 9px; color: #9CA3AF; font-weight: 700;
  transition: transform 0.2s;
}

/* Container for horizontal seg + children column */
.dc-expand { display: flex; align-items: center; }

/* Short horizontal segment from parent card to vertical bar */
.dc-hseg { width: 24px; height: 1.5px; background: #D1D5DB; flex-shrink: 0; }

/* Children column */
.dc-kids {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Vertical line: top=center-of-first-card, bottom=center-of-last-card
   Cards are min 56px tall → center at 28px from top/bottom */
.dc-kids:not(.dc-sole)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 28px;
  bottom: 28px;
  width: 1.5px;
  background: #D1D5DB;
}

/* Each child row — horizontal connector to card */
.dc-citem {
  display: flex;
  align-items: center;
  padding-left: 20px;
  position: relative;
}
.dc-citem::before {
  content: '';
  position: absolute;
  left: 0; top: 50%;
  width: 20px; height: 1.5px;
  background: #D1D5DB;
  transform: translateY(-0.75px);
}

/* Slide-in animation when children expand */
.dc-appear { animation: dcSlideIn 0.2s ease-out; }
@keyframes dcSlideIn {
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

// ── Org hierarchy data ────────────────────────────────────────────────────────
const ORG_DATA = {
  name:"Harsh Vardhan", role:"Founder & Director", color:"#7B1E2F",
  children:[{
    name:"Vicky Arya", role:"Overall Head", color:"#7B1E2F",
    children:[
      { name:"Abhishek",    role:"Efficiency Manager", color:"#7B1E2F" },
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
          { name:"Akash (H)",role:"Horticulture", color:"#16A34A" },
          { name:"Sadna",    role:"Housekeeping", color:"#2563EB" },
          { name:"Lovekush", role:"Housekeeping", color:"#2563EB" },
          { name:"Akash",    role:"Housekeeping", color:"#2563EB" },
          { name:"Ajay",     role:"Housekeeping", color:"#2563EB" },
        ]
      },
      {
        name:"Sandeep", role:"Security Head — All", color:"#6B21A8",
        children:[
          { name:"Santosh",          role:"Security — Restro",    color:"#6B21A8" },
          { name:"Bhupender",        role:"Security — Exotica",   color:"#6B21A8" },
          { name:"Ajay (Sec)",       role:"Security — Manaktala", color:"#6B21A8" },
          { name:"3rd Party Guards", role:"All Venues",            color:"#9CA3AF" },
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

// ── Collect all keys for expand-all ──────────────────────────────────────────
function collectKeys(node, acc = []) {
  acc.push(node.name);
  node.children?.forEach(c => collectKeys(c, acc));
  return acc;
}
const ALL_KEYS = collectKeys(ORG_DATA);

// ── Recursive branch component ────────────────────────────────────────────────
function Branch({ node, expanded, toggle }) {
  const hasKids  = !!(node.children?.length);
  const isOpen   = !!expanded[node.name];
  const isSingle = node.children?.length === 1;
  const color    = node.color || "#7B1E2F";

  return (
    <div className="dc-branch">
      {/* ── Node card ── */}
      <div
        className={`dc-card${hasKids ? "" : " dc-card-leaf"}`}
        style={{ borderLeftColor: color }}
        onClick={() => hasKids && toggle(node.name)}
      >
        <div className="dc-name">{node.name}</div>
        <div className="dc-role" style={{ color }}>{node.role}</div>
        {hasKids && (
          <div className="dc-chev">{isOpen ? "▼" : "▶"}</div>
        )}
      </div>

      {/* ── Children (horizontal right) ── */}
      {isOpen && hasKids && (
        <div className="dc-expand dc-appear">
          {/* Short horizontal connector from card to vertical bar */}
          <div className="dc-hseg" />

          {/* Children column with vertical bar */}
          <div className={`dc-kids${isSingle ? " dc-sole" : ""}`}>
            {node.children.map((child, i) => (
              <div key={i} className="dc-citem">
                <Branch node={child} expanded={expanded} toggle={toggle} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function OrgChart({ lang }) {
  const H = lang === "hi";
  // Start with root expanded → only Vicky visible; all else collapsed
  const [expanded, setExpanded] = useState({ "Harsh Vardhan": true });

  const toggle = name =>
    setExpanded(p => ({ ...p, [name]: !p[name] }));

  return (
    <div style={{ fontFamily: F.b }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: "0 0 3px" }}>
          🏢 {H ? "संगठन संरचना" : "Organisation Chart"}
        </h1>
        <p style={{ fontSize: 11, color: C.tl, margin: 0 }}>
          {H ? "नाम पर क्लिक करें — टीम दाईं तरफ खुलती है" : "Click any name to expand the team to the right"}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setExpanded(Object.fromEntries(ALL_KEYS.map(k => [k, true])))}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontFamily: F.b, fontSize: 11, cursor: "pointer", color: C.text }}
        >
          ⊞ {H ? "सब खोलें" : "Expand All"}
        </button>
        <button
          onClick={() => setExpanded({})}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontFamily: F.b, fontSize: 11, cursor: "pointer", color: C.text }}
        >
          ⊟ {H ? "सब बंद करें" : "Collapse All"}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { c: "#7B1E2F", l: "👑 Management" },
          { c: "#0891B2", l: "🏛️ Pushpanjali" },
          { c: "#D97706", l: "🌴 Exotica" },
          { c: "#059669", l: "✨ Manaktala" },
          { c: "#16A34A", l: "🌱 Horticulture" },
          { c: "#2563EB", l: "🧹 Housekeeping" },
          { c: "#6B21A8", l: "🛡️ Security" },
        ].map(leg => (
          <span key={leg.l} style={{
            fontSize: 9, padding: "3px 8px", borderRadius: 6, fontWeight: 700,
            background: leg.c + "15", color: leg.c, border: `1px solid ${leg.c}28`,
          }}>
            {leg.l}
          </span>
        ))}
      </div>

      {/* Tree */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 8px 16px 16px" }}>
        <div className="dc-outer">
          <div className="dc-inner">
            <Branch node={ORG_DATA} expanded={expanded} toggle={toggle} />
          </div>
        </div>
      </div>

      <p style={{ fontSize: 10, color: C.tl, margin: "8px 0 0", textAlign: "center" }}>
        ← {H ? "स्क्रॉल करें" : "Scroll left/right to see full tree"} →
      </p>
    </div>
  );
}
