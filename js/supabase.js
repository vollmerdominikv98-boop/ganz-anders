import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from './config.js';
import { customAlert } from './modal.js';

let supabaseClient = null;
let isCloudActive = false;

export function getSupabaseClient() {
    return supabaseClient;
}

export function getIsCloudActive() {
    return isCloudActive;
}

export function initSupabase(onDataFetched) {
    const url = localStorage.getItem('toolpilot_supabase_url') || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem('toolpilot_supabase_key') || DEFAULT_SUPABASE_KEY;
    
    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-key');
    if(urlInput) urlInput.value = url;
    if(keyInput) keyInput.value = key;

    if (url && key) {
        try {
            if(window.supabase) {
                supabaseClient = window.supabase.createClient(url, key);
                isCloudActive = true;
                
                fetchDataFromSupabase(onDataFetched);
                listenToSupabaseRealtime(onDataFetched);
                
                const statusText = document.getElementById('supabase-conn-text');
                if(statusText) {
                    statusText.innerText = "✅ Verbunden (SQL Adapter aktiv)";
                    statusText.className = "text-[11px] font-bold text-emerald-600";
                }
            } else {
                console.error("Supabase CDN Skript wurde noch nicht geladen.");
            }
        } catch(e) { 
            console.error("Supabase Init Error:", e); 
        }
    }
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

export async function fetchDataFromSupabase(onSuccess) {
    if (!supabaseClient) return;
    try {
        const [
            { data: machinesArray },
            { data: materialsArray },
            { data: rigidityArray },
            { data: profilesArray },
            { data: toolsArray },
            { data: appState }
        ] = await Promise.all([
            supabaseClient.from('machines').select('*'),
            supabaseClient.from('materials').select('*'),
            supabaseClient.from('rigidity').select('*'),
            supabaseClient.from('profiles').select('*'),
            supabaseClient.from('tools').select('*'),
            supabaseClient.from('app_state').select('data').eq('id', 'global_db').maybeSingle()
        ]);

        const arrayToObject = (array) => {
            const obj = {};
            (array || []).forEach(item => {
                const { id, ...rest } = item;
                obj[id] = rest;
            });
            return obj;
        };

        if (typeof onSuccess === 'function') {
            onSuccess({
                machines: machinesArray && machinesArray.length > 0 ? arrayToObject(machinesArray) : null,
                materials: materialsArray && materialsArray.length > 0 ? arrayToObject(materialsArray) : null,
                rigidity: rigidityArray && rigidityArray.length > 0 ? arrayToObject(rigidityArray) : null,
                profiles: profilesArray && profilesArray.length > 0 ? arrayToObject(profilesArray) : null,
                tools: toolsArray && toolsArray.length > 0 ? arrayToObject(toolsArray) : null,
                appStateData: appState?.data || null
            });
        }

    } catch(e) { 
        console.error("Cloud Fetch Error:", e); 
    }
}

export async function pushDataToSupabase(db) {
    if (!supabaseClient) return;
    try {
        const objectToArray = (obj) => Object.entries(obj || {}).map(([id, data]) => ({ id, ...data }));

        await Promise.all([
            supabaseClient.from('machines').upsert(objectToArray(db.machines)),
            supabaseClient.from('materials').upsert(objectToArray(db.materials)),
            supabaseClient.from('rigidity').upsert(objectToArray(db.rigidity)),
            supabaseClient.from('profiles').upsert(objectToArray(db.profiles)),
            supabaseClient.from('tools').upsert(objectToArray(db.tools))
        ]);

        const userStateData = {
            history: db.history,
            favorites: db.favorites,
            swarm_data: db.swarm_data
        };
        await supabaseClient.from('app_state').upsert({ id: 'global_db', data: userStateData, updated_at: new Date() });

    } catch(e) { 
        console.error("Cloud Push Error:", e); 
    }
}

export function listenToSupabaseRealtime(onUpdate) {
    if (!supabaseClient) return;
    try {
        supabaseClient
            .channel('db_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.global_db' }, payload => {
                if (payload.new && payload.new.data && typeof onUpdate === 'function') {
                    onUpdate({ appStateData: payload.new.data });
                }
            })
            .subscribe();
    } catch(e) {
        console.warn("Supabase Realtime Sync blockiert.", e.message);
    }
}
