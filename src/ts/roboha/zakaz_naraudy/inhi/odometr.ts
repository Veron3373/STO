/**
 * Ініціалізує слухача подій для поля вводу пробігу,
 * дозволяючи вводити лише числа до 1 000 000 з роздільниками тисяч.
 *
 * @param elementId ID елемента, який потрібно форматувати (наприклад, 'editable-probig').
 */
export function initOdometerInput(elementId: string): void {
  const inputElement = document.getElementById(elementId);

  if (!inputElement) {
    console.warn(`Елемент з ID '${elementId}' не знайдено для ініціалізації одометра.`);
    return;
  }

  // 👇 Допоміжна функція для форматування числа
  const formatNumber = (value: string): string => {
    let cleanedValue = value.replace(/\D/g, "");
    let numValue = parseInt(cleanedValue, 10);
    const MAX_VALUE = 1000000;

    if (isNaN(numValue) || numValue < 0) numValue = 0;
    else if (numValue > MAX_VALUE) numValue = MAX_VALUE;

    return numValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  // 🔁 Форматуємо значення одразу при завантаженні
  const initialValue = inputElement.textContent || "";
  inputElement.textContent = formatNumber(initialValue);

  // 🎯 Слухач події вводу
  inputElement.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    const originalValue = target.textContent || "";
    const formattedValue = formatNumber(originalValue);

    // Зберігаємо позицію курсора
    const selection = window.getSelection();
    let originalCaretPosition = 0;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      originalCaretPosition = range.startOffset;
    }

    // Обчислюємо нову позицію курсора
    let charCountOriginal = 0;
    for (let i = 0; i < originalValue.length && i < originalCaretPosition; i++) {
      if (/\d/.test(originalValue[i])) charCountOriginal++;
    }

    let newCaretPosition = 0;
    let charCountFormatted = 0;
    for (let i = 0; i < formattedValue.length; i++) {
      if (/\d/.test(formattedValue[i])) charCountFormatted++;
      if (charCountFormatted === charCountOriginal) {
        newCaretPosition = i + 1;
        break;
      }
    }

    if (newCaretPosition === 0 && charCountOriginal > 0) {
      newCaretPosition = formattedValue.length;
    } else if (originalValue.replace(/\D/g, "").length === 0) {
      newCaretPosition = 0;
    }

    target.textContent = formattedValue;

    // Відновлюємо курсор
    if (selection) {
      const range = document.createRange();
      const textNode = target.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const pos = Math.min(newCaretPosition, formattedValue.length);
        range.setStart(textNode, pos);
        range.setEnd(textNode, pos);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        range.selectNodeContents(target);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });

  // 🎯 Слухач втрати фокусу
  inputElement.addEventListener("blur", (event) => {
    const target = event.target as HTMLElement;
    const value = target.textContent || "";
    target.textContent = formatNumber(value);
  });
}
