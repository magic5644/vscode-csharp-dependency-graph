# Test Workspace

Ce dossier contient des projets C# simples pour tester l'extension VS Code C# Dependency Graph.

Structure:
- ProjectA (référence ProjectB et ProjectC)
- ProjectB (référence ProjectC)
- ProjectC (pas de références)
- TestProject (référence ProjectA - devrait être exclu lors du test)
