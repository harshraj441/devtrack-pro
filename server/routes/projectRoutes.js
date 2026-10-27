const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/project");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/authorize");

const router = express.Router();

// Create a new project
router.post(
  "/",
  protect,
  authorize("Admin", "Manager"),
  async (req, res) => {
    try {
      const {
        name,
        description,
        priority,
        startDate,
        dueDate,
        members = [],
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          message: "Project name is required",
        });
      }

      if (!Array.isArray(members)) {
        return res.status(400).json({
          message: "Members must be an array",
        });
      }

      const validIds = members.every((id) =>
        mongoose.isValidObjectId(id)
      );

      if (!validIds) {
        return res.status(400).json({
          message: "Invalid member ID",
        });
      }

      const uniqueMembers = [...new Set(members.map(String))];
      const users = await User.find({
        _id: { $in: uniqueMembers },
      }).select("_id");

      if (users.length !== uniqueMembers.length) {
        return res.status(400).json({
          message: "One or more members do not exist",
        });
      }

      const project = await Project.create({
        name: name.trim(),
        description,
        priority,
        startDate,
        dueDate,
        members: uniqueMembers,
        manager: req.user.id,
      });

      return res.status(201).json({
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      console.error("Create project error:", error.message);
      return res.status(500).json({
        message: "Unable to create project",
      });
    }
  }
);

// Add an employee to an existing project
router.post(
  "/:id/members",
  protect,
  authorize("Admin", "Manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid project ID",
        });
      }

      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({
          message: "Valid userId is required",
        });
      }

      const project = await Project.findById(id);

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      // Managers can modify only their own projects.
      if (
        req.user.role === "Manager" &&
        String(project.manager) !== String(req.user.id)
      ) {
        return res.status(403).json({
          message: "You can only manage your own projects",
        });
      }

      const user = await User.findById(userId).select(
        "name email role"
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      if (String(project.manager) === String(userId)) {
        return res.status(400).json({
          message: "Project manager is already assigned",
        });
      }

      if (project.members.some(
        (memberId) => String(memberId) === String(userId)
      )) {
        return res.status(409).json({
          message: "User is already a project member",
        });
      }

      project.members.push(userId);
      await project.save();

      await project.populate("manager", "name email");
      await project.populate("members", "name email");

      return res.status(200).json({
        message: "Project member added successfully",
        project,
      });
    } catch (error) {
      console.error("Add project member error:", error.message);
      return res.status(500).json({
        message: "Unable to add project member",
      });
    }
  }
);
// Edit project
router.put(
  "/:id",
  protect,
  authorize("Admin", "Manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, status, priority, dueDate } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await Project.findById(id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (
        req.user.role === "Manager" &&
        String(project.manager) !== String(req.user.id)
      ) {
        return res.status(403).json({
          message: "You can only edit your own projects",
        });
      }

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            message: "Project name is required",
          });
        }
        project.name = name.trim();
      }

      if (description !== undefined) {
        project.description = description;
      }

      if (status !== undefined) {
        if (!["Planning", "Active", "On Hold", "Completed"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        project.status = status;
      }

      if (priority !== undefined) {
        if (!["Low", "Medium", "High"].includes(priority)) {
          return res.status(400).json({ message: "Invalid priority" });
        }
        project.priority = priority;
      }

      if (dueDate !== undefined) {
        project.dueDate = dueDate || null;
      }

      await project.save();

      const updatedProject = await Project.findById(id)
        .populate("manager", "name email")
        .populate("members", "name email");

      return res.json({
        message: "Project updated successfully",
        project: updatedProject,
      });
    } catch (error) {
      console.error("Update project error:", error.message);
      return res.status(500).json({
        message: "Unable to update project",
      });
    }
  }
);

// Delete project
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await Project.findById(id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (
        req.user.role === "Manager" &&
        String(project.manager) !== String(req.user.id)
      ) {
        return res.status(403).json({
          message: "You can only delete your own projects",
        });
      }

      await Project.findByIdAndDelete(id);

      return res.json({
        message: "Project deleted successfully",
      });
    } catch (error) {
      console.error("Delete project error:", error.message);
      return res.status(500).json({
        message: "Unable to delete project",
      });
    }
  }
);
// Get projects visible to the current user
router.get("/", protect, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "Manager") {
      filter = {
        $or: [
          { manager: req.user.id },
          { members: req.user.id },
        ],
      };
    } else if (req.user.role !== "Admin") {
      filter = { members: req.user.id };
    }

    const projects = await Project.find(filter)
      .populate("manager", "name email")
      .populate("members", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: projects.length,
      projects,
    });
  } catch (error) {
    console.error("Get projects error:", error.message);
    return res.status(500).json({
      message: "Unable to fetch projects",
    });
  }
});

module.exports = router;