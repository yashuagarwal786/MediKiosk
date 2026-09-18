const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const dotenv = require("dotenv");
const { initDatabase } = require("./database");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

const app = express();
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);

// Make io available to routes
app.set("io", io);

const port = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, "..", "frontend");
const uploadPath = process.env.VERCEL
  ? path.join(os.tmpdir(), "medikiosk_uploads")
  : path.join(__dirname, "..", "data", "uploads");

try {
  fs.mkdirSync(uploadPath, { recursive: true });
} catch (error) {
  console.warn("Could not create upload directory:", error.message);
}

const databaseReady = initDatabase().catch((error) => {
  console.error("Database initialization failed:", error);
  process.exit(1);
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendPath));

app.use(async (req, res, next) => {
  try {
    await databaseReady;
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", require("./routes/ai"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/cases", require("./routes/cases"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/reminders", require("./routes/reminders"));

app.get("/", (req, res) => res.sendFile(path.join(frontendPath, "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(frontendPath, "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(frontendPath, "register.html")));
app.get("/patient", (req, res) => res.sendFile(path.join(frontendPath, "patient.html")));
app.get("/doctor", (req, res) => res.sendFile(path.join(frontendPath, "doctor.html")));
app.get("/reports", (req, res) => res.sendFile(path.join(frontendPath, "reports.html")));
app.get("/reminders", (req, res) => res.sendFile(path.join(frontendPath, "reminders.html")));
app.get("/case/:id", (req, res) => res.sendFile(path.join(frontendPath, "case.html")));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Server error." });
});

if (require.main === module) {
  databaseReady
    .then(() => {
    server.listen(port, () => {
      console.log(`MediKiosk is running at http://localhost:${port}`);
    });
    })
    .catch((error) => {
    console.error("Failed to initialize SQLite database:", error);
    process.exit(1);
    });
}

module.exports = app;
