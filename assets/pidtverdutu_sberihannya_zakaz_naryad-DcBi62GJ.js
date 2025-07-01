import{g as r,u as d}from"./main-BM-d5is2.js";import"./supabaseClient-B08L58Py.js";const t="save-prompt-modal";function u(){const n=document.createElement("div");n.id=t,n.style.display="none";const e=document.createElement("div");return e.className="modal-content-save",e.innerHTML=`
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `,n.appendChild(e),n}function p(){return new Promise(n=>{const e=document.getElementById(t);if(!e)return console.warn("❌ Модальне вікно не знайдено:",t),n(!1);e.classList.add("active"),e.style.display="flex";const o=document.getElementById("save-confirm"),s=document.getElementById("save-cancel"),a=()=>{e.classList.remove("active"),e.style.display="none",o.removeEventListener("click",c),s.removeEventListener("click",l)},c=()=>{const i=r();console.log("✅ Дані форми:",JSON.stringify(i,null,2)),console.log("✅ userConfirmation:",d),a(),n(!0)},l=()=>{a(),n(!1)};o.addEventListener("click",c),s.addEventListener("click",l)})}export{u as createSavePromptModal,t as savePromptModalId,p as showSavePromptModal};
