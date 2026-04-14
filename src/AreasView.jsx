import { C, F, LANGS } from "./constants.js";

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

          return (
            <div key={a.id} style={{
              background: allDone ? C.gBg : hasIssue ? C.rBg : C.white,
              borderRadius: 12, padding: 12,
              border: `2px solid ${allDone ? C.green : hasIssue ? C.red : pc > 50 ? C.yellow : C.border}`,
              position: "relative"
            }}>
              {allDone && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  background: C.green, color: C.white,
                  borderRadius: 10, padding: "1px 7px", fontSize: 8, fontWeight: 700
                }}>SOP ✓</div>
              )}
              {hasIssue && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  background: C.red, color: C.white,
                  borderRadius: 10, padding: "1px 7px", fontSize: 8, fontWeight: 700
                }}>⚠️ Issue</div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{a.i}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{a.n}</div>
                  {a.s && <div style={{ fontSize: 9, color: C.tl }}>{a.s}</div>}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                <div style={{
                  height: "100%",
                  width: `${pc}%`,
                  background: allDone ? C.green : hasIssue ? C.red : pc > 50 ? C.yellow : C.blue,
                  borderRadius: 3,
                  transition: "width 0.4s"
                }} />
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.gBg, color: C.green, fontWeight: 600 }}>✅ {ad}</span>
                  <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.yBg, color: C.yellow, fontWeight: 600 }}>⏳ {ap}</span>
                  {ai > 0 && <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: C.rBg, color: C.red, fontWeight: 600 }}>⚠️ {ai}</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? C.green : C.maroon }}>{pc}%</span>
              </div>

              {/* Task count */}
              {at.length === 0 && (
                <div style={{ fontSize: 9, color: C.tl, marginTop: 4, fontStyle: "italic" }}>No SOPs assigned</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Summary ── */}
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
              color: C.green, bg: C.gBg, icon: "✅"
            },
            {
              label: "In Progress",
              count: (prop?.areas||[]).filter(a => {
                const at = tasks.filter(t => t.area === a.id);
                const done = at.filter(t => t.status === "completed").length;
                return at.length > 0 && done > 0 && done < at.length;
              }).length,
              color: C.yellow, bg: C.yBg, icon: "⏳"
            },
            {
              label: "Has Issues",
              count: (prop?.areas||[]).filter(a => tasks.some(t => t.area === a.id && t.status === "issue")).length,
              color: C.red, bg: C.rBg, icon: "⚠️"
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
