// CSV export. Plain text, no library — this replaced a spreadsheet writer that
// put 72KB of lazy-loaded JavaScript behind one button on one admin tab.
//
// Sits beside printable.js, which is the other half of "get this off the
// screen": that one opens a print dialog for a report you read, this one writes
// a file you sort and filter.

/**
 * Turns rows into a CSV file and hands it to the user.
 *
 * @param filename e.g. 'valet-guests-2026-08-23.csv'
 * @param cols     [{ key, label, text }] — `text` forces a column to text; see below
 * @param rows     plain objects keyed by `key`
 */
export function downloadCsv(filename, cols, rows) {
  if (!rows?.length) return

  const cell = (col, value) => {
    // '' as well as null. A text column left to handle '' emits ="" — which
    // looks blank in Excel but is a formula, so ISBLANK disagrees with the eye.
    if (value === null || value === undefined || value === '') return ''
    const s = String(value)
    const needsQuoting = /[",\n\r]/.test(s)

    // A phone number forced to text. CSV carries no cell types, so Excel
    // guesses "number" and renders 6576543210 as 6.576E+09. The digits are
    // still in the file — Excel is only displaying them that way — but the
    // column is unreadable, and widening it is something every person who
    // opens the file has to redo. ="…" is read as a formula returning a
    // string, which pins the value to text whatever the column width.
    //
    // UNQUOTED on purpose: quoting it makes Excel show the literal ="123…",
    // which is worse. So a value containing a comma falls through to ordinary
    // quoting instead of breaking the row. Phone numbers never contain one.
    if (col.text && !needsQuoting) return `="${s}"`

    // Quote only when needed, and double any inner quote. A guest called
    // 'Sharma, Anil' would otherwise split into two columns and shift every
    // field after it on that row.
    return needsQuoting ? `"${s.replace(/"/g, '""')}"` : s
  }

  const csv = [
    cols.map((c) => cell({}, c.label)).join(','),
    ...rows.map((row) => cols.map((c) => cell(c, row[c.key])).join(',')),
  ].join('\r\n')

  // The BOM is not optional. Without it Excel opens the file as the system
  // codepage and every Hindi name becomes mojibake — 'अनिल' reads as
  // 'à¤…à¤¨à¤¿à¤²'. The file is valid UTF-8 either way; Excel simply does not
  // look unless the BOM is there.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Released on pagehide, NOT on a timer. The browser writes the file
  // asynchronously and takes longer than a second even for a small CSV, so
  // revoking on a timer cancels a download that had already started — and
  // nothing surfaces, because the click already succeeded.
  //
  // pagehide rather than beforeunload: beforeunload does not fire reliably on
  // mobile Safari, which is where a tab is most likely to be discarded.
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true })
}
