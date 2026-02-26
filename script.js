// ==========================================
// --- 1. STATE VARIABLES & DEFAULTS ---
// ==========================================

let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let currentCampaignId = "global"; 
let currentCharacterId = null; 



// ==========================================
// --- 2. FIREBASE SETUP & INITIALIZATION ---
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCdwo2sWiMzLfnZ8o3oYkDYL45FuLiV4OI",
    authDomain: "virtual-tabletop-6cdab.firebaseapp.com",
    databaseURL: "https://virtual-tabletop-6cdab-default-rtdb.firebaseio.com",
    projectId: "virtual-tabletop-6cdab",
    storageBucket: "virtual-tabletop-6cdab.firebasestorage.app",
    messagingSenderId: "360507498207",
    appId: "1:360507498207:web:a2924052c05aba488b536a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rtdb = firebase.database();       
const firestore = firebase.firestore(); 



// ==========================================
// --- 3. DATABASE SYNC (RTDB) ---
// ==========================================

function saveTimeState() {
    const timeData = {
        totalCustomSeconds: totalCustomSeconds,
        speedMultiplier: speedMultiplier,
        isRunning: isRunning,
        lastRealWorldSaveTime: Date.now()
    };
    rtdb.ref(`instance_clocks/${currentCampaignId}`).set(timeData);
}

rtdb.ref(`instance_clocks/${currentCampaignId}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        speedMultiplier = data.speedMultiplier;
        isRunning = data.isRunning;
        let now = Date.now();
        if (data.isRunning) {
            let deltaRealSeconds = (now - data.lastRealWorldSaveTime) / 1000;
            // FIX: Changed data.totalSeconds to data.totalCustomSeconds
            totalCustomSeconds = (data.totalCustomSeconds || 0) + (deltaRealSeconds * speedMultiplier);
        } else {
            // FIX: Changed data.totalSeconds to data.totalCustomSeconds
            totalCustomSeconds = data.totalCustomSeconds || 0;
        }
        lastRealTime = now;
        updateDisplay();
    }
});



// ==========================================
// --- 4. CLOCK ENGINE & DISPLAY ---
// ==========================================

function tick() {
    let now = Date.now();
    let deltaRealSeconds = (now - lastRealTime) / 1000;
    lastRealTime = now;
    if (isRunning) {
        totalCustomSeconds += (deltaRealSeconds * speedMultiplier);
        updateDisplay();
    }
}
function updateDisplay() {
    let tDays = Math.floor(totalCustomSeconds / 86400);
    let h = Math.floor((totalCustomSeconds / 3600) % 24);
    let m = Math.floor((totalCustomSeconds / 60) % 60);
    let s = Math.floor(totalCustomSeconds % 60);
    if(document.getElementById('time-display')) {
        document.getElementById('time-display').innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
}
setInterval(tick, 100);



// ==========================================
// --- 5. CLOCK CONTROLS (ADMIN ONLY) ---
// ==========================================

function toggleTime() { 
    isRunning = !isRunning; 
    saveTimeState(); 
    
    // Update sidebar icon
    const btn = document.getElementById('sidebar-play-btn');
    if (btn) {
        btn.innerHTML = isRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
}
function setSpeed(multiplier) {
    const role = window.currentUserRole;

    // 1. Security Check
    if (role !== 'Master' && role !== 'Admin') return;

    // 2. Admin-only speed check
    if (multiplier >= 100 && role !== 'Admin') {
        alert("Only the Admin can use 'Time Warp' speeds.");
        return;
    }

    // 3. Update local state
    speedMultiplier = multiplier;

    // 4. Update the UI Label
    const label = document.getElementById('speed-label');
    if (label) label.innerText = multiplier + "x";

    // 5. IMPORTANT: Push this change to the Database!
    saveTimeState(); 

    console.log(`System: Clock speed set to ${multiplier}x`);
}



// ==========================================
// --- 6. AUTHENTICATION & ROLES ---
// ==========================================
function registerUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.createUserWithEmailAndPassword(email, pass).then((res) => {
        firestore.collection('users').doc(res.user.uid).set({ email: email, role: 'Player' });
    }).catch(err => alert(err.message));
}
function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
}
function logoutUser() { auth.signOut().then(() => location.reload()); }



// ==========================================
// --- 7. USER AUTHENTICATION ---
// ==========================================

auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('main-nav-tabs').classList.remove('hide-default');
        document.getElementById('logout-btn').classList.remove('hide-default');
        document.getElementById('game-ui').classList.remove('hide-default');
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];

        firestore.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();

                window.currentUserRole = data.role || 'Player';
                
                document.getElementById('user-role-label').innerText = data.role;
                if (data.role === 'Master' || data.role === 'Admin') {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                    document.getElementById('master-quick-controls').classList.remove('hide-default'); // Show sidebar controls
                }
                // we start listening to the instance dice log.
                initDiceLogListener();
                
                if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
            }
        });
        loadUserCharacters();
        openTab('tab-character');
    } else {
    // Clear the role to prevent state bleed
    window.currentUserRole = null; 
    openTab('tab-login');
    
}
});



// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================

function openTab(tabId) {
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.add('hide-default');
    });
    
    const target = document.getElementById(tabId);
    if (target) {
        target.style.display = 'block';
        target.classList.remove('hide-default');
    }
    if (tabId === 'tab-control-panel') {
        openMasterPanel();
    }
}




// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================

function createNewCharacter() {
    const user = auth.currentUser;
    const data = { name: "New Hero", body: 10, mind: 10, spirit: 10, hpCurrent: 10, hpMax: 10 };
    firestore.collection('users').doc(user.uid).collection('characters').add(data).then(() => loadUserCharacters());
}

function loadUserCharacters() {
    const user = auth.currentUser;
    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        grid.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `<strong>${d.name}</strong>`;
            grid.appendChild(card);
        });
    });
}

function selectCharacter(id) {
    currentCharacterId = id;
    const user = auth.currentUser;
    
    firestore.collection('users').doc(user.uid).collection('characters').doc(id).get().then(doc => {
        if (doc.exists) {
            const d = doc.data();
            
            // 1. Define Elements
            const raceEl = document.getElementById('char-race');
            const classEl = document.getElementById('char-class');

            // 2. Set Values
            document.getElementById('char-name').value = d.name || "";
            document.getElementById('char-level').value = d.level || 1;
            raceEl.value = d.race || "";
            classEl.value = d.class || "";
            
            // 3. Locking Logic (Master/Admin Bypass)
            const isMaster = (window.currentUserRole === 'Master' || window.currentUserRole === 'Admin');
            raceEl.disabled = (d.race && !isMaster);
            classEl.disabled = (d.class && !isMaster);
            
            // 4. EXP Fields
            document.getElementById('char-exp-current').value = d.expCurrent || 0;
            document.getElementById('char-exp-max').value = d.expMax || 1000;

            // 5. Stats & Resources
            document.getElementById('char-body').value = d.body || 10;
            document.getElementById('char-mind').value = d.mind || 10;
            document.getElementById('char-spirit').value = d.spirit || 10;
            document.getElementById('char-hp-current').value = d.hpCurrent || 0;
            document.getElementById('char-hp-max').value = d.hpMax || 0;
            document.getElementById('char-mp-current').value = d.mpCurrent || 0;
            document.getElementById('char-mp-max').value = d.mpMax || 0;

            // 6. Navigation & UI Updates
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
            
            updateHUD(d);
            if (d.gallery) renderGallery(d.gallery, d.portrait);
            
            // 7. Persistence
            firestore.collection('users').doc(user.uid).update({ lastActiveCharacter: id });
        }
    });
}

function saveCharacter() {
    if (!currentCharacterId) return;
    
    const data = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,   // Added
        class: document.getElementById('char-class').value, // Added
        level: parseInt(document.getElementById('char-level').value) || 1,
        expCurrent: parseInt(document.getElementById('char-exp-current').value) || 0, // Added
        expMax: parseInt(document.getElementById('char-exp-max').value) || 1000,    // Added
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 0,
        mpCurrent: parseInt(document.getElementById('char-mp-current').value) || 0,
        mpMax: parseInt(document.getElementById('char-mp-max').value) || 0
    };

    firestore.collection('users').doc(auth.currentUser.uid)
        .collection('characters').doc(currentCharacterId)
        .update(data).then(() => updateHUD(data));
}

function goBackToSelection() {
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
}

// Update loadUserCharacters to show the image in the selection grid
function loadUserCharacters() {
    const user = auth.currentUser;
    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        grid.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="portrait-circle-small" style="background-image: url(${d.portrait || ''}); margin: 0 auto 10px;"></div>
                <strong>${d.name}</strong>
            `;
            grid.appendChild(card);
        });
    });
}



/* ==========================================
   --- 10. HUD HANDLING ---
   ========================================== */
function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!hud) return;
    hud.classList.remove('hide-default');
    
    // 1. Names and Metadata (Race & Class)
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    const raceClassText = `Lv. ${char.level || 1} ${char.race || ''} ${char.class || 'Adventurer'}`;
    document.getElementById('hud-meta').innerText = raceClassText;
    
    // 2. Text Resources
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent || 0}/${char.hpMax || 0}`;
    document.getElementById('hud-mp-text').innerText = `${char.mpCurrent || 0}/${char.mpMax || 0}`;
    
    // 3. Modifier Calculation
    const getMod = (val) => {
        const mod = Math.floor(((val || 10) - 10) / 2);
        return mod >= 0 ? `+${mod}` : mod;
    };
    
    document.getElementById('hud-mod-body').innerText = getMod(char.body);
    document.getElementById('hud-mod-mind').innerText = getMod(char.mind);
    document.getElementById('hud-mod-spirit').innerText = getMod(char.spirit);

    // 4. Progress Bars (HP, MP, and EXP)
    // We use .style.width here because the percentage is dynamic data
    const hpPerc = Math.min((char.hpCurrent / (char.hpMax || 1)) * 100, 100);
    const mpPerc = Math.min((char.mpCurrent / (char.mpMax || 1)) * 100, 100);
    const expPerc = Math.min((char.expCurrent / (char.expMax || 1000)) * 100, 100);

    document.getElementById('hud-hp-fill').style.width = hpPerc + "%";
    document.getElementById('hud-mp-fill').style.width = mpPerc + "%";
    
    const expFill = document.getElementById('hud-exp-fill');
    if (expFill) {
        expFill.style.width = expPerc + "%";
    }

    // 5. Portrait
    if (char.portrait) {
        document.getElementById('hud-portrait').style.backgroundImage = `url(${char.portrait})`;
    }
}



// ==========================================
// --- 11. DICE ROLLER ---
// ==========================================
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
            
            // --- HYBRID PUSH TO RTDB ---
            // We get the name from the HUD so it's the "Active Character"
            const charName = document.getElementById('hud-name').innerText || "Unknown";
            
            const rollData = {
                name: charName,
                sides: sides,
                result: finalRoll,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            // Push to the shared instance log
            rtdb.ref(`instance_logs/${currentCampaignId}/dice`).push(rollData);
            
            btn.resetTimeout = setTimeout(() => {
                btn.classList.remove('active-roll');
            }, 3000);
        }
    }, 40);
}

// This function now listens to the DB instead of being called manually
function initDiceLogListener() {
    // Turn off old listeners if switching instances
    rtdb.ref(`instance_logs/${currentCampaignId}/dice`).off();

    // Only show the last 10 rolls to keep the sidebar clean
    rtdb.ref(`instance_logs/${currentCampaignId}/dice`).limitToLast(10).on('child_added', (snapshot) => {
        const data = snapshot.val();
        renderDiceLogEntry(data);
    });
}

function renderDiceLogEntry(data) {
    const log = document.getElementById('dice-log');
    if (!log) return;

    const placeholder = log.querySelector('.dice-log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    entry.className = 'dice-log-entry';
    entry.innerHTML = `
        <span class="dice-log-label">${data.name} (d${data.sides})</span>
        <span class="dice-log-value">${data.result}</span>
    `;
    
    log.prepend(entry); // Newest rolls at the top
    
    if (log.children.length > 10) {
        log.removeChild(log.lastChild);
    }
}



/* ==========================================
   --- 12. GALLERY MANAGEMENT ---
   ========================================== */
const MAX_SLOTS = 10;

// 1. Triggered when you click an empty [+] slot
function handleSlotUpload(input) {
    const file = input.files[0];
    if (!file || !currentCharacterId) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resize to 800px max for Firestore safety
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height, max = 800;
            if (w > h) { if (w > max) { h *= max / w; w = max; } } 
            else { if (h > max) { w *= max / h; h = max; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            
            saveImageToNextSlot(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 2. Saves the resized image string to Firestore
function saveImageToNextSlot(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        if (gallery.length >= MAX_SLOTS) return alert("Gallery Full!");
        
        gallery.push(base64Data);
        const updateData = { gallery: gallery };
        
        // If this is the first image ever, make it the portrait
        if (!doc.data().portrait) updateData.portrait = base64Data;
        
        charRef.update(updateData).then(() => {
            // RE-RENDER: This puts the new image on the screen
            renderGallery(gallery, doc.data().portrait || base64Data);
            
            // If we just set a new portrait, update the HUD too
            if (updateData.portrait) {
                document.getElementById('hud-portrait').style.backgroundImage = `url(${base64Data})`;
            }
        });
    });
}

// 3. DRAWING THE GRID (THE ESSENTIAL PART)
function renderGallery(galleryArray, activePortrait) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < MAX_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // OCCUPIED SLOT: Show the image
            const isActive = images[i] === activePortrait;
            if (isActive) slot.classList.add('active-img');
            
            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait('${images[i]}')">
                <button class="delete-img-btn" onclick="deleteImage(event, ${i})">×</button>
            `;
        } else {
            // EMPTY SLOT: Show the [+] button
            slot.className = 'gallery-item empty-slot';
            slot.innerHTML = `<i class="fa-solid fa-plus"></i>`;
            slot.onclick = () => document.getElementById('slot-upload').click();
        }
        container.appendChild(slot);
    }
}

// 4. Sets which image appears in the HUD and Selection Grid
function setActivePortrait(imgData) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    
    charRef.update({ portrait: imgData }).then(() => {
        // Update HUD instantly
        document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
        loadUserCharacters(); // Update the tiny circle in selection grid
        
        // Re-render gallery to move the "active" green border
        charRef.get().then(doc => renderGallery(doc.data().gallery, imgData));
    });
}

// 5. Removes image and handles portrait fallback
function deleteImage(event, index) {
    event.stopPropagation();
    if (!confirm("Delete this image?")) return;

    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        const deletedImg = gallery[index];
        gallery.splice(index, 1);

        const updateData = { gallery: gallery };
        
        // If we deleted the one they were using as a portrait, pick the first available one
        if (doc.data().portrait === deletedImg) {
            updateData.portrait = gallery.length > 0 ? gallery[0] : "";
        }

        charRef.update(updateData).then(() => {
            renderGallery(gallery, updateData.portrait);
            // Sync HUD and Selection view
            document.getElementById('hud-portrait').style.backgroundImage = `url(${updateData.portrait || ''})`;
            loadUserCharacters();
        });
    });
}



/* ==========================================
   --- 13. MASTER CONTROL LOGIC ---
   ========================================== */

/**
 * Handles switching between sub-tabs within the Master Control Panel
 */
function openControlSubTab(evt, subTabId) {
    // 1. Hide all sub-content
    const contents = document.getElementsByClassName("control-sub-content");
    for (let content of contents) {
        content.classList.add("hide-default");
    }

    // 2. Remove 'active' class from all buttons
    const buttons = document.getElementsByClassName("sub-nav-btn");
    for (let btn of buttons) {
        btn.classList.remove("active");
    }

    // 3. Show the target tab and mark button as active
    document.getElementById(subTabId).classList.remove("hide-default");
    evt.currentTarget.classList.add("active");

    // 4. If opening instances or accounts, refresh the lists
    if (subTabId === 'sub-instances') loadInstanceList();
    if (subTabId === 'sub-accounts') loadUserList();
}

/**
 * Enhanced Speed Control with Role-Based Permissions
 */
function setSpeed(multiplier) {
    const role = window.currentUserRole;

    // Security Check: Must be Master or Admin
    if (role !== 'Master' && role !== 'Admin') {
        console.error("Unauthorized: Role insufficient for speed control.");
        return;
    }

    // Rule: Only Admin can access 100x speed
    if (multiplier >= 100 && role !== 'Admin') {
        alert("Only the Admin can use 'Time Warp' speeds (100x+).");
        return;
    }

    // Update the visual speed label in the Master Panel
    const label = document.getElementById('speed-label');
    if (label) label.innerText = multiplier + "x";

    // --- YOUR EXISTING CLOCK LOGIC HERE ---
    // Example: updateGlobalClockSpeed(multiplier);
    console.log(`System: Clock speed set to ${multiplier}x by ${role}`);
}

function openMasterPanel() {
    const role = window.currentUserRole;

    // 1. Security check - if somehow a Player gets here, kick them out
    if (role !== 'Master' && role !== 'Admin') {
        alert("Access Denied: Specialized clearance required.");
        openTab('tab-character'); // Redirect back to character sheet
        return;
    }

    // 2. Handle Admin-Only visibility for Account Management
    const accountBtn = document.querySelector('[onclick*="sub-accounts"]');
    
    if (accountBtn) {
        if (role === 'Admin') {
            accountBtn.style.display = 'block';
            loadUserList(); // Only Admins fetch the user database
        } else {
            accountBtn.style.display = 'none';
            
            // If a Master opens the panel, move them to the first tab they ARE allowed to see
            const groupsBtn = document.querySelector('[onclick*="sub-instances"]');
            if (groupsBtn) {
                groupsBtn.click(); 
            }
        }
    }
}

/**
 * Fetches all users from Firestore and displays them in the Admin panel
 */
async function loadUserList() {
    const listContainer = document.getElementById('admin-user-list');
    listContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Fetching database...</p>';

    try {
        const snapshot = await firestore.collection('users').get();
        listContainer.innerHTML = ""; 

        snapshot.forEach(doc => {
            const user = doc.data();
            const row = document.createElement('div');
            const displayRole = user.role || 'Player';
            
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1fr';
            row.style.padding = '12px 10px';
            row.style.borderBottom = '1px solid #18181b';
            row.style.alignItems = 'center';

            // Use data-userid to identify this row later
            row.innerHTML = `
                <span style="font-size: 0.85rem; color: #e4e4e7;">${user.email || 'Anonymous'}</span>
                <select class="role-selector form-input" data-userid="${doc.id}" style="padding: 5px; font-size: 0.8rem;">
                    <option value="Player" ${displayRole === 'Player' ? 'selected' : ''}>Player</option>
                    <option value="Master" ${displayRole === 'Master' ? 'selected' : ''}>Master</option>
                    <option value="Admin" ${displayRole === 'Admin' ? 'selected' : ''}>Admin</option>
                </select>
            `;
            listContainer.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading user list:", error);
        listContainer.innerHTML = '<p style="color: #ef4444;">Error fetching users.</p>';
    }
}

/**
 * Collects all dropdown values and saves them to Firestore in a single batch
 */
async function saveAllUserRoles() {
    const selectors = document.querySelectorAll('.role-selector');
    const batch = firestore.batch(); 
    let changesCount = 0;

    selectors.forEach(select => {
        const userId = select.getAttribute('data-userid');
        const newRole = select.value;
        
        const userRef = firestore.collection('users').doc(userId);
        batch.update(userRef, { role: newRole });
        changesCount++;
    });

    try {
        await batch.commit(); 
        alert(`Successfully updated ${changesCount} accounts!`);
        loadUserList(); // Refresh the UI
    } catch (error) {
        console.error("Error saving roles:", error);
        alert("Failed to save changes. You might not have Admin permissions in Firestore Rules.");
    }
}


/**
 * Loads all instances where the current user is a Master
 */
async function loadInstanceList() {
    const listContainer = document.getElementById('admin-instance-list');
    const currentUser = firebase.auth().currentUser;

    if (!listContainer || !currentUser) return;

    try {
        // Fetch instances where the current user's UID is in the masters array
        const snapshot = await firestore.collection('instances')
            .where('masters', 'array-contains', currentUser.uid)
            .get();

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="text-center" style="opacity: 0.5; padding: 20px;">No active instances found.</p>`;
            return;
        }

        html += `
            <tr>
                <td><strong>${data.name}</strong></td>
                <td><code class="join-code-pill">${data.joinCode}</code></td>
                <td>${data.masters ? data.masters.length : 1}</td>
                <td>
                    <div class="flex-row" style="gap: 5px;">
                        <button class="btn-small" onclick="viewInstanceDetails('${id}')">Manage</button>
                        <button class="btn-danger-small" onclick="deleteInstance('${id}', '${data.name}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;

        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            html += `
                <tr>
                    <td><strong>${data.name}</strong></td>
                    <td><code style="background: #27272a; padding: 2px 6px; border-radius: 4px; color: #00ff88;">${data.joinCode}</code></td>
                    <td>${data.masters ? data.masters.length : 1}</td>
                    <td>
                        <button class="btn-small" onclick="viewInstanceDetails('${id}')">Manage</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        listContainer.innerHTML = html;

    } catch (error) {
        console.error("Error loading instances:", error);
        listContainer.innerHTML = `<p class="text-center" style="color: #ef4444;">Error loading registry.</p>`;
    }
}

async function spawnInstance() {
    const nameInput = document.getElementById('new-instance-name');
    const instanceName = nameInput.value.trim();
    const currentUser = auth.currentUser;

    if (!instanceName) return alert("Please name your instance!");

    try {
        // 1. Create the Instance Record in Firestore
        const instanceRef = await firestore.collection('instances').add({
            name: instanceName,
            masters: [currentUser.uid],
            members: [currentUser.uid],
            joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true
        });

        const instanceId = instanceRef.id;

        // 2. Initialize the Clock "Heartbeat" in RTDB
        await rtdb.ref(`instance_clocks/${instanceId}`).set({
            totalCustomSeconds: 32400, // 09:00 AM
            speedMultiplier: 1,
            isRunning: false,
            lastRealWorldSaveTime: Date.now()
        });

        nameInput.value = "";
        alert(`Instance spawned!`);
        loadInstanceList(); 

    } catch (error) {
        console.error("Spawn Error:", error);
    }
}

function viewInstanceDetails(instanceId) {
    // For now, we just alert the ID. 
    // Later, this will open a detailed view to kick players or change the clock.
    alert("Managing Instance: " + instanceId);
}

/**
 * Deletes an instance from both Firestore and Realtime Database
 */
async function deleteInstance(instanceId, name) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"? This cannot be undone.`)) return;

    try {
        // 1. Remove from Firestore (Permissions & Metadata)
        await firestore.collection('instances').doc(instanceId).delete();

        // 2. Remove from RTDB (The Live Clock)
        await rtdb.ref(`instance_clocks/${instanceId}`).remove();

        alert("Instance deleted successfully.");
        loadInstanceList(); // Refresh the table
    } catch (error) {
        console.error("Delete Error:", error);
        alert("Failed to delete instance. Check console.");
    }
}
