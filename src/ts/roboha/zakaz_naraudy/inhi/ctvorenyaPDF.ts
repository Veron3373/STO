import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { showNotification } from "./vspluvauhe_povidomlenna";
import {
  globalCache,
  ZAKAZ_NARAYD_BODY_ID,
  ZAKAZ_NARAYD_SAVE_BTN_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../globalCache";
import {
  expandAllNamesInTable,
  restoreOriginalNames,
} from "./kastomna_tabluca";

/**
 * Сховати колонку за текстом заголовка (враховує індекси TH)
 */
function collectColumnCellsToHideByHeaderText(
  table: HTMLTableElement,
  headerMatchers: Array<(txt: string) => boolean>,
  bucket: HTMLElement[]
): void {
  const headerCells = Array.from(
    table.querySelectorAll<HTMLElement>("thead th, thead td")
  );

  if (headerCells.length === 0) return;

  let targetColIndexes: number[] = [];

  headerCells.forEach((th, i) => {
    const text = (th.textContent || "").trim().toLowerCase();
    if (headerMatchers.some((fn) => fn(text))) {
      targetColIndexes.push(i + 1); // nth-child — 1-based
    }
  });

  if (targetColIndexes.length === 0) return;

  // Зібрати всі клітинки для кожного знайденого індексу колонки
  targetColIndexes.forEach((colIdx) => {
    const selector = `thead tr > *:nth-child(${colIdx}), tbody tr > *:nth-child(${colIdx}), tfoot tr > *:nth-child(${colIdx})`;
    const columnCells = table.querySelectorAll<HTMLElement>(selector);
    columnCells.forEach((cell) => bucket.push(cell));
  });
}

/**
 * Генерує PDF-файл з вмісту модального вікна.
 * Під час генерації приховує кнопки/керуючі елементи, а також колонки:
 *  - "ПІБ _ Магазин"
 *  - "Каталог"
 *  - "Зарплата"
 *  - "За-та"
 * А також розширює скорочені найменування до повних.
 * Після — усе повертає як було.
 */
export async function printModalToPdf(): Promise<void> {
  showNotification("Генерація PDF...", "info", 2000);

  const modalBody = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!modalBody) {
    showNotification("Тіло модального вікна не знайдено.", "error");
    return;
  }

  const modalContent = modalBody.closest(
    ".zakaz_narayd-modal-content"
  ) as HTMLElement | null;

  const originalBodyStyle = modalBody.style.cssText;
  const originalModalWidth = modalContent?.style.width || "";
  const originalModalMaxWidth = modalContent?.style.maxWidth || "";

  const elementsToHide: HTMLElement[] = [
    document.getElementById("print-act-button") as HTMLElement,
    document.getElementById("add-row-button") as HTMLElement,
    document.getElementById(ZAKAZ_NARAYD_SAVE_BTN_ID) as HTMLElement,
    document.getElementById("status-lock-btn") as HTMLElement,
    document.getElementById("sklad") as HTMLElement,
    document.querySelector(".modal-close-button") as HTMLElement,
    document.querySelector(".modal-footer") as HTMLElement,
  ].filter(Boolean) as HTMLElement[];

  const table = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} table.zakaz_narayd-items-table`
  ) as HTMLTableElement | null;

  if (table) {
    // Приховуємо колонки "ПІБ _ Магазин", "Каталог", "Зарплата" і "За-та"
    collectColumnCellsToHideByHeaderText(
      table,
      [
        (t) => t.includes("піб") || t.includes("магазин"),
        (t) => t.includes("каталог"),
        (t) => t.includes("зарплата") || t.includes("зар-та"),
      ],
      elementsToHide
    );
  }

  // 🔶 1) ТИМЧАСОВО СХОВАТИ ВСІ ТРИКУТНИКИ (зняти прапорці)
  const warnedQtyCells = Array.from(
    document.querySelectorAll<HTMLElement>('.qty-cell[data-warn="1"]')
  );
  const warnedPriceCells = Array.from(
    document.querySelectorAll<HTMLElement>('.price-cell[data-warnprice="1"]')
  );
  const warnedSlyusarSumCells = Array.from(
    document.querySelectorAll<HTMLElement>('.slyusar-sum-cell[data-warnzp="1"]')
  );
  warnedQtyCells.forEach((el) => el.removeAttribute("data-warn"));
  warnedPriceCells.forEach((el) => el.removeAttribute("data-warnprice"));
  warnedSlyusarSumCells.forEach((el) => el.removeAttribute("data-warnzp"));

  // 🔶 2) РОЗШИРИТИ ВСІ СКОРОЧЕНІ НАЙМЕНУВАННЯ ДО ПОВНИХ
  const originalNames = expandAllNamesInTable();

  // Також сховаємо керуючі елементи
  const originalDisplays = new Map<HTMLElement, string>();
  elementsToHide.forEach((el) => {
    originalDisplays.set(el, el.style.display);
    el.style.display = "none";
  });

  if (modalContent) {
    modalContent.style.width = "1000px";
    modalContent.style.maxWidth = "1000px";
  }

  modalBody.style.overflow = "visible";
  modalBody.style.height = "auto";
  modalBody.style.maxHeight = "none";

  try {
    const canvas = await html2canvas(modalBody, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.9);
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Відступи: зверху 1см (10мм), по бокам 1см (10мм), знизу 2см (20мм)
    const marginTop = 10; // 1 см
    const marginLeft = 10; // 1 см
    const marginRight = 10; // 1 см
    const marginBottom = 20; // 2 см

    const contentWidth = pageWidth - marginLeft - marginRight;
    const contentHeight = pageHeight - marginTop - marginBottom;

    // Зберігаємо оригінальні розміри без масштабування
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Якщо контент поміщається на одну сторінку
    if (imgHeight <= contentHeight) {
      pdf.addImage(imgData, "JPEG", marginLeft, marginTop, imgWidth, imgHeight);
    } else {
      // Розбиваємо на сторінки
      let currentY = 0;
      let pageNumber = 0;

      while (currentY < imgHeight) {
        if (pageNumber > 0) {
          pdf.addPage();
        }

        // Висота частини для поточної сторінки
        const remainingHeight = imgHeight - currentY;
        const pageImgHeight = Math.min(contentHeight, remainingHeight);

        // Розраховуємо яку частину оригінального canvas потрібно взяти
        const sourceHeight = (pageImgHeight * canvas.height) / imgHeight;
        const sourceY = (currentY * canvas.height) / imgHeight;

        // Створюємо canvas для частини контенту
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = sourceHeight;
        const tempCtx = tempCanvas.getContext("2d");

        if (tempCtx) {
          tempCtx.drawImage(
            canvas,
            0,
            sourceY, // Джерело x, y
            canvas.width,
            sourceHeight, // Джерело width, height
            0,
            0, // Призначення x, y
            canvas.width,
            sourceHeight // Призначення width, height
          );

          const pageImgData = tempCanvas.toDataURL("image/jpeg", 0.9);
          pdf.addImage(
            pageImgData,
            "JPEG",
            marginLeft,
            marginTop,
            imgWidth,
            pageImgHeight
          );
        }

        currentY += pageImgHeight;
        pageNumber++;
      }
    }

    const actNumber = globalCache.currentActId;
    pdf.save(`Акт №${actNumber}.pdf`);
    showNotification("PDF успішно створено!", "success", 2000);
  } catch (error) {
    console.error("💥 Помилка при генерації PDF:", error);
    showNotification("Помилка генерації PDF", "error");
  } finally {
    // 🔄 3) ПОВЕРНУТИ ВСІ НАЙМЕНУВАННЯ ДО СКОРОЧЕНОГО ВИГЛЯДУ
    restoreOriginalNames(originalNames);

    // 🔄 4) ПОВЕРНУТИ ТРИКУТНИКИ НАЗАД
    warnedQtyCells.forEach((el) => el.setAttribute("data-warn", "1"));
    warnedPriceCells.forEach((el) => el.setAttribute("data-warnprice", "1"));
    warnedSlyusarSumCells.forEach((el) => el.setAttribute("data-warnzp", "1"));

    // Повернути відображення елементів та стилі
    originalDisplays.forEach((disp, el) => {
      el.style.display = disp;
    });
    modalBody.style.cssText = originalBodyStyle;
    if (modalContent) {
      modalContent.style.width = originalModalWidth;
      modalContent.style.maxWidth = originalModalMaxWidth;
    }
  }
}