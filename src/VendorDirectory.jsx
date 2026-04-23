import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, PROPS } from "./constants.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";
import { useIsMobile } from "./hooks.js";

// ─── CATEGORY CONFIG ──────────────────────────────────────────────────────────
const CAT_GROUPS = [
  { label: "Maintenance & Repairs", items: [
    "Carpenter","Electrician","False Ceiling","Glass & Aluminium Work",
    "Mason / Civil Work","Painter","Plumber","Tile & Marble Work",
    "Waterproofing","Welder / Fabrication",
  ]},
  { label: "MEP (Mechanical, Electrical, Plumbing)", items: [
    "AC / HVAC","Borewell","Electrical Panel / Transformer",
    "Elevator / Lift","Fire Fighting System","Generator / DG Set",
    "Solar Panel","STP / WTP Plant","UPS / Inverter / Battery","Water Pump & Motor",
  ]},
  { label: "Security & Surveillance", items: [
    "Access Control / Biometric","Boom Barrier / Bollards","CCTV / Security Systems",
    "Fire Alarm System","Security Guard Agency",
  ]},
  { label: "Event & Hospitality", items: [
    "Anchor / Emcee","Band / Music","Catering","Crockery & Cutlery Rental",
    "DJ / Sound System","Fireworks / Pyrotechnics","Florist / Decoration",
    "Furniture Rental","Lighting & LED","Photography / Videography",
    "Portable Toilet / Washroom","Stage & Backdrop","Tent / Pandal / Shamiyana",
    "Valet Parking Service",
  ]},
  { label: "Cleaning & Hygiene", items: [
    "Cleaning Supplies (Kleanfix etc)","Deep Cleaning Service","Fumigation",
    "Garbage / Waste Disposal","Laundry / Dry Cleaning","Pest Control",
    "Water Tanker",
  ]},
  { label: "Horticulture & Garden", items: [
    "Artificial Grass","Fertilizer & Pesticide","Gardening / Landscaping",
    "Lawn Mower & Tools","Nursery / Plant Supplier","Tree Cutting Service",
  ]},
  { label: "Office & IT", items: [
    "Computer / Laptop Repair","EPABX / Intercom","Internet / WiFi Provider",
    "Printer / Copier Service","Signage & Printing","Stationery Supplier",
  ]},
  { label: "Transport & Logistics", items: [
    "Courier / Delivery","Crane / JCB / Heavy Equipment",
    "Staff Bus / Van","Tempo / Truck / Transport",
  ]},
  { label: "Government & Compliance", items: [
    "Fire NOC Consultant","Health License Consultant","Insurance Agent",
    "Labour Compliance","Pollution Control",
  ]},
  { label: "Miscellaneous", items: [
    "Architect","Chartered Accountant","Interior Designer",
    "Legal / Advocate","Other",
  ]},
];

const CATEGORIES = CAT_GROUPS.flatMap(g => g.items);

const CAT_COLORS = {
  // Maintenance
  "Electrician":                    { c:"#B45309", bg:"#FEF3C7" },
  "Plumber":                        { c:"#1D4ED8", bg:"#DBEAFE" },
  "Carpenter":                      { c:"#92400E", bg:"#FDE68A" },
  "Painter":                        { c:"#7C3AED", bg:"#EDE9FE" },
  "Mason / Civil Work":             { c:"#78350F", bg:"#FEF3C7" },
  "Welder / Fabrication":           { c:"#991B1B", bg:"#FEE2E2" },
  "Glass & Aluminium Work":         { c:"#0369A1", bg:"#E0F2FE" },
  "Waterproofing":                  { c:"#0E7490", bg:"#CFFAFE" },
  "False Ceiling":                  { c:"#6B21A8", bg:"#F3E8FF" },
  "Tile & Marble Work":             { c:"#9D174D", bg:"#FCE7F3" },
  // MEP
  "AC / HVAC":                      { c:"#0E7490", bg:"#CFFAFE" },
  "Generator / DG Set":             { c:"#B91C1C", bg:"#FEE2E2" },
  "Elevator / Lift":                { c:"#4338CA", bg:"#E0E7FF" },
  "Fire Fighting System":           { c:"#DC2626", bg:"#FEE2E2" },
  "UPS / Inverter / Battery":       { c:"#D97706", bg:"#FEF3C7" },
  "Electrical Panel / Transformer": { c:"#B45309", bg:"#FEF3C7" },
  "STP / WTP Plant":                { c:"#0369A1", bg:"#DBEAFE" },
  "Solar Panel":                    { c:"#15803D", bg:"#DCFCE7" },
  "Water Pump & Motor":             { c:"#0284C7", bg:"#BAE6FD" },
  "Borewell":                       { c:"#1D4ED8", bg:"#DBEAFE" },
  // Security
  "CCTV / Security Systems":        { c:"#6B21A8", bg:"#F3E8FF" },
  "Access Control / Biometric":     { c:"#7C3AED", bg:"#EDE9FE" },
  "Security Guard Agency":          { c:"#4338CA", bg:"#E0E7FF" },
  "Boom Barrier / Bollards":        { c:"#1E40AF", bg:"#DBEAFE" },
  "Fire Alarm System":              { c:"#DC2626", bg:"#FEE2E2" },
  // Event
  "Catering":                       { c:"#C2410C", bg:"#FFEDD5" },
  "Tent / Pandal / Shamiyana":      { c:"#0F766E", bg:"#CCFBF1" },
  "Florist / Decoration":           { c:"#BE185D", bg:"#FCE7F3" },
  "DJ / Sound System":              { c:"#4338CA", bg:"#E0E7FF" },
  "Lighting & LED":                 { c:"#A16207", bg:"#FEF9C3" },
  "Valet Parking Service":          { c:"#7B1E2F", bg:"#F9F0F2" },
  "Photography / Videography":      { c:"#1E3A5F", bg:"#DBEAFE" },
  "Anchor / Emcee":                 { c:"#9D174D", bg:"#FCE7F3" },
  "Band / Music":                   { c:"#6D28D9", bg:"#EDE9FE" },
  "Fireworks / Pyrotechnics":       { c:"#B91C1C", bg:"#FEE2E2" },
  "Stage & Backdrop":               { c:"#0F766E", bg:"#CCFBF1" },
  "Furniture Rental":               { c:"#92400E", bg:"#FDE68A" },
  "Crockery & Cutlery Rental":      { c:"#78350F", bg:"#FEF3C7" },
  "Portable Toilet / Washroom":     { c:"#0369A1", bg:"#E0F2FE" },
  // Cleaning
  "Cleaning Supplies (Kleanfix etc)":{ c:"#166534", bg:"#DCFCE7" },
  "Pest Control":                   { c:"#065F46", bg:"#D1FAE5" },
  "Laundry / Dry Cleaning":         { c:"#0369A1", bg:"#E0F2FE" },
  "Water Tanker":                   { c:"#0284C7", bg:"#BAE6FD" },
  "Garbage / Waste Disposal":       { c:"#374151", bg:"#F3F4F6" },
  "Deep Cleaning Service":          { c:"#1E3A5F", bg:"#DBEAFE" },
  "Fumigation":                     { c:"#065F46", bg:"#D1FAE5" },
  // Horticulture
  "Gardening / Landscaping":        { c:"#15803D", bg:"#DCFCE7" },
  "Nursery / Plant Supplier":       { c:"#166534", bg:"#D1FAE5" },
  "Fertilizer & Pesticide":         { c:"#4D7C0F", bg:"#ECFCCB" },
  "Lawn Mower & Tools":             { c:"#65A30D", bg:"#F7FEE7" },
  "Tree Cutting Service":           { c:"#78350F", bg:"#FEF3C7" },
  "Artificial Grass":               { c:"#16A34A", bg:"#DCFCE7" },
  // Office & IT
  "Printer / Copier Service":       { c:"#374151", bg:"#F3F4F6" },
  "Internet / WiFi Provider":       { c:"#1D4ED8", bg:"#DBEAFE" },
  "Computer / Laptop Repair":       { c:"#1E40AF", bg:"#EFF6FF" },
  "EPABX / Intercom":               { c:"#4338CA", bg:"#E0E7FF" },
  "Stationery Supplier":            { c:"#6B21A8", bg:"#F3E8FF" },
  "Signage & Printing":             { c:"#B45309", bg:"#FEF3C7" },
  // Transport
  "Tempo / Truck / Transport":      { c:"#374151", bg:"#F3F4F6" },
  "Staff Bus / Van":                { c:"#1D4ED8", bg:"#DBEAFE" },
  "Courier / Delivery":             { c:"#0E7490", bg:"#CFFAFE" },
  "Crane / JCB / Heavy Equipment":  { c:"#B45309", bg:"#FEF3C7" },
  // Government
  "Fire NOC Consultant":            { c:"#DC2626", bg:"#FEE2E2" },
  "Health License Consultant":      { c:"#0369A1", bg:"#E0F2FE" },
  "Pollution Control":              { c:"#065F46", bg:"#D1FAE5" },
  "Labour Compliance":              { c:"#6B21A8", bg:"#F3E8FF" },
  "Insurance Agent":                { c:"#0F766E", bg:"#CCFBF1" },
  // Misc
  "Interior Designer":              { c:"#BE185D", bg:"#FCE7F3" },
  "Architect":                      { c:"#1E3A5F", bg:"#DBEAFE" },
  "Legal / Advocate":               { c:"#374151", bg:"#F3F4F6" },
  "Chartered Accountant":           { c:"#166534", bg:"#DCFCE7" },
  "Other":                          { c:"#374151", bg:"#F3F4F6" },
};

const PROP_OPTS = [
  { v:"all", l:"All Properties" },
  { v:"pp",  l:"Pushpanjali" },
  { v:"ex",  l:"Exotica" },
  { v:"mk",  l:"Manaktala" },
  { v:"rs",  l:"Restro" },
];

// ─── CATEGORY SEARCH SELECT ──────────────────────────────────────────────────
function CatSelect({ value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = q.trim()
    ? CAT_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.items.length > 0)
    : CAT_GROUPS;

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div onClick={() => setOpen(p => !p)} style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`,
        background:C.bg, cursor:"pointer", minHeight:38,
      }}>
        <span style={{ fontSize:12, color: value ? C.text : C.tl, fontFamily:F.b }}>
          {value || "Select category..."}
        </span>
        <span style={{ fontSize:9, color:C.tl }}>▾</span>
      </div>
      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, right:0, zIndex:200,
          background:C.white, borderRadius:10, border:`1px solid ${C.border}`,
          boxShadow:"0 4px 20px rgba(0,0,0,0.12)", marginTop:4,
          display:"flex", flexDirection:"column",
        }}>
          <div style={{ padding:"6px 8px", borderBottom:`1px solid ${C.border}` }}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Search categories..."
              style={{ width:"100%", padding:"5px 8px", borderRadius:6,
                border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12,
                outline:"none", boxSizing:"border-box" }}/>
          </div>
          <div style={{ maxHeight:240, overflowY:"auto" }}>
            {filtered.map(g => (
              <div key={g.label}>
                <div style={{ padding:"5px 10px 2px", fontSize:9, fontWeight:700,
                  color:C.tl, textTransform:"uppercase", letterSpacing:"0.5px",
                  background:C.bg, borderTop:`1px solid ${C.border}` }}>
                  {g.label}
                </div>
                {g.items.map(item => (
                  <div key={item} onMouseDown={() => { onChange(item); setOpen(false); setQ(""); }}
                    style={{ padding:"7px 14px", cursor:"pointer", fontSize:12, fontFamily:F.b,
                      background: item === value ? C.maroonSoft : "transparent",
                      color: item === value ? C.maroon : C.text,
                      fontWeight: item === value ? 600 : 400 }}>
                    {item}
                  </div>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding:"12px 10px", fontSize:11, color:C.tl, textAlign:"center" }}>
                No categories found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STAR RATING ─────────────────────────────────────────────────────────────
function Stars({ rating, onChange }) {
  return (
    <div style={{ display:"flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i}
          onClick={onChange ? () => onChange(i) : undefined}
          style={{ fontSize:13, color: i <= (rating||0) ? "#F59E0B" : "#D1D5DB", cursor: onChange ? "pointer" : "default", lineHeight:1 }}>★</span>
      ))}
    </div>
  );
}

// ─── VENDOR FORM ──────────────────────────────────────────────────────────────
function VendorForm({ init, onSave, onCancel, user, lang }) {
  const [f, sF] = useState(init || {
    name:"", company:"", phone:"", alt_phone:"", email:"",
    category: CATEGORIES[0], property:"all", notes:"", rating:3,
  });
  const isEdit = !!init?.id;
  const inp = (k, v) => sF(p => ({ ...p, [k]: v }));
  const save = () => { if (!f.name.trim() || !f.phone.trim()) return; onSave({ ...f, created_by: f.created_by || user.id }); };

  const F2 = { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none", boxSizing:"border-box", background:C.bg };
  const Lb = { fontSize:11, fontWeight:600, color:C.tl, marginBottom:3, display:"block" };
  const L = lang === "hi";

  return (
    <div style={{ background:C.white, borderRadius:12, padding:16, border:`2px solid ${C.maroon}`, marginBottom:16 }}>
      <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:12 }}>
        {isEdit ? "✏️ Edit Vendor" : "➕ Add Vendor"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div style={{ gridColumn:"1/-1" }}>
          <label style={Lb}>👤 {L?"नाम":"Name"} *</label>
          <input value={f.name} onChange={e=>inp("name",e.target.value)} placeholder="Contact person name" style={F2}/>
        </div>
        <div style={{ gridColumn:"1/-1" }}>
          <label style={Lb}>🏢 {L?"कंपनी":"Company"}</label>
          <input value={f.company} onChange={e=>inp("company",e.target.value)} placeholder="Company / firm name" style={F2}/>
        </div>
        <div>
          <label style={Lb}>📞 {L?"फ़ोन":"Phone"} *</label>
          <input type="tel" value={f.phone} onChange={e=>inp("phone",e.target.value)} placeholder="+91 99999 99999" style={F2}/>
        </div>
        <div>
          <label style={Lb}>📞 {L?"वैकल्पिक फ़ोन":"Alt Phone"}</label>
          <input type="tel" value={f.alt_phone} onChange={e=>inp("alt_phone",e.target.value)} placeholder="Optional second number" style={F2}/>
        </div>
        <div>
          <label style={Lb}>✉️ {L?"ईमेल":"Email"}</label>
          <input type="email" value={f.email} onChange={e=>inp("email",e.target.value)} placeholder="email@example.com" style={F2}/>
        </div>
        <div style={{ gridColumn:"1/-1" }}>
          <label style={Lb}>🏷️ {L?"श्रेणी":"Category"}</label>
          <CatSelect value={f.category} onChange={v=>inp("category",v)} />
        </div>
        <div>
          <label style={Lb}>🏛️ {L?"वेन्यू":"Property"}</label>
          <select value={f.property} onChange={e=>inp("property",e.target.value)} style={F2}>
            {PROP_OPTS.map(p => <option key={p.v} value={p.v}>{p.v!=="all"?PROPS[p.v]?.icon+" ":""}{p.l}</option>)}
          </select>
        </div>
        <div>
          <label style={Lb}>⭐ {L?"रेटिंग":"Rating"}</label>
          <div style={{ padding:"8px 10px", background:C.bg, borderRadius:8, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:6 }}>
            <Stars rating={f.rating} onChange={v => inp("rating", v)} />
            <span style={{ fontSize:10, color:C.tl, fontFamily:F.b }}>{f.rating}/5</span>
          </div>
        </div>
        <div style={{ gridColumn:"1/-1" }}>
          <label style={Lb}>📝 {L?"नोट्स":"Notes"}</label>
          <textarea value={f.notes} onChange={e=>inp("notes",e.target.value)} placeholder="Working hours, payment terms, specialities..." rows={2}
            style={{ ...F2, resize:"vertical" }}/>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} style={{ padding:"9px 18px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          {isEdit ? "💾 Update" : "✅ Add Vendor"}
        </button>
        <button onClick={onCancel} style={{ padding:"9px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.white, color:C.text, fontFamily:F.b, fontSize:13, cursor:"pointer" }}>
          {L ? "रद्द" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// ─── VENDOR CARD ──────────────────────────────────────────────────────────────
function VendorCard({ vendor: v, onEdit, onDelete, lang }) {
  const [delConfirm, setDC] = useState(false);
  const cc = CAT_COLORS[v.category] || CAT_COLORS.Other;
  const waPhone = v.phone.replace(/\D/g, "");
  const L = lang === "hi";

  return (
    <div style={{
      background:C.white, borderRadius:12, border:`1px solid ${C.border}`,
      overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.05)",
      borderTop:`3px solid ${cc.c}`,
    }}>
      <div style={{ padding:"12px 14px" }}>
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:13, color:C.text, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {v.name}
            </div>
            {v.company && (
              <div style={{ fontSize:11, color:C.tl, fontFamily:F.b, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                🏢 {v.company}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:4, flexShrink:0 }}>
            <button onClick={() => onEdit(v)} style={{ padding:"4px 8px", borderRadius:6, border:`1px solid ${C.border}`, background:C.white, cursor:"pointer", fontSize:11 }}>✏️</button>
            {!delConfirm
              ? <button onClick={() => setDC(true)} style={{ padding:"4px 8px", borderRadius:6, border:"none", background:C.rBg, cursor:"pointer", fontSize:11, color:C.red }}>🗑️</button>
              : <div style={{ display:"flex", gap:3 }}>
                  <button onClick={() => onDelete(v.id)} style={{ padding:"4px 8px", borderRadius:6, border:"none", background:C.red, color:C.white, cursor:"pointer", fontFamily:F.b, fontSize:10, fontWeight:700 }}>Yes</button>
                  <button onClick={() => setDC(false)} style={{ padding:"4px 8px", borderRadius:6, border:`1px solid ${C.border}`, background:C.white, cursor:"pointer", fontFamily:F.b, fontSize:10 }}>No</button>
                </div>
            }
          </div>
        </div>

        {/* Badges */}
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          <span style={{ fontSize:9, padding:"2px 8px", borderRadius:10, background:cc.bg, color:cc.c, fontWeight:700, fontFamily:F.b }}>
            {v.category}
          </span>
          <span style={{ fontSize:9, padding:"2px 8px", borderRadius:10, background:C.maroonSoft, color:C.maroon, fontWeight:600, fontFamily:F.b }}>
            {v.property === "all" ? "All" : (PROPS[v.property]?.icon + " " + PROPS[v.property]?.sn) || v.property}
          </span>
          {v.rating > 0 && (
            <span style={{ fontSize:9, padding:"2px 8px", borderRadius:10, background:C.yBg, color:C.yellow, fontFamily:F.b, display:"flex", alignItems:"center", gap:2 }}>
              <span style={{ color:"#F59E0B" }}>★</span> {v.rating}/5
            </span>
          )}
        </div>

        {/* Phone actions */}
        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:v.notes?8:0 }}>
          <a href={`tel:${v.phone}`}
            style={{ display:"flex", alignItems:"center", gap:4, padding:"7px 12px", borderRadius:8, background:C.gBg, color:C.green, textDecoration:"none", fontFamily:F.b, fontSize:11, fontWeight:700 }}>
            📞 {v.phone}
          </a>
          <a href={`https://wa.me/91${waPhone}`} target="_blank" rel="noreferrer"
            style={{ display:"flex", alignItems:"center", gap:4, padding:"7px 10px", borderRadius:8, background:"#DCF8C6", color:"#128C7E", textDecoration:"none", fontFamily:F.b, fontSize:11, fontWeight:700 }}>
            💬 WA
          </a>
          {v.alt_phone && (
            <a href={`tel:${v.alt_phone}`}
              style={{ display:"flex", alignItems:"center", gap:3, padding:"7px 10px", borderRadius:8, background:C.bBg, color:C.blue, textDecoration:"none", fontFamily:F.b, fontSize:11, fontWeight:600 }}>
              📞 {v.alt_phone}
            </a>
          )}
        </div>

        {/* Notes */}
        {v.notes && (
          <div style={{ fontSize:10, color:C.tl, fontFamily:F.b, fontStyle:"italic", marginTop:6, lineHeight:1.5, borderTop:`1px solid ${C.border}`, paddingTop:6 }}>
            {v.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function VendorDirectory({ user, lang }) {
  const isMobile = useIsMobile();
  const [vendors, setVendors] = useState([]);
  const [loading, setLd] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCF] = useState("all");
  const [propFilter, setPF] = useState(user.prop === "all" ? "all" : (user.prop || "pp"));
  const [showForm, setSF] = useState(false);
  const [editV, setEV] = useState(null);
  const L = lang === "hi";

  const load = useCallback(async () => {
    setLd(true);
    const { data } = await supabase.from("vendors").select("*").eq("is_active", true).order("category").order("name");
    setVendors(data || []);
    setLd(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (f) => {
    if (f.id) {
      await supabase.from("vendors").update({
        name:f.name, company:f.company||null, phone:f.phone, alt_phone:f.alt_phone||null,
        email:f.email||null, category:f.category, property:f.property,
        notes:f.notes||null, rating:f.rating,
      }).eq("id", f.id);
    } else {
      await supabase.from("vendors").insert({
        name:f.name, company:f.company||null, phone:f.phone, alt_phone:f.alt_phone||null,
        email:f.email||null, category:f.category, property:f.property,
        notes:f.notes||null, rating:f.rating, created_by:f.created_by, is_active:true,
      });
    }
    getSAAndAdminIds(null).then(ids=>notifyMultiple("vendor_added","📞 New vendor added: "+(f.name||"")+" ("+f.category+")",user?.id||"system",user?.name||"admin",ids,null));
      setSF(false); setEV(null); load();
  };

  const del = async (id) => {
    await supabase.from("vendors").update({ is_active: false }).eq("id", id);
    load();
  };

  // Filter logic
  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.name.toLowerCase().includes(q) || (v.company||"").toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || (v.phone||"").includes(q);
    const matchCat = catFilter === "all" || v.category === catFilter;
    const matchProp = propFilter === "all" || v.property === "all" || v.property === propFilter;
    return matchSearch && matchCat && matchProp;
  });

  // Group by category
  const groups = {};
  filtered.forEach(v => {
    if (!groups[v.category]) groups[v.category] = [];
    groups[v.category].push(v);
  });

  // Categories that actually have vendors (for the filter bar)
  const usedCats = [...new Set(vendors.map(v => v.category))].sort();

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <h1 style={{ fontFamily:F.d, fontSize:22, fontWeight:700, color:C.maroon, margin:0 }}>
          📞 {L ? "वेंडर डायरेक्टरी" : "Vendor Directory"}
        </h1>
        <button onClick={() => { setEV(null); setSF(!showForm); }}
          style={{ padding:"7px 14px", borderRadius:8, border:"none", background:C.maroon, color:C.white, fontFamily:F.b, fontSize:12, fontWeight:700, cursor:"pointer", width: isMobile ? "100%" : "auto" }}>
          ➕ {L ? "वेंडर जोड़ें" : "Add Vendor"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <VendorForm init={editV} onSave={save} onCancel={() => { setSF(false); setEV(null); }} user={user} lang={lang} />
      )}

      {/* Search + property filter */}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:180, position:"relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={L ? "नाम, कंपनी, श्रेणी खोजें..." : "Search name, company, category..."}
            style={{ width:"100%", padding:"9px 12px 9px 34px", borderRadius:9, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none", boxSizing:"border-box", background:C.white }}/>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13 }}>🔍</span>
          {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"none", cursor:"pointer", color:C.tl, fontSize:13 }}>✕</button>}
        </div>
        <select value={propFilter} onChange={e => setPF(e.target.value)}
          style={{ padding:"9px 10px", borderRadius:9, border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12, outline:"none", background:C.white, cursor:"pointer" }}>
          {PROP_OPTS.map(p => <option key={p.v} value={p.v}>{p.v !== "all" ? (PROPS[p.v]?.icon + " ") : ""}{p.l}</option>)}
        </select>
      </div>

      {/* Category filter chips */}
      {usedCats.length > 0 && (
        <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
          <button onClick={() => setCF("all")}
            style={{ padding:"4px 12px", borderRadius:20, border:catFilter==="all"?`2px solid ${C.maroon}`:`1px solid ${C.border}`, background:catFilter==="all"?C.maroonSoft:C.white, fontFamily:F.b, fontSize:10, fontWeight:catFilter==="all"?700:400, color:catFilter==="all"?C.maroon:C.tl, cursor:"pointer" }}>
            All ({vendors.filter(v=>propFilter==="all"||v.property==="all"||v.property===propFilter).length})
          </button>
          {usedCats.map(cat => {
            const cc = CAT_COLORS[cat] || CAT_COLORS.Other;
            const cnt = vendors.filter(v => v.category === cat && (propFilter==="all" || v.property==="all" || v.property===propFilter)).length;
            if (!cnt) return null;
            return (
              <button key={cat} onClick={() => setCF(cat)}
                style={{ padding:"4px 12px", borderRadius:20, border:catFilter===cat?`2px solid ${cc.c}`:`1px solid ${C.border}`, background:catFilter===cat?cc.bg:C.white, fontFamily:F.b, fontSize:10, fontWeight:catFilter===cat?700:400, color:catFilter===cat?cc.c:C.tl, cursor:"pointer" }}>
                {cat} ({cnt})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign:"center", padding:24, color:C.tl, fontSize:12, fontFamily:F.b }}>Loading vendors...</div>}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ background:C.white, borderRadius:12, padding:32, textAlign:"center", border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:22, marginBottom:8 }}>📞</div>
          <div style={{ fontFamily:F.d, fontSize:15, fontWeight:700, color:C.maroon, marginBottom:4 }}>
            {search || catFilter !== "all" ? "No vendors match your search" : "No vendors added yet"}
          </div>
          <div style={{ fontSize:12, color:C.tl, fontFamily:F.b }}>
            {search || catFilter !== "all" ? "Try a different search or filter" : "Click \"Add Vendor\" to add your first contact"}
          </div>
        </div>
      )}

      {/* Grouped vendor cards */}
      {!loading && Object.keys(groups).sort().map(cat => {
        const cc = CAT_COLORS[cat] || CAT_COLORS.Other;
        return (
          <div key={cat} style={{ marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ width:4, height:14, borderRadius:2, background:cc.c, display:"block" }}/>
              <h3 style={{ fontFamily:F.d, fontSize:13, fontWeight:700, color:cc.c, margin:0 }}>{cat}</h3>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:cc.bg, color:cc.c, fontFamily:F.b, fontWeight:600 }}>{groups[cat].length}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
              {groups[cat].map(v => (
                <VendorCard key={v.id} vendor={v} onEdit={v => { setEV(v); setSF(true); window.scrollTo({top:0,behavior:"smooth"}); }} onDelete={del} lang={lang} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Stats bar */}
      {vendors.length > 0 && (
        <div style={{ background:C.white, borderRadius:10, padding:"10px 14px", border:`1px solid ${C.border}`, display:"flex", gap:16, flexWrap:"wrap", marginTop:8 }}>
          <span style={{ fontSize:11, fontFamily:F.b, color:C.tl }}>{L?"कुल":"Total"}: <strong style={{ color:C.maroon }}>{vendors.length}</strong> {L?"वेंडर":"vendors"}</span>
          <span style={{ fontSize:11, fontFamily:F.b, color:C.tl }}>{L?"श्रेणियां":"Categories"}: <strong style={{ color:C.maroon }}>{usedCats.length}</strong></span>
          {filtered.length !== vendors.length && <span style={{ fontSize:11, fontFamily:F.b, color:C.blue }}>{L?"दिखाए":"Showing"}: <strong>{filtered.length}</strong></span>}
        </div>
      )}

    </div>
  );
}
