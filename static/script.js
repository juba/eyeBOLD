let lastData = []; // store last query for export
const MAX_DISPLAY_ROWS = 100000; // maximum number of rows to test for. If more rows than this numbers are t be returned by the query, it will be written: "More than 100000 rows found" instead of the actual number.
let currentQueryController = null; // to manage aborting previous requests
let exportAbortController = null; // to abort export fetch

async function runTest() {
  document.getElementById("status").textContent = "Building query...";
  const currentState = getCurrentQueryState();

  try {
    const res = await fetch("/api/build_query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentState),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    // Display the generated SQL query in the debug <pre>
    document.getElementById("debug-query").textContent = data.sql;

    console.log(data);
    console.log("Number of results:", data.results.length);

    // Also display the JSON object sent
    document.getElementById("debug-query-json-sent").textContent =
      JSON.stringify(currentState, null, 2);

    document.getElementById("status").textContent = "Query built successfully";
  } catch (err) {
    document.getElementById("debug-query").textContent =
      `Error: ${err.message}`;
    document.getElementById("status").textContent = "Error building query";
  }
}

async function runQuery() {
  //deal with aborting previous request if any
  if (currentQueryController) {
    currentQueryController.abort();
  }
  currentQueryController = new AbortController();
  const signal = currentQueryController.signal;

  // UI feedback
  const statusEl = document.getElementById("status");
  //start loading
  statusEl.textContent = "Running query...";
  setRunButtonLoading(true);

  // Clear previous results and debug
  resetResultsView();
  resetDebugView();

  const currentState = getCurrentQueryState();
  console.log("currentState");
  console.log(currentState);

  try {
    const res = await fetch("/api/build_query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentState),
      signal,
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const payload = await res.json();

    // Display the JSON object sent
    document.getElementById("debug-query-json-sent").textContent =
      JSON.stringify(currentState, null, 2);

    // Debug - show SQL in debug panel if you want
    if (payload.sql) {
      document.getElementById("debug-query").textContent = payload.sql;
    }

    // Extract columns, rows, total_count
    const columns = payload.columns || [];
    const rows = payload.results || [];
    const totalCount =
      payload.total_count ??
      payload.totalCount ??
      (payload.nbrows || rows.length);

    console.log("payload:", payload);

    // Render results
    renderResults(columns, rows, totalCount);

    console.log("XX", payload);
    // Enable export buttons
    document.getElementById("export-json").disabled = false;
    document.getElementById("export-tsv").disabled = false;
    document.getElementById("export-fasta").disabled = false;

    statusEl.textContent = `Query OK — showing ${rows.length} rows (total ${totalCount})`;
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Query aborted by user");
      statusEl.textContent = "Query aborted";
    } else {
      console.error(err);
      statusEl.textContent = "Query error: " + err.message;
    }
  } finally {
    /** ALWAYS restore button **/
    setRunButtonLoading(false);
    currentQueryController = null;
  }
}

// Render table given columns array and rows (rows = array of objects)
function renderResults(columns, rows, totalCount) {
  console.log("Rendering results:", columns, rows);
  // header
  const thead = document.getElementById("results-thead");
  thead.innerHTML = ""; // clear
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    thead.appendChild(th);
  });

  // body
  const tbody = document.getElementById("results-tbody");
  tbody.innerHTML = ""; // clear
  rows.forEach((rowObj) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      // handle undefined/null values
      let v = rowObj[col];
      if (v === null || v === undefined) v = "";
      // shorten long sequences in table view to keep table readable
      if (typeof v === "string" && v.length > 200) {
        td.textContent = v.slice(0, 120) + "…";
        td.title = v; // full value on hover
      } else {
        td.textContent = v;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // count text
  const countEl = document.getElementById("results-count");
  countEl.textContent = `The query returned ${totalCount} total matches. Showing the first ${rows.length} rows`;
  // Change the class of the result-header div
  document.getElementById("result-header").classList.remove("bg-secondary");
  document.getElementById("result-header").classList.add("bg-success");
}

//the following function ensures that changes in checked box and buttons
// resets the result panel to prevent discrepancy between options and displayed results

function resetResultsView() {
  // Clear the table
  document.getElementById("results-thead").innerHTML = "";
  document.getElementById("results-tbody").innerHTML = "";

  // Reset counter
  const countDiv = document.getElementById("results-count");
  if (countDiv) countDiv.textContent = "No results yet";

  // Disable export buttons
  document.getElementById("export-json").disabled = true;
  document.getElementById("export-tsv").disabled = true;
  document.getElementById("export-fasta").disabled = true;
  // Change the class of the result-header div
  document.getElementById("result-header").classList.remove("bg-success");
  document.getElementById("result-header").classList.add("bg-secondary");

  // reset debug info as well
  resetDebugView();
}
function resetDebugView() {
  // Clear all
  document.getElementById("status").textContent = "";
  document.getElementById("debug-query").textContent =
    "No object built and sent yet.";
  document.getElementById("debug-query-json-sent").textContent =
    "No query built yet.";
}

function getTaxonomyState() {
  // --- Taxonomy: get name + rank of checked nodes ---
  const taxo = Array.from(
    document.querySelectorAll(
      "#taxonomy-container input[type=checkbox]:checked",
    ),
  )
    .filter((cb) => {
      // Keep this checkbox only if no ancestor checkbox is checked
      let parentLi = cb.closest("li")?.parentElement?.closest("li");
      while (parentLi) {
        const parentCb = parentLi.querySelector("input[type=checkbox]");
        if (parentCb?.checked) return false; // parent is checked → skip this node
        parentLi = parentLi.parentElement?.closest("li");
      }
      return true; // keep this one
    })
    .map((cb) => ({
      name: cb.dataset.taxa,
      rank: cb.dataset.rank,
    }));
  console.log("Current taxonomy state:", taxo);
  //deal with the case where root is selected:
  if (taxo.length === 1 && taxo[0].name === "Root") return [];
  return taxo;
}

function getSelectedBoundingBoxes() {
  // returns an array of {minLat, minLng, maxLat, maxLng}
  return Array.from(selectedCells.values()).map((v) => {
    const bounds = v.bounds;
    return {
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast(),
    };
  });
}

function getCurrentQueryState() {
  const taxonomy = getTaxonomyState();

  // --- Max rank source ---
  const max_rank_source =
    document.getElementById("taxonomy-source-dropdown")?.dataset.source ||
    "gbif";
  console.log("AAAAAAAAAAAAAAA");
  // --- Max rank selected ---
  const rankBtn = document.querySelector("#rank-selector button.active");
  const identification_rank = rankBtn?.dataset.rank || null;

  // --- Countries ---
  const countries = Array.from(
    document.querySelectorAll(".geo-country:checked"),
  ).map((cb) => cb.value);

  // --- Climates ---
  const climates = Array.from(
    document.querySelectorAll(".geo-climate:checked"),
  ).map((cb) => cb.value);

  //selected Bounding boxes (if any)
  const boundingBoxes = getSelectedBoundingBoxes(); // NEW

  // --- Sequence options ---
  const seqRadio = document.querySelector("input[name='seqType']:checked");
  const seqType = seqRadio ? seqRadio.value : null;
  const primers =
    seqType === "primers"
      ? {
          forward: document.getElementById("forwardPrimer").value,
          reverse: document.getElementById("reversePrimer").value,
        }
      : null;

  // --- Other options ---
  const options = {
    excludeDuplicates:
      document.getElementById("optDuplicates")?.checked || false,
    excludeShortLengths: document.getElementById("optLength")?.checked || false,
    hybrids:
      document.querySelector("#hybrid-selector button.active")?.dataset
        .hybrid || "all",
    excludeMisclassified:
      document.getElementById("optMisclassified")?.checked || false,
    checkedLocationsOnly:
      document.getElementById("optCheckedLoc")?.checked || false,
  };

  return {
    taxonomy,
    max_rank_source,
    identification_rank,
    countries,
    climates,
    boundingBoxes,
    sequence: {
      type: seqType,
      primers: primers,
    },
    options,
  };
}

document.addEventListener("DOMContentLoaded", () => {
  // --- Watch for any interaction ---
  document.addEventListener("change", (e) => {
    if (e.target.matches("input, select, textarea")) {
      resetResultsView();
    }
  });
  document.addEventListener("click", (e) => {
    if (
      e.target.matches("button") &&
      !e.target.classList.contains("no-reset")
    ) {
      resetResultsView();
    }
  });
  // --- Enable Bootstrap popovers ---
  const popoverTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="popover"]'),
  );
  popoverTriggerList.forEach((el) => new bootstrap.Popover(el));
});

//document.getElementById("run").addEventListener("click", runTest);
document.getElementById("run").addEventListener("click", runQuery);

const overlay = document.getElementById("export-overlay");

// document.querySelectorAll(".export-btn").forEach(btn => {
//   btn.addEventListener("click", async () => {
//     const format = btn.dataset.format;

//     try {
//       // Show overlay
//       overlay.style.display = "flex";

//       const queryData = getCurrentQueryState();

//       const res = await fetch(`/api/export_query?format=${format}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(queryData)
//       });

//       if (!res.ok) throw new Error(`Export failed: ${res.status}`);

//       const blob = await res.blob();
//       const url = window.URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = url;

//       let filename = `export.${format}`;
//       a.download = filename;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       window.URL.revokeObjectURL(url);

//     } catch (err) {
//       console.error(err);
//       alert("Export failed. See console for details.");
//     } finally {
//       // Hide overlay
//       overlay.style.display = "none";
//     }
//   });
// });

document.querySelectorAll(".export-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const format = btn.dataset.format;

    try {
      // Show overlay
      overlay.style.display = "flex";
      startExportTimer();

      // Create a new abort controller for this export
      exportAbortController = new AbortController();
      const signal = exportAbortController.signal;

      const queryData = getCurrentQueryState();

      const res = await fetch(`/api/export_query?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryData),
        signal,
      });

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      // Get the response as a ReadableStream
      const reader = res.body.getReader();
      const contentType = res.headers.get("Content-Type");
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `export.${format}`;

      // Extract filename from Content-Disposition if available
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // Create a new Blob to accumulate the chunks
      let receivedLength = 0;
      const chunks = [];

      // Read the stream
      document.getElementById("export-progress-title").innerHTML =
        "Downloading data: ";
      document.getElementById("export-progress-value").innerHTML = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        document.getElementById("export-progress-value").innerHTML =
          formatBytes(receivedLength, 1);
      }
      reader.releaseLock();

      // Combine all chunks into a single Blob
      const blob = new Blob(chunks, { type: "application/octet-stream" });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Export aborted by user");
        alert("Export cancelled.");
      } else {
        console.error(err);
        alert("Export failed. See console for details.");
      }
    } finally {
      document.getElementById("export-progress-title").innerHTML =
        "Running query...";
      document.getElementById("export-progress-value").innerHTML = "";
      overlay.style.display = "none";
      exportAbortController = null;
      stopExportTimer();
    }
  });
});

function setRunButtonLoading(isLoading) {
  const btn = document.getElementById("run");
  const spinner = btn.querySelector(".btn-spinner");
  const text = btn.querySelector(".btn-text");
  const stopbtn = document.getElementById("stop-run");

  if (isLoading) {
    spinner.hidden = false;
    text.textContent = "Running…"; // change text
    btn.disabled = true;
    stopbtn.hidden = false;
  } else {
    spinner.hidden = true;
    text.textContent = "Run query"; // restore text
    btn.disabled = false;
    stopbtn.hidden = true;
  }
}

document.getElementById("stop-run").addEventListener("click", () => {
  if (currentQueryController) {
    currentQueryController.abort();
  }
});

document.getElementById("stop-export").addEventListener("click", () => {
  if (exportAbortController) {
    exportAbortController.abort();
  }
});

document.getElementById("query-debug-toggle").addEventListener("click", () => {
  const content = document.getElementById("query-debug-content");
  const toggle = document.getElementById("query-debug-toggle");

  if (content.style.display === "none") {
    content.style.display = "block";
    toggle.textContent = "query details ⏶"; // change arrow
  } else {
    content.style.display = "none";
    toggle.textContent = "query details ⏷"; // change arrow
  }
});

//Elapsed time counter for export
let exportTimer = null;
let exportSeconds = 0;

function startExportTimer() {
  exportSeconds = 0;
  document.getElementById("export-time").textContent = exportSeconds;

  exportTimer = setInterval(() => {
    exportSeconds++;
    document.getElementById("export-time").textContent = exportSeconds;
  }, 1000);
}

function stopExportTimer() {
  if (exportTimer) {
    clearInterval(exportTimer);
    exportTimer = null;
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
