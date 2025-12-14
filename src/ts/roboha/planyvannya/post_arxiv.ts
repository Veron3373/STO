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

        // Create the selection element once and reuse it
        this.createSelectionElement();
    }

    private createSelectionElement(): void {
        this.selectionEl = document.createElement('div');
        this.selectionEl.className = 'post-reservation-selection';
        document.body.appendChild(this.selectionEl); // Append to body to avoid overflow issues, or container? 
        // Actually, appending to the row is better for relative positioning, 
        // but the row changes. Let's append to the specific row during drag.
        // For now, I'll remove it from the DOM initially.
        this.selectionEl.remove();
    }

    private handleMouseDown(e: MouseEvent): void {
        // Check if we clicked on a track
        const target = e.target as HTMLElement;
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

            const startTime = this.minutesToTime(startSlotIndex * 30);
            const endTime = this.minutesToTime(endSlotIndex * 30);

            // Show modal
            this.openModal(startTime, endTime);
        }
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
        // We don't use date yet for visualization, but logic might require it later
        // const dateInput = document.getElementById('postArxivDate') as HTMLInputElement;

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

        // Create reservation block
        if (this.activeRow) {
            this.createReservationBlock(this.activeRow, startMins, endMins, commentInput.value);
        }

        this.closeModal();
        showNotification('Час зарезервовано', 'success');
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

        const text = document.createElement('span');
        text.textContent = comment || 'Резерв';
        block.appendChild(text);

        // Add delete functionality on right click or double click?
        block.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm('Видалити резервацію?')) {
                block.remove();
            }
        });

        row.appendChild(block);
    }
}
