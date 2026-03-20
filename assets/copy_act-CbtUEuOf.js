import{b as m,s as b,u as z,c as E,a3 as q}from"./ai-chat-BeJDJRVc.js";import"./supabase-DRKAzbHb.js";import"./react-D9qokX91.js";import"./vendor-BbuY7I8J.js";import"./modal-act-XN9HSWd6.js";import"./pdf-IjrbedlX.js";function $(){const e=new Date,t=i=>String(i).padStart(2,"0");return`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())} ${t(e.getHours())}:${t(e.getMinutes())}:${t(e.getSeconds())}`}let u=null,g=null,w=[];async function T(){if(w.length>0)return w;const{data:e}=await b.from("clients").select("client_id, data").order("client_id",{ascending:!1});return w=e||[],w}async function I(e){const{data:t}=await b.from("cars").select("cars_id, data").eq("client_id",e).not("is_deleted","is",!0).order("cars_id",{ascending:!1});return t||[]}function v(e){const t=typeof e.data=="string"?JSON.parse(e.data):e.data;return((t==null?void 0:t.ПІБ)||`Клієнт #${e.client_id}`).trim()}function A(e){const t=typeof e.data=="string"?JSON.parse(e.data):e.data,i=(t==null?void 0:t.Авто)||"",r=(t==null?void 0:t["Номер авто"])||"",c=(t==null?void 0:t.Рік)||"";return[i,c,r].filter(Boolean).join(" · ")||`Авто #${e.cars_id}`}function B(){var i;(i=document.getElementById("copy-act-picker-modal"))==null||i.remove();const e=document.createElement("div");return e.id="copy-act-picker-modal",e.style.cssText=`
    position:fixed; inset:0; z-index:10200;
    background:rgba(0,0,0,0.55);
    display:flex; align-items:center; justify-content:center;
    animation:fadeIn .15s ease;
  `,e.innerHTML=`
    <div id="copy-picker-box" style="
      background:#fff; border-radius:16px;
      width:460px; max-width:95vw; max-height:85vh;
      display:flex; flex-direction:column;
      box-shadow:0 12px 50px rgba(0,0,0,0.3);
      overflow:hidden;
    ">
      <!-- Хедер -->
      <div style="
        background:linear-gradient(135deg,#177245,#0f5132);
        padding:18px 24px; color:#fff;
        display:flex; align-items:center; justify-content:space-between;
      ">
        <div>
          <div style="font-size:20px; font-weight:700;">📋 Схожий акт</div>
          <div style="font-size:12px; opacity:.8; margin-top:2px;">
            Роботи і деталі перенесуться до нового акту
          </div>
        </div>
        <button id="copy-picker-close" style="
          background:rgba(255,255,255,.15); border:none; color:#fff;
          width:32px; height:32px; border-radius:50%; font-size:18px;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
        ">×</button>
      </div>

      <!-- Крок 1: пошук клієнта -->
      <div id="copy-step-client" style="padding:20px 24px; flex:1; overflow-y:auto;">
        <div style="font-size:13px; color:#555; margin-bottom:10px; font-weight:600; text-transform:uppercase; letter-spacing:.5px;">
          Крок 1 — Оберіть клієнта
        </div>
        <div style="position:relative;">
          <input id="copy-client-search" type="text"
            placeholder="🔍 Пошук по ПІБ або телефону..."
            style="
              width:100%; box-sizing:border-box;
              padding:10px 14px; border-radius:10px;
              border:1.5px solid #ddd; font-size:14px;
              outline:none; transition:border .2s;
            "
          />
        </div>
        <div id="copy-client-list" style="
          margin-top:8px; max-height:320px; overflow-y:auto;
          border:1px solid #eee; border-radius:10px;
        "></div>
      </div>

      <!-- Крок 2: вибір авто (прихований спочатку) -->
      <div id="copy-step-car" style="padding:20px 24px; display:none; flex:1; overflow-y:auto;">
        <button id="copy-back-to-client" style="
          background:none; border:none; color:#177245;
          font-size:13px; cursor:pointer; margin-bottom:12px;
          display:flex; align-items:center; gap:4px; padding:0;
        ">← Назад до клієнтів</button>
        <div style="font-size:13px; color:#555; margin-bottom:10px; font-weight:600; text-transform:uppercase; letter-spacing:.5px;">
          Крок 2 — Оберіть авто
        </div>
        <div id="copy-client-name-display" style="
          padding:10px 14px; background:#f0f9f4; border-radius:8px;
          color:#177245; font-weight:600; margin-bottom:12px; font-size:14px;
        "></div>
        <div id="copy-car-list" style="
          max-height:280px; overflow-y:auto;
          border:1px solid #eee; border-radius:10px;
        "></div>
        <div id="copy-no-cars" style="display:none; text-align:center; padding:20px; color:#888; font-size:14px;">
          😔 У цього клієнта немає авто.<br>
          <button id="copy-create-anyway" style="
            margin-top:12px; padding:8px 20px; border-radius:8px;
            background:#177245; color:#fff; border:none; cursor:pointer;
            font-size:14px; font-weight:600;
          ">Все одно створити акт</button>
        </div>
      </div>

      <!-- Кнопка підтвердження (показується після вибору авто) -->
      <div id="copy-footer" style="
        display:none; padding:14px 24px;
        border-top:1px solid #eee;
        display:none; flex-direction:column; gap:10px;
        background:#fafafa;
      ">
        <div id="copy-summary" style="font-size:13px; color:#555; line-height:1.5;"></div>
        <button id="copy-confirm-final" style="
          padding:12px; border-radius:10px; border:none;
          background:linear-gradient(135deg,#177245,#0f5132);
          color:#fff; font-size:15px; font-weight:700;
          cursor:pointer; transition:opacity .2s;
        ">✅ Створити схожий акт</button>
      </div>
    </div>
  `,document.body.appendChild(e),{el:e,destroy:()=>e.remove()}}function C(e,t){const i=document.getElementById("copy-client-list"),r=t.toLowerCase().trim(),c=e.filter(a=>{const o=v(a).toLowerCase(),s=typeof a.data=="string"?JSON.parse(a.data):a.data,p=((s==null?void 0:s.Телефон)||"").toLowerCase();return!r||o.includes(r)||p.includes(r)}).slice(0,50);if(c.length===0){i.innerHTML='<div style="padding:20px; text-align:center; color:#888; font-size:14px;">Нічого не знайдено</div>';return}i.innerHTML=c.map(a=>{const o=typeof a.data=="string"?JSON.parse(a.data):a.data,s=v(a),p=(o==null?void 0:o.Телефон)||"";return`
      <div class="copy-client-item" data-id="${a.client_id}" style="
        padding:12px 16px; cursor:pointer; border-bottom:1px solid #f0f0f0;
        transition:background .15s;
      ">
        <div style="font-weight:600; font-size:14px; color:#1a1a2e;">${s}</div>
        ${p?`<div style="font-size:12px; color:#177245; margin-top:2px;">${p}</div>`:""}
      </div>
    `}).join("")}function M(e){const t=document.getElementById("copy-car-list"),i=document.getElementById("copy-no-cars");if(e.length===0){t.style.display="none",i.style.display="block";return}i.style.display="none",t.style.display="block",t.innerHTML=e.map(r=>{const c=A(r);return`
      <div class="copy-car-item" data-id="${r.cars_id}" style="
        padding:12px 16px; cursor:pointer; border-bottom:1px solid #f0f0f0;
        transition:background .15s; display:flex; align-items:center; gap:10px;
      ">
        <span style="font-size:22px;">🚗</span>
        <span style="font-weight:600; font-size:14px; color:#1a1a2e;">${c}</span>
      </div>
    `}).join("")}async function N(e){var l;u=null,g=null,m("⏳ Завантажую клієнтів...","info",1500);const t=await T(),{el:i,destroy:r}=B(),c=i.querySelector("#copy-step-client"),a=i.querySelector("#copy-step-car"),o=i.querySelector("#copy-footer"),s=i.querySelector("#copy-client-search"),p=i.querySelector("#copy-client-list"),h=i.querySelector("#copy-car-list"),f=i.querySelector("#copy-client-name-display"),k=i.querySelector("#copy-summary"),n=document.createElement("style");n.textContent=`
    .copy-client-item:hover { background:#f0f9f4 !important; }
    .copy-car-item:hover    { background:#f0f9f4 !important; }
    #copy-client-search:focus { border-color:#177245 !important; }
  `,document.head.appendChild(n),C(t,""),s.addEventListener("input",()=>{C(t,s.value)}),p.addEventListener("click",async d=>{const y=d.target.closest(".copy-client-item");if(!y)return;u=Number(y.dataset.id);const x=t.find(_=>_.client_id===u);if(!x)return;c.style.display="none",a.style.display="block",f.textContent=`👤 ${v(x)}`;const L=await I(u);M(L)}),i.querySelector("#copy-back-to-client").addEventListener("click",()=>{u=null,g=null,a.style.display="none",c.style.display="block",o.style.display="none"}),h.addEventListener("click",d=>{var _;const y=d.target.closest(".copy-car-item");if(!y)return;g=Number(y.dataset.id),h.querySelectorAll(".copy-car-item").forEach(S=>{S.style.background=""}),y.style.background="#e8f5e9";const x=t.find(S=>S.client_id===u),L=((_=y.querySelector("span:last-child"))==null?void 0:_.textContent)||"";k.innerHTML=`
      <b>Клієнт:</b> ${x?v(x):"—"}<br>
      <b>Авто:</b> ${L}
    `,o.style.display="flex"}),(l=i.querySelector("#copy-create-anyway"))==null||l.addEventListener("click",()=>{g=null;const d=t.find(y=>y.client_id===u);k.innerHTML=`<b>Клієнт:</b> ${d?v(d):"—"}<br><b>Авто:</b> не вказано`,o.style.display="flex"}),i.querySelector("#copy-confirm-final").addEventListener("click",async()=>{if(!u)return;const d=i.querySelector("#copy-confirm-final");d.disabled=!0,d.textContent="⏳ Створюємо...",await H(e,u,g),r(),n.remove()}),i.querySelector("#copy-picker-close").addEventListener("click",()=>{r(),n.remove()}),i.addEventListener("click",d=>{d.target===i&&(r(),n.remove())})}async function H(e,t,i){var r;try{m("⏳ Копіюємо акт...","info",2500);const{data:c,error:a}=await b.from("acts").select("data").eq("act_id",e).single();if(a||!c){m("❌ Помилка читання акту","error");return}const o=c.data,s=((o==null?void 0:o.Деталі)||[]).filter(n=>{var l;return(l=n.Деталь)==null?void 0:l.trim()}).map(n=>({Деталь:n.Деталь||"",Магазин:n.Магазин||"",Кількість:n.Кількість||0,Ціна:n.Ціна||0,Сума:n.Сума||0,Каталог:n.Каталог||"",sclad_id:n.sclad_id||null,detail_id:n.detail_id||null})),p=((o==null?void 0:o.Роботи)||[]).filter(n=>{var l;return(l=n.Робота)==null?void 0:l.trim()}).map(n=>({Робота:n.Робота||"",Слюсар:n.Слюсар||"",Кількість:n.Кількість||0,Ціна:n.Ціна||0,Сума:n.Сума||0,Каталог:n.Каталог||"",slyusar_id:n.slyusar_id||null,work_id:n.work_id||null}));s.length===0&&s.push({Деталь:"",Магазин:"",Кількість:0,Ціна:0,Сума:0,Каталог:"",sclad_id:null,detail_id:null}),p.length===0&&p.push({Робота:"",Слюсар:"",Кількість:0,Ціна:0,Сума:0,Каталог:"",slyusar_id:null,work_id:null});const h={Деталі:s,Роботи:p,Пробіг:0,"За деталі":0,"За роботу":0,Приймальник:"",Рекомендації:(o==null?void 0:o.Рекомендації)||"",Примітки:(o==null?void 0:o.Примітки)||"","Загальна сума":0,"Причина звернення":(o==null?void 0:o["Причина звернення"])||"","Прибуток за деталі":0,"Прибуток за роботу":0,copied_from_act_id:e},{data:f,error:k}=await b.from("acts").insert([{date_on:$(),client_id:t,cars_id:i,data:h,avans:0}]).select("act_id").single();if(k||!f){m("❌ Помилка створення акту","error");return}if(z!=="Слюсар"){const n=(r=E)==null?void 0:r();n!=null&&n.name&&await b.from("acts").update({pruimalnyk:n.name}).eq("act_id",f.act_id)}m(`✅ Акт №${f.act_id} створено!`,"success",4e3),await q(),setTimeout(()=>{const n=document.getElementById("zakaz_narayd-custom-modal");n&&(n.style.display="none");const l=document.getElementById("open-modal-sakaz_narad");l&&(l.setAttribute("data-act-id",String(f.act_id)),l.click())},500)}catch{m("❌ Внутрішня помилка","error")}}function U(e){const t=document.getElementById("copy-act-btn");t&&t.addEventListener("click",()=>{N(e)})}export{U as initCopyActButton,N as openCopyActPicker};
