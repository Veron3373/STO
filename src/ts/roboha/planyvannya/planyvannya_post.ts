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

interface AutocompleteData {
  categories: string[];
  postNames: string[];
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
      // Завантажуємо категорії з post_category
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("post_category")
        .select("category");

      if (categoriesError) throw categoriesError;
      this.autocompleteData.categories = categoriesData?.map((item: any) => item.category) || [];

      // Завантажуємо назви постів з post_name
      const { data: postNamesData, error: postNamesError } = await supabase
        .from("post_name")
        .select("name");

      if (postNamesError) throw postNamesError;
      this.autocompleteData.postNames = postNamesData?.map((item: any) => item.name) || [];

      // Завантажуємо імена слюсарів з slyusars
      const { data: slyusarsData, error: slyusarsError } = await supabase
        .from("slyusars")
        .select("data");

      if (slyusarsError) throw slyusarsError;
      this.autocompleteData.slyusarNames = slyusarsData
        ?.filter((item: any) => item.data?.Name)
        .map((item: any) => item.data.Name) || [];

      // Видаляємо дублікати
      this.autocompleteData.categories = [...new Set(this.autocompleteData.categories)];
      this.autocompleteData.postNames = [...new Set(this.autocompleteData.postNames)];
      this.autocompleteData.slyusarNames = [...new Set(this.autocompleteData.slyusarNames)];

      console.log("✅ Дані для автодоповнення завантажено:", this.autocompleteData);
    } catch (error) {
      console.error("❌ Помилка завантаження даних для автодоповнення:", error);
    }
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
              <input type="text" class="post-form-input" id="postCehFormInputTitle" placeholder="Наприклад: ЦЕХ 3" autocomplete="off">
              <div class="post-autocomplete-dropdown" id="postCehDropdown"></div>
            </div>
            <div class="post-form-group post-autocomplete-wrapper">
              <label class="post-form-label" id="postPostFormLabelTitle">Назва поста</label>
              <input type="text" class="post-form-input" id="postPostFormInputTitle" placeholder="Наприклад: Пост 8" autocomplete="off">
              <div class="post-autocomplete-dropdown" id="postPostNameDropdown"></div>
            </div>
            <div class="post-form-group post-autocomplete-wrapper" id="postPostFormGroupSubtitle" style="display: flex;">
              <label class="post-form-label">Опис (необов'язково)</label>
              <input type="text" class="post-form-input" id="postPostFormInputSubtitle" placeholder="Наприклад: Пазич С. Ю." autocomplete="off">
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

    // Прив'язуємо автодоповнення до інпутів
    this.setupAutocomplete(
      'postCehFormInputTitle',
      'postCehDropdown',
      () => this.autocompleteData.categories
    );

    this.setupAutocomplete(
      'postPostFormInputTitle',
      'postPostNameDropdown',
      () => this.autocompleteData.postNames
    );

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
        // Показуємо всі варіанти при пустому полі (перші 10)
        this.showDropdown(dropdown, data.slice(0, 10), input);
      } else {
        // Фільтруємо за введеним текстом
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        ).slice(0, 10);

        this.showDropdown(dropdown, filtered, input);
      }
    });

    // При фокусі показуємо dropdown
    input.addEventListener('focus', () => {
      const data = getDataFn();
      const value = input.value.toLowerCase().trim();

      if (value.length === 0) {
        this.showDropdown(dropdown, data.slice(0, 10), input);
      } else {
        const filtered = data.filter(item =>
          item.toLowerCase().includes(value)
        ).slice(0, 10);
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
  private handleKeyboardNavigation(e: KeyboardEvent, dropdown: HTMLElement, input: HTMLInputElement): void {
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
