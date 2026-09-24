// scripts/update-state-prices.js
//
// Fetches current retail gasoline prices for all 50 US states from
// OilPriceAPI (https://www.oilpriceapi.com) and writes them to
// states-data.json, which states.html reads at page-load time.
//
// Requires a free OilPriceAPI key: https://www.oilpriceapi.com/auth/signup
// Store it as a GitHub Actions secret named OILPRICEAPI_KEY.
//
// IMPORTANT: the free tier allows 200 requests/month. This script makes
// 50 requests per run (one per state), so it must run WEEKLY, not daily,
// to stay within the free limit (50 x 4 = 200/month).

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.OILPRICEAPI_KEY;
if (!API_KEY) {
  console.error("Missing OILPRICEAPI_KEY environment variable. Set it as a GitHub secret.");
  process.exit(1);
}

const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

const BASE_URL = "https://api.oilpriceapi.com/v1/prices/latest";

async function fetchStatePrice(code) {
  const url = `${BASE_URL}?by_code=GASOLINE_RETAIL_STATE_${code}_USD`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${API_KEY}` }
  });
  if (!res.ok) {
    throw new Error(`Request failed for ${code}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  // OilPriceAPI's latest-price response shape: { data: { price, formatted, ... } }
  const price = json?.data?.price ?? json?.data?.[0]?.price;
  if (price == null) {
    throw new Error(`No price found in response for ${code}: ${JSON.stringify(json)}`);
  }
  return Number(price);
}

async function main() {
  const results = [];
  const failed = [];

  for (const [code, name] of Object.entries(STATES)) {
    try {
      console.log(`Fetching ${name} (${code})...`);
      const price = await fetchStatePrice(code);
      results.push({ code, name, price: Number(price.toFixed(3)) });
    } catch (err) {
      console.warn(`  -> failed: ${err.message}`);
      failed.push(code);
    }
    // Small delay between requests to be a good API citizen
    await new Promise(r => setTimeout(r, 150));
  }

  if (results.length === 0) {
    console.error("No states fetched successfully. Aborting without overwriting states-data.json.");
    process.exit(1);
  }

  const nationalAvg = results.reduce((sum, s) => sum + s.price, 0) / results.length;

  // Rank states, cheapest first
  const ranked = [...results].sort((a, b) => a.price - b.price);
  ranked.forEach((s, i) => { s.rank = i + 1; });

  const output = {
    asOf: new Date().toISOString().slice(0, 10),
    nationalAvg: Number(nationalAvg.toFixed(3)),
    totalStates: results.length,
    failedStates: failed,
    states: results
      .map(s => {
        const diff = s.price - nationalAvg;
        const pct = (diff / nationalAvg) * 100;
        const rankEntry = ranked.find(r => r.code === s.code);
        return {
          code: s.code,
          name: s.name,
          price: s.price,
          vsNational: Number(diff.toFixed(3)),
          vsNationalPct: Number(pct.toFixed(1)),
          rank: rankEntry.rank
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  };

  const outPath = path.join(__dirname, "..", "states-data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Success: ${results.length}/50 states. Failed: ${failed.join(", ") || "none"}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
