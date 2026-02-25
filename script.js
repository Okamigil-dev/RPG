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
    const data = {
        name: document.getElementById('char-name').value,
        body: parseInt(document.getElementById('char-body').value) || 10
    };
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update(data).then(() => updateHUD(data));
}

function goBackToSelection() {
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
}

// Convert file to Base64 string
function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64String = e.target.result;
        saveImageToGallery(base64String);
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

function renderGallery(gallery, activePortrait) {
    const container = document.getElementById('char-gallery-grid');
    container.innerHTML = "";
    gallery.forEach((img) => {
        const wrapper = document.createElement('div');
        wrapper.className = `gallery-item ${img === activePortrait ? 'active-img' : ''}`;
        wrapper.innerHTML = `<img src="${img}" onclick="setActivePortrait('${img}')">`;
        container.appendChild(wrapper);
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
    document.getElementById('hud-name').innerText = char.name;
    document.getElementById('hud-portrait').style.backgroundImage = `url(${char.portrait || ''})`;
    document.getElementById('hud-hp-fill').style.width = (char.hpCurrent / char.hpMax * 100) + "%";
    
    if (char.gallery) renderGallery(char.gallery, char.portrait);
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
