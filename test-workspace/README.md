# Test Workspace

This folder contains simple C# projects to test the VS Code C# Dependency Graph extension.

Structure:
- ProjectA (references ProjectB and ProjectC)
- ProjectB (references ProjectC)
- ProjectC (no references)
- TestProject (references ProjectA - should be excluded during testing)
