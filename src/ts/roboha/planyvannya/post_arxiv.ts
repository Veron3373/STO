import '../../../scss/robocha/planyvannya/_post_arxiv.scss';
import { showNotification } from '../zakaz_naraudy/inhi/vspluvauhe_povidomlenna';

export interface ReservationData {
    sectionId: string;
    postId: string;
    startTime: string; // "HH:MM"
    endTime: string;   // "HH:MM"
    date: string;      // "YYYY-MM-DD"
    comment?: string;
}

export class PostArxiv {
    private container: HTMLElement;
    private selectionEl: HTMLElement | null = null;
    private isDragging: boolean = false;
    private startX: number = 0;
    private currentX: number = 0;
    private activeRow: HTMLElement | null = null;
    private timeSlotsCount: number = 24; // 8:00 to 20:00 is 12 hours * 2 = 24 slots (30 min each)
    private startHour: number = 8;

    // Modal elements
    private modalOverlay: HTMLElement | null = null;


    constructor(containerId: string = 'postCalendarGrid') {
        const el = document.getElementById(containerId);
        if (!el) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = el;
        this.init();
    }

    private init(): void {
        // We bind to the container and use delegation for row tracks
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));

        // Global click to close context menu
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.post-context-menu')) {
                this.closeContextMenu();
            }
        });

        // Create the selection element once and reuse it
        this.createSelectionElement();
    }

    private createSelectionElement(): void {
        this.selectionEl = document.createElement('div');
        this.selectionEl.className = 'post-reservation-selection';
        this.selectionEl.remove();
    }

    private handleMouseDown(e: MouseEvent): void {
        const target = e.target as HTMLElement;

        // Ignore if clicking on existing reservation block (handled by context menu or other events)
        if (target.closest('.post-reservation-block')) return;

        const track = target.closest('.post-row-track');

        if (!track) return;

        // Only allow left mouse button
        if (e.button !== 0) return;

        e.preventDefault();
        this.isDragging = true;
        this.activeRow = track as HTMLElement;

        // Get relative X coordinate within the track
        const rect = this.activeRow.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.currentX = this.startX;

        // Append selection element to the active row
        if (this.selectionEl) {
            this.activeRow.appendChild(this.selectionEl);
            this.selectionEl.style.left = `${this.startX}px`;
            this.selectionEl.style.width = '0px';
            this.selectionEl.classList.add('active');
        }

        // Attach global listeners
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.isDragging || !this.activeRow || !this.selectionEl) return;

        const rect = this.activeRow.getBoundingClientRect();
        let x = e.clientX - rect.left;

        // Constrain to row width
        if (x < 0) x = 0;
        if (x > rect.width) x = rect.width;

        this.currentX = x;

        // Update selection dimensions
        const width = Math.abs(this.currentX - this.startX);
        const left = Math.min(this.startX, this.currentX);

        this.selectionEl.style.width = `${width}px`;
        this.selectionEl.style.left = `${left}px`;
    }

    private onMouseUp = (_e: MouseEvent): void => {
        if (!this.isDragging) return;

        this.isDragging = false;
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);

        // Calculate times
        if (this.activeRow) {
            const rect = this.activeRow.getBoundingClientRect();
            const trackWidth = rect.width;

            const p1 = Math.min(this.startX, this.currentX);
            const p2 = Math.max(this.startX, this.currentX);

            // Minimum drag threshold (to avoid accidental clicks)
            if (p2 - p1 < 5) {
                this.resetSelection();
                return;
            }

            const slotWidth = trackWidth / this.timeSlotsCount;

            const startSlotIndex = Math.floor(p1 / slotWidth);
            const endSlotIndex = Math.ceil(p2 / slotWidth);

            // Convert to minutes
            const rawStartMins = startSlotIndex * 30;
            const rawEndMins = endSlotIndex * 30;

            // Smart handling of overlaps
            const validRanges = this.calculateValidRanges(rawStartMins, rawEndMins, this.activeRow);

            if (validRanges.length === 0) {
                showNotification('Цей час вже зайнятий', 'error');
                this.resetSelection();
                return;
            }

            // If we have valid ranges, we show the modal for the overall span
            // But we need to be clear about what will happen.
            // Based on requirements: 
            // 1. If drag 10-15 covers 12-13, split into 10-12 and 13-15.
            // 2. If drag 10-13 covers 12-13 partially (ends at 13), truncate to 10-12.
            // Basically, calculateValidRanges should return the free slots within the drag area.

            // For display in modal, we show the start of first block and end of last block?
            // Or simply the dragged range, and let user know it might be split?
            // Requirement says: "open modal... 10:00 to 12:00" suggests showing the effective range.
            // If split, maybe show start of first and end of last? 

            const effectiveStart = validRanges[0].start;
            const effectiveEnd = validRanges[validRanges.length - 1].end;

            const startTimeStr = this.minutesToTime(effectiveStart);
            const endTimeStr = this.minutesToTime(effectiveEnd);

            this.openModal(startTimeStr, endTimeStr);
        }
    }

    private calculateValidRanges(start: number, end: number, row: HTMLElement): { start: number, end: number }[] {
        // Get all existing blocks in this row
        const existingBlocks = Array.from(row.querySelectorAll('.post-reservation-block')) as HTMLElement[];
        const busyIntervals: { start: number, end: number }[] = [];
        // const totalMinutes = 12 * 60; // 720 minutes - unused, removing

        existingBlocks.forEach(block => {
            // Calculate minutes from style percentage (approximated back)
            // or better, store minutes in dataset!
            // Since we didn't store yet, let's reverse calculate from style.
            const blockStart = parseInt(block.dataset.start || '0');
            const blockEnd = parseInt(block.dataset.end || '0');

            busyIntervals.push({ start: blockStart, end: blockEnd });
        });

        // Sort intervals
        busyIntervals.sort((a, b) => a.start - b.start);

        // Subtract busy intervals from [start, end]
        const result: { start: number, end: number }[] = [];
        let currentStart = start;

        for (const interval of busyIntervals) {
            if (interval.end <= currentStart) continue; // Block is before us
            if (interval.start >= end) break; // Block is after us

            // Overlap detected
            if (interval.start > currentStart) {
                // There is a gap before this block
                result.push({ start: currentStart, end: interval.start });
            }

            // Skip the busy block
            currentStart = Math.max(currentStart, interval.end);
        }

        // Add remaining part if any
        if (currentStart < end) {
            result.push({ start: currentStart, end: end });
        }

        return result;
    }

    private resetSelection(): void {
        if (this.selectionEl) {
            this.selectionEl.classList.remove('active');
            this.selectionEl.style.width = '0';
            this.selectionEl.remove(); // Remove from parent
        }
        this.activeRow = null;
    }

    private minutesToTime(minutesFromStart: number): string {
        const totalMinutes = this.startHour * 60 + minutesFromStart;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    private timeToMinutesFromStart(timeStr: string): number {
        const [h, m] = timeStr.split(':').map(Number);
        const totalMinutes = h * 60 + m;
        return totalMinutes - (this.startHour * 60);
    }

    // --- Modal Logic ---

    private openModal(startTime: string, endTime: string): void {
        // Current date for default input
        const today = new Date().toISOString().split('T')[0];

        const modalHTML = `
            <div class="post-arxiv-modal-overlay">
                <div class="post-arxiv-modal">
                    <div class="post-arxiv-header">
                        <h2>Резервування часу</h2>
                        <button class="post-arxiv-close">&times;</button>
                    </div>
                    <div class="post-arxiv-body">
                        <div class="post-arxiv-form-group">
                            <label>Дата</label>
                            <input type="date" id="postArxivDate" value="${today}">
                        </div>
                        
                        <div class="post-arxiv-form-group">
                            <label>Час</label>
                            <div class="post-time-inputs">
                                <div>
                                    <label>Початок</label>
                                    <input type="time" id="postArxivStart" value="${startTime}">
                                </div>
                                <div>
                                    <label>Кінець</label>
                                    <input type="time" id="postArxivEnd" value="${endTime}">
                                </div>
                            </div>
                        </div>

                        <div class="post-arxiv-form-group">
                            <label>Коментар (необов'язково)</label>
                            <input type="text" id="postArxivComment" placeholder="Введіть коментар...">
                        </div>
                    </div>
                    <div class="post-arxiv-footer">
                        <button class="post-btn post-btn-secondary" id="postArxivCancel">Скасувати</button>
                        <button class="post-btn post-btn-blue" id="postArxivSubmit">ОК</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modalOverlay = document.querySelector('.post-arxiv-modal-overlay');

        // Bind events
        this.modalOverlay?.querySelector('.post-arxiv-close')?.addEventListener('click', () => this.closeModal());
        this.modalOverlay?.querySelector('#postArxivCancel')?.addEventListener('click', () => this.closeModal());
        this.modalOverlay?.querySelector('#postArxivSubmit')?.addEventListener('click', () => this.handleSubmit());
    }

    private closeModal(): void {
        if (this.modalOverlay) {
            this.modalOverlay.remove();
            this.modalOverlay = null;
        }
        this.resetSelection();
    }

    private handleSubmit(): void {
        const startInput = document.getElementById('postArxivStart') as HTMLInputElement;
        const endInput = document.getElementById('postArxivEnd') as HTMLInputElement;
        const commentInput = document.getElementById('postArxivComment') as HTMLInputElement;

        if (!startInput.value || !endInput.value) {
            showNotification('Будь ласка, вкажіть час', 'error');
            return;
        }

        const startMins = this.timeToMinutesFromStart(startInput.value);
        const endMins = this.timeToMinutesFromStart(endInput.value);

        if (endMins <= startMins) {
            showNotification('Час закінчення має бути пізніше часу початку', 'error');
            return;
        }

        // Since user might have changed times in modal, let's recalculate valid ranges
        // based on what they entered vs what is occupied.
        if (this.activeRow) {
            const validRanges = this.calculateValidRanges(startMins, endMins, this.activeRow);

            if (validRanges.length === 0) {
                showNotification('Обраний час повністю зайнятий', 'error');
                return;
            }

            // Create a block for each valid range (splitting logic)
            validRanges.forEach(range => {
                if (this.activeRow) {
                    this.createReservationBlock(this.activeRow, range.start, range.end, commentInput.value);
                }
            });

            if (validRanges.length > 1) {
                showNotification(`Створено ${validRanges.length} записи (з урахуванням зайнятого часу)`, 'warning');
            } else {
                showNotification('Час зарезервовано', 'success');
            }
        }

        this.closeModal();
    }

    private createReservationBlock(row: HTMLElement, startMins: number, endMins: number, comment: string): void {
        const totalMinutes = 12 * 60; // 12 hours (8 to 20)

        // Percentage positions
        const leftPercent = (startMins / totalMinutes) * 100;
        const widthPercent = ((endMins - startMins) / totalMinutes) * 100;

        const block = document.createElement('div');
        block.className = 'post-reservation-block';
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;
        // Store exact minutes for accurate recalculations later
        block.dataset.start = startMins.toString();
        block.dataset.end = endMins.toString();

        const text = document.createElement('span');
        text.textContent = comment || 'Резерв';
        block.appendChild(text);

        // Context menu event
        block.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(e, block);
        });

        row.appendChild(block);
    }

    private showContextMenu(e: MouseEvent, block: HTMLElement): void {
        this.closeContextMenu(); // Close existing

        const menu = document.createElement('div');
        menu.className = 'post-context-menu';

        const deleteItem = document.createElement('div');
        deleteItem.className = 'post-context-menu-item delete';
        deleteItem.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Видалити запис
        `;

        deleteItem.addEventListener('click', () => {
            block.remove();
            this.closeContextMenu();
            showNotification('Запис видалено', 'success');
        });

        menu.appendChild(deleteItem);
        document.body.appendChild(menu);

        // Position menu
        menu.style.top = `${e.pageY}px`;
        menu.style.left = `${e.pageX}px`;
    }

    private closeContextMenu(): void {
        const existing = document.querySelector('.post-context-menu');
        if (existing) {
            existing.remove();
        }
    }
}
