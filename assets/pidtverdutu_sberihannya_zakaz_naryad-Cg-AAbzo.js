import{g as r,u as d}from"./main-BZMxu1zJ.js";import"./supabaseClient-B08L58Py.js";const l="save-prompt-modal-create";console.log(r,d);function v(){const e=document.createElement("div");e.id=l,e.className="modal-overlay-create-sakaz_narad",e.style.display="none";const n=document.createElement("div");return n.className="modal-content-create-sakaz_narad",n.innerHTML=`
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `,e.appendChild(n),e}function u(){return new Promise(e=>{const n=document.getElementById(l);if(!n)return e(!1);n.style.display="flex";const t=document.getElementById("save-confirm"),a=document.getElementById("save-cancel"),o=()=>{n.style.display="none",t.removeEventListener("click",c),a.removeEventListener("click",s)},c=()=>{o(),e(!0)},s=()=>{o(),e(!1)};t.addEventListener("click",c),a.addEventListener("click",s)})}export{v as createSavePromptModal,l as savePromptModalId,u as showSavePromptModal};
