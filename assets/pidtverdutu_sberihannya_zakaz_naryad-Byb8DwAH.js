import{g as r,u as m}from"./main--E-jPdi6.js";import"./supabaseClient-B08L58Py.js";const l="save-prompt-modal-create";function u(){const e=document.createElement("div");e.id=l,e.className="";const t=document.createElement("div");return t.className="modal-content-save",t.innerHTML=`
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `,e.appendChild(t),e.style.display="none",e}function p(){return new Promise(e=>{const t=document.getElementById(l);if(!t)return e(!1);t.classList.add("active");const n=document.getElementById("save-confirm"),o=document.getElementById("save-cancel"),a=()=>{t.classList.remove("active"),n.removeEventListener("click",c),o.removeEventListener("click",s)},c=()=>{const i=r();console.log("✅ Дані з форми:",i),console.log("🔄 userConfirmation:",m),a(),e(!0)},s=()=>{a(),e(!1)};n.addEventListener("click",c),o.addEventListener("click",s)})}export{u as createSavePromptModal,l as savePromptModalId,p as showSavePromptModal};
