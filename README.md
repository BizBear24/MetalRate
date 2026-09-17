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
- A cached price is never labelled LIVE. Prices refresh every 60 seconds while the app is visible.

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

## Data and offline use

- Items and settings are stored in `localStorage` under the `goldcalc:` prefix. Settings → Data also has a full JSON backup and restore.
- **Demo items** (`890000000001`–`890000000003`) are marked "Demo". Remove them in **Settings → Data**, or set `VITE_SEED_DEMO_DATA=false` before deploying.
- In production builds, a service worker (`public/sw.js`) caches the app shell, the bundles and the fonts, so the app opens without internet. Saved-item lookups work offline, and prices fall back to the last saved values, labelled OFFLINE.

## Project layout

```
src/
  types/                 domain types (Item, MetalPrice, Resolution, settings)
  services/
    barcode/             parser (encoded formats), resolver, camera scanner engine
    price/               provider interface, gold-api provider, FX, unit conversion, cache
    storage/             items repository, settings, demo data
  features/
    calculator/          purity factors, valuation, useValuation hook
    pricing/             polling price store + hooks
    scanner/             ScannerView (camera UI)
  pages/                 Home, Scan, Result, Items, Item form, Settings
  components/            Buttons, sheets, toasts, form controls, logo, icons
  lib/                   formatting (₹1,25,430), storage helpers, hash router
```

Keyboard: press **S** on the home screen to scan, and **Esc** to close the scanner or a dialog.
