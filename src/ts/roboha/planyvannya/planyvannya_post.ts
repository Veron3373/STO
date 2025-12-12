/**
 * Модуль для модалки створення нового поста
 * planyvannya_post.ts
 */

export interface PostData {
  title: string;
  subtitle: string;
}

export type PostSubmitCallback = (data: PostData) => void;

export class PostModal {
  private modalOverlay: HTMLElement | null = null;
  private onSubmitCallback: PostSubmitCallback | null = null;

  constructor() {
    this.createModalHTML();
    this.bindEvents();
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
            <div class="post-form-group">
              <label class="post-form-label" id="postPostFormLabelTitle">Назва поста</label>
              <input type="text" class="post-form-input" id="postPostFormInputTitle" placeholder="Наприклад: Пост 8">
            </div>
            <div class="post-form-group" id="postPostFormGroupSubtitle" style="display: flex;">
              <label class="post-form-label">Опис (необов'язково)</label>
              <input type="text" class="post-form-input" id="postPostFormInputSubtitle" placeholder="Наприклад: 2 стоєчний">
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
  }

  /**
   * Відкриває модалку для створення поста
   * @param onSubmit Колбек при успішному створенні
   */
  public open(onSubmit: PostSubmitCallback): void {
    this.onSubmitCallback = onSubmit;

    const inputTitle = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
    const inputSubtitle = document.getElementById('postPostFormInputSubtitle') as HTMLInputElement;

    if (inputTitle) inputTitle.value = '';
    if (inputSubtitle) inputSubtitle.value = '';

    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'flex';
      setTimeout(() => inputTitle?.focus(), 100);
    }
  }

  /**
   * Закриває модалку
   */
  public close(): void {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'none';
    }
    this.onSubmitCallback = null;
  }

  /**
   * Обробляє submit форми
   */
  private handleSubmit(): void {
    const inputTitle = document.getElementById('postPostFormInputTitle') as HTMLInputElement;
    const inputSubtitle = document.getElementById('postPostFormInputSubtitle') as HTMLInputElement;

    const title = inputTitle?.value.trim() || '';
    const subtitle = inputSubtitle?.value.trim() || '';

    if (!title) {
      alert('Введіть назву поста!');
      return;
    }

    if (this.onSubmitCallback) {
      this.onSubmitCallback({ title, subtitle });
    }

    this.close();
  }
}
