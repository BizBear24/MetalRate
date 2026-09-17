# GoldCalc

**Scan → weight → live price → value.** A small web app for gold and silver shops. Scan an item's barcode and GoldCalc shows its metal value at the current market price, plus any fixed charges saved for that item.

> **Estimated total = weight × live rate for the purity + making charges + stone charges + diamond charges.**
> The three charges are optional fixed rupee amounts saved on each item. They don't change with the metal rate, and any that don't apply are left blank. GST is not included.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN)
npm test           # unit tests for parsing, resolution, conversion, pricing
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build (service worker enabled)
```

Browsers only give a page camera access over HTTPS or on `localhost`. To test on a phone, deploy the app somewhere with HTTPS (Vercel, Netlify, Cloudflare Pages) or use an HTTPS tunnel. Opening `http://<lan-ip>:5173` shows the "Secure connection needed" screen, but you can still type a code manually.

## How an item's weight is found

A normal retail barcode does **not** contain the item's weight. GoldCalc resolves a scanned code in this order (`src/services/barcode/resolver.ts`):

| # | Source | Example | Where metal, purity and weight come from |
|---|---|---|---|
| 1 | **Weight in the code** (text) | `GOLD-22-000125-8.42` | All read from the code: `METAL-PURITY-ITEMID-WEIGHT`. Metal can be `GOLD`/`AU`/`SILVER`/`AG`. Purity can be `24`, `22K`, `916`, `750`, `999`, `925` and similar. The separator is set in Settings. |
| 2 | **Weight-embedded numeric code** (off by default) | `2900125008425` | Configurable layout: prefix + item code + weight + check digit. The weight comes from the code. Metal and purity come from the saved item whose barcode equals the item code. |
| 3 | **Local item database** | `890000000001` | Items you saved on this device. |
| 4 | **Not found** | anything else | Shows **Add Item** (barcode and any recovered weight are prefilled) or **Scan Again**. |

**Settings → Scanner → Test a barcode** shows how any code resolves with your current settings.

Scanning uses the browser's native `BarcodeDetector` where available (Chrome and Edge on Android, and some desktops). Other browsers, including iOS Safari, fall back to [ZXing](https://github.com/zxing-js/library), which loads only when needed. Every scan screen also has **Enter code manually**.

## Prices

| | |
|---|---|
| Metal prices | [gold-api.com](https://gold-api.com): free, no API key, CORS enabled. `GET /price/XAU` and `/price/XAG` return international spot prices in **USD per troy ounce**. |
| Exchange rate | [open.er-api.com](https://open.er-api.com), with [Frankfurter](https://frankfurter.dev) (ECB rates) as a fallback. Both are free with no key. |

The steps are kept separate (`src/services/price/`):

```
MarketQuote (USD / troy oz)
  → convertCurrency (× USD→INR)
  → toPerGram (÷ 31.1034768)
  → INR / gram (pure metal)
  → purity factor (22K = 22/24, 925 = 0.925, …)       src/features/calculator
  → rate rounded as shown (whole ₹ at ₹1,000+/g, otherwise paise)
  → metal value = weight × rate
  → total = metal value + making + stone + diamond charges (fixed ₹ per item, blank = not applicable)
```

To add another data source, implement `PriceProvider` (`getGoldPrice`, `getSilverPrice`) and register it in `src/services/price/providers/index.ts`.

### Price status labels

- **LIVE**: fetched successfully in the last 3 minutes, and the market quote is less than 30 minutes old.
- **DELAYED**: the fetch worked, but the quote is old (for example, the market is closed).
- **OFFLINE**: the network or API failed. The app shows the **last known price** and when it was updated.
- A cached price is never labelled LIVE.

### How prices stay current

Phones and browsers freeze timers in background tabs, so a plain 60-second timer can leave an old price on screen. GoldCalc avoids that like this:
- A watchdog checks every 5 seconds whether the last fetch is more than 60 seconds old. After a failure, it retries every 15 seconds.
- Prices are re-fetched right away when you return to the app (tab focus, page shown again, device resume, back online), and on the first tap after more than a minute.
- The result screen and the estimate page re-check prices when they open if the last check is older than 30 seconds. **Print** re-fetches first if needed.

### Limitations of the chosen API

- **These are international spot prices converted to INR, not Indian retail or MCX rates.** Domestic prices usually run higher because of import duty and local premiums. **Settings → Price → Market adjustment** adds an optional % to bring the rate closer to local prices (default 0%).
- gold-api.com is a free community service with no SLA or published rate limits.
- The exchange rate updates about once a day. A cached rate up to 48 hours old is reused if the FX APIs are down.
- Silver 999 applies ×0.999 to the spot price, as specified, even though spot silver is already fine silver.

## Environment variables

Copy `.env.example` to `.env`. All of them are optional.

| Variable | Exposed to browser? | Purpose |
|---|---|---|
| `VITE_PRICE_API_URL` | yes, **not a secret** | Base URL for price requests. Default: `https://api.gold-api.com` |
| `VITE_SEED_DEMO_DATA` | yes | Set to `false` to skip seeding the three demo items |
| `PRICE_API_KEY` | **no** | Only for keyed providers. The dev/preview server proxies `/api/price/*` to `PRICE_API_BASE_URL` and adds the key as an `x-api-key` header on the server. |
| `PRICE_API_BASE_URL` | **no** | Target of that proxy |

The current provider needs no key. If you switch to one that does, set `VITE_PRICE_API_URL=/api/price` and set up the same proxy on your host, for example as a serverless function. Never put a secret in a `VITE_` variable.

## Importing inventory from Excel

You can load your whole stock list at once instead of adding items one by one.

1. Go to **Items → Import** (or **Settings → Data → Download Excel template**) and download `GoldCalc-inventory-template.xlsx`.
2. Fill in the **Inventory** sheet, one row per item:

   | Barcode | Metal | Purity | Net Weight (g) | Item Name | Making Charges (₹) | Stone Charges (₹) | Diamond Charges (₹) |
   |---|---|---|---|---|---|---|---|
   | 000451 | Gold | 22K | 12.35 | Gold Bangle | 4200 | 3500 | |
   | 000452 | Gold | 18K | 3.105 | Diamond Pendant | 1800 | | 45000 |
   | 000453 | Silver | 925 | 48.10 | Anklet Pair | | | |

   The three charge columns are optional. Leave a cell blank when that charge doesn't apply. Amounts like `2,500`, `₹2,500` or `Rs. 2500/-` are all accepted. Columns named *Labour*, *MC*, *Stone Value* or *Diamond Amount* are also recognised.

3. Upload the file (`.xlsx` or `.csv`). A preview shows how many items are new, how many will be updated and which rows will be skipped, with the row number and reason for each. Nothing is saved until you press **Import**.

How the import reads your sheet:
- If a barcode already exists, that item is updated with the sheet's values. Blank rows are ignored. If a barcode appears twice in the file, the later row is used.
- Purity can be written in common shop notations: `22`, `22KT`, `22 ct`, `916`, `91.6`, `750`, `92.5`, `Sterling`. If the Metal cell is blank, it is worked out from the purity, except for `999`, which could be gold or silver.
- Your own sheets work too, as long as they have a header row. Common column names are recognised (`Tag No`, `SKU`, `Karat`, `Net Wt`, `Description`…), and **Net Wt** is used in preference to **Gross Wt**. Title rows above the header are fine.
- The template's Barcode column is formatted as text, so leading zeros (`000451`) are kept. The Instructions sheet and its example rows are never imported.
- **Settings → Data → Export items to Excel** writes your current items in the same layout, so you can edit them in Excel and upload the file again.
- Old `.xls` files aren't supported. Save them as `.xlsx` first.

## Item photos

In **Add / Edit Item**, tap **Take photo** to use the camera, or **Choose from gallery**. Photos are resized on the phone (longest side 1280 px, JPEG) to about 30–200 KB each. They're stored in the browser's IndexedDB, so they work offline. Photos appear in the Items list, on the scan screen, on the result screen (tap to enlarge) and on printed estimates.

Photos stay on the device that took them. The JSON backup and the Excel export contain item data only, not photos.

## Estimates

Build a customer estimate from one or more items and print it or save it as a PDF.

1. On a result screen, tap **Add to estimate**. You can also open the **Estimate** tab and use **Scan item** (the scanner stays open, so you can scan several pieces in a row) or **From items**.
2. Add the customer's name and phone if you want them on the estimate.
3. Tap **Print / Save PDF**. This opens the system print dialog, where you can choose a printer or **Save as PDF**. On phones, use the share / print option that appears.

The printed A4 estimate shows:
- your shop name, address, phone and GSTIN
- the estimate number (`EST-0001`, …), the date and the customer
- the rates applied, with a timestamp and whether they were live
- each item with its photo, net weight, rate, metal value, making / stone / diamond charges and amount
- the subtotal, GST, estimated total and the amount in words (Indian system)
- a footer note and a signature line

Set up your shop details under **Settings → Estimate**. There you can also set the GST % (default 3%; set 0 to leave GST out) and edit the footer note.

Rates on an estimate stay live until you print. **New** clears the estimate and starts the next number.

## Data and offline use

- Items, settings and the current estimate are stored in `localStorage` under the `goldcalc:` prefix. Photos are stored in IndexedDB. Settings → Data also has a full JSON backup and restore.
- **Demo items** (`890000000001`–`890000000003`) are marked "Demo". Remove them in **Settings → Data**, or set `VITE_SEED_DEMO_DATA=false` before deploying.
- In production builds, a service worker (`public/sw.js`) caches the app shell, the bundles and the fonts, so the app opens without internet. Saved-item lookups work offline, and prices fall back to the last saved values, labelled OFFLINE.

## Project layout

```
src/
  types/                 domain types (Item, MetalPrice, Resolution, settings)
  services/
    barcode/             parser (encoded formats), resolver, camera scanner engine
    price/               provider interface, gold-api provider, FX, unit conversion, cache
    storage/             items repository, photo store (IndexedDB), settings, Excel import/export, demo data
  features/
    calculator/          purity factors, valuation + charges, useValuation hook
    pricing/             auto-refreshing price store + hooks
    scanner/             ScannerView (camera UI)
    items/               Excel import dialog, photo picker
    estimate/            estimate draft, totals + amount in words, printable document
  pages/                 Home, Scan, Result, Items, Item form, Estimate, Settings
  components/            Buttons, sheets, toasts, form controls, logo, icons
  lib/                   formatting (₹1,25,430), storage helpers, hash router
```

Keyboard: press **S** on the home screen to scan, and **Esc** to close the scanner or a dialog.
