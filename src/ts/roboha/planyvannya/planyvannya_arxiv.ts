import '../../../scss/robocha/planyvannya/_planyvannya_arxiv.scss';
import { showNotification } from '../zakaz_naraudy/inhi/vspluvauhe_povidomlenna';
import { supabase } from '../../vxid/supabaseClient';

import { PlanyvannyaModal, type ReservationData } from './planyvannya_modal';

// Removed local ReservationData interface to avoid conflict


export class PostArxiv {
    private container: HTMLElement;
    private selectionEl: HTMLElement | null = null;
    private isDragging: boolean = false;
    private startX: number = 0;
    private currentX: number = 0;
    private activeRow: HTMLElement | null = null;
    private timeSlotsCount: number = 24; // 8:00 to 20:00 is 12 hours * 2 = 24 slots (30 min each)
    private startHour: number = 8;

    // Moving block state
    private movingBlock: HTMLElement | null = null;
    private originalParent: HTMLElement | null = null;
    private originalLeft: string = '';
    private dragOffsetX: number = 0;

    // Block drag threshold state
    private blockDragStartX: number = 0;
    private blockDragStartY: number = 0;
    private isBlockDragging: boolean = false;

    // Editing block state
    private editingBlock: HTMLElement | null = null;




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

        // Ignore if clicking on existing reservation block
        // (If it's a block, handleBlockMouseDown will be triggered by its own listener,
        // but we need to ensure this handler doesn't interfere.
        // StopPropagation in block handler will prevent this, but check here too)
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

    // --- Block Moving Logic ---

    private handleBlockMouseDown(e: MouseEvent, block: HTMLElement): void {
        e.preventDefault();
        e.stopPropagation(); // Prevent creation selection

        this.movingBlock = block;
        this.blockDragStartX = e.clientX;
        this.blockDragStartY = e.clientY;
        this.isBlockDragging = false; // Not dragging yet, just pressed

        document.addEventListener('mousemove', this.onBlockMouseMove);
        document.addEventListener('mouseup', this.onBlockMouseUp);
    }

    private onBlockMouseMove = (e: MouseEvent): void => {
        if (!this.movingBlock) return;

        // Check threshold if not yet dragging
        if (!this.isBlockDragging) {
            const dx = Math.abs(e.clientX - this.blockDragStartX);
            const dy = Math.abs(e.clientY - this.blockDragStartY);

            if (dx < 5 && dy < 5) return; // Threshold not reached

            // Start dragging now
            this.isBlockDragging = true;
            this.startBlockDrag(e); // Initialize drag visuals
        }

        // Move block
        this.movingBlock.style.left = `${e.clientX - this.dragOffsetX}px`;
        this.movingBlock.style.top = `${e.clientY - (this.movingBlock.offsetHeight / 2)}px`;

        // Check validity
        this.movingBlock.className = 'post-reservation-block dragging-active'; // Reset classes

        // Hide moving block pointer events temporarily to check what's underneath
        this.movingBlock.style.pointerEvents = 'none';
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        this.movingBlock.style.pointerEvents = ''; // Restore pointer events for the block itself

        const track = elemBelow?.closest('.post-row-track') as HTMLElement;

        if (track) {
            // Calculate potential times
            const trackRect = track.getBoundingClientRect();
            const relativeX = (e.clientX - this.dragOffsetX) - trackRect.left;

            // Calculate start time based on position
            const totalMinutes = 12 * 60;
            let startMins = Math.round((relativeX / trackRect.width) * totalMinutes);

            // Snap to 30 min (optional, but good for UX)
            startMins = Math.round(startMins / 30) * 30;

            const duration = parseInt(this.movingBlock.dataset.end || '0') - parseInt(this.movingBlock.dataset.start || '0');
            const endMins = startMins + duration;

            // Bounds check
            if (startMins >= 0 && endMins <= totalMinutes) {
                // Check overlap, EXCLUDING self (which is not in track currently)
                const overlaps = this.checkOverlap(startMins, endMins, track);

                if (overlaps) {
                    this.movingBlock.classList.add('post-drag-invalid');
                } else {
                    this.movingBlock.classList.add('post-drag-valid');
                }
            } else {
                this.movingBlock.classList.add('post-drag-invalid');
            }
        } else {
            this.movingBlock.classList.add('post-drag-invalid');
        }
    }

    private startBlockDrag(e: MouseEvent): void {
        if (!this.movingBlock) return;

        this.originalParent = this.movingBlock.parentElement;
        this.originalLeft = this.movingBlock.style.left;

        // Calculate offset from block start
        const rect = this.movingBlock.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;

        // Set dragging styles
        this.movingBlock.classList.add('dragging-active');
        // We set fixed position to follow mouse freely
        this.movingBlock.style.width = `${rect.width}px`; // Fix width in pixels during drag
        this.movingBlock.style.height = `${rect.height}px`; // Fix height in pixels
        this.movingBlock.style.left = `${rect.left}px`;
        this.movingBlock.style.top = `${rect.top}px`;
        this.movingBlock.style.bottom = 'auto'; // Prevent stretching to bottom of screen

        // Move to body to ensure it's on top of everything and position absolute/fixed works relative to viewport
        document.body.appendChild(this.movingBlock);
    }

    private onBlockMouseUp = (_e: MouseEvent): void => {
        if (!this.movingBlock) return;

        document.removeEventListener('mousemove', this.onBlockMouseMove);
        document.removeEventListener('mouseup', this.onBlockMouseUp);

        if (!this.isBlockDragging) {
            // Needed to cleanup listeners if we just clicked without dragging
            this.movingBlock = null;
            this.isBlockDragging = false;
            return;
        }

        // Drop Logic (only if we were dragging)

        // Check if valid drop
        const isValid = this.movingBlock.classList.contains('post-drag-valid');
        const track = document.elementFromPoint(_e.clientX, _e.clientY)?.closest('.post-row-track') as HTMLElement;

        this.movingBlock.classList.remove('dragging-active', 'post-drag-valid', 'post-drag-invalid');
        this.movingBlock.style.pointerEvents = '';
        this.movingBlock.style.position = 'absolute';
        this.movingBlock.style.top = '4px'; // Reset top to fit in row
        this.movingBlock.style.bottom = '4px'; // Restore bottom
        this.movingBlock.style.height = ''; // Reset height to auto/css defined
        this.movingBlock.style.width = ''; // Reset to percent later

        if (isValid && track) {
            // Commit move
            const trackRect = track.getBoundingClientRect();
            const relativeX = (_e.clientX - this.dragOffsetX) - trackRect.left;
            const totalMinutes = 12 * 60;
            let startMins = Math.round((relativeX / trackRect.width) * totalMinutes);
            startMins = Math.round(startMins / 30) * 30;

            const duration = parseInt(this.movingBlock.dataset.end || '0') - parseInt(this.movingBlock.dataset.start || '0');
            const endMins = startMins + duration;

            // Update block data
            this.movingBlock.dataset.start = startMins.toString();
            this.movingBlock.dataset.end = endMins.toString();

            // Update styles to percent
            const leftPercent = (startMins / totalMinutes) * 100;
            const widthPercent = (duration / totalMinutes) * 100;

            this.movingBlock.style.left = `${leftPercent}%`;
            this.movingBlock.style.width = `${widthPercent}%`;

            track.appendChild(this.movingBlock);
            showNotification('Запис переміщено', 'success');
        } else {
            // Revert
            if (this.originalParent) {
                this.originalParent.appendChild(this.movingBlock);
                this.movingBlock.style.left = this.originalLeft;
                const duration = parseInt(this.movingBlock.dataset.end || '0') - parseInt(this.movingBlock.dataset.start || '0');
                const totalMinutes = 12 * 60;
                const widthPercent = (duration / totalMinutes) * 100;
                this.movingBlock.style.width = `${widthPercent}%`;
            } else {
                this.movingBlock.remove(); // Should not happen
            }
        }

        this.movingBlock = null;
        this.originalParent = null;
        this.isBlockDragging = false;
    }

    private checkOverlap(start: number, end: number, row: HTMLElement): boolean {
        const blocks = Array.from(row.querySelectorAll('.post-reservation-block')) as HTMLElement[];
        for (const block of blocks) {
            // Skip if it's the element we are moving (though we removed it from DOM, so redundant but safe)
            if (block === this.movingBlock) continue;

            const bStart = parseInt(block.dataset.start || '0');
            const bEnd = parseInt(block.dataset.end || '0');

            // Check overlap
            if (Math.max(start, bStart) < Math.min(end, bEnd)) {
                return true;
            }
        }
        return false;
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

    // --- Modal Logic ---

    private reservationModal = new PlanyvannyaModal();

    private openModal(startTime: string, endTime: string, comment: string = ''): void {
        const today = new Date().toISOString().split('T')[0];

        this.reservationModal.open(
            today,
            startTime,
            endTime,
            comment,
            {}, // existing data if any (TODO: pass if editing)
            (data: ReservationData) => this.handleModalSubmit(data)
        );
    }

    private handleModalSubmit(data: ReservationData): void {
        const startMins = this.timeToMinutesFromStart(data.startTime);
        const endMins = this.timeToMinutesFromStart(data.endTime);

        if (endMins <= startMins) {
            showNotification('Час закінчення має бути пізніше часу початку', 'error');
            return;
        }

        const targetRow = this.editingBlock ? this.editingBlock.closest('.post-row-track') as HTMLElement : this.activeRow;

        if (targetRow) {
            // Check overlaps, optionally excluding the block being edited if we are editing
            const validRanges = this.calculateValidRanges(startMins, endMins, targetRow, this.editingBlock);

            if (validRanges.length === 0) {
                showNotification('Обраний час повністю зайнятий', 'error');
                return;
            }

            // If we are editing and we found valid ranges (meaning we can save), 
            // we should remove the OLD block before creating new ones.
            if (this.editingBlock) {
                this.editingBlock.remove();
                this.editingBlock = null;
            }

            // Create a block for each valid range (splitting logic)
            validRanges.forEach(range => {
                this.createReservationBlock(targetRow, range.start, range.end, data);
            });

            if (validRanges.length > 1) {
                showNotification(`Створено ${validRanges.length} записи (з урахуванням зайнятого часу)`, 'warning');
            } else {
                showNotification(this.editingBlock ? 'Запис оновлено' : 'Час зарезервовано', 'success');
            }
        }

        this.reservationModal.close();
        this.editingBlock = null;
        this.resetSelection();
    }

    private createReservationBlock(row: HTMLElement, startMins: number, endMins: number, data: ReservationData | string): void {
        const totalMinutes = 12 * 60; // 12 hours (8 to 20)

        // Percentage positions
        const leftPercent = (startMins / totalMinutes) * 100;
        const widthPercent = ((endMins - startMins) / totalMinutes) * 100;

        const block = document.createElement('div');
        block.className = 'post-reservation-block';
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;

        // Store exact minutes
        block.dataset.start = startMins.toString();
        block.dataset.end = endMins.toString();

        let comment = '';
        if (typeof data === 'string') {
            comment = data;
        } else {
            comment = data.comment;
            // Store rich data
            block.dataset.clientName = data.clientName;
            block.dataset.clientId = data.clientId?.toString() || '';
            block.dataset.carModel = data.carModel;
            block.dataset.carNumber = data.carNumber;
            block.dataset.status = data.status || '';
            block.dataset.postArxivId = data.postArxivId?.toString() || '';
            block.dataset.carId = data.carId?.toString() || '';
        }

        block.dataset.comment = comment;

        const text = document.createElement('span');
        // Display format: "Client Name (Car Model)" or just comment if simple
        if (typeof data !== 'string' && data.clientName) {
            text.textContent = `${data.clientName} (${data.carModel})`;
        } else {
            text.textContent = comment || 'Резерв';
        }

        block.appendChild(text);

        // Context menu event
        block.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(e, block);
        });

        // Drag start event
        block.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.handleBlockMouseDown(e, block);
            }
        });

        // Edit event (double click)
        block.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.editingBlock = block;

            const startStr = this.minutesToTime(parseInt(block.dataset.start || '0'));
            const endStr = this.minutesToTime(parseInt(block.dataset.end || '0'));
            const savedComment = block.dataset.comment || '';

            // TODO: Restore full data if available in dataset
            this.openModal(startStr, endStr, savedComment === 'Резерв' ? '' : savedComment);
        });

        row.appendChild(block);
    }

    private calculateValidRanges(start: number, end: number, row: HTMLElement, excludeBlock: HTMLElement | null = null): { start: number, end: number }[] {
        // Get all existing blocks in this row
        const existingBlocks = Array.from(row.querySelectorAll('.post-reservation-block')) as HTMLElement[];
        const busyIntervals: { start: number, end: number }[] = [];
        // const totalMinutes = 12 * 60; // 720 minutes - unused, removing

        existingBlocks.forEach(block => {
            // Skip the block that is currently being moved or edited
            if (block === this.movingBlock || block === excludeBlock) return;

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

        deleteItem.addEventListener('click', async () => {
            const postArxivId = block.dataset.postArxivId;

            if (postArxivId) {
                try {
                    const { error } = await supabase
                        .from('post_arxiv')
                        .delete()
                        .eq('post_arxiv_id', parseInt(postArxivId));

                    if (error) {
                        console.error('Помилка видалення запису з БД:', error);
                        showNotification('Помилка видалення запису', 'error');
                        this.closeContextMenu();
                        return;
                    }
                } catch (err) {
                    console.error('Помилка при видаленні:', err);
                    showNotification('Виникла помилка при видаленні', 'error');
                    this.closeContextMenu();
                    return;
                }
            }

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
