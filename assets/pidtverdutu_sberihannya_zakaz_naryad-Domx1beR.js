import{g as d,u as r}from"./main-BhEr_M10.js";import"./supabaseClient-B08L58Py.js";const t="save-prompt-modal";function u(){const e=document.createElement("div");e.id=t,e.className="",e.style.display="none";const n=document.createElement("div");return n.className="modal-content-save-confirm",n.innerHTML=`
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `,e.appendChild(n),e}function f(){return new Promise(e=>{const n=document.getElementById(t);if(!n)return console.warn("❌ Модальне вікно не знайдено:",t),e(!1);n.classList.add("active"),n.style.display="flex";const o=document.getElementById("save-confirm"),s=document.getElementById("save-cancel"),a=()=>{n.classList.remove("active"),n.style.display="none",o.removeEventListener("click",c),s.removeEventListener("click",l)},c=()=>{const i=d();console.log("✅ Дані форми:",i),console.log("✅ userConfirmation:",r),a(),e(!0)},l=()=>{a(),e(!1)};o.addEventListener("click",c),s.addEventListener("click",l)})}export{u as createSaveModal,t as saveModalId,f as showSaveModal};
