/**
 * Main entry point for the graph preview functionality
 * Coordinates all the modules and sets up event listeners
 */

// Acquire VS Code API once and make it available globally
// This prevents the "An instance of the VS Code API has already been acquired" error
window.vscode = acquireVsCodeApi();

// Import functions from modules
import { initializeGraphviz, renderGraph, resetView, showStatus } from './graphRenderer.js';
import { clearHighlighting } from './nodeHighlighter.js';
import { toggleCyclesView, updateCycleBadge } from './cycleAnalyzer.js';
import { exportSvg } from './exportSvg.js';

// Get state from window
const state = window.graphPreviewState;

// DOM elements
let engineSelect;
let resetBtn;
let exportBtn; 
let resetHighlightBtn;
let toggleCyclesBtn;

/**
 * Load a script dynamically with proper error handling
 * @param {string} src - Source URL of the script to load
 * @returns {Promise<void>} Promise that resolves when script is loaded
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = (e) => {
      console.error(`Failed to load script: ${src}`, e);
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Loads external dependencies and initializes the application
 * @returns {Promise<void>}
 */
async function loadDependencies() {
  try {
    // Log the paths for debugging
    console.log('Loading scripts...');
    
    // Check if required URIs are defined
    if (!window.d3Uri || !window.graphvizUri || !window.d3GraphvizUri) {
      throw new Error('Required script URIs are not defined');
    }
    
    console.log('d3Uri:', window.d3Uri);
    console.log('graphvizUri:', window.graphvizUri);
    console.log('d3GraphvizUri:', window.d3GraphvizUri);

    // Try to load the scripts in sequence with proper error handling
    await loadScript(window.d3Uri);
    console.log('D3 loaded successfully');
    
    await loadScript(window.graphvizUri);
    console.log('Graphviz loaded successfully');
    
    await loadScript(window.d3GraphvizUri);
    console.log('D3-Graphviz loaded successfully');
    
    // Initialize the application once dependencies are loaded
    initialize();
  } catch (error) {
    // Display a more useful error message
    console.error('Error initializing webview:', error);
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = `Error: ${error.message}`;
      statusElement.style.color = 'red';
    }
  }
}

/**
 * Initialize DOM elements by getting references
 */
function initializeDomElements() {
  engineSelect = document.getElementById("engineSelect");
  resetBtn = document.getElementById("resetBtn");
  exportBtn = document.getElementById("exportBtn");
  resetHighlightBtn = document.getElementById("resetHighlightBtn");
  toggleCyclesBtn = document.getElementById("toggleCyclesBtn");
  
  // Validate that required elements exist
  if (!engineSelect || !resetBtn || !exportBtn || !resetHighlightBtn) {
    throw new Error('Required DOM elements not found');
  }
}

/**
 * Initialize the application
 */
function initialize() {
  try {
    // Get DOM element references
    initializeDomElements();
    
    // Initialize the graph renderer
    state.graphviz = initializeGraphviz();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up cycle badge if needed
    if (state.hasCycles && toggleCyclesBtn) {
      updateCycleBadge();
    }
    
    // Initial render
    renderGraph();
  } catch (error) {
    console.error('Error during initialization:', error);
    showStatus(`Initialization error: ${error.message}`, 'error');
  }
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Engine selector
  engineSelect.addEventListener("change", function() {
    state.currentEngine = this.value;
    showStatus(`Switching to ${state.currentEngine} engine`);
    renderGraph();
  });
  
  // Reset view button
  resetBtn.addEventListener("click", resetView);
  
  // Export SVG button
  exportBtn.addEventListener("click", exportSvg);
  
  // Reset highlighting button
  resetHighlightBtn.addEventListener("click", clearHighlighting);
  
  // Toggle cycles button
  if (state.hasCycles && toggleCyclesBtn) {
    toggleCyclesBtn.addEventListener("click", toggleCyclesView);
  }
  
  // Handle window resize
  window.addEventListener("resize", function() {
    if (state.graphviz) {
      try {
        state.graphviz.width("100%").height("100%");
      } catch (err) {
        // Ignore resize errors
        console.debug('Error during resize:', err);
      }
    }
  });
}

// Ensure DOM is ready before initialization
document.addEventListener("DOMContentLoaded", () => {
  console.log('DOM content loaded');
  // Start loading dependencies when DOM is ready
  loadDependencies();
});