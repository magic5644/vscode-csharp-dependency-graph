// filepath: /Users/gildaslebournault/github/vscode-csharp-dependency-graph/src/cycleDetector.ts
import { Project } from './csprojParser';
import { ClassDependency } from './csharpClassParser';

export interface Cycle {
    nodes: string[];
    type: 'project' | 'class';
    complexity: number; // Number of nodes involved in the cycle
}

export interface CycleAnalysisResult {
    cycles: Cycle[];
    hotspots: Array<{ node: string; cycleCount: number }>;
    breakPoints: Array<{ node: string; impact: number }>; // Impact = number of cycles that would be broken
}

/**
 * Utility class for cycle-related operations
 */
class CycleUtils {
    /**
     * Cache for memoizing cycle detection results
     */
    private static readonly cycleCache = new Map<string, string[][]>();

    /**
     * Generates a cache key for a graph
     */
    private static generateCacheKey(graph: Map<string, string[]>): string {
        const entries = Array.from(graph.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(entries);
    }

    /**
     * Gets cached cycles for a graph if available
     */
    public static getCachedCycles(graph: Map<string, string[]>): string[][] | undefined {
        const cacheKey = CycleUtils.generateCacheKey(graph);
        return CycleUtils.cycleCache.get(cacheKey);
    }

    /**
     * Stores cycles in cache for a graph
     */
    public static storeCycles(graph: Map<string, string[]>, cycles: string[][]): void {
        const cacheKey = CycleUtils.generateCacheKey(graph);
        CycleUtils.cycleCache.set(cacheKey, cycles);
    }

    /**
     * Removes duplicate cycles (cycles that are rotations of each other)
     */
    public static removeDuplicateCycles(cycles: string[][]): string[][] {
        const normalizedCycles = new Map<string, string[]>();
        
        for (const cycle of cycles) {
            // Sort the cycle to create a canonical form
            const sorted = [...cycle].sort((a, b) => a.localeCompare(b));
            const key = sorted.join('->');
            
            // Only keep the shortest cycle for each set of nodes
            if (!normalizedCycles.has(key) || normalizedCycles.get(key)!.length > cycle.length) {
                normalizedCycles.set(key, cycle);
            }
        }
        
        return Array.from(normalizedCycles.values());
    }

    /**
     * Checks if a cycle is already in the list (accounting for rotations)
     */
    public static isCycleAlreadyDetected(cycle: string[], existingCycles: string[][]): boolean {
        if (cycle.length === 0) {
            return true;
        }
        
        const normalizedCycle = CycleUtils.normalizeCycle(cycle);
        const cycleStr = normalizedCycle.join('->');
        
        // Check against existing cycles
        for (const existingCycle of existingCycles) {
            if (existingCycle.length !== cycle.length) {
                continue;
            }
            
            const normalizedExisting = CycleUtils.normalizeCycle(existingCycle);
            const existingCycleStr = normalizedExisting.join('->');
            
            if (cycleStr === existingCycleStr) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Normalizes a cycle to start with its lexicographically smallest node
     */
    private static normalizeCycle(cycle: string[]): string[] {
        // Canonical form: Start with the lexicographically smallest node
        let minNodeIndex = 0;
        for (let i = 1; i < cycle.length; i++) {
            if (cycle[i].localeCompare(cycle[minNodeIndex]) < 0) {
                minNodeIndex = i;
            }
        }
        
        // Create a normalized representation of the cycle
        const normalized = [];
        for (let i = 0; i < cycle.length; i++) {
            normalized.push(cycle[(minNodeIndex + i) % cycle.length]);
        }
        
        return normalized;
    }
}

/**
 * Detects cycles in project dependencies
 */
export function detectProjectCycles(projects: Project[]): CycleAnalysisResult {
    // Create an adjacency map for the graph
    const graph: Map<string, string[]> = new Map();
    
    // Build the graph from project dependencies
    for (const project of projects) {
        graph.set(project.name, [...project.dependencies]);
    }
    
    // Detect cycles using iterative DFS
    const cycles = findAllCycles(graph);
    
    // Map cycles to the expected format
    const formattedCycles = cycles.map(cycle => ({
        nodes: cycle,
        type: 'project' as const,
        complexity: cycle.length
    }));
    
    // Analyze hotspots and breakpoints
    const analysis = analyzeHotspotsAndBreakpoints(formattedCycles);
    
    return {
        cycles: formattedCycles,
        hotspots: analysis.hotspots,
        breakPoints: analysis.breakPoints
    };
}

/**
 * Detects cycles in class dependencies
 */
export function detectClassCycles(classDependencies: ClassDependency[]): CycleAnalysisResult {
    // Create an adjacency map for the class dependency graph
    const graph: Map<string, string[]> = new Map();
    
    // Build the graph from class dependencies
    for (const classDep of classDependencies) {
        const sourceNodeId = `${classDep.projectName}.${classDep.className}`;
        const targets: string[] = [];
        
        for (const dependency of classDep.dependencies) {
            // Find the target class for this dependency
            const targetClass = classDependencies.find(
                c => c.className === dependency.className && 
                     c.namespace === dependency.namespace
            );
            
            if (targetClass) {
                const targetNodeId = `${targetClass.projectName}.${targetClass.className}`;
                targets.push(targetNodeId);
            }
        }
        
        graph.set(sourceNodeId, targets);
    }
    
    // Detect cycles using iterative DFS
    const cycles = findAllCycles(graph);
    
    // Map cycles to the expected format
    const formattedCycles = cycles.map(cycle => ({
        nodes: cycle,
        type: 'class' as const,
        complexity: cycle.length
    }));
    
    // Analyze hotspots and breakpoints
    const analysis = analyzeHotspotsAndBreakpoints(formattedCycles);
    
    return {
        cycles: formattedCycles,
        hotspots: analysis.hotspots,
        breakPoints: analysis.breakPoints
    };
}

/**
 * Finds all cycles in a directed graph using a non-recursive iterative DFS approach with memoization
 */
function findAllCycles(graph: Map<string, string[]>): string[][] {
    // Use memoization to avoid recomputing cycles
    const cachedResult = CycleUtils.getCachedCycles(graph);
    if (cachedResult) {
        return cachedResult;
    }
    
    const cycles: string[][] = [];
    const visited = new Set<string>();
    
    // For each node, start a DFS
    for (const startNode of graph.keys()) {
        if (visited.has(startNode)) {
            continue;
        }
        
        findCyclesFromNode(startNode, graph, visited, cycles);
    }
    
    const result = CycleUtils.removeDuplicateCycles(cycles);
    
    // Store in cache for future use
    CycleUtils.storeCycles(graph, result);
    
    return result;
}

/**
 * Find cycles starting from a specific node using an iterative DFS approach
 */
function findCyclesFromNode(
    startNode: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    cycles: string[][]
): void {
    // Use an iterative DFS to prevent stack overflow
    const stack: Array<{
        node: string;
        neighbors: string[];
        index: number;
        path: string[];
        inPath: Set<string>;
    }> = [];
    
    const neighbors = graph.get(startNode) || [];
    stack.push({
        node: startNode,
        neighbors,
        index: 0,
        path: [startNode],
        inPath: new Set([startNode])
    });
    
    while (stack.length > 0) {
        const current = stack.at(-1)!;
        
        if (current.index >= current.neighbors.length) {
            // Handle backtracking
            handleBacktracking(stack);
            continue;
        }
        
        const neighbor = current.neighbors[current.index++];
        
        // If the neighbor is in our current path, we found a cycle
        if (current.inPath.has(neighbor)) {
            handleCycleDetection(current.path, neighbor, cycles);
            continue;
        }
        
        // If we've already fully explored this node, skip it
        if (visited.has(neighbor)) {
            continue;
        }
        
        // Add the neighbor to our path and explore it
        exploreNeighbor(neighbor, graph, stack);
    }
    
    visited.add(startNode);
}

/**
 * Handle backtracking during DFS
 */
function handleBacktracking(stack: Array<{
    node: string;
    neighbors: string[];
    index: number;
    path: string[];
    inPath: Set<string>;
}>): void {
    const current = stack.pop();
    if (!current) {return;}
    
    if (stack.length > 0) {
        // Remove the current node from the path in the parent frame
        const path = stack.at(-1)!.path;
        const inPath = stack.at(-1)!.inPath;
        if (path.at(-1) === current.node) {
            path.pop();
            inPath.delete(current.node);
        }
    }
}

/**
 * Handle cycle detection
 */
function handleCycleDetection(
    path: string[],
    cycleEndNode: string,
    cycles: string[][]
): void {
    const cycleStartIndex = path.indexOf(cycleEndNode);
    const cycle = [...path.slice(cycleStartIndex), cycleEndNode];
    
    // Check if we already detected this cycle (or a rotation of it)
    if (!CycleUtils.isCycleAlreadyDetected(cycle, cycles)) {
        cycles.push(cycle);
    }
}

/**
 * Explore a neighbor node during DFS
 */
function exploreNeighbor(
    neighbor: string,
    graph: Map<string, string[]>,
    stack: Array<{
        node: string;
        neighbors: string[];
        index: number;
        path: string[];
        inPath: Set<string>;
    }>
): void {
    const current = stack.at(-1)!;
    const neighborNeighbors = graph.get(neighbor) || [];
    const newPath = [...current.path, neighbor];
    const newInPath = new Set(current.inPath);
    newInPath.add(neighbor);
    
    stack.push({
        node: neighbor,
        neighbors: neighborNeighbors,
        index: 0,
        path: newPath,
        inPath: newInPath
    });
}

/**
 * Analyzes cycles to find hotspots and potential breakpoints
 */
function analyzeHotspotsAndBreakpoints(cycles: Cycle[]): { 
    hotspots: Array<{ node: string; cycleCount: number }>; 
    breakPoints: Array<{ node: string; impact: number }>; 
} {
    // Count how many times each node appears in cycles
    const nodeCounts = new Map<string, number>();
    
    for (const cycle of cycles) {
        for (const node of cycle.nodes) {
            nodeCounts.set(node, (nodeCounts.get(node) ?? 0) + 1);
        }
    }
    
    // Sort nodes by frequency to find hotspots
    const hotspots = Array.from(nodeCounts.entries())
        .map(([node, count]) => ({ node, cycleCount: count }))
        .sort((a, b) => b.cycleCount - a.cycleCount);
    
    // Analyze each node for its potential impact as a breakpoint
    const breakPointAnalysis = new Map<string, number>();
    
    for (const node of nodeCounts.keys()) {
        // For each cycle containing this node
        let impactCount = 0;
        
        for (const cycle of cycles) {
            if (cycle.nodes.includes(node)) {
                impactCount++;
            }
        }
        
        breakPointAnalysis.set(node, impactCount);
    }
    
    // Sort nodes by impact to find key breakpoints
    const breakPoints = Array.from(breakPointAnalysis.entries())
        .map(([node, impact]) => ({ node, impact }))
        .sort((a, b) => b.impact - a.impact);
    
    return { hotspots, breakPoints };
}

/**
 * Generates a DOT (Graphviz) graph highlighting cycles
 */
export function generateDotWithHighlightedCycles(
    dotContent: string,
    cycles: Cycle[]
): string {
    if (cycles.length === 0) {
        return dotContent;
    }
    
    // Create a set of edges that are part of cycles
    const cyclicEdges = new Set<string>();
    
    for (const cycle of cycles) {
        for (let i = 0; i < cycle.nodes.length; i++) {
            const sourceNode = cycle.nodes[i];
            const targetNode = cycle.nodes[(i + 1) % cycle.nodes.length];
            cyclicEdges.add(`${sourceNode} -> ${targetNode}`);
        }
    }
    
    // Add attributes to highlight cyclic edges and nodes
    let modifiedDot = dotContent;
    
    // Create a style definition for cyclic edges
    const cyclicEdgeDefinition = 'edge [color="#FF0000", penwidth=2.0];\n';
    
    // Insert this right after the initial edge definition
    modifiedDot = modifiedDot.replace(
        /edge \[.*?\];/,
        match => match + '\n  // Cycle highlighting\n  ' + cyclicEdgeDefinition
    );
    
    // Update the dot content by adding "color" and "penwidth" attributes to cyclic edges
    const lines = modifiedDot.split('\n');
    const modifiedLines = lines.map(line => {
        // Skip comment lines and lines without edges
        if (line.trim().startsWith('//') || !line.includes('->')) {
            return line;
        }
        
        // Use a more precise regex to match edge definitions
        // This will extract the exact source and target nodes
        const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/;
        const edgeMatch = edgeRegex.exec(line);
        if (!edgeMatch) {
            return line;
        }
        
        const sourceNode = edgeMatch[1];
        const targetNode = edgeMatch[2];
        
        // Check if this exact edge is part of a cycle
        if (cyclicEdges.has(`${sourceNode} -> ${targetNode}`)) {
            return line.replace(/\];/, ', color="#FF0000", penwidth=2.0, fontcolor="#FF0000", label="cycle"];');
        }
        
        return line;
    });
    
    return modifiedLines.join('\n');
}

/**
 * Creates a DOT graph that shows only the cycles
 */
export function generateCyclesOnlyGraph(cycles: Cycle[]): string {
    if (cycles.length === 0) {
        return 'digraph CyclicDependencies {\n  label="No cycles detected";\n}\n';
    }
    
    let dotContent = 'digraph CyclicDependencies {\n';
    dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14, label="Dependency Cycles"];\n';
    dotContent += '  node [shape=box, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=11];\n';
    dotContent += '  edge [color="#FF0000", fontname="Helvetica", fontsize=9];\n\n';
    
    // Create subgraphs for each cycle
    for (let i = 0; i < cycles.length; i++) {
        const cycle = cycles[i];
        
        dotContent += `  subgraph cluster_cycle_${i} {\n`;
        dotContent += `    label="Cycle ${i+1} (Complexity: ${cycle.complexity})";\n`;
        dotContent += '    style="filled";\n';
        dotContent += '    color="#FFCCCC";\n\n';
        
        // Add nodes for this cycle
        for (const node of cycle.nodes) {
            dotContent += `    "${node}" [tooltip="${node}"];\n`;
        }
        
        // Add edges for this cycle
        for (let j = 0; j < cycle.nodes.length; j++) {
            const sourceNode = cycle.nodes[j];
            const targetNode = cycle.nodes[(j + 1) % cycle.nodes.length];
            dotContent += `    "${sourceNode}" -> "${targetNode}" [penwidth=1.5];\n`;
        }
        
        dotContent += '  }\n\n';
    }
    
    dotContent += '}\n';
    return dotContent;
}

/**
 * Generates a comprehensive report about the cycles
 */
export function generateCycleReport(result: CycleAnalysisResult): string {
    if (result.cycles.length === 0) {
        return "# Dependency Cycle Analysis\n\nNo dependency cycles detected. Congratulations!";
    }
    
    let report = "# Dependency Cycle Analysis\n\n";
    
    report += `## Summary\n\n`;
    report += `- **Total cycles detected**: ${result.cycles.length}\n`;
    report += `- **Average cycle complexity**: ${(result.cycles.reduce((sum, cycle) => sum + cycle.complexity, 0) / result.cycles.length).toFixed(1)}\n`;
    report += `- **Longest cycle**: ${Math.max(...result.cycles.map(c => c.complexity))} nodes\n\n`;
    
    report += `## Cycles (ordered by complexity)\n\n`;
    
    // Sort cycles by complexity (descending)
    const sortedCycles = [...result.cycles].sort((a, b) => b.complexity - a.complexity);
    
    for (let i = 0; i < sortedCycles.length; i++) {
        const cycle = sortedCycles[i];
        report += `### Cycle ${i+1} (Complexity: ${cycle.complexity})\n\n`;
        report += `\`${cycle.nodes.join(' → ')} → ${cycle.nodes[0]}\`\n\n`;
    }
    
    report += `## Hotspots\n\n`;
    report += `These components appear in multiple dependency cycles and might indicate design issues:\n\n`;
    
    report += "| Component | Appears in Cycles |\n";
    report += "|-----------|------------------|\n";
    
    for (let i = 0; i < Math.min(10, result.hotspots.length); i++) {
        const hotspot = result.hotspots[i];
        report += `| ${hotspot.node} | ${hotspot.cycleCount} |\n`;
    }
    
    report += `\n## Suggested Break Points\n\n`;
    report += `Modifying these components would break the most dependency cycles:\n\n`;
    
    report += "| Component | Impact (Cycles Broken) |\n";
    report += "|-----------|------------------------|\n";
    
    for (let i = 0; i < Math.min(10, result.breakPoints.length); i++) {
        const breakPoint = result.breakPoints[i];
        report += `| ${breakPoint.node} | ${breakPoint.impact} |\n`;
    }
    
    report += `\n## Recommendations\n\n`;
    report += `1. Consider refactoring components with high cycle involvement.\n`;
    report += `2. Look for opportunities to extract shared logic to break dependencies.\n`;
    report += `3. Consider applying design patterns like Mediator, Observer, or Facade to reduce direct dependencies.\n`;
    report += `4. Review the architecture to ensure it follows proper layering and dependency direction principles.\n`;
    
    return report;
}