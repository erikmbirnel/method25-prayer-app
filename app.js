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
    const recalledPrayerDate = document.getElementById('recalled-prayer-date');
    const recalledPrayerContent = document.getElementById('recalled-prayer-content');
    const closeRecalledPrayerButton = document.getElementById('close-recalled-prayer-button');

    let currentCalendarDate = new Date(); // For calendar navigation

    // --- Core Logic (inspired by PrayerAssembler class) ---

    function groupPrompts() {
        groupedByCategory = {}; // Reset
        if (!allPromptsData) return;

        for (const item of allPromptsData) {
            const category = item.prayer_category || "Uncategorized";
            if (!groupedByCategory[category]) {
                groupedByCategory[category] = [];
            }
            // Store the prompt directly, assuming structure from outcome.json
            // { prompt: "text...", scripture_references: [...] }
            groupedByCategory[category].push(item);
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
        rerandomizeButton.className = 'rerandomize-button';
        rerandomizeButton.addEventListener('click', () => reRandomizeCategory(categoryName));

        categoryDiv.appendChild(title);
        categoryDiv.appendChild(contentP);
        categoryDiv.appendChild(rerandomizeButton);
        prayerContainer.appendChild(categoryDiv);
    }

    function updateCategoryDisplay(categoryName, segmentText) {
        const categoryId = `category-${categoryName.replace(/[\s/]+/g, '-')}`;
        const categoryDiv = document.getElementById(categoryId);
        if (categoryDiv) {
            const contentP = categoryDiv.querySelector('.prayer-text');
            if (contentP) {
                contentP.textContent = segmentText;
            }
        }
    }

    function displayFullPrayer() {
        if (Object.keys(groupedByCategory).length === 0) {
            prayerContainer.innerHTML = "<p>No prayer prompts loaded. Please check data source.</p>";
            console.error("No prompts available to display.");
            return;
        }
        for (const categoryName of PRAYER_CATEGORY_ORDER) {
            const promptData = getRandomPromptForCategory(categoryName);
            const segmentText = formatSegment(categoryName, promptData);
            updateCategoryDisplay(categoryName, segmentText);
        }
    }

    function reRandomizeCategory(categoryName) {
        const promptData = getRandomPromptForCategory(categoryName);
        const segmentText = formatSegment(categoryName, promptData);
        updateCategoryDisplay(categoryName, segmentText);
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
            logoutButton.style.display = 'inline-block';
            savePrayerButton.style.display = 'inline-block';
            savedPrayersSection.style.display = 'block';
            // Optionally, load calendar or saved prayers info here
            renderCalendar();
        } else {
            userStatus.textContent = 'Not logged in';
            loginButton.style.display = 'inline-block';
            logoutButton.style.display = 'none';
            savePrayerButton.style.display = 'none';
            savedPrayersSection.style.display = 'none';
            calendarContainer.style.display = 'none';
            recalledPrayerContainer.style.display = 'none';
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
                if (contentP && contentP.textContent !== 'Loading...' && contentP.textContent !== `(No prompt available for ${categoryName})`) {
                    prayerSegments.push({
                        category: categoryName,
                        textWithScripture: contentP.textContent
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
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Prayer saved!");
            renderCalendar(); // Re-render calendar to show new prayer mark
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

    function displayRecalledPrayer(prayerDoc) {
        recalledPrayerDate.textContent = prayerDoc.createdAt.toDate().toLocaleDateString();
        recalledPrayerContent.innerHTML = prayerDoc.segments.map(segment => 
            `<h3>${segment.category}:</h3><p>${segment.textWithScripture}</p>`
        ).join('');
        recalledPrayerContainer.style.display = 'block';
        calendarContainer.style.display = 'none'; // Hide calendar when showing prayer
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
                calendarContainer.style.display = calendarContainer.style.display === 'none' ? 'block' : 'none';
                recalledPrayerContainer.style.display = 'none'; // Hide recalled prayer if open
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
                // Optionally show calendar again if it was the previous view
                // viewCalendarButton.click(); // Or manage state more explicitly
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
                    const prayersOnThisDay = await getPrayersForDay(new Date(year, month, day));
                    if (prayersOnThisDay.length > 0) {
                        displayRecalledPrayer(prayersOnThisDay[0]); // Display the first prayer for simplicity
                        // TODO: Handle multiple prayers on the same day (e.g., show a list)
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    initializeApp();

    // Service Worker Registration (optional, but good for PWAs)
    // if ('serviceWorker' in navigator) {
    //   navigator.serviceWorker.register('/service-worker.js') // Ensure service-worker.js is in the root
    //     .then(registration => {
    //       console.log('Service Worker registered with scope:', registration.scope);
    //     })
    //     .catch(error => {
    //       console.error('Service Worker registration failed:', error);
    //     });
    // }
});
//the following are the rules in the Firestore Database as of June 03, 2025. I include for reference://rules_version = '2';
//service cloud.firestore {
  //match /databases/{database}/documents {
    // Users can only read and write their own saved prayers
    //match /users/{userId}/savedPrayers/{prayerId} {
      //allow read, write: if request.auth != null && request.auth.uid == userId;
    //}
    // You might add rules for a user profile document later if needed
    // match /users/{userId} {
    //   allow read, update: if request.auth != null && request.auth.uid == userId;
    //   allow create: if request.auth != null; // Or more specific rules
    // }
  //}
//}