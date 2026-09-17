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

function renderSingleReport(item) {
  if (!item) {
    els.reportsList.className = "card-stack empty";
    els.reportsList.textContent = "Upload a report above to see your AI-generated summary here.";
    return;
  }

  els.reportsList.className = "card-stack";

  // Format the full structured AI summary nicely
  const summaryText = item.ai_summary || "Report processed successfully.";
  const formattedSummary = summaryText
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^(PATIENT:|REPORT TYPE:|SUMMARY:|KEY FINDINGS:|IMPORTANT NOTE:)/gm, '<br><strong style="color:var(--primary)">$1</strong>')
    .replace(/^(• .*)/gm, '<span style="display:block; margin-left:12px; margin-top:4px;">$1</span>')
    .replace(/\n/g, "<br>");

  els.reportsList.innerHTML = `
    <article class="case-card" style="border-left: 4px solid var(--primary);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
        <h3 style="margin:0;">📄 ${item.filename}</h3>
        <span class="badge completed">✓ Analyzed</span>
      </div>
      <p style="color: var(--ink-secondary); font-size: 0.85rem; margin-top: 4px;">
        Patient: <strong>${item.patient_name || "Not specified"}</strong> &nbsp;|&nbsp; Uploaded: ${formatDate(item.created_at)}
      </p>
      <div style="margin-top: 14px; background: var(--surface-muted); padding: 16px; border-radius: 10px; font-size: 0.95rem; line-height: 1.7;">
        ${formattedSummary}
      </div>
    </article>
  `;
}

// On page load: show empty state — no previous patient data
renderSingleReport(null);

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

    setStatus("Report analyzed successfully! Your summary is ready below.", "success");
    els.fileInput.value = "";
    els.fileInfo.style.display = "none";
    renderSingleReport(data.report); // Show only THIS patient's result
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.uploadSubmitBtn.disabled = false;
  }
});
