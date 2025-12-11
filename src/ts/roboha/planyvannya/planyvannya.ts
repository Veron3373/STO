import { supabase } from "../../vxid/supabaseClient";

interface Post {
  id: number;
  title: string;
  subtitle: string;
  namber: number;
}

interface Section {
  id: number;
  name: string;
  collapsed: boolean;
  posts: Post[];
}

interface Sluysar {
  slyusar_id: number;
  sluysar_name: string;
  namber: number;
  post_name: string;
  category: string;
}

class SchedulerApp {
  private sections: Section[] = [];
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

  private async init(): Promise<void> {
    // Завантажити дані з БД
    await this.loadDataFromDatabase();

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

  private async loadDataFromDatabase(): Promise<void> {
    try {
      // Запит 1: Отримуємо всіх слюсарів
      const { data: slyusarsData, error: slyusarsError } = await supabase
        .from("slyusars")
        .select("*");

      if (slyusarsError) {
        throw slyusarsError;
      }

      // Запит 2: Отримуємо всі пости
      const { data: postsData, error: postsError } = await supabase
        .from("post_name")
        .select("*");

      if (postsError) {
        throw postsError;
      }

      if (!slyusarsData || !postsData) {
        throw new Error("Помилка завантаження даних");
      }

      // Створюємо Map для швидкого пошуку постів
      const postsMap = new Map<number, any>(
        postsData.map((post: any) => [post.post_name_id, post])
      );

      // Трансформація даних
      const slyusars: Sluysar[] = slyusarsData
        .map((item: any) => {
          const post = postsMap.get(parseInt(item.post_sluysar));
          if (!post) return null;

          return {
            slyusar_id: item.slyusar_id,
            sluysar_name: item.data.Name,
            namber: item.namber,
            post_name: post.name as string,
            category: post.category as string
          };
        })
        .filter((item: Sluysar | null): item is Sluysar => item !== null);

      this.transformDataToSections(slyusars);
    } catch (error) {
      console.error("❌ Помилка завантаження даних з БД:", error);
      this.showError("Не вдалося завантажити дані. Спробуйте пізніше.");
    }
  }

  private transformDataToSections(data: Sluysar[]): void {
    // Групування за category
    const grouped = data.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, Sluysar[]>);

    // Створення секцій
    this.sections = Object.entries(grouped).map(([category, items], index) => {
      // Сортування за namber всередині категорії
      items.sort((a, b) => a.namber - b.namber);

      return {
        id: index + 1,
        name: category,
        collapsed: false,
        posts: items.map(item => ({
          id: item.slyusar_id,
          title: item.post_name,
          subtitle: item.sluysar_name,
          namber: item.namber
        }))
      };
    });

    // Сортування секцій за мінімальним namber у кожній секції
    this.sections.sort((a, b) => {
      const minA = Math.min(...a.posts.map(p => p.namber));
      const minB = Math.min(...b.posts.map(p => p.namber));
      return minA - minB;
    });
  }

  private showError(message: string): void {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.style.animation = "slideOut 0.3s ease";
      setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
  }

  private toggleEditMode(): void {
    if (!this.editMode) {
      const userData = this.getUserAccessLevel();
      if (!userData || userData.Доступ !== "Адміністратор") {
        this.showAccessDeniedModal();
        return;
      }
    }

    this.editMode = !this.editMode;

    if (this.editModeBtn) {
      this.editModeBtn.classList.toggle("active", this.editMode);
    }

    if (this.schedulerWrapper) {
      if (this.editMode) {
        this.schedulerWrapper.classList.add("edit-mode");
      } else {
        this.schedulerWrapper.classList.remove("edit-mode");
      }
    }
  }

  private getUserAccessLevel(): { Name: string; Доступ: string } | null {
    try {
      const storedData = localStorage.getItem("userAuthData");
      if (!storedData) return null;
      return JSON.parse(storedData);
    } catch (error) {
      console.error("❌ Помилка при читанні даних користувача з localStorage:", error);
      return null;
    }
  }

  private showAccessDeniedModal(): void {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;

    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
      max-width: 450px;
      animation: slideIn 0.3s ease;
    `;

    const icon = document.createElement("div");
    icon.style.cssText = `
      font-size: 64px;
      margin-bottom: 20px;
    `;
    icon.textContent = "🔒";

    const title = document.createElement("h2");
    title.style.cssText = `
      margin: 0 0 15px 0;
      color: white;
      font-size: 28px;
      font-weight: 600;
    `;
    title.textContent = "Доступ заборонено";

    const message = document.createElement("p");
    message.style.cssText = `
      margin: 0 0 30px 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 16px;
      line-height: 1.6;
    `;
    message.textContent = "Режим редагування доступний тільки для адміністратора. Зверніться до адміністратора для отримання доступу.";

    const button = document.createElement("button");
    button.style.cssText = `
      background: white;
      color: #667eea;
      border: none;
      padding: 14px 36px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    `;
    button.textContent = "Зрозуміло";

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.3)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.2)";
    });

    button.addEventListener("click", () => {
      modal.style.animation = "fadeOut 0.3s ease";
      setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.animation = "fadeOut 0.3s ease";
        setTimeout(() => modal.remove(), 300);
      }
    });

    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes slideIn {
        from {
          transform: translateY(-50px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    modalContent.appendChild(icon);
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(button);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
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
          namber: 0
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
      const sectionGroup = document.createElement("div");
      sectionGroup.className = "post-section-group";

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

      const sectionContent = document.createElement("div");
      sectionContent.className = "post-section-content";
      if (section.collapsed) sectionContent.classList.add("hidden");

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
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]
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