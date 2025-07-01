import{g as l,u as d}from"./main-BsSAk_0p.js";import"./supabaseClient-B08L58Py.js";const r="save-prompt-modal-create";console.log(l,d);function v(){const e=document.createElement("div");e.id=r,e.className="modal-overlay-create-sakaz_narad",e.style.display="none";const a=document.createElement("div");return a.className="modal-content-create-sakaz_narad",a.innerHTML=`
    <p class="modal-text-create-sakaz_narad">Зберегти зміни?</p>
    <div class="save-buttons-create-sakaz_narad">
      <button id="save-confirm" class="btn-save-confirm-create-sakaz_narad">Так</button>
      <button id="save-cancel" class="btn-save-cancel-create-sakaz_narad">Ні</button>
    </div>
  `,e.appendChild(a),e}function u(){return new Promise(e=>{const a=document.getElementById(r);if(!a)return e(!1);a.style.display="flex";const t=document.getElementById("save-confirm"),n=document.getElementById("save-cancel"),o=()=>{a.style.display="none",t.removeEventListener("click",c),n.removeEventListener("click",s)},c=()=>{o(),e(!0)},s=()=>{o(),e(!1)};t.addEventListener("click",c),n.addEventListener("click",s)})}export{v as createSavePromptModal,r as savePromptModalId,u as showSavePromptModal};
