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
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(id).get().then(doc => {
        if (doc.exists) {
            const d = doc.data();
            document.getElementById('char-name').value = d.name;
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
            updateHUD(d);
            firestore.collection('users').doc(auth.currentUser.uid).update({ lastActiveCharacter: id });
        }
    });
}

function saveCharacter() {
    if (!currentCharacterId) return;
    
    // Collecting ALL values from the sheet
    const data = {
        name: document.getElementById('char-name').value,
        level: parseInt(document.getElementById('char-level').value) || 1,
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
        .update(data).then(() => {
            updateHUD(data); // Immediately refresh the sidebar
        });
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
            // Added the portrait div to match the sidebar style
            card.innerHTML = `
                <div class="portrait-circle-small" style="background-image: url(${d.portrait || ''}); margin: 0 auto 10px;"></div>
                <strong>${d.name}</strong>
            `;
            grid.appendChild(card);
        });
    });
}



// ==========================================
// --- 10. HUD HANDLING ---
// ==========================================

function updateHUD(char) {
    document.getElementById('active-char-hud').classList.remove('hide-default');
    
    // Update Sidebar Text
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent || 0}/${char.hpMax || 0}`;
    document.getElementById('hud-mp-text').innerText = `${char.mpCurrent || 0}/${char.mpMax || 0}`;
    
    // Update Sidebar Modifiers (Formula: (Stat - 10) / 2)
    const calcMod = (val) => {
        const mod = Math.floor(((val || 10) - 10) / 2);
        return mod >= 0 ? `+${mod}` : mod;
    };
    document.getElementById('hud-mod-body').innerText = calcMod(char.body);
    document.getElementById('hud-mod-mind').innerText = calcMod(char.mind);
    document.getElementById('hud-mod-spirit').innerText = calcMod(char.spirit);

    // Update Bars
    const hpPerc = (char.hpCurrent / (char.hpMax || 1)) * 100;
    const mpPerc = (char.mpCurrent / (char.mpMax || 1)) * 100;
    document.getElementById('hud-hp-fill').style.width = hpPerc + "%";
    document.getElementById('hud-mp-fill').style.width = mpPerc + "%";

    // Update Portrait
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
            // Canvas Resizing to 800px
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const max = 800;

            if (width > height) {
                if (width > max) { height *= max / width; width = max; }
            } else {
                if (height > max) { width *= max / height; height = max; }
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            saveImageToNextSlot(compressedBase64);
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
        if (gallery.length >= MAX_SLOTS) {
            alert("Gallery is full! Delete an image to add more.");
            return;
        }
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
