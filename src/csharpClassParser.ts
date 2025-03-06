import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const readFile = util.promisify(fs.readFile);

export interface ClassDependency {
  className: string;
  projectName: string;
  namespace: string;
  dependencies: string[];
  filePath: string;
}

/**
 * Analyzes C# source files to extract classes and their dependencies
 * @param projectSourceFiles Map of projects and their source files
 */
export async function parseClassDependencies(
  projectSourceFiles: Map<string, string[]>
): Promise<ClassDependency[]> {
  const classDependencies: ClassDependency[] = [];
  
  for (const [projectName, sourceFiles] of projectSourceFiles.entries()) {
    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf8');
        const fileClasses = extractClassesFromFile(content, filePath, projectName);
        classDependencies.push(...fileClasses);
      } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
      }
    }
  }
  
  return classDependencies;
}

/**
 * Extracts class information from a C# file
 */
function extractClassesFromFile(
  content: string, 
  filePath: string, 
  projectName: string
): ClassDependency[] {
  const classes: ClassDependency[] = [];
  
  // Find usings/imports
  const imports = extractImports(content);
  
  // Find the namespace
  const namespaceRegex = /namespace\s+(\w{1,100})/;
  const namespaceMatch = namespaceRegex.exec(content);
  const namespace = namespaceMatch ? namespaceMatch[1] : '';
  
  // Simplified expression to find classes
  // Split into 2 simpler regexes
  const classLines = content.split('\n').filter(line => 
    /\bclass\s+\w{1,100}/.test(line)
  );
  
  for (const line of classLines) {
    const classDep = processClassLine(line, content, projectName, namespace, filePath);
    if (classDep) {
      classes.push(classDep);
    }
  }
  
  return classes;
}

/**
 * Process a single class line to extract dependency information
 */
function processClassLine(
  line: string,
  content: string,
  projectName: string,
  namespace: string,
  filePath: string
): ClassDependency | null {
  // Extract the class name
  const classNameRegex = /\bclass\s+(\w{1,100})/;
  const classNameMatch = classNameRegex.exec(line);
  if (!classNameMatch) return null;
  
  const className = classNameMatch[1];
  const dependencies: string[] = [];
  
  // Extract inheritance dependencies
  extractInheritanceDependencies(line, dependencies);
  
  // Find the index of the beginning of the class
  const classIndex = content.indexOf(line);
  if (classIndex < 0) return null;
  
  // Extract the class body
  const classContent = getClassBody(content, classIndex);
  if (!classContent) return null;
  
  // Extract dependencies from class content
  extractDependenciesFromClassContent(classContent, dependencies);
  
  // Filter dependencies
  const filteredDeps = dependencies.filter(dep => 
    !isPrimitiveType(dep) && 
    dep !== className
  );
  
  return {
    className,
    projectName,
    namespace,
    dependencies: [...new Set(filteredDeps)], // Deduplicate
    filePath
  };
}

/**
 * Extract inheritance dependencies from a class declaration line
 */
function extractInheritanceDependencies(line: string, dependencies: string[]): void {
  const inheritanceRegex = /\s*:\s*([^{]{1,500})/;
  const inheritanceMatch = inheritanceRegex.exec(line);
  if (!inheritanceMatch) return;
  
  const inheritanceStr = inheritanceMatch[1];
  const parts = inheritanceStr.split(',').map(p => p.trim());
  
  for (const part of parts) {
    if (part !== 'object' && part !== 'System.Object') {
      const baseClassName = part.split('<')[0].trim();
      dependencies.push(baseClassName);
    }
  }
}

/**
 * Extract dependencies from class content
 */
function extractDependenciesFromClassContent(classContent: string, dependencies: string[]): void {
  // 1. Find instantiations with 'new'
  findNewInstantiations(classContent, dependencies);
  
  // 2. Find static method calls
  findStaticCalls(classContent, dependencies);
  
  // 3. Find variable types
  findVariableTypes(classContent, dependencies);
}

/**
 * Finds instantiations with 'new'
 */
function findNewInstantiations(content: string, dependencies: string[]) {
  // Simplified regex - just for 'new TypeName'
  const newRegex = /new\s+(\w{1,100})/g;
  let match;
  
  while ((match = newRegex.exec(content)) !== null) {
    if (match[1] && !isPrimitiveType(match[1])) {
      dependencies.push(match[1]);
    }
  }
}

/**
 * Finds static method calls
 */
function findStaticCalls(content: string, dependencies: string[]) {
  // Simplified regex for static calls
  const staticRegex = /(\w{1,100})\.\w{1,100}\(/g;
  let match;
  
  while ((match = staticRegex.exec(content)) !== null) {
    const className = match[1];
    if (!isPrimitiveType(className) && 
        !['this', 'base', 'var', 'string', 'int', 'Console'].includes(className)) {
      dependencies.push(className);
    }
  }
}

/**
 * Finds variable types
 */
function findVariableTypes(content: string, dependencies: string[]) {
  // Split into lines to simplify analysis
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Search for variable/field definitions with a simple regex
    const typeMatch = line.match(/^\s*(\w{1,100})\s+\w{1,100}\s*[=;{]/);
    if (typeMatch && typeMatch[1] && !isPrimitiveType(typeMatch[1])) {
      dependencies.push(typeMatch[1]);
    }
  }
}

/**
 * Extracts imports from a C# file
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  // Line-by-line approach is safer
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Simplified expression
    if (line.trim().startsWith('using ') && line.trim().endsWith(';')) {
      const usingPart = line.trim().slice(5, -1).trim(); // Extract between 'using ' and ';'
      imports.push(usingPart);
    }
  }
  
  return imports;
}

/**
 * Gets the body of a class with a more robust method
 */
function getClassBody(content: string, startIndex: number): string | null {
  let openBraces = 0;
  let startPos = -1;
  
  // First, find the opening brace
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      startPos = i;
      openBraces = 1;
      break;
    }
  }
  
  if (startPos === -1) return null;
  
  // Then find the matching closing brace
  for (let i = startPos + 1; i < content.length; i++) {
    if (content[i] === '{') {
      openBraces++;
    } else if (content[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        return content.substring(startPos, i + 1);
      }
    }
  }
  
  return null; // No balanced closing brace found
}

/**
 * List of C# primitive types
 */
function isPrimitiveType(type: string): boolean {
  const primitiveTypes = [
    'int', 'string', 'bool', 'float', 'double', 'decimal', 'char',
    'byte', 'sbyte', 'short', 'ushort', 'uint', 'long', 'ulong',
    'object', 'dynamic', 'var', 'void', 'this', 'base'
  ];
  
  return primitiveTypes.includes(type);
}
