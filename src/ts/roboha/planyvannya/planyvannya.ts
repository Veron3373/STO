document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let selectedDate = new Date(today);
  let viewYear = today.getFullYear();

  // DOM елементи
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

  // Навігація
  todayBtn.addEventListener("click", () => { selectedDate = new Date(today); render(); });
  prevDayBtn.addEventListener("click", () => { selectedDate.setDate(selectedDate.getDate() - 1); render(); });
  nextDayBtn.addEventListener("click", () => { selectedDate.setDate(selectedDate.getDate() + 1); render(); });
  prevYearBtn.addEventListener("click", () => { viewYear--; render(); });
  nextYearBtn.addEventListener("click", () => { viewYear++; render(); });

  // Синхронізація скролів
  sidebarEl.addEventListener("scroll", () => {
    gridSectionsEl.scrollTop = sidebarEl.scrollTop;
  });
  gridSectionsEl.addEventListener("scroll", () => {
    sidebarEl.scrollTop = gridSectionsEl.scrollTop;
  });

  // Згортання цехів
  for (let i = 1; i <= 4; i++) {
    const toggleBtn = document.getElementById(`postToggleBtn${i}`) as HTMLButtonElement;
    const header = document.getElementById(`postSubLocation${i}`) as HTMLElement;
    const postsList = document.getElementById(`postPostsList${i}`) as HTMLElement | null;
    const gridContainer = document.querySelector(`.post-grid-section[data-section="${i}"] .post-grid-posts-container`) as HTMLElement | null;

    if (!toggleBtn || !header) continue;

    const toggle = () => {
      const isHidden = postsList?.classList.toggle("hidden") ?? false;
      gridContainer?.classList.toggle("hidden", isHidden);
      toggleBtn.textContent = isHidden ? "Right Arrow" : "Down Arrow";
      toggleBtn.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
    };

    toggleBtn.addEventListener("click", e => { e.stopPropagation(); toggle(); });
    header.addEventListener("click", () => toggleBtn.click());
  }

  // Формат дати
  const formatFullDate = (d: Date) => {
    const days = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];
    const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Рендер
  const render = () => {
    headerDateEl.textContent = formatFullDate(selectedDate);
    yearDisplayEl.textContent = viewYear.toString();
    renderMiniCalendar();
  };

  const renderMiniCalendar = () => {
    miniCalendarContainer.innerHTML = "";
    const months = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

    for (let m = 0; m < 12; m++) {
      const div = document.createElement("div");
      div.className = "post-month-calendar";
      div.innerHTML = `<h3>${months[m]}</h3>`;

      const weekdays = document.createElement("div");
      weekdays.className = "post-weekdays";
      ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].forEach(d => {
        const s = document.createElement("span"); s.textContent = d; weekdays.appendChild(s);
      });
      div.appendChild(weekdays);

      const days = document.createElement("div");
      days.className = "post-days";

      const first = new Date(viewYear, m, 1).getDay();
      const offset = first === 0 ? 6 : first - 1;
      for (let i = 0; i < offset; i++) days.appendChild(document.createElement("span"));

      const daysInMonth = new Date(viewYear, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const span = document.createElement("span");
        span.textContent = d.toString();
        const thisDate = new Date(viewYear, m, d);
        if (thisDate.toDateString() === today.toDateString()) span.classList.add("post-today");
        if (thisDate.toDateString() === selectedDate.toDateString()) span.classList.add("post-selected-date");
        span.addEventListener("click", () => { selectedDate = new Date(viewYear, m, d); render(); });
        days.appendChild(span);
      }
      div.appendChild(days);
      miniCalendarContainer.appendChild(div);
    }
  };

  // Демо-записи
  const addDemo = () => {
    const demos = [
      {p:1,s:2,e:6,m:"LAND ROVER RANGE ROVER",n:"А 001 АА 77",c:"Володимир Іванов",st:"no-show"},
      {p:1,s:6,e:11,m:"LAND ROVER DISCOVERY4",n:"А 001 АА 77",c:"Дмитро Орешкін",st:"in-progress"}
    ];
    demos.forEach(a => {
      const row = document.querySelector(`.post-grid-row[data-post-id="${a.p}"]`) as HTMLElement;
      if (!row) return;
      const el = document.createElement("div");
      el.className = `post-appointment post-${a.st}`;
      el.style.gridColumn = `${a.s} / ${a.e}`;
      el.innerHTML = `<div class="post-car-model">${a.m}</div><div class="post-car-number">${a.n}</div><div class="post-client-name">${a.c}</div>`;
      row.appendChild(el);
    });
  };

  render();
  addDemo();
});