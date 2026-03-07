/*  ===================== Version 0.5 ======================================   */



/*  ==========================================================================
    --- Main Section 1: Global Variables -------------------------------------
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

        // Max Stats Const
        const rules = {
            maxStats:{
                maxBaseLevel: 60,
                maxClassLevel: 10,
                maxGallerySlots: 8,
            },
            
            statMultiplier: 5,

            // 4. Game Rules & Definitions
            definitions: {
                attributes: {}     // replaces attributeDefinitions
            },
        };

        const users = {
            // User Related Variables
            role: null,      

            character: {
                activeId: null,
                level: 1,          // replaces activeCharLevel
                traits: [],        // replaces currentRaceTraits
                attributes: {},    // replaces currentRaceAttributes
                listener: null     // replaces characterListener
            },

            themeColor: '#8e630c'
    };

    const instances = {
        
        campaignId: "global",
        
        // Clock Related Variables
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

    
    // dont know what these are for yet
    // let pendingStats = { body: 0, mind: 0, spirit: 0 };
    // let originalStats = { body: 0, mind: 0, spirit: 0 };
    // let totalAP = 0;

/*  ==========================================================================
    --- Main Section 2: User Authentication ----------------------------------
    ========================================================================== */
    function registerUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        const username = document.getElementById('username-input').value;
        
        const display = document.getElementById('message-display');

        if (!email || !pass || !username) {
            display.textContent = "All fields are required!"; // Write to the page
            display.classList.add("dangerColor");               // Make it visible/clear
            return; // STOP the function here so it doesn't talk to Firebase
        }

        auth.createUserWithEmailAndPassword(email, pass).then((res) => {
            firestore.collection('users').doc(res.user.uid).set({ 
                email: email, 
                role: 'Player',
                username: username 
            });
            display.textContent = "Registration Successful!";
            display.classList.add("successColor");
        }).catch(err => {
            display.textContent = err.message;
            display.classList.add("errorColor");
        });
    }

    function loginUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
    }

    function logoutUser() { 
        // 1. Check if the "Stop Button" exists
        if (characterListener && typeof characterListener === 'function') {
            console.log("Stopping active character listener...");
            characterListener(); // This kills the live stream
            characterListener = null; // Clears the variable
        }

        // 2. Now sign out safely
        auth.signOut().then(() => {
            console.log("User signed out successfully.");
            // No location.reload() needed anymore!
        }).catch(err => console.error("Logout Error:", err));
    }

    auth.onAuthStateChanged((user) => {
        const topNav = document.getElementById('top-nav');
        const appBody = document.querySelector('.app-body');
        const loginTab = document.getElementById('tab-login');

        if (user) {
            
            
            // 3. Get Role from Firestore BEFORE opening any tabs
            firestore.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    window.RPG_APP.role = data.role || 'Player'; //
                                
                    // Step 1- Set UI labels
                    document.getElementById('user-display-name').innerText = user.email.split('@')[0];
                    document.getElementById('user-role-label').innerText = data.role;

                    syncRegistryToDropdowns();
                    loadUserCharacters();

                    // Step 2- Master and Admin Check
                    const isMasterOrAbove = (data.role === 'Master' || data.role === 'Admin'); //
                    if (isMasterOrAbove) {
                        document.getElementById('nav-control-panel').classList.remove('hide-default');
                        document.getElementById('master-quick-controls').classList.remove('hide-default');
                    }

                    if (data.role === 'Admin') {
                        const adminElements = document.querySelectorAll('.admin-only'); //
                        adminElements.forEach(el => el.classList.remove('hide-default')); //
                    }
                    
                    // Step 3- openTab function runs the check to load the correct tab
                    const savedTab = localStorage.getItem('activeMainTab');
                    if (!savedTab || savedTab === 'tab-login') {
                        openTab('tab-character');
                    } else {
                        openTab(savedTab);
                    }

                    // Step 4- Reveal the "Mother" containers first
                    topNav.classList.remove('hide-default');
                    appBody.classList.remove('hide-default');
                    
                    // Step 5- Clear login splash effects
                    loginTab.classList.remove('login-splash-mode');
                    loginTab.classList.add('hide-default');

                    // Step 6- Start listeners
                    initClockListener();
                    initDiceLogListener();
                    if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
                }
            });

            

        } else {
            // --- LOGGED OUT ---
            window.RPG_APP.role = null;
            
            // Hide mothers (children like logout-btn inherit this)
            topNav.classList.add('hide-default');
            appBody.classList.add('hide-default');
            
            // Prepare login screen
            loginTab.classList.add('login-splash-mode');
            loginTab.classList.remove('hide-default'); 
            
            openTab('tab-login');
        }
    });