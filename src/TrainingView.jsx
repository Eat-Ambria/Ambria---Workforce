import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";
import QuizModal, { QuizManager } from "./TrainingQuiz.jsx";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";

// ─── DEFAULT TOPICS (seeded to DB on first load) ─────────────────────────────
const DEFAULT_TOPICS = [
  {department:"k",topic:"Housekeeping Full Training",    topic_hi:"हाउसकीपिंग फुल ट्रेनिंग",   youtube_url:"",youtube_id:"",sort_order:0},
  {department:"k",topic:"Washroom Cleaning SOP",          topic_hi:"शौचालय सफ़ाई SOP",          youtube_url:"",youtube_id:"",sort_order:1},
  {department:"k",topic:"Floor Mopping Technique",        topic_hi:"फ़र्श पोछा तकनीक",          youtube_url:"",youtube_id:"",sort_order:2},
  {department:"k",topic:"Bed Making Standards",           topic_hi:"बिस्तर बनाने की विधि",      youtube_url:"",youtube_id:"",sort_order:3},
  {department:"k",topic:"Chemical Safety & Handling",     topic_hi:"केमिकल सुरक्षा",            youtube_url:"",youtube_id:"",sort_order:4},
  {department:"k",topic:"Guest Room Inspection",          topic_hi:"गेस्ट रूम निरीक्षण",        youtube_url:"",youtube_id:"",sort_order:5},
  {department:"h",topic:"Lawn Care & Maintenance",        topic_hi:"लॉन केयर",                  youtube_url:"",youtube_id:"",sort_order:0},
  {department:"h",topic:"Hedge Trimming Guide",           topic_hi:"हेज कटाई गाइड",             youtube_url:"",youtube_id:"",sort_order:1},
  {department:"h",topic:"Fertilizer Application",         topic_hi:"खाद का उपयोग",              youtube_url:"",youtube_id:"",sort_order:2},
  {department:"h",topic:"Pest Control Methods",           topic_hi:"कीट नियंत्रण",              youtube_url:"",youtube_id:"",sort_order:3},
  {department:"h",topic:"Tree Pruning Technique",         topic_hi:"पेड़ काटने की तकनीक",       youtube_url:"",youtube_id:"",sort_order:4},
  {department:"h",topic:"Sprinkler System Operation",     topic_hi:"स्प्रिंकलर ऑपरेशन",         youtube_url:"",youtube_id:"",sort_order:5},
  {department:"a",topic:"Facility Management Basics",     topic_hi:"फैसिलिटी मैनेजमेंट",       youtube_url:"",youtube_id:"",sort_order:0},
  {department:"a",topic:"DG Set Operation",               topic_hi:"डीजी सेट",                  youtube_url:"",youtube_id:"",sort_order:1},
  {department:"a",topic:"CCTV System Monitoring",         topic_hi:"सीसीटीवी मॉनिटरिंग",       youtube_url:"",youtube_id:"",sort_order:2},
  {department:"a",topic:"Vendor Management",              topic_hi:"वेंडर प्रबंधन",             youtube_url:"",youtube_id:"",sort_order:3},
  {department:"a",topic:"Event Coordination",             topic_hi:"इवेंट समन्वय",              youtube_url:"",youtube_id:"",sort_order:4},
  {department:"s",topic:"Fire Safety Training",           topic_hi:"अग्नि सुरक्षा ट्रेनिंग",   youtube_url:"",youtube_id:"",sort_order:0},
  {department:"s",topic:"Fire Extinguisher Usage",        topic_hi:"अग्निशामक उपयोग",           youtube_url:"",youtube_id:"",sort_order:1},
  {department:"s",topic:"First Aid & CPR",                topic_hi:"प्राथमिक उपचार",            youtube_url:"",youtube_id:"",sort_order:2},
  {department:"s",topic:"Security Guard Protocol",        topic_hi:"सुरक्षा प्रोटोकॉल",         youtube_url:"",youtube_id:"",sort_order:3},
  {department:"s",topic:"Emergency Evacuation Drill",     topic_hi:"आपातकालीन निकासी",          youtube_url:"",youtube_id:"",sort_order:4},
  {department:"s",topic:"CCTV Monitoring",                topic_hi:"सीसीटीवी मॉनिटरिंग",       youtube_url:"",youtube_id:"",sort_order:5},
];

const DEPT_META = {
  k:{l:"Housekeeping",lH:"हाउसकीपिंग",icon:"🧹",c:C.blue,  bg:C.bBg       },
  h:{l:"Horticulture", lH:"हॉर्टिकल्चर",icon:"🌱",c:C.green, bg:C.gBg       },
  a:{l:"Admin",         lH:"एडमिन",     icon:"📋",c:C.maroon,bg:C.maroonSoft},
  s:{l:"Security",      lH:"सुरक्षा",    icon:"🛡️",c:C.purple,bg:C.pBg       },
};

const CHEM_DATA = [
  {area:"🏛️ Banquet Tiles",        items:[{p:"K2 Hard Surface (Kleanfix)",u:"20ml/1L daily mop"},{p:"K20 Floor Striper",u:"10-20ml warm deep clean"},{p:"K102 All-in-One",u:"Floors walls sinks"}]},
  {area:"🚽 Washroom",              items:[{p:"K1 Bathroom Sanitizer",u:"20-50ml/1L tub tiles"},{p:"K6 Toilet Bowl Cleaner",u:"Ready — toilet urinal"},{p:"K5 Air Freshener",u:"Ready — all areas"}]},
  {area:"🪟 Glass · 🪑 Wood · 🔧 Steel",items:[{p:"K3 Glass Cleaner",u:"20-50ml/1L mirror"},{p:"K4 Wood Maintainer",u:"Ready — furniture floor"},{p:"K7 S.S. Polish",u:"Ready — steel grills"}]},
  {area:"🧹 Carpet · 👔 Laundry",  items:[{p:"K101 Carpet Shampoo",u:"50-100ml/1L carpet sofa"},{p:"Kleanpro-L Det",u:"Fabric deep cleaning"},{p:"Kleanpro-Fab Soft",u:"Fabric softener"}]},
  {area:"🌿 Lawn · 🌺 Flowers",    items:[{p:"NPK 19:19:19",u:"Monthly balanced feed"},{p:"Urea + Neem oil",u:"Green boost + pest"},{p:"Vermicompost + Bone meal",u:"Organic + bloom"}]},
];

// Extract 11-char YouTube video ID from any URL format
function extractYTId(url){
  if(!url)return"";
  const m=url.match(/(?:[?&]v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  if(m)return m[1];
  if(/^[a-zA-Z0-9_-]{11}$/.test(url.trim()))return url.trim();
  return"";
}

// Load YouTube IFrame API once globally; queue callbacks until ready
function ensureYTScript(){
  if(window._ytSLd)return;
  window._ytSLd=true;
  window._ytCBs=window._ytCBs||[];
  window.onYouTubeIframeAPIReady=()=>{
    window._ytRdy=true;
    (window._ytCBs||[]).forEach(fn=>fn());
    window._ytCBs=[];
  };
  const s=document.createElement("script");
  s.src="https://www.youtube.com/iframe_api";
  s.async=true;
  document.head.appendChild(s);
}

// ─── VIDEO MODAL ──────────────────────────────────────────────────────────────
function VideoModal({video,isDone,onClose,onCompleted,userId,user,lang}){
  const H=lang==="hi";
  const pid=useRef(`ytp-${video.id}-${Date.now()}`).current;
  const ytRef=useRef(null);
  const[done,setDone]=useState(isDone);
  const[showQuiz,setShowQuiz]=useState(false);

  useEffect(()=>{
    if(!video.youtube_id)return;
    const init=()=>{
      const el=document.getElementById(pid);
      if(!el||!window.YT?.Player)return;
      ytRef.current=new window.YT.Player(pid,{
        videoId:video.youtube_id,
        playerVars:{autoplay:1,rel:0,modestbranding:1,playsinline:1},
        events:{
          onStateChange:(ev)=>{
            if(ev.data===window.YT.PlayerState.ENDED){
              setShowQuiz(true);
            }
          }
        }
      });
    };
    ensureYTScript();
    if(window._ytRdy)init();
    else{window._ytCBs=window._ytCBs||[];window._ytCBs.push(init);}
    return()=>{try{ytRef.current?.destroy();}catch(_){}};
  },[]);// eslint-disable-line

  const handlePass=()=>{
    setDone(true);setShowQuiz(false);
    onCompleted(video);
  };

  const handleFail=()=>{
    setShowQuiz(false);
    // restart video
    try{ytRef.current?.seekTo(0);ytRef.current?.playVideo();}catch(_){}
  };

  return(
    <div onClick={e=>{if(e.target===e.currentTarget&&!showQuiz)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:C.white,borderRadius:14,width:"100%",maxWidth:700,overflow:"hidden",position:"relative"}}>
        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${C.maroon},${C.maroonLight})`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:"#fff"}}>{H?video.topic_hi||video.topic:video.topic}</div>
            {done&&<span style={{display:"inline-block",marginTop:3,fontSize:9,background:"rgba(255,255,255,0.2)",borderRadius:5,padding:"2px 8px",color:"#fff",fontFamily:F.b}}>✅ {H?"पूरा हुआ":"Completed"}</span>}
          </div>
          <button onClick={onClose} style={{width:44,height:44,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>
        {/* Player — 16:9 aspect ratio */}
        <div style={{position:"relative",paddingTop:"56.25%",background:"#000"}}>
          {video.youtube_id
            ?<div id={pid} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>
            :<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
               <div style={{fontSize:40}}>🎬</div>
               <div style={{color:"rgba(255,255,255,0.5)",fontSize:13,fontFamily:F.b}}>{H?"वीडियो अभी जोड़ा नहीं गया":"No video linked yet"}</div>
             </div>
          }
        </div>
      </div>
      {showQuiz&&<QuizModal video={video} userId={userId} user={user} lang={lang}
        onPass={handlePass} onFail={handleFail} onClose={()=>setShowQuiz(false)}/>}
    </div>
  );
}

// ─── VIDEO FORM (Admin / SA only) ─────────────────────────────────────────────
function VideoForm({init,onSave,onCancel,lang}){
  const H=lang==="hi";
  const[f,sF]=useState(init?{
    ...init,
    youtube_url:init.youtube_url||init.youtube_id||"",
  }:{department:"k",topic:"",topic_hi:"",youtube_url:"",sort_order:0});
  const inp=(k,v)=>sF(p=>({...p,[k]:v}));
  const ytId=extractYTId(f.youtube_url);

  const save=()=>{
    if(!f.topic.trim())return;
    onSave({...f,youtube_id:ytId,youtube_url:f.youtube_url.trim()});
  };

  const S2={width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none",boxSizing:"border-box",background:"#FAFAFA"};
  const Lb={fontSize:11,fontWeight:600,color:C.tl,marginBottom:3,display:"block"};

  return(
    <div style={{background:C.white,borderRadius:12,padding:14,border:`2px solid ${C.maroon}`,marginBottom:14}}>
      <div style={{fontFamily:F.d,fontSize:14,fontWeight:700,color:C.maroon,marginBottom:10}}>
        {init?.id?"✏️ Edit Video":"➕ Add Training Video"}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={Lb}>📖 Topic (English)</label>
          <input value={f.topic} onChange={e=>inp("topic",e.target.value)} placeholder="e.g. Floor Mopping Technique" style={S2}/>
        </div>
        <div>
          <label style={Lb}>📖 विषय (Hindi)</label>
          <input value={f.topic_hi||""} onChange={e=>inp("topic_hi",e.target.value)} placeholder="e.g. फ़र्श पोछा तकनीक" style={S2}/>
        </div>
        <div>
          <label style={Lb}>🏷️ Department</label>
          <select value={f.department} onChange={e=>inp("department",e.target.value)} style={S2}>
            {Object.entries(DEPT_META).map(([k,d])=><option key={k} value={k}>{d.icon} {d.l}</option>)}
          </select>
        </div>
        <div>
          <label style={Lb}>🔢 Sort Order</label>
          <input type="number" min={0} value={f.sort_order||0} onChange={e=>inp("sort_order",parseInt(e.target.value)||0)} style={S2}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <label style={Lb}>🔗 YouTube URL (paste full link — URL is never shown to employees)</label>
          <input value={f.youtube_url} onChange={e=>inp("youtube_url",e.target.value)}
            placeholder="https://www.youtube.com/watch?v=ABC123..." style={S2}/>
          {f.youtube_url&&<div style={{marginTop:4,fontSize:10,fontWeight:600,color:ytId?C.green:C.red}}>
            {ytId?`✅ Video ID: ${ytId}`:"❌ Invalid URL — could not extract video ID"}
          </div>}
        </div>
        {ytId&&<div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:10,color:C.tl,marginBottom:4}}>Thumbnail preview:</div>
          <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="" style={{width:"100%",maxWidth:280,borderRadius:8,border:`1px solid ${C.border}`}}/>
        </div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={save} style={{padding:"9px 18px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          {init?.id?"💾 Update":"✅ Save Video"}
        </button>
        <button onClick={onCancel} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontFamily:F.b,fontSize:12,cursor:"pointer"}}>
          {H?"रद्द":"Cancel"}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function TrainingView({user,prop,lang}){
  const H=lang==="hi";
  const L=LANGS[lang];
  const isSA=user.role==="sa";
  const isAdmin=user.role==="sa"||user.role==="a";
  // Each user watches only their department's videos
  const myDept=user.dept||user.department||(user.role==="a"?"a":"k");

  const[tab,setTab]=useState("videos");
  const[videos,setVideos]=useState([]);
  const[progress,setProgress]=useState({});   // { "video_id_str": true }
  const[staffProgress,setStaffProg]=useState([]);
  // SA can switch between depts; everyone else is locked to their own dept
  const[deptFilter,setDF]=useState(isSA?"k":myDept);
  const[activeVideo,setAV]=useState(null);
  const[showForm,setSF]=useState(false);
  const[editVideo,setEV]=useState(null);
  const[loading,setLd]=useState(true);
  const[quizMgrVideo,setQuizMgr]=useState(null);

  // Load videos from DB; admins see all + seed if empty; employees see only their dept
  useEffect(()=>{
    setLd(true);
    (async()=>{
      try{
        if(!isAdmin){
          // Non-admin: only fetch their department's videos — no seeding
          const{data}=await supabase.from("training_videos").select("*")
            .eq("is_active",true).eq("department",myDept).order("sort_order");
          setVideos(data&&data.length>0?data:DEFAULT_TOPICS.filter(t=>t.department===myDept).map((t,i)=>({...t,id:i+1})));
        }else{
          // Admin/SA: fetch all and seed if table is empty
          const{data,error}=await supabase.from("training_videos").select("*")
            .eq("is_active",true).order("department").order("sort_order");
          if(data&&data.length>0){
            setVideos(data);
          }else if(!error){
            const seeds=DEFAULT_TOPICS.map(t=>({...t,is_active:true,created_by:"system"}));
            const{data:seeded}=await supabase.from("training_videos").insert(seeds).select();
            setVideos(seeded||DEFAULT_TOPICS.map((t,i)=>({...t,id:i+1})));
          }else{
            setVideos(DEFAULT_TOPICS.map((t,i)=>({...t,id:i+1})));
          }
        }
      }catch(_){
        setVideos(DEFAULT_TOPICS.filter(t=>isAdmin||t.department===myDept).map((t,i)=>({...t,id:i+1})));
      }finally{setLd(false);}
    })();
  },[]);

  // Load own watch progress
  useEffect(()=>{
    supabase.from("training_progress").select("video_key").eq("user_id",user.id)
      .then(({data})=>{
        if(data){const m={};data.forEach(r=>{m[r.video_key]=true;});setProgress(m);}
      });
  },[user.id]);

  // Load all staff progress (admin)
  useEffect(()=>{
    if(!isAdmin)return;
    supabase.from("training_progress").select("*")
      .then(({data})=>{if(data)setStaffProg(data);});
  },[isAdmin]);

  // Auto-mark video as done when YT ENDED event fires
  const markDone=useCallback(async(video)=>{
    const key=String(video.id);
    if(progress[key])return;
    await supabase.from("training_progress").upsert(
      {user_id:user.id,video_key:key,department:video.department,completed:true,completed_at:new Date().toISOString()},
      {onConflict:"user_id,video_key"}
    );
    setProgress(p=>({...p,[key]:true}));
    setStaffProg(p=>[...p,{user_id:user.id,video_key:key,department:video.department}]);
    getSAAndAdminIds(user.prop||user.property).then(ids=>notifyMultiple("training_completed","🎓 "+user.name+" completed training: "+(video.topic||video.title||""),user.id,user.name,ids,user.prop||user.property));
  },[user.id,progress]);

  // Save new or edited video (admin)
  const saveVideo=async(f)=>{
    const payload={
      department:f.department,topic:f.topic,topic_hi:f.topic_hi||null,
      youtube_url:f.youtube_url||null,youtube_id:f.youtube_id||null,
      sort_order:f.sort_order||0,
    };
    if(f.id){
      const{data}=await supabase.from("training_videos").update(payload).eq("id",f.id).select().single();
      if(data)setVideos(prev=>prev.map(v=>v.id===data.id?data:v));
    }else{
      const{data}=await supabase.from("training_videos").insert({...payload,is_active:true,created_by:user.id}).select().single();
      if(data)setVideos(prev=>[...prev,data]);
    }
    setSF(false);setEV(null);
  };

  const deleteVideo=async(id)=>{
    if(!window.confirm("Delete this video? This cannot be undone."))return;
    await supabase.from("training_videos").update({is_active:false}).eq("id",id);
    setVideos(prev=>prev.filter(v=>v.id!==id));
  };

  // Derived stats
  // SA uses the deptFilter selector; everyone else is locked to their own dept
  const viewDept=isSA?deptFilter:myDept;
  const filteredVids=videos.filter(v=>v.department===viewDept);
  // Progress bar counts only the user's OWN department videos
  const myDeptVideos=videos.filter(v=>v.department===myDept);
  const totalWatched=myDeptVideos.filter(v=>progress[String(v.id)]).length;
  const myPct=myDeptVideos.length?Math.round((totalWatched/myDeptVideos.length)*100):0;

  const deptStats={};
  Object.keys(DEPT_META).forEach(k=>{
    const total=videos.filter(v=>v.department===k).length;
    const done=videos.filter(v=>v.department===k&&progress[String(v.id)]).length;
    deptStats[k]={total,done,pct:total?Math.round((done/total)*100):0};
  });

  // Staff progress — SA sees all properties; admin sees their property only
  // Each person's completion % is based on THEIR department's video count, not all videos
  const allStaff=isSA
    ?Object.entries(PROPS).flatMap(([pid,p])=>Object.entries(p.depts||{}).flatMap(([dk,d])=>d.m.map(m=>({...m,deptKey:dk,deptName:d.n,propName:p.sn}))))
    :Object.entries(prop?.depts||{}).flatMap(([dk,d])=>d.m.map(m=>({...m,deptKey:dk,deptName:d.n,propName:prop.sn})));
  const staffSummary=allStaff.map(m=>{
    const deptVids=videos.filter(v=>v.department===m.deptKey);
    const watched=staffProgress.filter(r=>r.user_id===m.id&&deptVids.some(v=>String(v.id)===r.video_key)).length;
    return{...m,watched,total:deptVids.length,pct:deptVids.length?Math.round((watched/deptVids.length)*100):0};
  });

  return(
    <div style={{fontFamily:F.b}}>
      {/* Page header + tabs */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>
          🎓 {H?"प्रशिक्षण और ज्ञान":"Training & Knowledge"}
        </h1>
        <div style={{display:"flex",background:C.maroonSoft,borderRadius:10,padding:3,gap:2}}>
          {[{id:"videos",l:"🎬 Video Training",lH:"🎬 वीडियो ट्रेनिंग"},{id:"chem",l:"🧪 Chemical Guide",lH:"🧪 केमिकल गाइड"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:700,background:tab===t.id?C.maroon:"transparent",color:tab===t.id?C.white:C.maroon}}>
              {H?t.lH:t.l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ VIDEO TRAINING TAB ═══ */}
      {tab==="videos"&&<>
        {/* My progress bar */}
        {!loading&&<div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"10px 14px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:11,fontWeight:600,color:C.text}}>{user.name} — {H?"ट्रेनिंग प्रगति":"Training Progress"}</span>
            <span style={{fontFamily:F.d,fontSize:16,fontWeight:700,color:myPct===100?C.green:C.maroon}}>{totalWatched}/{myDeptVideos.length} ({myPct}%)</span>
          </div>
          <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${myPct}%`,background:myPct===100?C.green:C.maroon,borderRadius:3,transition:"width 0.5s"}}/>
          </div>
        </div>}

        {/* Admin: Add Video button */}
        {isAdmin&&!showForm&&<button onClick={()=>{setEV(null);setSF(true);}} style={{marginBottom:12,padding:"7px 14px",borderRadius:8,border:"none",background:C.maroon,color:C.white,fontFamily:F.b,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          ➕ {H?"वीडियो जोड़ें":"Add Video"}
        </button>}

        {/* Add/Edit form */}
        {showForm&&isAdmin&&<VideoForm init={editVideo} onSave={saveVideo} onCancel={()=>{setSF(false);setEV(null);}} lang={lang}/>}

        {/* Dept filter tabs — SA only; employees/admins are locked to their own dept */}
        {isSA&&<div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
          {Object.entries(DEPT_META).map(([k,d])=>{
            const st=deptStats[k]||{total:0,done:0,pct:0};
            const isActive=deptFilter===k;
            return(
              <button key={k} onClick={()=>setDF(k)} style={{padding:"6px 12px",borderRadius:8,border:isActive?`2px solid ${d.c}`:`1px solid ${C.border}`,background:isActive?d.c+"18":C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:isActive?700:400,color:isActive?d.c:C.tl,display:"flex",alignItems:"center",gap:5}}>
                <span>{d.icon}</span>
                <span>{H?d.lH:d.l}</span>
                {st.total>0&&<span style={{fontSize:9,background:isActive?d.c:"#E0E0E0",color:isActive?C.white:C.tl,borderRadius:10,padding:"1px 6px",fontWeight:700}}>{st.done}/{st.total}</span>}
              </button>
            );
          })}
        </div>}
        {/* Non-SA: show which dept they're viewing */}
        {!isSA&&(()=>{const dm=DEPT_META[myDept];return dm?<div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12,padding:"8px 12px",background:dm.bg,borderRadius:8,border:`1px solid ${dm.c}28`}}>
          <span style={{fontSize:16}}>{dm.icon}</span>
          <span style={{fontSize:12,fontWeight:700,color:dm.c}}>{H?dm.lH:dm.l}</span>
          <span style={{fontSize:10,color:dm.c,opacity:0.7}}>— {H?"आपके विभाग की ट्रेनिंग":"Your department training"}</span>
        </div>:null;})()}

        {/* Video grid */}
        {loading&&<div style={{textAlign:"center",padding:28,color:C.tl,fontSize:13,background:C.white,borderRadius:12,border:`1px solid ${C.border}`}}>Loading training videos...</div>}

        {!loading&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:10,marginBottom:16}}>
          {filteredVids.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:24,color:C.tl,fontSize:12,background:C.white,borderRadius:12,border:`1px solid ${C.border}`}}>
            {H?"इस विभाग में अभी कोई वीडियो नहीं है":"No videos in this department yet"}
            {isAdmin&&<div style={{fontSize:10,marginTop:4}}>Click "Add Video" to add the first one.</div>}
          </div>}

          {filteredVids.map(v=>{
            const key=String(v.id);
            const watched=!!progress[key];
            const dm=DEPT_META[v.department]||DEPT_META.k;
            const canPlay=!!v.youtube_id;
            return(
              <div key={v.id} style={{background:C.white,borderRadius:12,overflow:"hidden",border:`1px solid ${watched?C.green:C.border}`,cursor:canPlay?"pointer":"default",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}
                onClick={()=>canPlay&&setAV(v)}>
                {/* Thumbnail */}
                <div style={{position:"relative",paddingTop:"56.25%",background:canPlay?"#111":`linear-gradient(135deg,${dm.c}22,${dm.c}08)`}}>
                  {canPlay
                    ?<img src={`https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`} alt={v.topic}
                        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
                        onError={e=>{e.target.style.display="none";}}/>
                    :<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
                       <span style={{fontSize:26}}>{dm.icon}</span>
                       <span style={{fontSize:8,color:C.tl,fontFamily:F.b,textAlign:"center",padding:"0 6px"}}>{H?"वीडियो नहीं जोड़ा":"No video linked"}</span>
                     </div>
                  }
                  {/* Play button overlay */}
                  {canPlay&&!watched&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.15)"}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(255,255,255,0.92)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
                      <span style={{fontSize:14,marginLeft:3,color:C.maroon}}>▶</span>
                    </div>
                  </div>}
                  {/* Watched checkmark */}
                  {watched&&<div style={{position:"absolute",top:7,right:7,width:26,height:26,borderRadius:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 6px rgba(0,0,0,0.25)"}}>
                    <span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span>
                  </div>}
                  {/* Dept badge */}
                  <div style={{position:"absolute",top:5,left:5,background:"rgba(0,0,0,0.5)",borderRadius:4,padding:"1px 5px"}}>
                    <span style={{color:"#fff",fontSize:8,fontFamily:F.b}}>{dm.icon}</span>
                  </div>
                </div>
                {/* Title row */}
                <div style={{padding:"7px 9px 8px",background:watched?"#F0FFF4":C.white}}>
                  <div style={{fontSize:11,fontWeight:700,color:watched?C.green:C.text,lineHeight:1.35,marginBottom:isAdmin?5:0}}>
                    {H?v.topic_hi||v.topic:v.topic}
                  </div>
                  {/* Admin: edit / delete / quiz */}
                  {isAdmin&&<div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setEV(v);setSF(true);window.scrollTo({top:0,behavior:"smooth"});}}
                      style={{flex:1,padding:"5px 0",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:10,fontWeight:600,color:C.tl}}>✏️</button>
                    <button onClick={()=>setQuizMgr(v)}
                      style={{flex:1,padding:"5px 0",borderRadius:5,border:`1px solid ${C.blue}`,background:C.bBg,cursor:"pointer",fontSize:10,fontWeight:600,color:C.blue}}>📝</button>
                    <button onClick={()=>deleteVideo(v.id)}
                      style={{flex:1,padding:"5px 0",borderRadius:5,border:"none",background:C.rBg,cursor:"pointer",fontSize:10,fontWeight:600,color:C.red}}>🗑️</button>
                  </div>}
                </div>
              </div>
            );
          })}
        </div>}

        {/* Staff Progress (admin only) */}
        {isAdmin&&!loading&&staffSummary.length>0&&<div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:14}}>
          <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:10}}>
            👥 {H?"स्टाफ प्रगति":"Staff Training Progress"} — {prop.sn}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:8}}>
            {staffSummary.map(m=>{
              const barC=m.pct===100?C.green:m.pct>=50?C.yellow:C.red;
              return(
                <div key={m.id} style={{padding:"10px 12px",background:C.bg,borderRadius:10,borderLeft:`3px solid ${barC}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:26,height:26,borderRadius:"50%",background:barC,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:10,fontWeight:700}}>{m.n[0]}</div>
                      <div>
                        <div style={{fontSize:11,fontWeight:700}}>{m.n}</div>
                        <div style={{fontSize:9,color:C.tl}}>{m.deptName}{m.propName?` · ${m.propName}`:""}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:barC}}>{m.pct}%</div>
                      <div style={{fontSize:8,color:C.tl}}>{m.watched}/{m.total}</div>
                    </div>
                  </div>
                  <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${m.pct}%`,background:barC,borderRadius:2,transition:"width 0.4s"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}
      </>}

      {/* ═══ CHEMICAL GUIDE TAB ═══ */}
      {tab==="chem"&&<div>
        <p style={{fontSize:10,color:C.tl,margin:"0 0 10px"}}>Kleanfix Industries · kleanfix.com · +91 98189 98806</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {CHEM_DATA.map((sec,si)=>(
            <div key={si} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{background:"linear-gradient(135deg,#2D2D2D,#4a4a4a)",padding:"8px 12px",color:"#fff",fontSize:12,fontWeight:700}}>{sec.area}</div>
              <div style={{padding:"4px 10px"}}>
                {sec.items.map((it,ii)=>(
                  <div key={ii} style={{padding:"6px 0",borderBottom:ii<sec.items.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.maroon}}>{it.p}</div>
                    <div style={{fontSize:9,color:C.tl}}>{it.u}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* ═══ VIDEO MODAL ═══ */}
      {activeVideo&&<VideoModal
        key={activeVideo.id}
        video={activeVideo}
        isDone={!!progress[String(activeVideo.id)]}
        onClose={()=>setAV(null)}
        onCompleted={markDone}
        userId={user.id}
        user={user}
        lang={lang}
      />}
      {/* Quiz Manager (admin only) */}
      {quizMgrVideo&&<QuizManager video={quizMgrVideo} lang={lang} onClose={()=>setQuizMgr(null)}/>}
    </div>
  );
}
