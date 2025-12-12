import { supabase } from "../../vxid/supabaseClient";
import { PostModal, type PostData } from "./planyvannya_post";
import { CehModal, type CehData } from "./planyvannya_ceh";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

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

// Інтерфейс для відстеження позицій
interface PositionData {
  slyusar_id: number;
  original_namber: number;
  current_namber: number;
}

class SchedulerApp {
  private sections: Section[] = [];
  private editMode: boolean = false;

  private today: Date;
  private selectedDate: Date;
  private viewYear: number;
  private viewMonth: number;

  private schedulerWrapper: HTMLElement | null;
  private calendarGrid: HTMLElement | null;
  private headerDateDisplay: HTMLElement | null;
  private timeHeader: HTMLElement | null;
  private calendarContainer: HTMLElement | null;
  private editModeBtn: HTMLElement | null;

  // Модалки
  private postModal: PostModal;
  private cehModal: CehModal;

  // Drag and Drop
  private draggedElement: HTMLElement | null = null;
  private draggedSectionId: number | null = null;
  private draggedPostId: number | null = null;
  private dragPlaceholder: HTMLElement | null = null;

  // Position Tracking - відстеження позицій
  private initialPositions: PositionData[] = [];
  private deletedSlyusarIds: number[] = [];

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
    this.editModeBtn = document.getElementById("postEditModeBtn");

    // Ініціалізація модалок
    this.postModal = new PostModal();
    this.cehModal = new CehModal();

    this.init();
  }

  private async init(): Promise<void> {
    // Завантажити дані з БД
    await this.loadDataFromDatabase();

    // Перевіряємо чи користувач адміністратор і створюємо кнопку редагування
    this.createEditButtonIfAdmin();

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

    // Edit Mode (тільки якщо кнопка була створена)
    if (this.editModeBtn) {
      this.editModeBtn.addEventListener("click", () => this.toggleEditMode());
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

      // Трансформація даних - фільтруємо записи з пустим namber
      const slyusars: Sluysar[] = slyusarsData
        .filter((item: any) => item.namber !== null && item.namber !== undefined)
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
    showNotification(message, "error", 5000);
  }

  private toggleEditMode(): void {
    if (this.editMode) {
      // Закриваємо режим редагування - перевіряємо чи є зміни
      this.handleEditModeClose();
    } else {
      // Відкриваємо режим редагування - зберігаємо початковий стан
      this.openEditMode();
    }
  }

  private openEditMode(): void {
    this.editMode = true;
    this.deletedSlyusarIds = [];

    // Зберігаємо початкові позиції
    this.saveInitialPositions();

    if (this.editModeBtn) {
      this.editModeBtn.classList.add("active");
    }

    if (this.schedulerWrapper) {
      this.schedulerWrapper.classList.add("edit-mode");
    }
  }

  private saveInitialPositions(): void {
    this.initialPositions = [];

    this.sections.forEach((section, sectionIndex) => {
      section.posts.forEach((post, postIndex) => {
        const namber = (sectionIndex + 1) + (postIndex + 1) / 10;
        this.initialPositions.push({
          slyusar_id: post.id,
          original_namber: post.namber,
          current_namber: namber
        });
      });
    });
  }

  private calculateCurrentPositions(): PositionData[] {
    const currentPositions: PositionData[] = [];

    this.sections.forEach((section, sectionIndex) => {
      section.posts.forEach((post, postIndex) => {
        const namber = (sectionIndex + 1) + (postIndex + 1) / 10;
        const initial = this.initialPositions.find(p => p.slyusar_id === post.id);
        currentPositions.push({
          slyusar_id: post.id,
          original_namber: initial?.original_namber ?? post.namber,
          current_namber: namber
        });
      });
    });

    return currentPositions;
  }

  private checkForChanges(): boolean {
    // Якщо є видалені елементи - є зміни
    if (this.deletedSlyusarIds.length > 0) {
      return true;
    }

    const currentPositions = this.calculateCurrentPositions();

    for (const current of currentPositions) {
      const initial = this.initialPositions.find(p => p.slyusar_id === current.slyusar_id);
      if (!initial) return true;
      if (Math.abs(initial.current_namber - current.current_namber) > 0.001) {
        return true;
      }
    }

    return false;
  }

  private handleEditModeClose(): void {
    const hasChanges = this.checkForChanges();

    if (hasChanges) {
      this.showConfirmationDialog();
    } else {
      this.closeEditMode();
    }
  }

  private showConfirmationDialog(): void {
    // Створюємо модальне вікно підтвердження
    const overlay = document.createElement("div");
    overlay.className = "post-confirm-overlay";
    overlay.innerHTML = `
      <div class="post-confirm-modal">
        <div class="post-confirm-title">Змінити дані налаштування?</div>
        <div class="post-confirm-buttons">
          <button class="post-confirm-btn post-confirm-yes">Так</button>
          <button class="post-confirm-btn post-confirm-no">Ні</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const yesBtn = overlay.querySelector(".post-confirm-yes");
    const noBtn = overlay.querySelector(".post-confirm-no");

    yesBtn?.addEventListener("click", async () => {
      overlay.remove();
      await this.savePositionsToDatabase();
      this.closeEditMode();
    });

    noBtn?.addEventListener("click", () => {
      overlay.remove();
      // Відновлюємо початковий стан - перезавантажуємо дані з БД
      showNotification("Зміни скасовано", "warning");
      this.restoreInitialState();
    });
  }

  private async savePositionsToDatabase(): Promise<void> {
    const currentPositions = this.calculateCurrentPositions();

    try {
      // Оновлюємо кожну позицію в БД
      for (const pos of currentPositions) {
        const { error } = await supabase
          .from("slyusars")
          .update({ namber: pos.current_namber })
          .eq("slyusar_id", pos.slyusar_id);

        if (error) {
          console.error(`❌ Помилка оновлення slyusar_id ${pos.slyusar_id}:`, error);
          throw error;
        }
      }

      // Очищаємо namber для видалених елементів
      for (const deletedId of this.deletedSlyusarIds) {
        const { error } = await supabase
          .from("slyusars")
          .update({ namber: null })
          .eq("slyusar_id", deletedId);

        if (error) {
          console.error(`❌ Помилка очищення namber для slyusar_id ${deletedId}:`, error);
          throw error;
        }
      }

      console.log("✅ Позиції успішно збережено в БД");
      showNotification("Налаштування успішно збережено!", "success");
    } catch (error) {
      console.error("❌ Помилка збереження позицій:", error);
      this.showError("Не вдалося зберегти налаштування. Спробуйте пізніше.");
    }
  }

  private async restoreInitialState(): Promise<void> {
    // Перезавантажуємо дані з БД для відновлення початкового стану
    await this.loadDataFromDatabase();
    this.renderSections();
    this.closeEditMode();
  }

  private closeEditMode(): void {
    this.editMode = false;
    this.initialPositions = [];
    this.deletedSlyusarIds = [];

    if (this.editModeBtn) {
      this.editModeBtn.classList.remove("active");
    }

    if (this.schedulerWrapper) {
      this.schedulerWrapper.classList.remove("edit-mode");
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

  private createEditButtonIfAdmin(): void {
    const userData = this.getUserAccessLevel();

    // Тільки для адміністратора створюємо кнопку
    if (userData && userData.Доступ === "Адміністратор") {
      const aside = document.getElementById("postMiniCalendar");
      if (!aside) return;

      const editButton = document.createElement("button");
      editButton.className = "post-edit-mode-btn";
      editButton.id = "postEditModeBtn";
      editButton.title = "Режим редагування";

      editButton.innerHTML = `
        <span class="icon-view">🔒</span>
        <span class="icon-edit">🔓</span>
      `;

      aside.appendChild(editButton);

      // Зберігаємо посилання на кнопку
      this.editModeBtn = editButton;
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
    // Знаходимо секцію для отримання назви та всіх slyusar_id постів
    const section = this.sections.find((s) => s.id === sectionId);
    if (section) {
      const sectionName = section.name;

      // Додаємо всі slyusar_id постів до списку видалених
      section.posts.forEach((post) => {
        if (!this.deletedSlyusarIds.includes(post.id)) {
          this.deletedSlyusarIds.push(post.id);
        }
      });

      this.sections = this.sections.filter((s) => s.id !== sectionId);
      this.renderSections();

      // Показуємо повідомлення
      showNotification(`Видалено цех: ${sectionName}`, "warning");
    }
  }

  private deletePost(sectionId: number, postId: number): void {
    const section = this.sections.find((s) => s.id === sectionId);
    if (section) {
      // Знаходимо пост для отримання назви
      const post = section.posts.find((p) => p.id === postId);
      if (post) {
        const postTitle = post.title;
        const postSubtitle = post.subtitle;

        // Додаємо slyusar_id до списку видалених
        if (!this.deletedSlyusarIds.includes(postId)) {
          this.deletedSlyusarIds.push(postId);
        }

        section.posts = section.posts.filter((p) => p.id !== postId);
        this.renderSections();

        // Показуємо повідомлення
        showNotification(`Видалено пост: ${postTitle} - ${postSubtitle}`, "warning");
      }
    }
  }

  /**
   * Відкриває модалку для додавання цеху
   */
  private openAddSectionModal(): void {
    this.cehModal.open((data: CehData) => {
      this.sections.push({
        id: Date.now(),
        name: data.title,
        collapsed: false,
        posts: [],
      });
      this.renderSections();
    });
  }

  /**
   * Відкриває модалку для додавання поста
   */
  private openAddPostModal(sectionId: number): void {
    this.postModal.open((data: PostData) => {
      const section = this.sections.find((s) => s.id === sectionId);
      if (section) {
        section.posts.push({
          id: Date.now(),
          title: data.title,
          subtitle: data.subtitle,
          namber: 0
        });
        this.renderSections();
      }
    });
  }

  private renderSections(): void {
    const calendarGrid = this.calendarGrid;
    if (!calendarGrid) return;

    calendarGrid.innerHTML = "";

    // Створюємо фонову сітку для ідеального вирівнювання з хедером
    const bgGrid = document.createElement("div");
    bgGrid.className = "post-grid-background";
    for (let i = 0; i < 24; i++) {
      const cell = document.createElement("div");
      bgGrid.appendChild(cell);
    }
    calendarGrid.appendChild(bgGrid);

    this.sections.forEach((section, sectionIndex) => {
      const sectionGroup = document.createElement("div");
      sectionGroup.className = "post-section-group";
      sectionGroup.dataset.sectionId = section.id.toString();
      sectionGroup.dataset.sectionIndex = sectionIndex.toString();

      const sectionHeader = document.createElement("div");
      sectionHeader.className = "post-section-header";

      const headerLeft = document.createElement("div");
      headerLeft.className = "post-section-header-left";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = section.name;
      headerLeft.appendChild(nameSpan);

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

      // Drag and drop для всього хедера секції - тільки в режимі редагування
      sectionHeader.addEventListener("mousedown", (e) => {
        if (!this.editMode) return;

        // Не починати drag якщо клікнуто на кнопках
        const target = e.target as HTMLElement;
        if (target.closest('.post-delete-btn') || target.closest('.post-toggle-btn')) return;

        e.preventDefault();
        this.startSectionDrag(e, sectionGroup, section.id);
      });

      // Click для toggle - тільки якщо НЕ в режимі редагування
      sectionHeader.addEventListener("click", (e) => {
        if (this.editMode) return;
        const target = e.target as HTMLElement;
        if (target.closest('.post-delete-btn')) return;
        this.toggleSection(section.id);
      });

      const sectionContent = document.createElement("div");
      sectionContent.className = "post-section-content";
      sectionContent.dataset.sectionId = section.id.toString();
      if (section.collapsed) sectionContent.classList.add("hidden");

      section.posts.forEach((post, postIndex) => {
        const row = document.createElement("div");
        row.className = "post-unified-row";
        row.dataset.postId = post.id.toString();
        row.dataset.postIndex = postIndex.toString();
        row.dataset.sectionId = section.id.toString();

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
        postDeleteBtn.onclick = (e) => {
          e.stopPropagation();
          this.deletePost(section.id, post.id);
        };

        deleteContainer.appendChild(labelContent);
        deleteContainer.appendChild(postDeleteBtn);
        rowLabel.appendChild(deleteContainer);

        // Drag and drop для всього rowLabel - тільки в режимі редагування
        rowLabel.addEventListener("mousedown", (e) => {
          if (!this.editMode) return;

          // Не починати drag якщо клікнуто на кнопці видалення
          const target = e.target as HTMLElement;
          if (target.closest('.post-post-delete-btn')) return;

          e.preventDefault();
          this.startPostDrag(e, row, section.id, post.id);
        });

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

  // ============== DRAG AND DROP ДЛЯ СЕКЦІЙ ==============
  private startSectionDrag(_e: MouseEvent, element: HTMLElement, sectionId: number): void {
    this.draggedElement = element;
    this.draggedSectionId = sectionId;

    // Створюємо плейсхолдер
    this.dragPlaceholder = document.createElement("div");
    this.dragPlaceholder.className = "post-drag-placeholder post-section-placeholder";
    this.dragPlaceholder.style.height = `${element.offsetHeight}px`;

    // Додаємо клас для перетягування
    element.classList.add("dragging");

    // Фіксуємо позицію елемента
    const rect = element.getBoundingClientRect();
    element.style.position = "fixed";
    element.style.width = `${rect.width}px`;
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.zIndex = "1000";
    element.style.pointerEvents = "none";

    // Вставляємо плейсхолдер
    element.parentNode?.insertBefore(this.dragPlaceholder, element);

    const onMouseMove = (e: MouseEvent) => {
      if (!this.draggedElement) return;

      const newTop = e.clientY - rect.height / 2;
      this.draggedElement.style.top = `${newTop}px`;

      // Знаходимо елемент під курсором для визначення нової позиції
      this.updateSectionPlaceholder(e.clientY);
    };

    const onMouseUp = () => {
      this.finishSectionDrag();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  private updateSectionPlaceholder(mouseY: number): void {
    if (!this.dragPlaceholder || !this.calendarGrid) return;

    const sectionGroups = Array.from(this.calendarGrid.querySelectorAll(".post-section-group:not(.dragging)"));

    for (const group of sectionGroups) {
      const rect = group.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (mouseY < midpoint) {
        group.parentNode?.insertBefore(this.dragPlaceholder, group);
        return;
      }
    }

    // Якщо курсор нижче всіх секцій - ставимо в кінець (перед кнопкою додавання)
    const addBtn = this.calendarGrid.querySelector(".post-add-section-btn");
    if (addBtn) {
      addBtn.parentNode?.insertBefore(this.dragPlaceholder, addBtn);
    }
  }

  private finishSectionDrag(): void {
    if (!this.draggedElement || !this.dragPlaceholder || !this.calendarGrid) return;

    // Визначаємо нову позицію
    const sectionGroups = Array.from(this.calendarGrid.querySelectorAll(".post-section-group:not(.dragging), .post-drag-placeholder"));

    // Знаходимо реальний індекс
    let newIndex = 0;
    for (let i = 0; i < sectionGroups.length; i++) {
      if (sectionGroups[i] === this.dragPlaceholder) break;
      if (!sectionGroups[i].classList.contains("dragging") && !sectionGroups[i].classList.contains("post-drag-placeholder")) {
        newIndex++;
      }
    }

    // Переміщуємо секцію в масиві
    const oldIndex = this.sections.findIndex(s => s.id === this.draggedSectionId);
    if (oldIndex !== -1 && newIndex !== oldIndex) {
      const [movedSection] = this.sections.splice(oldIndex, 1);
      // Коригуємо індекс, якщо переміщуємо вниз
      const adjustedIndex = newIndex > oldIndex ? newIndex : newIndex;
      this.sections.splice(adjustedIndex, 0, movedSection);
    }

    // Очищуємо
    this.draggedElement.classList.remove("dragging");
    this.draggedElement.style.position = "";
    this.draggedElement.style.width = "";
    this.draggedElement.style.left = "";
    this.draggedElement.style.top = "";
    this.draggedElement.style.zIndex = "";
    this.draggedElement.style.pointerEvents = "";

    this.dragPlaceholder.remove();
    this.dragPlaceholder = null;
    this.draggedElement = null;
    this.draggedSectionId = null;

    // Перемальовуємо
    this.renderSections();
  }

  // ============== DRAG AND DROP ДЛЯ ПОСТІВ ==============
  private startPostDrag(_e: MouseEvent, element: HTMLElement, sectionId: number, postId: number): void {
    this.draggedElement = element;
    this.draggedSectionId = sectionId;
    this.draggedPostId = postId;

    // Створюємо плейсхолдер
    this.dragPlaceholder = document.createElement("div");
    this.dragPlaceholder.className = "post-drag-placeholder post-post-placeholder";
    this.dragPlaceholder.style.height = `${element.offsetHeight}px`;

    // Додаємо клас для перетягування
    element.classList.add("dragging");

    // Фіксуємо позицію елемента
    const rect = element.getBoundingClientRect();
    element.style.position = "fixed";
    element.style.width = `${rect.width}px`;
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.zIndex = "1000";
    element.style.pointerEvents = "none";

    // Вставляємо плейсхолдер
    element.parentNode?.insertBefore(this.dragPlaceholder, element);

    const onMouseMove = (e: MouseEvent) => {
      if (!this.draggedElement) return;

      const newTop = e.clientY - rect.height / 2;
      this.draggedElement.style.top = `${newTop}px`;

      // Знаходимо елемент під курсором для визначення нової позиції
      this.updatePostPlaceholder(e.clientY, sectionId);
    };

    const onMouseUp = () => {
      this.finishPostDrag(sectionId);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  private updatePostPlaceholder(mouseY: number, sectionId: number): void {
    if (!this.dragPlaceholder || !this.calendarGrid) return;

    // Знаходимо контент секції
    const sectionContent = this.calendarGrid.querySelector(`.post-section-content[data-section-id="${sectionId}"]`);
    if (!sectionContent) return;

    const postRows = Array.from(sectionContent.querySelectorAll(".post-unified-row:not(.dragging)"));

    for (const row of postRows) {
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (mouseY < midpoint) {
        row.parentNode?.insertBefore(this.dragPlaceholder, row);
        return;
      }
    }

    // Якщо курсор нижче всіх постів - ставимо перед кнопкою додавання
    const addBtn = sectionContent.querySelector(".post-add-post-btn");
    if (addBtn) {
      addBtn.parentNode?.insertBefore(this.dragPlaceholder, addBtn);
    }
  }

  private finishPostDrag(sectionId: number): void {
    if (!this.draggedElement || !this.dragPlaceholder || !this.calendarGrid) return;

    const section = this.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Знаходимо контент секції
    const sectionContent = this.calendarGrid.querySelector(`.post-section-content[data-section-id="${sectionId}"]`);
    if (!sectionContent) return;

    // Визначаємо нову позицію
    const allElements = Array.from(sectionContent.querySelectorAll(".post-unified-row, .post-drag-placeholder"));

    let newIndex = 0;
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i] === this.dragPlaceholder) break;
      if (!allElements[i].classList.contains("dragging") && !allElements[i].classList.contains("post-drag-placeholder")) {
        newIndex++;
      }
    }

    // Переміщуємо пост в масиві
    const oldIndex = section.posts.findIndex(p => p.id === this.draggedPostId);
    if (oldIndex !== -1 && newIndex !== oldIndex) {
      const [movedPost] = section.posts.splice(oldIndex, 1);
      section.posts.splice(newIndex, 0, movedPost);
    }

    // Очищуємо
    this.draggedElement.classList.remove("dragging");
    this.draggedElement.style.position = "";
    this.draggedElement.style.width = "";
    this.draggedElement.style.left = "";
    this.draggedElement.style.top = "";
    this.draggedElement.style.zIndex = "";
    this.draggedElement.style.pointerEvents = "";

    this.dragPlaceholder.remove();
    this.dragPlaceholder = null;
    this.draggedElement = null;
    this.draggedSectionId = null;
    this.draggedPostId = null;

    // Перемальовуємо
    this.renderSections();
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