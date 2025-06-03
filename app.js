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