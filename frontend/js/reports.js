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

function getStatusColor(status) {
  if (!status) return "var(--ink-muted)";
  const s = status.toLowerCase();
  if (s === "normal") return "var(--success)";
  if (s === "low") return "var(--accent-blue)";
  if (s === "high" || s === "abnormal") return "var(--warning)";
  if (s === "critical") return "var(--danger)";
  if (s === "borderline") return "var(--warning)";
  return "var(--ink-muted)";
}

function getOverallBadge(status) {
  const map = {
    normal:     { bg: "var(--success-bg)", color: "var(--success)", border: "var(--success-border)", icon: "✅" },
    borderline: { bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)", icon: "⚠️" },
    abnormal:   { bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)", icon: "⚠️" },
    critical:   { bg: "var(--danger-bg)",  color: "var(--danger)",  border: "var(--danger-border)",  icon: "🚨" },
  };
  return map[(status || "").toLowerCase()] || { bg: "var(--bg-subtle)", color: "var(--ink-secondary)", border: "var(--border-subtle)", icon: "📋" };
}

function renderSingleReport(item) {
  if (!item) {
    els.reportsList.className = "card-stack empty";
    els.reportsList.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--ink-secondary);">
      <div style="font-size:2.5rem; margin-bottom:0.75rem;">📄</div>
      <p>Upload a report on the left to see your AI-powered analysis here.</p>
    </div>`;
    return;
  }

  els.reportsList.className = "card-stack";

  // Try to parse structured JSON
  let data = null;
  try {
    data = JSON.parse(item.ai_summary);
  } catch { data = null; }

  if (!data || typeof data !== "object") {
    // Fallback: plain text display
    els.reportsList.innerHTML = `
      <article class="case-card" style="border-left: 4px solid var(--primary);">
        <h3>📄 ${item.filename}</h3>
        <p style="color:var(--ink-secondary); font-size:0.85rem;">Patient: <strong>${item.patient_name || "N/A"}</strong> &nbsp;|&nbsp; ${formatDate(item.created_at)}</p>
        <div style="margin-top:1rem; padding: 1rem; background: var(--bg-subtle); border-radius: 8px; white-space: pre-wrap; font-size:0.9rem;">${item.ai_summary || "No summary available."}</div>
      </article>`;
    return;
  }

  const badge = getOverallBadge(data.overallStatus);
  const flaggedParams = (data.parameters || []).filter(p => p.flag);
  const normalParams  = (data.parameters || []).filter(p => !p.flag);

  const paramRow = (p) => `
    <tr style="border-bottom: 1px solid var(--border-subtle);">
      <td style="padding: 8px 10px; font-weight: ${p.flag ? "600" : "400"}; color: ${p.flag ? getStatusColor(p.status) : "var(--ink-primary)"};">
        ${p.flag ? "⚑ " : ""}${p.name}
      </td>
      <td style="padding: 8px 10px; font-weight: 600; color: ${getStatusColor(p.status)};">${p.value || "—"}</td>
      <td style="padding: 8px 10px; color: var(--ink-secondary); font-size: 0.85rem;">${p.referenceRange || "—"}</td>
      <td style="padding: 8px 10px;">
        <span style="padding: 2px 10px; border-radius: 99px; font-size: 0.78rem; font-weight: 600;
          background: ${getStatusColor(p.status)}22; color: ${getStatusColor(p.status)};">
          ${p.status || "—"}
        </span>
      </td>
    </tr>`;

  els.reportsList.innerHTML = `
    <article class="case-card" style="border-left: 4px solid ${badge.color}; padding: 0; overflow: hidden;">

      <!-- Header -->
      <div style="padding: 1.2rem 1.4rem; background: ${badge.bg}; border-bottom: 1px solid ${badge.border}; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h3 style="margin:0; font-size:1.05rem; color: var(--ink-primary);">📄 ${item.filename}</h3>
          <p style="margin: 4px 0 0; font-size: 0.82rem; color: var(--ink-secondary);">
            ${data.labName ? `🏥 ${data.labName} &nbsp;|&nbsp; ` : ""}
            ${data.reportDate ? `📅 ${data.reportDate} &nbsp;|&nbsp; ` : ""}
            🕐 Uploaded: ${formatDate(item.created_at)}
          </p>
        </div>
        <span style="padding: 5px 14px; border-radius: 99px; font-size: 0.82rem; font-weight: 700; background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.border};">
          ${badge.icon} ${data.overallStatus || "Analyzed"}
        </span>
      </div>

      <div style="padding: 1.4rem;">

        <!-- Meta info -->
        <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.2rem;">
          ${data.reportType ? `<span style="padding: 4px 12px; border-radius: 99px; font-size: 0.8rem; background: var(--primary-light); color: var(--primary); font-weight: 600;">🔬 ${data.reportType}</span>` : ""}
          ${data.patientName ? `<span style="padding: 4px 12px; border-radius: 99px; font-size: 0.8rem; background: var(--bg-subtle); color: var(--ink-secondary);">👤 ${data.patientName}</span>` : ""}
          ${data.doctorName ? `<span style="padding: 4px 12px; border-radius: 99px; font-size: 0.8rem; background: var(--bg-subtle); color: var(--ink-secondary);">👨‍⚕️ Dr. ${data.doctorName}</span>` : ""}
        </div>

        <!-- Summary -->
        <div style="background: var(--bg-subtle); border-radius: 10px; padding: 1rem 1.1rem; margin-bottom: 1.2rem;">
          <p style="margin: 0; font-size: 0.9rem; color: var(--ink-primary); line-height: 1.7;">💬 ${data.summary || "No summary available."}</p>
        </div>

        <!-- Critical Alerts -->
        ${data.criticalAlerts?.length ? `
        <div style="background: var(--danger-bg); border: 1px solid var(--danger-border); border-radius: 10px; padding: 0.9rem 1.1rem; margin-bottom: 1.2rem;">
          <p style="margin: 0 0 6px; font-weight: 700; color: var(--danger); font-size: 0.9rem;">🚨 Critical Alerts</p>
          ${data.criticalAlerts.map(a => `<p style="margin: 3px 0; font-size: 0.88rem; color: var(--danger);">• ${a}</p>`).join("")}
        </div>` : ""}

        <!-- Parameters Table -->
        ${data.parameters?.length ? `
        <div style="margin-bottom: 1.2rem;">
          <p style="font-weight: 700; font-size: 0.88rem; color: var(--ink-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
            🧪 Test Parameters (${flaggedParams.length} flagged / ${data.parameters.length} total)
          </p>
          <div style="overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-subtle);">
            <table style="width:100%; border-collapse: collapse; font-size: 0.88rem;">
              <thead>
                <tr style="background: var(--bg-subtle);">
                  <th style="padding: 8px 10px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">Parameter</th>
                  <th style="padding: 8px 10px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Value</th>
                  <th style="padding: 8px 10px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Ref. Range</th>
                  <th style="padding: 8px 10px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${flaggedParams.map(paramRow).join("")}
                ${normalParams.map(paramRow).join("")}
              </tbody>
            </table>
          </div>
        </div>` : ""}

        <!-- Recommendations -->
        ${data.recommendations?.length ? `
        <div style="background: var(--success-bg); border: 1px solid var(--success-border); border-radius: 10px; padding: 0.9rem 1.1rem; margin-bottom: 1.2rem;">
          <p style="margin: 0 0 6px; font-weight: 700; color: var(--success); font-size: 0.9rem;">💡 Recommendations</p>
          ${data.recommendations.map(r => `<p style="margin: 3px 0; font-size: 0.88rem; color: var(--ink-primary);">• ${r}</p>`).join("")}
        </div>` : ""}

        <!-- Disclaimer -->
        <p style="font-size: 0.78rem; color: var(--ink-muted); margin: 0; padding-top: 0.5rem; border-top: 1px solid var(--border-subtle);">
          ⚠️ ${data.disclaimer || "This AI-generated summary is for informational purposes only. Always consult your doctor."}
        </p>

      </div>
    </article>`;
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
