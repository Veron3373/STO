//src\ts\roboha\planyvannya\planyvannya.ts

class CalendarWidget {
    private viewYear: number;
    private viewMonth: number; // 0-11
    private today: Date;
    private selectedDate: Date;
    private container: HTMLElement | null;
    private headerDateDisplay: HTMLElement | null;

    constructor() {
        this.today = new Date();
        // Normalize today to start of day for comparison
        this.today.setHours(0, 0, 0, 0);

        this.selectedDate = new Date(this.today);
        this.viewYear = this.today.getFullYear();
        this.viewMonth = this.today.getMonth();

        this.container = document.getElementById('postCalendarContainer');
        this.headerDateDisplay = document.getElementById('postHeaderDateDisplay');

        this.init();
    }

    private init(): void {
        // Top Header Navigation
        const headerPrev = document.getElementById('headerNavPrev');
        const headerNext = document.getElementById('headerNavNext');
        const todayBtn = document.getElementById('postTodayBtn');

        if (headerPrev) headerPrev.addEventListener('click', () => this.handlePrev());
        if (headerNext) headerNext.addEventListener('click', () => this.handleNext());
        if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());

        // Sidebar Navigation (keep existing functional)
        const prevBtn = document.getElementById('postYearPrev');
        const nextBtn = document.getElementById('postYearNext');

        if (prevBtn) prevBtn.addEventListener('click', () => this.handlePrev());
        if (nextBtn) nextBtn.addEventListener('click', () => this.handleNext());

        this.render();
    }

    private goToToday(): void {
        this.selectedDate = new Date(this.today);
        this.viewMonth = this.today.getMonth();
        this.viewYear = this.today.getFullYear();
        this.render();
    }

    private handlePrev(): void {
        this.viewMonth--;
        if (this.viewMonth < 0) {
            this.viewMonth = 11;
            this.viewYear--;
        }
        this.render();
    }

    private handleNext(): void {
        this.viewMonth++;
        if (this.viewMonth > 11) {
            this.viewMonth = 0;
            this.viewYear++;
        }
        this.render();
    }

    private getMonthName(monthIndex: number): string {
        const months = [
            'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
            'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
        ];
        return months[monthIndex];
    }

    private formatFullDate(date: Date): string {
        const days = [
            'Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'
        ];
        const dayName = days[date.getDay()];
        const day = date.getDate();

        // Proper UA genitive case for months is complex, keeping simple or mapping:
        const monthsGenitive = [
            'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
        ];
        const monthName = monthsGenitive[date.getMonth()];

        return `${dayName}, ${day} ${monthName} ${date.getFullYear()}`;
    }

    private selectDate(year: number, month: number, day: number): void {
        this.selectedDate = new Date(year, month, day);
        this.render(); // Re-render to update highlights and text
    }

    private render(): void {
        if (!this.container) return;

        // Update Header Text
        if (this.headerDateDisplay) {
            this.headerDateDisplay.textContent = this.formatFullDate(this.selectedDate);
        }

        // Update Sidebar Year Display (if it exists)
        const sidebarYear = document.getElementById('postYearDisplay');
        if (sidebarYear) {
            sidebarYear.textContent = this.viewYear.toString();
        }

        // Update Time Header Styles (Gray out past hours)
        this.updateHeaderTimeStyles();

        this.container.innerHTML = '';

        // Render current view month
        this.container.appendChild(this.renderMonth(this.viewYear, this.viewMonth));

        // Calculate next month
        let nextMonth = this.viewMonth + 1;
        let nextYear = this.viewYear;
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }

        // Render next month
        this.container.appendChild(this.renderMonth(nextYear, nextMonth));
    }

    private updateHeaderTimeStyles(): void {
        const timeHeader = document.getElementById('postTimeHeader');
        if (!timeHeader) return;

        const children = Array.from(timeHeader.children) as HTMLElement[];
        const now = new Date();

        const startOfToday = new Date(this.today);
        const selected = new Date(this.selectedDate);
        selected.setHours(0, 0, 0, 0);

        let allPast = false;
        let checkTime = false;

        if (selected < startOfToday) {
            allPast = true;
        } else if (selected.getTime() === startOfToday.getTime()) {
            checkTime = true;
        }

        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        for (let i = 0; i < children.length; i++) {
            const cell = children[i];
            cell.classList.remove('post-past-time');

            if (allPast) {
                cell.classList.add('post-past-time');
                continue;
            }

            if (checkTime) {
                // i=0 -> 8:00, i=1 -> 8:30
                const cellHour = 8 + Math.floor(i / 2);
                const cellMin = (i % 2) * 30;

                let slotEndHour = cellHour;
                let slotEndMin = cellMin + 30;
                if (slotEndMin >= 60) {
                    slotEndHour++;
                    slotEndMin -= 60;
                }

                if (currentHour > slotEndHour || (currentHour === slotEndHour && currentMin >= slotEndMin)) {
                    cell.classList.add('post-past-time');
                }
            }
        }
    }

    private renderMonth(year: number, month: number): HTMLElement {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'post-month-calendar';

        // Header
        const h3 = document.createElement('h3');
        h3.textContent = this.getMonthName(month);
        monthDiv.appendChild(h3);

        // Weekdays
        const weekdaysDiv = document.createElement('div');
        weekdaysDiv.className = 'post-weekdays';
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
        weekdays.forEach(day => {
            const span = document.createElement('span');
            span.textContent = day;
            weekdaysDiv.appendChild(span);
        });
        monthDiv.appendChild(weekdaysDiv);

        // Days grid
        const daysDiv = document.createElement('div');
        daysDiv.className = 'post-days';

        // Calculate first day of month and number of days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Adjust for Monday start (0-6 -> 1-7, where 7 is Sunday)
        let startDay = firstDay.getDay();
        if (startDay === 0) startDay = 7; // Sunday needs to be 7

        // Empty cells for days before start of month
        for (let i = 1; i < startDay; i++) {
            daysDiv.appendChild(document.createElement('span')); // Empty span
        }

        // Days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const daySpan = document.createElement('span');
            daySpan.textContent = day.toString();

            const currentDate = new Date(year, month, day);

            // Check if selected
            if (
                currentDate.getDate() === this.selectedDate.getDate() &&
                currentDate.getMonth() === this.selectedDate.getMonth() &&
                currentDate.getFullYear() === this.selectedDate.getFullYear()
            ) {
                daySpan.className = 'post-selected-date';
            }
            // Check if today (secondary style if needed, or just rely on selection if default)
            else if (
                currentDate.getDate() === this.today.getDate() &&
                currentDate.getMonth() === this.today.getMonth() &&
                currentDate.getFullYear() === this.today.getFullYear()
            ) {
                daySpan.className = 'post-today';
            }

            // Add click event
            daySpan.addEventListener('click', () => this.selectDate(year, month, day));

            daysDiv.appendChild(daySpan);
        }

        monthDiv.appendChild(daysDiv);
        return monthDiv;
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    new CalendarWidget();
});