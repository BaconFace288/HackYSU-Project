/**
 * crisis_utils.js - Shared crisis detection and support utilities
 */

export const CRISIS_KEYWORDS = [
    // Self-harm / suicide (Standard)
    'suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'end it all',
    'take my life', 'take my own life', 'want to die', 'wanna die', 'going to die',
    'i want to die', 'i wanna die', 'dont want to live', "don't want to live",
    'no reason to live', 'not worth living', 'life is not worth', 'tired of living',
    'self harm', 'self-harm', 'cutting myself', 'hurt myself', 'hurting myself',
    'overdose', 'hang myself', 'shoot myself', 'slit my wrists',
    
    // Subtle / Less common phrases (New)
    'goodbye everyone', 'tired of everything', "can't go on", 'wont be around', 
    'done with life', 'leaving forever', 'nothing matters anymore', 'sleep forever',
    'everyone would be better off', 'no way out', 'better off dead', 'end this pain',
    'final goodbye', 'planning to leave', 'stop the pain', 'give up', 'given up',
    'dont see a future', "don't see a future", 'worthless', 'hopeless', 'meaningless',
    
    // Harm to others
    'kill someone', 'hurt someone', 'harm someone', 'going to hurt', 'going to kill',
    'want to hurt', 'want to kill', 'shooting', 'stabbing'
];

/**
 * Normalizes text for better keyword matching (simplified version of leet normalization)
 */
function normalizeText(text) {
    if (!text) return "";
    return text.toLowerCase()
        .replace(/[\u200b-\u200f\ufeff]/g, '') // invisible chars
        .replace(/[-._*,;:'"(){}\[\]<>!?]/g, ' ') // replace separators with space
        .replace(/\s+/g, ' ') // collapse spaces
        .trim();
}

/**
 * Checks if a string contains any crisis keywords
 * @param {string} text 
 * @returns {string|null} The matched keyword or null
 */
export function checkForCrisisKeywords(text) {
    if (!text) return null;
    const lower = normalizeText(text);
    
    // Check for exact matches and common variations
    for (const kw of CRISIS_KEYWORDS) {
        if (lower.includes(kw)) {
            return kw;
        }
    }
    return null;
}

/**
 * Centralized way to show the crisis popup across different pages
 */
export function triggerCrisisPopup() {
    const popup = document.getElementById('crisis-popup');
    if (!popup) {
        console.warn("Crisis popup element not found in DOM.");
        return;
    }
    
    // Re-trigger animation
    popup.style.display = 'none';
    void popup.offsetWidth;
    popup.style.display = 'block';
    
    // Auto-dismiss after 30 seconds
    if (window._crisisPopupTimer) clearTimeout(window._crisisPopupTimer);
    window._crisisPopupTimer = setTimeout(() => {
        popup.style.display = 'none';
    }, 30000);
}
