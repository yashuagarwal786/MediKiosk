const els = {
  form: document.getElementById("reminderForm"),
  patientName: document.getElementById("patientName"),
  medicineName: document.getElementById("medicineName"),
  dosage: document.getElementById("dosage"),
  time: document.getElementById("time"),
  frequency: document.getElementById("frequency"),
  status: document.getElementById("reminderStatus"),
  list: document.getElementById("remindersList"),
  countBadge: document.getElementById("reminderCount")
};

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status-line ${type}`.trim();
}

function renderReminders(reminders) {
  const activeCount = reminders.filter((r) => r.status === "Active").length;
  els.countBadge.textContent = `${activeCount} Active Doses`;

  if (!reminders || !reminders.length) {
    els.list.className = "card-stack empty";
    els.list.textContent = "No medicine reminders scheduled. Add your first medicine dose on the left.";
    return;
  }

  els.list.className = "card-stack";
  els.list.innerHTML = reminders
    .map(
      (item) => `
        <article class="case-card ${item.status === "Completed" ? "completed-card" : ""}" style="border-left: 4px solid ${item.status === "Completed" ? "var(--success)" : "var(--primary)"};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="${item.status === "Completed" ? "text-decoration: line-through; opacity: 0.7;" : ""}">💊 ${item.medicine_name}</h3>
            <span class="badge ${item.status === "Completed" ? "completed" : ""}">${item.status}</span>
          </div>
          <p style="margin-top: 6px; font-weight: 600;">Dosage: <span style="color: var(--primary);">${item.dosage}</span> &bull; Time: <span style="color: var(--primary);">${item.time}</span></p>
          <p style="color: var(--ink-secondary); font-size: 0.85rem; margin-top: 2px;">Instruction: ${item.frequency} &bull; Patient: ${item.patient_name || "Patient"}</p>

          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button type="button" class="button ${item.status === "Completed" ? "secondary" : "primary"}" style="min-height: 36px; padding: 4px 12px; font-size: 0.85rem;" onclick="toggleReminder(${item.id})">
              ${item.status === "Completed" ? "Mark Active" : "✓ Mark Taken"}
            </button>
            <button type="button" class="button ghost" style="min-height: 36px; padding: 4px 12px; font-size: 0.85rem; color: #ef4444;" onclick="deleteReminder(${item.id})">
              🗑 Delete
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadReminders() {
  try {
    const response = await fetch("/api/reminders");
    const data = await response.json();
    renderReminders(data.reminders || []);
  } catch (error) {
    els.list.textContent = "Unable to load medicine reminders.";
  }
}

window.toggleReminder = async function (id) {
  try {
    const response = await fetch(`/api/reminders/${id}/toggle`, { method: "PATCH" });
    if (!response.ok) throw new Error("Unable to update reminder.");
    loadReminders();
  } catch (error) {
    setStatus(error.message, "error");
  }
};

window.deleteReminder = async function (id) {
  if (!confirm("Delete this medicine reminder?")) return;
  try {
    const response = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to delete reminder.");
    loadReminders();
  } catch (error) {
    setStatus(error.message, "error");
  }
};

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Adding reminder...", "loading");

  try {
    const response = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_name: els.patientName.value,
        medicine_name: els.medicineName.value,
        dosage: els.dosage.value,
        time: els.time.value,
        frequency: els.frequency.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to add reminder.");

    setStatus("Medicine reminder added!", "success");
    els.medicineName.value = "";
    els.dosage.value = "";
    els.time.value = "";
    loadReminders();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

loadReminders();
