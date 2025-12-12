/**
 * Модуль для модалки створення нового цеху
 * nalachtuvannay_ceh.ts
 */

export interface CehData {
    title: string;
}

export type CehSubmitCallback = (data: CehData) => void;

export class CehModal {
    private modalOverlay: HTMLElement | null = null;
    private onSubmitCallback: CehSubmitCallback | null = null;

    constructor() {
        this.createModalHTML();
        this.bindEvents();
    }

    /**
     * Створює HTML модалки для цеху
     */
    private createModalHTML(): void {
        // Перевіряємо чи модалка вже існує
        if (document.getElementById('postCehModalOverlay')) {
            this.modalOverlay = document.getElementById('postCehModalOverlay');
            return;
        }

        const modalHTML = `
      <div class="post-modal-overlay" id="postCehModalOverlay" style="display: none;">
        <div class="post-modal" id="postCehModal">
          <div class="post-modal-header">
            <h2 class="post-modal-title" id="postCehModalTitle">Новий цех</h2>
            <button class="post-modal-close" id="postCehModalClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="post-modal-body">
            <div class="post-form-group">
              <label class="post-form-label" id="postCehFormLabelTitle">Назва цеху</label>
              <input type="text" class="post-form-input" id="postCehFormInputTitle" placeholder="Наприклад: ЦЕХ 3">
            </div>
            <div class="post-form-group" id="postCehFormGroupSubtitle" style="display: none;">
              <label class="post-form-label">Опис (необов'язково)</label>
              <input type="text" class="post-form-input" id="postCehFormInputSubtitle" placeholder="Наприклад: 2 стоєчний">
            </div>
          </div>
          <div class="post-modal-footer">
            <button class="post-btn post-btn-secondary" id="postCehModalCancel">Скасувати</button>
            <button class="post-btn post-btn-primary" id="postCehModalSubmit">Створити</button>
          </div>
        </div>
      </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modalOverlay = document.getElementById('postCehModalOverlay');
    }

    /**
     * Прив'язує події до елементів модалки
     */
    private bindEvents(): void {
        const closeBtn = document.getElementById('postCehModalClose');
        const cancelBtn = document.getElementById('postCehModalCancel');
        const submitBtn = document.getElementById('postCehModalSubmit');

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
     * Відкриває модалку для створення цеху
     * @param onSubmit Колбек при успішному створенні
     */
    public open(onSubmit: CehSubmitCallback): void {
        this.onSubmitCallback = onSubmit;

        const inputTitle = document.getElementById('postCehFormInputTitle') as HTMLInputElement;

        if (inputTitle) inputTitle.value = '';

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
        const inputTitle = document.getElementById('postCehFormInputTitle') as HTMLInputElement;

        const title = inputTitle?.value.trim() || '';

        if (!title) {
            alert('Введіть назву цеху!');
            return;
        }

        if (this.onSubmitCallback) {
            this.onSubmitCallback({ title });
        }

        this.close();
    }
}
