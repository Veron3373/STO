// src\ts\roboha\zakaz_naraudy\inhi\vspluvauhe_povidomlenna.ts

export type NotificationType = "success" | "error" | "warning" | "info";

// Функція для показу красивих сповіщень
export function showNotification(
  message: string,
  type: NotificationType = "info",
  duration: number = 3000
): void {
  const colors = {
    success: { bg: "#10b981", border: "#059669" },
    error: { bg: "#ef4444", border: "#dc2626" },
    warning: { bg: "#f59e0b", border: "#d97706" },
    info: { bg: "#3b82f6", border: "#2563eb" },
  };

  const icons = {
    success: "",
    error: "",
    warning: "",
    info: "",
  };

  const notification = document.createElement("div");
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 18px;">${icons[type]}</span>
      <span>${message}</span>
    </div>
  `;

  Object.assign(notification.style, {
    position: "fixed",
    top: "20px",
    left: "20px", // Змінено з 'right' на 'left'
    backgroundColor: colors[type].bg,
    color: "white",
    padding: "16px 24px",
    borderRadius: "12px",
    zIndex: "10001",
    boxShadow: "0 8px 25px rgba(0,0,0,0.15)",
    fontSize: "15px",
    fontWeight: "500",
    minWidth: "300px",
    border: `2px solid ${colors[type].border}`,
    backdropFilter: "blur(10px)",
    transform: "translateX(-100%)", // Змінено з '100%' на '-100%' для появи зліва
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    cursor: "pointer",
  });

  document.body.appendChild(notification);

  // Анімація появи
  requestAnimationFrame(() => {
    notification.style.transform = "translateX(0)";
  });

  // Автоматичне закриття
  const autoCloseTimeout = setTimeout(() => {
    notification.style.transform = "translateX(-100%)"; // Змінено для зникнення вліво
    notification.style.opacity = "0";

    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, duration);

  // Закриття при натисканні
  notification.addEventListener("click", () => {
    clearTimeout(autoCloseTimeout);
    notification.style.transform = "translateX(-100%)"; // Змінено для зникнення вліво
    notification.style.opacity = "0";
    setTimeout(() => notification.remove(), 300);
  });

  // Ефекти при наведенні
  notification.addEventListener("mouseenter", () => {
    notification.style.transform = "translateX(0) scale(1.02)";
  });

  notification.addEventListener("mouseleave", () => {
    notification.style.transform = "translateX(0) scale(1)";
  });
}

// Покращена функція для модального вікна збереження
export function showSavePromptModal(
  savePromptModalId: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById(savePromptModalId);
    if (!modal) return resolve(false);

    modal.style.display = "flex";

    const confirmBtn = document.getElementById("save-confirm")!;
    const cancelBtn = document.getElementById("save-cancel")!;

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const onConfirm = () => {
      cleanup();
      showNotification("Дані успішно збережено", "success");
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      showNotification("Скасовано користувачем", "warning");
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}
