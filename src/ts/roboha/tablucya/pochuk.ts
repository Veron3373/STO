// Функціональність пошуку для таблиці
export class SearchHandler {

    private searchIcon: JQuery<HTMLElement>;
    private searchInput: JQuery<HTMLElement>;
    private onSearchCallback?: (searchTerm: string) => void;

    constructor() {

        this.searchIcon = $('#searchIcon');
        this.searchInput = $('#searchInput');
        this.initSearch();
    }

    /**
     * Ініціалізація функціональності пошуку
     */
    private initSearch(): void {
        this.searchInput.css({
            'width': '0',
            'padding': '0',
            'opacity': '0',
            'visibility': 'hidden'
        });

        this.bindEvents();
    }

    /**
     * Прив'язка подій до елементів пошуку
     */
    private bindEvents(): void {
        this.searchIcon.on('click', () => this.toggleSearchInput());
        this.searchInput.on('input', () => this.handleSearchInput());
    }

    /**
     * Перемикання видимості поля пошуку
     */
    private toggleSearchInput(): void {
        if (this.searchInput.width() === 0) {
            this.showSearchInput();
        } else {
            this.hideSearchInput();
        }
    }
    /**
     * Показати поле пошуку
     */
    private showSearchInput(): void {
        this.searchInput.css('visibility', 'visible');
        this.searchInput.animate({
            width: '200px',
            padding: '3px 7px',
            opacity: '1'
        }, 300, () => this.searchInput.focus());
    }

    /**
     * Приховати поле пошуку
     */
    private hideSearchInput(): void {
        this.searchInput.animate({
            width: '0',
            padding: '0',
            opacity: '0'
        }, 300, () => {
            this.searchInput.css('visibility', 'hidden');
            this.searchInput.val('');
            if (this.onSearchCallback) this.onSearchCallback('');
        });
    }

    /**
     * Обробка введення в поле пошуку
     */
    private handleSearchInput(): void {
        const searchTerm = (this.searchInput.val() as string)?.trim() || '';
        console.log('Термін пошуку:', searchTerm);
        if (this.onSearchCallback) this.onSearchCallback(searchTerm);
    }

    /**
     * Встановити колбек функцію для обробки пошуку
     * @param callback - функція, яка викликається при зміні терміну пошуку
     */
    public setSearchCallback(callback: (searchTerm: string) => void): void {
        this.onSearchCallback = callback;
    }

    /**
     * Програмно встановити значення пошуку
     * @param value - значення для встановлення
     */
    public setSearchValue(value: string): void {
        this.searchInput.val(value);
        if (this.onSearchCallback) this.onSearchCallback(value);
    }

    /**
     * Отримати поточне значення пошуку
     * @returns поточний термін пошуку
     */
    public getSearchValue(): string {
        return (this.searchInput.val() as string)?.trim() || '';
    }

    /**
     * Очистити поле пошуку
     */
    public clearSearch(): void {
        this.searchInput.val('');
        if (this.onSearchCallback) this.onSearchCallback('');
    }

    /**
     * Перевірити, чи відкрите поле пошуку
     * @returns true, якщо поле пошуку відкрите
     */
    public isSearchOpen(): boolean {
        return this.searchInput.width()! > 0;
    }
}

// Функція для ініціалізації пошуку
export function initializeSearch(): SearchHandler {
    return new SearchHandler();
}

// Приклад використання з колбеком для loadActsTable
export function setupSearchWithTableFilter(
    loadActsTable: (dateFrom?: string | null, dateTo?: string | null, filterType?: "open" | null, searchTerm?: string) => void,
    getCurrentFilterType: () => "open" | null,
    getCurrentDateRange: () => { dateFrom: string | null; dateTo: string | null }
): SearchHandler {
    const searchHandler = new SearchHandler();

    searchHandler.setSearchCallback((searchTerm: string) => {
        const filterType = getCurrentFilterType();
        const { dateFrom, dateTo } = getCurrentDateRange();

        if (filterType === 'open') {
            loadActsTable(null, null, 'open', searchTerm);
        } else {
            loadActsTable(dateFrom, dateTo, null, searchTerm);
        }
    });

    return searchHandler;
}