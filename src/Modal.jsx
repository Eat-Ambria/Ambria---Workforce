import { useEffect } from "react";
import { useT } from "./ThemeContext.js";

const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  const C = useT();
  const sizes = { sm: "440px", md: "520px", lg: "660px", xl: "820px" };
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    if (isOpen) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.6)", zIndex: 9999,
        display: "flex", alignItems: "flex-end",
        animation: "fadeIn 0.15s ease"
      }} onClick={onClose}>
        <div style={{
          background: C.white, borderRadius: "20px 20px 0 0",
          width: "100%", maxHeight: "92vh", overflow: "auto",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
          animation: "slideUpFull 0.25s ease",
          paddingBottom: "env(safe-area-inset-bottom, 16px)"
        }} onClick={e => e.stopPropagation()}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            position: "sticky", top: 0, background: C.white,
            borderRadius: "20px 20px 0 0", zIndex: 1
          }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: C.maroon }}>{title}</h2>
            <button onClick={onClose} style={{
              border: "none", background: C.bg, borderRadius: "50%",
              width: "44px", height: "44px", cursor: "pointer", fontSize: "18px",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              color: C.text,
            }}>✕</button>
          </div>
          <div style={{ padding: "16px 20px 24px", color: C.text }}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: "20px",
      animation: "fadeIn 0.2s ease"
    }} onClick={onClose}>
      <div style={{
        background: C.white, borderRadius: "16px",
        width: "100%", maxWidth: sizes[size],
        maxHeight: "85vh", overflow: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        animation: "slideUp 0.2s ease"
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "16px 20px",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: C.white,
          borderRadius: "16px 16px 0 0", zIndex: 1
        }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: C.maroon }}>{title}</h2>
          <button onClick={onClose} style={{
            border: "none", background: C.bg, borderRadius: "8px",
            width: "44px", height: "44px", cursor: "pointer", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center", color: C.text,
          }}>✕</button>
        </div>
        <div style={{ padding: "20px", color: C.text }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
