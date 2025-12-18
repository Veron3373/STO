
import "./roboha/tablucya/tablucya";
import "./roboha/tablucya/perevirka_avtoruzacii";
import "./roboha/redahyvatu_klient_machuna/vikno_klient_machuna";
import "./roboha/dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import "./roboha/nalachtuvannay/nalachtuvannay";
import "./roboha/bukhhalteriya/bukhhalteriya";
import "./roboha/dodatu_inchi_bazu/vikno_pidtverdchennay_inchi_bazu";
import "./roboha/dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import "./roboha/redahyvatu_klient_machuna/vikno_klient_machuna";
import "./roboha/redahyvatu_klient_machuna/pidtverdutu_sberihannya_zakaz_naryad";
import "./roboha/redahyvatu_klient_machuna/pidtverdutu_sberihannya_PIB_avto";
import "./roboha/zakaz_naraudy/inhi/vikno_vvody_parolu";
import "./roboha/bukhhalteriya/rosraxunok";
import "./roboha/bukhhalteriya/prubutok";
import "./roboha/zakaz_naraudy/inhi/fakturaRaxunok";
import "./roboha/zakaz_naraudy/inhi/fakturaAct";
import "./roboha/zakaz_naraudy/inhi/act_change_tracker";
import "./roboha/zakaz_naraudy/inhi/act_changes_highlighter";
import "./roboha/zakaz_naraudy/inhi/act_notifications";
import "./roboha/tablucya/povidomlennya_tablucya";
import "./roboha/zakaz_naraudy/inhi/act_realtime_subscription";
import "./vxid/url_obfuscator";
import "./roboha/planyvannya/planyvannya";
import "./roboha/planyvannya/planyvannya_post";

import { showModalCreateSakazNarad, fillClientInfo, fillCarFields, setSelectedIds } from "./roboha/redahyvatu_klient_machuna/vikno_klient_machuna";
import { supabase } from "./vxid/supabaseClient";

document.addEventListener('DOMContentLoaded', async () => {
    const rawData = sessionStorage.getItem('createActData');
    if (rawData) {
        let data: any = {};
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            console.error("Failed to parse createActData", e);
            sessionStorage.removeItem('createActData');
            return;
        }

        // Open the modal
        await showModalCreateSakazNarad();

        // Populate fields
        if (data.clientId) {
            const clientIdStr = String(data.clientId);
            await fillClientInfo(clientIdStr);

            let carIdStr: string | null = null;

            if (data.carId) {
                carIdStr = String(data.carId);
                const { data: carData } = await supabase
                    .from('cars')
                    .select('data')
                    .eq('cars_id', data.carId)
                    .single();

                if (carData?.data) {
                    fillCarFields(carData.data);
                }
            }
            // CRITICAL: Set the internal IDs so the system knows what to save
            setSelectedIds(clientIdStr, carIdStr);
        } else {
            const clientInput = document.getElementById('client-input-create-sakaz_narad') as HTMLTextAreaElement;
            if (clientInput) {
                clientInput.value = data.clientName || '';
                // Emit input event to resize if needed (though resize logic might be bound to specific events)
                clientInput.dispatchEvent(new Event('input'));
                clientInput.style.height = 'auto';
                clientInput.style.height = clientInput.scrollHeight + 'px';
            }

            const phoneInput = document.getElementById('phone-create-sakaz_narad') as HTMLInputElement;
            if (phoneInput) phoneInput.value = data.phone || '';
        }

        const carModelInput = document.getElementById('car-model-create-sakaz_narad') as HTMLInputElement;
        const numberInput = document.getElementById('car-number-input-create-sakaz_narad') as HTMLInputElement;

        if (carModelInput && data.carModel) carModelInput.value = data.carModel;
        if (numberInput && data.carNumber) numberInput.value = data.carNumber;
    }
});
