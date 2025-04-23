# Changelog

## [0.6.9] - (Coming Soon)

- **Added** Analyze cycles in the dependency graph (beta)
- **Added** Generate a report of cycles in dependencies

## [0.6.8] - 2025-04-18

- **Updated** Render preview and add more comprehensive error handling
- **Updated** Sanitize the content of the preview graph

## [0.6.7] - 2025-04-15

- **Fixed** Render preview sometimes failed to load when opening a .dot file with specials characters in content

## [0.6.6] - 2025-04-09

- **Added** Highlight dependencies in the preview graph (beta)
- **Added** Customize the colors of classes and packages in the graph (beta)
- **Updated** Modify dependencies lines representations in graph
- **Updated** Update dependencies

## [0.6.5] - 2025-03-28

- **Fixed** Fix security issues
- **Updated** Update dependencies to address security vulnerabilities
- **Added** Export graph as SVG

## [0.6.4] - 2025-03-23

- **Fixed** Fix packaging issue

## [0.6.1] - 2025-03-23

- **Fixed** Preview webview initialization issue

## [0.6.0] - 2025-03-23

- **Updated** Enhance performance of dependency graph generation
- **Fixed** Address issue with incorrect package version resolution
- **Added** Support for additional configuration options in settings
- **Added** Preview Graphviz on graphviz file open **(beta)**
- **Added** Preview configuration options in settings

## [0.5.0] - 2025-03-20

- **Updated** Refactor dependency resolution and enhance .csproj parsing
- **Added** Add utility functions for pattern matching in dependency filtering
- **Added** Add support of package dependencies in project graph
- **Added** Add colors properties in settings
- **Updated** Enhance csprojParser for package dependencies and improve tests
- **Updated** Update package dependencies and enhance configuration options for package dependency inclusion in project graph

## [0.4.0] - 2025-03-14

- **Added** support for solution (.sln) files to correctly identify all projects in the solution structure
- **Fixed** issue where test projects were not being excluded from the dependency graph
- **Fixed** issue when some class dependencies were not being correctly identified

## [0.2.0] - 2025-03-08

- **Updated** version to 0.2.0
- **Changed** default class dependency color from lightgrey to lightblue
- **Improved** description for class dependency color.
- **Fixed** issue where the extension was not displaying the correct version number. Corrected inconsistencies in documentation formatting and phrasing.

## [0.1.0] - 2025-03-08

- Initial version of the extension.
