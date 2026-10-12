// scripts/update-prices.js
//
// Reads the national-average table on AAA's public homepage
// (https://gasprices.aaa.com/) and writes data.json, which index.html loads.
//
// - Price  = AAA "Current Avg."
// - Change = Current Avg. minus AAA "Yesterday Avg." (a true day-over-day change)
// - No API key needed. One request per run.
// - NOT an official API: if AAA changes the page, the checks below fail and
//   data.json is left untouched (stale data, never wrong data).
// - Please review AAA's terms of use before relying on this.

const fs = require("fs");
const path = require("path");

const PAGE_URL = "https://gasprices.aaa.com/";
const USER_AGENT =
  "Mozilla/5.0 (compatible; nationalgasaverage.com data updater; +https://nationalgasaverage.com)";

// Jan 20, 2025 (Inauguration Day) comparison figures, from AAA.
const JAN20_BASELINE = { regular: 3.113, midgrade: 3.543, premium: 3.897, diesel: 3.551 };

const GRADES = [
  { key: "regular", label: "Regular", color: "#ffb020", col: 0 },
  { key: "midgrade", label: "Mid-Grade", color: "#ff8a4c", col: 1 },
  { key: "premium", label: "Premium", color: "#ff5c8a", col: 2 },
  { key: "diesel", label: "Diesel", color: "#4fb8ff", col: 3 }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function rowValues(html, label) {
  const rows = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const text = row.replace(/<[^>]*>/g, " ").replace(/&#0*36;|&dollar;/gi, "$").replace(/\s+/g, " ");
    if (new RegExp(label.replace(/[.]/g, "\\.") , "i").test(text)) {
      const nums = [...text.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]));
      if (nums.length >= 4) return nums;
    }
  }
  return null;
}

// Returns { current: [reg, mid, prem, diesel, (e85)], yesterday: [...] } or nulls.
function parseNational(html) {
  return {
    current: rowValues(html, "Current Avg"),
    yesterday: rowValues(html, "Yesterday Avg")
  };
}

function parseAsOf(html) {
  const m = html.match(/Price as of[\s\S]{0,80}?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function validate({ current, yesterday }) {
  const problems = [];
  if (!current) problems.push("Could not find the 'Current Avg.' row.");
  if (!yesterday) problems.push("Could not find the 'Yesterday Avg.' row.");
  if (problems.length) return problems;
  for (const g of GRADES) {
    const c = current[g.col], y = yesterday[g.col];
    if (!(c >= 1.5 && c <= 10)) problems.push(`${g.label} current ${c} outside $1.50-$10`);
    if (!(y >= 1.5 && y <= 10)) problems.push(`${g.label} yesterday ${y} outside $1.50-$10`);
    if (Math.abs(c - y) > 0.5) problems.push(`${g.label} moved more than $0.50 in a day (${y} -> ${c})`);
  }
  // Grades should be ordered regular < midgrade < premium.
  if (!(current[0] < current[1] && current[1] < current[2])) {
    problems.push("Regular/Mid-Grade/Premium not in ascending order - wrong columns may have been read.");
  }
  return problems;
}

function buildOutput(parsed, asOf) {
  return {
    asOf,
    baselineLabel: "Jan 20, 2025 (Inauguration Day)",
    grades: GRADES.map(g => ({
      key: g.key,
      label: g.label,
      price: Number(parsed.current[g.col].toFixed(4)),
      change: Number((parsed.current[g.col] - parsed.yesterday[g.col]).toFixed(4)),
      color: g.color,
      yearAgo: JAN20_BASELINE[g.key]
    }))
  };
}

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
  const parsed = parseNational(html);
  const problems = validate(parsed);
  if (problems.length) {
    console.error("The AAA page did not look the way this script expects:");
    problems.forEach(p => console.error(" - " + p));
    console.error("data.json was NOT changed.");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const aaaDate = parseAsOf(html);
  if (!aaaDate) console.warn("Could not read AAA's 'Price as of' date; using today's date instead.");
  const output = buildOutput(parsed, aaaDate || today);
  const outPath = path.join(__dirname, "..", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  output.grades.forEach(g => console.log(`  ${g.label}: $${g.price} (${g.change >= 0 ? "+" : ""}${g.change} vs yesterday)`));
}

module.exports = { parseNational, parseAsOf, validate, buildOutput };

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    console.error("data.json was NOT changed.");
    process.exit(1);
  });
}
