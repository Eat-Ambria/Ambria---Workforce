import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import Modal from "./Modal.jsx";
import { C as C_BASE, F, LANGS, PROPS, THEMES, OFFICE_DEPTS, ACCESS_SECTIONS } from "./constants.js";
const C = C_BASE;
import { ThemeContext, useT } from "./ThemeContext.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";
import Dashboard from "./Dashboard.jsx";
import DutyRoster from "./DutyRoster.jsx";
import LeaveManager from "./LeaveManager.jsx";
import ChemicalGuide from "./ChemicalGuide.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import TrainingView from "./TrainingView.jsx";
import TeamPage from "./TeamPage.jsx";
import ValetPlanning from "./ValetPlanning.jsx";
import ValetPortal from "./ValetPortal.jsx";
import VendorDirectory from "./VendorDirectory.jsx";
import FireExtinguishers, { checkFireExtinguisherExpiry } from "./FireExtinguishers.jsx";


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

const compressImage=(dataUrl,maxKB=80)=>new Promise(resolve=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;const mx=1200;if(w>mx||h>mx){if(w>h){h=Math.round(h*mx/w);w=mx;}else{w=Math.round(w*mx/h);h=mx;}}const cv=document.createElement("canvas");cv.width=w;cv.height=h;const ctx=cv.getContext("2d");ctx.drawImage(img,0,0,w,h);let q=0.8;const go=()=>{const r=cv.toDataURL("image/jpeg",q);const kb=(r.length*3/4)/1024;if(kb<=maxKB||q<=0.1){resolve(r);}else{q-=0.1;go();}};go();};img.src=dataUrl;});
const parsePhotos=(raw)=>{if(!raw)return[];if(typeof raw==="string"){if(raw.startsWith("[")){try{return JSON.parse(raw);}catch{return[raw];}}return[raw];}if(raw&&raw.data)return[raw.data];return[];};

// ═══ UI ═══
function Bdg({children,color=C_BASE.tl,bg=C_BASE.border+"88"}){return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:bg,color,whiteSpace:"nowrap",fontFamily:F.b}}>{children}</span>;}
function SL2({s,L}){const C=useT();const m={pending:{l:L.pending,c:C.yellow,b:C.yBg},in_progress:{l:L.inProgress,c:C.blue,b:C.bBg},completed:{l:L.done,c:C.green,b:C.gBg},issue:{l:L.issue,c:C.red,b:C.rBg}};const v=m[s]||m.pending;return <Bdg color={v.c} bg={v.b}>{v.l}</Bdg>;}
function SearchSelect({value,onChange,options,style:cs,placeholder}){
  const C=useT();const[open,setOpen]=useState(false);const[q,setQ]=useState("");const ref=useRef(null);
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
function Btn2({children,onClick,primary,small,style:cs}){const C=useT();return <button onClick={onClick} style={{padding:small?"6px 12px":"10px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:small?11:13,fontWeight:600,background:primary?C.maroon:C.bg,color:primary?C.white:C.text,...cs}}>{children}</button>;}

// ═══ LOGIN ═══
function LoginScreen({onLogin,lang,setLang,onValetMode}){
  const C=useT();const L=LANGS[lang];const[u,sU]=useState("");const[p,sP]=useState("");const[err,sE]=useState("");const[sh,sSh]=useState(false);const[rem,setRem]=useState(false);const[loading,setLoading]=useState(false);
  const go=async()=>{setLoading(true);sE("");try{const{data,error}=await supabase.from("users").select("id,name,username,role,property,department,access,designation").eq("username",u.trim()).eq("password",p).single();if(error||!data){sE(L.invalidLogin);}else{onLogin(data,rem);}}catch(e){sE(L.invalidLogin);}finally{setLoading(false);}};
  return(<div style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight},#2D1520)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.b,padding:20}}>
    <div style={{width:"100%",maxWidth:380,background:C.white,borderRadius:20,padding:36,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button onClick={()=>setLang(lang==="en"?"hi":"en")} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:11,cursor:"pointer",fontWeight:600,color:C.maroon}}>{lang==="en"?"हिंदी":"English"}</button></div>
      <div style={{textAlign:"center",marginBottom:28}}><div style={{width:60,height:60,borderRadius:"50%",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:F.d,color:C.white,fontSize:30,fontWeight:700,marginBottom:10}}>A</div><h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:"0 0 4px",lineHeight:1.2}}>Ambria Work Force</h1></div>
      <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,marginBottom:5,display:"block"}}>{L.username}</label><input type="text" value={u} onChange={e=>sU(e.target.value)} placeholder={L.enterUser} onKeyDown={e=>{if(e.key==="Enter")go();}} style={{width:"100%",padding:"12px 16px",borderRadius:10,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:14,outline:"none",boxSizing:"border-box",background:C.bg}}/></div>
      <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,marginBottom:5,display:"block"}}>{L.password}</label><div style={{position:"relative"}}><input type={sh?"text":"password"} value={p} onChange={e=>sP(e.target.value)} placeholder={L.enterPass} onKeyDown={e=>{if(e.key==="Enter")go();}} style={{width:"100%",padding:"12px 16px",paddingRight:44,borderRadius:10,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:14,outline:"none",boxSizing:"border-box",background:C.bg}}/><button onClick={()=>sSh(!sh)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:16}}>{sh?"🙈":"👁️"}</button></div></div>
      <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,cursor:"pointer",fontSize:12,color:C.tl}}><div onClick={()=>setRem(!rem)} style={{width:18,height:18,borderRadius:4,border:`2px solid ${rem?C.maroon:C.border}`,background:rem?C.maroon:C.white,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{rem&&<span style={{color:C.white,fontSize:11,fontWeight:700}}>✓</span>}</div>{lang==="hi"?"पासवर्ड याद रखें":"Remember me"}</label>
      {err&&<div style={{background:C.rBg,color:C.red,padding:"10px",borderRadius:8,fontSize:12,marginBottom:14}}>{err}</div>}
      <button onClick={go} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:loading?"#9A2E42":C.maroon,color:C.white,fontFamily:F.b,fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.8:1}}>{loading?"...":L.login}</button>
      <div style={{marginTop:14,textAlign:"center"}}><button onClick={onValetMode} style={{padding:"11px 20px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,color:C.tl,fontFamily:F.b,fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>🚗 Valet Mode</button></div>
    </div></div>);
}

// ═══ PHOTO ═══
function PhotoUp({photos,onUp,onRetake,disabled,L}){
  const C=useT();const ref=useRef(null);
  const hndl=(e)=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith("image/")){alert("Please select an image file");return;}if(f.size>10*1024*1024){alert("Image too large. Max 10MB");return;}const r=new FileReader();r.onload=(ev)=>{onUp({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),date:new Date().toLocaleDateString("en-IN")});};r.readAsDataURL(f);e.target.value="";};
  const has=photos?.length>0;
  return(<div>
    {!has?(<div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={()=>ref.current?.click()} disabled={disabled} style={{padding:"10px 16px",borderRadius:10,border:`2px dashed ${!disabled?C.accent:C.border}`,background:!disabled?"#FFF7ED":C.bg,cursor:disabled?"default":"pointer",fontFamily:F.b,fontSize:12,fontWeight:700,color:!disabled?C.accent:C.tl,opacity:disabled?0.5:1}}>📸 {L.uploadPhoto}</button>{!disabled&&<span style={{fontSize:10,color:C.red,fontWeight:600}}>⚠️ {L.photoNeeded}</span>}</div>)
    :(<div><div style={{display:"inline-flex",flexDirection:"column",borderRadius:12,overflow:"hidden",border:`2px solid ${C.green}`}}><img src={photos[0].data} alt="" style={{width:120,height:120,objectFit:"cover"}}/><div style={{background:"rgba(0,0,0,0.75)",color:C.white,padding:"4px 8px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:9}}>📸 {photos[0].time}</span><span style={{fontSize:9}}>{photos[0].date}</span></div></div>
      {!disabled&&<div style={{marginTop:8}}><button onClick={()=>{onRetake();setTimeout(()=>ref.current?.click(),100);}} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.yellow}`,background:C.yBg,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:700,color:C.yellow}}>🔄 {L.retakePhoto}</button></div>}</div>)}
    <input ref={ref} type="file" accept="image/*" capture="environment" onChange={hndl} style={{display:"none"}}/>
  </div>);
}

// ═══ TASK CARD ═══
function TC({task:t,uTask,delTask,depts,areas,user:u,allM,L,lang}){
  const C=useT();const[sC,setSC]=useState(false);const[cT,setCT]=useState("");const[sS,setSS]=useState(false);const[sE,setSE]=useState(false);const[eA,setEA]=useState(t.assignedTo);
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
  const C=useT();const isMobile=useIsMobile();
  const[f,sF]=useState({title:"",titleHi:"",dept:Object.keys(prop?.depts||{})[0]||"h",area:prop?.areas?.[0]?.id,assignedTo:"",priority:"medium",cat:"daily",dur:"1h",desc:"",descHi:"",timeBlock:"9:00-10:00"});
  const ms=prop?.depts?.[f.dept]?.m||[];
  const sub=()=>{if(!f.title||!f.assignedTo)return;const m=ms.find(x=>x.id===f.assignedTo);onAdd({id:`${prop.id}_c_${Date.now()}`,prop:prop.id,...f,assigneeName:m?.n||"?",status:"pending",notes:"",completedAt:null,completedBy:"",photos:[],isTeam:false});onClose();};
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:isMobile ? "1fr" : "1fr 1fr",gap:8}}>
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
function Sidebar({view,setView,user:u,effectiveUser,onLogout,lang,setLang,nC,setShowN,L,pm,setPM,pAs,setPAs,allDbUsers,dirs,aP,toggleTheme,theme}){
  const C=useT();const eU=effectiveUser||u;
  const isSA=u.role==="sa";const isEffAdmin=eU.role==="sa"||eU.role==="a"||!!findAT(eU)||!!(eU.access&&eU.access.length>0);const isA=isEffAdmin;
  // Pending count for assigned tasks — when previewing, show previewed user's count
  const _pendIsOffice=OFFICE_DEPTS.includes(eU.department);
  const _sidebarToday=new Date().toISOString().split("T")[0];
  const _sidebarOverdue=dirs.filter(d=>{const st=d.status==="approval_req"?"approval_requested":d.status;return st!=="completed"&&d.dueDate&&d.dueDate<_sidebarToday;}).length;
  const _pendDirsBase=isSA&&!pm
    ?dirs.filter(d=>d.status==="approval_requested"||d.status==="approval_req").length
    :_pendIsOffice
      ?dirs.filter(d=>(d.to===eU.id&&(d.status==="sent"||d.status==="rejected"))||(d.from===eU.id&&(d.status==="approval_requested"||d.status==="approval_req"))).length
      :dirs.filter(d=>d.to===eU.id&&(d.status==="sent"||d.status==="rejected"||d.status==="approved")).length;
  const pendDirs=_pendDirsBase+_sidebarOverdue;
  const _sidebarBadgeRed=_sidebarOverdue>0;
  const allAdminNav=[{id:"dashboard",i:"📊",l:L.dashboard},{id:"tasks",i:"✅",l:L.dailyTasks||"Daily Tasks"},{id:"directives",i:"📝",l:L.directives,badge:pendDirs,badgeRed:_sidebarBadgeRed},{id:"team",i:"👥",l:L.team||"Team"},{id:"att",i:"🕐",l:L.attendance},{id:"roster",i:"🗓️",l:L.roster||"Duty Roster"},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:L.training||"Training"},{id:"chemicals",i:"🧪",l:L.chemCalc||"Chemicals"},{id:"valet",i:"🚗",l:L.valetPlan||"Valet Planning"},{id:"vendors",i:"📞",l:L.vendorDir||"Vendors"},{id:"fire",i:"🧯",l:L.fireSafety||"Fire Safety"}];
  const empNav=[{id:"mytasks",i:"✅",l:L.myTasks},{id:"att",i:"🕐",l:L.attendance},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:L.training||"Training"}];
  const nav=isA?(eU.role==="sa"?allAdminNav:(!eU.access||!eU.access.length)?allAdminNav:allAdminNav.filter(n=>eU.access.includes(n.id))):empNav;
  const rL={sa:L.superAdmin,a:L.admin,e:L.staff};
  return(<div style={{width:185,background:C.white,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"fixed",left:0,top:0,zIndex:50}}>
    <div style={{padding:"14px 12px",borderBottom:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.d,color:C.white,fontSize:16,fontWeight:700}}>A</div><div style={{fontFamily:F.d,fontSize:13,fontWeight:700,color:C.maroon,lineHeight:1.2}}>Ambria Work Force</div></div>
      {isA&&<button onClick={()=>setShowN(true)} style={{marginTop:8,width:"100%",padding:"5px 8px",borderRadius:8,border:`1px solid ${nC>0?C.accent:C.border}`,background:nC>0?"#FFF7ED":C.bg,cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:nC>0?C.accent:C.tl}}>🔔 {L.notif}{nC>0&&<span style={{background:C.red,color:C.white,borderRadius:10,padding:"0 5px",fontSize:9,marginLeft:4}}>{nC}</span>}</button>}
    </div>
    <div style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:2}}>
      {nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:view===n.id?600:400,background:view===n.id?C.maroonSoft:"transparent",color:view===n.id?C.maroon:C.tl,textAlign:"left",position:"relative"}}>
        <span style={{fontSize:13}}>{n.i}</span><span style={{flex:1}}>{n.l}</span>
        {n.badge>0&&<span style={{background:n.badgeRed?"#CC0000":C.red,color:C.white,borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:700,minWidth:16,textAlign:"center",animation:n.badgeRed?"overduePulse 2s ease-in-out infinite":undefined}}>{n.badge}</span>}
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
      <button onClick={toggleTheme} style={{width:"100%",padding:"5px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:10,cursor:"pointer",fontWeight:600,color:C.maroon,marginBottom:5}}>{theme==="light"?"🌙 Dark":"☀️ Light"}</button>
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 6px",background:C.bg,borderRadius:8,marginBottom:5}}><div style={{width:24,height:24,borderRadius:"50%",background:C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:10}}>{u.name[0]}</div><div><div style={{fontSize:10,fontWeight:600}}>{u.name}</div><div style={{fontSize:9,color:C.tl}}>{rL[u.role]}</div></div></div>
      <button onClick={onLogout} style={{width:"100%",padding:"6px",borderRadius:8,border:`1px solid ${C.red}`,background:C.rBg,color:C.red,fontFamily:F.b,fontSize:10,fontWeight:600,cursor:"pointer"}}>🚪 {L.logout}</button>
    </div></div>);
}

function NPanel({ns,onClose,onClr,L,onClickNotif}){const C=useT();return(<div style={{position:"fixed",top:0,right:0,width:320,height:"100vh",background:C.white,boxShadow:"-4px 0 20px rgba(0,0,0,0.1)",zIndex:100,display:"flex",flexDirection:"column"}}><div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon}}>🔔 {L.notif}</span><div style={{display:"flex",gap:4}}><Btn2 small onClick={onClr}>{L.clearAll}</Btn2><button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:12}}>✕</button></div></div>
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
  const C=useT();const isMobile=useIsMobile();
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
  const onPhoto=(e)=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith("image/")){alert("Please select an image file");return;}if(f.size>10*1024*1024){alert("Image too large. Max 10MB");return;}const r=new FileReader();r.onload=async(ev)=>{const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});const ph=ev.target.result;if(!mr){const{error}=await supabase.from("attendance").insert({user_id:u.id,user_name:u.name,date:tk,check_in:tm});if(!error){setAtt(p=>[...p,{uid:u.id,name:u.name,date:tk,ci:tm,co:null,ciPhoto:ph,coPhoto:null}]);getSAAndAdminIds(prop.id).then(ids=>notifyMultiple("punch_in","🟢 "+u.name+" punched in at "+tm+" ("+prop.sn+")",u.id,u.name,ids,prop.id));}}else if(!mr.co){const{error}=await supabase.from("attendance").update({check_out:tm}).eq("user_id",u.id).eq("date",tk);if(!error){setAtt(p=>p.map(a=>a.uid===u.id&&a.date===tk?{...a,co:tm,coPhoto:ph}:a));getSAAndAdminIds(prop.id).then(ids=>notifyMultiple("punch_out","🔴 "+u.name+" punched out at "+tm+" ("+prop.sn+")",u.id,u.name,ids,prop.id));}}};r.readAsDataURL(f);e.target.value="";};
  const tpMark=async(slot,present)=>{
    const name=(tpNames[slot.id]||"").trim()||slot.label;
    const ex=att.find(a=>a.uid===slot.id&&a.date===tk);
    if(present){if(ex){await supabase.from("attendance").update({user_name:name,check_in:"present"}).eq("user_id",slot.id).eq("date",tk);setAtt(p=>p.map(a=>a.uid===slot.id&&a.date===tk?{...a,name,ci:"present"}:a));}else{const{error}=await supabase.from("attendance").insert({user_id:slot.id,user_name:name,date:tk,check_in:"present"});if(!error)setAtt(p=>[...p,{uid:slot.id,name,date:tk,ci:"present",co:null,ciPhoto:null,coPhoto:null}]);}}
    else{await supabase.from("attendance").delete().eq("user_id",slot.id).eq("date",tk);setAtt(p=>p.filter(a=>!(a.uid===slot.id&&a.date===tk)));}
  };
  return(<div><h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:"0 0 12px"}}>🕐 {L.attendance} - {prop.sn}</h1>
    <input ref={attRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{display:"none"}}/>
    {(u.role==="e"||u.role==="a")&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:16}}><div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{L.today} - {tk}</div>
      {!mr?<Btn2 primary onClick={doCheckIn} style={{minHeight:isMobile?54:44,width:isMobile?"100%":"auto"}}>📸📍 {L.checkIn} (Photo)</Btn2>
      :!mr.co?<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:isMobile?"wrap":"nowrap"}}><Bdg color={C.green} bg={C.gBg}>✅ {mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover"}}/>}<Btn2 onClick={doCheckIn} style={{background:C.yBg,color:C.yellow,minHeight:isMobile?54:44,width:isMobile?"100%":"auto"}}>📸🚪 {L.checkOut}</Btn2></div>
      :<div style={{display:"flex",gap:6,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>In:{mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}<Bdg color={C.blue} bg={C.bBg}>Out:{mr.co}</Bdg>{mr.coPhoto&&<img src={mr.coPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}</div>}</div>}
    {isA&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}><h3 style={{fontFamily:F.d,fontSize:13,margin:"0 0 10px",color:C.maroon}}>{tk}</h3>{allM.map(m=>{const r=att.find(a=>a.uid===m.id&&a.date===tk);return(<div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:r?C.gBg:C.bg,borderRadius:8,marginBottom:4}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:m.dc||C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:9,fontWeight:700}}>{m.n[0]}</div>
      <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{m.n}</div></div>
      {r?<div style={{display:"flex",gap:3,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>{r.ci}</Bdg>{r.ciPhoto&&<img src={r.ciPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}{r.co?<><Bdg color={C.blue} bg={C.bBg}>{r.co}</Bdg>{r.coPhoto&&<img src={r.coPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}</>:<Bdg color={C.yellow} bg={C.yBg}>Working</Bdg>}</div>:<Bdg color={C.red} bg={C.rBg}>{L.notCheckedIn}</Bdg>}
    </div>);})}</div>}
    {isA&&tpSlots.length>0&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.purple}`}}>
      <h3 style={{fontFamily:F.d,fontSize:13,margin:"0 0 12px",color:C.purple}}>🛡️ 3rd Party Guards</h3>
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
  const C=useT();const[cv,setCV]=useState("daily");const[fD,sFD]=useState("all");const[fS,sFS]=useState("all");const[fC,sFC]=useState("all");const[sa,setSA]=useState(false);
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
      <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>{vt==="mytasks"?L.myTasks:L.dailyTasks||"Daily Tasks"} - {prop.sn}</h1>
      <div style={{display:"flex",gap:5}}>
        {<div style={{display:"flex",gap:2,background:C.maroonSoft,borderRadius:8,padding:2}}>{cO.map(v=><button key={v} onClick={()=>setCV(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,background:cv===v?C.maroon:"transparent",color:cv===v?C.white:C.maroon}}>{cL[v]}</button>)}</div>}
        {isA&&<Btn2 primary small onClick={()=>setSA(!sa)}>➕ {L.addTask}</Btn2>}
      </div>
    </div>
    {vt==="mytasks"&&!isA&&<div style={{background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`,marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:40,height:40,borderRadius:"50%",background:C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:F.d,fontSize:18,fontWeight:700}}>{u.name[0]}</div>
      <div style={{flex:1}}><div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon}}>{u.name}</div></div>
      <div style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon}}>{myPc}%</div>
    </div>}
    {vt==="mytasks"&&!isA&&<div style={{background:C.maroonSoft,borderRadius:8,padding:"7px 12px",marginBottom:10,fontSize:11}}>{L.steps}</div>}
    <Modal isOpen={sa&&isA} onClose={()=>setSA(false)} title={L.addTask} size="lg">
      <AddTF prop={prop} onAdd={(t)=>setTasks(prev=>[...prev,t])} onClose={()=>setSA(false)} L={L}/>
    </Modal>
    {vt==="tasks"&&<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}><Sel2 value={fD} onChange={sFD} options={[{v:"all",l:"All"},...Object.entries(prop?.depts||{}).map(([k,d])=>({v:k,l:`${d.i} ${d.n}`}))]}/><Sel2 value={fS} onChange={sFS} options={[{v:"all",l:"All"},{v:"pending",l:"⏳"},{v:"completed",l:"✅"},{v:"issue",l:"⚠️"}]}/><Sel2 value={fC} onChange={sFC} options={[{v:"all",l:"All"},{v:"daily",l:L.daily},{v:"weekly",l:L.weekly},{v:"monthly",l:L.monthly}]}/></div>}
    {cO.filter(c=>gr[c]).map(cat=>(<div key={cat} style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{width:4,height:12,borderRadius:2,background:cC[cat]}}/><h3 style={{fontFamily:F.d,fontSize:13,fontWeight:700,margin:0}}>{cL[cat]}</h3><Bdg color={cC[cat]} bg={`${cC[cat]}15`}>{gr[cat].length}</Bdg></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{gr[cat].map(task=><TC key={task.id} task={task} uTask={uT} delTask={isA?dT:null} depts={prop?.depts||{}} areas={prop?.areas||[]} user={u} allM={allM} L={L} lang={lang}/>)}</div></div>))}
    {fl.length===0&&<div style={{background:C.white,borderRadius:12,padding:24,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:22}}>🎉</div><div style={{fontFamily:F.d,fontSize:13,fontWeight:700,marginTop:4}}>{L.noTasks}</div></div>}
  </div>);
}



// ═══ ASSIGNED TASKS — SA + Office staff create tasks for Admins ═══
const ADMIN_TARGETS=[
  {id:"vicky",username:"vicky",name:"Vicky Arya",prop:"All",color:"#8B5CF6"},
  {id:"pp_sonu",username:"sonu",name:"Sonu Mali",prop:"Pushpanjali",color:"#0891B2"},
  {id:"ex_mahesh",username:"mahesh",name:"Mahesh",prop:"Exotica",color:"#D97706"},
  {id:"mk_rahees",username:"rahees",name:"Rahees",prop:"Manaktala",color:"#059669"},
  {id:"sandeep",username:"sandeep",name:"Sandeep",prop:"Security-All",color:"#6B21A8"},
  {id:"ex_simran",username:"simran",name:"Simran",prop:"Exotica HR",color:"#D4537E"},
];
const PROPERTY_ADMIN_IDS=ADMIN_TARGETS.map(t=>t.id);
// Find admin target by id OR username (handles DB id mismatches)
function findAT(u){return ADMIN_TARGETS.find(t=>t.id===u.id||(t.username&&t.username===u.username));}

function AssignedTasksView({user:u,dirs,setDirs,L,setNs,setView}){
  const C=useT();const isMobile=useIsMobile();
  const isSA=u.role==="sa";
  const isOfficeMember=OFFICE_DEPTS.includes(u.department);
  const canCreate=isSA||isOfficeMember;
  const[officeTab,setOfficeTab]=useState("sent");
  // Determine which dirs to show
  const sentDirs=dirs.filter(d=>d.from===u.id||(!!u.username&&d.from===u.username));
  const receivedDirs=dirs.filter(d=>d.to===u.id||(!!u.username&&d.to===u.username));
  const myDirs=isSA?dirs:isOfficeMember?(officeTab==="sent"?sentDirs:receivedDirs):receivedDirs;
  const[showNew,setShowNew]=useState(false);
  const[newTo,setNewTo]=useState("");
  const[admins,setAdmins]=useState([]);
  const[newText,setNewText]=useState("");
  const[newProp,setNewProp]=useState("all");
  const nPhRef=useRef(null);
  const[nPh,setNPh]=useState(null);
  const[nDue,setNDue]=useState("");
  const[filterTo,setFilterTo]=useState("all");

  // Fetch assign-to list: SA fetches real DB IDs; office staff uses ADMIN_TARGETS directly
  useEffect(()=>{
    if(!canCreate)return;
    if(isSA){
      supabase.from("users").select("id,name,property,username").eq("role","a")
        .then(({data})=>{
          if(data&&data.length>0){setAdmins(data);setNewTo(data[0].id);}
          else{const fb=ADMIN_TARGETS.map(t=>({id:t.id,name:t.name,property:t.prop,username:t.username}));setAdmins(fb);setNewTo(fb[0].id);}
        });
    }else{
      const targets=ADMIN_TARGETS.map(t=>({id:t.id,name:t.name,property:t.prop,username:t.username}));
      setAdmins(targets);setNewTo(targets[0].id);
    }
  },[canCreate,isSA]);

  const sendTask=async()=>{if(!newText.trim()||!newTo)return;
    const tgt=admins.find(a=>a.id===newTo)||{name:newTo};
    const tgtColor=ADMIN_TARGETS.find(t=>t.id===newTo||t.username===newTo)?.color||C.blue;
    const atId="at_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const{data,error}=await supabase.from("assigned_tasks").insert({id:atId,from_user:u.id,from_name:u.name,to_user:newTo,to_name:tgt.name||"",to_color:tgtColor,property:newProp,text:newText.trim(),photo_url:nPh?.data||null,status:"sent",due_date:nDue||null}).select().single();
    if(error){console.error("sendTask error:",error.message);return;}
    const newDir={id:data.id,from:u.id,fromName:u.name,to:newTo,toName:tgt.name||"",toColor:tgtColor,prop:newProp,text:newText.trim(),photo:nPh?.data||null,status:"sent",replies:[],remarksSA:"",dueDate:nDue||null,completedAt:null,completionNote:"",completionPhoto:null,createdAt:data.created_at,createdTime:new Date(data.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),createdDate:new Date(data.created_at).toLocaleDateString("en-IN")};
    setDirs(prev=>[newDir,...prev]);
    setNs(p=>[{type:"newTask",task:"📝 New task: "+newText.trim().slice(0,40),by:u.name,prop:newProp,time:newDir.createdTime,forUser:newTo},...p]);
    notifyMultiple("task_assigned","📝 New task from "+u.name+": "+newText.trim().slice(0,80),u.id,u.name,[newTo],newProp);
    setNewText("");setNPh(null);setNDue("");setShowNew(false);
  };

  const _atToday=new Date().toISOString().split("T")[0];
  const _isOverdueDir=(d)=>{const st=d.status==="approval_req"?"approval_requested":d.status;return st!=="completed"&&d.dueDate&&d.dueDate<_atToday;};
  const filteredDirs=(filterTo==="all"?myDirs:myDirs.filter(d=>d.to===filterTo)).sort((a,b)=>{const norm=s=>s==="approval_req"?"approval_requested":s;const aS=norm(a.status),bS=norm(b.status);const aOd=_isOverdueDir(a),bOd=_isOverdueDir(b);if(aOd&&!bOd)return -1;if(!aOd&&bOd)return 1;if(aS==="completed"&&bS!=="completed")return 1;if(bS==="completed"&&aS!=="completed")return -1;const saPri={approval_requested:0,rejected:1,sent:2,approved:3,completed:4};const admPri={rejected:0,sent:1,approval_requested:2,approved:3,completed:4};const pri=isSA?saPri:admPri;return(pri[aS]??5)-(pri[bS]??5);});

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>📝 {L.directives}</h1>
      {canCreate&&<Btn2 primary small onClick={()=>setShowNew(!showNew)}>➕ {L.newDirective}</Btn2>}
    </div>

    {/* OFFICE STAFF: Sent / Received tabs */}
    {isOfficeMember&&<div style={{display:"flex",background:C.maroonSoft,borderRadius:10,padding:3,gap:2,width:"fit-content",marginBottom:14}}>
      {[{id:"sent",i:"📤",l:"Sent",cnt:sentDirs.length},{id:"received",i:"📥",l:"Received",cnt:receivedDirs.length}].map(t=>{
        const active=officeTab===t.id;
        return(<button key={t.id} onClick={()=>setOfficeTab(t.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:active?700:400,background:active?C.maroon:"transparent",color:active?C.white:C.maroon}}>
          {t.i} {t.l}{t.cnt>0&&<span style={{background:active?"rgba(255,255,255,0.3)":C.maroon,color:C.white,borderRadius:10,padding:"0 5px",fontSize:9,fontWeight:700}}>{t.cnt}</span>}
        </button>);
      })}
    </div>}

    {/* NEW TASK FORM */}
    <Modal isOpen={showNew&&canCreate} onClose={()=>setShowNew(false)} title={`➕ ${L.newDirective}`} size="lg">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <SearchSelect value={newTo} onChange={setNewTo} options={admins.map(a=>({v:a.id,l:a.name+(a.property?` — ${a.property}`:"")}))} style={{width:"100%"}}/>
        <SearchSelect value={newProp} onChange={setNewProp} options={[{v:"all",l:"All Properties"},...Object.entries(PROPS).map(([k,p])=>({v:k,l:`${p.icon} ${p.sn}`}))]} style={{width:"100%"}}/>
      </div>
      <textarea placeholder={L.writeTask} value={newText} onChange={e=>setNewText(e.target.value)} style={{width:"100%",padding:12,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,minHeight:80,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,fontWeight:600,color:C.tl}}>📅 {L.dueDate}:</span><input type="date" value={nDue} onChange={e=>setNDue(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/></div>
        <button onClick={()=>nPhRef.current?.click()} style={{padding:"8px 14px",borderRadius:8,border:`1px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:C.accent}}>📸 {L.addPhoto}</button>
        {nPh&&<img src={nPh.data} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover"}}/>}
        <input ref={nPhRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith("image/")){alert("Please select an image file");return;}if(f.size>10*1024*1024){alert("Image too large. Max 10MB");return;}const r2=new FileReader();r2.onload=ev=>setNPh({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
      </div>
      <div style={{display:"flex",gap:8}}><Btn2 primary onClick={sendTask}>{L.send} →</Btn2><Btn2 onClick={()=>setShowNew(false)}>{L.cancel}</Btn2></div>
    </Modal>

    {/* FILTER BY MEMBER — color coded */}
    {isSA&&<div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
      <button onClick={()=>setFilterTo("all")} style={{padding:"6px 14px",borderRadius:8,border:filterTo==="all"?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:filterTo==="all"?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:C.maroon}}>All ({myDirs.length})</button>
      {admins.map(a=>{const tgt=ADMIN_TARGETS.find(t=>t.id===a.id||t.username===a.username);const col=tgt?.color||C.blue;const cnt=myDirs.filter(d=>d.to===a.id).length;return cnt>0&&<button key={a.id} onClick={()=>setFilterTo(a.id)} style={{padding:"6px 14px",borderRadius:8,border:filterTo===a.id?`2px solid ${col}`:`1px solid ${C.border}`,background:filterTo===a.id?col+"15":C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:col}}>{a.name} ({cnt})</button>;})}
    </div>}

    {/* TASK GRID */}
    <div style={{display:"grid",gridTemplateColumns:isMobile ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {filteredDirs.length===0&&<div style={{gridColumn:"1/-1",background:C.white,borderRadius:12,padding:30,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:22}}>📝</div><div style={{fontFamily:F.d,fontSize:13,fontWeight:700,marginTop:4}}>{L.noDirectives}</div></div>}
      {filteredDirs.map(dir=><ATCard key={dir.id} dir={dir} user={u} setDirs={setDirs} L={L} setNs={setNs}/>)}
    </div>
  </div>);
}

function ATCard({dir,user:u,setDirs,L,setNs}){
  const C=useT();const[showComplete,setShowComplete]=useState(false);
  const[cNote,setCNote]=useState("");
  const[cPhotos,setCPhotos]=useState([]);
  const[showReply,setShowReply]=useState(false);
  const[rText,setRText]=useState("");
  const[rPhotos,setRPhotos]=useState([]);
  const[showRemarks,setShowRemarks]=useState(false);
  const[remarks,setRemarks]=useState("");
  const[showViewer,setShowViewer]=useState(false);
  const[viewerPhotos,setViewerPhotos]=useState([]);
  const[viewerIdx,setViewerIdx]=useState(0);
  const cRef=useRef(null);const cGallRef=useRef(null);
  const rRef=useRef(null);const rGallRef=useRef(null);
  const isSA=u.role==="sa";
  const isTarget=dir.to===u.id||(!!u.username&&dir.to===u.username);
  const isCreator=!isSA&&(dir.from===u.id||(!!u.username&&dir.from===u.username));
  const canApproveReject=isSA||isCreator;
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

  const isOverdue=dir.dueDate&&new Date(dir.dueDate)<td&&status!=="completed";
  const dueFmt=dir.dueDate?new Date(dir.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"";
  const overdueDays=isOverdue?Math.floor((td-new Date(dir.dueDate))/86400000):0;

  // MARK COMPLETE — at least 1 photo REQUIRED, compress + upload all
  const handleComplete=async()=>{
    if(!cPhotos.length)return;
    const uploadedUrls=[];
    for(let i=0;i<cPhotos.length;i++){
      const compressed=await compressImage(cPhotos[i].data);
      let url=compressed;
      try{
        const fn=`assigned/${dir.id}/${Date.now()}_${i}.jpg`;
        const b64=compressed.split(",")[1];
        const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
        const{error:upErr}=await supabase.storage.from("photos").upload(fn,bytes,{contentType:"image/jpeg",upsert:true});
        if(!upErr){const{data:uD}=supabase.storage.from("photos").getPublicUrl(fn);url=uD.publicUrl;}
      }catch(e){}
      uploadedUrls.push(url);
    }
    const photoJson=JSON.stringify(uploadedUrls);
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const dt=new Date().toLocaleDateString("en-IN");
    const replyText="✅ "+(L.markComplete||"Marked Complete")+(cNote.trim()?" — "+cNote.trim():"");
    const[,{data:repRow}]=await Promise.all([
      supabase.from("assigned_tasks").update({status:"completed",completed_at:new Date().toISOString(),completion_note:cNote.trim()||null,completion_photo:photoJson}).eq("id",dir.id),
      supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:replyText,photo_url:photoJson,reply_type:"completed"}).select().single()
    ]);
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:replyText,photo:photoJson,type:"completed",time:tm,date:dt};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"completed",completedAt:new Date().toISOString(),completionNote:cNote.trim(),completionPhoto:photoJson,replies:[...d.replies,newReply]}:d));
    setNs(p=>[{type:"completed",task:"✅ Completed: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.from},...p]);
    notifyMultiple("assigned_completed","📸 "+u.name+" completed: "+dir.text.slice(0,80),u.id,u.name,[dir.from],dir.prop);
    setCNote("");setCPhotos([]);setShowComplete(false);
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
    notifyMultiple("approval_request","📋 "+u.name+" requests approval: "+dir.text.slice(0,80),u.id,u.name,[dir.from],dir.prop);
  };

  const addReply=async()=>{
    if(!rText.trim()&&!rPhotos.length)return;
    let photoJson=null;
    if(rPhotos.length>0){
      const uploadedUrls=[];
      for(let i=0;i<rPhotos.length;i++){
        const compressed=await compressImage(rPhotos[i].data);
        let url=compressed;
        try{
          const fn=`assigned/reply_${dir.id}/${Date.now()}_${i}.jpg`;
          const b64=compressed.split(",")[1];
          const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
          const{error:upErr}=await supabase.storage.from("photos").upload(fn,bytes,{contentType:"image/jpeg",upsert:true});
          if(!upErr){const{data:uD}=supabase.storage.from("photos").getPublicUrl(fn);url=uD.publicUrl;}
        }catch(e){}
        uploadedUrls.push(url);
      }
      photoJson=JSON.stringify(uploadedUrls);
    }
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const{data:repRow}=await supabase.from("assigned_task_replies").insert({task_id:dir.id,by_user:u.id,by_name:u.name,text:rText.trim(),photo_url:photoJson,reply_type:"reply"}).select().single();
    const newReply={id:repRow?.id||"r_"+Date.now(),by:u.name,text:rText.trim(),photo:photoJson,type:"reply",time:tm,date:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,replies:[...d.replies,newReply]}:d));
    setRText("");setRPhotos([]);setShowReply(false);
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
    notifyMultiple("task_approved","✅ "+u.name+" approved: "+dir.text.slice(0,80),u.id,u.name,[dir.to],dir.prop);
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
    notifyMultiple("task_rejected","❌ "+u.name+" rejected: "+dir.text.slice(0,60)+" — see remarks",u.id,u.name,[dir.to],dir.prop);
    setRemarks("");setShowRemarks(false);
  };

  return(<div style={{background:isOverdue?"#FFF5F5":cardBg,borderRadius:12,border:`1px solid ${isOverdue?"#CC0000":bdrC}`,overflow:"hidden",borderTop:`4px solid ${isOverdue?"#CC0000":topC}`,borderLeft:isOverdue?"4px solid #CC0000":undefined}}>
    {/* HEADER */}
    <div style={{padding:"10px 14px",borderBottom:`1px solid ${bdrC}`,display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:30,height:30,borderRadius:"50%",background:mC,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:11,flexShrink:0}}>{dir.toName[0]}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:700,color:mC}}>→ {dir.toName}</div>
        {!isSA&&isTarget&&dir.fromName&&<div style={{fontSize:9,color:C.tl,marginTop:1}}>From: {dir.fromName}</div>}
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:1}}>
          <span style={{fontSize:9,color:C.tl}}>{dir.createdDate} · {dir.createdTime}</span>
          {dueFmt&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:isOverdue?"#FFE4E4":C.yBg,color:isOverdue?"#CC0000":C.yellow}}>{isOverdue?"⚠️ "+(L.overdue||"Overdue"):"📅 "+(L.dueOn||"Due")} {dueFmt}</span>}
          {isOverdue&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:"#CC0000",color:"#FFF",animation:"overduePulse 2s ease-in-out infinite"}}>⚠️ {overdueDays}d {L.overdue||"OVERDUE"}</span>}
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
        <div style={{fontSize:10,fontWeight:700,color:C.red,marginBottom:3}}>❌ {L.saRemarks||"Feedback — Rework Required"}</div>
        <div style={{fontSize:12,color:C.red}}>{dir.remarksSA}</div>
      </div>}

      {/* APPROVED — "complete work on ground" message */}
      {status==="approved"&&isTarget&&<div style={{background:C.gBg,border:`1px solid ${C.green}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:C.green}}>✅ {L.approvedMsg||"Approved! Complete the work on ground, then mark complete with photo proof."}</div>
      </div>}

      {/* AWAITING APPROVAL — waiting message for target; action hint for creator */}
      {status==="approval_requested"&&isTarget&&<div style={{background:"#FFF7ED",border:`1px solid ${C.accent}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:600,color:C.accent}}>🔔 {L.waitingApproval||"Approval request sent. Waiting for review."}</div>
      </div>}
      {status==="approval_requested"&&isCreator&&<div style={{background:"#FFF7ED",border:`1px solid ${C.accent}`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:600,color:C.accent}}>🔔 {dir.toName} sent for approval — approve or reject below.</div>
      </div>}

      {/* COMPLETION PROOF */}
      {isCompleted&&(()=>{const cphotos=parsePhotos(dir.completionPhoto);return(<div style={{background:C.gBg,border:`1px solid #b8dcc8`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:700,color:C.green,marginBottom:4}}>✅ {L.completedWork||"Completed"} {cphotos.length>0&&`(${cphotos.length} photo${cphotos.length>1?"s":""})`}</div>
        {dir.completionNote&&<div style={{fontSize:11,marginBottom:6,color:C.text}}>{dir.completionNote}</div>}
        {cphotos.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:4}}>{cphotos.map((p,i)=><img key={i} src={p} alt="" onClick={()=>{setViewerPhotos(cphotos);setViewerIdx(i);setShowViewer(true);}} style={{width:64,height:64,borderRadius:6,objectFit:"cover",border:`1px solid #b8dcc8`,cursor:"pointer"}}/>)}</div>}
        {dir.completedAt&&<div style={{fontSize:9,color:C.tl,marginTop:2}}>{new Date(dir.completedAt).toLocaleString("en-IN")}</div>}
      </div>);})()}

      {/* REPLIES THREAD */}
      {dir.replies.length>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
        {dir.replies.map((r,i)=>{
          const rBg=r.type==="approved"?C.gBg:r.type==="rejected"?C.rBg:r.type==="approval_requested"||r.type==="approval_req"?"#FFF7ED":r.type==="completed"?C.gBg:C.bg;
          const rC2=r.type==="approved"?C.green:r.type==="rejected"?C.red:r.type==="approval_requested"||r.type==="approval_req"?C.accent:r.type==="completed"?C.green:C.blue;
          return(<div key={r.id||i} style={{display:"flex",gap:6,marginBottom:6,padding:8,background:rBg,borderRadius:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:rC2,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:9,fontWeight:700,flexShrink:0}}>{r.by[0]}</div>
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{r.by} <span style={{fontWeight:400,color:C.tl}}>{r.time}</span></div>
              {r.text&&<div style={{fontSize:11,marginTop:2}}>{r.text}</div>}
              {r.photo&&(()=>{const rps=parsePhotos(r.photo);return rps.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{rps.map((p,pi)=><img key={pi} src={p} alt="" onClick={()=>{setViewerPhotos(rps);setViewerIdx(pi);setShowViewer(true);}} style={{width:56,height:56,borderRadius:5,objectFit:"cover",cursor:"pointer",border:`1px solid ${C.border}`}}/>)}</div>;})()}
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
        {/* SA/creator: Reply on any non-completed task */}
        {(isSA||isCreator)&&<Btn2 small onClick={()=>setShowReply(!showReply)}>💬 {L.reply||"Reply"}</Btn2>}
        {/* SA/creator: Approve / Reject only when approval_requested */}
        {canApproveReject&&status==="approval_requested"&&!showRemarks&&<>
          <Btn2 primary small onClick={handleOk} style={{background:C.green}}>✅ {L.okApproval||"Approve"}</Btn2>
          <Btn2 small onClick={()=>setShowRemarks(true)} style={{background:C.rBg,color:C.red}}>❌ {L.notOk||"Reject"}</Btn2>
        </>}
      </div>}

      {/* SA: Reject — remarks modal */}
      <Modal isOpen={canApproveReject&&showRemarks} onClose={()=>setShowRemarks(false)} title="❌ Reject — Write Remarks" size="sm">
        <textarea placeholder={L.writeRemarks||"Write remarks for admin..."} value={remarks} onChange={e=>setRemarks(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.red}`,fontFamily:F.b,fontSize:12,minHeight:70,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
        <div style={{display:"flex",gap:6}}><Btn2 small onClick={handleNotOk} style={{background:C.rBg,color:C.red}}>❌ {L.send||"Send"}</Btn2><Btn2 small onClick={()=>setShowRemarks(false)}>{L.cancel||"Cancel"}</Btn2></div>
      </Modal>

      {/* MARK COMPLETE — modal */}
      <Modal isOpen={showComplete&&isTarget&&(status==="sent"||status==="rejected"||status==="approved")} onClose={()=>setShowComplete(false)} title={`📸 ${L.markComplete||"Mark Complete"}`} size="sm">
        <div style={{fontSize:10,color:C.tl,marginBottom:8}}>At least 1 photo is <strong>required</strong>. Add multiple for better proof.</div>
        <textarea placeholder={L.completionNote||"Completion note (optional)"} value={cNote} onChange={e=>setCNote(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:60,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
        {/* Thumbnails */}
        {cPhotos.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{cPhotos.map((p,i)=><div key={i} style={{position:"relative",width:60,height:60}}><img src={p.data} alt="" style={{width:60,height:60,borderRadius:6,objectFit:"cover",border:`1px solid ${C.green}`}}/><button onClick={()=>setCPhotos(prev=>prev.filter((_,j)=>j!==i))} style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",border:"none",background:C.red,color:C.white,fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button></div>)}</div>}
        {/* Add buttons */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          <button onClick={()=>cRef.current?.click()} style={{padding:"7px 12px",borderRadius:8,border:`2px dashed ${cPhotos.length?C.green:C.red}`,background:cPhotos.length?C.gBg:"#FFF5F5",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:cPhotos.length?C.green:C.red}}>📷 Camera</button>
          <button onClick={()=>cGallRef.current?.click()} style={{padding:"7px 12px",borderRadius:8,border:`2px dashed ${C.blue}`,background:C.bBg,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:C.blue}}>🖼 Gallery {cPhotos.length>0&&"(+more)"}</button>
          <input ref={cRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f||!f.type.startsWith("image/"))return;const r2=new FileReader();r2.onload=ev=>setCPhotos(prev=>[...prev,{data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]);r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
          <input ref={cGallRef} type="file" accept="image/*" multiple onChange={e=>{const files=Array.from(e.target.files||[]);files.forEach(f=>{if(!f.type.startsWith("image/"))return;const r2=new FileReader();r2.onload=ev=>setCPhotos(prev=>[...prev,{data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]);r2.readAsDataURL(f);});e.target.value="";}} style={{display:"none"}}/>
        </div>
        {!cPhotos.length&&<div style={{fontSize:10,color:C.red,marginBottom:8}}>📸 Take or select at least 1 photo to complete</div>}
        <Btn2 primary small onClick={handleComplete} style={{background:cPhotos.length?C.green:"#aaa",cursor:cPhotos.length?"pointer":"not-allowed",opacity:cPhotos.length?1:0.6}}>✅ {L.markComplete||"Mark Complete"} {cPhotos.length>0&&`(${cPhotos.length} photo${cPhotos.length>1?"s":""})`}</Btn2>
      </Modal>

      {/* REPLY — modal */}
      <Modal isOpen={showReply} onClose={()=>setShowReply(false)} title={`💬 ${L.reply||"Reply"}`} size="sm">
        <textarea placeholder={L.replyHere||"Write reply..."} value={rText} onChange={e=>setRText(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:70,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        {rPhotos.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>{rPhotos.map((p,i)=><div key={i} style={{position:"relative",width:52,height:52}}><img src={p.data} alt="" style={{width:52,height:52,borderRadius:5,objectFit:"cover",border:`1px solid ${C.border}`}}/><button onClick={()=>setRPhotos(prev=>prev.filter((_,j)=>j!==i))} style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",border:"none",background:C.red,color:C.white,fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button></div>)}</div>}
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>rRef.current?.click()} style={{padding:"6px 10px",borderRadius:6,border:`1px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:C.accent}}>📷</button>
          <button onClick={()=>rGallRef.current?.click()} style={{padding:"6px 10px",borderRadius:6,border:`1px dashed ${C.blue}`,background:C.bBg,cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:C.blue}}>🖼</button>
          <input ref={rRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f||!f.type.startsWith("image/"))return;const r2=new FileReader();r2.onload=ev=>setRPhotos(prev=>[...prev,{data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]);r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
          <input ref={rGallRef} type="file" accept="image/*" multiple onChange={e=>{const files=Array.from(e.target.files||[]);files.forEach(f=>{if(!f.type.startsWith("image/"))return;const r2=new FileReader();r2.onload=ev=>setRPhotos(prev=>[...prev,{data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]);r2.readAsDataURL(f);});e.target.value="";}} style={{display:"none"}}/>
          <Btn2 primary small onClick={addReply}>{L.send||"Send"} {rPhotos.length>0&&`📸${rPhotos.length}`}</Btn2>
        </div>
      </Modal>
    </div>
    <PhotoViewer photos={viewerPhotos} isOpen={showViewer} onClose={()=>setShowViewer(false)}/>
  </div>);
}


function useIsMobile(){
  const[m,setM]=useState(()=>window.innerWidth<768);
  useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return m;
}

function BottomNav({nav,view,setView,onLogout,user:u,nC,setShowN,lang,setLang,L,toggleTheme,theme}){
  const C=useT();const[showMore,setShowMore]=useState(false);
  const main=nav.slice(0,5);const more=nav.slice(5);
  return(<>
    {showMore&&<div onClick={()=>setShowMore(false)} style={{position:"fixed",inset:0,zIndex:97,background:"rgba(0,0,0,0.3)"}}/>}
    {showMore&&<div style={{position:"fixed",bottom:60,left:0,right:0,background:C.white,borderTop:`1px solid ${C.border}`,zIndex:98,padding:"8px 8px 4px",boxShadow:"0 -4px 16px rgba(0,0,0,0.12)"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {more.map(n=><button key={n.id} onClick={()=>{setView(n.id);setShowMore(false);}} style={{flex:"1 1 auto",minWidth:100,padding:"10px 8px",display:"flex",alignItems:"center",gap:8,border:"none",background:view===n.id?C.maroonSoft:"transparent",cursor:"pointer",borderRadius:10,color:view===n.id?C.maroon:C.text,fontFamily:F.b,fontSize:13,fontWeight:view===n.id?700:400}}>
          <span style={{fontSize:22}}>{n.i}</span><span>{n.l}</span>
          {n.badge>0&&<span style={{background:n.badgeRed?"#CC0000":C.red,color:C.white,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700,marginLeft:"auto"}}>{n.badge}</span>}
        </button>)}
      </div>
      <div style={{display:"flex",gap:4,marginTop:4,padding:"4px 0",borderTop:`1px solid ${C.border}`}}>
        <button onClick={()=>setLang(lang==="en"?"hi":"en")} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:13,cursor:"pointer",color:C.maroon,fontWeight:600}}>🌐 {lang==="en"?L.hi:L.en}</button>
        <button onClick={toggleTheme} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,fontFamily:F.b,fontSize:13,cursor:"pointer",color:C.maroon,fontWeight:600}}>{theme==="light"?"🌙":"☀️"}</button>
        <button onClick={()=>setShowN(true)} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${nC>0?C.accent:C.border}`,background:nC>0?"#FFF7ED":C.bg,cursor:"pointer",fontFamily:F.b,fontSize:13,fontWeight:600,color:nC>0?C.accent:C.tl}}>🔔{nC>0&&<span style={{background:C.red,color:C.white,borderRadius:10,padding:"0 5px",fontSize:10,marginLeft:4}}>{nC}</span>}</button>
        <button onClick={onLogout} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${C.red}`,background:C.rBg,color:C.red,fontFamily:F.b,fontSize:13,fontWeight:600,cursor:"pointer"}}>🚪</button>
      </div>
    </div>}
    <div className="mobile-bottom-nav" style={{position:"fixed",bottom:0,left:0,right:0,height:60,background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"stretch",zIndex:99,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {main.map(n=><button key={n.id} onClick={()=>setView(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"none",background:"transparent",cursor:"pointer",position:"relative",padding:"4px 0"}}>
        <span style={{fontSize:22,lineHeight:1}}>{n.i}</span>
        {view===n.id&&<div style={{width:5,height:5,borderRadius:"50%",background:C.maroon}}/>}
        {n.badge>0&&<span style={{position:"absolute",top:4,right:"15%",background:n.badgeRed?"#CC0000":C.red,color:C.white,borderRadius:10,padding:"0 5px",fontSize:10,fontWeight:700}}>{n.badge}</span>}
      </button>)}
      {more.length>0&&<button onClick={()=>setShowMore(p=>!p)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"none",background:showMore?C.maroonSoft:"transparent",cursor:"pointer",padding:"4px 0"}}>
        <span style={{fontSize:22,lineHeight:1}}>⋯</span>
        {showMore&&<div style={{width:5,height:5,borderRadius:"50%",background:C.maroon}}/>}
      </button>}
    </div>
  </>);
}

function PropBar({ap,setAP,user:u}){
  const C=useT();const uprop=u.prop||u.property||"pp";const av=uprop==="all"?Object.values(PROPS):[PROPS[uprop]].filter(Boolean);
  return(<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{av.map(p=>{const a=ap===p.id;return(<button key={p.id} onClick={()=>setAP(p.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:a?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:a?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b}}><span style={{fontSize:13}}>{p.icon}</span><span style={{fontSize:10,fontWeight:a?700:500,color:a?C.maroon:C.text}}>{p.sn}</span>{a&&<span style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>}</button>);})}</div>);
}

// ═══ MOBILE HEADER ═══
function MobileHeader({prop,nC,setShowN,lang,setLang,L,onRefresh,refreshing,toggleTheme,theme}){
  const C=useT();
  return(
    <div className="mobile-header" style={{display:"none",position:"sticky",top:0,left:0,right:0,height:50,background:C.white,borderBottom:`1px solid ${C.border}`,zIndex:45,alignItems:"center",justifyContent:"space-between",padding:"0 12px",gap:8}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{prop?.sn||"Ambria"}</div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
        <button onClick={onRefresh} style={{width:36,height:36,borderRadius:"50%",border:"none",background:C.bg,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{display:"inline-block",animation:refreshing?"pullSpin 0.8s linear infinite":undefined}}>🔄</span></button>
        <button onClick={()=>setLang(lang==="en"?"hi":"en")} style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:10,fontWeight:700,color:C.maroon,display:"flex",alignItems:"center",justifyContent:"center"}}>{lang==="en"?"हि":"EN"}</button>
        <button onClick={toggleTheme} style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{theme==="light"?"🌙":"☀️"}</button>
        <button onClick={()=>setShowN(true)} style={{width:36,height:36,borderRadius:"50%",border:"none",background:nC>0?"#FFF7ED":C.bg,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          🔔{nC>0&&<span style={{position:"absolute",top:2,right:2,width:16,height:16,borderRadius:"50%",background:C.red,color:C.white,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{nC>9?"9+":nC}</span>}
        </button>
      </div>
    </div>
  );
}

// ═══ APP ═══
export default function App(){
  const isMobile=useIsMobile();
  const[theme,setTheme]=useState(()=>localStorage.getItem("ambria-theme")||"light");
  const toggleTheme=()=>setTheme(t=>{const n=t==="light"?"dark":"light";localStorage.setItem("ambria-theme",n);return n;});
  const TH=THEMES[theme];const C=TH;
  const[valetMode,setValetMode]=useState(false);
  const[lang,setLang]=useState("en");const[user,setUser]=useState(()=>{try{const s=localStorage.getItem("ambria_user");if(!s)return null;const u=JSON.parse(s);if(u&&u.role!=="sa"&&findAT(u))u.role="a";return u;}catch{return null;}});const[aP,sAP]=useState("pp");const[view,sV]=useState("dashboard");const[tS,sTS]=useState(ALL_T);const[ns,setNs]=useState([]);const[sN,setSN]=useState(false);const[att,setAtt]=useState([]);const[pm,setPM]=useState(false);const[pAs,setPAs]=useState("");const[allDbUsers,setAllDbUsers]=useState([]);const[dirs,setDirs]=useState([]);const[atLoaded,setAtLoaded]=useState(false);const[customMembers,setCM]=useState([]);const[removedIds,setRI]=useState([]);const[loading,setLoading]=useState(false);
  const[refreshKey,setRK]=useState(0);const[refreshing,setRefreshing]=useState(false);
  const ptrStartY=useRef(0);const ptrActive=useRef(false);
  const L=LANGS[lang];
  useEffect(()=>{document.body.style.background=C.bg;document.body.style.color=C.text;document.body.style.transition="background 0.3s,color 0.3s";},[theme]);
  const allS=useMemo(()=>Object.entries(PROPS).flatMap(([pk,p])=>Object.entries(p.depts).flatMap(([dk,d])=>d.m.map(m=>({...m,dept:dk,dn:d.n,di:d.i,pid:pk,pn:p.sn})))),[]);

  // ═══ LOAD ALL DATA FROM SUPABASE AFTER LOGIN ═══
  useEffect(()=>{
    if(!user)return;
    const today=new Date().toISOString().split("T")[0];
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
        if(user.role!=="sa"){
          const _uid=user.id||"";const _uname=user.username||"";
          const _isOffice=OFFICE_DEPTS.includes(user.department);
          if(_isOffice){
            // Office staff see tasks they sent (from_user) OR tasks assigned to them (to_user)
            if(_uname&&_uname!==_uid){atQ=atQ.or(`from_user.eq.${_uid},to_user.eq.${_uid},from_user.eq.${_uname},to_user.eq.${_uname}`);}
            else{atQ=atQ.or(`from_user.eq.${_uid},to_user.eq.${_uid}`);}
          }else{
            // Property admins and employees: only tasks assigned to them
            if(_uname&&_uname!==_uid){atQ=atQ.or(`to_user.eq.${_uid},to_user.eq.${_uname}`);}
            else{atQ=atQ.eq("to_user",_uid);}
          }
        }
        const[{data:atData},{data:repData},{data:attData}]=await Promise.all([atQ,supabase.from("assigned_task_replies").select("*").order("created_at"),supabase.from("attendance").select("*").eq("date",today)]);
        if(attData&&attData.length>0){setAtt(attData.map(r=>({uid:r.user_id,name:r.user_name,date:r.date,ci:r.check_in,co:r.check_out,ciPhoto:null,coPhoto:null})));}
        if(atData){
          const repMap={};
          (repData||[]).forEach(r=>{if(!repMap[r.task_id])repMap[r.task_id]=[];repMap[r.task_id].push({id:r.id,by:r.by_name,text:r.text,photo:r.photo_url,type:r.reply_type,time:new Date(r.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),date:new Date(r.created_at).toLocaleDateString("en-IN")});});
          setDirs(atData.map(t=>({id:t.id,from:t.from_user,fromName:t.from_name,to:t.to_user,toName:t.to_name,toColor:t.to_color,prop:t.property,text:t.text,photo:t.photo_url,status:t.status,replies:repMap[t.id]||[],dueDate:t.due_date,completedAt:t.completed_at,completionNote:t.completion_note||"",completionPhoto:t.completion_photo,remarksSA:t.remarks_sa||"",createdAt:t.created_at,createdTime:new Date(t.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),createdDate:new Date(t.created_at).toLocaleDateString("en-IN")})));
        }
        setAtLoaded(true);
        // 3. Custom members from users table (those not in PROPS template)
        const allTemplateIds=new Set(allS.map(m=>m.id));
        const{data:allUsers}=await supabase.from("users").select("id,name,username,role,property,department,joining_date,is_active,access,designation");
        if(allUsers){
          const extra=allUsers.filter(u=>!allTemplateIds.has(u.id)&&u.role!=="sa");
          setCM(extra.map(u=>({id:u.id,n:u.name,u:u.username,prop:u.property||"all",dept:u.department,role:u.role||"e",joining_date:u.joining_date,is_active:u.is_active!==false,access:u.access||[],designation:u.designation||null})));
          const inactive=allUsers.filter(u=>u.is_active===false).map(u=>u.id);
          setRI(inactive);
          setAllDbUsers(allUsers.filter(u=>u.is_active!==false&&u.role!=="sa"));
        }
        // 4. Notifications for current user
        const{data:notifData}=await supabase.from("notifications").select("*").eq("for_user",user.id).eq("is_read",false).order("created_at",{ascending:false}).limit(50);
        if(notifData&&notifData.length>0){setNs(notifData.map(n=>({id:n.id,type:n.type,task:n.task_text,by:n.by_name,prop:n.property,time:new Date(n.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})));}
        // 5. Fire extinguisher expiry check — once per day for SA/Admin
        if(user.role==="sa"||user.role==="a"){checkFireExtinguisherExpiry(user.id);}
        // 6. Daily overdue reminder — once per day for SA/Admin
        if((user.role==="sa"||user.role==="a")&&atData){
          const _todayKey="ambria_overdue_check_"+new Date().toISOString().split("T")[0]+"_"+user.id;
          if(!localStorage.getItem(_todayKey)){
            const _todayISO=new Date().toISOString().split("T")[0];
            const _overdue=atData.filter(t=>{const st=t.status==="approval_req"?"approval_requested":t.status;return st!=="completed"&&t.due_date&&t.due_date<_todayISO;});
            if(_overdue.length>0){
              // Send summary notification to SA/admin
              await supabase.from("notifications").insert({for_user:user.id,type:"overdue_summary",task_text:`⚠️ ${_overdue.length} overdue task${_overdue.length>1?"s":""} need attention today`,by_name:"System",property:"all",is_read:false});
              localStorage.setItem(_todayKey,"1");
            }
          }
        }
      }catch(e){console.error("Load error:",e);}
      finally{setLoading(false);setRefreshing(false);}
    })();
  },[user?.id, refreshKey]);

  // ═══ POLL NOTIFICATIONS EVERY 30s ═══
  useEffect(()=>{
    if(!user)return;
    const poll=async()=>{
      const{data}=await supabase.from("notifications").select("id,type,task_text,by_name,property,created_at").eq("for_user",user.id).eq("is_read",false).order("created_at",{ascending:false}).limit(50);
      if(data)setNs(data.map(n=>({id:n.id,type:n.type,task:n.task_text,by:n.by_name,prop:n.property,time:new Date(n.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})));
    };
    const iv=setInterval(poll,30000);
    return()=>clearInterval(iv);
  },[user?.id]);

  if(valetMode)return <ValetPortal onExitValet={()=>setValetMode(false)}/>;
  if(!user)return <LoginScreen onLogin={(u2,rememberMe)=>{
    const u3={...u2, prop: u2.property||u2.prop||"pp", dept: u2.department||u2.dept||null, name: u2.name||u2.n||"User"};
    const _at3=findAT(u3);if(u3.role!=="sa"&&_at3)u3.role="a";
    if(rememberMe)localStorage.setItem("ambria_user",JSON.stringify(u3));
    setUser(u3);
    if(u3.prop&&u3.prop!=="all")sAP(u3.prop);
    sV(u3.role==="e"?"mytasks":"dashboard");
  }} lang={lang} setLang={setLang} onValetMode={()=>setValetMode(true)}/>;

  // Preview mode: resolve preview user from DB first, fallback to allS template
  let previewDbUser=null;
  if(pm&&user.role==="sa"&&pAs){
    previewDbUser=allDbUsers.find(u=>u.id===pAs);
    if(!previewDbUser){const s=allS.find(x=>x.id===pAs);if(s)previewDbUser={id:s.id,name:s.n,role:"e",property:s.pid,department:s.dept,username:s.u||""};}
  }
  const eU=previewDbUser?{id:previewDbUser.id,name:previewDbUser.name,role:previewDbUser.role||"e",prop:previewDbUser.property||"pp",department:previewDbUser.department,username:previewDbUser.username}:user;
  const hasCustomAccess=!!(eU.access&&eU.access.length>0);
  const isA=eU.role==="sa"||eU.role==="a"||!!findAT(eU)||hasCustomAccess;
  const eP=previewDbUser?(eU.prop==="all"?"pp":eU.prop):aP;
  const prop=PROPS[eP]||PROPS[Object.keys(PROPS)[0]];const tasks=tS[eP]||[];
  const setTasks=(fn)=>{sTS(prev=>{const nt=typeof fn==="function"?fn(prev[eP]||[]):fn;const ot=prev[eP]||[];nt.forEach(n2=>{const o=ot.find(t=>t.id===n2.id);if(o){const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});if(o.status!=="completed"&&n2.status==="completed"){setNs(p=>[{type:"done",task:n2.title,by:n2.completedBy||n2.assigneeName,prop:prop.sn,time:tm},...p]);getSAAndAdminIds(eP).then(ids=>notifyMultiple("task_completed","✅ "+n2.assigneeName+" completed: "+n2.title+" ("+prop.sn+")",n2.assignedTo,n2.assigneeName,ids,eP));}if(o.status!=="issue"&&n2.status==="issue"){setNs(p=>[{type:"issue",task:n2.title,by:n2.assigneeName,prop:prop.sn,time:tm},...p]);getSAAndAdminIds(eP).then(ids=>notifyMultiple("issue_reported","⚠️ "+n2.assigneeName+" reported issue: "+n2.title,n2.assignedTo,n2.assigneeName,ids,eP));}if(o.status!==n2.status||o.notes!==n2.notes||(n2.photos?.length||0)!==(o.photos?.length||0))syncTask(n2);}});return{...prev,[eP]:nt};});};

  const _badgeIsOffice=OFFICE_DEPTS.includes(eU.department);
  const _todayStr=new Date().toISOString().split("T")[0];
  const _overdueDirs=dirs.filter(d=>{const st=d.status==="approval_req"?"approval_requested":d.status;return st!=="completed"&&d.dueDate&&d.dueDate<_todayStr;});
  const pendDirsBadge=dirs.filter(d=>
    eU.role==="sa"&&!pm?(d.status==="approval_requested"||d.status==="approval_req")
    :_badgeIsOffice?((d.to===eU.id&&(d.status==="sent"||d.status==="rejected"))||(d.from===eU.id&&(d.status==="approval_requested"||d.status==="approval_req")))
    :d.to===eU.id&&(d.status==="sent"||d.status==="rejected"||d.status==="approved"))
  .length + _overdueDirs.length;
  const _dirsBadgeRed=_overdueDirs.length>0;
  const ALL_ADMIN_NAV=[{id:"dashboard",i:"📊",l:L.dashboard},{id:"tasks",i:"✅",l:L.dailyTasks||"Daily Tasks"},{id:"directives",i:"📝",l:L.directives,badge:pendDirsBadge,badgeRed:_dirsBadgeRed},{id:"team",i:"👥",l:L.team||"Team"},{id:"att",i:"🕐",l:L.attendance},{id:"roster",i:"🗓️",l:L.roster||"Duty Roster"},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:L.training||"Training"},{id:"chemicals",i:"🧪",l:L.chemCalc||"Chemicals"},{id:"valet",i:"🚗",l:L.valetPlan||"Valet Planning"},{id:"vendors",i:"📞",l:L.vendorDir||"Vendors"},{id:"fire",i:"🧯",l:L.fireSafety||"Fire Safety"}];
  const EMP_NAV=[{id:"mytasks",i:"✅",l:L.myTasks},{id:"att",i:"🕐",l:L.attendance},{id:"leaves",i:"🏖️",l:L.leaveRequest||"Leaves"},{id:"training",i:"🎓",l:L.training||"Training"}];
  const navForBottom=isA?(eU.role==="sa"?ALL_ADMIN_NAV:(!eU.access||!eU.access.length)?ALL_ADMIN_NAV:ALL_ADMIN_NAV.filter(n=>eU.access.includes(n.id))):EMP_NAV;
  const onLogout=()=>{localStorage.removeItem("ambria_user");setUser(null);setPM(false);setPAs("");sV("dashboard");};
  const doRefresh=()=>{setRefreshing(true);setRK(k=>k+1);};
  const onPTRStart=e=>{ptrStartY.current=e.touches[0].clientY;ptrActive.current=false;};
  const onPTRMove=e=>{if(window.scrollY===0&&e.touches[0].clientY-ptrStartY.current>10)ptrActive.current=true;};
  const onPTREnd=e=>{if(ptrActive.current&&e.changedTouches[0].clientY-ptrStartY.current>80){doRefresh();}ptrActive.current=false;};

  return(<ThemeContext.Provider value={TH}><div style={{fontFamily:F.b,background:C.bg,minHeight:"100vh",color:C.text,transition:"background 0.3s,color 0.3s"}}>
    {loading&&<div style={{position:"fixed",inset:0,background:C.white+"EE",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}><div style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,lineHeight:1.2}}>Ambria Work Force</div><div style={{fontSize:13,color:C.tl}}>Loading data...</div></div>}
    <div className="desktop-sidebar"><Sidebar view={view} setView={sV} user={user} effectiveUser={eU} onLogout={onLogout} lang={lang} setLang={setLang} nC={ns.length} setShowN={setSN} L={L} pm={pm} setPM={setPM} pAs={pAs} setPAs={setPAs} allDbUsers={allDbUsers} dirs={dirs} aP={aP} toggleTheme={toggleTheme} theme={theme}/></div>
    {isMobile&&<MobileHeader prop={prop} nC={ns.length} setShowN={setSN} lang={lang} setLang={setLang} L={L} onRefresh={doRefresh} refreshing={refreshing} toggleTheme={toggleTheme} theme={theme}/>}
    {isMobile&&<BottomNav nav={navForBottom} view={view} setView={sV} onLogout={onLogout} user={user} nC={ns.length} setShowN={setSN} lang={lang} setLang={setLang} L={L} toggleTheme={toggleTheme} theme={theme}/>}
    {sN&&<NPanel ns={ns} onClose={()=>{setSN(false);if(ns.length>0){const ids=ns.map(n=>n.id).filter(Boolean);if(ids.length>0)supabase.from("notifications").update({is_read:true}).in("id",ids).then(()=>setNs([]));else setNs([]);}}} onClr={()=>{if(ns.length>0){const ids=ns.map(n=>n.id).filter(Boolean);if(ids.length>0)supabase.from("notifications").update({is_read:true}).in("id",ids).then(()=>{setNs([]);setSN(false);});else{setNs([]);setSN(false);}}else setSN(false);}} L={L} onClickNotif={(n)=>{sV("directives");}}/>}
    <div className="main-content" onTouchStart={isMobile?onPTRStart:undefined} onTouchMove={isMobile?onPTRMove:undefined} onTouchEnd={isMobile?onPTREnd:undefined} style={{marginLeft:isMobile?0:185,padding:isMobile?"0 12px 18px":"0 18px 18px",minHeight:"100vh",paddingTop:isMobile?10:0}}>
      {refreshing&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,padding:"6px 0",fontSize:12,color:C.tl}}><span style={{display:"inline-block",animation:"pullSpin 0.8s linear infinite"}}>🔄</span> Refreshing...</div>}
      {pm&&previewDbUser&&<div style={{background:`linear-gradient(90deg,${C.blue},${C.maroon})`,color:C.white,padding:"8px 14px",borderRadius:10,marginTop:10,marginBottom:4,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}><span>👁️</span><span style={{fontSize:12,fontWeight:700}}>{L.previewAs}: {eU.name} ({eU.role==="a"||!!findAT(eU)?L.admin:L.staff} — {PROPS[eU.prop]?.sn||eU.prop||"All"})</span></div><button onClick={()=>{setPM(false);setPAs("");sV("dashboard");}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.15)",color:C.white,fontFamily:F.b,fontSize:10,fontWeight:700,cursor:"pointer"}}>{L.previewOff}</button></div>}
      {!pm&&!["members","roster","valet","vendors","team","chemicals","fire"].includes(view)&&<div style={{position:"sticky",top:isMobile?0:0,zIndex:40,background:C.bg,padding:"8px 0"}}><PropBar ap={aP} setAP={sAP} user={user}/></div>}
      {isA?(<>
        {view==="dashboard"&&<Dashboard tasks={tasks} prop={prop} user={eU} lang={lang} att={att} setView={sV} dirs={dirs}/>}
        {view==="tasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt={hasCustomAccess&&eU.role==="e"?"mytasks":"tasks"} L={L} lang={lang}/>}
        {view==="directives"&&<AssignedTasksView user={eU} dirs={dirs} setDirs={setDirs} L={L} setNs={setNs} setView={sV} atLoaded={atLoaded}/>}
        {view==="team"&&<TeamPage user={eU} lang={lang} customMembers={customMembers} setCustomMembers={setCM} removedIds={removedIds} setRemovedIds={setRI} allDbUsers={allDbUsers}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="roster"&&<DutyRoster prop={prop} user={eU} lang={lang}/>}
        {view==="leaves"&&<LeaveManager prop={prop} user={eU} lang={lang}/>}
        {view==="training"&&<TrainingView user={eU} prop={prop} lang={lang}/>}
        {view==="chemicals"&&<ChemicalGuide lang={lang}/>}
        {view==="valet"&&<ValetPlanning user={eU} lang={lang}/>}
        {view==="vendors"&&<VendorDirectory user={eU} lang={lang}/>}
        {view==="fire"&&<FireExtinguishers user={eU} lang={lang}/>}
      </>):(<>
        {view==="mytasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt="mytasks" L={L} lang={lang}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="leaves"&&<LeaveManager prop={prop} user={eU} lang={lang}/>}
        {view==="training"&&<TrainingView user={eU} prop={prop} lang={lang}/>}
      </>)}
    </div></div></ThemeContext.Provider>);
}
