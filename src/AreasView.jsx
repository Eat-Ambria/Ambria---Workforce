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
  // Halls / Banquets
  bq:"hall", ag:"hall", vg:"hall", eg:"hall", ao:"hall", b1:"hall", gl:"hall", hn:"hall",
  // Lawns / Gardens
  lw:"lawn", al:"lawn", vl2:"lawn", el:"lawn", gd:"lawn",
  // Parking / Driveways
  pk:"parking", dr:"parking", wk:"parking",
  // Washrooms
  vw:"wash", gw:"wash", wc:"wash", vp:"wash",
  // Villa / Rooms
  vl:"villa",
  // Offices
  of:"office",
  // Food / Restro
  re:"food", ca:"food", ki:"food", rt:"neutral",
  // Entrances
  en:"neutral",
};

export default function AreasView({ tasks, prop, lang }) {
  const L = LANGS[lang];

  const areas = prop?.areas || [];

  // ── Per-area stats ───────────────────────────────────────────────────────
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

  // ── Summary counts ───────────────────────────────────────────────────────
  const sumComplete = areaStats.filter(s => s.allDone).length;
  const sumProgress = areaStats.filter(s => s.pc > 0 && !s.allDone && !s.hasIssue).length;
  const sumIssue    = areaStats.filter(s => s.hasIssue).length;

  return (
    <div style={{ fontFamily: F.b }}>
      {/* Page header */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: F.d, fontSize:23, fontWeight: 700, color: C.maroon, margin: "0 0 2px" }}>
          🏗️ {L.areas} — {prop.sn}
        </h1>
        <p style={{ fontSize:11, color: C.tl, margin: 0 }}>
          Green = all SOPs done · Yellow = in progress · Red = issues
        </p>
      </div>

      {/* Area grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
        gap: 12,
        marginBottom: 16,
      }}>
        {areaStats.map(({ a, at, ad, ai, ap, pc, allDone, hasIssue }) => {
          const typeKey = AREA_TYPE[a.id] || "neutral";
          const t       = TYPE[typeKey];
          // Use area's own icon if it's meaningful, else fall back to type icon
          const icon    = a.i || t.icon;

          // Card border colour based on SOP status
          const borderC = allDone ? C.green
            : hasIssue ? C.red
            : pc > 50   ? C.yellow
            : C.border;

          // Progress bar colour
          const barC = allDone ? C.green
            : hasIssue ? C.red
            : pc > 50   ? C.yellow
            : C.blue;

          return (
            <div key={a.id} style={{
              borderRadius: 12,
              overflow: "hidden",
              border: `2px solid ${borderC}`,
              background: C.white,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              {/* ── Photo-placeholder header ─── */}
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
                {/* Large area icon */}
                <span style={{
                  fontSize:44,
                  filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.35))",
                  lineHeight: 1,
                }}>
                  {icon}
                </span>

                {/* Sqft / capacity spec */}
                {a.s && (
                  <span style={{
                    fontSize:12,
                    color: "rgba(255,255,255,0.97)",
                    fontWeight: 700,
                    background: "rgba(0,0,0,0.28)",
                    borderRadius: 6,
                    padding: "2px 9px",
                    letterSpacing: "0.3px",
                  }}>
                    {a.s}
                  </span>
                )}

                {/* SOP status badge top-right */}
                {(allDone || hasIssue) && (
                  <div style={{
                    position: "absolute",
                    top: 8, right: 8,
                    background: "rgba(255,255,255,0.22)",
                    borderRadius: 7, padding: "2px 8px",
                    fontSize:10, color: "#FFF", fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.4)",
                    backdropFilter: "blur(2px)",
                  }}>
                    {allDone ? "✅ SOP Done" : "⚠️ Issues"}
                  </div>
                )}

                {/* No-tasks indicator */}
                {at.length === 0 && (
                  <div style={{
                    position: "absolute",
                    bottom: 6, left: 0, right: 0,
                    textAlign: "center",
                    fontSize:10, color: "rgba(255,255,255,0.65)",
                    fontStyle: "italic",
                  }}>
                    No SOPs assigned
                  </div>
                )}
              </div>

              {/* ── Content below header ─── */}
              <div style={{ padding: "10px 12px" }}>
                {/* Area name */}
                <div style={{
                  fontFamily: F.d, fontSize:14, fontWeight: 700,
                  color: C.maroon, marginBottom: 8,
                }}>
                  {a.n}
                </div>

                {/* Progress bar */}
                {at.length > 0 && (
                  <div style={{
                    height: 5, background: C.border,
                    borderRadius: 3, overflow: "hidden", marginBottom: 7,
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${pc}%`,
                      background: barC,
                      borderRadius: 3,
                      transition: "width 0.4s",
                    }} />
                  </div>
                )}

                {/* Stats row */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize:10, padding: "2px 5px", borderRadius: 4,
                      background: C.gBg, color: C.green, fontWeight: 600,
                    }}>
                      ✅ {ad}
                    </span>
                    <span style={{
                      fontSize:10, padding: "2px 5px", borderRadius: 4,
                      background: C.yBg, color: C.yellow, fontWeight: 600,
                    }}>
                      ⏳ {ap}
                    </span>
                    {ai > 0 && (
                      <span style={{
                        fontSize:10, padding: "2px 5px", borderRadius: 4,
                        background: C.rBg, color: C.red, fontWeight: 600,
                      }}>
                        ⚠️ {ai}
                      </span>
                    )}
                  </div>
                  {at.length > 0 && (
                    <span style={{
                      fontSize:13, fontWeight: 700,
                      color: allDone ? C.green : C.maroon,
                    }}>
                      {pc}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Summary row ─── */}
      <div style={{
        background: C.white, borderRadius: 12,
        border: `1px solid ${C.border}`, padding: 14,
      }}>
        <div style={{
          fontFamily: F.d, fontSize:15, fontWeight: 700,
          color: C.maroon, marginBottom: 10,
        }}>
          📊 Area Summary — {prop.sn}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { label: "100% Complete", count: sumComplete, color: C.green,  bg: C.gBg,  icon: "✅" },
            { label: "In Progress",   count: sumProgress, color: C.yellow, bg: C.yBg,  icon: "⏳" },
            { label: "Has Issues",    count: sumIssue,    color: C.red,    bg: C.rBg,  icon: "⚠️" },
          ].map(s => (
            <div key={s.label} style={{
              padding: 10, background: s.bg,
              borderRadius: 8, textAlign: "center",
            }}>
              <div style={{
                fontFamily: F.d, fontSize:23,
                fontWeight: 700, color: s.color,
              }}>
                {s.count}
              </div>
              <div style={{ fontSize:11, color: s.color, fontWeight: 600 }}>
                {s.icon} {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
