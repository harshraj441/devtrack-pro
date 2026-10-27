const express = require("express");
const mongoose = require("mongoose");
const Task = require("../models/Task");
const Project = require("../models/project");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Create a task inside a project
router.post("/", protect, async (req, res) => {
  try {
    const {
      title,
      description,
      projectId,
      assignedTo,
      priority,
      dueDate,
      type,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Task title is required",
      });
    }

    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({
        message: "Valid projectId is required",
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "Manager" &&
      project.manager.toString() === req.user.id;

    const isMember = project.members.some(
      (memberId) => memberId.toString() === req.user.id
    );

    if (!isAdmin && !isManager) {
      return res.status(403).json({
        message: "Only Admin or the project's Manager can create tasks",
      });
    }

    let assignedUserId = null;

    if (assignedTo) {
      if (!mongoose.isValidObjectId(assignedTo)) {
        return res.status(400).json({
          message: "Invalid assignedTo user ID",
        });
      }

      const assignedUser = await User.findById(assignedTo).select("_id");

      if (!assignedUser) {
        return res.status(404).json({
          message: "Assigned user not found",
        });
      }

      const isAssignedMember = project.members.some(
        (memberId) => memberId.toString() === assignedTo
      );

      if (
        assignedTo !== project.manager.toString() &&
        !isAssignedMember
      ) {
        return res.status(400).json({
          message: "Assignee must belong to this project",
        });
      }

      assignedUserId = assignedUser._id;
    }

    const task = await Task.create({
      title,
      description,
      project: project._id,
      assignedTo: assignedUserId,
      createdBy: req.user.id,
      priority,
      dueDate: dueDate || null,
      type,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name manager");

    return res.status(201).json({
      message: "Task created successfully",
      task: populatedTask,
    });
  } catch (error) {
    console.error("Create task error:", error.message);

    return res.status(500).json({
      message: "Unable to create task",
    });
  }
});

// Get tasks visible to the current user
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};

    if (req.user.role !== "Admin") {
      const projects = await Project.find({
        $or: [
          { manager: req.user.id },
          { members: req.user.id },
        ],
      }).select("_id");

      const projectIds = projects.map((project) => project._id);

      filter.$or = [
        { project: { $in: projectIds } },
        { assignedTo: req.user.id },
        { createdBy: req.user.id },
      ];
    }

    if (req.query.projectId) {
      if (!mongoose.isValidObjectId(req.query.projectId)) {
        return res.status(400).json({
          message: "Invalid projectId",
        });
      }

      filter.project = req.query.projectId;
    }

    const tasks = await Task.find(filter)
      .populate("project", "name")
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error("Get tasks error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch tasks",
    });
  }
});

// Update task status
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = [
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid task status",
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.project);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "Manager" &&
      project.manager.toString() === req.user.id;
    const isAssignee =
      task.assignedTo?.toString() === req.user.id;

    if (!isAdmin && !isManager && !isAssignee) {
      return res.status(403).json({
        message: "You cannot update this task",
      });
    }

    task.status = status;
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("project", "name")
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    return res.status(200).json({
      message: "Task status updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Update task status error:", error.message);

    return res.status(500).json({
      message: "Unable to update task status",
    });
  }
});
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const userRole = req.user.role;
    const userId = String(req.user.id || req.user.userId);

    if (userRole !== "Admin" && userRole !== "Manager") {
      return res.status(403).json({
        message: "Only Admin or Manager can delete tasks"
      });
    }

    if (userRole === "Manager") {
      const project = await Project.findById(task.project);

      if (!project || String(project.manager) !== userId) {
        return res.status(403).json({
          message: "You can only delete tasks from your own projects"
        });
      }
    }

    await task.deleteOne();

    return res.json({ message: "Task deleted successfully", taskId: id });
  } catch (error) {
    console.error("Delete task error:", error.message);
    return res.status(500).json({ message: "Unable to delete task" });
  }
});

module.exports = router;