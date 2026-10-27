const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const protect = require("./middleware/authMiddleware");
const authorize = require("./middleware/authorize");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const taskRoutes = require("./routes/taskRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "DevTrack Pro API is running",
    status: "success",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    service: "DevTrack Pro Backend",
  });
});

// Authentication
app.use("/api/auth", authRoutes);

app.get("/api/auth/me", protect, (req, res) => {
  res.json({
    message: "Authentication successful",
    user: req.user,
  });
});

// Projects and tasks
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);

// Admin test route
app.get(
  "/api/admin/test",
  protect,
  authorize("Admin"),
  (req, res) => {
    res.json({
      message: "Admin access granted",
    });
  }
);

// Start server after connecting to MongoDB
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`DevTrack Pro server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();