// src/ts/roboha/zakaz_naraudy/inhi/fakturaRaxunok.ts

import { supabase } from "../../../vxid/supabaseClient";
import { formatNumberWithSpaces } from "../globalCache";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { showNotification } from "./vspluvauhe_povidomlenna";

export const INVOICE_PREVIEW_MODAL_ID = "invoice-preview-modal";

/* --- Допоміжні функції --- */

function getCurrentDateDDMMYYYY(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

function getCurrentDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthNameGenitive(month: number): string {
  const months = [
    "Січня",
    "Лютого",
    "Березня",
    "Квітня",
    "Травня",
    "Червня",
    "Липня",
    "Серпня",
    "Вересня",
    "Жовтня",
    "Листопада",
    "Грудня",
  ];
  return months[month];
}

function formatNumberWithZeros(num: number): string {
  return num.toString().padStart(7, "0");
}

function amountToWordsUA(amount: number): string {
  const UAH = Math.floor(amount);
  const kopecks = Math.round((amount - UAH) * 100);

  const ones = [
    "",
    "один",
    "два",
    "три",
    "чотири",
    "п'ять",
    "шість",
    "сім",
    "вісім",
    "дев'ять",
  ];
  const onesFeminine = [
    "",
    "одна",
    "дві",
    "три",
    "чотири",
    "п'ять",
    "шість",
    "сім",
    "вісім",
    "дев'ять",
  ];
  const teens = [
    "десять",
    "одинадцять",
    "дванадцять",
    "тринадцять",
    "чотирнадцять",
    "п'ятнадцять",
    "шістнадцять",
    "сімнадцять",
    "вісімнадцять",
    "дев'ятнадцять",
  ];
  const tens = [
    "",
    "",
    "двадцять",
    "тридцять",
    "сорок",
    "п'ятдесят",
    "шістдесят",
    "сімдесят",
    "вісімдесят",
    "дев'яносто",
  ];
  const hundreds = [
    "",
    "сто",
    "двісті",
    "триста",
    "чотириста",
    "п'ятсот",
    "шістсот",
    "сімсот",
    "вісімсот",
    "дев'ятсот",
  ];

  function convertGroup(n: number, isFeminine: boolean = false): string {
    if (n === 0) return "";
    let result = "";
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h > 0) result += hundreds[h] + " ";
    if (t === 1) {
      result += teens[o] + " ";
    } else {
      if (t > 1) result += tens[t] + " ";
      const oneWord = isFeminine ? onesFeminine[o] : ones[o];
      if (o > 0) result += oneWord + " ";
    }
    return result.trim();
  }

  function getForm(n: number, one: string, few: string, many: string): string {
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return many;
    if (lastDigit === 1) return one;
    if (lastDigit >= 2 && lastDigit <= 4) return few;
    return many;
  }

  let words = "";
  if (UAH === 0) {
    words = "нуль гривень";
  } else {
    const thousands = Math.floor(UAH / 1000);
    const remainder = UAH % 1000;

    if (thousands > 0) {
      words += convertGroup(thousands, true) + " ";
      words += getForm(thousands, "тисяча", "тисячі", "тисяч") + " ";
    }
    if (remainder > 0) {
      words += convertGroup(remainder) + " ";
    }

    words += getForm(UAH, "гривня", "гривні", "гривень");
  }

  let kopecksWords = "";
  if (kopecks === 0) {
    kopecksWords = "00 копійок";
  } else {
    const kopStr = kopecks.toString().padStart(2, "0");
    if (kopecks < 10) {
      kopecksWords = `0${kopecks} ${getForm(
        kopecks,
        "копійка",
        "копійки",
        "копійок"
      )}`;
    } else if (kopecks <= 19) {
      kopecksWords =
        teens[kopecks - 10] +
        " " +
        getForm(kopecks, "копійка", "копійки", "копійок");
    } else {
      const t = Math.floor(kopecks / 10);
      const o = kopecks % 10;
      kopecksWords = tens[t];
      if (o > 0) kopecksWords += " " + ones[o];
      kopecksWords =
        kopecksWords.trim() +
        " " +
        getForm(kopecks, "копійка", "копійки", "копійок");
    }
    kopecksWords = kopStr + " " + kopecksWords.trim();
  }

  // ЗМІНА 1: Прибрано крапку в кінці
  return words.charAt(0).toUpperCase() + words.slice(1) + " " + kopecksWords;
}

/**
 * Отримує номер рахунку для поточного акту
 */
async function getInvoiceNumber(
  currentActId: number
): Promise<{ number: string; isNew: boolean }> {
  try {
    const { data: currentAct, error: currentError } = await supabase
      .from("acts")
      .select("contrAgent_raxunok")
      .eq("act_id", currentActId)
      .single();

    if (currentError) {
      console.error("Помилка отримання поточного акту:", currentError);
    }

    if (currentAct?.contrAgent_raxunok) {
      return {
        number: formatNumberWithZeros(parseInt(currentAct.contrAgent_raxunok)),
        isNew: false,
      };
    }

    const { data: masterAct, error: masterError } = await supabase
      .from("acts")
      .select("contrAgent_raxunok")
      .eq("act_id", 1)
      .single();

    if (masterError) {
      console.error("Помилка отримання мастер-акту:", masterError);
      return { number: "0000001", isNew: true };
    }

    const currentNumber = parseInt(masterAct?.contrAgent_raxunok || "0");
    const nextNumber = currentNumber + 1;

    return {
      number: formatNumberWithZeros(nextNumber),
      isNew: true,
    };
  } catch (error) {
    console.error("Помилка отримання номера рахунку:", error);
    return { number: "0000001", isNew: true };
  }
}

/**
 * Зберігає номер рахунку та faktura_id в базу даних
 */
async function saveInvoiceNumber(
  currentActId: number,
  invoiceNumber: string,
  isoDateString: string,
  fakturaId: number | null
): Promise<boolean> {
  try {

    const { data: masterAct, error: readError } = await supabase
      .from("acts")
      .select("contrAgent_raxunok")
      .eq("act_id", 1)
      .single();

    if (readError) {
      console.error("❌ Помилка зчитування мастер-акту:", readError);
    } else {
      const currentMasterNum = parseInt(masterAct?.contrAgent_raxunok || "0");
      const newNum = parseInt(invoiceNumber);

      if (newNum > currentMasterNum) {
        await supabase
          .from("acts")
          .update({ contrAgent_raxunok: newNum })
          .eq("act_id", 1);
      }
    }

    const { error: currentError } = await supabase
      .from("acts")
      .update({
        contrAgent_raxunok: parseInt(invoiceNumber),
        contrAgent_raxunok_data: isoDateString,
        faktura_id: fakturaId,
      })
      .eq("act_id", currentActId);

    if (currentError) {
      console.error("❌ Помилка оновлення поточного акту:", currentError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Критична помилка збереження:", error);
    return false;
  }
}

export function getCurrentActDataFromDOM(): any {
  const modal = document.getElementById("zakaz_narayd-custom-modal");
  const actIdStr = modal?.getAttribute("data-act-id");
  if (!actIdStr) return null;

  const actId = Number(actIdStr);
  const clientCell = document.querySelector(
    ".zakaz_narayd-table.left tr:nth-child(2) td:nth-child(2)"
  );
  const client = clientCell?.textContent?.trim() || "Клієнт не вказаний";
  const tableBody = document.querySelector("#act-items-table-container tbody");
  const rows = tableBody ? Array.from(tableBody.querySelectorAll("tr")) : [];
  const items: any[] = [];

  rows.forEach((row) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const qtyCell = row.querySelector('[data-name="id_count"]') as HTMLElement;
    const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;

    const name = nameCell?.textContent?.trim() || "";
    const quantity =
      parseFloat(
        qtyCell?.textContent?.replace(/\s/g, "").replace(",", ".") || "0"
      ) || 0;
    const price =
      parseFloat(
        priceCell?.textContent?.replace(/\s/g, "").replace(",", ".") || "0"
      ) || 0;
    const suma =
      parseFloat(
        sumCell?.textContent?.replace(/\s/g, "").replace(",", ".") || "0"
      ) || 0;

    if (name) {
      items.push({ name, quantity, price, suma });
    }
  });

  return { act_id: actId, client, items };
}

function getInvoiceRowBoundsPx(
  container: HTMLElement
): Array<{ top: number; bottom: number }> {
  const tbody = container.querySelector(
    ".invoice-table tbody"
  ) as HTMLElement | null;
  if (!tbody) return [];

  const containerRect = container.getBoundingClientRect();

  return Array.from(tbody.querySelectorAll("tr")).map((tr) => {
    const r = (tr as HTMLElement).getBoundingClientRect();
    return {
      top: r.top - containerRect.top,
      bottom: r.bottom - containerRect.top,
    };
  });
}

/**
 * Отримує межі певного елемента відносно контейнера
 */
function getInvoiceElementBoundsPx(container: HTMLElement, selector: string) {
  const el = container.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const containerRect = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - containerRect.top;
  const bottom = r.bottom - containerRect.top;
  return { top, bottom, height: bottom - top };
}

async function generateInvoicePdf(invoiceNumber: string): Promise<void> {
  const modalBody = document.querySelector(
    ".invoice-a4-container"
  ) as HTMLElement;
  if (!modalBody) {
    alert("Помилка: контейнер рахунку не знайдено.");
    return;
  }

  const controls = document.querySelector(".invoice-controls") as HTMLElement;
  const btnPrint = document.getElementById(
    "btn-print-invoice"
  ) as HTMLButtonElement;

  if (controls) controls.style.display = "none";

  // Зберігаємо оригінальні стилі
  const originalStyle = modalBody.style.cssText;

  // Налаштування для якісного скріншота
  modalBody.style.height = "auto";
  modalBody.style.minHeight = "auto";
  modalBody.style.overflow = "visible";
  modalBody.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(modalBody, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Поля сторінки
    const marginTop = 10;
    const marginLeft = 0;
    const marginRight = 0;
    const marginBottom = 15;

    const contentWidthMm = pageWidth - marginLeft - marginRight;
    const contentHeightMm = pageHeight - marginTop - marginBottom;

    // Висота зображення у мм при масштабуванні по ширині
    const imgHeightMm = (canvas.height * contentWidthMm) / canvas.width;

    // Співвідношення одиниць виміру
    const domHeightPx = modalBody.scrollHeight;
    const canvasPxPerDomPx = canvas.height / domHeightPx;
    const mmPerCanvasPx = imgHeightMm / canvas.height;
    const mmPerDomPx = imgHeightMm / domHeightPx;

    // Отримуємо межі рядків таблиці
    const rowBounds = getInvoiceRowBoundsPx(modalBody);

    // Отримуємо межі секції "Всього на суму"
    const sumBounds = getInvoiceElementBoundsPx(modalBody, ".sum-in-words");

    // Отримуємо межі секції "Без ПДВ"
    const vatBounds = getInvoiceElementBoundsPx(modalBody, ".vat-note");

    // Отримуємо межі секції з підписом
    const signatureBounds = getInvoiceElementBoundsPx(
      modalBody,
      ".signature-section"
    );

    // Якщо все влазить на одну сторінку
    if (imgHeightMm <= contentHeightMm) {
      pdf.addImage(
        imgData,
        "JPEG",
        marginLeft,
        marginTop,
        contentWidthMm,
        imgHeightMm
      );
    } else {
      // Багатосторінкова логіка
      let currentDomY = 0;
      let pageIndex = 0;

      while (currentDomY < domHeightPx - 1) {
        if (pageIndex > 0) {
          pdf.addPage();
        }

        // Максимальна висота, що влазить на сторінку (в DOM px)
        const pageMaxDomY = currentDomY + contentHeightMm / mmPerDomPx;

        // 1) Шукаємо останній повний рядок таблиці, що влазить
        let safeCutDomY = currentDomY;
        let foundRowBreak = false;

        for (let i = 0; i < rowBounds.length; i++) {
          if (rowBounds[i].bottom <= pageMaxDomY) {
            safeCutDomY = rowBounds[i].bottom;
            foundRowBreak = true;
          } else {
            break;
          }
        }

        // Якщо не знайшли підходящий розрив (рядок занадто високий)
        if (!foundRowBreak || safeCutDomY <= currentDomY) {
          safeCutDomY = Math.min(pageMaxDomY, domHeightPx);
        }

        // 2) Перевіряємо, чи може секція "Всього на суму" повністю влізти
        if (sumBounds) {
          const sumStartsOnThisPage =
            sumBounds.top >= currentDomY && sumBounds.top <= pageMaxDomY;
          if (sumStartsOnThisPage) {
            const remainingSpace = pageMaxDomY - safeCutDomY;
            if (sumBounds.height <= remainingSpace) {
              safeCutDomY = sumBounds.bottom;
            }
          }
        }

        // 3) Перевіряємо секцію "Без ПДВ"
        if (vatBounds) {
          const vatStartsOnThisPage =
            vatBounds.top >= currentDomY && vatBounds.top <= pageMaxDomY;
          if (vatStartsOnThisPage) {
            const remainingSpace = pageMaxDomY - safeCutDomY;
            if (vatBounds.height <= remainingSpace) {
              safeCutDomY = vatBounds.bottom;
            }
          }
        }

        // 4) Перевіряємо секцію з підписом
        if (signatureBounds) {
          const signatureStartsOnThisPage =
            signatureBounds.top >= currentDomY &&
            signatureBounds.top <= pageMaxDomY;
          if (signatureStartsOnThisPage) {
            const remainingSpace = pageMaxDomY - safeCutDomY;
            if (signatureBounds.height <= remainingSpace) {
              safeCutDomY = signatureBounds.bottom;
            }
          }
        }

        // 5) Ріжемо canvas
        const sourceYCanvas = Math.round(currentDomY * canvasPxPerDomPx);
        const sourceHCanvas = Math.round(
          (safeCutDomY - currentDomY) * canvasPxPerDomPx
        );

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = Math.max(1, sourceHCanvas);

        const tctx = tempCanvas.getContext("2d")!;
        tctx.drawImage(
          canvas,
          0,
          sourceYCanvas,
          canvas.width,
          sourceHCanvas,
          0,
          0,
          canvas.width,
          sourceHCanvas
        );

        const sliceImg = tempCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHeightMm = sourceHCanvas * mmPerCanvasPx;

        pdf.addImage(
          sliceImg,
          "JPEG",
          marginLeft,
          marginTop,
          contentWidthMm,
          sliceHeightMm
        );

        currentDomY = safeCutDomY;
        pageIndex++;
      }
    }

    pdf.save(`Рахунок_СФ-${invoiceNumber}.pdf`);
  } catch (error) {
    console.error("Помилка PDF:", error);
    alert("Не вдалося створити PDF.");
  } finally {
    // Повертаємо оригінальні стилі
    if (controls) controls.style.display = "flex";
    modalBody.style.cssText = originalStyle;
    if (btnPrint) {
      btnPrint.classList.remove("loading");
      btnPrint.textContent = "📥 Завантажити";
    }
  }
}

/* --- РЕНДЕР МОДАЛКИ --- */

export async function renderInvoicePreviewModal(actData: any): Promise<void> {
  const oldModal = document.getElementById(INVOICE_PREVIEW_MODAL_ID);
  if (oldModal) oldModal.remove();

  let supplierName = "";
  let foundFakturaId: number | null = null;

  try {
    const { data: fakturaData, error } = await supabase
      .from("faktura")
      .select("oderjyvach")
      .eq("faktura_id", 1)
      .single();

    if (error) {
      console.error("Помилка завантаження даних постачальника:", error);
    } else if (fakturaData) {
      supplierName = fakturaData.oderjyvach || "";
    }
  } catch (err) {
    console.error("Критична помилка:", err);
  }

  const recipientName = actData.client || "Одержувач не вказаний";

  if (actData.client) {
    try {
      const { data: clientFaktura, error: clientError } = await supabase
        .from("faktura")
        .select("faktura_id")
        .ilike("oderjyvach", `%${actData.client.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (clientError) {
        console.error("Помилка пошуку фактури клієнта:", clientError);
      } else if (clientFaktura) {
        foundFakturaId = clientFaktura.faktura_id;
      } else {
      }
    } catch (err) {
      console.error("Помилка при пошуку клієнта:", err);
    }
  }

  const { number: invoiceNumber } = await getInvoiceNumber(actData.act_id);

  const now = new Date();
  const dateString = `${now.getDate()} ${getMonthNameGenitive(
    now.getMonth()
  )} ${now.getFullYear()} р.`;

  const dateForDisplay = getCurrentDateDDMMYYYY();

  const totalSum = actData.items.reduce(
    (sum: number, item: any) => sum + item.suma,
    0
  );
  const totalSumWords = amountToWordsUA(totalSum);

  let rowsHtml = actData.items
    .map(
      (item: any, index: number) => `
      <tr>
          <td class="col-num">${index + 1}</td>
          <td class="col-name">${item.name}</td>
          <td class="col-unit" contenteditable="true" title="Натисніть, щоб змінити">шт</td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-price">${formatNumberWithSpaces(item.price)}</td>
          <td class="col-sum">${formatNumberWithSpaces(item.suma)}</td>
      </tr>
  `
    )
    .join("");

  rowsHtml += `
      <tr class="total-row">
          <td colspan="4" class="empty-cell"></td>
          <td class="total-label">Всього:</td>
          <td class="total-value">${formatNumberWithSpaces(totalSum)}</td>
      </tr>
  `;

  const modalHtml = `
  <div id="${INVOICE_PREVIEW_MODAL_ID}" class="invoice-preview-overlay" style="z-index: 2000;">
      <div class="invoice-a4-container">
          <div class="invoice-body">
              
              <table class="header-table">
                  <tr>
                      <td class="label-cell no-underline">Постачальник</td>
                      <td class="value-cell">${supplierName}</td> 
                  </tr>
                  <tr>
                      <td class="label-cell">Одержувач</td>
                      <td class="value-cell">${recipientName}</td>
                  </tr>
                  <tr>
                      <td class="label-cell">Платник</td>
                      <td class="value-cell">той самий</td>
                  </tr>
                  <tr>
                      <td class="label-cell">Замовлення</td>
                      <td class="value-cell">Без замовлення</td>
                  </tr>
              </table>

              <div class="invoice-title">
                  Рахунок-фактура № СФ-${invoiceNumber}<br>
                  від ${dateString}
              </div>

              <table class="invoice-table">
                  <thead>
                      <tr>
                          <th>№</th>
                          <th>Назва</th>
                          <th>Од.</th>
                          <th>Кількість</th>
                          <th>Ціна без ПДВ</th>
                          <th>Сума без ПДВ</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rowsHtml}
                  </tbody>
              </table>
            <div class="sum-in-words">
               Всього на суму:<br>
               <strong contenteditable="true" title="Натисніть, щоб змінити">${totalSumWords}</strong>
            </div>
              <div class="vat-note">
                  Без ПДВ
              </div>

              <div class="signature-section">
                  <div class="sign-block">
                      <span>Виписав(ла):</span>
                      <span class="line"></span>
                  </div>
              </div>
          </div>

          <div class="invoice-controls">
              <button id="btn-add-invoice" class="btn-add">
                💾 Зберегти
              </button>
              <button id="btn-print-invoice" class="btn-print">📥 Завантажити</button>
          </div>
      </div>
  </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const overlay = document.getElementById(INVOICE_PREVIEW_MODAL_ID);
  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });
  }

  const btnPrint = document.getElementById("btn-print-invoice");
  btnPrint?.addEventListener("click", () => {
    if (btnPrint) {
      btnPrint.textContent = "⏳ Генерація...";
      btnPrint.classList.add("loading");
    }

    setTimeout(() => {
      generateInvoicePdf(invoiceNumber);
    }, 50);
  });

  const btnAdd = document.getElementById(
    "btn-add-invoice"
  ) as HTMLButtonElement;

  btnAdd?.addEventListener("click", async () => {
    btnAdd.disabled = true;
    btnAdd.textContent = "⏳ Збереження...";

    const dateForDB = getCurrentDateISO();

    const success = await saveInvoiceNumber(
      actData.act_id,
      invoiceNumber,
      dateForDB,
      foundFakturaId
    );

    if (success) {
      btnAdd.textContent = "✅ Збережено";
      btnAdd.style.backgroundColor = "#4caf50";

      showNotification(
        `Рахунок № СФ-${invoiceNumber} від ${dateForDisplay} збережено`,
        "success",
        4000
      );

      setTimeout(() => {
        btnAdd.textContent = "💾 Зберегти";
        btnAdd.disabled = false;
        btnAdd.style.backgroundColor = "";
        btnAdd.style.cursor = "pointer";
        btnAdd.style.opacity = "1";
      }, 2000);
    } else {
      showNotification("Помилка збереження (див. консоль)", "error");
      btnAdd.disabled = false;
      btnAdd.textContent = "💾 Зберегти";
    }
  });
}
