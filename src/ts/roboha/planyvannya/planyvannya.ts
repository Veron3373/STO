class CalendarWidget {
    private viewYear: number;
    private viewMonth: number;
    private today: Date;
    private selectedDate: Date;
    private container: HTMLElement | null;
    private headerDateDisplay: HTMLElement | null;

    constructor() {
        this.today = new Date();
        this.today.setHours(0, 0, 0, 0);

        this.selectedDate = new Date(this.today);
        this.viewYear = this.today.getFullYear();
        this.viewMonth = this.today.getMonth();

        this.container = document.getElementById('postCalendarContainer');
        this.headerDateDisplay = document.getElementById('postHeaderDateDisplay');

        this.init();
    }

    private init(): void {
        const headerPrev = document.getElementById('headerNavPrev');
        const headerNext = document.getElementById('headerNavNext');
        const todayBtn = document.getElementById('postTodayBtn');

        if (headerPrev) headerPrev.addEventListener('click', () => this.handlePrev());
        if (headerNext) headerNext.addEventListener('click', () => this.handleNext());
        if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());

        const prevBtn = document.getElementById('postYearPrev');
        const nextBtn = document.getElementById('postYearNext');

        if (prevBtn) prevBtn.addEventListener('click', () => this.handlePrev());
        if (nextBtn) nextBtn.addEventListener('click', () => this.handleNext());

        // Додаємо вертикальні лінії в grid
        this.addGridLines();

        this.render();
    }

    private addGridLines(): void {
        const calendarGrid = document.getElementById('postCalendarGrid');
        if (!calendarGrid) return;

        // Перевіряємо чи вже є лінії
        let linesContainer = calendarGrid.querySelector('.post-grid-lines');
        if (!linesContainer) {
            linesContainer = document.createElement('div');
            linesContainer.className = 'post-grid-lines';

            // Додаємо 12 ліній (для 12 годин)
            for (let i = 0; i < 12; i++) {
                const line = document.createElement('div');
                line.className = 'post-hour-line';
                linesContainer.appendChild(line);
            }

            calendarGrid.appendChild(linesContainer);
        }
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

        const monthsGenitive = [
            'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
        ];
        const monthName = monthsGenitive[date.getMonth()];

        return `${dayName}, ${day} ${monthName} ${date.getFullYear()}`;
    }

    private selectDate(year: number, month: number, day: number): void {
        this.selectedDate = new Date(year, month, day);
        this.render();
    }

    private render(): void {
        if (!this.container) return;

        if (this.headerDateDisplay) {
            this.headerDateDisplay.textContent = this.formatFullDate(this.selectedDate);
        }

        const sidebarYear = document.getElementById('postYearDisplay');
        if (sidebarYear) {
            sidebarYear.textContent = this.viewYear.toString();
        }

        this.updateHeaderTimeStyles();

        this.container.innerHTML = '';

        this.container.appendChild(this.renderMonth(this.viewYear, this.viewMonth));

        let nextMonth = this.viewMonth + 1;
        let nextYear = this.viewYear;
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }

        this.container.appendChild(this.renderMonth(nextYear, nextMonth));
    }

    private updateHeaderTimeStyles(): void {
        const timeHeader = document.getElementById('postTimeHeader');
        const calendarGrid = document.getElementById('postCalendarGrid');
        if (!timeHeader || !calendarGrid) return;

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

        let pastPercentage = 0;
        if (allPast) pastPercentage = 100;

        const startHour = 8;
        const endHour = 20;
        const totalMinutes = (endHour - startHour) * 60;

        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        if (checkTime) {
            let minutesPassed = (currentHour - startHour) * 60 + currentMin;

            if (minutesPassed < 0) minutesPassed = 0;
            if (minutesPassed > totalMinutes) minutesPassed = totalMinutes;

            const slotIndex = Math.floor(minutesPassed / 30);
            const graySlots = slotIndex + 1;
            const grayMinutes = graySlots * 30;

            const finalGrayMinutes = Math.min(grayMinutes, totalMinutes);
            
            // Відсоток для CSS (враховуючи padding 24px з обох боків)
            const gridWidth = calendarGrid.offsetWidth - 48; // minus padding
            const totalWidth = calendarGrid.offsetWidth;
            const actualPercentage = (finalGrayMinutes / totalMinutes) * (gridWidth / totalWidth) * 100;
            
            pastPercentage = actualPercentage;

            for (let i = 0; i < children.length; i++) {
                const cell = children[i];
                cell.classList.remove('post-past-time');

                if (i < graySlots) {
                    cell.classList.add('post-past-time');
                }
            }
        } else if (allPast) {
            children.forEach(c => c.classList.add('post-past-time'));
        } else {
            children.forEach(c => c.classList.remove('post-past-time'));
        }

        // Застосовуємо змінну для обох header і grid
        timeHeader.style.setProperty('--past-percentage', `${pastPercentage}%`);
        calendarGrid.style.setProperty('--past-percentage', `${pastPercentage}%`);
    }

    private renderMonth(year: number, month: number): HTMLElement {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'post-month-calendar';

        const h3 = document.createElement('h3');
        h3.textContent = this.getMonthName(month);
        monthDiv.appendChild(h3);

        const weekdaysDiv = document.createElement('div');
        weekdaysDiv.className = 'post-weekdays';
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
        weekdays.forEach(day => {
            const span = document.createElement('span');
            span.textContent = day;
            weekdaysDiv.appendChild(span);
        });
        monthDiv.appendChild(weekdaysDiv);

        const daysDiv = document.createElement('div');
        daysDiv.className = 'post-days';

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let startDay = firstDay.getDay();
        if (startDay === 0) startDay = 7;

        for (let i = 1; i < startDay; i++) {
            daysDiv.appendChild(document.createElement('span'));
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const daySpan = document.createElement('span');
            daySpan.textContent = day.toString();

            const currentDate = new Date(year, month, day);

            if (
                currentDate.getDate() === this.selectedDate.getDate() &&
                currentDate.getMonth() === this.selectedDate.getMonth() &&
                currentDate.getFullYear() === this.selectedDate.getFullYear()
            ) {
                daySpan.className = 'post-selected-date';
            } else if (
                currentDate.getDate() === this.today.getDate() &&
                currentDate.getMonth() === this.today.getMonth() &&
                currentDate.getFullYear() === this.today.getFullYear()
            ) {
                daySpan.className = 'post-today';
            }

            daySpan.addEventListener('click', () => this.selectDate(year, month, day));

            daysDiv.appendChild(daySpan);
        }

        monthDiv.appendChild(daysDiv);
        return monthDiv;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CalendarWidget();
});