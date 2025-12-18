//src\ts\roboha\planyvannya\planyvannya_modal.ts

import '../../../scss/robocha/planyvannya/_planyvannya_modal.scss';
import { supabase } from '../../vxid/supabaseClient';
import { showNotification } from '../zakaz_naraudy/inhi/vspluvauhe_povidomlenna';

export interface ReservationData {
    date: string;
    startTime: string;
    endTime: string;
    clientId: number | null;
    clientName: string;
    clientPhone: string;
    carId: number | null;
    carModel: string;
    carNumber: string;
    comment: string;
    status: string;
    slyusarId?: number | null;
    namePost?: number | null;
    postArxivId?: number | null;
}


interface ClientData {
    client_id: number;
    name: string;
    phones: string[];
    source: string;
    additionalInfo: string;
    rawData: any;
}

interface CarData {
    cars_id: number;
    client_id: number;
    model: string;
    number: string;
    vin: string;
    year: string;
    volume: string;
    fuel: string;
    rawData: any;
}

export class PlanyvannyaModal {
    private modalOverlay: HTMLElement | null = null;
    private onSubmitCallback: ((data: ReservationData) => void) | null = null;
    private onValidateCallback: ((date: string, start: string, end: string, excludeId?: number) => Promise<{ valid: boolean, message?: string }>) | null = null;

    private clientsData: ClientData[] = [];
    private carsData: CarData[] = [];

    private selectedClientId: number | null = null;
    private selectedCarId: number | null = null;

    // Internal State for Date/Time
    private currentDate: Date = new Date();
    private currentStartTime: string = '08:00';
    private currentEndTime: string = '09:00';

    // Дані для post_arxiv
    private slyusarId: number | null = null;
    private namePost: number | null = null;
    private postArxivId: number | null = null;

    private currentStatusIndex: number = 0;
    private readonly statuses = [
        { name: 'Запланований', color: '#e6a700', headerBg: 'linear-gradient(135deg, #e6a700 0%, #f0b800 100%)' },
        { name: 'В роботі', color: '#2e7d32', headerBg: 'linear-gradient(135deg, #2e7d32 0%, #388e3c 100%)' },
        { name: 'Відремонтований', color: '#757575', headerBg: 'linear-gradient(135deg, #616161 0%, #757575 100%)' },
        { name: 'Не приїхав', color: '#e53935', headerBg: 'linear-gradient(135deg, #c62828 0%, #e53935 100%)' }
    ];

    constructor() {
        this.injectStyles();
    }

    private injectStyles(): void {
        const styleId = 'planyvannya-modal-interactive-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .post-arxiv-header-date-container {
                display: flex;
                align-items: center;
                gap: 5px;
                color: white;
                font-size: 14px;
                flex-wrap: wrap;
                margin-top: 5px;
            }
            .editable-date-part {
                position: relative;
                cursor: pointer;
                border-bottom: 1px dashed rgba(255,255,255,0.6);
                padding: 0 2px;
                transition: all 0.2s;
            }
            .editable-date-part:hover {
                background: rgba(255,255,255,0.1);
                border-bottom-color: white;
            }
            .editable-date-part.error {
                color: #ffcccc;
                border-bottom-color: #ffcccc;
            }
            .header-dropdown-menu {
                position: fixed; /* Fixed to avoid overflow issues */
                background: white;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                max-height: 250px;
                overflow-y: auto;
                z-index: 10000;
                min-width: 100px;
                display: none;
                color: #333;
                font-size: 13px;
            }
            .header-dropdown-item {
                padding: 8px 12px;
                cursor: pointer;
            }
            .header-dropdown-item:hover {
                background: #f5f5f5;
            }
            .header-dropdown-item.selected {
                background: #e3f2fd;
                color: #1976d2;
                font-weight: 500;
            }
            .header-dropdown-item.booked-time {
                background-color: #ededed;
                color: #777;
                padding-left: 15px; /* origin 12px + 3px */
            }
            .validation-error-message {
                background: #ffebee;
                color: #c62828;
                padding: 8px 12px;
                border-radius: 4px;
                margin: 10px 0 0 0; /* Changed margin to push down body */
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
                border: 1px solid #ffcdd2;
                width: 100%;
                box-sizing: border-box;
            }
            .post-arxiv-autocomplete-dropdown-up {
                top: auto !important;
                bottom: 100% !important;
                margin-bottom: 2px;
                box-shadow: 0 -4px 6px rgba(0,0,0,0.1);
            }
        `;
        document.head.appendChild(style);
    }

    private busyIntervals: { start: number, end: number }[] = [];

    public async open(
        date: string,
        startTime: string,
        endTime: string,
        comment: string = '',
        existingData?: Partial<ReservationData>,
        onSubmit?: (data: ReservationData) => void,
        onValidate?: (date: string, start: string, end: string, excludeId?: number) => Promise<{ valid: boolean, message?: string }>,
        busyIntervals: { start: number, end: number }[] = []
    ): Promise<void> {
        this.onSubmitCallback = onSubmit || null;
        this.onValidateCallback = onValidate || null;
        this.busyIntervals = busyIntervals;

        // Initialize state
        this.currentDate = new Date(date);
        this.currentStartTime = startTime;
        this.currentEndTime = endTime;

        this.slyusarId = existingData?.slyusarId ?? null;
        this.namePost = existingData?.namePost ?? null;
        this.postArxivId = existingData?.postArxivId ?? null;

        this.createModalHTML(comment);
        this.bindEvents();
        this.updateHeaderUI(); // Initial render of header parts
        this.validateCurrentState(); // Initial check

        // Initial data load
        await this.loadClientsData();

        if (existingData) {
            this.prefillData(existingData);
        }

        this.modalOverlay = document.getElementById('postArxivModalOverlay');
        if (this.modalOverlay) {
            this.modalOverlay.style.display = 'flex';
            const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
            if (nameInput && !nameInput.value) {
                nameInput.focus();
            }
        }
    }

    private prefillData(data: Partial<ReservationData>) {
        const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
        if (nameInput && data.clientName) nameInput.value = data.clientName;

        const phoneInput = document.getElementById('postArxivPhone') as HTMLInputElement;
        if (phoneInput && data.clientPhone) phoneInput.value = data.clientPhone;

        const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
        if (carInput && data.carModel) carInput.value = data.carModel;

        const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;
        if (numberInput && data.carNumber) numberInput.value = data.carNumber;

        if (data.status) {
            const idx = this.statuses.findIndex(s => s.name === data.status);
            if (idx >= 0) {
                this.currentStatusIndex = idx;
                this.applyStatus();
            }
        }

        this.selectedClientId = data.clientId || null;
        this.selectedCarId = data.carId || null;

        if (this.selectedClientId) {
            this.loadCarsForClient(this.selectedClientId, true).catch(console.error);
        }
    }

    private createModalHTML(comment: string): void {
        if (document.getElementById('postArxivModalOverlay')) return;

        const modalHTML = `
      <div class="post-arxiv-modal-overlay" id="postArxivModalOverlay">
        <div class="post-arxiv-modal">
            <div class="post-arxiv-header" id="postArxivHeader">
                <div class="post-arxiv-header-row">
                    <h2>Запис</h2>
                    <button class="post-arxiv-status-btn" id="postArxivStatusBtn">
                        <span id="postArxivStatusText">Запланований</span>
                    </button>
                    <button class="post-arxiv-close" id="postArxivClose">×</button>
                </div>
                
                <div class="post-arxiv-header-date-container">
                    <span id="hDayName" class="editable-date-part" title="Змінити день тижня">---</span>,
                    <span id="hDay" class="editable-date-part" title="Змінити день">--</span>
                    <span id="hMonth" class="editable-date-part" title="Змінити місяць">---</span>
                    <span id="hYear" class="editable-date-part" title="Змінити рік">----</span>
                    з <span id="hStartTime" class="editable-date-part" title="Змінити час початку">--:--</span>
                    по <span id="hEndTime" class="editable-date-part" title="Змінити час завершення">--:--</span>
                </div>
                <div id="validationErrorMsg" class="validation-error-message" style="display:none;"></div>
            </div>
          
            <div class="post-arxiv-body">
            
            <!-- ПІБ Клієнта -->
            <div class="post-arxiv-form-group post-arxiv-autocomplete-wrapper">
              <div class="post-arxiv-label-row">
                <label>ПІБ <span class="required">*</span></label>
                <button class="post-arxiv-mini-btn" id="postArxivNewClientBtn" title="Створити акт">Створити акт</button>
              </div>
              <input type="text" id="postArxivClientName" placeholder="Почніть вводити прізвище..." autocomplete="off">
              <div class="post-arxiv-autocomplete-dropdown" id="postArxivClientDropdown"></div>
            </div>
            
            <!-- Телефон -->
            <div class="post-arxiv-form-group post-arxiv-autocomplete-wrapper">
              <label>Телефон <span class="required">*</span></label>
              <input type="text" id="postArxivPhone" placeholder="+380..." autocomplete="off">
              <div class="post-arxiv-autocomplete-dropdown" id="postArxivPhoneDropdown"></div>
            </div>
            
            <!-- Автомобіль + Номер авто -->
            <div class="post-arxiv-form-row">
              <div class="post-arxiv-form-group post-arxiv-autocomplete-wrapper post-arxiv-car-field">
                <label>Автомобіль <span class="required">*</span></label>
                <input type="text" id="postArxivCar" placeholder="Марка..." autocomplete="off">
                <div class="post-arxiv-autocomplete-dropdown" id="postArxivCarDropdown"></div>
              </div>
              <div class="post-arxiv-form-group post-arxiv-autocomplete-wrapper post-arxiv-number-field">
                <label>Номер авто</label>
                <input type="text" id="postArxivCarNumber" placeholder="АА1234ВВ" autocomplete="off">
                <div class="post-arxiv-autocomplete-dropdown" id="postArxivCarNumberDropdown"></div>
              </div>
            </div>
            
            <!-- Коментар -->
            <div class="post-arxiv-form-group">
              <label>Коментар <span class="optional">(необов'язково)</span></label>
              <textarea id="postArxivComment" placeholder="Введіть коментар..." rows="1">${comment}</textarea>
            </div>
          </div>
          <div class="post-arxiv-footer">
            <button class="post-btn post-btn-primary" id="postArxivSubmit">ОК</button>
          </div>
        </div>
      </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    public close(): void {
        const dropdowns = document.querySelectorAll('.header-dropdown-menu');
        dropdowns.forEach(d => d.remove());

        if (this.modalOverlay) {
            this.modalOverlay.remove();
            this.modalOverlay = null;
        }
        this.selectedClientId = null;
        this.selectedCarId = null;
        this.carsData = [];
        this.closeAllDropdowns();
    }

    private updateHeaderUI(): void {
        const hDayName = document.getElementById('hDayName');
        const hDay = document.getElementById('hDay');
        const hMonth = document.getElementById('hMonth');
        const hYear = document.getElementById('hYear');
        const hStartTime = document.getElementById('hStartTime');
        const hEndTime = document.getElementById('hEndTime');

        if (!hDayName || !hDay || !hMonth || !hYear || !hStartTime || !hEndTime) return;

        const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
        const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

        hDayName.textContent = days[this.currentDate.getDay()];
        hDay.textContent = this.currentDate.getDate().toString();
        hMonth.textContent = months[this.currentDate.getMonth()];
        hYear.textContent = this.currentDate.getFullYear().toString();

        const formatTime = (t: string) => {
            const [h, m] = t.split(':');
            return `${parseInt(h)}:${m}`;
        };
        hStartTime.textContent = formatTime(this.currentStartTime);
        hEndTime.textContent = formatTime(this.currentEndTime);
    }

    private async validateCurrentState() {
        if (!this.onValidateCallback) return;

        const errorEl = document.getElementById('validationErrorMsg');
        const submitBtn = document.getElementById('postArxivSubmit') as HTMLButtonElement;

        const y = this.currentDate.getFullYear();
        const m = (this.currentDate.getMonth() + 1).toString().padStart(2, '0');
        const d = this.currentDate.getDate().toString().padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const result = await this.onValidateCallback(
            dateStr,
            this.currentStartTime,
            this.currentEndTime,
            this.postArxivId || undefined
        );

        if (!result.valid && errorEl) {
            errorEl.style.display = 'flex';
            errorEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${result.message}`;

            document.querySelectorAll('.editable-date-part').forEach(el => el.classList.add('error'));
            if (submitBtn) submitBtn.disabled = true;
        } else {
            if (errorEl) errorEl.style.display = 'none';
            document.querySelectorAll('.editable-date-part').forEach(el => el.classList.remove('error'));
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    private bindEvents(): void {
        const closeBtn = document.getElementById('postArxivClose');
        const submitBtn = document.getElementById('postArxivSubmit');
        const createActBtn = document.getElementById('postArxivNewClientBtn');

        closeBtn?.addEventListener('click', () => this.close());
        this.setupStatusButton();
        this.applyStatus();
        this.setupCommentAutoResize();
        submitBtn?.addEventListener('click', () => this.handleSubmit());
        createActBtn?.addEventListener('click', () => this.handleCreateAct());

        this.setupClientAutocomplete();
        this.setupPhoneAutocomplete();
        this.setupCarAutocomplete();
        this.setupCarNumberAutocomplete();

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.post-arxiv-autocomplete-wrapper')) {
                this.closeAllDropdowns();
            }
            if (!target.closest('.header-dropdown-menu') && !target.closest('.editable-date-part')) {
                document.querySelectorAll('.header-dropdown-menu').forEach(el => el.remove());
            }
        });

        this.setupHeaderInteractions();
    }

    private setupHeaderInteractions(): void {
        const bindDropdown = (id: string, generator: () => { text: string, value: any, sub?: string, isBooked?: boolean }[], onSelect: (val: any) => void) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.header-dropdown-menu').forEach(d => d.remove());

                const options = generator();
                const dropdown = document.createElement('div');
                dropdown.className = 'header-dropdown-menu';

                options.forEach(opt => {
                    const item = document.createElement('div');
                    item.className = 'header-dropdown-item';
                    item.textContent = opt.text;

                    if (opt.isBooked) {
                        item.classList.add('booked-time');
                    }

                    if (opt.sub) {
                        const sub = document.createElement('span');
                        sub.style.fontSize = '11px';
                        sub.style.color = '#888';
                        sub.style.marginLeft = '5px';
                        sub.textContent = opt.sub;
                        item.appendChild(sub);
                    }
                    if (String(opt.value) === String(el.textContent)) item.classList.add('selected');

                    item.addEventListener('click', () => {
                        onSelect(opt.value);
                        dropdown.remove();
                        this.updateHeaderUI();
                        this.validateCurrentState();
                    });
                    dropdown.appendChild(item);
                });

                document.body.appendChild(dropdown);

                const rect = el.getBoundingClientRect();
                dropdown.style.display = 'block';
                dropdown.style.left = `${rect.left}px`;
                dropdown.style.top = `${rect.bottom + 5}px`;

                const dropRect = dropdown.getBoundingClientRect();
                if (dropRect.right > window.innerWidth) {
                    dropdown.style.left = `${window.innerWidth - dropRect.width - 10}px`;
                }
                if (dropRect.bottom > window.innerHeight) {
                    dropdown.style.top = `${rect.top - dropRect.height - 5}px`;
                }
            });
        };

        bindDropdown('hDayName', () => {
            const days = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
            const opts = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(this.currentDate);
                d.setDate(d.getDate() + i);
                const dayName = days[d.getDay() === 0 ? 6 : d.getDay() - 1];
                opts.push({
                    text: dayName,
                    value: d.getTime(),
                    sub: `${d.getDate()}.${d.getMonth() + 1}`
                });
            }
            return opts;
        }, (ts) => {
            this.currentDate = new Date(ts);
        });

        bindDropdown('hDay', () => {
            const daysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
            const opts = [];
            for (let i = 1; i <= daysInMonth; i++) opts.push({ text: i.toString(), value: i });
            return opts;
        }, (val) => {
            this.currentDate.setDate(val);
        });

        bindDropdown('hMonth', () => {
            const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
                'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
            return months.map((m, i) => ({ text: m, value: i }));
        }, (val) => {
            this.currentDate.setMonth(val);
        });

        bindDropdown('hYear', () => {
            const current = new Date().getFullYear();
            const opts = [];
            for (let i = current; i <= current + 2; i++) opts.push({ text: i.toString(), value: i });
            return opts;
        }, (val) => {
            this.currentDate.setFullYear(val);
        });

        const generateTimes = () => {
            const times = [];
            for (let h = 8; h <= 20; h++) {
                const t1 = { text: `${h}:00`, value: `${h.toString().padStart(2, '0')}:00` };
                const m1 = h * 60;
                const isBooked1 = this.busyIntervals.some(i => m1 >= i.start && m1 < i.end);
                times.push({ ...t1, isBooked: isBooked1 });

                if (h !== 20) {
                    const t2 = { text: `${h}:30`, value: `${h.toString().padStart(2, '0')}:30` };
                    const m2 = h * 60 + 30;
                    const isBooked2 = this.busyIntervals.some(i => m2 >= i.start && m2 < i.end);
                    times.push({ ...t2, isBooked: isBooked2 });
                }
            }
            return times;
        };

        bindDropdown('hStartTime', generateTimes, (val) => {
            this.currentStartTime = val;
            const [sh, sm] = val.split(':').map(Number);
            const [eh, em] = this.currentEndTime.split(':').map(Number);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            if (startMins >= endMins) {
                const newEndMins = startMins + 60;
                const neh = Math.floor(newEndMins / 60);
                const nem = newEndMins % 60;
                this.currentEndTime = `${neh.toString().padStart(2, '0')}:${nem.toString().padStart(2, '0')}`;
            }
        });

        bindDropdown('hEndTime', generateTimes, (val) => {
            this.currentEndTime = val;
        });
    }

    private async loadClientsData(): Promise<void> {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('client_id, data')
                .order('data->>ПІБ'); // Assuming 'ПІБ' is a top-level key in JSONB or accessed this way

            if (error) throw error;

            this.clientsData = (data || []).map((row: any) => ({
                client_id: row.client_id,
                name: row.data['ПІБ'] || '',
                phones: this.extractAllPhones(row.data),
                source: row.data['Джерело'] || '',
                additionalInfo: row.data['Додатковий'] || '',
                rawData: row.data
            }));
        } catch (err) {
            console.error('Error loading clients:', err);
        }
    }

    private extractAllPhones(data: any): string[] {
        const phones: string[] = [];
        for (const key in data) {
            if (key.toLowerCase().includes('телефон')) {
                const phone = data[key];
                if (phone && typeof phone === 'string' && phone.trim() !== '') {
                    phones.push(phone);
                }
            }
        }
        return phones;
    }

    private async loadCarsForClient(clientId: number, preserveSelection: boolean = false): Promise<void> {
        try {
            const { data, error } = await supabase
                .from('cars')
                .select('cars_id, client_id, data')
                .eq('client_id', clientId);

            if (error) throw error;

            this.carsData = (data || []).map((row: any) => ({
                cars_id: row.cars_id,
                client_id: row.client_id,
                model: row.data['Авто'] || '',
                number: row.data['Номер авто'] || '',
                vin: row.data['Vincode'] || '',
                year: row.data['Рік'] || '',
                volume: row.data["Об'єм"] || '',
                fuel: row.data['Пальне'] || '',
                rawData: row.data
            }));

            // If we are editing (preserveSelection is true) and we have a selected car that exists in the loaded list,
            // we should NOT clear the fields.
            if (preserveSelection && this.selectedCarId) {
                const carExists = this.carsData.find(c => c.cars_id === this.selectedCarId);
                if (carExists) {
                    return; // Exit here, keeping the current input values
                }
            }

            // Autocomplete logic after loading cars:
            if (this.carsData.length === 1) {
                // If client has only 1 car, auto-fill
                this.fillCarFields(this.carsData[0]);
            } else {
                // If multiple cars, clear fields and let user choose
                // But we want to show the dropdown immediately if they focus
                const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
                const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;
                if (carInput) {
                    carInput.value = '';
                    carInput.placeholder = `Оберіть авто (${this.carsData.length} знайдено)...`;
                    // Trigger dropdown logic? 
                    // Better to let the focus event handle it, or trigger it manually:
                    // carInput.focus(); // Optional: might be annoying if they just finished phone number
                }
                if (numberInput) numberInput.value = '';
                this.selectedCarId = null;
            }

        } catch (err) {
            console.error('Error loading cars:', err);
        }
    }

    private fillCarFields(car: CarData): void {
        const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
        const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;

        if (carInput) carInput.value = car.model;
        if (numberInput) numberInput.value = car.number;
        this.selectedCarId = car.cars_id;
    }

    // --- Autocomplete Setup Methods ---

    private setupClientAutocomplete(): void {
        const input = document.getElementById('postArxivClientName') as HTMLInputElement;
        const dropdown = document.getElementById('postArxivClientDropdown');
        if (!input || !dropdown) return;

        input.addEventListener('input', () => {
            const val = input.value.toLowerCase().trim();
            this.selectedClientId = null; // Reset selection on edit

            if (val.length < 1) {
                this.closeAllDropdowns();
                return;
            }

            const matches = this.clientsData.filter(c => c.name.toLowerCase().includes(val)).slice(0, 10);
            this.showDropdown(dropdown, matches.map(c => ({
                text: c.name,
                subtext: c.phones[0] || 'Без телефону',
                onClick: () => this.handleClientSelect(c)
            })));
        });
    }

    private setupPhoneAutocomplete(): void {
        const input = document.getElementById('postArxivPhone') as HTMLInputElement;
        const dropdown = document.getElementById('postArxivPhoneDropdown');
        if (!input || !dropdown) return;

        input.addEventListener('input', () => {
            const val = input.value.replace(/\D/g, ''); // Search by digits
            if (val.length < 3) {
                this.closeAllDropdowns();
                return;
            }

            // Find clients with matching phone
            const matches: { client: ClientData, phone: string }[] = [];
            for (const client of this.clientsData) {
                for (const phone of client.phones) {
                    if (phone.replace(/\D/g, '').includes(val)) {
                        matches.push({ client, phone });
                        if (matches.length >= 10) break;
                    }
                }
                if (matches.length >= 10) break;
            }

            this.showDropdown(dropdown, matches.map(m => ({
                text: m.phone,
                subtext: m.client.name,
                onClick: () => {
                    input.value = m.phone;
                    this.handleClientSelect(m.client);
                }
            })));
        });
    }

    private setupCarAutocomplete(): void {
        const input = document.getElementById('postArxivCar') as HTMLInputElement;
        const dropdown = document.getElementById('postArxivCarDropdown');
        if (!input || !dropdown) return;

        const showClientCars = (filter: string = '') => {
            if (this.selectedClientId && this.carsData.length > 0) {
                const matches = this.carsData.filter(c => c.model.toLowerCase().includes(filter));
                this.showDropdown(dropdown, matches.map(c => ({
                    text: c.model,
                    subtext: c.number || 'Без номера',
                    onClick: () => this.fillCarFields(c)
                })));
            }
        };

        input.addEventListener('focus', () => {
            // Show all cars if client selected
            if (this.selectedClientId) {
                showClientCars();
            }
        });

        input.addEventListener('input', async () => {
            const val = input.value.toLowerCase().trim();

            if (this.selectedClientId) {
                // Filter loaded cars
                showClientCars(val);
            } else {
                // Global search for cars (if needed, otherwise just let them type)
                // For now, implementing global search via Supabase if no client selected
                if (val.length < 2) {
                    this.closeAllDropdowns();
                    return;
                }

                const { data } = await supabase
                    .from('cars')
                    .select('cars_id, client_id, data')
                    .ilike('data->>Авто', `%${val}%`)
                    .limit(10);

                if (data) {
                    this.showGlobalCarDropdown(dropdown, data);
                }
            }
        });
    }

    private setupCarNumberAutocomplete(): void {
        const input = document.getElementById('postArxivCarNumber') as HTMLInputElement;
        const dropdown = document.getElementById('postArxivCarNumberDropdown');
        if (!input || !dropdown) return;

        input.addEventListener('input', async () => {
            const val = input.value.toLowerCase().trim();

            if (this.selectedClientId) {
                // Filter loaded cars
                const matches = this.carsData.filter(c => c.number.toLowerCase().includes(val));
                this.showDropdown(dropdown, matches.map(c => ({
                    text: c.number,
                    subtext: c.model,
                    onClick: () => this.fillCarFields(c)
                })));
            } else {
                // Global search
                if (val.length < 2) {
                    this.closeAllDropdowns();
                    return;
                }

                const { data } = await supabase
                    .from('cars')
                    .select('cars_id, client_id, data')
                    .ilike('data->>Номер авто', `%${val}%`)
                    .limit(10);

                if (data) {
                    this.showGlobalCarDropdown(dropdown, data, 'number');
                }
            }
        });
    }

    private showGlobalCarDropdown(dropdown: HTMLElement, rawCars: any[], primary: 'model' | 'number' = 'model'): void {
        const items = rawCars.map(row => {
            const model = row.data['Авто'] || 'Unknown';
            const number = row.data['Номер авто'] || '';

            const text = primary === 'model' ? model : number;
            const subtext = primary === 'model' ? (number ? `Номер: ${number}` : '') : model;

            return {
                text: text,
                subtext: subtext,
                onClick: async () => {
                    // When global car selected, we need to load client data
                    // 1. Fill car fields
                    const carData: CarData = {
                        cars_id: row.cars_id,
                        client_id: row.client_id,
                        model: model,
                        number: number,
                        vin: row.data['Vincode'] || '',
                        year: row.data['Рік'] || '',
                        volume: row.data["Об'єм"] || '',
                        fuel: row.data['Пальне'] || '',
                        rawData: row.data
                    };
                    this.fillCarFields(carData);

                    // 2. Fetch and fill client
                    const { data: clientData } = await supabase
                        .from('clients')
                        .select('client_id, data')
                        .eq('client_id', row.client_id)
                        .single();

                    if (clientData) {
                        const client: ClientData = {
                            client_id: clientData.client_id,
                            name: clientData.data['ПІБ'] || '',
                            phones: this.extractAllPhones(clientData.data),
                            source: clientData.data['Джерело'] || '',
                            additionalInfo: clientData.data['Додатковий'] || '',
                            rawData: clientData.data
                        };
                        this.handleClientSelect(client, false);
                    }
                }
            };
        });
        this.showDropdown(dropdown, items);
    }

    // --- Helpers ---



    private setupStatusButton(): void {
        const statusBtn = document.getElementById('postArxivStatusBtn');
        if (statusBtn) {
            statusBtn.addEventListener('click', () => {
                this.currentStatusIndex = (this.currentStatusIndex + 1) % this.statuses.length;
                this.applyStatus();
            });
        }
    }

    private applyStatus(): void {
        const status = this.statuses[this.currentStatusIndex];
        const header = document.getElementById('postArxivHeader');
        const statusText = document.getElementById('postArxivStatusText');

        if (header) {
            header.style.background = status.headerBg;
        }

        if (statusText) {
            statusText.textContent = status.name;
        }
    }

    private setupCommentAutoResize(): void {
        const textarea = document.getElementById('postArxivComment') as HTMLTextAreaElement;
        if (!textarea) return;

        const resize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        };

        textarea.addEventListener('input', resize);
        // Initial resize in case of pre-filled content
        resize();
    }

    private handleClientSelect(client: ClientData, loadCars: boolean = true): void {
        const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
        const phoneInput = document.getElementById('postArxivPhone') as HTMLInputElement;

        if (nameInput) nameInput.value = client.name;
        // Fill phone if empty or if needed. If we selected by phone, it's already filled.
        if (phoneInput && !phoneInput.value) {
            phoneInput.value = client.phones[0] || '';
        }

        this.selectedClientId = client.client_id;

        if (loadCars) {
            this.loadCarsForClient(client.client_id);
        }

        this.closeAllDropdowns();
    }

    private showDropdown(container: HTMLElement, items: { text: string, subtext: string, onClick: () => void }[]): void {
        container.innerHTML = '';
        if (items.length === 0) {
            container.style.display = 'none';
            container.classList.remove('post-arxiv-autocomplete-dropdown-up');
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'post-arxiv-autocomplete-option';

            const main = document.createElement('div');
            main.className = 'post-arxiv-autocomplete-option-main';
            main.textContent = item.text;

            const sub = document.createElement('div');
            sub.className = 'post-arxiv-autocomplete-option-sub';
            sub.textContent = item.subtext;

            div.appendChild(main);
            div.appendChild(sub);

            div.addEventListener('click', (e) => {
                e.stopPropagation();
                item.onClick();
                this.closeAllDropdowns();
            });

            container.appendChild(div);
        });

        // Show temporarily to calculate size
        container.style.display = 'block';
        container.classList.remove('post-arxiv-autocomplete-dropdown-up');

        // Check if it fits
        const rect = container.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Custom logic: Force UP if more than 1 item and it is the Car Dropdown
        const isCarDropdown = container.id === 'postArxivCarDropdown';
        const shouldForceUp = isCarDropdown && items.length > 1;

        // If bottom of dropdown is below viewport OR should force up
        if (rect.bottom > viewportHeight - 10 || shouldForceUp) {
            container.classList.add('post-arxiv-autocomplete-dropdown-up');
        }
    }

    private closeAllDropdowns(): void {
        const dropdowns = document.querySelectorAll('.post-arxiv-autocomplete-dropdown');
        dropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
    }

    private handleCreateAct(): void {
        const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
        const phoneInput = document.getElementById('postArxivPhone') as HTMLInputElement;
        const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
        const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;
        const commentInput = document.getElementById('postArxivComment') as HTMLTextAreaElement;

        const dataToTransfer = {
            clientName: nameInput?.value || '',
            phone: phoneInput?.value || '',
            carModel: carInput?.value || '',
            carNumber: numberInput?.value || '',
            comment: commentInput?.value || '',
            clientId: this.selectedClientId,
            carId: this.selectedCarId
        };

        sessionStorage.setItem('createActData', JSON.stringify(dataToTransfer));

        window.location.href = 'main.html';
    }

    private async handleSubmit(): Promise<void> {
        const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
        const phoneInput = document.getElementById('postArxivPhone') as HTMLInputElement;
        const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
        const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;
        const commentInput = document.getElementById('postArxivComment') as HTMLTextAreaElement;
        const statusText = document.getElementById('postArxivStatusText');

        if (!nameInput?.value || !phoneInput?.value || !carInput?.value) {
            showNotification('Будь ласка, заповніть всі обов\'язкові поля', 'error');
            return;
        }

        const status = statusText?.textContent || 'Запланований';

        // Use internal state
        const y = this.currentDate.getFullYear();
        const m = (this.currentDate.getMonth() + 1).toString().padStart(2, '0');
        const d = this.currentDate.getDate().toString().padStart(2, '0');
        const dateValue = `${y}-${m}-${d}`;

        const data: ReservationData = {
            date: dateValue,
            startTime: this.currentStartTime,
            endTime: this.currentEndTime,
            clientId: this.selectedClientId,
            clientName: nameInput.value,
            clientPhone: phoneInput.value,
            carId: this.selectedCarId,
            carModel: carInput.value,
            carNumber: numberInput?.value || '',
            comment: commentInput?.value || '',
            status: status,
            postArxivId: this.postArxivId,
            slyusarId: this.slyusarId,
            namePost: this.namePost
        };

        if (this.onSubmitCallback) {
            this.onSubmitCallback(data);
        }

        this.close();
    }

    /**
     * Парсить дату і час з заголовку модального вікна
     * Вхідний формат: "Середа, 17 грудня 2025 з 11:30 по 18:00"
     */

}
