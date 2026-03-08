// src/ts/roboha/zakaz_naraudy/inhi/pageFormatControls.ts

// Висота контенту на сторінці PDF: 297mm - 10mm(marginTop) - 15mm(marginBottom) = 272mm
const PDF_CONTENT_HEIGHT_MM = 272;

interface FormatState {
  allTextSize: number;
  tableTextSize: number;
  cellPadding: number;
}

/**
 * Додає панель керування розміром тексту та індикатори розриву сторінок А4
 * до контейнера модального вікна (Рахунок або Акт).
 */
export function attachPageFormatControls(
  overlay: HTMLElement,
  container: HTMLElement,
  options: {
    defaultAllTextSize: number;
    defaultTableTextSize: number;
    defaultCellPadding: number;
    tableSelector: string;
  },
): void {
  const state: FormatState = {
    allTextSize: options.defaultAllTextSize,
    tableTextSize: options.defaultTableTextSize,
    cellPadding: options.defaultCellPadding,
  };

  const toolbar = document.createElement("div");
  toolbar.className = "page-format-toolbar";
  toolbar.setAttribute("data-no-pdf", "true");
  // Зупиняємо клік по тулбару від закриття модалки
  toolbar.addEventListener("click", (e) => e.stopPropagation());

  toolbar.innerHTML = `
    <div class="pf-group">
      <span class="pf-label">Весь текст</span>
      <button class="pf-btn" data-action="all-minus">−</button>
      <span class="pf-value" data-value="all">${state.allTextSize}pt</span>
      <button class="pf-btn" data-action="all-plus">+</button>
    </div>
    <div class="pf-group">
      <span class="pf-label">Таблиця</span>
      <button class="pf-btn" data-action="table-minus">−</button>
      <span class="pf-value" data-value="table">${state.tableTextSize}pt</span>
      <button class="pf-btn" data-action="table-plus">+</button>
    </div>
    <div class="pf-group">
      <span class="pf-label">Висоту</span>
      <button class="pf-btn" data-action="padding-minus">−</button>
      <span class="pf-value" data-value="padding">${state.cellPadding}px</span>
      <button class="pf-btn" data-action="padding-plus">+</button>
    </div>
  `;

  // Вставляємо тулбар в body (позиціонується CSS fixed, не скролиться)
  document.body.appendChild(toolbar);

  // Прибираємо тулбар коли модалка закривається
  const cleanupObserver = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      toolbar.remove();
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true });

  toolbar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "all-plus":
        state.allTextSize += 0.5;
        break;
      case "all-minus":
        state.allTextSize = Math.max(6, state.allTextSize - 0.5);
        break;
      case "table-plus":
        state.tableTextSize += 0.5;
        break;
      case "table-minus":
        state.tableTextSize = Math.max(6, state.tableTextSize - 0.5);
        break;
      case "padding-plus":
        state.cellPadding += 1;
        break;
      case "padding-minus":
        state.cellPadding = Math.max(0, state.cellPadding - 1);
        break;
    }

    applyStyles(container, state, options.tableSelector);
    updateLabels(toolbar, state);
    // Невелика затримка, щоб браузер перерахував розміри
    requestAnimationFrame(() => updatePageBreakMarkers(container));
  });

  applyStyles(container, state, options.tableSelector);
  updatePageBreakMarkers(container);

  // ResizeObserver для відстеження зміни розміру контейнера
  const resizeObs = new ResizeObserver(() => {
    updatePageBreakMarkers(container);
  });
  resizeObs.observe(container);

  // MutationObserver для відстеження зміни контенту (contenteditable)
  const mutationObs = new MutationObserver(() => {
    requestAnimationFrame(() => updatePageBreakMarkers(container));
  });
  mutationObs.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function applyStyles(
  container: HTMLElement,
  state: FormatState,
  tableSelector: string,
): void {
  container.style.fontSize = `${state.allTextSize}pt`;

  const table = container.querySelector(tableSelector) as HTMLElement;
  if (table) {
    table.style.fontSize = `${state.tableTextSize}pt`;
  }

  const cells = container.querySelectorAll(
    `${tableSelector} td, ${tableSelector} th`,
  );
  cells.forEach((cell) => {
    (cell as HTMLElement).style.padding = `${state.cellPadding}px 6px`;
  });
}

function updateLabels(toolbar: HTMLElement, state: FormatState): void {
  const allLabel = toolbar.querySelector('[data-value="all"]');
  const tableLabel = toolbar.querySelector('[data-value="table"]');
  const paddingLabel = toolbar.querySelector('[data-value="padding"]');

  if (allLabel) allLabel.textContent = `${state.allTextSize}pt`;
  if (tableLabel) tableLabel.textContent = `${state.tableTextSize}pt`;
  if (paddingLabel) paddingLabel.textContent = `${state.cellPadding}px`;
}

function updatePageBreakMarkers(container: HTMLElement): void {
  container.querySelectorAll(".page-break-marker").forEach((el) => el.remove());

  const containerHeight = container.scrollHeight;
  // Визначаємо скільки пікселів в 1 мм на основі ширини контейнера (210mm)
  const pxPerMm = container.offsetWidth / 210;
  // Використовуємо реальну висоту контенту PDF (272mm), а не повну А4 (297mm)
  const pageHeightPx = PDF_CONTENT_HEIGHT_MM * pxPerMm;

  let pageNum = 1;
  let breakPos = pageHeightPx;

  while (breakPos < containerHeight - 10) {
    const marker = document.createElement("div");
    marker.className = "page-break-marker";
    marker.setAttribute("data-no-pdf", "true");
    marker.style.top = `${breakPos}px`;
    marker.innerHTML = `<span>✂ Кінець аркуша ${pageNum} — Початок аркуша ${pageNum + 1}</span>`;
    container.appendChild(marker);
    pageNum++;
    breakPos += pageHeightPx;
  }
}

/**
 * Ховає елементи керування та маркери перед генерацією PDF.
 */
export function hideFormatControlsForPdf(container: HTMLElement): void {
  container.querySelectorAll(".page-break-marker").forEach((el) => {
    (el as HTMLElement).style.display = "none";
  });
}

/**
 * Повертає видимість елементів після генерації PDF.
 */
export function showFormatControlsAfterPdf(container: HTMLElement): void {
  container.querySelectorAll(".page-break-marker").forEach((el) => {
    (el as HTMLElement).style.display = "";
  });
}
