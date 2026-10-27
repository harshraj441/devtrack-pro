const express = require("express");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/authorize");

const router = express.Router();

// Get users for task assignment
router.get("/", protect, authorize("Admin", "Manager"), async (req, res) => {
  try {
    const users = await User.find({})
      .select("name email role")
      .sort({ name: 1 });

    return res.status(200).json({
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get users error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch users",
    });
  }
});

module.exports = router;