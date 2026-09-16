const names = {
  claude: "Claude Code",
  codex: "Codex",
  agy: "Antigravity CLI",
  grok: "Grok",
};
let provider = "claude";
let language = "python";
const examples = {
  python: (model) => `from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key="local",  # or your configured server key
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
  javascript: (model) => `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8000/v1",
  apiKey: "local", // or your configured server key
});

const stream = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`,
  curl: (model) => `curl -N http://127.0.0.1:8000/v1/chat/completions \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'

# If you configured AGIKEY_API_KEY, also add:
# -H "Authorization: Bearer $AGIKEY_API_KEY"`,
};
function updateCode() {
  document.getElementById("code-text").textContent =
    examples[language](provider);
  document.getElementById("code-route").textContent =
    `ROUTING TO ${names[provider].toUpperCase()}`;
  document
    .getElementById("code-example")
    .setAttribute("aria-labelledby", `tab-${language}`);
}
document.querySelectorAll("[data-provider]").forEach((button) =>
  button.addEventListener("click", () => {
    provider = button.dataset.provider;
    document.querySelectorAll("[data-provider]").forEach((item) => {
      item.classList.toggle("active", item.dataset.provider === provider);
      item.setAttribute(
        "aria-pressed",
        String(item.dataset.provider === provider),
      );
    });
    const index = Object.keys(names).indexOf(provider);
    const wires = document.querySelectorAll(".wires path");
    document
      .querySelector(".live-wire")
      .setAttribute("d", wires[index].getAttribute("d"));
    document.getElementById("route-label").textContent = names[provider];
    updateCode();
    document.getElementById("announcement").textContent =
      `Example now routes to ${names[provider]}`;
  }),
);
const tabs = [...document.querySelectorAll("[data-language]")];
tabs.forEach((button, index) => {
  button.addEventListener("click", () => {
    language = button.dataset.language;
    tabs.forEach((tab) => {
      const selected = tab === button;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    updateCode();
  });
  button.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  });
});
async function copy(button, content) {
  const initial = button.innerHTML;
  try {
    await navigator.clipboard.writeText(content);
    button.textContent = "Copied ✓";
    document.getElementById("announcement").textContent = "Copied to clipboard";
  } catch {
    button.textContent = "Select the code to copy";
    document.getElementById("announcement").textContent =
      "Clipboard unavailable. Select and copy the code manually.";
  }
  setTimeout(() => {
    button.innerHTML = initial;
  }, 2200);
}
document
  .getElementById("copy-code")
  .addEventListener("click", (event) =>
    copy(event.currentTarget, examples[language](provider)),
  );
document
  .getElementById("copy-install")
  .addEventListener("click", (event) =>
    copy(
      event.currentTarget,
      document.getElementById("install-command").textContent,
    ),
  );
const shots = {
  agents: ["provider discovery table", "Provider discovery"],
  playground: ["chat playground", "Chat playground"],
  conversations: ["saved conversation list", "Saved conversations"],
};
document.querySelectorAll("[data-shot]").forEach((button) =>
  button.addEventListener("click", () => {
    const shot = button.dataset.shot;
    const image = document.getElementById("dashboard-image");
    image.src = `assets/dashboard-${shot}.png`;
    image.alt = `Agikey dashboard showing the ${shots[shot][0]}`;
    document.getElementById("dashboard-caption").textContent =
      `${shots[shot][1]} · included with the local server`;
    document.querySelectorAll("[data-shot]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
  }),
);
updateCode();
