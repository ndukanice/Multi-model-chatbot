const providerGrid = document.querySelector("#providerGrid");
const chatForm = document.querySelector("#chatForm");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const clearButton = document.querySelector("#clearButton");

let providers = [];
let sharedHistory = [];
let panelMessages = new Map();

loadProviders();

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  promptInput.value = "";
  sendButton.disabled = true;
  setProviderStatuses("Thinking");

  for (const provider of providers) {
    addPanelMessage(provider.id, "user", "You", prompt);
    addPanelMessage(provider.id, "assistant", provider.name, "Thinking...");
  }

  try {
    const response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history: sharedHistory })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    for (const result of data.results) {
      replaceLastAssistant(result);
      updateStatus(result);
    }

    const firstGoodAnswer = data.results.find((result) => result.status === "ok")?.answer;
    sharedHistory.push({ role: "user", content: prompt });
    if (firstGoodAnswer) {
      sharedHistory.push({ role: "assistant", content: firstGoodAnswer });
    }
    sharedHistory = sharedHistory.slice(-8);
  } catch (error) {
    for (const provider of providers) {
      replaceLastAssistant({
        id: provider.id,
        name: provider.name,
        status: "error",
        answer: "",
        error: error.message || "Request failed."
      });
      setStatus(provider.id, "Error", "error");
    }
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
  }
});

clearButton.addEventListener("click", () => {
  sharedHistory = [];
  panelMessages = new Map(providers.map((provider) => [provider.id, []]));
  renderProviders();
});

async function loadProviders() {
  const response = await fetch(apiUrl("/api/providers"));
  const data = await response.json();
  providers = data.providers || [];
  panelMessages = new Map(providers.map((provider) => [provider.id, []]));
  renderProviders();
}

function renderProviders() {
  providerGrid.innerHTML = providers.map(providerTemplate).join("");

  for (const provider of providers) {
    const status = provider.configured ? "Ready" : "Needs key";
    setStatus(provider.id, status, provider.configured ? "" : "warning");
    renderPanelMessages(provider.id);
  }
}

function providerTemplate(provider) {
  return `
    <article class="model-card" data-provider="${escapeHtml(provider.id)}">
      <header>
        <div class="model-row">
          <h2 class="model-name">${escapeHtml(provider.name)}</h2>
          <span class="status" data-status>${provider.configured ? "Ready" : "Needs key"}</span>
        </div>
        <p class="model-id">${escapeHtml(provider.model)}</p>
      </header>
      <div class="conversation" data-conversation>
        <div class="empty">Ask a question to compare answers here.</div>
      </div>
    </article>
  `;
}

function addPanelMessage(providerId, role, label, content) {
  const messages = panelMessages.get(providerId) || [];
  messages.push({ role, label, content });
  panelMessages.set(providerId, messages);
  renderPanelMessages(providerId);
}

function replaceLastAssistant(result) {
  const messages = panelMessages.get(result.id) || [];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return;

  lastAssistant.content = result.status === "ok" ? result.answer : result.error;
  lastAssistant.role = result.status === "ok" ? "assistant" : "error";
  lastAssistant.label = result.status === "ok"
    ? `${result.name} ${result.elapsedMs ? `- ${(result.elapsedMs / 1000).toFixed(1)}s` : ""}`
    : result.name;

  renderPanelMessages(result.id);
}

function renderPanelMessages(providerId) {
  const card = document.querySelector(`[data-provider="${providerId}"]`);
  if (!card) return;

  const conversation = card.querySelector("[data-conversation]");
  const messages = panelMessages.get(providerId) || [];

  if (!messages.length) {
    conversation.innerHTML = `<div class="empty">Ask a question to compare answers here.</div>`;
    return;
  }

  conversation.innerHTML = messages.map((message) => `
    <div class="message ${escapeHtml(message.role)}">
      <span class="meta">${escapeHtml(message.label)}</span>
      ${escapeHtml(message.content)}
    </div>
  `).join("");
  conversation.scrollTop = conversation.scrollHeight;
}

function setProviderStatuses(text) {
  for (const provider of providers) {
    setStatus(provider.id, text, "");
  }
}

function updateStatus(result) {
  if (result.status === "ok") {
    setStatus(result.id, "Done", "");
  } else if (result.status === "missing-key") {
    setStatus(result.id, "Needs key", "warning");
  } else {
    setStatus(result.id, "Error", "error");
  }
}

function setStatus(providerId, text, state) {
  const card = document.querySelector(`[data-provider="${providerId}"]`);
  if (!card) return;

  const status = card.querySelector("[data-status]");
  status.textContent = text;
  status.className = `status ${state || ""}`.trim();
}

function apiUrl(path) {
  const apiBase = (window.__APP_API_BASE__ || "").replace(/\/$/, "");
  if (apiBase) {
    return new URL(path.replace(/^\//, ""), `${apiBase}/`).toString();
  }

  return new URL(path.replace(/^\//, ""), window.location.href).toString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
