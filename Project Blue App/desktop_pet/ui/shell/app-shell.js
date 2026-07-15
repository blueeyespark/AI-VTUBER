(() => {
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const icons = {
    overview: icon("M4 5h7v7H4V5Zm9 0h7v7h-7V5ZM4 14h7v5H4v-5Zm9 0h7v5h-7v-5Z"),
    workspace: icon("M4 4h16v16H4V4Zm2 4h12V6H6v2Zm0 4h8v-2H6v2Zm0 4h12v-2H6v2Z"),
    search: icon("M9.5 4a5.5 5.5 0 0 1 4.35 8.86l4.64 4.65-1.42 1.42-4.64-4.64A5.5 5.5 0 1 1 9.5 4Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"),
    source: icon("M7 4a3 3 0 1 1 2 2.83v2.34A3 3 0 0 1 11.83 12H14a3 3 0 1 1 0 2h-2.17A3 3 0 0 1 9 16.83V19a3 3 0 1 1-2 0v-2.17A3 3 0 0 1 7 11.17V6.83A3 3 0 0 1 7 4Z"),
    run: icon("M6 4l12 8-12 8V4Zm2 3.7v8.6l6.5-4.3L8 7.7Z"),
    extensions: icon("M8 3h4v5H7V4a1 1 0 0 1 1-1Zm6 0h2a1 1 0 0 1 1 1v4h-5V3h2ZM7 10h5v5H7v-5Zm7 0h3v9a1 1 0 0 1-1 1h-4v-5h2v-5ZM7 17h5v3H8a1 1 0 0 1-1-1v-2Z"),
    memory: icon("M5 5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v14l-7-3-7 3V5Zm3-1a1 1 0 0 0-1 1v10.9l5-2.1 5 2.1V5a1 1 0 0 0-1-1H8Z"),
    ai: icon("M12 3a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4a3 3 0 0 1 3-3h1V7a4 4 0 0 1 4-4Zm-2 5h4V7a2 2 0 1 0-4 0v1Zm-3 3a1 1 0 0 0-1 1v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-3a1 1 0 0 0-1-1H7Zm2 2h2v2H9v-2Zm4 0h2v2h-2v-2Z"),
    tools: icon("M4 6h9v2H4V6Zm11-.5 2 2 3-3 1.4 1.4L17 10.3l-3.4-3.4L15 5.5ZM4 11h9v2H4v-2Zm0 5h9v2H4v-2Zm11-.5 2 2 3-3 1.4 1.4L17 20.3l-3.4-3.4 1.4-1.4Z"),
    research: icon("M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2V4Zm2 2v10.3A3.9 3.9 0 0 1 9 16h8V7a1 1 0 0 0-1-1H7Zm2 3h6v2H9V9Zm0 4h5v2H9v-2"),
    generator: icon("M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8L12 2Zm6 11 .9 2.6 2.6.9-2.6.9L18 21l-.9-2.6-2.6-.9 2.6-.9L18 13ZM6 14l.7 2 2 .7-2 .7L6 19l-.7-1.6-2-.7 2-.7L6 14Z"),
    diagnostics: icon("M4 4h16v14H7l-3 3V4Zm2 2v10.2l.2-.2H18V6H6Zm2 2h8v2H8V8Zm0 4h5v2H8v-2"),
    streaming: icon("M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2H9v-2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Zm6 2.5 5 2.5-5 2.5v-5Z"),
    discord: icon("M8 5a14 14 0 0 1 8 0l1 2a8 8 0 0 1 3 6v4l-3 2-2-1a12 12 0 0 1-6 0l-2 1-3-2v-4a8 8 0 0 1 3-6l1-2Zm1 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"),
    mesh: icon("M7 7a3 3 0 1 1 2.8-4H14a3 3 0 1 1 2.8 4l-2.1 3.7a3 3 0 0 1 0 2.6l2.1 3.7A3 3 0 1 1 14 20H9.8a3 3 0 1 1-2.6-3l2.1-3.7a3 3 0 0 1 0-2.6L7.2 7H7Z"),
    systems: icon("M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 3 6 2.2V11c0 3.8-2.4 7-6 8.3C8.4 18 6 14.8 6 11V7.2L12 5Zm-1 4h2v5h-2V9Zm0 6.5h2v2h-2v-2Z"),
    settings: icon("M10.8 2h2.4l.5 2.2c.5.2 1 .4 1.4.6L17 3.6l1.7 1.7-1.2 1.9c.3.4.5.9.6 1.4l2.2.5v2.4l-2.2.5c-.2.5-.4 1-.6 1.4l1.2 1.9L17 17l-1.9-1.2c-.4.3-.9.5-1.4.6l-.5 2.2h-2.4l-.5-2.2c-.5-.2-1-.4-1.4-.6L7 17l-1.7-1.7 1.2-1.9c-.3-.4-.5-.9-.6-1.4l-2.2-.5V9.1l2.2-.5c.2-.5.4-1 .6-1.4L5.3 5.3 7 3.6l1.9 1.2c.4-.3.9-.5 1.4-.6L10.8 2Z")
  };

  const activities = [
    { id: "workspace", label: "Workspace", tooltip: "Workspace", icon: icons.workspace },
    { id: "search", label: "Search", tooltip: "Search", icon: icons.search },
    { id: "git", label: "Git", tooltip: "Git / Source Control", icon: icons.source },
    { id: "run", label: "Run", tooltip: "Run and Tasks", icon: icons.run },
    { id: "streaming", label: "Streaming", tooltip: "Streaming Studio", icon: icons.streaming },
    { id: "mesh", label: "BlueMesh", tooltip: "BlueMesh", icon: icons.mesh },
    { id: "settings", label: "Settings", tooltip: "Settings", icon: icons.settings },
    { id: "extensions", label: "Extensions", tooltip: "Extensions and Skills", icon: icons.extensions },
    { id: "diagnostics", label: "Diagnostics", tooltip: "Diagnostics", icon: icons.diagnostics },
    { id: "ai", label: "AI & Presence", tooltip: "AI & Presence", icon: icons.ai },
    { id: "discord", label: "Discord", tooltip: "Discord", icon: icons.discord }
  ];


  function validateActivities() {
    const fallbackIcon = icons.overview;
    for (const activity of activities) {
      if (!activity.id) activity.id = "unknown";
      if (!activity.label) activity.label = activity.id.replace(/-/g, " ");
      if (!activity.tooltip) activity.tooltip = activity.label;
      if (!activity.svgIcon) activity.svgIcon = activity.icon || fallbackIcon;
      if (!activity.icon) activity.icon = activity.svgIcon;
      if (!activity.sidebarView) activity.sidebarView = activity.id;
      if (!activity.svgIcon || String(activity.svgIcon).includes("undefined")) {
        console.warn(`[Project Blue] Activity ${activity.id} is missing an icon; using fallback.`);
        activity.svgIcon = fallbackIcon;
        activity.icon = fallbackIcon;
      }
    }
  }
  validateActivities();
  const editors = {
    workspace: [
      { id: "workspace-home", title: "Welcome.md", closable: false },
      { id: "research-lab", title: "Research Lab", closable: true },
      { id: "idea-lab", title: "Idea Lab", closable: true },
      { id: "blueprint-editor", title: "Blueprint Editor", closable: true },
      { id: "generated-result", title: "Generated Result", closable: true },
      { id: "asset-generator", title: "Asset Generator", closable: true },
      { id: "animation-generator", title: "Animation Generator", closable: true },
      { id: "file-preview", title: "File Preview", closable: true },
      { id: "project-notes", title: "Project Notes", closable: true },
      { id: "memory", title: "Blue Memory", closable: true },
      { id: "workspace-settings", title: "Workspace Settings", closable: true }
    ],
    search: [{ id: "search-results", title: "Search", closable: false }],
    git: [{ id: "source-control", title: "Source Control", closable: false }, { id: "diff-review", title: "Diff Review", closable: true }],
    run: [{ id: "tests", title: "Test Explorer", closable: false }, { id: "tasks", title: "Tasks", closable: true }, { id: "debugger", title: "Debugger", closable: true }, { id: "terminal-editor", title: "Terminal", closable: true }],
    streaming: [
      { id: "streaming-studio", title: "Streaming Studio", closable: false },
      { id: "stream-setup", title: "Show Runner", closable: true },
      { id: "obs", title: "OBS", closable: true },
      { id: "scenes", title: "Scenes", closable: true },
      { id: "platforms", title: "Platforms", closable: true },
      { id: "stream-chat", title: "Stream Chat", closable: true },
      { id: "moderation", title: "Moderation", closable: true },
      { id: "titles", title: "Titles & Metadata", closable: true },
      { id: "avatar-output", title: "Avatar Output", closable: true }
    ],
    mesh: [{ id: "identity", title: "BlueMesh Identity", closable: false }, { id: "nodes", title: "Trusted Nodes", closable: true }, { id: "sync", title: "Sync", closable: true }, { id: "conflicts", title: "Conflicts", closable: true }, { id: "ledger", title: "Ledger", closable: true }],
    settings: [{ id: "settings", title: "Settings", closable: false }],
    extensions: [{ id: "skills", title: "Extensions", closable: false }],
    diagnostics: [{ id: "diagnostics", title: "Diagnostics", closable: false }, { id: "security", title: "Windows Security", closable: true }, { id: "function-health", title: "Function Health", closable: true }, { id: "blue-doctor", title: "Blue Doctor", closable: true }, { id: "pc-actions", title: "PC Actions", closable: true }, { id: "developer-tools", title: "Developer Tools", closable: true }],
    ai: [{ id: "presence", title: "Presence", closable: false }, { id: "voice", title: "Voice", closable: false }, { id: "local-ai", title: "Local AI", closable: true }, { id: "avatar", title: "Avatar", closable: true }, { id: "movement", title: "Movement", closable: true }],
    discord: [{ id: "connection", title: "Discord Connection", closable: false }, { id: "commands", title: "Commands", closable: true }, { id: "discord-logs", title: "Logs", closable: true }]
  };
  const sidebarItems = {
    workspace: ["Open Editors", "Project Files", "Find References", "Workspace Settings", "Assets", "VRMs", "Animations", "Images", "Audio", "Generated Content", "Research", "Ideas", "Blueprints", "Memory", "Logs", "Recent", "Favorites"],
    search: ["Workspace Search", "File Search", "Symbol Search", "Memory Search", "Research Search", "Asset Search", "Conversation Search"],
    git: ["Repository", "Branch", "Changes", "Staged Changes", "Diff Review", "Commit", "Pull", "Push", "History", "Conflicts"],
    run: ["Active Tasks", "Saved Tasks", "Tests", "Build", "Launch", "Debug Sessions", "Breakpoints", "Watch", "Processes", "Terminal"],
    streaming: ["OBS", "Scenes", "Stream Setup", "Platforms", "Chat", "Moderation", "Titles", "Avatar Output"],
    mesh: ["Identity", "Nodes", "Pairing", "Sync", "Conflicts", "Ledger", "Trust", "Logs"],
    research: ["Research Lab", "Idea Lab", "Blueprints", "Learning Queue", "Research Sources", "Recent Research"],
    generator: ["Generated Results", "Images", "VRM Animation", "Live2D", "3D Models", "Audio", "Blueprint Output"],
    settings: ["Layout", "Model", "Privacy", "Startup", "Paths"],
    extensions: ["Installed Skills", "Available Add-ons", "Safe Integrations", "Capability Packs"],
    diagnostics: ["Diagnostics", "PC Info", "Function Audit", "Blue Doctor", "Developer Tools", "Security", "Hardware", "Recovery", "Logs"],
    ai: ["Voice", "Microphone", "Vision", "Avatar", "Movement", "Local AI", "Privacy", "Presence Rules"],
    discord: ["Connection", "Commands", "Allowed Server", "Allowed Channel", "Allowed Users", "Logs"]
  };
  const sidebarGroups = {
    workspace: [
      { title: "Workspace", items: ["Project Files", "Find References", "Workspace Settings"] },
      { title: "Research & Ideas", items: ["Research", "Ideas", "Blueprints", "Generated Content"] },
      { title: "Assets", items: ["VRMs", "Animations", "Images", "Audio"] },
      { title: "Knowledge", items: ["Memory", "Logs", "Favorites"] }
    ],
    search: [{ title: "Search", items: ["Workspace Search", "File Search", "Symbol Search", "Conversation Search"] }, { title: "Knowledge", items: ["Memory Search", "Research Search", "Asset Search"] }],
    git: [{ title: "Source Control", items: ["Repository", "Branch", "Changes", "Staged Changes"] }, { title: "Review", items: ["Diff Review", "History", "Conflicts"] }, { title: "Actions", items: ["Commit", "Pull", "Push"] }],
    run: [{ title: "Run & Test", items: ["Active Tasks", "Saved Tasks", "Tests", "Build", "Launch"] }, { title: "Debug", items: ["Debug Sessions", "Breakpoints", "Watch", "Processes"] }, { title: "Terminal", items: ["Terminal"] }],
    streaming: [{ title: "OBS", items: ["OBS", "Scenes"] }, { title: "Show", items: ["Stream Setup", "Titles", "Avatar Output"] }, { title: "Audience", items: ["Platforms", "Chat", "Moderation"] }],
    mesh: [{ title: "Identity", items: ["Identity", "Nodes", "Trust"] }, { title: "Sync", items: ["Pairing", "Sync", "Conflicts"] }, { title: "History", items: ["Ledger", "Logs"] }],
    settings: [{ title: "Settings", items: ["Layout", "Model", "Privacy", "Startup", "Paths"] }],
    extensions: [{ title: "Extensions", items: ["Installed Skills", "Available Add-ons", "Safe Integrations", "Capability Packs"] }],
    diagnostics: [{ title: "Health", items: ["Diagnostics", "Function Audit", "Blue Doctor"] }, { title: "System", items: ["PC Info", "Security", "Hardware", "Recovery"] }, { title: "Developer", items: ["Developer Tools", "Logs"] }],
    ai: [{ title: "Senses", items: ["Microphone", "Vision"] }, { title: "Companion", items: ["Voice", "Avatar", "Movement", "Presence Rules"] }, { title: "Intelligence", items: ["Local AI", "Privacy"] }],
    discord: [{ title: "Discord", items: ["Connection", "Commands"] }, { title: "Permissions", items: ["Allowed Server", "Allowed Channel", "Allowed Users"] }, { title: "History", items: ["Logs"] }]
  };
  const legacyToActivity = { overview: "workspace", explorer: "workspace", chat: "workspace", share: "workspace", create: "workspace", expansion: "workspace", research: "workspace", idea: "workspace", generator: "workspace", generated: "workspace", search: "search", source: "git", git: "git", run: "run", tasks: "run", memory: "workspace", voice: "ai", presence: "ai", motion: "ai", security: "diagnostics", system: "diagnostics", systems: "diagnostics", tools: "diagnostics", diagnostics: "diagnostics", discord: "discord", bluemesh: "mesh", mesh: "mesh", streaming: "streaming", settings: "settings", extensions: "extensions" };
  const legacyToEditor = { overview: "workspace-home", chat: "workspace-home", share: "file-preview", create: "research-lab", expansion: "idea-lab", research: "research-lab", idea: "idea-lab", blueprint: "blueprint-editor", generator: "generated-result", generated: "generated-result", asset: "asset-generator", animation: "animation-generator", search: "search-results", source: "source-control", git: "source-control", diff: "diff-review", run: "tasks", tasks: "tasks", terminal: "terminal-editor", memory: "workspace-home", voice: "voice", presence: "presence", motion: "avatar", security: "security", system: "diagnostics", systems: "diagnostics", tools: "diagnostics", diagnostics: "diagnostics", discord: "connection", bluemesh: "identity", mesh: "identity", streaming: "streaming-studio", settings: "settings", extensions: "skills" };

  function normalizeActivity(value) {
    return legacyToActivity[value] || (activities.some(activity => activity.id === value) ? value : "workspace");
  }
  function defaultEditor(activityId) {
    return (editors[activityId] && editors[activityId][0]?.id) || "workspace-home";
  }
  function normalizeEditor(activityId, editorId) {
    return (editors[activityId] || []).some(editor => editor.id === editorId) ? editorId : (legacyToEditor[editorId] || defaultEditor(activityId));
  }

  window.ProjectBlueShell = { activities, editors, sidebarItems, sidebarGroups, normalizeActivity, normalizeEditor, defaultEditor };
})();
