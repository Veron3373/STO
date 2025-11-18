// src\ts\roboha\zakaz_naraudy\inhi\actRaxunok.ts

// Імпортуємо supabase клієнт
import { supabase } from "../../../vxid/supabaseClient";

export const MODAL_ACT_RAXUNOK_ID = "modal-act-raxunok";

// Розширюємо інтерфейс Window
declare global {
  interface Window {
    XLSX: any;
  }
}

// Глобальна змінна для XLSX
let XLSX: any = null;

/**
 * Завантажує бібліотеку XLSX динамічно
 */
function loadXLSXLibrary(): Promise<void> {
  if (XLSX) return Promise.resolve();
  
  if (window.XLSX) {
    XLSX = window.XLSX;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = () => {
      XLSX = window.XLSX;
      console.log("✅ XLSX завантажено");
      resolve();
    };
    script.onerror = () => {
      console.error("❌ Помилка завантаження XLSX");
      reject(new Error("Не вдалося завантажити бібліотеку XLSX"));
    };
    document.head.appendChild(script);
  });
}

console.log("✅ actRaxunok.ts завантажено");

/**
 * Склонює місяці у родовому відмінку
 */
function getMonthNameGenitive(month: number): string {
  const months = [
    "Січня", "Лютого", "Березня", "Квітня", "Травня", "Червня",
    "Липня", "Серпня", "Вересня", "Жовтня", "Листопада", "Грудня"
  ];
  return months[month];
}

/**
 * Форматує число у формат з нулями (наприклад, 2 -> 0000002)
 */
function formatNumberWithZeros(num: number): string {
  return num.toString().padStart(7, '0');
}

/**
 * Конвертує число у словесний формат українською
 */
function numberToWords(num: number): string {
  if (num === 0) return "нуль гривень";

  const ones = ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
  const tens = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
  const hundreds = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];
  const teens = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
  const thousands = ["тисяча", "тисячі", "тисяч"];

  function convertHundreds(n: number): string {
    if (n === 0) return "";
    
    let result = "";
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h > 0) result += hundreds[h] + " ";
    
    if (t === 1) {
      result += teens[o] + " ";
    } else {
      if (t > 0) result += tens[t] + " ";
      if (o > 0) result += ones[o] + " ";
    }
    
    return result.trim();
  }

  function getThousandsForm(n: number): string {
    const lastDigit = n % 10;
    const lastTwoDigits = n % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return thousands[2];
    if (lastDigit === 1) return thousands[0];
    if (lastDigit >= 2 && lastDigit <= 4) return thousands[1];
    return thousands[2];
  }

  const intPart = Math.floor(num);
  let result = "";

  const thousandsPart = Math.floor(intPart / 1000);
  const hundredsPart = intPart % 1000;

  if (thousandsPart > 0) {
    const thousandsText = convertHundreds(thousandsPart);
    result += thousandsText.replace("один", "одна").replace("два", "дві") + " " + getThousandsForm(thousandsPart) + " ";
  }

  if (hundredsPart > 0) {
    result += convertHundreds(hundredsPart) + " ";
  }

  const lastDigit = intPart % 10;
  const lastTwoDigits = intPart % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    result += "гривень";
  } else if (lastDigit === 1) {
    result += "гривня";
  } else if (lastDigit >= 2 && lastDigit <= 4) {
    result += "гривні";
  } else {
    result += "гривень";
  }

  return result.trim().charAt(0).toUpperCase() + result.trim().slice(1);
}

/**
 * Отримує наступний номер рахунку з бази даних
 */
async function getNextRaxunokNumber(currentActId: number): Promise<string> {
  try {
    const { data: acts, error } = await supabase
      .from('acts')
      .select('act_id, contrAgent_act');
    
    if (error) throw error;
    
    let maxNumber = 0;
    if (acts && Array.isArray(acts)) {
      acts.forEach((act: any) => {
        if (act.act_id !== currentActId && act.contrAgent_act) {
          const num = parseInt(act.contrAgent_act.replace(/^0+/, '')) || 0;
          if (num > maxNumber) maxNumber = num;
        }
      });
    }
    
    const newNumber = maxNumber + 1;
    const formattedNumber = formatNumberWithZeros(newNumber);
    
    // Зберігаємо номер в базу даних
    const { error: updateError } = await supabase
      .from('acts')
      .update({ contrAgent_act: formattedNumber })
      .eq('act_id', currentActId);
    
    if (updateError) {
      console.warn("⚠️ Не вдалося зберегти номер в БД:", updateError);
    }
    
    return formattedNumber;
  } catch (error) {
    console.error("Помилка отримання номера рахунку:", error);
    return "0000001";
  }
}

/**
 * Отримує дані поточного акту з DOM
 */
function getCurrentActDataFromDOM(): any {
  const modal = document.getElementById("zakaz_narayd-custom-modal");
  const actIdStr = modal?.getAttribute("data-act-id");
  if (!actIdStr) return null;

  const actId = Number(actIdStr);

  const clientCell = document.querySelector('.zakaz_narayd-table.left tr:nth-child(2) td:nth-child(2)');
  const client = clientCell?.textContent?.trim() || "Клієнт не вказаний";

  const tableBody = document.querySelector('#act-items-table-container tbody');
  const rows = tableBody ? Array.from(tableBody.querySelectorAll('tr')) : [];

  const items: any[] = [];

  rows.forEach((row) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const qtyCell = row.querySelector('[data-name="id_count"]') as HTMLElement;
    const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;

    const name = nameCell?.textContent?.trim() || "";
    const quantity = parseFloat(qtyCell?.textContent?.replace(/\s/g, "") || "0") || 0;
    const price = parseFloat(priceCell?.textContent?.replace(/\s/g, "") || "0") || 0;
    const suma = parseFloat(sumCell?.textContent?.replace(/\s/g, "") || "0") || 0;

    if (name) {
      items.push({ name, quantity, price, suma });
    }
  });

  return {
    act_id: actId,
    client,
    items
  };
}

/**
 * Створює Excel рахунок-фактуру
 */
async function createRaxunokExcel(actData: any): Promise<void> {
  try {
    console.log("📝 Початок створення рахунку для акту:", actData);
    
    await loadXLSXLibrary();
    
    if (!XLSX) {
      throw new Error("Бібліотека XLSX не завантажена");
    }

    console.log("✅ XLSX завантажено");

    // Постачальник за замовчуванням
    let supplierName = "ФОП Брацлавець Богдан Сергійович";
    
    // Пробуємо отримати з бази даних
    try {
      const { data: suppliers, error } = await supabase
        .from('faktura')
        .select('oderjyvach')
        .eq('faktura_id', 1)
        .single();
        
      if (!error && suppliers?.oderjyvach) {
        supplierName = suppliers.oderjyvach;
      }
    } catch (dbError) {
      console.warn("⚠️ Не вдалося отримати постачальника з БД, використовуємо дефолтне значення:", dbError);
    }

    console.log("📋 Постачальник:", supplierName);
    console.log("📋 Постачальник:", supplierName);
    
    const client = actData.client || "Одержувач не вказаний";
    console.log("👤 Клієнт:", client);
    
    let invoiceNumber = "0000001";
    try {
      invoiceNumber = await getNextRaxunokNumber(actData.act_id);
      console.log("🔢 Номер рахунку:", invoiceNumber);
    } catch (numError) {
      console.warn("⚠️ Не вдалося отримати номер з БД, використовуємо дефолтний:", numError);
    }
    
    const now = new Date();
    const day = now.getDate();
    const month = getMonthNameGenitive(now.getMonth());
    const year = now.getFullYear();
    const dateString = `від ${day} ${month} ${year} р.`;
    
    console.log("📅 Дата:", dateString);
    
    const totalSum = actData.items.reduce((sum: number, item: any) => sum + (item.suma || 0), 0);
    const totalSumWords = numberToWords(totalSum);
    
    console.log("💰 Загальна сума:", totalSum, "→", totalSumWords);
    console.log("📦 Кількість товарів/послуг:", actData.items.length);
    
    const wb = XLSX.utils.book_new();
    
    const wsData: any[][] = [
      [`Рахунок-фактура № СФ-${invoiceNumber}`],
      [dateString],
      [],
      ["Постачальник"],
      [supplierName],
      ["ЄДРПОУ 3504709999 , тел. 0632346896"],
      ["Адреса 21008, м.Вінниця, вул.Корольова, буд.6"],
      [],
      ["Одержувач"],
      [client],
      [],
      ["Платник той самий"],
      ["Замовлення Без замовлення"],
      [],
      ["№", "Назва", "Од.", "Кількість", "Ціна без ПДВ", "Сума без ПДВ"]
    ];
    
    actData.items.forEach((item: any, index: number) => {
      wsData.push([
        index + 1,
        item.name || "",
        "шт",
        item.quantity || 0,
        item.price || 0,
        item.suma || 0
      ]);
    });
    
    wsData.push([]);
    wsData.push(["", "", "", "", "Всього:", totalSum]);
    wsData.push([]);
    wsData.push(["Всього на суму:"]);
    wsData.push([`${totalSumWords} 00 копійок`]);
    wsData.push(["Без ПДВ"]);
    wsData.push([]);
    wsData.push(["Виписав(ла):"]);
    wsData.push(["_______________________"]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    ws['!cols'] = [
      { wch: 5 },
      { wch: 40 },
      { wch: 8 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Рахунок-фактура");
    
    const fileName = `Рахунок_СФ-${invoiceNumber}_${day}_${month}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    console.log(`✅ Рахунок-фактура ${fileName} створено успішно!`);
    
  } catch (error) {
    console.error("❌ Помилка створення рахунку:", error);
    alert("Помилка при створенні рахунку-фактури. Перевірте консоль для деталей.");
  }
}

/**
 * Створює модальне вікно для вибору типу документа: Рахунок або Акт
 */
export function createModalActRaxunok(): HTMLElement {
  const modal = document.createElement("div");
  modal.id = MODAL_ACT_RAXUNOK_ID;
  modal.className = "act-raxunok-overlay hidden";

  modal.innerHTML = `
    <div class="act-raxunok-content">
      <button class="act-raxunok-close" id="act-raxunok-close">✕</button>
      
      <div class="act-raxunok-header">
        <h2>📄 Оберіть тип документа</h2>
      </div>

      <div class="act-raxunok-buttons">
        <button class="act-raxunok-btn act-raxunok-btn-invoice" id="create-raxunok-btn">
          <span class="btn-icon">🧾</span>
          <span class="btn-text">Рахунок</span>
          <span class="btn-description">Рахунок на оплату</span>
        </button>

        <button class="act-raxunok-btn act-raxunok-btn-act" id="create-act-only-btn">
          <span class="btn-icon">📋</span>
          <span class="btn-text">Акт</span>
          <span class="btn-description">Акт виконаних робіт</span>
        </button>
      </div>
    </div>
  `;

  return modal;
}

/**
 * Відкриває модальне вікно вибору типу документа
 */
export function openModalActRaxunok(): void {
  console.log("🔓 Відкриваємо модальне вікно actRaxunok...");
  
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  
  if (!modal) {
    console.error("❌ Модальне вікно actRaxunok не знайдене в DOM!");
    console.log("Всі елементи з класом modal:", 
      Array.from(document.querySelectorAll('[class*="modal"]')).map(el => el.id)
    );
    return;
  }
  
  console.log("✅ Модальне вікно знайдено:", modal);
  modal.classList.remove("hidden");
  console.log("✅ Модальне вікно відкрито");
}

/**
 * Закриває модальне вікно вибору типу документа
 */
export function closeModalActRaxunok(): void {
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (modal) {
    modal.classList.add("hidden");
  }
}

/**
 * Ініціалізує обробники подій для модального вікна
 */
export function initModalActRaxunokHandlers(): void {
  const closeBtn = document.getElementById("act-raxunok-close");
  closeBtn?.addEventListener("click", closeModalActRaxunok);

  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModalActRaxunok();
    }
  });

  const raxunokBtn = document.getElementById("create-raxunok-btn");
  raxunokBtn?.addEventListener("click", async () => {
    console.log("✅ Створення РАХУНКУ");
    
    try {
      const actData = getCurrentActDataFromDOM();
      if (!actData) {
        alert("Помилка: не вдалося отримати дані акту");
        return;
      }
      
      await createRaxunokExcel(actData);
      closeModalActRaxunok();
    } catch (error) {
      console.error("Помилка створення рахунку:", error);
      alert("Помилка при створенні рахунку");
    }
  });

  const actBtn = document.getElementById("create-act-only-btn");
  actBtn?.addEventListener("click", () => {
    console.log("✅ Створення АКТУ");
    closeModalActRaxunok();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModalActRaxunok();
    }
  });
}

/**
 * Ініціалізує кнопку відкриття модального вікна в основному акті
 */
export function initCreateActRaxunokButton(): void {
  console.log("🔍 Шукаємо кнопку create-act-btn...");
  
  const createActBtn = document.getElementById("create-act-btn");
  
  if (!createActBtn) {
    console.error("❌ Кнопка create-act-btn не знайдена в DOM!");
    console.log("Всі кнопки з id:", 
      Array.from(document.querySelectorAll('[id]')).map(el => el.id)
    );
    return;
  }

  console.log("✅ Кнопка create-act-btn знайдена:", createActBtn);

  const newBtn = createActBtn.cloneNode(true) as HTMLElement;
  createActBtn.parentNode?.replaceChild(newBtn, createActBtn);

  newBtn.addEventListener("click", (e) => {
    console.log("🖱️ Клік по кнопці Акт/Рахунок");
    e.preventDefault();
    e.stopPropagation();
    openModalActRaxunok();
  });

  console.log("✅ Обробник кліку додано до кнопки");
}