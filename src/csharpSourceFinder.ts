import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { minimatch } from 'minimatch';

const readdir = util.promisify(fs.readdir);

/**
 * Trouve tous les fichiers .cs dans les projets spécifiés
 * @param projectPaths Chemins des projets à analyser
 * @param excludePatterns Motifs de fichiers à exclure
 */
export async function findCSharpSourceFiles(
  projectPaths: string[],
  excludePatterns: string[] = ['**/obj/**', '**/bin/**']
): Promise<Map<string, string[]>> {
  const projectSourceFiles = new Map<string, string[]>();
  
  for (const projectPath of projectPaths) {
    try {
      const sourceFiles: string[] = [];
      const projectDir = path.dirname(projectPath);
      const projectName = path.basename(projectPath, '.csproj');
      
      await searchDirectory(projectDir, sourceFiles, excludePatterns);
      
      // Ne pas ajouter le projet s'il n'y a pas de fichiers source
      if (sourceFiles.length > 0) {
        projectSourceFiles.set(projectName, sourceFiles);
      }
    } catch (err) {
      console.error(`Erreur lors de l'analyse du projet ${projectPath}:`, err);
    }
  }
  
  return projectSourceFiles;
}

async function searchDirectory(
  dir: string, 
  results: string[], 
  excludePatterns: string[]
): Promise<void> {
  // Vérifier si le répertoire correspond à un motif d'exclusion
  if (isExcluded(dir, excludePatterns)) {
    return;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Récursion dans les sous-répertoires, mais pas dans les répertoires exclus
        if (!isExcluded(fullPath, excludePatterns)) {
          await searchDirectory(fullPath, results, excludePatterns);
        }
      } else if (entry.isFile() && entry.name.endsWith('.cs')) {
        // Ajouter le fichier .cs s'il n'est pas exclu
        if (!isExcluded(fullPath, excludePatterns)) {
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Erreur lors de la recherche dans ${dir}:`, error);
  }
}

/**
 * Vérifie si un chemin de fichier correspond à l'un des motifs d'exclusion
 */
function isExcluded(filePath: string, excludePatterns: string[]): boolean {
  try {
    return excludePatterns.some(pattern => {
      // Utiliser la syntaxe correcte de minimatch
      return minimatch(filePath, pattern, { dot: true, matchBase: true });
    });
  } catch (error) {
    console.error(`Erreur lors de la vérification du chemin ${filePath}:`, error);
    return false; // En cas d'erreur, ne pas exclure le fichier
  }
}
