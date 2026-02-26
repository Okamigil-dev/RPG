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
    rtdb.ref(`campaigns/${currentCampaignId}/clock`).set(timeData);
}

rtdb.ref(`campaigns/${currentCampaignId}/clock`).on('value', (snapshot) => {
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

function toggleTime() { isRunning = !isRunning; saveTimeState(); }
function setSpeed(s) { speedMultiplier = s; saveTimeState(); }



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
                }
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
function rollDice(sides) {
    const res = document.getElementById('dice-result');
    let c = 0;
    const i = setInterval(() => {
        res.innerText = Math.floor(Math.random() * sides) + 1;
        if (++c > 10) {
            clearInterval(i);
            res.innerText = `d${sides}: ${Math.floor(Math.random() * sides) + 1}`;
        }
    }, 50);
}



// ==========================================
// --- 12. GALLERY MANAGEMENT ---
// ==========================================

// Convert file to Base64 string
function handleImageUpload(input) {
    const file = input.files[0];
    if (!file || !currentCharacterId) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64String = e.target.result;
        const user = auth.currentUser;
        const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

        charRef.get().then(doc => {
            let gallery = doc.data().gallery || [];
            gallery.push(base64String);
            const updateData = { gallery: gallery };
            if (!doc.data().portrait) updateData.portrait = base64String;
            
            charRef.update(updateData).then(() => renderGallery(gallery, doc.data().portrait || base64String));
        });
    };
    reader.readAsDataURL(file);
}

function saveImageToGallery(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        gallery.push(base64Data);
        // If it's the first image, make it the portrait
        const updateData = { gallery: gallery };
        if (!doc.data().portrait) updateData.portrait = base64Data;
        
        charRef.update(updateData).then(() => renderGallery(gallery, doc.data().portrait));
    });
}

const MAX_SLOTS = 10;

function renderGallery(galleryArray, activePortrait) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < MAX_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // Occupied Slot
            const isActive = images[i] === activePortrait;
            if (isActive) slot.classList.add('active-img');
            
            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait('${images[i]}')">
                <button class="delete-img-btn" onclick="deleteImage(event, ${i})">×</button>
            `;
        } else {
            // Empty Slot
            slot.className = 'gallery-item empty-slot';
            slot.innerHTML = `<i class="fa-solid fa-plus"></i>`;
            slot.onclick = () => document.getElementById('slot-upload').click();
        }
        container.appendChild(slot);
    }
}

function handleSlotUpload(input) {
    const file = input.files[0];
    if (!file || !currentCharacterId) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resize to 800px max for Firestore Free Tier safety
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

function saveImageToNextSlot(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        if (gallery.length >= 10) return alert("Gallery Full!");
        gallery.push(base64Data);
        
        const updateData = { gallery: gallery };
        if (!doc.data().portrait) updateData.portrait = base64Data;
        
        charRef.update(updateData).then(() => renderGallery(gallery, doc.data().portrait || base64Data));
    });
}

function setActivePortrait(imgData) {
    const user = auth.currentUser;
    firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId)
        .update({ portrait: imgData }).then(() => {
            document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
            loadUserCharacters(); // Refresh the selection grid
        });
}

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
        if (doc.data().portrait === deletedImg) {
            updateData.portrait = gallery.length > 0 ? gallery[0] : "";
        }

        charRef.update(updateData).then(() => renderGallery(gallery, updateData.portrait));
    });
}



/* ==========================================
   --- 13. MASTER CONTROL LOGIC ---
   ========================================== */

/**
 * Handles switching between sub-tabs within the Master Control Panel
 */
function openControlSubTab(evt, subId) {
    // 1. Hide all sub-content blocks
    const subContents = document.getElementsByClassName("control-sub-content");
    for (let i = 0; i < subContents.length; i++) {
        subContents[i].classList.add("hide-default");
    }

    // 2. Remove 'active' class from all sub-nav buttons
    const subButtons = document.getElementsByClassName("sub-nav-btn");
    for (let i = 0; i < subButtons.length; i++) {
        subButtons[i].classList.remove("active");
    }

    // 3. Show the target sub-content
    const targetSub = document.getElementById(subId);
    if (targetSub) {
        targetSub.classList.remove("hide-default");
    }

    // 4. Set clicked button to active
    evt.currentTarget.classList.add("active");
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
            const groupsBtn = document.querySelector('[onclick*="sub-groups"]');
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
        listContainer.innerHTML = ""; // Clear loader

        snapshot.forEach(doc => {
            const user = doc.data();
            const row = document.createElement('div');
            
            // Basic styling for the row
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1fr 1fr';
            row.style.padding = '12px 10px';
            row.style.borderBottom = '1px solid #18181b';
            row.style.alignItems = 'center';

            // Define a safe role string to use in both the display and the function call
            const displayRole = user.role || 'Player';
            
            row.innerHTML = `
                <span style="font-size: 0.85rem; color: #e4e4e7;">${user.email || 'Anonymous'}</span>
                <span class="role-badge" style="color: ${displayRole === 'Admin' ? '#00ff88' : '#3b82f6'}; font-size: 0.7rem; font-weight: bold;">${displayRole}</span>
                <div style="text-align: right;">
                    <button onclick="changeUserRole('${doc.id}', '${displayRole}')" class="btn-small">Edit</button>
                </div>
            `;
            listContainer.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading user list:", error);
        listContainer.innerHTML = '<p style="color: #ef4444;">Error: Check Firestore Permissions</p>';
    }
}

/**
 * Changes a user's role in Firestore
 * @param {string} userId - The document ID of the user
 * @param {string} currentRole - The role they currently have
 */
async function changeUserRole(userId, currentRole) {
    // 1. Ask for the new role via a simple prompt
    const newRole = prompt(`Current Role: ${currentRole}\nEnter new role (Player, Master, or Admin):`, currentRole);

    // 2. If the user cancelled or didn't type anything, stop
    if (newRole === null || newRole === "") return;

    // 3. Validate the input to prevent typos
    const validRoles = ['Player', 'Master', 'Admin'];
    if (!validRoles.includes(newRole)) {
        alert("Invalid role! Please use: Player, Master, or Admin (Case Sensitive).");
        return;
    }

    try {
        // 4. Update the document in Firestore
        await firestore.collection('users').doc(userId).update({
            role: newRole
        });

        alert("User role updated successfully!");
        
        // 5. Refresh the list to show the change
        loadUserList();
    } catch (error) {
        console.error("Error updating role:", error);
        alert("Failed to update role. Check console for details.");
    }
}

