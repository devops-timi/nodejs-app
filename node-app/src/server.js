require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || "NodeJS App";

// Serve static files
app.use(express.static(path.join(__dirname, "views")));

// Home route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// API route
app.get("/api/info", (req, res) => {
  res.json({
    app: APP_NAME,
    status: "running",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} started on port ${PORT}`);
});
