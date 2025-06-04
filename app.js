document.addEventListener('DOMContentLoaded', () => {
    console.log("PWA App Started");

    const PRAYER_CATEGORY_ORDER = [
        "Adoration/Address",
        "Thanksgiving",
        "Confession",
        "Petition",
        "Intercession"
    ];

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
        // Initialize prayer history
        for (const categoryName of PRAYER_CATEGORY_ORDER) {
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

        const rerandomizeButton = document.createElement('button');
        rerandomizeButton.textContent = 'Refresh';
        rerandomizeButton.className = 'rerandomize-button action-button'; // Added action-button for consistency
        rerandomizeButton.addEventListener('click', () => reRandomizeCategory(categoryName));

        const backButton = document.createElement('button');
        backButton.textContent = 'Back';
        backButton.className = 'back-button action-button';
        backButton.disabled = true; // Initially disabled
        backButton.addEventListener('click', () => goBackCategory(categoryName));

        const reflectionButton = document.createElement('button');
        reflectionButton.textContent = 'Reflect';
        reflectionButton.className = 'reflection-button action-button';
        reflectionButton.addEventListener('click', () => toggleReflectionArea(categoryName));

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'category-button-container'; // Added class for styling
        buttonContainer.appendChild(rerandomizeButton);
        buttonContainer.appendChild(backButton);
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

        reflectionAreaContainer.appendChild(lockReflectionButton); // Add the lock button first

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
            const contentP = categoryDiv.querySelector('.prayer-text');
            if (contentP) {
                contentP.innerHTML = segmentText; // Changed to innerHTML to render scripture links
            }
            // Update back button state
            const backButton = categoryDiv.querySelector('.back-button');
            if (backButton) {
                backButton.disabled = !prayerHistory[categoryName] || prayerHistory[categoryName].length === 0;
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
        if (Object.keys(groupedByCategory).length === 0) {
            prayerContainer.innerHTML = "<p>No prayer prompts loaded. Please check data source.</p>";
            console.error("No prompts available to display.");
            return;
        }
        for (const categoryName of PRAYER_CATEGORY_ORDER) {
            // Save current prompt to history before getting a new one
            // Use the stored promptData object directly
            if (currentPromptsDisplayed[categoryName]) { // Check if it's not null (i.e., not a placeholder)
                recordHistory(categoryName, currentPromptsDisplayed[categoryName]);
            }

            const promptData = getRandomPromptForCategory(categoryName); // This can be null
            const segmentText = formatSegment(categoryName, promptData);
            updateCategoryDisplay(categoryName, segmentText, promptData); // Pass the new promptData (or null)
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
            savedPrayersSection.style.display = 'block'; // Show the whole section
            calendarContainer.style.display = 'block'; // Show calendar by default
        } else {
            userStatus.textContent = 'Not logged in.';
            loginButton.style.display = 'inline-block';
            if (loginPromptMessage) {
                loginPromptMessage.textContent = "Login with your Google account to save prayers and customize your experience";
                loginPromptMessage.style.display = 'inline'; // Show prompt when not logged in
            }
            logoutButton.style.display = 'none';
            savePrayerButton.style.display = 'none';
            viewCalendarButton.style.display = 'none';
            calendarContainer.style.display = 'none';
            recalledPrayerContainer.style.display = 'none';
            recalledPrayerListContainer.style.display = 'none';
            calendarGrid.innerHTML = ''; // Clear calendar grid
            currentMonthYearDisplay.textContent = 'Month Year'; // Reset calendar header
        }
    });

    // --- Firestore: Save and Load Prayers ---
    async function saveCurrentPrayer() { // Made the function async
        if (!currentUser) {
            alert("Please log in to save your prayer.");
            return;
        }

        // Use map to create promises for each segment's data, including potential async encryption
        const segmentDataPromises = PRAYER_CATEGORY_ORDER.map(async categoryName => {
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
                        textWithScripture: contentP.textContent,
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
                // Create a summary or use the first segment's category
                const summary = prayerDoc.segments.length > 0 ? prayerDoc.segments[0].category : "Prayer";
                listItem.textContent = `${summary} at ${prayerTime}`;
                listItem.addEventListener('click', async () => { // event listener callback is async
                    await displaySingleRecalledPrayer(prayerDoc);
                });
                recalledPrayerList.appendChild(listItem);
            });
        }
        recalledPrayerListContainer.style.display = 'block';
        recalledPrayerContainer.style.display = 'none'; // Hide single prayer view initially
        calendarContainer.style.display = 'none'; // Hide calendar
    }

    // --- ESV Scripture API Functions ---
    async function fetchAndDisplayScripture(reference) {
        if (!scriptureModal || !scriptureModalTitle || !scriptureModalBody) {
            console.error("Scripture modal elements not found in the DOM.");
            alert("Cannot display scripture: UI elements missing.");
            return;
        }

        scriptureModalTitle.textContent = `Loading: ${reference}`;
        scriptureModalBody.innerHTML = '<em>Looking up the passage...</em>';
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
                scriptureModalBody.innerHTML = data.passages.join(''); // Join all passage HTML strings
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

    // --- Initialization ---

    async function initializeApp() {
        if (!window.crypto || !window.crypto.subtle) {
            console.warn("Web Crypto API not available. Reflection encryption will be disabled.");
            // You might want to disable reflection-related buttons or show a persistent message to the user.
        }

        // Create UI structure first
        prayerContainer.innerHTML = ''; // Clear any existing content
        PRAYER_CATEGORY_ORDER.forEach(categoryName => {
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
            closeRecalledPrayerButton.addEventListener('click', () => {
                recalledPrayerContainer.style.display = 'none';
                recalledPrayerListContainer.style.display = 'none'; // Hide list view
                calendarContainer.style.display = 'block'; // Always show calendar after closing prayer view
            });
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