const els = {
  form: document.getElementById("uploadForm"),
  fileInput: document.getElementById("reportFile"),
  browseBtn: document.getElementById("browseBtn"),
  fileInfo: document.getElementById("fileInfo"),
  patientName: document.getElementById("patientName"),
  uploadSubmitBtn: document.getElementById("uploadSubmitBtn"),
  uploadStatus: document.getElementById("uploadStatus"),
  reportsList: document.getElementById("reportsList")
};

function setStatus(message, type = "") {
  els.uploadStatus.textContent = message;
  els.uploadStatus.className = `status-line ${type}`.trim();
}

function formatDate(value) {
  try {
    let str = String(value).trim();
    if (!str.includes("Z") && !str.includes("+") && !str.includes("T")) str = str.replace(" ", "T") + "Z";
    return new Date(str).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
  } catch {
    return String(value);
  }
}

els.browseBtn.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files.length > 0) {
    const file = els.fileInput.files[0];
    els.fileInfo.style.display = "block";
    els.fileInfo.textContent = `Selected File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  } else {
    els.fileInfo.style.display = "none";
  }
});

function renderReports(reports) {
  if (!reports || !reports.length) {
    els.reportsList.className = "card-stack empty";
    els.reportsList.textContent = "No medical reports uploaded yet. Upload a report above to get AI summaries.";
    return;
  }

  els.reportsList.className = "card-stack";
  els.reportsList.innerHTML = reports
    .map(
      (item) => `
        <article class="case-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h3>📄 ${item.filename}</h3>
            <span class="badge completed">${item.patient_name || "Patient"}</span>
          </div>
          <p style="color: var(--ink-secondary); font-size: 0.85rem; margin-top: 4px;">Uploaded: ${formatDate(item.created_at)}</p>
          <div style="margin-top: 10px; background: var(--surface-muted); padding: 12px; border-radius: 8px;">
            <p><strong>AI Summary:</strong> ${item.ai_summary || "Report processed successfully."}</p>
          </div>
          ${
            item.key_findings
              ? `<div style="margin-top: 8px; font-size: 0.9rem;"><strong>Key Medical Metrics:</strong><pre style="white-space: pre-wrap; font-family: inherit; margin-top: 4px; color: var(--ink-secondary);">${item.key_findings}</pre></div>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

async function loadReports() {
  try {
    const response = await fetch("/api/reports");
    const data = await response.json();
    renderReports(data.reports || []);
  } catch (error) {
    els.reportsList.textContent = "Unable to load reports.";
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!els.fileInput.files.length) {
    setStatus("Please select a file first.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("report", els.fileInput.files[0]);
  formData.append("patient_name", els.patientName.value);

  setStatus("Analyzing report with AI... Extracting diagnostic findings...", "loading");
  els.uploadSubmitBtn.disabled = true;

  try {
    const response = await fetch("/api/reports/upload", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Report upload failed.");

    setStatus("Report uploaded & analyzed successfully!", "success");
    els.fileInput.value = "";
    els.fileInfo.style.display = "none";
    loadReports();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.uploadSubmitBtn.disabled = false;
  }
});

loadReports();
