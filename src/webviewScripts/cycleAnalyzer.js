/**
 * Cycle analysis module for managing cycle detection and visualization
 */

// Reference to the shared state
const state = window.graphPreviewState;

// Import from graph renderer
import { showStatus, renderGraph } from './graphRenderer.js';

// DOM elements
const toggleCyclesBtn = document.getElementById("toggleCyclesBtn");

/**
 * Toggles between normal and cycles-only view
 */
export function toggleCyclesView() {
  state.isShowingCyclesOnly = !state.isShowingCyclesOnly;
  
  // Update button appearance
  const buttonText = state.isShowingCyclesOnly ? "Show Full Graph" : "Show Cycles Only";
  if (toggleCyclesBtn.firstChild) {
    toggleCyclesBtn.firstChild.textContent = buttonText;
  } else {
    toggleCyclesBtn.textContent = buttonText;
  }
  toggleCyclesBtn.classList.toggle("active", state.isShowingCyclesOnly);
  
  // Ensure the cycle badge remains in place
  const badge = document.getElementById("cycleBadge");
  if (!badge && state.hasCycles) {
    // Recreate the badge if it disappeared but cycles exist
    const newBadge = document.createElement("span");
    newBadge.id = "cycleBadge";
    newBadge.className = "cycle-badge";
    toggleCyclesBtn.appendChild(newBadge);
    
    // Update the badge content
    updateCycleBadge();
  }
  
  // Switch the DOT source
  state.dotSource = state.isShowingCyclesOnly ? state.cyclesOnlyDotSource : state.normalDotSource;
  
  // Re-render the graph
  renderGraph();
  
  showStatus(state.isShowingCyclesOnly ? "Showing cycles only" : "Showing full graph");
}

/**
 * Updates the cycle badge with the current number of cycles
 */
export function updateCycleBadge() {
  if (state.hasCycles) {
    const badge = document.getElementById("cycleBadge");
    if (badge) {
      // Initialize cycle counter
      let cycleCount = 0;
      let _isCountReliable = false;
      
      // Method 1: Try to count cycles from the cycles-only DOT content (most reliable)
      if (state.cyclesOnlyDotSource) {
        try {
          // Search for cycle patterns in DOT content
          const cycleMatches = state.cyclesOnlyDotSource.match(/subgraph cluster_cycle_\d+/g) || [];
          if (cycleMatches.length > 0) {
            cycleCount = cycleMatches.length;
            _isCountReliable = true;
            console.log("Found " + cycleCount + " cycles from subgraph patterns (reliable)");
          } else {
            // Try another method - search for label="Cycle"
            const labelMatches = state.cyclesOnlyDotSource.match(/label="Cycle \d+/g) || [];
            if (labelMatches.length > 0) {
              cycleCount = labelMatches.length;
              _isCountReliable = true;
              console.log("Found " + cycleCount + " cycles from label patterns (reliable)");
            }
          }
        } catch (e) {
          console.error("Error analyzing DOT content:", e);
        }
      }
      
      // If we still have no reliable cycle count but hasCycles is true, set a default
      if (cycleCount === 0 && state.hasCycles) {
        // We know there are cycles, so set at least 1
        cycleCount = 1;
        _isCountReliable = true; // Consider this reliable since we know cycles exist
        console.log("Using default cycle count (1) since we know cycles exist");
      }
      
      // Update the badge display with our count
      updateBadgeDisplay(cycleCount);
      
      // Helper function to update the badge display
      function updateBadgeDisplay(count) {
        badge.textContent = count > 99 ? "99+" : count.toString();
        
        // Adjust badge size
        if (count >= 10) {
          badge.style.width = "22px";
        } else {
          badge.style.width = "18px";
        }
        
        if (count >= 100) {
          badge.style.width = "26px";
        }
      }
    }
  }
}