import { useState } from "react";
import { C, F } from "./constants.js";

// ── Department meta ────────────────────────────────────────────────────────────
const DM = {
  h:{ icon:"🌱", label:"Horticulture", lH:"हॉर्टिकल्चर", c:C.green,  bg:C.gBg       },
  k:{ icon:"🧹", label:"Housekeeping", lH:"हाउसकीपिंग",  c:C.blue,   bg:C.bBg       },
  a:{ icon:"📋", label:"Admin",        lH:"एडमिन",       c:C.maroon, bg:C.maroonSoft },
  s:{ icon:"🛡️", label:"Security",     lH:"सुरक्षा",      c:C.purple, bg:C.pBg       },
};

// ── Property meta ──────────────────────────────────────────────────────────────
const PM = {
  pp:{ l:"Pushpanjali", c:"#2E8B57" },
  ex:{ l:"Exotica",     c:"#C4956A" },
  mk:{ l:"Manaktala",   c:"#3B6FC0" },
  rs:{ l:"Restro",      c:"#9A2E42" },
  all:{ l:"All Venues", c:C.maroon  },
};

// ── Org tree data ──────────────────────────────────────────────────────────────
// type: "founder" | "mgmt" | "sa" | "dept"
// dept key maps to DM; prop key maps to PM
// Leaf dept-nodes have a `members` array of strings
const TREE = {
  id:"harsh", name:"Harsh Vardhan", title:"Founder & Director", type:"founder",
  children:[{
    id:"vicky", name:"Vicky Arya", title:"Overall Head", type:"mgmt", prop:"all",
    children:[
      {
        id:"sonu", name:"Sonu Mali", title:"Site Head", type:"mgmt", dept:"a", prop:"pp",
        children:[
          { id:"pp_h", name:"Horticulture", title:"3 staff", type:"dept", dept:"h", prop:"pp",
            members:["Pawan","Dayashankar","Sunil"] },
          { id:"pp_k", name:"Housekeeping", title:"5 staff", type:"dept", dept:"k", prop:"pp",
            members:["Poonam (2IC)","Neeru","Umesh","Dinesh","Lalita"] },
          { id:"pp_s", name:"Security", title:"4 guards", type:"dept", dept:"s", prop:"pp",
            members:["Day Guard 1 (3rd party)","Day Guard 2 (3rd party)","Night Guard 1 (3rd party)","Night Guard 2 (3rd party)"] },
        ]
      },
      {
        id:"mahesh", name:"Mahesh", title:"Supervisor", type:"mgmt", dept:"a", prop:"ex",
        children:[
          { id:"ex_h", name:"Horticulture", title:"3 staff", type:"dept", dept:"h", prop:"ex",
            members:["Sonu (Hort.)","Dhruv","Kamlesh"] },
          { id:"ex_k", name:"Housekeeping", title:"4 staff", type:"dept", dept:"k", prop:"ex",
            members:["Sunita","Brijesh","Ragini","Rani"] },
          { id:"ex_s", name:"Security", title:"4 guards", type:"dept", dept:"s", prop:"ex",
            members:["Bhupender (Ambria — Day)","Kitchen Guard (3rd party — Day)","Night Guard 1 (3rd party)","Night Guard 2 (3rd party)"] },
        ]
      },
      {
        id:"rahees", name:"Rahees", title:"Supervisor", type:"mgmt", dept:"a", prop:"mk",
        children:[
          { id:"mk_h", name:"Horticulture", title:"3 staff", type:"dept", dept:"h", prop:"mk",
            members:["Mukesh","Tulsi","Akash (Hort.)"] },
          { id:"mk_k", name:"Housekeeping", title:"4 staff", type:"dept", dept:"k", prop:"mk",
            members:["Sadna","Lovekush","Akash","Ajay"] },
          { id:"mk_s", name:"Security", title:"2 guards", type:"dept", dept:"s", prop:"mk",
            members:["Ajay Sec (Ambria — Day)","Night Guard (3rd party)"] },
        ]
      },
      {
        id:"restro", name:"Restro — Direct", title:"Managed by Vicky Arya", type:"mgmt", prop:"rs",
        children:[
          { id:"rs_k", name:"Housekeeping", title:"5 staff", type:"dept", dept:"k", prop:"rs",
            members:["Suresh","Roma","Anita","Arjun","Vinay"] },
          { id:"rs_h", name:"Horticulture", title:"1 staff", type:"dept", dept:"h", prop:"rs",
            members:["Ramu"] },
          { id:"rs_s", name:"Security", title:"2 guards", type:"dept", dept:"s", prop:"rs",
            members:["Santosh (Ambria — Day)","Night Guard (3rd party)"] },
        ]
      },
      {
        id:"sandeep", name:"Sandeep", title:"Security Head — All Venues", type:"mgmt", dept:"s", prop:"all",
        children:[
          { id:"san_pp", name:"Pushpanjali Security", title:"4 guards", type:"dept", dept:"s", prop:"pp",
            members:["Day Guard 1 (3rd party)","Day Guard 2 (3rd party)","Night Guard 1 (3rd party)","Night Guard 2 (3rd party)"] },
          { id:"san_ex", name:"Exotica Security", title:"4 guards", type:"dept", dept:"s", prop:"ex",
            members:["Bhupender (Ambria — Day)","Kitchen Guard (3rd party — Day)","Night Guard 1 (3rd party)","Night Guard 2 (3rd party)"] },
          { id:"san_mk", name:"Manaktala Security", title:"2 guards", type:"dept", dept:"s", prop:"mk",
            members:["Ajay Sec (Ambria — Day)","Night Guard (3rd party)"] },
          { id:"san_rs", name:"Restro Security", title:"2 guards", type:"dept", dept:"s", prop:"rs",
            members:["Santosh (Ambria — Day)","Night Guard (3rd party)"] },
        ]
      },
      {
        id:"abhishek", name:"Abhishek", title:"Efficiency Manager / Super Admin",
        type:"sa", dept:"a", prop:"all",
      },
    ]
  }]
};

// ── Recursive node ─────────────────────────────────────────────────────────────
function OrgNode({ node, depth, expanded, toggle }) {
  const canExpand = !!(node.children?.length || node.members?.length);
  const isOpen = !!expanded[node.id];
  const isDept = node.type === "dept";
  const isFounder = node.type === "founder";
  const isSANode = node.type === "sa";

  const dm = node.dept ? DM[node.dept] : null;
  const pm = node.prop ? PM[node.prop] : null;

  // Primary color for this node
  const nodeC = isFounder ? "#B8860B"
    : isSANode ? C.blue
    : dm ? dm.c
    : C.maroon;

  const nodeBg = isFounder ? "#FFFCE8"
    : isSANode ? C.bBg
    : isDept ? (dm?.bg || C.maroonSoft)
    : C.white;

  const borderOpacity = depth <= 1 ? "55" : "28";
  const avatarChar = isDept ? (dm?.icon || "•")
    : isFounder ? "H"
    : isSANode ? "A"
    : node.name[0];

  const avatarSize = depth === 0 ? 42 : depth === 1 ? 36 : 28;
  const nameSize = depth === 0 ? 16 : depth === 1 ? 14 : 12;
  const titleSize = depth === 0 ? 10 : 9;
  const padV = depth === 0 ? 14 : depth === 1 ? 11 : 8;

  const count = node.children?.length || node.members?.length || 0;

  return (
    <div style={{ marginBottom: 5 }}>
      {/* ── Node card ── */}
      <div
        onClick={() => canExpand && toggle(node.id)}
        style={{
          display:"flex", alignItems:"center", gap:9,
          padding:`${padV}px 12px`,
          borderRadius:10,
          background:nodeBg,
          border:`2px solid ${nodeC}${borderOpacity}`,
          cursor:canExpand?"pointer":"default",
          boxShadow:depth<=1?"0 2px 8px rgba(0,0,0,0.07)":"none",
          userSelect:"none",
        }}
      >
        {/* Expand chevron */}
        <span style={{
          fontSize:9, color:nodeC, fontWeight:700,
          minWidth:10, display:"inline-block",
          transform:isOpen?"rotate(90deg)":"none",
          transition:"transform 0.18s",
          opacity:canExpand?1:0,
        }}>▶</span>

        {/* Avatar */}
        <div style={{
          width:avatarSize, height:avatarSize, borderRadius:"50%",
          background:`linear-gradient(135deg,${nodeC},${nodeC}BB)`,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#fff", fontWeight:700,
          fontSize:isDept?16:Math.round(avatarSize*0.42),
          fontFamily:isDept?"inherit":F.d,
          flexShrink:0, boxShadow:`0 2px 6px ${nodeC}30`,
        }}>
          {avatarChar}
        </div>

        {/* Name + title */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontFamily:depth<=1?F.d:F.b,
            fontSize:nameSize, fontWeight:700,
            color:nodeC, lineHeight:1.25,
          }}>
            {node.name}
          </div>
          <div style={{ fontSize:titleSize, color:C.tl, marginTop:1 }}>{node.title}</div>
        </div>

        {/* Right badges */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
          {isSANode && (
            <span style={{ fontSize:8, padding:"2px 6px", borderRadius:4, background:C.bBg, color:C.blue, fontWeight:700 }}>
              Super Admin
            </span>
          )}
          {dm && !isDept && (
            <span style={{ fontSize:8, padding:"2px 6px", borderRadius:4, background:dm.bg, color:dm.c, fontWeight:700, whiteSpace:"nowrap" }}>
              {dm.icon} {dm.label}
            </span>
          )}
          {pm && (
            <span style={{ fontSize:8, padding:"2px 6px", borderRadius:4, background:pm.c+"18", color:pm.c, fontWeight:700, whiteSpace:"nowrap" }}>
              {pm.l}
            </span>
          )}
          {canExpand && (
            <span style={{
              fontSize:8, padding:"1px 6px", borderRadius:10, fontWeight:700, whiteSpace:"nowrap",
              background:isOpen?nodeC:C.border, color:isOpen?"#fff":C.tl,
              transition:"background 0.18s",
            }}>
              {count}
            </span>
          )}
        </div>
      </div>

      {/* ── Expanded content ── */}
      {isOpen && (
        <div style={{
          marginLeft:20, paddingLeft:13,
          borderLeft:`2px solid ${nodeC}28`,
          marginTop:4,
        }}>
          {node.children?.map(child => (
            <OrgNode key={child.id} node={child} depth={depth+1} expanded={expanded} toggle={toggle}/>
          ))}
          {node.members?.map((m,i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"6px 10px",
              background:C.bg, borderRadius:7,
              marginBottom:4,
              border:`1px solid ${C.border}`,
            }}>
              <div style={{
                width:22, height:22, borderRadius:"50%",
                background:nodeC+"22",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, fontWeight:700, color:nodeC, flexShrink:0,
              }}>{m[0]}</div>
              <span style={{ fontSize:11, color:C.text }}>{m}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── All-node IDs for expand-all ────────────────────────────────────────────────
function collectIds(node, acc={}) {
  acc[node.id]=true;
  node.children?.forEach(c=>collectIds(c,acc));
  return acc;
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function OrgChart({ lang }) {
  const H = lang==="hi";
  // Start with only the root expanded so Level 0 + Level 1 (Vicky) are visible
  const [expanded, setExpanded] = useState({ harsh:true });

  const toggle = id => setExpanded(p=>({...p,[id]:!p[id]}));

  return (
    <div style={{ fontFamily:F.b }}>
      {/* Header */}
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontFamily:F.d, fontSize:22, fontWeight:700, color:C.maroon, margin:"0 0 3px" }}>
          🏢 {H?"संगठन संरचना":"Organisation Structure"}
        </h1>
        <p style={{ fontSize:11, color:C.tl, margin:0 }}>
          {H?"किसी भी नाम पर टैप करें — नीचे की टीम दिखेगी":"Tap any name to expand the team below them"}
        </p>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:5, marginBottom:14, flexWrap:"wrap" }}>
        {[
          { c:"#B8860B", bg:"#FFFCE8", l:"🏛️ Founder"     },
          { c:C.maroon,  bg:C.maroonSoft, l:"👑 Management" },
          { c:C.green,   bg:C.gBg,    l:"🌱 Horticulture" },
          { c:C.blue,    bg:C.bBg,    l:"🧹 Housekeeping" },
          { c:C.purple,  bg:C.pBg,    l:"🛡️ Security"     },
        ].map(leg=>(
          <span key={leg.l} style={{
            fontSize:9, padding:"3px 8px", borderRadius:6,
            background:leg.bg, color:leg.c,
            fontWeight:700, border:`1px solid ${leg.c}28`,
          }}>
            {leg.l}
          </span>
        ))}
      </div>

      {/* Tree */}
      <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:16 }}>
        <OrgNode node={TREE} depth={0} expanded={expanded} toggle={toggle}/>
      </div>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, marginTop:10 }}>
        <button
          onClick={()=>setExpanded(collectIds(TREE))}
          style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.white, fontFamily:F.b, fontSize:11, cursor:"pointer", color:C.text }}
        >
          ⊞ {H?"सब खोलें":"Expand All"}
        </button>
        <button
          onClick={()=>setExpanded({})}
          style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.white, fontFamily:F.b, fontSize:11, cursor:"pointer", color:C.text }}
        >
          ⊟ {H?"सब बंद करें":"Collapse All"}
        </button>
      </div>
    </div>
  );
}
