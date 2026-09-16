const table = document.getElementById("casesTable");
const statusEl = document.getElementById("doctorStatus");
let allCases = [];

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${type}`.trim();
}

function parseUtcDate(value) {
  if (!value) return new Date();
  if (typeof value === "number") return new Date(value);
  let str = String(value).trim();
  if (!str.includes("Z") && !str.includes("+") && !str.includes("T")) {
    str = str.replace(" ", "T") + "Z";
  }
  return new Date(str);
}

function formatDate(value) {
  try {
    const d = parseUtcDate(value);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }) + " IST";
  } catch {
    return String(value);
  }
}

function updateStats(cases) {
  const todayIst = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  document.getElementById("totalCases").textContent = cases.length;
  document.getElementById("todayCases").textContent = cases.filter((item) => {
    try {
      const itemIst = parseUtcDate(item.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      return itemIst === todayIst;
    } catch {
      return false;
    }
  }).length;
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
    allCases = data.cases || [];

    if (allCases.length > 0) {
      try { localStorage.setItem("medikiosk_cases", JSON.stringify(allCases)); } catch {}
    } else {
      const cached = localStorage.getItem("medikiosk_cases");
      if (cached) {
        try { allCases = JSON.parse(cached); } catch {}
      }
    }

    renderCases(allCases);
    setStatus(allCases.length ? "" : "No cases submitted yet.");
  } catch (error) {
    const cached = localStorage.getItem("medikiosk_cases");
    if (cached) {
      try {
        allCases = JSON.parse(cached);
        renderCases(allCases);
        setStatus("Loaded from offline cache.", "success");
        return;
      } catch {}
    }
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
