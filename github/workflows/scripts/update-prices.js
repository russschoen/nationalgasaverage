javascript
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("Missing EIA_API_KEY environment variable. Set it as a GitHub secret.");
  process.exit(1);
}

const PRODUCTS = {
  regular: { code: "EPMR", label: "Regular", color: "#ffb020" },
  midgrade: { code: "EPMM", label: "Mid-Grade", color: "#ff8a4c" },
  premium: { code: "EPMP", label: "Premium", color: "#ff5c8a" },
  diesel: { code: "EPD2D", label: "Diesel", color: "#4fb8ff" }
};

const JAN20_BASELINE = {
  regular: 3.113,
  midgrade: 3.543,
  premium: 3.897,
  diesel: 3.551
};

const BASE_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";

async function fetchLatestTwo(productCode) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[duoarea][]", "NUS");
  url.searchParams.append("facets[product][]", productCode);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "2");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EIA API request failed for ${productCode}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rows = json?.response?.data;
  if (!rows || rows.length === 0) {
    throw new Error(`No data returned for product ${productCode}`);
  }
  return rows;
}

async function main() {
  const grades = [];

  for (const [key, meta] of Object.entries(PRODUCTS)) {
    console.log(`Fetching ${meta.label} (${meta.code})...`);
    const rows = await fetchLatestTwo(meta.code);
    const latest = parseFloat(rows[0].value);
    const prior = rows[1] ? parseFloat(rows[1].value) : latest;

    grades.push({
      key,
      label: meta.label,
      color: meta.color,
      price: Number(latest.toFixed(3)),
      change: Number((latest - prior).toFixed(3)),
      yearAgo: JAN20_BASELINE[key],
      period: rows[0].period
    });
  }

  const output = {
    asOf: new Date().toISOString().slice(0, 10),
    baselineLabel: "Jan 20, 2025 (Inauguration Day)",
    grades
  };

  const outPath = path.join(__dirname, "..", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
