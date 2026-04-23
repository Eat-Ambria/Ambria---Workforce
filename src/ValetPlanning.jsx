import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { C as C_BASE, F, PROPS } from "./constants.js";
import { useT } from "./ThemeContext.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";
import { useIsMobile } from "./hooks.js";

console.log(
  "Run in Supabase if staff_allocation column missing:",
  "ALTER TABLE valet_bookings ADD COLUMN IF NOT EXISTS staff_allocation JSONB;",
  "ALTER TABLE valet_bookings ADD COLUMN IF NOT EXISTS override_reason TEXT;"
);

// ─── ALLOCATION MATRICES ──────────────────────────────────────────────────────
const VALET_ALLOCATIONS = {
  pp: {
    name: "Pushpanjali",
    ranges: [
      { min:100, max:150,  label:"100-150"  },
      { min:200, max:250,  label:"200-250"  },
      { min:300, max:350,  label:"300-350"  },
      { min:400, max:500,  label:"400-500"  },
      { min:600, max:800,  label:"600-800"  },
      { min:900, max:1000, label:"900-1000" },
    ],
    roles: {
      "Key Man": [1,  1,  1,  1,  1,  1 ],
      "Driver":  [2,  4,  6,  7,  10, 13],
      "Guard":   [0,  1,  1,  1,  2,  2 ],
      "Rider":   [0,  0,  0,  0,  1,  1 ],
      "Gun Man": [0,  0,  0,  0,  0,  0 ],
      "Bouncer": [0,  0,  0,  0,  0,  0 ],
    },
    totals: [3, 6, 8, 9, 14, 17],
  },
  ex: {
    name: "Exotica",
    ranges: [
      { min:100,  max:100,  label:"100"  },
      { min:200,  max:200,  label:"200"  },
      { min:300,  max:300,  label:"300"  },
      { min:400,  max:400,  label:"400"  },
      { min:500,  max:500,  label:"500"  },
      { min:600,  max:600,  label:"600"  },
      { min:700,  max:700,  label:"700"  },
      { min:800,  max:800,  label:"800"  },
      { min:900,  max:900,  label:"900"  },
      { min:1000, max:1000, label:"1000" },
    ],
    roles: {
      "Key Man": [1, 1,  1,  1,  1,  1,  2,  2,  2,  2 ],
      "Driver":  [2, 3,  5,  6,  8,  10, 12, 14, 17, 19],
      "Guard":   [0, 0,  1,  2,  2,  2,  2,  2,  3,  3 ],
      "Rider":   [0, 0,  0,  0,  0,  1,  1,  1,  1,  1 ],
      "Gun Man": [0, 0,  0,  0,  0,  0,  0,  0,  0,  0 ],
      "Bouncer": [0, 0,  0,  0,  0,  0,  0,  0,  0,  0 ],
    },
    totals: [3, 4, 7, 9, 11, 14, 17, 19, 23, 25],
  },
  mk: {
    name: "Manaktala",
    ranges: [
      { min:100, max:150, label:"100-150" },
      { min:200, max:250, label:"200-250" },
      { min:300, max:350, label:"300-350" },
      { min:400, max:450, label:"400-450" },
      { min:500, max:550, label:"500-550" },
      { min:600, max:700, label:"600-700" },
      { min:800, max:900, label:"800-900" },
    ],
    roles: {
      "Key Man": [1, 1, 1, 1,  1,  1,  1 ],
      "Driver":  [2, 4, 5, 6,  8,  9,  11],
      "Guard":   [0, 0, 0, 1,  1,  1,  3 ],
      "Rider":   [0, 0, 0, 0,  0,  1,  1 ],
      "Gun Man": [0, 0, 0, 0,  0,  0,  0 ],
      "Bouncer": [0, 0, 0, 0,  0,  0,  0 ],
    },
    totals: [3, 5, 6, 8, 10, 12, 16],
  },
  rs: {
    name: "Restro",
    ranges: [
      { min:100, max:100, label:"100" },
      { min:150, max:150, label:"150" },
      { min:200, max:200, label:"200" },
    ],
    roles: {
      "Key Man": [1, 1, 1],
      "Driver":  [3, 4, 5],
      "Guard":   [0, 0, 1],
      "Rider":   [0, 0, 0],
      "Gun Man": [0, 0, 0],
      "Bouncer": [0, 0, 0],
    },
    totals: [4, 5, 7],
  },
};

const ROLE_ORDER = ["Key Man", "Driver", "Guard", "Rider", "Gun Man", "Bouncer"];

const ROLE_META = {
  "Key Man": { icon:"🔑", color:"#7B1E2F", labelHi:"की मैन"  },
  "Driver":  { icon:"🚗", color:"#1E66C8", labelHi:"ड्राइवर" },
  "Guard":   { icon:"🛡️", color:"#7C3AED", labelHi:"गार्ड"   },
  "Rider":   { icon:"🏍️", color:"#059669", labelHi:"राइडर"   },
  "Gun Man": { icon:"🔫", color:"#DC2626", labelHi:"गन मैन"  },
  "Bouncer": { icon:"💪", color:"#D97706", labelHi:"बाउंसर" },
};

// ─── EVENT TYPES ──────────────────────────────────────────────────────────────
const EVENT_TYPES = {
  standard_wedding: { l:"Standard Wedding",            lH:"स्टैंडर्ड शादी",    icon:"💒", carRatio:0.4, vip:false },
  premium_wedding:  { l:"Premium Wedding",             lH:"प्रीमियम शादी",    icon:"👑", carRatio:0.5, vip:false },
  corporate:        { l:"Corporate Event",             lH:"कॉर्पोरेट इवेंट",  icon:"🏢", carRatio:0.6, vip:false },
  luxury_vip:       { l:"Luxury / VIP Event",          lH:"लग्ज़री / VIP",    icon:"⭐", carRatio:0.7, vip:true  },
  birthday:         { l:"Birthday / Small Party",      lH:"जन्मदिन / पार्टी", icon:"🎂", carRatio:0.3, vip:false },
  exhibition:       { l:"Exhibition / Large Gathering", lH:"प्रदर्शनी",        icon:"🎪", carRatio:0.5, vip:false },
  other:            { l:"Other",                       lH:"अन्य",             icon:"📋", carRatio:0.4, vip:false },
};

const PRIORITIES = {
  normal:   { l:"Normal",                  lH:"सामान्य",          c:C.tl,     bg:"#F0F0F0" },
  high:     { l:"High — Elite Crowd",      lH:"हाई — एलीट क्राउड", c:"#d97706", bg:"#FFF7ED" },
  critical: { l:"Critical — Luxury Event", lH:"क्रिटिकल — लग्ज़री", c:C.red,    bg:C.rBg   },
};

const MN_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MN_HI = ["जनवरी","फ़रवरी","मार्च","अप्रैल","मई","जून","जुलाई","अगस्त","सितंबर","अक्टूबर","नवंबर","दिसंबर"];
const DY_EN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DY_HI = ["रवि","सोम","मंगल","बुध","गुरु","शुक्र","शनि"];

function dIM(y,m){return new Date(y,m+1,0).getDate();}
function fDM(y,m){return new Date(y,m,1).getDay();}
function toDS(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function fmtD(ds){if(!ds)return "";const[y,mo,d]=ds.split("-");return `${parseInt(d)} ${MN_EN[parseInt(mo)-1].slice(0,3)} ${y}`;}
function fmtT(t){if(!t)return "";const[h,m]=t.split(":");const hr=parseInt(h);return `${hr>12?hr-12:hr}:${m} ${hr>=12?"PM":"AM"}`;}

const STATUS = {
  planned:   { l:"Planned",   lH:"नियोजित", c:C.yellow, bg:C.yBg    },
  confirmed: { l:"Confirmed", lH:"पुष्टि",  c:C.green,  bg:C.gBg    },
  completed: { l:"Completed", lH:"पूर्ण",   c:C.tl,     bg:"#EFEFEF" },
};

const PROP_OPTS = [
  {v:"all",l:"All"},
  {v:"pp", l:"Pushpanjali"},
  {v:"ex", l:"Exotica"},
  {v:"mk", l:"Manaktala"},
  {v:"rs", l:"Restro"},
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcCars(guests, eventType){
  const gc = parseInt(guests)||0;
  if(!gc) return "";
  return String(Math.ceil(gc*(EVENT_TYPES[eventType]?.carRatio||0.4)));
}

function findRange(prop, count){
  const a = VALET_ALLOCATIONS[prop];
  if(!a || !count) return 0;
  for(let i=0;i<a.ranges.length;i++){
    if(count <= a.ranges[i].max) return i;
  }
  return a.ranges.length-1;
}

function getRangeAlloc(prop, ri){
  const a = VALET_ALLOCATIONS[prop];
  if(!a) return {};
  const out = {};
  ROLE_ORDER.forEach(r=>{ out[r] = a.roles[r]?.[ri]??0; });
  return out;
}

function computeFinalAlloc(prop, ri, overrideEnabled, overrides){
  const base = getRangeAlloc(prop, ri);
  if(!overrideEnabled) return base;
  const out = {...base};
  ROLE_ORDER.forEach(r=>{ if(overrides[r]!==undefined) out[r] = parseInt(overrides[r])||0; });
  return out;
}

// ─── STAFF ALLOCATION TABLE ───────────────────────────────────────────────────
function StaffAllocationTable({ prop, rangeIdx, guestCount, overrideEnabled, overrides, overrideReason, onToggleOverride, onOverrideChange, onReasonChange, lang }){
  const C = useT();
  const a = VALET_ALLOCATIONS[prop];
  if(!a) return null;
  const range = a.ranges[rangeIdx];
  const L = lang==="hi";

  const getVal = r => (overrideEnabled && overrides[r]!==undefined)
    ? (parseInt(overrides[r])||0)
    : (a.roles[r]?.[rangeIdx]??0);

  const total = ROLE_ORDER.reduce((s,r)=>s+getVal(r),0);
  const visibleRoles = overrideEnabled ? ROLE_ORDER : ROLE_ORDER.filter(r=>getVal(r)>0);
  const maxGuests = a.ranges[a.ranges.length-1].max;
  const exceeded = guestCount && parseInt(guestCount)>maxGuests;

  return(
    <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginTop:8}}>
      <div style={{background:C.maroonSoft,padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:F.d,fontSize:13,fontWeight:700,color:C.maroon}}>
          🚗 {L?"स्टाफ आवंटन":"Staff Allocation"}: {a.name}
        </div>
        {!!guestCount&&(
          <div style={{fontSize:10,color:C.tl,fontFamily:F.b,marginTop:2}}>
            {L?"मेहमान":"Guests"}: {guestCount} → {L?"रेंज":"Range"}: <strong style={{color:C.maroon}}>{range.label}</strong>
            {exceeded&&<span style={{color:"#D97706",marginLeft:6}}>⚠️ {L?"अधिकतम सीमा":"Max range used"}</span>}
          </div>
        )}
      </div>

      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:C.bg}}>
            <th style={{padding:"6px 12px",textAlign:"left",fontFamily:F.b,fontSize:10,fontWeight:700,color:C.tl}}>{L?"भूमिका":"Role"}</th>
            <th style={{padding:"6px 12px",textAlign:"center",fontFamily:F.b,fontSize:10,fontWeight:700,color:C.tl}}>{L?"संख्या":"Required"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRoles.map(role=>{
            const meta = ROLE_META[role];
            const val = getVal(role);
            return(
              <tr key={role} style={{borderLeft:`3px solid ${meta.color}`}}>
                <td style={{padding:"9px 12px",fontFamily:F.b,fontSize:12,fontWeight:500,color:C.text,borderBottom:`1px solid ${C.border}`}}>
                  {meta.icon} {L?meta.labelHi:role}
                </td>
                <td style={{padding:"9px 12px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>
                  {overrideEnabled
                    ?<input type="number" min={0} value={overrides[role]??a.roles[role]?.[rangeIdx]??0}
                        onChange={e=>onOverrideChange(role,e.target.value)}
                        style={{width:64,padding:"4px 6px",borderRadius:6,border:`1px solid ${meta.color}`,fontFamily:F.b,fontSize:13,textAlign:"center",outline:"none"}}/>
                    :<span style={{fontFamily:F.d,fontSize:18,fontWeight:700,color:meta.color}}>{val}</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{background:C.maroonSoft}}>
            <td style={{padding:"9px 12px",fontFamily:F.b,fontSize:12,fontWeight:700,color:C.maroon}}>{L?"कुल स्टाफ":"TOTAL STAFF"}</td>
            <td style={{padding:"9px 12px",textAlign:"center",fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon}}>{total}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:overrideEnabled?"#FFFBF0":C.white}}>
        <button onClick={()=>onToggleOverride(!overrideEnabled)}
          style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:7,
            border:`1px solid ${overrideEnabled?"#D97706":C.border}`,
            background:overrideEnabled?"#FFF7ED":C.bg,cursor:"pointer",
            fontFamily:F.b,fontSize:11,fontWeight:overrideEnabled?700:400,
            color:overrideEnabled?"#D97706":C.tl}}>
          ⚙️ {L?"मैन्युअल ओवरराइड":"Manual Override"} <span style={{fontSize:13}}>{overrideEnabled?"●":"○"}</span>
        </button>
        {overrideEnabled&&(
          <div style={{marginTop:8}}>
            <div style={{fontSize:10,fontWeight:600,color:"#D97706",fontFamily:F.b,marginBottom:4}}>
              ⚠️ {L?"ओवरराइड का कारण (जरूरी)":"Reason for override (required)"}
            </div>
            <textarea value={overrideReason} onChange={e=>onReasonChange(e.target.value)}
              placeholder="e.g. VIP event — extra drivers requested by sales team"
              rows={2} style={{width:"100%",padding:"7px 10px",borderRadius:7,
                border:`1px solid ${overrideReason?"#D97706":C.red}`,
                fontFamily:F.b,fontSize:11,resize:"vertical",outline:"none",
                boxSizing:"border-box",background:"#FFFBF0"}}/>
            {!overrideReason&&<div style={{fontSize:9,color:C.red,fontFamily:F.b,marginTop:2}}>{L?"कारण जरूरी है":"Reason is required"}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FULL ALLOCATION MATRIX ───────────────────────────────────────────────────
function FullAllocationMatrix({ prop, activeRangeIdx, lang }){
  const C = useT();
  const a = VALET_ALLOCATIONS[prop];
  if(!a) return null;
  const L = lang==="hi";

  return(
    <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:F.d,fontSize:13,fontWeight:700,color:C.maroon}}>
        📊 {a.name} — {L?"पूरी आवंटन तालिका":"Full Allocation Table"}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",fontFamily:F.b,fontSize:11,minWidth:"100%"}}>
          <thead>
            <tr>
              <th style={{padding:"8px 12px",textAlign:"left",background:C.maroonSoft,color:C.maroon,fontWeight:700,whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,minWidth:90}}>
                {L?"भूमिका":"Particulars"}
              </th>
              {a.ranges.map((r,i)=>(
                <th key={i} style={{padding:"7px 10px",textAlign:"center",fontWeight:700,
                  background:i===activeRangeIdx?C.maroon:C.maroonSoft,
                  color:i===activeRangeIdx?C.white:C.maroon,
                  whiteSpace:"nowrap",minWidth:56}}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map(role=>{
              const meta = ROLE_META[role];
              return(
                <tr key={role}>
                  <td style={{padding:"7px 12px",fontWeight:600,whiteSpace:"nowrap",
                    background:C.bg,borderBottom:`1px solid ${C.border}`,
                    position:"sticky",left:0,borderLeft:`3px solid ${meta.color}`,color:C.text}}>
                    {meta.icon} {L?meta.labelHi:role}
                  </td>
                  {a.roles[role].map((val,ci)=>(
                    <td key={ci} style={{padding:"7px 10px",textAlign:"center",borderBottom:`1px solid ${C.border}`,
                      background:ci===activeRangeIdx?`${C.maroon}18`:val>0?"#F0FAF4":C.white,
                      fontWeight:val>0?700:400,
                      color:ci===activeRangeIdx?C.maroon:val>0?"#059669":C.border}}>
                      {val>0?val:""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{padding:"8px 12px",fontWeight:700,background:C.maroonSoft,color:C.maroon,position:"sticky",left:0,fontFamily:F.b,fontSize:11}}>
                {L?"कुल":"Total"}
              </td>
              {a.totals.map((t,i)=>(
                <td key={i} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,
                  background:i===activeRangeIdx?C.maroon:C.maroonSoft,
                  color:i===activeRangeIdx?C.white:C.maroon,
                  fontFamily:F.d,fontSize:13}}>
                  {t}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{padding:"6px 12px",fontSize:9,color:C.tl,fontFamily:F.b,borderTop:`1px solid ${C.border}`}}>
        {L?"हाइलाइट किया गया कॉलम = वर्तमान चयन":"Highlighted column = current selection"}
      </div>
    </div>
  );
}

// ─── BOOKING FORM ─────────────────────────────────────────────────────────────
function BookingForm({init, prefillDate, onSave, onCancel, user, lang}){
  const C = useT();
  const isMobile = useIsMobile();
  const defProp = user.prop==="all" ? "pp" : (user.prop||"pp");
  const isEdit = !!init?.id;
  const initData = isEdit ? {
    ...init,
    event_type: init.event_type||"other",
    guest_count: String(init.guest_count||""),
    priority: init.priority||"normal",
    special_instructions: init.special_instructions||init.notes||"",
    expected_cars: String(init.expected_cars||""),
    valets_needed: String(init.valets_needed||""),
  } : {
    property:defProp, event_date:prefillDate||"", event_name:"",
    event_type:"standard_wedding", guest_count:"", expected_cars:"",
    valets_needed:"", priority:"normal", special_instructions:"",
    vendor_name:"", vendor_phone:"", shift_start:"18:00", shift_end:"23:30",
    status:"planned",
  };
  const [f, sF] = useState(initData);
  const inp = (k,v) => sF(p=>({...p,[k]:v}));

  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [overrideReason, setOverrideReason] = useState("");

  const carsEdited = useRef(isEdit && !!init?.expected_cars);
  const valetsEdited = useRef(false);

  const gc = parseInt(f.guest_count)||0;
  const rangeIdx = gc>0 ? findRange(f.property, gc) : 0;
  const showAlloc = gc>0 && !!VALET_ALLOCATIONS[f.property];

  // Auto-calc cars
  useEffect(()=>{
    if(carsEdited.current) return;
    const cars = calcCars(f.guest_count, f.event_type);
    if(cars) sF(p=>({...p, expected_cars:cars}));
  },[f.guest_count, f.event_type]);

  // Auto-sync valets from allocation total
  useEffect(()=>{
    if(valetsEdited.current) return;
    const guestN = parseInt(f.guest_count)||0;
    if(!guestN) return;
    const ri = findRange(f.property, guestN);
    const a = VALET_ALLOCATIONS[f.property];
    if(a) sF(p=>({...p, valets_needed:String(a.totals[ri])}));
  },[f.guest_count, f.property]);

  // Reset overrides when property or guest count changes
  useEffect(()=>{ setOverrides({}); setOverrideEnabled(false); },[f.property, f.guest_count]);

  const save = ()=>{
    if(!f.event_date||!f.property) return;
    const finalAlloc = showAlloc ? computeFinalAlloc(f.property, rangeIdx, overrideEnabled, overrides) : null;
    const totalStaff = finalAlloc ? ROLE_ORDER.reduce((s,r)=>s+(finalAlloc[r]||0),0) : (parseInt(f.valets_needed)||0);
    onSave({
      ...f,
      expected_cars: parseInt(f.expected_cars)||0,
      valets_needed: totalStaff,
      guest_count: parseInt(f.guest_count)||0,
      staff_allocation: finalAlloc,
      override_reason: (overrideEnabled&&overrideReason) ? overrideReason : null,
      created_by: f.created_by||user.id,
    });
  };

  const isPremium = f.priority==="high"||f.priority==="critical";
  const F2 = {width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",boxSizing:"border-box",background:C.bg};
  const Lb = {fontSize:11,fontWeight:600,color:C.tl,marginBottom:3,display:"block"};

  return(
    <div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:14}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:12}}>
        {isEdit?"✏️ Edit Booking":"➕ New Valet Booking"}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={Lb}>{lang==="hi"?"वेन्यू":"Property"}</label>
          <select value={f.property} onChange={e=>inp("property",e.target.value)} style={F2}>
            {PROP_OPTS.filter(p=>p.v!=="all").map(p=><option key={p.v} value={p.v}>{PROPS[p.v]?.icon} {p.l}</option>)}
          </select>
        </div>
        <div>
          <label style={Lb}>{lang==="hi"?"तारीख":"Event Date"}</label>
          <input type="date" value={f.event_date} onChange={e=>inp("event_date",e.target.value)} style={F2}/>
        </div>

        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>{lang==="hi"?"इवेंट नाम":"Event Name"}</label>
          <input value={f.event_name} onChange={e=>inp("event_name",e.target.value)}
            placeholder="e.g. Sharma Wedding, TechCorp Annual Event" style={F2}/>
        </div>

        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>{lang==="hi"?"इवेंट प्रकार":"Event Type"}</label>
          <select value={f.event_type} onChange={e=>{carsEdited.current=false;inp("event_type",e.target.value);}} style={F2}>
            {Object.entries(EVENT_TYPES).map(([k,v])=>(
              <option key={k} value={k}>{v.icon} {lang==="hi"?v.lH:v.l}</option>
            ))}
          </select>
          <div style={{fontSize:10,color:C.tl,marginTop:3}}>
            Car ratio: ×{EVENT_TYPES[f.event_type]?.carRatio} per guest
            {EVENT_TYPES[f.event_type]?.vip&&<span style={{marginLeft:6,color:"#D97706",fontWeight:700}}>⭐ VIP</span>}
          </div>
        </div>

        <div>
          <label style={Lb}>👥 {lang==="hi"?"अपेक्षित मेहमान":"Expected Guests"}</label>
          <input type="number" min={0} value={f.guest_count}
            onChange={e=>{carsEdited.current=false;valetsEdited.current=false;inp("guest_count",e.target.value);}}
            placeholder="e.g. 500" style={F2}/>
        </div>
        <div>
          <label style={Lb}>🚨 {lang==="hi"?"प्राथमिकता":"Priority"}</label>
          <select value={f.priority} onChange={e=>inp("priority",e.target.value)}
            style={{...F2,background:PRIORITIES[f.priority]?.bg||C.bg,color:PRIORITIES[f.priority]?.c||C.text,fontWeight:f.priority!=="normal"?700:400}}>
            {Object.entries(PRIORITIES).map(([k,v])=>(
              <option key={k} value={k}>{lang==="hi"?v.lH:v.l}</option>
            ))}
          </select>
        </div>

        {isPremium&&<div style={{gridColumn:"1/-1",background:f.priority==="critical"?C.rBg:"#FFF7ED",border:`1px solid ${f.priority==="critical"?C.red:"#D97706"}`,borderRadius:8,padding:"8px 12px"}}>
          <div style={{fontSize:11,fontWeight:700,color:f.priority==="critical"?C.red:"#D97706"}}>
            ⚠️ {lang==="hi"?"प्रीमियम इवेंट — अतिरिक्त वैलेट सुनिश्चित करें":"Premium event — ensure extra valets and senior staff on duty"}
          </div>
        </div>}

        {/* Inline Staff Allocation */}
        {showAlloc&&<div style={{gridColumn:"1/-1"}}>
          <StaffAllocationTable
            prop={f.property} rangeIdx={rangeIdx} guestCount={f.guest_count}
            overrideEnabled={overrideEnabled} overrides={overrides}
            overrideReason={overrideReason}
            onToggleOverride={v=>setOverrideEnabled(v)}
            onOverrideChange={(role,val)=>setOverrides(p=>({...p,[role]:val}))}
            onReasonChange={v=>setOverrideReason(v)}
            lang={lang}
          />
        </div>}

        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
            <label style={{...Lb,marginBottom:0}}>🚗 {lang==="hi"?"अनुमानित कारें":"Expected Cars"}</label>
            {f.guest_count>0&&<button type="button" onClick={()=>{carsEdited.current=false;const c=calcCars(f.guest_count,f.event_type);sF(p=>({...p,expected_cars:c}));}}
              style={{fontSize:9,padding:"2px 6px",borderRadius:5,border:`1px solid ${C.accent}`,background:"#FFF7ED",color:C.accent,cursor:"pointer",fontFamily:F.b,fontWeight:700}}>↻ Auto</button>}
          </div>
          <input type="number" min={0} value={f.expected_cars}
            onChange={e=>{carsEdited.current=true;inp("expected_cars",e.target.value);}}
            placeholder="Enter cars" style={F2}/>
        </div>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
            <label style={{...Lb,marginBottom:0}}>👤 {lang==="hi"?"वैलेट स्टाफ":"Valets Needed"}</label>
            {showAlloc&&<button type="button" onClick={()=>{valetsEdited.current=false;const ri=findRange(f.property,parseInt(f.guest_count)||0);const a=VALET_ALLOCATIONS[f.property];if(a)sF(p=>({...p,valets_needed:String(a.totals[ri])}));}}
              style={{fontSize:9,padding:"2px 6px",borderRadius:5,border:`1px solid ${C.accent}`,background:"#FFF7ED",color:C.accent,cursor:"pointer",fontFamily:F.b,fontWeight:700}}>↻ Auto</button>}
          </div>
          <input type="number" min={0} value={f.valets_needed}
            onChange={e=>{valetsEdited.current=true;inp("valets_needed",e.target.value);}}
            placeholder="Total valet staff" style={F2}/>
        </div>

        <div style={{gridColumn:"1/-1"}}>
          <label style={{...Lb,color:"#D97706"}}>📋 {lang==="hi"?"सेल्स टीम के विशेष निर्देश":"Special Instructions from Sales Team"}</label>
          <textarea value={f.special_instructions} onChange={e=>inp("special_instructions",e.target.value)}
            placeholder="e.g. VIP guest list, extra valets requested, specific parking arrangement"
            rows={2} style={{...F2,background:"#FFFBF0",border:`1px solid ${C.accent}`,resize:"vertical"}}/>
        </div>

        <div>
          <label style={Lb}>🏢 {lang==="hi"?"वेंडर नाम":"Vendor Name"}</label>
          <input value={f.vendor_name} onChange={e=>inp("vendor_name",e.target.value)} placeholder="Valet company name" style={F2}/>
        </div>
        <div>
          <label style={Lb}>📞 {lang==="hi"?"वेंडर फ़ोन":"Vendor Phone"}</label>
          <input type="tel" value={f.vendor_phone} onChange={e=>inp("vendor_phone",e.target.value)} placeholder="+91 99999 99999" style={F2}/>
        </div>

        <div>
          <label style={Lb}>⏰ {lang==="hi"?"शिफ्ट शुरू":"Shift Start"}</label>
          <input type="time" value={f.shift_start} onChange={e=>inp("shift_start",e.target.value)} style={F2}/>
        </div>
        <div>
          <label style={Lb}>⏰ {lang==="hi"?"शिफ्ट खत्म":"Shift End"}</label>
          <input type="time" value={f.shift_end} onChange={e=>inp("shift_end",e.target.value)} style={F2}/>
        </div>

        <div>
          <label style={Lb}>{lang==="hi"?"स्थिति":"Status"}</label>
          <select value={f.status} onChange={e=>inp("status",e.target.value)} style={F2}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{lang==="hi"?v.lH:v.l}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:isMobile?"wrap":"nowrap"}}>
        <button onClick={save} style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"9px 18px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:13,fontWeight:700,cursor:"pointer",minHeight:44}}>
          {isEdit?"💾 Update":"✅ Save Booking"}
        </button>
        <button onClick={onCancel} style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.text,fontFamily:F.b,fontSize:13,cursor:"pointer",minHeight:44}}>
          {lang==="hi"?"रद्द":"Cancel"}
        </button>
      </div>
    </div>
  );
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
function CalendarView({user, lang}){
  const C = useT();
  const isMobile = useIsMobile();
  const today = new Date();
  const [yr,setYr] = useState(today.getFullYear());
  const [mo,setMo] = useState(today.getMonth());
  const [bookings,setBk] = useState([]);
  const [loading,setLd] = useState(false);
  const [selDate,setSD] = useState(null);
  const [showForm,setSF] = useState(false);
  const [editB,setEB] = useState(null);
  const [prefDate,setPD] = useState(null);
  const [propF,setPF] = useState(user.prop==="all"?"all":(user.prop||"pp"));
  const todayStr = toDS(today.getFullYear(),today.getMonth(),today.getDate());

  const load = useCallback(async()=>{
    setLd(true);
    const y=String(yr),m=String(mo+1).padStart(2,"0");
    const s=`${y}-${m}-01`,e=`${y}-${m}-${String(dIM(yr,mo)).padStart(2,"0")}`;
    let q = supabase.from("valet_bookings").select("*").gte("event_date",s).lte("event_date",e).order("event_date");
    if(propF!=="all") q=q.eq("property",propF);
    const{data}=await q;
    setBk((data||[]).map(b=>({
      ...b,
      event_type: b.event_type||"other",
      priority: b.priority||"normal",
      guest_count: b.guest_count||0,
      special_instructions: b.special_instructions||b.notes||"",
    })));
    setLd(false);
  },[yr,mo,propF]);

  useEffect(()=>{load();},[load]);

  const save = async(f)=>{
    const payload = {
      property:f.property, event_date:f.event_date, event_name:f.event_name||null,
      event_type:f.event_type||null, guest_count:f.guest_count||0,
      expected_cars:f.expected_cars, valets_needed:f.valets_needed,
      vendor_name:f.vendor_name||null, vendor_phone:f.vendor_phone||null,
      shift_start:f.shift_start||null, shift_end:f.shift_end||null,
      notes:f.special_instructions||null,
      special_instructions:f.special_instructions||null,
      priority:f.priority||"normal", status:f.status,
      staff_allocation:f.staff_allocation||null,
      override_reason:f.override_reason||null,
    };
    if(f.id){
      await supabase.from("valet_bookings").update(payload).eq("id",f.id);
    } else {
      await supabase.from("valet_bookings").insert({...payload,created_by:f.created_by});
      const dateFmt = payload.event_date ? new Date(payload.event_date).toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : "";
      const propName = PROPS[payload.property]?.sn||payload.property||"";
      getSAAndAdminIds(null).then(ids=>notifyMultiple("valet_booking","🚗 New valet booking: "+(payload.event_type||"Event")+" at "+propName+" on "+dateFmt,f.created_by||"system",f.created_by||"admin",ids,payload.property));
    }
    setSF(false);setEB(null);setPD(null);load();
  };

  const del = async(id)=>{
    await supabase.from("valet_bookings").delete().eq("id",id);
    load();
  };

  const byDate = {};
  bookings.forEach(b=>{if(!byDate[b.event_date])byDate[b.event_date]=[];byDate[b.event_date].push(b);});

  const prevM=()=>{if(mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1);};
  const nextM=()=>{if(mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1);};
  const days=dIM(yr,mo); const firstDay=fDM(yr,mo);
  const cells=[]; for(let i=0;i<firstDay;i++)cells.push(null); for(let d=1;d<=days;d++)cells.push(d);
  const mns=lang==="hi"?MN_HI:MN_EN; const dys=lang==="hi"?DY_HI:DY_EN;

  const chipStyle=(b)=>{
    const pri=b.priority||"normal";
    if(pri==="critical") return {bg:C.rBg,c:C.red};
    if(pri==="high") return {bg:"#FFF7ED",c:"#d97706"};
    const st=STATUS[b.status]||STATUS.planned;
    return {bg:st.bg,c:st.c};
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevM} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,minWidth:150,textAlign:"center"}}>{mns[mo]} {yr}</span>
          <button onClick={nextM} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>
        <button onClick={()=>{setPD(null);setEB(null);setSF(true);}}
          style={{padding:"7px 14px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          ➕ {lang==="hi"?"नई बुकिंग":"New Booking"}
        </button>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
        {PROP_OPTS.map(p=>(
          <button key={p.v} onClick={()=>setPF(p.v)}
            style={{padding:"5px 10px",borderRadius:7,border:propF===p.v?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:propF===p.v?C.maroonSoft:C.white,fontFamily:F.b,fontSize:10,fontWeight:propF===p.v?700:400,color:propF===p.v?C.maroon:C.tl,cursor:"pointer"}}>
            {p.v!=="all"&&PROPS[p.v]?.icon+" "}{p.v==="all"?"All":PROPS[p.v]?.sn}
          </button>
        ))}
        {loading&&<span style={{fontSize:10,color:C.tl,fontFamily:F.b,alignSelf:"center"}}>Loading...</span>}
      </div>

      {showForm&&<BookingForm init={editB} prefillDate={prefDate} onSave={save} onCancel={()=>{setSF(false);setEB(null);setPD(null);}} user={user} lang={lang}/>}

      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:C.maroonSoft,borderBottom:`1px solid ${C.border}`}}>
          {dys.map(d=><div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:10,fontWeight:700,color:C.maroon,fontFamily:F.b}}>{isMobile?d.slice(0,1):d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,idx)=>{
            if(!day)return<div key={`e${idx}`} style={{minHeight:isMobile?45:62,background:"#F9F9F9",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>;
            const ds=toDS(yr,mo,day);
            const dayBks=byDate[ds]||[];
            const isToday=ds===todayStr;
            const isSel=ds===selDate;
            return(
              <div key={day} onClick={()=>setSD(isSel?null:ds)}
                style={{minHeight:isMobile?45:62,padding:isMobile?"2px":"4px 3px 3px 5px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:isSel?C.maroonSoft:C.white,position:"relative",transition:"background 0.1s"}}>
                <div style={{width:isMobile?16:20,height:isMobile?16:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?C.maroon:"transparent",fontSize:isMobile?8:10,fontWeight:isToday||isSel?700:400,color:isToday?C.white:isSel?C.maroon:C.text,fontFamily:F.b,marginBottom:2}}>{day}</div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {dayBks.slice(0,isMobile?1:2).map(b=>{
                    const cs=chipStyle(b);
                    return(
                      <div key={b.id} style={{fontSize:isMobile?7:9,fontFamily:F.b,fontWeight:600,padding:"1px 2px",borderRadius:3,background:cs.bg,color:cs.c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                        {EVENT_TYPES[b.event_type]?.icon||PROPS[b.property]?.icon}{!isMobile&&b.event_name?" "+b.event_name.slice(0,7):""}
                      </div>
                    );
                  })}
                  {dayBks.length>(isMobile?1:2)&&<div style={{fontSize:7,color:C.tl,fontFamily:F.b}}>+{dayBks.length-(isMobile?1:2)}</div>}
                </div>
                {!isMobile&&<button onClick={e=>{e.stopPropagation();setPD(ds);setEB(null);setSF(true);}}
                  style={{position:"absolute",top:2,right:2,width:14,height:14,borderRadius:3,border:`1px solid ${C.border}`,background:C.white,color:C.tl,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,opacity:0.6}}>+</button>}
              </div>
            );
          })}
        </div>
      </div>

      {selDate&&(
        <div style={{background:C.white,borderRadius:14,border:`2px solid ${C.maroon}`,padding:14,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon}}>📅 {fmtD(selDate)}</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setPD(selDate);setEB(null);setSF(true);}}
                style={{padding:"5px 12px",borderRadius:7,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                ➕ {lang==="hi"?"जोड़ें":"Add"}
              </button>
              <button onClick={()=>setSD(null)} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
          </div>
          {(byDate[selDate]||[]).length===0
            ?<div style={{textAlign:"center",padding:"14px 0",color:C.tl,fontSize:12,fontFamily:F.b}}>No bookings — click ➕ to add one</div>
            :(byDate[selDate]||[]).map(b=>{
              const st=STATUS[b.status]||STATUS.planned;
              const pri=PRIORITIES[b.priority||"normal"]||PRIORITIES.normal;
              const et=EVENT_TYPES[b.event_type||"other"]||EVENT_TYPES.other;
              const sa=b.staff_allocation;
              return(
                <div key={b.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",marginBottom:8,borderLeft:`4px solid ${st.c}`,border:`1px solid ${C.border}`,borderLeftWidth:4,borderLeftColor:st.c}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:4}}>
                        {et.icon} {b.event_name||"Event"} <span style={{fontSize:10,color:C.tl,fontWeight:400}}>— {PROPS[b.property]?.sn}</span>
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:st.bg,color:st.c,fontWeight:700,fontFamily:F.b}}>{lang==="hi"?st.lH:st.l}</span>
                        <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:pri.bg,color:pri.c,fontWeight:700,fontFamily:F.b}}>{lang==="hi"?pri.lH:pri.l}</span>
                        {b.guest_count>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>👥 {b.guest_count}</span>}
                        {b.expected_cars>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bBg,color:C.blue,fontFamily:F.b}}>🚗 {b.expected_cars} cars</span>}
                        {b.valets_needed>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.maroonSoft,color:C.maroon,fontFamily:F.b}}>👤 {b.valets_needed} valets</span>}
                        {(b.shift_start||b.shift_end)&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>⏰ {fmtT(b.shift_start)}–{fmtT(b.shift_end)}</span>}
                      </div>
                      {sa&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                        {ROLE_ORDER.filter(r=>sa[r]>0).map(r=>{
                          const m=ROLE_META[r];
                          return<span key={r} style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:`${m.color}18`,color:m.color,fontFamily:F.b,fontWeight:600}}>{m.icon} {sa[r]} {r}</span>;
                        })}
                        {b.override_reason&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:"#FFF7ED",color:"#D97706",fontFamily:F.b}}>⚙️ {b.override_reason.slice(0,30)}{b.override_reason.length>30?"…":""}</span>}
                      </div>}
                      {b.vendor_name&&(
                        <div style={{fontSize:11,color:C.tl,fontFamily:F.b,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                          <span>🏢 {b.vendor_name}</span>
                          {b.vendor_phone&&<a href={`tel:${b.vendor_phone}`} style={{color:C.blue,fontWeight:600,textDecoration:"none"}}>📞 {b.vendor_phone}</a>}
                        </div>
                      )}
                      {b.special_instructions&&(
                        <div style={{background:"#FFFBF0",border:`1px solid ${C.accent}`,borderRadius:6,padding:"5px 8px",fontSize:10,color:C.accent,fontFamily:F.b,marginTop:3}}>
                          📋 {b.special_instructions}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={()=>{setEB(b);setPD(null);setSF(true);}} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:11}}>✏️</button>
                      <button onClick={()=>{if(window.confirm("Delete this booking?"))del(b.id);}} style={{padding:"5px 8px",borderRadius:6,border:"none",background:C.rBg,cursor:"pointer",fontSize:11,color:C.red}}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      <div style={{display:"flex",gap:12,flexWrap:"wrap",padding:"6px 0",marginBottom:4}}>
        {Object.entries(STATUS).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:10,height:10,borderRadius:2,background:v.bg,border:`2px solid ${v.c}`}}/>
            <span style={{fontSize:10,fontFamily:F.b,color:C.tl}}>{lang==="hi"?v.lH:v.l}</span>
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:10,height:10,borderRadius:2,background:C.rBg,border:`2px solid ${C.red}`}}/>
          <span style={{fontSize:10,fontFamily:F.b,color:C.tl}}>Critical / Luxury</span>
        </div>
      </div>
    </div>
  );
}

// ─── STAFF CALCULATOR ─────────────────────────────────────────────────────────
function StaffCalculator({user, lang}){
  const C = useT();
  const isMobile = useIsMobile();
  const defProp = VALET_ALLOCATIONS[user.prop] ? user.prop : "pp";
  const [prop, setProp] = useState(defProp);
  const [inputMode, setInputMode] = useState("range");
  const [rangeIdx, setRangeIdx] = useState(0);
  const [guestInput, setGuestInput] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [overrideReason, setOverrideReason] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [rates, setRates] = useState({"Key Man":1500,"Driver":1200,"Guard":1000,"Rider":800,"Gun Man":2000,"Bouncer":1500});

  const a = VALET_ALLOCATIONS[prop];
  const L = lang==="hi";

  const activeRangeIdx = inputMode==="range"
    ? rangeIdx
    : (guestInput ? findRange(prop, parseInt(guestInput)||0) : 0);

  const finalAlloc = computeFinalAlloc(prop, activeRangeIdx, overrideEnabled, overrides);
  const finalTotal = ROLE_ORDER.reduce((s,r)=>s+(finalAlloc[r]||0),0);
  const baseTotal = a.totals[activeRangeIdx];

  // Reset overrides when prop changes
  const prevProp = useRef(prop);
  useEffect(()=>{
    if(prevProp.current!==prop){ setOverrides({}); setOverrideEnabled(false); setRangeIdx(0); setGuestInput(""); }
    prevProp.current=prop;
  },[prop]);

  const resolvedGuestInput = inputMode==="count" && guestInput ? parseInt(guestInput)||0 : null;
  const range = a.ranges[activeRangeIdx];

  const F2 = {padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",boxSizing:"border-box",background:C.bg};

  return(
    <div style={{maxWidth:700,margin:"0 auto"}}>

      {/* Property selector */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:8}}>{L?"वेन्यू":"Property"}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(VALET_ALLOCATIONS).map(([k,v])=>{
            const active = prop===k;
            return(
              <button key={k} onClick={()=>setProp(k)}
                style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:10,
                  border:active?`2px solid ${C.maroon}`:`1px solid ${C.border}`,
                  background:active?C.maroonSoft:C.white,cursor:"pointer",
                  fontFamily:F.b,fontSize:12,fontWeight:active?700:400,
                  color:active?C.maroon:C.tl,minHeight:40}}>
                <span style={{fontSize:14}}>{PROPS[k]?.icon||"🏛️"}</span>
                <span>{v.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input mode toggle */}
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",background:C.bg,borderRadius:8,padding:3,gap:2,marginBottom:12,width:"fit-content"}}>
          {[{id:"range",label:L?"रेंज चुनें":"Select Guest Range"},{id:"count",label:L?"संख्या दर्ज करें":"Enter Exact Count"}].map(m=>(
            <button key={m.id} onClick={()=>setInputMode(m.id)}
              style={{padding:"6px 12px",borderRadius:7,border:"none",cursor:"pointer",
                fontFamily:F.b,fontSize:11,fontWeight:600,
                background:inputMode===m.id?C.maroon:"transparent",
                color:inputMode===m.id?C.white:C.tl}}>
              {m.label}
            </button>
          ))}
        </div>

        {inputMode==="range" ? (
          <div>
            <label style={{fontSize:11,fontWeight:600,color:C.tl,fontFamily:F.b,display:"block",marginBottom:6}}>{L?"मेहमान रेंज":"Guest Range"}</label>
            <select value={rangeIdx} onChange={e=>setRangeIdx(Number(e.target.value))}
              style={{...F2,width:"100%",fontSize:13}}>
              {a.ranges.map((r,i)=>(
                <option key={i} value={i}>
                  {r.label} {L?"मेहमान":"guests"} — {L?"कुल":"Total"}: {a.totals[i]} {L?"स्टाफ":"staff"}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label style={{fontSize:11,fontWeight:600,color:C.tl,fontFamily:F.b,display:"block",marginBottom:6}}>
              👥 {L?"मेहमान संख्या":"Guest Count"}
            </label>
            <input type="number" min={0} value={guestInput}
              onChange={e=>setGuestInput(e.target.value)}
              placeholder={`e.g. 350 (max: ${a.ranges[a.ranges.length-1].max})`}
              style={{...F2,width:"100%",fontSize:14}}/>
            {guestInput&&(
              <div style={{marginTop:6,fontSize:11,color:C.maroon,fontFamily:F.b,fontWeight:600}}>
                → {L?"मिलान रेंज":"Matched range"}: <strong>{range.label}</strong>
                {parseInt(guestInput)>a.ranges[a.ranges.length-1].max&&
                  <span style={{color:"#D97706",marginLeft:8}}>⚠️ Exceeds max — using highest range</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Allocation table */}
      <StaffAllocationTable
        prop={prop}
        rangeIdx={activeRangeIdx}
        guestCount={resolvedGuestInput}
        overrideEnabled={overrideEnabled}
        overrides={overrides}
        overrideReason={overrideReason}
        onToggleOverride={v=>{setOverrideEnabled(v);if(!v)setOverrides({});}}
        onOverrideChange={(role,val)=>setOverrides(p=>({...p,[role]:val}))}
        onReasonChange={v=>setOverrideReason(v)}
        lang={lang}
      />

      {/* Full matrix toggle */}
      <div style={{marginTop:12,marginBottom:12}}>
        <button onClick={()=>setShowMatrix(!showMatrix)}
          style={{padding:"9px 16px",borderRadius:9,border:`1px solid ${C.maroon}`,background:showMatrix?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:600,color:C.maroon,display:"flex",alignItems:"center",gap:6}}>
          📊 {showMatrix?(L?"तालिका छुपाएं":"Hide Full Table"):(L?"पूरी तालिका देखें":"View Full Allocation Table")}
          <span style={{fontSize:10,color:C.tl}}>{showMatrix?"▲":"▼"}</span>
        </button>
        {showMatrix&&<div style={{marginTop:10}}><FullAllocationMatrix prop={prop} activeRangeIdx={activeRangeIdx} lang={lang}/></div>}
      </div>

      {/* Car estimate */}
      <div style={{background:C.white,borderRadius:14,padding:14,border:`1px solid ${C.border}`,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:10}}>🚘 {L?"कार अनुमान":"Car Estimate"}</div>
        {(resolvedGuestInput||a.ranges[activeRangeIdx].max)>0?(
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:8}}>
            {[{n:4,label:L?"4/कार (परिवार)":"4 per car (family)",bg:"#EBF5F0",c:C.green},{n:3,label:L?"3/कार (औसत)":"3 per car (avg)",bg:C.bBg,c:C.blue},{n:2,label:L?"2/कार (VIP)":"2 per car (VIP)",bg:C.maroonSoft,c:C.maroon}].map(x=>{
              const gc = resolvedGuestInput||Math.round((a.ranges[activeRangeIdx].min+a.ranges[activeRangeIdx].max)/2);
              return(
                <div key={x.n} style={{textAlign:"center",padding:"12px 6px",background:x.bg,borderRadius:10}}>
                  <div style={{fontSize:26,fontWeight:700,fontFamily:F.d,color:x.c,lineHeight:1}}>{Math.ceil(gc/x.n)}</div>
                  <div style={{fontSize:9,color:x.c,fontFamily:F.b,fontWeight:600,marginTop:2}}>{L?"कारें":"cars"}</div>
                  <div style={{fontSize:9,color:C.tl,fontFamily:F.b,marginTop:4,lineHeight:1.3}}>{x.label}</div>
                </div>
              );
            })}
          </div>
        ):<div style={{fontSize:11,color:C.tl,fontFamily:F.b}}>Enter guest count to see car estimates</div>}
      </div>

      {/* Cost estimator */}
      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <button onClick={()=>setShowCost(!showCost)} style={{width:"100%",padding:"12px 16px",border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:F.b,fontSize:13,fontWeight:600,color:C.maroon}}>
          <span>💰 {showCost?(L?"लागत छुपाएं":"Hide Cost"):(L?"लागत अनुमान":"Show Cost Estimate")}</span>
          <span style={{fontSize:11,color:C.tl}}>{showCost?"▲":"▼"}</span>
        </button>
        {showCost&&(
          <div style={{padding:"0 16px 14px",borderTop:`1px solid ${C.border}`}}>
            <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
              {ROLE_ORDER.filter(r=>finalAlloc[r]>0).map(r=>{
                const meta = ROLE_META[r];
                return(
                  <div key={r} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13}}>{meta.icon}</span>
                    <span style={{flex:1,fontSize:12,fontFamily:F.b,fontWeight:500}}>
                      {L?meta.labelHi:r}<span style={{color:C.tl,fontWeight:400}}> × {finalAlloc[r]}</span>
                    </span>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{fontSize:11,color:C.tl}}>₹</span>
                      <input type="number" min={0} step={100} value={rates[r]}
                        onChange={e=>setRates(p=>({...p,[r]:Number(e.target.value)}))}
                        style={{width:76,padding:"5px 7px",borderRadius:7,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,textAlign:"right",outline:"none"}}/>
                    </div>
                    <div style={{width:72,textAlign:"right",fontSize:12,fontWeight:700,color:C.maroon,fontFamily:F.b}}>
                      ₹{(finalAlloc[r]*(rates[r]||0)).toLocaleString("en-IN")}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:`linear-gradient(135deg,${C.maroon},${C.maroonLight||"#a83251"})`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:F.b}}>💰 {L?"कुल लागत":"Total Cost"}</span>
              <span style={{fontSize:22,fontWeight:700,fontFamily:F.d,color:"#fff"}}>
                ₹{ROLE_ORDER.reduce((s,r)=>s+(finalAlloc[r]||0)*(rates[r]||0),0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function ValetPlanning({user, lang}){
  const C = useT();
  const isMobile = useIsMobile();
  const [tab,setTab]=useState("calendar");
  const tabs=[
    {id:"calendar",i:"📅",l:"Bookings",lH:"बुकिंग"},
    {id:"calc",i:"🧮",l:"Staff Calculator",lH:"स्टाफ कैलकुलेटर"},
  ];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>🚗 {lang==="hi"?"वैलेट प्लानिंग":"Valet Planning"}</h1>
        <div style={{display:"flex",background:C.maroonSoft,borderRadius:10,padding:3,gap:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:600,background:tab===t.id?C.maroon:"transparent",color:tab===t.id?C.white:C.maroon}}>
              {t.i} {lang==="hi"?t.lH:t.l}
            </button>
          ))}
        </div>
      </div>

      {tab==="calendar"&&<CalendarView user={user} lang={lang}/>}
      {tab==="calc"&&<StaffCalculator user={user} lang={lang}/>}
    </div>
  );
}
