let lastData = []; // store last query for export

async function runTest() {
  document.getElementById("status").textContent = "Building query...";
  const currentState = getCurrentQueryState();

  try {
    const res = await fetch("/api/build_query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentState)
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    // Display the generated SQL query in the debug <pre>
    document.getElementById("debug-query").textContent = data.sql;
    
    console.log(data);
    console.log("Number of results:", data.results.length);


    // Also display the JSON object sent    
    document.getElementById("debug-query-json-sent").textContent = JSON.stringify(currentState, null, 2);

    document.getElementById("status").textContent = "Query built successfully";
  } catch (err) {
    document.getElementById("debug-query").textContent = `Error: ${err.message}`;
    document.getElementById("status").textContent = "Error building query";
  }
}

async function runQuery() {
  // UI feedback
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Running query...";

  const currentState = getCurrentQueryState();
  console.log("currentState")
  console.log(currentState)

  try {
    const res = await fetch("/api/build_query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentState)
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const payload = await res.json();


    // Display the JSON object sent    
    document.getElementById("debug-query-json-sent").textContent = JSON.stringify(currentState, null, 2);

    // Debug - show SQL in debug panel if you want
    if (payload.sql) {
      document.getElementById("debug-query").textContent = payload.sql;
    }

    // Extract columns, rows, total_count
    const columns = payload.columns || [];
    const rows = payload.results || [];
    const totalCount = payload.total_count ?? payload.totalCount ?? (payload.nbrows || rows.length);

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
    console.error(err);
    document.getElementById("status").textContent = "Error running query.";
    document.getElementById("results-count").textContent = "Error";
    document.getElementById("results-thead").innerHTML = "";
    document.getElementById("results-tbody").innerHTML = "";
  }
}

// Render table given columns array and rows (rows = array of objects)
function renderResults(columns, rows, totalCount) {
  console.log("Rendering results:", columns, rows);
  // header
  const thead = document.getElementById("results-thead");
  thead.innerHTML = ""; // clear
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    thead.appendChild(th);
  });

  // body
  const tbody = document.getElementById("results-tbody");
  tbody.innerHTML = ""; // clear
  rows.forEach(rowObj => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
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
}



function getTaxonomyState() {
  // --- Taxonomy: get name + rank of checked nodes ---
  const taxo = Array.from(document.querySelectorAll("#taxonomy-container input[type=checkbox]:checked"))
  .filter(cb => {
      // Keep this checkbox only if no ancestor checkbox is checked
      let parentLi = cb.closest("li")?.parentElement?.closest("li");
      while (parentLi) {
        const parentCb = parentLi.querySelector("input[type=checkbox]");
        if (parentCb?.checked) return false; // parent is checked → skip this node
        parentLi = parentLi.parentElement?.closest("li");
      }
      return true; // keep this one
    })
    .map(cb => ({
      name: cb.dataset.taxa,
      rank: cb.dataset.rank
    }));
  console.log("Current taxonomy state:", taxo);
  //deal with the case where root is selected: 
  if (taxo.length === 1 && taxo[0].name === "Root") return [];
  return taxo;
}

function getSelectedBoundingBoxes() {
  // returns an array of {minLat, minLng, maxLat, maxLng}
  return Array.from(selectedCells.values()).map(v => {
    const bounds = v.bounds;
    return {
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast()
    };
  });
}

function getCurrentQueryState() {

  const taxonomy = getTaxonomyState();
  
  // --- Max rank source ---
  const max_rank_source = document.getElementById("taxonomy-source-dropdown")?.dataset.source || "gbif";
  console.log("AAAAAAAAAAAAAAA")
  // --- Max rank selected ---
  const rankBtn = document.querySelector("#rank-selector button.active");
  const identification_rank = rankBtn?.dataset.rank || null;

  // --- Countries ---
  const countries = Array.from(document.querySelectorAll(".geo-country:checked"))
    .map(cb => cb.value);

  // --- Climates ---
  const climates = Array.from(document.querySelectorAll(".geo-climate:checked"))
    .map(cb => cb.value);

  //selected Bounding boxes (if any)
  const boundingBoxes = getSelectedBoundingBoxes(); // NEW

  // --- Sequence options ---
  const seqRadio = document.querySelector("input[name='seqType']:checked");
  const seqType = seqRadio ? seqRadio.value : null;
  const primers = seqType === "primers" ? {
    forward: document.getElementById("forwardPrimer").value,
    reverse: document.getElementById("reversePrimer").value
  } : null;

  // --- Other options ---
  const options = {
    excludeDuplicates: document.getElementById("optDuplicates")?.checked || false,
    excludeShortLengths: document.getElementById("optLength")?.checked || false,
    hybrids: document
      .querySelector("#hybrid-selector button.active")
      ?.dataset.hybrid || "all",
    excludeMisclassified: document.getElementById("optMisclassified")?.checked || false,
    checkedLocationsOnly: document.getElementById("optCheckedLoc")?.checked || false
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
      primers: primers
    },
    options
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
    if (e.target.matches("button") && !e.target.classList.contains("no-reset")) {
      resetResultsView();
    }
  });
});


//document.getElementById("run").addEventListener("click", runTest);
document.getElementById("run").addEventListener("click", runQuery);


const overlay = document.getElementById("export-overlay");

document.querySelectorAll(".export-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const format = btn.dataset.format;

    try {
      // Show overlay
      overlay.style.display = "flex";

      const queryData = getCurrentQueryState();

      const res = await fetch(`/api/export_query?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryData)
      });

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      let filename = `export.${format}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error(err);
      alert("Export failed. See console for details.");
    } finally {
      // Hide overlay
      overlay.style.display = "none";
    }
  });
});

