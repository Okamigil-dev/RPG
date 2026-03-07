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
    ==========================================================================  */
    // --- Register User to Firebase -----------------------------------------  //
    function registerUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        const username = document.getElementById('username-input').value;
        
        const display = document.getElementById('message-display');

        if (!email || !pass || !username) {
            display.textContent = "All fields are required!"; 
            display.classList = "dangerColor";              
            return;
        }

        auth.createUserWithEmailAndPassword(email, pass).then((res) => {
            firestore.collection('users').doc(res.user.uid).set({ 
                email: email, 
                role: 'Player',
                username: username 
            });
            display.textContent = "Registration Successful!";
            display.classList = "successColor";
        }).catch(err => {
            display.textContent = err.message;
            display.classList= "errorColor" ;
        });

    }


    // --- Login User to Firebase --------------------------------------------- //
    function loginUser() {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        
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



    function logoutUser() { 
        const logout = users.character.listener;
        if (logout && typeof logout === 'function') {
            console.log("Stopping active character listener...");
            logout(); 
            users.character.listener = null; 
        }

        auth.signOut().then(() => {
            console.log("User signed out successfully.");
        }).catch(err => console.error("Logout Error:", err));
    }





    auth.onAuthStateChanged((user) => {
        const topNav = document.getElementById('top-nav');
        const appBody = document.getElementById('app-body');
        const loginTab = document.getElementById('tab-login');
                    
        if (user) {
            
            firestore.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    window.RPG_APP.role = data.role || 'Player'; //
                                
                    document.getElementById('user-display-name').innerText = data.username || "Unnamed User";
                    document.getElementById('user-role-label').innerText = data.role;

                    syncRegistryToDropdowns();
                    loadUserCharacters();

                    const isMasterOrAbove = (data.role === 'Master' || data.role === 'Admin'); //
                    if (isMasterOrAbove) {
                        document.getElementById('nav-control-panel').classList.remove('hide-default');
                        document.getElementById('master-quick-controls').classList.remove('hide-default');
                    }

                    if (data.role === 'Admin') {
                        const adminElements = document.querySelectorAll('.admin-only'); //
                        adminElements.forEach(el => el.classList.remove('hide-default')); //
                    }

                    const savedTab = localStorage.getItem('activeMainTab');
                    
                    if (!savedTab || savedTab === 'tab-login') {
                        openTab('tab-character');
                    } else {
                        openTab(savedTab);
                    }

                    topNav.classList.remove('hide-default');
                    appBody.classList.remove('hide-default');

                    loginTab.classList.replace('login-splash-mode', 'hide-default');

                    initClockListener();
                    initDiceLogListener();
                    if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
                }
            });

            

        } else {
            // --- LOGGED OUT ---
            window.RPG_APP.role = null;
            
            loginTab.classList.replace('hide-default', 'login-splash-mode');

            topNav.classList.add('hide-default');
            appBody.classList.add('hide-default');
            
            openTab('tab-login');
        }
    });