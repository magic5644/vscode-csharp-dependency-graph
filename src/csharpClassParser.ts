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
 * Analyse les fichiers source C# pour extraire les classes et leurs dépendances
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
        console.error(`Erreur lors de l'analyse du fichier ${filePath}:`, error);
      }
    }
  }
  
  return classDependencies;
}

/**
 * Extrait les informations des classes d'un fichier C#
 */
function extractClassesFromFile(
  content: string, 
  filePath: string, 
  projectName: string
): ClassDependency[] {
  const classes: ClassDependency[] = [];
  
  // Chercher les imports
  const imports = extractImports(content);
  
  // Chercher le namespace - Adding a limit to the word character matching
  const namespaceMatch = content.match(/namespace\s+(\w{1,100})/);
  const namespace = namespaceMatch ? namespaceMatch[1] : '';
  
  // Expression simplifiée pour trouver les classes
  // Division en 2 regex plus simples
  const classLines = content.split('\n').filter(line => 
    /\bclass\s+\w{1,100}/.test(line)
  );
  
  for (const line of classLines) {
    // Extraire le nom de la classe - Adding a limit to word character matching
    const classNameMatch = line.match(/\bclass\s+(\w{1,100})/);
    if (!classNameMatch) continue;
    
    const className = classNameMatch[1];
    const dependencies: string[] = [];
    
    // Chercher s'il y a héritage sur cette ligne - FIX: limit the negated character class
    const inheritanceMatch = line.match(/\s*:\s*([^{]{1,500})/);
    if (inheritanceMatch) {
      const inheritanceStr = inheritanceMatch[1];
      const parts = inheritanceStr.split(',').map(p => p.trim());
      
      for (const part of parts) {
        if (part !== 'object' && part !== 'System.Object') {
          const baseClassName = part.split('<')[0].trim();
          dependencies.push(baseClassName);
        }
      }
    }
    
    // Trouver l'indice du début de la classe
    const classIndex = content.indexOf(line);
    if (classIndex < 0) continue;
    
    // Extraire le corps de la classe
    const classContent = getClassBody(content, classIndex);
    if (classContent) {
      // Analyse en plusieurs passes avec des regex simples
      
      // 1. Trouver les instanciations avec 'new'
      findNewInstantiations(classContent, dependencies);
      
      // 2. Trouver les appels de méthode statique
      findStaticCalls(classContent, dependencies);
      
      // 3. Trouver les types de variables
      findVariableTypes(classContent, dependencies);
      
      // Filtrer les dépendances
      const filteredDeps = dependencies.filter(dep => 
        !isPrimitiveType(dep) && 
        dep !== className
      );
      
      classes.push({
        className,
        projectName,
        namespace,
        dependencies: [...new Set(filteredDeps)], // Dédupliquer
        filePath
      });
    }
  }
  
  return classes;
}

/**
 * Trouve les instanciations avec 'new'
 */
function findNewInstantiations(content: string, dependencies: string[]) {
  // Regex simplifiée - Adding a limit to word character matching
  const newRegex = /new\s+(\w{1,100})/g;
  let match;
  
  while ((match = newRegex.exec(content)) !== null) {
    if (match[1] && !isPrimitiveType(match[1])) {
      dependencies.push(match[1]);
    }
  }
}

/**
 * Trouve les appels de méthode statique
 */
function findStaticCalls(content: string, dependencies: string[]) {
  // Regex simplifiée - Adding limits to both word character matchings
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
 * Trouve les types de variables
 */
function findVariableTypes(content: string, dependencies: string[]) {
  // Diviser en lignes pour simplifier l'analyse
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Chercher les définitions de variables/champs - Adding limits to word characters
    const typeMatch = line.match(/^\s*(\w{1,100})\s+\w{1,100}\s*[=;{]/);
    if (typeMatch && typeMatch[1] && !isPrimitiveType(typeMatch[1])) {
      dependencies.push(typeMatch[1]);
    }
  }
}

/**
 * Extrait les imports d'un fichier C#
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  // Approche ligne par ligne plus sûre
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Expression simplifiée
    if (line.trim().startsWith('using ') && line.trim().endsWith(';')) {
      const usingPart = line.trim().slice(5, -1).trim(); // Extrait entre 'using ' et ';'
      imports.push(usingPart);
    }
  }
  
  return imports;
}

/**
 * Obtient le corps d'une classe avec une méthode plus robuste
 */
function getClassBody(content: string, startIndex: number): string | null {
  let openBraces = 0;
  let startPos = -1;
  
  // Chercher d'abord l'accolade ouvrante
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      startPos = i;
      openBraces = 1;
      break;
    }
  }
  
  if (startPos === -1) return null;
  
  // Ensuite chercher l'accolade fermante correspondante
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
  
  return null;
}

/**
 * Liste des types primitifs C#
 */
function isPrimitiveType(type: string): boolean {
  const primitiveTypes = [
    'int', 'string', 'bool', 'float', 'double', 'decimal', 'char',
    'byte', 'sbyte', 'short', 'ushort', 'uint', 'long', 'ulong',
    'object', 'dynamic', 'var', 'void', 'this', 'base'
  ];
  
  return primitiveTypes.includes(type);
}
