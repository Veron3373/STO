// src/ts/roboha/planyvannya/planyvannya.ts

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let selectedDate = new Date(today);
  let viewYear = today.getFullYear();

  // ──────────────────────────────────────────────
  // DOM елементи
  // ──────────────────────────────────────────────
  const headerDateEl = document.getElementById("postHeaderDateDisplay") as HTMLElement;
  const yearDisplayEl = document.getElementById("postYearDisplay") as HTMLElement;
  const sidebarEl = document.getElementById("postSidebar") as HTMLElement;
  const gridSectionsEl = document.getElementById("postGridSections") as HTMLElement;
  const miniCalendarContainer = document.getElementById("postCalendarContainer") as HTMLElement;

  // Кнопки
  const todayBtn = document.getElementById("postTodayBtn") as HTMLButtonElement;
  const prevDayBtn = document.getElementById("headerNavPrev") as HTMLButtonElement;
  const nextDayBtn = document.getElementById("headerNavNext") as HTMLButtonElement;
  const prevYearBtn = document.getElementById("postYearPrev") as HTMLButtonElement;
  const nextYearBtn = document.getElementById("postYearNext") as HTMLButtonElement;

  // ──────────────────────────────────────────────
  // Навігація
  // ──────────────────────────────────────────────
  todayBtn.addEventListener("click", () => {
    selectedDate = new Date(today);
    render();
  });

  prevDayBtn.addEventListener("click", () => {
    selectedDate.setDate(selectedDate.getDate() - 1);
    render();
  });

  nextDayBtn.addEventListener("click", () => {
    selectedDate.setDate(selectedDate.getDate() + 1);
    render();
  });

  prevYearBtn.addEventListener("click", () => {
    viewYear--;
    render();
  });

  nextYearBtn.addEventListener("click", () => {
    viewYear++;
    render();
  });

  // ──────────────────────────────────────────────
  // Синхронізація скролів — ВИПРАВЛЕНО!
  // ──────────────────────────────────────────────
  sidebarEl.addEventListener("scroll", () => {
    gridSectionsEl.scrollTop = sidebarEl.scrollTop;
  });

  gridSectionsEl.addEventListener("scroll", () => {
    sidebarEl.scrollTop = gridSectionsEl.scrollTop;
  });

  // ──────────────────────────────────────────────
  // Згортання цехів
  // ──────────────────────────────────────────────
  for (let i = 1; i <= 4; i++) {
    const toggleBtn = document.getElementById(`postToggleBtn${i}`) as HTMLButtonElement;
    const header = document.getElementById(`postSubLocation${i}`) as HTMLElement;
    const postsList = document.getElementById(`postPostsList${i}`) as HTMLElement | null;
    const gridContainer = document.querySelector(
      `.post-grid-section[data-section="${i}"] .post-grid-posts-container`
    ) as HTMLElement | null;

    if (!toggleBtn || !header) continue;

    const toggle = () => {
      const isHidden = postsList?.classList.toggle("hidden") ?? false;
      gridContainer?.classList.toggle("hidden", isHidden);

      toggleBtn.textContent = isHidden ? "Right Arrow" : "Down Arrow";
      toggleBtn.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
    };

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });

    header.addEventListener("click", () => toggleBtn.click());
  }

  // ──────────────────────────────────────────────
  // Формат дати
  // ──────────────────────────────────────────────
  const formatFullDate = (date: Date): string => {
    const days = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];
    const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // ──────────────────────────────────────────────
  // Рендер
  // ──────────────────────────────────────────────
  const render = () => {
    headerDateEl.textContent = formatFullDate(selectedDate);
    yearDisplayEl.textContent = viewYear.toString();
    renderMiniCalendar();
  };

  const renderMiniCalendar = () => {
    miniCalendarContainer.innerHTML = "";

    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

    for (let m = 0; m < 12; m++) {
      const monthDiv = document.createElement("div");
      monthDiv.className = "post-month-calendar";

      const h3 = document.createElement("h3");
      h3.textContent = monthNames[m];
      monthDiv.appendChild(h3);

      const weekdays = document.createElement("div");
      weekdays.className = "post-weekdays";
      ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].forEach((d) => {
        const span = document.createElement("span");
        span.textContent = d;
        weekdays.appendChild(span);
      });
      monthDiv.appendChild(weekdays);

      const daysGrid = document.createElement("div");
      daysGrid.className = "post-days";

      const firstDay = new Date(viewYear, m, 1).getDay();
      const offset = firstDay === 0 ? 6 : firstDay - 1;

      for (let i = 0; i < offset; i++) {
        daysGrid.appendChild(document.createElement("span"));
      }

      const daysInMonth = new Date(viewYear, m + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const span = document.createElement("span");
        span.textContent = d.toString();

        const thisDate = new Date(viewYear, m, d);

        if (thisDate.toDateString() === today.toDateString()) {
          span.classList.add("post-today");
        }
        if (thisDate.toDateString() === selectedDate.toDateString()) {
          span.classList.add("post-selected-date");
        }

        span.addEventListener("click", () => {
          selectedDate = new Date(viewYear, m, d);
          render();
        });

        daysGrid.appendChild(span);
      }

      monthDiv.appendChild(daysGrid);
      miniCalendarContainer.appendChild(monthDiv);
    }
  };

  // ──────────────────────────────────────────────
  // Демо-записи (видали, коли підключиш бекенд)
  // ──────────────────────────────────────────────
  const addDemoAppointments = () => {
    const appointments = [
      { postId: 1, start: 2, end: 6, model: "LAND ROVER RANGE ROVER", number: "А 001 АА 77", client: "Володимир Іванов", status: "no-show" },
      { postId: 1, start: 6, end: 11, model: "LAND ROVER DISCOVERY4", number: "А 001 АА 77", client: "Дмитро Орешкін", status: "in-progress" },
    ];

    appointments.forEach((app) => {
      const row = document.querySelector(`.post-grid-row[data-post-id="${app.postId}"]`) as HTMLElement;
      if (!row) return;

      const el = document.createElement("div");
      el.className = `post-appointment post-${app.status}`;
      el.style.gridColumn = `${app.start} / ${app.end}`;
      el.innerHTML = `
        <div class="post-car-model">${app.model}</div>
        <div class="post-car-number">${app.number}</div>
        <div class="post-client-name">${app.client}</div>
      `;
      row.appendChild(el);
    });
  };

  // ──────────────────────────────────────────────
  // Старт
  // ──────────────────────────────────────────────
  render();
  addDemoAppointments();
});