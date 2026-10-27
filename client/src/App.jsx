import { useEffect, useState } from "react";
import API_BASE_URL from "./api";
import "./App.css";

function Dashboard({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectPriority, setProjectPriority] = useState("Medium");
  const [edit, setEdit] = useState({
    name: "", description: "", status: "Planning",
    priority: "Medium", dueDate: ""
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskProject, setTaskProject] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskType, setTaskType] = useState("Task");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedMembers, setSelectedMembers] = useState({});

  const token = localStorage.getItem("devtrackToken");
  const canManageProjects = ["Admin", "Manager"].includes(user?.role);

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      onLogout();
      throw new Error("Session expired. Please sign in again.");
    }

    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  async function loadWorkspace(showLoading = true) {
    if (showLoading) setLoading(true);
    setErrorMessage("");

    try {
      const [pd, td] = await Promise.all([
        apiRequest("/projects"),
        apiRequest("/tasks")
      ]);

      setProjects(pd.projects || []);
      setTasks(td.tasks || []);

      if (canManageProjects) {
        try {
          const ud = await apiRequest("/users");
          setUsers(ud.users || []);
        } catch (e) {
          console.error("Users could not be loaded:", e.message);
          setUsers([]);
        }
      }
    } catch (e) {
      setErrorMessage(e.message || "Workspace load nahi hua.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canManageThisProject = (p) =>
    user?.role === "Admin" ||
    (user?.role === "Manager" &&
      String(p.manager?._id || p.manager) === String(user.id));

  const formatDate = (date) => {
    if (!date) return "No deadline";
    const d = new Date(date);
    return Number.isNaN(d.getTime())
      ? "No deadline"
      : d.toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric"
        });
  };

  const dateInput = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };

  async function handleCreateProject(e) {
    e.preventDefault();
    setNotice("");
    setBusy("create-project");

    try {
      const d = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim(),
          priority: projectPriority
        })
      });

      if (!d.project) throw new Error("Server did not return the created project.");

      setProjects((p) => [d.project, ...p]);
      setProjectName("");
      setProjectDescription("");
      setProjectPriority("Medium");
      setShowProjectForm(false);
      setNotice("Project created successfully.");
      await loadWorkspace(false);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }

  function startEdit(p) {
    setEditingProjectId(p._id);
    setEdit({
      name: p.name || "",
      description: p.description || "",
      status: p.status || "Planning",
      priority: p.priority || "Medium",
      dueDate: dateInput(p.dueDate)
    });
    setNotice("");
  }

  async function handleUpdateProject(e) {
    e.preventDefault();
    if (!editingProjectId) return;

    setBusy("edit-project");
    setNotice("");

    try {
      const d = await apiRequest(`/projects/${editingProjectId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: edit.name.trim(),
          description: edit.description.trim(),
          status: edit.status,
          priority: edit.priority,
          dueDate: edit.dueDate || null
        })
      });

      if (!d.project) throw new Error("Server did not return the updated project.");

      setProjects((p) =>
        p.map((x) => x._id === editingProjectId ? d.project : x)
      );
      setEditingProjectId(null);
      setNotice("Project updated successfully.");
      await loadWorkspace(false);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteProject(p) {
    if (!window.confirm(`Delete project "${p.name}"? This action cannot be undone.`)) return;

    setBusy(`delete-${p._id}`);
    setNotice("");

    try {
      await apiRequest(`/projects/${p._id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((x) => x._id !== p._id));
      setTasks((prev) =>
        prev.filter((t) => String(t.project?._id || t.project) !== String(p._id))
      );
      if (editingProjectId === p._id) setEditingProjectId(null);
      setNotice("Project deleted successfully.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }

  async function handleAddMember(p) {
    const userId = selectedMembers[p._id];

    if (!userId) {
      setNotice("Please select an employee first.");
      return;
    }

    setBusy(`member-${p._id}`);
    setNotice("");

    try {
      await apiRequest(`/projects/${p._id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });

      setSelectedMembers((prev) => ({ ...prev, [p._id]: "" }));
      setNotice("Employee added to project successfully.");
      await loadWorkspace(false);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    setBusy("create-task");
    setNotice("");

    try {
      const d = await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          projectId: taskProject,
          priority: taskPriority,
          type: taskType,
          dueDate: taskDueDate || null,
          assignedTo: taskAssignee || null
        })
      });

      setTasks((prev) => [d.task, ...prev]);
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssignee("");
      setTaskPriority("Medium");
      setTaskType("Task");
      setTaskDueDate("");
      setShowTaskForm(false);
      setNotice(`${taskType} created successfully.`);
      await loadWorkspace(false);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }

  async function handleStatusChange(id, status) {
    setNotice("");

    try {
      const d = await apiRequest(`/tasks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });

      setTasks((prev) => prev.map((t) => t._id === id ? d.task : t));
      setNotice("Task status updated.");
    } catch (e) {
      setNotice(e.message);
      await loadWorkspace(false);
    }
  }

  async function handleDeleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

    try {
      await apiRequest(`/tasks/${task._id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      setNotice("Task deleted successfully.");
    } catch (e) {
      setNotice(e.message);
    }
  }

  const eligibleUsers = users.filter((u) =>
    ["Employee", "Developer"].includes(u.role)
  );

  const selectedTaskProject = projects.find((p) => p._id === taskProject);

  const taskAssignees = selectedTaskProject
    ? users.filter((u) => {
        const members = (selectedTaskProject.members || [])
          .map((m) => String(m._id || m));
        const manager = String(
          selectedTaskProject.manager?._id || selectedTaskProject.manager || ""
        );
        return members.includes(String(u._id)) || manager === String(u._id);
      })
    : [];
    return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-mark">D</div>
          <span>DevTrack <strong>Pro</strong></span>
        </div>
        <button className="logout-button" onClick={onLogout}>Log out</button>
      </header>

      <section className="dashboard-content">
        <p className="form-label">WORKSPACE OVERVIEW</p>
        <h1>Welcome, {user?.name || "Team Member"}!</h1>
        <p className="dashboard-description">
          Manage your projects, tasks and bugs in one workspace.
        </p>

        <div className="dashboard-cards">
          <article className="dashboard-card">
            <span>Your Name</span>
            <h2>{user?.name || "—"}</h2>
            <p>Your registered account name.</p>
          </article>
          <article className="dashboard-card">
            <span>Work Email</span>
            <h2 className="dashboard-email">{user?.email || "—"}</h2>
            <p>Your registered email address.</p>
          </article>
          <article className="dashboard-card">
            <span>Your Role</span>
            <h2>{user?.role || "Employee"}</h2>
            <p>Your workspace permissions.</p>
          </article>
        </div>

        {notice && <p className="workspace-notice" role="status">{notice}</p>}
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}

        {loading ? <p>Loading your workspace...</p> : <>
          <section className="projects-section">
            <div className="projects-heading">
              <div>
                <p className="form-label">PROJECT MANAGEMENT</p>
                <h2>Projects</h2>
                <p>Organize and track your team's projects.</p>
              </div>
              {canManageProjects && (
                <button className="create-project-button" type="button"
                  onClick={() => setShowProjectForm(v => !v)}>
                  {showProjectForm ? "Cancel" : "+ Create Project"}
                </button>
              )}
            </div>

            {showProjectForm && canManageProjects && (
              <form className="project-form" onSubmit={handleCreateProject}>
                <label htmlFor="projectName">Project name</label>
                <input id="projectName" value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="Enter project name" required />

                <label htmlFor="projectDescription">Description</label>
                <textarea id="projectDescription" value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  placeholder="Describe the project" rows={3} />

                <label htmlFor="projectPriority">Priority</label>
                <select id="projectPriority" value={projectPriority}
                  onChange={e => setProjectPriority(e.target.value)}>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>

                <button className="create-project-button" type="submit"
                  disabled={busy === "create-project"}>
                  {busy === "create-project" ? "Saving..." : "Save Project"}
                </button>
              </form>
            )}

            {projects.length === 0 ? (
              <div className="projects-empty">
                <h3>No projects yet</h3>
                <p>Create a project or ask your Manager to add you.</p>
              </div>
            ) : (
              <div className="project-items">
                {projects.map(p => {
                  const members = p.members || [];
                  const owner = canManageThisProject(p);
                  const available = eligibleUsers.filter(u =>
                    !members.some(m => String(m._id || m) === String(u._id)) &&
                    String(p.manager?._id || p.manager || "") !== String(u._id)
                  );

                  return (
                    <article className="dashboard-card" key={p._id}>
                      <div className="project-card-heading">
                        <h3>{p.name}</h3>
                        {owner && (
                          <div className="project-actions">
                            <button type="button" className="icon-action"
                              title="Edit project"
                              onClick={() => startEdit(p)}>✏️</button>
                            <button type="button" className="icon-action delete-project-btn"
                              title="Delete project"
                              disabled={busy === `delete-${p._id}`}
                              onClick={() => handleDeleteProject(p)}>🗑️</button>
                          </div>
                        )}
                      </div>

                      {editingProjectId === p._id && (
                        <form className="project-form edit-project-form"
                          onSubmit={handleUpdateProject}>
                          <h4>Edit Project</h4>
                          <label>Project name</label>
                          <input value={edit.name}
                            onChange={e => setEdit(x => ({ ...x, name: e.target.value }))}
                            required />

                          <label>Description</label>
                          <textarea value={edit.description}
                            onChange={e => setEdit(x => ({ ...x, description: e.target.value }))}
                            rows={3} />

                          <label>Status</label>
                          <select value={edit.status}
                            onChange={e => setEdit(x => ({ ...x, status: e.target.value }))}>
                            <option value="Planning">Planning</option>
                            <option value="Active">Active</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Completed">Completed</option>
                          </select>

                          <label>Priority</label>
                          <select value={edit.priority}
                            onChange={e => setEdit(x => ({ ...x, priority: e.target.value }))}>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>

                          <label>Due date</label>
                          <input type="date" value={edit.dueDate}
                            onChange={e => setEdit(x => ({ ...x, dueDate: e.target.value }))} />

                          <div className="project-form-actions">
                            <button className="create-project-button" type="submit"
                              disabled={busy === "edit-project"}>
                              {busy === "edit-project" ? "Saving..." : "Save Changes"}
                            </button>
                            <button type="button" className="logout-button"
                              onClick={() => setEditingProjectId(null)}>Cancel</button>
                          </div>
                        </form>
                      )}

                      <p>{p.description || "No description provided."}</p>
                      <p>Status: {p.status || "Planning"}</p>
                      <p>Priority: {p.priority || "Medium"}</p>
                      <p>Manager: {p.manager?.name || "Not assigned"}</p>
                      <p>Due: {formatDate(p.dueDate)}</p>

                      <div className="project-members">
                        <h4>Project Members</h4>
                        {members.length ? (
                          <ul>{members.map(m => (
                            <li key={m._id || m}>
                              {m.name || "Project member"}
                              {m.email ? ` (${m.email})` : ""}
                            </li>
                          ))}</ul>
                        ) : <p>No members added yet.</p>}

                        {owner && (
                          <div className="member-controls">
                            <label>Add Employee</label>
                            <select value={selectedMembers[p._id] || ""}
                              onChange={e => setSelectedMembers(x => ({
                                ...x, [p._id]: e.target.value
                              }))}>
                              <option value="">Select an employee</option>
                              {available.map(u => (
                                <option key={u._id} value={u._id}>
                                  {u.name} ({u.role})
                                </option>
                              ))}
                            </select>
                            <button className="create-project-button" type="button"
                              disabled={!selectedMembers[p._id] || busy === `member-${p._id}`}
                              onClick={() => handleAddMember(p)}>
                              {busy === `member-${p._id}` ? "Adding..." : "+ Add Member"}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="projects-section">
            <div className="projects-heading">
              <div>
                <p className="form-label">WORK TRACKING</p>
                <h2>Tasks &amp; Bugs</h2>
                <p>Create tasks, assign work and follow progress.</p>
              </div>
              {canManageProjects && projects.length > 0 && (
                <button className="create-project-button" type="button"
                  onClick={() => setShowTaskForm(v => !v)}>
                  {showTaskForm ? "Cancel" : "+ Create Task / Bug"}
                </button>
              )}
            </div>

            {showTaskForm && canManageProjects && (
              <form className="project-form" onSubmit={handleCreateTask}>
                <label>Work type</label>
                <select value={taskType} onChange={e => setTaskType(e.target.value)}>
                  <option value="Task">Task</option>
                  <option value="Bug">Bug</option>
                </select>

                <label>Title</label>
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Enter title" required />

                <label>Description</label>
                <textarea value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)} rows={3} />

                <label>Project</label>
                <select value={taskProject} required
                  onChange={e => { setTaskProject(e.target.value); setTaskAssignee(""); }}>
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>

                <label>Assign to</label>
                <select value={taskAssignee}
                  onChange={e => setTaskAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {taskAssignees.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                  ))}
                </select>

                <label>Priority</label>
                <select value={taskPriority}
                  onChange={e => setTaskPriority(e.target.value)}>
                  <option>Low</option><option>Medium</option>
                  <option>High</option><option>Critical</option>
                </select>

                <label>Due date</label>
                <input type="date" value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)} />

                <button className="create-project-button" type="submit"
                  disabled={busy === "create-task"}>
                  {busy === "create-task" ? "Saving..." : `Save ${taskType}`}
                </button>
              </form>
            )}

            {!tasks.length ? (
              <div className="projects-empty">
                <h3>No tasks or bugs yet</h3>
                <p>New work items will appear here.</p>
              </div>
            ) : (
              <div className="project-items">
                {tasks.map(t => {
                  const managerId = String(t.project?.manager?._id || t.project?.manager || "");
                  const canUpdate = user?.role === "Admin" ||
                    (user?.role === "Manager" && managerId === String(user.id)) ||
                    String(t.assignedTo?._id || t.assignedTo || "") === String(user.id);

                  return (
                    <article className="dashboard-card" key={t._id}>
                      <span>{t.type === "Bug" ? "BUG" : "TASK"}</span>
                      <h3>{t.title}</h3>
                      <p>{t.description || "No description provided."}</p>
                      <p>Project: {t.project?.name || "Unknown project"}</p>
                      <p>Assigned to: {t.assignedTo?.name || "Unassigned"}</p>
                      <p>Priority: {t.priority}</p>
                      <p>Due: {formatDate(t.dueDate)}</p>

                      <label>Status</label>
                      <select value={t.status} disabled={!canUpdate}
                        onChange={e => handleStatusChange(t._id, e.target.value)}>
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="In Review">In Review</option>
                        <option value="Done">Done</option>
                      </select>

                      {canManageProjects && (
                        <button type="button" className="delete-task-btn"
                          onClick={() => handleDeleteTask(t)}>🗑️ Delete Task</button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>}
      </section>
    </main>
  );
}

function App() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  function handleLogout() {
    localStorage.removeItem("devtrackToken");
    localStorage.removeItem("devtrackUser");
    setUser(null);
    setPassword("");
    setErrorMessage("");
    setIsSignup(false);
  }

  useEffect(() => {
    const savedToken = localStorage.getItem("devtrackToken");
    const savedUser = localStorage.getItem("devtrackUser");

    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("devtrackUser");
        localStorage.removeItem("devtrackToken");
      }
    }
    setCheckingSession(false);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        const sr = await fetch(`${API_BASE_URL}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });
        const sd = await sr.json().catch(() => ({}));
        if (!sr.ok) throw new Error(sd.message || "Signup failed.");
      }

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Login failed.");
      if (!data.token || !data.user) throw new Error("Login response incomplete.");

      localStorage.setItem("devtrackToken", data.token);
      localStorage.setItem("devtrackUser", JSON.stringify(data.user));
      setUser(data.user);
      setPassword("");
      setName("");
      setIsSignup(false);
    } catch (e) {
      setErrorMessage(e.message || "Server connection failed.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return <main className="dashboard-content">Loading DevTrack Pro...</main>;

  if (user && localStorage.getItem("devtrackToken")) {
    return <Dashboard key={user.id} user={user} onLogout={handleLogout} />;
  }

  return (
    <main className="login-page">
      <section className="brand-panel">
        <div className="brand">
          <div className="brand-mark">D</div>
          <span>DevTrack <strong>Pro</strong></span>
        </div>
        <div className="brand-content">
          <span className="eyebrow">WORK SMARTER. BUILD BETTER.</span>
          <h1>Every project.<br />One clear direction.</h1>
          <p>Manage projects, track tasks, and bring your team together in one organized workspace.</p>
          <div className="feature-list">
            <div className="feature"><span className="feature-icon">✓</span><span>Track projects and tasks in one place</span></div>
            <div className="feature"><span className="feature-icon">✓</span><span>Collaborate with your entire team</span></div>
            <div className="feature"><span className="feature-icon">✓</span><span>Keep every deadline in sight</span></div>
          </div>
        </div>
        <p className="brand-footer">A better way to work together.</p>
      </section>

      <section className="form-panel">
        <div className="mobile-brand">
          <div className="brand-mark">D</div>
          <span>DevTrack <strong>Pro</strong></span>
        </div>
        <div className="login-card">
          <span className="form-label">{isSignup ? "GET STARTED" : "WELCOME BACK"}</span>
          <h2>{isSignup ? "Create your account" : "Sign in to your account"}</h2>
          <p className="form-description">
            {isSignup ? "Create your Employee account to get started." : "Enter your details to access your workspace."}
          </p>

          <form onSubmit={handleSubmit}>
            {isSignup && <>
              <label htmlFor="name">Full name</label>
              <input id="name" type="text" placeholder="Enter your full name"
                value={name} onChange={e => setName(e.target.value)}
                autoComplete="name" required />
            </>}

            <label htmlFor="email">Work email</label>
            <input id="email" type="email" placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" required />

            <div className="password-heading">
              <label htmlFor="password">Password</label>
            </div>
            <div className="password-input">
              <input id="password" type={showPassword ? "text" : "password"}
                placeholder="Enter your password" value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6} required />
              <button type="button" className="show-password"
                onClick={() => setShowPassword(v => !v)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}

            <button className="sign-in-button" type="submit" disabled={loading}>
              {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
              {!loading && <span>→</span>}
            </button>
          </form>

          <p className="signup-note">
            {isSignup ? "Already have an account? " : "New to DevTrack Pro? "}
            <button type="button" className="signup-toggle"
              onClick={() => {
                setIsSignup(v => !v);
                setErrorMessage("");
                setPassword("");
                setShowPassword(false);
              }}>
              {isSignup ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
        <p className="security-note">Secure workspace · Built for productive teams</p>
      </section>
    </main>
  );
}

export default App;