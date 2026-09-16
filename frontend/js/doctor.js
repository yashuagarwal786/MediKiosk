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
          <td><strong>${item.name}</strong></td>
          <td>${item.age} yrs <span style="color: var(--ink-muted); font-size: 0.85em;">(${item.gender || "—"})</span></td>
          <td>${item.complaint}</td>
          <td style="color: var(--ink-secondary); font-size: 0.88rem;">${formatDate(item.created_at)}</td>
          <td><span class="badge ${item.status === "Completed" ? "completed" : ""}">${item.status}</span></td>
          <td><a class="button ghost" style="min-height: 36px; padding: 6px 14px;" href="/case/${item.id}">View Case</a></td>
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
