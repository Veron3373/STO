import{s as m}from"./supabaseClient-BwUcoQvm.js";const l="save-prompt-modal";function p(){const t=document.createElement("div");t.id=l,t.className="modal-overlay-save",t.style.display="none";const e=document.createElement("div");return e.className="modal-content-save",e.innerHTML=`
    <p>Підтвердіть!!!</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>`,t.appendChild(e),t}function y(){return new Promise(t=>{const e=document.getElementById(l);if(!e)return t(!1);e.style.display="flex";const a=document.getElementById("save-confirm"),n=document.getElementById("save-cancel"),o=()=>{e.style.display="none",a.removeEventListener("click",i),n.removeEventListener("click",r)},c=(u,g)=>{const s=document.createElement("div");s.textContent=u,s.style.position="fixed",s.style.top="50%",s.style.left="50%",s.style.transform="translate(-50%, -50%)",s.style.backgroundColor=g,s.style.color="white",s.style.padding="12px 24px",s.style.borderRadius="8px",s.style.zIndex="10001",s.style.fontSize="16px",s.style.boxShadow="0 4px 12px rgba(0,0,0,0.2)",document.body.appendChild(s),setTimeout(()=>{s.remove()},1500)},i=()=>{o(),c("✅ Налаштування змінено","#4caf50"),t(!0)},r=()=>{o(),c("❌ Відмінено налаштуваня","#f44336"),t(!1)};a.addEventListener("click",i),n.addEventListener("click",r)})}const d={1:{id:"toggle-shop",label:"Магазин",class:"_shop"},2:{id:"toggle-slyusar",label:"Слюсар",class:"_slyusar"},3:{id:"toggle-receiver",label:"Приймальник",class:"_receiver"},4:{id:"toggle-income",label:"Джерело",class:"_income"}};function f(t){return`
    <label class="toggle-switch ${t.class}">
      <input type="checkbox" id="${t.id}" />
      <span class="slider"></span>
      <span class="label-text">${t.label}</span>
    </label>
  `}async function v(t){try{const{data:e,error:a}=await m.from("settings").select("setting_id, data");if(a){console.error("Помилка при завантаженні налаштувань:",a);return}e==null||e.forEach(n=>{const o=d[n.setting_id];if(o){const c=t.querySelector(`#${o.id}`);c&&(c.checked=n.data)}})}catch(e){console.error("Помилка завантаження:",e)}}function b(t){t.querySelectorAll('input[type="checkbox"]').forEach(a=>{const n=a.closest(".toggle-switch"),o=()=>{n==null||n.classList.toggle("active",a.checked)};o(),a.addEventListener("change",o)})}async function h(t){if(!await y())return console.log("Збереження скасовано користувачем."),!1;const a=Object.entries(d).map(([n,o])=>({setting_id:parseInt(n),data:t.querySelector(`#${o.id}`).checked}));try{for(const n of a){const{error:o}=await m.from("settings").upsert({setting_id:n.setting_id,data:n.data});o&&console.error(`Помилка збереження налаштування ${n.setting_id}:`,o)}return console.log("Налаштування успішно збережено!"),!0}catch(n){return console.error("Помилка при збереженні налаштувань:",n),!1}}async function E(){if(document.getElementById("modal-settings"))return;const e=document.createElement("div");e.id="modal-settings",e.className="modal-settings hidden";const a=Object.values(d).map(f).join("");if(e.innerHTML=`
    <div class="modal-window">
      <h2>Налаштування</h2>
      ${a}
      <div class="modal-actions">
        <button id="modal-cancel-button" type="button">Відмінити</button>
        <button id="modal-ok-button" type="button">ОК</button>
      </div>
    </div>
  `,!document.getElementById(l)){const c=p();document.body.appendChild(c)}document.body.appendChild(e),await v(e),b(e),e.querySelector("#modal-ok-button").addEventListener("click",async()=>{await h(e)&&e.classList.add("hidden")}),e.querySelector("#modal-cancel-button").addEventListener("click",()=>{e.classList.add("hidden")}),e.addEventListener("click",c=>{c.target===e&&e.classList.add("hidden")})}function L(){const t=document.getElementById("modal-settings");t&&t.classList.remove("hidden")}document.addEventListener("DOMContentLoaded",()=>{const t=document.querySelector('[data-action="openSettings"]');t==null||t.addEventListener("click",async e=>{e.preventDefault(),document.getElementById("modal-settings")||await E(),L()})});export{E as createSettingsModal,L as openSettingsModal};
