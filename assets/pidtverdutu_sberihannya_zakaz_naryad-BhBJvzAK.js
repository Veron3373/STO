import{g as r,u as m}from"./main-C7wovqQh.js";import"./supabaseClient-B08L58Py.js";const l="save-prompt-modal";function u(){const e=document.createElement("div");e.id=l,e.className="";const n=document.createElement("div");return n.className="modal-content-save",n.innerHTML=`
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `,e.appendChild(n),e.style.display="none",e}function p(){return new Promise(e=>{const n=document.getElementById(l);if(!n)return e(!1);n.classList.add("active");const t=document.getElementById("save-confirm"),o=document.getElementById("save-cancel"),a=()=>{n.classList.remove("active"),t.removeEventListener("click",c),o.removeEventListener("click",s)},c=()=>{const i=r();console.log("✅ Дані з форми:",i),console.log("🔄 userConfirmation:",m),a(),e(!0)},s=()=>{a(),e(!1)};t.addEventListener("click",c),o.addEventListener("click",s)})}export{u as createSavePromptModal,l as savePromptModalId,p as showSavePromptModal};
