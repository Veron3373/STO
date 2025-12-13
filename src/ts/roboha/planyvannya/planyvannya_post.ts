/**
 * Модуль для модалки створення нового поста
 * planyvannya_post.ts
 */

import { supabase } from "../../vxid/supabaseClient";

export interface PostData {
  cehTitle: string;
  title: string;
  subtitle: string;
}

export type PostSubmitCallback = (data: PostData) => void;

interface CategoryData {
  category_id: number;
  category: string;
}

interface PostNameData {
  post_id: number;
  name: string;
  category: number; // category_id в post_name
}

interface AutocompleteData {
  categories: CategoryData[];
  postNames: PostNameData[];
  slyusarNames: string[];
}

export class PostModal {
  private modalOverlay: HTMLElement | null = null;
  private onSubmitCallback: PostSubmitCallback | null = null;
  private autocompleteData: AutocompleteData = {
    categories: [],
    postNames: [],
    slyusarNames: []
  };
  private activeDropdowns: HTMLElement[] = [];
  private selectedCategoryId: number | null = null;

  constructor() {
    this.createModalHTML();
    this.bindEvents();
    this.loadAutocompleteData();
  }

  /**
   * Завантажує дані для автодоповнення з бази даних
   */
  private async loadAutocompleteData(): Promise<void> {
    try {
      // Завантажуємо категорії з post_category (з id)
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("post_category")
        .select("category_id, category");

      if (categoriesError) throw categoriesError;
      this.autocompleteData.categories = categoriesData || [];

      // Завантажуємо назви постів з post_name (з category)
      const { data: postNamesData, error: postNamesError } = await supabase
        .from("post_name")
        .select("post_id, name, category");

      if (postNamesError) throw postNamesError;
      this.autocompleteData.postNames = postNamesData || [];

      // Завантажуємо імена слюсарів з slyusars
      const { data: slyusarsData, error: slyusarsError } = await supabase
        .from("slyusars")
        .select("data");

      if (slyusarsError) throw slyusarsError;
      this.autocompleteData.slyusarNames = slyusarsData
        ?.filter((item: any) => item.data?.Name)
        .map((item: any) => item.data.Name) || [];

      // Видаляємо дублікати для слюсарів
      this.autocompleteData.slyusarNames = [...new Set(this.autocompleteData.slyusarNames)];

      console.log("✅ Дані для автодоповнення завантажено:", this.autocompleteData);
    } catch (error) {
      console.error("❌ Помилка завантаження даних для автодоповнення:", error);
    }
  }

  /**
   * Повертає назви категорій
   */
  private getCategoryNames(): string[] {
    return this.autocompleteData.categories.map(c => c.category);
  }

  /**
   * Повертає пости, відфільтровані за обраною категорією
   */
  private getFilteredPostNames(): string[] {
    if (this.selectedCategoryId === null) {
      // Якщо категорія не обрана - повертаємо всі пости
      return this.autocompleteData.postNames.map(p => p.name);
    }

    // Фільтруємо пости за category_id
    return this.autocompleteData.postNames
      .filter(p => p.category === this.selectedCategoryId)
      .map(p => p.name);
  }

  /**
   * Знаходить category_id за назвою категорії
   */
  private findCategoryIdByName(categoryName: string): number | null {
    const category = this.autocompleteData.categories
      .find(c => c.category.toLowerCase() === categoryName.toLowerCase());
    return category ? category.category_id : null;
  }

  /**
   * Створює HTML модалки для поста
   */
  private createModalHTML(): void {
    // Перевіряємо чи модалка вже існує
    if (document.getElementById('postPostModalOverlay')) {
      this.modalOverlay = document.getElementById('postPostModalOverlay');
      return;
    }

    const modalHTML = `
      <div class="post-modal-overlay" id="postPostModalOverlay" style="display: none;">
        <div class="post-modal" id="postPostModal">
          <div class="post-modal-header">
            <h2 class="post-modal-title" id="postPostModalTitle">Новий пост</h2>
            <button class="post-modal-close" id="postPostModalClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="post-modal-body">
            <div class="post-form-group post-autocomplete-wrapper">
              <label class="post-form-label" id="postCehFormLabelTitle">Назва цеху</label>
              <input type="text" class="post-form-input" id="postCehFormInputTitle" placeholder="Наприклад: ЦЕХ зварювання" autocomplete="off">
              <div class="post-autocomplete-dropdown" id="postCehDropdown"></div>
            </div>
            <div class="post-form-group post-autocomplete-wrapper">
              <label class="post-form-label" id="postPostFormLabelTitle">Назва поста</label>
              <input type="text" class="post-form-input" id="postPostFormInputTitle" placeholder="Наприклад: Пост розвал-сходження" autocomplete="off">
              <div class="post-autocomplete-dropdown" id="postPostNameDropdown"></div>
            </div>
            <div class="post-form-group post-autocomplete-wrapper" id="postPostFormGroupSubtitle" style="display: flex;">
              <label class="post-form-label">Опис (необов'язково)</label>
              <input type="text" class="post-form-input" id="postPostFormInputSubtitle" placeholder="Наприклад: Брацлавець Б. С." autocomplete="off">
              <div class="post-autocomplete-dropdown" id="postSlyusarDropdown"></div>
            </div>
          </div>
          <div class="post-modal-footer">
            <button class="post-btn post-btn-secondary" id="postPostModalCancel">Скасувати</button>
            <button class="post-btn post-btn-primary" id="postPostModalSubmit">Створити</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modalOverlay = document.getElementById('postPostModalOverlay');
  }

  /**
   * Прив'язує події до елементів модалки
   */
  private bindEvents(): void {
    const closeBtn = document.getElementById('postPostModalClose');
    const cancelBtn = document.getElementById('postPostModalCancel');
    const submitBtn = document.getElementById('postPostModalSubmit');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit());
    }

    if (this.modalOverlay) {
      this.modalOverlay.addEventListener('click', (e) => {
        if (e.target === this.modalOverlay) {
          this.close();
        }
      });
    }

    // Прив'язуємо автодоповнення до категорій
    this.setupCategoryAutocomplete();

    // Прив'язуємо автодоповнення до постів
    this.setupPostNameAutocomplete();

    // Прив'язуємо автодоповнення до слюсарів
    this.setupAutocomplete(
      'postPostFormInputSubtitle',
      'postSlyusarDropdown',
      () => this.autocompleteData.slyusarNames
    );

    // Закриття dropdown при кліку поза ним
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.post-autocomplete-wrapper')) {
        this.closeAllDropdowns();
      }
    });
  }

  /**
   * Налаштовує автодоповнення для категорій
   */
  private setupCategoryAutocomplete(): void {
    const input = document.getElementById('postCehFormInputTitle') as HTMLInputElement;
    const dropdown = document.getElementById('postCehDropdown');
    const postInput = document.getElementById('postPostFormInputTitle') as HTMLInputElement;

    if (!input || !dropdown) return;

    // При введенні тексту
    input.addEventListener('input', () => {
      const value = input.value.toLowerCase().trim();
      const data = this.getCategoryNames();

      // Оновлюємо selectedCategoryId
      this.selectedCategoryId = this.findCategoryIdByName(input.value.trim());

      // Очищуємо поле поста якщо змінилась категорія
      if (postInput) postInput.value = '';

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown
    // При кліку показуємо dropdown
    input.addEventListener('click', () => {
      const data = this.getCategoryNames();
      const value = input.value.toLowerCase().trim();

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown тільки якщо є текст
    input.addEventListener('focus', () => {
      const value = input.value.toLowerCase().trim();
      if (value.length > 0) {
        const data = this.getCategoryNames();
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При виборі категорії
    input.addEventListener('change', () => {
      this.selectedCategoryId = this.findCategoryIdByName(input.value.trim());
    });

    // Навігація клавіатурою
    input.addEventListener('keydown', (e) => {
      this.handleKeyboardNavigation(e, dropdown, input, () => {
        // При виборі через клавіатуру оновлюємо selectedCategoryId
        this.selectedCategoryId = this.findCategoryIdByName(input.value.trim());
        if (postInput) postInput.value = '';
      });
    });
  }

  /**
   * Налаштовує автодоповнення для назв постів
   */
  private setupPostNameAutocomplete(): void {
    const input = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
    const dropdown = document.getElementById('postPostNameDropdown');
    const categoryInput = document.getElementById('postCehFormInputTitle') as HTMLInputElement;

    if (!input || !dropdown) return;

    // При введенні тексту
    input.addEventListener('input', () => {
      // Оновлюємо selectedCategoryId на основі поточного значення категорії
      if (categoryInput) {
        this.selectedCategoryId = this.findCategoryIdByName(categoryInput.value.trim());
      }

      const value = input.value.toLowerCase().trim();
      const data = this.getFilteredPostNames();

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown
    // При кліку показуємо dropdown
    input.addEventListener('click', () => {
      // Оновлюємо selectedCategoryId на основі поточного значення категорії
      if (categoryInput) {
        this.selectedCategoryId = this.findCategoryIdByName(categoryInput.value.trim());
      }

      const data = this.getFilteredPostNames();
      const value = input.value.toLowerCase().trim();

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown тільки якщо є текст
    input.addEventListener('focus', () => {
      const value = input.value.toLowerCase().trim();
      if (value.length > 0) {
        if (categoryInput) {
          this.selectedCategoryId = this.findCategoryIdByName(categoryInput.value.trim());
        }
        const data = this.getFilteredPostNames();
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // Навігація клавіатурою
    input.addEventListener('keydown', (e) => {
      this.handleKeyboardNavigation(e, dropdown, input);
    });
  }

  /**
   * Налаштовує автодоповнення для конкретного інпуту
   */
  private setupAutocomplete(
    inputId: string,
    dropdownId: string,
    getDataFn: () => string[]
  ): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown) return;

    // При введенні тексту
    input.addEventListener('input', () => {
      const value = input.value.toLowerCase().trim();
      const data = getDataFn();

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown
    // При кліку показуємо dropdown
    input.addEventListener('click', () => {
      const data = getDataFn();
      const value = input.value.toLowerCase().trim();

      if (value.length === 0) {
        this.showDropdown(dropdown, data, input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown тільки якщо є текст
    input.addEventListener('focus', () => {
      const value = input.value.toLowerCase().trim();
      if (value.length > 0) {
        const data = getDataFn();
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        );
        this.showDropdown(dropdown, filtered, input);
      }
    });

    // Навігація клавіатурою
    input.addEventListener('keydown', (e) => {
      this.handleKeyboardNavigation(e, dropdown, input);
    });
  }

  /**
   * Показує dropdown з варіантами
   */
  private showDropdown(dropdown: HTMLElement, items: string[], input: HTMLInputElement): void {
    this.closeAllDropdowns();

    if (items.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = '';

    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'post-autocomplete-option';
      option.textContent = item;
      option.dataset.index = index.toString();

      option.addEventListener('click', () => {
        input.value = item;
        dropdown.style.display = 'none';

        // Якщо це категорія - оновлюємо selectedCategoryId
        if (input.id === 'postCehFormInputTitle') {
          this.selectedCategoryId = this.findCategoryIdByName(item);
          const postInput = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
          if (postInput) postInput.value = '';
        }

        input.focus();
      });

      option.addEventListener('mouseenter', () => {
        this.setActiveOption(dropdown, index);
      });

      dropdown.appendChild(option);
    });

    dropdown.style.display = 'block';
    this.activeDropdowns.push(dropdown);
  }

  /**
   * Обробка навігації клавіатурою
   */
  private handleKeyboardNavigation(
    e: KeyboardEvent,
    dropdown: HTMLElement,
    input: HTMLInputElement,
    onSelect?: () => void
  ): void {
    if (dropdown.style.display !== 'block') return;

    const options = dropdown.querySelectorAll('.post-autocomplete-option');
    const activeOption = dropdown.querySelector('.post-autocomplete-option.active');
    let currentIndex = activeOption ? parseInt(activeOption.getAttribute('data-index') || '-1') : -1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        currentIndex = Math.min(currentIndex + 1, options.length - 1);
        this.setActiveOption(dropdown, currentIndex);
        break;

      case 'ArrowUp':
        e.preventDefault();
        currentIndex = Math.max(currentIndex - 1, 0);
        this.setActiveOption(dropdown, currentIndex);
        break;

      case 'Enter':
        e.preventDefault();
        if (activeOption) {
          input.value = activeOption.textContent || '';
          dropdown.style.display = 'none';
          if (onSelect) onSelect();
        }
        break;

      case 'Escape':
        dropdown.style.display = 'none';
        break;
    }
  }

  /**
   * Встановлює активну опцію в dropdown
   */
  private setActiveOption(dropdown: HTMLElement, index: number): void {
    const options = dropdown.querySelectorAll('.post-autocomplete-option');
    options.forEach((option, i) => {
      option.classList.toggle('active', i === index);
    });

    // Скролимо до активної опції
    const activeOption = dropdown.querySelector('.post-autocomplete-option.active');
    if (activeOption) {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Закриває всі dropdown
   */
  private closeAllDropdowns(): void {
    this.activeDropdowns.forEach(dropdown => {
      dropdown.style.display = 'none';
    });
    this.activeDropdowns = [];
  }

  /**
   * Оновлює дані для автодоповнення
   */
  public async refreshAutocompleteData(): Promise<void> {
    await this.loadAutocompleteData();
  }

  /**
   * Відкриває модалку для створення поста
   * @param onSubmit Колбек при успішному створенні
   * @param prefillCehTitle Попередньо заповнена назва цеху (опціонально)
   */
  public open(onSubmit: PostSubmitCallback, prefillCehTitle?: string): void {
    this.onSubmitCallback = onSubmit;

    // Оновлюємо дані автодоповнення при відкритті модалки
    this.loadAutocompleteData();

    const inputCehTitle = document.getElementById('postCehFormInputTitle') as HTMLInputElement;
    const inputTitle = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
    const inputSubtitle = document.getElementById('postPostFormInputSubtitle') as HTMLInputElement;

    if (inputCehTitle) inputCehTitle.value = prefillCehTitle || '';
    if (inputTitle) inputTitle.value = '';
    if (inputSubtitle) inputSubtitle.value = '';

    // Оновлюємо selectedCategoryId якщо є prefillCehTitle
    if (prefillCehTitle) {
      this.selectedCategoryId = this.findCategoryIdByName(prefillCehTitle);
    } else {
      this.selectedCategoryId = null;
    }

    // Закриваємо всі dropdown
    this.closeAllDropdowns();

    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'flex';
      // Фокус на перше пусте поле
      if (prefillCehTitle) {
        setTimeout(() => inputTitle?.focus(), 100);
      } else {
        setTimeout(() => inputCehTitle?.focus(), 100);
      }
    }
  }

  /**
   * Закриває модалку
   */
  public close(): void {
    this.closeAllDropdowns();
    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'none';
    }
    this.onSubmitCallback = null;
    this.selectedCategoryId = null;
  }

  /**
   * Обробляє submit форми
   */
  private handleSubmit(): void {
    const inputCehTitle = document.getElementById('postCehFormInputTitle') as HTMLInputElement;
    const inputTitle = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
    const inputSubtitle = document.getElementById('postPostFormInputSubtitle') as HTMLInputElement;

    const cehTitle = inputCehTitle?.value.trim() || '';
    const title = inputTitle?.value.trim() || '';
    const subtitle = inputSubtitle?.value.trim() || '';

    if (!cehTitle) {
      alert('Введіть назву цеху!');
      return;
    }

    if (!title) {
      alert('Введіть назву поста!');
      return;
    }

    if (this.onSubmitCallback) {
      this.onSubmitCallback({ cehTitle, title, subtitle });
    }

    this.close();
  }
}
