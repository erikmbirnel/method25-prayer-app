document.addEventListener('DOMContentLoaded', () => {
    console.log("PWA App Started");

    // Master list of all possible prayer categories
    const DEFAULT_PRAYER_CATEGORIES = [
        "Adoration",
        "Thanksgiving",
        "Confession",
        "Petition",
        "Intercession"
    ];
    // User's current active and ordered list of categories
    let userPrayerCategoryOrder = [...DEFAULT_PRAYER_CATEGORIES];
    const USER_SETTINGS_KEY = 'prayerAppCategorySettings_v1'; // Key for localStorage
    let allPromptsData = [];
    let groupedByCategory = {};
    let prayerHistory = {}; // For the "Back" button feature
    let currentPromptsDisplayed = {}; // Tracks the current prompt object for each category
    const prayerContainer = document.getElementById('prayer-container');
    const generateAllButton = document.getElementById('generate-all-button');

    // Firebase Auth and Firestore instances
    const auth = firebase.auth();
    const db = firebase.firestore();
    let analytics = null; 

    // Initialize Firebase Analytics
    // This assumes firebase.initializeApp has already run from index.html
    try {
        if (firebase && typeof firebase.analytics === 'function') {
            analytics = firebase.analytics();
            console.log("Firebase Analytics initialized.");
        } else {
            console.error("Firebase or Firebase Analytics SDK not available for initialization in app.js.");
        }
    } catch (e) {
        console.error("Error initializing Firebase Analytics:", e);
    }
    let currentUser = null;

    // UI Elements for new features
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userStatus = document.getElementById('user-status');
    const savedPrayersSection = document.getElementById('saved-prayers-section');
    const viewCalendarButton = document.getElementById('view-calendar-button');
    const calendarContainer = document.getElementById('calendar-container');
    const calendarGrid = document.getElementById('calendar-grid');
    const currentMonthYearDisplay = document.getElementById('current-month-year');
    const prevMonthButton = document.getElementById('prev-month-button');
    const nextMonthButton = document.getElementById('next-month-button');
    const recalledPrayerContainer = document.getElementById('recalled-prayer-container');
    const recalledPrayerListContainer = document.getElementById('recalled-prayer-list-container');
    const recalledPrayerList = document.getElementById('recalled-prayer-list');
    const recalledPrayerListDate = document.getElementById('recalled-prayer-list-date');
    const recalledPrayerDate = document.getElementById('recalled-prayer-date');
    const recalledPrayerContent = document.getElementById('recalled-prayer-content');
    const closeRecalledPrayerButton = document.getElementById('close-recalled-prayer-button');
    const savePrayerButton = document.getElementById('save-prayer-button'); // Moved save button reference here
    const mySavedPrayersHeading = document.getElementById('my-saved-prayers-heading');
    const loginPromptMessage = document.getElementById('login-prompt-message');
    let currentCalendarDate = new Date(); // For calendar navigation

    // Settings Modal UI Elements
    // ADD THIS console.log:
    console.log("DEBUG: Before getting settings-button. document.getElementById('settings-button') will be called.");
    const settingsButton = document.getElementById('settings-button');
    // ADD THIS console.log:
    console.log("DEBUG: After getting settings-button. settingsButton is:", settingsButton);
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModalButton = document.getElementById('close-settings-modal-button');
    const categorySettingsList = document.getElementById('category-settings-list');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const cancelSettingsButton = document.getElementById('cancel-settings-button');

    // Audio Controls UI Elements
    // ADD THIS console.log:
    console.log("DEBUG: Before getting audio-controls. document.getElementById('audio-controls') will be called.");
    const audioControlsContainer = document.getElementById('audio-controls');
    // ADD THIS console.log:
    console.log("DEBUG: After getting audio-controls. audioControlsContainer is:", audioControlsContainer);
    const playAudioBtn = document.getElementById('playAudioBtn');
    const pauseAudioBtn = document.getElementById('pauseAudioBtn');
    const stopAudioBtn = document.getElementById('stopAudioBtn');

    // Scripture Modal UI Elements (assuming they are in index.html)
    const scriptureModal = document.getElementById('scripture-modal');
    const scriptureModalTitle = document.getElementById('scripture-modal-title');
    const scriptureModalBody = document.getElementById('scripture-modal-body');
    const closeScriptureModalButton = document.getElementById('close-scripture-modal-button');

    const ESV_API_TOKEN = '78cd4c38aea5c20fcc99a63529076bc602be3848'; // Your ESV API Token

    // --- Crypto Helper Functions ---
    const ENCRYPTION_KEY_NAME = 'prayerAppEncryptionKey_v1'; // Added versioning to key name

    async function generateAndStoreKey() {
        if (!window.crypto || !window.crypto.subtle) {
            alert("Web Crypto API is not available in this browser. Reflections cannot be securely saved.");
            return null;
        }
        try {
            const key = await window.crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true, // extractable: must be true to export the key
                ['encrypt', 'decrypt']
            );
            const exportedKeyJWK = await window.crypto.subtle.exportKey('jwk', key);
            localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKeyJWK));
            console.log("New encryption key generated and stored.");
            // Show a one-time message to the user about key management.
            // This could be made more sophisticated (e.g., only show once ever per user/browser).
            alert("Your reflections will now be encrypted for privacy.\n\nIMPORTANT: Your unique encryption key is stored in this browser. If you clear your browser's site data (cache, local storage, etc.), this key will be lost, and you will NOT be able to decrypt previously saved reflections.\n\nYour reflections remain unreadable to anyone with access to the cloud storage, including the app administrator.");
            
            return key;
        } catch (error) {
            console.error("Error generating/storing key:", error);
            alert("Could not set up encryption. Reflections will not be saved securely.");
            return null;
        }
    }

    async function getEncryptionKey() {
        if (!window.crypto || !window.crypto.subtle) {
            console.warn("Web Crypto API not available.");
            return null;
        }
        const storedKeyJWKString = localStorage.getItem(ENCRYPTION_KEY_NAME);
        if (storedKeyJWKString) {
            try {
                const jwk = JSON.parse(storedKeyJWKString);
                return await window.crypto.subtle.importKey(
                    'jwk',
                    jwk,
                    { name: 'AES-GCM', length: 256 },
                    true, // extractable: should match how it was generated
                    ['encrypt', 'decrypt']
                );
            } catch (error) {
                console.error("Error importing stored key:", error);
                alert("Error accessing your encryption key. Previously encrypted reflections might be unreadable. A new key will be generated if possible.");
                // Attempt to generate a new key if import fails (old data might be lost)
                localStorage.removeItem(ENCRYPTION_KEY_NAME); // Remove potentially corrupted key
                return await generateAndStoreKey();
            }
        } else {
            console.log("No encryption key found, generating a new one.");
            return await generateAndStoreKey();
        }
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function encryptText(text) {
        const key = await getEncryptionKey();
        if (!key) {
            alert("Encryption key is not available. Cannot encrypt reflection.");
            return null;
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // AES-GCM standard IV size is 12 bytes
        const encodedText = new TextEncoder().encode(text);

        try {
            const ciphertext = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encodedText
            );
            return {
                ciphertext: arrayBufferToBase64(ciphertext),
                iv: arrayBufferToBase64(iv) // Store IV with ciphertext
            };
        } catch (error) {
            console.error("Encryption failed:", error);
            alert("Failed to encrypt reflection.");
            return null;
        }
    }

    async function decryptText(ciphertextBase64, ivBase64) {
        const key = await getEncryptionKey();
        if (!key) {
            console.error("Decryption key not available.");
            return "[Decryption key missing or invalid]";
        }

        try {
            const ciphertext = base64ToArrayBuffer(ciphertextBase64);
            const iv = base64ToArrayBuffer(ivBase64);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(decryptedBuffer);
        } catch (error) {
            console.error("Decryption failed:", error);
            // This can happen if the key is wrong (e.g., user cleared localStorage and a new key was generated)
            // or if the ciphertext/IV is corrupted.
            return "[Encrypted reflection - unable to decrypt]";
        }
    }
    // --- End Crypto Helper Functions ---

    // --- Core Logic (inspired by PrayerAssembler class) ---

    function groupPrompts() {
        groupedByCategory = {}; // Reset
        if (!allPromptsData) return;
        prayerHistory = {}; // Reset history
        currentPromptsDisplayed = {}; // Reset current displayed prompts

        for (const item of allPromptsData) {
            const category = item.prayer_category || "Uncategorized";
            if (!groupedByCategory[category]) {
                groupedByCategory[category] = [];
            }
            // Store the prompt directly, assuming structure from outcome.json
            // { prompt: "text...", scripture_references: [...] }
            groupedByCategory[category].push(item);
        }
        // Initialize prayer history and current prompts for the user's active categories
        for (const categoryName of userPrayerCategoryOrder) {
            prayerHistory[categoryName] = [];
            currentPromptsDisplayed[categoryName] = null; // Initialize as null
        }
    }

    function getRandomElement(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getRandomPromptForCategory(categoryName) {
        const promptsInCategory = groupedByCategory[categoryName];
        if (promptsInCategory && promptsInCategory.length > 0) {
            return getRandomElement(promptsInCategory);
        }
        return null;
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function formatSegment(categoryName, promptData) { // Modified to include clickable scripture links
        if (!promptData) {
            return `(No prompt available for ${categoryName})`;
        }

        const promptText = promptData.prompt || "";
        const escapedPromptText = escapeHTML(promptText); // Escape main prompt text

        const scriptureRefsList = promptData.scripture_references || [];
        let scriptureLinksHTML = "";

        if (scriptureRefsList.length > 0) {
            const links = scriptureRefsList.map(ref =>
                `<a href="#" class="scripture-link" data-reference="${encodeURIComponent(ref)}">${escapeHTML(ref)}</a>`
            ).join(" &bull; "); // Using a bullet point as separator
            scriptureLinksHTML = ` <span class="scripture-references">(${links})</span>`;
        }
        return `${escapedPromptText}${scriptureLinksHTML}`;
    }

    // --- UI Manipulation ---

    function createCategoryUI(categoryName) {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'prayer-category-segment';
        categoryDiv.id = `category-${categoryName.replace(/[\s/]+/g, '-')}`; // Create a unique ID

        const title = document.createElement('h3');
        title.textContent = `${categoryName}:`;

        const contentP = document.createElement('p');
        contentP.className = 'prayer-text';
        contentP.textContent = 'Loading...'; // Placeholder

        const backButton = document.createElement('button');
        backButton.textContent = 'Back';
        backButton.className = 'back-button action-button';
        backButton.disabled = true; // Initially disabled
        backButton.addEventListener('click', () => goBackCategory(categoryName));

        const rerandomizeButton = document.createElement('button');
        rerandomizeButton.textContent = 'Refresh';
        rerandomizeButton.className = 'rerandomize-button action-button'; // Added action-button for consistency
        rerandomizeButton.addEventListener('click', () => reRandomizeCategory(categoryName));

        const reflectionButton = document.createElement('button');
        reflectionButton.textContent = 'Reflect';
        reflectionButton.className = 'reflection-button action-button';
        reflectionButton.addEventListener('click', () => toggleReflectionArea(categoryName));

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'category-button-container'; // Added class for styling
        buttonContainer.appendChild(backButton);
        buttonContainer.appendChild(rerandomizeButton);
        buttonContainer.appendChild(reflectionButton);

        const reflectionAreaContainer = document.createElement('div');
        reflectionAreaContainer.className = 'reflection-area';
        reflectionAreaContainer.style.display = 'none'; // Initially hidden

        const reflectionTextarea = document.createElement('textarea');
        reflectionTextarea.className = 'reflection-textarea';
        reflectionTextarea.placeholder = 'Type your reflections or custom prayer here...';
        reflectionTextarea.setAttribute('aria-label', `Reflection for ${categoryName}`);

        const lockReflectionButton = document.createElement('button'); // Renamed for clarity
        lockReflectionButton.textContent = 'Lock Reflection';
        lockReflectionButton.className = 'lock-reflection-button action-button'; // Use action-button for base styling, renamed class
        lockReflectionButton.addEventListener('click', () => handleLockReflectionClick(categoryName));

        reflectionAreaContainer.appendChild(reflectionTextarea);   // Add the textarea first
        reflectionAreaContainer.appendChild(lockReflectionButton); // Add the lock button after the textarea

        categoryDiv.appendChild(title);
        categoryDiv.appendChild(contentP);
        categoryDiv.appendChild(reflectionAreaContainer);
        categoryDiv.appendChild(buttonContainer);
        prayerContainer.appendChild(categoryDiv);
    }

    function updateCategoryDisplay(categoryName, segmentText, promptDataObject) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        currentPromptsDisplayed[categoryName] = promptDataObject; // Store the current prompt object (or null)

        if (categoryDiv) {
            // Update back button state
            const backButton = categoryDiv.querySelector('.back-button');
            if (backButton) {
                backButton.disabled = !prayerHistory[categoryName] || prayerHistory[categoryName].length === 0;
            }
            const contentP = categoryDiv.querySelector('.prayer-text');
            if (contentP) {
                contentP.innerHTML = segmentText; // Changed to innerHTML to render scripture links
            }
            // Hide, clear, and unlock reflection area when prompt changes
            const reflectionAreaContainer = categoryDiv.querySelector('.reflection-area');
            if (reflectionAreaContainer) {
                reflectionAreaContainer.style.display = 'none';
                const reflectionTextarea = reflectionAreaContainer.querySelector('.reflection-textarea');
                const lockReflectionButton = reflectionAreaContainer.querySelector('.lock-reflection-button');
                if (reflectionTextarea) {
                    reflectionTextarea.value = '';
                    reflectionTextarea.readOnly = false;
                    reflectionTextarea.classList.remove('frozen');
                }
                if (lockReflectionButton) {
                    lockReflectionButton.textContent = 'Lock Reflection';
                    lockReflectionButton.style.display = 'block'; // Ensure it's ready to be shown
                }
            }
        }
    }

    function toggleReflectionArea(categoryName) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        if (!categoryDiv) return;

        const reflectionAreaContainer = categoryDiv.querySelector('.reflection-area');
        const reflectionTextarea = categoryDiv.querySelector('.reflection-textarea');
        const lockReflectionButton = categoryDiv.querySelector('.lock-reflection-button');

        if (!reflectionAreaContainer || !reflectionTextarea || !lockReflectionButton) return;

        if (reflectionAreaContainer.style.display === 'none') {
            // Area is hidden: show it, make editable, show lock button
            reflectionAreaContainer.style.display = 'block';
            reflectionTextarea.readOnly = false;
            reflectionTextarea.classList.remove('frozen');
            lockReflectionButton.textContent = 'Lock Reflection';
            lockReflectionButton.style.display = 'block'; // Or 'inline-block' if preferred
            reflectionTextarea.focus();
        } else {
            // Area is visible
            if (reflectionTextarea.readOnly) {
                // Area is visible and locked: make editable, show lock button
                reflectionTextarea.readOnly = false;
                reflectionTextarea.classList.remove('frozen');
                lockReflectionButton.textContent = 'Lock Reflection';
                lockReflectionButton.style.display = 'block'; // Or 'inline-block'
                reflectionTextarea.focus();
            } else {
                // Area is visible and editable: hide it
                reflectionAreaContainer.style.display = 'none';
                // lockReflectionButton will be hidden as part of the container
            }
        }
    }

    function handleLockReflectionClick(categoryName) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        const reflectionTextarea = categoryDiv.querySelector('.reflection-textarea');
        const lockReflectionButton = categoryDiv.querySelector('.lock-reflection-button');

        if (!reflectionTextarea || !lockReflectionButton) return;

        reflectionTextarea.readOnly = true;
        reflectionTextarea.classList.add('frozen');
        lockReflectionButton.style.display = 'none'; // Hide the lock button itself
    }

    function displayFullPrayer() {
        stopAudioPlayback(); // Stop any ongoing audio when generating a new prayer
        if (Object.keys(groupedByCategory).length === 0) {
            prayerContainer.innerHTML = "<p>No prayer prompts loaded. Please check data source.</p>";
            console.error("No prompts available to display.");
            return;
        }
        // Display prayer segments based on the user's category order
        for (const categoryName of userPrayerCategoryOrder) {
            // Save current prompt to history before getting a new one
            // Use the stored promptData object directly
            if (currentPromptsDisplayed[categoryName]) { // Check if it's not null (i.e., not a placeholder)
                recordHistory(categoryName, currentPromptsDisplayed[categoryName]);
            }

            const promptData = getRandomPromptForCategory(categoryName); // This can be null
            const segmentText = formatSegment(categoryName, promptData);
            updateCategoryDisplay(categoryName, segmentText, promptData); // Pass the new promptData (or null)
        }
        if (playAudioBtn) {
            playAudioBtn.disabled = false; // Enable play button after prayer is displayed
        }
    }

    function recordHistory(categoryName, promptData) {
        if (!prayerHistory[categoryName]) prayerHistory[categoryName] = [];
        prayerHistory[categoryName].unshift(promptData); // Add to the beginning
        if (prayerHistory[categoryName].length > 3) { // Keep only last 3
            prayerHistory[categoryName].pop();
        }
    }

    function reRandomizeCategory(categoryName) {
        stopAudioPlayback(); // Stop audio when re-randomizing a category
        // Save current prompt to history before getting a new one
        // Use the stored promptData object directly
        if (currentPromptsDisplayed[categoryName]) { // Check if it's not null
            recordHistory(categoryName, currentPromptsDisplayed[categoryName]);
        }

        const promptData = getRandomPromptForCategory(categoryName); // This can be null
        const segmentText = formatSegment(categoryName, promptData);
        updateCategoryDisplay(categoryName, segmentText, promptData); // Pass the new promptData (or null)
    }
    function goBackCategory(categoryName) {
        stopAudioPlayback(); // Stop audio when going back
        if (prayerHistory[categoryName] && prayerHistory[categoryName].length > 0) {
            const previousPromptData = prayerHistory[categoryName].shift(); // This will be a valid promptData object
            const segmentText = formatSegment(categoryName, previousPromptData);
            updateCategoryDisplay(categoryName, segmentText, previousPromptData); // Pass the restored promptData
        }
    }

    // --- Firebase Authentication ---
    function handleLogin() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
            .then((result) => {
                console.log("User logged in:", result.user.displayName);
                // User is signed in.
            })
            .catch((error) => {
                console.error("Login failed:", error);
            });
    }

    function handleLogout() {
        auth.signOut()
            .then(() => {
                stopAudioPlayback(); // Stop audio on logout
                console.log("User logged out");
                // User is signed out.
            })
            .catch((error) => {
                console.error("Logout failed:", error);
            });
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            userStatus.textContent = `Logged in as ${user.displayName || user.email}`;
            loginButton.style.display = 'none';
            if (loginPromptMessage) {
                loginPromptMessage.textContent = ''; // Clear the prompt message text
                loginPromptMessage.style.display = 'none'; // Hide prompt when logged in
            }
            logoutButton.style.display = 'inline-block';
            savePrayerButton.style.display = 'block'; // Make save button block to take full width
            mySavedPrayersHeading.style.display = 'block';
            // ADD THIS console.log, right before line 526 in your code:
            console.log("DEBUG: Inside onAuthStateChanged (user logged in). Before line 526. settingsButton:", settingsButton);
            if(settingsButton) settingsButton.style.display = 'inline-block'; // Show settings button
            // ADD THIS console.log, right before line 527 in your code:
            console.log("DEBUG: Inside onAuthStateChanged (user logged in). Before line 527. audioControlsContainer:", audioControlsContainer);
            if(audioControlsContainer) audioControlsContainer.style.display = 'block'; // Show audio controls
            savedPrayersSection.style.display = 'block'; // Show the whole section
            calendarContainer.style.display = 'block'; // Show calendar by default
        } else {
            userStatus.textContent = 'Not logged in.';
            loginButton.style.display = 'inline-block';
            if (loginPromptMessage) {
                loginPromptMessage.textContent = "Login with your Google account to save prayers and customize your experience.";
                loginPromptMessage.style.display = 'inline'; // Show prompt when not logged in
            }
            logoutButton.style.display = 'none';
            savePrayerButton.style.display = 'none';
            viewCalendarButton.style.display = 'none';
            calendarContainer.style.display = 'none';
            // ADD THIS console.log:
            console.log("DEBUG: Inside onAuthStateChanged (user NOT logged in). Before settingsButton.style.display. settingsButton:", settingsButton);
            if(settingsButton) settingsButton.style.display = 'none'; // Hide settings button
            // ADD THIS console.log:
            console.log("DEBUG: Inside onAuthStateChanged (user NOT logged in). Before audioControlsContainer.style.display. audioControlsContainer:", audioControlsContainer);
            if(audioControlsContainer) audioControlsContainer.style.display = 'none'; // Hide audio controls
            recalledPrayerContainer.style.display = 'none';
            recalledPrayerListContainer.style.display = 'none';
            calendarGrid.innerHTML = ''; // Clear calendar grid
            currentMonthYearDisplay.textContent = 'Month Year'; // Reset calendar header
        }
    });

    // --- Firestore: Save and Load Prayers ---
    async function saveCurrentPrayer() { // Made the function async
        stopAudioPlayback(); // Stop audio when saving
        if (!currentUser) {
            alert("Please log in to save your prayer.");
            return;
        }

        // Use map to create promises for each segment's data, including potential async encryption
        // Iterate over the user's current category order
        const segmentDataPromises = userPrayerCategoryOrder.map(async categoryName => {
            const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
            const categoryDiv = document.getElementById(categoryId);
            if (categoryDiv) {
                const contentP = categoryDiv.querySelector('.prayer-text');
                const reflectionAreaContainer = categoryDiv.querySelector('.reflection-area');
                let reflectionPayload = null;

                if (reflectionAreaContainer && reflectionAreaContainer.style.display !== 'none') {
                    const reflectionTextarea = reflectionAreaContainer.querySelector('.reflection-textarea');
                    if (reflectionTextarea && reflectionTextarea.readOnly && reflectionTextarea.value.trim() !== '') {
                        const plainTextReflection = reflectionTextarea.value; // Preserve whitespace
                        const encryptedReflection = await encryptText(plainTextReflection);
                        if (encryptedReflection) {
                            reflectionPayload = encryptedReflection;
                        }
                        // If encryption fails, encryptText shows an alert, and reflectionPayload remains null.
                    }
                }

                if (contentP && contentP.textContent !== 'Loading...' && !contentP.textContent.startsWith('(No prompt available for')) {
                    return {
                        category: categoryName,
                        textWithScripture: contentP.innerHTML, // Save HTML to preserve scripture links
                        promptText: currentPromptsDisplayed[categoryName] ? currentPromptsDisplayed[categoryName].prompt : "", // Store the raw prompt text
                        reflection: reflectionPayload
                    };
                }
            }
            return undefined; // Explicitly return undefined if categoryDiv not found or content not valid
        });

        try {
            const resolvedSegments = await Promise.all(segmentDataPromises);
            const validSegments = resolvedSegments.filter(segment => segment !== undefined);

            if (validSegments.length === 0) {
                alert("Cannot save an empty prayer.");
                return;
            }

            await db.collection('users').doc(currentUser.uid).collection('savedPrayers').add({
                segments: validSegments,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Prayer saved!");
            if (calendarContainer.style.display === 'block') {
                renderCalendar();
            }
        } catch (error) {
            console.error("Error saving prayer or processing segments: ", error);
            alert("Failed to save prayer. See console for details.");
        }
    }

    async function getSavedPrayersForMonth(year, month) {
        if (!currentUser) return [];

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59); // Last day of the month

        try {
            const snapshot = await db.collection('users').doc(currentUser.uid).collection('savedPrayers')
                .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startDate))
                .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endDate))
                .orderBy('createdAt', 'desc')
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching prayers for month: ", error);
            return [];
        }
    }

    async function getPrayersForDay(date) { // date is a Date object
        if (!currentUser) return [];

        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

        try {
            const snapshot = await db.collection('users').doc(currentUser.uid).collection('savedPrayers')
                .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
                .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endOfDay))
                .orderBy('createdAt', 'asc') // Show earliest first for the day
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching prayers for day: ", error);
            return [];
        }
    }

    async function displaySingleRecalledPrayer(prayerDoc) { // Made async
        stopAudioPlayback(); // Stop audio when viewing a saved prayer
        recalledPrayerDate.textContent = prayerDoc.createdAt.toDate().toLocaleDateString() + " " + prayerDoc.createdAt.toDate().toLocaleTimeString();
        
        const segmentPromises = prayerDoc.segments.map(async segment => { // map returns promises
            let segmentHTML = `<h3>${segment.category}:</h3><p>${segment.textWithScripture}</p>`;
            if (segment.reflection && typeof segment.reflection === 'object' && segment.reflection.ciphertext && segment.reflection.iv) {
                const decryptedReflection = await decryptText(segment.reflection.ciphertext, segment.reflection.iv);
                segmentHTML += `<div class="saved-reflection"><p><em>Your Reflection:</em></p><p>${escapeHTML(decryptedReflection).replace(/\n/g, '<br>')}</p></div>`;
            } else if (segment.reflection && typeof segment.reflection === 'string' && segment.reflection.trim() !== '') {
                // Handle legacy unencrypted reflections, if any (though new ones won't be strings)
                segmentHTML += `<div class="saved-reflection"><p><em>Your Reflection (unencrypted):</em></p><p>${escapeHTML(segment.reflection).replace(/\n/g, '<br>')}</p></div>`;
            }
            return segmentHTML;
        });

        const resolvedSegments = await Promise.all(segmentPromises); // Wait for all decryptions
        recalledPrayerContent.innerHTML = resolvedSegments.join('');

        recalledPrayerContainer.style.display = 'block';
        recalledPrayerListContainer.style.display = 'none'; // Hide list when single prayer is shown
        calendarContainer.style.display = 'none'; // Hide calendar when showing prayer
    }

    async function displayRecalledPrayerList(prayers, date) { // Made async
        stopAudioPlayback(); // Stop audio when viewing saved prayer list
        recalledPrayerList.innerHTML = ''; // Clear previous list
        recalledPrayerListDate.textContent = date.toLocaleDateString();

        if (prayers.length === 0) {
            recalledPrayerList.innerHTML = '<li>No prayers saved for this day.</li>';
        } else if (prayers.length === 1) {
            await displaySingleRecalledPrayer(prayers[0]); // If only one, display it directly (await)
            return;
        } else {
            prayers.forEach(prayerDoc => {
                const listItem = document.createElement('li');
                const prayerTime = prayerDoc.createdAt.toDate().toLocaleTimeString();
                
                let summary = "Prayer"; // Default summary
                if (prayerDoc.segments && prayerDoc.segments.length > 0) {
                    const firstSegment = prayerDoc.segments[0];
                    if (firstSegment.promptText && firstSegment.promptText.trim() !== "") {
                        const words = firstSegment.promptText.trim().split(/\s+/); // Split by one or more spaces
                        summary = words.slice(0, 3).join(" ");
                        if (words.length > 3) {
                            summary += "...";
                        }
                    } else {
                        // Fallback for older prayers or if promptText is empty
                        summary = firstSegment.category || "Prayer";
                    }
                }

                listItem.textContent = `${summary} at ${prayerTime}`;
                listItem.addEventListener('click', async () => { // event listener callback is async
                    await displaySingleRecalledPrayer(prayerDoc);
                });
                recalledPrayerList.appendChild(listItem);
            });

            // Remove existing "Back to Calendar" button to prevent duplicates
            const existingBackToCalendarButton = document.getElementById('back-to-calendar-from-list-button');
            if (existingBackToCalendarButton && existingBackToCalendarButton.parentNode === recalledPrayerListContainer) {
                recalledPrayerListContainer.removeChild(existingBackToCalendarButton);
            }

            // Add "Back to Calendar" button if there are multiple prayers
            const backToCalendarButton = document.createElement('button');
            backToCalendarButton.id = 'back-to-calendar-from-list-button'; // Added ID for styling
            backToCalendarButton.textContent = 'Back to Calendar';
            backToCalendarButton.className = 'action-button'; // Use existing action-button class
            backToCalendarButton.addEventListener('click', () => {
                recalledPrayerListContainer.style.display = 'none';
                recalledPrayerContainer.style.display = 'none'; // Ensure single prayer view is also hidden
                calendarContainer.style.display = 'block';
            });
            // Append it after the list, within the same container
            recalledPrayerListContainer.appendChild(backToCalendarButton);

        }
        recalledPrayerListContainer.style.display = 'block';
        recalledPrayerContainer.style.display = 'none'; // Hide single prayer view initially
        calendarContainer.style.display = 'none'; // Hide calendar
    }

    // --- ESV Scripture API Functions ---
    async function fetchAndDisplayScripture(reference) {
        stopAudioPlayback(); // Stop audio when opening scripture modal
        if (!scriptureModal || !scriptureModalTitle || !scriptureModalBody) {
            console.error("Scripture modal elements not found in the DOM.");
            alert("Cannot display scripture: UI elements missing.");
            return;
        }
        scriptureModalTitle.textContent = `Loading: ${reference}`;
        scriptureModalBody.innerHTML = '<em>Looking up passage...</em>';
        showScriptureModal();

        // IMPORTANT: Storing API tokens client-side can be a security risk.
        // For production, consider a backend proxy to protect your API token if ESV API terms require it.
        const ESV_API_BASE_URL = 'https://api.esv.org/v3/passage/html/';
        const versesBefore = 1; // Number of verses to fetch before the queried verse
        const versesAfter = 1;  // Number of verses to fetch after the queried verse
        const query = encodeURIComponent(reference);

        try {
            const response = await fetch(`${ESV_API_BASE_URL}?q=${query}&context-verses-before=${versesBefore}&context-verses-after=${versesAfter}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${ESV_API_TOKEN}`
                }
            });

            if (!response.ok) {
                let errorMsg = `Error fetching scripture: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.detail) { // ESV API often returns error details in 'detail'
                        errorMsg += ` - ${errorData.detail}`;
                    }
                } catch (e) { /* Response might not be JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.passages && data.passages.length > 0) {
                scriptureModalTitle.textContent = data.canonical || reference; // Use canonical name if available
                
                let combinedHtml = data.passages.join('');
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = combinedHtml;

                // Remove all intermediate h2 elements (ESV verse reference headers like "Psalm X:Y (Listen)")
                const verseHeaders = tempDiv.querySelectorAll('h2');
                verseHeaders.forEach(header => header.remove());

                // Find all paragraph elements that contain an 'a.copyright' link.
                // Remove all such paragraphs except for the very last one.
                // This will remove intermediate (ESV) lines and the empty lines/parentheses they might leave.
                const allParagraphs = Array.from(tempDiv.querySelectorAll('p'));
                const paragraphsContainingCopyright = allParagraphs.filter(p => p.querySelector('a.copyright'));

                if (paragraphsContainingCopyright.length > 1) {
                    // Iterate up to the second to last one and remove them
                    for (let i = 0; i < paragraphsContainingCopyright.length - 1; i++) {
                        paragraphsContainingCopyright[i].remove();
                    }
                }
                // The last paragraph containing a copyright link (if any) will remain.

                // Remove ESV-specific chapter number spans if they exist
                const chapterNumbers = tempDiv.querySelectorAll('span.chapter-num');
                chapterNumbers.forEach(span => span.remove());

                // Remove footnote markers from the text (ESV often uses <span class="footnote">)
                const footnoteMarkers = tempDiv.querySelectorAll('span.footnote');
                footnoteMarkers.forEach(marker => marker.remove());

                // Remove the entire "Footnotes" section (ESV often uses <div class="footnotes">)
                const footnotesSection = tempDiv.querySelector('div.footnotes');
                if (footnotesSection) {
                    footnotesSection.remove();
                }

                // Remove <h3> elements that are likely footnote headings
                const h3Elements = tempDiv.querySelectorAll('h3');
                h3Elements.forEach(h3 => {
                    if (h3.textContent.trim().toLowerCase() === 'footnotes') {
                        h3.remove();
                    }
                });

                // ADDITION: Attempt to remove other common footnote item wrappers if they exist,
                // especially those with class "note" as seen from inspecting the <i> tag's parent.
                // This targets <p class="note">, <div class="note">, <li class="note">, etc.
                // and would include elements like <p class="note translation">.
                const potentialStrayFootnoteItems = tempDiv.querySelectorAll('p.note, div.note, li.note, span.note');
                potentialStrayFootnoteItems.forEach(item => item.remove());

                let cleanedHtml = tempDiv.innerHTML.trim();

                // Add link to external Bible site
                const canonicalReference = data.canonical || reference;
                let queryForExternalSite = canonicalReference.split(':')[0].trim(); // Default e.g. "Hebrews 9" or "Psalm 119"

                // Regex to more reliably get Book + Chapter for URL
                // (e.g., "1 Samuel 2" from "1 Samuel 2:1-10")
                const bookChapterMatch = canonicalReference.match(/^([1-3]?\s?[a-zA-Z]+)\s*(\d+)/);
                if (bookChapterMatch && bookChapterMatch[1] && bookChapterMatch[2]) {
                    queryForExternalSite = `${bookChapterMatch[1].trim()} ${bookChapterMatch[2]}`;
                }
                // If canonicalReference is just a book name (e.g., "Obadiah"), queryForExternalSite will be "Obadiah"
                // BibleGateway handles this by defaulting to chapter 1.

                const bibleGatewayQuery = encodeURIComponent(queryForExternalSite);
                const externalLinkUrl = `https://www.biblegateway.com/passage/?search=${bibleGatewayQuery}&version=ESV`;
                const externalLinkHtml = 
                    `<p class="external-context-link-container">` +
                    `<a href="${externalLinkUrl}" target="_blank" rel="noopener noreferrer">See in context - must leave app</a>` +
                    `</p>`;
                cleanedHtml += externalLinkHtml;
                scriptureModalBody.innerHTML = cleanedHtml;
            } else {
                scriptureModalBody.innerHTML = '<p>Scripture passage not found or an error occurred.</p>';
            }
        } catch (error) {
            console.error("Failed to fetch or display scripture:", error);
            scriptureModalBody.innerHTML = `<p>Sorry, could not load scripture. ${error.message}</p>`;
            scriptureModalTitle.textContent = "Error";
        }
    }

    function showScriptureModal() {
        if (scriptureModal) scriptureModal.style.display = 'block';
    }

    function hideScriptureModal() {
        if (scriptureModal) scriptureModal.style.display = 'none';
        if (scriptureModalBody) scriptureModalBody.innerHTML = ''; // Clear content
    }

    // --- Settings Modal Functions ---
    function openSettingsModal() {
        stopAudioPlayback(); // Stop audio when opening settings modal
        if (!currentUser) {
            // alert("Please log in to change settings."); // Or simply don't show the button
            return;
        }
        populateSettingsModal();
        if (settingsModal) settingsModal.style.display = 'block';
    }

    function closeSettingsModal() {
        if (settingsModal) settingsModal.style.display = 'none';
    }

    function populateSettingsModal() {
        if (!categorySettingsList) return;
        categorySettingsList.innerHTML = ''; // Clear existing items

        DEFAULT_PRAYER_CATEGORIES.forEach(categoryName => {
            const listItem = document.createElement('li');

            const dragHandle = document.createElement('span');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = '&#x2630;&nbsp;'; // Hamburger icon for dragging

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `setting-cb-${categoryName.replace(/[\s/]+/g, '-')}`;
            checkbox.value = categoryName;
            checkbox.checked = userPrayerCategoryOrder.includes(categoryName); // Check if it's currently active

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = categoryName;

            listItem.appendChild(dragHandle);
            listItem.appendChild(checkbox);
            listItem.appendChild(label);
            categorySettingsList.appendChild(listItem);
        });

        // Initialize SortableJS for drag-and-drop reordering
        if (typeof Sortable !== 'undefined' && categorySettingsList) {
            new Sortable(categorySettingsList, {
                animation: 150, // ms, animation speed moving items when sorting, `0` — without animation
                handle: '.drag-handle', // Restrict drag start to elements with the .drag-handle class
                ghostClass: 'sortable-ghost', // Class name for the drop placeholder
            });
        }
    }

    function saveUserSettings() {
        stopAudioPlayback(); // Stop audio when saving settings (as UI will rebuild)
        if (!categorySettingsList) return;

        const newOrder = [];
        const listItems = categorySettingsList.querySelectorAll('li');

        listItems.forEach(listItem => {
            const checkbox = listItem.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                newOrder.push(checkbox.value); // checkbox.value is the categoryName
            }
        });

        userPrayerCategoryOrder = newOrder;

        try {
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userPrayerCategoryOrder));
            console.log("User settings saved:", userPrayerCategoryOrder);
        } catch (e) {
            console.error("Error saving user settings to localStorage:", e);
        }

        rebuildPrayerUI();
        closeSettingsModal();
    }

    function rebuildPrayerUI() {
        prayerContainer.innerHTML = ''; // Clear existing UI
        userPrayerCategoryOrder.forEach(categoryName => { // Create UI for active categories in user's order
            createCategoryUI(categoryName);
        });
        groupPrompts(); // Re-initialize history/trackers for the new category set/order
        displayFullPrayer(); // Refresh the displayed prayer with new settings
    }

    function loadUserSettings() {
        // This runs before UI is built, so no need to stop audio here
        try {
            const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                if (Array.isArray(parsedSettings) && parsedSettings.length > 0) {
                    // Basic validation: ensure all loaded categories are still in DEFAULT_PRAYER_CATEGORIES
                    // This prevents issues if a category is removed from the app in the future.
                    userPrayerCategoryOrder = parsedSettings.filter(cat => DEFAULT_PRAYER_CATEGORIES.includes(cat));
                    if (userPrayerCategoryOrder.length === 0) { // If all saved categories were invalid
                        userPrayerCategoryOrder = [...DEFAULT_PRAYER_CATEGORIES];
                    }
                } else if (Array.isArray(parsedSettings) && parsedSettings.length === 0) {
                    userPrayerCategoryOrder = []; // User explicitly saved an empty list
                }
                console.log("User settings loaded:", userPrayerCategoryOrder);
            }
        } catch (e) {
            console.error("Error loading user settings from localStorage:", e);
            // Fallback to default if loading fails
            userPrayerCategoryOrder = [...DEFAULT_PRAYER_CATEGORIES];
        }
    }

    // --- Audio Playback Functions ---
    let utteranceQueue = [];
    let isSpeaking = false;
    let currentUtteranceIndex = 0;
    let timeoutId = null; // To store the timeout for pauses

    // UI Elements - currentReadingTextDiv was potentially missed in the top declarations if it's still needed globally
    // For now, assuming it's mainly used within audio functions. If not, move its declaration to the top.
    const currentReadingTextDiv = document.getElementById('currentReadingText');
    let googleTtsAudioPlayer = new Audio(); // Use a programmatic Audio object

    console.log("playAudioBtn element found:", playAudioBtn); // Debug line

    function speakText(textToSpeak, onEndCallback) {
        if (!textToSpeak || textToSpeak.trim() === '') {
            console.warn("Attempted to speak empty text.");
            if (onEndCallback) onEndCallback(); // Call callback immediately
            return;
        }

        if (currentReadingTextDiv) currentReadingTextDiv.textContent = `Synthesizing: "${textToSpeak.substring(0, 100)}..."`;
        isSpeaking = true;

        // const BACKEND_TTS_URL = ' https://us-central1-method25.cloudfunctions.net/method25-tts-proxy/'; // URL of deployed backend service - Moved to top

        // Call your backend service
        fetch(BACKEND_TTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: textToSpeak }) // Send text in the request body
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(`Backend TTS error: ${response.status} - ${err.error || err.message || response.statusText}`); });
            }
            return response.json();
        })
        .then(data => {
            if (data.audioContent && googleTtsAudioPlayer) {
                if (currentReadingTextDiv) currentReadingTextDiv.textContent = `Reading: "${textToSpeak.substring(0, 100)}..."`;
                googleTtsAudioPlayer.src = `data:audio/mp3;base64,${data.audioContent}`;
                googleTtsAudioPlayer.play()
                    .catch(e => {
                        console.error("Error playing audio:", e);
                        isSpeaking = false;
                        if (onEndCallback) onEndCallback();
                    });

                googleTtsAudioPlayer.onended = () => {
                    isSpeaking = false;
                    if (onEndCallback) onEndCallback();
                };
            } else {
                throw new Error("No audio content received from backend.");
            }
        })
        .catch(error => {
            console.error('Backend TTS request or playback failed:', error);
            if (currentReadingTextDiv) currentReadingTextDiv.textContent = `Error: Could not play audio.`;
            isSpeaking = false;
            if (onEndCallback) onEndCallback();
        });
    }

    function processQueue() {
        if (!googleTtsAudioPlayer) {
            console.error("Audio player element not found.");
            stopAudioPlayback(); // Stop if player is missing
            return;
        }
        if (currentUtteranceIndex < utteranceQueue.length) {
            const item = utteranceQueue[currentUtteranceIndex];
            if (item.type === 'speech') {
                speakText(item.text, () => {
                    currentUtteranceIndex++;
                    processQueue(); // Move to the next item after speaking
                });
            } else if (item.type === 'pause') {
                if (currentReadingTextDiv) currentReadingTextDiv.textContent = `Pausing for ${item.duration / 1000} seconds...`;
                clearTimeout(timeoutId); // Clear any existing timeout
                timeoutId = setTimeout(() => {
                    currentUtteranceIndex++;
                    processQueue(); // Move to the next item after pause
                }, item.duration);
            }
        } else {
            // End of sequence
            stopAudioPlayback(); // Use the stop function to reset UI
        }
    }

    // --- Initialization ---
    async function initializeApp() {
        loadUserSettings(); // Load user settings first

        if (!window.crypto || !window.crypto.subtle) {
            console.warn("Web Crypto API not available. Reflection encryption will be disabled.");
            // You might want to disable reflection-related buttons or show a persistent message to the user.
        }

        // Create UI structure first
        prayerContainer.innerHTML = ''; // Clear any existing content
        userPrayerCategoryOrder.forEach(categoryName => {
            createCategoryUI(categoryName);
        });

        try {
            // Adjust the path to where you'll place outcome.json in your PWA project
            const response = await fetch('./data/outcome.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allPromptsData = await response.json();
            
            if (!allPromptsData || allPromptsData.length === 0) {
                console.error("Fetched data is empty or invalid.");
                prayerContainer.innerHTML = "<p>Error: Prayer data is empty or could not be loaded.</p>";
                return;
            }

            groupPrompts();
            displayFullPrayer();

        } catch (error) {
            console.error("Failed to load or process prayer prompts:", error);
            prayerContainer.innerHTML = `<p>Error loading prayer data: ${error.message}. Check console for details.</p>`;
        }

        if (generateAllButton) {
            generateAllButton.addEventListener('click', displayFullPrayer);
        }
        if (loginButton) {
            loginButton.addEventListener('click', handleLogin);
        }
        if (logoutButton) {
            logoutButton.addEventListener('click', handleLogout);
        }
        if (savePrayerButton) {
            savePrayerButton.addEventListener('click', saveCurrentPrayer);
        }

        // Removed viewCalendarButton listener as calendar is always visible when logged in

        if (prevMonthButton) {
            prevMonthButton.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                renderCalendar();
            });
        }
        if (nextMonthButton) {
            nextMonthButton.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                renderCalendar();
            });
        }
        if (closeRecalledPrayerButton) {
            // No need to stop audio here, as displaySingleRecalledPrayer already stops it
            closeRecalledPrayerButton.addEventListener('click', () => {
                recalledPrayerContainer.style.display = 'none';
                recalledPrayerListContainer.style.display = 'none'; // Hide list view
                calendarContainer.style.display = 'block'; // Always show calendar after closing prayer view
            });
        }

        // Settings Modal Listeners
        if (settingsButton) {
            settingsButton.addEventListener('click', openSettingsModal);
        }
        if (closeSettingsModalButton) {
            closeSettingsModalButton.addEventListener('click', closeSettingsModal);
        }
        if (cancelSettingsButton) { // Assuming cancel just closes without saving
            cancelSettingsButton.addEventListener('click', closeSettingsModal);
        }
        if (saveSettingsButton) {
            saveSettingsButton.addEventListener('click', () => {
                saveUserSettings();
            });
        }

        // Audio Control Listeners
        if (playAudioBtn) {
            playAudioBtn.addEventListener('click', () => {
                console.log("Play button clicked!");

                buildPrayerAudioQueue(); // Ensure queue is fresh

                // Check the current state of variables
                console.log("isSpeaking:", isSpeaking);
                console.log("utteranceQueue.length:", utteranceQueue.length);
                console.log("googleTtsAudioPlayer.paused:", googleTtsAudioPlayer.paused);

                if (!isSpeaking && utteranceQueue.length > 0) {
                    console.log("Condition 1 met: Starting new playback.");
                    isSpeaking = true;
                    if (playAudioBtn) playAudioBtn.style.display = 'none';
                    if (pauseAudioBtn) pauseAudioBtn.style.display = 'inline-block';
                    if (stopAudioBtn) stopAudioBtn.style.display = 'inline-block';
                    currentUtteranceIndex = 0; // Reset for a new playback session
                    processQueue(); // Use processQueue to handle the sequence
                } else if (isSpeaking && googleTtsAudioPlayer.paused) {
                    console.log("Condition 2 met: Resuming playback.");
                    googleTtsAudioPlayer.play().catch(e => console.error("Error resuming audio:", e));
                    if (pauseAudioBtn) pauseAudioBtn.textContent = 'Pause';
                } else {
                    console.log("No playback condition met. Current state:");
                    console.log("isSpeaking:", isSpeaking);
                    console.log("utteranceQueue.length:", utteranceQueue.length);
                    if (utteranceQueue.length === 0) {
                        console.log("Utterance queue is empty. No text to play.");
                        if (currentReadingTextDiv) currentReadingTextDiv.textContent = "Nothing to read.";
                    }
                }
            });
            // Initially disable play button until prayer is loaded
            playAudioBtn.disabled = true;
        }
        if (pauseAudioBtn) {
            pauseAudioBtn.addEventListener('click', () => {
                if (googleTtsAudioPlayer && !googleTtsAudioPlayer.paused && isSpeaking) {
                    googleTtsAudioPlayer.pause();
                    clearTimeout(timeoutId); // Pause any active timeout
                    pauseAudioBtn.textContent = 'Resume';
                } else if (googleTtsAudioPlayer && googleTtsAudioPlayer.paused && isSpeaking) {
                    googleTtsAudioPlayer.play().catch(e => console.error("Error resuming audio:", e));
                    // If resuming a timed pause, processQueue will handle the next step after timeout
                    // If resuming speech, it will continue.
                    if (pauseAudioBtn) pauseAudioBtn.textContent = 'Pause';
                }
            });
        }
        if (stopAudioBtn) {
            stopAudioBtn.addEventListener('click', stopAudioPlayback); // Use the dedicated stop function
        }

        // Event listener for closing the scripture modal
        if (closeScriptureModalButton) {
            closeScriptureModalButton.addEventListener('click', hideScriptureModal);
        }

        // Event delegation for scripture links on the prayer container
        prayerContainer.addEventListener('click', async (event) => {
            const target = event.target.closest('.scripture-link'); // Use closest to handle clicks on child elements if any
            if (target && target.dataset.reference) {
                event.preventDefault(); // Prevent default <a> tag behavior
                const reference = decodeURIComponent(target.dataset.reference);
                await fetchAndDisplayScripture(reference);
            }
        });

        // Optional: Close modal on Escape key press
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && scriptureModal && scriptureModal.style.display !== 'none') {
                hideScriptureModal();
            }
        });
    }

    // Function to build the utterance queue based on current prayer data
    function buildPrayerAudioQueue() {
        utteranceQueue = [];
        currentUtteranceIndex = 0;

        userPrayerCategoryOrder.forEach(categoryName => {
            const promptData = currentPromptsDisplayed[categoryName];

            if (promptData && promptData.prompt && promptData.prompt.trim() !== '') {
                utteranceQueue.push({ type: 'speech', text: `${categoryName}.` });
                utteranceQueue.push({ type: 'speech', text: promptData.prompt });

                if (promptData.scripture_references && promptData.scripture_references.length > 0) {
                    const referencesText = `Scripture references: ${promptData.scripture_references.join(', ')}.`;
                    utteranceQueue.push({ type: 'speech', text: referencesText });
                }
                utteranceQueue.push({ type: 'pause', duration: 20000 }); // 20 seconds pause
            }
        });
    }

    // --- Calendar UI ---
    async function renderCalendar() {
        if (!currentUser || !calendarGrid || !currentMonthYearDisplay) return; // Check for elements

        calendarGrid.innerHTML = ''; // Clear previous month
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth(); // 0-indexed

        currentMonthYearDisplay.textContent = `${currentCalendarDate.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Sun) - 6 (Sat)
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const savedPrayersThisMonth = await getSavedPrayersForMonth(year, month);
        const savedDates = savedPrayersThisMonth.map(p => p.createdAt.toDate().getDate());

        // Add empty cells for days before the first of the month
        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarGrid.appendChild(document.createElement('div'));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.textContent = day;
            dayCell.classList.add('calendar-day');
            if (savedDates.includes(day)) {
                dayCell.classList.add('has-prayer');
                dayCell.addEventListener('click', async () => {
                    const clickedDate = new Date(year, month, day);
                    const prayersOnThisDay = await getPrayersForDay(clickedDate);
                    await displayRecalledPrayerList(prayersOnThisDay, clickedDate); // await
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    // Function to stop audio playback and reset UI
    function stopAudioPlayback() {
        if (googleTtsAudioPlayer) {
            googleTtsAudioPlayer.pause();
            googleTtsAudioPlayer.src = ""; // Clear the source
        }
        clearTimeout(timeoutId); // Clear any active timeout
        utteranceQueue = []; // Clear the queue
        currentUtteranceIndex = 0;
        isSpeaking = false;
        if (playAudioBtn) playAudioBtn.style.display = 'inline-block';
        if (pauseAudioBtn) { pauseAudioBtn.style.display = 'none'; pauseAudioBtn.textContent = 'Pause'; }
        if (stopAudioBtn) stopAudioBtn.style.display = 'none';
        if (currentReadingTextDiv) currentReadingTextDiv.textContent = '';
    }
    // Initial render of the calendar if user is already logged in on page load
    auth.onAuthStateChanged(user => {
        if (user) renderCalendar();
    });

    initializeApp();

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    }
});
document.addEventListener('DOMContentLoaded', () => {
    console.log("PWA App Started");

    // ... (Your other code) ...

    // Settings Modal UI Elements
    // ADD THIS console.log:
    console.log("DEBUG: Before getting settings-button. document.getElementById('settings-button') will be called.");
    const settingsButton = document.getElementById('settings-button');
    // ADD THIS console.log:
    console.log("DEBUG: After getting settings-button. settingsButton is:", settingsButton);


    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModalButton = document.getElementById('close-settings-modal-button');
    const categorySettingsList = document.getElementById('category-settings-list');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const cancelSettingsButton = document.getElementById('cancel-settings-button');

    // Audio Controls UI Elements
    // ADD THIS console.log:
    console.log("DEBUG: Before getting audio-controls. document.getElementById('audio-controls') will be called.");
    const audioControlsContainer = document.getElementById('audio-controls');
    // ADD THIS console.log:
    console.log("DEBUG: After getting audio-controls. audioControlsContainer is:", audioControlsContainer);

    const playAudioBtn = document.getElementById('playAudioBtn');
    const pauseAudioBtn = document.getElementById('pauseAudioBtn');
    const stopAudioBtn = document.getElementById('stopAudioBtn');

    // ... (Your other code) ...

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            userStatus.textContent = `Logged in as ${user.displayName || user.email}`;
            loginButton.style.display = 'none';
            if (loginPromptMessage) {
                loginPromptMessage.textContent = ''; // Clear the prompt message text
                loginPromptMessage.style.display = 'none'; // Hide prompt when logged in
            }
            logoutButton.style.display = 'inline-block';
            savePrayerButton.style.display = 'block'; // Make save button block to take full width
            mySavedPrayersHeading.style.display = 'block';

            // ADD THIS console.log, right before line 526 in your code:
            console.log("DEBUG: Inside onAuthStateChanged (user logged in). Before line 526. settingsButton:", settingsButton);
            if(settingsButton) settingsButton.style.display = 'inline-block'; // Show settings button
            // ADD THIS console.log, right before line 527 in your code:
            console.log("DEBUG: Inside onAuthStateChanged (user logged in). Before line 527. audioControlsContainer:", audioControlsContainer);
            if(audioControlsContainer) audioControlsContainer.style.display = 'block'; // Show audio controls
            savedPrayersSection.style.display = 'block'; // Show the whole section
            calendarContainer.style.display = 'block'; // Show calendar by default
        } else {
            userStatus.textContent = 'Not logged in.';
            loginButton.style.display = 'inline-block';
            if (loginPromptMessage) {
                loginPromptMessage.textContent = "Login with your Google account to save prayers and customize your experience.";
                loginPromptMessage.style.display = 'inline'; // Show prompt when not logged in
            }
            logoutButton.style.display = 'none';
            savePrayerButton.style.display = 'none';
            viewCalendarButton.style.display = 'none';
            calendarContainer.style.display = 'none';

            // ADD THIS console.log:
            console.log("DEBUG: Inside onAuthStateChanged (user NOT logged in). Before settingsButton.style.display. settingsButton:", settingsButton);
            if(settingsButton) settingsButton.style.display = 'none'; // Hide settings button
            // ADD THIS console.log:
            console.log("DEBUG: Inside onAuthStateChanged (user NOT logged in). Before audioControlsContainer.style.display. audioControlsContainer:", audioControlsContainer);
            if(audioControlsContainer) audioControlsContainer.style.display = 'none'; // Hide audio controls
            recalledPrayerContainer.style.display = 'none';
            recalledPrayerListContainer.style.display = 'none';
            calendarGrid.innerHTML = ''; // Clear calendar grid
            currentMonthYearDisplay.textContent = 'Month Year'; // Reset calendar header
        }
    });

    // ... (Rest of your code) ...

}); // End of DOMContentLoaded