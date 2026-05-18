import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { C as C_BASE, F, PROPS } from "./constants.js";
const C = C_BASE;
import { useT } from "./ThemeContext.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";
import { useIsMobile } from "./hooks.js";

// ─── VALET DATA ───────────────────────────────────────────────────────────────
const VA = {
  pp: {
    name: "Pushpanjali", maxCap: 1000,
    ranges: [
      { min:100, max:150,  label:"100–150"  },
      { min:200, max:250,  label:"200–250"  },
      { min:300, max:350,  label:"300–350"  },
      { min:400, max:500,  label:"400–500"  },
      { min:600, max:800,  label:"600–800"  },
      { min:900, max:1000, label:"900–1000" },
    ],
    roles: {
      "Key Man": [1, 1,  1,  1,  1,  1 ],
      "Driver":  [2, 4,  5,  7,  10, 13],
      "Guard":   [0, 0,  1,  1,  2,  2 ],
      "Rider":   [0, 0,  0,  0,  1,  1 ],
      "Gun Man": [0, 0,  0,  0,  0,  0 ],
      "Bouncer": [0, 0,  0,  0,  0,  0 ],
    },
    totals: [3, 5, 7, 9, 14, 17],
  },
  ex: {
    name: "Exotica", maxCap: 1000,
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
    name: "Manaktala", maxCap: 900,
    ranges: [
      { min:100, max:150, label:"100–150" },
      { min:200, max:250, label:"200–250" },
      { min:300, max:350, label:"300–350" },
      { min:400, max:450, label:"400–450" },
      { min:500, max:550, label:"500–550" },
      { min:600, max:700, label:"600–700" },
      { min:800, max:900, label:"800–900" },
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
    name: "Restro", maxCap: 200,
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
  "Key Man": { icon:"👔", color:"#7B1E2F", hi:"की मैन"  },
  "Driver":  { icon:"🚗", color:"#1E66C8", hi:"ड्राइवर" },
  "Guard":   { icon:"🛡️", color:"#7C3AED", hi:"गार्ड"   },
  "Rider":   { icon:"🏍️", color:"#059669", hi:"राइडर"   },
  "Gun Man": { icon:"🔫", color:"#DC2626", hi:"गन मैन"  },
  "Bouncer": { icon:"💪", color:"#D97706", hi:"बाउंसर" },
};

const EVENT_TYPES = {
  standard_wedding: { l:"Standard Wedding",             lH:"स्टैंडर्ड शादी",    icon:"💒" },
  premium_wedding:  { l:"Premium Wedding",              lH:"प्रीमियम शादी",    icon:"👑" },
  corporate:        { l:"Corporate Event",              lH:"कॉर्पोरेट इवेंट",  icon:"🏢" },
  luxury_vip:       { l:"Luxury / VIP Event",           lH:"लग्ज़री / VIP",    icon:"⭐" },
  birthday:         { l:"Birthday / Small Party",       lH:"जन्मदिन / पार्टी", icon:"🎂" },
  exhibition:       { l:"Exhibition / Large Gathering", lH:"प्रदर्शनी",        icon:"🎪" },
  other:            { l:"Other",                        lH:"अन्य",             icon:"📋" },
};

const PRIORITIES = {
  normal:   { l:"Normal",           lH:"सामान्य",            c:"#7A7A7A", bg:"#F0F0F0" },
  high:     { l:"High (Elite)",     lH:"हाई — एलीट",         c:"#d97706", bg:"#FFF7ED" },
  critical: { l:"Critical (Luxury)",lH:"क्रिटिकल — लग्ज़री", c:"#C0392B", bg:"#FBEAE8" },
};

const STATUS = {
  planned:   { l:"Planned",   lH:"नियोजित", c:"#C68A1D", bg:"#FDF6E8" },
  confirmed: { l:"Confirmed", lH:"पुष्टि",  c:"#2E8B57", bg:"#EBF5F0" },
  completed: { l:"Completed", lH:"पूर्ण",   c:"#7A7A7A", bg:"#EFEFEF" },
};

const MN_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MN_HI = ["जनवरी","फ़रवरी","मार्च","अप्रैल","मई","जून","जुलाई","अगस्त","सितंबर","अक्टूबर","नवंबर","दिसंबर"];
const DY_EN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DY_HI = ["रवि","सोम","मंगल","बुध","गुरु","शुक्र","शनि"];

// ─── COST RATES ───────────────────────────────────────────────────────────────
const DEF_RATES = { "Key Man":800, "Driver":500, "Guard":600, "Rider":400, "Gun Man":1500, "Bouncer":1200 };
function loadRates(){ try{ const r=localStorage.getItem("valet_cost_rates"); return r?{...DEF_RATES,...JSON.parse(r)}:{...DEF_RATES}; }catch{ return {...DEF_RATES}; } }
function saveRates(r){ try{ localStorage.setItem("valet_cost_rates",JSON.stringify(r)); }catch{} }

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function dIM(y,m){ return new Date(y,m+1,0).getDate(); }
function fDM(y,m){ return new Date(y,m,1).getDay(); }
function toDS(y,m,d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtD(ds){ if(!ds)return ""; const[y,mo,d]=ds.split("-"); return `${parseInt(d)} ${MN_EN[parseInt(mo)-1].slice(0,3)} ${y}`; }
function fmtT(t){ if(!t)return ""; const[h,m]=t.split(":"); const hr=parseInt(h); return `${hr>12?hr-12:hr}:${m} ${hr>=12?"PM":"AM"}`; }

function getAlloc(property, pax){
  const d = VA[property];
  if(!d || !pax || pax<=0) return null;
  let idx = d.ranges.findIndex(r => pax <= r.max);
  if(idx===-1) idx = d.ranges.length-1;
  const alloc = {};
  ROLE_ORDER.forEach(r=>{ alloc[r] = d.roles[r][idx]; });
  return { rangeIdx:idx, range:d.ranges[idx].label, alloc, total:d.totals[idx], isOver:pax>d.maxCap };
}

// ─── FULL ALLOCATION MATRIX ──────────────────────────────────────────────────
function FullMatrix({ prop, activeIdx, lang }){
  const C = useT();
  const a = VA[prop];
  if(!a) return null;
  const L = lang==="hi";
  return(
    <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginTop:12}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:F.d,fontSize:13,fontWeight:700,color:C.maroon}}>
        {L?"पूरी आवंटन तालिका":"Average Allocations"} — {a.name}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",fontFamily:F.b,fontSize:11,minWidth:"100%"}}>
          <thead>
            <tr>
              <th style={{padding:"8px 12px",textAlign:"left",background:C.maroonSoft,color:C.maroon,fontWeight:700,whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,minWidth:90}}>
                {L?"भूमिका":"Particulars"}
              </th>
              {a.ranges.map((r,i)=>(
                <th key={i} style={{padding:"7px 10px",textAlign:"center",fontWeight:700,whiteSpace:"nowrap",minWidth:56,
                  background:i===activeIdx?C.maroon:C.maroonSoft,
                  color:i===activeIdx?C.white:C.maroon}}>
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
                  <td style={{padding:"7px 12px",fontWeight:600,whiteSpace:"nowrap",background:C.bg,borderBottom:`1px solid ${C.border}`,position:"sticky",left:0,borderLeft:`3px solid ${meta.color}`,color:C.text}}>
                    {meta.icon} {L?meta.hi:role}
                  </td>
                  {a.roles[role].map((val,ci)=>(
                    <td key={ci} style={{padding:"7px 10px",textAlign:"center",borderBottom:`1px solid ${C.border}`,
                      background:ci===activeIdx?`${C.maroon}18`:val>0?"#F0FAF4":C.white,
                      fontWeight:val>0?700:400,
                      color:ci===activeIdx?C.maroon:val>0?"#059669":C.border}}>
                      {val>0?val:<span style={{color:C.border}}>—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{padding:"8px 12px",fontWeight:700,background:C.maroonSoft,color:C.maroon,position:"sticky",left:0,fontFamily:F.b,fontSize:11}}>
                {L?"कुल":"TOTAL"}
              </td>
              {a.totals.map((t,i)=>(
                <td key={i} style={{padding:"8px 10px",textAlign:"center",fontWeight:700,
                  background:i===activeIdx?C.maroon:C.maroonSoft,
                  color:i===activeIdx?C.white:C.maroon,fontFamily:F.d,fontSize:13}}>
                  {t}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{padding:"5px 12px",fontSize:9,color:C.tl,fontFamily:F.b,borderTop:`1px solid ${C.border}`}}>
        {L?"हाइलाइट = वर्तमान चयन":"Highlighted column = current selection"}
      </div>
    </div>
  );
}

// ─── STAFF CALCULATOR ────────────────────────────────────────────────────────
function StaffCalculator({ user, lang, onBookThis }){
  const C = useT();
  const isMobile = useIsMobile();
  const isSA = user.role==="sa";
  const L = lang==="hi";
  const defProp = VA[user.prop] ? user.prop : "pp";
  const [prop, setProp] = useState(defProp);
  const [paxInput, setPaxInput] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);
  const [editRates, setEditRates] = useState(false);
  const [rates, setRates] = useState(loadRates);

  const pax = parseInt(paxInput)||0;
  const result = pax>0 ? getAlloc(prop, pax) : null;

  const totalCost = result
    ? ROLE_ORDER.reduce((s,r)=>s+(result.alloc[r]||0)*(rates[r]||0),0)
    : 0;

  const updRate = (role, val) => {
    const next = {...rates,[role]:parseInt(val)||0};
    setRates(next); saveRates(next);
  };

  useEffect(()=>{ setPaxInput(""); setShowMatrix(false); },[prop]);

  const QUICK = [100,150,200,300,500,700,1000];

  return(
    <div style={{maxWidth:640,margin:"0 auto"}}>

      {/* STEP 1 */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:8}}>
          {L?"चरण 1 — वेन्यू":"Step 1 — Select Property"}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {Object.entries(VA).map(([k,v])=>{
            const active=prop===k;
            return(
              <button key={k} onClick={()=>setProp(k)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",borderRadius:10,
                  border:active?`2px solid ${C.maroon}`:`1px solid ${C.border}`,
                  background:active?C.maroonSoft:C.white,cursor:"pointer",
                  fontFamily:F.b,fontSize:13,fontWeight:active?700:400,
                  color:active?C.maroon:C.tl,minHeight:44}}>
                <span style={{fontSize:16}}>{PROPS[k]?.icon||"🏛️"}</span>
                {v.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2 */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:8}}>
          {L?"चरण 2 — मेहमान संख्या":"Step 2 — Enter Guest Count"}
        </div>
        <div style={{background:C.white,borderRadius:14,padding:16,border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
          <input type="number" min={0} value={paxInput}
            onChange={e=>setPaxInput(e.target.value)}
            placeholder={L?"अपेक्षित मेहमान (pax)":"Enter expected guests (pax)"}
            style={{width:"100%",padding:"12px 16px",borderRadius:10,
              border:`2px solid ${pax>0?C.maroon:C.border}`,
              fontFamily:F.b,fontSize:20,fontWeight:700,outline:"none",
              boxSizing:"border-box",background:C.bg,color:C.text}}/>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
            {QUICK.map(q=>(
              <button key={q} onClick={()=>setPaxInput(String(q))}
                style={{padding:"7px 14px",borderRadius:8,
                  border:pax===q?`2px solid ${C.maroon}`:`1px solid ${C.border}`,
                  background:pax===q?C.maroonSoft:C.white,
                  fontFamily:F.b,fontSize:12,fontWeight:pax===q?700:400,
                  color:pax===q?C.maroon:C.tl,cursor:"pointer",minHeight:36}}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* STEP 3 — Result Card */}
      {result&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:700,color:C.tl,textTransform:"uppercase",letterSpacing:1,fontFamily:F.b,marginBottom:8}}>
            {L?"चरण 3 — परिणाम":"Step 3 — Result"}
          </div>

          <div style={{background:C.white,borderRadius:16,border:`2px solid ${C.maroon}`,overflow:"hidden",boxShadow:"0 4px 20px rgba(123,30,47,0.12)"}}>

            {/* Card header */}
            <div style={{background:`linear-gradient(135deg,${C.maroon},#a83251)`,padding:"14px 18px"}}>
              <div style={{fontFamily:F.d,fontSize:18,fontWeight:700,color:"#fff",marginBottom:2}}>
                🚗 {L?"वैलेट स्टाफ आवश्यक":"Valet Staff Required"}
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontFamily:F.b}}>
                {VA[prop].name} · {pax} {L?"मेहमान":"Guests"} · {L?"रेंज":"Range"}: {result.range}
              </div>
              {result.isOver&&(
                <div style={{marginTop:6,fontSize:11,background:"rgba(255,255,255,0.2)",borderRadius:6,padding:"4px 10px",color:"#fff",fontFamily:F.b}}>
                  ⚠️ {L?"मेहमान संख्या क्षमता से अधिक — अधिकतम आवंटन दिखाया गया":"Guest count exceeds venue capacity. Showing maximum allocation."}
                </div>
              )}
            </div>

            {/* Role rows — only show >0 */}
            <div style={{padding:"14px 18px 0"}}>
              {ROLE_ORDER.filter(r=>result.alloc[r]>0).map(r=>{
                const meta=ROLE_META[r];
                return(
                  <div key={r} style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{width:4,height:36,borderRadius:2,background:meta.color,marginRight:12,flexShrink:0}}/>
                    <div style={{flex:1,fontFamily:F.b,fontSize:14,fontWeight:500,color:C.text}}>
                      {meta.icon} {L?meta.hi:r}
                    </div>
                    <div style={{fontFamily:F.d,fontSize:30,fontWeight:700,color:meta.color,lineHeight:1}}>
                      {result.alloc[r]}
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              <div style={{display:"flex",alignItems:"center",padding:"12px 0 10px"}}>
                <div style={{flex:1,fontFamily:F.b,fontSize:14,fontWeight:700,color:C.maroon}}>
                  👥 {L?"कुल स्टाफ":"TOTAL STAFF"}
                </div>
                <div style={{fontFamily:F.d,fontSize:38,fontWeight:700,color:C.maroon,lineHeight:1}}>
                  {result.total}
                </div>
              </div>
            </div>

            {/* Cost */}
            <div style={{padding:"12px 18px",borderTop:`1px solid ${C.border}`,background:C.bg}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{fontFamily:F.b,fontSize:13,color:C.text}}>
                  💰 {L?"अनुमानित लागत":"Estimated Cost"}:
                  <strong style={{color:C.maroon,marginLeft:8,fontFamily:F.d,fontSize:20}}>
                    ₹{totalCost.toLocaleString("en-IN")}
                  </strong>
                </div>
                {isSA&&(
                  <button onClick={()=>setEditRates(!editRates)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:7,border:`1px solid ${C.border}`,
                      background:editRates?C.maroonSoft:C.white,
                      color:editRates?C.maroon:C.tl,cursor:"pointer",fontFamily:F.b,fontWeight:600}}>
                    ⚙️ {editRates?(L?"बंद करें":"Done"):(L?"दरें बदलें":"Edit Rates")}
                  </button>
                )}
              </div>
              {!isSA&&<div style={{fontSize:10,color:C.tl,fontFamily:F.b,marginTop:3}}>{L?"(प्रति व्यक्ति दर SA द्वारा निर्धारित)":"(per-person rate set by admin)"}</div>}

              {isSA&&editRates&&(
                <div style={{background:C.white,borderRadius:10,padding:12,marginTop:10,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.tl,marginBottom:8,fontFamily:F.b}}>
                    {L?"प्रति व्यक्ति दर (₹/शिफ्ट)":"Rate per person (₹/shift)"}
                  </div>
                  {ROLE_ORDER.map(r=>(
                    <div key={r} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:14}}>{ROLE_META[r].icon}</span>
                      <span style={{flex:1,fontFamily:F.b,fontSize:11,color:C.tl}}>{L?ROLE_META[r].hi:r}</span>
                      <span style={{fontSize:11,color:C.tl}}>₹</span>
                      <input type="number" min={0} step={50} value={rates[r]}
                        onChange={e=>updRate(r,e.target.value)}
                        style={{width:80,padding:"5px 8px",borderRadius:7,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,textAlign:"right",outline:"none"}}/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{padding:"12px 18px 18px",display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={()=>onBookThis(prop,pax)}
                style={{flex:1,padding:"11px 16px",borderRadius:10,border:"none",background:C.maroon,color:"#fff",fontFamily:F.b,fontSize:13,fontWeight:700,cursor:"pointer",minHeight:44}}>
                📅 {L?"बुक करें":"Book This"}
              </button>
              <button onClick={()=>setShowMatrix(!showMatrix)}
                style={{flex:1,padding:"11px 16px",borderRadius:10,border:`1px solid ${C.maroon}`,background:showMatrix?C.maroonSoft:C.white,color:C.maroon,fontFamily:F.b,fontSize:13,fontWeight:600,cursor:"pointer",minHeight:44}}>
                📊 {showMatrix?(L?"तालिका छुपाएं":"Hide Table"):(L?"पूरी तालिका देखें":"View Full Table")}
              </button>
            </div>
          </div>

          {showMatrix&&<FullMatrix prop={prop} activeIdx={result.rangeIdx} lang={lang}/>}
        </div>
      )}
    </div>
  );
}

// ─── BOOKING FORM ─────────────────────────────────────────────────────────────
function BookingForm({ init, prefillDate, prefillProp, prefillPax, onSave, onCancel, user, lang }){
  const C = useT();
  const isMobile = useIsMobile();
  const defProp = prefillProp || (user.prop==="all"?"pp":(user.prop||"pp"));
  const isEdit = !!init?.id;

  const initData = isEdit ? {
    ...init,
    event_type: init.event_type||"other",
    guest_count: String(init.guest_count||""),
    priority: init.priority||"normal",
    special_instructions: init.special_instructions||init.notes||"",
    valets_needed: String(init.valets_needed||""),
  } : {
    property:defProp, event_date:prefillDate||"", event_name:"",
    event_type:"standard_wedding", guest_count:prefillPax?String(prefillPax):"",
    valets_needed:"", priority:"normal", special_instructions:"",
    vendor_name:"", vendor_phone:"", shift_start:"18:00", shift_end:"23:30", status:"planned",
  };

  const [f, sF] = useState(initData);
  const inp = (k,v) => sF(p=>({...p,[k]:v}));
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [overrideReason, setOverrideReason] = useState("");
  const valetsEdited = useRef(false);

  const gc = parseInt(f.guest_count)||0;
  const result = gc>0 ? getAlloc(f.property,gc) : null;

  useEffect(()=>{
    if(valetsEdited.current || !result) return;
    const total = overrideOn
      ? ROLE_ORDER.reduce((s,r)=>s+(parseInt(overrides[r]??result.alloc[r])||0),0)
      : result.total;
    sF(p=>({...p,valets_needed:String(total)}));
  },[f.guest_count,f.property,overrideOn,overrides,result?.rangeIdx]);

  useEffect(()=>{ setOverrides({}); setOverrideOn(false); valetsEdited.current=false; },[f.property,f.guest_count]);

  const save = () => {
    if(!f.event_date||!f.property) return;
    const finalAlloc = result ? (overrideOn
      ? Object.fromEntries(ROLE_ORDER.map(r=>[r,parseInt(overrides[r]??result.alloc[r])||0]))
      : result.alloc) : null;
    const totalStaff = finalAlloc ? ROLE_ORDER.reduce((s,r)=>s+(finalAlloc[r]||0),0) : parseInt(f.valets_needed)||0;
    onSave({
      ...f, valets_needed:totalStaff, guest_count:gc,
      staff_allocation:finalAlloc,
      override_reason:(overrideOn&&overrideReason)?overrideReason:null,
      created_by:f.created_by||user.id,
    });
  };

  const L = lang==="hi";
  const F2 = {width:"100%",padding:"9px 12px",borderRadius:9,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",boxSizing:"border-box",background:C.bg};
  const Lb = {fontSize:11,fontWeight:600,color:C.tl,marginBottom:4,display:"block"};

  return(
    <div style={{background:C.white,borderRadius:14,padding:16,border:`2px solid ${C.maroon}`,marginBottom:14}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:14}}>
        {isEdit?"✏️ Edit Booking":"➕ New Valet Booking"}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
        <div>
          <label style={Lb}>{L?"वेन्यू":"Property"}</label>
          <select value={f.property} onChange={e=>inp("property",e.target.value)} style={F2}>
            {["pp","ex","mk","rs"].map(p=><option key={p} value={p}>{PROPS[p]?.icon} {VA[p].name}</option>)}
          </select>
        </div>
        <div>
          <label style={Lb}>{L?"तारीख":"Event Date"}</label>
          <input type="date" value={f.event_date} onChange={e=>inp("event_date",e.target.value)} style={F2}/>
        </div>

        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>{L?"इवेंट नाम":"Event Name"}</label>
          <input value={f.event_name} onChange={e=>inp("event_name",e.target.value)} placeholder="e.g. Sharma Wedding, TechCorp Annual" style={F2}/>
        </div>

        <div>
          <label style={Lb}>{L?"इवेंट प्रकार":"Event Type"}</label>
          <select value={f.event_type} onChange={e=>inp("event_type",e.target.value)} style={F2}>
            {Object.entries(EVENT_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {L?v.lH:v.l}</option>)}
          </select>
        </div>
        <div>
          <label style={Lb}>{L?"प्राथमिकता":"Priority"}</label>
          <select value={f.priority} onChange={e=>inp("priority",e.target.value)}
            style={{...F2,background:PRIORITIES[f.priority]?.bg||C.bg,color:PRIORITIES[f.priority]?.c||C.text,fontWeight:f.priority!=="normal"?700:400}}>
            {Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{L?v.lH:v.l}</option>)}
          </select>
        </div>

        <div>
          <label style={Lb}>👥 {L?"अपेक्षित मेहमान":"Expected Guests"}</label>
          <input type="number" min={0} value={f.guest_count}
            onChange={e=>{valetsEdited.current=false;inp("guest_count",e.target.value);}}
            placeholder="e.g. 500" style={F2}/>
        </div>
        <div>
          <label style={Lb}>👤 {L?"वैलेट स्टाफ":"Valets Needed"}</label>
          <input type="number" min={0} value={f.valets_needed}
            onChange={e=>{valetsEdited.current=true;inp("valets_needed",e.target.value);}}
            placeholder="Auto-calculated" style={F2}/>
        </div>

        {/* Inline allocation preview */}
        {result&&(
          <div style={{gridColumn:"1/-1",background:C.maroonSoft,borderRadius:10,padding:12,border:`1px solid ${C.maroon}44`}}>
            <div style={{fontSize:11,fontWeight:700,color:C.maroon,marginBottom:8}}>
              🚗 {L?"स्टाफ आवंटन":"Staff Allocation"} — {L?"रेंज":"Range"}: {result.range}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
              {ROLE_ORDER.filter(r=>overrideOn?true:result.alloc[r]>0).map(r=>{
                const meta=ROLE_META[r];
                const val = overrideOn?(overrides[r]??result.alloc[r]):result.alloc[r];
                return(
                  <div key={r} style={{display:"flex",alignItems:"center",gap:5,background:C.white,borderRadius:8,padding:"7px 10px",border:`1px solid ${meta.color}22`}}>
                    <span style={{fontSize:13}}>{meta.icon}</span>
                    <span style={{fontSize:11,color:C.tl,fontFamily:F.b}}>{L?meta.hi:r}</span>
                    {overrideOn
                      ?<input type="number" min={0} value={val}
                          onChange={e=>setOverrides(p=>({...p,[r]:e.target.value}))}
                          style={{width:50,padding:"3px 6px",borderRadius:6,border:`1px solid ${meta.color}`,fontFamily:F.b,fontSize:13,textAlign:"center",outline:"none"}}/>
                      :<span style={{fontFamily:F.d,fontSize:18,fontWeight:700,color:meta.color}}>{val}</span>
                    }
                  </div>
                );
              })}
            </div>
            <button onClick={()=>setOverrideOn(!overrideOn)}
              style={{fontSize:11,padding:"5px 12px",borderRadius:7,border:`1px solid ${overrideOn?"#D97706":C.border}`,background:overrideOn?"#FFF7ED":C.white,color:overrideOn?"#D97706":C.tl,cursor:"pointer",fontFamily:F.b,fontWeight:overrideOn?700:400}}>
              ⚙️ {L?"मैन्युअल ओवरराइड":"Manual Override"} {overrideOn?"●":"○"}
            </button>
            {overrideOn&&(
              <div style={{marginTop:8}}>
                <div style={{fontSize:10,fontWeight:600,color:"#D97706",marginBottom:4}}>
                  ⚠️ {L?"ओवरराइड कारण (जरूरी)":"Reason for override (required)"}
                </div>
                <textarea value={overrideReason} onChange={e=>setOverrideReason(e.target.value)}
                  placeholder="e.g. VIP event — extra drivers requested by sales team" rows={2}
                  style={{width:"100%",padding:"7px 10px",borderRadius:7,border:`1px solid ${overrideReason?"#D97706":C.red}`,fontFamily:F.b,fontSize:11,resize:"vertical",outline:"none",boxSizing:"border-box",background:"#FFFBF0"}}/>
              </div>
            )}
          </div>
        )}

        <div style={{gridColumn:"1/-1"}}>
          <label style={{...Lb,color:"#D97706"}}>📋 {L?"विशेष निर्देश":"Special Instructions"}</label>
          <textarea value={f.special_instructions} onChange={e=>inp("special_instructions",e.target.value)}
            placeholder="e.g. VIP guest list, extra valets, specific parking arrangement"
            rows={2} style={{...F2,background:"#FFFBF0",border:`1px solid #C4956A`,resize:"vertical"}}/>
        </div>

        <div>
          <label style={Lb}>🏢 {L?"वेंडर नाम":"Vendor Name"}</label>
          <input value={f.vendor_name} onChange={e=>inp("vendor_name",e.target.value)} placeholder="Valet company name" style={F2}/>
        </div>
        <div>
          <label style={Lb}>📞 {L?"वेंडर फ़ोन":"Vendor Phone"}</label>
          <input type="tel" value={f.vendor_phone} onChange={e=>inp("vendor_phone",e.target.value)} placeholder="+91 99999 99999" style={F2}/>
        </div>

        <div>
          <label style={Lb}>⏰ {L?"शिफ्ट शुरू":"Shift Start"}</label>
          <input type="time" value={f.shift_start} onChange={e=>inp("shift_start",e.target.value)} style={F2}/>
        </div>
        <div>
          <label style={Lb}>⏰ {L?"शिफ्ट खत्म":"Shift End"}</label>
          <input type="time" value={f.shift_end} onChange={e=>inp("shift_end",e.target.value)} style={F2}/>
        </div>

        <div>
          <label style={Lb}>{L?"स्थिति":"Status"}</label>
          <select value={f.status} onChange={e=>inp("status",e.target.value)} style={F2}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{L?v.lH:v.l}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={save}
          style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"11px 22px",borderRadius:9,border:"none",background:C.maroon,color:"#fff",fontFamily:F.b,fontSize:13,fontWeight:700,cursor:"pointer",minHeight:44}}>
          {isEdit?"💾 Update":"✅ Save Booking"}
        </button>
        <button onClick={onCancel}
          style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"11px 16px",borderRadius:9,border:`1px solid ${C.border}`,background:C.white,color:C.text,fontFamily:F.b,fontSize:13,cursor:"pointer",minHeight:44}}>
          {L?"रद्द":"Cancel"}
        </button>
      </div>
    </div>
  );
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
function CalendarView({ user, lang, prefill, onClearPrefill }){
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
  const [prefProp,setPProp] = useState(null);
  const [prefPax,setPPax] = useState(null);
  const [propF,setPF] = useState(user.prop==="all"?"all":(user.prop||"pp"));
  const todayStr = toDS(today.getFullYear(),today.getMonth(),today.getDate());

  // Auto-open form when coming from "Book This"
  useEffect(()=>{
    if(prefill){ setPProp(prefill.property); setPPax(prefill.pax); setPD(null); setEB(null); setSF(true); }
  },[prefill]);

  const load = useCallback(async()=>{
    setLd(true);
    const y=String(yr),m=String(mo+1).padStart(2,"0");
    const s=`${y}-${m}-01`,e=`${y}-${m}-${String(dIM(yr,mo)).padStart(2,"0")}`;
    let q=supabase.from("valet_bookings").select("*").gte("event_date",s).lte("event_date",e).order("event_date");
    if(propF!=="all") q=q.eq("property",propF);
    const{data}=await q;
    setBk((data||[]).map(b=>({
      ...b,
      event_type:b.event_type||"other",
      priority:b.priority||"normal",
      guest_count:b.guest_count||0,
      special_instructions:b.special_instructions||b.notes||"",
    })));
    setLd(false);
  },[yr,mo,propF]);

  useEffect(()=>{ load(); },[load]);

  const save = async(f)=>{
    const payload = {
      property:f.property, event_date:f.event_date, event_name:f.event_name||null,
      event_type:f.event_type||null, guest_count:f.guest_count||0,
      valets_needed:f.valets_needed, vendor_name:f.vendor_name||null, vendor_phone:f.vendor_phone||null,
      shift_start:f.shift_start||null, shift_end:f.shift_end||null,
      notes:f.special_instructions||null, special_instructions:f.special_instructions||null,
      priority:f.priority||"normal", status:f.status,
      staff_allocation:f.staff_allocation||null, override_reason:f.override_reason||null,
    };
    if(f.id){
      await supabase.from("valet_bookings").update(payload).eq("id",f.id);
    } else {
      await supabase.from("valet_bookings").insert({...payload,created_by:f.created_by});
      const dateFmt=payload.event_date?new Date(payload.event_date).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"";
      const propName=VA[payload.property]?.name||payload.property;
      getSAAndAdminIds(null).then(ids=>notifyMultiple("valet_booking","🚗 New valet booking: "+(payload.event_type||"Event")+" at "+propName+" on "+dateFmt,f.created_by||"system",f.created_by||"admin",ids,payload.property));
    }
    setSF(false); setEB(null); setPD(null); setPProp(null); setPPax(null);
    if(onClearPrefill) onClearPrefill();
    load();
  };

  const del = async(id)=>{ await supabase.from("valet_bookings").delete().eq("id",id); load(); };

  const byDate = {};
  bookings.forEach(b=>{ if(!byDate[b.event_date])byDate[b.event_date]=[]; byDate[b.event_date].push(b); });

  const prevM=()=>{ if(mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1); };
  const nextM=()=>{ if(mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1); };
  const days=dIM(yr,mo); const firstDay=fDM(yr,mo);
  const cells=[]; for(let i=0;i<firstDay;i++)cells.push(null); for(let d=1;d<=days;d++)cells.push(d);
  const mns=lang==="hi"?MN_HI:MN_EN; const dys=lang==="hi"?DY_HI:DY_EN;
  const L=lang==="hi";

  const chipStyle=(b)=>{
    const pri=b.priority||"normal";
    if(pri==="critical") return {bg:"#FBEAE8",c:"#C0392B"};
    if(pri==="high") return {bg:"#FFF7ED",c:"#d97706"};
    const st=STATUS[b.status]||STATUS.planned;
    return {bg:st.bg,c:st.c};
  };

  return(
    <div>
      {/* Controls */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevM} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontFamily:F.d,fontSize:16,fontWeight:700,color:C.maroon,minWidth:160,textAlign:"center"}}>{mns[mo]} {yr}</span>
          <button onClick={nextM} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>
        <button onClick={()=>{setPD(null);setEB(null);setPProp(null);setPPax(null);setSF(true);}}
          style={{padding:"8px 16px",borderRadius:9,border:"none",background:C.maroon,color:"#fff",fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          ➕ {L?"नई बुकिंग":"New Booking"}
        </button>
      </div>

      {/* Property filter */}
      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
        {[{v:"all",l:"All"},{v:"pp",l:"Pushpanjali"},{v:"ex",l:"Exotica"},{v:"mk",l:"Manaktala"},{v:"rs",l:"Restro"}].map(p=>(
          <button key={p.v} onClick={()=>setPF(p.v)}
            style={{padding:"5px 11px",borderRadius:7,border:propF===p.v?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:propF===p.v?C.maroonSoft:C.white,fontFamily:F.b,fontSize:10,fontWeight:propF===p.v?700:400,color:propF===p.v?C.maroon:C.tl,cursor:"pointer"}}>
            {p.v==="all"?"All":((PROPS[p.v]?.icon||"")+" "+VA[p.v].name)}
          </button>
        ))}
        {loading&&<span style={{fontSize:10,color:C.tl,alignSelf:"center",fontFamily:F.b}}>...</span>}
      </div>

      {showForm&&(
        <BookingForm
          init={editB} prefillDate={prefDate} prefillProp={prefProp} prefillPax={prefPax}
          onSave={save}
          onCancel={()=>{setSF(false);setEB(null);setPD(null);setPProp(null);setPPax(null);if(onClearPrefill)onClearPrefill();}}
          user={user} lang={lang}
        />
      )}

      {/* Calendar grid */}
      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:C.maroonSoft,borderBottom:`1px solid ${C.border}`}}>
          {dys.map(d=><div key={d} style={{padding:"7px 0",textAlign:"center",fontSize:10,fontWeight:700,color:C.maroon,fontFamily:F.b}}>{isMobile?d.slice(0,1):d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,idx)=>{
            if(!day)return<div key={`e${idx}`} style={{minHeight:isMobile?46:64,background:"#F9F9F9",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>;
            const ds=toDS(yr,mo,day);
            const dayBks=byDate[ds]||[];
            const isToday=ds===todayStr;
            const isSel=ds===selDate;
            return(
              <div key={day} onClick={()=>setSD(isSel?null:ds)}
                style={{minHeight:isMobile?46:64,padding:isMobile?"3px":"4px 4px 3px 6px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:isSel?C.maroonSoft:C.white,position:"relative"}}>
                <div style={{width:isMobile?18:22,height:isMobile?18:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?C.maroon:"transparent",fontSize:isMobile?9:11,fontWeight:isToday||isSel?700:400,color:isToday?"#fff":isSel?C.maroon:C.text,fontFamily:F.b,marginBottom:2}}>{day}</div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {dayBks.slice(0,isMobile?1:2).map(b=>{
                    const cs=chipStyle(b);
                    return(
                      <div key={b.id} style={{fontSize:isMobile?8:9,fontFamily:F.b,fontWeight:600,padding:"1px 3px",borderRadius:3,background:cs.bg,color:cs.c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                        {EVENT_TYPES[b.event_type]?.icon||PROPS[b.property]?.icon}{!isMobile&&b.event_name?" "+b.event_name.slice(0,7):""}
                      </div>
                    );
                  })}
                  {dayBks.length>(isMobile?1:2)&&<div style={{fontSize:8,color:C.tl,fontFamily:F.b}}>+{dayBks.length-(isMobile?1:2)}</div>}
                </div>
                {!isMobile&&(
                  <button onClick={e=>{e.stopPropagation();setPD(ds);setEB(null);setPProp(null);setPPax(null);setSF(true);}}
                    style={{position:"absolute",top:2,right:2,width:14,height:14,borderRadius:3,border:`1px solid ${C.border}`,background:C.white,color:C.tl,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,opacity:0.6}}>+</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selDate&&(
        <div style={{background:C.white,borderRadius:14,border:`2px solid ${C.maroon}`,padding:14,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon}}>📅 {fmtD(selDate)}</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setPD(selDate);setEB(null);setPProp(null);setPPax(null);setSF(true);}}
                style={{padding:"5px 12px",borderRadius:7,border:"none",background:C.maroon,color:"#fff",fontFamily:F.b,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                ➕ {L?"जोड़ें":"Add"}
              </button>
              <button onClick={()=>setSD(null)} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
          </div>
          {(byDate[selDate]||[]).length===0
            ?<div style={{textAlign:"center",padding:"16px 0",color:C.tl,fontSize:12,fontFamily:F.b}}>No bookings — click ➕ to add one</div>
            :(byDate[selDate]||[]).map(b=>{
              const st=STATUS[b.status]||STATUS.planned;
              const pri=PRIORITIES[b.priority||"normal"]||PRIORITIES.normal;
              const et=EVENT_TYPES[b.event_type||"other"]||EVENT_TYPES.other;
              const sa=b.staff_allocation;
              return(
                <div key={b.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.border}`,borderLeft:`4px solid ${st.c}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:4}}>
                        {et.icon} {b.event_name||"Event"} <span style={{fontSize:10,color:C.tl,fontWeight:400}}>— {VA[b.property]?.name||b.property}</span>
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:st.bg,color:st.c,fontWeight:700,fontFamily:F.b}}>{L?st.lH:st.l}</span>
                        <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:pri.bg,color:pri.c,fontWeight:700,fontFamily:F.b}}>{L?pri.lH:pri.l}</span>
                        {b.guest_count>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>👥 {b.guest_count}</span>}
                        {b.valets_needed>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.maroonSoft,color:C.maroon,fontFamily:F.b}}>👤 {b.valets_needed} valets</span>}
                        {(b.shift_start||b.shift_end)&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:C.bg,color:C.tl,fontFamily:F.b}}>⏰ {fmtT(b.shift_start)}–{fmtT(b.shift_end)}</span>}
                      </div>
                      {sa&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                          {ROLE_ORDER.filter(r=>sa[r]>0).map(r=>{
                            const m=ROLE_META[r];
                            return<span key={r} style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:`${m.color}18`,color:m.color,fontFamily:F.b,fontWeight:600}}>{m.icon} {sa[r]} {r}</span>;
                          })}
                        </div>
                      )}
                      {b.vendor_name&&(
                        <div style={{fontSize:11,color:C.tl,fontFamily:F.b,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                          <span>🏢 {b.vendor_name}</span>
                          {b.vendor_phone&&<a href={`tel:${b.vendor_phone}`} style={{color:C.blue,fontWeight:600,textDecoration:"none"}}>📞 {b.vendor_phone}</a>}
                        </div>
                      )}
                      {b.special_instructions&&(
                        <div style={{background:"#FFFBF0",border:`1px solid #C4956A`,borderRadius:6,padding:"5px 8px",fontSize:10,color:"#C4956A",fontFamily:F.b,marginTop:3}}>
                          📋 {b.special_instructions}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={()=>{setEB(b);setPD(null);setPProp(null);setPPax(null);setSF(true);}} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:11}}>✏️</button>
                      <button onClick={()=>{if(window.confirm("Delete this booking?"))del(b.id);}} style={{padding:"5px 8px",borderRadius:6,border:"none",background:"#FBEAE8",cursor:"pointer",fontSize:11,color:"#C0392B"}}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* Legend */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",padding:"6px 0"}}>
        {Object.entries(STATUS).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:10,height:10,borderRadius:2,background:v.bg,border:`2px solid ${v.c}`}}/>
            <span style={{fontSize:10,fontFamily:F.b,color:C.tl}}>{L?v.lH:v.l}</span>
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:10,height:10,borderRadius:2,background:"#FBEAE8",border:`2px solid #C0392B`}}/>
          <span style={{fontSize:10,fontFamily:F.b,color:C.tl}}>Critical</span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function ValetPlanning({ user, lang }){
  const C = useT();
  const [tab, setTab] = useState("calc");
  const [prefill, setPrefill] = useState(null);
  const L = lang==="hi";

  const tabs = [
    { id:"calc",     i:"📊", l:"Staff Calculator", lH:"स्टाफ कैलकुलेटर" },
    { id:"bookings", i:"📅", l:"Bookings",          lH:"बुकिंग"           },
  ];

  const handleBookThis = (property, pax) => {
    setPrefill({ property, pax });
    setTab("bookings");
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>
          🚗 {L?"वैलेट प्लानिंग":"Valet Planning"}
        </h1>
        <div style={{display:"flex",background:C.maroonSoft,borderRadius:10,padding:3,gap:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"7px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:600,background:tab===t.id?C.maroon:"transparent",color:tab===t.id?"#fff":C.maroon,minHeight:36}}>
              {t.i} {L?t.lH:t.l}
            </button>
          ))}
        </div>
      </div>

      {tab==="calc"&&<StaffCalculator user={user} lang={lang} onBookThis={handleBookThis}/>}
      {tab==="bookings"&&<CalendarView user={user} lang={lang} prefill={prefill} onClearPrefill={()=>setPrefill(null)}/>}
    </div>
  );
}
