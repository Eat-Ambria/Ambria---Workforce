// Print / Save-as-PDF, without a PDF library.
//
// Open a plain HTML document in a new tab and hand it to the browser's own print
// dialog, where "Save as PDF" is a destination. Valet has exported its bookings
// this way since it was written; this is that approach lifted out so the analytics
// export cannot drift from it.
//
// Escaping matters more here than anywhere else in the app: task titles, remarks
// and people's names all reach this file, and they are typed by users. Everything
// interpolated into the template goes through esc().

export const esc = (s) => String(s ?? '').replace(
  /[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
)

// One stylesheet for every printable in the app, so two reports printed on the
// same day look like they came from the same organisation.
//
// print-color-adjust: exact — without it browsers drop background fills to save
// ink, and a table whose header stripe carries the heading disappears.
const STYLE = `
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
`

// Returns false when the popup was blocked, so the caller can say so in the app
// rather than looking like it did nothing.
export function openPrintable({ title, heading, subtitle, body }) {
  const printedOn = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${STYLE}</style>
    </head><body>
      <div class="toolbar">
        <button class="print" onclick="window.print()">Print / Save PDF</button>
        <button class="close" onclick="window.close()">Close</button>
      </div>
      <div class="head">
        <h1>${esc(heading)}</h1>
        <p>${esc(subtitle)}</p>
        <p>Printed ${esc(printedOn)}</p>
      </div>
      ${body}
    </body></html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  // The dialog has to wait for layout, or it measures an empty document and
  // prints a blank first page.
  setTimeout(() => w.print(), 400)
  return true
}
