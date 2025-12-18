//src\ts\roboha\planyvannya\planyvannya_arxiv.ts
import '../../../scss/robocha/planyvannya/_planyvannya_arxiv.scss';
import { showNotification } from '../zakaz_naraudy/inhi/vspluvauhe_povidomlenna';
import { supabase } from '../../vxid/supabaseClient';
import { userName, userAccessLevel } from '../tablucya/users';

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

    // Resize state
    private isResizing: boolean = false;
    private resizeHandleSide: 'left' | 'right' | null = null;
    private resizingBlock: HTMLElement | null = null;
    private resizeOriginalStartMins: number = 0;
    private resizeOriginalEndMins: number = 0;
    private resizeStartX: number = 0;



    constructor(containerId: string = 'postCalendarGrid') {
        const el = document.getElementById(containerId);
        if (!el) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = el;
        this.init();
    }

    // Кольори статусів
    private readonly statusColors: Record<string, string> = {
        'Запланований': '#e6a700',
        'В роботі': '#2e7d32',
        'Відремонтований': '#757575',
        'Не приїхав': '#e53935'
    };

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

        // Примітка: loadArxivDataForCurrentDate() викликається з planyvannya.ts 
        // після рендерингу секцій слюсарів
    }

    /**
     * Очищає всі блоки бронювання з календаря
     */
    public clearAllBlocks(): void {
        const blocks = this.container.querySelectorAll('.post-reservation-block');
        blocks.forEach(block => block.remove());
    }

    /**
     * Завантажує записи з post_arxiv для поточної дати і відображає їх
     */
    public async loadArxivDataForCurrentDate(): Promise<void> {
        try {
            // Отримуємо поточну дату з елементу заголовку
            const currentDate = this.getCurrentDateFromHeader();
            if (!currentDate) {
                console.warn('Не вдалося отримати поточну дату');
                return;
            }

            // Формуємо діапазон дат для запиту (початок і кінець дня)
            const startOfDay = `${currentDate}T00:00:00`;
            const endOfDay = `${currentDate}T23:59:59`;

            // Запит до БД - отримуємо тільки дані з post_arxiv
            const { data: arxivRecords, error } = await supabase
                .from('post_arxiv')
                .select(`
                    post_arxiv_id,
                    slyusar_id,
                    name_post,
                    client_id,
                    cars_id,
                    status,
                    data_on,
                    data_off,
                    komentar,
                    act_id
                `)
                .gte('data_on', startOfDay)
                .lte('data_on', endOfDay);

            if (error) {
                console.error('Помилка завантаження записів з post_arxiv:', error);
                return;
            }

            if (!arxivRecords || arxivRecords.length === 0) {
                console.log('Немає записів для цієї дати');
                return;
            }

            console.log(`Завантажено ${arxivRecords.length} записів з БД`);

            // Збираємо унікальні ID клієнтів та машин для окремих запитів
            const clientIds = [...new Set(arxivRecords.map(r => r.client_id).filter(id => id != null))];
            const carIds = [...new Set(arxivRecords.map(r => r.cars_id).filter(id => id != null))];

            // Завантажуємо дані клієнтів
            let clientsMap = new Map<number, any>();
            if (clientIds.length > 0) {
                const { data: clientsData } = await supabase
                    .from('clients')
                    .select('client_id, data')
                    .in('client_id', clientIds);

                if (clientsData) {
                    clientsData.forEach(c => clientsMap.set(c.client_id, c.data));
                }
            }

            // Завантажуємо дані машин
            let carsMap = new Map<number, any>();
            if (carIds.length > 0) {
                const { data: carsData } = await supabase
                    .from('cars')
                    .select('cars_id, data')
                    .in('cars_id', carIds);

                if (carsData) {
                    carsData.forEach(c => carsMap.set(c.cars_id, c.data));
                }
            }

            // Відображаємо кожен запис
            for (const record of arxivRecords) {
                const clientData = clientsMap.get(record.client_id) || {};
                const carData = carsMap.get(record.cars_id) || {};
                this.renderArxivRecord(record, clientData, carData);
            }

        } catch (err) {
            console.error('Помилка при завантаженні даних:', err);
        }
    }

    /**
     * Завантажує записи з post_arxiv тільки для вказаних slyusar_id
     * Використовується при розгортанні секції
     */
    public async loadArxivDataForSlyusars(slyusarIds: number[]): Promise<void> {
        if (!slyusarIds || slyusarIds.length === 0) return;

        try {
            // Отримуємо поточну дату з елементу заголовку
            const currentDate = this.getCurrentDateFromHeader();
            if (!currentDate) {
                console.warn('Не вдалося отримати поточну дату');
                return;
            }

            // Формуємо діапазон дат для запиту (початок і кінець дня)
            const startOfDay = `${currentDate}T00:00:00`;
            const endOfDay = `${currentDate}T23:59:59`;

            // Запит до БД - фільтруємо по slyusar_id
            const { data: arxivRecords, error } = await supabase
                .from('post_arxiv')
                .select(`
                    post_arxiv_id,
                    slyusar_id,
                    name_post,
                    client_id,
                    cars_id,
                    status,
                    data_on,
                    data_off,
                    komentar,
                    act_id
                `)
                .in('slyusar_id', slyusarIds)
                .gte('data_on', startOfDay)
                .lte('data_on', endOfDay);

            if (error) {
                console.error('Помилка завантаження записів:', error);
                return;
            }

            if (!arxivRecords || arxivRecords.length === 0) {
                return;
            }

            console.log(`Завантажено ${arxivRecords.length} записів для секції`);

            // Збираємо унікальні ID клієнтів та машин
            const clientIds = [...new Set(arxivRecords.map(r => r.client_id).filter(id => id != null))];
            const carIds = [...new Set(arxivRecords.map(r => r.cars_id).filter(id => id != null))];

            // Завантажуємо дані клієнтів
            let clientsMap = new Map<number, any>();
            if (clientIds.length > 0) {
                const { data: clientsData } = await supabase
                    .from('clients')
                    .select('client_id, data')
                    .in('client_id', clientIds);

                if (clientsData) {
                    clientsData.forEach(c => clientsMap.set(c.client_id, c.data));
                }
            }

            // Завантажуємо дані машин
            let carsMap = new Map<number, any>();
            if (carIds.length > 0) {
                const { data: carsData } = await supabase
                    .from('cars')
                    .select('cars_id, data')
                    .in('cars_id', carIds);

                if (carsData) {
                    carsData.forEach(c => carsMap.set(c.cars_id, c.data));
                }
            }

            // Відображаємо кожен запис
            for (const record of arxivRecords) {
                const clientData = clientsMap.get(record.client_id) || {};
                const carData = carsMap.get(record.cars_id) || {};
                this.renderArxivRecord(record, clientData, carData);
            }

        } catch (err) {
            console.error('Помилка при завантаженні даних для секції:', err);
        }
    }

    /**
     * Отримує дату з заголовку сторінки у форматі YYYY-MM-DD
     */
    private getCurrentDateFromHeader(): string | null {
        const headerEl = document.getElementById('postHeaderDateDisplay');
        if (!headerEl) return null;

        const text = headerEl.textContent; // "Вівторок, 16 грудня 2025"
        if (!text) return null;

        // Парсимо українську дату
        const months: Record<string, string> = {
            'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
            'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
            'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
        };

        // Регулярка для "16 грудня 2025"
        const match = text.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
        if (!match) return null;

        const day = match[1].padStart(2, '0');
        const monthName = match[2].toLowerCase();
        const year = match[3];
        const month = months[monthName];

        if (!month) return null;

        return `${year}-${month}-${day}`;
    }

    /**
     * Відображає запис з БД на календарі
     */
    private renderArxivRecord(record: any, clientData: any, carData: any): void {
        // Знаходимо рядок слюсаря по slyusar_id
        const rowTrack = this.container.querySelector(
            `.post-row-track[data-slyusar-id="${record.slyusar_id}"]`
        ) as HTMLElement;

        if (!rowTrack) {
            console.warn(`Рядок для slyusar_id ${record.slyusar_id} не знайдено`);
            return;
        }

        // Парсимо час початку і кінця
        const dataOn = new Date(record.data_on);
        const dataOff = new Date(record.data_off);

        // Конвертуємо в хвилини від початку робочого дня (8:00)
        // Використовуємо UTC методи бо в БД зберігається UTC час
        const startMins = (dataOn.getUTCHours() - this.startHour) * 60 + dataOn.getUTCMinutes();
        const endMins = (dataOff.getUTCHours() - this.startHour) * 60 + dataOff.getUTCMinutes();

        // Перевіряємо що час в допустимих межах
        if (startMins < 0 || endMins > 12 * 60) {
            console.warn('Час запису виходить за межі робочого дня');
            return;
        }

        // Використовуємо передані дані клієнта і авто

        const clientName = clientData['ПІБ'] || '';
        const carModel = carData['Авто'] || '';
        const carNumber = carData['Номер авто'] || '';

        // Extract phone
        let clientPhone = '';
        if (clientData) {
            for (const key in clientData) {
                if (key.toLowerCase().includes('телефон')) {
                    const phone = clientData[key];
                    if (phone && typeof phone === 'string' && phone.trim() !== '') {
                        clientPhone = phone;
                        break; // Grab first phone found
                    }
                }
            }
        }

        // Формуємо дані для блоку
        const reservationData: ReservationData = {
            date: record.data_on.split('T')[0],
            startTime: `${dataOn.getUTCHours().toString().padStart(2, '0')}:${dataOn.getUTCMinutes().toString().padStart(2, '0')}`,
            endTime: `${dataOff.getUTCHours().toString().padStart(2, '0')}:${dataOff.getUTCMinutes().toString().padStart(2, '0')}`,
            clientId: record.client_id,
            clientName: clientName,
            clientPhone: clientPhone,
            carId: record.cars_id,
            carModel: carModel,
            carNumber: carNumber,
            comment: record.komentar || '',
            status: record.status || 'Запланований',
            postArxivId: record.post_arxiv_id,
            slyusarId: record.slyusar_id,
            namePost: record.name_post,
            actId: record.act_id // Pass the act_id
        };

        // Створюємо блок з правильним кольором
        this.createReservationBlockWithColor(rowTrack, startMins, endMins, reservationData);
    }

    /**
     * Створює блок резервації з кольором статусу
     */
    private createReservationBlockWithColor(row: HTMLElement, startMins: number, endMins: number, data: ReservationData): void {
        const totalMinutes = 12 * 60; // 12 hours (8 to 20)

        // Percentage positions
        const leftPercent = (startMins / totalMinutes) * 100;
        const widthPercent = ((endMins - startMins) / totalMinutes) * 100;

        const block = document.createElement('div');
        block.className = 'post-reservation-block';
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;

        // Встановлюємо колір фону залежно від статусу
        const statusColor = this.statusColors[data.status] || this.statusColors['Запланований'];
        block.style.backgroundColor = statusColor;

        // Store exact minutes
        block.dataset.start = startMins.toString();
        block.dataset.end = endMins.toString();

        // Store rich data
        block.dataset.clientName = data.clientName;
        block.dataset.clientId = data.clientId?.toString() || '';
        block.dataset.clientPhone = data.clientPhone || '';
        block.dataset.carModel = data.carModel;
        block.dataset.carNumber = data.carNumber;
        block.dataset.status = data.status || '';
        block.dataset.postArxivId = data.postArxivId?.toString() || '';
        block.dataset.carId = data.carId?.toString() || '';
        block.dataset.comment = data.comment;
        block.dataset.slyusarId = data.slyusarId?.toString() || '';
        block.dataset.namePost = data.namePost?.toString() || '';
        block.dataset.actId = data.actId?.toString() || '';

        // Використовуємо renderBlockContent для формування вмісту
        this.renderBlockContent(block, data);

        // Resize handles
        const leftHandle = document.createElement('div');
        leftHandle.className = 'resize-handle left';
        block.appendChild(leftHandle);

        const rightHandle = document.createElement('div');
        rightHandle.className = 'resize-handle right';
        block.appendChild(rightHandle);

        // Resize listeners
        const onResizeStart = (e: MouseEvent, side: 'left' | 'right') => {
            e.preventDefault();
            e.stopPropagation(); // Prevent block drag
            this.handleResizeMouseDown(e, block, side);
        };

        leftHandle.addEventListener('mousedown', (e) => onResizeStart(e, 'left'));
        rightHandle.addEventListener('mousedown', (e) => onResizeStart(e, 'right'));

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

            const detailData: Partial<ReservationData> = {
                clientName: block.dataset.clientName,
                clientId: parseInt(block.dataset.clientId || '0') || null,
                clientPhone: block.dataset.clientPhone,
                carModel: block.dataset.carModel,
                carNumber: block.dataset.carNumber,
                carId: parseInt(block.dataset.carId || '0') || null,
                status: block.dataset.status,
                comment: block.dataset.comment,
                postArxivId: parseInt(block.dataset.postArxivId || '0') || null,
                slyusarId: parseInt(block.dataset.slyusarId || '0') || null,
                namePost: parseInt(block.dataset.namePost || '0') || null,
                actId: parseInt(block.dataset.actId || '0') || null
            };

            this.openModal(startStr, endStr, detailData);
        });

        row.appendChild(block);
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
                // Check overlap, EXCLUDING self (which is not in track currently, but to be safe/consistent)
                const overlaps = this.checkOverlap(startMins, endMins, track, this.movingBlock);

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

    private onBlockMouseUp = async (_e: MouseEvent): Promise<void> => {
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

            // Зберігаємо посилання на блок перед async операцією
            const movedBlock = this.movingBlock;

            // === ОНОВЛЕННЯ БАЗИ ДАНИХ ===
            const postArxivId = movedBlock.dataset.postArxivId;
            const newSlyusarId = track.dataset.slyusarId;

            console.log('Переміщення блоку:', { postArxivId, newSlyusarId, startMins, endMins });

            if (postArxivId && newSlyusarId) {
                try {
                    // Отримуємо поточну дату з заголовку
                    const currentDate = this.getCurrentDateFromHeader();

                    if (currentDate) {
                        // Конвертуємо хвилини в час
                        const startHour = this.startHour + Math.floor(startMins / 60);
                        const startMin = startMins % 60;
                        const endHour = this.startHour + Math.floor(endMins / 60);
                        const endMin = endMins % 60;

                        const dataOn = `${currentDate}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`;
                        const dataOff = `${currentDate}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`;

                        console.log('Оновлення БД:', { postArxivId, newSlyusarId, dataOn, dataOff });

                        // Оновлюємо запис в БД
                        const { error } = await supabase
                            .from('post_arxiv')
                            .update({
                                slyusar_id: parseInt(newSlyusarId),
                                data_on: dataOn,
                                data_off: dataOff
                            })
                            .eq('post_arxiv_id', parseInt(postArxivId));

                        if (error) {
                            console.error('Помилка оновлення запису в БД:', error);
                            showNotification('Помилка збереження переміщення', 'error');
                        } else {
                            // Оновлюємо dataset блоку з новим slyusar_id
                            movedBlock.dataset.slyusarId = newSlyusarId;
                            // Оновлюємо dataset з новими хвилинами
                            movedBlock.dataset.start = startMins.toString();
                            movedBlock.dataset.end = endMins.toString();
                            showNotification('Запис переміщено', 'success');
                        }
                    } else {
                        showNotification('Запис переміщено (без збереження в БД)', 'warning');
                    }
                } catch (err) {
                    console.error('Помилка при оновленні БД:', err);
                    showNotification('Помилка збереження переміщення', 'error');
                }
            } else {
                console.warn('Немає postArxivId або newSlyusarId для збереження');
                showNotification('Запис переміщено', 'success');
            }
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

    private openModal(startTime: string, endTime: string, existingData: Partial<ReservationData> | string = ''): void {
        const headerDate = this.getCurrentDateFromHeader();
        const dateToUse = headerDate || new Date().toISOString().split('T')[0];

        // Normalizing arguments
        let data: Partial<ReservationData> = {};
        let comment = '';

        if (typeof existingData === 'string') {
            comment = existingData;
        } else {
            data = existingData;
            comment = data.comment || '';
        }

        let slyusarId: number | null = null;
        let namePost: number | null = null;

        if (this.activeRow) {
            const slyusarIdStr = this.activeRow.dataset.slyusarId;
            const postIdStr = this.activeRow.dataset.postId;

            if (slyusarIdStr) slyusarId = parseInt(slyusarIdStr);
            if (postIdStr) namePost = parseInt(postIdStr);
        }

        // Merge context data if not present in existingData
        if (!data.slyusarId && slyusarId) data.slyusarId = slyusarId;
        if (!data.namePost && namePost) data.namePost = namePost;

        const effectiveSlyusarId = data.slyusarId;

        // Calculate busy intervals for visual indication in modal
        const busyIntervals: { start: number, end: number }[] = [];
        let targetRowForBusy: HTMLElement | null = null;

        const targetSlyusarId = effectiveSlyusarId || (this.activeRow?.dataset.slyusarId ? parseInt(this.activeRow.dataset.slyusarId) : null);

        if (targetSlyusarId) {
            targetRowForBusy = this.container.querySelector(`.post-row-track[data-slyusar-id="${targetSlyusarId}"]`) as HTMLElement;
        }

        if (targetRowForBusy) {
            const blocks = Array.from(targetRowForBusy.querySelectorAll('.post-reservation-block')) as HTMLElement[];
            blocks.forEach(block => {
                // Skip if this is the block being edited
                if (data.postArxivId && block.dataset.postArxivId === data.postArxivId.toString()) return;
                if (this.editingBlock && block === this.editingBlock) return;

                const startRel = parseInt(block.dataset.start || '0');
                const endRel = parseInt(block.dataset.end || '0');

                // Convert relative mins (from startHour) to absolute day mins
                const startAbs = startRel + (this.startHour * 60);
                const endAbs = endRel + (this.startHour * 60);

                busyIntervals.push({ start: startAbs, end: endAbs });
            });
        }

        this.reservationModal.open(
            dateToUse,
            startTime,
            endTime,
            comment,
            data,
            (resultData: ReservationData) => this.handleModalSubmit(resultData),
            async (date, start, end, excludeId) => {
                // Перевірка: чи це поточна дата, що відображається
                const currentViewDate = this.getCurrentDateFromHeader();

                if (currentViewDate === date) {
                    // Якщо це поточна дата, використовуємо "візуальну" валідацію для підтримки feature "splitting"
                    // Ми дозволяємо перетин, ЯКЩО є вільне місце (тобто calculateValidRanges поверне > 0 діапазонів)

                    const startMins = this.timeToMinutesFromStart(start);
                    const endMins = this.timeToMinutesFromStart(end);

                    let targetRow: HTMLElement | null = null;
                    if (effectiveSlyusarId) {
                        targetRow = this.container.querySelector(`.post-row-track[data-slyusar-id="${effectiveSlyusarId}"]`) as HTMLElement;
                    }
                    if (!targetRow && this.activeRow) targetRow = this.activeRow;

                    if (targetRow) {
                        // Використовуємо excludeId для знаходження блоку, що редагується, якщо потрібно
                        // Але тут excludeBlock передається як елемент DOM. 
                        // Якщо ми редагуємо, this.editingBlock має бути встановлений.

                        // Перевіряємо, чи excludeId співпадає з поточним editingBlock (на випадок конфліктів)
                        let excludeBlock: HTMLElement | null = null;
                        if (this.editingBlock && this.editingBlock.dataset.postArxivId === excludeId?.toString()) {
                            excludeBlock = this.editingBlock;
                        }

                        const validRanges = this.calculateValidRanges(startMins, endMins, targetRow, excludeBlock);

                        if (validRanges.length === 0) {
                            return { valid: false, message: 'Цей час повністю зайнятий' };
                        }

                        // Якщо є вільні діапазони - дозволяємо (handleModalSubmit розіб'є на частини)
                        return { valid: true };
                    }

                    // Якщо рядок не знайдено (рідкісний випадок), дозволяємо submit, там буде перевірка
                    return { valid: true };
                }

                // Для інших дат - стара перевірка через БД (строга)
                return this.checkAvailabilityInDb(date, start, end, excludeId, effectiveSlyusarId || undefined);
            },
            busyIntervals
        );
    }

    private async handleModalSubmit(data: ReservationData): Promise<void> {
        let effectiveSlyusarId = data.slyusarId;
        if (!effectiveSlyusarId && this.activeRow) {
            effectiveSlyusarId = parseInt(this.activeRow.dataset.slyusarId || '0');
        }

        // Exclude current ID if we are editing
        let excludeId = undefined;
        if (this.editingBlock && this.editingBlock.dataset.postArxivId) {
            excludeId = parseInt(this.editingBlock.dataset.postArxivId);
        }

        const currentViewDate = this.getCurrentDateFromHeader();
        const isSameDate = currentViewDate === data.date;

        if (!isSameDate) {
            // Для іншої дати перевіряємо доступність в БД
            const availability = await this.checkAvailabilityInDb(
                data.date,
                data.startTime,
                data.endTime,
                excludeId,
                effectiveSlyusarId || undefined
            );

            if (!availability.valid) {
                showNotification(availability.message || 'Цей час вже зайнятий', 'error');
                return;
            }

            const startMins = this.timeToMinutesFromStart(data.startTime);
            const endMins = this.timeToMinutesFromStart(data.endTime);

            let successId: number | null = null;
            if (this.editingBlock && excludeId) {
                successId = await this.saveReservationToDb(data, startMins, endMins, excludeId);
            } else {
                successId = await this.saveReservationToDb(data, startMins, endMins);
            }

            if (successId) {
                showNotification(`Запис успішно збережено на ${data.date}`, 'success');
                if (this.editingBlock) {
                    this.editingBlock.remove();
                }
                this.reservationModal.close();
                this.editingBlock = null;
                this.resetSelection();
            }
            return;
        }

        const startMins = this.timeToMinutesFromStart(data.startTime);
        const endMins = this.timeToMinutesFromStart(data.endTime);

        console.log('📌 handleModalSubmit:', {
            isSameDate,
            currentViewDate,
            dataDate: data.date,
            startMins,
            endMins,
            effectiveSlyusarId,
            hasActiveRow: !!this.activeRow
        });

        if (endMins <= startMins) {
            showNotification('Час закінчення має бути пізніше часу початку', 'error');
            return;
        }

        let targetRow: HTMLElement | null = null;
        if (effectiveSlyusarId) {
            targetRow = this.container.querySelector(`.post-row-track[data-slyusar-id="${effectiveSlyusarId}"]`) as HTMLElement;
        }
        if (!targetRow && this.activeRow) targetRow = this.activeRow;

        console.log('📌 targetRow:', {
            hasTargetRow: !!targetRow,
            targetRowSlyusarId: targetRow?.dataset?.slyusarId
        });

        if (targetRow) {
            // Обчислюємо вільні діапазони
            const validRanges = this.calculateValidRanges(startMins, endMins, targetRow, this.editingBlock);

            console.log('🔍 Перевірка діапазонів:', {
                startMins,
                endMins,
                validRanges,
                validRangesCount: validRanges.length,
                isEditing: !!this.editingBlock
            });

            // Перевірка: чи весь виділений діапазон зайнятий?
            if (validRanges.length === 0) {
                console.warn('❌ Весь діапазон зайнятий!');
                showNotification('Цей час вже зайнятий', 'error');
                return;
            }

            if (this.editingBlock) {
                const oldPostArxivId = this.editingBlock.dataset.postArxivId;

                if (validRanges.length === 1 && oldPostArxivId) {
                    const range = validRanges[0];
                    const successId = await this.saveReservationToDb(data, range.start, range.end, parseInt(oldPostArxivId));
                    if (successId) {
                        this.editingBlock.remove();
                        const newData = { ...data, postArxivId: successId };
                        this.createReservationBlock(targetRow, range.start, range.end, newData);
                        showNotification('Запис оновлено', 'success');
                    }
                } else {
                    if (oldPostArxivId) {
                        await supabase.from('post_arxiv').delete().eq('post_arxiv_id', parseInt(oldPostArxivId));
                    }
                    this.editingBlock.remove();

                    let successCount = 0;
                    for (const range of validRanges) {
                        const newId = await this.saveReservationToDb(data, range.start, range.end);
                        if (newId) {
                            const checkoutData = { ...data, postArxivId: newId };
                            this.createReservationBlock(targetRow, range.start, range.end, checkoutData);
                            successCount++;
                        }
                    }
                    if (successCount > 0) {
                        const msg = successCount > 1 ? `Створено ${successCount} записи` : 'Запис оновлено';
                        showNotification(msg, 'success');
                    }
                }
                this.editingBlock = null;
            } else {
                // Створюємо нові записи для всіх вільних діапазонів
                let successCount = 0;
                for (const range of validRanges) {
                    const newId = await this.saveReservationToDb(data, range.start, range.end);
                    if (newId) {
                        const checkoutData = { ...data, postArxivId: newId };
                        this.createReservationBlock(targetRow, range.start, range.end, checkoutData);
                        successCount++;
                    }
                }
                if (successCount > 0) {
                    const msg = successCount > 1 ? `Створено ${successCount} записи` : 'Час зарезервовано';
                    showNotification(msg, 'success');
                }
            }
        }

        this.reservationModal.close();
        this.editingBlock = null;
        this.resetSelection();
    }

    private async saveReservationToDb(data: ReservationData, startMins: number, endMins: number, existingId?: number): Promise<number | null> {
        const targetDate = data.date;
        if (!targetDate) {
            console.error('No date provided for saving');
            return null;
        }

        const startHour = this.startHour + Math.floor(startMins / 60);
        const startMin = startMins % 60;
        const endHour = this.startHour + Math.floor(endMins / 60);
        const endMin = endMins % 60;

        const dataOn = `${targetDate}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`;
        const dataOff = `${targetDate}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`;

        const payload: any = {
            status: data.status,
            client_id: data.clientId,
            cars_id: data.carId,
            komentar: data.comment,
            data_on: dataOn,
            data_off: dataOff,
            slyusar_id: data.slyusarId,
            name_post: data.namePost
        };

        // Додаємо прізвище користувача тільки при створенні нового запису
        if (!existingId && userName) {
            payload.xto_zapusav = userName;
        }

        if (existingId) {
            const { error } = await supabase.from('post_arxiv').update(payload).eq('post_arxiv_id', existingId);
            if (error) {
                console.error('Update error:', error);
                showNotification('Помилка збереження в БД', 'error');
                return null;
            }
            return existingId;
        } else {
            const { data: res, error } = await supabase.from('post_arxiv').insert(payload).select('post_arxiv_id').single();
            if (error) {
                console.error('Insert error:', error);
                showNotification('Помилка збереження в БД', 'error');
                return null;
            }
            return res.post_arxiv_id;
        }
    }

    private async checkAvailabilityInDb(date: string, startTime: string, endTime: string, excludeId?: number, slyusarId?: number): Promise<{ valid: boolean, message?: string }> {
        if (!slyusarId) return { valid: false, message: 'Не обрано пост (слюсаря)' };

        const startIso = `${date}T${startTime}:00`;
        const endIso = `${date}T${endTime}:00`;

        let query = supabase
            .from('post_arxiv')
            .select('post_arxiv_id')
            .eq('slyusar_id', slyusarId)
            .lt('data_on', endIso)
            .gt('data_off', startIso);

        if (excludeId) {
            query = query.neq('post_arxiv_id', excludeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Validation check error:', error);
            return { valid: false, message: 'Помилка перевірки' };
        }

        if (data && data.length > 0) {
            return { valid: false, message: 'Цей час вже зайнятий' };
        }

        return { valid: true };
    }

    /**
     * Формує вміст блоку резервації (текст, іконки і т.д.)
     */
    private renderBlockContent(block: HTMLElement, data: ReservationData | string): void {
        block.innerHTML = ''; // Очищаємо попередній вміст

        const textContainer = document.createElement('div');
        textContainer.className = 'post-reservation-text';

        // Якщо передано об'єкт даних (не просто рядок)
        if (typeof data !== 'string' && data.clientName) {
            // Контейнер для ПІБ та Авто (flex row, wrap)
            const infoRow = document.createElement('div');
            infoRow.className = 'post-reservation-info-row';

            // ПІБ
            const mainText = document.createElement('span');
            mainText.className = 'post-reservation-main';
            mainText.textContent = data.clientName;
            infoRow.appendChild(mainText);

            // Авто (якщо є)
            if (data.carModel) {
                const subText = document.createElement('span');
                subText.className = 'post-reservation-sub';
                subText.textContent = `(${data.carModel})`;
                infoRow.appendChild(subText);
            }

            textContainer.appendChild(infoRow);

            // Коментар (якщо є)
            if (typeof data !== 'string' && data.comment) {
                const commentText = document.createElement('span');
                commentText.className = 'post-reservation-comment';
                commentText.textContent = data.comment;
                textContainer.appendChild(commentText);
            }
        } else {
            // Простий текст або fall-back
            const simpleText = typeof data === 'string' ? data : (data.comment || 'Резерв');
            const mainText = document.createElement('span');
            mainText.className = 'post-reservation-main';
            mainText.textContent = simpleText;
            textContainer.appendChild(mainText);
        }

        // Add Act Button if exists
        const actId = typeof data === 'string' ? null : (data.actId || null);
        if (actId) {
            const actBtnContainer = document.createElement('div');
            actBtnContainer.style.position = 'absolute';
            actBtnContainer.style.bottom = '2px';
            actBtnContainer.style.right = '2px';
            actBtnContainer.style.zIndex = '5'; // Ensure above text

            const actBtn = document.createElement('button');
            actBtn.className = 'Bukhhalter-act-btn';
            actBtn.textContent = `📋 ${actId}`;
            actBtn.title = `Відкрити акт №${actId}`;
            actBtn.style.fontSize = '11px';
            actBtn.style.padding = '1px 4px';
            actBtn.style.cursor = 'pointer';

            actBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof (window as any).openActModal === 'function') {
                    (window as any).openActModal(actId);
                }
            });

            actBtnContainer.appendChild(actBtn);
            block.appendChild(actBtnContainer);
        }

        block.appendChild(textContainer);
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
        let status = 'Запланований';

        if (typeof data === 'string') {
            comment = data;
        } else {
            comment = data.comment;
            status = data.status || 'Запланований';
            // Store rich data
            block.dataset.clientName = data.clientName;
            block.dataset.clientId = data.clientId?.toString() || '';
            block.dataset.clientPhone = data.clientPhone || '';
            block.dataset.carModel = data.carModel;
            block.dataset.carNumber = data.carNumber;
            block.dataset.status = status;
            block.dataset.postArxivId = data.postArxivId?.toString() || '';
            block.dataset.carId = data.carId?.toString() || '';
            block.dataset.slyusarId = data.slyusarId?.toString() || '';
            block.dataset.namePost = data.namePost?.toString() || '';
            block.dataset.actId = data.actId?.toString() || '';
        }

        block.dataset.comment = comment;

        // Встановлюємо колір фону залежно від статусу
        const statusColor = this.statusColors[status] || this.statusColors['Запланований'];
        block.style.backgroundColor = statusColor;

        // Використовуємо renderBlockContent для формування вмісту
        this.renderBlockContent(block, data);

        // Resize handles
        const leftHandle = document.createElement('div');
        leftHandle.className = 'resize-handle left';
        block.appendChild(leftHandle);

        const rightHandle = document.createElement('div');
        rightHandle.className = 'resize-handle right';
        block.appendChild(rightHandle);

        // Resize listeners
        const onResizeStart = (e: MouseEvent, side: 'left' | 'right') => {
            e.preventDefault();
            e.stopPropagation(); // Prevent block drag
            this.handleResizeMouseDown(e, block, side);
        };

        leftHandle.addEventListener('mousedown', (e) => onResizeStart(e, 'left'));
        rightHandle.addEventListener('mousedown', (e) => onResizeStart(e, 'right'));

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

            const detailData: Partial<ReservationData> = {
                clientName: block.dataset.clientName,
                clientId: parseInt(block.dataset.clientId || '0') || null,
                clientPhone: block.dataset.clientPhone,
                carModel: block.dataset.carModel,
                carNumber: block.dataset.carNumber,
                carId: parseInt(block.dataset.carId || '0') || null,
                status: block.dataset.status,
                comment: block.dataset.comment,
                postArxivId: parseInt(block.dataset.postArxivId || '0') || null,
                slyusarId: parseInt(block.dataset.slyusarId || '0') || null,
                namePost: parseInt(block.dataset.namePost || '0') || null,
                actId: parseInt(block.dataset.actId || '0') || null
            };

            this.openModal(startStr, endStr, detailData);
        });

        row.appendChild(block);
    }

    private checkOverlap(start: number, end: number, track: HTMLElement, excludeBlock: HTMLElement | null = null): boolean {
        // Get all existing blocks in this row
        const existingBlocks = Array.from(track.querySelectorAll('.post-reservation-block')) as HTMLElement[];

        for (const block of existingBlocks) {
            // Skip the block that is currently being moved or edited
            if (block === this.movingBlock || block === excludeBlock) continue;

            // Skip the block being resized if it is this one (handle case where excludeBlock wasn't passed or check logic)
            // Ideally excludeBlock handles it.

            const blockStart = parseInt(block.dataset.start || '0');
            const blockEnd = parseInt(block.dataset.end || '0');

            // Check intersection: (StartA < EndB) and (EndA > StartB)
            if (start < blockEnd && end > blockStart) {
                return true;
            }
        }
        return false;
    }

    private calculateValidRanges(start: number, end: number, row: HTMLElement, excludeBlock: HTMLElement | null = null): { start: number, end: number }[] {
        // This function is still used by onMouseUp of drag selection, so keep it but maybe it should use checkOverlap logic too?
        // Or just leave as is for selection logic.
        // Actually, checkOverlap is simpler for D&D of blocks.

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

    // --- Resize Logic ---

    private handleResizeMouseDown(e: MouseEvent, block: HTMLElement, side: 'left' | 'right'): void {
        this.isResizing = true;
        this.resizingBlock = block;
        this.resizeHandleSide = side;
        this.resizeStartX = e.clientX;

        // Store original values
        this.resizeOriginalStartMins = parseInt(block.dataset.start || '0');
        this.resizeOriginalEndMins = parseInt(block.dataset.end || '0');

        // Disable transitions during resize for responsiveness
        block.style.transition = 'none';

        document.addEventListener('mousemove', this.onResizeMouseMove);
        document.addEventListener('mouseup', this.onResizeMouseUp);
    }

    private onResizeMouseMove = (e: MouseEvent): void => {
        if (!this.isResizing || !this.resizingBlock || !this.resizeHandleSide) return;

        const deltaX = e.clientX - this.resizeStartX;
        const track = this.resizingBlock.closest('.post-row-track') as HTMLElement;
        if (!track) return;

        const trackWidth = track.getBoundingClientRect().width;
        const totalMinutes = 12 * 60; // 720
        const deltaMins = (deltaX / trackWidth) * totalMinutes;

        // Round to 30 mins
        // Actually, for smoothness we might want unbound, but for logic we need steps.
        // Let's stick to 30 min steps for snapping, or maybe freemove visually and snap on release?
        // User asked "drag and expand". Better visually smooth, snap logic.
        // But the grid is 30 mins. It's better to snap to grid.

        let newStart = this.resizeOriginalStartMins;
        let newEnd = this.resizeOriginalEndMins;

        // Round delta to nearest 30 mins
        // const snappedDeltaMins = Math.round(deltaMins / 30) * 30; // This might be jumpy

        // Let's try raw calculation then snap
        if (this.resizeHandleSide === 'left') {
            const rawNewStart = this.resizeOriginalStartMins + deltaMins;
            newStart = Math.round(rawNewStart / 30) * 30;

            // Constrain
            if (newStart < 0) newStart = 0;
            if (newStart >= newEnd - 30) newStart = newEnd - 30; // Min 30 mins duration
        } else {
            const rawNewEnd = this.resizeOriginalEndMins + deltaMins;
            newEnd = Math.round(rawNewEnd / 30) * 30;

            // Constrain
            if (newEnd > totalMinutes) newEnd = totalMinutes;
            if (newEnd <= newStart + 30) newEnd = newStart + 30;
        }

        // Apply visual update
        const leftPercent = (newStart / totalMinutes) * 100;
        const widthPercent = ((newEnd - newStart) / totalMinutes) * 100;

        this.resizingBlock.style.left = `${leftPercent}%`;
        this.resizingBlock.style.width = `${widthPercent}%`;

        // Update temp dataset for overlap check
        this.resizingBlock.dataset.tempStart = newStart.toString();
        this.resizingBlock.dataset.tempEnd = newEnd.toString();

        // Check valid
        const overlaps = this.checkOverlap(newStart, newEnd, track, this.resizingBlock);
        if (overlaps) {
            this.resizingBlock.classList.add('post-drag-invalid');
        } else {
            this.resizingBlock.classList.remove('post-drag-invalid');
        }
    }

    private onResizeMouseUp = async (_e: MouseEvent): Promise<void> => {
        if (!this.isResizing || !this.resizingBlock) return;

        document.removeEventListener('mousemove', this.onResizeMouseMove);
        document.removeEventListener('mouseup', this.onResizeMouseUp);

        // Finalize
        const start = parseInt(this.resizingBlock.dataset.tempStart || this.resizeOriginalStartMins.toString());
        const end = parseInt(this.resizingBlock.dataset.tempEnd || this.resizeOriginalEndMins.toString());

        // Restore transition
        this.resizingBlock.style.transition = '';
        this.resizingBlock.classList.remove('post-drag-invalid');

        // Check if changed
        if (start === this.resizeOriginalStartMins && end === this.resizeOriginalEndMins) {
            this.resetResizeState();
            return;
        }

        // Check validity
        const track = this.resizingBlock.closest('.post-row-track') as HTMLElement;
        const overlaps = this.checkOverlap(start, end, track, this.resizingBlock);

        if (overlaps) {
            // Revert
            const totalMinutes = 12 * 60;
            const leftPercent = (this.resizeOriginalStartMins / totalMinutes) * 100;
            const widthPercent = ((this.resizeOriginalEndMins - this.resizeOriginalStartMins) / totalMinutes) * 100;
            this.resizingBlock.style.left = `${leftPercent}%`;
            this.resizingBlock.style.width = `${widthPercent}%`;
            showNotification('Неможливо змінити час: перетин з іншим записом', 'error');
        } else {
            // Commit to DB
            await this.updateReservationTime(this.resizingBlock, start, end);
        }

        this.resetResizeState();
    }

    private resetResizeState(): void {
        this.isResizing = false;
        this.resizingBlock = null;
        this.resizeHandleSide = null;
    }

    private async updateReservationTime(block: HTMLElement, startMins: number, endMins: number): Promise<void> {
        const postArxivId = block.dataset.postArxivId;
        const slyusarId = block.dataset.slyusarId;

        if (!postArxivId || !slyusarId) return;

        // Update attributes locally
        block.dataset.start = startMins.toString();
        block.dataset.end = endMins.toString();
        delete block.dataset.tempStart;
        delete block.dataset.tempEnd;

        try {
            const currentDate = this.getCurrentDateFromHeader();
            if (!currentDate) return;

            const startHour = this.startHour + Math.floor(startMins / 60);
            const startMin = startMins % 60;
            const endHour = this.startHour + Math.floor(endMins / 60);
            const endMin = endMins % 60;

            const dataOn = `${currentDate}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`;
            const dataOff = `${currentDate}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`;

            const { error } = await supabase
                .from('post_arxiv')
                .update({
                    data_on: dataOn,
                    data_off: dataOff
                })
                .eq('post_arxiv_id', parseInt(postArxivId));

            if (error) {
                console.error('Update time error:', error);
                showNotification('Помилка оновлення часу', 'error');
                // Revert logic could go here but it's complex visually, for now keep UI as is or reload
            } else {
                showNotification('Час оновлено', 'success');
            }

        } catch (err) {
            console.error('Update time error:', err);
        }
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
                    // Отримуємо інформацію про запис з БД
                    const { data: recordData, error: fetchError } = await supabase
                        .from('post_arxiv')
                        .select('xto_zapusav')
                        .eq('post_arxiv_id', parseInt(postArxivId))
                        .single();

                    if (fetchError) {
                        console.error('Помилка отримання даних запису:', fetchError);
                        showNotification('Помилка перевірки прав доступу', 'error');
                        this.closeContextMenu();
                        return;
                    }

                    // Перевірка прав доступу
                    const isAdmin = userAccessLevel === 'Адміністратор';
                    const recordCreator = recordData?.xto_zapusav;

                    if (!isAdmin) {
                        // Якщо не адмін, перевіряємо чи співпадає прізвище
                        if (!recordCreator || recordCreator !== userName) {
                            const creatorName = recordCreator || 'Невідомий';
                            showNotification(
                                `Ви не можете видалити цей запис. Зверніться до ${creatorName}`,
                                'error'
                            );
                            this.closeContextMenu();
                            return;
                        }
                    }

                    // Видаляємо запис
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
