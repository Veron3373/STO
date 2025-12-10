class CalendarWidget {
    private viewYear: number;
    private viewMonth: number;
    private today: Date;
    private selectedDate: Date;
    
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
        const headerPrev = document.getElementById('headerNavPrev');
        const headerNext = document.getElementById('headerNavNext');
        const todayBtn = document.getElementById('postTodayBtn');
        if (headerPrev) headerPrev.addEventListener('click', () => this.handleDayPrev());
        if (headerNext) headerNext.addEventListener('click', () => this.handleDayNext());
        if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());

        const monthPrevBtn = document.getElementById('postYearPrev');
        const monthNextBtn = document.getElementById('postYearNext');
        if (monthPrevBtn) monthPrevBtn.addEventListener('click', () => this.handleMonthPrev());
        if (monthNextBtn) monthNextBtn.addEventListener('click', () => this.handleMonthNext());

        this.initToggles();
        this.render();
        
        // Таймер для червоної лінії
        this.updateTimeMarker();
        setInterval(() => this.updateTimeMarker(), 60000);
    }

    private initToggles(): void {
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

    private updateTimeMarker(): void {
        const now = new Date();
        const startOfToday = new Date(this.today);
        const selected = new Date(this.selectedDate);
        selected.setHours(0, 0, 0, 0);

        let decimal = 0;

        if (selected < startOfToday) {
            decimal = 1;
        } else if (selected.getTime() === startOfToday.getTime()) {
            const startHour = 8;
            const endHour = 20;
            const totalMinutes = (endHour - startHour) * 60; 
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            let minutesPassed = (currentHour - startHour) * 60 + currentMin;
            if (minutesPassed < 0) minutesPassed = 0;
            if (minutesPassed > totalMinutes) minutesPassed = totalMinutes;
            decimal = minutesPassed / totalMinutes;
        } else {
            decimal = 0;
        }

        if (this.timeHeader) {
            this.timeHeader.style.setProperty('--past-percentage', decimal.toString());
        }
        if (this.schedulerWrapper) {
             this.schedulerWrapper.style.setProperty('--past-percentage', decimal.toString());
        }
    }

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
        if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
        this.render();
    }
    private handleMonthNext(): void {
        this.viewMonth++;
        if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
        this.render();
    }
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
        if (startDay === 0) startDay = 7;
        for (let i = 1; i < startDay; i++) { daysDiv.appendChild(document.createElement('span')); }
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const span = document.createElement('span');
            span.textContent = day.toString();
            const current = new Date(year, month, day);
            if (current.toDateString() === this.selectedDate.toDateString()) { span.className = 'post-selected-date'; } // Жовтий (вибрано)
            else if (current.toDateString() === this.today.toDateString()) { span.className = 'post-today'; } // Зелений (сьогодні)
            span.addEventListener('click', () => { this.selectedDate = new Date(year, month, day); this.render(); });
            daysDiv.appendChild(span);
        }
        monthDiv.appendChild(daysDiv);
        return monthDiv;
    }
    private render(): void {
        if (this.headerDateDisplay) { this.headerDateDisplay.textContent = this.formatFullDate(this.selectedDate); }
        const sidebarYear = document.getElementById('postYearDisplay');
        if (sidebarYear) { sidebarYear.textContent = this.viewYear.toString(); }
        this.updateTimeMarker();
        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.renderMonth(this.viewYear, this.viewMonth));
            let nextMonth = this.viewMonth + 1;
            let nextYear = this.viewYear;
            if (nextMonth > 11) { nextMonth = 0; nextYear++; }
            this.container.appendChild(this.renderMonth(nextYear, nextMonth));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CalendarWidget();
});