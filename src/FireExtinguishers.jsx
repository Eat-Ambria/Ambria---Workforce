import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, PROPS } from "./constants.js";
import Modal from "./Modal.jsx";
import { notifyMultiple } from "./notifications.js";

const PROP_NAMES = { pp:"Pushpanjali", ex:"Exotica", mk:"Manaktala", rs:"Restro" };
const FE_TYPES = ["ABC Dry Powder","CO2","Foam","Water","Clean Agent","K-Class Kitchen"];
const FE_CAPS  = ["1 KG","2 KG","4 KG","6 KG","9 KG","2 Ltr","6 Ltr","9 Ltr","50 KG Trolley"];

const SEED = [
  {property:"pp",location:"Banquet Hall Entry",   type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"pp",location:"Banquet Hall Exit",    type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"pp",location:"Kitchen",              type:"K-Class Kitchen", capacity:"6 Ltr"},
  {property:"pp",location:"Kitchen Store",        type:"CO2",             capacity:"2 KG"},
  {property:"pp",location:"Villa Ground Floor",   type:"ABC Dry Powder",  capacity:"2 KG"},
  {property:"pp",location:"Villa First Floor",    type:"ABC Dry Powder",  capacity:"2 KG"},
  {property:"pp",location:"Parking Entry",        type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"pp",location:"Office Block",         type:"ABC Dry Powder",  capacity:"2 KG"},
  {property:"ex",location:"Aura Hall Entry",      type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"ex",location:"Aura Hall Exit",       type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"ex",location:"Valencia Hall Entry",  type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"ex",location:"Valencia Hall Exit",   type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"ex",location:"Kitchen",              type:"K-Class Kitchen", capacity:"6 Ltr"},
  {property:"ex",location:"Parking",             type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"ex",location:"Generator Room",       type:"CO2",             capacity:"4 KG"},
  {property:"ex",location:"Office",              type:"ABC Dry Powder",  capacity:"2 KG"},
  {property:"mk",location:"Emerald Hall Entry",   type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"mk",location:"Emerald Hall Exit",    type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"mk",location:"Alstonia Hall",        type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"mk",location:"Kitchen",              type:"K-Class Kitchen", capacity:"6 Ltr"},
  {property:"mk",location:"Parking",             type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"mk",location:"Generator Room",       type:"CO2",             capacity:"4 KG"},
  {property:"rs",location:"Glasshouse Entry",     type:"ABC Dry Powder",  capacity:"4 KG"},
  {property:"rs",location:"Kitchen",              type:"K-Class Kitchen", capacity:"6 Ltr"},
  {property:"rs",location:"Parking",             type:"ABC Dry Powder",  capacity:"2 KG"},
  {property:"rs",location:"Generator Room",       type:"CO2",             capacity:"2 KG"},
];

function daysLeft(dateStr) {
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.ceil((d - t) / 86400000);
}
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function expiryInfo(item) {
  const d = daysLeft(item.expiry_date);
  if (d < 0)   return {label:`EXPIRED: ${fmt(item.expiry_date)} ❌`,       color:C.white,    bg:C.red,    border:C.red,    pulse:true,  sev:3};
  if (d <= 15) return {label:`EXPIRES: ${fmt(item.expiry_date)} (${d} days!) 🚨`, color:C.red, bg:C.rBg, border:C.red, pulse:true, sev:2};
  if (d <= 30) return {label:`Expires: ${fmt(item.expiry_date)} (${d} days left) ⚠️`, color:"#B8620A", bg:C.yBg, border:C.yellow, pulse:false, sev:1};
  return {label:`Expires: ${fmt(item.expiry_date)} (${d} days left)`, color:C.green, bg:C.gBg, border:C.green, pulse:false, sev:0};
}
function inspInfo(item) {
  if (!item.last_inspection) return {overdue:true, days:null};
  const d = Math.floor((Date.now() - new Date(item.last_inspection)) / 86400000);
  return {overdue: d > 30, days: d};
}
const compress = (src, maxKB=100) => new Promise(res => {
  const img = new Image(); img.onload = () => {
    let w = img.width, h = img.height, mx = 1200;
    if (w > mx || h > mx) { if (w > h) { h = Math.round(h*mx/w); w = mx; } else { w = Math.round(w*mx/h); h = mx; } }
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    let q = 0.8; const go = () => { const r = cv.toDataURL("image/jpeg",q); if ((r.length*3/4)/1024 <= maxKB || q <= 0.1) res(r); else { q -= 0.1; go(); } }; go();
  }; img.src = src;
});

// ─── Exported: called from App.jsx on every login for SA/Admin ────────────────
export async function checkFireExtinguisherExpiry(userId) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const in15  = new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0];
    const { data: urgent } = await supabase.from("fire_extinguishers").select("*").lte("expiry_date", in15).eq("status","active");
    if (!urgent || urgent.length === 0) return;
    const { data: existing } = await supabase.from("notifications").select("id").eq("type","fire_ext_expiry").eq("for_user",userId).gte("created_at", today+"T00:00:00");
    if (existing && existing.length > 0) return;
    const { data: admins } = await supabase.from("users").select("id").in("role",["sa","a"]);
    const ids = (admins||[]).map(u => u.id);
    const expired  = urgent.filter(e => e.expiry_date < today);
    const expiring = urgent.filter(e => e.expiry_date >= today);
    if (expired.length > 0)
      await notifyMultiple("fire_ext_expiry", `🚨 ${expired.length} fire extinguisher(s) EXPIRED! Locations: ${expired.map(e=>`${e.location} (${PROP_NAMES[e.property]||e.property})`).join(", ")}`, "system","System", ids,"all");
    if (expiring.length > 0)
      await notifyMultiple("fire_ext_expiry", `⚠️ ${expiring.length} fire extinguisher(s) expiring within 15 days: ${expiring.map(e=>`${e.location} (${PROP_NAMES[e.property]||e.property}) - ${e.expiry_date}`).join(", ")}`, "system","System", ids,"all");
  } catch(e) { console.error("Fire ext expiry check:", e); }
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SCard({icon,label,value,color,bg,pulse,bold}) {
  return(
    <div style={{background:bg,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${color}33`}}>
      <div style={{fontSize:18,marginBottom:2,animation:pulse?"feP 1.5s ease-in-out infinite":undefined}}>{icon}</div>
      <div style={{fontFamily:F.d,fontSize:22,fontWeight:700,color,animation:pulse?"feP 1.5s ease-in-out infinite":undefined}}>{value}</div>
      <div style={{fontSize:10,color,fontWeight:bold?700:500,marginTop:2}}>{label}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FireExtinguishers({user, lang}) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [propF,   setPropF]   = useState(user.prop==="all"?"all":user.prop);
  const [showForm,setShowForm]= useState(false);
  const [editItem,setEditItem]= useState(null);
  const photoRef = useRef(null);

  const blank = {property:user.prop==="all"?"pp":user.prop, location:"", type:"ABC Dry Powder", capacity:"4 KG", serial_number:"", install_date:"", expiry_date:"", last_inspection:"", vendor_name:"", vendor_phone:"", notes:"", photo_url:"", status:"active"};
  const [form, setForm] = useState(blank);
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{ load(); },[]);

  async function load() {
    setLoading(true);
    const {data} = await supabase.from("fire_extinguishers").select("*").order("property").order("location");
    if (data) { if (data.length === 0) await seedDB(); else setItems(data); }
    setLoading(false);
  }
  async function seedDB() {
    const today = new Date().toISOString().split("T")[0];
    const next  = new Date(Date.now()+30*86400000).toISOString().split("T")[0];
    const rows  = SEED.map(r=>({...r, expiry_date:"2027-01-01", last_inspection:today, next_inspection:next, created_by:user.id||user.name, status:"active"}));
    const {data} = await supabase.from("fire_extinguishers").insert(rows).select();
    if (data) setItems(data);
  }

  const today = new Date().toISOString().split("T")[0];
  const in15  = new Date(Date.now()+15*86400000).toISOString().split("T")[0];
  const in30  = new Date(Date.now()+30*86400000).toISOString().split("T")[0];
  const active  = items.filter(i=>i.status==="active");
  const expired = active.filter(i=>i.expiry_date < today);
  const exp15   = active.filter(i=>i.expiry_date >= today && i.expiry_date <= in15);
  const exp30   = active.filter(i=>i.expiry_date >  in15  && i.expiry_date <= in30);
  const okCount = active.filter(i=>i.expiry_date >  in30).length;
  const filtered = propF==="all" ? items : items.filter(i=>i.property===propF);

  async function save() {
    if (!form.location.trim() || !form.expiry_date) { alert("Location and expiry date are required"); return; }
    if (editItem) {
      const {data} = await supabase.from("fire_extinguishers").update(form).eq("id",editItem.id).select().single();
      if (data) setItems(p=>p.map(i=>i.id===editItem.id?data:i));
    } else {
      const {data} = await supabase.from("fire_extinguishers").insert({...form,created_by:user.id||user.name}).select().single();
      if (data) setItems(p=>[...p,data]);
    }
    setShowForm(false); setEditItem(null); setForm(blank);
  }
  async function del(id) {
    if (!window.confirm("Delete this extinguisher record?")) return;
    await supabase.from("fire_extinguishers").delete().eq("id",id);
    setItems(p=>p.filter(i=>i.id!==id));
  }
  async function markInspected(item) {
    const t = new Date().toISOString().split("T")[0];
    const n = new Date(Date.now()+30*86400000).toISOString().split("T")[0];
    const {data} = await supabase.from("fire_extinguishers").update({last_inspection:t,next_inspection:n}).eq("id",item.id).select().single();
    if (data) setItems(p=>p.map(i=>i.id===item.id?data:i));
  }
  function openAdd()     { setEditItem(null); setForm(blank); setShowForm(true); }
  function openEdit(item){ setEditItem(item); setForm({property:item.property||"pp",location:item.location||"",type:item.type||"ABC Dry Powder",capacity:item.capacity||"4 KG",serial_number:item.serial_number||"",install_date:item.install_date||"",expiry_date:item.expiry_date||"",last_inspection:item.last_inspection||"",vendor_name:item.vendor_name||"",vendor_phone:item.vendor_phone||"",notes:item.notes||"",photo_url:item.photo_url||"",status:item.status||"active"}); setShowForm(true); }
  async function handlePhoto(e) {
    const f = e.target.files[0]; if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader(); r.onload = async ev => { const c = await compress(ev.target.result,100); sf("photo_url",c); }; r.readAsDataURL(f); e.target.value="";
  }

  const inp = {padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",background:C.white,width:"100%",boxSizing:"border-box"};
  const lbl = {fontSize:11,fontWeight:600,color:C.text,marginBottom:3,display:"block"};

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40,color:C.tl,fontSize:13}}>🧯 Loading fire extinguisher data...</div>;

  return (
    <div style={{fontFamily:F.b}}>
      <style>{`@keyframes feP{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>🧯 Fire Safety</h1>
          <p style={{fontSize:10,color:C.tl,margin:"2px 0 0"}}>Fire extinguisher tracking & expiry management</p>
        </div>
        <button onClick={openAdd} style={{padding:"9px 16px",borderRadius:9,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add</button>
      </div>

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:14}}>
        <SCard icon="🧯" label="Total"     value={active.length} color={C.blue}  bg={C.bBg}/>
        {expired.length>0 && <SCard icon="❌" label="Expired"   value={expired.length} color={C.white} bg={C.red}    pulse bold/>}
        {exp15.length>0   && <SCard icon="🚨" label="< 15 days" value={exp15.length}   color={C.white} bg="#C0392B"  pulse bold/>}
        {exp30.length>0   && <SCard icon="⚠️" label="< 30 days" value={exp30.length}   color={"#7A4200"} bg={C.yBg}/>}
        <SCard icon="✅" label="All OK"    value={okCount}       color={C.green} bg={C.gBg}/>
      </div>

      {/* Property Filter — only for SA/all-prop users */}
      {user.prop==="all" && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {["all","pp","ex","mk","rs"].map(p=>(
            <button key={p} onClick={()=>setPropF(p)} style={{padding:"5px 12px",borderRadius:20,border:propF===p?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:propF===p?C.maroonSoft:C.white,fontFamily:F.b,fontSize:11,fontWeight:propF===p?700:400,color:propF===p?C.maroon:C.tl,cursor:"pointer"}}>
              {p==="all"?"🏢 All":PROPS[p]?.sn||p}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0 && <div style={{padding:24,textAlign:"center",color:C.tl,fontSize:12}}>No records found for this property.</div>}
        {filtered.map(item=>{
          const ei=expiryInfo(item), ii=inspInfo(item);
          return(
            <div key={item.id} style={{background:C.white,borderRadius:12,border:`1px solid ${ei.sev>=2?C.red:ei.sev===1?C.yellow:C.border}`,padding:14,borderLeft:`4px solid ${ei.border}`}}>
              {/* Top row */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:4}}>🧯 {item.location}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{padding:"2px 8px",borderRadius:5,background:C.maroonSoft,color:C.maroon,fontSize:10,fontWeight:700}}>{item.type}</span>
                    {item.capacity&&<span style={{padding:"2px 8px",borderRadius:5,background:C.bBg,color:C.blue,fontSize:10,fontWeight:600}}>{item.capacity}</span>}
                    <span style={{padding:"2px 8px",borderRadius:5,background:C.bg,color:C.tl,fontSize:10}}>{PROP_NAMES[item.property]||item.property}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0,marginLeft:8}}>
                  <button onClick={()=>openEdit(item)} style={{width:28,height:28,borderRadius:7,border:"none",background:C.bg,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
                  <button onClick={()=>del(item.id)}   style={{width:28,height:28,borderRadius:7,border:"none",background:C.rBg,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>
                </div>
              </div>

              {/* Expiry banner */}
              <div style={{padding:"5px 10px",borderRadius:7,background:ei.bg,marginBottom:8,animation:ei.pulse?"feP 2s ease-in-out infinite":undefined}}>
                <span style={{fontSize:11,fontWeight:700,color:ei.color}}>{ei.label}</span>
              </div>

              {/* Details grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10,color:C.tl,marginBottom:6}}>
                {item.serial_number && <span>🔖 S/N: {item.serial_number}</span>}
                {item.install_date  && <span>📅 Installed: {fmt(item.install_date)}</span>}
                <span style={{color:ii.overdue?C.red:C.tl}}>
                  🔍 Last inspected: {item.last_inspection?fmt(item.last_inspection):"Never"}{ii.overdue?" ⚠️ OVERDUE":""}
                </span>
                {item.next_inspection && <span>📆 Next: {fmt(item.next_inspection)}</span>}
                {item.vendor_name  && <span>🏢 {item.vendor_name}</span>}
                {item.vendor_phone && <a href={`tel:${item.vendor_phone}`} style={{color:C.blue,textDecoration:"none"}}>📞 {item.vendor_phone}</a>}
              </div>

              {item.notes && <div style={{fontSize:10,color:C.tl,fontStyle:"italic",marginBottom:6}}>💬 {item.notes}</div>}

              {/* Photo thumbnail */}
              {item.photo_url && <img src={item.photo_url} alt="" style={{width:60,height:60,objectFit:"cover",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:6}}/>}

              {/* Mark Inspected CTA */}
              {ii.overdue && (
                <button onClick={()=>markInspected(item)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.green}`,background:C.gBg,color:C.green,fontFamily:F.b,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  🔍 Mark Inspected Today
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={showForm} onClose={()=>{setShowForm(false);setEditItem(null);setForm(blank);}} title={editItem?"✏️ Edit Extinguisher":"🧯 Add Fire Extinguisher"} size="md">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Property *</label>
            <select value={form.property} onChange={e=>sf("property",e.target.value)} style={inp}>
              {Object.entries(PROP_NAMES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Location * (e.g. "Banquet Hall — Near Exit Door 1")</label>
            <input value={form.location} onChange={e=>sf("location",e.target.value)} placeholder="Banquet Hall Entry" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Type</label>
            <select value={form.type} onChange={e=>sf("type",e.target.value)} style={inp}>
              {FE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Capacity</label>
            <select value={form.capacity} onChange={e=>sf("capacity",e.target.value)} style={inp}>
              {FE_CAPS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Serial Number</label>
            <input value={form.serial_number} onChange={e=>sf("serial_number",e.target.value)} placeholder="Serial / ID" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Install Date</label>
            <input type="date" value={form.install_date} onChange={e=>sf("install_date",e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={lbl}>Expiry Date *</label>
            <input type="date" value={form.expiry_date} onChange={e=>sf("expiry_date",e.target.value)} style={{...inp,borderColor:!form.expiry_date?C.red:C.border}}/>
          </div>
          <div>
            <label style={lbl}>Last Inspection</label>
            <input type="date" value={form.last_inspection} onChange={e=>sf("last_inspection",e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={lbl}>Vendor Name</label>
            <input value={form.vendor_name} onChange={e=>sf("vendor_name",e.target.value)} placeholder="Service company" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Vendor Phone</label>
            <input value={form.vendor_phone} onChange={e=>sf("vendor_phone",e.target.value)} placeholder="+91..." type="tel" style={inp}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={e=>sf("notes",e.target.value)} placeholder="Any notes about condition, last service, etc." style={{...inp,minHeight:50,resize:"vertical"}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Photo (extinguisher label / condition)</label>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              {form.photo_url?(
                <div style={{position:"relative"}}>
                  <img src={form.photo_url} alt="" style={{width:80,height:80,objectFit:"cover",borderRadius:8,border:`2px solid ${C.green}`}}/>
                  <button onClick={()=>sf("photo_url","")} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",border:"none",background:C.red,color:C.white,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              ):(
                <button onClick={()=>photoRef.current?.click()} style={{padding:"8px 14px",borderRadius:8,border:`2px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:700,color:C.accent}}>📸 Take Photo</button>
              )}
            </div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button onClick={save} style={{padding:"10px 20px",borderRadius:9,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:13,fontWeight:700,cursor:"pointer"}}>💾 Save</button>
          <button onClick={()=>{setShowForm(false);setEditItem(null);setForm(blank);}} style={{padding:"10px 16px",borderRadius:9,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:12,cursor:"pointer"}}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
