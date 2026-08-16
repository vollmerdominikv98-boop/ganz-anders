import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from './config.js';
import { customAlert } from './modal.js';

let supabaseClient = null;

export function initSupabase(onDataFetched) {
    const url = localStorage.getItem('toolpilot_supabase_url') || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem('toolpilot_supabase_key') || DEFAULT_SUPABASE_KEY;
    
    if (url && key && window.supabase) {
        supabaseClient = window.supabase.createClient(url, key);
        fetchDataFromSupabase(onDataFetched);
    }
}

export async function pushDataToSupabase(db) {
    if (!supabaseClient) return;
    try {
        const objectToArray = (obj) => Object.entries(obj || {}).map(([id, data]) => ({ id, ...data }));
        await Promise.all([
            supabaseClient.from('machines').upsert(objectToArray(db.machines)),
            supabaseClient.from('materials').upsert(objectToArray(db.materials)),
            supabaseClient.from('tools').upsert(objectToArray(db.tools))
        ]);
        const userStateData = { history: db.history, favorites: db.favorites, swarm_data: db.swarm_data };
        await supabaseClient.from('app_state').upsert({ id: 'global_db', data: userStateData, updated_at: new Date() });
    } catch(e) { console.error("Cloud Push Error:", e); }
}

export async function fetchDataFromSupabase(onSuccess) {
    if (!supabaseClient) return;
    try {
        const [ { data: machines }, { data: materials }, { data: tools }, { data: appState } ] = await Promise.all([
            supabaseClient.from('machines').select('*'),
            supabaseClient.from('materials').select('*'),
            supabaseClient.from('tools').select('*'),
            supabaseClient.from('app_state').select('data').eq('id', 'global_db').maybeSingle()
        ]);
        
        const arrayToObject = (array) => {
            if (!array || !Array.isArray(array) || array.length === 0) return null;
            const obj = {};
            array.forEach(item => {
                const { id, ...rest } = item;
                if (id) obj[id] = rest;
            });
            return Object.keys(obj).length > 0 ? obj : null;
        };

        if (typeof onSuccess === 'function') {
            onSuccess({
                machines: arrayToObject(machines),
                materials: arrayToObject(materials),
                tools: arrayToObject(tools),
                appStateData: appState?.data || null
            });
        }
    } catch(e) {}
}

export async function saveSupabaseConfig(onDataFetched) {
    const url = document.getElementById('supabase-url').value.trim();
    const key = document.getElementById('supabase-key').value.trim();
    if (!url || !key) return customAlert("Bitte URL und Key eingeben.");
    localStorage.setItem('toolpilot_supabase_url', url);
    localStorage.setItem('toolpilot_supabase_key', key);
    initSupabase(onDataFetched);
    await customAlert("Supabase Konfiguration gespeichert!");
}
