const path = require("path");
const fs = require("fs");
const express = require("express");
const dotenv = require("dotenv");
const { initDatabase } = require("./database");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, "..", "frontend");
const uploadPath = path.join(__dirname, "..", "data", "uploads");

fs.mkdirSync(uploadPath, { recursive: true });

const databaseReady = initDatabase();

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
app.use("/api/cases", require("./routes/cases"));

app.get("/", (req, res) => res.sendFile(path.join(frontendPath, "index.html")));
app.get("/patient", (req, res) => res.sendFile(path.join(frontendPath, "patient.html")));
app.get("/doctor", (req, res) => res.sendFile(path.join(frontendPath, "doctor.html")));
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
    app.listen(port, () => {
      console.log(`MediKiosk is running at http://localhost:${port}`);
    });
    })
    .catch((error) => {
    console.error("Failed to initialize SQLite database:", error);
    process.exit(1);
    });
}

module.exports = app;
