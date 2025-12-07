// Функціональність пошуку для таблиці (БЕЗ jQuery)

export class SearchHandler {
    private searchIcon: HTMLElement | null;
    private searchInput: HTMLInputElement | null;
    private onSearchCallback?: (searchTerm: string) => void;

    constructor() {
        this.searchIcon = document.getElementById('searchIcon');
        this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
        
        if (!this.searchIcon || !this.searchInput) {
            console.error('❌ Елементи пошуку не знайдено в DOM');
            return;
        }

        this.initSearch();
    }

    /**
     * Ініціалізація функціональності пошуку
     */
    private initSearch(): void {
        if (!this.searchInput) return;

        this.searchInput.style.width = '0';
        this.searchInput.style.padding = '0';
        this.searchInput.style.opacity = '0';
        this.searchInput.style.visibility = 'hidden';
        this.searchInput.style.transition = 'all 0.3s ease';

        this.bindEvents();
    }

    /**
     * Прив'язка подій до елементів пошуку
     */
    private bindEvents(): void {
        if (!this.searchIcon || !this.searchInput) return;

        this.searchIcon.addEventListener('click', () => this.toggleSearchInput());
        this.searchInput.addEventListener('input', () => this.handleSearchInput());
        
        // Додатково: закриття при натисканні Escape
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSearchInput();
            }
        });
    }

    /**
     * Перемикання видимості поля пошуку
     */
    private toggleSearchInput(): void {
        if (!this.searchInput) return;

        const isHidden = this.searchInput.style.width === '0px' || 
                        this.searchInput.style.width === '0' || 
                        this.searchInput.style.visibility === 'hidden';

        if (isHidden) {
            this.showSearchInput();
        } else {
            this.hideSearchInput();
        }
    }

    /**
     * Показати поле пошуку
     */
    private showSearchInput(): void {
        if (!this.searchInput) return;

        this.searchInput.style.visibility = 'visible';
        this.searchInput.style.width = '200px';
        this.searchInput.style.padding = '3px 7px';
        this.searchInput.style.opacity = '1';
        
        // Фокус після завершення анімації
        setTimeout(() => {
            this.searchInput?.focus();
        }, 300);
    }

    /**
     * Приховати поле пошуку
     */
    private hideSearchInput(): void {
        if (!this.searchInput) return;

        this.searchInput.style.width = '0';
        this.searchInput.style.padding = '0';
        this.searchInput.style.opacity = '0';
        
        setTimeout(() => {
            if (this.searchInput) {
                this.searchInput.style.visibility = 'hidden';
                this.searchInput.value = '';
                if (this.onSearchCallback) this.onSearchCallback('');
            }
        }, 300);
    }

    /**
     * Обробка введення в поле пошуку
     */
    private handleSearchInput(): void {
        if (!this.searchInput) return;

        const searchTerm = this.searchInput.value.trim();
        console.log('🔍 Термін пошуку:', searchTerm);
        
        if (this.onSearchCallback) {
            this.onSearchCallback(searchTerm);
        }
    }

    /**
     * Встановити колбек функцію для обробки пошуку
     */
    public setSearchCallback(callback: (searchTerm: string) => void): void {
        this.onSearchCallback = callback;
    }

    /**
     * Програмно встановити значення пошуку
     */
    public setSearchValue(value: string): void {
        if (!this.searchInput) return;

        this.searchInput.value = value;
        if (this.onSearchCallback) this.onSearchCallback(value);
    }

    /**
     * Отримати поточне значення пошуку
     */
    public getSearchValue(): string {
        return this.searchInput?.value.trim() || '';
    }

    /**
     * Очистити поле пошуку
     */
    public clearSearch(): void {
        if (!this.searchInput) return;

        this.searchInput.value = '';
        if (this.onSearchCallback) this.onSearchCallback('');
    }

    /**
     * Перевірити, чи відкрите поле пошуку
     */
    public isSearchOpen(): boolean {
        if (!this.searchInput) return false;
        return this.searchInput.style.width !== '0px' && 
               this.searchInput.style.width !== '0';
    }
}

// Функція для ініціалізації пошуку
export function initializeSearch(): SearchHandler {
    return new SearchHandler();
}

// Приклад використання з колбеком для loadActsTable
export function setupSearchWithTableFilter(
    loadActsTable: (
        dateFrom?: string | null, 
        dateTo?: string | null, 
        filterType?: "open" | "closed" | null, 
        searchTerm?: string
    ) => void,
    getCurrentFilterType: () => "open" | "closed" | null,
    getCurrentDateRange: () => { dateFrom: string | null; dateTo: string | null }
): SearchHandler {
    const searchHandler = new SearchHandler();

    searchHandler.setSearchCallback((searchTerm: string) => {
        const filterType = getCurrentFilterType();
        const { dateFrom, dateTo } = getCurrentDateRange();

        if (filterType === 'open') {
            loadActsTable(null, null, 'open', searchTerm);
        } else if (filterType === 'closed') {
            loadActsTable(null, null, 'closed', searchTerm);
        } else {
            loadActsTable(dateFrom, dateTo, null, searchTerm);
        }
    });

    return searchHandler;
}