// ValetPortal.jsx — Valet Staff Car Management Portal
// Dark theme always (outdoor night use), mobile-first
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { F } from "./constants.js";

// ── Always-dark palette ────────────────────────────────────────────────────────
const DK = {
  bg:          "#111111",
  card:        "#1A1A1A",
  card2:       "#222222",
  border:      "#333333",
  text:        "#E5E5E5",
  textSub:     "#9CA3AF",
  maroon:      "#C4475E",
  maroonSoft:  "#2D1A1F",
  green:       "#4ADE80",
  greenBg:     "#0D2818",
  greenBorder: "#1a4a2e",
  blue:        "#60A5FA",
  blueBg:      "#0C1E3A",
  yellow:      "#FBBF24",
  yellowBg:    "#2D2305",
  red:         "#F87171",
  redBg:       "#2D0F0F",
  input:       "#2A2A2A",
  inputBorder: "#444444",
};

const PARKING_ZONES = {
  pp: ["Zone A (Front)", "Zone B (Side)", "Zone C (Back)", "Zone D (Lawn Side)", "Overflow"],
  ex: ["Zone A (Main Gate)", "Zone B (Aura Side)", "Zone C (Valencia Side)", "Zone D (Back)", "Overflow"],
  mk: ["Zone A (Front)", "Zone B (Emerald Side)", "Zone C (Alstonia Side)", "Overflow"],
  rs: ["Zone A (Front)", "Zone B (Side)", "Overflow"],
};

const CAR_COLORS = [
  { id: "White",  emoji: "⬜" },
  { id: "Black",  emoji: "⬛" },
  { id: "Red",    emoji: "🔴" },
  { id: "Blue",   emoji: "🔵" },
  { id: "Silver", emoji: "⚪" },
  { id: "Brown",  emoji: "🟤" },
  { id: "Gold",   emoji: "🟡" },
  { id: "Other",  emoji: "🎨" },
];

export const PROP_NAMES = { pp: "Pushpanjali", ex: "Exotica", mk: "Manaktala", rs: "Restro" };

// ── Image compression (same as App.jsx) ───────────────────────────────────────
const compressImage = (dataUrl, maxKB = 80) => new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    const mx = 1200;
    if (w > mx || h > mx) {
      if (w > h) { h = Math.round(h * mx / w); w = mx; }
      else { w = Math.round(w * mx / h); h = mx; }
    }
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    let q = 0.8;
    const go = () => {
      const r = cv.toDataURL("image/jpeg", q);
      if ((r.length * 3 / 4) / 1024 <= maxKB || q <= 0.1) resolve(r);
      else { q -= 0.1; go(); }
    };
    go();
  };
  img.src = dataUrl;
});

const uploadValetPhoto = async (dataUrl, property, label) => {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ts = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const path = `valet/${property}/${today}/${label}_${ts}.jpg`;
    const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.error("Photo upload:", e);
    return null;
  }
};

const todayStr = () => new Date().toISOString().split("T")[0];

// ── Primitive UI pieces ────────────────────────────────────────────────────────
function DkInput({ value, onChange, placeholder, type = "text", style: cs, onKeyDown, inputMode, autoCapitalize, maxLength, autoFocus }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onKeyDown={onKeyDown} inputMode={inputMode} autoCapitalize={autoCapitalize}
      maxLength={maxLength} autoFocus={autoFocus}
      style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1px solid ${DK.inputBorder}`,
        background: DK.input, color: DK.text, fontFamily: F.b, fontSize: 18, outline: "none",
        boxSizing: "border-box", ...cs }}/>
  );
}

function DkBtn({ children, onClick, variant = "default", disabled, style: cs }) {
  const bgs = { green: DK.green, red: DK.red, maroon: DK.maroon, ghost: "transparent", default: DK.card2 };
  const clrs = { green: "#000", red: "#000", maroon: "#fff", ghost: DK.text, default: DK.text };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "16px 24px", borderRadius: 12, border: variant === "ghost" ? `1px solid ${DK.border}` : "none",
        background: disabled ? "#333" : bgs[variant] || DK.card2,
        color: disabled ? DK.textSub : clrs[variant] || DK.text,
        fontFamily: F.b, fontSize: 16, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1, minHeight: 56, ...cs }}>
      {children}
    </button>
  );
}

function PhotoCapture({ onCapture, label = "📸 Take Photo", captured = false, style: cs }) {
  const ref = useRef(null);
  const handle = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async (ev) => onCapture(await compressImage(ev.target.result, 80));
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  return (
    <div style={cs}>
      <button onClick={() => ref.current?.click()}
        style={{ width: "100%", padding: "20px", borderRadius: 16,
          border: `2px dashed ${captured ? DK.green : DK.inputBorder}`,
          background: captured ? DK.greenBg : DK.input,
          color: captured ? DK.green : DK.textSub,
          fontFamily: F.b, fontSize: 16, fontWeight: 700, cursor: "pointer",
          minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span style={{ fontSize: 32 }}>📸</span>
        <span>{captured ? "✅ Photo taken — tap to retake" : label}</span>
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} style={{ display: "none" }}/>
    </div>
  );
}

// ── Parking Zone Visual Map ───────────────────────────────────────────────────
function ParkingMap({ property, cars, onSelectZone, selectedZone }) {
  const zones = PARKING_ZONES[property] || [];
  const countByZone = {};
  cars.filter(c => c.status === "parked").forEach(c => {
    if (c.parking_area) countByZone[c.parking_area] = (countByZone[c.parking_area] || 0) + 1;
  });
  const regularZones = zones.slice(0, -1);
  const overflowZone = zones[zones.length - 1];
  return (
    <div style={{ background: DK.card, borderRadius: 14, padding: 14, marginBottom: 14, border: `1px solid ${DK.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: DK.textSub, letterSpacing: 1, marginBottom: 10 }}>PARKING MAP</div>
      <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 8, borderBottom: `1px dashed ${DK.border}`, fontSize: 11, color: DK.textSub, letterSpacing: 2 }}>▲ VENUE BUILDING ▲</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 8 }}>
        {regularZones.map(z => {
          const cnt = countByZone[z] || 0;
          const sel = selectedZone === z;
          return (
            <button key={z} onClick={() => onSelectZone(sel ? null : z)}
              style={{ padding: "10px 8px", borderRadius: 10, cursor: "pointer", fontFamily: F.b, fontSize: 11, fontWeight: 600, textAlign: "center",
                border: `2px solid ${sel ? DK.green : cnt > 0 ? DK.maroon : DK.border}`,
                background: sel ? DK.greenBg : cnt > 0 ? DK.maroonSoft : DK.card2,
                color: sel ? DK.green : cnt > 0 ? DK.maroon : DK.textSub }}>
              <div>{z.split("(")[0].trim()}</div>
              {cnt > 0 && <div style={{ fontSize: 18, fontWeight: 700 }}>{cnt} 🚗</div>}
            </button>
          );
        })}
      </div>
      {overflowZone && (() => {
        const cnt = countByZone[overflowZone] || 0;
        const sel = selectedZone === overflowZone;
        return (
          <button onClick={() => onSelectZone(sel ? null : overflowZone)}
            style={{ width: "100%", padding: 10, borderRadius: 10, cursor: "pointer", fontFamily: F.b, fontSize: 11, fontWeight: 600, marginBottom: 8, display: "block",
              border: `2px solid ${sel ? DK.green : cnt > 0 ? DK.yellow : DK.border}`,
              background: sel ? DK.greenBg : cnt > 0 ? DK.yellowBg : DK.card2,
              color: sel ? DK.green : cnt > 0 ? DK.yellow : DK.textSub }}>
            {overflowZone} {cnt > 0 && `— ${cnt} 🚗`}
          </button>
        );
      })()}
      <div style={{ textAlign: "center", paddingTop: 8, borderTop: `1px dashed ${DK.border}`, fontSize: 11, color: DK.textSub, letterSpacing: 2 }}>▼ ENTRANCE GATE ▼</div>
    </div>
  );
}

// ── Tab 1: Receive Car ────────────────────────────────────────────────────────
function ReceiveCarTab({ valetUser, onCarAdded }) {
  const property = valetUser.property;
  const zones = PARKING_ZONES[property] || [];

  const blank = () => ({ car_number: "", car_color: "", car_model: "", guest_name: "", guest_phone: "", parking_area: zones[0] || "", parking_spot: "", key_tag: "", notes: "" });
  const [form, setForm] = useState(blank());
  const [platePic, setPlatePic] = useState(null);
  const [carPic, setCarPic] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.car_number.trim()) { alert("Car number is required"); return; }
    setSaving(true);
    try {
      let plateUrl = null, carUrl = null;
      if (platePic) plateUrl = await uploadValetPhoto(platePic, property, "plate");
      if (carPic) carUrl = await uploadValetPhoto(carPic, property, "car");
      const { error } = await supabase.from("valet_cars").insert({
        property, event_date: todayStr(),
        car_number: form.car_number.trim().toUpperCase(),
        car_color: form.car_color, car_model: form.car_model.trim(),
        guest_name: form.guest_name.trim(), guest_phone: form.guest_phone.trim(),
        parking_area: form.parking_area, parking_spot: form.parking_spot.trim(),
        key_tag: form.key_tag.trim(), notes: form.notes.trim(),
        number_plate_photo: plateUrl, car_photo: carUrl,
        received_by: valetUser.name, received_at: new Date().toISOString(), status: "parked",
      });
      if (error) throw error;
      const cn = form.car_number.trim().toUpperCase();
      setSuccess(`✅ ${cn} — Parked at ${form.parking_area}`);
      setForm(blank()); setPlatePic(null); setCarPic(null);
      onCarAdded();
      setTimeout(() => setSuccess(null), 5000);
    } catch (e) { alert("Error saving: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      {success && (
        <div style={{ background: DK.greenBg, border: `1px solid ${DK.green}`, borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 16, fontWeight: 700, color: DK.green, textAlign: "center" }}>
          {success}
        </div>
      )}

      {/* Step 1 — plate photo */}
      <div style={{ background: DK.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${DK.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DK.textSub, letterSpacing: 1, marginBottom: 10 }}>STEP 1 — NUMBER PLATE PHOTO</div>
        <PhotoCapture label="📸 Scan Number Plate" onCapture={setPlatePic} captured={!!platePic}/>
        {platePic && <img src={platePic} alt="plate" style={{ width: "100%", borderRadius: 10, marginTop: 8, maxHeight: 120, objectFit: "cover" }}/>}
      </div>

      {/* Step 2 — car details */}
      <div style={{ background: DK.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${DK.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DK.textSub, letterSpacing: 1, marginBottom: 14 }}>STEP 2 — CAR DETAILS</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Car Number *</div>
          <DkInput value={form.car_number} onChange={e => set("car_number", e.target.value.toUpperCase())}
            placeholder="DL 01 AB 1234" autoCapitalize="characters"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3 }}/>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 8 }}>Car Color</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CAR_COLORS.map(cc => (
              <button key={cc.id} onClick={() => set("car_color", cc.id === form.car_color ? "" : cc.id)}
                style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: F.b, fontSize: 13, fontWeight: 600, minHeight: 44,
                  border: `2px solid ${form.car_color === cc.id ? DK.maroon : DK.border}`,
                  background: form.car_color === cc.id ? DK.maroonSoft : DK.card2,
                  color: DK.text }}>
                {cc.emoji} {cc.id}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Car Model (optional)</div>
          <DkInput value={form.car_model} onChange={e => set("car_model", e.target.value)} placeholder="Swift, Innova, BMW..."/>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Guest Name</div>
            <DkInput value={form.guest_name} onChange={e => set("guest_name", e.target.value)} placeholder="Name"/>
          </div>
          <div>
            <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Phone (optional)</div>
            <DkInput value={form.guest_phone} onChange={e => set("guest_phone", e.target.value)} placeholder="98..." type="tel" inputMode="tel"/>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Parking Area</div>
          <select value={form.parking_area} onChange={e => set("parking_area", e.target.value)}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1px solid ${DK.inputBorder}`, background: DK.input, color: DK.text, fontFamily: F.b, fontSize: 16, outline: "none", boxSizing: "border-box" }}>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Parking Spot</div>
            <DkInput value={form.parking_spot} onChange={e => set("parking_spot", e.target.value)} placeholder="Row 3, Spot 5"/>
          </div>
          <div>
            <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Key Tag #</div>
            <DkInput value={form.key_tag} onChange={e => set("key_tag", e.target.value)} placeholder="47" inputMode="numeric"/>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 6 }}>Remarks</div>
          <DkInput value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Scratch on left door, VIP guest..."/>
        </div>
      </div>

      {/* Step 3 — car photo */}
      <div style={{ background: DK.card, borderRadius: 14, padding: 16, marginBottom: 14, border: `1px solid ${DK.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DK.textSub, letterSpacing: 1, marginBottom: 10 }}>STEP 3 — CAR PHOTO (optional)</div>
        <PhotoCapture label="📸 Take Car Photo" onCapture={setCarPic} captured={!!carPic}/>
        {carPic && <img src={carPic} alt="car" style={{ width: "100%", borderRadius: 10, marginTop: 8, maxHeight: 160, objectFit: "cover" }}/>}
      </div>

      {/* Save */}
      <DkBtn variant="green" onClick={save} disabled={saving || !form.car_number.trim()} style={{ width: "100%", fontSize: 18, minHeight: 64 }}>
        {saving ? "Saving..." : "✅ Car Received — Park It"}
      </DkBtn>
    </div>
  );
}

// ── Tab 2: Find Car ───────────────────────────────────────────────────────────
function FindCarTab({ cars, onDeliver, valetUser }) {
  const [q, setQ] = useState("");
  const [delivering, setDelivering] = useState(null);
  const [delivPic, setDelivPic] = useState(null);
  const [loading, setLoading] = useState(false);

  const today = todayStr();
  const parked = cars.filter(c => c.status === "parked" && c.event_date === today);
  const results = q.trim()
    ? parked.filter(c => {
      const s = q.trim().toLowerCase();
      return (c.car_number||"").toLowerCase().includes(s) || (c.guest_name||"").toLowerCase().includes(s) || (c.guest_phone||"").includes(s);
    })
    : parked;

  const doDeliver = async () => {
    if (!delivering) return;
    setLoading(true);
    try {
      let photoUrl = null;
      if (delivPic) photoUrl = await uploadValetPhoto(delivPic, delivering.property, "delivery");
      const { error } = await supabase.from("valet_cars").update({
        status: "delivered", delivered_by: valetUser.name,
        delivered_at: new Date().toISOString(), delivery_photo: photoUrl,
      }).eq("id", delivering.id);
      if (error) throw error;
      onDeliver(delivering.id);
      setDelivering(null); setDelivPic(null);
    } catch (e) { alert("Error: " + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Delivery modal */}
      {delivering && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "flex-end", padding: 16 }}>
          <div style={{ width: "100%", background: DK.card, borderRadius: 20, padding: 24, border: `1px solid ${DK.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: DK.text, marginBottom: 4 }}>
              Delivering {delivering.car_number}
            </div>
            {delivering.guest_name && <div style={{ fontSize: 14, color: DK.textSub, marginBottom: 16 }}>to {delivering.guest_name}</div>}
            <PhotoCapture label="📸 Take Delivery Photo (optional)" onCapture={setDelivPic} captured={!!delivPic} style={{ marginBottom: 16 }}/>
            <div style={{ display: "flex", gap: 10 }}>
              <DkBtn variant="ghost" onClick={() => { setDelivering(null); setDelivPic(null); }} style={{ flex: 1, minHeight: 52 }}>Cancel</DkBtn>
              <DkBtn variant="green" onClick={doDeliver} disabled={loading} style={{ flex: 2, minHeight: 52 }}>
                {loading ? "..." : "✅ Car Delivered"}
              </DkBtn>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "sticky", top: 0, background: DK.bg, paddingBottom: 10, zIndex: 10 }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Search car number, guest name, phone..."
          style={{ width: "100%", padding: "16px 20px", borderRadius: 14, border: `1px solid ${DK.inputBorder}`, background: DK.input, color: DK.text, fontFamily: F.b, fontSize: 16, outline: "none", boxSizing: "border-box" }}/>
      </div>

      <div style={{ fontSize: 12, color: DK.textSub, marginBottom: 10 }}>
        {q.trim() ? `${results.length} result${results.length !== 1 ? "s" : ""}` : `${parked.length} cars currently parked`}
      </div>

      {results.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: DK.textSub, fontSize: 16 }}>
          {q.trim() ? "No cars found" : "No parked cars right now"}
        </div>
      )}

      {results.map(car => (
        <div key={car.id} style={{ background: DK.card, borderRadius: 14, padding: 16, marginBottom: 10, border: `1px solid ${DK.border}`, borderLeft: `4px solid ${DK.green}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {car.number_plate_photo && (
              <img src={car.number_plate_photo} alt="" style={{ width: 72, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}/>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: DK.text, letterSpacing: 1, marginBottom: 2 }}>
                🚗 {car.car_number}
                {(car.car_color || car.car_model) && (
                  <span style={{ fontSize: 13, fontWeight: 400, color: DK.textSub }}> · {[car.car_color, car.car_model].filter(Boolean).join(" ")}</span>
                )}
              </div>
              {car.guest_name && <div style={{ fontSize: 15, color: DK.text, marginBottom: 2 }}>👤 {car.guest_name}{car.guest_phone && <span style={{ color: DK.textSub }}> 📞 {car.guest_phone}</span>}</div>}
              <div style={{ fontSize: 14, color: DK.green, marginBottom: 2 }}>
                📍 {car.parking_area}{car.parking_spot && ` — ${car.parking_spot}`}
              </div>
              {car.key_tag && <div style={{ fontSize: 14, color: DK.yellow }}>🏷️ Key Tag: #{car.key_tag}</div>}
              <div style={{ fontSize: 12, color: DK.textSub, marginTop: 4 }}>
                ⏰ {new Date(car.received_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                {car.received_by && ` · by ${car.received_by}`}
              </div>
              {car.notes && <div style={{ fontSize: 12, color: DK.yellow, marginTop: 2 }}>💬 {car.notes}</div>}
            </div>
          </div>
          <button onClick={() => setDelivering(car)}
            style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: 12, border: "none", background: DK.maroon, color: "#fff", fontFamily: F.b, fontSize: 15, fontWeight: 700, cursor: "pointer", minHeight: 50 }}>
            🚗 Deliver Car
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Tab 3: All Cars ───────────────────────────────────────────────────────────
function AllCarsTab({ cars, property }) {
  const [filter, setFilter] = useState("all");
  const [selectedZone, setSelectedZone] = useState(null);
  const [detailCar, setDetailCar] = useState(null);
  const today = todayStr();
  const todayCars = cars.filter(c => c.event_date === today);
  const parked = todayCars.filter(c => c.status === "parked");
  const delivered = todayCars.filter(c => c.status === "delivered");

  let filtered = todayCars;
  if (filter === "parked") filtered = parked;
  if (filter === "delivered") filtered = delivered;
  if (selectedZone) filtered = filtered.filter(c => c.parking_area === selectedZone);
  filtered = [...filtered].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Detail modal */}
      {detailCar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, overflowY: "auto", padding: 16 }}>
          <div style={{ background: DK.card, borderRadius: 20, padding: 24, border: `1px solid ${DK.border}`, marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: DK.text }}>{detailCar.car_number}</div>
              <button onClick={() => setDetailCar(null)} style={{ fontSize: 22, background: "none", border: "none", color: DK.textSub, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ padding: "5px 12px", borderRadius: 8, fontFamily: F.b, fontSize: 13, fontWeight: 700,
                background: detailCar.status === "parked" ? DK.greenBg : DK.blueBg,
                color: detailCar.status === "parked" ? DK.green : DK.blue }}>
                {detailCar.status === "parked" ? "🟢 Parked" : "🔵 Delivered"}
              </span>
            </div>
            {[
              ["Color / Model", [detailCar.car_color, detailCar.car_model].filter(Boolean).join(" · ")],
              ["Guest", detailCar.guest_name],
              ["Phone", detailCar.guest_phone],
              ["Parking Area", detailCar.parking_area],
              ["Spot", detailCar.parking_spot],
              ["Key Tag", detailCar.key_tag && "#" + detailCar.key_tag],
              ["Notes", detailCar.notes],
              ["Received By", detailCar.received_by],
              ["Received At", detailCar.received_at && new Date(detailCar.received_at).toLocaleString("en-IN")],
              ["Delivered By", detailCar.delivered_by],
              ["Delivered At", detailCar.delivered_at && new Date(detailCar.delivered_at).toLocaleString("en-IN")],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "flex", marginBottom: 8 }}>
                <div style={{ width: 120, fontSize: 12, color: DK.textSub, flexShrink: 0 }}>{k}</div>
                <div style={{ fontSize: 14, color: DK.text, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[["number_plate_photo","Plate"],["car_photo","Car"],["delivery_photo","Delivery"]].map(([key, lbl]) =>
                detailCar[key] ? (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: DK.textSub, marginBottom: 4 }}>{lbl}</div>
                    <img src={detailCar[key]} alt={lbl} style={{ width: 130, height: 95, borderRadius: 8, objectFit: "cover" }}/>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { l: "Parked",    v: parked.length,    c: DK.green, bg: DK.greenBg },
          { l: "Delivered", v: delivered.length, c: DK.blue,  bg: DK.blueBg  },
          { l: "Total",     v: todayCars.length, c: DK.text,  bg: DK.card    },
        ].map(s => (
          <div key={s.l} style={{ background: s.bg, borderRadius: 12, padding: "12px 8px", textAlign: "center", border: `1px solid ${DK.border}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.c, fontFamily: "'Cormorant Garamond',serif" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: DK.textSub, fontWeight: 600 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <ParkingMap property={property} cars={todayCars} onSelectZone={setSelectedZone} selectedZone={selectedZone}/>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","All"], ["parked","🟢 Parked"], ["delivered","🔵 Delivered"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: filter === id ? DK.maroon : DK.card2,
              color: DK.text, fontFamily: F.b, fontSize: 13, fontWeight: filter === id ? 700 : 400, cursor: "pointer", minHeight: 40 }}>
            {label}
          </button>
        ))}
        {selectedZone && (
          <button onClick={() => setSelectedZone(null)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${DK.yellow}`, background: DK.yellowBg, color: DK.yellow, fontFamily: F.b, fontSize: 12, cursor: "pointer" }}>
            📍 {selectedZone.split("(")[0].trim()} ✕
          </button>
        )}
      </div>

      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: DK.textSub, fontSize: 16 }}>No cars to show</div>}

      {filtered.map(car => {
        const isParked = car.status === "parked";
        return (
          <div key={car.id} onClick={() => setDetailCar(car)}
            style={{ background: DK.card, borderRadius: 12, padding: 14, marginBottom: 8, border: `1px solid ${DK.border}`,
              borderLeft: `4px solid ${isParked ? DK.green : DK.blue}`, opacity: isParked ? 1 : 0.65, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: DK.text, letterSpacing: 1 }}>{car.car_number}</div>
                {car.guest_name && <div style={{ fontSize: 13, color: DK.textSub }}>{car.guest_name}</div>}
                {car.parking_area && <div style={{ fontSize: 12, color: DK.textSub, marginTop: 2 }}>📍 {car.parking_area}{car.parking_spot ? ` · ${car.parking_spot}` : ""}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isParked ? DK.green : DK.blue }}>{isParked ? "🟢 Parked" : "🔵 Out"}</div>
                <div style={{ fontSize: 11, color: DK.textSub }}>{new Date(car.received_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                {car.key_tag && <div style={{ fontSize: 11, color: DK.yellow }}>🏷️ #{car.key_tag}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Valet Login Screen ────────────────────────────────────────────────────────
function ValetLoginScreen({ onLogin, onBack }) {
  const [property, setProperty] = useState("pp");
  const [staff, setStaff] = useState([]);
  const [selectedName, setSelectedName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingStaff, setFetchingStaff] = useState(false);

  useEffect(() => {
    setSelectedName(""); setFetchingStaff(true);
    supabase.from("valet_staff").select("id,name,phone,pin").eq("property", property).eq("is_active", true)
      .then(({ data }) => { setStaff(data || []); setFetchingStaff(false); });
  }, [property]);

  const login = async () => {
    if (!selectedName) { setError("Select your name"); return; }
    if (pin.length !== 4) { setError("Enter 4-digit PIN"); return; }
    setLoading(true); setError("");
    const s = staff.find(x => x.name === selectedName);
    if (!s || s.pin !== pin) { setError("Wrong PIN. Try again."); setLoading(false); return; }
    onLogin({ id: s.id, name: s.name, property });
    setLoading(false);
  };

  const iBase = { width: "100%", padding: "16px", borderRadius: 14, border: "1px solid #444", background: "#2A2A2A", color: "#E5E5E5", fontFamily: F.b, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: F.b }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#1A1A1A", borderRadius: 24, padding: 32, border: "1px solid #333" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🚗</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 700, color: "#E5E5E5", margin: "0 0 4px" }}>Ambria Valet</h1>
          <div style={{ fontSize: 14, color: "#9CA3AF" }}>Car Management Portal</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>PROPERTY</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["pp","Pushpanjali"],["ex","Exotica"],["mk","Manaktala"],["rs","Restro"]].map(([id, name]) => (
              <button key={id} onClick={() => setProperty(id)}
                style={{ padding: 12, borderRadius: 10, cursor: "pointer", fontFamily: F.b, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${property === id ? "#C4475E" : "#444"}`,
                  background: property === id ? "#2D1A1F" : "#222",
                  color: property === id ? "#C4475E" : "#9CA3AF" }}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>YOUR NAME</div>
          <select value={selectedName} onChange={e => setSelectedName(e.target.value)} style={{ ...iBase, fontSize: 16 }}>
            <option value="">{fetchingStaff ? "Loading..." : staff.length === 0 ? "No staff found for this property" : "Select your name"}</option>
            {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>PIN</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pin} placeholder="••••"
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => { if (e.key === "Enter") login(); }}
            style={{ ...iBase, letterSpacing: 8, fontSize: 28, textAlign: "center" }}/>
        </div>

        {error && <div style={{ background: "#2D0F0F", color: "#F87171", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 14, textAlign: "center" }}>{error}</div>}

        <button onClick={login} disabled={loading}
          style={{ width: "100%", padding: 18, borderRadius: 14, border: "none",
            background: loading ? "#333" : "#C4475E", color: "#E5E5E5",
            fontFamily: F.b, fontSize: 17, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", minHeight: 60 }}>
          {loading ? "Checking..." : "🚦 Start Shift"}
        </button>

        <button onClick={onBack}
          style={{ width: "100%", marginTop: 14, padding: 12, background: "none", border: "none", color: "#9CA3AF", fontFamily: F.b, fontSize: 14, cursor: "pointer" }}>
          ← Back to Main Login
        </button>
      </div>
    </div>
  );
}

// ── Main Valet Portal Export ──────────────────────────────────────────────────
export default function ValetPortal({ onExitValet }) {
  const [valetUser, setValetUser] = useState(() => {
    try { const s = localStorage.getItem("ambria_valet_user"); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [tab, setTab] = useState("receive");
  const [cars, setCars] = useState([]);

  const today = todayStr();

  const loadCars = useCallback(async () => {
    if (!valetUser) return;
    const { data } = await supabase.from("valet_cars").select("*").eq("property", valetUser.property).eq("event_date", today).order("received_at", { ascending: false });
    setCars(data || []);
  }, [valetUser, today]);

  useEffect(() => { loadCars(); }, [loadCars]);

  useEffect(() => {
    if (!valetUser) return;
    const iv = setInterval(loadCars, 30000);
    return () => clearInterval(iv);
  }, [loadCars, valetUser]);

  const handleLogin = (u) => {
    localStorage.setItem("ambria_valet_user", JSON.stringify(u));
    setValetUser(u);
  };

  const handleEndShift = () => {
    localStorage.removeItem("ambria_valet_user");
    setValetUser(null);
  };

  if (!valetUser) return <ValetLoginScreen onLogin={handleLogin} onBack={onExitValet}/>;

  const parkedCount = cars.filter(c => c.status === "parked" && c.event_date === today).length;

  const handleDelivered = (carId) => {
    setCars(cs => cs.map(c => c.id === carId ? { ...c, status: "delivered", delivered_at: new Date().toISOString() } : c));
  };

  const TABS = [
    { id: "receive", i: "📥", l: "Receive" },
    { id: "find",    i: "🔍", l: "Find Car" },
    { id: "all",     i: "📋", l: "All Cars" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: DK.bg, color: DK.text, fontFamily: F.b }}>
      {/* Top bar */}
      <div style={{ background: DK.card, borderBottom: `1px solid ${DK.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: DK.text }}>🚗 Ambria Valet</div>
          <div style={{ fontSize: 11, color: DK.textSub }}>{PROP_NAMES[valetUser.property]} · {valetUser.name}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: DK.green }}>🅿️ {parkedCount}</div>
          <div style={{ fontSize: 10, color: DK.textSub }}>Cars Parked</div>
        </div>
        <button onClick={handleEndShift}
          style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${DK.red}`, background: "transparent", color: DK.red, fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          End Shift
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 90px" }}>
        {tab === "receive" && <ReceiveCarTab valetUser={valetUser} onCarAdded={loadCars}/>}
        {tab === "find"    && <FindCarTab cars={cars} onDeliver={handleDelivered} valetUser={valetUser}/>}
        {tab === "all"     && <AllCarsTab cars={cars} property={valetUser.property}/>}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: DK.card, borderTop: `1px solid ${DK.border}`, display: "flex", zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "12px 0", border: "none", background: tab === t.id ? DK.maroonSoft : "transparent",
              color: tab === t.id ? DK.maroon : DK.textSub, fontFamily: F.b, fontSize: 11,
              fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 2, borderTop: `2px solid ${tab === t.id ? DK.maroon : "transparent"}` }}>
            <span style={{ fontSize: 22 }}>{t.i}</span>
            {t.l}
          </button>
        ))}
      </div>
    </div>
  );
}
