// taxonomy.js — fixed layout with arrows inline, Bootstrap checkboxes, sorted children

document.addEventListener("DOMContentLoaded", async () => {

  // Dropdown click gbif or bold
  let selectedSource = "gbif"; // default
  const toggle = document.getElementById("taxonomy-source-dropdown");
  const items = document.querySelectorAll("#taxonomy-source-dropdown + .dropdown-menu a");
  items.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      selectedSource = item.dataset.source;
      toggle.textContent = item.textContent;      // e.g., "GBIF" or "BOLD" nicely formatted
      toggle.dataset.source = selectedSource;     // clean value: "gbif" or "bold"
      // Optional: visually mark active item in dropdown
      items.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
    });
  });

  // --- Rank selector ---
  let selectedRank = "species"; // default
  const rankButtons = document.querySelectorAll("#rank-selector button");
  rankButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      rankButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRank = btn.dataset.rank;
      console.log("Selected rank:", selectedRank);
      // Optional: trigger refresh or store it for query payload
    });
  });


  const container = document.getElementById("taxonomy-container");
  container.innerHTML = "<p class='text-muted'>Loading taxonomy...</p>";


  let taxonomyData = null;

  // --- Load taxonomy data ---
  try {
    const res = await fetch("/api/taxonomy_json");
    if (!res.ok) throw new Error("Failed to load taxonomy");
    taxonomyData = await res.json();
  } catch (err) {
    console.error("Error loading taxonomy:", err);
    container.innerHTML = "<p class='text-danger'>Failed to load taxonomy data.</p>";
    return;
  }


  container.innerHTML = "";

  const roots = Array.isArray(taxonomyData) ? taxonomyData : [taxonomyData];

  ////////////////////////////////////////////////////////////
  // --- SEARCH ---
  ////////////////////////////////////////////////////////////

  // --- Flatten taxonomy for search ---
  const flatTaxa = []; // array of { name, rank, node, path }

  function flatten(node, path = []) {
    const currentPath = [...path, node]; // keep path to root
    flatTaxa.push({
      name: node.name,
      rank: node.rank,
      node: node,
      path: currentPath // store path for later DOM creation
    });
    if (node.children) {
      node.children.forEach(child => flatten(child, currentPath));
    }
  }

  roots.forEach(root => flatten(root));
  console.log("Flat taxa ready:", flatTaxa.length, "entries");

  // --- For search bar ---
  const searchInput = document.getElementById("taxonomy-search");
  const suggestionsContainer = document.getElementById("taxonomy-suggestions"); 

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    suggestionsContainer.innerHTML = ""; // clear previous suggestions
  
    if (!query) return; // no input → no suggestions
  
    // Filter taxa matching the query
    const matches = flatTaxa.filter(t => t.name.toLowerCase().includes(query)).slice(0, 10); // limit 10
  
    matches.forEach(t => {
      const div = document.createElement("div");
      div.textContent = `${t.name} (${t.rank})`;
      div.className = "list-group-item list-group-item-action";
      div.style.cursor = "pointer";
  
      // Click handler will be Step 3
      div.addEventListener("click", () => {
        console.log("Clicked taxon:", t.name, t.rank);
        // Step 3 will expand the tree up to this taxon
        expandToTaxon(t);
        });
  
      suggestionsContainer.appendChild(div);
    });

  });
  ////////////////////////////////////////////////////////////
  // --- END OF SEARCH ---
  ////////////////////////////////////////////////////////////






  const rootUl = document.createElement("ul");
  rootUl.style.listStyleType = "none";
  rootUl.style.paddingLeft = "0";
  container.appendChild(rootUl);

  function createNode(node, showChildren = false) {
    const li = document.createElement("li");
  
    // Flex wrapper for arrow + checkbox+label
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
  
    const hasChildren = node.children && node.children.length > 0;
  
    // Arrow toggle
    const toggle = document.createElement("span");
    if (hasChildren) {
      toggle.textContent = showChildren ? "▼" : "►";
      toggle.style.cursor = "pointer";
    } else {
      toggle.textContent = "►";
      toggle.style.visibility = "hidden";
    }
    toggle.style.userSelect = "none";
    toggle.style.marginRight = "5px";
  
    // Checkbox + label
    const checkWrapper = document.createElement("div");
    checkWrapper.classList.add("form-check", "d-flex", "align-items-center");
  
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `node-${node.name}`;
    checkbox.dataset.rank = `${node.rank}`;
    checkbox.dataset.taxa = `${node.name}`;
    checkbox.classList.add("form-check-input");
  
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = `${node.name}${node.rank ? " (" + node.rank + ")" : ""}`;
    label.classList.add("form-check-label");
    label.style.marginLeft = "5px";
  
    checkWrapper.appendChild(checkbox);
    checkWrapper.appendChild(label);
    wrapper.appendChild(toggle);
    wrapper.appendChild(checkWrapper);
    li.appendChild(wrapper);
  
    // --- Children container ---
    let ul = null;
    if (hasChildren) {
      ul = document.createElement("ul");
      ul.style.listStyleType = "none";
      ul.style.marginLeft = "20px";
      li.appendChild(ul);
  
      // Use data attribute to mark if children are loaded
      li.dataset.loaded = "false";
  
      async function loadChildren() {
        if (li.dataset.loaded === "true") return;  // <-- prevent duplicate creation
  
        node.children.sort((a, b) => a.name.localeCompare(b.name));
        node.children.forEach(child => ul.appendChild(createNode(child)));
        li.dataset.loaded = "true";  // mark as loaded
      }
  
      // Show first level if requested
      if (showChildren) {
        loadChildren();
        ul.style.display = "block";
      } else {
        ul.style.display = "none";
      }
  
      toggle.addEventListener("click", async () => {
        if (ul.style.display === "none") {
          await loadChildren();
          ul.style.display = "block";
          toggle.textContent = "▼";
  
          // If parent checkbox is checked, check all newly loaded children
          if (checkbox.checked) {
            ul.querySelectorAll("input[type=checkbox]").forEach(cb => (cb.checked = true));
          }
        } else {
          ul.style.display = "none";
          toggle.textContent = "►";
        }
      });
    }
  
    function propagateDown(checked) {
      if (ul) {
        ul.querySelectorAll("input[type=checkbox]").forEach(cb => {
          cb.checked = checked;
          cb.indeterminate = false; // <-- reset indeterminate state
        });
      }
    }
      
    // --- Propagate up ---
    function propagateUp(cb) {
      const li = cb.closest("li");
      const parentUl = li.parentElement;
      const parentLi = parentUl.closest("li");
      if (!parentLi) return;
      const parentCheckbox = parentLi.querySelector("input[type=checkbox]");
  
      const siblingCheckboxes = Array.from(
        parentUl.querySelectorAll(":scope > li > div > div > input[type=checkbox]")
      );
  
      const allChecked = siblingCheckboxes.every(s => s.checked);
      const noneChecked = siblingCheckboxes.every(s => !s.checked && !s.indeterminate);
  
      parentCheckbox.checked = allChecked;
      parentCheckbox.indeterminate = !allChecked && !noneChecked;
  
      propagateUp(parentCheckbox);
    }
  
    // --- Checkbox change handler ---
    checkbox.addEventListener("change", () => {
      propagateDown(checkbox.checked);
      propagateUp(checkbox);
    });
  
    return li;
  }
  

  async function expandToTaxon(taxon) {
    let currentNodes = roots;
    let parentUl = rootUl;
    let finalLi = null;
    console.log("Expanding:", taxon.name, taxon.rank);
  
    for (let levelIndex = 0; levelIndex < taxon.path.length; levelIndex++) {
      const nodeObj = taxon.path[levelIndex];
      const node = currentNodes.find(n => n.name === nodeObj.name);
      if (!node) return;
  
      // Find LI if already exists
      let li = parentUl.querySelector(`li > div > div > input[data-taxa="${node.name}"]`)?.closest("li");
  
      // Create node if not already created
      if (!li) {
        li = createNode(node, false);
        parentUl.appendChild(li);
      }
  
      // Update finalLi for highlighting
      if (levelIndex === taxon.path.length - 1) finalLi = li;
  
      // If this node has children, ensure its UL is visible
      const ul = li.querySelector("ul");
      if (ul && ul.style.display === "none" && levelIndex < taxon.path.length - 1) {
        const toggle = li.querySelector("span"); // the arrow
        toggle.click(); // simulate click to expand (this will call loadChildren inside createNode)
      }
  
      // Move to next level
      parentUl = li.querySelector("ul");
      currentNodes = node.children || [];
    }
  
    // Highlight the final LI
    if (finalLi) {
      const innerDiv = finalLi.querySelector(":scope > div > div");
      innerDiv.classList.add("tax-inner", "tax-highlight");
      void innerDiv.offsetWidth; // force reflow
      setTimeout(() => innerDiv.classList.remove("tax-highlight"), 550);

      // Scroll after a tiny delay to ensure DOM updated
      setTimeout(() => {
        innerDiv.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  
    suggestionsContainer.innerHTML = "";
  }
      
  

  // --- Build tree ---
  roots.forEach((node) => {
    const li = createNode(node, true);
    rootUl.appendChild(li);
  });

  // --- Taxonomy change handler for counter ---
  document.getElementById("taxonomy-container").addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox]")) {
      const taxoState = getTaxonomyState();
      const counter = document.getElementById("taxonomy-counter");
      counter.textContent = taxoState.length > 0
        ? `(${taxoState.length} upper-level taxa selected)`
        : "";
    }
  });
  



});
