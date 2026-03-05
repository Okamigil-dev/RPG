/* =============================================
   === REUSABLE PNG UPLOADER FUNCTION Backup ===
   ============================================= */
// ---  ---
function handleIconUpload(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Configuration: 64x64 PNG
            const size = 64; 
            canvas.width = size;
            canvas.height = size;

            // Center and Crop Logic
            let sourceSize = Math.min(img.width, img.height);
            let sourceX = (img.width - sourceSize) / 2;
            let sourceY = (img.height - sourceSize) / 2;

            ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
            
            // Output: Base64 PNG
            const dataURL = canvas.toDataURL('image/png'); 

            // Update UI
            document.getElementById('reg-skill-icon-base64').value = dataURL;
            const preview = document.getElementById('icon-preview');
            if (preview) {
                preview.innerHTML = `<img src="${dataURL}" style="width:64px; height:64px; border: 1px solid #333; image-rendering: pixelated;">`;
            }
            
            console.log("PNG Processed. Size:", Math.round(dataURL.length / 1024) + " KB");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/* ==========================
   === SIDEBAR UI Backup ===
   ========================== */
function syncSidebarUI(char, totals, hpP, mpP, expP) {
    const getMod = (val) => {
        const m = Math.floor(val / 2);
        return m >= 0 ? `+${m}` : m;
    };

    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    document.getElementById('hud-meta').innerText = `Level ${char.charLevel || 1}`;
    document.getElementById('hud-hp-text').innerText = `${Math.floor(char.hpCurrent || 0)}/${Math.floor(char.hpMax || 0)}`;
    document.getElementById('hud-mp-text').innerText = `${Math.floor(char.mpCurrent || 0)}/${Math.floor(char.mpMax || 0)}`;
    document.getElementById('hud-portrait').style.backgroundImage = char.portrait ? `url(${char.portrait})` : "none";
    
    document.getElementById('hud-mod-body').innerText = `BOD ${getMod(totals.body)}`;
    document.getElementById('hud-mod-mind').innerText = `MIN ${getMod(totals.mind)}`;
    document.getElementById('hud-mod-spirit').innerText = `SPI ${getMod(totals.spirit)}`;

    document.getElementById('hud-hp-fill').style.width = hpP + "%";
    document.getElementById('hud-mp-fill').style.width = mpP + "%";
    document.getElementById('hud-exp-fill').style.width = expP + "%";
    document.getElementById('hud-exp-text').innerText = `${Math.floor(expP)}%`;
    
}

/* ===================================
   === Load User Characters Backup ===
   =================================== */
function loadUserCharacters() {
    const user = auth.currentUser;
    if (!user) return;

    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        grid.innerHTML = "";
        
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url(${d.portrait || ''});"></div>
                <strong>${d.name || 'New Hero'}</strong>
                <div class="char-card-meta">Lv.${d.charLevel || 1} ${d.class || ''}</div>
                <div class="char-realm-tag"><i class="fa-solid fa-globe"></i> ${d.instanceName || 'Global'}</div>
                <button class="btn-danger-small" onclick="deleteCharacter(event, '${doc.id}', '${d.name}')"><i class="fa-solid fa-trash"></i> Delete</button>
            `;
            grid.appendChild(card);
        });
    });
}

function rollDice(sides, btn) {
    const numDisplay = btn.querySelector('.roll-number');
    if (btn.rollInterval) clearInterval(btn.rollInterval);
    if (btn.resetTimeout) clearTimeout(btn.resetTimeout);
    
    btn.classList.add('active-roll');
    
    let rolls = 0;
    btn.rollInterval = setInterval(() => {
        numDisplay.innerText = Math.floor(Math.random() * sides) + 1;
        if (++rolls > 12) {
            clearInterval(btn.rollInterval);
            const finalRoll = Math.floor(Math.random() * sides) + 1;
            numDisplay.innerText = finalRoll;
            
            if (currentCharacterId) {
                const charName = document.getElementById('hud-name').innerText || "Unknown";
                rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push({
                    type: 'roll', name: charName, sides: sides, result: finalRoll, timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
            btn.resetTimeout = setTimeout(() => { btn.classList.remove('active-roll'); }, 3000);
        }
    }, 40);
}



async function editTraitInRegistry(id) {
    const doc = await firestore.collection('master_traits').doc(id).get();
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById('m-trait-id').value = id;
    document.getElementById('reg-trait-name').value = data.name;
    document.getElementById('reg-trait-source').value = data.sourceType;
    document.getElementById('reg-trait-desc').value = data.description;

    document.getElementById('trait-editor-title').innerText = "Editing Trait: " + data.name;
    document.getElementById('trait-cancel-btn').classList.remove('hide-default');
    
    // Scroll to top of the form
    document.getElementById('sub-traits').scrollTop = 0;
}




async function deleteTrait(id) {
    if (!confirm("Are you sure you want to delete this trait from the global library?")) return;
    await firestore.collection('master_traits').doc(id).delete();
    loadTraitLibrary();
}






async function ensureTraitExists(traitName) {
    const slug = traitName.toLowerCase().trim().replace(/\s+/g, '-');
    const traitRef = firestore.collection('master_traits').doc(slug);
    const doc = await traitRef.get();
    if (!doc.exists) {
        await traitRef.set({ name: traitName, description: "Detailed mechanics needed.", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
}
