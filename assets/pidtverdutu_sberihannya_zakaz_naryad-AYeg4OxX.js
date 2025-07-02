import{g as i,u as d}from"./main-Cxm92HXa.js";import"./supabaseClient-B08L58Py.js";const n="save-prompt-modal-create";function u(){const e=document.createElement("div");e.id=n,e.className="modal-create-overlay",e.style.display="none";const t=document.createElement("div");return t.className="modal-content-save",t.innerHTML=`
    <p>Створити новий запис?</p>
    <div class="save-buttons">
      <button id="save-confirm-create" class="btn-save-confirm">Тааааак</button>
      <button id="save-cancel-create" class="btn-save-cancel">Ні</button>
    </div>
  `,e.appendChild(t),e}function f(){return new Promise(e=>{const t=document.getElementById(n);if(!t)return console.warn("❌ Модальне вікно не знайдено:",n),e(!1);t.classList.add("active"),t.style.display="flex";const a=document.getElementById("save-confirm-create"),o=document.getElementById("save-cancel-create"),c=()=>{t.classList.remove("active"),t.style.display="none",a.removeEventListener("click",s),o.removeEventListener("click",l)},s=()=>{const r=i();console.log("🆕 Дані нового запису:",r),console.log("🆕 userConfirmation:",d),c(),e(!0)},l=()=>{c(),e(!1)};a.addEventListener("click",s),o.addEventListener("click",l)})}export{u as createSaveModalCreate,n as saveModalIdCreate,f as showSaveModalCreate};
