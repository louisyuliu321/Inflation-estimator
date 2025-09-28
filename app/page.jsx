"use client";

import { useEffect, useMemo, useState } from "react";

const DATASET_OPTIONS = [
  { key: "cpi", label: "CPI" },
  { key: "bls-ppi", label: "BLS PPI" },
  { key: "nhcci", label: "NHCCI" },
];

function formatValue(rawValue) {
  if (!Number.isFinite(rawValue)) {
    return null;
  }
  return rawValue.toFixed(3);
}

function getPreviousMonthKey() {
  const today = new Date();
  today.setDate(1);
  today.setMonth(today.getMonth() - 1);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function HomePage() {
  const [datasetKey, setDatasetKey] = useState(DATASET_OPTIONS[0].key);
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [basePrice, setBasePrice] = useState("100");
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError("");
      setEntries([]);
      setDatasetInfo(null);
      setFromMonth("");
      setToMonth("");

      try {
        const response = await fetch(`/api/indexes/${datasetKey}`);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setDatasetInfo(payload);
          setEntries(payload.entries ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? "Unknown error");
          setEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [datasetKey]);

  const defaults = useMemo(() => {
    if (!entries.length) {
      return { from: "", to: "" };
    }
    const previousMonthKey = getPreviousMonthKey();
    const latestEntry = entries[entries.length - 1];

    let fromKey = entries[0].key;
    for (const entry of entries) {
      if (entry.key > previousMonthKey) {
        break;
      }
      fromKey = entry.key;
    }

    const toKey = latestEntry.key;

    return {
      from: fromKey,
      to: toKey,
    };
  }, [entries]);

  useEffect(() => {
    if (!entries.length) {
      return;
    }
    setFromMonth((previous) => previous || defaults.from);
    setToMonth((previous) => previous || defaults.to);
  }, [entries, defaults]);

  const handleFromChange = (value) => {
    setFromMonth(value);
    if (value > toMonth) {
      setToMonth(value);
    }
  };

  const handleToChange = (value) => {
    setToMonth(value);
    if (value < fromMonth) {
      setFromMonth(value);
    }
  };

  const handleResetRange = () => {
    if (!defaults.from || !defaults.to) {
      return;
    }
    setFromMonth(defaults.from);
    setToMonth(defaults.to);
  };

  const fromEntry = entries.find((entry) => entry.key === fromMonth);
  const toEntry = entries.find((entry) => entry.key === toMonth);

  const fromValue = fromEntry?.value ?? fromEntry?.valueRaw ?? null;
  const toValue = toEntry?.value ?? toEntry?.valueRaw ?? null;
  const factor = Number.isFinite(fromValue) && Number.isFinite(toValue) && fromValue !== 0
    ? toValue / fromValue
    : null;

  const rangeEntries = useMemo(() => {
    if (!fromMonth || !toMonth || !entries.length) {
      return [];
    }
    return entries.filter((entry) => entry.key >= fromMonth && entry.key <= toMonth);
  }, [fromMonth, toMonth, entries]);

  const selectDisabled = loading || Boolean(error) || !entries.length;
  const hasContext = rangeEntries.some((entry) => Boolean(entry.context));
  const hasSecondary = rangeEntries.some((entry) => Number.isFinite(entry.valueRaw));
  const resetDisabled =
    selectDisabled || !defaults.from || !defaults.to || (fromMonth === defaults.from && toMonth === defaults.to);

  const numericBasePrice = Number.parseFloat(basePrice.replace(/,/g, ""));
  const adjustedPrice = Number.isFinite(factor) && Number.isFinite(numericBasePrice)
    ? numericBasePrice * factor
    : null;

  const formattedBasePrice = Number.isFinite(numericBasePrice)
    ? numericBasePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "";

  const formattedAdjustedPrice = Number.isFinite(adjustedPrice)
    ? adjustedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

  const handleToggleTable = () => {
    setTableOpen((prev) => !prev);
  };

  useEffect(() => {
    setTableOpen(false);
  }, [datasetKey, fromMonth, toMonth]);

  return (
    <main className="card">
      <header className="card__header">Inflation Index Explorer</header>
      <section className="card__body">
        <div className="form-stack">
          <div className="form-field">
            <label htmlFor="dataset-select">Index</label>
            <select
              id="dataset-select"
              value={datasetKey}
              onChange={(event) => setDatasetKey(event.target.value)}
            >
              {DATASET_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="range-section">
            <div className="range-row">
              <div className="form-field form-field--range">
                <label htmlFor="from-select">From</label>
                <select
                  id="from-select"
                  value={fromMonth}
                  disabled={selectDisabled}
                  onChange={(event) => handleFromChange(event.target.value)}
                >
                  {loading && <option>Loading data…</option>}
                  {!loading && !entries.length && <option>No data available</option>}
                  {!loading &&
                    entries.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                </select>
              </div>

              <span className="range-separator" aria-hidden="true">→</span>

              <div className="form-field form-field--range">
                <label htmlFor="to-select">To</label>
                <select
                  id="to-select"
                  value={toMonth}
                  disabled={selectDisabled}
                  onChange={(event) => handleToChange(event.target.value)}
                >
                  {loading && <option>Loading data…</option>}
                  {!loading && !entries.length && <option>No data available</option>}
                  {!loading &&
                    entries.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="range-reset"
              onClick={handleResetRange}
              disabled={resetDisabled}
            >
              Reset range
            </button>
          </div>
        </div>

        <div className="price-box" role="group" aria-labelledby="price-box-heading">
          <div className="price-box__header" id="price-box-heading">Price Estimator</div>
          <div className="price-box__body">
            <div className="price-box__labels">
              <span className="price-box__label">Base Price</span>
              <span className="price-box__label price-box__label--right">Adjusted Price</span>
            </div>
            <div className="price-box__rows">
              <div className="price-box__input-group">
                <input
                  type="text"
                  inputMode="decimal"
                  className="price-box__input"
                  value={formattedBasePrice}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^0-9.,-]/g, "");
                    setBasePrice(raw);
                  }}
                />
                <div className="price-box__multiplier" aria-hidden="true">× {formatValue(factor) ?? "—"}</div>
              </div>
              <div className="price-box__output">
                <strong>{formattedAdjustedPrice}</strong>
              </div>
            </div>
          </div>
        </div>

        <p className="helper-text">
          *Factor uses the selected index to show the relative change between the start and end months.
        </p>

        <div className={`value${loading ? " value--loading" : ""}`}>
          {loading ? "—" : formatValue(factor) ?? "—"}
        </div>

        <div className="details">
          {datasetInfo?.unit && (
            <div>
              <strong>Unit:</strong> {datasetInfo.unit}
            </div>
          )}
          {fromEntry && (
            <div>
              <strong>From:</strong> {fromEntry.label}
              {fromEntry.context ? ` (${fromEntry.context})` : ""}
              {Number.isFinite(fromValue) && (
                <span className="details__value"> — {formatValue(fromValue)}</span>
              )}
            </div>
          )}
          {toEntry && (
            <div>
              <strong>To:</strong> {toEntry.label}
              {toEntry.context ? ` (${toEntry.context})` : ""}
              {Number.isFinite(toValue) && (
                <span className="details__value"> — {formatValue(toValue)}</span>
              )}
            </div>
          )}
          {datasetInfo?.source?.url && (
            <div>
              Source: {" "}
              <a href={datasetInfo.source.url} target="_blank" rel="noreferrer noopener">
                {datasetInfo.source.name}
              </a>
            </div>
          )}
        </div>

        {error && <div className="error">Unable to load data. {error}</div>}

        <section className="table-toggle">
          <button
            type="button"
            className="table-toggle__button"
            onClick={handleToggleTable}
            disabled={loading || Boolean(error) || !rangeEntries.length}
            aria-expanded={tableOpen}
            aria-controls="data-table-section"
          >
            {tableOpen ? "Hide data table" : "Show data table"}
          </button>
          {!rangeEntries.length && !loading && !error && (
            <span className="table-toggle__hint">No data available for the selected range.</span>
          )}
        </section>

        {!loading && !error && tableOpen && (
          <section className="table-section" id="data-table-section" aria-live="polite">
            <div className="table-title">{datasetInfo?.name ?? "Index"} data</div>
            {rangeEntries.length ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      {hasContext && <th scope="col">Context</th>}
                      <th scope="col">{datasetInfo?.valueLabel ?? "Value"}</th>
                      {hasSecondary && (
                        <th scope="col">{datasetInfo?.secondaryLabel ?? "Alternate"}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rangeEntries.map((entry) => (
                      <tr key={entry.key}>
                        <td>{entry.label}</td>
                        {hasContext && <td>{entry.context ?? "—"}</td>}
                        <td>{formatValue(entry.value) ?? "—"}</td>
                        {hasSecondary && <td>{formatValue(entry.valueRaw) ?? "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">No records available for the selected range.</p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
