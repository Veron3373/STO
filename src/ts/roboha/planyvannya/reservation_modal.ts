import '../../../scss/robocha/planyvannya/_reservation_modal.scss';
import { supabase } from '../../vxid/supabaseClient';

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

export class ReservationModal {
    private modalOverlay: HTMLElement | null = null;
    private onSubmitCallback: ((data: ReservationData) => void) | null = null;

    private clientsData: ClientData[] = [];
    private carsData: CarData[] = []; // Only for currently selected client or search results

    private selectedClientId: number | null = null;
    private selectedCarId: number | null = null;

    private currentStatusIndex: number = 0;
    private readonly statuses = [
        { name: 'Запланований', color: '#e6a700', headerBg: 'linear-gradient(135deg, #e6a700 0%, #f0b800 100%)' },
        { name: 'Не приїхав', color: '#e53935', headerBg: 'linear-gradient(135deg, #c62828 0%, #e53935 100%)' },
        { name: 'В роботі', color: '#2e7d32', headerBg: 'linear-gradient(135deg, #2e7d32 0%, #388e3c 100%)' },
        { name: 'Відремонтований', color: '#757575', headerBg: 'linear-gradient(135deg, #616161 0%, #757575 100%)' }
    ];

    constructor() {
        // We don't create HTML here immediately to allow ensuring DOM is ready or just create on open
    }

    public async open(
        date: string,
        startTime: string,
        endTime: string,
        comment: string = '',
        // @ts-ignore
        existingData?: Partial<ReservationData>,
        onSubmit?: (data: ReservationData) => void
    ): Promise<void> {
        this.onSubmitCallback = onSubmit || null;
        this.createModalHTML(date, startTime, endTime, comment);
        this.bindEvents();

        // Initial data load
        await this.loadClientsData();

        // If we have existing data (editing), we might need to pre-fill and load cars
        // For now, handling the basic case of prepopulating fields from args

        this.modalOverlay = document.getElementById('postArxivModalOverlay');
        if (this.modalOverlay) {
            this.modalOverlay.style.display = 'flex';

            // Focus name input by default
            const nameInput = document.getElementById('postArxivClientName');
            nameInput?.focus();
        }
    }

    public close(): void {
        if (this.modalOverlay) {
            this.modalOverlay.remove();
            this.modalOverlay = null;
        }
        this.selectedClientId = null;
        this.selectedCarId = null;
        this.carsData = [];
        this.closeAllDropdowns();
    }

    private createModalHTML(date: string, startTime: string, endTime: string, comment: string): void {
        if (document.getElementById('postArxivModalOverlay')) return;

        // Get formatted date from header element or format the date
        const headerDateEl = document.getElementById('postHeaderDateDisplay');
        const displayDate = headerDateEl ? headerDateEl.textContent : this.formatDateUkrainian(date);

        const modalHTML = `
      <div class="post-arxiv-modal-overlay" id="postArxivModalOverlay">
        <div class="post-arxiv-modal">
          <div class="post-arxiv-header" id="postArxivHeader">
            <div class="post-arxiv-header-content">
              <h2>Резервування часу</h2>
              <p class="post-arxiv-header-date">${displayDate}</p>
            </div>
            <button class="post-arxiv-status-btn" id="postArxivStatusBtn">
              <span id="postArxivStatusText">Запланований</span>
            </button>
            <button class="post-arxiv-close" id="postArxivClose">×</button>
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
            
            <!-- Час -->
            <div class="post-arxiv-form-group">
              <label>Час</label>
              <div class="post-arxiv-time-row">
                <div class="post-arxiv-time-field">
                  <span class="post-arxiv-time-label">Початок</span>
                  <div class="post-arxiv-time-selects">
                    <select id="postArxivStartHour">
                      ${this.generateHourOptions(startTime.split(':')[0])}
                    </select>
                    <span class="post-arxiv-time-colon">:</span>
                    <select id="postArxivStartMinute">
                      <option value="00" ${startTime.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                      <option value="30" ${startTime.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                    </select>
                  </div>
                </div>
                <div class="post-arxiv-time-field">
                  <span class="post-arxiv-time-label">Кінець</span>
                  <div class="post-arxiv-time-selects">
                    <select id="postArxivEndHour">
                      ${this.generateHourOptions(endTime.split(':')[0])}
                    </select>
                    <span class="post-arxiv-time-colon">:</span>
                    <select id="postArxivEndMinute">
                      <option value="00" ${endTime.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                      <option value="30" ${endTime.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Коментар -->
            <div class="post-arxiv-form-group">
              <label>Коментар <span class="optional">(необов'язково)</span></label>
              <textarea id="postArxivComment" placeholder="Введіть коментар..." rows="1">${comment}</textarea>
            </div>

            <!-- Hidden date field -->
            <input type="hidden" id="postArxivDate" value="${date}">
          </div>
          <div class="post-arxiv-footer">
            <button class="post-btn post-btn-secondary" id="postArxivCancel">Скасувати</button>
            <button class="post-btn post-btn-primary" id="postArxivSubmit">ОК</button>
          </div>
        </div>
      </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    private bindEvents(): void {
        const closeBtn = document.getElementById('postArxivClose');
        const cancelBtn = document.getElementById('postArxivCancel');
        const submitBtn = document.getElementById('postArxivSubmit');

        closeBtn?.addEventListener('click', () => this.close());
        cancelBtn?.addEventListener('click', () => this.close());

        // Status button handler
        this.setupStatusButton();
        this.applyStatus(); // Apply initial status

        // New client button handler
        const newClientBtn = document.getElementById('postArxivNewClientBtn');
        newClientBtn?.addEventListener('click', () => {
            // TODO: Implement new client modal or action
            console.log('New client button clicked');
        });

        // Comment textarea auto-resize
        this.setupCommentAutoResize();
        submitBtn?.addEventListener('click', () => this.handleSubmit());

        // Autocomplete events
        this.setupClientAutocomplete();
        this.setupPhoneAutocomplete();
        this.setupCarAutocomplete();
        this.setupCarNumberAutocomplete();

        // Close dropdowns on click outside
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.post-arxiv-autocomplete-wrapper')) {
                this.closeAllDropdowns();
            }
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

    private async loadCarsForClient(clientId: number): Promise<void> {
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

    private formatDateUkrainian(dateString: string): string {
        const date = new Date(dateString);
        const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
        const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

        const dayOfWeek = days[date.getDay()];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${dayOfWeek}, ${day} ${month} ${year}`;
    }

    private generateHourOptions(selectedHour: string): string {
        let options = '';
        const selected = parseInt(selectedHour, 10);
        for (let h = 8; h <= 22; h++) {
            const hourStr = h.toString().padStart(2, '0');
            const isSelected = h === selected ? 'selected' : '';
            options += `<option value="${hourStr}" ${isSelected}>${hourStr}</option>`;
        }
        return options;
    }

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

        container.style.display = 'block';
    }

    private closeAllDropdowns(): void {
        const dropdowns = document.querySelectorAll('.post-arxiv-autocomplete-dropdown');
        dropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
    }

    private handleSubmit(): void {
        const nameInput = document.getElementById('postArxivClientName') as HTMLInputElement;
        const phoneInput = document.getElementById('postArxivPhone') as HTMLInputElement;
        const carInput = document.getElementById('postArxivCar') as HTMLInputElement;
        const numberInput = document.getElementById('postArxivCarNumber') as HTMLInputElement;
        const dateInput = document.getElementById('postArxivDate') as HTMLInputElement;
        const startHour = document.getElementById('postArxivStartHour') as HTMLSelectElement;
        const startMinute = document.getElementById('postArxivStartMinute') as HTMLSelectElement;
        const endHour = document.getElementById('postArxivEndHour') as HTMLSelectElement;
        const endMinute = document.getElementById('postArxivEndMinute') as HTMLSelectElement;
        const commentInput = document.getElementById('postArxivComment') as HTMLTextAreaElement;

        // Validation
        if (!nameInput?.value || !phoneInput?.value || !carInput?.value || !dateInput?.value) {
            alert('Будь ласка, заповніть всі обов\'язкові поля');
            return;
        }

        const startTime = `${startHour.value}:${startMinute.value}`;
        const endTime = `${endHour.value}:${endMinute.value}`;

        const data: ReservationData = {
            date: dateInput.value,
            startTime: startTime,
            endTime: endTime,
            clientId: this.selectedClientId,
            clientName: nameInput.value,
            clientPhone: phoneInput.value,
            carId: this.selectedCarId,
            carModel: carInput.value,
            carNumber: numberInput?.value || '',
            comment: commentInput?.value || ''
        };

        if (this.onSubmitCallback) {
            this.onSubmitCallback(data);
        }

        // this.close(); // Let the caller close it if validation passes outside or logic requires it
    }
}
