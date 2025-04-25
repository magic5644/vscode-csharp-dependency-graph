/**
 * Highlighting module for node and edge interactions
 */

// Reference to the shared state
const state = window.graphPreviewState;

// Import from graph renderer
import { showStatus } from './graphRenderer.js';

// DOM elements
const graphContainer = document.querySelector(".graph-container");

/**
 * Clear any highlighting from nodes and edges
 */
export function clearHighlighting() {
  if (!state.highlightMode) return;
  
  try {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;
    
    // Reset node styles
    svg.querySelectorAll("g.node").forEach(node => {
      node.classList.remove("highlighted");
      node.classList.remove("faded");
    });
    
    // Reset edge styles
    svg.querySelectorAll("g.edge").forEach(edge => {
      edge.classList.remove("highlighted");
      edge.classList.remove("faded");
    });
    
    state.highlightMode = false;
    showStatus("Highlighting cleared");
  } catch (error) {
    console.error("Error clearing highlighting:", error);
  }
}

/**
 * Get a node's ID from its title element
 */
export function getNodeId(node) {
  try {
    const titleEl = node.querySelector("title");
    return titleEl ? titleEl.textContent : null;
  } catch (error) {
    console.error("Error getting node ID:", error);
    return null;
  }
}

/**
 * Sets up interactivity for the graph
 */
export function setupInteractivity() {
  try {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;
    
    // We no longer clone the SVG as it breaks the zoom behavior
    // Instead, we just remove existing listeners if any
    svg.removeEventListener("click", svgClickHandler);
    svg.addEventListener("click", svgClickHandler);
    
    showStatus("Graph ready");
  } catch (error) {
    console.error("Error setting up interactivity:", error);
  }
}

/**
 * SVG click handler function - separate to allow clean removal
 */
function svgClickHandler(event) {
  // Find if we clicked on a node or its child
  let target = event.target;
  let nodeElement = null;
  
  // Traverse up to find if we clicked in a node
  while (target && target.ownerSVGElement) {
    if (target.classList && target.classList.contains("node")) {
      nodeElement = target;
      break;
    }
    if (target.parentElement && 
        target.parentElement.classList && 
        target.parentElement.classList.contains("node")) {
      nodeElement = target.parentElement;
      break;
    }
    target = target.parentElement;
  }
  
  if (nodeElement) {
    // Node click
    event.stopPropagation();
    highlightNodeDependencies(nodeElement);
  } else if (target === event.currentTarget) {
    // Background click
    clearHighlighting();
  }
}

/**
 * Highlight a node and all its dependencies recursively
 */
export function highlightNodeDependencies(nodeElement) {
  try {
    // Get the node ID
    const clickedNodeId = getNodeId(nodeElement);
    if (!clickedNodeId) return;
    
    // Clear existing highlighting - IMPORTANT: Always reset before applying new highlights
    clearHighlighting();
    
    const svg = nodeElement.ownerSVGElement;
    if (!svg) return;
    
    // First, fade all nodes and edges
    svg.querySelectorAll("g.node").forEach(node => {
      node.classList.add("faded");
      // Make sure no old highlighting classes remain
      node.classList.remove("highlighted");
    });
    
    svg.querySelectorAll("g.edge").forEach(edge => {
      edge.classList.add("faded");
      // Make sure no old highlighting classes remain
      edge.classList.remove("highlighted");
    });
    
    // Set to track visited nodes to avoid infinite recursion
    const visitedNodes = new Set();
    // Set for all nodes that should be highlighted
    const nodesToHighlight = new Set();
    // Set for all edges that should be highlighted
    const edgesToHighlight = new Set();
    
    // Add the clicked node
    nodesToHighlight.add(clickedNodeId);
    
    // Recursive function to find all connected nodes
    function findConnectedNodes(currentNodeId) {
      // Skip if we've already visited this node
      if (visitedNodes.has(currentNodeId)) return;
      visitedNodes.add(currentNodeId);
      
      // Find all edges connected to this node
      svg.querySelectorAll("g.edge").forEach(edge => {
        const edgeId = getNodeId(edge);
        if (!edgeId) return;
        
        // Parse the edge ID (format: "source->target")
        const parts = edgeId.split("->");
        if (parts.length !== 2) return;
        
        const source = parts[0].trim();
        const target = parts[1].trim();
        
        // Check if this edge connects to our node
        if (source === currentNodeId || target === currentNodeId) {
          // Add edge to highlight list
          edgesToHighlight.add(edge);
          
          // Find the node on the other end
          const connectedNodeId = source === currentNodeId ? target : source;
          
          // Add connected node to highlight list
          nodesToHighlight.add(connectedNodeId);
          
          // Continue traversal with the connected node
          findConnectedNodes(connectedNodeId);
        }
      });
    }
    
    // Start recursive traversal from the clicked node
    findConnectedNodes(clickedNodeId);
    
    // Apply highlighting to all collected nodes
    svg.querySelectorAll("g.node").forEach(node => {
      const id = getNodeId(node);
      if (nodesToHighlight.has(id)) {
        node.classList.remove("faded");
        if (id === clickedNodeId) {
          // Only add the highlighted class to the original clicked node
          node.classList.add("highlighted");
        }
      }
    });
    
    // Apply highlighting to all collected edges
    edgesToHighlight.forEach(edge => {
      edge.classList.remove("faded");
      edge.classList.add("highlighted");
    });
    
    state.highlightMode = true;
  } catch (error) {
    console.error("Error highlighting node:", error);
    showStatus("Error highlighting node");
  }
}