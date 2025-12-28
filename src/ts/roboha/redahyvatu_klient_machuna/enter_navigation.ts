// src/ts/roboha/redahyvatu_klient_machuna/enter_navigation.ts

/**
 * Налаштовує навігацію між полями вводу за допомогою клавіші Enter
 * @param fieldIds - Масив ID полів в порядку навігації
 */
export function setupEnterNavigation(fieldIds: string[]) {
    fieldIds.forEach((fieldId, index) => {
        const field = document.getElementById(fieldId) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!field) return;

        field.addEventListener("keydown", (e: Event) => {
            if (!(e instanceof KeyboardEvent)) return;
            if (e.key === "Enter") {
                e.preventDefault();

                // Знаходимо наступне поле
                const nextIndex = index + 1;
                if (nextIndex < fieldIds.length) {
                    const nextField = document.getElementById(fieldIds[nextIndex]) as HTMLInputElement | HTMLTextAreaElement | null;
                    if (nextField) {
                        nextField.focus();
                        // Встановлюємо курсор в кінець
                        if (nextField instanceof HTMLInputElement) {
                            nextField.setSelectionRange(nextField.value.length, nextField.value.length);
                        } else if (nextField instanceof HTMLTextAreaElement) {
                            nextField.setSelectionRange(nextField.value.length, nextField.value.length);
                        }
                    }
                }
            }
        });
    });
}
