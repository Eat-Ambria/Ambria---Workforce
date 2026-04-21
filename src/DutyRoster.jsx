import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";

function SearchSelect({value,onChange,options,style:cs,placeholder}){
  const[open,setOpen]=useState(false);const[q,setQ]=useState("");const ref=useRef(null);
  useEffect(()=>{const h=(e)=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setQ("");}};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const fil=options.filter(o=>String(o.l).toLowerCase().includes(q.toLowerCase()));
  const cur=options.find(o=>String(o.v)===String(value));
  return(<div ref={ref} style={{position:"relative",...cs}}>
    <button onClick={()=>{setOpen(p=>!p);setQ("");}} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",fontFamily:F.b,fontSize:12,color:C.text,cursor:"pointer",outline:"none",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur?.l||placeholder||"Select..."}</span>
      <span style={{fontSize:9,color:C.tl,flexShrink:0}}>▾</span>
    </button>
    {open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:9999,minWidth:"100%",background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",marginTop:2,overflow:"hidden"}}>
      <div style={{padding:5,borderBottom:`1px solid ${C.border}`}}><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..." style={{width:"100%",padding:"5px 7px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:11,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{maxHeight:180,overflowY:"auto"}}>{fil.map(o=><div key={o.v} onMouseDown={()=>{onChange(o.v);setOpen(false);setQ("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,fontFamily:F.b,background:String(o.v)===String(value)?C.maroonSoft:"transparent",color:String(o.v)===String(value)?C.maroon:C.text,fontWeight:String(o.v)===String(value)?600:400}}>{o.l}</div>)}
      {fil.length===0&&<div style={{padding:10,fontSize:11,color:C.tl,textAlign:"center"}}>No results</div>}
      </div>
    </div>}
  </div>);
}

const DEFAULT_SECURITY = {
  pp: [
    { slot: "pp_d1", label: "Day Guard 1", source: "third-party", shift: "day", start: "09:00", end: "18:00" },
    { slot: "pp_d2", label: "Day Guard 2", source: "third-party", shift: "day", start: "09:00", end: "18:00" },
    { slot: "pp_n1", label: "Night Guard 1", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
    { slot: "pp_n2", label: "Night Guard 2", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
  ],
  ex: [
    { slot: "ex_d1", label: "Day Guard - Ambria", staff_id: "ex_bhupender", staff_name: "Bhupender", source: "ambria", shift: "day", start: "09:00", end: "18:00" },
    { slot: "ex_d2", label: "Kitchen Day Guard", source: "third-party", shift: "day", start: "09:00", end: "18:00" },
    { slot: "ex_n1", label: "Night Guard 1", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
    { slot: "ex_n2", label: "Night Guard 2", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
  ],
  mk: [
    { slot: "mk_d1", label: "Day Guard - Ambria", staff_id: "mk_ajay_s", staff_name: "Ajay (Sec)", source: "ambria", shift: "day", start: "09:00", end: "18:00" },
    { slot: "mk_n1", label: "Night Guard", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
  ],
  rs: [
    { slot: "rs_d1", label: "Day Guard - Ambria", staff_id: "rs_santosh", staff_name: "Santosh", source: "ambria", shift: "day", start: "09:00", end: "18:00" },
    { slot: "rs_n1", label: "Night Guard", source: "third-party", shift: "night", start: "18:00", end: "09:00" },
  ],
};

const DEPT_TABS = [
  { id: "all", label: "All", icon: "👥" },
  { id: "h", label: "Horticulture", icon: "🌱" },
  { id: "k", label: "Housekeeping", icon: "🧹" },
  { id: "a", label: "Admin", icon: "📋" },
  { id: "s", label: "Security", icon: "🛡️" },
];

const SHIFT_COLORS = {
  day: { bg: "#FFF7ED", color: C.accent, label: "🌅 Day" },
  night: { bg: "#EDE9FE", color: "#6B21A8", label: "🌙 Night" },
  half: { bg: "#FEF9C3", color: "#854D0E", label: "⏰ Half" },
  off: { bg: C.rBg, color: C.red, label: "🔴 Off" },
  none: { bg: C.bg, color: C.tl, label: "— No shift" },
};

function ShiftBadge({ shiftType }) {
  const s = SHIFT_COLORS[shiftType] || SHIFT_COLORS.none;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 5, fontSize:10, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function EditShiftModal({ member, date, existing, onSave, onClose, L }) {
  const [form, setForm] = useState({
    shift_type: existing?.shift_type || "day",
    shift_start: existing?.shift_start || "09:00",
    shift_end: existing?.shift_end || "18:00",
    notes: (existing?.notes||"").replace(/^__uid:[^_]+__\s*/,""),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: F.d, fontSize:16, fontWeight: 700, color: C.maroon, marginBottom: 4 }}>✏️ Edit Shift</div>
        <div style={{ fontSize:11, color: C.tl, marginBottom: 14 }}>{member.n} · {date}</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 6 }}>Shift Type</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {["day","night","half","off"].map(s => {
                const sc = SHIFT_COLORS[s];
                return (
                  <button key={s} onClick={() => setForm({ ...form, shift_type: s })} style={{
                    padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontFamily: F.b, fontSize:11, fontWeight: 600,
                    border: `2px solid ${form.shift_type === s ? sc.color : C.border}`,
                    background: form.shift_type === s ? sc.bg : C.white,
                    color: form.shift_type === s ? sc.color : C.tl,
                  }}>{sc.label}</button>
                );
              })}
            </div>
          </div>
          {form.shift_type !== "off" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftStart||"Start"}</label>
                <input type="time" value={form.shift_start} onChange={e => setForm({ ...form, shift_start: e.target.value })}
                  style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftEnd||"End"}</label>
                <input type="time" value={form.shift_end} onChange={e => setForm({ ...form, shift_end: e.target.value })}
                  style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
              </div>
            </div>
          )}
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Notes</label>
            <input placeholder="Optional note..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => onSave(form)} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none",
            background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer"
          }}>{L.saveRoster||"Save"}</button>
          <button onClick={onClose} style={{
            padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer"
          }}>{L.cancel||"Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

function EditSecurityModal({ entry, onSave, onClose, prop, L }) {
  const secMembers = [
    ...prop?.depts?.s?.m || [],
    { id: "third-party", n: "Third Party Guard" },
  ];
  const [form, setForm] = useState({
    staff_name: entry.staff_name || "",
    staff_id: entry.staff_id || "",
    shift: entry.shift || "day",
    start: entry.start || "09:00",
    end: entry.end || "18:00",
    source: entry.source || "third-party",
    notes: entry.notes || "",
    label: entry.label || "",
    guard_name: (entry.source === "third-party" && entry.staff_name && entry.staff_name !== "Third Party Guard") ? entry.staff_name : "",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: F.d, fontSize:16, fontWeight: 700, color: C.maroon, marginBottom: 14 }}>✏️ Edit Guard Shift — {entry.label}</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Guard / Staff</label>
            <SearchSelect value={form.staff_id || "third-party"} onChange={v => {
              const m = secMembers.find(x => x.id === v);
              setForm({ ...form, staff_id: v, staff_name: m?.n || "", source: v === "third-party" ? "third-party" : "ambria", guard_name: v === "third-party" ? form.guard_name : "" });
            }} options={secMembers.map(m => ({ v: m.id, l: m.n }))} style={{ width: "100%" }}/>
          </div>
          {(form.staff_id === "third-party" || !form.staff_id) && (
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Guard Name</label>
              <input placeholder="e.g. Ramesh Kumar" value={form.guard_name || ""} onChange={e => setForm({ ...form, guard_name: e.target.value, staff_name: e.target.value.trim() || "Third Party Guard" })}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box", outline: "none" }} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftStart||"Start"}</label>
              <input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftEnd||"End"}</label>
              <input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Shift Type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["day","night"].map(s => (
                <button key={s} onClick={() => setForm({ ...form, shift: s })} style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  border: `2px solid ${form.shift === s ? (s === "day" ? C.accent : "#6B21A8") : C.border}`,
                  background: form.shift === s ? (s === "day" ? "#FFF7ED" : "#EDE9FE") : C.white,
                  cursor: "pointer", fontFamily: F.b, fontSize:11, fontWeight: 600,
                  color: form.shift === s ? (s === "day" ? C.accent : "#6B21A8") : C.tl,
                }}>{s === "day" ? "🌅 Day" : "🌙 Night"}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Notes</label>
            <input placeholder="e.g. Kitchen entry only" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize:12, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => onSave({ ...entry, ...form })} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none",
            background: C.maroon, color: C.white, fontFamily: F.b, fontSize:13, fontWeight: 700, cursor: "pointer"
          }}>{L.saveRoster||"Save"}</button>
          <button onClick={onClose} style={{
            padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.bg, fontFamily: F.b, fontSize:13, cursor: "pointer"
          }}>{L.cancel||"Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

export default function DutyRoster({ prop, user, lang }) {
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const isSA = user.role === "sa";
  const today = new Date().toISOString().split("T")[0];

  const [localPropId, setLocalPropId] = useState(prop.id);
  const activeProp = PROPS[localPropId] || prop;
  const propId = activeProp.id;
  const defaults = DEFAULT_SECURITY[propId] || [];

  const [deptTab, setDeptTab] = useState("all");
  const [roster, setRoster] = useState({});
  const [editingSecSlot, setEditingSecSlot] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRoster({});
    supabase.from("duty_roster")
      .select("*")
      .eq("property", propId)
      .eq("date", today)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const map = {};
          data.forEach(r => {
            const slotMatch = (r.notes || "").match(/^__slot:([^_][^_]*?)__/);
            const uidMatch = (r.notes || "").match(/^__uid:([^_]+)__/);
            const key = slotMatch ? slotMatch[1] : uidMatch ? uidMatch[1] : (r.user_id || r.user_name);
            map[key] = r;
          });
          setRoster(map);
        }
      });
  }, [propId, today]);

  // ── Security slot helpers ──
  const getSecEntry = (slot) => {
    const saved = roster[slot];
    const def = defaults.find(d => d.slot === slot);
    if (!saved) return { ...def };
    const cleanNotes = (saved.notes || "").replace(/^__slot:[^_][^_]*?__\s*/, "") || null;
    return { ...def, ...saved, notes: cleanNotes };
  };

  const handleSaveSecurity = async (updated) => {
    setSaving(true);
    const row = {
      property: propId, date: today,
      user_id: updated.staff_id || null,
      user_name: updated.staff_name || updated.label,
      shift_type: updated.shift, shift_start: updated.start, shift_end: updated.end,
      notes: `__slot:${updated.slot}__${updated.notes ? " " + updated.notes : ""}`,
      assigned_by: user.id,
    };
    const { error } = await supabase.from("duty_roster")
      .upsert(row, { onConflict: "property,date,user_id" });
    if (!error) setRoster(prev => ({ ...prev, [updated.slot]: row }));
    setSaving(false);
    setEditingSecSlot(null);
  };

  // ── Staff shift helpers ──
  const getStaffShift = (memberId) => {
    const saved = roster[memberId];
    if (!saved) return null;
    return saved;
  };

  const handleSaveStaffShift = async (member, form) => {
    setSaving(true);
    const row = {
      property: propId, date: today,
      user_id: member.id,
      user_name: member.n,
      shift_type: form.shift_type,
      shift_start: form.shift_type === "off" ? null : form.shift_start,
      shift_end: form.shift_type === "off" ? null : form.shift_end,
      notes: `__uid:${member.id}__${form.notes ? " " + form.notes : ""}`,
      assigned_by: user.id,
    };
    const { error } = await supabase.from("duty_roster")
      .upsert(row, { onConflict: "property,date,user_id" });
    if (!error) {
      setRoster(prev => ({ ...prev, [member.id]: row }));
      const shiftLabel = form.shift_type === "off" ? "Day Off" : `${form.shift_type} (${form.shift_start||""}–${form.shift_end||""})`;
      const dateFmt = new Date(today).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      notifyMultiple("shift_changed","🔄 Shift changed: "+member.n+" — "+shiftLabel+" on "+dateFmt,user.id,user.name,[member.id],propId);
      getSAAndAdminIds(propId).then(ids => notifyMultiple("shift_changed","🔄 Shift changed: "+member.n+" — "+shiftLabel+" on "+dateFmt,user.id,user.name,ids.filter(i=>i!==user.id),propId));
    }
    setSaving(false);
    setEditingStaff(null);
  };

  // ── Build staff list for current prop + dept filter ──
  const getAllStaff = () => {
    const result = [];
    Object.entries(activeProp.depts || {}).forEach(([dk, d]) => {
      if (deptTab !== "all" && dk !== deptTab) return;
      d.m.forEach(m => result.push({ ...m, dept: dk, deptName: d.n, deptIcon: d.i, deptColor: d.c }));
    });
    return result;
  };

  const staff = getAllStaff();
  const daySlots = defaults.filter(d => d.shift === "day");
  const nightSlots = defaults.filter(d => d.shift === "night");

  // Show security panel when tab is "all" or "s"
  const showSecurity = deptTab === "all" || deptTab === "s";
  // Show staff table when tab is "all" or a non-security dept
  const showStaff = deptTab === "all" || deptTab !== "s";
  const staffToShow = deptTab === "s" ? [] : staff.filter(m => deptTab === "all" || m.dept === deptTab);

  return (
    <div style={{ fontFamily: F.b }}>
      {/* ── Property Selector (SA only) ── */}
      {isSA && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.values(PROPS).map(p => (
            <button key={p.id} onClick={() => setLocalPropId(p.id)} style={{
              padding: "6px 12px", borderRadius: 8, cursor: "pointer",
              fontFamily: F.b, fontSize:11, fontWeight: 600,
              border: localPropId === p.id ? `2px solid ${C.maroon}` : `1px solid ${C.border}`,
              background: localPropId === p.id ? C.maroonSoft : C.white,
              color: localPropId === p.id ? C.maroon : C.tl,
            }}>{p.icon} {p.sn}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize:22, fontWeight: 700, color: C.maroon, margin: 0 }}>🗓️ {L.roster||"Duty Roster"}</h1>
          <p style={{ fontSize:10, color: C.tl, margin: "3px 0 0" }}>
            {activeProp.name} · {new Date(today).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {saving && <div style={{ fontSize:11, color: C.tl }}>Saving...</div>}
      </div>

      {/* ── Department Tabs ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 16, flexWrap: "wrap" }}>
        {DEPT_TABS.map(t => (
          <button key={t.id} onClick={() => setDeptTab(t.id)} style={{
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            fontFamily: F.b, fontSize:11, fontWeight: 600,
            border: deptTab === t.id ? `2px solid ${C.maroon}` : `1px solid ${C.border}`,
            background: deptTab === t.id ? C.maroonSoft : C.white,
            color: deptTab === t.id ? C.maroon : C.tl,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ── Staff Roster (non-security) ── */}
      {staffToShow.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
            {deptTab === "all" ? "👥 All Staff Shifts" : `${DEPT_TABS.find(t=>t.id===deptTab)?.icon} ${DEPT_TABS.find(t=>t.id===deptTab)?.label} Shifts`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {staffToShow.map(m => {
              const saved = getStaffShift(m.id);
              const shiftType = saved?.shift_type || "none";
              const sc = SHIFT_COLORS[shiftType] || SHIFT_COLORS.none;
              const notes = (saved?.notes || "").replace(/^__uid:[^_]+__\s*/, "");
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", background: C.white, borderRadius: 10,
                  border: `1px solid ${C.border}`, borderLeft: `4px solid ${m.deptColor || C.maroon}`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.deptColor || C.maroon, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontWeight: 700, fontSize:11, flexShrink: 0 }}>
                    {m.n?.[0] || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize:12, fontWeight: 700 }}>{m.n}</div>
                    <div style={{ fontSize:9, color: C.tl }}>{m.deptIcon} {m.deptName}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <ShiftBadge shiftType={shiftType} />
                    {saved && shiftType !== "off" && shiftType !== "none" && (
                      <div style={{ fontSize:9, color: C.tl, marginTop: 2 }}>
                        {saved.shift_start} – {saved.shift_end}
                      </div>
                    )}
                    {notes && <div style={{ fontSize:9, color: C.tl, fontStyle: "italic" }}>{notes}</div>}
                  </div>
                  {isAdmin && (
                    <button onClick={() => setEditingStaff(m)} style={{
                      padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
                      background: C.bg, cursor: "pointer", fontFamily: F.b, fontSize:9, fontWeight: 600, color: C.tl, flexShrink: 0
                    }}>✏️</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Security Section ── */}
      {showSecurity && defaults.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: F.d, fontSize:15, fontWeight: 700, color: "#6B21A8", marginBottom: 8 }}>
            🛡️ Security Guards — {activeProp.sn}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, fontSize:10, color: C.tl }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, background: "#FFF7ED", color: C.accent, fontWeight: 600 }}>🌅 {daySlots.length} Day</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, background: "#EDE9FE", color: "#6B21A8", fontWeight: 600 }}>🌙 {nightSlots.length} Night</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize:11, fontWeight: 700, color: C.accent, marginBottom: 6 }}>🌅 {L.dayShift||"Day Shift"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {daySlots.map(d => {
                  const entry = getSecEntry(d.slot);
                  const isAmbria = entry.source === "ambria";
                  return (
                    <div key={d.slot} style={{
                      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
                      borderLeft: `4px solid ${C.accent}`, padding: "10px 12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 6px", borderRadius: 4, fontSize:9, fontWeight: 600, background: isAmbria ? C.maroonSoft : C.bg, color: isAmbria ? C.maroon : C.tl }}>
                              {isAmbria ? "Ambria" : "3rd Party"}
                            </span>
                          </div>
                          <div style={{ fontSize:12, fontWeight: 700 }}>{entry.staff_name || entry.label}</div>
                          <div style={{ fontSize:10, color: C.tl, marginTop: 2 }}>🕐 {entry.start} – {entry.end}{entry.notes ? ` · ${entry.notes}` : ""}</div>
                        </div>
                        {isAdmin && (
                          <button onClick={() => setEditingSecSlot(entry)} style={{
                            padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.bg, cursor: "pointer", fontFamily: F.b, fontSize:9, fontWeight: 600, color: C.tl
                          }}>✏️</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {daySlots.length === 0 && <div style={{ fontSize:11, color: C.tl, fontStyle: "italic" }}>No day guards</div>}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight: 700, color: "#6B21A8", marginBottom: 6 }}>🌙 {L.nightShift||"Night Shift"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {nightSlots.map(d => {
                  const entry = getSecEntry(d.slot);
                  const isAmbria = entry.source === "ambria";
                  return (
                    <div key={d.slot} style={{
                      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
                      borderLeft: "4px solid #6B21A8", padding: "10px 12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 6px", borderRadius: 4, fontSize:9, fontWeight: 600, background: isAmbria ? C.maroonSoft : C.bg, color: isAmbria ? C.maroon : C.tl }}>
                              {isAmbria ? "Ambria" : "3rd Party"}
                            </span>
                          </div>
                          <div style={{ fontSize:12, fontWeight: 700 }}>{entry.staff_name || entry.label}</div>
                          <div style={{ fontSize:10, color: C.tl, marginTop: 2 }}>🕐 {entry.start} – {entry.end}{entry.notes ? ` · ${entry.notes}` : ""}</div>
                        </div>
                        {isAdmin && (
                          <button onClick={() => setEditingSecSlot(entry)} style={{
                            padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.bg, cursor: "pointer", fontFamily: F.b, fontSize:9, fontWeight: 600, color: C.tl
                          }}>✏️</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {nightSlots.length === 0 && <div style={{ fontSize:11, color: C.tl, fontStyle: "italic" }}>No night guards</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Staff Modal ── */}
      {editingStaff && (
        <EditShiftModal
          member={editingStaff}
          date={today}
          existing={getStaffShift(editingStaff.id)}
          onSave={(form) => handleSaveStaffShift(editingStaff, form)}
          onClose={() => setEditingStaff(null)}
          L={L}
        />
      )}

      {/* ── Edit Security Modal ── */}
      {editingSecSlot && (
        <EditSecurityModal
          entry={editingSecSlot}
          onSave={handleSaveSecurity}
          onClose={() => setEditingSecSlot(null)}
          prop={activeProp}
          L={L}
        />
      )}
    </div>
  );
}
