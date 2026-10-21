const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#send-button");
const statusText = document.querySelector("#status");
const results = document.querySelector("#results");

loadProviders();

async function loadProviders() {
  try {
    const response = await fetch("/api/providers");
    const data = await response.json();
    results.innerHTML = (data.providers || []).map(cardTemplate).join("");
  } catch (error) {
    statusText.textContent = "Could not load providers.";
  }
}

function cardTemplate(provider) {
  const badge = provider.configured
    ? `<span class="badge ready">Ready</span>`
    : `<span class="badge missing">Needs key</span>`;

  return `
    <article class="result-card" data-provider="${escapeHtml(provider.id)}">
      <div class="result-header">
        <div class="avatar" aria-hidden="true">${escapeHtml(provider.name.charAt(0))}</div>
        <div class="provider-info">
          <h2>${escapeHtml(provider.name)}</h2>
          <p>${escapeHtml(provider.model)}</p>
        </div>
        ${badge}
      </div>
      <div class="answer muted">Waiting for your prompt.</div>
      <div class="result-footer"><span class="meta"></span></div>
    </article>
  `;
}

function setCardLoading(card) {
  const answer = card.querySelector(".answer");
  answer.className = "answer loading";
  answer.textContent = "Thinking...";
  card.querySelector(".result-footer").innerHTML = `<span class="meta">Waiting for response...</span>`;
}

function updateCard(result) {
  const card = results.querySelector(`[data-provider="${result.id}"]`);
  if (!card) return;

  const answer = card.querySelector(".answer");
  answer.className = result.ok ? "answer" : "answer error";
  answer.textContent = result.ok ? result.answer : result.error;

  const footer = card.querySelector(".result-footer");
  const seconds = result.elapsedMs ? `${(result.elapsedMs / 1000).toFixed(1)}s` : "";
  footer.innerHTML = `<span class="meta">${result.ok ? `Answered in ${seconds}` : "Failed"}</span>`;
  if (result.ok) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(result.answer);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Failed";
      }
      setTimeout(() => { copy.textContent = "Copy"; }, 1500);
    });
    footer.append(copy);
  }
}

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  if (!prompt) return;

  sendButton.disabled = true;
  statusText.textContent = "Sending to providers...";
  const cards = Array.from(results.querySelectorAll(".result-card"));
  cards.forEach(setCardLoading);

  const requests = cards.map(async (card) => {
    const providerId = card.dataset.provider;

    try {
      const response = await fetch(`/api/chat/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }

      updateCard(data);
    } catch (error) {
      updateCard({
        id: providerId,
        ok: false,
        error: error.message,
      });
    }
  });

  try {
    await Promise.all(requests);
    statusText.textContent = "Done.";
  } finally {
    sendButton.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
