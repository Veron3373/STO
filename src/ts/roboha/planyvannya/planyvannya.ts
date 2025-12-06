//src\ts\roboha\planyvannya\planyvannya.ts

class CalendarWidget {
    private viewYear: number;
    private viewMonth: number; // 0-11
    private today: Date;
    private container: HTMLElement | null;
    private yearDisplay: HTMLElement | null;

    constructor() {
        this.today = new Date();
        this.viewYear = this.today.getFullYear();
        this.viewMonth = this.today.getMonth();

        this.container = document.getElementById('postCalendarContainer');
        this.yearDisplay = document.getElementById('postYearDisplay');

        this.init();
    }

    private init(): void {
        const prevBtn = document.getElementById('postYearPrev');
        const nextBtn = document.getElementById('postYearNext');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.handlePrev());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNext());
        }

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

    private render(): void {
        if (!this.container || !this.yearDisplay) return;

        this.container.innerHTML = '';
        this.yearDisplay.textContent = this.viewYear.toString();

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

            // Check if today
            if (
                day === this.today.getDate() &&
                month === this.today.getMonth() &&
                year === this.today.getFullYear()
            ) {
                daySpan.className = 'post-today';
            }

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