/**
 * Characters that need HTML entity encoding in DOT graph content
 */
const SPECIAL_CHAR_MAP: Record<string, string> = {
  // Basic characters
  "'": '&#39;',
  '"': '&quot;',
  // Acute accents
  'é': '&#233;', 'É': '&#201;', 'á': '&#225;', 'Á': '&#193;',
  'í': '&#237;', 'Í': '&#205;', 'ó': '&#243;', 'Ó': '&#211;',
  'ú': '&#250;', 'Ú': '&#218;', 'ý': '&#253;', 'Ý': '&#221;',
  // Grave accents
  'è': '&#232;', 'È': '&#200;', 'à': '&#224;', 'À': '&#192;',
  'ì': '&#236;', 'Ì': '&#204;', 'ò': '&#242;', 'Ò': '&#210;',
  'ù': '&#249;', 'Ù': '&#217;',
  // Circumflex
  'ê': '&#234;', 'Ê': '&#202;', 'â': '&#226;', 'Â': '&#194;',
  'î': '&#238;', 'Î': '&#206;', 'ô': '&#244;', 'Ô': '&#212;',
  'û': '&#251;', 'Û': '&#219;',
  // Diaeresis
  'ë': '&#235;', 'Ë': '&#203;', 'ä': '&#228;', 'Ä': '&#196;',
  'ï': '&#239;', 'Ï': '&#207;', 'ö': '&#246;', 'Ö': '&#214;',
  'ü': '&#252;', 'Ü': '&#220;', 'ÿ': '&#255;',
  // Other special characters
  'ç': '&#231;', 'Ç': '&#199;', 'ñ': '&#241;', 'Ñ': '&#209;',
  'œ': '&#339;', 'Œ': '&#338;', 'æ': '&#230;', 'Æ': '&#198;'
};

/**
 * Validates if a string appears to be a valid DOT graph
 * @param content The content to validate
 * @returns True if the content appears to be a valid DOT graph
 */
export function isValidDotGraph(content: string): boolean {
  const dotGraphRegex = /^\s*(?:di)?graph\s+[\w"{}][^\n]{0,100}/i;
  return dotGraphRegex.test(content.trim());
}

/**
 * Sanitizes a string value by replacing special characters with their HTML entity equivalents
 * @param value The string to sanitize
 * @returns Sanitized string
 */
export function sanitizeStringValue(value: string): string {
  if (!value) {return value;}
  
  // Process quotes first to avoid regex issues
  let result = value.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  
  // Then process other special characters
  for (const [char, entity] of Object.entries(SPECIAL_CHAR_MAP)) {
    // Skip the already processed quotes
    if (char === "'" || char === '"') {
      continue;
    }
    
    // Use a regex with the global flag to replace all occurrences
    const regex = new RegExp(char, 'g');
    result = result.replace(regex, entity);
  }
  
  return result;
}

/**
 * Sanitizes node IDs in a DOT graph content
 * @param content The DOT graph content
 * @returns Sanitized DOT graph content
 */
export function sanitizeNodeIds(content: string): string {
  return content.replace(
    /"([^"]*?)"/g,
    (_match, nodeId) => {
      const sanitized = sanitizeStringValue(nodeId);
      return `"${sanitized}"`;
    }
  );
}


/**
 * Fixes common syntax issues in DOT graph content
 * @param content The DOT graph content
 * @returns Fixed DOT graph content
 */
export function fixSyntaxIssues(content: string): string {
  // Ensure adequate spacing in edge definitions
  content = content.replace(/->(\S)/g, '-> $1');
  
  // Fix graph identifiers with spaces
  content = content.replace(
    /(di)?graph\s+(\w+\s+\w+)(\s*{)/gi, 
    (_match, di, name, bracket) => `${di ?? ''}graph "${name}"${bracket}`
  );
  
  return content;
}

/**
 * Sanitizes DOT graph content to ensure it can be safely rendered
 * @param dotContent The DOT graph content to sanitize
 * @returns An object containing the sanitized content and whether an invalid graph warning was triggered
 */
export function sanitizeDotContent(dotContent: string): { content: string, invalidGraphWarning: boolean } {
  // Prepare result object
  const result = {
    content: dotContent,
    invalidGraphWarning: false
  };
  
  // Validate the graph content
  if (!isValidDotGraph(dotContent)) {
    console.warn("Warning: Content doesn't appear to be a valid DOT graph");
    result.invalidGraphWarning = true;
    return result; // Return original content for invalid graphs
  }

  // Apply transformations in a pipeline for valid DOT graphs
  let transformedContent = dotContent;
  
  // Apply each transformation in sequence
  transformedContent = enhanceGraphWithDefaultAttributes(transformedContent);
  transformedContent = sanitizeNodeIds(transformedContent);
  transformedContent = fixSyntaxIssues(transformedContent);
  
  result.content = transformedContent;
  return result;
}

/**
 * Enhances a graph with default styling attributes if they're not already present
 * @param content The DOT graph content
 * @returns Enhanced DOT graph content
 */
export function enhanceGraphWithDefaultAttributes(content: string): string {
  if (content.includes('digraph') && !content.includes('splines=')) {
    // Match digraph declaration, allowing for quoted names and whitespace
    return content.replace(
      /digraph\s+(?:[\w"]+(?:\s+[\w"]+)*)\s*\{/i,
      match => `${match}\n  // Graph attributes for better edge rendering\n  graph [splines=polyline, overlap=false, nodesep=0.8, ranksep=1.0];\n  edge [penwidth=1.5, arrowsize=0.8];\n  node [shape=box, style=filled, fillcolor=aliceblue];\n`
    );
  }
  return content;
}
