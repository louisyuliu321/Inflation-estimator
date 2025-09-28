import { NextResponse } from "next/server";

const MIN_YEAR = 2016;
const NHCCI_URL = "https://data.transportation.gov/resource/r94d-n4f9.json";
const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const QUARTER_TO_MONTHS = {
  1: [0, 1, 2],
  2: [3, 4, 5],
  3: [6, 7, 8],
  4: [9, 10, 11],
};

const DATASETS = {
  nhcci: {
    name: "NHCCI",
    valueLabel: "NHCCI (Seasonally adj.)",
    secondaryLabel: "NHCCI",
    unit: "Index (2014 = 1.00)",
    source: {
      name: "U.S. DOT Open Data",
      url: "https://data.transportation.gov/National-Transportation-Atlas-Database-NTAD-/National-Highway-Construction-Cost-Index-NHCCI/r94d-n4f9",
    },
    fetcher: fetchNhcci,
  },
  "bls-ppi": {
    name: "BLS PPI",
    valueLabel: "PPI: Final Demand (WPUFD4)",
    unit: "Index (1982 = 100)",
    source: {
      name: "U.S. Bureau of Labor Statistics",
      url: "https://data.bls.gov/timeseries/WPUFD4",
    },
    fetcher: () => fetchBlsSeries("WPUFD4"),
  },
  cpi: {
    name: "CPI",
    valueLabel: "CPI-U, All items (CUSR0000SA0)",
    unit: "Index (1982-84 = 100)",
    source: {
      name: "U.S. Bureau of Labor Statistics",
      url: "https://data.bls.gov/timeseries/CUSR0000SA0",
    },
    fetcher: () => fetchBlsSeries("CUSR0000SA0"),
  },
};

export async function GET(request, { params }) {
  const datasetKey = params?.dataset;
  const dataset = DATASETS[datasetKey];

  if (!dataset) {
    return NextResponse.json(
      { error: `Unknown dataset '${datasetKey}'.` },
      { status: 400 }
    );
  }

  try {
    const payload = await dataset.fetcher();

    return NextResponse.json(
      {
        dataset: datasetKey,
        name: dataset.name,
        valueLabel: dataset.valueLabel,
        secondaryLabel: dataset.secondaryLabel ?? null,
        unit: dataset.unit,
        source: dataset.source,
        entries: payload,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=14400, stale-while-revalidate=7200",
        },
      }
    );
  } catch (error) {
    console.error(`Failed to load dataset ${datasetKey}:`, error);
    return NextResponse.json(
      { error: "Failed to load dataset." },
      { status: 502 }
    );
  }
}

function toMonthKey(year, monthIndexZeroBased) {
  return `${year}-${String(monthIndexZeroBased + 1).padStart(2, "0")}`;
}

function toLabel(year, monthIndexZeroBased) {
  return `${MONTH_NAMES[monthIndexZeroBased]} ${year}`;
}

function withinRange(key) {
  const now = new Date();
  const maxKey = toMonthKey(now.getFullYear(), now.getMonth());
  return key >= `${MIN_YEAR}-01` && key <= maxKey;
}

function parseNumber(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchNhcci() {
  const response = await fetch(NHCCI_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`NHCCI request failed with status ${response.status}`);
  }
  const records = await response.json();

  const entries = [];

  for (const record of records) {
    const match = /^\s*(\d{4})\s+Q([1-4])\s*$/.exec(record.quarter ?? "");
    if (!match) {
      continue;
    }

    const year = Number.parseInt(match[1], 10);
    const quarter = Number.parseInt(match[2], 10);
    if (Number.isNaN(year) || year < MIN_YEAR) {
      continue;
    }

    const months = QUARTER_TO_MONTHS[quarter] ?? [];
    for (const monthIndex of months) {
      const key = toMonthKey(year, monthIndex);
      if (!withinRange(key)) {
        continue;
      }

      entries.push({
        key,
        label: toLabel(year, monthIndex),
        value: parseNumber(record.nhcci_seasonally_adjusted) ?? parseNumber(record.nhcci),
        valueRaw: parseNumber(record.nhcci),
        context: record.quarter ?? null,
      });
    }
  }

  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return entries;
}

async function fetchBlsSeries(seriesId) {
  const now = new Date();
  const body = JSON.stringify({
    seriesid: [seriesId],
    startyear: String(MIN_YEAR),
    endyear: String(now.getFullYear()),
  });

  const response = await fetch(BLS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`BLS request failed with status ${response.status}`);
  }

  const data = await response.json();
  const series = data?.Results?.series?.[0];
  if (!series) {
    throw new Error("BLS response missing series data.");
  }

  const entries = [];

  for (const record of series.data ?? []) {
    if (!record.period?.startsWith("M")) {
      continue;
    }

    const monthIndex = Number.parseInt(record.period.slice(1), 10) - 1;
    const year = Number.parseInt(record.year, 10);
    if (Number.isNaN(monthIndex) || Number.isNaN(year)) {
      continue;
    }
    if (year < MIN_YEAR) {
      continue;
    }

    const key = toMonthKey(year, monthIndex);
    if (!withinRange(key)) {
      continue;
    }

    entries.push({
      key,
      label: record.periodName ? `${record.periodName} ${year}` : toLabel(year, monthIndex),
      value: parseNumber(record.value),
      valueRaw: null,
      context: null,
    });
  }

  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return entries;
}
