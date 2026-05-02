import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C as C_BASE, F, LANGS, PROPS, ALL_DEPARTMENTS, OFFICE_DEPTS, ACCESS_SECTIONS } from "./constants.js";
const C = C_BASE;
import { useT } from "./ThemeContext.js";
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
  return new Date(dateStr).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

function getDeptMeta(deptId) {
  return ALL_DEPARTMENTS.find(d => d.id === deptId) || { name: deptId, nameHi: deptId, icon: "📁", color: "#6B7280" };
}

// ─── Access Modal ────────────────────────────────────────────────────────────
function AccessModal({ member, lang, onSave, onClose }) {
  const C = useT();
  const H = lang === "hi";
  const [access, setAccess] = useState(member.access || []);
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setAccess(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const save = async () => {
    setSaving(true);
    await supabase.from("users").update({ access }).eq("id", member.id);
    onSave({ ...member, access });
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:380, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:6 }}>🔐 Access — {member.n}</div>
        <p style={{ fontSize:11, color:C.tl, marginBottom:14 }}>Select which sections this person can access.</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {ACCESS_SECTIONS.map(s => {
            const on = access.includes(s.id);
            return (
              <label key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, border:`1px solid ${on ? C.maroon : C.border}`, background:on ? C.maroonSoft : C.bg, cursor:"pointer" }}>
                <div onClick={() => toggle(s.id)} style={{ width:16, height:16, borderRadius:4, border:`2px solid ${on ? C.maroon : C.border}`, background:on ? C.maroon : C.white, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}>
                  {on && <span style={{ color:C.white, fontSize:10, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:11, fontWeight:on ? 700 : 400, color:on ? C.maroon : C.tl }}>{H ? s.labelHi : s.label}</span>
              </label>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={save} disabled={saving} style={{ flex:1, padding:10, borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {saving ? "Saving..." : "💾 Save Access"}
          </button>
          <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ member, onDeleted, onClose }) {
  const C = useT();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const doDelete = async () => {
    if (typed !== "DELETE") { setError("Type DELETE (uppercase) to confirm"); return; }
    setDeleting(true);
    const { error: e } = await supabase.from("users").delete().eq("id", member.id);
    if (e) { setError("Delete failed: " + e.message); setDeleting(false); return; }
    onDeleted(member.id);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:360 }}>
        <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.red, marginBottom:10 }}>⚠️ Permanent Delete</div>
        <div style={{ background:C.rBg, border:`1px solid ${C.red}`, borderRadius:8, padding:"10px 12px", fontSize:12, color:C.red, marginBottom:14, lineHeight:1.6 }}>
          This will permanently delete <strong>{member.n}</strong> and all their data. This cannot be undone.
        </div>
        <div style={{ fontSize:12, color:C.tl, marginBottom:6 }}>Type <strong>DELETE</strong> to confirm:</div>
        <input
          value={typed}
          onChange={e => { setTyped(e.target.value); setError(""); }}
          placeholder="DELETE"
          style={{ width:"100%", padding:10, borderRadius:8, border:`2px solid ${typed === "DELETE" ? C.red : C.border}`, fontFamily:F.b, fontSize:13, boxSizing:"border-box", outline:"none", letterSpacing:2 }}
        />
        {error && <div style={{ fontSize:11, color:C.red, marginTop:6 }}>{error}</div>}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button
            onClick={doDelete}
            disabled={deleting || typed !== "DELETE"}
            style={{ flex:1, padding:10, borderRadius:8, border:"none", background:typed === "DELETE" ? C.red : C.border, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:typed === "DELETE" ? "pointer" : "not-allowed", opacity: deleting ? 0.7 : 1 }}
          >
            {deleting ? "Deleting..." : "🗑️ Delete Forever"}
          </button>
          <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Member Modal ────────────────────────────────────────────────────────
function EditMemberModal({ member, onSave, onClose, L, currentUser }) {
  const C = useT();
  const [form, setForm] = useState({
    name: member.n || "",
    joining_date: member.joining_date || "",
    phone: member.phone || "",
    department: member.dept || "h",
    property: member.prop || "pp",
    designation: member.designation || "",
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
    await supabase.from("users").update({
      name: form.name.trim() || undefined,
      joining_date: form.joining_date || null,
      phone: form.phone.trim() || null,
      department: form.department,
      property: form.property,
      designation: form.designation.trim() || null,
    }).eq("id", member.id);
    onSave({ ...member, n: form.name.trim() || member.n, joining_date: form.joining_date || null, phone: form.phone.trim() || null, dept: form.department, prop: form.property, designation: form.designation.trim() || null });
    setSaving(false);
  };

  const propOpts = [{ id:"all", sn:"All Properties", icon:"🏢" }, ...Object.values(PROPS)];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:360, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:14 }}>✏️ Edit Member</div>
        <div style={{ display:"grid", gap:10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Full Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>💼 Designation</label>
            <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Sales Executive"
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>📅 Joining Date</label>
            <input type="date" value={form.joining_date || ""} onChange={e => setForm({ ...form, joining_date: e.target.value })}
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>📱 Phone</label>
            <input type="tel" placeholder="e.g. 9876543210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
              {ALL_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Property</label>
            <select value={form.property} onChange={e => setForm({ ...form, property: e.target.value })}
              style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
              {propOpts.map(p => <option key={p.id} value={p.id}>{p.icon} {p.sn}</option>)}
            </select>
          </div>
          {isSA && (
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>🔑 Current Password</label>
              <div style={{ position:"relative" }}>
                <input readOnly type={showPass ? "text" : "password"} value={curPass}
                  style={{ width:"100%", padding:"9px 36px 9px 9px", borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", background:C.bg, color:C.tl }} />
                <button onClick={() => setShowPass(s => !s)}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"none", cursor:"pointer", fontSize:14 }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
              <div style={{ fontSize:9, color:C.tl, marginTop:3 }}>Read-only — use 🔑 Password button to change</div>
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={save} disabled={saving} style={{ flex:1, padding:10, borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {saving ? "Saving..." : "💾 Save"}
          </button>
          <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>{L.cancel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Password Modal ───────────────────────────────────────────────────────────
function PasswordModal({ member, currentUser, onClose }) {
  const C = useT();
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
      .then(({ data }) => { if (data) setCurPass(data.password || ""); setLoading(false); });
  }, [member.id]);

  if (currentUser.role !== "sa") return null;

  const generate = () => { const p = "Ambria@" + Math.floor(1000 + Math.random() * 9000); setNewPass(p); setConfirmPass(p); setError(""); };

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
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:360 }}>
        <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:14 }}>🔑 Change Password — {member.n}</div>
        {loading ? (
          <div style={{ textAlign:"center", padding:20, color:C.tl, fontSize:12 }}>Loading...</div>
        ) : (
          <div style={{ display:"grid", gap:10 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Current Password</label>
              <div style={{ position:"relative" }}>
                <input readOnly type={showCur ? "text" : "password"} value={curPass}
                  style={{ width:"100%", padding:"9px 36px 9px 9px", borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", background:C.bg, color:C.tl }} />
                <button onClick={() => setShowCur(s => !s)} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"none", cursor:"pointer", fontSize:14 }}>{showCur ? "🙈" : "👁"}</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>New Password</label>
              <div style={{ position:"relative" }}>
                <input type={showNew ? "text" : "password"} value={newPass} onChange={e => { setNewPass(e.target.value); setError(""); }} placeholder="Min 6 characters"
                  style={{ width:"100%", padding:"9px 36px 9px 9px", borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
                <button onClick={() => setShowNew(s => !s)} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"none", cursor:"pointer", fontSize:14 }}>{showNew ? "🙈" : "👁"}</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Confirm Password</label>
              <div style={{ position:"relative" }}>
                <input type={showConfirm ? "text" : "password"} value={confirmPass} onChange={e => { setConfirmPass(e.target.value); setError(""); }}
                  style={{ width:"100%", padding:"9px 36px 9px 9px", borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
                <button onClick={() => setShowConfirm(s => !s)} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"none", cursor:"pointer", fontSize:14 }}>{showConfirm ? "🙈" : "👁"}</button>
              </div>
            </div>
            <button onClick={generate} style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${C.maroon}`, background:C.maroonSoft, color:C.maroon, fontFamily:F.b, fontSize:12, fontWeight:700, cursor:"pointer" }}>
              ⚡ Generate (Ambria@XXXX)
            </button>
            {error && <div style={{ fontSize:11, color:C.red, fontWeight:600, background:C.rBg, padding:"6px 10px", borderRadius:6 }}>{error}</div>}
            {toast && <div style={{ fontSize:11, color:C.green, fontWeight:700, background:C.gBg, padding:"6px 10px", borderRadius:6 }}>{toast}</div>}
          </div>
        )}
        {!toast && (
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button onClick={save} disabled={saving || loading}
              style={{ flex:1, padding:10, borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor: saving || loading ? "not-allowed" : "pointer", opacity: saving || loading ? 0.7 : 1 }}>
              {saving ? "Saving..." : "💾 Save Password"}
            </button>
            <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bulk Reset Modal ─────────────────────────────────────────────────────────
function BulkResetModal({ currentUser, onClose }) {
  const C = useT();
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  if (currentUser.role !== "sa") return null;

  const run = async () => {
    setProgress({ done:0, total:0 });
    const { data, error:e } = await supabase.from("users").select("id,username,role").eq("role","e");
    if (e || !data) { setError("Failed to fetch users."); setProgress(null); return; }
    setProgress({ done:0, total:data.length });
    let done = 0;
    for (const u of data) {
      await supabase.from("users").update({ password: (u.username||u.id) + "@123" }).eq("id", u.id);
      done++;
      setProgress({ done, total:data.length });
    }
    setProgress("done");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:380 }}>
        <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:12 }}>🔑 Reset All Staff Passwords</div>
        {progress === null && (
          <>
            <p style={{ fontSize:12, color:C.tl, margin:"0 0 12px", lineHeight:1.6 }}>
              Resets all <strong>Employee</strong> passwords to <code style={{ background:C.bg, padding:"2px 6px", borderRadius:4, fontSize:11 }}>username@123</code>.
            </p>
            <div style={{ background:"#FEF3C7", border:"1px solid #F59E0B", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:11, color:"#92400E", lineHeight:1.5 }}>
              ⚠️ This cannot be undone.
            </div>
            {error && <div style={{ fontSize:11, color:C.red, marginBottom:10 }}>{error}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={run} style={{ flex:1, padding:10, borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>🔑 Reset All</button>
              <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>Cancel</button>
            </div>
          </>
        )}
        {progress !== null && progress !== "done" && (
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <div style={{ fontSize:28, marginBottom:10 }}>🔄</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.maroon }}>Resetting passwords...</div>
            <div style={{ fontSize:13, color:C.tl, marginTop:6, fontWeight:600 }}>{progress.done} / {progress.total}</div>
            <div style={{ marginTop:12, background:C.border, borderRadius:4, height:6, overflow:"hidden" }}>
              <div style={{ height:"100%", background:C.maroon, width:`${progress.total ? (progress.done/progress.total*100) : 0}%`, transition:"width 0.3s" }} />
            </div>
          </div>
        )}
        {progress === "done" && (
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.green }}>All passwords reset!</div>
            <button onClick={onClose} style={{ marginTop:16, padding:"10px 28px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SA Add Member Modal ──────────────────────────────────────────────────────
function AddMemberModal({ user: currentUser, lang, onAdded, onClose }) {
  const C = useT();
  const H = lang === "hi";
  const isMobile = useIsMobile();
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    name: "", username: "", password: "", designation: "",
    dept: "sales", role: "e", prop: "all",
    phone: "", joining_date: today,
    access: ["dashboard", "att", "training"],
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const isOfficeDept = OFFICE_DEPTS.includes(form.dept);

  // Auto-derive username + password from name
  const handleNameChange = (name) => {
    const first = name.trim().toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "");
    const uname = first || "";
    const pass = first ? first + "@123" : "";
    setForm(f => ({ ...f, name, username: f.username || uname, password: f.password || pass }));
  };

  const handleRoleChange = (role) => {
    let access = form.access;
    if (role === "a") access = [];
    else if (role === "e" && !isOfficeDept) access = ["tasks", "att", "training"];
    setForm(f => ({ ...f, role, access }));
  };

  const toggleAccess = (id) => setForm(f => ({
    ...f,
    access: f.access.includes(id) ? f.access.filter(x => x !== id) : [...f.access, id],
  }));

  const save = async () => {
    if (!form.name.trim() || !form.username.trim()) { setError("Name and username are required"); return; }
    setSaving(true);
    setError("");
    const uname = form.username.trim().toLowerCase();
    const pass = form.password || uname + "@123";
    const firstName = form.name.trim().toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "");
    const id = `${form.dept}_${firstName}_${Date.now()}`.slice(0, 40);

    const dbRole = form.role; // "a" or "e"
    const accessToStore = dbRole === "sa" ? [] : (dbRole === "a" ? [] : form.access);

    const { error: e } = await supabase.from("users").insert({
      id, username: uname, password: pass,
      name: form.name.trim(),
      role: dbRole,
      property: form.prop,
      department: form.dept,
      designation: form.designation.trim() || null,
      phone: form.phone.trim() || null,
      joining_date: form.joining_date || null,
      is_active: true,
      access: accessToStore,
    });

    if (e) { setError("Save failed: " + e.message); setSaving(false); return; }

    const deptMeta = getDeptMeta(form.dept);
    getSAIds().then(ids => notifyMultiple("member_added", `👤 New member added: ${form.name.trim()} (${deptMeta.name})`, currentUser.id, currentUser.name, ids, form.prop === "all" ? null : form.prop));

    setToast(`✅ ${form.name.trim()} added — Username: ${uname}, Password: ${pass}`);
    onAdded({
      id, n: form.name.trim(), u: uname, p: pass,
      prop: form.prop, dept: form.dept, role: dbRole,
      joining_date: form.joining_date || null,
      is_active: true,
      access: accessToStore,
      designation: form.designation.trim() || null,
      phone: form.phone.trim() || null,
    });
    setSaving(false);
  };

  const propOpts = [{ id:"all", sn:"All Properties", icon:"🏢" }, ...Object.values(PROPS)];
  const showAccess = form.role === "e" && isOfficeDept;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, width:"100%", maxWidth:480, maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ fontFamily:F.d, fontSize:16, fontWeight:700, color:C.maroon, marginBottom:14 }}>➕ Add Member</div>

        {toast ? (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.green, background:C.gBg, padding:"14px 16px", borderRadius:10, lineHeight:1.8, fontFamily:F.b }}>{toast}</div>
            <button onClick={onClose} style={{ marginTop:16, padding:"10px 28px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:10 }}>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Full Name *</label>
                <input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Rahul Sharma"
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, boxSizing:"border-box", outline:"none" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Username *</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, boxSizing:"border-box", outline:"none" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Password</label>
                <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Default: username@123"
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, boxSizing:"border-box", outline:"none" }} />
              </div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>💼 Designation</label>
                <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Sales Executive, IT Manager"
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, boxSizing:"border-box", outline:"none" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Department</label>
                <select value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))}
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
                  {ALL_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.icon} {H ? d.nameHi : d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Role</label>
                <select value={form.role} onChange={e => handleRoleChange(e.target.value)}
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
                  <option value="a">👑 Admin — full property access</option>
                  <option value="e">{isOfficeDept ? "💼 Office Staff — custom access" : "👷 Employee — field staff"}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>Property</label>
                <select value={form.prop} onChange={e => setForm(f => ({ ...f, prop: e.target.value }))}
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
                  {propOpts.map(p => <option key={p.id} value={p.id}>{p.icon} {p.sn}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>📱 Phone</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional"
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box", outline:"none" }} />
              </div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.tl, display:"block", marginBottom:4 }}>📅 Joining Date</label>
                <input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))}
                  style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box" }} />
              </div>
            </div>

            {showAccess && (
              <div style={{ marginTop:14, padding:12, background:C.bBg, borderRadius:10, border:`1px solid ${C.blue}` }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.blue, marginBottom:10 }}>🔐 Access Permissions</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
                  {ACCESS_SECTIONS.map(s => {
                    const on = form.access.includes(s.id);
                    return (
                      <label key={s.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 8px", borderRadius:7, border:`1px solid ${on ? C.blue : C.border}`, background:on ? "#EBF1FA" : C.white, cursor:"pointer" }}>
                        <div onClick={() => toggleAccess(s.id)} style={{ width:14, height:14, borderRadius:3, border:`2px solid ${on ? C.blue : C.border}`, background:on ? C.blue : C.white, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}>
                          {on && <span style={{ color:C.white, fontSize:9, fontWeight:700 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:11, color:on ? C.blue : C.tl, fontWeight:on ? 600 : 400 }}>{H ? s.labelHi : s.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <div style={{ marginTop:10, padding:"8px 12px", background:C.rBg, borderRadius:8, fontSize:11, color:C.red }}>{error}</div>}

            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button onClick={save} disabled={saving} style={{ flex:1, padding:10, borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : "✅ Add Member"}
              </button>
              <button onClick={onClose} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────
function MemberCard({ member, onDeactivate, onRestore, onEdit, onPassword, onAccess, onDelete, isAdmin, saUser, lang, L, isMobile }) {
  const C = useT();
  const isActive = member.is_active !== false;
  const days = daysSince(member.joining_date);
  const deptMeta = getDeptMeta(member.dept);
  const deptColor = member.deptColor || deptMeta.color || C.maroon;
  const isSA = saUser?.role === "sa";
  const isOfficeMember = OFFICE_DEPTS.includes(member.dept);

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10,
      padding: isMobile ? "13px 12px" : "11px 13px",
      background: isActive ? (member.isCustom ? C.bBg : C.white) : C.rBg + "55",
      borderRadius:10,
      borderLeft:`3px solid ${isActive ? deptColor : C.red}`,
      opacity: isActive ? 1 : 0.65,
    }}>
      <div style={{ width:34, height:34, borderRadius:"50%", background: isActive ? deptColor : C.red, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontWeight:700, fontSize:12, flexShrink:0 }}>
        {member.n?.[0] || "?"}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, textDecoration: isActive ? "none" : "line-through" }}>
          {member.n}
          {member.isCustom && <span style={{ marginLeft:5, fontSize:9, color:C.blue, fontWeight:600 }}>NEW</span>}
          {member.role === "a" && <span style={{ marginLeft:5, fontSize:9, color:C.maroon, fontWeight:600, background:C.maroonSoft, padding:"1px 5px", borderRadius:4 }}>ADMIN</span>}
        </div>
        <div style={{ fontSize:9, color:C.tl }}>
          {deptMeta.icon} {lang === "hi" ? deptMeta.nameHi : deptMeta.name}
          {member.designation && <span style={{ marginLeft:5, color:C.tl }}>· {member.designation}</span>}
          {member.phone && <span style={{ marginLeft:6 }}>📱 {member.phone}</span>}
        </div>
        <div style={{ fontSize:9, color:C.tl, marginTop:1 }}>
          {isActive ? (
            member.joining_date ? (
              <span>📅 {lang === "hi" ? "जोइनिंग:" : "Joined:"} {formatDate(member.joining_date)}
                {days !== null && <span style={{ marginLeft:4, color:C.green, fontWeight:600 }}>({days} {L.daysWithUs})</span>}
              </span>
            ) : <span style={{ color:C.tl }}>No joining date</span>
          ) : (
            <span style={{ color:C.red }}>{L.leftOn}: {formatDate(member.left_date || member.leftDate)}</span>
          )}
        </div>
      </div>

      {isAdmin && (
        <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          <button onClick={() => onEdit(member)} style={{ padding:"3px 8px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg, color:C.tl, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>✏️ Edit</button>
          {isSA && (
            <button onClick={() => onPassword(member)} style={{ padding:"3px 8px", borderRadius:6, border:"1px solid #E0C0C8", background:"#FDF2F4", color:C.maroon, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>🔑 Pwd</button>
          )}
          {isSA && isOfficeMember && (
            <button onClick={() => onAccess(member)} style={{ padding:"3px 8px", borderRadius:6, border:"1px solid #BFD7F5", background:"#EBF1FA", color:C.blue, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>🔐 Access</button>
          )}
          {isActive ? (
            <button onClick={() => onDeactivate(member)} style={{ padding:"3px 8px", borderRadius:6, border:"none", background:C.rBg, color:C.red, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>✕ {L.deactivate}</button>
          ) : (
            <button onClick={() => onRestore(member)} style={{ padding:"3px 8px", borderRadius:6, border:"none", background:C.gBg, color:C.green, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>↩ Restore</button>
          )}
          {isSA && (
            <button onClick={() => onDelete(member)} style={{ padding:"3px 8px", borderRadius:6, border:`1px solid ${C.red}33`, background:C.rBg, color:C.red, fontFamily:F.b, fontSize:9, fontWeight:600, cursor:"pointer" }}>🗑️ Del</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export default function MembersView({ user, lang, customMembers, setCustomMembers, removedIds, setRemovedIds }) {
  const C = useT();
  const isMobile = useIsMobile();
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const isSA = user.role === "sa";

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdd, setShowAdd] = useState(false); // simple inline form for non-SA admins
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
  const [accessMember, setAccessMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);
  const [showBulkReset, setShowBulkReset] = useState(false);

  useEffect(() => {
    supabase.from("users").select("id,joining_date,is_active,left_date,phone,name,designation,access")
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(u => { map[u.id] = u; });
          setDbUsers(map);
        }
      });
  }, []);

  // Simple add (non-SA admin)
  const addMemberSimple = async () => {
    if (!fName.trim() || !fUser.trim()) return;
    const uname = fUser.trim().toLowerCase();
    const pass = fPass || uname + "@123";
    const id = `${fDept}_${uname}_${Date.now()}`.slice(0, 40);
    const newM = { id, n: fName.trim(), u: uname, p: pass, prop: fProp, dept: fDept, role:"e", joining_date: fJoining || null, is_active: true };
    const { error } = await supabase.from("users").insert({ id, username: uname, password: pass, name: fName.trim(), role:"e", property: fProp, department: fDept, joining_date: fJoining || null, is_active: true });
    if (!error) {
      setCustomMembers(prev => [...prev, newM]);
      getSAIds().then(ids => notifyMultiple("member_added", "👤 New member added: " + fName.trim() + " (" + fDept + " — " + fProp + ")", user.id, user.name, ids, fProp));
      setFName(""); setFUser(""); setFPass(""); setFJoining(""); setShowAdd(false);
    }
  };

  const handleDeactivate = async (member) => {
    const today = new Date().toISOString().split("T")[0];
    getSAIds().then(ids => notifyMultiple("member_removed", "👤 Member deactivated: " + (member.n || ""), user.id, user.name, ids, member.prop || null));
    if (member.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active:false, left_date:today } : m));
    } else {
      setRemovedIds(prev => [...prev, member.id]);
      await supabase.from("users").update({ is_active:false, left_date:today }).eq("id", member.id);
      setDbUsers(prev => ({ ...prev, [member.id]: { ...prev[member.id], is_active:false, left_date:today } }));
    }
  };

  const handleRestore = async (member) => {
    if (member.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active:true, left_date:null } : m));
    } else {
      setRemovedIds(prev => prev.filter(x => x !== member.id));
      await supabase.from("users").update({ is_active:true, left_date:null }).eq("id", member.id);
      setDbUsers(prev => ({ ...prev, [member.id]: { ...prev[member.id], is_active:true, left_date:null } }));
    }
  };

  const handleEditSave = (updated) => {
    if (updated.isCustom) {
      setCustomMembers(prev => prev.map(m => m.id === updated.id ? { ...m, n:updated.n, joining_date:updated.joining_date, phone:updated.phone, dept:updated.dept, prop:updated.prop, designation:updated.designation } : m));
    } else {
      setDbUsers(prev => ({ ...prev, [updated.id]: { ...prev[updated.id], joining_date:updated.joining_date, phone:updated.phone, name:updated.n, designation:updated.designation } }));
    }
    setEditingMember(null);
  };

  const handleAccessSave = (updated) => {
    setCustomMembers(prev => prev.map(m => m.id === updated.id ? { ...m, access:updated.access } : m));
    setDbUsers(prev => ({ ...prev, [updated.id]: { ...prev[updated.id], access:updated.access } }));
    setAccessMember(null);
  };

  const handleDeleted = (memberId) => {
    setCustomMembers(prev => prev.filter(m => m.id !== memberId));
    setRemovedIds(prev => prev.filter(x => x !== memberId));
    setDbUsers(prev => { const n = { ...prev }; delete n[memberId]; return n; });
    setDeleteMember(null);
  };

  // Build member list grouped by property (+ "office" group for prop="all")
  const allByProp = {};
  Object.entries(PROPS).forEach(([pk, p]) => {
    allByProp[pk] = { prop: p, members: [] };
    Object.entries(p?.depts || {}).forEach(([dk, d]) => {
      d.m.forEach(m => {
        const dbInfo = dbUsers[m.id] || {};
        const isRemoved = removedIds.includes(m.id) || dbInfo.is_active === false;
        const deptMeta = getDeptMeta(dk);
        allByProp[pk].members.push({
          ...m, dept: dk, deptName: deptMeta.name, deptIcon: deptMeta.icon, deptColor: deptMeta.color,
          isCustom: false, is_active: !isRemoved,
          joining_date: dbInfo.joining_date || null,
          left_date: dbInfo.left_date || null,
          phone: dbInfo.phone || null,
          designation: dbInfo.designation || null,
          access: dbInfo.access || [],
          n: dbInfo.name || m.n,
          prop: pk,
        });
      });
    });
  });

  // "all" property members (office staff)
  allByProp["office"] = { prop: { id:"office", sn:"Office / All Properties", icon:"🏢" }, members: [] };

  customMembers.forEach(cm => {
    const dbInfo = dbUsers[cm.id] || {};
    const mergedMember = {
      ...cm,
      phone: dbInfo.phone || cm.phone || null,
      designation: dbInfo.designation || cm.designation || null,
      access: dbInfo.access || cm.access || [],
    };
    if (cm.prop === "all" || !PROPS[cm.prop]) {
      const deptMeta = getDeptMeta(cm.dept);
      allByProp["office"].members.push({
        ...mergedMember,
        deptName: deptMeta.name, deptIcon: deptMeta.icon, deptColor: deptMeta.color, isCustom: true,
      });
    } else {
      const d = PROPS[cm.prop]?.depts?.[cm.dept];
      const deptMeta = getDeptMeta(cm.dept);
      allByProp[cm.prop].members.push({
        ...mergedMember,
        deptName: d?.n || deptMeta.name,
        deptIcon: d?.i || deptMeta.icon,
        deptColor: d?.c || deptMeta.color,
        isCustom: true,
      });
    }
  });

  const allMembers = Object.values(allByProp).flatMap(({ members }) => members);
  const activeCount = allMembers.filter(m => m.is_active).length;
  const pastCount = allMembers.filter(m => !m.is_active).length;

  const propFilters = [
    { id:"all", label:"All" },
    ...Object.entries(PROPS).map(([k, p]) => ({ id:k, label:`${p.icon} ${p.sn}` })),
    { id:"office", label:"🏢 Office" },
  ];

  const displayGroups = Object.entries(allByProp).filter(([pk]) => {
    if (filterProp === "all") return true;
    return pk === filterProp;
  });

  return (
    <div style={{ fontFamily:F.b }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontFamily:F.d, fontSize:22, fontWeight:700, color:C.maroon, margin:0 }}>👤 {L.members}</h1>
          <p style={{ fontSize:10, color:C.tl, margin:"3px 0 0" }}>{activeCount} active · {pastCount} past</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {isSA && (
            <button onClick={() => setShowBulkReset(true)} style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #E0C0C8", background:"#FDF2F4", color:C.maroon, fontFamily:F.b, fontSize:12, fontWeight:700, cursor:"pointer" }}>🔑 Reset All Passwords</button>
          )}
          {isAdmin && (
            <button onClick={() => isSA ? setShowAddModal(true) : setShowAdd(!showAdd)} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:12, fontWeight:700, cursor:"pointer" }}>
              ➕ {L.addMember}
            </button>
          )}
        </div>
      </div>

      {/* Property filter */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:14 }}>
        {propFilters.map(f => (
          <button key={f.id} onClick={() => setFilterProp(f.id)} style={{
            padding:"5px 12px", borderRadius:8, cursor:"pointer", fontFamily:F.b, fontSize:11, fontWeight:600,
            border: filterProp === f.id ? `2px solid ${C.maroon}` : `1px solid ${C.border}`,
            background: filterProp === f.id ? C.maroonSoft : C.white,
            color: filterProp === f.id ? C.maroon : C.tl,
          }}>{f.label}</button>
        ))}
      </div>

      {/* Simple add form (non-SA admin) */}
      {showAdd && !isSA && (
        <div style={{ background:C.white, borderRadius:12, border:`2px solid ${C.maroon}`, padding:16, marginBottom:16 }}>
          <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:12 }}>➕ {L.addMember}</div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:8 }}>
            <input placeholder={L.memberName} value={fName} onChange={e => setFName(e.target.value)}
              style={{ padding:10, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none" }} />
            <input placeholder="Username" value={fUser} onChange={e => setFUser(e.target.value)}
              style={{ padding:10, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none" }} />
            <input type="password" placeholder="Password (auto: user@123)" value={fPass} onChange={e => setFPass(e.target.value)}
              style={{ padding:10, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none" }} />
            <div>
              <label style={{ fontSize:10, color:C.tl, display:"block", marginBottom:3 }}>📅 {L.joiningDate}</label>
              <input type="date" value={fJoining} onChange={e => setFJoining(e.target.value)}
                style={{ width:"100%", padding:9, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, boxSizing:"border-box" }} />
            </div>
            <select value={fProp} onChange={e => setFProp(e.target.value)}
              style={{ padding:10, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
              {Object.entries(PROPS).map(([k, p]) => <option key={k} value={k}>{p.icon} {p.sn}</option>)}
            </select>
            <select value={fDept} onChange={e => setFDept(e.target.value)}
              style={{ padding:10, borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12 }}>
              {ALL_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:10, flexDirection: isMobile ? "column" : "row" }}>
            <button onClick={addMemberSimple} style={{ padding:"9px 18px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer", width: isMobile ? "100%" : "auto" }}>{L.save}</button>
            <button onClick={() => setShowAdd(false)} style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, fontFamily:F.b, fontSize:13, cursor:"pointer", width: isMobile ? "100%" : "auto" }}>{L.cancel}</button>
          </div>
        </div>
      )}

      {/* Active / Past tabs */}
      <div style={{ display:"flex", gap:3, marginBottom:14, background:C.maroonSoft, borderRadius:10, padding:3, width:"fit-content" }}>
        {[
          { id:"active", label:`${L.activeMembers} (${activeCount})` },
          { id:"past",   label:`${L.pastMembers} (${pastCount})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer",
            fontFamily:F.b, fontSize:11, fontWeight:600,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Members by group */}
      {displayGroups.map(([pk, { prop, members }]) => {
        const filtered = members.filter(m => tab === "active" ? m.is_active : !m.is_active);
        if (filtered.length === 0) return null;
        return (
          <div key={pk} style={{ background:C.white, borderRadius:12, padding:14, border:`1px solid ${C.border}`, marginBottom:12 }}>
            <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:10 }}>
              {prop.icon} {prop.sn}
              <span style={{ fontSize:12, fontWeight:400, color:C.tl, marginLeft:6 }}>({filtered.length} {tab === "active" ? "active" : "past"})</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gap:7 }}>
              {filtered.map(m => (
                <MemberCard key={m.id} member={m}
                  onDeactivate={handleDeactivate} onRestore={handleRestore}
                  onEdit={setEditingMember} onPassword={setPasswordMember}
                  onAccess={setAccessMember} onDelete={setDeleteMember}
                  isAdmin={isAdmin} saUser={user} lang={lang} L={L} isMobile={isMobile} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Modals */}
      {showAddModal && isSA && (
        <AddMemberModal
          user={user} lang={lang}
          onAdded={(newM) => { setCustomMembers(prev => [...prev, newM]); }}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingMember && (
        <EditMemberModal member={editingMember} onSave={handleEditSave} onClose={() => setEditingMember(null)} L={L} currentUser={user} />
      )}
      {passwordMember && (
        <PasswordModal member={passwordMember} currentUser={user} onClose={() => setPasswordMember(null)} />
      )}
      {accessMember && (
        <AccessModal member={accessMember} lang={lang} onSave={handleAccessSave} onClose={() => setAccessMember(null)} />
      )}
      {deleteMember && (
        <DeleteConfirmModal member={deleteMember} onDeleted={handleDeleted} onClose={() => setDeleteMember(null)} />
      )}
      {showBulkReset && (
        <BulkResetModal currentUser={user} onClose={() => setShowBulkReset(false)} />
      )}
    </div>
  );
}
