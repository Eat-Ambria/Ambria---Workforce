import { useState, useEffect, useRef } from "react";
import { C, F } from "./constants.js";

export default function PhotoViewer({ photos, isOpen, onClose }) {
  const [idx, setIdx] = useState(0);
  const startX = useRef(null);

  useEffect(() => { setIdx(0); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = e => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min((photos?.length || 1) - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, photos?.length, onClose]);

  if (!isOpen || !photos || !photos.length) return null;

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(photos.length - 1, i + 1));

  const onTouchStart = e => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx < -50) next();
    else if (dx > 50) prev();
    startX.current = null;
  };

  return (
    <div
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)",
        zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column"
      }}
    >
      {/* Counter */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        color: "#fff", fontSize: 12, fontFamily: F.b, fontWeight: 600,
        background: "rgba(0,0,0,0.5)", padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap"
      }}>{idx + 1} / {photos.length}</div>

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 12, right: 14, width: 36, height: 36,
          borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.18)",
          color: "#fff", fontSize: 18, cursor: "pointer", zIndex: 10001,
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.b
        }}
      >✕</button>

      {/* Image */}
      <img
        src={photos[idx]}
        alt={`Photo ${idx + 1}`}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw", maxHeight: "78vh", borderRadius: 8,
          objectFit: "contain", boxShadow: "0 0 40px rgba(0,0,0,0.5)"
        }}
      />

      {/* Left arrow */}
      {idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); prev(); }}
          style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            width: 40, height: 40, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 24,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.b
          }}
        >‹</button>
      )}

      {/* Right arrow */}
      {idx < photos.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); next(); }}
          style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            width: 40, height: 40, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 24,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.b
          }}
        >›</button>
      )}

      {/* Dot indicators */}
      {photos.length > 1 && (
        <div style={{ display: "flex", gap: 6, position: "absolute", bottom: 52 }}>
          {photos.map((_, i) => (
            <div
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i); }}
              style={{
                width: i === idx ? 20 : 8, height: 8, borderRadius: 4,
                background: i === idx ? "#fff" : "rgba(255,255,255,0.35)",
                cursor: "pointer", transition: "all 0.2s"
              }}
            />
          ))}
        </div>
      )}

      {/* Download */}
      <a
        href={photos[idx]}
        download={`photo_${idx + 1}.jpg`}
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 18, right: 18,
          padding: "6px 12px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.3)",
          background: "rgba(255,255,255,0.1)", color: "#fff",
          fontSize: 11, fontFamily: F.b, textDecoration: "none", fontWeight: 600
        }}
      >⬇ Save</a>
    </div>
  );
}
