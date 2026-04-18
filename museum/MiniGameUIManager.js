/**
 * Fullscreen quiz overlay — Carthage palette, fade transitions, answer buttons.
 */

const CSS = `
#minigame-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(10, 8, 6, 0.78);
  backdrop-filter: blur(6px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
  font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
}
#minigame-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}
#minigame-overlay .mg-modal {
  width: min(520px, 100%);
  max-height: min(90vh, 640px);
  overflow: auto;
  background: linear-gradient(165deg, rgba(32, 26, 18, 0.97), rgba(18, 14, 10, 0.98));
  border: 1px solid rgba(212, 180, 131, 0.35);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 24px 48px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 230, 200, 0.06);
  padding: 1.75rem 1.6rem 1.5rem;
  transform: translateY(12px) scale(0.98);
  transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}
#minigame-overlay.visible .mg-modal {
  transform: translateY(0) scale(1);
}
#minigame-overlay .mg-era {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(200, 170, 120, 0.65);
  margin-bottom: 0.35rem;
}
#minigame-overlay .mg-title {
  font-size: 1.45rem;
  color: #e8d0a8;
  letter-spacing: 0.06em;
  margin-bottom: 1rem;
  line-height: 1.25;
}
#minigame-overlay .mg-question {
  font-size: 0.98rem;
  line-height: 1.55;
  color: rgba(245, 228, 200, 0.88);
  margin-bottom: 1.25rem;
}
#minigame-overlay .mg-options {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
#minigame-overlay .mg-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.72rem 1rem;
  font-family: inherit;
  font-size: 0.88rem;
  color: #f0e4cc;
  background: rgba(212, 180, 131, 0.08);
  border: 1px solid rgba(212, 180, 131, 0.22);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}
#minigame-overlay .mg-option:hover:not(:disabled) {
  background: rgba(212, 180, 131, 0.18);
  border-color: rgba(232, 208, 160, 0.45);
  transform: translateX(2px);
}
#minigame-overlay .mg-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
#minigame-overlay .mg-feedback {
  min-height: 2.6rem;
  margin-top: 1rem;
  font-size: 0.9rem;
  line-height: 1.45;
  color: rgba(220, 200, 160, 0.9);
}
#minigame-overlay .mg-feedback.success {
  color: #b8e6a8;
}
#minigame-overlay .mg-feedback.error {
  color: #e8a898;
}
#minigame-overlay .mg-actions {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
#minigame-overlay .mg-btn-secondary {
  padding: 0.55rem 1.1rem;
  font-family: inherit;
  font-size: 0.82rem;
  color: #d4b483;
  background: transparent;
  border: 1px solid rgba(212, 180, 131, 0.35);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
#minigame-overlay .mg-btn-secondary:hover {
  background: rgba(212, 180, 131, 0.1);
  border-color: rgba(232, 208, 160, 0.5);
}
#minigame-overlay .mg-btn-exit {
  display: block;
  width: 100%;
  margin-top: 0.85rem;
  padding: 0.4rem;
  font-family: inherit;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(180, 160, 130, 0.55);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
}
#minigame-overlay .mg-btn-exit:hover {
  color: rgba(220, 200, 170, 0.9);
}
`;

export class MiniGameUIManager {
  constructor() {
    /** @type {HTMLElement | null} */
    this._root = null;
    /** @type {HTMLButtonElement[]} */
    this._optionButtons = [];
    /** @type {((i: number) => void) | null} */
    this._onPick = null;
    this._injectStyles();
    this._buildDom();
  }

  _injectStyles() {
    if (document.getElementById("minigame-styles")) return;
    const s = document.createElement("style");
    s.id = "minigame-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _buildDom() {
    const overlay = document.createElement("div");
    overlay.id = "minigame-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="mg-modal">
        <div class="mg-era" id="mg-era"></div>
        <div class="mg-title" id="mg-title"></div>
        <div class="mg-question" id="mg-question"></div>
        <div class="mg-options" id="mg-options"></div>
        <div class="mg-feedback" id="mg-feedback"></div>
        <div class="mg-actions" id="mg-actions"></div>
        <button type="button" class="mg-btn-exit" id="mg-exit">Exit puzzle</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this._root = overlay;

    this._elEra = overlay.querySelector("#mg-era");
    this._elTitle = overlay.querySelector("#mg-title");
    this._elQuestion = overlay.querySelector("#mg-question");
    this._elOptions = overlay.querySelector("#mg-options");
    this._elFeedback = overlay.querySelector("#mg-feedback");
    this._elActions = overlay.querySelector("#mg-actions");
    this._btnExit = overlay.querySelector("#mg-exit");
    /** @type {(() => void) | null} */
    this._onExit = null;
    this._btnExit.addEventListener("click", () => {
      if (this._onExit) this._onExit();
    });
  }

  /** @param {() => void} fn */
  setOnExit(fn) {
    this._onExit = fn;
  }

  /**
   * @param {{ title: string, eraLine: string, question: string, options: string[] }} data
   * @param {(index: number) => void} onPick
   */
  renderGameUI(data, onPick) {
    if (!this._root) return;
    this._onPick = onPick;
    this._elEra.textContent = data.eraLine;
    this._elTitle.textContent = data.title;
    this._elQuestion.textContent = data.question;
    this._elOptions.innerHTML = "";
    this._optionButtons = [];
    data.options.forEach((label, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mg-option";
      b.textContent = label;
      b.addEventListener("click", () => {
        if (this._onPick) this._onPick(i);
      });
      this._elOptions.appendChild(b);
      this._optionButtons.push(b);
    });
    this._elActions.innerHTML = "";
    this.updateFeedback("", "neutral");
  }

  /**
   * @param {string} text
   * @param {"success" | "error" | "neutral"} kind
   */
  updateFeedback(text, kind = "neutral") {
    if (!this._elFeedback) return;
    this._elFeedback.textContent = text;
    this._elFeedback.classList.remove("success", "error");
    if (kind === "success") this._elFeedback.classList.add("success");
    if (kind === "error") this._elFeedback.classList.add("error");
  }

  setOptionsEnabled(on) {
    for (const b of this._optionButtons) {
      b.disabled = !on;
    }
  }

  /** @param {string} label @param {() => void} handler */
  addActionButton(label, handler) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mg-btn-secondary";
    b.textContent = label;
    b.addEventListener("click", handler);
    this._elActions.appendChild(b);
  }

  clearActions() {
    if (this._elActions) this._elActions.innerHTML = "";
  }

  show() {
    if (!this._root) return;
    requestAnimationFrame(() => {
      this._root.classList.add("visible");
    });
  }

  hide() {
    if (!this._root) return;
    this._root.classList.remove("visible");
  }

  isVisible() {
    return this._root?.classList.contains("visible") ?? false;
  }
}
