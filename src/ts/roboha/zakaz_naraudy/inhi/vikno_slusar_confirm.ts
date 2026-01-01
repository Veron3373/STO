/**
 * 🎨 Модальне вікно підтвердження для Слюсаря (замість window.confirm)
 */
export function showSlusarConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "slusar-confirm-overlay";

    const modal = document.createElement("div");
    modal.className = "slusar-confirm-modal";

    const messageDiv = document.createElement("div");
    messageDiv.className = "slusar-confirm-message";
    messageDiv.textContent = message;

    const buttonsDiv = document.createElement("div");
    buttonsDiv.className = "slusar-confirm-buttons";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "slusar-confirm-btn slusar-confirm-ok";
    confirmBtn.textContent = "Підтвердити";
    confirmBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "slusar-confirm-btn slusar-confirm-cancel";
    cancelBtn.textContent = "Відмінити";
    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };

    buttonsDiv.appendChild(confirmBtn);
    buttonsDiv.appendChild(cancelBtn);
    modal.appendChild(messageDiv);
    modal.appendChild(buttonsDiv);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Фокус на кнопку "Підтвердити"
    setTimeout(() => confirmBtn.focus(), 100);

    // Escape закриває вікно
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        document.body.removeChild(overlay);
        document.removeEventListener("keydown", handleEscape);
        resolve(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
  });
}
