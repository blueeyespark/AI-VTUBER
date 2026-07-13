(() => {
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${name}"/></svg>`;
  const icons = {
    overview: icon("M4 5h7v7H4V5Zm9 0h7v7h-7V5ZM4 14h7v5H4v-5Zm9 0h7v5h-7v-5Z"),
    workspace: icon("M4 4h16v16H4V4Zm2 4h12V6H6v2Zm0 4h8v-2H6v2Zm0 4h12v-2H6v2Z"),
    ai: icon("M12 3a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4a3 3 0 0 1 3-3h1V7a4 4 0 0 1 4-4Zm-2 5h4V7a2 2 0 1 0-4 0v1Zm-3 3a1 1 0 0 0-1 1v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-3a1 1 0 0 0-1-1H7Zm2 2h2v2H9v-2Zm4 0h2v2h-2v-2Z"),
    systems: icon("M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 3 6 2.2V11c0 3.8-2.4 7-6 8.3C8.4 18 6 14.8 6 11V7.2L12 5Zm-1 4h2v5h-2V9Zm0 6.5h2v2h-2v-2Z"),
    tools: icon("m14.7 6.3 3-3a4.5 4.5 0 0 1 1.2 4.5l-3.2.8-.8 3.2-8.4 8.4a2.2 2.2 0 0 1-3.1-3.1l8.4-8.4 3.2-.8.7-1.6Z"),
    streaming: icon("M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2H9v-2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Zm6 2.5 5 2.5-5 2.5v-5Z"),
    discord: icon("M8 5a14 14 0 0 1 8 0l1 2a8 8 0 0 1 3 6v4l-3 2-2-1a12 12 0 0 1-6 0l-2 1-3-2v-4a8 8 0 0 1 3-6l1-2Zm1 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"),
    mesh: icon("M7 7a3 3 0 1 1 2.8-4H14a3 3 0 1 1 2.8 4l-2.1 3.7a3 3 0 0 1 0 2.6l2.1 3.7A3 3 0 1 1 14 20H9.8a3 3 0 1 1-2.6-3l2.1-3.7a3 3 0 0 1 0-2.6L7.2 7H7Z"),
    settings: icon("M10.8 2h2.4l.5 2.2c.5.2 1 .4 1.4.6L17 3.6l1.7 1.7-1.2 1.9c.3.4.5.9.6 1.4l2.2.5v2.4l-2.2.5c-.2.5-.4 1-.6 1.4l1.2 1.9L17 17l-1.9-1.2c-.4.3-.9.5-1.4.6l-.5 2.2h-2.4l-.5-2.2c-.5-.2-1-.4-1.4-.6L7 17l-1.7-1.7 1.2-1.9c-.3-.4-.5-.9-.6-1.4l-2.2-.5V9.1l2.2-.5c.2-.5.4-1 .6-1.4L5.3 5.3 7 3.6l1.9 1.2c.4-.3.9-.5 1.4-.6L10.8 2Z")
  };

  const activities = [
    { id: "overview", label: "Overview", icon: icons.overview },
    { id: "workspace", label: "Workspace", icon: icons.workspace },
    { id: "ai", label: "AI & Presence", icon: icons.ai },
    { id: "systems", label: "Systems", icon: icons.systems },
    { id: "tools", label: "Tools", icon: icons.tools },
    { id: "streaming", label: "Streaming", icon: icons.streaming },
    { id: "discord", label: "Discord", icon: icons.discord },
    { id: "mesh", label: "BlueMesh", icon: icons.mesh },
    { id: "settings", label: "Settings", icon: icons.settings }
  ];

  const editors = {
    overview: [{ id: "welcome", title: "Welcome.md", closable: false }, { id: "function-map", title: "Function Map.json", closable: false }],
    workspace: [{ id: "blue-chat", title: "Blue Chat", closable: false }, { id: "research-lab", title: "Research Lab", closable: true }, { id: "idea-lab", title: "Idea Lab", closable: true }, { id: "file-preview", title: "File Preview", closable: true }, { id: "generated-result", title: "Generated Result", closable: true }, { id: "project-notes", title: "Project Notes", closable: true }],
    ai: [{ id: "presence", title: "Presence", closable: false }, { id: "voice", title: "Voice", closable: false }, { id: "local-ai", title: "Local AI", closable: true }, { id: "avatar", title: "Avatar", closable: true }, { id: "movement", title: "Movement", closable: true }],
    systems: [{ id: "security", title: "Windows Security", closable: false }, { id: "hardware", title: "Hardware", closable: true }, { id: "function-health", title: "Function Health", closable: true }, { id: "recovery", title: "Recovery", closable: true }],
    tools: [{ id: "diagnostics", title: "Diagnostics", closable: false }, { id: "blue-doctor", title: "Blue Doctor", closable: true }, { id: "pc-actions", title: "PC Actions", closable: true }, { id: "developer-tools", title: "Developer Tools", closable: true }],
    streaming: [{ id: "streaming-studio", title: "Streaming Studio", closable: false }, { id: "obs", title: "OBS", closable: true }, { id: "platforms", title: "Platforms", closable: true }, { id: "moderation", title: "Moderation", closable: true }],
    discord: [{ id: "connection", title: "Discord Connection", closable: false }, { id: "commands", title: "Commands", closable: true }, { id: "discord-logs", title: "Logs", closable: true }],
    mesh: [{ id: "identity", title: "BlueMesh Identity", closable: false }, { id: "nodes", title: "Trusted Nodes", closable: true }, { id: "sync", title: "Sync", closable: true }, { id: "conflicts", title: "Conflicts", closable: true }, { id: "ledger", title: "Ledger", closable: true }],
    settings: [{ id: "settings", title: "Settings", closable: false }]
  };

  const sidebarItems = {
    overview: ["Welcome", "Function Map", "Recent Status"],
    workspace: ["Open Editors", "Conversations", "Project Files", "Research & Ideas", "Recent Items"],
    ai: ["Voice", "Microphone", "Vision", "Avatar", "Movement", "Local AI", "Privacy", "Presence Rules"],
    systems: ["Security", "Hardware", "Function Health", "Startup", "Recovery", "Logs"],
    tools: ["Diagnostics", "PC Info", "Function Audit", "Blue Doctor", "Developer Tools", "Approvals"],
    streaming: ["OBS", "Scenes", "Stream Setup", "Platforms", "Chat", "Moderation", "Titles", "Avatar Output"],
    discord: ["Connection", "Commands", "Allowed Server", "Allowed Channel", "Allowed Users", "Logs"],
    mesh: ["Identity", "Nodes", "Pairing", "Sync", "Conflicts", "Ledger", "Trust", "Logs"],
    settings: ["Layout", "Model", "Privacy", "Startup", "Paths"]
  };

  const legacyToActivity = { chat: "workspace", share: "workspace", create: "workspace", expansion: "workspace", voice: "ai", presence: "ai", motion: "ai", security: "systems", system: "tools", discord: "discord", bluemesh: "mesh", mesh: "mesh", streaming: "streaming" };
  const legacyToEditor = { chat: "blue-chat", share: "blue-chat", create: "research-lab", expansion: "idea-lab", voice: "voice", presence: "presence", motion: "avatar", security: "security", system: "diagnostics", discord: "connection", bluemesh: "identity", mesh: "identity", streaming: "streaming-studio" };

  function normalizeActivity(value) {
    return legacyToActivity[value] || (activities.some(activity => activity.id === value) ? value : "workspace");
  }
  function defaultEditor(activityId) {
    return (editors[activityId] && editors[activityId][0]?.id) || "blue-chat";
  }
  function normalizeEditor(activityId, editorId) {
    return (editors[activityId] || []).some(editor => editor.id === editorId) ? editorId : (legacyToEditor[editorId] || defaultEditor(activityId));
  }

  window.ProjectBlueShell = { activities, editors, sidebarItems, normalizeActivity, normalizeEditor, defaultEditor };
})();
