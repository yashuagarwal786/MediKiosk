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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseParameterLine(line) {
  let clean = line.replace(/\t/g, "    ").trim();
  if (!/[0-9]/.test(clean)) return null;

  const ignored = /^(?:date|time|phone|mobile|report|test|result|units?|reference|range|patient|age|gender|doctor|lab|address|barcode|sample)(?:\s|:|$)/i;
  if (ignored.test(clean)) return null;

  const statusMatch = clean.match(/\((Normal|Abnormal|High|Low|Critical|Borderline|H|L|N)\)\s*$/i);
  const status = statusMatch ? statusMatch[1] : "";
  let body = statusMatch ? clean.slice(0, statusMatch.index).trim() : clean;
  body = body.replace(/\s*\*\s*$/, "");

  const columnMatch = body.match(/^([^\d]+?)\s{2,}(.+)$/);
  const source = columnMatch?.[2] || body;
  const name = columnMatch?.[1]?.trim().replace(/\s*[:\-]\s*$/, "") || body;
  const numericCount = (source.match(/\d/g) || []).length;
  if (!name || name.length < 2 || name.length > 100 || numericCount < 1) return null;

  const valueMatch = source.match(/^(\d[\d.,]*\s*(?:[A-Za-z/%]{0,15}))\s*(.*)$/);
  if (!valueMatch) return null;

  const value = valueMatch[1].trim();
  const referenceRange = valueMatch[2]?.trim() || "";
  if (!/[0-9]/.test(value)) return null;

  return {
    name: name.replace(/\s+/g, " "),
    value,
    referenceRange,
    status
  };
}

function parseExtractedReport(rawText) {
  const metadataPatterns = [
    { key: "patientName", label: "Patient Name", pattern: /^(?:patient(?:\s+name)?|name)\s*[:\-]?\s*(.+)$/i, valid: value => !/test|parameter|lab/i.test(value) },
    { key: "ageGender", label: "Age / Gender", pattern: /^(?:age(?:\s*\/\s*gender)?|age and gender)\s*[:\-]?\s*(.+)$/i },
    { key: "reportType", label: "Report Type", pattern: /^(?:report(?:\s+type)?|test profile|investigation)\s*[:\-]?\s*(.+)$/i },
    { key: "labName", label: "Diagnostic Lab", pattern: /^(?:lab(?:oratory)?(?:\s+name)?|diagnostic lab)\s*[:\-]?\s*(.+)$/i },
    { key: "reportDate", label: "Report Date", pattern: /^(?:report\s+date|date)\s*[:\-]?\s*(.+)$/i },
    { key: "doctorName", label: "Ref. Doctor", pattern: /^(?:ref(?:erence)?\s+(?:doctor|physician)|doctor(?:\s+name)?|consultant)\s*[:\-]?\s*(.+)$/i }
  ];

  const lines = String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const metadata = {};
  const parameters = [];
  const notes = [];

  for (const line of lines) {
    let matchedMetadata = false;
    for (const field of metadataPatterns) {
      const match = line.match(field.pattern);
      if (!match) continue;
      const value = match[1].trim();
      if (!value || (field.valid && !field.valid(value))) continue;
      metadata[field.key] = value;
      metadata[`${field.key}Label`] = field.label;
      matchedMetadata = true;
      break;
    }
    if (matchedMetadata) continue;

    const parameter = parseParameterLine(line);
    if (parameter) {
      parameters.push(parameter);
      continue;
    }

    if (!/^(?:medical report|report text|extracted text|patient details|test details)$/i.test(line)) {
      notes.push(line);
    }
  }

  return { metadata, parameters, notes };
}

function formatExtractedReport(rawText) {
  const parsed = parseExtractedReport(rawText);
  const metadata = Object.entries(parsed.metadata)
    .filter(([key, value]) => !key.endsWith("Label") && value)
    .map(([key, value]) => ({
      label: parsed.metadata[`${key}Label`] || key.replace(/([A-Z])/g, " $1").trim(),
      value
    }));

  const metadataHtml = metadata.length ? `
    <div class="extracted-report__meta">
      ${metadata.map(item => `
        <div class="extracted-report__meta-item">
          <span class="extracted-report__meta-label">${escapeHtml(item.label)}</span>
          <strong class="extracted-report__meta-value">${escapeHtml(item.value)}</strong>
        </div>`).join("")}
    </div>` : "";

  const parameterHtml = parsed.parameters.length ? `
    <div class="extracted-report__table-wrap">
      <table class="extracted-report__table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Observed Value</th>
            <th>Reference Range</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${parsed.parameters.map(parameter => `
            <tr>
              <td>${escapeHtml(parameter.name)}</td>
              <td><strong>${escapeHtml(parameter.value)}</strong></td>
              <td>${escapeHtml(parameter.referenceRange || "—")}</td>
              <td>${parameter.status ? `<span class="extracted-report__status extracted-report__status--${escapeHtml(parameter.status.toLowerCase())}">${escapeHtml(parameter.status)}</span>` : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  const notesHtml = parsed.notes.length ? `
    <div class="extracted-report__notes">
      <div class="extracted-report__subsection-title">Additional Extracted Details</div>
      ${parsed.notes.slice(0, 30).map(line => `<div class="extracted-report__note">${escapeHtml(line)}</div>`).join("")}
    </div>` : "";

  return `
    <section class="extracted-report">
      <div class="extracted-report__header">
        <div>
          <span class="extracted-report__icon">📝</span>
          <div>
            <div class="extracted-report__title">Extracted Report Text</div>
            <p class="extracted-report__subtitle">OCR content organized into report details and test values</p>
          </div>
        </div>
        <span class="extracted-report__count">${parsed.parameters.length} detected values</span>
      </div>
      ${metadataHtml}
      ${parameterHtml}
      ${notesHtml}
      <details class="extracted-report__raw">
        <summary>View raw OCR text</summary>
        <pre>${escapeHtml(rawText || "No OCR text was returned.")}</pre>
      </details>
    </section>`;
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
    const textToShow = item.ai_summary || item.key_findings || item.extracted_text || "Medical report processed. View findings above.";
    els.reportsList.innerHTML = `
      <article class="case-card" style="border-left: 4px solid var(--primary); padding: 1.4rem;">
        <h3 style="margin:0 0 4px;">📄 ${item.filename}</h3>
        <p style="color:var(--ink-secondary); font-size:0.85rem; margin:0 0 1rem;">Patient: <strong>${item.patient_name || "N/A"}</strong> &nbsp;|&nbsp; Uploaded: ${formatDate(item.created_at)}</p>
        <div style="padding: 1rem; background: var(--bg-subtle); border-radius: 8px; white-space: pre-wrap; font-size:0.9rem; line-height: 1.6; color: var(--ink-primary);">${textToShow}</div>
      </article>`;
    return;
  }

  const badge = getOverallBadge(data.overallStatus);
  const extractedText = item.extracted_text || data.extractedText || "";
  const flaggedParams = (data.parameters || []).filter(p => p.flag);
  const normalParams  = (data.parameters || []).filter(p => !p.flag);

  const paramRow = (p) => `
    <tr style="border-bottom: 1px solid var(--border-subtle);">
      <td style="padding: 10px 12px; font-weight: ${p.flag ? "700" : "500"}; color: ${p.flag ? getStatusColor(p.status) : "var(--ink-primary)"};">
        ${p.flag ? "⚠️ " : ""}${p.name}
      </td>
      <td style="padding: 10px 12px; font-weight: 700; color: ${getStatusColor(p.status)};">${p.value || "—"}</td>
      <td style="padding: 10px 12px; color: var(--ink-secondary); font-size: 0.85rem;">${p.referenceRange || "—"}</td>
      <td style="padding: 10px 12px;">
        <span style="padding: 3px 12px; border-radius: 99px; font-size: 0.78rem; font-weight: 700;
          background: ${getStatusColor(p.status)}20; color: ${getStatusColor(p.status)}; border: 1px solid ${getStatusColor(p.status)}40;">
          ${p.status || "—"}
        </span>
      </td>
    </tr>`;

  // Process summary (if string or array of points)
  let summaryHtml = "";
  if (Array.isArray(data.summaryPoints) && data.summaryPoints.length) {
    summaryHtml = data.summaryPoints.map(pt => `<div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:6px;"><span style="color:var(--primary); font-weight:bold;">•</span><span>${pt}</span></div>`).join("");
  } else if (data.summary) {
    const lines = String(data.summary).split(/\n|(?<=\.)\s+/).filter(Boolean);
    summaryHtml = lines.map(line => `<div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:6px;"><span style="color:var(--primary); font-weight:bold;">•</span><span>${line.trim()}</span></div>`).join("");
  }

  els.reportsList.innerHTML = `
    <article class="case-card" style="border-left: 5px solid ${badge.color}; padding: 0; overflow: hidden; box-shadow: var(--shadow-md);">

      <!-- Card Top Banner -->
      <div style="padding: 1.2rem 1.4rem; background: ${badge.bg}; border-bottom: 1px solid ${badge.border}; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.8rem;">
        <div>
          <h3 style="margin:0; font-size:1.1rem; font-weight:700; color: var(--ink-primary);">📄 ${item.filename}</h3>
          <p style="margin: 4px 0 0; font-size: 0.82rem; color: var(--ink-secondary);">
            Uploaded: ${formatDate(item.created_at)}
          </p>
        </div>
        <span style="padding: 6px 16px; border-radius: 99px; font-size: 0.85rem; font-weight: 700; background: #ffffff; color: ${badge.color}; border: 1.5px solid ${badge.border}; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
          ${badge.icon} ${data.overallStatus || "Analyzed"}
        </span>
      </div>

      <div style="padding: 1.4rem;">

        <!-- Structured Entities (Line-by-Line Highlighted List) -->
        <div style="background: var(--bg-base); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1.4rem; display: flex; flex-direction: column; gap: 0.55rem;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Report Metadata</div>
          
          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>👤</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Patient Name:</strong> 
            <span style="font-weight: 600; color: var(--ink-primary);">${data.patientName || item.patient_name || "Not specified"}</span>
          </div>

          ${data.ageGender ? `
          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>🎂</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Age / Gender:</strong> 
            <span style="font-weight: 600; color: var(--ink-primary);">${data.ageGender}</span>
          </div>` : ""}

          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>🔬</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Report Type:</strong> 
            <span style="font-weight: 600; color: var(--primary); background: var(--primary-light); padding: 2px 10px; border-radius: 6px;">${data.reportType || "Diagnostic Report"}</span>
          </div>

          ${data.labName ? `
          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>🏥</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Diagnostic Lab:</strong> 
            <span style="font-weight: 600; color: var(--ink-primary);">${data.labName}</span>
          </div>` : ""}

          ${data.reportDate ? `
          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>📅</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Report Date:</strong> 
            <span style="font-weight: 600; color: var(--ink-primary);">${data.reportDate}</span>
          </div>` : ""}

          ${data.doctorName ? `
          <div style="font-size: 0.92rem; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
            <span>👨‍⚕️</span> <strong style="color:var(--ink-secondary); min-width: 110px;">Ref. Doctor:</strong> 
            <span style="font-weight: 600; color: var(--ink-primary);">${data.doctorName}</span>
          </div>` : ""}
        </div>

        ${extractedText ? formatExtractedReport(extractedText) : ""}

        <!-- Clinical Summary Bullet Points (Each on a new line) -->
        ${summaryHtml ? `
        <div style="background: var(--bg-subtle); border-radius: 12px; padding: 1.1rem 1.3rem; margin-bottom: 1.4rem;">
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--primary); margin-bottom: 8px; display:flex; align-items:center; gap:6px;">
            <span>💬</span> <span>Executive Clinical Summary</span>
          </div>
          <div style="font-size: 0.92rem; color: var(--ink-primary); line-height: 1.6;">
            ${summaryHtml}
          </div>
        </div>` : ""}

        <!-- Critical Alerts -->
        ${data.criticalAlerts?.length ? `
        <div style="background: var(--danger-bg); border: 1.5px solid var(--danger-border); border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1.4rem;">
          <div style="font-weight: 700; color: var(--danger); font-size: 0.92rem; margin-bottom: 8px; display:flex; align-items:center; gap:6px;">
            <span>🚨</span> <span>Critical / Flagged Findings</span>
          </div>
          ${data.criticalAlerts.map(a => `<div style="display:flex; align-items:flex-start; gap:8px; font-size: 0.9rem; color: var(--danger); margin-bottom: 4px;"><span>•</span><span>${a}</span></div>`).join("")}
        </div>` : ""}

        <!-- Parameters Table (Each parameter on a new line) -->
        ${data.parameters?.length ? `
        <div style="margin-bottom: 1.4rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
            <span style="font-weight: 700; font-size: 0.88rem; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: 0.04em;">
              🧪 Lab Test Parameters (${data.parameters.length} Total)
            </span>
            ${flaggedParams.length ? `<span style="font-size:0.8rem; font-weight:700; color:var(--warning); background:var(--warning-bg); padding:2px 10px; border-radius:99px;">⚠️ ${flaggedParams.length} Out of Range</span>` : `<span style="font-size:0.8rem; font-weight:700; color:var(--success); background:var(--success-bg); padding:2px 10px; border-radius:99px;">✅ All Normal</span>`}
          </div>
          <div style="overflow-x: auto; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-surface);">
            <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
              <thead>
                <tr style="background: var(--bg-subtle); border-bottom: 1.5px solid var(--border-subtle);">
                  <th style="padding: 10px 12px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">Parameter</th>
                  <th style="padding: 10px 12px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Observed Value</th>
                  <th style="padding: 10px 12px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Biological Ref. Range</th>
                  <th style="padding: 10px 12px; text-align:left; color: var(--ink-secondary); font-size:0.78rem; text-transform:uppercase;">Status</th>
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
        <div style="background: var(--success-bg); border: 1px solid var(--success-border); border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1.4rem;">
          <div style="font-weight: 700; color: var(--success); font-size: 0.92rem; margin-bottom: 8px; display:flex; align-items:center; gap:6px;">
            <span>💡</span> <span>Recommendations & Guidance</span>
          </div>
          ${data.recommendations.map(r => `<div style="display:flex; align-items:flex-start; gap:8px; font-size: 0.9rem; color: var(--ink-primary); margin-bottom: 4px;"><span>•</span><span>${r}</span></div>`).join("")}
        </div>` : ""}

        <!-- Medical Disclaimer -->
        <div style="font-size: 0.78rem; color: var(--ink-muted); margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); display:flex; align-items:center; gap:6px;">
          <span>⚠️</span> <span>${data.disclaimer || "This AI-generated summary is for informational purposes only. Always consult your doctor for diagnosis and treatment."}</span>
        </div>

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
