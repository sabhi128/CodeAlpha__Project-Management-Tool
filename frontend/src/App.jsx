import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
  }
  return window.location.port === '5173' ? 'http://localhost:5000/api' : '/api';
};
const API_BASE = getApiUrl();

function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');

  // Dashboard state
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(false);
  const isMemberOnly = activeProject && activeProject.user_role === 'member';

  // Modals state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigned_to: '',
    due_date: ''
  });

  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // Drag and drop helper reference
  const dragItem = useRef();
  const dragOverColumn = useRef();

  // Load user profile on token change
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchUserProfile();
      fetchProjects();
    } else {
      localStorage.removeItem('token');
      setUser(null);
      setProjects([]);
      setActiveProject(null);
      setTasks([]);
    }
  }, [token]);

  // Handle socket connections and real-time events
  useEffect(() => {
    if (!token) return;

    socket.connect();

    // Set up project room socket actions
    if (activeProject) {
      socket.emit('join_project', activeProject.id);
      fetchTasks(activeProject.id);
      fetchProjectMembers(activeProject.id);
    }

    socket.on('project_event', (event) => {
      const { type, data, projectId } = event;
      if (activeProject && projectId === activeProject.id) {
        if (type === 'TASK_CREATED') {
          setTasks((prev) => [...prev, data]);
          addNotification(`New task created: "${data.title}"`);
        } else if (type === 'TASK_UPDATED') {
          setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
          setSelectedTask((curr) => curr && curr.id === data.id ? data : curr);
          addNotification(`Task updated: "${data.title}"`);
        } else if (type === 'TASK_DELETED') {
          setTasks((prev) => prev.filter((t) => t.id !== data.id));
          if (selectedTask && selectedTask.id === data.id) {
            setShowTaskModal(false);
          }
          addNotification(`Task deleted`);
        } else if (type === 'COMMENT_CREATED') {
          if (selectedTask && selectedTask.id === data.taskId) {
            setComments((prev) => [...prev, data]);
          }
          addNotification(`New comment on: "${data.author_name}'s task"`);
        } else if (type === 'COMMENT_DELETED') {
          if (selectedTask && selectedTask.id === data.taskId) {
            setComments((prev) => prev.filter((c) => c.id !== data.id));
          }
        }
      }
    });

    return () => {
      if (activeProject) {
        socket.emit('leave_project', activeProject.id);
      }
      socket.off('project_event');
      socket.disconnect();
    };
  }, [activeProject, token, selectedTask]);

  const addNotification = (message) => {
    setNotifications((prev) => [{ id: Date.now(), text: message, time: new Date().toLocaleTimeString() }, ...prev]);
    setUnreadNotifications(true);
  };

  // API Call: Fetch User Profile
  const fetchUserProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setToken('');
      }
    } catch (err) {
      console.error(err);
      setToken('');
    }
  };

  // API Call: Fetch all projects
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !activeProject) {
          setActiveProject(data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API Call: Fetch tasks of active project
  const fetchTasks = async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API Call: Fetch members of project
  const fetchProjectMembers = async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjectMembers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Auth Handler: Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      } else {
        setAuthError(data.error || 'Login failed');
      }
    } catch (err) {
      setAuthError('Server connection failed');
    }
  };

  // Auth Handler: Register
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      } else {
        setAuthError(data.error || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Server connection failed');
    }
  };

  // Create Project
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc })
      });
      if (res.ok) {
        const newProj = await res.json();
        setProjects([newProj, ...projects]);
        setActiveProject(newProj);
        setShowProjectModal(false);
        setNewProjectName('');
        setNewProjectDesc('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: newMemberEmail, role: newMemberRole })
      });
      const data = await res.json();
      if (res.ok) {
        setProjectMembers([...projectMembers, data.user]);
        setShowMemberModal(false);
        setNewMemberEmail('');
      } else {
        alert(data.error || 'Failed to add member');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save or Update Task
  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title) return;

    const method = selectedTask ? 'PUT' : 'POST';
    const endpoint = selectedTask 
      ? `${API_BASE}/projects/${activeProject.id}/tasks/${selectedTask.id}`
      : `${API_BASE}/projects/${activeProject.id}/tasks`;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(taskForm)
      });

      if (res.ok) {
        setShowTaskModal(false);
        setSelectedTask(null);
        fetchTasks(activeProject.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setShowTaskModal(false);
        setSelectedTask(null);
        fetchTasks(activeProject.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Drag and Drop simulation
  const handleDragStart = (e, task) => {
    dragItem.current = task;
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    dragOverColumn.current = columnStatus;
  };

  const handleDrop = async (e) => {
    const task = dragItem.current;
    const newStatus = dragOverColumn.current;

    if (task && newStatus && task.status !== newStatus) {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      );

      try {
        await fetch(`${API_BASE}/projects/${activeProject.id}/tasks/${task.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });
      } catch (err) {
        console.error(err);
        fetchTasks(activeProject.id);
      }
    }
    dragItem.current = null;
    dragOverColumn.current = null;
  };

  // Open Task detail & load comments
  const handleOpenTaskDetail = async (task) => {
    setSelectedTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || '',
      due_date: task.due_date ? new Date(task.due_date).toISOString().substring(0, 10) : ''
    });
    setShowTaskModal(true);

    // Fetch comments
    try {
      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/tasks/${task.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create Comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: newComment })
      });
      if (res.ok) {
        const data = await res.json();
        setComments([...comments, data]);
        setNewComment('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCreateTask = () => {
    setSelectedTask(null);
    setTaskForm({
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      assigned_to: '',
      due_date: ''
    });
    setComments([]);
    setShowTaskModal(true);
  };

  const logout = () => {
    setToken('');
  };

  // Auth Screen Render
  if (!token) {
    return (
      <div className="flex justify-center items-center w-screen h-screen bg-bg-primary relative font-body">
        <div className="w-full max-w-md p-10 rounded-2xl text-center glass animate-[fadeIn_0.6s_cubic-bezier(0.16,1,0.3,1)_forwards]">
          <div className="mb-8">
            <h2 className="text-4xl font-extrabold font-display bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent text-glow">CODEALPHA</h2>
            <p className="text-text-muted mt-2 text-sm">Project Workspace Premium</p>
          </div>
          {authError && <div className="text-red-500 mb-4 text-sm">{authError}</div>}
          <form className="flex flex-col gap-5" onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
            {authMode === 'register' && (
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Full Name</label>
                <input
                  type="text"
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  placeholder="Alexander Wright"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-2 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Email Address</label>
              <input
                type="email"
                className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                placeholder="alexander@luxury.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Password</label>
              <input
                type="password"
                className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5 mt-2">
              {authMode === 'login' ? 'Access Workspace' : 'Create Credentials'}
            </button>
          </form>
          <div className="mt-6 text-sm text-text-muted">
            {authMode === 'login' ? (
              <>
                New associate?{' '}
                <span className="text-ice-blue cursor-pointer font-medium hover:underline hover:text-glow ml-1" onClick={() => { setAuthMode('register'); setAuthError(''); }}>Request Key</span>
              </>
            ) : (
              <>
                Have workspace?{' '}
                <span className="text-ice-blue cursor-pointer font-medium hover:underline hover:text-glow ml-1" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Verify Identity</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loaded Dashboard Render
  return (
    <div className="flex h-screen w-screen overflow-hidden font-body bg-bg-primary text-text-primary">
      {/* Sidebar Panel */}
      <aside className="w-[280px] h-full bg-bg-secondary border-r border-card-border flex flex-col p-6 shrink-0">
        <div className="flex items-center justify-between mb-10">
          <div className="text-xl font-extrabold font-display bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent">CODEALPHA</div>
        </div>

        {user && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/2 border border-white/4 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-black font-display text-base" style={{ backgroundColor: user.avatar_color }}>
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold truncate">{user.full_name}</span>
              <span className="text-xs text-text-muted truncate">{user.email}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 flex-grow overflow-y-auto">
          <div className="text-xs font-bold uppercase tracking-wider text-text-muted my-4 ml-2">Your Workspaces</div>
          {projects.map((proj) => (
            <div
              key={proj.id}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-butter text-sm border border-transparent ${activeProject && activeProject.id === proj.id ? 'bg-ice-blue/6 border-ice-blue/15 text-ice-blue' : 'hover:bg-white/2'}`}
              onClick={() => setActiveProject(proj)}
            >
              <span className="truncate max-w-[180px]">{proj.name}</span>
            </div>
          ))}
          <button 
            className="bg-white/3 border border-white/10 text-text-primary px-6 py-3 rounded-xl font-medium font-display cursor-pointer transition-butter hover:bg-white/8 hover:border-white/20 mt-4 flex gap-2 justify-center"
            onClick={() => setShowProjectModal(true)}
          >
            + Create Board
          </button>
        </div>

        <button className="bg-none border-none text-text-muted text-sm cursor-pointer p-2.5 flex items-center gap-2 transition-colors hover:text-text-primary mt-auto" onClick={logout}>
          <span>Sign Out</span>
        </button>
      </aside>

      {/* Workspace Panel */}
      <main className="flex-grow h-full flex flex-col overflow-hidden bg-bg-primary">
        {activeProject ? (
          <>
            {/* Main Header */}
            <header className="h-20 border-b border-card-border flex items-center justify-between px-10 shrink-0">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent font-display">{activeProject.name}</h1>
                <span className="text-xs text-text-muted border-l border-white/10 pl-3">
                  {activeProject.description || 'Premium Project Board'}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <button className="bg-white/3 border border-white/10 text-text-primary px-5 py-2.5 rounded-xl font-medium font-display cursor-pointer transition-butter hover:bg-white/8 hover:border-white/20 text-sm" onClick={() => setShowMemberModal(true)}>
                  Invite Partner
                </button>
                <button className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-5 py-2.5 rounded-xl font-semibold font-display cursor-pointer transition-butter flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5 text-sm" onClick={handleOpenCreateTask}>
                  Create Card
                </button>
                
                {/* Notification Center */}
                <div className="relative">
                  <div className="relative cursor-pointer text-lg p-2.5 rounded-xl bg-white/3 border border-white/5 flex items-center justify-center transition-butter hover:bg-white/8" onClick={() => { setShowNotifications(!showNotifications); setUnreadNotifications(false); }}>
                    🔔 {unreadNotifications && <span className="absolute top-1 right-1 w-2 h-2 bg-ice-blue rounded-full shadow-[0_0_10px_#38BDF8]" />}
                  </div>
                  {showNotifications && (
                    <div className="absolute top-[60px] right-0 w-80 max-h-[400px] rounded-xl z-50 flex flex-col overflow-hidden glass animate-[slideDown_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                      <div className="p-4 border-b border-card-border font-semibold text-sm flex justify-between items-center">
                        <span>Workspace Activity Log</span>
                        <button className="bg-none border-none text-ice-blue cursor-pointer text-xs" onClick={() => setNotifications([])}>Clear</button>
                      </div>
                      <div className="overflow-y-auto flex-grow">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-text-muted text-xs">No recent events. Ready for action.</div>
                        ) : (
                          notifications.map((n) => (
                            <div key={n.id} className="p-3 border-b border-white/2 last:border-none text-xs leading-normal">
                              <div>{n.text}</div>
                              <div className="text-[10px] text-text-muted mt-1">{n.time}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Kanban Board columns */}
            <div className="flex-grow p-8 overflow-x-auto flex gap-6 items-start">
              {['todo', 'in_progress', 'review', 'done'].map((columnStatus) => {
                const columnTasks = tasks.filter((t) => t.status === columnStatus);
                return (
                  <div
                    key={columnStatus}
                    className="w-80 max-h-full flex flex-col rounded-2xl p-4 shrink-0 glass"
                    onDragOver={(e) => handleDragOver(e, columnStatus)}
                    onDrop={handleDrop}
                  >
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${columnStatus === 'todo' ? 'bg-todo' : columnStatus === 'in_progress' ? 'bg-in-progress' : columnStatus === 'review' ? 'bg-review' : 'bg-done'}`} />
                        <span className="text-sm font-semibold capitalize font-display">
                          {columnStatus === 'in_progress' ? 'In Progress' : columnStatus}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted bg-white/5 px-2 py-0.5 rounded-full font-semibold">{columnTasks.length}</span>
                    </div>

                    <div className="flex flex-col gap-3 overflow-y-auto flex-grow min-height-[150px] p-0.5">
                      {columnTasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-4 rounded-xl cursor-grab active:cursor-grabbing glass transition-butter hover:border-card-border-hover hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7),0_0_20px_rgba(56,189,248,0.15)] hover:-translate-y-0.5"
                          draggable
                          onDragStart={(e) => handleDragStart(e, task)}
                          onClick={() => handleOpenTaskDetail(task)}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${task.priority === 'low' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/40' : task.priority === 'medium' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : task.priority === 'high' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
                              {task.priority}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold leading-snug mb-2 font-display">{task.title}</h4>
                          <p className="text-xs text-text-muted line-clamp-2 mb-4 leading-relaxed">{task.description}</p>
                          <div className="flex items-center justify-between border-t border-white/4 pt-3">
                            <span className="text-xs text-text-muted flex items-center gap-1.5">
                              📅 {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}
                            </span>
                            {task.assignee_name && (
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black" 
                                style={{ backgroundColor: task.assignee_avatar_color || 'var(--color-ice-blue)' }}
                                title={task.assignee_name}
                              >
                                {task.assignee_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-10 gap-5">
            <h3 className="text-3xl font-bold bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent font-display">Welcome to CodeAlpha Premium</h3>
            <p className="text-text-muted max-w-md text-sm leading-relaxed">Create your first high-performance project board workspace to start collaborating.</p>
            <button className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5" onClick={() => setShowProjectModal(true)}>
              Initialize Project Board
            </button>
          </div>
        )}
      </main>

      {/* Project Board Creator Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex justify-center items-center animate-[fadeIn_0.3s_ease]">
          <div className="w-[90%] max-w-2xl rounded-2xl p-8 max-h-[90vh] overflow-y-auto relative glass animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            <button className="absolute top-6 right-6 bg-none border-none text-text-muted text-xl cursor-pointer hover:text-text-primary" onClick={() => setShowProjectModal(false)}>✕</button>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent mb-6 font-display">New Board Workspace</h3>
            <form className="flex flex-col gap-5" onSubmit={handleCreateProject}>
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Board Title</label>
                <input
                  type="text"
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  placeholder="e.g. Q3 Luxury Rebranding Launch"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Description</label>
                <textarea
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)] min-h-[100px] resize-y"
                  placeholder="e.g. Collaboration workflow for design templates, messaging strategies and media campaigns."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5 mt-2 self-start">Launch Workspace</button>
            </form>
          </div>
        </div>
      )}

      {/* Member Invite Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex justify-center items-center animate-[fadeIn_0.3s_ease]">
          <div className="w-[90%] max-w-2xl rounded-2xl p-8 max-h-[90vh] overflow-y-auto relative glass animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            <button className="absolute top-6 right-6 bg-none border-none text-text-muted text-xl cursor-pointer hover:text-text-primary" onClick={() => setShowMemberModal(false)}>✕</button>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent mb-6 font-display">Add Associated Partner</h3>
            <form className="flex flex-col gap-5" onSubmit={handleAddMember}>
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Associate Email</label>
                <input
                  type="email"
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  placeholder="colleague@codealpha.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Security Role</label>
                <select
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                >
                  <option className="bg-bg-secondary" value="member">Associate Partner (Member)</option>
                  <option className="bg-bg-secondary" value="admin">Project Director (Admin)</option>
                </select>
              </div>
              <button type="submit" className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5 mt-2 self-start">Send Authorization Invite</button>
            </form>
          </div>
        </div>
      )}

      {/* Task Card Editor Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex justify-center items-center animate-[fadeIn_0.3s_ease]">
          <div className="w-[90%] max-w-4xl rounded-2xl p-8 max-h-[90vh] overflow-y-auto relative glass animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            <button className="absolute top-6 right-6 bg-none border-none text-text-muted text-xl cursor-pointer hover:text-text-primary" onClick={() => setShowTaskModal(false)}>✕</button>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-platinum to-ice-blue bg-clip-text text-transparent mb-6 font-display">
              {selectedTask ? 'Workspace Card Details' : 'Design New Card'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr] gap-8 mt-2">
              {/* Form Side */}
              <form className="flex flex-col gap-5" onSubmit={handleSaveTask}>
                <div className="flex flex-col gap-2 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Card Title</label>
                  <input
                    type="text"
                    className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    required
                  />
                </div>
                
                <div className="flex flex-col gap-2 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Task Mission Brief</label>
                  <textarea
                    className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)] min-h-[120px] resize-y"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2 text-left">
                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Status</label>
                    <select
                      className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                      value={taskForm.status}
                      onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    >
                      <option className="bg-bg-secondary" value="todo">To Do</option>
                      <option className="bg-bg-secondary" value="in_progress">In Progress</option>
                      <option className="bg-bg-secondary" value="review">Under Review</option>
                      <option className="bg-bg-secondary" value="done">Completed</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 text-left">
                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Priority</label>
                    <select
                      className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    >
                      <option className="bg-bg-secondary" value="low">Low Priority</option>
                      <option className="bg-bg-secondary" value="medium">Medium Priority</option>
                      <option className="bg-bg-secondary" value="high">High Priority</option>
                      <option className="bg-bg-secondary" value="critical">Critical Priority</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2 text-left">
                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Assign to Specialist</label>
                    <select
                      className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                      value={taskForm.assigned_to}
                      onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                      disabled={isMemberOnly}
                    >
                      <option className="bg-bg-secondary" value="">Unassigned</option>
                      {projectMembers.map((m) => (
                        <option className="bg-bg-secondary" key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 text-left">
                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Target Delivery Date</label>
                    <input
                      type="date"
                      className="bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 text-text-primary text-sm transition-butter outline-none focus:border-ice-blue focus:bg-white/5 focus:shadow-[0_0_15px_rgba(56,189,248,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                      value={taskForm.due_date}
                      onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                      disabled={isMemberOnly}
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-2">
                  <button type="submit" className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter shadow-[0_4px_20px_rgba(56,189,248,0.1)] hover:from-ice-blue hover:to-[#0284C7] hover:text-black hover:shadow-[0_4px_25px_rgba(56,189,248,0.3)] hover:-translate-y-0.5">
                    Save Updates
                  </button>
                  {selectedTask && (
                    <button 
                      type="button" 
                      className="bg-none px-6 py-3 rounded-xl font-semibold font-display cursor-pointer transition-butter border border-red-500/40 text-red-500 hover:bg-red-500/10"
                      onClick={() => handleDeleteTask(selectedTask.id)}
                    >
                      Archived (Delete)
                    </button>
                  )}
                </div>
              </form>

              {/* Comments/History Thread Side */}
              <div className="border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-6 flex flex-col gap-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Workspace Discussion</h4>
                {selectedTask ? (
                  <div className="flex flex-col gap-4 flex-grow justify-between">
                    <div className="flex flex-col gap-4 max-h-[250px] overflow-y-auto pr-2">
                      {comments.length === 0 ? (
                        <div className="text-text-muted text-xs py-4">Discussion thread empty. Share details.</div>
                      ) : (
                        comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3 items-start p-3 rounded-lg bg-white/2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0" style={{ backgroundColor: comment.author_avatar_color }}>
                              {comment.author_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <div className="font-semibold text-xs">{comment.author_name}</div>
                              <div className="text-xs text-text-primary leading-normal mt-1">{comment.content}</div>
                              <div className="text-[10px] text-text-muted mt-1">{new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <form className="flex gap-3" onSubmit={handleAddComment}>
                      <input
                        type="text"
                        className="bg-white/3 border border-white/8 rounded-xl px-4 py-2.5 text-text-primary text-xs transition-butter flex-grow outline-none focus:border-ice-blue focus:bg-white/5"
                        placeholder="Add professional notes..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                      />
                      <button type="submit" className="bg-gradient-to-r from-ice-blue/10 to-ice-blue/20 border border-ice-blue text-text-primary px-4 py-2.5 rounded-xl font-semibold font-display text-xs cursor-pointer transition-butter hover:from-ice-blue hover:to-[#0284C7] hover:text-black">Send</button>
                    </form>
                  </div>
                ) : (
                  <div className="text-text-muted text-xs py-4">Save card to initialize workspace discussion.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
