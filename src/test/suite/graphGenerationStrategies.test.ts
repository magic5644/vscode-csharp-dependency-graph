import * as assert from 'assert';
import { GraphGenerator } from '../../strategies/GraphGenerator';
import { ProjectGraphStrategy } from '../../strategies/ProjectGraphStrategy';
import { ClassGraphStrategy } from '../../strategies/ClassGraphStrategy';
import { GraphOptions } from '../../strategies/GraphGenerationStrategy';
import { Project } from '../../csprojParser';
import { ClassDependency } from '../../csharpClassParser';

suite('Graph Generation Strategies Test Suite', () => {
    let mockProjects: Project[];
    let mockClassDependencies: ClassDependency[];
    let defaultOptions: GraphOptions;

    setup(() => {
        // Setup mock projects
        mockProjects = [
            {
                name: 'Core',
                path: '/test/Core/Core.csproj',
                dependencies: ['Shared'],
                packageDependencies: [
                    { name: 'Newtonsoft.Json', version: '13.0.1' }
                ],
                targetFramework: 'net6.0'
            },
            {
                name: 'Api',
                path: '/test/Api/Api.csproj',
                dependencies: ['Core', 'Shared'],
                packageDependencies: [
                    { name: 'Microsoft.AspNetCore', version: '6.0.0' },
                    { name: 'Swashbuckle.AspNetCore', version: '6.2.3' }
                ],
                targetFramework: 'net6.0'
            },
            {
                name: 'Shared',
                path: '/test/Shared/Shared.csproj',
                dependencies: [],
                packageDependencies: [],
                targetFramework: 'netstandard2.1'
            }
        ];

        // Setup mock class dependencies
        mockClassDependencies = [
            {
                className: 'UserService',
                projectName: 'Core',
                namespace: 'Core.Services',
                filePath: '/test/Core/Services/UserService.cs',
                dependencies: [
                    { className: 'User', namespace: 'Core.Models', projectName: 'Core' },
                    { className: 'IRepository', namespace: 'Shared.Interfaces', projectName: 'Shared' }
                ]
            },
            {
                className: 'User',
                projectName: 'Core',
                namespace: 'Core.Models',
                filePath: '/test/Core/Models/User.cs',
                dependencies: [
                    { className: 'BaseEntity', namespace: 'Shared.Models', projectName: 'Shared' }
                ]
            },
            {
                className: 'UserController',
                projectName: 'Api',
                namespace: 'Api.Controllers',
                filePath: '/test/Api/Controllers/UserController.cs',
                dependencies: [
                    { className: 'UserService', namespace: 'Core.Services', projectName: 'Core' },
                    { className: 'User', namespace: 'Core.Models', projectName: 'Core' }
                ]
            },
            {
                className: 'BaseEntity',
                projectName: 'Shared',
                namespace: 'Shared.Models',
                filePath: '/test/Shared/Models/BaseEntity.cs',
                dependencies: []
            },
            {
                className: 'IRepository',
                projectName: 'Shared',
                namespace: 'Shared.Interfaces',
                filePath: '/test/Shared/Interfaces/IRepository.cs',
                dependencies: []
            }
        ];

        // Default options
        defaultOptions = {
            includeNetVersion: true,
            classDependencyColor: 'lightgray',
            includePackageDependencies: false,
            packageNodeColor: '#ffcccc'
        };
    });

    suite('GraphGenerator (Context)', () => {
        test('should create GraphGenerator instance', () => {
            const generator = new GraphGenerator();
            assert.ok(generator, 'GraphGenerator should be created');
        });

        test('should use ProjectGraphStrategy when no class dependencies provided', () => {
            const generator = new GraphGenerator();
            const options = { ...defaultOptions, includeClassDependencies: false };
            
            const result = generator.generateDotFile(mockProjects, options);
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should generate valid DOT graph');
            assert.ok(result.includes('"Core"'), 'Should include Core project');
            assert.ok(result.includes('"Api"'), 'Should include Api project');
            assert.ok(result.includes('"Shared"'), 'Should include Shared project');
            
            // Should contain project edges
            assert.ok(result.includes('"Core" -> "Shared"'), 'Should have Core -> Shared edge');
            assert.ok(result.includes('"Api" -> "Core"'), 'Should have Api -> Core edge');
            assert.ok(result.includes('"Api" -> "Shared"'), 'Should have Api -> Shared edge');
        });

        test('should use ClassGraphStrategy when class dependencies provided', () => {
            const generator = new GraphGenerator();
            const options = { ...defaultOptions, includeClassDependencies: true };
            
            const result = generator.generateDotFile(mockProjects, options, mockClassDependencies);
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should generate valid DOT graph');
            assert.ok(result.includes('subgraph "cluster_Core"'), 'Should have Core cluster');
            assert.ok(result.includes('subgraph "cluster_Api"'), 'Should have Api cluster');
            assert.ok(result.includes('subgraph "cluster_Shared"'), 'Should have Shared cluster');
            
            // Should contain class nodes
            assert.ok(result.includes('"Core.UserService"'), 'Should include UserService class');
            assert.ok(result.includes('"Api.UserController"'), 'Should include UserController class');
            assert.ok(result.includes('"Shared.BaseEntity"'), 'Should include BaseEntity class');
        });

        test('should fallback to ProjectGraphStrategy when class dependencies empty', () => {
            const generator = new GraphGenerator();
            const options = { ...defaultOptions, includeClassDependencies: true };
            
            const result = generator.generateDotFile(mockProjects, options, []);
            
            // Should generate project graph instead
            assert.ok(result.includes('"Core"'), 'Should include project nodes');
            assert.ok(!result.includes('subgraph'), 'Should not include class subgraphs');
        });
    });

    suite('ProjectGraphStrategy', () => {
        let strategy: ProjectGraphStrategy;

        setup(() => {
            strategy = new ProjectGraphStrategy();
        });

        test('should generate basic project graph', () => {
            const result = strategy.generate(mockProjects, defaultOptions);
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should have DOT header');
            assert.ok(result.includes('"Core"'), 'Should include Core project');
            assert.ok(result.includes('"Api"'), 'Should include Api project');
            assert.ok(result.includes('"Shared"'), 'Should include Shared project');
            assert.ok(result.includes('}'), 'Should have DOT footer');
        });

        test('should include .NET version in labels when enabled', () => {
            const options = { ...defaultOptions, includeNetVersion: true };
            const result = strategy.generate(mockProjects, options);
            
            assert.ok(result.includes('(net6.0)'), 'Should include .NET 6.0 version');
            assert.ok(result.includes('(netstandard2.1)'), 'Should include .NET Standard 2.1 version');
        });

        test('should exclude .NET version in labels when disabled', () => {
            const options = { ...defaultOptions, includeNetVersion: false };
            const result = strategy.generate(mockProjects, options);
            
            assert.ok(!result.includes('(net6.0)'), 'Should not include .NET versions');
            assert.ok(!result.includes('(netstandard2.1)'), 'Should not include .NET versions');
        });

        test('should generate project dependency edges', () => {
            const result = strategy.generate(mockProjects, defaultOptions);
            
            assert.ok(result.includes('"Core" -> "Shared"'), 'Should have Core -> Shared dependency');
            assert.ok(result.includes('"Api" -> "Core"'), 'Should have Api -> Core dependency');
            assert.ok(result.includes('"Api" -> "Shared"'), 'Should have Api -> Shared dependency');
        });

        test('should include package nodes when enabled', () => {
            const options = { ...defaultOptions, includePackageDependencies: true };
            const result = strategy.generate(mockProjects, options);
            
            assert.ok(result.includes('"Newtonsoft.Json"'), 'Should include Newtonsoft.Json package');
            assert.ok(result.includes('"Microsoft.AspNetCore"'), 'Should include Microsoft.AspNetCore package');
            assert.ok(result.includes('"Swashbuckle.AspNetCore"'), 'Should include Swashbuckle.AspNetCore package');
            
            // Should have package styling
            assert.ok(result.includes('shape=ellipse'), 'Packages should have ellipse shape');
            assert.ok(result.includes('style=filled'), 'Packages should be filled');
        });

        test('should include package edges when enabled', () => {
            const options = { ...defaultOptions, includePackageDependencies: true };
            const result = strategy.generate(mockProjects, options);
            
            assert.ok(result.includes('"Core" -> "Newtonsoft.Json"'), 'Should have Core -> Newtonsoft.Json edge');
            assert.ok(result.includes('"Api" -> "Microsoft.AspNetCore"'), 'Should have Api -> Microsoft.AspNetCore edge');
            assert.ok(result.includes('"Api" -> "Swashbuckle.AspNetCore"'), 'Should have Api -> Swashbuckle.AspNetCore edge');
            
            // Package edges should be styled differently
            assert.ok(result.includes('style=dashed'), 'Package edges should be dashed');
        });

        test('should exclude packages when disabled', () => {
            const options = { ...defaultOptions, includePackageDependencies: false };
            const result = strategy.generate(mockProjects, options);
            
            assert.ok(!result.includes('"Newtonsoft.Json"'), 'Should not include package nodes');
            assert.ok(!result.includes('shape=ellipse'), 'Should not have package styling');
            assert.ok(!result.includes('style=dashed'), 'Should not have package edge styling');
        });

        test('should handle empty projects list', () => {
            const result = strategy.generate([], defaultOptions);
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should have valid DOT structure');
            assert.ok(result.includes('}'), 'Should have closing brace');
        });

        test('should handle projects with no dependencies', () => {
            const isolatedProjects: Project[] = [
                {
                    name: 'Isolated',
                    path: '/test/Isolated/Isolated.csproj',
                    dependencies: [],
                    packageDependencies: [],
                    targetFramework: 'net6.0'
                }
            ];
            
            const result = strategy.generate(isolatedProjects, defaultOptions);
            
            assert.ok(result.includes('"Isolated"'), 'Should include isolated project');
            assert.ok(!result.includes('"Isolated" ->'), 'Should not have outgoing edges');
        });
    });

    suite('ClassGraphStrategy', () => {
        let strategy: ClassGraphStrategy;

        setup(() => {
            strategy = new ClassGraphStrategy();
        });

        test('should generate class dependency graph with subgraphs', () => {
            const result = strategy.generate(mockProjects, defaultOptions, mockClassDependencies);
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should have DOT header');
            assert.ok(result.includes('subgraph "cluster_Core"'), 'Should have Core cluster');
            assert.ok(result.includes('subgraph "cluster_Api"'), 'Should have Api cluster');
            assert.ok(result.includes('subgraph "cluster_Shared"'), 'Should have Shared cluster');
            assert.ok(result.includes('}'), 'Should have DOT footer');
        });

        test('should include project labels with .NET versions', () => {
            const options = { ...defaultOptions, includeNetVersion: true };
            const result = strategy.generate(mockProjects, options, mockClassDependencies);
            
            assert.ok(result.includes('label="Core (net6.0)"'), 'Should include Core with version');
            assert.ok(result.includes('label="Api (net6.0)"'), 'Should include Api with version');
            assert.ok(result.includes('label="Shared (netstandard2.1)"'), 'Should include Shared with version');
        });

        test('should exclude .NET versions when disabled', () => {
            const options = { ...defaultOptions, includeNetVersion: false };
            const result = strategy.generate(mockProjects, options, mockClassDependencies);
            
            assert.ok(result.includes('label="Core"'), 'Should include Core without version');
            assert.ok(result.includes('label="Api"'), 'Should include Api without version');
            assert.ok(result.includes('label="Shared"'), 'Should include Shared without version');
            assert.ok(!result.includes('(net6.0)'), 'Should not include version info');
        });

        test('should generate class nodes with correct IDs and labels', () => {
            const result = strategy.generate(mockProjects, defaultOptions, mockClassDependencies);
            
            // Check class node IDs (project.class format)
            assert.ok(result.includes('"Core.UserService"'), 'Should have UserService node ID');
            assert.ok(result.includes('"Api.UserController"'), 'Should have UserController node ID');
            assert.ok(result.includes('"Shared.BaseEntity"'), 'Should have BaseEntity node ID');
            
            // Check class labels (just class name)
            assert.ok(result.includes('label="UserService"'), 'Should have UserService label');
            assert.ok(result.includes('label="UserController"'), 'Should have UserController label');
            assert.ok(result.includes('label="BaseEntity"'), 'Should have BaseEntity label');
        });

        test('should generate class dependency edges', () => {
            const result = strategy.generate(mockProjects, defaultOptions, mockClassDependencies);
            
            // UserService dependencies
            assert.ok(result.includes('"Core.UserService" -> "Core.User"'), 'UserService should depend on User');
            assert.ok(result.includes('"Core.UserService" -> "Shared.IRepository"'), 'UserService should depend on IRepository');
            
            // UserController dependencies
            assert.ok(result.includes('"Api.UserController" -> "Core.UserService"'), 'UserController should depend on UserService');
            assert.ok(result.includes('"Api.UserController" -> "Core.User"'), 'UserController should depend on User');
            
            // User dependencies
            assert.ok(result.includes('"Core.User" -> "Shared.BaseEntity"'), 'User should depend on BaseEntity');
        });

        test('should handle cross-project dependencies correctly', () => {
            const result = strategy.generate(mockProjects, defaultOptions, mockClassDependencies);
            
            // Cross-project edges should exist
            assert.ok(result.includes('"Core.UserService" -> "Shared.IRepository"'), 'Should have Core -> Shared dependency');
            assert.ok(result.includes('"Api.UserController" -> "Core.UserService"'), 'Should have Api -> Core dependency');
            assert.ok(result.includes('"Core.User" -> "Shared.BaseEntity"'), 'Should have Core -> Shared dependency');
        });

        test('should apply cluster styling correctly', () => {
            const result = strategy.generate(mockProjects, defaultOptions, mockClassDependencies);
            
            assert.ok(result.includes('style="filled"'), 'Clusters should be filled');
            assert.ok(result.includes(`color="${defaultOptions.classDependencyColor}"`), 'Should use specified cluster color');
        });

        test('should handle classes with no dependencies', () => {
            const classDeps: ClassDependency[] = [
                {
                    className: 'IsolatedClass',
                    projectName: 'Core',
                    namespace: 'Core',
                    filePath: '/test/Core/IsolatedClass.cs',
                    dependencies: []
                }
            ];
            
            const result = strategy.generate(mockProjects, defaultOptions, classDeps);
            
            assert.ok(result.includes('"Core.IsolatedClass"'), 'Should include isolated class');
            assert.ok(!result.includes('"Core.IsolatedClass" ->'), 'Should not have outgoing edges');
        });

        test('should throw error when no class dependencies provided', () => {
            assert.throws(() => {
                strategy.generate(mockProjects, defaultOptions, []);
            }, /Class dependencies are required/, 'Should throw error for empty class dependencies');
            
            assert.throws(() => {
                strategy.generate(mockProjects, defaultOptions);
            }, /Class dependencies are required/, 'Should throw error for undefined class dependencies');
        });

        test('should handle duplicate class names in different projects', () => {
            const duplicateClassDeps: ClassDependency[] = [
                {
                    className: 'Service',
                    projectName: 'Core',
                    namespace: 'Core',
                    filePath: '/test/Core/Service.cs',
                    dependencies: []
                },
                {
                    className: 'Service',
                    projectName: 'Api',
                    namespace: 'Api',
                    filePath: '/test/Api/Service.cs',
                    dependencies: [
                        { className: 'Service', namespace: 'Core', projectName: 'Core' }
                    ]
                }
            ];
            
            const result = strategy.generate(mockProjects, defaultOptions, duplicateClassDeps);
            
            assert.ok(result.includes('"Core.Service"'), 'Should include Core.Service');
            assert.ok(result.includes('"Api.Service"'), 'Should include Api.Service');
            assert.ok(result.includes('"Api.Service" -> "Core.Service"'), 'Should have correct dependency edge');
        });
    });

    suite('Integration Tests', () => {
        test('should produce consistent results between strategies for same data', () => {
            const generator = new GraphGenerator();
            
            // Generate project graph
            const projectOptions = { ...defaultOptions, includeClassDependencies: false };
            const projectResult = generator.generateDotFile(mockProjects, projectOptions);
            
            // Generate class graph
            const classOptions = { ...defaultOptions, includeClassDependencies: true };
            const classResult = generator.generateDotFile(mockProjects, classOptions, mockClassDependencies);
            
            // Both should be valid DOT graphs
            assert.ok(projectResult.includes('digraph CSharpDependencies'), 'Project graph should be valid');
            assert.ok(classResult.includes('digraph CSharpDependencies'), 'Class graph should be valid');
            
            // Both should include project names in some form
            assert.ok(projectResult.includes('Core'), 'Project graph should mention Core');
            assert.ok(classResult.includes('Core'), 'Class graph should mention Core');
        });

        test('should handle large number of projects and classes', () => {
            const manyProjects: Project[] = [];
            const manyClasses: ClassDependency[] = [];
            
            // Generate 50 projects with 5 classes each
            for (let i = 0; i < 50; i++) {
                manyProjects.push({
                    name: `Project${i}`,
                    path: `/test/Project${i}/Project${i}.csproj`,
                    dependencies: i > 0 ? [`Project${i - 1}`] : [],
                    packageDependencies: [],
                    targetFramework: 'net6.0'
                });
                
                for (let j = 0; j < 5; j++) {
                    manyClasses.push({
                        className: `Class${j}`,
                        projectName: `Project${i}`,
                        namespace: `Project${i}`,
                        filePath: `/test/Project${i}/Class${j}.cs`,
                        dependencies: i > 0 && j === 0 ? [
                            { className: 'Class0', namespace: `Project${i - 1}`, projectName: `Project${i - 1}` }
                        ] : []
                    });
                }
            }
            
            const generator = new GraphGenerator();
            
            const startTime = Date.now();
            const result = generator.generateDotFile(manyProjects, defaultOptions, manyClasses);
            const endTime = Date.now();
            
            assert.ok(result.includes('digraph CSharpDependencies'), 'Should generate valid graph');
            assert.ok(result.length > 1000, 'Should generate substantial content');
            
            // Performance check
            const executionTime = endTime - startTime;
            assert.ok(executionTime < 2000, `Should complete within 2 seconds, took ${executionTime}ms`);
        });
    });
});