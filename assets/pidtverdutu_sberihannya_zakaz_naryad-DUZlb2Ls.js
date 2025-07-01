import{g as r,u as l}from"./main-CljWKT_5.js";import"./supabaseClient-B08L58Py.js";const d="save-prompt-modal-create";console.log(r,l);const i=r();alert(`Значення форми:
${JSON.stringify(i,null,2)}

userConfirmation: ${l}`);function v(){const e=document.createElement("div");e.id=d,e.className="modal-overlay-create-sakaz_narad",e.style.display="none";const a=document.createElement("div");return a.className="modal-content-create-sakaz_narad",a.innerHTML=`
    <p class="modal-text-create-sakaz_narad">Зберегти зміни?</p>
    <div class="save-buttons-create-sakaz_narad">
      <button id="save-confirm" class="btn-save-confirm-create-sakaz_narad">Так</button>
      <button id="save-cancel" class="btn-save-cancel-create-sakaz_narad">Ні</button>
    </div>
  `,e.appendChild(a),e}function p(){return new Promise(e=>{const a=document.getElementById(d);if(!a)return e(!1);a.style.display="flex";const n=document.getElementById("save-confirm"),t=document.getElementById("save-cancel"),o=()=>{a.style.display="none",n.removeEventListener("click",s),t.removeEventListener("click",c)},s=()=>{o(),e(!0)},c=()=>{o(),e(!1)};n.addEventListener("click",s),t.addEventListener("click",c)})}export{v as createSavePromptModal,d as savePromptModalId,p as showSavePromptModal};
