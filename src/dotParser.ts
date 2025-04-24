/**
 * Parser for DOT graph files that extracts nodes and edges
 */
export class DotParser {
  /**
   * Extracts all nodes from DOT content
   * @param dotContent The DOT graph content
   * @returns A Set of node names
   */
  public static extractNodes(dotContent: string): Set<string> {
    const nodeRegex = /"([^"]+)"\s*\[/g;
    const nodes = new Set<string>();
    
    let match;
    while ((match = nodeRegex.exec(dotContent)) !== null) {
      nodes.add(match[1]);
    }
    
    return nodes;
  }
  
  /**
   * Extracts all edges from DOT content
   * @param dotContent The DOT graph content
   * @returns A Map where keys are source nodes and values are arrays of target nodes
   */
  public static extractEdges(dotContent: string): Map<string, string[]> {
    const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/g;
    const edges = new Map<string, string[]>();
    
    let match;
    while ((match = edgeRegex.exec(dotContent)) !== null) {
      const source = match[1];
      const target = match[2];
      
      if (!edges.has(source)) {
        edges.set(source, []);
      }
      
      edges.get(source)!.push(target);
    }
    
    return edges;
  }
  
  /**
   * Extracts nodes from edge definitions in DOT content
   * @param dotContent The DOT graph content
   * @returns A Set of node names appearing in edges
   */
  public static extractNodesFromEdges(dotContent: string): Set<string> {
    const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/g;
    const nodes = new Set<string>();
    
    let match;
    while ((match = edgeRegex.exec(dotContent)) !== null) {
      nodes.add(match[1]); // Source node
      nodes.add(match[2]); // Target node
    }
    
    return nodes;
  }
  
  /**
   * Checks if the DOT content represents a class dependency graph
   * This is a simplistic check that looks for "cluster_" which is typically
   * used in class dependency graphs to group classes by project
   * @param dotContent The DOT graph content
   * @returns True if it appears to be a class dependency graph
   */
  public static isClassDependencyGraph(dotContent: string): boolean {
    return dotContent.includes("cluster_");
  }
  
  /**
   * Parses a DOT graph to extract nodes and edges
   * @param dotContent The DOT graph content
   * @returns An object with extracted nodes and edges
   */
  public static parse(dotContent: string): {
    nodes: Set<string>;
    edges: Map<string, string[]>;
    isClassGraph: boolean;
  } {
    const definedNodes = this.extractNodes(dotContent);
    const nodesFromEdges = this.extractNodesFromEdges(dotContent);
    const edges = this.extractEdges(dotContent);
    const isClassGraph = this.isClassDependencyGraph(dotContent);
    
    // Combine both sets of nodes
    const allNodes = new Set<string>([...definedNodes, ...nodesFromEdges]);
    
    return {
      nodes: allNodes,
      edges,
      isClassGraph
    };
  }
}