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
    let currentUser = null;

    // UI Elements for new features
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userStatus = document.getElementById('user-status');
    const savePrayerButton = document.getElementById('save-prayer-button');
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
    const mySavedPrayersHeading = document.getElementById('my-saved-prayers-heading');
    const loginPromptMessage = document.getElementById('login-prompt-message');
    let currentCalendarDate = new Date(); // For calendar navigation

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

    function formatSegment(categoryName, promptData) {
        if (!promptData) {
            return `(No prompt available for ${categoryName})`;
        }

        const text = promptData.prompt || "";
        const scriptureRefsList = promptData.scripture_references || [];
        let scriptureDisplay = "";

        if (scriptureRefsList.length > 0) {
            // Join with ". " if multiple, or just use the single one.
            const formattedScriptures = scriptureRefsList.join(". ");
            scriptureDisplay = ` (${formattedScriptures})`;
        }
        return `${text}${scriptureDisplay}`;
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

        const saveReflectionButton = document.createElement('button');
        saveReflectionButton.textContent = 'Lock Reflection';
        saveReflectionButton.className = 'save-reflection-button action-button'; // Use action-button for base styling
        saveReflectionButton.addEventListener('click', () => handleLockReflectionClick(categoryName));

        reflectionAreaContainer.appendChild(reflectionTextarea);
        reflectionAreaContainer.appendChild(saveReflectionButton);

        categoryDiv.appendChild(title);
        categoryDiv.appendChild(contentP);
        categoryDiv.appendChild(reflectionAreaContainer); // Add the container for textarea and its lock button
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
                contentP.textContent = segmentText;
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
                const saveReflectionButton = reflectionAreaContainer.querySelector('.save-reflection-button');
                if (reflectionTextarea) {
                    reflectionTextarea.value = '';
                    reflectionTextarea.readOnly = false;
                    reflectionTextarea.classList.remove('frozen');
                }
                if (saveReflectionButton) {
                    saveReflectionButton.textContent = 'Lock Reflection';
                }
            }
        }
    }

    function toggleReflectionArea(categoryName) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        const reflectionAreaContainer = categoryDiv.querySelector('.reflection-area');
        reflectionAreaContainer.style.display = reflectionAreaContainer.style.display === 'none' ? 'block' : 'none';
        if (reflectionAreaContainer.style.display === 'block') {
            const reflectionTextarea = reflectionAreaContainer.querySelector('.reflection-textarea');
            if (!reflectionTextarea.readOnly) { // Only focus if not already locked
                reflectionTextarea.focus();
            }
        }
    }

    function handleLockReflectionClick(categoryName) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        const reflectionTextarea = categoryDiv.querySelector('.reflection-textarea');
        const lockButton = categoryDiv.querySelector('.save-reflection-button');

        reflectionTextarea.readOnly = !reflectionTextarea.readOnly; // Toggle readOnly state
        reflectionTextarea.classList.toggle('frozen');
        lockButton.textContent = reflectionTextarea.readOnly ? 'Edit Reflection' : 'Lock Reflection';
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
            loginPromptMessage.style.display = 'none';
            logoutButton.style.display = 'inline-block';
            savePrayerButton.style.display = 'inline-block'; // Or 'flex' if parent is flex
            viewCalendarButton.style.display = 'inline-block'; // Or 'flex'
            mySavedPrayersHeading.style.display = 'block';
            // renderCalendar(); // Called when 'View Calendar' is clicked
        } else {
            userStatus.textContent = 'Not logged in.';
            loginButton.style.display = 'inline-block';
            loginPromptMessage.style.display = 'inline'; // Show prompt
            logoutButton.style.display = 'none';
            savePrayerButton.style.display = 'none';
            viewCalendarButton.style.display = 'none';
            savedPrayersSection.style.display = 'none'; // Hide the whole section
            calendarContainer.style.display = 'none';
            recalledPrayerContainer.style.display = 'none';
            recalledPrayerListContainer.style.display = 'none';
            calendarGrid.innerHTML = ''; // Clear calendar grid
            currentMonthYearDisplay.textContent = 'Month Year'; // Reset calendar header
        }
    });

    // --- Firestore: Save and Load Prayers ---
    async function saveCurrentPrayer() {
        if (!currentUser) {
            alert("Please log in to save your prayer.");
            return;
        }

        const prayerSegments = [];
        let prayerIsEmpty = true;
        PRAYER_CATEGORY_ORDER.forEach(categoryName => {
            const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
            const categoryDiv = document.getElementById(categoryId);
            if (categoryDiv) {
                const contentP = categoryDiv.querySelector('.prayer-text');
                const reflectionAreaContainer = categoryDiv.querySelector('.reflection-area');
                let reflectionText = "";

                if (reflectionAreaContainer && reflectionAreaContainer.style.display !== 'none') {
                    const reflectionTextarea = reflectionAreaContainer.querySelector('.reflection-textarea');
                    // Only save reflection if the textarea is locked (readOnly) and has content
                    if (reflectionTextarea && reflectionTextarea.readOnly && reflectionTextarea.value.trim() !== '') {
                        reflectionText = reflectionTextarea.value.trim();
                    }
                }

                if (contentP && contentP.textContent !== 'Loading...' && !contentP.textContent.startsWith('(No prompt available for')) {
                    prayerSegments.push({
                        category: categoryName,
                        textWithScripture: contentP.textContent, // This is the formatted string
                        reflection: reflectionText // Add reflection text
                    });
                    prayerIsEmpty = false;
                }
            }
        });

        if (prayerIsEmpty) {
            alert("Cannot save an empty prayer.");
            return;
        }

        try {
            await db.collection('users').doc(currentUser.uid).collection('savedPrayers').add({
                segments: prayerSegments,
                createdAt: firebase.firestore.FieldValue.serverTimestamp() // Use server timestamp
            });
            alert("Prayer saved!");
            if (calendarContainer.style.display === 'block') { // If calendar is visible, refresh it
                renderCalendar();
            }
        } catch (error) {
            console.error("Error saving prayer: ", error);
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

    function displaySingleRecalledPrayer(prayerDoc) {
        recalledPrayerDate.textContent = prayerDoc.createdAt.toDate().toLocaleDateString() + " " + prayerDoc.createdAt.toDate().toLocaleTimeString();
        recalledPrayerContent.innerHTML = prayerDoc.segments.map(segment => {
            let segmentHTML = `<h3>${segment.category}:</h3><p>${segment.textWithScripture}</p>`;
            if (segment.reflection && segment.reflection.trim() !== '') {
                segmentHTML += `<div class="saved-reflection"><p><em>Your Reflection:</em></p><p>${segment.reflection.replace(/\n/g, '<br>')}</p></div>`;
            }
            return segmentHTML;
        }).join('');
        recalledPrayerContainer.style.display = 'block';
        recalledPrayerListContainer.style.display = 'none'; // Hide list when single prayer is shown
        calendarContainer.style.display = 'none'; // Hide calendar when showing prayer
    }

    function displayRecalledPrayerList(prayers, date) {
        recalledPrayerList.innerHTML = ''; // Clear previous list
        recalledPrayerListDate.textContent = date.toLocaleDateString();

        if (prayers.length === 0) {
            recalledPrayerList.innerHTML = '<li>No prayers saved for this day.</li>';
        } else if (prayers.length === 1) {
            displaySingleRecalledPrayer(prayers[0]); // If only one, display it directly
            return;
        } else {
            prayers.forEach(prayerDoc => {
                const listItem = document.createElement('li');
                const prayerTime = prayerDoc.createdAt.toDate().toLocaleTimeString();
                // Create a summary or use the first segment's category
                const summary = prayerDoc.segments.length > 0 ? prayerDoc.segments[0].category : "Prayer";
                listItem.textContent = `${summary} at ${prayerTime}`;
                listItem.addEventListener('click', () => displaySingleRecalledPrayer(prayerDoc));
                recalledPrayerList.appendChild(listItem);
            });
        }
        recalledPrayerListContainer.style.display = 'block';
        recalledPrayerContainer.style.display = 'none'; // Hide single prayer view initially
        calendarContainer.style.display = 'none'; // Hide calendar
    }


    // --- Initialization ---

    async function initializeApp() {
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
        if (viewCalendarButton) {
            viewCalendarButton.addEventListener('click', () => {
                savedPrayersSection.style.display = 'block'; // Ensure parent section is visible
                calendarContainer.style.display = calendarContainer.style.display === 'none' ? 'block' : 'none';
                recalledPrayerContainer.style.display = 'none'; // Hide recalled prayer if open
                recalledPrayerListContainer.style.display = 'none'; // Hide list
                if (calendarContainer.style.display === 'block') {
                    renderCalendar();
                }
            });
        }
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
                recalledPrayerListContainer.style.display = 'none';
                // Optionally show calendar again if it was the previous view
                if (savedPrayersSection.style.display === 'block') {
                    calendarContainer.style.display = 'block';
                }
            });
        }
    }

    // --- Calendar UI ---
    async function renderCalendar() {
        if (!currentUser || calendarContainer.style.display === 'none') return;

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
                    displayRecalledPrayerList(prayersOnThisDay, clickedDate);
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

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