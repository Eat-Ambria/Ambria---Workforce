const t=i=>String(i??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),l=`
  * { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 28px; color: #1f2937; }
  .head { border-bottom: 3px solid #7B1E2F; padding-bottom: 12px; margin-bottom: 6px; }
  .head h1 { color: #7B1E2F; margin: 0; font-size: 22px; }
  .head p { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
  h2 { font-size: 15px; margin: 22px 0 8px; color: #7B1E2F; }
  p.note { font-size: 11.5px; color: #6b7280; margin: 0 0 10px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 10px; font-size: 12.5px; text-align: left; }
  th { background: #f4eef0; color: #7B1E2F; }
  td.num, th.num { text-align: right; }
  tr { page-break-inside: avoid; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0 4px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; min-width: 120px; }
  .kpi b { display: block; font-size: 20px; color: #111827; }
  .kpi span { font-size: 11px; color: #6b7280; }
  .miss { color: #b91c1c; font-weight: bold; }
  .ok { color: #15803d; font-weight: bold; }
  .toolbar { position: sticky; top: 0; display: flex; gap: 10px; padding: 12px 0 14px; background: #fff; z-index: 10; }
  .toolbar button { font: inherit; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 8px; border: 1px solid #7B1E2F; cursor: pointer; }
  .toolbar .close { background: #fff; color: #7B1E2F; }
  .toolbar .print { background: #7B1E2F; color: #fff; }
  @media print { .toolbar { display: none !important; } }
`;function d({title:i,heading:e,subtitle:n,body:r}){const p=new Date().toLocaleString("en-GB",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),a=`<!doctype html><html><head><meta charset="utf-8"><title>${t(i)}</title>
    <style>${l}</style>
    </head><body>
      <div class="toolbar">
        <button class="print" onclick="window.print()">Print / Save PDF</button>
        <button class="close" onclick="window.close()">Close</button>
      </div>
      <div class="head">
        <h1>${t(e)}</h1>
        <p>${t(n)}</p>
        <p>Printed ${t(p)}</p>
      </div>
      ${r}
    </body></html>`,o=window.open("","_blank");return o?(o.document.write(a),o.document.close(),o.focus(),setTimeout(()=>o.print(),400),!0):!1}export{t as e,d as o};
