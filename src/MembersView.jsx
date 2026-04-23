import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";
import { notifyMultiple, getSAIds } from "./notifications.js";
import { useIsMobile } from "./hooks.js";

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

const DEPT_NAMES = { h: "🌱 Horticulture", k: "🧹 Housekeeping", a: "📋 Admin", s: "🛡️ Security" };

function EditMemberModal({ member, onSave, onClose, L, currentUser }) {
  const [form, setForm] = useState({
    name: member.n || "",
    joining_date: member.joining_date || "",
    phone: member.phone || "",
    department: member.dept || "h",
    property: member.prop || "pp",
  });
  const [saving, setSaving] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const isSA = currentUser?.role === "sa";

  useEffect(() => {
    if (!isSA) return;
    supabase.from("users").select("password").eq("id", member.id).single()
      .then(({ data }) => { if (data) setCurPass(data.password || ""); });
  }, [member.id, isSA]);

  const save = async () => {
    setSaving(true);
    const updates = {
      name: form.name.trim() || undefined,
      joining_date: form.joining_date || null,
      phone: form.phone.trim() || null,
      department: form.department,
      property: form.property,
    };
    await supabase.from("users").update(updates).eq("id", member.id);
    onSave({ ...member, n: form.name.trim() || member.n, joining_date: form.joining_date || null, phone: form.phone.trim() || null, dept: form.department, prop: form.property });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 14 }}>✏️ Edit Member</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Full Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>📅 Joining Date</label>
            <input type="date" value={form.joining_date || ""} onChange={e => setForm({ ...form, joining_date: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>📱 Phone</label>
            <input type="tel" placeholder="e.g. 9876543210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12 }}>
              {Object.entries(DEPT_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Property</label>
            <select value={form.property} onChange={e => setForm({ ...form, property: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12 }}>
              {Object.entries(PROPS).map(([k, p]) => <option key={k} value={k}>{p.icon} {p.sn}</option>)}
            </select>
          </div>
          {isSA && (
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>🔑 Current Password</label>
              <div style={{ position: "relative" }}>
                <input readOnly type={showPass ? "text" : "password"} value={curPass}
                  style={{ width: "100%", padding: "9px 36px 9px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", background: C.bg, color: C.tl }} />
                <button onClick={() => setShowPass(s => !s)}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize:14 }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
              <div style={{ fontSize:9, color: C.tl, marginTop: 3 }}>Read-only — use 🔑 Password button to change</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Saving..." : "💾 Save"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer" }}>{L.cancel}</button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ member, currentUser, onClose }) {
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentUser.role !== "sa") { setLoading(false); return; }
    supabase.from("users").select("password").eq("id", member.id).single()
      .then(({ data }) => {
        if (data) setCurPass(data.password || "");
        setLoading(false);
      });
  }, [member.id]);

  if (currentUser.role !== "sa") return null;

  const generate = () => {
    const p = "Ambria@" + Math.floor(1000 + Math.random() * 9000);
    setNewPass(p);
    setConfirmPass(p);
    setError("");
  };

  const save = async () => {
    if (newPass.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (newPass !== confirmPass) { setError("Passwords do not match"); return; }
    setSaving(true);
    const { error: e } = await supabase.from("users").update({ password: newPass }).eq("id", member.id);
    if (e) { setError("Failed to save. Try again."); setSaving(false); return; }
    getSAIds().then(ids => notifyMultiple("password_changed", `🔑 Password changed for ${member.n}`, currentUser.id, currentUser.name, ids, member.prop));
    setToast("Password updated successfully!");
    setTimeout(onClose, 1500);
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 14 }}>🔑 Change Password — {member.n}</div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: C.tl, fontSize:12 }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Current Password</label>
              <div style={{ position: "relative" }}>
                <input readOnly type={showCur ? "text" : "password"} value={curPass}
                  style={{ width: "100%", padding: "9px 36px 9px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", background: C.bg, color: C.tl }} />
                <button onClick={() => setShowCur(s => !s)}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize:14 }}>
                  {showCur ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>New Password</label>
              <div style={{ position: "relative" }}>
                <input type={showNew ? "text" : "password"} value={newPass}
                  onChange={e => { setNewPass(e.target.value); setError(""); }}
                  placeholder="Min 6 characters"
                  style={{ width: "100%", padding: "9px 36px 9px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", outline: "none" }} />
                <button onClick={() => setShowNew(s => !s)}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize:14 }}>
                  {showNew ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Confirm Password</label>
              <div style={{ position: "relative" }}>
                <input type={showConfirm ? "text" : "password"} value={confirmPass}
                  onChange={e => { setConfirmPass(e.target.value); setError(""); }}
                  style={{ width: "100%", padding: "9px 36px 9px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", outline: "none" }} />
                <button onClick={() => setShowConfirm(s => !s)}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize:14 }}>
                  {showConfirm ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <button onClick={generate}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.maroon}`, background: C.maroonSoft, color: C.maroon, fontFamily: F.b, fontSize:12, fontWeight: 700, cursor: "pointer" }}>
              ⚡ Generate (Ambria@XXXX)
            </button>
            {error && (
              <div style={{ fontSize:11, color: C.red, fontWeight: 600, background: C.rBg, padding: "6px 10px", borderRadius: 6 }}>{error}</div>
            )}
            {toast && (
              <div style={{ fontSize:11, color: C.green, fontWeight: 700, background: C.gBg, padding: "6px 10px", borderRadius: 6 }}>{toast}</div>
            )}
          </div>
        )}
        {!toast && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={save} disabled={saving || loading}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: saving || loading ? "not-allowed" : "pointer", opacity: saving || loading ? 0.7 : 1 }}>
              {saving ? "Saving..." : "💾 Save Password"}
            </button>
            <button onClick={onClose}
              style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BulkResetModal({ currentUser, onClose }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  if (currentUser.role !== "sa") return null;

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    const { data, error: e } = await supabase.from("users").select("id, username, role").eq("role", "e");
    if (e || !data) { setError("Failed to fetch users. Try again."); setProgress(null); return; }
    setProgress({ done: 0, total: data.length });
    let done = 0;
    for (const u of data) {
      const newPass = (u.username || u.id) + "@123";
      await supabase.from("users").update({ password: newPass }).eq("id", u.id);
      done++;
      setProgress({ done, total: data.length });
    }
    setProgress("done");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>🔑 Reset All Staff Passwords</div>

        {progress === null && (
          <>
            <p style={{ fontSize:12, color: C.tl, margin: "0 0 12px", lineHeight: 1.6 }}>
              Resets all <strong>Employee</strong> passwords to <code style={{ background: C.bg, padding: "2px 6px", borderRadius: 4, fontSize:11 }}>username@123</code>. Admin and SA accounts are not affected.
            </p>
            <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize:11, color: "#92400E", lineHeight: 1.5 }}>
              ⚠️ This cannot be undone. Employees will need the new default password to log in.
            </div>
            {error && <div style={{ fontSize:11, color: C.red, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer" }}>
                🔑 Reset All
              </button>
              <button onClick={onClose}
                style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {progress !== null && progress !== "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize:28, marginBottom: 10 }}>🔄</div>
            <div style={{ fontSize:14, fontWeight: 700, color: C.maroon }}>Resetting passwords...</div>
            <div style={{ fontSize:13, color: C.tl, marginTop: 6, fontWeight: 600 }}>
              {progress.done} / {progress.total} done
            </div>
            <div style={{ marginTop: 12, background: C.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", background: C.maroon, width: `${progress.total ? (progress.done / progress.total * 100) : 0}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        )}

        {progress === "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize:36, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize:14, fontWeight: 700, color: C.green }}>All passwords reset successfully!</div>
            <div style={{ fontSize:11, color: C.tl, marginTop: 6 }}>Staff can now log in with username@123</div>
            <button onClick={onClose}
              style={{ marginTop: 16, padding: "10px 28px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberCard({ member, onDeactivate, onRestore, onEdit, onPassword, isAdmin, saUser, lang, L, isMobile }) {
  const isActive = member.is_active !== false;
  const days = daysSince(member.joining_date);
  const deptColor = member.deptColor || C.maroon;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: isMobile ? "13px 12px" : "11px 13px",
      background: isActive ? (member.isCustom ? C.bBg : C.white) : C.rBg + "55",
      borderRadius: 10,
      borderLeft: `3px solid ${isActive ? deptColor : C.red}`,
      opacity: isActive ? 1 : 0.65,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: isActive ? deptColor : C.red,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.white, fontWeight: 700, fontSize:12, flexShrink: 0
      }}>{member.n?.[0] || "?"}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize:12, fontWeight: 700, textDecoration: isActive ? "none" : "line-through" }}>
          {member.n}
          {member.isCustom && <span style={{ marginLeft: 5, fontSize:9, color: C.blue, fontWeight: 600 }}>NEW</span>}
        </div>
        <div style={{ fontSize:9, color: C.tl }}>
          {member.deptIcon} {member.deptName}
          {member.phone && <span style={{ marginLeft: 6 }}>📱 {member.phone}</span>}
        </div>
        <div style={{ fontSize:9, color: C.tl, marginTop: 1 }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(member)} style={{
            padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.bg, color: C.tl, fontFamily: F.b, fontSize:9, fontWeight: 600, cursor: "pointer"
          }}>✏️ Edit</button>
          {saUser?.role === "sa" && (
            <button onClick={() => onPassword(member)} style={{
              padding: "3px 8px", borderRadius: 6, border: "1px solid #E0C0C8",
              background: "#FDF2F4", color: C.maroon, fontFamily: F.b, fontSize:9, fontWeight: 600, cursor: "pointer"
            }}>🔑 Pwd</button>
          )}
          {isActive ? (
            <button onClick={() => onDeactivate(member)} style={{
              padding: "3px 8px", borderRadius: 6, border: "none",
              background: C.rBg, color: C.red, fontFamily: F.b, fontSize:9, fontWeight: 600, cursor: "pointer"
            }}>✕ {L.deactivate}</button>
          ) : (
            <button onClick={() => onRestore(member)} style={{
              padding: "3px 8px", borderRadius: 6, border: "none",
              background: C.gBg, color: C.green, fontFamily: F.b, fontSize:9, fontWeight: 600, cursor: "pointer"
            }}>↩ Restore</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MembersView({ user, lang, customMembers, setCustomMembers, removedIds, setRemovedIds }) {
  const isMobile = useIsMobile();
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const isSA = user.role === "sa";

  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState("");
  const [fUser, setFUser] = useState("");
  const [fPass, setFPass] = useState("");
  const [fProp, setFProp] = useState("pp");
  const [fDept, setFDept] = useState("h");
  const [fJoining, setFJoining] = useState("");
  const [dbUsers, setDbUsers] = useState({});
  const [tab, setTab] = useState("active");
  const [filterProp, setFilterProp] = useState("all");
  const [editingMember, setEditingMember] = useState(null);
  const [passwordMember, setPasswordMember] = useState(null);
  const [showBulkReset, setShowBulkReset] = useState(false);

  useEffect(() => {
    supabase.from("users").select("id,joining_date,is_active,left_date,phone,name")
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
      const altId = `${fProp}_${uname}_${Date.now()}`;
      await supabase.from("users").insert({ id: altId, username: altId, password: pass, name: fName.trim(), role: "e", property: fProp, department: fDept, joining_date: fJoining || null, is_active: true });
      setCustomMembers(prev => [...prev, { ...newM, id: altId }]);
    } else {
      setCustomMembers(prev => [...prev, newM]);
    }
    getSAIds().then(ids => notifyMultiple("member_added", "👤 New member added: " + fName.trim() + " (" + fDept + " — " + fProp + ")", user.id, user.name, ids, fProp));
    setFName(""); setFUser(""); setFPass(""); setFJoining(""); setShowAdd(false);
  };

  const handleDeactivate = async (member) => {
    const today = new Date().toISOString().split("T")[0];
    getSAIds().then(ids => notifyMultiple("member_removed", "👤 Member deactivated: " + (member.n || member.name || ""), user.id, user.name, ids, member.prop || member.property || null));
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

  const handleEditSave = (updated) => {
    if (updated.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === updated.id ? { ...m, n: updated.n, joining_date: updated.joining_date, phone: updated.phone, dept: updated.dept, prop: updated.prop } : m));
    } else {
      setDbUsers(prev => ({ ...prev, [updated.id]: { ...prev[updated.id], joining_date: updated.joining_date, phone: updated.phone, name: updated.n } }));
    }
    setEditingMember(null);
  };

  // Build member list per property
  const allByProp = {};
  Object.entries(PROPS).forEach(([pk, p]) => {
    allByProp[pk] = { prop: p, members: [] };
    Object.entries(p?.depts || {}).forEach(([dk, d]) => {
      d.m.forEach(m => {
        const dbInfo = dbUsers[m.id] || {};
        const isRemoved = removedIds.includes(m.id) || dbInfo.is_active === false;
        allByProp[pk].members.push({
          ...m, dept: dk, deptName: d.n, deptIcon: d.i, deptColor: d.c,
          isCustom: false, is_active: !isRemoved,
          joining_date: dbInfo.joining_date || null,
          left_date: dbInfo.left_date || null,
          phone: dbInfo.phone || null,
          n: dbInfo.name || m.n,
          prop: pk,
        });
      });
    });
  });
  customMembers.forEach(cm => {
    if (!allByProp[cm.prop]) return;
    const d = PROPS[cm.prop]?.depts?.[cm.dept];
    const dbInfo = dbUsers[cm.id] || {};
    allByProp[cm.prop].members.push({
      ...cm, deptName: d?.n || cm.dept, deptIcon: d?.i || "", deptColor: d?.c || C.blue, isCustom: true,
      phone: dbInfo.phone || cm.phone || null,
    });
  });

  const allMembers = Object.values(allByProp).flatMap(({ members }) => members);
  const activeCount = allMembers.filter(m => m.is_active).length;
  const pastCount = allMembers.filter(m => !m.is_active).length;

  const propFilters = [
    { id: "all", label: "All" },
    ...Object.entries(PROPS).map(([k, p]) => ({ id: k, label: `${p.icon} ${p.sn}` })),
  ];

  return (
    <div style={{ fontFamily: F.b }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.maroon, margin: 0 }}>
            👤 {L.members}
          </h1>
          <p style={{ fontSize:10, color: C.tl, margin: "3px 0 0" }}>
            {activeCount} active · {pastCount} past
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isSA && (
            <button onClick={() => setShowBulkReset(true)} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #E0C0C8",
              background: "#FDF2F4", color: C.maroon, fontFamily: F.b, fontSize:12, fontWeight: 700, cursor: "pointer"
            }}>🔑 Reset All Passwords</button>
          )}
          {isAdmin && (
            <button onClick={() => setShowAdd(!showAdd)} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: C.maroon, color: C.white, fontFamily: F.b, fontSize:12, fontWeight: 700, cursor: "pointer"
            }}>➕ {L.addMember}</button>
          )}
        </div>
      </div>

      {/* ── Property Filter ── */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
        {propFilters.map(f => (
          <button key={f.id} onClick={() => setFilterProp(f.id)} style={{
            padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: F.b, fontSize:11, fontWeight: 600,
            border: filterProp === f.id ? `2px solid ${C.maroon}` : `1px solid ${C.border}`,
            background: filterProp === f.id ? C.maroonSoft : C.white,
            color: filterProp === f.id ? C.maroon : C.tl,
          }}>{f.label}</button>
        ))}
      </div>

      {/* ── Add Form ── */}
      {showAdd && (
        <div style={{ background: C.white, borderRadius: 12, border: `2px solid ${C.maroon}`, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>➕ {L.addMember}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            <input placeholder={L.memberName} value={fName} onChange={e => setFName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, outline: "none" }} />
            <input placeholder="Username" value={fUser} onChange={e => setFUser(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, outline: "none" }} />
            <input type="password" placeholder="Password (auto: user@123)" value={fPass} onChange={e => setFPass(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, outline: "none" }} />
            <div>
              <label style={{ fontSize:10, color: C.tl, display: "block", marginBottom: 3 }}>📅 {L.joiningDate}</label>
              <input type="date" value={fJoining} onChange={e => setFJoining(e.target.value)}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
            </div>
            <select value={fProp} onChange={e => setFProp(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12 }}>
              {Object.entries(PROPS).map(([k, p]) => <option key={k} value={k}>{p.icon} {p.sn}</option>)}
            </select>
            <select value={fDept} onChange={e => setFDept(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12 }}>
              {Object.entries(DEPT_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexDirection: isMobile ? "column" : "row" }}>
            <button onClick={addMember} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>{L.save}</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>{L.cancel}</button>
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
            fontFamily: F.b, fontSize:11, fontWeight: 600,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Members by Property ── */}
      {Object.entries(allByProp)
        .filter(([pk]) => filterProp === "all" || pk === filterProp)
        .map(([pk, { prop, members }]) => {
          const filtered = members.filter(m => tab === "active" ? m.is_active : !m.is_active);
          if (filtered.length === 0) return null;
          return (
            <div key={pk} style={{ background: C.white, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
                {prop.icon} {prop.sn}
                <span style={{ fontSize:12, fontWeight: 400, color: C.tl, marginLeft: 6 }}>
                  ({filtered.length} {tab === "active" ? "active" : "past"})
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gap: 7 }}>
                {filtered.map(m => (
                  <MemberCard key={m.id} member={m}
                    onDeactivate={handleDeactivate} onRestore={handleRestore}
                    onEdit={setEditingMember} onPassword={setPasswordMember}
                    isAdmin={isAdmin} saUser={user} lang={lang} L={L} isMobile={isMobile} />
                ))}
              </div>
            </div>
          );
        })}

      {/* ── Edit Modal ── */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onSave={handleEditSave}
          onClose={() => setEditingMember(null)}
          L={L}
          currentUser={user}
        />
      )}

      {/* ── Password Modal ── */}
      {passwordMember && (
        <PasswordModal
          member={passwordMember}
          currentUser={user}
          onClose={() => setPasswordMember(null)}
        />
      )}

      {/* ── Bulk Reset Modal ── */}
      {showBulkReset && (
        <BulkResetModal
          currentUser={user}
          onClose={() => setShowBulkReset(false)}
        />
      )}
    </div>
  );
}
