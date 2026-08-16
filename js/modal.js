export function customAlert(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const box = document.getElementById('custom-modal-box');
        const title = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const btnOk = document.getElementById('custom-modal-ok');
        const btnCancel = document.getElementById('custom-modal-cancel');

        title.innerText = "Hinweis";
        msgEl.innerText = message;
        btnCancel.classList.add('hidden');
        
        modal.classList.remove('hidden');
        setTimeout(() => box.classList.remove('scale-95'), 10);

        btnOk.onclick = () => {
            box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 150);
            resolve(true);
        };
    });
}

export function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const box = document.getElementById('custom-modal-box');
        const title = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const btnOk = document.getElementById('custom-modal-ok');
        const btnCancel = document.getElementById('custom-modal-cancel');

        title.innerText = "Bestätigen";
        msgEl.innerText = message;
        btnCancel.classList.remove('hidden');
        
        modal.classList.remove('hidden');
        setTimeout(() => box.classList.remove('scale-95'), 10);

        btnOk.onclick = () => {
            box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 150);
            resolve(true);
        };
        btnCancel.onclick = () => {
            box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 150);
            resolve(false);
        };
    });
}
