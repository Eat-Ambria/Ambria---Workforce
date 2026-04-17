import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";
import Dashboard from "./Dashboard.jsx";
import DutyRoster from "./DutyRoster.jsx";
import LeaveManager from "./LeaveManager.jsx";
import ChemicalGuide from "./ChemicalGuide.jsx";
import AreasView from "./AreasView.jsx";
import TrainingView from "./TrainingView.jsx";
import MembersView from "./MembersView.jsx";
import ValetPlanning from "./ValetPlanning.jsx";
import VendorDirectory from "./VendorDirectory.jsx";


const lnk=document.createElement("link");lnk.href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap";lnk.rel="stylesheet";document.head.appendChild(lnk);




// ═══ TASK DATA — [dept,cat,title,titleHi,areaKey,pri,dur,desc,descHi,time,memberIdx(-1=team)] ═══
const TASK_DEFS = {
h_daily:[
["h","d","Morning Property Walk","प्रॉपर","en","high","30m","Full t","पूरी ट","9:00-9:30",-1],
["h","d","Lawn Mowing - Front","लॉन कट","lw","high","1.5h","Mow fr","आगे लॉ","10:00-12:00",0],
["h","d","Lawn Mowing - Back","लॉन कट","lw","high","1.5h","Mow ba","पीछे ल","10:00-12:00",1],
["h","d","Flower Bed Weeding","क्यारी","gd","high","1.5h","Remove","खरपतवा","10:00-12:00",2],
["h","d","Hedge - Entrance","हेज - ","en","medium","1h","Trim h","प्रवेश","12:00-1:00",0],
["h","d","Potted Plant Care","गमले द","en","medium","1h","Check ","गमले ज","12:00-1:00",2],
["h","d","Evening Watering","शाम सि","lw","high","30m","Second","दूसरी ","5:00-5:30",-1],
],
h_weekly:[
],
h_monthly:[
],
k_daily:[
["k","d","Guest WC Sanitize","गेस्ट ","gw","high","1h","Deep c","पुरुष/","11:30-1:00",0],
["k","d","Villa WC - All 7","विला श","vw","high","1.5h","All 7 ","सभी 7 ","11:30-1:00",1],
],
k_weekly:[
],
k_monthly:[
["k","m","Plumbing Audit","प्लंबि","gw","high","2h","All ta","सभी नल","2:00-4:00",1],
["k","m","Fire Extinguisher","अग्निश","en","high","1h","Expiry","एक्सपा","2:00-3:00",3],
["k","m","Full Stock Audit","स्टॉक ","of","medium","2h","Every ","हर साम","2:00-4:00",4],
],
a_daily:[
["a","d","Morning Briefing","ब्रीफि","of","high","15m","Brief ","प्रमुख","9:00-9:15",0],
["a","d","Attendance","हाज़िर","of","high","15m","Record","सभी हा","9:15-9:30",0],
["a","d","Morning Inspect","निरीक्","en","high","45m","Walk p","प्रॉपर","9:30-10:15",0],
],
a_weekly:[
],
a_monthly:[
["a","m","Safety Audit","सुरक्ष","en","high","1.5h","Fire e","फ़ायर।","2:00-3:30",0],
["a","m","Insurance/License","बीमा/ल","of","high","1h","Renewa","नवीनीक","3:30-4:30",0],
["a","m","Emergency Drill","आपातका","en","high","1h","Fire e","अग्नि ","2:00-3:00",0],
["a","m","Compliance","अनुपाल","of","high","1h","NOC, h","NOC, स","4:00-5:00",0],
["a","m","Boundary Check","बाउंड्","pk","medium","1h","Cracks","दरारें","10:00-11:00",0],
["a","m","Emergency Contacts","आपातका","of","medium","30m","Update","नंबर अ","11:30-12:00",0],
["a","m","Monthly to Vicky","विकी क","of","high","1h","Full s","पूरी स","5:00-6:00",0],
],
s_daily:[
["s","d","Morning Gate & CCTV Check","सुबह ग","en","high","30m","Check ","सभी गे","9:00-9:30",0],
["s","d","Property Perimeter Walk","प्रॉपर","en","high","45m","Walk f","पूरी ब","9:30-10:15",0],
["s","d","Visitor/Vendor Entry Log","विजिटर","en","high","30m","Mainta","विजिटर","10:15-10:45",0],
["s","d","Fire Equipment Check","अग्नि ","en","high","30m","Check ","अग्निश","3:00-3:30",0],
["s","d","Evening Lockup & Handover","शाम लॉ","en","high","30m","Lock n","गैर-ज़","5:30-6:00",0],
],
s_weekly:[
["s","w","Full CCTV System Audit","पूरी स","en","high","1.5h","Test e","हर कैम","9:00-10:30",0],
["s","w","Fire Safety Equipment","अग्नि ","en","high","1h","Check ","एक्सटि","2:00-3:00",0],
["s","w","DG Set & Power Backup","डीजी स","en","high","30m","Test r","जनरेटर","3:00-3:30",0],
["s","w","Night Guard Report Review","नाइट ग","en","medium","30m","Review","नाइट श","10:30-11:00",0],
],
s_monthly:[
]};

const CAT_MAP={d:"daily",w:"weekly",m:"monthly"};
const DEPT_MAP={h:"h",k:"k",a:"a",s:"s"};

function buildTasks(pid){
  let n=0;const t=[];const P=PROPS[pid];if(!P)return t;const D=P.depts,A=P.areas;
  const fa=(k)=>A.find(a=>a.id===k||a.n.toLowerCase().includes(k))||A[0];

  const allDefs=[...TASK_DEFS.h_daily,...TASK_DEFS.h_weekly,...TASK_DEFS.h_monthly,...TASK_DEFS.k_daily,...TASK_DEFS.k_weekly,...TASK_DEFS.k_monthly,...TASK_DEFS.a_daily,...TASK_DEFS.a_weekly,...TASK_DEFS.a_monthly,...TASK_DEFS.s_daily,...TASK_DEFS.s_weekly,...TASK_DEFS.s_monthly];

  allDefs.forEach(([dept,cat,ti,tiH,aKey,pri,dur,desc,dH,time,mIdx])=>{
    if(!D[dept])return;
    const members=D[dept].m;
    const area=fa(aKey);
    const catFull=CAT_MAP[cat];
    const isTeam=mIdx===-1;

    if(isTeam){
      members.forEach(m=>{t.push({id:pid+"_"+(++n),prop:pid,dept,cat:catFull,title:"\u{1F465} "+ti,titleHi:"\u{1F465} "+tiH,area:area.id,priority:pri,dur,desc,descHi:dH,timeBlock:time,assignedTo:m.id,assigneeName:m.n,status:"pending",notes:"",completedAt:null,completedBy:"",photos:[],isTeam:true});});
    } else {
      const m=members[mIdx%members.length];
      if(!m)return;
      t.push({id:pid+"_"+(++n),prop:pid,dept,cat:catFull,title:ti,titleHi:tiH,area:area.id,priority:pri,dur,desc,descHi:dH,timeBlock:time,assignedTo:m.id,assigneeName:m.n,status:"pending",notes:"",completedAt:null,completedBy:"",photos:[],isTeam:false});
    }
  });
  return t;
}

const ALL_T={};Object.keys(PROPS).forEach(k=>{ALL_T[k]=buildTasks(k);});
const td=new Date();const dN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];const mN=["January","February","March","April","May","June","July","August","September","October","November","December"];
function dIn(y,m){return new Date(y,m+1,0).getDate();}function gFD(y,m){return new Date(y,m,1).getDay();}

// ═══ SUPABASE HELPERS ═══
const syncTask=(task)=>{const todayStr=new Date().toISOString().split("T")[0];supabase.from("tasks").upsert({id:"task_"+task.id+"_"+todayStr,property:task.prop,task_date:todayStr,status:task.status,notes:task.notes||null,completed_at:task.completedAt||null,completed_by:task.completedBy||null},{onConflict:"id"}).then(({error})=>{if(error)console.error("task sync:",error.message);});};

// ═══ UI ═══
function Bdg({children,color=C.tl,bg=C.border+"88"}){return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:bg,color,whiteSpace:"nowrap",fontFamily:F.b}}>{children}</span>;}
function SL2({s,L}){const m={pending:{l:L.pending,c:C.yellow,b:C.yBg},in_progress:{l:L.inProgress,c:C.blue,b:C.bBg},completed:{l:L.done,c:C.green,b:C.gBg},issue:{l:L.issue,c:C.red,b:C.rBg}};const v=m[s]||m.pending;return <Bdg color={v.c} bg={v.b}>{v.l}</Bdg>;}
function SearchSelect({value,onChange,options,style:cs,placeholder}){
  const[open,setOpen]=useState(false);const[q,setQ]=useState("");const ref=useRef(null);
  useEffect(()=>{const h=(e)=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setQ("");}};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const fil=options.filter(o=>String(o.l).toLowerCase().includes(q.toLowerCase()));
  const cur=options.find(o=>String(o.v)===String(value));
  return(<div ref={ref} style={{position:"relative",...cs}}>
    <button onClick={()=>{setOpen(p=>!p);setQ("");}} style={{width:"100%",minWidth:80,padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontFamily:F.b,fontSize:12,color:C.text,cursor:"pointer",outline:"none",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur?.l||placeholder||"Select..."}</span>
      <span style={{fontSize:9,color:C.tl,flexShrink:0}}>▾</span>
    </button>
    {open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:9999,minWidth:"100%",background:C.white,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",marginTop:2,overflow:"hidden"}}>
      <div style={{padding:5,borderBottom:`1px solid ${C.border}`}}><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..." style={{width:"100%",padding:"5px 7px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:11,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{maxHeight:180,overflowY:"auto"}}>{fil.map(o=><div key={o.v} onMouseDown={()=>{onChange(o.v);setOpen(false);setQ("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,fontFamily:F.b,background:String(o.v)===String(value)?C.maroonSoft:"transparent",color:String(o.v)===String(value)?C.maroon:C.text,fontWeight:String(o.v)===String(value)?600:400}}>{o.l}</div>)}
      {fil.length===0&&<div style={{padding:10,fontSize:11,color:C.tl,textAlign:"center"}}>No results</div>}
      </div>
    </div>}
  </div>);
}
function Sel2({value,onChange,options,style:cs}){return <SearchSelect value={value} onChange={onChange} options={options} style={cs}/>;}
function Btn2({children,onClick,primary,small,style:cs}){return <button onClick={onClick} style={{padding:small?"6px 12px":"10px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:small?11:13,fontWeight:600,background:primary?C.maroon:C.bg,color:primary?C.white:C.text,...cs}}>{children}</button>;}

// ═══ LOGIN ═══
function LoginScreen({onLogin,lang,setLang}){
  const L=LANGS[lang];const[u,sU]=useState("");const[p,sP]=useState("");const[err,sE]=useState("");const[sh,sSh]=useState(false);const[rem,setRem]=useState(false);const[loading,setLoading]=useState(false);
  const go=async()=>{setLoading(true);sE("");try{const{data,error}=await supabase.from("users").select("*").eq("username",u.trim()).eq("password",p).single();if(error||!data){sE(L.invalidLogin);}else{onLogin(data,rem);}}catch(e){sE(L.invalidLogin);}finally{setLoading(false);}};
  return(<div style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight},#2D1520)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.b,padding:20}}>
    <div style={{width:"100%",maxWidth:380,background:C.white,borderRadius:20,padding:36,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button onClick={()=>setLang(lang==="en"?"hi":"en")} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:11,cursor:"pointer",fontWeight:600,color:C.maroon}}>{lang==="en"?"हिंदी":"English"}</button></div>
      <div style={{textAlign:"center",marginBottom:28}}><div style={{width:60,height:60,borderRadius:"50%",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:F.d,color:C.white,fontSize:30,fontWeight:700,marginBottom:10}}>A</div><h1 style={{fontFamily:F.d,fontSize:26,fontWeight:700,color:C.maroon,margin:"0 0 4px"}}>Ambria</h1></div>
      <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,marginBottom:5,display:"block"}}>{L.username}</label><input type="text" value={u} onChange={e=>sU(e.target.value)} placeholder={L.enterUser} onKeyDown={e=>{if(e.key==="Enter")go();}} style={{width:"100%",padding:"12px 16px",borderRadius:10,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:14,outline:"none",boxSizing:"border-box",background:C.bg}}/></div>
      <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,marginBottom:5,display:"block"}}>{L.password}</label><div style={{position:"relative"}}><input type={sh?"text":"password"} value={p} onChange={e=>sP(e.target.value)} placeholder={L.enterPass} onKeyDown={e=>{if(e.key==="Enter")go();}} style={{width:"100%",padding:"12px 16px",paddingRight:44,borderRadius:10,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:14,outline:"none",boxSizing:"border-box",background:C.bg}}/><button onClick={()=>sSh(!sh)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:16}}>{sh?"🙈":"👁️"}</button></div></div>
      <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,cursor:"pointer",fontSize:12,color:C.tl}}><div onClick={()=>setRem(!rem)} style={{width:18,height:18,borderRadius:4,border:`2px solid ${rem?C.maroon:C.border}`,background:rem?C.maroon:C.white,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{rem&&<span style={{color:C.white,fontSize:11,fontWeight:700}}>✓</span>}</div>{lang==="hi"?"पासवर्ड याद रखें":"Remember me"}</label>
      {err&&<div style={{background:C.rBg,color:C.red,padding:"10px",borderRadius:8,fontSize:12,marginBottom:14}}>{err}</div>}
      <button onClick={go} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:loading?"#9A2E42":C.maroon,color:C.white,fontFamily:F.b,fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.8:1}}>{loading?"...":L.login}</button>
    </div></div>);
}

// ═══ PHOTO ═══
function PhotoUp({photos,onUp,onRetake,disabled,L}){
  const ref=useRef(null);
  const hndl=(e)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{onUp({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),date:new Date().toLocaleDateString("en-IN")});};r.readAsDataURL(f);e.target.value="";};
  const has=photos?.length>0;
  return(<div>
    {!has?(<div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={()=>ref.current?.click()} disabled={disabled} style={{padding:"10px 16px",borderRadius:10,border:`2px dashed ${!disabled?C.accent:C.border}`,background:!disabled?"#FFF7ED":C.bg,cursor:disabled?"default":"pointer",fontFamily:F.b,fontSize:12,fontWeight:700,color:!disabled?C.accent:C.tl,opacity:disabled?0.5:1}}>📸 {L.uploadPhoto}</button>{!disabled&&<span style={{fontSize:10,color:C.red,fontWeight:600}}>⚠️ {L.photoNeeded}</span>}</div>)
    :(<div><div style={{display:"inline-flex",flexDirection:"column",borderRadius:12,overflow:"hidden",border:`2px solid ${C.green}`}}><img src={photos[0].data} alt="" style={{width:120,height:120,objectFit:"cover"}}/><div style={{background:"rgba(0,0,0,0.75)",color:C.white,padding:"4px 8px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:9}}>📸 {photos[0].time}</span><span style={{fontSize:8}}>{photos[0].date}</span></div></div>
      {!disabled&&<div style={{marginTop:8}}><button onClick={()=>{onRetake();setTimeout(()=>ref.current?.click(),100);}} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.yellow}`,background:C.yBg,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:700,color:C.yellow}}>🔄 {L.retakePhoto}</button></div>}</div>)}
    <input ref={ref} type="file" accept="image/*" capture="environment" onChange={hndl} style={{display:"none"}}/>
  </div>);
}

// ═══ TASK CARD ═══
function TC({task:t,uTask,delTask,depts,areas,user:u,allM,L,lang}){
  const[sC,setSC]=useState(false);const[cT,setCT]=useState("");const[sS,setSS]=useState(false);const[sE,setSE]=useState(false);const[eA,setEA]=useState(t.assignedTo);
  const dn=t.status==="completed",iss=t.status==="issue";
  const isA=u.role==="sa"||u.role==="a";const canA=isA||t.assignedTo===u.id;
  const ti=lang==="hi"&&t.titleHi?t.titleHi:t.title;const de=lang==="hi"&&t.descHi?t.descHi:t.desc;
  const hDn=(e)=>{e.stopPropagation();if(dn){uTask(t.id,{status:"pending",completedAt:null,completedBy:""});return;}if(!isA&&(!t.photos||t.photos.length===0)){setSS(true);return;}uTask(t.id,{status:"completed",completedAt:new Date().toISOString(),completedBy:u.name});};
  const subC=()=>{if(!cT.trim())return;const st=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});uTask(t.id,{notes:(t.notes?t.notes+"\n":"")+`[${st}] ${u.name}: ${cT.trim()}`});setCT("");};
  const area=areas.find(a=>a.id===t.area);const dept=depts[t.dept];
  return(<div style={{background:dn?C.gBg:iss?C.rBg:C.white,borderRadius:12,border:`1px solid ${dn?"#b8dcc8":iss?"#f0c8c4":C.border}`,overflow:"hidden",borderLeft:`4px solid ${({daily:C.blue,weekly:C.green,monthly:C.maroon})[t.cat]||C.tl}`}}>
    <div style={{display:"flex",alignItems:"center"}}>
      {canA&&<button onClick={hDn} style={{width:46,minHeight:60,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:dn?C.green:"transparent",flexShrink:0,borderRight:`1px solid ${dn?"#5aad7a":C.border}`}}><div style={{width:22,height:22,borderRadius:6,border:dn?"none":`2.5px solid ${C.border}`,background:dn?"rgba(255,255,255,0.3)":C.white,display:"flex",alignItems:"center",justifyContent:"center"}}>{dn&&<span style={{color:C.white,fontSize:13,fontWeight:700}}>✓</span>}</div></button>}
      <span style={{width:4,alignSelf:"stretch",background:{high:C.accent,medium:C.yellow,low:C.green}[t.priority]||C.tl,flexShrink:0}}/>
      <div style={{flex:1,padding:"8px 10px",minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:dn?C.green:C.text,textDecoration:dn?"line-through":"none",marginBottom:3}}>{ti}</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:3}}><span style={{fontSize:10,color:dn?"#5a9a72":C.tl}}>{area?.i} {area?.n}</span><span style={{padding:"2px 7px",borderRadius:5,background:C.bBg,color:C.blue,fontSize:10,fontWeight:700}}>⏱{t.dur}</span></div>
        <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:6,background:dn?"#b8dcc840":"#FFF7ED",border:`1px solid ${dn?"#b8dcc8":"#f0dcc8"}`}}>
          <span style={{fontSize:10}}>{t.isTeam?"👥":"🕐"}</span><span style={{fontSize:10,fontWeight:700,color:dn?C.green:C.accent}}>{t.timeBlock}</span>
          {t.isTeam&&<span style={{fontSize:9,fontWeight:600,color:C.blue,background:C.bBg,padding:"1px 5px",borderRadius:4}}>{L.teamTask}</span>}
        </div>
        {dn&&t.completedAt&&<div style={{fontSize:9,color:C.green,marginTop:2}}>✅ {new Date(t.completedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} - {t.completedBy}</div>}
        {t.photos?.length>0&&<div style={{fontSize:9,color:C.blue,marginTop:1}}>📸 photo</div>}
        {t.notes&&<div style={{fontSize:9,color:C.tl,marginTop:1,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:250}}>💬 {t.notes.split("\n").pop()}</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:3,padding:"6px",flexShrink:0}}>
        <Bdg color={dept?.c} bg={dept?.bg}>{t.assigneeName}</Bdg><SL2 s={t.status} L={L}/>
        {canA&&!dn&&<button onClick={()=>uTask(t.id,{status:iss?"pending":"issue"})} style={{width:24,height:24,borderRadius:6,border:"none",cursor:"pointer",background:iss?C.red:C.bg,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>⚠️</button>}
        <button onClick={()=>setSC(!sC)} style={{width:24,height:24,borderRadius:6,border:"none",cursor:"pointer",background:sC?C.maroonSoft:C.bg,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>💬</button>
        <button onClick={()=>setSS(!sS)} style={{width:24,height:24,borderRadius:6,border:"none",cursor:"pointer",background:sS?C.maroonSoft:C.bg,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>📖</button>
        {isA&&<button onClick={()=>setSE(!sE)} style={{width:24,height:24,borderRadius:6,border:"none",cursor:"pointer",background:sE?C.maroonSoft:C.bg,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>}
      </div>
    </div>
    {sS&&<div style={{padding:"0 10px 10px 50px",borderTop:`1px solid ${dn?"#b8dcc8":C.border}`}}><div style={{margin:"8px 0",padding:10,background:C.bg,borderRadius:8,fontSize:12,lineHeight:1.7}}><div style={{fontWeight:700,fontSize:10,color:C.maroon,marginBottom:3}}>{L.sop}</div>{de}</div><PhotoUp photos={t.photos||[]} onUp={(p)=>uTask(t.id,{photos:[p]})} onRetake={()=>uTask(t.id,{photos:[]})} disabled={dn} L={L}/></div>}
    {sC&&<div style={{padding:"0 10px 10px 50px",borderTop:sS?"none":`1px solid ${dn?"#b8dcc8":C.border}`}}>
      {t.notes&&<div style={{margin:"6px 0",padding:8,background:C.bg,borderRadius:8,fontSize:10,lineHeight:1.8,whiteSpace:"pre-line",maxHeight:80,overflowY:"auto"}}>{t.notes}</div>}
      <div style={{display:"flex",gap:6,marginTop:6}}><input type="text" placeholder={L.comment} value={cT} onChange={e=>setCT(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")subC();}} style={{flex:1,padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/><Btn2 primary small onClick={subC}>{L.send}</Btn2></div></div>}
    {sE&&isA&&<div style={{padding:"8px 10px 8px 50px",borderTop:`1px solid ${C.border}`,background:C.maroonSoft}}>
      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
        <SearchSelect value={eA} onChange={setEA} options={allM?.map(m=>({v:m.id,l:m.n}))||[]} style={{minWidth:120}}/>
        <Btn2 primary small onClick={()=>{const nm=allM?.find(m=>m.id===eA);if(nm)uTask(t.id,{assignedTo:eA,assigneeName:nm.n});setSE(false);}}>{L.reassign}</Btn2>
        <SearchSelect value={t.status} onChange={v=>uTask(t.id,{status:v})} options={[{v:"pending",l:"⏳ Pending"},{v:"in_progress",l:"🔄 In Progress"},{v:"completed",l:"✅ Done"},{v:"issue",l:"⚠️ Issue"}]} style={{minWidth:100}}/>
        {delTask&&<button onClick={()=>delTask(t.id)} style={{padding:"5px 8px",borderRadius:8,border:"none",background:C.rBg,color:C.red,fontFamily:F.b,fontSize:10,fontWeight:600,cursor:"pointer"}}>🗑️</button>}
      </div></div>}
  </div>);
}

// ═══ ADD TASK ═══
function AddTF({prop,onAdd,onClose,L}){
  const[f,sF]=useState({title:"",titleHi:"",dept:Object.keys(prop?.depts||{})[0]||"h",area:prop?.areas?.[0]?.id,assignedTo:"",priority:"medium",cat:"daily",dur:"1h",desc:"",descHi:"",timeBlock:"9:00-10:00"});
  const ms=prop?.depts?.[f.dept]?.m||[];
  const sub=()=>{if(!f.title||!f.assignedTo)return;const m=ms.find(x=>x.id===f.assignedTo);onAdd({id:`${prop.id}_c_${Date.now()}`,prop:prop.id,...f,assigneeName:m?.n||"?",status:"pending",notes:"",completedAt:null,completedBy:"",photos:[],isTeam:false});onClose();};
  return(<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:16}}>
    <div style={{fontFamily:F.d,fontSize:16,fontWeight:700,color:C.maroon,marginBottom:12}}>➕ {L.addTask}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <input placeholder={L.taskTitle+" (EN)"} value={f.title} onChange={e=>sF({...f,title:e.target.value})} style={{gridColumn:"1/-1",padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,outline:"none"}}/>
      <input placeholder={L.taskTitle+" (HI)"} value={f.titleHi} onChange={e=>sF({...f,titleHi:e.target.value})} style={{gridColumn:"1/-1",padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,outline:"none"}}/>
      <SearchSelect value={f.dept} onChange={v=>sF({...f,dept:v,assignedTo:""})} options={Object.entries(prop?.depts||{}).map(([k,d])=>({v:k,l:`${d.i} ${d.n}`}))} style={{width:"100%"}}/>
      <SearchSelect value={f.assignedTo} onChange={v=>sF({...f,assignedTo:v})} options={[{v:"",l:L.selectPerson},...ms.map(m=>({v:m.id,l:m.n}))]} style={{width:"100%"}}/>
      <SearchSelect value={f.area} onChange={v=>sF({...f,area:v})} options={(prop?.areas||[]).map(a=>({v:a.id,l:`${a.i} ${a.n}`}))} style={{width:"100%"}}/>
      <SearchSelect value={f.priority} onChange={v=>sF({...f,priority:v})} options={[{v:"high",l:"🔴 High"},{v:"medium",l:"🟡 Medium"},{v:"low",l:"🟢 Low"}]} style={{width:"100%"}}/>
      <SearchSelect value={f.cat} onChange={v=>sF({...f,cat:v})} options={[{v:"daily",l:L.daily},{v:"weekly",l:L.weekly},{v:"monthly",l:L.monthly}]} style={{width:"100%"}}/>
      <input placeholder="Time" value={f.timeBlock} onChange={e=>sF({...f,timeBlock:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}/>
      <textarea placeholder={L.desc+" (EN)"} value={f.desc} onChange={e=>sF({...f,desc:e.target.value})} style={{gridColumn:"1/-1",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:40,resize:"vertical"}}/>
    </div>
    <div style={{display:"flex",gap:8,marginTop:10}}><Btn2 primary onClick={sub}>{L.save}</Btn2><Btn2 onClick={onClose}>{L.cancel}</Btn2></div>
  </div>);
}

// ═══ SIDEBAR ═══
function Sidebar({view,setView,user:u,effectiveUser,onLogout,lang,setLang,nC,setShowN,L,pm,setPM,pAs,setPAs,allDbUsers,dirs,aP}){
  const eU=effectiveUser||u;
  const isSA=u.role==="sa";const isEffAdmin=eU.role==="sa"||eU.role==="a"||!!findAT(eU);const isA=isEffAdmin;
  console.log("USER:",u.id,u.role,u.name);
  // Pending count for assigned tasks — when previewing, show previewed user's count
  const pendDirs=isSA&&!pm?dirs.filter(d=>d.status==="approval_requested"||d.status==="approval_req").length:dirs.filter(d=>d.to===eU.id&&(d.status==="sent"||d.status==="rejected"||d.status==="approved")).length;
  const nav=isA?[{id:"dashboard",i:"📊",l:L.dashboard},{id:"tasks",i:"✅",l:"Daily Tasks"},{id:"directives",i:"📝",l:L.directives,badge:pendDirs},{id:"team",i:"👥",l:L.team},{id:"areas",i:"🏗️",l:L.areas},{id:"att",i:"🕐",l:L.attendance},{id:"roster",i:"🗓️",l:L.roster||"Duty Roster"},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:"Training"},{id:"chemicals",i:"🧪",l:L.chemCalc||"Chemicals"},{id:"valet",i:"🚗",l:L.valetPlan||"Valet Planning"},{id:"vendors",i:"📞",l:L.vendorDir||"Vendors"}]:[{id:"mytasks",i:"✅",l:L.myTasks},{id:"att",i:"🕐",l:L.attendance},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:"Training"}];
  if(isSA&&!pm)nav.push({id:"members",i:"👤",l:L.members||"Members"});
  console.log("NAV ITEMS:",nav.map(n=>n.id));
  const rL={sa:L.superAdmin,a:L.admin,e:L.staff};
  return(<div style={{width:185,background:C.white,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"fixed",left:0,top:0,zIndex:50}}>
    <div style={{padding:"14px 12px",borderBottom:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.d,color:C.white,fontSize:17,fontWeight:700}}>A</div><div style={{fontFamily:F.d,fontSize:17,fontWeight:700,color:C.maroon}}>Ambria</div></div>
      {isA&&<button onClick={()=>setShowN(true)} style={{marginTop:8,width:"100%",padding:"5px 8px",borderRadius:8,border:`1px solid ${nC>0?C.accent:C.border}`,background:nC>0?"#FFF7ED":C.bg,cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:nC>0?C.accent:C.tl}}>🔔 {L.notif}{nC>0&&<span style={{background:C.red,color:C.white,borderRadius:10,padding:"0 5px",fontSize:9,marginLeft:4}}>{nC}</span>}</button>}
    </div>
    <div style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:2}}>
      {nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:view===n.id?600:400,background:view===n.id?C.maroonSoft:"transparent",color:view===n.id?C.maroon:C.tl,textAlign:"left",position:"relative"}}>
        <span style={{fontSize:13}}>{n.i}</span><span style={{flex:1}}>{n.l}</span>
        {n.badge>0&&<span style={{background:C.red,color:C.white,borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:700,minWidth:16,textAlign:"center"}}>{n.badge}</span>}
      </button>)}
      {isSA&&<div style={{marginTop:6,padding:8,background:pm?C.bBg:C.bg,borderRadius:8,border:`1px solid ${pm?C.blue:C.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:pm?6:0}}>
          <span style={{fontSize:9,fontWeight:700,color:pm?C.blue:C.tl}}>👁️ {pm?L.previewOff:L.preview}</span>
          <button onClick={()=>{if(pm){setPM(false);setPAs("");setView("dashboard");}else{setPM(true);setView("dashboard");}}} style={{width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:pm?C.blue:C.border,position:"relative"}}><div style={{width:16,height:16,borderRadius:"50%",background:C.white,position:"absolute",top:2,left:pm?18:2,transition:"left 0.2s"}}/></button>
        </div>
        {pm&&<SearchSelect value={pAs} onChange={v=>{
          const pu=allDbUsers.find(u=>u.id===v);
          setPAs(v);
          const puIsAdmin=pu&&(pu.role==="a"||ADMIN_TARGETS.some(t=>t.id===v));
          setView(puIsAdmin?"dashboard":"mytasks");
        }} options={[
          ...(allDbUsers.filter(u=>u.role==="a"||ADMIN_TARGETS.some(t=>t.id===u.id)).map(u=>({v:u.id,l:`👑 ${u.name} — ${PROPS[u.property]?.sn||u.property||"All"}`}))),
          ...(allDbUsers.filter(u=>u.role==="e"&&!ADMIN_TARGETS.some(t=>t.id===u.id)).map(u=>({v:u.id,l:`${u.name} — ${PROPS[u.property]?.sn||u.property||"?"}`})))
        ]} style={{width:"100%",marginTop:3}} placeholder="Select user to preview..."/> }
      </div>}
    </div>
    <div style={{padding:"8px 6px",borderTop:`1px solid ${C.border}`}}>
      <button onClick={()=>setLang(lang==="en"?"hi":"en")} style={{width:"100%",padding:"5px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:10,cursor:"pointer",fontWeight:600,color:C.maroon,marginBottom:5}}>🌐 {lang==="en"?L.hi:L.en}</button>
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 6px",background:C.bg,borderRadius:8,marginBottom:5}}><div style={{width:24,height:24,borderRadius:"50%",background:C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:10}}>{u.name[0]}</div><div><div style={{fontSize:10,fontWeight:600}}>{u.name}</div><div style={{fontSize:8,color:C.tl}}>{rL[u.role]}</div></div></div>
      <button onClick={onLogout} style={{width:"100%",padding:"6px",borderRadius:8,border:`1px solid ${C.red}`,background:C.rBg,color:C.red,fontFamily:F.b,fontSize:10,fontWeight:600,cursor:"pointer"}}>🚪 {L.logout}</button>
    </div></div>);
}

function NPanel({ns,onClose,onClr,L,onClickNotif}){return(<div style={{position:"fixed",top:0,right:0,width:320,height:"100vh",background:C.white,boxShadow:"-4px 0 20px rgba(0,0,0,0.1)",zIndex:100,display:"flex",flexDirection:"column"}}><div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon}}>🔔 {L.notif}</span><div style={{display:"flex",gap:4}}><Btn2 small onClick={onClr}>{L.clearAll}</Btn2><button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✕</button></div></div>
  <div style={{flex:1,overflowY:"auto",padding:8}}>{ns.length===0?<div style={{textAlign:"center",padding:24,color:C.tl,fontSize:11}}>{L.noNotif}</div>:ns.map((n,i)=>{
    const isApproval=n.type==="approval";const bgC=isApproval?"#FFF7ED":n.type==="issue"?C.rBg:C.gBg;const txC=isApproval?C.accent:n.type==="issue"?C.red:C.green;
    return(<div key={i} onClick={()=>{if(isApproval&&onClickNotif){onClickNotif(n);onClose();}}} style={{padding:10,borderRadius:8,background:bgC,marginBottom:5,cursor:isApproval?"pointer":"default",border:isApproval?`2px solid ${C.accent}`:"none"}}>
      <div style={{fontSize:10,fontWeight:600,color:txC}}>{isApproval?"🔔 Approval Request":n.type==="issue"?"⚠️":"✅"} {n.task}</div>
      <div style={{fontSize:9,marginTop:2}}>{n.by} · {n.prop} · {n.time}</div>
      {isApproval&&<div style={{fontSize:9,color:C.accent,marginTop:3,fontWeight:700}}>👆 Tap to review & approve</div>}
    </div>);})}</div></div>);}

const TP_GUARDS={
  pp:[{id:"3p_pp_d1",label:"Day Guard 1",shift:"day"},{id:"3p_pp_d2",label:"Day Guard 2",shift:"day"},{id:"3p_pp_n1",label:"Night Guard 1",shift:"night"},{id:"3p_pp_n2",label:"Night Guard 2",shift:"night"}],
  ex:[{id:"3p_ex_d1",label:"Kitchen Day Guard",shift:"day"},{id:"3p_ex_n1",label:"Night Guard 1",shift:"night"},{id:"3p_ex_n2",label:"Night Guard 2",shift:"night"}],
  mk:[{id:"3p_mk_n1",label:"Night Guard",shift:"night"}],
  rs:[{id:"3p_rs_n1",label:"Night Guard",shift:"night"}],
};

function AttView({user:u,att,setAtt,prop,L}){
  const isA=u.role==="sa"||u.role==="a";const tk=td.toISOString().split("T")[0];const mr=att.find(a=>a.uid===u.id&&a.date===tk);
  const allM=Object.entries(prop?.depts||{}).flatMap(([d,dept])=>dept.m.map(m=>({...m,dn:dept.n,dc:dept.c})));
  const attRef=useRef(null);const tpSlots=TP_GUARDS[prop.id]||[];
  const[tpNames,setTpNames]=useState({});
  useEffect(()=>{
    supabase.from("attendance").select("*").eq("date",tk).then(({data})=>{
      if(data&&data.length>0){
        const nm={};data.filter(r=>r.user_id.startsWith("3p_")).forEach(r=>{nm[r.user_id]=r.user_name||"";});
        if(Object.keys(nm).length)setTpNames(p=>({...p,...nm}));
        setAtt(data.map(r=>({uid:r.user_id,name:r.user_name,date:r.date,ci:r.check_in,co:r.check_out,ciPhoto:null,coPhoto:null})));
      }
    });
  },[prop.id]);
  const doCheckIn=()=>{attRef.current?.click();};
  const onPhoto=(e)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async(ev)=>{const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});const ph=ev.target.result;if(!mr){const{error}=await supabase.from("attendance").insert({user_id:u.id,user_name:u.name,date:tk,check_in:tm});if(!error)setAtt(p=>[...p,{uid:u.id,name:u.name,date:tk,ci:tm,co:null,ciPhoto:ph,coPhoto:null}]);}else if(!mr.co){const{error}=await supabase.from("attendance").update({check_out:tm}).eq("user_id",u.id).eq("date",tk);if(!error)setAtt(p=>p.map(a=>a.uid===u.id&&a.date===tk?{...a,co:tm,coPhoto:ph}:a));}};r.readAsDataURL(f);e.target.value="";};
  const tpMark=async(slot,present)=>{
    const name=(tpNames[slot.id]||"").trim()||slot.label;
    const ex=att.find(a=>a.uid===slot.id&&a.date===tk);
    if(present){if(ex){await supabase.from("attendance").update({user_name:name,check_in:"present"}).eq("user_id",slot.id).eq("date",tk);setAtt(p=>p.map(a=>a.uid===slot.id&&a.date===tk?{...a,name,ci:"present"}:a));}else{const{error}=await supabase.from("attendance").insert({user_id:slot.id,user_name:name,date:tk,check_in:"present"});if(!error)setAtt(p=>[...p,{uid:slot.id,name,date:tk,ci:"present",co:null,ciPhoto:null,coPhoto:null}]);}}
    else{await supabase.from("attendance").delete().eq("user_id",slot.id).eq("date",tk);setAtt(p=>p.filter(a=>!(a.uid===slot.id&&a.date===tk)));}
  };
  return(<div><h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:"0 0 12px"}}>🕐 {L.attendance} - {prop.sn}</h1>
    <input ref={attRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{display:"none"}}/>
    {(u.role==="e"||u.role==="a")&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:16}}><div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{L.today} - {tk}</div>
      {!mr?<Btn2 primary onClick={doCheckIn}>📸📍 {L.checkIn} (Photo)</Btn2>
      :!mr.co?<div style={{display:"flex",gap:8,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>✅ {mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover"}}/>}<Btn2 onClick={doCheckIn} style={{background:C.yBg,color:C.yellow}}>📸🚪 {L.checkOut}</Btn2></div>
      :<div style={{display:"flex",gap:6,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>In:{mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}<Bdg color={C.blue} bg={C.bBg}>Out:{mr.co}</Bdg>{mr.coPhoto&&<img src={mr.coPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}</div>}</div>}
    {isA&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}><h3 style={{fontFamily:F.d,fontSize:14,margin:"0 0 10px",color:C.maroon}}>{tk}</h3>{allM.map(m=>{const r=att.find(a=>a.uid===m.id&&a.date===tk);return(<div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:r?C.gBg:C.bg,borderRadius:8,marginBottom:4}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:m.dc||C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:9,fontWeight:700}}>{m.n[0]}</div>
      <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{m.n}</div></div>
      {r?<div style={{display:"flex",gap:3,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>{r.ci}</Bdg>{r.ciPhoto&&<img src={r.ciPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}{r.co?<><Bdg color={C.blue} bg={C.bBg}>{r.co}</Bdg>{r.coPhoto&&<img src={r.coPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}</>:<Bdg color={C.yellow} bg={C.yBg}>Working</Bdg>}</div>:<Bdg color={C.red} bg={C.rBg}>{L.notCheckedIn}</Bdg>}
    </div>);})}</div>}
    {isA&&tpSlots.length>0&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.purple}`}}>
      <h3 style={{fontFamily:F.d,fontSize:14,margin:"0 0 12px",color:C.purple}}>🛡️ 3rd Party Guards</h3>
      {tpSlots.map(slot=>{const rec=att.find(a=>a.uid===slot.id&&a.date===tk);const isP=!!rec?.ci;return(<div key={slot.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",background:isP?C.gBg:C.bg,borderRadius:8,marginBottom:6}}>
        <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,fontWeight:700,background:slot.shift==="day"?"#FFF7ED":"#EDE9FE",color:slot.shift==="day"?C.accent:C.purple,flexShrink:0,whiteSpace:"nowrap"}}>{slot.shift==="day"?"🌅 Day":"🌙 Night"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,color:C.tl,marginBottom:3}}>{slot.label}</div>
          <input value={tpNames[slot.id]||""} onChange={e=>setTpNames(p=>({...p,[slot.id]:e.target.value}))} placeholder="Guard name..." style={{padding:"3px 7px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:11,width:"100%",boxSizing:"border-box",outline:"none"}}/>
        </div>
        <button onClick={()=>tpMark(slot,true)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${isP?C.green:C.border}`,background:isP?C.green:C.bg,color:isP?C.white:C.tl,fontFamily:F.b,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>✓ Present</button>
        <button onClick={()=>tpMark(slot,false)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${isP?C.border:C.red}`,background:isP?C.bg:C.rBg,color:isP?C.tl:C.red,fontFamily:F.b,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>✗ Absent</button>
      </div>);})}
    </div>}
  </div>);
}

function TLV({tasks,setTasks,prop,user:u,vt,L,lang}){
  const[cv,setCV]=useState("daily");const[fD,sFD]=useState("all");const[fS,sFS]=useState("all");const[fC,sFC]=useState("all");const[sa,setSA]=useState(false);
  const isA=u.role==="sa"||u.role==="a";
  const allM=Object.entries(prop?.depts||{}).flatMap(([d,dept])=>dept.m.map(m=>({...m,dept:d,dn:dept.n,di:dept.i})));
  const uT=useCallback((id,up)=>{setTasks(prev=>prev.map(t=>t.id===id?{...t,...up}:t));},[setTasks]);
  const dT=useCallback((id)=>{setTasks(prev=>prev.filter(t=>t.id!==id));},[setTasks]);

  let fl=tasks;
  if(vt==="mytasks")fl=tasks.filter(t=>t.assignedTo===u.id);
  if(cv==="daily")fl=fl.filter(t=>t.cat==="daily");else if(cv==="weekly")fl=fl.filter(t=>t.cat==="weekly");else if(cv==="monthly")fl=fl.filter(t=>t.cat==="monthly");
  if(vt==="tasks"){if(fD!=="all")fl=fl.filter(t=>t.dept===fD);if(fS!=="all")fl=fl.filter(t=>t.status===fS);if(fC!=="all")fl=fl.filter(t=>t.cat===fC);}

  const cL={daily:L.daily,weekly:L.weekly,monthly:L.monthly};const cC={daily:C.blue,weekly:C.green,monthly:C.maroon};const cO=["daily","weekly","monthly"];
  const gr={};fl.forEach(t=>{if(!gr[t.cat])gr[t.cat]=[];gr[t.cat].push(t);});
  const myPc=vt==="mytasks"?(()=>{const my=tasks.filter(t=>t.assignedTo===u.id);const d=my.filter(t=>t.status==="completed").length;return my.length?Math.round((d/my.length)*100):0;})():0;

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
      <h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:0}}>{vt==="mytasks"?L.myTasks:"Daily Tasks"} - {prop.sn}</h1>
      <div style={{display:"flex",gap:5}}>
        {<div style={{display:"flex",gap:2,background:C.maroonSoft,borderRadius:8,padding:2}}>{cO.map(v=><button key={v} onClick={()=>setCV(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,background:cv===v?C.maroon:"transparent",color:cv===v?C.white:C.maroon}}>{cL[v]}</button>)}</div>}
        {isA&&<Btn2 primary small onClick={()=>setSA(!sa)}>➕ {L.addTask}</Btn2>}
      </div>
    </div>
    {vt==="mytasks"&&!isA&&<div style={{background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`,marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:40,height:40,borderRadius:"50%",background:C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:F.d,fontSize:18,fontWeight:700}}>{u.name[0]}</div>
      <div style={{flex:1}}><div style={{fontFamily:F.d,fontSize:17,fontWeight:700,color:C.maroon}}>{u.name}</div></div>
      <div style={{fontFamily:F.d,fontSize:24,fontWeight:700,color:C.maroon}}>{myPc}%</div>
    </div>}
    {vt==="mytasks"&&!isA&&<div style={{background:C.maroonSoft,borderRadius:8,padding:"7px 12px",marginBottom:10,fontSize:11}}>{L.steps}</div>}
    {sa&&isA&&<AddTF prop={prop} onAdd={(t)=>setTasks(prev=>[...prev,t])} onClose={()=>setSA(false)} L={L}/>}
    {vt==="tasks"&&<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}><Sel2 value={fD} onChange={sFD} options={[{v:"all",l:"All"},...Object.entries(prop?.depts||{}).map(([k,d])=>({v:k,l:`${d.i} ${d.n}`}))]}/><Sel2 value={fS} onChange={sFS} options={[{v:"all",l:"All"},{v:"pending",l:"⏳"},{v:"completed",l:"✅"},{v:"issue",l:"⚠️"}]}/><Sel2 value={fC} onChange={sFC} options={[{v:"all",l:"All"},{v:"daily",l:L.daily},{v:"weekly",l:L.weekly},{v:"monthly",l:L.monthly}]}/></div>}
    {cO.filter(c=>gr[c]).map(cat=>(<div key={cat} style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{width:4,height:12,borderRadius:2,background:cC[cat]}}/><h3 style={{fontFamily:F.d,fontSize:14,fontWeight:700,margin:0}}>{cL[cat]}</h3><Bdg color={cC[cat]} bg={`${cC[cat]}15`}>{gr[cat].length}</Bdg></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{gr[cat].map(task=><TC key={task.id} task={task} uTask={uT} delTask={isA?dT:null} depts={prop?.depts||{}} areas={prop?.areas||[]} user={u} allM={allM} L={L} lang={lang}/>)}</div></div>))}
    {fl.length===0&&<div style={{background:C.white,borderRadius:12,padding:24,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:24}}>🎉</div><div style={{fontFamily:F.d,fontSize:14,fontWeight:700,marginTop:4}}>{L.noTasks}</div></div>}
  </div>);
}

function TeamV({tasks,prop,L}){return(<div><h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:"0 0 10px"}}>{L.team} - {prop?.sn}</h1>
  {Object.entries(prop?.depts||{}).map(([k,d])=>(<div key={k} style={{background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`,marginBottom:10}}>
    <div style={{fontFamily:F.d,fontSize:14,fontWeight:700,marginBottom:8}}>{d.i} {d.n}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>{d.m.map(m=>{const mt=tasks.filter(t=>t.assignedTo===m.id),md=mt.filter(t=>t.status==="completed").length;
      return(<div key={m.id} style={{padding:8,background:d.bg,borderRadius:8,borderLeft:`3px solid ${d.c}`}}><div style={{fontWeight:600,fontSize:11,marginBottom:3}}>{m.n}</div><div style={{display:"flex",gap:3}}><Bdg color={C.green} bg={C.gBg}>✅{md}</Bdg><Bdg color={C.yellow} bg={C.yBg}>⏳{mt.filter(t=>t.status==="pending").length}</Bdg></div></div>);})}</div></div>))}</div>);}


// ═══ ASSIGNED TASKS — SA creates tasks for Admins ═══
const ADMIN_TARGETS=[
  {id:"vicky",username:"vicky",name:"Vicky Arya",prop:"All",color:"#8B5CF6"},
  {id:"pp_sonu",username:"sonu",name:"Sonu Mali",prop:"Pushpanjali",color:"#0891B2"},
  {id:"ex_mahesh",username:"mahesh",name:"Mahesh",prop:"Exotica",color:"#D97706"},
  {id:"mk_rahees",username:"rahees",name:"Rahees",prop:"Manaktala",color:"#059669"},
  {id:"sandeep",username:"sandeep",name:"Sandeep",prop:"Security-All",color:"#6B21A8"},
];
// Find admin target by id OR username (handles DB id mismatches)
function findAT(u){return ADMIN_TARGETS.find(t=>t.id===u.id||(t.username&&t.username===u.username));}

function AssignedTasksView({user:u,dirs,setDirs,L,setNs,setView}){
  const isSA=u.role==="sa";
  // Use u.id directly — DB-fetched admin IDs and login user.id come from same row
  const myDirs=isSA?dirs:dirs.filter(d=>d.to===u.id);
  console.log("USER:",u.id,u.role,u.name);
  console.log("[AT VIEW] u.id:",u.id,"isSA:",isSA,"total dirs:",dirs.length,"myDirs:",myDirs.length,"dir.to samples:",dirs.slice(0,5).map(d=>d.to));
  const[showNew,setShowNew]=useState(false);
  const[newTo,setNewTo]=useState("");
  const[admins,setAdmins]=useState([]);
  const[newText,setNewText]=useState("");
  const[newProp,setNewProp]=useState("all");
  const nPhRef=useRef(null);
  const[nPh,setNPh]=useState(null);
  const[nDue,setNDue]=useState("");
  const[filterTo,setFilterTo]=useState("all");

  // Fetch real admin IDs from Supabase so to_user = user.id (guaranteed match)
  useEffect(()=>{
    if(!isSA)return;
    supabase.from("users").select("id,name,property,username").eq("role","a")
      .then(({data,error})=>{
        console.log("[Admins fetch from DB]",data?.length,"admins:",data?.map(a=>a.id),"error:",error?.message||"none");
        if(data&&data.length>0){setAdmins(data);setNewTo(data[0].id);}
        else{// DB has no role='a' users — fall back to ADMIN_TARGETS
          const fb=ADMIN_TARGETS.map(t=>({id:t.id,name:t.name,property:t.prop,username:t.username}));
          setAdmins(fb);setNewTo(fb[0].id);
          console.log("[Admins] Fallback to ADMIN_TARGETS:",fb.map(t=>t.id));
        }
      });
  },[isSA]);

  const sendTask=async()=>{if(!newText.trim()||!newTo)return;
    const tgt=admins.find(a=>a.id===newTo)||{name:newTo};
    const tgtColor=ADMIN_TARGETS.find(t=>t.id===newTo||t.username===newTo)?.color||C.blue;
    const atId="at_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    console.log("[AssignedTask] SAVING — id:",atId,"to_user:",newTo,"to_name:",tgt.name,"from_user:",u.id);
    const{data,error}=await supabase.from("assigned_tasks").insert({id:atId,from_user:u.id,from_name:u.name,to_user:newTo,to_name:tgt.name||"",to_color:tgtColor,property:newProp,text:newText.trim(),photo_url:nPh?.data||null,status:"sent",due_date:nDue||null}).select().single();
    if(error){console.error("sendTask error:",error.message);return;}
    const newDir={id:data.id,from:u.id,fromName:u.name,to:newTo,toName:tgt.name||"",toColor:tgtColor,prop:newProp,text:newText.trim(),photo:nPh?.data||null,status:"sent",replies:[],remarksSA:"",dueDate:nDue||null,completedAt:null,completionNote:"",completionPhoto:null,createdAt:data.created_at,createdTime:new Date(data.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),createdDate:new Date(data.created_at).toLocaleDateString("en-IN")};
    setDirs(prev=>[newDir,...prev]);
    setNs(p=>[{type:"newTask",task:"📝 New task: "+newText.trim().slice(0,40),by:u.name,prop:newProp,time:newDir.createdTime,forUser:newTo},...p]);
    setNewText("");setNPh(null);setNDue("");setShowNew(false);
  };

  const filteredDirs=(filterTo==="all"?myDirs:myDirs.filter(d=>d.to===filterTo)).sort((a,b)=>{const norm=s=>s==="approval_req"?"approval_requested":s;const aS=norm(a.status),bS=norm(b.status);if(aS==="completed"&&bS!=="completed")return 1;if(bS==="completed"&&aS!=="completed")return -1;const saPri={approval_requested:0,rejected:1,sent:2,approved:3,completed:4};const admPri={rejected:0,sent:1,approval_requested:2,approved:3,completed:4};const pri=isSA?saPri:admPri;return(pri[aS]??5)-(pri[bS]??5);});

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>📝 {L.directives}</h1>
      {isSA&&<Btn2 primary small onClick={()=>setShowNew(!showNew)}>➕ {L.newDirective}</Btn2>}
    </div>

    {/* NEW TASK FORM */}
    {showNew&&isSA&&<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:16}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:10}}>➕ {L.newDirective}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <SearchSelect value={newTo} onChange={setNewTo} options={admins.map(a=>({v:a.id,l:a.name+(a.property?` — ${a.property}`:"")}))} style={{width:"100%"}}/>
        <SearchSelect value={newProp} onChange={setNewProp} options={[{v:"all",l:"All Properties"},...Object.entries(PROPS).map(([k,p])=>({v:k,l:`${p.icon} ${p.sn}`}))]} style={{width:"100%"}}/>
      </div>
      <textarea placeholder={L.writeTask} value={newText} onChange={e=>setNewText(e.target.value)} style={{width:"100%",padding:12,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,minHeight:80,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,fontWeight:600,color:C.tl}}>📅 {L.dueDate}:</span><input type="date" value={nDue} onChange={e=>setNDue(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/></div>
        <button onClick={()=>nPhRef.current?.click()} style={{padding:"8px 14px",borderRadius:8,border:`1px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:C.accent}}>📸 {L.addPhoto}</button>
        {nPh&&<img src={nPh.data} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover"}}/>}
        <input ref={nPhRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setNPh({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
      </div>
      <div style={{display:"flex",gap:8}}><Btn2 primary onClick={sendTask}>{L.send} →</Btn2><Btn2 onClick={()=>setShowNew(false)}>{L.cancel}</Btn2></div>
    </div>}

    {/* FILTER BY MEMBER — color coded */}
    {isSA&&<div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
      <button onClick={()=>setFilterTo("all")} style={{padding:"6px 14px",borderRadius:8,border:filterTo==="all"?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:filterTo==="all"?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:C.maroon}}>All ({myDirs.length})</button>
      {admins.map(a=>{const tgt=ADMIN_TARGETS.find(t=>t.id===a.id||t.username===a.username);const col=tgt?.color||C.blue;const cnt=myDirs.filter(d=>d.to===a.id).length;return cnt>0&&<button key={a.id} onClick={()=>setFilterTo(a.id)} style={{padding:"6px 14px",borderRadius:8,border:filterTo===a.id?`2px solid ${col}`:`1px solid ${C.border}`,background:filterTo===a.id?col+"15":C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:col}}>{a.name} ({cnt})</button>;})}
    </div>}

    {/* TASK GRID */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {filteredDirs.length===0&&<div style={{gridColumn:"1/-1",background:C.white,borderRadius:12,padding:30,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:24}}>📝</div><div style={{fontFamily:F.d,fontSize:14,fontWeight:700,marginTop:4}}>{L.noDirectives}</div></div>}
      {filteredDirs.map(dir=><ATCard key={dir.id} dir={dir} user={u} setDirs={setDirs} L={L} setNs={setNs}/>)}
    </div>
  </div>);
}

function ATCard({dir,user:u,setDirs,L,setNs}){
  const[showComplete,setShowComplete]=useState(false);
  const[cNote,setCNote]=useState("");
  const[cPhoto,setCPhoto]=useState(null);
  const[showReply,setShowReply]=useState(false);
  const[rText,setRText]=useState("");
  const[rPhoto,setRPhoto]=useState(null);
  const[showRemarks,setShowRemarks]=useState(false);
  const[remarks,setRemarks]=useState("");
  const cRef=useRef(null);const rRef=useRef(null);
  const isSA=u.role==="sa";const isTarget=dir.to===u.id;
  const tgt=ADMIN_TARGETS.find(t=>t.id===dir.to||t.username===dir.to);
  const mC=tgt?.color||C.blue;

  // Normalize legacy status value
  const status=(dir.status==="approval_req")?"approval_requested":dir.status;
  const isCompleted=status==="completed";

  const stMap={sent:{c:C.blue,b:C.bBg,l:"Pending"},approval_requested:{c:C.accent,b:"#FFF7ED",l:L.awaitApproval||"Awaiting Approval"},approved:{c:C.green,b:C.gBg,l:L.approved||"Approved ✓"},rejected:{c:C.red,b:C.rBg,l:L.rejected||"Needs Rework"},completed:{c:C.green,b:C.gBg,l:L.completedWork||"Completed"}};
  const st=stMap[status]||stMap.sent;
  const cardBg=status==="rejected"?"#FFF5F5":status==="approved"?C.gBg:status==="approval_requested"?"#FFFBF0":status==="completed"?C.gBg+"44":C.white;
  const bdrC=status==="rejected"?C.red:status==="approved"?C.green:status==="approval_requested"?C.accent:status==="completed"?"#b8dcc8":C.border;
  const topC=status==="rejected"?C.red:status==="approved"?C.green:status==="approval_requested"?C.accent:status==="completed"?C.green:mC;

  const isOverdue=dir.dueDate&&new Date(dir.dueDate)<td&&status==="sent";
  const dueFmt=dir.dueDate?new Date(dir.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"";

  // MARK COMPLETE — photo REQUIRED, tries Supabase Storage, falls back to base64
  const handleComplete=async()=>{
    if(!cPhoto)return;
    let photoUrl=null;
    try{
      const fn=`at_${dir.id}_${Date.now()}.jpg`;
      const b64=cPhoto.data.split(",")[1];
      const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      const{error:upErr}=await supabase.storage.from("photos").upload(fn,bytes,{contentType:"image/jpeg",upsert:true});
      if(!upErr){const{data:uD}=supabase.storage.from("photos").getPublicUrl(fn);photoUrl=uD.publicUrl;}
    }catch(e){}
    if(!photoUrl)photoUrl=cPhoto.data;
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const dt=new Date().toLocaleDateString("en-IN");
    const replyText="✅ "+(L.markComplete||"Marked Complete")+(cNote.trim()?" — "+cNote.trim():"");
    const[,{data:repRow}]=await Promise.all([
      supabase.from("assigned_tasks").update({status:"completed",completed_at:new Date().toISOString(),completion_note:cNote.trim()||null,completion_photo:photoUrl}).eq("id",dir.id),
      supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:replyText,photo_url:photoUrl,reply_type:"completed"}).select().single()
    ]);
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:replyText,photo:photoUrl,type:"completed",time:tm,date:dt};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"completed",completedAt:new Date().toISOString(),completionNote:cNote.trim(),completionPhoto:{data:photoUrl},replies:[...d.replies,newReply]}:d));
    setNs(p=>[{type:"completed",task:"✅ Completed: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.from},...p]);
    setCNote("");setCPhoto(null);setShowComplete(false);
  };

  // SEND FOR APPROVAL — from "sent" OR "rejected"
  const sendApproval=async()=>{
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const replyText="🔔 "+(L.reqApproval||"Sent for Approval");
    const[,{data:repRow}]=await Promise.all([
      supabase.from("assigned_tasks").update({status:"approval_requested"}).eq("id",dir.id),
      supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:replyText,reply_type:"approval_requested"}).select().single()
    ]);
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:replyText,type:"approval_requested",time:tm,date:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"approval_requested",replies:[...d.replies,newReply]}:d));
    setNs(p=>[{type:"approval",task:"🔔 Approval: "+dir.text.slice(0,30)+"...",by:u.name,prop:dir.prop,time:tm,dirId:dir.id},...p]);
  };

  const addReply=async()=>{
    if(!rText.trim()&&!rPhoto)return;
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const{data:repRow}=await supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:rText.trim(),photo_url:rPhoto?.data||null,reply_type:"reply"}).select().single();
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:rText.trim(),photo:rPhoto?.data||null,type:"reply",time:tm,date:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,replies:[...d.replies,newReply]}:d));
    setRText("");setRPhoto(null);setShowReply(false);
  };

  const handleOk=async()=>{
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const replyText="✅ "+(L.okApproval||"Approved");
    const[,{data:repRow}]=await Promise.all([
      supabase.from("assigned_tasks").update({status:"approved"}).eq("id",dir.id),
      supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:replyText,reply_type:"approved"}).select().single()
    ]);
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:replyText,type:"approved",time:tm,date:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"approved",replies:[...d.replies,newReply]}:d));
    setNs(p=>[{type:"approved",task:"✅ Approved: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.to},...p]);
  };

  const handleNotOk=async()=>{
    if(!remarks.trim()){setShowRemarks(true);return;}
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const replyText="❌ Not OK: "+remarks.trim();
    const[,{data:repRow}]=await Promise.all([
      supabase.from("assigned_tasks").update({status:"rejected",remarks_sa:remarks.trim()}).eq("id",dir.id),
      supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:replyText,reply_type:"rejected"}).select().single()
    ]);
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:replyText,type:"rejected",time:tm,date:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"rejected",remarksSA:remarks.trim(),replies:[...d.replies,newReply]}:d));
    setNs(p=>[{type:"rejected",task:"❌ Not OK: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.to},...p]);
    setRemarks("");setShowRemarks(false);
  };

  return(<div style={{background:cardBg,borderRadius:12,border:`1px solid ${bdrC}`,overflow:"hidden",borderTop:`4px solid ${topC}`}}>
    {/* HEADER */}
    <div style={{padding:"10px 14px",borderBottom:`1px solid ${bdrC}`,display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:30,height:30,borderRadius:"50%",background:mC,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:11,flexShrink:0}}>{dir.toName[0]}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:700,color:mC}}>→ {dir.toName}</div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:1}}>
          <span style={{fontSize:9,color:C.tl}}>{dir.createdDate} · {dir.createdTime}</span>
          {dueFmt&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:isOverdue?C.rBg:C.yBg,color:isOverdue?C.red:C.yellow}}>{isOverdue?"⚠️ "+L.overdue:"📅 "+(L.dueOn||"Due")} {dueFmt}</span>}
        </div>
      </div>
      <Bdg color={st.c} bg={st.b}>{st.l}</Bdg>
      {isSA&&<button onClick={async()=>{await supabase.from("assigned_tasks").delete().eq("id",dir.id);setDirs(prev=>prev.filter(d=>d.id!==dir.id));}} style={{width:22,height:22,borderRadius:6,border:"none",cursor:"pointer",background:C.rBg,color:C.red,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>}
    </div>

    {/* BODY */}
    <div style={{padding:"10px 14px"}}>
      <div style={{fontSize:13,lineHeight:1.6,marginBottom:6,textDecoration:isCompleted?"line-through":"none",color:isCompleted?C.green:C.text}}>{dir.text}</div>
      {dir.photo&&<img src={dir.photo} alt="" style={{width:90,height:90,borderRadius:8,objectFit:"cover",border:`1px solid ${C.border}`,marginBottom:6}}/>}

      {/* SA REMARKS — shown prominently when rejected */}
      {status==="rejected"&&isTarget&&dir.remarksSA&&<div style={{background:C.rBg,border:`1px solid ${C.red}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:700,color:C.red,marginBottom:3}}>❌ {L.saRemarks||"SA Feedback — Rework Required"}</div>
        <div style={{fontSize:12,color:C.red}}>{dir.remarksSA}</div>
      </div>}

      {/* APPROVED — "complete work on ground" message */}
      {status==="approved"&&isTarget&&<div style={{background:C.gBg,border:`1px solid ${C.green}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:C.green}}>✅ {L.approvedMsg||"Approved! Complete the work on ground, then mark complete with photo proof."}</div>
      </div>}

      {/* AWAITING APPROVAL — waiting message */}
      {status==="approval_requested"&&isTarget&&<div style={{background:"#FFF7ED",border:`1px solid ${C.accent}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:600,color:C.accent}}>🔔 {L.waitingApproval||"Approval request sent. Waiting for SA review."}</div>
      </div>}

      {/* COMPLETION PROOF */}
      {isCompleted&&<div style={{background:C.gBg,border:`1px solid #b8dcc8`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:700,color:C.green,marginBottom:4}}>✅ {L.completedWork||"Completed"}</div>
        {dir.completionNote&&<div style={{fontSize:11,marginBottom:4,color:C.text}}>{dir.completionNote}</div>}
        {dir.completionPhoto&&<img src={dir.completionPhoto.data||dir.completionPhoto} alt="" style={{width:100,height:100,borderRadius:8,objectFit:"cover",border:`1px solid #b8dcc8`}}/>}
        {dir.completedAt&&<div style={{fontSize:9,color:C.tl,marginTop:4}}>{new Date(dir.completedAt).toLocaleString("en-IN")}</div>}
      </div>}

      {/* REPLIES THREAD */}
      {dir.replies.length>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
        {dir.replies.map((r,i)=>{
          const rBg=r.type==="approved"?C.gBg:r.type==="rejected"?C.rBg:r.type==="approval_requested"||r.type==="approval_req"?"#FFF7ED":r.type==="completed"?C.gBg:C.bg;
          const rC2=r.type==="approved"?C.green:r.type==="rejected"?C.red:r.type==="approval_requested"||r.type==="approval_req"?C.accent:r.type==="completed"?C.green:C.blue;
          return(<div key={r.id||i} style={{display:"flex",gap:6,marginBottom:6,padding:8,background:rBg,borderRadius:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:rC2,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:8,fontWeight:700,flexShrink:0}}>{r.by[0]}</div>
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{r.by} <span style={{fontWeight:400,color:C.tl}}>{r.time}</span></div>
              {r.text&&<div style={{fontSize:11,marginTop:2}}>{r.text}</div>}
              {r.photo&&<img src={r.photo} alt="" style={{width:70,height:70,borderRadius:6,objectFit:"cover",marginTop:4}}/>}
            </div>
          </div>);
        })}
      </div>}

      {/* ACTIONS */}
      {!isCompleted&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
        {/* Admin: Send for Approval from "sent" OR "rejected" */}
        {isTarget&&(status==="sent"||status==="rejected")&&<Btn2 small onClick={sendApproval} style={{background:"#FFF7ED",color:C.accent}}>🔔 {L.reqApproval||"Send for Approval"}</Btn2>}
        {/* Admin: Mark Complete when sent, rejected, OR approved — photo REQUIRED */}
        {isTarget&&(status==="sent"||status==="rejected"||status==="approved")&&<Btn2 primary small onClick={()=>setShowComplete(!showComplete)} style={{background:C.green}}>📸 {L.markComplete||"Mark Complete"}</Btn2>}
        {/* Admin: Reply only on sent or rejected */}
        {isTarget&&(status==="sent"||status==="rejected")&&<Btn2 small onClick={()=>setShowReply(!showReply)}>💬 {L.reply||"Reply"}</Btn2>}
        {/* SA: Reply on any non-completed task */}
        {isSA&&<Btn2 small onClick={()=>setShowReply(!showReply)}>💬 {L.reply||"Reply"}</Btn2>}
        {/* SA: Approve / Reject only when approval_requested */}
        {isSA&&status==="approval_requested"&&!showRemarks&&<>
          <Btn2 primary small onClick={handleOk} style={{background:C.green}}>✅ {L.okApproval||"Approve"}</Btn2>
          <Btn2 small onClick={()=>setShowRemarks(true)} style={{background:C.rBg,color:C.red}}>❌ {L.notOk||"Reject"}</Btn2>
        </>}
      </div>}

      {/* SA: Reject — remarks input */}
      {isSA&&showRemarks&&<div style={{width:"100%",marginTop:8}}>
        <textarea placeholder={L.writeRemarks||"Write remarks for admin..."} value={remarks} onChange={e=>setRemarks(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.red}`,fontFamily:F.b,fontSize:12,minHeight:50,outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6}}><Btn2 small onClick={handleNotOk} style={{background:C.rBg,color:C.red}}>❌ {L.send||"Send"}</Btn2><Btn2 small onClick={()=>setShowRemarks(false)}>{L.cancel||"Cancel"}</Btn2></div>
      </div>}

      {/* MARK COMPLETE BOX — photo REQUIRED to enable submit */}
      {showComplete&&isTarget&&(status==="sent"||status==="rejected"||status==="approved")&&<div style={{marginTop:8,padding:12,background:C.gBg,borderRadius:10,border:`1px solid #b8dcc8`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:4}}>📸 {L.markComplete||"Mark Complete"}</div>
        <div style={{fontSize:10,color:C.tl,marginBottom:8}}>Photo proof is <strong>required</strong> to complete this task.</div>
        <textarea placeholder={L.completionNote||"Completion note (optional)"} value={cNote} onChange={e=>setCNote(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:40,outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
          <button onClick={()=>cRef.current?.click()} style={{padding:"7px 12px",borderRadius:8,border:`2px ${cPhoto?"solid":"dashed"} ${cPhoto?C.green:C.red}`,background:cPhoto?C.gBg:"#FFF5F5",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:cPhoto?C.green:C.red}}>{cPhoto?"✅ Photo taken — retake?":"📸 Take Photo (Required)"}</button>
          {cPhoto&&<img src={cPhoto.data} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover"}}/>}
          <input ref={cRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setCPhoto({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
        </div>
        <Btn2 primary small onClick={handleComplete} style={{background:cPhoto?C.green:"#aaa",cursor:cPhoto?"pointer":"not-allowed",opacity:cPhoto?1:0.6}}>✅ {L.markComplete||"Mark Complete"}</Btn2>
        {!cPhoto&&<div style={{fontSize:10,color:C.red,marginTop:4}}>📸 Please take a photo to enable completion</div>}
      </div>}

      {/* REPLY BOX */}
      {showReply&&<div style={{marginTop:8,padding:10,background:C.bg,borderRadius:8}}>
        <textarea placeholder={L.replyHere||"Write reply..."} value={rText} onChange={e=>setRText(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:50,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>rRef.current?.click()} style={{padding:"6px 12px",borderRadius:6,border:`1px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:C.accent}}>📸</button>
          {rPhoto&&<img src={rPhoto.data} alt="" style={{width:30,height:30,borderRadius:4,objectFit:"cover"}}/>}
          <input ref={rRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setRPhoto({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
          <Btn2 primary small onClick={addReply}>{L.send||"Send"}</Btn2>
        </div>
      </div>}
    </div>
  </div>);
}


function PropBar({ap,setAP,user:u}){
  const uprop=u.prop||u.property||"pp";const av=uprop==="all"?Object.values(PROPS):[PROPS[uprop]].filter(Boolean);
  return(<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{av.map(p=>{const a=ap===p.id;return(<button key={p.id} onClick={()=>setAP(p.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:a?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:a?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b}}><span style={{fontSize:13}}>{p.icon}</span><span style={{fontSize:10,fontWeight:a?700:500,color:a?C.maroon:C.text}}>{p.sn}</span>{a&&<span style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>}</button>);})}</div>);
}

// ═══ APP ═══
export default function App(){
  const[lang,setLang]=useState("en");const[user,setUser]=useState(()=>{try{const s=localStorage.getItem("ambria_user");if(!s)return null;const u=JSON.parse(s);if(u&&u.role!=="sa"&&findAT(u))u.role="a";return u;}catch{return null;}});const[aP,sAP]=useState("pp");const[view,sV]=useState("dashboard");const[tS,sTS]=useState(ALL_T);const[ns,setNs]=useState([]);const[sN,setSN]=useState(false);const[att,setAtt]=useState([]);const[pm,setPM]=useState(false);const[pAs,setPAs]=useState("");const[allDbUsers,setAllDbUsers]=useState([]);const[dirs,setDirs]=useState([]);const[atLoaded,setAtLoaded]=useState(false);const[customMembers,setCM]=useState([]);const[removedIds,setRI]=useState([]);const[loading,setLoading]=useState(false);
  const L=LANGS[lang];
  const allS=useMemo(()=>Object.entries(PROPS).flatMap(([pk,p])=>Object.entries(p.depts).flatMap(([dk,d])=>d.m.map(m=>({...m,dept:dk,dn:d.n,di:d.i,pid:pk,pn:p.sn})))),[]);

  // ═══ LOAD ALL DATA FROM SUPABASE AFTER LOGIN ═══
  useEffect(()=>{
    if(!user)return;
    const today=new Date().toISOString().split("T")[0];
    console.log("[App] Loading data for user — id:",user?.id,"role:",user?.role,"prop:",user?.prop);
    setLoading(true);setAtLoaded(false);
    (async()=>{
      try{
        // 1. Task status overrides for today (re-hydrate template tasks with saved state)
        const props=user.prop==="all"?Object.keys(PROPS):[user.prop||"pp"];
        for(const pid of props){
          const{data:td}=await supabase.from("tasks").select("id,status,notes,completed_at,completed_by").eq("property",pid).eq("task_date",today);
          if(td&&td.length>0){const ov={};td.forEach(r=>{const tid=r.id.replace(/^task_/,"").replace(/_\d{4}-\d{2}-\d{2}$/,"");ov[tid]=r;});sTS(prev=>({...prev,[pid]:(prev[pid]||[]).map(t=>{const o=ov[t.id];if(!o)return t;return{...t,status:o.status||t.status,notes:o.notes||t.notes,completedAt:o.completed_at||null,completedBy:o.completed_by||""};})}))}
        }
        // 2. Assigned tasks + replies
        let atQ=supabase.from("assigned_tasks").select("*").order("created_at",{ascending:false});
        console.log("FETCH assigned_tasks WHERE to_user =",user.id,"(role:",user.role+")");
        if(user.role!=="sa")atQ=atQ.eq("to_user",user.id);
        const[{data:atData},{data:repData},{data:attData}]=await Promise.all([atQ,supabase.from("assigned_task_replies").select("*").order("created_at"),supabase.from("attendance").select("*").eq("date",today)]);
        // ═══ DEBUG: assigned tasks ═══
        console.log("=== ASSIGNED TASKS DEBUG ===");
        console.log("Current user ID:",user.id);
        console.log("Current user role:",user.role);
        console.log("ALL assigned_tasks in DB:",atData?.length,atData);
        if(atData&&atData.length>0){console.log("to_user values:",atData.map(t=>t.to_user));console.log("Tasks for this user:",atData.filter(t=>t.to_user===user.id));}
        console.log("=== END DEBUG ===");
        if(attData&&attData.length>0){setAtt(attData.map(r=>({uid:r.user_id,name:r.user_name,date:r.date,ci:r.check_in,co:r.check_out,ciPhoto:null,coPhoto:null})));}
        if(atData){
          const repMap={};
          (repData||[]).forEach(r=>{if(!repMap[r.task_id])repMap[r.task_id]=[];repMap[r.task_id].push({id:r.id,by:r.by_name,text:r.text,photo:r.photo_url,type:r.reply_type,time:new Date(r.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),date:new Date(r.created_at).toLocaleDateString("en-IN")});});
          setDirs(atData.map(t=>({id:t.id,from:t.from_user,fromName:t.from_name,to:t.to_user,toName:t.to_name,toColor:t.to_color,prop:t.property,text:t.text,photo:t.photo_url,status:t.status,replies:repMap[t.id]||[],dueDate:t.due_date,completedAt:t.completed_at,completionNote:t.completion_note||"",completionPhoto:t.completion_photo,remarksSA:t.remarks_sa||"",createdAt:t.created_at,createdTime:new Date(t.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),createdDate:new Date(t.created_at).toLocaleDateString("en-IN")})));
        }
        setAtLoaded(true);
        // 3. Custom members from users table (those not in PROPS template)
        const allTemplateIds=new Set(allS.map(m=>m.id));
        const{data:allUsers}=await supabase.from("users").select("*");
        if(allUsers){
          const extra=allUsers.filter(u=>!allTemplateIds.has(u.id)&&u.role==="e");
          setCM(extra.map(u=>({id:u.id,n:u.name,u:u.username,p:u.password,prop:u.property,dept:u.department,role:"e",joining_date:u.joining_date,is_active:u.is_active!==false})));
          const inactive=allUsers.filter(u=>u.is_active===false).map(u=>u.id);
          setRI(inactive);
          setAllDbUsers(allUsers.filter(u=>u.is_active!==false&&u.role!=="sa"));
        }
      }catch(e){console.error("Load error:",e);}
      finally{setLoading(false);}
    })();
  },[user?.id]);

  if(!user)return <LoginScreen onLogin={(u2,rememberMe)=>{
    const u3={...u2, prop: u2.property||u2.prop||"pp", dept: u2.department||u2.dept||null, name: u2.name||u2.n||"User"};
    const _at3=findAT(u3);if(u3.role!=="sa"&&_at3)u3.role="a";
    console.log("[Login] id:",u3.id,"username:",u3.username,"role:",u3.role,"adminTarget:",_at3?.id||"none");
    if(rememberMe)localStorage.setItem("ambria_user",JSON.stringify(u3));
    setUser(u3);
    if(u3.prop&&u3.prop!=="all")sAP(u3.prop);
    sV(u3.role==="e"?"mytasks":"dashboard");
  }} lang={lang} setLang={setLang}/>;

  // Preview mode: resolve preview user from DB first, fallback to allS template
  let previewDbUser=null;
  if(pm&&user.role==="sa"&&pAs){
    previewDbUser=allDbUsers.find(u=>u.id===pAs);
    if(!previewDbUser){const s=allS.find(x=>x.id===pAs);if(s)previewDbUser={id:s.id,name:s.n,role:"e",property:s.pid,department:s.dept,username:s.u||""};}
  }
  const eU=previewDbUser?{id:previewDbUser.id,name:previewDbUser.name,role:previewDbUser.role||"e",prop:previewDbUser.property||"pp",department:previewDbUser.department,username:previewDbUser.username}:user;
  const isA=eU.role==="sa"||eU.role==="a"||!!findAT(eU);
  const eP=previewDbUser?(eU.prop==="all"?"pp":eU.prop):aP;
  const prop=PROPS[eP]||PROPS[Object.keys(PROPS)[0]];const tasks=tS[eP]||[];
  const setTasks=(fn)=>{sTS(prev=>{const nt=typeof fn==="function"?fn(prev[eP]||[]):fn;const ot=prev[eP]||[];nt.forEach(n2=>{const o=ot.find(t=>t.id===n2.id);if(o){if(o.status!=="completed"&&n2.status==="completed")setNs(p=>[{type:"done",task:n2.title,by:n2.completedBy||n2.assigneeName,prop:prop.sn,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})},...p]);if(o.status!=="issue"&&n2.status==="issue")setNs(p=>[{type:"issue",task:n2.title,by:n2.assigneeName,prop:prop.sn,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})},...p]);if(o.status!==n2.status||o.notes!==n2.notes||(n2.photos?.length||0)!==(o.photos?.length||0))syncTask(n2);}});return{...prev,[eP]:nt};});};

  return(<div style={{fontFamily:F.b,background:C.bg,minHeight:"100vh",color:C.text}}>
    {loading&&<div style={{position:"fixed",inset:0,background:"rgba(255,255,255,0.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}><div style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon}}>Ambria</div><div style={{fontSize:13,color:C.tl}}>Loading data...</div></div>}
    <Sidebar view={view} setView={sV} user={user} effectiveUser={eU} onLogout={()=>{localStorage.removeItem("ambria_user");setUser(null);setPM(false);setPAs("");sV("dashboard");}} lang={lang} setLang={setLang} nC={ns.length} setShowN={setSN} L={L} pm={pm} setPM={setPM} pAs={pAs} setPAs={setPAs} allDbUsers={allDbUsers} dirs={dirs} aP={aP}/>
    {sN&&<NPanel ns={ns} onClose={()=>setSN(false)} onClr={()=>{setNs([]);setSN(false);}} L={L} onClickNotif={(n)=>{sV("directives");}}/>}
    <div style={{marginLeft:185,padding:"0 18px 18px",minHeight:"100vh"}}>
      {pm&&previewDbUser&&<div style={{background:`linear-gradient(90deg,${C.blue},${C.maroon})`,color:C.white,padding:"8px 14px",borderRadius:10,marginTop:10,marginBottom:4,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}><span>👁️</span><span style={{fontSize:12,fontWeight:700}}>{L.previewAs}: {eU.name} ({eU.role==="a"||!!findAT(eU)?L.admin:L.staff} — {PROPS[eU.prop]?.sn||eU.prop||"All"})</span></div><button onClick={()=>{setPM(false);setPAs("");sV("dashboard");}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.15)",color:C.white,fontFamily:F.b,fontSize:10,fontWeight:700,cursor:"pointer"}}>{L.previewOff}</button></div>}
      {!pm&&!["members","roster"].includes(view)&&<div style={{position:"sticky",top:0,zIndex:40,background:C.bg,padding:"10px 0"}}><PropBar ap={aP} setAP={sAP} user={user}/></div>}
      {isA?(<>
        {view==="dashboard"&&<Dashboard tasks={tasks} prop={prop} user={eU} lang={lang} att={att}/>}
        {view==="tasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt="tasks" L={L} lang={lang}/>}
        {view==="directives"&&<AssignedTasksView user={eU} dirs={dirs} setDirs={setDirs} L={L} setNs={setNs} setView={sV} atLoaded={atLoaded}/>}
        {view==="team"&&<TeamV tasks={tasks} prop={prop} L={L}/>}
        {view==="areas"&&<AreasView tasks={tasks} prop={prop} lang={lang}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="roster"&&<DutyRoster prop={prop} user={eU} lang={lang}/>}
        {view==="leaves"&&<LeaveManager prop={prop} user={eU} lang={lang}/>}
        {view==="training"&&<TrainingView user={eU} prop={prop} lang={lang}/>}
        {view==="chemicals"&&<ChemicalGuide lang={lang}/>}
        {view==="members"&&<MembersView user={eU} lang={lang} customMembers={customMembers} setCustomMembers={setCM} removedIds={removedIds} setRemovedIds={setRI}/>}
        {view==="valet"&&<ValetPlanning user={eU} lang={lang}/>}
        {view==="vendors"&&<VendorDirectory user={eU} lang={lang}/>}
      </>):(<>
        {view==="mytasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt="mytasks" L={L} lang={lang}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="leaves"&&<LeaveManager prop={prop} user={eU} lang={lang}/>}
        {view==="training"&&<TrainingView user={eU} prop={prop} lang={lang}/>}
      </>)}
    </div></div>);
}
