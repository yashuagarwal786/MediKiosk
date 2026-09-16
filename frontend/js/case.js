const id = window.location.pathname.split("/").filter(Boolean).pop();
const els = {
  title: document.getElementById("caseTitle"),
  details: document.getElementById("detailsList"),
  summary: document.getElementById("summaryText"),
  status: document.getElementById("caseStatus"),
  statusSelect: document.getElementById("statusSelect"),
  similar: document.getElementById("similarCases"),
  illustration: document.getElementById("illustrationBox")
};
let currentCase = null;

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status-line ${type}`.trim();
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function renderCase(item) {
  currentCase = item;
  els.title.textContent = `${item.name} - ${item.complaint}`;
  els.statusSelect.value = item.status;
  els.summary.textContent = item.ai_summary || "No AI summary available.";
  els.details.innerHTML = `
    <div><dt>Name</dt><dd>${item.name}</dd></div>
    <div><dt>Age</dt><dd>${item.age}</dd></div>
    <div><dt>Gender</dt><dd>${item.gender}</dd></div>
    <div><dt>Complaint</dt><dd>${item.complaint}</dd></div>
    <div><dt>Symptoms</dt><dd>${item.symptoms || "Not provided"}</dd></div>
    <div><dt>History</dt><dd>${(item.history || "Not provided").replace(/\n/g, "<br>")}</dd></div>
    <div><dt>Date</dt><dd>${formatDate(item.created_at)}</dd></div>
    <div><dt>Status</dt><dd>${item.status}</dd></div>
  `;
}

async function loadCase() {
  setStatus("Loading case...", "loading");
  try {
    const response = await fetch(`/api/cases/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load case.");
    renderCase(data.case);
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

els.statusSelect.addEventListener("change", async () => {
  setStatus("Updating status...", "loading");
  try {
    const response = await fetch(`/api/cases/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: els.statusSelect.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to update status.");
    renderCase(data.case);
    setStatus("Status updated.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("findSimilar").addEventListener("click", async () => {
  setStatus("Finding similar cases...", "loading");
  try {
    const response = await fetch("/api/similar-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: Number(id) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to find similar cases.");
    if (!data.similarCases.length) {
      els.similar.className = "card-stack empty";
      els.similar.textContent = "No similar previous cases found.";
    } else {
      els.similar.className = "card-stack";
      els.similar.innerHTML = data.similarCases
        .map(
          (item) => `
            <article class="case-card">
              <h3>${item.name}</h3>
              <p><strong>Complaint:</strong> ${item.complaint}</p>
              <p><strong>Summary:</strong> ${item.ai_summary || "No summary available."}</p>
              <p><strong>Similarity:</strong> ${(item.similarity * 100).toFixed(1)}% reference match</p>
            </article>
          `
        )
        .join("");
    }
    setStatus("Similar case search complete.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("generateIllustration").addEventListener("click", async () => {
  if (!currentCase) return;
  setStatus("Generating illustration...", "loading");
  try {
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaint: currentCase.complaint })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to generate illustration.");
    els.illustration.className = "illustration";
    els.illustration.innerHTML = `<img src="${data.imageUrl}" alt="Educational illustration for ${currentCase.complaint}">`;
    setStatus("Illustration generated.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

loadCase();
