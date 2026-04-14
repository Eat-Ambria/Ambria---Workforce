import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";

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

// Default security setup per property (pre-loaded into roster)
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

function ShiftCard({ entry, onEdit, isAdmin, L }) {
  const isDay = entry.shift === "day";
  const isAmbria = entry.source === "ambria";
  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${isDay ? C.accent : C.purple}`,
      padding: "10px 12px", position: "relative"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 12 }}>{isDay ? "🌅" : "🌙"}</span>
            <span style={{
              padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700,
              background: isDay ? "#FFF7ED" : "#EDE9FE",
              color: isDay ? C.accent : C.purple
            }}>{isDay ? L.dayShift : L.nightShift}</span>
            <span style={{
              padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600,
              background: isAmbria ? C.maroonSoft : C.bg,
              color: isAmbria ? C.maroon : C.tl
            }}>{isAmbria ? L.ambriaSec : L.thirdParty}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
            {entry.staff_name || entry.label}
          </div>
          <div style={{ fontSize: 10, color: C.tl, marginTop: 2 }}>
            🕐 {entry.start} – {entry.end}
            {entry.notes && <span style={{ marginLeft: 6, fontStyle: "italic" }}>{entry.notes}</span>}
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => onEdit(entry)} style={{
            padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.bg, cursor: "pointer", fontFamily: F.b, fontSize: 9, fontWeight: 600, color: C.tl
          }}>✏️ {L.editRoster}</button>
        )}
      </div>
    </div>
  );
}

function EditModal({ entry, onSave, onClose, prop, L }) {
  const allMembers = Object.values(prop?.depts||{}).flatMap(d => d.m);
  const [form, setForm] = useState({
    staff_name: entry.staff_name || "",
    staff_id: entry.staff_id || "",
    shift: entry.shift || "day",
    start: entry.start || "09:00",
    end: entry.end || "18:00",
    source: entry.source || "third-party",
    notes: entry.notes || "",
    label: entry.label || "",
  });

  const secMembers = [
    ...prop?.depts?.s?.m || [],
    { id: "third-party", n: "Third Party Guard" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.maroon, marginBottom: 14 }}>
          ✏️ Edit Shift — {entry.label}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Guard / Staff</label>
            <SearchSelect value={form.staff_id || "third-party"} onChange={v => {
              const m = secMembers.find(x => x.id === v);
              setForm({ ...form, staff_id: v, staff_name: m?.n || "", source: v === "third-party" ? "third-party" : "ambria" });
            }} options={secMembers.map(m => ({ v: m.id, l: m.n }))} style={{ width: "100%" }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftStart}</label>
              <input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>{L.shiftEnd}</label>
              <input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Shift Type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["day", "night"].map(s => (
                <button key={s} onClick={() => setForm({ ...form, shift: s })} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: `2px solid ${form.shift === s ? (s === "day" ? C.accent : C.purple) : C.border}`,
                  background: form.shift === s ? (s === "day" ? "#FFF7ED" : "#EDE9FE") : C.white,
                  cursor: "pointer", fontFamily: F.b, fontSize: 11, fontWeight: 600,
                  color: form.shift === s ? (s === "day" ? C.accent : C.purple) : C.tl
                }}>{s === "day" ? "🌅 Day" : "🌙 Night"}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tl, display: "block", marginBottom: 4 }}>Notes</label>
            <input placeholder="e.g. Kitchen entry only" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 12, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => onSave({ ...entry, ...form })} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none",
            background: C.maroon, color: C.white, fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}>{L.saveRoster}</button>
          <button onClick={onClose} style={{
            padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.bg, fontFamily: F.b, fontSize: 13, cursor: "pointer"
          }}>{L.cancel}</button>
        </div>
      </div>
    </div>
  );
}

export default function DutyRoster({ prop, user, lang }) {
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const today = new Date().toISOString().split("T")[0];

  const [roster, setRoster] = useState({});
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const propId = prop.id;
  const defaults = DEFAULT_SECURITY[propId] || [];

  useEffect(() => {
    supabase.from("duty_roster")
      .select("*")
      .eq("property", propId)
      .eq("date", today)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const map = {};
          data.forEach(r => { map[r.user_id || r.user_name] = r; });
          setRoster(map);
        }
      });
  }, [propId, today]);

  const getEntry = (slot) => {
    const saved = roster[slot];
    const def = defaults.find(d => d.slot === slot);
    return saved ? { ...def, ...saved } : { ...def };
  };

  const handleSave = async (updated) => {
    setSaving(true);
    // duty_roster columns: id, user_id, user_name, property, shift_type, shift_start, shift_end, date, assigned_by, notes
    const row = {
      property: propId,
      date: today,
      user_id: updated.staff_id || null,
      user_name: updated.staff_name || updated.label,
      shift_type: updated.shift,
      shift_start: updated.start,
      shift_end: updated.end,
      notes: updated.notes || null,
      assigned_by: user.id,
    };
    const { error } = await supabase.from("duty_roster").insert(row);
    if (!error) {
      setRoster(prev => ({ ...prev, [updated.slot]: row }));
    }
    setSaving(false);
    setEditing(null);
  };

  const daySlots = defaults.filter(d => d.shift === "day");
  const nightSlots = defaults.filter(d => d.shift === "night");

  // Also show all staff from other depts for duty assignment
  const allStaff = Object.values(prop?.depts||{}).flatMap(d =>
    d.m.map(m => ({ ...m, deptName: d.n, deptIcon: d.i }))
  );

  return (
    <div style={{ fontFamily: F.b }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: 0 }}>
            📋 {L.roster}
          </h1>
          <p style={{ fontSize: 10, color: C.tl, margin: "3px 0 0" }}>
            {prop.name} · {new Date(today).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {saving && <div style={{ fontSize: 11, color: C.tl }}>Saving...</div>}
      </div>

      {/* ── Security Shifts ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.purple, marginBottom: 8 }}>
          🛡️ Security Shifts
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 6 }}>🌅 {L.dayShift}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {daySlots.map(d => (
                <ShiftCard key={d.slot} entry={getEntry(d.slot)} onEdit={setEditing} isAdmin={isAdmin} L={L} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 6 }}>🌙 {L.nightShift}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {nightSlots.map(d => (
                <ShiftCard key={d.slot} entry={getEntry(d.slot)} onEdit={setEditing} isAdmin={isAdmin} L={L} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── All Staff Overview ── */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.maroon, marginBottom: 10 }}>
          👥 All Staff — {prop.sn}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
          {allStaff.map(m => (
            <div key={m.id} style={{
              padding: "8px 10px", background: C.bg, borderRadius: 8,
              borderLeft: `3px solid ${C.maroon}`, display: "flex", alignItems: "center", gap: 6
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: C.maroon,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.white, fontSize: 9, fontWeight: 700, flexShrink: 0
              }}>{m.n[0]}</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600 }}>{m.n}</div>
                <div style={{ fontSize: 8, color: C.tl }}>{m.deptIcon} {m.deptName}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <EditModal
          entry={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          prop={prop}
          L={L}
        />
      )}
    </div>
  );
}
