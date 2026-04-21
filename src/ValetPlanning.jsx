import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, PROPS } from "./constants.js";

// ─── STAFF CALCULATOR DATA ────────────────────────────────────────────────────
const VALET_DATA = {
  pp: [
    { pax:100,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:4,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:7,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:10, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:12, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:14, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:16, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:18, guard:4, rider:2, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:20, guard:4, rider:2, gunMan:0, bouncer:0 },
  ],
  mk: [
    { pax:100,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:4,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:6,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:8,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:11, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:13, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:15, guard:3, rider:2, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:17, guard:4, rider:2, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:19, guard:4, rider:2, gunMan:0, bouncer:0 },
  ],
  ex: [
    { pax:100,  keyMan:1, driver:2,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200,  keyMan:1, driver:3,  guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:300,  keyMan:1, driver:5,  guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:400,  keyMan:1, driver:6,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:500,  keyMan:1, driver:8,  guard:2, rider:0, gunMan:0, bouncer:0 },
    { pax:600,  keyMan:1, driver:10, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:700,  keyMan:2, driver:12, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:800,  keyMan:2, driver:14, guard:2, rider:1, gunMan:0, bouncer:0 },
    { pax:900,  keyMan:2, driver:17, guard:3, rider:1, gunMan:0, bouncer:0 },
    { pax:1000, keyMan:2, driver:19, guard:3, rider:1, gunMan:0, bouncer:0 },
  ],
  rs: [
    { pax:100, keyMan:1, driver:5, guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:150, keyMan:1, driver:6, guard:0, rider:0, gunMan:0, bouncer:0 },
    { pax:200, keyMan:1, driver:6, guard:1, rider:0, gunMan:0, bouncer:0 },
    { pax:215, keyMan:1, driver:7, guard:1, rider:0, gunMan:0, bouncer:0 },
  ],
};

const VENUE_CFG = {
  pp: { name:"Pushpanjali", sn:"PP", icon:"🏛️", min:100, max:1000, step:50 },
  mk: { name:"Manaktala",   sn:"MK", icon:"✨", min:100, max:1000, step:50 },
  ex: { name:"Exotica",     sn:"EX", icon:"🌴", min:100, max:1000, step:50 },
  rs: { name:"Restro",      sn:"RS", icon:"🍽️", min:100, max:215,  step:25 },
};

const ROLE_META = {
  keyMan:  { label:"Key Man",  labelHi:"की मैन",  icon:"🔑" },
  driver:  { label:"Driver",   labelHi:"ड्राइवर", icon:"🚗" },
  guard:   { label:"Guard",    labelHi:"गार्ड",   icon:"🛡️" },
  rider:   { label:"Rider",    labelHi:"राइडर",   icon:"🏍️" },
  gunMan:  { label:"Gun Man",  labelHi:"गन मैन",  icon:"🔫" },
  bouncer: { label:"Bouncer",  labelHi:"बाउंसर", icon:"💪" },
};

// ─── EVENT TYPES ──────────────────────────────────────────────────────────────
const EVENT_TYPES = {
  standard_wedding: { l:"Standard Wedding",           lH:"स्टैंडर्ड शादी",    icon:"💒", carRatio:0.4, vip:false },
  premium_wedding:  { l:"Premium Wedding",            lH:"प्रीमियम शादी",    icon:"👑", carRatio:0.5, vip:false },
  corporate:        { l:"Corporate Event",            lH:"कॉर्पोरेट इवेंट",  icon:"🏢", carRatio:0.6, vip:false },
  luxury_vip:       { l:"Luxury / VIP Event",         lH:"लग्ज़री / VIP",    icon:"⭐", carRatio:0.7, vip:true  },
  birthday:         { l:"Birthday / Small Party",     lH:"जन्मदिन / पार्टी", icon:"🎂", carRatio:0.3, vip:false },
  exhibition:       { l:"Exhibition / Large Gathering",lH:"प्रदर्शनी",        icon:"🎪", carRatio:0.5, vip:false },
  other:            { l:"Other",                      lH:"अन्य",             icon:"📋", carRatio:0.4, vip:false },
};

// ─── PRIORITIES ───────────────────────────────────────────────────────────────
const PRIORITIES = {
  normal:   { l:"Normal",                  lH:"सामान्य",         c:C.tl,     bg:"#F0F0F0" },
  high:     { l:"High — Elite Crowd",      lH:"हाई — एलीट क्राउड", c:"#d97706", bg:"#FFF7ED" },
  critical: { l:"Critical — Luxury Event", lH:"क्रिटिकल — लग्ज़री", c:C.red,    bg:C.rBg   },
};

// ─── CALENDAR HELPERS ─────────────────────────────────────────────────────────
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

// ─── AUTO-CALC HELPERS ────────────────────────────────────────────────────────
function calcCars(guests, eventType){
  const gc = parseInt(guests) || 0;
  if(!gc) return "";
  return String(Math.ceil(gc * (EVENT_TYPES[eventType]?.carRatio || 0.4)));
}
function calcValets(cars, eventType){
  const c = parseInt(cars) || 0;
  if(!c) return "";
  const isVip = EVENT_TYPES[eventType]?.vip;
  return String(Math.max(2, Math.ceil(c / (isVip ? 10 : 15))));
}

// ─── BOOKING FORM ─────────────────────────────────────────────────────────────
function BookingForm({init, prefillDate, onSave, onCancel, user, lang}){
  const defProp = user.prop==="all" ? "pp" : (user.prop||"pp");
  const isEdit = !!init?.id;
  const initData = isEdit ? {
    ...init,
    event_type: init.event_type || "other",
    guest_count: String(init.guest_count||""),
    priority: init.priority || "normal",
    special_instructions: init.special_instructions || init.notes || "",
    expected_cars: String(init.expected_cars||""),
    valets_needed: String(init.valets_needed||""),
  } : {
    property: defProp, event_date: prefillDate||"", event_name:"",
    event_type:"standard_wedding", guest_count:"", expected_cars:"",
    valets_needed:"", priority:"normal", special_instructions:"",
    vendor_name:"", vendor_phone:"", shift_start:"18:00", shift_end:"23:30",
    status:"planned",
  };
  const [f, sF] = useState(initData);
  const inp = (k,v) => sF(p=>({...p,[k]:v}));

  // Track whether cars/valets have been manually overridden
  const carsEdited = useRef(isEdit && !!init?.expected_cars);
  const valetsEdited = useRef(isEdit && !!init?.valets_needed);

  // Auto-calculate when guest_count or event_type changes
  useEffect(()=>{
    if(carsEdited.current) return;
    const cars = calcCars(f.guest_count, f.event_type);
    if(!cars) return;
    sF(p=>{
      const valets = valetsEdited.current ? p.valets_needed : calcValets(cars, p.event_type);
      return {...p, expected_cars:cars, valets_needed:valets};
    });
  },[f.guest_count, f.event_type]);

  const save = ()=>{
    if(!f.event_date||!f.property) return;
    onSave({
      ...f,
      expected_cars: parseInt(f.expected_cars)||0,
      valets_needed: parseInt(f.valets_needed)||0,
      guest_count: parseInt(f.guest_count)||0,
      created_by: f.created_by||user.id,
    });
  };

  const isPremium = f.priority==="high" || f.priority==="critical";
  const F2 = {width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",boxSizing:"border-box",background:C.bg};
  const Lb = {fontSize:11,fontWeight:600,color:C.tl,marginBottom:3,display:"block"};

  return(
    <div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:14}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:12}}>
        {isEdit?"✏️ Edit Booking":"➕ New Valet Booking"}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        {/* Property + Date */}
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

        {/* Event Name full width */}
        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>{lang==="hi"?"इवेंट नाम":"Event Name"}</label>
          <input value={f.event_name} onChange={e=>inp("event_name",e.target.value)}
            placeholder="e.g. Sharma Wedding, TechCorp Annual Event" style={F2}/>
        </div>

        {/* Event Type full width */}
        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>{lang==="hi"?"इवेंट प्रकार":"Event Type"}</label>
          <select value={f.event_type} onChange={e=>{carsEdited.current=false;valetsEdited.current=false;inp("event_type",e.target.value);}} style={F2}>
            {Object.entries(EVENT_TYPES).map(([k,v])=>(
              <option key={k} value={k}>{v.icon} {lang==="hi"?v.lH:v.l}</option>
            ))}
          </select>
          <div style={{fontSize:10,color:C.tl,marginTop:3}}>
            Car ratio: ×{EVENT_TYPES[f.event_type]?.carRatio} per guest
            {EVENT_TYPES[f.event_type]?.vip && <span style={{marginLeft:6,color:C.accent,fontWeight:700}}>⭐ VIP — 1 valet per 10 cars</span>}
          </div>
        </div>

        {/* Guest Count + Priority */}
        <div>
          <label style={Lb}>👥 {lang==="hi"?"अपेक्षित मेहमान":"Expected Guests"}</label>
          <input type="number" min={0} value={f.guest_count}
            onChange={e=>{carsEdited.current=false;valetsEdited.current=false;inp("guest_count",e.target.value);}}
            placeholder="e.g. 500" style={F2}/>
        </div>
        <div>
          <label style={Lb}>🚨 {lang==="hi"?"प्राथमिकता":"Priority"}</label>
          <select value={f.priority} onChange={e=>inp("priority",e.target.value)} style={{...F2,
            background:PRIORITIES[f.priority]?.bg||C.bg,
            color:PRIORITIES[f.priority]?.c||C.text,
            fontWeight:f.priority!=="normal"?700:400,
          }}>
            {Object.entries(PRIORITIES).map(([k,v])=>(
              <option key={k} value={k}>{lang==="hi"?v.lH:v.l}</option>
            ))}
          </select>
        </div>

        {/* Premium event warning */}
        {isPremium&&<div style={{gridColumn:"1/-1",background:f.priority==="critical"?C.rBg:"#FFF7ED",border:`1px solid ${f.priority==="critical"?C.red:C.accent}`,borderRadius:8,padding:"8px 12px"}}>
          <div style={{fontSize:11,fontWeight:700,color:f.priority==="critical"?C.red:C.accent}}>
            ⚠️ {lang==="hi"?"प्रीमियम इवेंट — अतिरिक्त वैलेट और सीनियर स्टाफ सुनिश्चित करें":"Premium event — ensure extra valets and senior staff on duty"}
          </div>
        </div>}

        {/* Expected Cars + Valets (with auto-calc indicators) */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
            <label style={{...Lb,marginBottom:0}}>🚗 {lang==="hi"?"अनुमानित कारें":"Expected Cars"}</label>
            {f.guest_count>0&&<button type="button" onClick={()=>{carsEdited.current=false;valetsEdited.current=false;const c=calcCars(f.guest_count,f.event_type);sF(p=>({...p,expected_cars:c,valets_needed:calcValets(c,p.event_type)}));}} style={{fontSize:9,padding:"2px 6px",borderRadius:5,border:`1px solid ${C.accent}`,background:"#FFF7ED",color:C.accent,cursor:"pointer",fontFamily:F.b,fontWeight:700}}>↻ Auto</button>}
          </div>
          <input type="number" min={0} value={f.expected_cars}
            onChange={e=>{carsEdited.current=true;inp("expected_cars",e.target.value);}}
            placeholder={f.guest_count>0?`~${calcCars(f.guest_count,f.event_type)} suggested`:"Enter cars"} style={F2}/>
        </div>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
            <label style={{...Lb,marginBottom:0}}>👤 {lang==="hi"?"वैलेट स्टाफ":"Valets Needed"}</label>
            {f.expected_cars>0&&<button type="button" onClick={()=>{valetsEdited.current=false;sF(p=>({...p,valets_needed:calcValets(p.expected_cars,p.event_type)}));}} style={{fontSize:9,padding:"2px 6px",borderRadius:5,border:`1px solid ${C.accent}`,background:"#FFF7ED",color:C.accent,cursor:"pointer",fontFamily:F.b,fontWeight:700}}>↻ Auto</button>}
          </div>
          <input type="number" min={0} value={f.valets_needed}
            onChange={e=>{valetsEdited.current=true;inp("valets_needed",e.target.value);}}
            placeholder={f.expected_cars>0?`~${calcValets(f.expected_cars,f.event_type)} suggested`:"Enter valets"} style={F2}/>
        </div>

        {/* Special Instructions — amber highlight */}
        <div style={{gridColumn:"1/-1"}}>
          <label style={{...Lb,color:C.accent}}>📋 {lang==="hi"?"सेल्स टीम के विशेष निर्देश":"Special Instructions from Sales Team"}</label>
          <textarea value={f.special_instructions}
            onChange={e=>inp("special_instructions",e.target.value)}
            placeholder="e.g. VIP guest list, extra valets requested, specific parking arrangement, luxury cars expected"
            rows={2} style={{...F2,background:"#FFFBF0",border:`1px solid ${C.accent}`,resize:"vertical"}}/>
        </div>

        {/* Vendor + Phone */}
        <div>
          <label style={Lb}>🏢 {lang==="hi"?"वेंडर नाम":"Vendor Name"}</label>
          <input value={f.vendor_name} onChange={e=>inp("vendor_name",e.target.value)} placeholder="Valet company name" style={F2}/>
        </div>
        <div>
          <label style={Lb}>📞 {lang==="hi"?"वेंडर फ़ोन":"Vendor Phone"}</label>
          <input type="tel" value={f.vendor_phone} onChange={e=>inp("vendor_phone",e.target.value)} placeholder="+91 99999 99999" style={F2}/>
        </div>

        {/* Shift times */}
        <div>
          <label style={Lb}>⏰ {lang==="hi"?"शिफ्ट शुरू":"Shift Start"}</label>
          <input type="time" value={f.shift_start} onChange={e=>inp("shift_start",e.target.value)} style={F2}/>
        </div>
        <div>
          <label style={Lb}>⏰ {lang==="hi"?"शिफ्ट खत्म":"Shift End"}</label>
          <input type="time" value={f.shift_end} onChange={e=>inp("shift_end",e.target.value)} style={F2}/>
        </div>

        {/* Status */}
        <div>
          <label style={Lb}>{lang==="hi"?"स्थिति":"Status"}</label>
          <select value={f.status} onChange={e=>inp("status",e.target.value)} style={F2}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{lang==="hi"?v.lH:v.l}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={save} style={{padding:"9px 18px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {isEdit?"💾 Update":"✅ Save Booking"}
        </button>
        <button onClick={onCancel} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.text,fontFamily:F.b,fontSize:13,cursor:"pointer"}}>
          {lang==="hi"?"रद्द":"Cancel"}
        </button>
      </div>
    </div>
  );
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
function CalendarView({user, lang}){
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
    const s=`${y}-${m}-01`, e=`${y}-${m}-${String(dIM(yr,mo)).padStart(2,"0")}`;
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
    };
    if(f.id){
      await supabase.from("valet_bookings").update(payload).eq("id",f.id);
    } else {
      await supabase.from("valet_bookings").insert({...payload,created_by:f.created_by});
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

  // Cell chip color: critical=red, high=orange, else status color
  const chipStyle=(b)=>{
    const pri=b.priority||"normal";
    if(pri==="critical") return {bg:C.rBg,c:C.red};
    if(pri==="high") return {bg:"#FFF7ED",c:"#d97706"};
    const st=STATUS[b.status]||STATUS.planned;
    return {bg:st.bg,c:st.c};
  };

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevM} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontFamily:F.d,fontSize:17,fontWeight:700,color:C.maroon,minWidth:150,textAlign:"center"}}>{mns[mo]} {yr}</span>
          <button onClick={nextM} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>
        <button onClick={()=>{setPD(null);setEB(null);setSF(true);}}
          style={{padding:"7px 14px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          ➕ {lang==="hi"?"नई बुकिंग":"New Booking"}
        </button>
      </div>

      {/* Property filter */}
      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
        {PROP_OPTS.map(p=>(
          <button key={p.v} onClick={()=>setPF(p.v)}
            style={{padding:"5px 10px",borderRadius:7,border:propF===p.v?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:propF===p.v?C.maroonSoft:C.white,fontFamily:F.b,fontSize:10,fontWeight:propF===p.v?700:400,color:propF===p.v?C.maroon:C.tl,cursor:"pointer"}}>
            {p.v!=="all"&&PROPS[p.v]?.icon+" "}{p.v==="all"?"All":PROPS[p.v]?.sn}
          </button>
        ))}
        {loading&&<span style={{fontSize:10,color:C.tl,fontFamily:F.b,alignSelf:"center"}}>Loading...</span>}
      </div>

      {/* Booking form */}
      {showForm&&<BookingForm init={editB} prefillDate={prefDate} onSave={save} onCancel={()=>{setSF(false);setEB(null);setPD(null);}} user={user} lang={lang}/>}

      {/* Calendar grid */}
      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:C.maroonSoft,borderBottom:`1px solid ${C.border}`}}>
          {dys.map(d=><div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:10,fontWeight:700,color:C.maroon,fontFamily:F.b}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,idx)=>{
            if(!day)return<div key={`e${idx}`} style={{minHeight:62,background:"#F9F9F9",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>;
            const ds=toDS(yr,mo,day);
            const dayBks=byDate[ds]||[];
            const isToday=ds===todayStr;
            const isSel=ds===selDate;
            return(
              <div key={day} onClick={()=>setSD(isSel?null:ds)}
                style={{minHeight:62,padding:"4px 3px 3px 5px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:isSel?C.maroonSoft:C.white,position:"relative",transition:"background 0.1s"}}>
                <div style={{width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?C.maroon:"transparent",fontSize:10,fontWeight:isToday||isSel?700:400,color:isToday?C.white:isSel?C.maroon:C.text,fontFamily:F.b,marginBottom:2}}>{day}</div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {dayBks.slice(0,2).map(b=>{
                    const cs=chipStyle(b);
                    return(
                      <div key={b.id} style={{fontSize:8,fontFamily:F.b,fontWeight:600,padding:"1px 3px",borderRadius:3,background:cs.bg,color:cs.c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                        {EVENT_TYPES[b.event_type]?.icon||PROPS[b.property]?.icon}{b.event_name?" "+b.event_name.slice(0,7):""}
                      </div>
                    );
                  })}
                  {dayBks.length>2&&<div style={{fontSize:7,color:C.tl,fontFamily:F.b}}>+{dayBks.length-2}</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();setPD(ds);setEB(null);setSF(true);}}
                  style={{position:"absolute",top:2,right:2,width:14,height:14,borderRadius:3,border:`1px solid ${C.border}`,background:C.white,color:C.tl,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,opacity:0.6}}>+</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day panel */}
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
                        <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bBg,color:C.blue,fontFamily:F.b}}>{et.icon} {lang==="hi"?et.lH:et.l}</span>
                        {b.guest_count>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>👥 {b.guest_count} guests</span>}
                        {b.expected_cars>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bBg,color:C.blue,fontFamily:F.b}}>🚗 {b.expected_cars} cars</span>}
                        {b.valets_needed>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.maroonSoft,color:C.maroon,fontFamily:F.b}}>👤 {b.valets_needed} valets</span>}
                        {(b.shift_start||b.shift_end)&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>⏰ {fmtT(b.shift_start)}–{fmtT(b.shift_end)}</span>}
                      </div>
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

      {/* Legend */}
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
function interpolate(data,pax){
  const minPt=data[0],maxPt=data[data.length-1];
  if(pax<=minPt.pax)return{...minPt,isExact:true};
  if(pax>=maxPt.pax)return{...maxPt,isExact:true};
  const ex=data.find(d=>d.pax===pax);
  if(ex)return{...ex,isExact:true};
  let lo=data[0],hi=data[data.length-1];
  for(let i=0;i<data.length-1;i++){if(data[i].pax<=pax&&data[i+1].pax>=pax){lo=data[i];hi=data[i+1];break;}}
  const t=(pax-lo.pax)/(hi.pax-lo.pax);
  const roles=["keyMan","driver","guard","rider","gunMan","bouncer"];
  const result={pax,isExact:false};
  roles.forEach(r=>{result[r]=Math.ceil(lo[r]+t*(hi[r]-lo[r]));});
  return result;
}

function RoleCard({roleKey,count,lang}){
  const meta=ROLE_META[roleKey];
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:C.white,borderRadius:10,border:`1px solid ${C.border}`,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
      <div style={{width:36,height:36,borderRadius:9,background:C.maroonSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{meta.icon}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:10,color:C.tl,fontFamily:F.b,fontWeight:500}}>{lang==="hi"?meta.labelHi:meta.label}</div>
        <div style={{fontSize:22,fontWeight:700,fontFamily:F.d,color:C.maroon,lineHeight:1.1}}>{count}</div>
      </div>
    </div>
  );
}

function StaffCalculator({user, lang}){
  const defVenue=VENUE_CFG[user.prop]?user.prop:"pp";
  const [venue,setVenue]=useState(defVenue);
  const [pax,setPax]=useState(300);
  const [showCost,setShowCost]=useState(false);
  const [rates,setRates]=useState({keyMan:1500,driver:1200,guard:1000,rider:800,gunMan:2000,bouncer:1500});

  const cfg=VENUE_CFG[venue]; const data=VALET_DATA[venue];
  const clamped=Math.min(Math.max(pax,cfg.min),cfg.max);
  const alloc=interpolate(data,clamped);
  const roles=["keyMan","driver","guard","rider","gunMan","bouncer"];
  const active=roles.filter(r=>alloc[r]>0);
  const total=roles.reduce((s,r)=>s+(alloc[r]||0),0);
  const pct=((clamped-cfg.min)/(cfg.max-cfg.min))*100;
  const totalCost=roles.reduce((s,r)=>s+(alloc[r]||0)*(rates[r]||0),0);
  const L=lang==="hi";

  return(
    <div style={{maxWidth:680,margin:"0 auto"}}>
      <div style={{fontSize:11,color:C.tl,fontFamily:F.b,marginBottom:16}}>{L?"स्टाफ की संख्या ऊपर की ओर गोल की गई है।":"Staff counts rounded up — always better to have more than less."}</div>

      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {Object.entries(VENUE_CFG).map(([k,v])=>{
          const a=venue===k;
          return(
            <button key={k} onClick={()=>{setVenue(k);setPax(v.min+Math.round((v.max-v.min)*0.3/v.step)*v.step);}}
              style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:10,border:a?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:a?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:a?700:400,color:a?C.maroon:C.tl}}>
              <span style={{fontSize:14}}>{v.icon}</span><span>{v.name}</span>
            </button>
          );
        })}
      </div>

      <div style={{background:C.white,borderRadius:14,padding:"16px 18px 18px",border:`1px solid ${C.border}`,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,color:C.tl,fontFamily:F.b}}>{L?"अपेक्षित मेहमान":"Expected Guests (Pax)"}</div>
          <div style={{fontSize:30,fontWeight:700,fontFamily:F.d,color:C.maroon,lineHeight:1,display:"flex",alignItems:"baseline",gap:4}}>
            {clamped}<span style={{fontSize:11,color:C.tl,fontWeight:400}}>{L?"मेहमान":"guests"}</span>
          </div>
        </div>
        <div style={{position:"relative",height:4,borderRadius:2,background:C.border,marginBottom:6}}>
          <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,borderRadius:2,background:`linear-gradient(90deg,${C.maroon},${C.maroonLight})`}}/>
        </div>
        <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={clamped} onChange={e=>setPax(Number(e.target.value))}
          style={{width:"100%",margin:"0 0 4px",WebkitAppearance:"none",appearance:"none",height:20,background:"transparent",cursor:"pointer",outline:"none"}}/>
        <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:${C.maroon};cursor:pointer;box-shadow:0 2px 6px ${C.maroon}44;margin-top:-9px;}input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:${C.maroon};cursor:pointer;border:none;}input[type=range]::-webkit-slider-runnable-track{height:4px;background:transparent;}input[type=range]::-moz-range-track{height:4px;background:transparent;}`}</style>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:2,marginBottom:10}}>
          {data.map(d=><div key={d.pax} style={{fontSize:8,color:d.pax===clamped?C.maroon:C.tl,fontWeight:d.pax===clamped?700:400,fontFamily:F.b}}>{d.pax>=1000?"1K":d.pax}</div>)}
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {data.map(d=><button key={d.pax} onClick={()=>setPax(d.pax)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,background:clamped===d.pax?C.maroon:C.bg,color:clamped===d.pax?C.white:C.tl}}>{d.pax}</button>)}
        </div>
      </div>

      <div style={{background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,borderRadius:14,padding:"16px 18px 14px",marginBottom:14,boxShadow:`0 4px 16px ${C.maroon}33`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontFamily:F.b,fontWeight:600}}>{cfg.icon} {cfg.name} · {clamped} {L?"मेहमान":"guests"}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontFamily:F.b,marginTop:2}}>{alloc.isExact?(L?"(सटीक)":"(exact)"):(L?"(अनुमानित)":"(interpolated)")}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:F.b}}>{L?"कुल वैलेट स्टाफ":"Total Valet Staff"}</div>
            <div style={{fontSize:48,fontWeight:700,fontFamily:F.d,color:"#fff",lineHeight:1}}>{total}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {active.map(r=>(
            <div key={r} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:7,background:"rgba(255,255,255,0.15)"}}>
              <span style={{fontSize:12}}>{ROLE_META[r].icon}</span>
              <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:F.b}}>{alloc[r]} {L?ROLE_META[r].labelHi:ROLE_META[r].label}</span>
            </div>
          ))}
        </div>
      </div>

      {active.length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:8}}>{L?"स्टाफ विवरण":"Staff Breakdown"}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:8}}>
          {active.map(r=><RoleCard key={r} roleKey={r} count={alloc[r]} lang={lang}/>)}
        </div>
      </div>}

      <div style={{background:C.white,borderRadius:14,padding:14,border:`1px solid ${C.border}`,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:10}}>🚘 {L?"कार अनुमान":"Car Estimate"}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[{n:4,cars:Math.ceil(clamped/4),label:L?"4/कार (परिवार)":"4 per car (family)",bg:"#EBF5F0",c:C.green},{n:3,cars:Math.ceil(clamped/3),label:L?"3/कार (औसत)":"3 per car (avg)",bg:C.bBg,c:C.blue},{n:2,cars:Math.ceil(clamped/2),label:L?"2/कार (VIP)":"2 per car (VIP)",bg:C.maroonSoft,c:C.maroon}].map(x=>(
            <div key={x.n} style={{textAlign:"center",padding:"12px 6px",background:x.bg,borderRadius:10}}>
              <div style={{fontSize:26,fontWeight:700,fontFamily:F.d,color:x.c,lineHeight:1}}>{x.cars}</div>
              <div style={{fontSize:9,color:x.c,fontFamily:F.b,fontWeight:600,marginTop:2}}>{L?"कारें":"cars"}</div>
              <div style={{fontSize:9,color:C.tl,fontFamily:F.b,marginTop:4,lineHeight:1.3}}>{x.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <button onClick={()=>setShowCost(!showCost)} style={{width:"100%",padding:"12px 16px",border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:F.b,fontSize:13,fontWeight:600,color:C.maroon}}>
          <span>💰 {showCost?(L?"लागत छुपाएं":"Hide Cost"):(L?"लागत अनुमान":"Show Cost Estimate")}</span>
          <span style={{fontSize:11,color:C.tl}}>{showCost?"▲":"▼"}</span>
        </button>
        {showCost&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${C.border}`}}>
          <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
            {active.map(r=>(
              <div key={r} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>{ROLE_META[r].icon}</span>
                <span style={{flex:1,fontSize:12,fontFamily:F.b,fontWeight:500}}>{L?ROLE_META[r].labelHi:ROLE_META[r].label}<span style={{color:C.tl,fontWeight:400}}> × {alloc[r]}</span></span>
                <div style={{display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:11,color:C.tl}}>₹</span><input type="number" min={0} step={100} value={rates[r]} onChange={e=>setRates(p=>({...p,[r]:Number(e.target.value)}))} style={{width:76,padding:"5px 7px",borderRadius:7,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,textAlign:"right",outline:"none"}}/></div>
                <div style={{width:68,textAlign:"right",fontSize:12,fontWeight:700,color:C.maroon,fontFamily:F.b}}>₹{(alloc[r]*rates[r]).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:F.b}}>💰 {L?"कुल लागत":"Total Cost"}</span>
            <span style={{fontSize:20,fontWeight:700,fontFamily:F.d,color:"#fff"}}>₹{totalCost.toLocaleString("en-IN")}</span>
          </div>
        </div>}
      </div>

      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:F.d,fontSize:14,fontWeight:700,color:C.maroon}}>
          📋 {L?"पूरी संदर्भ तालिका":"Full Reference Table"} — {cfg.icon} {cfg.name}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:F.b,fontSize:11}}>
            <thead>
              <tr style={{background:C.maroonSoft}}>
                <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:C.maroon}}>{L?"पैक्स":"Pax"}</th>
                {["keyMan","driver","guard","rider","gunMan","bouncer"].map(r=>(
                  <th key={r} style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:C.maroon}}>
                    {ROLE_META[r].icon}<div style={{fontSize:8,fontWeight:500,color:C.tl}}>{L?ROLE_META[r].labelHi:ROLE_META[r].label}</div>
                  </th>
                ))}
                <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:C.maroon}}>{L?"कुल":"Total"}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d,i)=>{
                const rt=roles.reduce((s,r)=>s+d[r],0);
                const isA=d.pax===clamped;
                return(
                  <tr key={d.pax} onClick={()=>setPax(d.pax)} style={{background:isA?C.maroonSoft:i%2===0?C.white:C.bg,cursor:"pointer"}}>
                    <td style={{padding:"7px 10px",fontWeight:isA?700:500,color:isA?C.maroon:C.text}}>{d.pax}</td>
                    {roles.map(r=><td key={r} style={{padding:"7px 8px",textAlign:"center",color:d[r]>0?C.text:C.border,fontWeight:d[r]>0?600:400}}>{d[r]>0?d[r]:"—"}</td>)}
                    <td style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:C.maroon}}>{rt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:"6px 12px",fontSize:9,color:C.tl,fontFamily:F.b,borderTop:`1px solid ${C.border}`}}>
          👆 {L?"किसी पंक्ति पर टैप करें":"Tap any row to jump to that pax"}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function ValetPlanning({user, lang}){
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
