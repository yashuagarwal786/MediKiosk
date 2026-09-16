const table = document.getElementById("casesTable");
const statusEl = document.getElementById("doctorStatus");
let allCases = [];

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${type}`.trim();
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function updateStats(cases) {
  const today = new Date().toDateString();
  document.getElementById("totalCases").textContent = cases.length;
  document.getElementById("todayCases").textContent = cases.filter((item) => new Date(item.created_at).toDateString() === today).length;
  document.getElementById("pendingCases").textContent = cases.filter((item) => item.status === "Pending").length;
  document.getElementById("completedCases").textContent = cases.filter((item) => item.status === "Completed").length;
}

function renderCases(cases) {
  updateStats(allCases);
  if (!cases.length) {
    table.innerHTML = `<tr><td colspan="6">No cases found.</td></tr>`;
    return;
  }

  table.innerHTML = cases
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.age}</td>
          <td>${item.complaint}</td>
          <td>${formatDate(item.created_at)}</td>
          <td><span class="badge ${item.status === "Completed" ? "completed" : ""}">${item.status}</span></td>
          <td><a class="button ghost" href="/case/${item.id}">View</a></td>
        </tr>
      `
    )
    .join("");
}

async function loadCases() {
  setStatus("Loading cases...", "loading");
  try {
    const response = await fetch("/api/cases");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load cases.");
    allCases = data.cases;
    renderCases(allCases);
    setStatus(allCases.length ? "" : "No cases submitted yet.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

document.getElementById("searchCases").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  renderCases(
    allCases.filter((item) =>
      [item.name, item.complaint, item.ai_summary].some((value) => String(value || "").toLowerCase().includes(query))
    )
  );
});

loadCases();
