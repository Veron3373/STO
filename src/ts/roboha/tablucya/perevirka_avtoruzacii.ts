// src/ts/roboha/tablucya/auth_guards.ts
// Контроль доступу через Google Auth для кнопок меню

import { supabase } from "../../vxid/supabaseClient";

/**
 * Ініціалізація захисту для кнопок, які потребують авторизації через Google
 */
export function initializeAuthGuards(): void {
    console.log("🔒 Ініціалізація auth guards...");

    // Чекаємо поки DOM завантажиться
    document.addEventListener("DOMContentLoaded", () => {
        setupBukhhalteriyaGuard();
        setupHomeGuard();
        setupClientGuard();
    });
}

/**
 * Захист для кнопки "Бухгалтерія"
 */
function setupBukhhalteriyaGuard(): void {
    const bukhhLink = document.querySelector('[data-action="openBukhhalteriya"]');

    if (bukhhLink) {
        // Додаємо обробник на CAPTURE фазі, щоб спрацював ПЕРШИМ
        bukhhLink.addEventListener("click", async (e: Event) => {
            e.preventDefault(); // Блокуємо стандартну поведінку
            e.stopPropagation(); // Зупиняємо всплиття події

            console.log("🔒 Перевірка доступу до Бухгалтерії...");

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    alert("⛔ Доступ заблоковано. Ви не авторизовані через Google.");
                    console.warn("❌ Спроба доступу без авторизації");
                    return;
                }

                console.log("✅ Авторизація підтверджена, перехід дозволено");
                // Якщо авторизований - переходимо на сторінку
                window.location.href = "bukhhalteriya.html";
            } catch (error) {
                console.error("❌ Помилка перевірки авторизації:", error);
                alert("⛔ Помилка перевірки авторизації");
            }
        }, true); // true = capture phase

        console.log("✅ Auth guard для Бухгалтерії встановлено");
    }
}

/**
 * Захист для кнопки "Наряд" (openHome)
 */
function setupHomeGuard(): void {
    const homeLink = document.querySelector('[data-action="openHome"]');

    if (homeLink) {
        homeLink.addEventListener("click", async (e: Event) => {
            console.log("🔒 Перевірка доступу до Наряду...");

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    e.preventDefault();
                    e.stopPropagation();
                    alert("⛔ Доступ заблоковано. Ви не авторизовані через Google.");
                    console.warn("❌ Спроба доступу без авторизації до Наряду");
                    return;
                }

                console.log("✅ Авторизація підтверджена для Наряду");
            } catch (error) {
                e.preventDefault();
                e.stopPropagation();
                console.error("❌ Помилка перевірки авторизації:", error);
                alert("⛔ Помилка перевірки авторизації");
            }
        }, true);

        console.log("✅ Auth guard для Наряду встановлено");
    }
}

/**
 * Захист для кнопки "Додати" (openClient)
 * Тут вже є перевірка в dodatu_inchi_bazu_danux.ts, але додаємо додатковий захист
 */
function setupClientGuard(): void {
    const clientLink = document.querySelector('[data-action="openClient"]');

    if (clientLink) {
        // Додаємо перевірку на CAPTURE фазі, щоб спрацювала ПЕРЕД існуючими обробниками
        clientLink.addEventListener("click", async (e: Event) => {
            console.log("🔒 Перевірка доступу до Додати...");

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    e.preventDefault();
                    e.stopImmediatePropagation(); // Зупиняємо ВСІ інші обробники
                    alert("⛔ Доступ заблоковано. Ви не авторизовані через Google.");
                    console.warn("❌ Спроба доступу без авторизації до Додати");
                    return;
                }

                console.log("✅ Авторизація підтверджена для Додати");
            } catch (error) {
                e.preventDefault();
                e.stopImmediatePropagation();
                console.error("❌ Помилка перевірки авторізації:", error);
                alert("⛔ Помилка перевірки авторизації");
            }
        }, true);

        console.log("✅ Auth guard для Додати встановлено");
    }
}

// Автоматично ініціалізуємо при імпорті
initializeAuthGuards();
