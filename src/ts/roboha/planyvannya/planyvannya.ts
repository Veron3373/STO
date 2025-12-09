class CalendarWidget {
    private viewYear: number;
    private viewMonth: number;
    private today: Date;
    private selectedDate: Date;
    
    // Елементи DOM
    private container: HTMLElement | null;
    private headerDateDisplay: HTMLElement | null;
    private timeHeader: HTMLElement | null;
    private schedulerWrapper: HTMLElement | null;

    constructor() {
        this.today = new Date();
        this.today.setHours(0, 0, 0, 0);

        this.selectedDate = new Date(this.today);
        this.viewYear = this.today.getFullYear();
        this.viewMonth = this.today.getMonth();

        this.container = document.getElementById('postCalendarContainer');
        this.headerDateDisplay = document.getElementById('postHeaderDateDisplay');
        this.timeHeader = document.getElementById('postTimeHeader');
        this.schedulerWrapper = document.getElementById('postSchedulerWrapper');

        this.init();
    }

    private init(): void {
        // Навігація днів (Header)
        const headerPrev = document.getElementById('headerNavPrev');
        const headerNext = document.getElementById('headerNavNext');
        const todayBtn = document.getElementById('postTodayBtn');

        if (headerPrev) headerPrev.addEventListener('click', () => this.handleDayPrev());
        if (headerNext) headerNext.addEventListener('click', () => this.handleDayNext());
        if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());

        // Навігація місяців (Mini Calendar)
        const monthPrevBtn = document.getElementById('postYearPrev');
        const monthNextBtn = document.getElementById('postYearNext');

        if (monthPrevBtn) monthPrevBtn.addEventListener('click', () => this.handleMonthPrev());
        if (monthNextBtn) monthNextBtn.addEventListener('click', () => this.handleMonthNext());

        this.initToggles();
        this.render();
        
        // Оновлюємо лінію часу при запуску
        this.updateTimeMarker();
        // І запускаємо таймер для оновлення кожну хвилину
        setInterval(() => this.updateTimeMarker(), 60000);
    }

    private initToggles(): void {
        // Обробка згортання/розгортання секцій (Цехи)
        for (let i = 1; i <= 4; i++) {
            const toggleBtn = document.getElementById(`postToggleBtn${i}`);
            const sectionHeader = document.getElementById(`postSubLocation${i}`);
            const sectionContent = document.getElementById(`postSectionContent${i}`);

            const toggleAction = (e: Event) => {
                e.stopPropagation();
                if (sectionContent && toggleBtn) {
                    sectionContent.classList.toggle('hidden');
                    const isHidden = sectionContent.classList.contains('hidden');
                    toggleBtn.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
                }
            };

            if (toggleBtn) toggleBtn.addEventListener('click', toggleAction);
            if (sectionHeader) sectionHeader.addEventListener('click', toggleAction);
        }
    }

    // --- ЛОГІКА ДАТ ---

    private goToToday(): void {
        this.selectedDate = new Date(this.today);
        this.viewMonth = this.today.getMonth();
        this.viewYear = this.today.getFullYear();
        this.render();
    }

    private handleDayPrev(): void {
        this.selectedDate.setDate(this.selectedDate.getDate() - 1);
        this.viewMonth = this.selectedDate.getMonth();
        this.viewYear = this.selectedDate.getFullYear();
        this.render();
    }

    private handleDayNext(): void {
        this.selectedDate.setDate(this.selectedDate.getDate() + 1);
        this.viewMonth = this.selectedDate.getMonth();
        this.viewYear = this.selectedDate.getFullYear();
        this.render();
    }

    private handleMonthPrev(): void {
        this.viewMonth--;
        if (this.viewMonth < 0) {
            this.viewMonth = 11;
            this.viewYear--;
        }
        this.render();
    }

    private handleMonthNext(): void {
        this.viewMonth++;
        if (this.viewMonth > 11) {
            this.viewMonth = 0;
            this.viewYear++;
        }
        this.render();
    }

    // --- РЕНДЕРИНГ ---

    private render(): void {
        // 1. Оновити дату в шапці
        if (this.headerDateDisplay) {
            this.headerDateDisplay.textContent = this.formatFullDate(this.selectedDate);
        }
        
        // 2. Оновити рік в міні-календарі
        const sidebarYear = document.getElementById('postYearDisplay');
        if (sidebarYear) {
            sidebarYear.textContent = this.viewYear.toString();
        }

        // 3. Оновити стилі часу (сіра зона минулого)
        this.updateTimeMarker();

        // 4. Перемалювати міні-календар
        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.renderMonth(this.viewYear, this.viewMonth));

            // Додаємо наступний місяць для зручності
            let nextMonth = this.viewMonth + 1;
            let nextYear = this.viewYear;
            if (nextMonth > 11) { nextMonth = 0; nextYear++; }
            this.container.appendChild(this.renderMonth(nextYear, nextMonth));
        }
    }

    // --- ЧАСОВИЙ МАРКЕР ---
    
    private updateTimeMarker(): void {
        if (!this.timeHeader) return;

        const now = new Date();
        const startOfToday = new Date(this.today);
        const selected = new Date(this.selectedDate);
        selected.setHours(0, 0, 0, 0);

        let pastPercentage = 0;

        if (selected < startOfToday) {
            // Минула дата - все сіре
            pastPercentage = 100;
        } else if (selected.getTime() === startOfToday.getTime()) {
            // Сьогодні - рахуємо відсоток
            const startHour = 8;
            const endHour = 20;
            const totalMinutes = (endHour - startHour) * 60; // 12 годин * 60 = 720 хв
            
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            
            // Скільки хвилин пройшло з 8:00
            let minutesPassed = (currentHour - startHour) * 60 + currentMin;
            
            if (minutesPassed < 0) minutesPassed = 0;
            if (minutesPassed > totalMinutes) minutesPassed = totalMinutes;

            pastPercentage = (minutesPassed / totalMinutes) * 100; // від 0 до 100
        } else {
            // Майбутня дата - нічого не сіре
            pastPercentage = 0;
        }

        // Встановлюємо CSS змінну на HEADER і на BODY (wrapper)
        this.timeHeader.style.setProperty('--past-percentage', `${pastPercentage/100}`); // Для Grid layout (24fr) це треба коригувати, але ми використаємо width%
        
        // Простіший метод: передаємо просто число 0-1
        const decimal = pastPercentage / 100;
        this.timeHeader.style.setProperty('--past-percentage', decimal.toString());
        
        // Передаємо також на весь враппер, щоб рядки бачили змінну
        if (this.schedulerWrapper) {
             this.schedulerWrapper.style.setProperty('--past-percentage', decimal.toString());
        }
    }

    // --- ДОПОМІЖНІ ---

    private formatFullDate(date: Date): string {
        const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
        const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    private getMonthName(monthIndex: number): string {
        const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
        return months[monthIndex];
    }

    private renderMonth(year: number, month: number): HTMLElement {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'post-month-calendar';

        const h3 = document.createElement('h3');
        h3.textContent = this.getMonthName(month);
        monthDiv.appendChild(h3);

        const weekdaysDiv = document.createElement('div');
        weekdaysDiv.className = 'post-weekdays';
        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].forEach(d => {
            const span = document.createElement('span');
            span.textContent = d;
            weekdaysDiv.appendChild(span);
        });
        monthDiv.appendChild(weekdaysDiv);

        const daysDiv = document.createElement('div');
        daysDiv.className = 'post-days';

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay(); 
        if (startDay === 0) startDay = 7; // Корекція для Нд=7

        for (let i = 1; i < startDay; i++) {
            daysDiv.appendChild(document.createElement('span'));
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const span = document.createElement('span');
            span.textContent = day.toString();
            const current = new Date(year, month, day);

            if (current.toDateString() === this.selectedDate.toDateString()) {
                span.className = 'post-selected-date';
            } else if (current.toDateString() === this.today.toDateString()) {
                span.className = 'post-today';
            }

            span.addEventListener('click', () => {
                this.selectedDate = new Date(year, month, day);
                this.render();
            });
            daysDiv.appendChild(span);
        }

        monthDiv.appendChild(daysDiv);
        return monthDiv;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CalendarWidget();
});