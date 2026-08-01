# LMS / ERP Contract API — integration notes

How Ambria pulls venue & decor contracts out of the LMS, and the gotchas that make a
naive integration return only part of the data.

Reference implementation: [`src/lib/ims/lms.js`](src/lib/ims/lms.js) and
[`supabase/functions/lms/index.ts`](supabase/functions/lms/index.ts).

---

## The API

| | |
|---|---|
| **Base** | `https://gyv.inqcrm.in` |
| **Venue contracts** | `POST /api/v1/processerp_api/get_venue_contract_information_list` |
| **Decor contracts** | `POST /api/v1/processerp_api/get_decor_contract_information_list` |
| **Auth** | None. No token, no API key. |
| **CORS** | Not allowed. Must be called server-side. |
| **Rows are at** | `response.Contractinfo` |

---

## The one that catches everyone: `page_limit` is a page NUMBER

```jsonc
{ "page_limit": "1" }   // page 1 — NOT "give me 1 row", NOT "no limit"
```

The name reads like a row count, so the usual mistake is to send it once, get a
valid-looking response, and assume that is the whole dataset. It is page 1.

There is **no `total`, no `has_more`, no `next` field** in the response, so nothing
signals that more pages exist. The failure is silent — you get real data, just not all
of it.

**Fix: increment `page_limit` until a page comes back empty.**

---

## How Ambria does it

```
LMS  https://gyv.inqcrm.in
  └─ /api/v1/processerp_api/get_venue_contract_information_list
  └─ /api/v1/processerp_api/get_decor_contract_information_list
        ↓  paginated server-side (CORS blocks the browser)
Supabase Edge Function  /functions/v1/lms   { op: "sync" }
        ↓  upserts every page
Supabase table  lms_contracts
        ↓  fetchCachedContracts()  — plain select, no LMS call
IMS Calendar
```

The browser never calls the LMS. The Edge Function exists only to get around CORS and to
keep pagination off the client; the calendar reads the cached table, which is why it
renders instantly and needs an explicit **Sync** to refresh.

---

## Working implementation

```js
const LMS_BASE = "https://gyv.inqcrm.in";
const ENDPOINT = "/api/v1/processerp_api/get_venue_contract_information_list";

// Every filter key must be present, even when blank — omitting them can make the API
// apply a default filter rather than treating them as unset.
const venueBody = (page) => ({
  loggeduserid: "1", fromdate: "", uptodated: "", search_venue_contract: "",
  priority_search: "", venue_datetype: "", source_search: "", venue_search: "",
  balance_pending: "", contract_venue_search: "", contract_assginee_search: "",
  leadtype_search: "", report_fac: "",
  page_limit: String(page),          // ← PAGE NUMBER
});

async function fetchAllVenueContracts() {
  const all = [];
  const CEILING = 200;               // runaway guard
  let page = 1, prevCount = -1;

  while (page <= CEILING) {
    const r = await fetch(LMS_BASE + ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(venueBody(page)),
    });
    if (!r.ok) break;

    const rows = (await r.json())?.Contractinfo || [];
    // Normal exit: an empty page. Second guard: the API repeated a page instead of
    // returning empty, so the running total stopped growing.
    if (rows.length === 0 || all.length === prevCount) break;

    prevCount = all.length;
    all.push(...rows);
    page++;
    await new Promise((ok) => setTimeout(ok, 200));   // pace the calls
  }
  return all;
}
```

**Must run server-side** — Node, PHP, a serverless function. A browser `fetch` fails on
CORS regardless of the pagination being right.

---

## Decor uses a different body

Same pagination, different filter keys:

```js
const decorBody = (page) => ({
  loggeduserid: "1", entertain_search: "", source_search: "", lead_type_search: "",
  entertain_venue_search: "", priority_search: "", fromdate: "", uptodated: "",
  entertain_assginee_search: "", entertain_status_search: "", search_date_type: "",
  visited_search: "", follow_dated: "",
  page_limit: String(page),
});
```

Field names differ between the two departments:

| | venue | decor |
|---|---|---|
| entry number | `fisc_entryno` | `dhc_entry_no` |
| cancel remarks | `fisc_cancel_remarks` | `dhc_cancel_remarks` |

---

## Cancelled contracts are returned by the API

The endpoint does **not** filter them. Ambria drops any row whose cancel-remarks field is
non-empty:

```js
const cancelled = !!((isVenue ? raw.fisc_cancel_remarks : raw.dhc_cancel_remarks) || "").trim();
```

So Ambria's count is **lower** than the raw API's. If another system shows more rows than
Ambria for the same period, that is usually this — not missing data. Decide deliberately
whether you want cancelled contracts in your view.

---

## Venue name mapping

LMS venue names do not always match internal names. `LMS_VENUE_MAP` in
[`src/lib/ims/lms.js`](src/lib/ims/lms.js) translates by LMS venue id, e.g.

| LMS id | LMS name | Internal name |
|---|---|---|
| `3` | Ambria Pushpanjali | Ambria Pushpanjali |
| `6` | Manaktala Farm | **Emerald Green** |

Any system joining LMS data to internal venue records needs the same mapping, or those
contracts will look like unknown venues.

---

## Checklist for a partial-data bug

1. Are you **incrementing `page_limit`**, or sending it once? ← the usual cause
2. Reading rows from **`response.Contractinfo`**?
3. Sending **every filter key**, including the empty ones?
4. Running **server-side** (CORS)?
5. Are you filtering **cancelled** rows, and did you mean to?
6. Stopping on an **empty page** — and guarding against a repeated page?
