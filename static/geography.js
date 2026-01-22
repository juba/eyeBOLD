// geography.js

import { continentMap, climateGroups } from './continentMap.js';

document.addEventListener("DOMContentLoaded", async () => {
  const countriesContainer = document.getElementById("countries-container");
  const climatesContainer = document.getElementById("climates-container");

  // --- Load countries dynamically ---
  let countries = [];
  try {
    const response = await fetch("/api/countries_csv");
    if (!response.ok) throw new Error("Failed to load countries");
    const text = await response.text();
    countries = text
      .trim()
      .split("\n")
      .slice(1)
      .map(line => line.trim())
      .filter(c => c);
  } catch (err) {
    console.error("Error loading countries:", err);
    countriesContainer.innerHTML = "<p class='text-danger'>Failed to load countries.</p>";
    return;
  }

  // Extract all codes from continentMap
  const allMappedCodes = new Set(Object.values(continentMap).flat().map(c => c.code));
  const missingCountries = countries.filter(c => !allMappedCodes.has(c));

  if (missingCountries.length > 0) {
    console.warn("Countries missing from continentMap:", missingCountries);
  }
  
  // --- Build collapsible continent UI ---
  for (const [continent, codes] of Object.entries(continentMap)) {
    const contDiv = document.createElement("div");
    contDiv.classList.add("continent-block");

    // Arrow toggle
    const toggle = document.createElement("span");
    toggle.textContent = "►";
    toggle.style.cursor = "pointer";
    toggle.style.marginRight = "6px";
    toggle.style.userSelect = "none";

    // Continent label
    const contLabel = document.createElement("label");
    contLabel.classList.add("fw-bold");
    contLabel.textContent = continent;

    // Continent checkbox
    const contCheckbox = document.createElement("input");
    contCheckbox.classList.add("form-check-input", "continent-checkbox");
    contCheckbox.type = "checkbox";
    contCheckbox.id = `continent-${continent}`;
    contCheckbox.style.marginRight = "6px";

    // Wrap title
    const titleDiv = document.createElement("div");
    titleDiv.style.display = "flex";
    titleDiv.style.alignItems = "center";
    titleDiv.appendChild(toggle);
    titleDiv.appendChild(contCheckbox);
    titleDiv.appendChild(contLabel);
    contDiv.appendChild(titleDiv);

    // Child countries
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.marginLeft = "1.5em";
    ul.style.display = "none"; // collapsed by default

    // Sort countries alphabetically by name
    const continentCountries = codes.sort((a, b) => a.name.localeCompare(b.name));

    // Build the UI
    continentCountries.forEach(c => {
      const li = document.createElement("li");
      li.innerHTML = `
        <input class="form-check-input geo-country" type="checkbox" value="${c.code}" id="country-${c.code}">
        <label class="form-check-label" for="country-${c.code}">${c.name}</label>
      `;
      ul.appendChild(li);
    });

    contDiv.appendChild(ul);
    countriesContainer.appendChild(contDiv);

    // --- Toggle behavior ---
    toggle.addEventListener("click", () => {
      const isHidden = ul.style.display === "none";
      ul.style.display = isHidden ? "block" : "none";
      toggle.textContent = isHidden ? "▼" : "►";
    });

    // --- Continent checkbox behavior ---
    contCheckbox.addEventListener("change", () => {
      ul.querySelectorAll("input.geo-country").forEach(cb => (cb.checked = contCheckbox.checked));
    });
  }

  // --- Climate zones ---

  // const climateGroups = {
  //   "Tropical": ["Af", "Am", "Aw", "As"],
  //   "Dry": ["BWh", "BWk", "BSh", "BSk"],
  //   "Temperate": ["Cfa", "Cfb", "Cfc", "Csa", "Csb", "Csc", "Cwa", "Cwb", "Cwc"],
  //   "Continental": ["Dfa", "Dfb", "Dfc", "Dfd", "Dsa", "Dsb", "Dsc", "Dsd", "Dwa", "Dwb", "Dwc", "Dwd"],
  //   "Polar": ["ET", "EF"],
  //   "Ocean": ["Ocean"]
  // };

  for (const [groupName, climates] of Object.entries(climateGroups)) {
    const groupDiv = document.createElement("div");
    groupDiv.classList.add("climate-group");
  
    const toggle = document.createElement("span");
    toggle.textContent = "►";
    toggle.style.cursor = "pointer";
    toggle.style.marginRight = "6px";
    toggle.style.userSelect = "none";
  
    const label = document.createElement("label");
    label.classList.add("fw-bold");
    label.textContent = groupName;
  
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("form-check-input", "climate-group-checkbox");
    checkbox.style.marginRight = "6px";
  
    const titleDiv = document.createElement("div");
    titleDiv.style.display = "flex";
    titleDiv.style.alignItems = "center";
    titleDiv.appendChild(toggle);
    titleDiv.appendChild(checkbox);
    titleDiv.appendChild(label);
  
    groupDiv.appendChild(titleDiv);
  
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.marginLeft = "1.5em";
    ul.style.display = "none";
  
    // --- Sort climates alphabetically by name ---
    const sortedClimates = [...climates].sort((a, b) => a.name.localeCompare(b.name));
  
    sortedClimates.forEach(climate => {
      const li = document.createElement("li");
      li.innerHTML = `
        <input class="form-check-input geo-climate" type="checkbox" value="${climate.code}" id="climate-${climate.code}">
        <label class="form-check-label" for="climate-${climate.code}">${climate.name} (${climate.code})</label>
      `;
      ul.appendChild(li);
    });
  
    groupDiv.appendChild(ul);
    climatesContainer.appendChild(groupDiv);
  
    toggle.addEventListener("click", () => {
      const isHidden = ul.style.display === "none";
      ul.style.display = isHidden ? "block" : "none";
      toggle.textContent = isHidden ? "▼" : "►";
    });
  
    checkbox.addEventListener("change", () => {
      ul.querySelectorAll("input.geo-climate").forEach(cb => (cb.checked = checkbox.checked));
    });
  }
  
  // --- Update counters ---
  const counterSpan = document.getElementById("geography-counter");
  function updateGeographyCounter() {
    console.log("Updating geography counter...");
    const selectedCountries = countriesContainer.querySelectorAll("input.geo-country:checked").length;
    const selectedClimates = climatesContainer.querySelectorAll("input.geo-climate:checked").length;
    const selectedCellsCount = window.getSelectedCellsCount ? window.getSelectedCellsCount() : 0;

    let parts = [];
    if (selectedCountries) parts.push(`${selectedCountries} ${selectedCountries === 1 ? "country" : "countries"}`);
    if (selectedClimates) parts.push(`${selectedClimates} ${selectedClimates === 1 ? "climate" : "climates"}`);
    if (selectedCellsCount) parts.push(`${selectedCellsCount} ${selectedCellsCount === 1 ? "map cell" : "map cells"}`);

    counterSpan.textContent = parts.length ? `(${parts.join(", ")} selected)` : ``;
  }

  window.updateGeographyCounter = updateGeographyCounter;

  document.addEventListener("change", (e) => {
    if (e.target.closest("#countries-container") || e.target.closest("#climates-container")) {
      updateGeographyCounter();
    }
  });

  // Update whenever map selection changes
  map.on('click', () => updateGeographyCounter());


  updateGeographyCounter();
});
