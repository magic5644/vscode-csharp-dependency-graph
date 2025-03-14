import * as fs from 'fs';
import * as util from 'util';

const readFile = util.promisify(fs.readFile);

export interface ClassDependency {
  className: string;
  projectName: string;
  namespace: string;
  dependencies: DependencyInfo[];
  filePath: string;
}

export interface DependencyInfo {
  className: string;
  namespace: string;
  projectName: string;
}

/**
 * Analyzes C# source files to extract classes and their dependencies
 * @param projectSourceFiles Map of projects and their source files
 * @param includeClassDependencies Whether to include class-level dependencies
 */
export async function parseClassDependencies(
  projectSourceFiles: Map<string, string[]>,
  includeClassDependencies = true
): Promise<ClassDependency[]> {
  // Return empty array if class dependencies should not be included
  if (!includeClassDependencies) {
    return [];
  }
  
  const classDependencies: ClassDependency[] = [];
  
  // First pass: collect all class names with their namespaces for cross-reference resolution
  const classRegistry = new Map<string, { namespace: string, projectName: string }>();
  
  for (const [projectName, sourceFiles] of projectSourceFiles.entries()) {
    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf8');
        // Register classes with their namespaces
        registerClassesFromFile(content, projectName, classRegistry);
      } catch (error) {
        console.error(`Error registering classes from ${filePath}:`, error);
      }
    }
  }
  
  // Second pass: extract dependencies with proper namespace resolution
  for (const [projectName, sourceFiles] of projectSourceFiles.entries()) {
    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf8');
        const fileClasses = extractClassesFromFile(content, filePath, projectName, classRegistry);
        classDependencies.push(...fileClasses);
      } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
      }
    }
  }
  
  return classDependencies;
}

/**
 * Registers classes with their namespaces for cross-reference resolution
 */
function registerClassesFromFile(
  content: string,
  projectName: string,
  classRegistry: Map<string, { namespace: string, projectName: string }>
): void {
  // Find the namespace
  const namespaceRegex = /namespace\s+([\w.]+)/;
  const namespaceMatch = namespaceRegex.exec(content);
  const namespace = namespaceMatch ? namespaceMatch[1] : '';
  
  // Find classes
  const classRegex = /\bclass\s+(\w{1,100})/g;
  let match;
  
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    classRegistry.set(className, { namespace, projectName });
    
    // Also register with fully qualified name
    if (namespace) {
      classRegistry.set(`${namespace}.${className}`, { namespace, projectName });
    }
  }
}

/**
 * Extracts class information from a C# file
 */
function extractClassesFromFile(
  content: string, 
  filePath: string, 
  projectName: string,
  classRegistry: Map<string, { namespace: string, projectName: string }>
): ClassDependency[] {
  const classes: ClassDependency[] = [];
  
  // Find the namespace
  const namespaceRegex = /namespace\s+([\w.]+)/;
  const namespaceMatch = namespaceRegex.exec(content);
  const namespace = namespaceMatch ? namespaceMatch[1] : '';
  
  // Extract using directives for namespace resolution
  const imports = extractImports(content);
  
  // Find classes
  const classLines = content.split('\n').filter(line => 
    /\bclass\s+\w{1,100}/.test(line)
  );
  
  for (const line of classLines) {
    const classDep = processClassLine(line, content, projectName, namespace, filePath, imports, classRegistry);
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
  filePath: string,
  imports: string[],
  classRegistry: Map<string, { namespace: string, projectName: string }>
): ClassDependency | null {
  // Extract the class name
  const classNameRegex = /\bclass\s+(\w{1,100})/;
  const classNameMatch = classNameRegex.exec(line);
  if (!classNameMatch) return null;
  
  const className = classNameMatch[1];
  const dependencies: DependencyInfo[] = [];
  
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
  
  // Resolve and filter dependencies
  const resolvedDeps = resolveDependencies(dependencies, imports, namespace, className, classRegistry);
  
  return {
    className,
    projectName,
    namespace,
    dependencies: resolvedDeps, // Now returns DependencyInfo[] instead of string[]
    filePath
  };
}

/**
 * Resolves dependency names using imports, namespace context and class registry
 */
function resolveDependencies(
  dependencies: DependencyInfo[],
  imports: string[],
  currentNamespace: string,
  currentClassName: string,
  classRegistry: Map<string, { namespace: string, projectName: string }>
): DependencyInfo[] {
  const resolved = new Set<string>();
  const resolvedDependencies: DependencyInfo[] = [];
  
  for (const dep of dependencies) {
    // Skip primitive types and current class
    if (isPrimitiveType(dep.className) || dep.className === currentClassName) {
      continue;
    }
    
    // Handle generic types (extract base type)
    const baseType = dep.className.split('<')[0].trim();
    
    // Skip if we've already processed this dependency
    if (resolved.has(baseType)) {
      continue;
    }
    
    let dependencyInfo: DependencyInfo | null = null;
    
    // Already fully qualified
    if (baseType.includes('.')) {
      const parts = baseType.split('.');
      const className = parts.pop() || '';
      const namespace = parts.join('.');
      
      // Try to find in registry
      if (classRegistry.has(baseType)) {
        const info = classRegistry.get(baseType)!;
        dependencyInfo = {
          className,
          namespace: info.namespace,
          projectName: info.projectName
        };
      } else {
        // External dependency
        dependencyInfo = {
          className,
          namespace,
          projectName: 'external'
        };
      }
    } else {
      // Try in current namespace first
      const fullName = currentNamespace ? `${currentNamespace}.${baseType}` : baseType;
      if (classRegistry.has(fullName)) {
        const info = classRegistry.get(fullName)!;
        dependencyInfo = {
          className: baseType,
          namespace: info.namespace,
          projectName: info.projectName
        };
      } else {
        // Try with using directives
        let found = false;
        for (const imp of imports) {
          const qualifiedName = `${imp}.${baseType}`;
          if (classRegistry.has(qualifiedName)) {
            const info = classRegistry.get(qualifiedName)!;
            dependencyInfo = {
              className: baseType,
              namespace: imp,
              projectName: info.projectName
            };
            found = true;
            break;
          }
        }
        
        // If still not found, add as external dependency
        if (!found && baseType) {
          dependencyInfo = {
            className: baseType,
            namespace: 'unknown',
            projectName: 'external'
          };
        }
      }
    }
    
    if (dependencyInfo) {
      resolved.add(baseType);
      resolvedDependencies.push(dependencyInfo);
    }
  }
  
  return resolvedDependencies;
}

/**
 * Extract inheritance dependencies from a class declaration line
 */
function extractInheritanceDependencies(line: string, dependencies: DependencyInfo[]): void {
  // Safe regex that avoids catastrophic backtracking
  const inheritanceRegex = /\s*:\s*([^{]+?)(?=\s*\{|$)/;
  const inheritanceMatch = inheritanceRegex.exec(line);
  if (!inheritanceMatch) return;
  
  const inheritanceStr = inheritanceMatch[1];
  // Handle commas in generic arguments properly
  const parts = splitByTopLevelCommas(inheritanceStr);
  
  for (const part of parts) {
    if (part !== 'object' && part !== 'System.Object') {
      const baseClassName = part.split('<')[0].trim();
      dependencies.push({ className: baseClassName, namespace: 'unknown', projectName: 'external' });
    }
  }
}

/**
 * Split a string by commas, but ignore commas within angle brackets (for generics)
 */
function splitByTopLevelCommas(str: string): string[] {
  const result: string[] = [];
  let currentPart = '';
  let angleBracketDepth = 0;
  
  for (const char of str) {
    if (char === '<') {
      angleBracketDepth++;
      currentPart += char;
    } else if (char === '>') {
      angleBracketDepth--;
      currentPart += char;
    } else if (char === ',' && angleBracketDepth === 0) {
      result.push(currentPart.trim());
      currentPart = '';
    } else {
      currentPart += char;
    }
  }
  
  if (currentPart.trim()) {
    result.push(currentPart.trim());
  }
  
  return result;
}

/**
 * Extract dependencies from class content
 */
function extractDependenciesFromClassContent(
  classContent: string, 
  dependencies: DependencyInfo[]
): void {
  // 1. Find instantiations with 'new'
  findNewInstantiations(classContent, dependencies);
  
  // 2. Find static method calls
  findStaticCalls(classContent, dependencies);
  
  // 3. Find variable types, parameter types, and method return types
  findAllTypes(classContent, dependencies);
}

/**
 * Finds instantiations with 'new'
 */
function findNewInstantiations(content: string, dependencies: DependencyInfo[]) {
  // Improved regex to handle generic types
  const newRegex = /new\s+([\w.<>,\s]+?)[({}]/g;
  let match;
  
  while ((match = newRegex.exec(content)) !== null) {
    if (match[1]) {
      const type = match[1].trim();
      if (!isPrimitiveType(type)) {
        dependencies.push({
          className: type,
          namespace: 'unknown',
          projectName: 'external'
        });
      }
    }
  }
}

/**
 * Finds static method calls
 */
function findStaticCalls(content: string, dependencies: DependencyInfo[]) {
  // Improved regex for static calls
  const staticRegex = /([\w.]+)\.\w+\(/g;
  let match;
  
  while ((match = staticRegex.exec(content)) !== null) {
    const className = match[1];
    if (!isPrimitiveType(className) && 
        !['this', 'base', 'var', 'string', 'int', 'Console'].includes(className)) {
      dependencies.push({
        className: className,
        namespace: 'unknown',
        projectName: 'external'
      });
    }
  }
}

/**
 * Finds all types in variable declarations, parameters, and method returns
 */
function findAllTypes(content: string, dependencies: DependencyInfo[]) {
  // Split into lines to simplify analysis
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('//')) continue;
    
    // Variable and field declarations
    // Improved to handle more complex declarations and generics
    const declarationRegex = /^\s*(public|private|protected|internal|const|readonly|static)?\s*([\w<>[\],\s.]{1,500})\s+\w+\s*[=;{(]/;
    const declMatch = declarationRegex.exec(line);
    if (declMatch?.[2]) {
      const type = declMatch[2].trim();
      if (!isPrimitiveType(type)) {
        dependencies.push({
          className: type,
          namespace: 'unknown',
          projectName: 'external'
        });
      }
    }
    
    // Method parameters and return types
    const methodRegex = /(public|private|protected|internal|static|virtual|override|abstract)?\s*([\w<>[\],\s.]{1,500})\s+\w+\s*\((.*)\)/;
    const methodMatch = methodRegex.exec(line);
    if (methodMatch) {
      // Return type
      const returnType = methodMatch[2].trim();
      if (returnType !== 'void' && !isPrimitiveType(returnType)) {
        dependencies.push({ className: returnType, namespace: 'unknown', projectName: 'external' });
      }
      
      // Parameters
      const params = methodMatch[3];
      if (params) {
        const paramParts = splitByTopLevelCommas(params);
        for (const param of paramParts) {
          const paramParts = param.trim().split(' ');
          if (paramParts.length >= 2) {
            const paramType = paramParts[0].trim();
            if (!isPrimitiveType(paramType)) {
              dependencies.push({className: paramType, namespace: 'unknown', projectName: 'external'});
            }
          }
        }
      }
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
  // Add more primitive types and .NET common types
  const primitiveTypes = [
    'int', 'string', 'bool', 'float', 'double', 'decimal', 'char',
    'byte', 'sbyte', 'short', 'ushort', 'uint', 'long', 'ulong',
    'object', 'dynamic', 'var', 'void', 'this', 'base', 'DateTime',
    'Guid', 'TimeSpan', 'Task', 'List', 'Dictionary', 'IEnumerable',
    'IList', 'IDictionary', 'ICollection'
  ];
  
  // Clean up generic markers if present
  const baseType = type.split('<')[0].trim();
  
  return primitiveTypes.includes(baseType) ||
         baseType.startsWith("Action") ||
         baseType.startsWith("Func") ||
         baseType.startsWith("System.");
}
