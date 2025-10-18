/** Універсальний автокомпліт для глобального поля пошуку у вкладках
 *   - Показує <div id="custom-dropdown-all_other_bases"> ПІД полем
 *   - Нічого не вставляє всередину інпута, працює поверх (absolute)
 */
export function wireGlobalAutocomplete(items: string[]) {
  const input = document.getElementById("search-input-all_other_bases") as HTMLInputElement | null;
  const dd    = document.getElementById("custom-dropdown-all_other_bases") as HTMLDivElement | null;
  if (!input || !dd) return;

  const render = (q: string) => {
    const ql = (q ?? "").toLowerCase();
    const list = items.filter(x => x.toLowerCase().includes(ql)).slice(0, 200);
    if (!list.length) { dd.classList.add("hidden-all_other_bases"); dd.innerHTML = ""; return; }

    dd.innerHTML = "";
    for (const v of list) {
      const el = document.createElement("div");
      el.className = "custom-dropdown-item";
      el.textContent = v;
      el.addEventListener("click", () => {
        input.value = v;               // просто підставляємо значення
        dd.classList.add("hidden-all_other_bases");
        input.dispatchEvent(new Event("change"));
      });
      dd.appendChild(el);
    }
    dd.classList.remove("hidden-all_other_bases");
  };

  input.addEventListener("input", () => render(input.value));
  input.addEventListener("focus", () => render(input.value));
  document.addEventListener("click", (e) => {
    if (e.target !== input && !dd.contains(e.target as Node)) {
      dd.classList.add("hidden-all_other_bases");
    }
  });
}
