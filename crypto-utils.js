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
        // Consider showing a one-time message to the user about key management here
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
