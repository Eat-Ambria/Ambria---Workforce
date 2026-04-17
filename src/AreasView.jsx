import { C, F, LANGS } from "./constants.js";

// Gradient type per area ID
const AREA_GRAD = {
  // Banquet / Hall / Glass → maroon
  bq:"maroon", ag:"maroon", vg:"maroon", eg:"maroon", ao:"maroon",
  b1:"maroon", gl:"maroon", of:"maroon",
  // Lawns / Gardens → green
  lw:"green", al:"green", vl2:"green", el:"green", gd:"green",
  // Parking → gray
  pk:"gray",
  // Washrooms → blue
  vw:"blue", gw:"blue", wc:"blue",
  // Villa / Rooms → amber
  vl:"amber",
  // Hangar / structural → slate
  hn:"slate",
};
const GRADS = {
  maroon:{bg:"linear-gradient(135deg,#7B1E2F,#9A2E42)",c:"#FFF"},
  green: {bg:"linear-gradient(135deg,#2E8B57,#3da86e)",c:"#FFF"},
  gray:  {bg:"linear-gradient(135deg,#546e7a,#78909c)",c:"#FFF"},
  blue:  {bg:"linear-gradient(135deg,#3B6FC0,#5b8fd8)",c:"#FFF"},
  amber: {bg:"linear-gradient(135deg,#C4956A,#d4a87a)",c:"#FFF"},
  slate: {bg:"linear-gradient(135deg,#455a64,#607d8b)",c:"#FFF"},
  neutral:{bg:"linear-gradient(135deg,#7a7a7a,#aaaaaa)",c:"#FFF"},
};

export default function AreasView({ tasks, prop, lang }) {
  const L = LANGS[lang];

  return (
    <div style={{ fontFamily: F.b }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: "0 0 2px" }}>
          🏗️ {L.areas} — {prop.sn}
        </h1>
        <p style={{ fontSize: 10, color: C.tl, margin: 0 }}>
          Green = all SOPs done · Yellow = in progress · Red = issues
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
        {(prop?.areas||[]).map(a => {
          const at = tasks.filter(t => t.area === a.id);
          const ad = at.filter(t => t.status === "completed").length;
          const ai = at.filter(t => t.status === "issue").length;
          const ap = at.filter(t => t.status === "pending").length;
          const pc = at.length ? Math.round((ad / at.length) * 100) : 0;
          const allDone = pc === 100 && at.length > 0;
          const hasIssue = ai > 0;
          const grad = GRADS[AREA_GRAD[a.id] || "neutral"];

          return (
            <div key={a.id} style={{
              borderRadius: 12, overflow: "hidden",
              border: `2px solid ${allDone ? C.green : hasIssue ? C.red : pc > 50 ? C.yellow : C.border}`,
              background: allDone ? C.gBg : hasIssue ? "#FFF5F5" : C.white,
            }}>
              {/* Gradient header with icon + name + spec */}
              <div style={{
                background: grad.bg,
                padding: "10px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                minHeight: 56,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))" }}>{a.i}</span>
                  <div>
                    <div style={{ fontFamily: F.d, fontSize: 13, fontWeight: 700, color: "#FFF", lineHeight: 1.2 }}>{a.n}</div>
                    {a.s && (
                      <div style={{
                        fontSize: 9, color: "rgba(255,255,255,0.88)", marginTop: 2,
                        background: "rgba(0,0,0,0.18)", borderRadius: 4, padding: "1px 5px",
                        display: "inline-block",
                      }}>{a.s}</div>
                    )}
                  </div>
                </div>
                {(allDone || hasIssue) && (
                  <div style={{
                    background: "rgba(255,255,255,0.22)", borderRadius: 8, padding: "2px 7px",
                    fontSize: 8, color: "#FFF", fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.35)", whiteSpace: "nowrap",
                  }}>
                    {allDone ? "SOP ✓" : "⚠️ Issue"}
                  </div>
                )}
              </div>

              {/* Progress + stats */}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 7 }}>
                  <div style={{
                    height: "100%", width: `${pc}%`,
                    background: allDone ? C.green : hasIssue ? C.red : pc > 50 ? C.yellow : C.blue,
                    borderRadius: 3, transition: "width 0.4s",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.gBg, color: C.green, fontWeight: 600 }}>✅ {ad}</span>
                    <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.yBg, color: C.yellow, fontWeight: 600 }}>⏳ {ap}</span>
                    {ai > 0 && <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.rBg, color: C.red, fontWeight: 600 }}>⚠️ {ai}</span>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? C.green : C.maroon }}>{pc}%</span>
                </div>
                {at.length === 0 && (
                  <div style={{ fontSize: 9, color: C.tl, marginTop: 4, fontStyle: "italic" }}>No SOPs assigned</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14, marginTop: 14 }}>
        <div style={{ fontFamily: F.d, fontSize: 14, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
          📊 Area Summary — {prop.sn}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            {
              label: "100% Complete",
              count: (prop?.areas||[]).filter(a => {
                const at = tasks.filter(t => t.area === a.id);
                return at.length > 0 && at.every(t => t.status === "completed");
              }).length,
              color: C.green, bg: C.gBg, icon: "✅",
            },
            {
              label: "In Progress",
              count: (prop?.areas||[]).filter(a => {
                const at = tasks.filter(t => t.area === a.id);
                const done = at.filter(t => t.status === "completed").length;
                return at.length > 0 && done > 0 && done < at.length;
              }).length,
              color: C.yellow, bg: C.yBg, icon: "⏳",
            },
            {
              label: "Has Issues",
              count: (prop?.areas||[]).filter(a => tasks.some(t => t.area === a.id && t.status === "issue")).length,
              color: C.red, bg: C.rBg, icon: "⚠️",
            },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: s.bg, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
