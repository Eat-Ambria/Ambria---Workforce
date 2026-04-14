import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function MemberCard({ member, onDeactivate, onRestore, isAdmin, lang, L }) {
  const isActive = member.is_active !== false;
  const days = daysSince(member.joining_date);
  const deptColor = member.deptColor || C.maroon;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "11px 13px",
      background: isActive ? (member.isCustom ? C.bBg : C.white) : C.rBg + "55",
      borderRadius: 10,
      borderLeft: `3px solid ${isActive ? deptColor : C.red}`,
      opacity: isActive ? 1 : 0.65,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: isActive ? deptColor : C.red,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.white, fontWeight: 700, fontSize: 12, flexShrink: 0
      }}>{member.n?.[0] || "?"}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textDecoration: isActive ? "none" : "line-through" }}>
          {member.n}
          {member.isCustom && <span style={{ marginLeft: 5, fontSize: 8, color: C.blue, fontWeight: 600 }}>NEW</span>}
        </div>
        <div style={{ fontSize: 9, color: C.tl }}>
          {member.deptIcon} {member.deptName}
        </div>
        <div style={{ fontSize: 9, color: C.tl, marginTop: 1 }}>
          {isActive ? (
            member.joining_date ? (
              <span>📅 {lang === "hi" ? "जोइनिंग:" : "Joined:"} {formatDate(member.joining_date)}
                {days !== null && <span style={{ marginLeft: 4, color: C.green, fontWeight: 600 }}>({days} {L.daysWithUs})</span>}
              </span>
            ) : <span style={{ color: C.tl }}>No joining date</span>
          ) : (
            <span style={{ color: C.red }}>
              {L.leftOn}: {formatDate(member.left_date || member.leftDate)}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        isActive ? (
          <button onClick={() => onDeactivate(member)} style={{
            padding: "4px 9px", borderRadius: 6, border: "none",
            background: C.rBg, color: C.red, fontFamily: F.b, fontSize: 9, fontWeight: 600, cursor: "pointer", flexShrink: 0
          }}>✕ {L.deactivate}</button>
        ) : (
          <button onClick={() => onRestore(member)} style={{
            padding: "4px 9px", borderRadius: 6, border: "none",
            background: C.gBg, color: C.green, fontFamily: F.b, fontSize: 9, fontWeight: 600, cursor: "pointer", flexShrink: 0
          }}>↩ Restore</button>
        )
      )}
    </div>
  );
}

export default function MembersView({ user, lang, customMembers, setCustomMembers, removedIds, setRemovedIds }) {
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const deptNames = { h: "🌱 Horticulture", k: "🧹 Housekeeping", a: "📋 Admin", s: "🛡️ Security" };

  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState("");
  const [fUser, setFUser] = useState("");
  const [fPass, setFPass] = useState("");
  const [fProp, setFProp] = useState("pp");
  const [fDept, setFDept] = useState("h");
  const [fJoining, setFJoining] = useState("");
  // DB users with joining_date / is_active
  const [dbUsers, setDbUsers] = useState({});
  const [tab, setTab] = useState("active");

  useEffect(() => {
    supabase.from("users").select("id,joining_date,is_active,left_date")
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(u => { map[u.id] = u; });
          setDbUsers(map);
        }
      });
  }, []);

  const addMember = async () => {
    if (!fName.trim() || !fUser.trim()) return;
    const uname = fUser.trim().toLowerCase();
    const pass = fPass || uname + "@123";
    const id = `${fProp}_${uname}`;
    const newM = { id, n: fName.trim(), u: uname, p: pass, prop: fProp, dept: fDept, role: "e", joining_date: fJoining || null, is_active: true };
    const { error } = await supabase.from("users").insert({
      id, username: uname, password: pass, name: fName.trim(),
      role: "e", property: fProp, department: fDept,
      joining_date: fJoining || null, is_active: true,
    });
    if (error) {
      // ID conflict — use timestamp fallback
      const altId = `${fProp}_${uname}_${Date.now()}`;
      await supabase.from("users").insert({ ...newM, id: altId, username: altId });
      setCustomMembers(prev => [...prev, { ...newM, id: altId }]);
    } else {
      setCustomMembers(prev => [...prev, newM]);
    }
    setFName(""); setFUser(""); setFPass(""); setFJoining(""); setShowAdd(false);
  };

  const handleDeactivate = async (member) => {
    const today = new Date().toISOString().split("T")[0];
    if (member.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: false, left_date: today } : m));
    } else {
      setRemovedIds(prev => [...prev, member.id]);
      await supabase.from("users").update({ is_active: false, left_date: today }).eq("id", member.id);
      setDbUsers(prev => ({ ...prev, [member.id]: { ...prev[member.id], is_active: false, left_date: today } }));
    }
  };

  const handleRestore = async (member) => {
    if (member.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: true, left_date: null } : m));
    } else {
      setRemovedIds(prev => prev.filter(x => x !== member.id));
      await supabase.from("users").update({ is_active: true, left_date: null }).eq("id", member.id);
      setDbUsers(prev => ({ ...prev, [member.id]: { ...prev[member.id], is_active: true, left_date: null } }));
    }
  };

  // Build member list per property
  const allByProp = {};
  Object.entries(PROPS).forEach(([pk, p]) => {
    allByProp[pk] = { prop: p, members: [] };
    Object.entries(p?.depts||{}).forEach(([dk, d]) => {
      d.m.forEach(m => {
        const dbInfo = dbUsers[m.id] || {};
        const isRemoved = removedIds.includes(m.id) || dbInfo.is_active === false;
        allByProp[pk].members.push({
          ...m, dept: dk, deptName: d.n, deptIcon: d.i, deptColor: d.c,
          isCustom: false, is_active: !isRemoved,
          joining_date: dbInfo.joining_date || null,
          left_date: dbInfo.left_date || null,
        });
      });
    });
  });
  customMembers.forEach(cm => {
    if (!allByProp[cm.prop]) return;
    const d = PROPS[cm.prop]?.depts?.[cm.dept];
    allByProp[cm.prop].members.push({
      ...cm, deptName: d?.n || cm.dept, deptIcon: d?.i || "", deptColor: d?.c || C.blue, isCustom: true,
    });
  });

  const allMembers = Object.values(allByProp).flatMap(({ members }) => members);
  const activeCount = allMembers.filter(m => m.is_active).length;
  const pastCount = allMembers.filter(m => !m.is_active).length;

  return (
    <div style={{ fontFamily: F.b }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: 0 }}>
            👤 {L.members}
          </h1>
          <p style={{ fontSize: 10, color: C.tl, margin: "3px 0 0" }}>
            {activeCount} active · {pastCount} past
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(!showAdd)} style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: C.maroon, color: C.white, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer"
          }}>➕ {L.addMember}</button>
        )}
      </div>

      {/* ── Add Form ── */}
      {showAdd && (
        <div style={{ background: C.white, borderRadius: 12, border: `2px solid ${C.maroon}`, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>➕ {L.addMember}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder={L.memberName} value={fName} onChange={e => setFName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, outline: "none" }} />
            <input placeholder="Username" value={fUser} onChange={e => setFUser(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, outline: "none" }} />
            <input placeholder="Password (auto: user@123)" value={fPass} onChange={e => setFPass(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, outline: "none" }} />
            <div>
              <label style={{ fontSize: 10, color: C.tl, display: "block", marginBottom: 3 }}>📅 {L.joiningDate}</label>
              <input type="date" value={fJoining} onChange={e => setFJoining(e.target.value)}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, boxSizing: "border-box" }} />
            </div>
            <select value={fProp} onChange={e => setFProp(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12 }}>
              {Object.entries(PROPS).map(([k, p]) => <option key={k} value={k}>{p.icon} {p.sn}</option>)}
            </select>
            <select value={fDept} onChange={e => setFDept(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12 }}>
              {Object.entries(deptNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={addMember} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{L.save}</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: F.b, fontSize: 13, cursor: "pointer" }}>{L.cancel}</button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14, background: C.maroonSoft, borderRadius: 10, padding: 3, width: "fit-content" }}>
        {[
          { id: "active", label: `${L.activeMembers} (${activeCount})` },
          { id: "past", label: `${L.pastMembers} (${pastCount})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: F.b, fontSize: 11, fontWeight: 600,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Members by Property ── */}
      {Object.entries(allByProp).map(([pk, { prop, members }]) => {
        const filtered = members.filter(m => tab === "active" ? m.is_active : !m.is_active);
        if (filtered.length === 0) return null;
        return (
          <div key={pk} style={{ background: C.white, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 12 }}>
            <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
              {prop.icon} {prop.sn}
              <span style={{ fontSize: 12, fontWeight: 400, color: C.tl, marginLeft: 6 }}>
                ({filtered.length} {tab === "active" ? "active" : "past"})
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 7 }}>
              {filtered.map(m => (
                <MemberCard key={m.id} member={m}
                  onDeactivate={handleDeactivate} onRestore={handleRestore}
                  isAdmin={isAdmin} lang={lang} L={L} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
