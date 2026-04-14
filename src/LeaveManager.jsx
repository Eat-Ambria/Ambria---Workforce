import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS } from "./constants.js";

// leaves table: id, user_id, user_name, leave_date, leave_type, reason, status, approved_by

const LEAVE_TYPES = [
  { id: "casual", enLabel: "Casual", hiLabel: "आकस्मिक", color: C.blue, icon: "🏖️" },
  { id: "sick", enLabel: "Sick", hiLabel: "बीमारी", color: C.red, icon: "🤒" },
  { id: "other", enLabel: "Other", hiLabel: "अन्य", color: C.tl, icon: "📝" },
];

const STATUS_MAP = {
  pending: { label: "Pending", hiLabel: "लंबित", color: C.yellow, bg: C.yBg, icon: "⏳" },
  approved: { label: "Approved", hiLabel: "मंज़ूर", color: C.green, bg: C.gBg, icon: "✅" },
  rejected: { label: "Rejected", hiLabel: "नामंज़ूर", color: C.red, bg: C.rBg, icon: "❌" },
};

function LeaveCard({ leave, user, onApprove, onReject, lang, L }) {
  const st = STATUS_MAP[leave.status] || STATUS_MAP.pending;
  const lt = LEAVE_TYPES.find(t => t.id === leave.leave_type) || LEAVE_TYPES[2];
  const isAdmin = user.role === "sa" || user.role === "a";

  return (
    <div style={{
      background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${lt.color}`, padding: "12px 14px"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", background: lt.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.white, fontSize: 10, fontWeight: 700, flexShrink: 0
            }}>{leave.user_name?.[0] || "?"}</div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{leave.user_name}</span>
            <span style={{ padding: "2px 7px", borderRadius: 5, background: lt.color + "20", color: lt.color, fontSize: 10, fontWeight: 600 }}>
              {lt.icon} {lang === "hi" ? lt.hiLabel : lt.enLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>
            📅 {leave.leave_date ? new Date(leave.leave_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </div>
          {leave.reason && (
            <div style={{ fontSize: 10, color: C.tl, fontStyle: "italic" }}>"{leave.reason}"</div>
          )}
          {leave.approved_by && (
            <div style={{ fontSize: 9, color: C.tl, marginTop: 3 }}>By: {leave.approved_by}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
            {st.icon} {lang === "hi" ? st.hiLabel : st.label}
          </span>
          {isAdmin && leave.status === "pending" && (
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => onApprove(leave.id)} style={{
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: C.green, color: C.white, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer"
              }}>✓ {L.approve}</button>
              <button onClick={() => onReject(leave.id)} style={{
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: C.red, color: C.white, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer"
              }}>✗ {L.reject}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeaveManager({ prop, user, lang }) {
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const today = new Date().toISOString().split("T")[0];

  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leave_type: "casual",
    reason: "",
    leave_date: today,
  });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState(isAdmin ? "pending" : "my");

  const loadLeaves = async () => {
    setLoading(true);
    // leaves table has: id, user_id, user_name, leave_date, leave_type, reason, status, approved_by
    let q = supabase.from("leaves").select("*").order("leave_date", { ascending: false });
    if (!isAdmin) {
      q = q.eq("user_id", user.id);
    }
    const { data } = await q;
    if (data) setLeaves(data);
    setLoading(false);
  };

  useEffect(() => { loadLeaves(); }, [user.id]);

  const submitLeave = async () => {
    if (!form.leave_date) return;
    setSubmitting(true);
    const { error } = await supabase.from("leaves").insert({
      user_id: user.id,
      user_name: user.name,
      leave_date: form.leave_date,
      leave_type: form.leave_type,
      reason: form.reason.trim(),
      status: "pending",
    });
    if (!error) {
      setForm({ leave_type: "casual", reason: "", leave_date: today });
      setShowForm(false);
      loadLeaves();
    }
    setSubmitting(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from("leaves").update({ status, approved_by: user.name }).eq("id", id);
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status, approved_by: user.name } : l));
  };

  const pending = leaves.filter(l => l.status === "pending");
  const todayLeaves = leaves.filter(l => l.status === "approved" && l.leave_date === today);
  const myLeaves = leaves.filter(l => l.user_id === user.id);

  const tabs = isAdmin
    ? [
        { id: "pending", label: `${L.pendingLeaves} (${pending.length})` },
        { id: "today", label: `Today On Leave (${todayLeaves.length})` },
        { id: "all", label: "All Requests" }
      ]
    : [{ id: "my", label: L.myLeaves }];

  const displayed = tab === "pending" ? pending
    : tab === "today" ? todayLeaves
    : tab === "my" ? myLeaves
    : leaves;

  return (
    <div style={{ fontFamily: F.b }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: 0 }}>
            🏖️ {L.leaveRequest}
          </h1>
          <p style={{ fontSize: 10, color: C.tl, margin: "3px 0 0" }}>{prop?.name}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "8px 14px", borderRadius: 8, border: "none",
          background: C.maroon, color: C.white, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer"
        }}>➕ {L.applyLeave}</button>
      </div>

      {/* ── Apply Form ── */}
      {showForm && (
        <div style={{
          background: C.white, borderRadius: 12, border: `2px solid ${C.maroon}`,
          padding: 16, marginBottom: 16
        }}>
          <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>
            📝 {L.applyLeave}
          </div>

          {/* Leave type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 6 }}>{L.leaveType}</label>
            <div style={{ display: "flex", gap: 6 }}>
              {LEAVE_TYPES.map(t => (
                <button key={t.id} onClick={() => setForm({ ...form, leave_type: t.id })} style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8,
                  border: `2px solid ${form.leave_type === t.id ? t.color : C.border}`,
                  background: form.leave_type === t.id ? t.color + "15" : C.white,
                  cursor: "pointer", fontFamily: F.b, fontSize: 11, fontWeight: 600,
                  color: form.leave_type === t.id ? t.color : C.tl
                }}>{t.icon} {lang === "hi" ? t.hiLabel : t.enLabel}</button>
              ))}
            </div>
          </div>

          {/* Single date */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>📅 {L.fromDate}</label>
            <input type="date" value={form.leave_date} min={today}
              onChange={e => setForm({ ...form, leave_date: e.target.value })}
              style={{ padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12 }} />
          </div>

          {/* Reason */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.leaveReason}</label>
            <textarea placeholder={lang === "hi" ? "कारण बताएं..." : "Reason for leave..."} value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, minHeight: 50, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitLeave} disabled={submitting} style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: submitting ? "#9A2E42" : C.maroon, color: C.white,
              fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer"
            }}>{submitting ? "..." : L.send} →</button>
            <button onClick={() => setShowForm(false)} style={{
              padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg, fontFamily: F.b, fontSize: 13, cursor: "pointer"
            }}>{L.cancel}</button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14, background: C.maroonSoft, borderRadius: 10, padding: 3, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: F.b, fontSize: 11, fontWeight: 600,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Leave Cards ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: C.tl, fontSize: 12 }}>Loading...</div>
      ) : displayed.length === 0 ? (
        <div style={{ background: C.white, borderRadius: 12, padding: 24, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 28 }}>🏖️</div>
          <div style={{ fontFamily: F.d, fontSize: 14, fontWeight: 700, marginTop: 4, color: C.tl }}>{L.noLeaves}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayed.map(l => (
            <LeaveCard key={l.id} leave={l} user={user}
              onApprove={id => updateStatus(id, "approved")}
              onReject={id => updateStatus(id, "rejected")}
              lang={lang} L={L} />
          ))}
        </div>
      )}
    </div>
  );
}
