/*  ===================== Version 0.5 ======================================   */

/*  ==========================================================================
    --- Main Section 1. Global Variables -------------------------------------
    ========================================================================== */
        /*  ==========================================================================
            --- Firebase Initializer -------------------------------------------------
            ========================================================================== */
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

        // Rules Related Variables
        const rules = {
            baseExp: 200,
            classExp:100,
            maxGallerySlots: 8,
            maxStats:{
                maxBaseStats: 20,
                maxBaseLevel: 60,
                maxClassLevel: 10,
            },
            
            statMultiplier: 5,

            // 4. Game Rules & Definitions
            definitions: {
                attributes: {}     // replaces attributeDefinitions
            },
        };
        // Users Related Variables
        const users = {
            uid: null,
            role: null,      
            username: null,
            hudDefault: document.getElementById('active-char-hud').innerHTML,

            character: {
                name: null,
                activeId: null,
                tempStats: { body: 0, mind: 0, spirit: 0 },  // pendingStats
                baseStats: { body: 0, mind: 0, spirit: 0 }, // originalStats
                level: 1,          // replaces activeCharLevel
                totalAP: 0,         // totalAP
                traits: [],        // replaces currentRaceTraits
                attributes: {},    // replaces currentRaceAttributes
                classExp: {},
                classLevels:{},
                listener: null     // replaces characterListener
            },

            themeColor: '#8e630c'
        };
        // Instances Related Variables
        const instances = {
            
            campaignId: "global",
            

            clock:{
                totalSeconds: 0,
                multiplier: 1,
                notPaused: false,
                lastTickStamp: Date.now(),
                regenTimer: 0,
                regenSaveCd: 0,
                saveDelay: 0      
            },
        };

/*  ==========================================================================
    --- Main Section 2. User Authentication ----------------------------------
    ==========================================================================  */
    // --- Register User to Firebase -----------------------------------------  //
    function registerUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        const display = document.getElementById('message-display');
        
        const loginTab = document.getElementById('tab-login');
        const setupTab = document.getElementById('tab-username-setup');

        if (!email || !pass) {
            display.textContent = "Email and Password are required!"; 
            display.classList = "dangerColor";               
            return;
        }

        auth.createUserWithEmailAndPassword(email, pass).then((res) => {
            firestore.collection('users').doc(res.user.uid).set({ 
                email: email, 
                role: 'Player',
                username: ""
            });
            display.textContent = "Account Created! Setting up profile...";
            display.classList = "successColor";
            setTimeout(() => {
            loginTab.classList.replace('login-splash-mode', 'hide-default');
            setupTab.classList.replace('hide-default', 'login-splash-mode');
        }, 1500);
        }).catch(err => {
            display.textContent = err.message;
            display.classList= "errorColor" ;
        });

    }
    // Update User Name
    function finalizeProfile() {
        const newUsername = document.getElementById('username-setup-input').value;
        const display = document.getElementById('setup-message-display');

        if (!newUsername) {
            display.textContent = "Please choose a name!";
            return;
        }

        // Update the briefcase and Firestore
        users.username = newUsername;
        
        firestore.collection('users').doc(auth.currentUser.uid).update({
            username: newUsername
        }).then(() => {
            document.getElementById('top-nav').classList.remove('hide-default');
            document.getElementById('app-body').classList.remove('hide-default');

            document.getElementById('user-display-name').innerText = newUsername;
            const setupTab = document.getElementById('tab-username-setup');
            setupTab.classList.replace('login-splash-mode', 'hide-default');

            const destination = localStorage.getItem('activeMainTab') || 'tab-character';
            openTab(destination);

        }).catch(err => {
            console.error("Profile update failed:", err);
        });
    }
    // --- Login User to Firebase --------------------------------------------- //
    function loginUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        const display = document.getElementById('message-display');

        display.className = "";

        // 3. Simple Requirement Check
        if (!email || !pass) {
            display.textContent = "Enter email and password.";
            display.className = "dangerColor";
            return;
        }

        auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            display.textContent = "Welcome back!";
            display.className = "successColor";
        })
        .catch(err => {
            // Replace the alert with your CSS class
            display.textContent = err.message;
            display.className = "dangerColor";
        });
    }
    // --- Logout User to Firebase -------------------------------------------- //
    function logoutUser() { 
        const char = users.character;
        if (char.listener && typeof char.listener === 'function') {
            console.log("Stopping active character listener...");
            char.listener(); 
            char.listener = null; 
        }

        auth.signOut().then(() => {
            console.log("User signed out successfully.");
        }).catch(err => console.error("Logout Error:", err));
    }
/*  ==========================================================================
    --- Main Section 3. Authentication Live Function ------------------------------
    ==========================================================================  */
        auth.onAuthStateChanged((user) => {
            const topNav = document.getElementById('top-nav');
            const appBody = document.getElementById('app-body');
            const loginTab = document.getElementById('tab-login');
            const setupTab = document.getElementById('tab-username-setup');
                        
            if (user) {
                users.uid = user.uid;
                firestore.collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists) {
                        const data = doc.data();

                        if (data.username) {
                        users.role = data.role || 'Player';
                        users.username = data.username;
                        
                        
                        document.getElementById('user-display-name').innerText = data.username;
                        document.getElementById('user-role-label').innerText = data.role;

                        populateDropdown( 'master_races', 'char-race', 'Select Race' );
                        loadUserCharacters();

                        const isMasterOrAbove = (data.role === 'Master' || data.role === 'Admin'); //
                        if (isMasterOrAbove) {
                            document.querySelectorAll('.master-only').forEach(el => el.classList.remove('hide-default'));
                        }

                        if (data.role === 'Admin') {
                            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hide-default'));
                        }

                        let targetTab = localStorage.getItem('activeMainTab') || 'tab-character';
                        if (targetTab === 'tab-login') targetTab = 'tab-character';
                        openTab(targetTab);

                        topNav.classList.remove('hide-default');
                        appBody.classList.remove('hide-default');

                        loginTab.classList.replace('login-splash-mode', 'hide-default');

                        initClockListener();
                        initChatLogListener();
                        initInstanceCharactersListener();
                        const savedId = localStorage.getItem('lastActiveId');
                        if (savedId) {
                            selectCharacter(savedId);
                        }
                    } 
                else {
                    loginTab.classList.replace('login-splash-mode', 'hide-default');
                    setupTab.classList.replace('hide-default', 'login-splash-mode');
                }
            }
        });

            } else {
                // --- LOGGED OUT ---
                users.uid = null;
                users.role = null;
                
                loginTab.classList.replace('hide-default', 'login-splash-mode');

                topNav.classList.add('hide-default');
                appBody.classList.add('hide-default');
                
                openTab('tab-login');
            }
        });  
    /*  ==========================================================================
        --- Section 1. General Use Functions ----------------------------------------
        ==========================================================================  */
            
        /*  ==========================================================================
            --- Section 1-A. Populate Dropdowns --------------------------------------
            ==========================================================================  */
            async function populateDropdown(collectionName, elementId, defaultText) {
                const select = document.getElementById(elementId);
                if (!select) return;

                try {
                    const snap = await firestore.collection(collectionName).orderBy('name').get();
                    let options = [`<option value="">${defaultText}</option>`];

                    snap.forEach(doc => {
                        const d = doc.data();
                        options.push(`<option value="${doc.id}">${d.name}</option>`);
                    });

                    select.innerHTML = options.join('');
                } catch (error) {
                    console.error(`Error syncing ${collectionName}:`, error);
                }
            }
        /*  ==========================================================================
            --- Section 1-B. Dice Roller Helper --------------------------------------
            ==========================================================================  */
            function getRandomDice(sides) {
                return Math.floor(Math.random() * sides) + 1;
            }
        /*  ==========================================================================
            --- Section 1-C. Calculate Level -----------------------------------------
            ==========================================================================  */
            function calculateLvl (exp, type = "base") {
                if ( type === "base" ) {
                    const calculatedLevel = Math.floor(exp / rules.baseExp);
                    let finalLevel = Math.max(1, calculatedLevel);
                    return Math.min(finalLevel,rules.maxStats.maxBaseLevel);
                }else if( type === "class" ) {
                    const calculatedLevel = Math.floor(exp / rules.classExp);
                    let finalLevel = Math.max(1, calculatedLevel);
                    return Math.min(finalLevel,rules.maxStats.maxClassLevel);
                }else return 1;
            }
        /*  ==========================================================================
            --- Section 1-D. Set Text and Value --------------------------------------
            ==========================================================================  */
            function setText(elementId, value) {
                const element = document.getElementById(elementId);
                element.innerText = value;
            }
            function setValue(elementId, value) {
                const element = document.getElementById(elementId);
                element.value = value;
            }
    /*  ==========================================================================
        --- Section 2. Load User Character ---------------------------------------
        ==========================================================================  */
            function loadUserCharacters() {
                if (!users.uid) return;
                firestore.collection('users').doc(users.uid).collection('characters').get().then(snap => {
                    const grid = document.getElementById('char-list-grid');
                    if (!grid) return;
                    grid.innerHTML = "";
                    snap.forEach(doc => {
                        const d = doc.data();
                        const gallery = d.gallery || [];
                        const activeIdx = d.portrait !== undefined ? d.portrait : 0;
                        const displayImg = gallery[activeIdx] || ''; 
                        const card = document.createElement('div');
                        card.className = 'char-card';
                        card.onclick = () => selectCharacter(doc.id);
                        card.innerHTML = `
                            <div class="char-card-portrait" style="background-image: url('${displayImg}');">
                                ${!displayImg ? '<i class="fa-solid fa-user"></i>' : ''}
                            </div>
                            <strong>${d.name || 'New Hero'}</strong>
                            <div class="char-card-meta">Lv.${calculateLvl(d.expCurrent || 0)}</div>
                            <button class="btn-danger-small m-m" onclick="deleteCharacter(event, '${doc.id}', '${d.name}')">Delete</button>
                        `;
                        grid.appendChild(card);
                    });
                });
            }
    /*  ==========================================================================
        --- Section 3. Init Clock Listener ---------------------------------------
        ==========================================================================  */
            function initClockListener() {
                rtdb.ref(`instance_clocks`).off(); 
                rtdb.ref("instance_clocks/" + instances.campaignId).on('value', (snapshot) => {
                    const data = snapshot.val();
                    if (!data) return;

                    // 1. Map Database to Folder
                    instances.clock.notPaused = data.isRunning;
                    instances.clock.multiplier = data.speedMultiplier || 1;
                    
                    const label = document.getElementById('speed-label');
                    if (label) label.innerText = instances.clock.multiplier + "x";

                    let now = Date.now();
                    
                    // 2. Use the database's key (isRunning) to check state
                    if (data.isRunning) {
                        let deltaRealSeconds = (now - data.lastRealWorldSaveTime) / 1000;
                        // Use the new local multiplier for the calculation
                        instances.clock.totalSeconds = (data.totalCustomSeconds || 0) + (deltaRealSeconds * instances.clock.multiplier);
                    } else {
                        instances.clock.totalSeconds = data.totalCustomSeconds || 0;
                    }

                    // 3. Update the pulse marker
                    instances.clock.lastTickStamp = now;
                    
                    updateDisplay();
                });
            }
            /*  ==========================================================================
                --- Section 3-A. Update Clock Display ------------------------------------
                ==========================================================================  */
                function updateDisplay() {
                    const total = instances.clock.totalSeconds;

                    // 2. Use that 'total' for all the math below
                    let h = Math.floor((total / 3600) % 24);
                    let m = Math.floor((total / 60) % 60);
                    let s = Math.floor(total % 60);

                    let totalDays = Math.floor(total / (24 * 60 * 60));
                    let year = Math.floor(totalDays / 360) + 1; 
                    let month = Math.floor((totalDays % 360) / 30) + 1;
                    let day = (totalDays % 30) + 1;

                    if(document.getElementById('date-display')) {
                        document.getElementById('date-display').innerText = `Day ${day}, Month ${month}, Year ${year}`;
                    }
                    
                    if(document.getElementById('time-display')) {
                        document.getElementById('time-display').innerText = 
                            `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    }
                }       
    /*  ==========================================================================
        --- Section 4. Chat Log --------------------------------------------------
        ==========================================================================  */
        /*  ==========================================================================
            --- Section 4-A. Chat Log Listener ---------------------------------------
            ==========================================================================  */
            function initChatLogListener() {
                const log = document.getElementById('chat-log');
                if (log) log.innerHTML = '<div class="chat-log-placeholder">Loading history...</div>';
                
                rtdb.ref(`instance_logs/${instances.campaignId}/chatbox`).off();
                rtdb.ref(`instance_logs/${instances.campaignId}/chatbox`).limitToLast(20).on('child_added', (snapshot) => {
                    renderChatLogEntry(snapshot.val());
                });
            }
        /*  ==========================================================================
            --- Section 4-B. Instance Listener ---------------------------------------
            ==========================================================================  */
            function initInstanceCharactersListener() {
                const selector = document.getElementById('chat-target-select');
                if (!selector) return;

                rtdb.ref(`instance_logs/${instances.campaignId}/present_characters`).on('value', (snapshot) => {
                    selector.innerHTML = '<option value="all">Everyone</option>';
                    snapshot.forEach(child => {
                        const char = child.val();
                        // Don't list yourself
                        if (char.id !== users.character.activeId) {
                            const opt = document.createElement('option');
                            opt.value = char.id;   // The "Target ID"
                            opt.innerText = char.name; // The "Display Name"
                            selector.appendChild(opt);
                        }
                    });
                });
            }
        /*  ==========================================================================
            --- Section 4-C. Render Chat Log -----------------------------------------
            ==========================================================================  */
            function renderChatLogEntry(data) {
                const log = document.getElementById('chat-log');
                if (!log) return;

                let shouldShow = false;
                let isWhisper = false; // We start assuming it's NOT a whisper

                if (!data.target) {
                    shouldShow = true; // Public
                } else {
                    isWhisper = true; 

                    if (data.target === users.character.activeId) {
                        shouldShow = true; // For me
                    } else if (data.name === users.character.name || data.name === users.username) {
                        shouldShow = true; // From me
                    } else if (users.role === 'Master' || users.role === 'Admin') {
                        shouldShow = true; // GM eyes only
                    }
                }

                if (!shouldShow) return;
                
                const placeholder = log.querySelector('.chat-log-placeholder');
                if (placeholder) placeholder.remove();

                const entry = document.createElement('div');
                let classList = 'chat-entry';
                if (data.type === 'gm-chat' || 'gm-roll') {
                    classList += ' gm-type';
                } else if (data.type === 'roll' || data.type === 'initiative') {
                    classList += ' roll-type';
                }
                if (isWhisper) {
                    classList += ' whisper-type';
                }

                entry.className = classList;

                if (data.type === 'gm-chat') {
                    entry.innerHTML = `<span><strong>${data.name}:</strong> ${data.text}</span>`;
                } else if (data.type === 'roll') {
                    entry.innerHTML = `<span class="chat-name">${data.name}</span> rolled a d${data.sides}: <span class="roll-result">${data.result}</span>`;
                } else if (data.type === 'initiative') { 
                    entry.innerHTML = `<span class="chat-name">${data.name}</span> Initiative Roll: <span class="roll-result">${data.result}</span>`;
                } else if (data.type === 'gm-roll') { 
                    entry.innerHTML = `<span><strong>${data.name}:</strong> rolled a d${data.sides}: <span class="roll-result">${data.result}</span>`;
                } else {
                    entry.innerHTML = `<span class="chat-name">${data.name}:</span> <span>${data.text}</span>`;
                }
                
                if (data.isCrit) {
                    entry.classList.add('critical-success');
                }
                const isAtBottom = Math.abs(log.scrollTop) < 10;

                log.prepend(entry);     //prepend or appendChild
                if (log.children.length > 20) log.removeChild(log.lastChild);
                
                
                if (isAtBottom) {
                    log.scrollTop = 0;
                }
            }
        /*  ==========================================================================
            --- Section 4-D. Send Message --------------------------------------------
            ==========================================================================  */
            // -----------------------------------------------------------------------  //
            // --- Enter Key Chat Helper ---------------------------------------------  //
            // -----------------------------------------------------------------------  //
            function handleChatEnter(event) {
                if (event.key === "Enter") sendChatMessage();
            }
            // -----------------------------------------------------------------------  //
            // --- Send Message Function ---------------------------------------------  //
            // -----------------------------------------------------------------------  //
            function sendChatMessage() {
                const targetSelect = document.getElementById('chat-target-select');
                const input = document.getElementById('chat-msg-input');
                const text = input.value.trim();
                if (!text) return;

                let senderName = "Unknown";
                let senderType = "chat"; // Default type

                if (users.character.name) {
                    senderName = users.character.name;
                    senderType = "chat";
                } 
                else if (users.role === 'Admin' || users.role === 'Master') {
                    senderName = users.username || "GM";
                    senderType = "gm-chat";
                } 
                else {
                    return;
                }
                
                let targetId = null; 
                if (targetSelect.value !== 'all') {
                    targetId = targetSelect.value;
                }
                
                rtdb.ref(`instance_logs/${instances.campaignId}/chatbox`).push({
                    type: senderType, 
                    name: senderName,
                    text: text,
                    target: targetId,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                input.value = '';
            }

        /*  ==========================================================================
            --- Section 4-E. Dice Roller ---------------------------------------------
            ==========================================================================  */
            // -----------------------------------------------------------------------  //
            // --- Dice Roller Animation and Roll ------------------------------------  //
            // -----------------------------------------------------------------------  //
            function rollDice(sides, btn, modifier = 0) {
                const numDisplay = btn.querySelector('.roll-number');
                const targetSelect = document.getElementById('chat-target-select');

                if (btn.rollInterval) clearInterval(btn.rollInterval);
                if (btn.resetTimeout) clearTimeout(btn.resetTimeout);
                let rolls = 0; //Resets the Animation
                
                let senderName = "Unknown";
                let senderType = "roll";
                    
                if (users.character.name) {
                    senderName = users.character.name;
                } else if (users.role === 'Admin' || users.role === 'Master') {
                    senderName = users.username || "GM";
                    senderType = "gm-roll";
                }

                let targetId = null; 
                if (targetSelect.value !== 'all') {
                    targetId = targetSelect.value;
                }
                btn.classList.add('active-roll');
                
                // Animation spinning
                btn.rollInterval = setInterval(() => {
                    numDisplay.innerText = getRandomDice(sides);
                    
                    if (++rolls > 12) {
                        clearInterval(btn.rollInterval);
                        const naturalRoll = getRandomDice(sides);
                        const finalTotal = naturalRoll + modifier;
                        
                        const isCrit = (sides === 20 && naturalRoll === 20); // Check for Natural 20

                        numDisplay.innerText = finalTotal;
                        
                        // Database Sync
                        if (users.character.activeId || users.role === 'Master' || users.role === 'Admin') {
                            
                            
                            // Format the result: "21 (18 +3)" or just "18"
                            const sign = modifier >= 0 ? '+' : '';
                            const resultText = modifier !== 0 ? 
                                `${finalTotal} (${naturalRoll} ${sign}${modifier})` : 
                                `${finalTotal}`;

                            rtdb.ref(`instance_logs/${instances.campaignId}/chatbox`).push({
                                type: senderType, 
                                name: senderName, 
                                sides: sides,       // Required to prevent "dundefined" in chat
                                isCrit: isCrit,   // is Crit is true if the dice has 20 sides and naturalRoll is 20
                                result: resultText,
                                target: targetId, 
                                timestamp: firebase.database.ServerValue.TIMESTAMP
                            });
                        }
                            
                        btn.resetTimeout = setTimeout(() => { 
                            btn.classList.remove('active-roll'); 
                        }, 2000);
                    }
                }, 40);
            }
    /*  ==========================================================================
        --- Section 5. Open Tab --------------------------------------------------
        ==========================================================================  */
            function openTab(tabId) {
                document.querySelectorAll('.closed-tab').forEach(tab => {
                    tab.classList.add('hide-default');
                });

                const target = document.getElementById(tabId);
                if (target) {
                    target.classList.remove('hide-default');
                }

                if (tabId !== 'tab-login') {
                    localStorage.setItem('activeMainTab', tabId);
                }
                
                if (tabId === 'tab-control-panel' && (users.role === 'Master' || users.role === 'Admin')) {
                    // Load InstanceList Function
                    // loadInstanceList();
                    
                    let savedSubTab = localStorage.getItem('activeMasterSubTab') || 'sub-instances';
                    if (users.role === 'Master' && savedSubTab === 'sub-accounts') {
                        savedSubTab = 'sub-instances';
                    }
                    //Open SubTab Function
                    // openControlSubTab(null, savedSubTab); 
                }
            }
        /*  ==========================================================================
            --- Section 5-A. Open SubTab ---------------------------------------------
            ==========================================================================  */
            function openControlSubTab(evt, subTabId) {
                localStorage.setItem('activeMasterSubTab', subTabId);

                const contents = document.getElementsByClassName("control-sub-content");
                for (let content of contents) {
                    content.classList.add("hide-default");
                }

                const buttons = document.getElementsByClassName("sub-nav-btn");
                for (let btn of buttons) {
                    btn.classList.remove("active");
                }

                document.getElementById(subTabId).classList.remove("hide-default");
                
                if (evt) {
                    evt.currentTarget.classList.add("active");
                } else {
                    const targetBtn = document.querySelector(`[onclick*="${subTabId}"]`);
                    if (targetBtn) targetBtn.classList.add("active");
                }

                // --- LOADER SWITCHBOARD ---
                if (subTabId === 'sub-instances') loadInstanceList();
                if (subTabId === 'sub-accounts') loadUserList();
                if (subTabId === 'sub-characters') loadGlobalCharacterManager();
                if (subTabId === 'sub-classes') loadMasterClassList(); // This triggers Section 10.2
                if (subTabId === 'sub-races') loadMasterRaceList();    // This triggers Section 10.1
                if (subTabId === 'sub-skills') { refreshSkillClassDropdown(); loadSkillRegistry(); }
                if (subTabId === 'sub-traits') loadMasterTraitList();
                if (subTabId === 'sub-attributes') loadAttributeList();
            }









            
            




            async function selectCharacter(id) {
                if (users.character.listener) users.character.listener(); 
                const allInputs = document.querySelectorAll('#char-sheet-view input');
                allInputs.forEach(input => { if(input.type !== 'file') input.value = ""; });

                users.character.activeId = id;
                const user = auth.currentUser;
                const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(id);

                users.character.listener = charRef.onSnapshot(async (doc) => {
                    if (doc.exists) {
                        const d = doc.data();
                        users.character.name = d.name || "Unselected";

                        if (instances.campaignId !== (d.instanceId || "global")) {
                            instances.campaignId = d.instanceId || "global"; 
                            initClockListener(); initChatLogListener();
                        }
                        setValue('char-name', d.name || "");
                        setValue('char-race', d.race || "");
                        users.character.level = calculateLvl(d.expCurrent || 0);
                        setText('char-level-display', `Lv. ${users.character.level}`);

                        // 1. Get raw data
                        const rawClasses = d.unlockedClasses || {};
                        users.character.classLevels = {}; 

                        Object.keys(rawClasses).forEach(className => {
                            const exp = rawClasses[className].exp || 0;
                            users.character.classLevels[className] = calculateLvl(exp, "class");
                        });
                        renderClassPills();
                                                
                        users.character.baseStats = { body: d.body || 0, mind: d.mind || 0, spirit: d.spirit || 0 };
                        users.character.tempStats = { ...users.character.baseStats };
                        users.character.totalAP = Math.max(0, users.character.level - (users.character.baseStats.body + users.character.baseStats.mind + users.character.baseStats.spirit)); 
                        refreshStatDisplay();

                        
                        renderGallery(d.gallery, d.portrait);
                        // renderSkills(d);

                        const notesEl = document.getElementById('char-notes');
                        if (notesEl && document.activeElement !== notesEl) { notesEl.value = d.notes || ""; }

                        setValue('char-hp-current', Math.floor(d.hpCurrent || 0));
                        setValue('char-mp-current', Math.floor(d.mpCurrent || 0));

                        const nextLevelExp = (users.character.level + 1) * rules.baseExp;
                        // updateHUD({ ...d, charLevel: users.character.level, expMax: nextLevelExp });
                        
                        const selectionView = document.getElementById('char-selection-view');
                        if (selectionView && !selectionView.classList.contains('hide-default')) {
                            selectionView.classList.add('hide-default');
                            document.getElementById('char-sheet-view').classList.remove('hide-default');
                        }
                    }
                });
                localStorage.setItem('lastActiveId', id);

            }
            function goBackToSelection() {
                if (users.character.listener) {
                    users.character.listener();
                    users.character.listener = null;
                }
                localStorage.removeItem('activeCharId');
                users.character.activeId = null;

                document.getElementById('active-char-hud').innerHTML = users.hudDefault;

                document.getElementById('char-selection-view').classList.remove('hide-default');
                document.getElementById('char-sheet-view').classList.add('hide-default');
            }
            

            function renderClassPills() {
                const container = document.getElementById('char-class-list-display');
                if(!container) return;
                container.innerHTML = "";

                const classes = users.character.classLevels; 
                const classNames = Object.keys(classes);

                if (classNames.length === 0) {
                    container.innerHTML = '<span class="text-muted">No classes unlocked</span>';
                } else {
                    classNames.forEach(className => {
                        const pill = document.createElement('span');
                        pill.className = 'join-code-pill';

                        const level = classes[className];
                        pill.innerText = `${className} Lv.${level}`;
                            
                        container.appendChild(pill);
                    });
                }
            }

            function refreshStatDisplay() {
                const currentTotal = users.character.tempStats.body + 
                                    users.character.tempStats.mind + 
                                    users.character.tempStats.spirit;
                                    
                const originalTotal = users.character.baseStats.body + 
                                    users.character.baseStats.mind + 
                                    users.character.baseStats.spirit;

                const remainingAP = users.character.totalAP - (currentTotal - originalTotal);

                setText('display-body', users.character.tempStats.body);
                setText('display-mind', users.character.tempStats.mind);
                setText('display-spirit', users.character.tempStats.spirit);

                setText('char-ap-rem', `AP: ${remainingAP}`);

                const confirmArea = document.getElementById('attr-confirm-area');
                if (confirmArea) {
                    const hasChanges = JSON.stringify(users.character.tempStats) !== JSON.stringify(users.character.baseStats);
                    if (hasChanges) {
                        confirmArea.classList.remove('hide-default');
                    } else {
                        confirmArea.classList.add('hide-default');
                    }
                }
            }

            async function confirmAttributeChanges() {
                const user = auth.currentUser;
                const char = users.character;
                const charId = char.activeId;
                if (!user || !charId) return;

                try {
                    await firestore.collection('users').doc(user.uid)
                        .collection('characters').doc(charId).update({
                            body: char.tempStats.body, mind: char.tempStats.mind, spirit: char.tempStats.spirit
                        });
                    console.log("Attributes updated in Firestore.");
                } catch (e) { 
                    console.error("Update failed:", e); 
                }
            }

            function adjustPendingStat(stat, amount) {
                const char = users.character;
                if (!char.activeId) return;

                const currentVal = char.tempStats[stat];
                const maxVal = rules.maxStats.maxBaseStats;
                
                if (amount > 0 && currentVal >= maxVal) {
                    console.log("Stat cap reached.");
                    return;
                }
                if (amount < 0 && currentVal <= 0) return;

                const currentTotal = char.tempStats.body + char.tempStats.mind + char.tempStats.spirit;
                const originalTotal = char.baseStats.body + char.baseStats.mind + char.baseStats.spirit;
                const remainingAP = char.totalAP - (currentTotal - originalTotal);

                if (amount > 0 && remainingAP < amount) {
                    console.log("Not enough AP.");
                    return; 
                }

                char.tempStats[stat] += amount;
                refreshStatDisplay();
            }



// Needs to be checked
function renderGallery(galleryArray = [], activeIndex = 0) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < rules.maxGallerySlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // Compare the Index (Numbers), not the Strings!
            if (i === activeIndex) {
                slot.classList.add('gallery-active');
            }

            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait(${i})">
                <button class="delete-img-btn" onclick="deleteImage(event, ${i})">×</button>
            `;
        } else {
            slot.className = 'gallery-item empty-slot';
            slot.innerHTML = `<i class="fa-solid fa-plus"></i>`;
            slot.onclick = () => document.getElementById('slot-upload').click();
        }
        container.appendChild(slot);
    }
}


// needs checking
function setActivePortrait(index) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    
    charRef.update({ portrait: index }).then(() => {
        charRef.get().then(doc => {
            const data = doc.data();
            const imgData = data.gallery[index];
            document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
            loadUserCharacters(); 
            renderGallery(data.gallery, index);
        });
    });
}
// NEEDS CHECKING
function deleteImage(event, index) {
    event.stopPropagation();
    if (!confirm("Delete this image?")) return;
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        let activeIdx = doc.data().portrait;

        gallery.splice(index, 1);
        const updateData = { gallery: gallery };

        // Adjust index logic after a deletion
        if (activeIdx === index) {
            // If we deleted the active one, default to the first image or nothing
            updateData.portrait = gallery.length > 0 ? 0 : -1;
        } else if (index < activeIdx) {
            // If we deleted an image BEFORE the active one, shift the index down
            updateData.portrait = activeIdx - 1;
        }

        charRef.update(updateData).then(() => {
            const finalIdx = updateData.portrait !== undefined ? updateData.portrait : activeIdx;
            const finalImg = gallery[finalIdx] || '';
            
            renderGallery(gallery, finalIdx);
            document.getElementById('hud-portrait').style.backgroundImage = `url(${finalImg})`;
            loadUserCharacters();
        });
    });
}



















    /*  ==========================================================================
        --- Section X. Instance Management ---------------------------------------
        ==========================================================================  */
        function enterInstance(charId, charName) {
            const path = `instance_logs/${instances.campaignId}/present_characters/${charId}`;
            const presenceRef = rtdb.ref(path);

            presenceRef.set({
                name: charName,
                id: charId,
                uid: users.uid 
            });

            // Cleanup if they leave/close tab
            presenceRef.onDisconnect().remove();
        }
        



        //simple clear chat funtion
        function clearInstanceLog(targetId = 'global') {
            // 1. Safety Check: If no ID is provided, don't guess.
            if (!targetId) {
                console.error("Clear failed: No Campaign ID provided.");
                return;
            }

            // 2. The Confirmation: A simple browser pop-up to prevent accidents.
            const confirmClear = confirm(`Are you sure you want to PERMANENTLY delete all logs for [${targetId}]?`);
            
            if (confirmClear) {
                // 3. The Eraser: Set the entire folder to null
                rtdb.ref(`instance_logs/${targetId}`).set(null)
                    .then(() => {
                        console.log(`Logs for ${targetId} have been cleared.`);
                        alert("Logs wiped successfully.");
                    })
                    .catch((error) => {
                        console.error("Error clearing logs:", error);
                    });
            }
        }

        // // This is a placeholder. 
        // function selectCharacter(charId) {
        //     // It exists so the app doesn't crash when a character is clicked.
        //     console.log("selectCharacter triggered for ID:", charId);
        // }