import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";
import { useIsMobile } from "./hooks.js";

// ─── Fire Safety Widget ───────────────────────────────────────────────────────
function FireSafetyWidget({ setView }) {
  const [stat, setStat] = useState(null);
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const in30  = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    supabase.from("fire_extinguishers").select("id,expiry_date,location,property").eq("status","active").lte("expiry_date", in30)
      .then(({ data }) => {
        if (!data) { setStat({ expired: 0, exp30: 0 }); return; }
        setStat({ expired: data.filter(i => i.expiry_date < today).length, exp30: data.length });
      });
  }, []);

  if (!stat) return null;
  const bad = stat.exp30;
  return (
    <div onClick={() => setView("fire")} style={{
      background: bad > 0 ? C.rBg : C.gBg,
      border: `1px solid ${bad > 0 ? C.red : C.green}`,
      borderRadius: 10, padding: "10px 14px", marginBottom: 12,
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🧯</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: bad > 0 ? C.red : C.green }}>
            {bad > 0 ? `🚨 ${bad} extinguisher${bad > 1 ? "s" : ""} need attention` : "All fire extinguishers OK ✅"}
          </div>
          {stat.expired > 0 && <div style={{ fontSize: 10, color: C.red, marginTop: 1 }}>{stat.expired} already expired — action required</div>}
        </div>
      </div>
      <span style={{ fontSize: 11, color: bad > 0 ? C.red : C.green, fontWeight: 600 }}>View →</span>
    </div>
  );
}

// ─── Ring ────────────────────────────────────────────────────────────────────
function Ring({ pct, color, bg, icon, label, done, total, size = 78 }) {
  const isMobile = useIsMobile();
  const r = 15, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg viewBox="0 0 36 36" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r={r} fill="none" stroke={C.border} strokeWidth="3" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
            strokeLinecap="round" />
        </svg>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)", textAlign: "center"
        }}>
          <div style={{ fontSize: isMobile ? 13 : 16 }}>{icon}</div>
          <div style={{ fontFamily: F.d, fontSize: isMobile ? 11 : 13, fontWeight: 700, color, lineHeight: 1 }}>{pct}%</div>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, color: C.text }}>{label}</div>
        <div style={{ fontSize: isMobile ? 8 : 9, color: C.tl }}>{done}/{total}</div>
      </div>
    </div>
  );
}

// ─── Absent Widget ───────────────────────────────────────────────────────────
function AbsentWidget({ att, leaves, prop, today, L }) {
  const isMobile = useIsMobile();
  const allStaff = Object.values(prop?.depts||{}).flatMap(d => d.m);
  const checkedInIds = att.filter(a => a.date === today).map(a => a.uid);
  const onLeaveIds = leaves
    .filter(l => l.status === "approved" && l.leave_date === today)
    .map(l => l.user_id);

  const absent = allStaff.filter(m => !checkedInIds.includes(m.id) && !onLeaveIds.includes(m.id));
  const onLeaveStaff = allStaff.filter(m => onLeaveIds.includes(m.id));
  const present = allStaff.filter(m => checkedInIds.includes(m.id));

  return (
    <div style={{
      background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: "10px 14px", marginBottom: 12,
      display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr auto auto auto", gap: 12, alignItems: "center"
    }}>
      <div>
        <div style={{ fontFamily: F.d, fontSize:13, fontWeight: 700, color: C.maroon }}>
          🕐 {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={{ fontSize:10, color: C.tl, marginTop: 2 }}>
          {prop.name} · {prop.sh}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "4px 12px", borderRadius: 8, background: C.gBg }}>
        <div style={{ fontFamily: F.d, fontSize:18, fontWeight: 700, color: C.green }}>{present.length}</div>
        <div style={{ fontSize:9, color: C.green, fontWeight: 600 }}>{L.presentToday}</div>
      </div>

      <div style={{
        textAlign: "center", padding: "4px 12px", borderRadius: 8,
        background: absent.length > 0 ? C.rBg : C.gBg
      }}>
        <div style={{ fontFamily: F.d, fontSize:18, fontWeight: 700, color: absent.length > 0 ? C.red : C.green }}>
          {absent.length}
        </div>
        <div style={{ fontSize:9, color: absent.length > 0 ? C.red : C.green, fontWeight: 600 }}>
          {absent.length === 0 ? L.allPresent : L.absentToday}
        </div>
        {absent.length > 0 && (
          <div style={{ fontSize:9, color: C.tl, marginTop: 2 }}>
            {absent.slice(0, 3).map(m => m.n).join(", ")}{absent.length > 3 ? ` +${absent.length - 3}` : ""}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "4px 12px", borderRadius: 8, background: C.yBg }}>
        <div style={{ fontFamily: F.d, fontSize:18, fontWeight: 700, color: C.yellow }}>{onLeaveStaff.length}</div>
        <div style={{ fontSize:9, color: C.yellow, fontWeight: 600 }}>{L.onLeave}</div>
        {onLeaveStaff.length > 0 && (
          <div style={{ fontSize:9, color: C.tl, marginTop: 2 }}>
            {onLeaveStaff.slice(0, 2).map(m => m.n).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Critical Actions ─────────────────────────────────────────────────────────
function CriticalPanel({ tasks, L }) {
  const issues = tasks.filter(t => t.status === "issue");
  const total = tasks.length, done = tasks.filter(t => t.status === "completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = tasks.filter(t => t.status === "pending" && t.timeBlock && (() => {
    try {
      const [h] = t.timeBlock.split(":").map(Number);
      return new Date().getHours() > h + 2;
    } catch { return false; }
  })());

  const allOk = issues.length === 0 && overdue.length === 0 && pct >= 70;

  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14, height: "100%" }}>
      <div style={{ fontFamily: F.d, fontSize:13, fontWeight: 700, color: C.red, marginBottom: 8 }}>
        🚨 {L.criticalActions}
      </div>
      {allOk ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, background: C.gBg, borderRadius: 8 }}>
          <span style={{ fontSize:16 }}>✅</span>
          <span style={{ fontSize:11, color: C.green, fontWeight: 600 }}>{L.noCritical}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {issues.length > 0 && (
            <div style={{ padding: 8, background: C.rBg, borderRadius: 8, border: `1px solid #f0c8c4` }}>
              <div style={{ fontSize:11, fontWeight: 700, color: C.red }}>⚠️ {issues.length} issue{issues.length > 1 ? "s" : ""} reported</div>
              <div style={{ fontSize:9, color: C.tl, marginTop: 2 }}>
                {issues.slice(0, 2).map(t => t.title).join(" · ")}
              </div>
            </div>
          )}
          {pct < 40 && total > 0 && (
            <div style={{ padding: 8, background: C.yBg, borderRadius: 8, border: `1px solid #f0dcc8` }}>
              <div style={{ fontSize:11, fontWeight: 700, color: C.yellow }}>📉 Only {pct}% done — behind schedule</div>
            </div>
          )}
          {overdue.length > 0 && (
            <div style={{ padding: 8, background: C.yBg, borderRadius: 8, border: `1px solid #f0dcc8` }}>
              <div style={{ fontSize:11, fontWeight: 700, color: C.yellow }}>⏰ {overdue.length} tasks past time window</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Staff Performance ────────────────────────────────────────────────────────
function StaffPerf({ tasks, prop, L }) {
  const isMobile = useIsMobile();
  const allM = Object.values(prop?.depts||{}).flatMap(d => d.m.map(m => ({ ...m, dc: d.c, dn: d.n })));
  const perf = allM.map(m => {
    const mt = tasks.filter(t => t.assignedTo === m.id);
    const done = mt.filter(t => t.status === "completed").length;
    const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
    return { ...m, done, total: mt.length, pct };
  }).filter(m => m.total > 0).sort((a, b) => b.pct - a.pct);

  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14, height: "100%" }}>
      <div style={{ fontFamily: F.d, fontSize:13, fontWeight: 700, color: C.maroon, marginBottom: 8 }}>
        🏆 {L.staffPerformance}
      </div>
      {perf.length === 0 ? (
        <div style={{ fontSize:11, color: C.tl, textAlign: "center", padding: 12 }}>No task data yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {perf.slice(0, 6).map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", background: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : m.dc,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.white, fontSize:9, fontWeight: 700, flexShrink: 0
              }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : m.n[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize:10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.n}</span>
                  <span style={{ fontSize:9, color: m.pct === 100 ? C.green : C.tl, fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>{m.done}/{m.total}</span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.pct}%`, background: m.pct === 100 ? C.green : m.dc, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Suggestions ─────────────────────────────────────────────────────────────
function Suggestions({ tasks, L }) {
  const isMobile = useIsMobile();
  const total = tasks.length, done = tasks.filter(t => t.status === "completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const byDept = (d) => {
    const dt = tasks.filter(t => t.dept === d);
    return { total: dt.length, done: dt.filter(t => t.status === "completed").length };
  };
  const h = byDept("h"), k = byDept("k"), a = byDept("a"), s = byDept("s");

  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ fontFamily: F.d, fontSize:13, fontWeight: 700, color: C.green, marginBottom: 8 }}>
        📈 {L.suggestions}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
        {pct === 100 && <div style={{ padding: 8, background: C.gBg, borderRadius: 8, display: "flex", gap: 5 }}><span>🏆</span><span style={{ fontSize:11 }}><strong>All tasks complete!</strong> Outstanding work today.</span></div>}
        {pct >= 70 && pct < 100 && <div style={{ padding: 8, background: C.gBg, borderRadius: 8, display: "flex", gap: 5 }}><span>👍</span><span style={{ fontSize:11 }}><strong>{pct}% done</strong> — push last {total - done} to 100%</span></div>}
        {pct < 70 && total > 0 && <div style={{ padding: 8, background: C.yBg, borderRadius: 8, display: "flex", gap: 5 }}><span>⚡</span><span style={{ fontSize:11 }}><strong>Behind at {pct}%</strong> — mid-day check with leads needed</span></div>}
        <div style={{ padding: 8, background: C.gBg, borderRadius: 8, display: "flex", gap: 5 }}><span>🌱</span><span style={{ fontSize:11 }}><strong>Horticulture:</strong> {h.done}/{h.total} — Evening watering critical at 5PM</span></div>
        <div style={{ padding: 8, background: C.bBg, borderRadius: 8, display: "flex", gap: 5 }}><span>🧹</span><span style={{ fontSize:11 }}><strong>Housekeeping:</strong> {k.done}/{k.total} — WC recheck at 3:30 PM</span></div>
        <div style={{ padding: 8, background: C.maroonSoft, borderRadius: 8, display: "flex", gap: 5 }}><span>📋</span><span style={{ fontSize:11 }}><strong>Admin:</strong> {a.done}/{a.total} — Daily report to Vicky by 6 PM</span></div>
        <div style={{ padding: 8, background: C.pBg, borderRadius: 8, display: "flex", gap: 5 }}><span>🛡️</span><span style={{ fontSize:11 }}><strong>Security:</strong> {s.done}/{s.total} — CCTV & fire exits check</span></div>
      </div>
    </div>
  );
}

// ─── Dashboard (main export) ──────────────────────────────────────────────────
export default function Dashboard({ tasks, prop, user, lang, att, setView }) {
  const L = LANGS[lang];
  const isMobile = useIsMobile();
  const [leaves, setLeaves] = useState([]);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    supabase.from("leaves").select("*")
      .eq("status", "approved")
      .eq("leave_date", today)
      .then(({ data }) => { if (data) setLeaves(data); });
  }, [today]);

  const deptList = Object.entries(prop?.depts||{}).map(([key, d]) => {
    const dt = tasks.filter(t => t.dept === key);
    const done = dt.filter(t => t.status === "completed").length;
    return { key, ...d, done, total: dt.length, pct: dt.length ? Math.round((done / dt.length) * 100) : 0 };
  });

  const total = tasks.length;
  const done = tasks.filter(t => t.status === "completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ fontFamily: F.b }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.maroon, margin: 0 }}>
            📊 {prop.name}
          </h1>
          <p style={{ fontSize:10, color: C.tl, margin: "2px 0 0" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.red }}>{pct}%</div>
          <div style={{ fontSize:9, color: C.tl }}>{done}/{total} {L.done}</div>
        </div>
      </div>

      {/* ── Fire Safety Widget ── */}
      {setView && <FireSafetyWidget setView={setView} />}

      {/* ── Absent Widget ── */}
      <AbsentWidget att={att} leaves={leaves} prop={prop} today={today} L={L} />

      {/* ── 4 Dept Rings ── */}
      <div style={{
        background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: 14, marginBottom: 12,
        display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 8
      }}>
        {deptList.map(d => (
          <div key={d.key} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "10px 6px", borderRadius: 10,
            background: d.pct === 100 ? C.gBg : d.pct >= 70 ? `${d.c}10` : C.bg,
            border: `1px solid ${d.pct === 100 ? C.green : C.border}`
          }}>
            <Ring pct={d.pct} color={d.c} bg={d.bg} icon={d.i} label={d.n} done={d.done} total={d.total} size={isMobile ? 68 : 78} />
            {d.pct === 100 && <span style={{ fontSize:9, color: C.green, fontWeight: 700, marginTop: 3 }}>✓ Complete</span>}
          </div>
        ))}
      </div>

      {/* ── Critical + Staff Perf ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <CriticalPanel tasks={tasks} L={L} />
        <StaffPerf tasks={tasks} prop={prop} L={L} />
      </div>

      {/* ── Suggestions ── */}
      <Suggestions tasks={tasks} L={L} />
    </div>
  );
}
