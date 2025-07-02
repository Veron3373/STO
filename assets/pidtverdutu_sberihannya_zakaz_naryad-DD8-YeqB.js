import{g as i,u as d}from"./main-DvCcQQyd.js";import"./supabaseClient-COcdlTl_.js";const n="save-prompt-modal-create";function u(){const t=document.createElement("div");t.id=n,t.className="modal-create-overlay",t.style.display="none";const e=document.createElement("div");return e.className="modal-content-save",e.innerHTML=`
    <p>Створити новий запис?</p>
    <div class="save-buttons">
      <button id="save-confirm-create" class="btn-save-confirm">Тааааак</button>
      <button id="save-cancel-create" class="btn-save-cancel">Ні</button>
    </div>
  `,t.appendChild(e),t}function f(){return new Promise(t=>{const e=document.getElementById(n);if(!e)return console.warn("❌ Модальне вікно не знайдено:",n),t(!1);e.classList.add("active"),e.style.display="flex";const a=e.querySelector("#save-confirm-create"),o=e.querySelector("#save-cancel-create"),c=()=>{e.classList.remove("active"),e.style.display="none",a.removeEventListener("click",s),o.removeEventListener("click",l)},s=()=>{const r=i();console.log("🆕 Дані нового запису:",JSON.stringify(r,null,2)),console.log("🆕 userConfirmation:",d),c(),t(!0)},l=()=>{c(),t(!1)};a.addEventListener("click",s),o.addEventListener("click",l)})}export{u as createSaveModalCreate,n as saveModalIdCreate,f as showSaveModalCreate};
