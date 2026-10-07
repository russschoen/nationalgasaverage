// scripts/update-state-prices.js
//
// Reads AAA's public "State Gas Price Averages" page
// (https://gasprices.aaa.com/state-gas-price-averages/) and writes the
// regular-gasoline average for each of the 50 states to states-data.json,
// which states.html reads at page-load time.
//
// - One page request per run. No API key, no quota.
// - This is NOT an official API: it reads a public web page. If AAA changes
//   the page layout, the checks below fail and the script leaves the existing
//   states-data.json untouched (stale data, never wrong data).
// - Please review AAA's terms of use before relying on this.

const fs = require("fs");
const path = require("path");

const PAGE_URL = "https://gasprices.aaa.com/state-gas-price-averages/";
const USER_AGENT =
  "Mozilla/5.0 (compatible; nationalgasaverage.com data updater; +https://nationalgasaverage.com)";

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

// Sanity limits for a regular-gas price in dollars per gallon.
const MIN_PRICE = 1.5;
const MAX_PRICE = 10;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Parsing (pure functions, so they can be tested offline) ----------

// Finds every table row that links to ?state=XX and takes the FIRST dollar
// amount in that row as the Regular price (columns: Regular, Mid-Grade,
// Premium, Diesel). Returns { AL: 3.9794, ... } for the states it found.
function parseStatePage(html) {
  const prices = {};
  const rows = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const codeMatch = row.match(/state=([A-Z]{2})(?![A-Za-z])/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    if (!STATES[code] || prices[code] !== undefined) continue; // skips DC and repeats

    const text = row
      .replace(/<[^>]*>/g, " ")
      .replace(/&#0*36;|&dollar;/gi, "$");
    const nums = [...text.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]));
    if (nums.length < 4) continue; // expect Regular, Mid-Grade, Premium, Diesel
    prices[code] = nums[0];
  }
  return prices;
}

// Returns a list of problems. An empty list means the data looks safe to save.
function validate(prices) {
  const problems = [];
  const missing = Object.keys(STATES).filter(c => prices[c] === undefined);
  if (missing.length) {
    problems.push(`Missing ${missing.length} of 50 states: ${missing.join(", ")}`);
  }
  const found = Object.entries(prices);
  const bad = found.filter(([, p]) => !(p >= MIN_PRICE && p <= MAX_PRICE));
  if (bad.length) {
    problems.push(`Prices outside $${MIN_PRICE}-$${MAX_PRICE}: ` + bad.map(([c, p]) => `${c}=${p}`).join(", "));
  }
  if (found.length >= 10) {
    const values = found.map(([, p]) => p);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread < 0.3) {
      problems.push(`Prices look suspicious (all within ${spread.toFixed(2)} of each other) - the wrong column may have been read.`);
    }
  }
  return problems;
}

// Reads AAA's own "Price as of M/D/YY" date from the page, as YYYY-MM-DD.
function parseAsOf(html) {
  const m = html.match(/Price as of[\s\S]{0,80}?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function buildOutput(prices, asOf) {
  const results = Object.entries(STATES).map(([code, name]) => ({
    code,
    name,
    price: Number(prices[code].toFixed(4))
  }));
  const nationalAvg = results.reduce((sum, s) => sum + s.price, 0) / results.length;

  const byPrice = [...results].sort((a, b) => a.price - b.price);
  const rankOf = {};
  byPrice.forEach((s, i) => { rankOf[s.code] = i + 1; });

  return {
    asOf,
    source: "AAA state gas price averages (regular unleaded)",
    nationalAvg: Number(nationalAvg.toFixed(4)),
    totalStates: results.length,
    failedStates: [],
    states: results
      .map(s => {
        const diff = s.price - nationalAvg;
        return {
          code: s.code,
          name: s.name,
          price: s.price,
          vsNational: Number(diff.toFixed(4)),
          vsNationalPct: Number(((diff / nationalAvg) * 100).toFixed(1)),
          rank: rankOf[s.code]
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

// ---------- Network ----------

async function fetchPage() {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(PAGE_URL, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(30000)
      });
      if ([401, 403, 429].includes(res.status)) {
        const err = new Error(`AAA refused the request (HTTP ${res.status}). The page may be blocking automated requests.`);
        err.fatal = true;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await sleep(attempt * 3000);
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`Fetching ${PAGE_URL} ...`);
  const html = await fetchPage();

  const prices = parseStatePage(html);
  const problems = validate(prices);
  if (problems.length) {
    console.error("The AAA page did not look the way this script expects:");
    problems.forEach(p => console.error(" - " + p));
    console.error("states-data.json was NOT changed.");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const aaaDate = parseAsOf(html);
  if (!aaaDate) console.warn("Could not read AAA's 'Price as of' date; using today's date instead.");
  const asOf = aaaDate || today;
  if (aaaDate && aaaDate !== today) console.warn(`Note: AAA's page says prices are as of ${aaaDate}, today is ${today}.`);

  const output = buildOutput(prices, asOf);
  const outPath = path.join(__dirname, "..", "states-data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Success: 50/50 states. As of ${asOf}.`);
}

module.exports = { parseStatePage, validate, parseAsOf, buildOutput, STATES };

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    console.error("states-data.json was NOT changed.");
    process.exit(1);
  });
}
