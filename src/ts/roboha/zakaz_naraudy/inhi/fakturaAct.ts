// src/ts/roboha/zakaz_naraudy/inhi/fakturaAct.ts

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { showNotification } from "./vspluvauhe_povidomlenna";
import { supabase } from "../../../vxid/supabaseClient";
import { formatNumberWithSpaces } from "../globalCache";

export const ACT_PREVIEW_MODAL_ID = "act-preview-modal";

export async function renderActPreviewModal(data: any): Promise<void> {
  const oldModal = document.getElementById(ACT_PREVIEW_MODAL_ID);
  if (oldModal) oldModal.remove();

  const rawNum = data.foundContrAgentRaxunok || 0;
  const actNumber = String(rawNum).padStart(7, "0");
  const invoiceNumber = `СФ-${actNumber}`;

  let leftSideText = "Дані не завантажено";
  let rightSideText = "Дані не завантажено";
  let zamovnykSentencePart = "";
  let directorGenitive = "";
  let targetFakturaId = 0;
  let executorFullName = "";
  let executorPrumitka = "";
  let clientPrumitka = "";

  const invoiceDateText = formatInvoiceDate(
    data?.foundContrAgentRaxunokData || data?.contrAgent_raxunok_data || null
  );
  const todayDateText = formatDateWithMonthName(new Date());

  try {
    const { data: myData, error: myError } = await supabase
      .from("faktura")
      .select("name, prumitka")
      .eq("faktura_id", 1)
      .single();

    if (myError) console.error(myError);
    else if (myData) {
      leftSideText = myData.name || "";
      executorPrumitka = myData.prumitka || "";
      if (myData.name) {
        const lines = myData.name
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          if (
            !line.startsWith("_") &&
            !line.toLowerCase().includes("фізична")
          ) {
            executorFullName = line;
            break;
          }
        }
      }
    }

    targetFakturaId = data.foundFakturaId;
    if (targetFakturaId) {
      const { data: clientData, error: clientError } = await supabase
        .from("faktura")
        .select("name, prumitka")
        .eq("faktura_id", targetFakturaId)
        .single();

      if (clientError) {
        rightSideText = "Помилка отримання даних";
      } else if (clientData) {
        rightSideText = clientData.name || "";
        clientPrumitka = clientData.prumitka || "";
        if (clientData.name) {
          const lines = clientData.name
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean);
          const organizationLines: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (
              line.includes("ЄДРПОУ") ||
              line.includes("тел.") ||
              line.includes("IBAN") ||
              line.includes("директор") ||
              /^_{3,}$/.test(line)
            )
              continue;
            const words = line.split(/\s+/);
            if (
              words.length === 3 &&
              /^[А-ЯЄІЇҐ]/.test(line) &&
              line.toUpperCase() !== line
            ) {
              directorGenitive = convertToGenitive(line);
              break;
            }
            organizationLines.push(line);
          }
          zamovnykSentencePart = organizationLines.join(" ");
        }
      }
    } else {
      rightSideText = "Клієнта не знайдено";
    }
  } catch (e) {
    console.error(e);
  }

  if (!zamovnykSentencePart && rightSideText) {
    zamovnykSentencePart = normalizeSingleLine(rightSideText);
  }

  let executorSentencePart = "";
  try {
    const { data: executorData } = await supabase
      .from("faktura")
      .select("oderjyvach")
      .eq("faktura_id", 1)
      .single();
    if (executorData?.oderjyvach)
      executorSentencePart = shortenFOPName(executorData.oderjyvach);
  } catch (e) {
    console.error("Помилка отримання oderjyvach:", e);
  }
  if (!executorSentencePart)
    executorSentencePart = shortenFOPName(leftSideText);

  const items = data.items || [];
  const totalSum = items.reduce(
    (sum: number, item: any) => sum + (item.suma || 0),
    0
  );
  const totalSumWords = amountToWordsUA(totalSum);

  let rowsHtml = items
    .map(
      (item: any, index: number) => `
    <tr>
      <td class="col-num">${index + 1}</td>
      <td class="col-name">${item.name || ""}</td>
      <td class="col-unit" contenteditable="true" title="Натисніть, щоб змінити">шт</td>
      <td class="col-qty">${item.quantity || 0}</td>
      <td class="col-price">${formatNumberWithSpaces(item.price || 0)}</td>
      <td class="col-sum">${formatNumberWithSpaces(item.suma || 0)}</td>
    </tr>
  `
    )
    .join("");

  // Додаємо рядок "Всього:" жирним
  rowsHtml += `
  <tr class="total-row">
    <td colspan="4" class="empty-cell"></td>
    <td class="total-label">Всього:</td>
    <td class="total-value">${formatNumberWithSpaces(totalSum)}</td>
  </tr>
`;

  const introText = `Ми, представники Замовника ${zamovnykSentencePart} директора <u>${directorGenitive}</u>, з одного боку, та представник Виконавця ${executorSentencePart}, з іншого боку, склали цей акт про те, що Виконавцем були проведені такі роботи (надані такі послуги) по рахунку № ${invoiceNumber}${
    invoiceDateText ? ` від ${invoiceDateText}` : ""
  }:`;

  const modalHtml = `
  <div id="${ACT_PREVIEW_MODAL_ID}" class="fakturaAct-overlay">
      <div class="fakturaAct-container">
          <div class="fakturaAct-header-approval">
            <div class="fakturaAct-approval-block">
                <div class="fakturaAct-approval-title">ЗАТВЕРДЖУЮ</div>
                <div class="fakturaAct-approval-content">${leftSideText}</div>
            </div>
            <div class="fakturaAct-approval-block">
                <div class="fakturaAct-approval-title">ЗАТВЕРДЖУЮ</div>
                <div>Директор</div>
                <div class="fakturaAct-approval-content">${rightSideText}</div>
            </div>
          </div>
          <div class="fakturaAct-main-title">АКТ № ОУ-${actNumber} здачі-прийняття робіт (надання послуг)</div>
          <div class="fakturaAct-intro-text" contenteditable="true">${introText}</div>
          <table class="fakturaAct-table">
            <thead>
              <tr><th>№</th><th>Назва</th><th>Од.</th><th>Кількість</th><th>Ціна без ПДВ</th><th>Сума без ПДВ</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="fakturaAct-total-section">
            <p>Загальна вартість робіт (послуг) без ПДВ ${formatNumberWithSpaces(
              totalSum
            )} грн <strong contenteditable="true">${totalSumWords}</strong></p>
            <p>Сторони претензій одна до одної не мають.</p>
          </div>
          <div class="fakturaAct-footer">
            <div class="fakturaAct-footer-info">Місце складання: м. Вінниця</div>
            <div class="fakturaAct-footer-columns">
              <div class="fakturaAct-footer-left">
                <div class="fakturaAct-footer-title">Від Виконавця*:</div>
                <div class="fakturaAct-footer-signature">____________________</div>
                <div class="fakturaAct-signature-name">${executorFullName}</div>
                <div class="fakturaAct-footer-note">* Відповідальний за здійснення господарської операції і правильність її оформлення</div>
                <div class="fakturaAct-footer-date">${todayDateText}</div>
                <div class="fakturaAct-footer-details">${executorPrumitka}</div>
              </div>
              <div class="fakturaAct-footer-right">
                <div class="fakturaAct-footer-title">Від Замовника:</div>
                <div class="fakturaAct-footer-signatureZamov">____________________</div>
                <div class="fakturaAct-footer-date">${todayDateText}</div>
                <div class="fakturaAct-footer-details">${clientPrumitka}</div>
              </div>
            </div>
          </div>
          <div class="fakturaAct-controls">
            <button id="btn-save-act" class="btn-save">💾 Зберегти</button>
            <button id="btn-print-act" class="btn-print">📥 Завантажити</button>
          </div>
      </div>
  </div>`;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const overlay = document.getElementById(ACT_PREVIEW_MODAL_ID);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const btnSave = document.getElementById("btn-save-act") as HTMLButtonElement;
  btnSave?.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "⏳ Збереження...";
    const success = await saveActData(data.act_id, rawNum);
    if (success) {
      btnSave.textContent = "✅ Збережено";
      btnSave.style.backgroundColor = "#4caf50";
      showNotification(`Акт № ОУ-${actNumber} збережено`, "success", 4000);
      setTimeout(() => {
        btnSave.textContent = "💾 Зберегти";
        btnSave.disabled = false;
        btnSave.style.backgroundColor = "";
      }, 2000);
    } else {
      showNotification("Помилка збереження", "error");
      btnSave.disabled = false;
      btnSave.textContent = "💾 Зберегти";
    }
  });

  const btnPrint = document.getElementById(
    "btn-print-act"
  ) as HTMLButtonElement;
  btnPrint?.addEventListener("click", async () => {
    btnPrint.textContent = "⏳ Генерація...";
    btnPrint.disabled = true;
    setTimeout(async () => {
      await generateActPdf(actNumber);
      btnPrint.textContent = "📥 Завантажити";
      btnPrint.disabled = false;
    }, 50);
  });
}

function convertToGenitive(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  let lastName = parts[0],
    firstName = parts[1] || "",
    patronymic = parts[2] || "";
  if (firstName.endsWith("а")) firstName = firstName.slice(0, -1) + "и";
  if (patronymic.endsWith("на")) patronymic = patronymic.slice(0, -2) + "ни";
  return `${lastName} ${firstName} ${patronymic}`.trim();
}

function shortenFOPName(oderjyvach: string | null | undefined): string {
  if (!oderjyvach) return "";
  const firstLine = oderjyvach.split(/\r?\n/)[0].trim();
  const parts = firstLine.split(/\s+/);
  if (parts.length >= 4 && parts[0].toUpperCase() === "ФОП")
    return `ФОП ${parts[1]} ${parts[2]?.[0] || ""}.${parts[3]?.[0] || ""}.`;
  return firstLine;
}

function formatInvoiceDate(raw: any): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
}

function formatDateWithMonthName(date: Date): string {
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
  return `${date.getDate()} ${
    months[date.getMonth()]
  } ${date.getFullYear()} р.`;
}

function normalizeSingleLine(text: string): string {
  if (!text) return "";
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function amountToWordsUA(amount: number): string {
  const UAH = Math.floor(amount),
    kopecks = Math.round((amount - UAH) * 100);
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
  function convertGroup(n: number, isFeminine = false): string {
    if (n === 0) return "";
    let result = "";
    const h = Math.floor(n / 100),
      t = Math.floor((n % 100) / 10),
      o = n % 10;
    if (h > 0) result += hundreds[h] + " ";
    if (t === 1) {
      result += teens[o] + " ";
    } else {
      if (t > 1) result += tens[t] + " ";
      if (o > 0) result += (isFeminine ? onesFeminine[o] : ones[o]) + " ";
    }
    return result.trim();
  }
  function getForm(n: number, one: string, few: string, many: string): string {
    const lastDigit = n % 10,
      lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return many;
    if (lastDigit === 1) return one;
    if (lastDigit >= 2 && lastDigit <= 4) return few;
    return many;
  }
  let words = "";
  if (UAH === 0) {
    words = "нуль гривень";
  } else {
    const thousands = Math.floor(UAH / 1000),
      remainder = UAH % 1000;
    if (thousands > 0) {
      words +=
        convertGroup(thousands, true) +
        " " +
        getForm(thousands, "тисяча", "тисячі", "тисяч") +
        " ";
    }
    if (remainder > 0) {
      words += convertGroup(remainder) + " ";
    }
    words += getForm(UAH, "гривня", "гривні", "гривень");
  }
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${kopecks
    .toString()
    .padStart(2, "0")} ${getForm(kopecks, "копійка", "копійки", "копійок")}`;
}

async function saveActData(actId: number, actNumber: number): Promise<boolean> {
  try {
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let userName = "";
    try {
      const storedData = localStorage.getItem("userAuthData");
      if (storedData) {
        userName = JSON.parse(storedData)?.Name || "";
      }
    } catch (e) {
      console.error(e);
    }
    const { error } = await supabase
      .from("acts")
      .update({
        contrAgent_act: actNumber,
        contrAgent_act_data: todayISO,
        xto_vbpbsav: userName,
      })
      .eq("act_id", actId);
    if (error) {
      console.error("❌ Помилка збереження акту:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("❌ Критична помилка:", e);
    return false;
  }
}

/**
 * Повертає межі всіх рядків tbody у DOM-пікселях відносно контейнера.
 */
function getActRowBoundsPx(
  container: HTMLElement
): Array<{ top: number; bottom: number }> {
  const tbody = container.querySelector(
    ".fakturaAct-table tbody"
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
function getActElementBoundsPx(container: HTMLElement, selector: string) {
  const el = container.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const containerRect = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - containerRect.top;
  const bottom = r.bottom - containerRect.top;
  return { top, bottom, height: bottom - top };
}

async function generateActPdf(actNumber: string): Promise<void> {
  const container = document.querySelector(
    ".fakturaAct-container"
  ) as HTMLElement;
  if (!container) return;

  const controls = document.querySelector(
    ".fakturaAct-controls"
  ) as HTMLElement;
  if (controls) controls.style.display = "none";

  // Зберігаємо оригінальні стилі
  const originalStyle = container.style.cssText;

  // Налаштування для якісного скріншота
  container.style.height = "auto";
  container.style.minHeight = "auto";
  container.style.overflow = "visible";
  container.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(container, {
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
    const domHeightPx = container.scrollHeight;
    const canvasPxPerDomPx = canvas.height / domHeightPx;
    const mmPerCanvasPx = imgHeightMm / canvas.height;
    const mmPerDomPx = imgHeightMm / domHeightPx;

    // Отримуємо межі рядків таблиці
    const rowBounds = getActRowBoundsPx(container);

    // Отримуємо межі футера з підписами
    const footerBounds = getActElementBoundsPx(container, ".fakturaAct-footer");

    // Отримуємо межі секції "Всього на суму"
    const totalBounds = getActElementBoundsPx(
      container,
      ".fakturaAct-total-section"
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
          console.log(`➕ Додаємо сторінку ${pageIndex + 1}`);
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
        if (totalBounds) {
          const totalStartsOnThisPage =
            totalBounds.top >= currentDomY && totalBounds.top <= pageMaxDomY;
          if (totalStartsOnThisPage) {
            const remainingSpace = pageMaxDomY - safeCutDomY;
            if (totalBounds.height <= remainingSpace) {
              safeCutDomY = totalBounds.bottom;
            }
          }
        }

        // 3) Перевіряємо футер з підписами
        if (footerBounds) {
          const footerStartsOnThisPage =
            footerBounds.top >= currentDomY && footerBounds.top <= pageMaxDomY;
          if (footerStartsOnThisPage) {
            const remainingSpace = pageMaxDomY - safeCutDomY;
            if (footerBounds.height <= remainingSpace) {
              safeCutDomY = footerBounds.bottom;
            }
          }
        }

        // 4) Ріжемо canvas
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

    pdf.save(`Акт_ОУ-${actNumber}.pdf`);
  } catch (error) {
  } finally {
    // Повертаємо оригінальні стилі
    if (controls) controls.style.display = "flex";
    container.style.cssText = originalStyle;
  }
}
