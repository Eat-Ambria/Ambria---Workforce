import { useEffect } from "react";

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const sizes = { sm: '400px', md: '500px', lg: '650px', xl: '800px' };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '20px',
      animation: 'fadeIn 0.2s ease'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: '16px',
        width: '100%', maxWidth: sizes[size],
        maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.2s ease'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '16px 20px',
          borderBottom: '1px solid #E5E7EB',
          position: 'sticky', top: 0, background: 'white',
          borderRadius: '16px 16px 0 0', zIndex: 1
        }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#7B1E2F' }}>{title}</h2>
          <button onClick={onClose} style={{
            border: 'none', background: '#F3F4F6', borderRadius: '8px',
            width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
