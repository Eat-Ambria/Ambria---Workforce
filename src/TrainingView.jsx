import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F, LANGS, PROPS } from "./constants.js";

const TRAIN = [
  {
    dept: "k", d: "🧹 Housekeeping", c: C.blue, gr: "linear-gradient(135deg,#1e3a5f,#2d6ca5)",
    v: [
      { id: "hk_0", t: "Housekeeping Training", h: "हाउसकीपिंग", y: "hotel+housekeeping+training+hindi", ic: "🏨" },
      { id: "hk_1", t: "Washroom Cleaning SOP", h: "शौचालय सफ़ाई", y: "washroom+cleaning+SOP+hindi", ic: "🚽" },
      { id: "hk_2", t: "Floor Mopping Technique", h: "फ़र्श पोछा", y: "floor+mopping+hindi", ic: "🧹" },
      { id: "hk_3", t: "Bed Making Standards", h: "बिस्तर", y: "hotel+bed+making+hindi", ic: "🛏️" },
      { id: "hk_4", t: "Chemical Safety", h: "केमिकल सुरक्षा", y: "cleaning+chemical+safety+hindi", ic: "🧪" },
    ]
  },
  {
    dept: "h", d: "🌱 Horticulture", c: C.green, gr: "linear-gradient(135deg,#1a4d2e,#2d8f52)",
    v: [
      { id: "ho_0", t: "Lawn Care & Mowing", h: "लॉन केयर", y: "lawn+care+hindi", ic: "🌿" },
      { id: "ho_1", t: "Hedge Trimming", h: "हेज कटाई", y: "hedge+trimming+hindi", ic: "✂️" },
      { id: "ho_2", t: "Fertilizer Application", h: "खाद गाइड", y: "fertilizer+manure+hindi", ic: "🧑‍🌾" },
      { id: "ho_3", t: "Pest Control", h: "कीट नियंत्रण", y: "pest+control+garden+hindi", ic: "🪲" },
      { id: "ho_4", t: "Tree Pruning", h: "पेड़ कटाई", y: "tree+pruning+hindi", ic: "🌳" },
    ]
  },
  {
    dept: "a", d: "📋 Admin", c: C.maroon, gr: "linear-gradient(135deg,#5c1a2a,#9a2e42)",
    v: [
      { id: "ad_0", t: "Facility Management", h: "फैसिलिटी", y: "facility+management+hindi", ic: "🏢" },
      { id: "ad_1", t: "DG Set Operation", h: "डीजी सेट", y: "DG+set+generator+hindi", ic: "⚡" },
      { id: "ad_2", t: "CCTV Monitoring", h: "सीसीटीवी", y: "CCTV+system+hindi", ic: "📹" },
    ]
  },
  {
    dept: "s", d: "🛡️ Security", c: C.purple, gr: "linear-gradient(135deg,#3b1a6b,#6b21a8)",
    v: [
      { id: "sc_0", t: "Fire Safety", h: "अग्नि सुरक्षा", y: "fire+safety+hindi", ic: "🔥" },
      { id: "sc_1", t: "First Aid & CPR", h: "प्राथमिक उपचार", y: "first+aid+CPR+hindi", ic: "🏥" },
      { id: "sc_2", t: "Security Protocols", h: "सुरक्षा", y: "security+guard+hindi", ic: "💂" },
      { id: "sc_3", t: "Fire Extinguisher Use", h: "अग्निशामक", y: "fire+extinguisher+hindi", ic: "🧯" },
    ]
  },
];

const CHEM_DATA = [
  { area: "🏛️ Banquet Tiles", items: [{ p: "K2 Hard Surface (Kleanfix)", u: "20ml/1L daily mop" }, { p: "K20 Floor Striper", u: "10-20ml warm deep clean" }, { p: "K102 All-in-One", u: "Floors walls sinks" }] },
  { area: "🚽 Washroom", items: [{ p: "K1 Bathroom Sanitizer", u: "20-50ml/1L tub tiles" }, { p: "K6 Toilet Bowl Cleaner", u: "Ready — toilet urinal" }, { p: "K5 Air Freshener", u: "Ready — all areas" }] },
  { area: "🪟 Glass · 🪑 Wood · 🔧 Steel", items: [{ p: "K3 Glass Cleaner", u: "20-50ml/1L mirror" }, { p: "K4 Wood Maintainer", u: "Ready — furniture floor" }, { p: "K7 S.S. Polish", u: "Ready — steel grills" }] },
  { area: "🧹 Carpet · 👔 Laundry", items: [{ p: "K101 Carpet Shampoo", u: "50-100ml/1L carpet sofa" }, { p: "Kleanpro-L Det", u: "Fabric deep cleaning" }, { p: "Kleanpro-Fab Soft", u: "Fabric softener" }] },
  { area: "🌿 Lawn · 🌺 Flowers", items: [{ p: "NPK 19:19:19", u: "Monthly balanced feed" }, { p: "Urea + Neem oil", u: "Green boost + pest" }, { p: "Vermicompost + Bone meal", u: "Organic + bloom" }] },
];

export default function TrainingView({ user, prop, lang }) {
  const L = LANGS[lang];
  const isAdmin = user.role === "sa" || user.role === "a";
  const [tab, setTab] = useState("videos");
  const [deptIdx, setDeptIdx] = useState(0);
  const [progress, setProgress] = useState({}); // { video_id: true }
  const [staffProgress, setStaffProgress] = useState([]); // all watched records (admin only)
  const [saving, setSaving] = useState(null);

  const dp = TRAIN[deptIdx];

  // Load own progress
  useEffect(() => {
    supabase.from("training_progress")
      .select("video_key")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(r => { map[r.video_key] = true; });
          setProgress(map);
        }
      });
  }, [user.id]);

  // Load all staff progress (admin view)
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("training_progress")
      .select("*")
      .then(({ data }) => { if (data) setStaffProgress(data); });
  }, [isAdmin, prop.id]);

  const markWatched = async (videoId) => {
    setSaving(videoId);
    const { error } = await supabase.from("training_progress").upsert(
      { user_id: user.id, video_key: videoId, department: user.department || user.dept || null, completed: true, completed_at: new Date().toISOString() },
      { onConflict: "user_id,video_key" }
    );
    if (!error) setProgress(prev => ({ ...prev, [videoId]: true }));
    setSaving(null);
  };

  const unmarkWatched = async (videoId) => {
    await supabase.from("training_progress").delete().eq("user_id", user.id).eq("video_key", videoId);
    setProgress(prev => { const n = { ...prev }; delete n[videoId]; return n; });
  };

  // All videos flat list
  const allVideos = TRAIN.flatMap(d => d.v);
  const myWatched = allVideos.filter(v => progress[v.id]).length;
  const myPct = allVideos.length ? Math.round((myWatched / allVideos.length) * 100) : 0;

  // Staff progress summary (admin)
  const allStaff = Object.values(prop?.depts||{}).flatMap(d => d.m.map(m => ({ ...m, deptName: d.n })));
  const staffSummary = allStaff.map(m => {
    const watched = staffProgress.filter(r => r.user_id === m.id).length;
    return { ...m, watched, total: allVideos.length, pct: allVideos.length ? Math.round((watched / allVideos.length) * 100) : 0 };
  });

  return (
    <div style={{ fontFamily: F.b }}>
      <h1 style={{ fontFamily: F.d, fontSize: 22, fontWeight: 700, color: C.maroon, margin: "0 0 4px" }}>
        🎓 {lang === "hi" ? "प्रशिक्षण और ज्ञान" : "Training & Knowledge"}
      </h1>

      {/* ── My Progress Bar ── */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "10px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>
            {user.name} — {L.trainingPct}
          </span>
          <span style={{ fontFamily: F.d, fontSize: 18, fontWeight: 700, color: myPct === 100 ? C.green : C.maroon }}>
            {myWatched}/{allVideos.length} ({myPct}%)
          </span>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${myPct}%`, background: myPct === 100 ? C.green : C.maroon, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* ── Tab Toggle ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14, background: C.maroonSoft, borderRadius: 10, padding: 3, width: "fit-content" }}>
        {[
          { id: "videos", label: "🎬 Videos" },
          { id: "chem", label: "🧪 Chemical Guide" },
          ...(isAdmin ? [{ id: "staff", label: `👥 ${L.staffProgress}` }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: F.b, fontSize: 12, fontWeight: 700,
            background: tab === t.id ? C.maroon : "transparent",
            color: tab === t.id ? C.white : C.maroon
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Videos Tab ── */}
      {tab === "videos" && (
        <div>
          {/* Dept selector */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {TRAIN.map((d, i) => (
              <button key={i} onClick={() => setDeptIdx(i)} style={{
                padding: "6px 12px", borderRadius: 8,
                border: deptIdx === i ? `2px solid ${d.c}` : `1px solid ${C.border}`,
                background: deptIdx === i ? d.c + "15" : C.white,
                cursor: "pointer", fontFamily: F.b, fontSize: 11, fontWeight: 600,
                color: deptIdx === i ? d.c : C.tl
              }}>{d.d}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
            {dp.v.map((v) => {
              const watched = !!progress[v.id];
              const isSaving = saving === v.id;
              return (
                <div key={v.id} style={{
                  background: watched ? C.gBg : C.white, borderRadius: 12,
                  border: `1px solid ${watched ? C.green : C.border}`,
                  overflow: "hidden", display: "flex", flexDirection: "column"
                }}>
                  {/* Thumbnail */}
                  <a href={`https://www.youtube.com/results?search_query=${v.y}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: "none", background: dp.gr, padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <span style={{ fontSize: 30 }}>{v.ic}</span>
                    <div style={{ position: "absolute", right: 5, bottom: 3, background: "rgba(255,0,0,0.9)", borderRadius: 3, padding: "1px 4px" }}>
                      <span style={{ color: "#fff", fontSize: 7, fontWeight: 700 }}>▶ YT</span>
                    </div>
                    {watched && (
                      <div style={{ position: "absolute", top: 5, right: 5, background: C.green, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
                      </div>
                    )}
                  </a>
                  {/* Info */}
                  <div style={{ padding: "8px 10px", flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                      {lang === "hi" ? v.h : v.t}
                    </div>
                    <button
                      onClick={() => watched ? unmarkWatched(v.id) : markWatched(v.id)}
                      disabled={isSaving}
                      style={{
                        width: "100%", padding: "7px", borderRadius: 7, border: "none", cursor: "pointer",
                        fontFamily: F.b, fontSize: 10, fontWeight: 700,
                        background: watched ? C.gBg : C.maroon,
                        color: watched ? C.green : C.white,
                        opacity: isSaving ? 0.6 : 1
                      }}
                    >
                      {isSaving ? "..." : watched ? `✓ ${L.watched}` : `📺 ${L.markWatched}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chemical Guide Tab ── */}
      {tab === "chem" && (
        <div>
          <p style={{ fontSize: 10, color: C.tl, margin: "0 0 8px" }}>
            Kleanfix Industries · kleanfix.com · +91 98189 98806
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
            {CHEM_DATA.map((sec, si) => (
              <div key={si} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg,#2D2D2D,#4a4a4a)", padding: "8px 12px", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                  {sec.area}
                </div>
                <div style={{ padding: "4px 10px" }}>
                  {sec.items.map((it, ii) => (
                    <div key={ii} style={{ padding: "6px 0", borderBottom: ii < sec.items.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.maroon }}>{it.p}</div>
                      <div style={{ fontSize: 9, color: C.tl }}>{it.u}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Staff Progress Tab (Admin) ── */}
      {tab === "staff" && isAdmin && (
        <div>
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>
              👥 {L.staffProgress} — {prop.sn}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
              {staffSummary.map(m => (
                <div key={m.id} style={{ padding: "10px 12px", background: C.bg, borderRadius: 10, borderLeft: `3px solid ${m.pct === 100 ? C.green : C.maroon}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.pct === 100 ? C.green : C.maroon, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 9, fontWeight: 700 }}>{m.n[0]}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{m.n}</div>
                        <div style={{ fontSize: 9, color: C.tl }}>{m.deptName}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: m.pct === 100 ? C.green : C.maroon }}>{m.pct}%</div>
                      <div style={{ fontSize: 8, color: C.tl }}>{m.watched}/{m.total}</div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${m.pct}%`, background: m.pct === 100 ? C.green : C.maroon, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
