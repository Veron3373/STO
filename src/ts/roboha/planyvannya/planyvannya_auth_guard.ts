// src/ts/roboha/planyvannya/planyvannya_auth_guard.ts
// Захист сторінки planyvannya.html від неавторизованого доступу

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";

async function checkAuthOnPageLoad(): Promise<void> {
    console.log("🔒 Перевірка авторизації (Planning)...");

    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error || !session) {
        console.warn("⛔ Доступ заблоковано. Немає сесії.");
        window.location.href = "https://veron3373.github.io/STO/main.html";
        return;
    }

    console.log("✅ Авторизовано");

    // Змінюємо URL
    obfuscateCurrentUrl();

    // Показуємо контент
    const container = document.querySelector(
        ".Planning-container"
    ) as HTMLElement;
    if (container) {
        container.style.display = "block";
        // container.style.visibility = "visible"; // Якщо ви використовуєте visibility
    }
}

checkAuthOnPageLoad();
