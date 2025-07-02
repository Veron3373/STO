import{g as i,u as d}from"./main-BAIW8EZi.js";import"./supabaseClient-COcdlTl_.js";const a="save-prompt-modal-create";function u(){const t=document.createElement("div");t.id=a,t.className="modal-create-overlay",t.style.display="none";const e=document.createElement("div");return e.className="modal-content-save",e.innerHTML=`
    <p>Створити заказ наряд?</p>
    <div class="save-buttons">
      <button id="save-confirm-create" class="btn-save-confirm">Так</button>
      <button id="save-cancel-create" class="btn-save-cancel">Ні</button>
    </div>
  `,t.appendChild(e),t}function f(){return new Promise(t=>{const e=document.getElementById(a);if(!e)return console.warn("❌ Модальне вікно не знайдено:",a),t(!1);e.classList.add("active"),e.style.display="flex";const o=e.querySelector("#save-confirm-create"),c=e.querySelector("#save-cancel-create"),s=()=>{e.classList.remove("active"),e.style.display="none",o.removeEventListener("click",r),c.removeEventListener("click",l)},r=()=>{try{const n=i();console.log("🆕 Дані нового запису:",JSON.stringify(n,null,2)),console.log("🆕 userConfirmation:",d),s(),t(!0)}catch(n){console.error("🚨 Помилка у onConfirm:",n),t(!1)}},l=()=>{s(),t(!1)};o.addEventListener("click",r),c.addEventListener("click",l)})}export{u as createSaveModalCreate,a as saveModalIdCreate,f as showSaveModalCreate};
