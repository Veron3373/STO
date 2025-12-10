interface Post {
  id: number;
  title: string;
  subtitle: string;
}

interface Section {
  id: number;
  name: string;
  collapsed: boolean;
  posts: Post[];
}

class SchedulerApp {
  private sections: Section[] = [
    {
      id: 1,
      name: "Підвал №1",
      collapsed: false,
      posts: [
        {
          id: 1,
          title: "🔧 Пост збирання двигунів",
          subtitle: "👨‍🔧 Брацлавець Б.С",
        },
        { id: 2, title: "Пост 2", subtitle: "4 стоєчний УУК" },
        { id: 3, title: "Пост 3", subtitle: "2 стоєчний" },
      ],
    },
    {
      id: 2,
      name: "ЦЕХ 2",
      collapsed: false,
      posts: [
        { id: 4, title: "Пост 4", subtitle: "2 стоєчний" },
        { id: 5, title: "Пост 5", subtitle: "Електрик" },
        { id: 6, title: "Пост 6", subtitle: "2 стоєчний" },
      ],
    },
    {
      id: 3,
      name: "МИЙКА",
      collapsed: false,
      posts: [{ id: 7, title: "Пост 7", subtitle: "Мийка" }],
    },
    {
      id: 4,
      name: "НАГАДУВАННЯ",
      collapsed: false,
      posts: [],
    },
  ];

  private editMode: boolean = false;
  private modalType: "section" | "post" = "section";
  private modalTargetSection: number | null = null;

  private today: Date;
  private selectedDate: Date;
  private viewYear: number;
  private viewMonth: number;

  private schedulerWrapper: HTMLElement | null;
  private calendarGrid: HTMLElement | null;
  private headerDateDisplay: HTMLElement | null;
  private timeHeader: HTMLElement | null;
  private calendarContainer: HTMLElement | null;
  private modalOverlay: HTMLElement | null;
  private editModeBtn: HTMLElement | null;

  constructor() {
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);

    this.selectedDate = new Date(this.today);
    this.viewYear = this.today.getFullYear();
    this.viewMonth = this.today.getMonth();

    this.schedulerWrapper = document.getElementById("postSchedulerWrapper");
    this.calendarGrid = document.getElementById("postCalendarGrid");
    this.headerDateDisplay = document.getElementById("postHeaderDateDisplay");
    this.timeHeader = document.getElementById("postTimeHeader");
    this.calendarContainer = document.getElementById("postCalendarContainer");
    this.modalOverlay = document.getElementById("postModalOverlay");
    this.editModeBtn = document.getElementById("postEditModeBtn");

    this.init();
  }

  private init(): void {
    // Навігація днями
    const headerPrev = document.getElementById("headerNavPrev");
    const headerNext = document.getElementById("headerNavNext");
    const todayBtn = document.getElementById("postTodayBtn");
    if (headerPrev)
      headerPrev.addEventListener("click", () => this.changeDate(-1));
    if (headerNext)
      headerNext.addEventListener("click", () => this.changeDate(1));
    if (todayBtn) todayBtn.addEventListener("click", () => this.goToToday());

    // Навігація місяцями
    const monthPrev = document.getElementById("postYearPrev");
    const monthNext = document.getElementById("postYearNext");
    if (monthPrev)
      monthPrev.addEventListener("click", () => this.changeMonth(-1));
    if (monthNext)
      monthNext.addEventListener("click", () => this.changeMonth(1));

    // Edit Mode
    if (this.editModeBtn) {
      this.editModeBtn.addEventListener("click", () => this.toggleEditMode());
    }

    // Modal
    const modalClose = document.getElementById("postModalClose");
    const modalCancel = document.getElementById("postModalCancel");
    const modalSubmit = document.getElementById("postModalSubmit");

    if (modalClose)
      modalClose.addEventListener("click", () => this.closeModal());
    if (modalCancel)
      modalCancel.addEventListener("click", () => this.closeModal());
    if (modalSubmit)
      modalSubmit.addEventListener("click", () => this.handleModalSubmit());
    if (this.modalOverlay) {
      this.modalOverlay.addEventListener("click", (e) => {
        if (e.target === this.modalOverlay) this.closeModal();
      });
    }

    this.render();
    this.updateTimeMarker();
    setInterval(() => this.updateTimeMarker(), 60000);
  }

  private toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editModeBtn) {
      if (this.editMode) {
        this.editModeBtn.classList.add("active");
      } else {
        this.editModeBtn.classList.remove("active");
      }
    }
    if (this.schedulerWrapper) {
      if (this.editMode) {
        this.schedulerWrapper.classList.add("edit-mode");
      } else {
        this.schedulerWrapper.classList.remove("edit-mode");
      }
    }
  }

  private updateTimeMarker(): void {
    const now = new Date();
    const startOfToday = new Date(this.today);
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);

    let decimal = 0;

    if (selected < startOfToday) {
      decimal = 1;
    } else if (selected.getTime() === startOfToday.getTime()) {
      const startHour = 8;
      const endHour = 20;
      const totalMinutes = (endHour - startHour) * 60;
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      let minutesPassed = (currentHour - startHour) * 60 + currentMin;
      if (minutesPassed < 0) minutesPassed = 0;
      if (minutesPassed > totalMinutes) minutesPassed = totalMinutes;
      decimal = minutesPassed / totalMinutes;
    } else {
      decimal = 0;
    }

    if (this.timeHeader) {
      (this.timeHeader as HTMLElement).style.setProperty(
        "--past-percentage",
        decimal.toString()
      );
    }
    if (this.schedulerWrapper) {
      (this.schedulerWrapper as HTMLElement).style.setProperty(
        "--past-percentage",
        decimal.toString()
      );
    }
  }

  private goToToday(): void {
    this.selectedDate = new Date(this.today);
    this.viewMonth = this.today.getMonth();
    this.viewYear = this.today.getFullYear();
    this.render();
  }

  private changeDate(delta: number): void {
    this.selectedDate.setDate(this.selectedDate.getDate() + delta);
    this.viewMonth = this.selectedDate.getMonth();
    this.viewYear = this.selectedDate.getFullYear();
    this.render();
  }

  private changeMonth(delta: number): void {
    this.viewMonth += delta;
    if (this.viewMonth < 0) {
      this.viewMonth = 11;
      this.viewYear--;
    } else if (this.viewMonth > 11) {
      this.viewMonth = 0;
      this.viewYear++;
    }
    this.render();
  }

  private toggleSection(sectionId: number): void {
    const section = this.sections.find((s) => s.id === sectionId);
    if (section) {
      section.collapsed = !section.collapsed;
      this.renderSections();
    }
  }

  private deleteSection(sectionId: number): void {
    if (confirm("Видалити цей цех?")) {
      this.sections = this.sections.filter((s) => s.id !== sectionId);
      this.renderSections();
    }
  }

  private deletePost(sectionId: number, postId: number): void {
    if (confirm("Видалити цей пост?")) {
      const section = this.sections.find((s) => s.id === sectionId);
      if (section) {
        section.posts = section.posts.filter((p) => p.id !== postId);
        this.renderSections();
      }
    }
  }

  private openAddSectionModal(): void {
    this.modalType = "section";
    this.modalTargetSection = null;
    this.showModal("Новий цех", "Назва цеху", "Наприклад: ЦЕХ 3", false);
  }

  private openAddPostModal(sectionId: number): void {
    this.modalType = "post";
    this.modalTargetSection = sectionId;
    this.showModal("Новий пост", "Назва поста", "Наприклад: Пост 8", true);
  }

  private showModal(
    title: string,
    label: string,
    placeholder: string,
    showSubtitle: boolean
  ): void {
    const modalTitle = document.getElementById("postModalTitle");
    const formLabel = document.getElementById("postFormLabelTitle");
    const formInput = document.getElementById(
      "postFormInputTitle"
    ) as HTMLInputElement;
    const formGroupSubtitle = document.getElementById("postFormGroupSubtitle");
    const formInputSubtitle = document.getElementById(
      "postFormInputSubtitle"
    ) as HTMLInputElement;

    if (modalTitle) modalTitle.textContent = title;
    if (formLabel) formLabel.textContent = label;
    if (formInput) {
      formInput.placeholder = placeholder;
      formInput.value = "";
    }
    if (formInputSubtitle) formInputSubtitle.value = "";
    if (formGroupSubtitle) {
      formGroupSubtitle.style.display = showSubtitle ? "flex" : "none";
    }

    if (this.modalOverlay) {
      this.modalOverlay.style.display = "flex";
      setTimeout(() => formInput?.focus(), 100);
    }
  }

  private closeModal(): void {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = "none";
    }
  }

  private handleModalSubmit(): void {
    const formInput = document.getElementById(
      "postFormInputTitle"
    ) as HTMLInputElement;
    const formInputSubtitle = document.getElementById(
      "postFormInputSubtitle"
    ) as HTMLInputElement;

    const title = formInput?.value.trim() || "";
    const subtitle = formInputSubtitle?.value.trim() || "";

    if (!title) {
      alert("Введіть назву!");
      return;
    }

    if (this.modalType === "section") {
      this.sections.push({
        id: Date.now(),
        name: title,
        collapsed: false,
        posts: [],
      });
    } else if (this.modalType === "post" && this.modalTargetSection !== null) {
      const section = this.sections.find(
        (s) => s.id === this.modalTargetSection
      );
      if (section) {
        section.posts.push({
          id: Date.now(),
          title: title,
          subtitle: subtitle,
        });
      }
    }

    this.closeModal();
    this.renderSections();
  }

  private renderSections(): void {
    const calendarGrid = this.calendarGrid;
    if (!calendarGrid) return;

    calendarGrid.innerHTML = "";

    this.sections.forEach((section) => {
      // Section Group
      const sectionGroup = document.createElement("div");
      sectionGroup.className = "post-section-group";

      // Section Header
      const sectionHeader = document.createElement("div");
      sectionHeader.className = "post-section-header";

      const headerLeft = document.createElement("div");
      headerLeft.className = "post-section-header-left";
      headerLeft.innerHTML = `<span>${section.name}</span>`;

      const headerRight = document.createElement("div");
      headerRight.className = "post-section-header-right";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "post-delete-btn";
      deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        this.deleteSection(section.id);
      };

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "post-toggle-btn";
      if (section.collapsed) toggleBtn.classList.add("collapsed");
      toggleBtn.textContent = "▼";

      headerRight.appendChild(deleteBtn);
      headerRight.appendChild(toggleBtn);

      sectionHeader.appendChild(headerLeft);
      sectionHeader.appendChild(headerRight);
      sectionHeader.onclick = () => this.toggleSection(section.id);

      // Section Content
      const sectionContent = document.createElement("div");
      sectionContent.className = "post-section-content";
      if (section.collapsed) sectionContent.classList.add("hidden");

      // Posts
      section.posts.forEach((post) => {
        const row = document.createElement("div");
        row.className = "post-unified-row";

        const rowLabel = document.createElement("div");
        rowLabel.className = "post-row-label";

        const deleteContainer = document.createElement("div");
        deleteContainer.className = "post-post-delete-container";

        const labelContent = document.createElement("div");
        labelContent.className = "post-row-label-content";
        labelContent.innerHTML = `
                    <div class="post-post-title">${post.title}</div>
                    <div class="post-post-subtitle">${post.subtitle}</div>
                `;

        const postDeleteBtn = document.createElement("button");
        postDeleteBtn.className = "post-post-delete-btn";
        postDeleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>`;
        postDeleteBtn.onclick = () => this.deletePost(section.id, post.id);

        deleteContainer.appendChild(labelContent);
        deleteContainer.appendChild(postDeleteBtn);
        rowLabel.appendChild(deleteContainer);

        const rowTrack = document.createElement("div");
        rowTrack.className = "post-row-track";

        row.appendChild(rowLabel);
        row.appendChild(rowTrack);
        sectionContent.appendChild(row);
      });

      // Add Post Button
      const addPostBtn = document.createElement("button");
      addPostBtn.className = "post-add-post-btn";
      addPostBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Додати пост
            `;
      addPostBtn.onclick = () => this.openAddPostModal(section.id);
      sectionContent.appendChild(addPostBtn);

      sectionGroup.appendChild(sectionHeader);
      sectionGroup.appendChild(sectionContent);

      calendarGrid.appendChild(sectionGroup);
    });

    // Add Section Button
    const addSectionBtn = document.createElement("button");
    addSectionBtn.className = "post-add-section-btn";
    addSectionBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Додати цех
        `;
    addSectionBtn.onclick = () => this.openAddSectionModal();
    calendarGrid.appendChild(addSectionBtn);
  }

  private formatFullDate(date: Date): string {
    const days = [
      "Неділя",
      "Понеділок",
      "Вівторок",
      "Середа",
      "Четвер",
      "Пʼятниця",
      "Субота",
    ];
    const months = [
      "січня",
      "лютого",
      "березня",
      "квітня",
      "травня",
      "червня",
      "липня",
      "серпня",
      "вересня",
      "жовтня",
      "листопада",
      "грудня",
    ];
    return `${days[date.getDay()]}, ${date.getDate()} ${
      months[date.getMonth()]
    } ${date.getFullYear()}`;
  }

  private getMonthName(monthIndex: number): string {
    const months = [
      "Січень",
      "Лютий",
      "Березень",
      "Квітень",
      "Травень",
      "Червень",
      "Липень",
      "Серпень",
      "Вересень",
      "Жовтень",
      "Листопад",
      "Грудень",
    ];
    return months[monthIndex];
  }

  private renderMonth(year: number, month: number): HTMLElement {
    const monthDiv = document.createElement("div");
    monthDiv.className = "post-month-calendar";

    const h3 = document.createElement("h3");
    h3.textContent = this.getMonthName(month);
    monthDiv.appendChild(h3);

    const weekdaysDiv = document.createElement("div");
    weekdaysDiv.className = "post-weekdays";
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].forEach((d) => {
      const span = document.createElement("span");
      span.textContent = d;
      weekdaysDiv.appendChild(span);
    });
    monthDiv.appendChild(weekdaysDiv);

    const daysDiv = document.createElement("div");
    daysDiv.className = "post-days";

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;

    for (let i = 1; i < startDay; i++) {
      daysDiv.appendChild(document.createElement("span"));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const span = document.createElement("span");
      span.textContent = day.toString();
      const current = new Date(year, month, day);

      if (current.toDateString() === this.selectedDate.toDateString()) {
        span.className = "post-selected-date";
      } else if (current.toDateString() === this.today.toDateString()) {
        span.className = "post-today";
      }

      span.addEventListener("click", () => {
        this.selectedDate = new Date(year, month, day);
        this.render();
      });

      daysDiv.appendChild(span);
    }

    monthDiv.appendChild(daysDiv);
    return monthDiv;
  }

  private render(): void {
    if (this.headerDateDisplay) {
      this.headerDateDisplay.textContent = this.formatFullDate(
        this.selectedDate
      );
    }

    const yearDisplay = document.getElementById("postYearDisplay");
    if (yearDisplay) {
      yearDisplay.textContent = this.viewYear.toString();
    }

    this.updateTimeMarker();
    this.renderSections();

    if (this.calendarContainer) {
      this.calendarContainer.innerHTML = "";
      this.calendarContainer.appendChild(
        this.renderMonth(this.viewYear, this.viewMonth)
      );

      let nextMonth = this.viewMonth + 1;
      let nextYear = this.viewYear;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear++;
      }
      this.calendarContainer.appendChild(this.renderMonth(nextYear, nextMonth));
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SchedulerApp();
});
