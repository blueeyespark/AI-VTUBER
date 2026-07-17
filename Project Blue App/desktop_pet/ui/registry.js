(() => {
  const registry = new Map();
  const listeners = new Set();

  function normalizeDefinition(name, definition) {
    if (!name || typeof name !== "string") throw new TypeError("UI component name must be a non-empty string.");
    if (!definition || typeof definition !== "object") throw new TypeError(`UI component ${name} must be an object.`);
    return Object.freeze({ name, version: 1, ...definition });
  }

  function register(name, definition) {
    const normalized = normalizeDefinition(name, definition);
    registry.set(name, normalized);
    for (const listener of listeners) listener({ type: "registered", component: normalized });
    return normalized;
  }

  function get(name) { return registry.get(name) || null; }
  function has(name) { return registry.has(name); }
  function list() { return [...registry.values()]; }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function createElement(tagName, options = {}) {
    const node = document.createElement(tagName);
    if (options.className) node.className = options.className;
    if (options.text != null) node.textContent = String(options.text);
    if (options.html != null) node.innerHTML = String(options.html);
    for (const [name, value] of Object.entries(options.attributes || {})) {
      if (value == null || value === false) continue;
      if (value === true) node.setAttribute(name, "");
      else node.setAttribute(name, String(value));
    }
    for (const [name, handler] of Object.entries(options.events || {})) {
      if (typeof handler === "function") node.addEventListener(name, handler);
    }
    for (const child of options.children || []) if (child) node.append(child);
    return node;
  }
  function mount(name, target, props = {}) {
    const component = get(name);
    if (!component?.mount) throw new Error(`UI component ${name} is not mountable.`);
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) throw new Error(`Mount target for ${name} was not found.`);
    return component.mount(element, props);
  }

  window.ProjectBlueUI = Object.freeze({ register, get, has, list, subscribe, createElement, mount });
  window.dispatchEvent(new CustomEvent("projectblue:ui-registry-ready"));
})();
