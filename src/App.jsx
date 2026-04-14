import { useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

const C={maroon:"#7B1E2F",maroonLight:"#9A2E42",maroonSoft:"#F9F0F2",accent:"#C4956A",white:"#FFF",bg:"#FAFAFA",text:"#2D2D2D",tl:"#7A7A7A",border:"#EDEDED",green:"#2E8B57",gBg:"#EBF5F0",blue:"#3B6FC0",bBg:"#EBF1FA",yellow:"#C68A1D",yBg:"#FDF6E8",red:"#C0392B",rBg:"#FBEAE8"};
const lnk=document.createElement("link");lnk.href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap";lnk.rel="stylesheet";document.head.appendChild(lnk);
const F={b:"'Outfit',sans-serif",d:"'Cormorant Garamond',serif"};

const L_EN={myTasks:"My Tasks",calendar:"Calendar",dashboard:"Dashboard",allTasks:"All Tasks",team:"Team",areas:"Areas",attendance:"Attendance",login:"Sign In",logout:"Logout",username:"Username",password:"Password",enterUser:"Enter username",enterPass:"Enter password",invalidLogin:"Invalid credentials",contactSuper:"Contact supervisor",checkIn:"Check In",checkOut:"Check Out",checkedIn:"Checked In",notCheckedIn:"Not checked in",done:"Done",pending:"Pending",issue:"Issue",inProgress:"In Progress",total:"Total",photos:"Photos",issues:"Issues",sop:"SOP Instructions",uploadPhoto:"Open Camera & Take Photo",photoNeeded:"Photo required",retakePhoto:"Retake (blurry?)",comment:"Comment",send:"Send",reassign:"Reassign",addTask:"Add Task",save:"Save",cancel:"Cancel",del:"Delete",taskTitle:"Task title",selectPerson:"Assign to",duration:"Duration",desc:"Description",daily:"Daily",weekly:"Weekly",monthly:"Monthly",high:"High",medium:"Medium",low:"Low",notif:"Notifications",noNotif:"No notifications",clearAll:"Clear",superAdmin:"Super Admin",admin:"Admin",staff:"Staff",noTasks:"No tasks",head:"Head",depts:"Departments",hi:"हिंदी",en:"English",preview:"Preview Staff",previewOff:"Back to Admin",previewAs:"Previewing as",previewDesc:"Staff phone view",steps:"1. Open 📖 → 2. 📸 Photo → 3. ☐ Done",teamTask:"Team",today:"Today",
  adminWork:"Admin",secWork:"Security",allWork:"All Depts",directives:"Assigned Tasks",newDirective:"New Task",sendTo:"Send to",writeTask:"Write task details...",reply:"Reply",approve:"OK",reject:"Not OK",reqApproval:"Send for Approval",approved:"Approved",rejected:"Not OK - See Remarks",awaitApproval:"Awaiting Approval",directive:"Task from",replyHere:"Type reply...",addPhoto:"Add Photo",noDirectives:"No tasks assigned yet",remarks:"Remarks",okApproval:"OK ✅",notOk:"Not OK ❌",writeRemarks:"Write remarks...",markComplete:"Mark Complete",completedWork:"Completed",dueDate:"Target Date",overdue:"Overdue",dueOn:"Due",completionNote:"Add completion note...",completionPhoto:"Take photo of completed work",members:"Members",addMember:"Add Member",removeMember:"Remove",memberName:"Name",memberDept:"Department",memberProp:"Property"};
const L_HI={myTasks:"मेरे काम",calendar:"कैलेंडर",dashboard:"डैशबोर्ड",allTasks:"सभी काम",team:"टीम",areas:"एरिया",attendance:"हाज़िरी",login:"लॉगिन",logout:"लॉगआउट",username:"यूज़रनेम",password:"पासवर्ड",enterUser:"यूज़रनेम डालें",enterPass:"पासवर्ड डालें",invalidLogin:"गलत जानकारी",contactSuper:"सुपरवाइज़र से संपर्क",checkIn:"चेक इन",checkOut:"चेक आउट",checkedIn:"चेक इन हुआ",notCheckedIn:"चेक इन नहीं",done:"पूरा",pending:"बाकी",issue:"समस्या",inProgress:"चल रहा",total:"कुल",photos:"फ़ोटो",issues:"समस्याएं",sop:"काम के निर्देश",uploadPhoto:"कैमरा खोलें फ़ोटो लें",photoNeeded:"फ़ोटो ज़रूरी",retakePhoto:"दोबारा लें (धुंधली?)",comment:"टिप्पणी",send:"भेजें",reassign:"दूसरे को दें",addTask:"नया काम",save:"सेव",cancel:"रद्द",del:"हटाएं",taskTitle:"काम का नाम",selectPerson:"किसको दें",duration:"समय",desc:"विवरण",daily:"रोज़ाना",weekly:"हफ़्ते",monthly:"महीने",high:"ज़रूरी",medium:"सामान्य",low:"कम",notif:"सूचनाएं",noNotif:"कोई सूचना नहीं",clearAll:"हटाएं",superAdmin:"सुपर एडमिन",admin:"एडमिन",staff:"कर्मचारी",noTasks:"कोई काम नहीं",head:"प्रमुख",depts:"विभाग",hi:"हिंदी",en:"English",preview:"कर्मचारी दृश्य",previewOff:"एडमिन वापस",previewAs:"देख रहे हैं",previewDesc:"फ़ोन दृश्य",steps:"1. 📖 खोलें → 2. 📸 फ़ोटो → 3. ☐ पूरा",teamTask:"टीम",today:"आज",
  adminWork:"प्रशासन",secWork:"सुरक्षा",allWork:"सभी विभाग",directives:"दिए गए काम",newDirective:"नया काम दें",sendTo:"भेजें",writeTask:"काम का विवरण लिखें...",reply:"जवाब",approve:"ठीक है",reject:"ठीक नहीं",reqApproval:"मंज़ूरी भेजें",approved:"मंज़ूर",rejected:"ठीक नहीं - टिप्पणी देखें",awaitApproval:"मंज़ूरी की प्रतीक्षा",directive:"काम",replyHere:"जवाब लिखें...",addPhoto:"फ़ोटो जोड़ें",noDirectives:"कोई काम नहीं दिया",remarks:"टिप्पणी",okApproval:"ठीक है ✅",notOk:"ठीक नहीं ❌",writeRemarks:"टिप्पणी लिखें...",markComplete:"पूरा करें",completedWork:"पूरा हुआ",dueDate:"लक्ष्य तिथि",overdue:"देरी",dueOn:"तक",completionNote:"पूरा करने की टिप्पणी...",completionPhoto:"पूरे काम की फ़ोटो लें",members:"सदस्य",addMember:"सदस्य जोड़ें",removeMember:"हटाएं",memberName:"नाम",memberDept:"विभाग",memberProp:"प्रॉपर्टी"};
const LANGS={en:L_EN,hi:L_HI};

const USERS=[
  {id:"abhishek",u:"abhishek",p:"ambria@2026",name:"Abhishek",role:"sa",prop:"all"},
  {id:"vicky",u:"vicky",p:"vicky@123",name:"Vicky Arya",role:"a",prop:"all"},
  {id:"pp_sonu",u:"sonu",p:"sonu@123",name:"Sonu Mali",role:"a",prop:"pp"},
  {id:"ex_mahesh",u:"mahesh",p:"mahesh@123",name:"Mahesh",role:"a",prop:"ex"},
  {id:"mk_rahees",u:"rahees",p:"rahees@123",name:"Rahees",role:"a",prop:"mk"},
  {id:"pp_pawan",u:"pawan",p:"pawan@123",name:"Pawan",role:"e",prop:"pp"},{id:"pp_dayashankar",u:"dayashankar",p:"daya@123",name:"Dayashankar",role:"e",prop:"pp"},{id:"pp_sunil",u:"sunil",p:"sunil@123",name:"Sunil",role:"e",prop:"pp"},
  {id:"pp_poonam",u:"poonam",p:"poonam@123",name:"Poonam",role:"e",prop:"pp"},{id:"pp_neeru",u:"neeru",p:"neeru@123",name:"Neeru",role:"e",prop:"pp"},{id:"pp_umesh",u:"umesh",p:"umesh@123",name:"Umesh",role:"e",prop:"pp"},{id:"pp_dinesh",u:"dinesh",p:"dinesh@123",name:"Dinesh",role:"e",prop:"pp"},{id:"pp_lalita",u:"lalita",p:"lalita@123",name:"Lalita",role:"e",prop:"pp"},
  {id:"ex_sunita",u:"sunita",p:"sunita@123",name:"Sunita",role:"e",prop:"ex"},{id:"ex_brijesh",u:"brijesh",p:"brijesh@123",name:"Brijesh",role:"e",prop:"ex"},{id:"ex_ragini",u:"ragini",p:"ragini@123",name:"Ragini",role:"e",prop:"ex"},{id:"ex_rani",u:"rani",p:"rani@123",name:"Rani",role:"e",prop:"ex"},
  {id:"ex_sonu2",u:"sonu2",p:"sonu2@123",name:"Sonu 2",role:"e",prop:"ex"},{id:"ex_dhruv",u:"dhruv",p:"dhruv@123",name:"Dhruv",role:"e",prop:"ex"},{id:"ex_kamlesh",u:"kamlesh",p:"kamlesh@123",name:"Kamlesh",role:"e",prop:"ex"},
  {id:"mk_sadna",u:"sadna",p:"sadna@123",name:"Sadna",role:"e",prop:"mk"},{id:"mk_lovekush",u:"lovekush",p:"lovekush@123",name:"Lovekush",role:"e",prop:"mk"},{id:"mk_akash",u:"akash",p:"akash@123",name:"Akash",role:"e",prop:"mk"},{id:"mk_ajay",u:"ajay",p:"ajay@123",name:"Ajay",role:"e",prop:"mk"},
  {id:"mk_mukesh",u:"mukesh",p:"mukesh@123",name:"Mukesh",role:"e",prop:"mk"},{id:"mk_tulsi",u:"tulsi",p:"tulsi@123",name:"Tulsi",role:"e",prop:"mk"},{id:"mk_akash_h",u:"akash_h",p:"akash@123",name:"Akash(H)",role:"e",prop:"mk"},
  {id:"rs_suresh",u:"suresh",p:"suresh@123",name:"Suresh",role:"e",prop:"rs"},{id:"rs_roma",u:"roma",p:"roma@123",name:"Roma",role:"e",prop:"rs"},{id:"rs_anita",u:"anita",p:"anita@123",name:"Anita",role:"e",prop:"rs"},{id:"rs_arjun",u:"arjun",p:"arjun@123",name:"Arjun",role:"e",prop:"rs"},{id:"rs_vinay",u:"vinay",p:"vinay@123",name:"Vinay",role:"e",prop:"rs"},
  {id:"rs_ramu",u:"ramu",p:"ramu@123",name:"Ramu",role:"e",prop:"rs"},
  {id:"sandeep",u:"sandeep",p:"sandeep@123",name:"Sandeep",role:"a",prop:"all"},
  {id:"rs_santosh",u:"santosh",p:"santosh@123",name:"Santosh",role:"e",prop:"rs"},
  {id:"ex_bhupender",u:"bhupender",p:"bhupender@123",name:"Bhupender",role:"e",prop:"ex"},
  {id:"mk_ajay_s",u:"ajay_s",p:"ajay@123",name:"Ajay (Sec)",role:"e",prop:"mk"},
];

const PROPS={
  pp:{id:"pp",name:"Ambria Pushpanjali",sn:"Pushpanjali",icon:"🏛️",loc:"Dwarka",tag:"3 Acres · 1500 Guests",
    specs:{Land:"3 Acres",Banquet:"14K sqft",Lawn:"40K sqft",Parking:"125+"},
    areas:[{id:"bq",n:"Banquet Hall",s:"14,000 sqft",i:"🏛️"},{id:"lw",n:"Grand Lawn",s:"40,000 sqft",i:"🌿"},{id:"wk",n:"Walkway",s:"120 ft",i:"🛤️"},{id:"vl",n:"Villa",s:"4 rooms",i:"🏠"},{id:"of",n:"Offices",s:"5",i:"🏢"},{id:"vw",n:"Villa WC",s:"7",i:"🚿"},{id:"gw",n:"Guest WC",s:"M+F",i:"🚻"},{id:"pk",n:"Parking",s:"125+",i:"🅿️"},{id:"en",n:"Entrance",s:"",i:"🚪"},{id:"gd",n:"Gardens",s:"",i:"🌺"}],
    depts:{h:{n:"Horticulture",i:"🌱",c:C.green,bg:C.gBg,hd:"Sonu Mali",m:[{id:"pp_pawan",n:"Pawan"},{id:"pp_dayashankar",n:"Dayashankar"},{id:"pp_sunil",n:"Sunil"}]},
      k:{n:"Housekeeping",i:"🧹",c:C.blue,bg:C.bBg,hd:"Poonam",m:[{id:"pp_poonam",n:"Poonam"},{id:"pp_neeru",n:"Neeru"},{id:"pp_umesh",n:"Umesh"},{id:"pp_dinesh",n:"Dinesh"},{id:"pp_lalita",n:"Lalita"}]},
      a:{n:"Admin",i:"📋",c:C.maroon,bg:C.maroonSoft,hd:"Sonu Mali",m:[{id:"pp_sonu",n:"Sonu Mali"}]},
      s:{n:"Security",i:"🛡️",c:"#6B21A8",bg:"#6B21A815",hd:"Sandeep",m:[{id:"sandeep",n:"Sandeep"}]}},sh:"Sonu Mali"},
  ex:{id:"ex",name:"Ambria Exotica",sn:"Exotica",icon:"🌴",loc:"Dwarka",tag:"4 Acres · Aura & Valencia",
    specs:{Land:"4 Acres","Aura":"8.5K+27K","Valencia":"12K+8K",Parking:"300-350"},
    areas:[{id:"ag",n:"Aura Glass",s:"8,500 sqft",i:"🏛️"},{id:"al",n:"Aura Lawn",s:"27,000 sqft",i:"🌿"},{id:"vg",n:"Valencia Glass",s:"12,000 sqft",i:"✨"},{id:"vl2",n:"Valencia Lawn",s:"8,000 sqft",i:"🌳"},{id:"vp",n:"Poolside",s:"2,000 sqft",i:"🏊"},{id:"wk",n:"Walkway",s:"20K sqft",i:"🛤️"},{id:"pk",n:"Parking",s:"300-350",i:"🅿️"},{id:"wc",n:"Restrooms",s:"",i:"🚻"},{id:"en",n:"Entrance",s:"",i:"🚪"},{id:"gd",n:"Gardens",s:"",i:"🌺"}],
    depts:{h:{n:"Horticulture",i:"🌱",c:C.green,bg:C.gBg,hd:"Mahesh",m:[{id:"ex_sonu2",n:"Sonu 2"},{id:"ex_dhruv",n:"Dhruv"},{id:"ex_kamlesh",n:"Kamlesh"}]},
      k:{n:"Housekeeping",i:"🧹",c:C.blue,bg:C.bBg,hd:"Mahesh",m:[{id:"ex_sunita",n:"Sunita"},{id:"ex_brijesh",n:"Brijesh"},{id:"ex_ragini",n:"Ragini"},{id:"ex_rani",n:"Rani"}]},
      a:{n:"Admin",i:"📋",c:C.maroon,bg:C.maroonSoft,hd:"Mahesh",m:[{id:"ex_mahesh",n:"Mahesh"}]},
      s:{n:"Security",i:"🛡️",c:"#6B21A8",bg:"#6B21A815",hd:"Sandeep",m:[{id:"ex_bhupender",n:"Bhupender"}]}},sh:"Mahesh"},
  mk:{id:"mk",name:"Ambria Manaktala",sn:"Manaktala",icon:"✨",loc:"Kapashera",tag:"3 Acres · Two Venues",
    specs:{Land:"3 Acres",Emerald:"10K+27K",Alstonia:"16K",Parking:"250+"},
    areas:[{id:"eg",n:"Emerald Glass",s:"10,000 sqft",i:"🏛️"},{id:"el",n:"Emerald Lawn",s:"27,000 sqft",i:"🌿"},{id:"ao",n:"Alstonia Lawn",s:"16,000 sqft",i:"🌳"},{id:"hn",n:"Hanger",s:"8,000 sqft",i:"🏗️"},{id:"b1",n:"Banquet",s:"10,000 sqft",i:"🎪"},{id:"dr",n:"Driveway",s:"400 ft",i:"🛤️"},{id:"pk",n:"Parking",s:"250+",i:"🅿️"},{id:"wc",n:"Restrooms",s:"",i:"🚻"},{id:"en",n:"Entrance",s:"",i:"🚪"},{id:"gd",n:"Gardens",s:"",i:"🌺"}],
    depts:{h:{n:"Horticulture",i:"🌱",c:C.green,bg:C.gBg,hd:"Rahees",m:[{id:"mk_mukesh",n:"Mukesh"},{id:"mk_tulsi",n:"Tulsi"},{id:"mk_akash_h",n:"Akash"}]},
      k:{n:"Housekeeping",i:"🧹",c:C.blue,bg:C.bBg,hd:"Rahees",m:[{id:"mk_sadna",n:"Sadna"},{id:"mk_lovekush",n:"Lovekush"},{id:"mk_akash",n:"Akash"},{id:"mk_ajay",n:"Ajay"}]},
      a:{n:"Admin",i:"📋",c:C.maroon,bg:C.maroonSoft,hd:"Rahees",m:[{id:"mk_rahees",n:"Rahees"}]},
      s:{n:"Security",i:"🛡️",c:"#6B21A8",bg:"#6B21A815",hd:"Sandeep",m:[{id:"mk_ajay_s",n:"Ajay (Sec)"}]}},sh:"Rahees"},
  rs:{id:"rs",name:"Ambria Restro",sn:"Restro",icon:"🍽️",loc:"Palam Vihar",tag:"0.75 Acre · Restro · Cafe",
    specs:{Land:"0.75 Acre",Glass:"8K sqft",Restro:"800 sqft",Parking:"100+"},
    areas:[{id:"gl",n:"Glasshouse",s:"8,000 sqft",i:"🏛️"},{id:"lw",n:"Lawn",s:"1,500 sqft",i:"🌿"},{id:"re",n:"Restro",s:"800 sqft",i:"🍽️"},{id:"ca",n:"Cafe",s:"417 sqft",i:"☕"},{id:"rt",n:"Rooftop",s:"417 sqft",i:"🌇"},{id:"pk",n:"Parking",s:"100+",i:"🅿️"},{id:"ki",n:"Kitchen",s:"",i:"👨‍🍳"},{id:"wc",n:"Washrooms",s:"",i:"🚻"},{id:"en",n:"Entrance",s:"",i:"🚪"},{id:"gd",n:"Gardens",s:"",i:"🌺"}],
    depts:{h:{n:"Horticulture",i:"🌱",c:C.green,bg:C.gBg,hd:"Vicky Arya",m:[{id:"rs_ramu",n:"Ramu"}]},
      k:{n:"Housekeeping",i:"🧹",c:C.blue,bg:C.bBg,hd:"Vicky Arya",m:[{id:"rs_suresh",n:"Suresh"},{id:"rs_roma",n:"Roma"},{id:"rs_anita",n:"Anita"},{id:"rs_arjun",n:"Arjun"},{id:"rs_vinay",n:"Vinay"}]},
      a:{n:"Admin",i:"📋",c:C.maroon,bg:C.maroonSoft,hd:"Vicky Arya",m:[{id:"vicky",n:"Vicky Arya"}]},
      s:{n:"Security",i:"🛡️",c:"#6B21A8",bg:"#6B21A815",hd:"Sandeep",m:[{id:"rs_santosh",n:"Santosh"}]}},sh:"Vicky Arya"},
};

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

// ═══ UI ═══
function Bdg({children,color=C.tl,bg=C.border+"88"}){return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:bg,color,whiteSpace:"nowrap",fontFamily:F.b}}>{children}</span>;}
function SL2({s,L}){const m={pending:{l:L.pending,c:C.yellow,b:C.yBg},in_progress:{l:L.inProgress,c:C.blue,b:C.bBg},completed:{l:L.done,c:C.green,b:C.gBg},issue:{l:L.issue,c:C.red,b:C.rBg}};const v=m[s]||m.pending;return <Bdg color={v.c} bg={v.b}>{v.l}</Bdg>;}
function Sel2({value,onChange,options,style:cs}){return <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontFamily:F.b,fontSize:13,color:C.text,cursor:"pointer",outline:"none",...cs}}>{options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;}
function Btn2({children,onClick,primary,small,style:cs}){return <button onClick={onClick} style={{padding:small?"6px 12px":"10px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:small?11:13,fontWeight:600,background:primary?C.maroon:C.bg,color:primary?C.white:C.text,...cs}}>{children}</button>;}

// ═══ LOGIN ═══
function LoginScreen({onLogin,lang,setLang}){
  const L=LANGS[lang];const[u,sU]=useState("");const[p,sP]=useState("");const[err,sE]=useState("");const[sh,sSh]=useState(false);const[rem,setRem]=useState(false);const[loaded,setLoaded]=useState(false);const[loading,setLoading]=useState(false);
  // Load saved credentials on mount
  if(!loaded){setLoaded(true);try{window.storage?.get("ambria_cred").then(r=>{if(r?.value){const c=JSON.parse(r.value);sU(c.u||"");sP(c.p||"");setRem(true);}}).catch(()=>{});}catch(e){}}
  const go=async()=>{setLoading(true);sE("");try{const{data,error}=await supabase.from("users").select("*").eq("username",u.trim()).eq("password",p).single();console.log("[Login] Supabase response:",{data,error});if(error||!data){sE(L.invalidLogin);}else{if(rem)try{window.storage?.set("ambria_cred",JSON.stringify({u:u.trim(),p}));}catch(e){}else try{window.storage?.delete("ambria_cred");}catch(e){}onLogin(data);}}catch(e){console.log("[Login] Exception:",e);sE(L.invalidLogin);}finally{setLoading(false);}};
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
        <select value={eA} onChange={e=>setEA(e.target.value)} style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:10}}>{allM?.map(m=><option key={m.id} value={m.id}>{m.n}</option>)}</select>
        <Btn2 primary small onClick={()=>{const nm=allM?.find(m=>m.id===eA);if(nm)uTask(t.id,{assignedTo:eA,assigneeName:nm.n});setSE(false);}}>{L.reassign}</Btn2>
        <select value={t.status} onChange={e=>uTask(t.id,{status:e.target.value})} style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:10}}><option value="pending">⏳</option><option value="in_progress">🔄</option><option value="completed">✅</option><option value="issue">⚠️</option></select>
        {delTask&&<button onClick={()=>delTask(t.id)} style={{padding:"5px 8px",borderRadius:8,border:"none",background:C.rBg,color:C.red,fontFamily:F.b,fontSize:10,fontWeight:600,cursor:"pointer"}}>🗑️</button>}
      </div></div>}
  </div>);
}

// ═══ ADD TASK ═══
function AddTF({prop,onAdd,onClose,L}){
  const[f,sF]=useState({title:"",titleHi:"",dept:Object.keys(prop.depts)[0],area:prop.areas[0]?.id,assignedTo:"",priority:"medium",cat:"daily",dur:"1h",desc:"",descHi:"",timeBlock:"9:00-10:00"});
  const ms=prop.depts[f.dept]?.m||[];
  const sub=()=>{if(!f.title||!f.assignedTo)return;const m=ms.find(x=>x.id===f.assignedTo);onAdd({id:`${prop.id}_c_${Date.now()}`,prop:prop.id,...f,assigneeName:m?.n||"?",status:"pending",notes:"",completedAt:null,completedBy:"",photos:[],isTeam:false});onClose();};
  return(<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:16}}>
    <div style={{fontFamily:F.d,fontSize:16,fontWeight:700,color:C.maroon,marginBottom:12}}>➕ {L.addTask}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <input placeholder={L.taskTitle+" (EN)"} value={f.title} onChange={e=>sF({...f,title:e.target.value})} style={{gridColumn:"1/-1",padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,outline:"none"}}/>
      <input placeholder={L.taskTitle+" (HI)"} value={f.titleHi} onChange={e=>sF({...f,titleHi:e.target.value})} style={{gridColumn:"1/-1",padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:13,outline:"none"}}/>
      <select value={f.dept} onChange={e=>sF({...f,dept:e.target.value,assignedTo:""})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>{Object.entries(prop.depts).map(([k,d])=><option key={k} value={k}>{d.i} {d.n}</option>)}</select>
      <select value={f.assignedTo} onChange={e=>sF({...f,assignedTo:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}><option value="">{L.selectPerson}</option>{ms.map(m=><option key={m.id} value={m.id}>{m.n}</option>)}</select>
      <select value={f.area} onChange={e=>sF({...f,area:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>{prop.areas.map(a=><option key={a.id} value={a.id}>{a.i} {a.n}</option>)}</select>
      <select value={f.priority} onChange={e=>sF({...f,priority:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}><option value="high">🔴</option><option value="medium">🟡</option><option value="low">🟢</option></select>
      <select value={f.cat} onChange={e=>sF({...f,cat:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}><option value="daily">{L.daily}</option><option value="weekly">{L.weekly}</option><option value="monthly">{L.monthly}</option></select>
      <input placeholder="Time" value={f.timeBlock} onChange={e=>sF({...f,timeBlock:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}/>
      <textarea placeholder={L.desc+" (EN)"} value={f.desc} onChange={e=>sF({...f,desc:e.target.value})} style={{gridColumn:"1/-1",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:40,resize:"vertical"}}/>
    </div>
    <div style={{display:"flex",gap:8,marginTop:10}}><Btn2 primary onClick={sub}>{L.save}</Btn2><Btn2 onClick={onClose}>{L.cancel}</Btn2></div>
  </div>);
}

// ═══ SIDEBAR ═══
function Sidebar({view,setView,user:u,onLogout,lang,setLang,nC,setShowN,L,pm,setPM,pAs,setPAs,allS,dirs}){
  const isSA=u.role==="sa";const isA=pm?false:(u.role==="sa"||u.role==="a");
  // Pending count for assigned tasks
  const pendDirs=isSA?dirs.filter(d=>d.status==="sent"||d.status==="approval_req").length:dirs.filter(d=>d.to===u.id&&(d.status==="sent"||d.status==="approval_req")).length;
  const nav=isA?[{id:"dashboard",i:"📊",l:L.dashboard},{id:"tasks",i:"✅",l:"SOP Tasks"},{id:"directives",i:"📝",l:L.directives,badge:pendDirs},{id:"team",i:"👥",l:L.team},{id:"areas",i:"🏗️",l:L.areas},{id:"att",i:"🕐",l:L.attendance},{id:"training",i:"🎓",l:"Training"}]:[{id:"mytasks",i:"✅",l:L.myTasks},{id:"directives",i:"📝",l:L.directives,badge:pendDirs},{id:"att",i:"🕐",l:L.attendance},{id:"training",i:"🎓",l:"Training"}];
  if(isSA)nav.push({id:"members",i:"👤",l:L.members||"Members"});
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
          <button onClick={()=>{if(pm){setPM(false);setView("dashboard");}else{setPM(true);setView("mytasks");}}} style={{width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:pm?C.blue:C.border,position:"relative"}}><div style={{width:16,height:16,borderRadius:"50%",background:C.white,position:"absolute",top:2,left:pm?18:2,transition:"left 0.2s"}}/></button>
        </div>
        {pm&&<select value={pAs} onChange={e=>{setPAs(e.target.value);setView("mytasks");}} style={{width:"100%",padding:"5px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:9,marginTop:3}}>{allS.map(s=><option key={s.id} value={s.id}>{s.n}-{s.pn}</option>)}</select>}
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

function AttView({user:u,att,setAtt,prop,L}){
  const isA=u.role==="sa"||u.role==="a";const tk=td.toISOString().split("T")[0];const mr=att.find(a=>a.uid===u.id&&a.date===tk);
  const allM=Object.entries(prop.depts).flatMap(([d,dept])=>dept.m.map(m=>({...m,dn:dept.n,dc:dept.c})));
  const attRef=useRef(null);
  const doCheckIn=()=>{attRef.current?.click();};
  const onPhoto=(e)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});if(!mr)setAtt(p=>[...p,{uid:u.id,name:u.name,date:tk,ci:tm,co:null,ciPhoto:ev.target.result,coPhoto:null}]);else if(!mr.co)setAtt(p=>p.map(a=>a.uid===u.id&&a.date===tk?{...a,co:tm,coPhoto:ev.target.result}:a));};r.readAsDataURL(f);e.target.value="";};
  return(<div><h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:"0 0 12px"}}>🕐 {L.attendance} - {prop.sn}</h1>
    <input ref={attRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{display:"none"}}/>
    {u.role==="e"&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:16}}><div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{L.today} - {tk}</div>
      {!mr?<Btn2 primary onClick={doCheckIn}>📸📍 {L.checkIn} (Photo)</Btn2>
      :!mr.co?<div style={{display:"flex",gap:8,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>✅ {mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover"}}/>}<Btn2 onClick={doCheckIn} style={{background:C.yBg,color:C.yellow}}>📸🚪 {L.checkOut}</Btn2></div>
      :<div style={{display:"flex",gap:6,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>In:{mr.ci}</Bdg>{mr.ciPhoto&&<img src={mr.ciPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}<Bdg color={C.blue} bg={C.bBg}>Out:{mr.co}</Bdg>{mr.coPhoto&&<img src={mr.coPhoto} alt="" style={{width:28,height:28,borderRadius:4,objectFit:"cover"}}/>}</div>}</div>}
    {isA&&<div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}><h3 style={{fontFamily:F.d,fontSize:14,margin:"0 0 10px",color:C.maroon}}>{tk}</h3>{allM.map(m=>{const r=att.find(a=>a.uid===m.id&&a.date===tk);return(<div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:r?C.gBg:C.bg,borderRadius:8,marginBottom:4}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:m.dc||C.maroon,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:9,fontWeight:700}}>{m.n[0]}</div>
      <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{m.n}</div></div>
      {r?<div style={{display:"flex",gap:3,alignItems:"center"}}><Bdg color={C.green} bg={C.gBg}>{r.ci}</Bdg>{r.ciPhoto&&<img src={r.ciPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}{r.co?<><Bdg color={C.blue} bg={C.bBg}>{r.co}</Bdg>{r.coPhoto&&<img src={r.coPhoto} alt="" style={{width:22,height:22,borderRadius:4,objectFit:"cover"}}/>}</>:<Bdg color={C.yellow} bg={C.yBg}>Working</Bdg>}</div>:<Bdg color={C.red} bg={C.rBg}>{L.notCheckedIn}</Bdg>}
    </div>);})}</div>}
  </div>);
}

function Dash({tasks,prop,L}){
  const[deptF,setDeptF]=useState("all");
  const isSec=(t)=>t.dept==="s";
  const ft=deptF==="all"?tasks:deptF==="s"?tasks.filter(t=>t.dept==="s"):tasks.filter(t=>t.dept===deptF);
  const tt=ft.length,dn=ft.filter(t=>t.status==="completed").length,pd=ft.filter(t=>t.status==="pending").length,is=ft.filter(t=>t.status==="issue").length,pc=tt?Math.round((dn/tt)*100):0;
  const dS=Object.entries(prop.depts).filter(([k])=>deptF==="all"||k===deptF).map(([k,d])=>{const dt=tasks.filter(t=>t.dept===k),dd=dt.filter(t=>t.status==="completed").length;return{k,...d,tt:dt.length,dn:dd,pc:dt.length?Math.round((dd/dt.length)*100):0};});
  return(<div>
    <div style={{marginBottom:14}}><h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:"0 0 2px"}}>{prop.name}</h1><p style={{fontSize:11,color:C.tl,margin:0}}>{td.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · {prop.sh}</p></div>
    {/* DEPT TOGGLE */}
    <div style={{display:"flex",gap:3,marginBottom:14,background:C.maroonSoft,borderRadius:10,padding:3,width:"fit-content"}}>
      {[["all",L.allWork,"📊"],["h","Horticulture","🌱"],["k","Housekeeping","🧹"],["a",L.adminWork,"📋"],["s","Security","🛡️"]].map(([v,l,ic])=><button key={v} onClick={()=>setDeptF(v)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,background:deptF===v?C.maroon:"transparent",color:deptF===v?C.white:C.maroon}}>{ic} {l}</button>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>{[{l:L.total,v:tt,c:C.maroon,ic:"📋"},{l:L.done,v:dn,c:C.green,ic:"✅"},{l:L.pending,v:pd,c:C.yellow,ic:"⏳"},{l:L.issues,v:is,c:C.red,ic:"⚠️"}].map(s=>(<div key={s.l} style={{background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:9,color:C.tl,fontWeight:600}}>{s.l}</span><span style={{fontSize:11}}>{s.ic}</span></div><div style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:s.c}}>{s.v}</div></div>))}</div>
    <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:12}}>
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,textAlign:"center"}}><div style={{position:"relative",width:80,height:80,margin:"0 auto 6px"}}><svg viewBox="0 0 36 36" style={{width:"100%",height:"100%",transform:"rotate(-90deg)"}}><circle cx="18" cy="18" r="15" fill="none" stroke={C.border} strokeWidth="2.5"/><circle cx="18" cy="18" r="15" fill="none" stroke={C.maroon} strokeWidth="2.5" strokeDasharray={`${pc*0.942} 100`} strokeLinecap="round"/></svg><div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}><div style={{fontFamily:F.d,fontSize:18,fontWeight:700,color:C.maroon}}>{pc}%</div></div></div><div style={{fontSize:10,color:C.tl}}>{dn}/{tt}</div></div>
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}><h3 style={{fontFamily:F.d,fontSize:13,margin:"0 0 8px",color:C.maroon}}>{L.depts}</h3>{dS.map(d=>(<div key={d.k} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:11}}>{d.i} {d.n}</span><span style={{fontSize:10,fontWeight:600}}>{d.dn}/{d.tt}</span></div><div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${d.pc}%`,background:d.c,borderRadius:2}}/></div></div>))}</div>
    </div>
    {/* ═══ OVERVIEW — only on "All" tab ═══ */}
    {deptF==="all"&&<div style={{marginTop:16}}>
      {/* CRITICAL ACTIONS */}
      {(is>0||pd>tt*0.7)&&<div style={{background:C.rBg,borderRadius:12,padding:14,border:`1px solid #f0c8c4`,marginBottom:12}}>
        <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.red,marginBottom:8}}>🚨 Critical Actions</div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {is>0&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}><span>⚠️</span><span><strong>{is} issue{is>1?"s":""} reported</strong> — check All Tasks → ⚠️ filter</span></div>}
          {pd>tt*0.7&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}><span>⏳</span><span><strong>{Math.round((pd/tt)*100)}% pending</strong> — team may need follow-up</span></div>}
          {pc<30&&tt>0&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}><span>📉</span><span><strong>Only {pc}% done</strong> — day behind schedule</span></div>}
        </div>
      </div>}
      {/* APP MODULES OVERVIEW */}
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
        <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:10}}>📱 App Overview — {prop.sn}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(135px,1fr))",gap:8}}>
          {[{i:"✅",n:"Daily SOPs",v:tasks.filter(t=>t.cat==="daily").length+" tasks",s:"9AM-6PM schedule"},{i:"📅",n:"Weekly Tasks",v:tasks.filter(t=>t.cat==="weekly").length+" tasks",s:"Deep clean, audits"},{i:"📆",n:"Monthly Tasks",v:tasks.filter(t=>t.cat==="monthly").length+" tasks",s:"Overhauls, reports"},{i:"👥",n:"Team Size",v:Object.values(prop.depts).reduce((a,d)=>a+d.m.length,0)+" staff",s:"Across all depts"},{i:"🏗️",n:"Venue Areas",v:prop.areas.length+" areas",s:"Tracked & assigned"},{i:"📝",n:"Assigned Tasks",v:"SA → Team",s:"Task + approval flow"},{i:"🎓",n:"Training",v:"Videos + Guide",s:"4 depts + chemicals"},{i:"🕐",n:"Attendance",v:"Check in/out",s:"Daily tracking"}].map((m,i)=>(<div key={i} style={{padding:8,background:C.bg,borderRadius:8,borderLeft:`3px solid ${C.maroon}`}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:2}}>{m.i} {m.n}</div>
            <div style={{fontSize:11,fontWeight:600,color:C.maroon}}>{m.v}</div>
            <div style={{fontSize:9,color:C.tl}}>{m.s}</div>
          </div>))}
        </div>
      </div>
      {/* TIPS */}
      <div style={{background:"#FFF7ED",borderRadius:12,padding:14,border:`1px solid #f0dcc8`,marginBottom:12}}>
        <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.accent,marginBottom:8}}>💡 Daily Tips & Best Practices</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[{t:"📸 Photo Compliance",d:"Every task must have photo proof — builds accountability"},{t:"🕐 Morning Walk First",d:"Start with full property inspection before individual tasks"},{t:"🧪 Right Chemical",d:"Check Chemical Guide before using any cleaning agent"},{t:"🔒 End-of-Day Lockup",d:"Rooms locked, ACs off, taps closed, lights off"},{t:"📋 Report Issues Now",d:"Report broken items, leaks, pests immediately — don't wait"},{t:"👥 Team Tasks",d:"Every member completes and photographs separately"}].map((tip,i)=>(<div key={i} style={{padding:8,background:C.white,borderRadius:8}}>
            <div style={{fontSize:11,fontWeight:700,marginBottom:2}}>{tip.t}</div>
            <div style={{fontSize:9,color:C.tl,lineHeight:1.4}}>{tip.d}</div>
          </div>))}
        </div>
      </div>
      {/* SUGGESTIONS — dynamic */}
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.green,marginBottom:8}}>📈 Suggestions & Insights</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {pc===100&&<div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.gBg,borderRadius:8}}><span>🏆</span><div style={{fontSize:11}}><strong>All tasks complete!</strong> Share this with the team</div></div>}
          {pc>=70&&pc<100&&<div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.gBg,borderRadius:8}}><span>👍</span><div style={{fontSize:11}}><strong>Good progress — {pc}%</strong> Push remaining {pd} to hit 100%</div></div>}
          {pc<70&&tt>0&&<div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.yBg,borderRadius:8}}><span>⚡</span><div style={{fontSize:11}}><strong>Behind — {pc}%</strong> Mid-day check with leads needed</div></div>}
          <div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.gBg,borderRadius:8}}><span>🌱</span><div style={{fontSize:11}}><strong>Horticulture:</strong> {tasks.filter(t=>t.dept==="h"&&t.status==="completed").length}/{tasks.filter(t=>t.dept==="h").length} — Evening watering critical</div></div>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.bBg,borderRadius:8}}><span>🧹</span><div style={{fontSize:11}}><strong>Housekeeping:</strong> {tasks.filter(t=>t.dept==="k"&&t.status==="completed").length}/{tasks.filter(t=>t.dept==="k").length} — WC recheck at 3:30 PM</div></div>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:C.bg,borderRadius:8}}><span>📋</span><div style={{fontSize:11}}><strong>Admin:</strong> {tasks.filter(t=>t.dept==="a"&&t.status==="completed").length}/{tasks.filter(t=>t.dept==="a").length} — Daily report to Vicky before 6 PM</div></div>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:8,background:"#6B21A815",borderRadius:8}}><span>🛡️</span><div style={{fontSize:11}}><strong>Security:</strong> {tasks.filter(t=>isSec(t)&&t.status==="completed").length}/{tasks.filter(t=>isSec(t)).length} — CCTV & fire exits weekly</div></div>
        </div>
      </div>
    </div>}
    </div>);
}

function TLV({tasks,setTasks,prop,user:u,vt,L,lang}){
  const[cv,setCV]=useState("daily");const[fD,sFD]=useState("all");const[fS,sFS]=useState("all");const[fC,sFC]=useState("all");const[sa,setSA]=useState(false);
  const isA=u.role==="sa"||u.role==="a";
  const allM=Object.entries(prop.depts).flatMap(([d,dept])=>dept.m.map(m=>({...m,dept:d,dn:dept.n,di:dept.i})));
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
      <h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:0}}>{vt==="mytasks"?L.myTasks:"SOP Tasks"} - {prop.sn}</h1>
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
    {vt==="tasks"&&<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}><Sel2 value={fD} onChange={sFD} options={[{v:"all",l:"All"},...Object.entries(prop.depts).map(([k,d])=>({v:k,l:`${d.i} ${d.n}`}))]}/><Sel2 value={fS} onChange={sFS} options={[{v:"all",l:"All"},{v:"pending",l:"⏳"},{v:"completed",l:"✅"},{v:"issue",l:"⚠️"}]}/><Sel2 value={fC} onChange={sFC} options={[{v:"all",l:"All"},{v:"daily",l:L.daily},{v:"weekly",l:L.weekly},{v:"monthly",l:L.monthly}]}/></div>}
    {cO.filter(c=>gr[c]).map(cat=>(<div key={cat} style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{width:4,height:12,borderRadius:2,background:cC[cat]}}/><h3 style={{fontFamily:F.d,fontSize:14,fontWeight:700,margin:0}}>{cL[cat]}</h3><Bdg color={cC[cat]} bg={`${cC[cat]}15`}>{gr[cat].length}</Bdg></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{gr[cat].map(task=><TC key={task.id} task={task} uTask={uT} delTask={isA?dT:null} depts={prop.depts} areas={prop.areas} user={u} allM={allM} L={L} lang={lang}/>)}</div></div>))}
    {fl.length===0&&<div style={{background:C.white,borderRadius:12,padding:24,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:24}}>🎉</div><div style={{fontFamily:F.d,fontSize:14,fontWeight:700,marginTop:4}}>{L.noTasks}</div></div>}
  </div>);
}

function TeamV({tasks,prop,L}){return(<div><h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:"0 0 10px"}}>{L.team} - {prop.sn}</h1>
  {Object.entries(prop.depts).map(([k,d])=>(<div key={k} style={{background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`,marginBottom:10}}>
    <div style={{fontFamily:F.d,fontSize:14,fontWeight:700,marginBottom:8}}>{d.i} {d.n}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>{d.m.map(m=>{const mt=tasks.filter(t=>t.assignedTo===m.id),md=mt.filter(t=>t.status==="completed").length;
      return(<div key={m.id} style={{padding:8,background:d.bg,borderRadius:8,borderLeft:`3px solid ${d.c}`}}><div style={{fontWeight:600,fontSize:11,marginBottom:3}}>{m.n}</div><div style={{display:"flex",gap:3}}><Bdg color={C.green} bg={C.gBg}>✅{md}</Bdg><Bdg color={C.yellow} bg={C.yBg}>⏳{mt.filter(t=>t.status==="pending").length}</Bdg></div></div>);})}</div></div>))}</div>);}

function AreasV({tasks,prop,L}){return(<div><h1 style={{fontFamily:F.d,fontSize:20,fontWeight:700,color:C.maroon,margin:"0 0 4px"}}>{L.areas} - {prop.sn}</h1>
  <p style={{fontSize:10,color:C.tl,margin:"0 0 10px"}}>Green = all SOPs done · Yellow = in progress · Red = issues</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>{prop.areas.map(a=>{const at=tasks.filter(t=>t.area===a.id),ad=at.filter(t=>t.status==="completed").length,ai=at.filter(t=>t.status==="issue").length,pc=at.length?Math.round((ad/at.length)*100):0;const allDone=pc===100&&at.length>0;const hasIssue=ai>0;
    return(<div key={a.id} style={{background:allDone?C.gBg:hasIssue?C.rBg:C.white,borderRadius:10,padding:10,border:`2px solid ${allDone?C.green:hasIssue?C.red:pc>50?C.yellow:C.border}`,position:"relative"}}>
      {allDone&&<div style={{position:"absolute",top:6,right:6,background:C.green,color:C.white,borderRadius:10,padding:"1px 6px",fontSize:8,fontWeight:700}}>SOP ✓</div>}
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><span style={{fontSize:14}}>{a.i}</span><span style={{fontWeight:600,fontSize:11}}>{a.n}</span></div>
      {a.s&&<div style={{fontSize:9,color:C.tl,marginBottom:4}}>{a.s}</div>}
      <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden",marginBottom:3}}><div style={{height:"100%",width:`${pc}%`,background:allDone?C.green:hasIssue?C.red:pc>50?C.yellow:C.blue,borderRadius:2}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9}}><span style={{color:C.green}}>✅{ad}</span><span style={{color:C.yellow}}>⏳{at.length-ad-ai}</span>{ai>0&&<span style={{color:C.red}}>⚠️{ai}</span>}<span style={{color:C.tl}}>{pc}%</span></div>
    </div>);})}</div></div>);}

// ═══ ASSIGNED TASKS — SA creates tasks for Admins ═══
const ADMIN_TARGETS=[
  {id:"vicky",name:"Vicky Arya",prop:"All",color:"#8B5CF6"},
  {id:"pp_sonu",name:"Sonu Mali",prop:"Pushpanjali",color:"#0891B2"},
  {id:"ex_mahesh",name:"Mahesh",prop:"Exotica",color:"#D97706"},
  {id:"mk_rahees",name:"Rahees",prop:"Manaktala",color:"#059669"},
  {id:"sandeep",name:"Sandeep",prop:"Security-All",color:"#6B21A8"},
];

function AssignedTasksView({user:u,dirs,setDirs,L,setNs,setView}){
  const isSA=u.role==="sa";
  const myDirs=isSA?dirs:dirs.filter(d=>d.to===u.id);
  const[showNew,setShowNew]=useState(false);
  const[newTo,setNewTo]=useState(ADMIN_TARGETS[0]?.id);
  const[newText,setNewText]=useState("");
  const[newProp,setNewProp]=useState("all");
  const nPhRef=useRef(null);
  const[nPh,setNPh]=useState(null);
  const[nDue,setNDue]=useState("");
  const[filterTo,setFilterTo]=useState("all");

  const sendTask=()=>{if(!newText.trim())return;
    const tgt=ADMIN_TARGETS.find(t=>t.id===newTo);
    const newDir={id:"at_"+Date.now(),from:u.id,fromName:u.name,to:newTo,toName:tgt?.name||"",toColor:tgt?.color||C.blue,prop:newProp,text:newText.trim(),photo:nPh,status:"sent",replies:[],remarksSA:"",dueDate:nDue||null,completedAt:null,completionNote:"",completionPhoto:null,createdAt:new Date().toISOString(),createdTime:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),createdDate:new Date().toLocaleDateString("en-IN")};
    setDirs(prev=>[newDir,...prev]);
    // Notify the TARGET person, not the creator
    setNs(p=>[{type:"newTask",task:"📝 New task: "+newText.trim().slice(0,40),by:u.name,prop:newProp,time:newDir.createdTime,forUser:newTo},...p]);
    setNewText("");setNPh(null);setNDue("");setShowNew(false);
  };

  const filteredDirs=(filterTo==="all"?myDirs:myDirs.filter(d=>d.to===filterTo)).sort((a,b)=>{const done=["completed","approved"];const aD=done.includes(a.status)?1:0;const bD=done.includes(b.status)?1:0;return aD-bD;});

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>📝 {L.directives}</h1>
      {isSA&&<Btn2 primary small onClick={()=>setShowNew(!showNew)}>➕ {L.newDirective}</Btn2>}
    </div>

    {/* NEW TASK FORM */}
    {showNew&&isSA&&<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:16}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:10}}>➕ {L.newDirective}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <select value={newTo} onChange={e=>setNewTo(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>
          {ADMIN_TARGETS.map(t=><option key={t.id} value={t.id}>{t.name} — {t.prop}</option>)}
        </select>
        <select value={newProp} onChange={e=>setNewProp(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>
          <option value="all">All Properties</option>
          {Object.entries(PROPS).map(([k,p])=><option key={k} value={k}>{p.icon} {p.sn}</option>)}
        </select>
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
      {ADMIN_TARGETS.map(t=>{const cnt=myDirs.filter(d=>d.to===t.id).length;return cnt>0&&<button key={t.id} onClick={()=>setFilterTo(t.id)} style={{padding:"6px 14px",borderRadius:8,border:filterTo===t.id?`2px solid ${t.color}`:`1px solid ${C.border}`,background:filterTo===t.id?t.color+"15":C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:t.color}}>{t.name} ({cnt})</button>;})}
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
  const tgt=ADMIN_TARGETS.find(t=>t.id===dir.to);
  const mC=tgt?.color||C.blue;

  // Status map — now includes "completed"
  const stMap={sent:{c:C.blue,b:C.bBg,l:"Pending"},completed:{c:C.green,b:C.gBg,l:L.completedWork},approval_req:{c:C.accent,b:"#FFF7ED",l:L.awaitApproval},approved:{c:C.green,b:C.gBg,l:L.approved},rejected:{c:C.red,b:C.rBg,l:L.rejected}};
  const st=stMap[dir.status]||stMap.sent;

  // Due date logic
  const isOverdue=dir.dueDate&&new Date(dir.dueDate)<td&&dir.status==="sent";
  const dueFmt=dir.dueDate?new Date(dir.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"";

  // MARK COMPLETE — photo optional, note optional
  const handleComplete=()=>{
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const dt=new Date().toLocaleDateString("en-IN");
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"completed",completedAt:new Date().toISOString(),completionNote:cNote.trim(),completionPhoto:cPhoto||null,replies:[...d.replies,{id:"r_"+Date.now(),by:u.name,text:"✅ "+L.markComplete+(cNote.trim()?" — "+cNote.trim():""),photo:cPhoto||null,type:"completed",time:tm,date:dt}]}:d));
    // Notify SA (task creator) about completion
    setNs(p=>[{type:"completed",task:"✅ Completed: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.from},...p]);
    setCNote("");setCPhoto(null);setShowComplete(false);
  };

  // SEND FOR APPROVAL — optional
  const sendApproval=()=>{
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"approval_req",replies:[...d.replies,{id:"r_"+Date.now(),by:u.name,text:"🔔 "+L.reqApproval,type:"approval_req",time:tm,date:new Date().toLocaleDateString("en-IN")}]}:d));
    setNs(p=>[{type:"approval",task:"🔔 Approval: "+dir.text.slice(0,30)+"...",by:u.name,prop:dir.prop,time:tm,dirId:dir.id},...p]);
  };

  // REPLY
  const addReply=()=>{
    if(!rText.trim()&&!rPhoto)return;
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,replies:[...d.replies,{id:"r_"+Date.now(),by:u.name,text:rText.trim(),photo:rPhoto,type:"reply",time:tm,date:new Date().toLocaleDateString("en-IN")}]}:d));
    setRText("");setRPhoto(null);setShowReply(false);
  };

  // SA: OK / NOT OK
  const handleOk=()=>{
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"approved",replies:[...d.replies,{id:"r_"+Date.now(),by:u.name,text:"✅ OK — Approved",type:"approved",time:tm,date:new Date().toLocaleDateString("en-IN")}]}:d));
    setNs(p=>[{type:"approved",task:"✅ Approved: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.to},...p]);
  };
  const handleNotOk=()=>{
    if(!remarks.trim()){setShowRemarks(true);return;}
    const tm=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    setDirs(prev=>prev.map(d=>d.id===dir.id?{...d,status:"rejected",remarksSA:remarks.trim(),replies:[...d.replies,{id:"r_"+Date.now(),by:u.name,text:"❌ Not OK: "+remarks.trim(),type:"rejected",time:tm,date:new Date().toLocaleDateString("en-IN")}]}:d));
    setNs(p=>[{type:"rejected",task:"❌ Not OK: "+dir.text.slice(0,30),by:u.name,prop:dir.prop,time:tm,forUser:dir.to},...p]);
    setRemarks("");setShowRemarks(false);
  };

  const isDone=dir.status==="completed"||dir.status==="approved";
  const canAct=isTarget&&dir.status==="sent";

  return(<div style={{background:isDone?C.gBg+"44":C.white,borderRadius:12,border:`1px solid ${isDone?"#b8dcc8":C.border}`,overflow:"hidden",borderTop:`4px solid ${mC}`}}>
    {/* HEADER */}
    <div style={{padding:"10px 14px",borderBottom:`1px solid ${isDone?"#b8dcc8":C.border}`,display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:30,height:30,borderRadius:"50%",background:mC,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:11,flexShrink:0}}>{dir.toName[0]}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:700,color:mC}}>→ {dir.toName}</div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:1}}>
          <span style={{fontSize:9,color:C.tl}}>{dir.createdDate} · {dir.createdTime}</span>
          {dueFmt&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:isOverdue?C.rBg:C.yBg,color:isOverdue?C.red:C.yellow}}>{isOverdue?"⚠️ "+L.overdue:"📅 "+L.dueOn} {dueFmt}</span>}
        </div>
      </div>
      <Bdg color={st.c} bg={st.b}>{st.l}</Bdg>
      {isSA&&<button onClick={()=>setDirs(prev=>prev.filter(d=>d.id!==dir.id))} style={{width:22,height:22,borderRadius:6,border:"none",cursor:"pointer",background:C.rBg,color:C.red,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>}
    </div>

    {/* BODY */}
    <div style={{padding:"10px 14px"}}>
      <div style={{fontSize:13,lineHeight:1.6,marginBottom:6,textDecoration:isDone?"line-through":"none",color:isDone?C.green:C.text}}>{dir.text}</div>
      {dir.photo&&<img src={dir.photo.data} alt="" style={{width:90,height:90,borderRadius:8,objectFit:"cover",border:`1px solid ${C.border}`,marginBottom:6}}/>}

      {/* REPLIES THREAD */}
      {dir.replies.length>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
        {dir.replies.map((r,i)=>{
          const rBg=r.type==="approved"?C.gBg:r.type==="rejected"?C.rBg:r.type==="approval_req"?"#FFF7ED":r.type==="completed"?C.gBg:C.bg;
          const rC2=r.type==="approved"?C.green:r.type==="rejected"?C.red:r.type==="approval_req"?C.accent:r.type==="completed"?C.green:C.blue;
          return(<div key={r.id||i} style={{display:"flex",gap:6,marginBottom:6,padding:8,background:rBg,borderRadius:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:rC2,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:8,fontWeight:700,flexShrink:0}}>{r.by[0]}</div>
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{r.by} <span style={{fontWeight:400,color:C.tl}}>{r.time}</span></div>
              {r.text&&<div style={{fontSize:11,marginTop:2}}>{r.text}</div>}
              {r.photo&&<img src={r.photo.data} alt="" style={{width:70,height:70,borderRadius:6,objectFit:"cover",marginTop:4}}/>}
            </div>
          </div>);
        })}
      </div>}

      {/* ═══ ACTIONS ═══ */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
        {/* TARGET: Mark Complete (photo optional) */}
        {canAct&&<Btn2 primary small onClick={()=>setShowComplete(!showComplete)} style={{background:C.green}}>✅ {L.markComplete}</Btn2>}
        {/* TARGET: Send for Approval (optional) */}
        {isTarget&&dir.status==="sent"&&<Btn2 small onClick={sendApproval} style={{background:"#FFF7ED",color:C.accent}}>🔔 {L.reqApproval}</Btn2>}
        {/* TARGET/SA: Reply */}
        {(isTarget||isSA)&&!isDone&&dir.status!=="rejected"&&<Btn2 small onClick={()=>setShowReply(!showReply)}>💬 {L.reply}</Btn2>}
        {/* SA: OK / Not OK (only when approval requested) */}
        {isSA&&dir.status==="approval_req"&&!showRemarks&&<>
          <Btn2 primary small onClick={handleOk} style={{background:C.green}}>{L.okApproval}</Btn2>
          <Btn2 small onClick={()=>setShowRemarks(true)} style={{background:C.rBg,color:C.red}}>{L.notOk}</Btn2>
        </>}
      </div>

      {/* SA: Not OK remarks input */}
      {isSA&&showRemarks&&<div style={{width:"100%",marginTop:8}}>
        <textarea placeholder={L.writeRemarks} value={remarks} onChange={e=>setRemarks(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.red}`,fontFamily:F.b,fontSize:12,minHeight:50,outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6}}><Btn2 small onClick={handleNotOk} style={{background:C.rBg,color:C.red}}>❌ {L.send}</Btn2><Btn2 small onClick={()=>setShowRemarks(false)}>{L.cancel}</Btn2></div>
      </div>}

      {/* MARK COMPLETE BOX — note + optional photo */}
      {showComplete&&canAct&&<div style={{marginTop:8,padding:12,background:C.gBg,borderRadius:10,border:`1px solid #b8dcc8`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:6}}>✅ {L.markComplete}</div>
        <textarea placeholder={L.completionNote} value={cNote} onChange={e=>setCNote(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:40,outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
          <button onClick={()=>cRef.current?.click()} style={{padding:"7px 12px",borderRadius:8,border:`1px dashed ${cPhoto?C.green:C.tl}`,background:cPhoto?C.gBg:C.bg,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:cPhoto?C.green:C.tl}}>{cPhoto?"✅ Photo taken — retake?":"📸 "+L.completionPhoto+" (optional)"}</button>
          {cPhoto&&<img src={cPhoto.data} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover"}}/>}
          <input ref={cRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setCPhoto({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
        </div>
        <Btn2 primary small onClick={handleComplete} style={{background:C.green}}>✅ {L.markComplete}</Btn2>
      </div>}

      {/* REPLY BOX */}
      {showReply&&<div style={{marginTop:8,padding:10,background:C.bg,borderRadius:8}}>
        <textarea placeholder={L.replyHere} value={rText} onChange={e=>setRText(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,minHeight:50,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:6}}/>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>rRef.current?.click()} style={{padding:"6px 12px",borderRadius:6,border:`1px dashed ${C.accent}`,background:"#FFF7ED",cursor:"pointer",fontFamily:F.b,fontSize:10,fontWeight:600,color:C.accent}}>📸</button>
          {rPhoto&&<img src={rPhoto.data} alt="" style={{width:30,height:30,borderRadius:4,objectFit:"cover"}}/>}
          <input ref={rRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setRPhoto({data:ev.target.result,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});r2.readAsDataURL(f);e.target.value="";}} style={{display:"none"}}/>
          <Btn2 primary small onClick={addReply}>{L.send}</Btn2>
        </div>
      </div>}
    </div>
  </div>);
}

const TRAIN=[
  {d:"🧹 HK",c:C.blue,v:[{t:"Housekeeping Training",h:"हाउसकीपिंग",y:"hotel+housekeeping+training+hindi",ic:"🏨"},{t:"Washroom Cleaning",h:"शौचालय सफ़ाई",y:"washroom+cleaning+SOP+hindi",ic:"🚽"},{t:"Floor Mopping",h:"फ़र्श पोछा",y:"floor+mopping+hindi",ic:"🧹"},{t:"Bed Making",h:"बिस्तर",y:"hotel+bed+making+hindi",ic:"🛏️"},{t:"Chemical Safety",h:"केमिकल",y:"cleaning+chemical+safety+hindi",ic:"🧪"}]},
  {d:"🌱 Hort",c:C.green,v:[{t:"Lawn Care",h:"लॉन केयर",y:"lawn+care+hindi",ic:"🌿"},{t:"Hedge Trim",h:"हेज कटाई",y:"hedge+trimming+hindi",ic:"✂️"},{t:"Fertilizer",h:"खाद गाइड",y:"fertilizer+manure+hindi",ic:"🧑‍🌾"},{t:"Pest Control",h:"कीट नियंत्रण",y:"pest+control+garden+hindi",ic:"🪲"},{t:"Tree Pruning",h:"पेड़ कटाई",y:"tree+pruning+hindi",ic:"🌳"}]},
  {d:"📋 Admin",c:C.maroon,v:[{t:"Facility Mgmt",h:"फैसिलिटी",y:"facility+management+hindi",ic:"🏢"},{t:"DG Set",h:"डीजी सेट",y:"DG+set+generator+hindi",ic:"⚡"},{t:"CCTV",h:"सीसीटीवी",y:"CCTV+system+hindi",ic:"📹"}]},
  {d:"🛡️ Sec",c:"#6B21A8",v:[{t:"Fire Safety",h:"अग्नि सुरक्षा",y:"fire+safety+hindi",ic:"🔥"},{t:"First Aid",h:"प्राथमिक उपचार",y:"first+aid+CPR+hindi",ic:"🏥"},{t:"Security",h:"सुरक्षा",y:"security+guard+hindi",ic:"💂"},{t:"Extinguisher",h:"अग्निशामक",y:"fire+extinguisher+hindi",ic:"🧯"}]},
];

const CHEM_DATA=[
  {area:"🏛️ Banquet Tiles",items:[{p:"K2 Hard Surface (Kleanfix)",u:"20ml/1L daily mop"},{p:"K20 Floor Striper",u:"10-20ml warm deep clean"},{p:"K102 All-in-One",u:"Floors walls sinks"}]},
  {area:"🚽 Washroom",items:[{p:"K1 Bathroom Sanitizer",u:"20-50ml/1L tub tiles"},{p:"K6 Toilet Bowl Cleaner",u:"Ready — toilet urinal"},{p:"K5 Air Freshener",u:"Ready — all areas"}]},
  {area:"🪟 Glass · 🪑 Wood · 🔧 Steel",items:[{p:"K3 Glass Cleaner",u:"20-50ml/1L mirror"},{p:"K4 Wood Maintainer",u:"Ready — furniture floor"},{p:"K7 S.S. Polish",u:"Ready — steel grills"}]},
  {area:"🧹 Carpet · 👔 Laundry",items:[{p:"K101 Carpet Shampoo",u:"50-100ml/1L carpet sofa"},{p:"Kleanpro-L Det",u:"Fabric deep cleaning"},{p:"Kleanpro-Fab Soft",u:"Fabric softener"}]},
  {area:"🌿 Lawn · 🌺 Flowers",items:[{p:"NPK 19:19:19",u:"Monthly balanced feed"},{p:"Urea + Neem oil",u:"Green boost + pest"},{p:"Vermicompost + Bone meal",u:"Organic + bloom"}]},
];

function TrainingView({lang}){
  const[tab,setTab]=useState("videos");const[sd,setSd]=useState(0);const dp=TRAIN[sd];
  const gr=["linear-gradient(135deg,#1e3a5f,#2d6ca5)","linear-gradient(135deg,#1a4d2e,#2d8f52)","linear-gradient(135deg,#5c1a2a,#9a2e42)","linear-gradient(135deg,#3b1a6b,#6b21a8)"];
  return(<div>
    <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:"0 0 8px"}}>🎓 Training & Knowledge</h1>
    <div style={{display:"flex",gap:3,marginBottom:14,background:C.maroonSoft,borderRadius:10,padding:3,width:"fit-content"}}>
      <button onClick={()=>setTab("videos")} style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:700,background:tab==="videos"?C.maroon:"transparent",color:tab==="videos"?C.white:C.maroon}}>🎬 Videos</button>
      <button onClick={()=>setTab("chem")} style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F.b,fontSize:12,fontWeight:700,background:tab==="chem"?C.maroon:"transparent",color:tab==="chem"?C.white:C.maroon}}>🧪 Chemical Guide</button>
    </div>
    {tab==="videos"&&<div>
      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>{TRAIN.map((d,i)=><button key={i} onClick={()=>setSd(i)} style={{padding:"6px 12px",borderRadius:8,border:sd===i?`2px solid ${d.c}`:`1px solid ${C.border}`,background:sd===i?d.c+"15":C.white,cursor:"pointer",fontFamily:F.b,fontSize:11,fontWeight:600,color:sd===i?d.c:C.tl}}>{d.d}</button>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>{dp.v.map((v,i)=>(<a key={i} href={"https://www.youtube.com/results?search_query="+v.y} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:"column"}}><div style={{background:gr[sd],padding:"14px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}><span style={{fontSize:28}}>{v.ic}</span><div style={{position:"absolute",right:5,bottom:3,background:"rgba(255,0,0,0.9)",borderRadius:3,padding:"1px 4px"}}><span style={{color:"#fff",fontSize:7,fontWeight:700}}>▶ YT</span></div></div><div style={{padding:"7px 9px"}}><div style={{fontSize:11,fontWeight:700}}>{lang==="hi"?v.h:v.t}</div></div></a>))}</div>
    </div>}
    {tab==="chem"&&<div>
      <p style={{fontSize:10,color:C.tl,margin:"0 0 8px"}}>Kleanfix Industries · kleanfix.com · +91 98189 98806</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>{CHEM_DATA.map((sec,si)=>(<div key={si} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}><div style={{background:"linear-gradient(135deg,#2D2D2D,#4a4a4a)",padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:700}}>{sec.area}</div><div style={{padding:"4px 10px"}}>{sec.items.map((it,ii)=>(<div key={ii} style={{padding:"4px 0",borderBottom:ii<sec.items.length-1?"1px solid #EDEDED":"none"}}><div style={{fontSize:11,fontWeight:700,color:C.maroon}}>{it.p}</div><div style={{fontSize:9,color:C.tl}}>{it.u}</div></div>))}</div></div>))}</div>
    </div>}
  </div>);
}

function MembersView({L,customMembers,setCustomMembers,removedIds,setRemovedIds}){
  const[showAdd,setShowAdd]=useState(false);
  const[fName,setFName]=useState("");const[fUser,setFUser]=useState("");const[fPass,setFPass]=useState("");
  const[fProp,setFProp]=useState("pp");const[fDept,setFDept]=useState("h");
  const deptNames={h:"🌱 Horticulture",k:"🧹 Housekeeping",a:"📋 Admin",s:"🛡️ Security"};
  const addMember=()=>{
    if(!fName.trim()||!fUser.trim())return;
    const id="cm_"+Date.now();
    setCustomMembers(prev=>[...prev,{id,n:fName.trim(),u:fUser.trim().toLowerCase(),p:fPass||fUser.trim()+"@123",prop:fProp,dept:fDept,role:"e"}]);
    setFName("");setFUser("");setFPass("");setShowAdd(false);
  };
  const removeMember=(id)=>{
    const isCustom=customMembers.find(m=>m.id===id);
    if(isCustom)setCustomMembers(prev=>prev.filter(m=>m.id!==id));
    else setRemovedIds(prev=>[...prev,id]);
  };
  const restoreMember=(id)=>{setRemovedIds(prev=>prev.filter(x=>x!==id));};
  const allByProp={};
  Object.entries(PROPS).forEach(([pk,p])=>{
    allByProp[pk]={prop:p,members:[]};
    Object.entries(p.depts).forEach(([dk,d])=>{
      d.m.forEach(m=>{
        const isRemoved=removedIds.includes(m.id);
        allByProp[pk].members.push({...m,dept:dk,deptName:d.n,deptIcon:d.i,deptColor:d.c,isRemoved,isCustom:false});
      });
    });
  });
  customMembers.forEach(cm=>{
    if(!allByProp[cm.prop])return;
    const d=PROPS[cm.prop]?.depts?.[cm.dept];
    allByProp[cm.prop].members.push({...cm,deptName:d?.n||cm.dept,deptIcon:d?.i||"",deptColor:d?.c||C.blue,isRemoved:false,isCustom:true});
  });
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontFamily:F.d,fontSize:22,fontWeight:700,color:C.maroon,margin:0}}>👤 {L.members}</h1>
      <Btn2 primary small onClick={()=>setShowAdd(!showAdd)}>➕ {L.addMember}</Btn2>
    </div>
    {showAdd&&<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.maroon}`,marginBottom:16}}>
      <div style={{fontFamily:F.d,fontSize:15,fontWeight:700,color:C.maroon,marginBottom:10}}>➕ {L.addMember}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <input placeholder={L.memberName} value={fName} onChange={e=>setFName(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/>
        <input placeholder="Username" value={fUser} onChange={e=>setFUser(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/>
        <input placeholder="Password (auto: user@123)" value={fPass} onChange={e=>setFPass(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12,outline:"none"}}/>
        <select value={fProp} onChange={e=>setFProp(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>
          {Object.entries(PROPS).map(([k,p])=><option key={k} value={k}>{p.icon} {p.sn}</option>)}
        </select>
        <select value={fDept} onChange={e=>setFDept(e.target.value)} style={{padding:10,borderRadius:8,border:`1px solid ${C.border}`,fontFamily:F.b,fontSize:12}}>
          {Object.entries(deptNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10}}><Btn2 primary onClick={addMember}>{L.save}</Btn2><Btn2 onClick={()=>setShowAdd(false)}>{L.cancel}</Btn2></div>
    </div>}
    {Object.entries(allByProp).map(([pk,{prop,members}])=>(<div key={pk} style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
      <div style={{fontFamily:F.d,fontSize:16,fontWeight:700,color:C.maroon,marginBottom:10}}>{prop.icon} {prop.sn} <span style={{fontSize:12,fontWeight:400,color:C.tl}}>({members.filter(m=>!m.isRemoved).length} active)</span></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
        {members.map(m=>(<div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:m.isRemoved?C.rBg+"44":m.isCustom?C.bBg:C.bg,borderRadius:10,borderLeft:`3px solid ${m.isRemoved?C.red:m.deptColor}`,opacity:m.isRemoved?0.5:1}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:m.isRemoved?C.red:m.deptColor,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:700,fontSize:11}}>{m.n[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:600,textDecoration:m.isRemoved?"line-through":"none"}}>{m.n}</div>
            <div style={{fontSize:9,color:C.tl}}>{m.deptIcon} {m.deptName} {m.isCustom&&<span style={{color:C.blue,fontWeight:600}}>NEW</span>}</div>
          </div>
          {m.isRemoved
            ?<button onClick={()=>restoreMember(m.id)} style={{padding:"4px 8px",borderRadius:6,border:"none",background:C.gBg,color:C.green,fontFamily:F.b,fontSize:9,fontWeight:600,cursor:"pointer"}}>↩ Restore</button>
            :<button onClick={()=>removeMember(m.id)} style={{padding:"4px 8px",borderRadius:6,border:"none",background:C.rBg,color:C.red,fontFamily:F.b,fontSize:9,fontWeight:600,cursor:"pointer"}}>✕ {L.removeMember}</button>}
        </div>))}
      </div>
    </div>))}
  </div>);
}
function PropBar({ap,setAP,user:u}){
  const av=u.prop==="all"?Object.values(PROPS):[PROPS[u.prop]].filter(Boolean);
  return(<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{av.map(p=>{const a=ap===p.id;return(<button key={p.id} onClick={()=>setAP(p.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:a?`2px solid ${C.maroon}`:`1px solid ${C.border}`,background:a?C.maroonSoft:C.white,cursor:"pointer",fontFamily:F.b}}><span style={{fontSize:13}}>{p.icon}</span><span style={{fontSize:10,fontWeight:a?700:500,color:a?C.maroon:C.text}}>{p.sn}</span>{a&&<span style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>}</button>);})}</div>);
}

// ═══ APP ═══
export default function App(){
  const[lang,setLang]=useState("en");const[user,setUser]=useState(null);const[aP,sAP]=useState("pp");const[view,sV]=useState("dashboard");const[tS,sTS]=useState(ALL_T);const[ns,setNs]=useState([]);const[sN,setSN]=useState(false);const[att,setAtt]=useState([]);const[pm,setPM]=useState(false);const[pAs,setPAs]=useState("pp_poonam");const[dirs,setDirs]=useState([]);const[customMembers,setCM]=useState([]);const[removedIds,setRI]=useState([]);
  const L=LANGS[lang];
  const allS=useMemo(()=>Object.entries(PROPS).flatMap(([pk,p])=>Object.entries(p.depts).flatMap(([dk,d])=>d.m.map(m=>({...m,dept:dk,dn:d.n,di:d.i,pid:pk,pn:p.sn})))),[]);

  if(!user)return <LoginScreen onLogin={(u2)=>{setUser(u2);if(u2.prop!=="all")sAP(u2.prop);sV(u2.role==="e"?"mytasks":"dashboard");}} lang={lang} setLang={setLang}/>;

  const ps=allS.find(s=>s.id===pAs);
  const eU=pm&&user.role==="sa"&&ps?{id:ps.id,name:ps.n,role:"e",prop:ps.pid}:user;
  const isA=eU.role==="sa"||eU.role==="a";
  const eP=pm&&ps?ps.pid:aP;
  const prop=PROPS[eP];const tasks=tS[eP]||[];
  const setTasks=(fn)=>{sTS(prev=>{const nt=typeof fn==="function"?fn(prev[eP]||[]):fn;const ot=prev[eP]||[];nt.forEach(n2=>{const o=ot.find(t=>t.id===n2.id);if(o){if(o.status!=="completed"&&n2.status==="completed")setNs(p=>[{type:"done",task:n2.title,by:n2.completedBy||n2.assigneeName,prop:prop.sn,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})},...p]);if(o.status!=="issue"&&n2.status==="issue")setNs(p=>[{type:"issue",task:n2.title,by:n2.assigneeName,prop:prop.sn,time:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})},...p]);}});return{...prev,[eP]:nt};});};

  return(<div style={{fontFamily:F.b,background:C.bg,minHeight:"100vh",color:C.text}}>
    <Sidebar view={view} setView={sV} user={user} onLogout={()=>{setUser(null);setPM(false);sV("dashboard");}} lang={lang} setLang={setLang} nC={ns.length} setShowN={setSN} L={L} pm={pm} setPM={setPM} pAs={pAs} setPAs={setPAs} allS={allS} dirs={dirs}/>
    {sN&&<NPanel ns={ns} onClose={()=>setSN(false)} onClr={()=>{setNs([]);setSN(false);}} L={L} onClickNotif={(n)=>{sV("directives");}}/>}
    <div style={{marginLeft:185,padding:"0 18px 18px",minHeight:"100vh"}}>
      {pm&&ps&&<div style={{background:`linear-gradient(90deg,${C.blue},${C.maroon})`,color:C.white,padding:"8px 14px",borderRadius:10,marginTop:10,marginBottom:4,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}><span>👁️</span><span style={{fontSize:12,fontWeight:700}}>{L.previewAs}: {ps.n} - {ps.pn}</span></div><button onClick={()=>{setPM(false);sV("dashboard");}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.15)",color:C.white,fontFamily:F.b,fontSize:10,fontWeight:700,cursor:"pointer"}}>{L.previewOff}</button></div>}
      {!pm&&<div style={{position:"sticky",top:0,zIndex:40,background:C.bg,padding:"10px 0"}}><PropBar ap={aP} setAP={sAP} user={user}/></div>}
      {isA?(<>
        {view==="dashboard"&&<Dash tasks={tasks} prop={prop} L={L}/>}
        {view==="tasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt="tasks" L={L} lang={lang}/>}
        {view==="directives"&&<AssignedTasksView user={eU} dirs={dirs} setDirs={setDirs} L={L} setNs={setNs} setView={sV}/>}
        {view==="team"&&<TeamV tasks={tasks} prop={prop} L={L}/>}
        {view==="areas"&&<AreasV tasks={tasks} prop={prop} L={L}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="members"&&<MembersView L={L} customMembers={customMembers} setCustomMembers={setCM} removedIds={removedIds} setRemovedIds={setRI}/>}
        {view==="training"&&<TrainingView lang={lang}/>}
      </>):(<>
        {view==="mytasks"&&<TLV tasks={tasks} setTasks={setTasks} prop={prop} user={eU} vt="mytasks" L={L} lang={lang}/>}
        {view==="directives"&&<AssignedTasksView user={eU} dirs={dirs} setDirs={setDirs} L={L} setNs={setNs} setView={sV}/>}
        {view==="att"&&<AttView user={eU} att={att} setAtt={setAtt} prop={prop} L={L}/>}
        {view==="training"&&<TrainingView lang={lang}/>}
      </>)}
    </div></div>);
}
