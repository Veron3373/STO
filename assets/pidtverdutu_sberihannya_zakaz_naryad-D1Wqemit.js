import{g as i}from"./main-wAkoJH9k.js";import"./supabaseClient-COcdlTl_.js";const a="save-prompt-modal-create";function v(){const t=document.createElement("div");t.id=a,t.className="modal-create-overlay",t.style.display="none";const e=document.createElement("div");return e.className="modal-content-save",e.innerHTML=`
    <p>Створити заказ наряд?</p>
    <div class="save-buttons">
      <button id="save-confirm-create" class="btn-save-confirm">Так</button>
      <button id="save-cancel-create" class="btn-save-cancel">Ні</button>
    </div>
  `,t.appendChild(e),t}function u(){return new Promise(t=>{const e=document.getElementById(a);if(!e)return console.warn("❌ Модальне вікно не знайдено:",a),t(!1);e.classList.add("active"),e.style.display="flex";const c=e.querySelector("#save-confirm-create"),o=e.querySelector("#save-cancel-create"),s=()=>{e.classList.remove("active"),e.style.display="none",c.removeEventListener("click",r),o.removeEventListener("click",l)},r=()=>{try{const n=i();console.log("🆕 Дані нового запису:",JSON.stringify(n,null,2)),s(),t(!0)}catch(n){console.error("🚨 Помилка у onConfirm:",n),t(!1)}},l=()=>{s(),t(!1)};c.addEventListener("click",r),o.addEventListener("click",l)})}export{v as createSaveModalCreate,a as saveModalIdCreate,u as showSaveModalCreate};
