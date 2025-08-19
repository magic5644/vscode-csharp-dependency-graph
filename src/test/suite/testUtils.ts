import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Project } from '../../csprojParser';
import { ClassDependency, DependencyInfo } from '../../csharpClassParser';

/**
 * Test utilities for creating mock data and temporary files
 */
export class TestUtils {
    /**
     * Creates a temporary directory for tests
     */
    static createTempDirectory(prefix: string = 'test-'): string {
        return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }

    /**
     * Cleans up a temporary directory
     */
    static cleanupTempDirectory(dirPath: string): void {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }

    /**
     * Creates a temporary file with content
     */
    static createTempFile(dirPath: string, fileName: string, content: string): string {
        const filePath = path.join(dirPath, fileName);
        const fileDir = path.dirname(filePath);
        
        // Ensure directory exists
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    /**
     * Creates a mock .csproj file
     */
    static createMockCsprojFile(
        dirPath: string, 
        projectName: string, 
        options: {
            targetFramework?: string;
            dependencies?: string[];
            packageDependencies?: { name: string; version: string }[];
            projectType?: 'library' | 'console' | 'web';
        } = {}
    ): string {
        const {
            targetFramework = 'net6.0',
            dependencies = [],
            packageDependencies = [],
            projectType = 'library'
        } = options;

        const sdkType = projectType === 'web' ? 'Microsoft.NET.Sdk.Web' : 'Microsoft.NET.Sdk';
        const outputType = projectType === 'console' ? '<OutputType>Exe</OutputType>' : '';

        const projectReferences = dependencies.map(dep => 
            `    <ProjectReference Include="../${dep}/${dep}.csproj" />`
        ).join('\n');

        const packageReferences = packageDependencies.map(pkg => 
            `    <PackageReference Include="${pkg.name}" Version="${pkg.version}" />`
        ).join('\n');

        const content = `
<Project Sdk="${sdkType}">
  <PropertyGroup>
    <TargetFramework>${targetFramework}</TargetFramework>
    ${outputType}
  </PropertyGroup>

  ${projectReferences ? `<ItemGroup>\n${projectReferences}\n  </ItemGroup>` : ''}

  ${packageReferences ? `<ItemGroup>\n${packageReferences}\n  </ItemGroup>` : ''}
</Project>`.trim();

        return TestUtils.createTempFile(dirPath, `${projectName}.csproj`, content);
    }

    /**
     * Creates a mock C# class file
     */
    static createMockCSharpFile(
        dirPath: string,
        fileName: string,
        options: {
            namespace?: string;
            className?: string;
            baseClass?: string;
            interfaces?: string[];
            usings?: string[];
            properties?: { type: string; name: string }[];
            methods?: { returnType: string; name: string; parameters?: string }[];
        } = {}
    ): string {
        const {
            namespace = 'TestNamespace',
            className = path.basename(fileName, '.cs'),
            baseClass,
            interfaces = [],
            usings = ['System'],
            properties = [],
            methods = []
        } = options;

        const usingStatements = usings.map(u => `using ${u};`).join('\n');
        
        const inheritance = [];
        if (baseClass) inheritance.push(baseClass);
        inheritance.push(...interfaces);
        const inheritanceClause = inheritance.length > 0 ? ` : ${inheritance.join(', ')}` : '';

        const propertyDeclarations = properties.map(p => 
            `        public ${p.type} ${p.name} { get; set; }`
        ).join('\n');

        const methodDeclarations = methods.map(m => 
            `        public ${m.returnType} ${m.name}(${m.parameters || ''}) { }`
        ).join('\n');

        const content = `
${usingStatements}

namespace ${namespace}
{
    public class ${className}${inheritanceClause}
    {
${propertyDeclarations}

${methodDeclarations}
    }
}`.trim();

        return TestUtils.createTempFile(dirPath, fileName, content);
    }

    /**
     * Creates mock project data
     */
    static createMockProjects(count: number = 3): Project[] {
        const projects: Project[] = [];
        
        for (let i = 0; i < count; i++) {
            projects.push({
                name: `Project${i}`,
                path: `/mock/Project${i}/Project${i}.csproj`,
                dependencies: i > 0 ? [`Project${i - 1}`] : [],
                packageDependencies: [
                    { name: `MockPackage${i}`, version: '1.0.0' }
                ],
                targetFramework: 'net6.0'
            });
        }
        
        return projects;
    }

    /**
     * Creates mock class dependencies
     */
    static createMockClassDependencies(projectNames: string[] = ['ProjectA', 'ProjectB']): ClassDependency[] {
        const classDependencies: ClassDependency[] = [];
        
        for (let i = 0; i < projectNames.length; i++) {
            const projectName = projectNames[i];
            
            // Create 2-3 classes per project
            for (let j = 0; j < 2; j++) {
                const className = `Class${j}`;
                const dependencies: DependencyInfo[] = [];
                
                // Add some dependencies
                if (i > 0 && j === 0) {
                    // First class depends on previous project's first class
                    dependencies.push({
                        className: 'Class0',
                        namespace: projectNames[i - 1],
                        projectName: projectNames[i - 1]
                    });
                }
                
                if (j > 0) {
                    // Later classes depend on earlier classes in same project
                    dependencies.push({
                        className: 'Class0',
                        namespace: projectName,
                        projectName: projectName
                    });
                }
                
                classDependencies.push({
                    className,
                    projectName,
                    namespace: projectName,
                    filePath: `/mock/${projectName}/${className}.cs`,
                    dependencies
                });
            }
        }
        
        return classDependencies;
    }

    /**
     * Creates mock class dependencies with circular references
     */
    static createMockCircularClassDependencies(): ClassDependency[] {
        return [
            {
                className: 'ClassA',
                projectName: 'Project1',
                namespace: 'Project1',
                filePath: '/mock/Project1/ClassA.cs',
                dependencies: [
                    { className: 'ClassB', namespace: 'Project1', projectName: 'Project1' }
                ]
            },
            {
                className: 'ClassB',
                projectName: 'Project1',
                namespace: 'Project1',
                filePath: '/mock/Project1/ClassB.cs',
                dependencies: [
                    { className: 'ClassC', namespace: 'Project1', projectName: 'Project1' }
                ]
            },
            {
                className: 'ClassC',
                projectName: 'Project1',
                namespace: 'Project1',
                filePath: '/mock/Project1/ClassC.cs',
                dependencies: [
                    { className: 'ClassA', namespace: 'Project1', projectName: 'Project1' }
                ]
            }
        ];
    }

    /**
     * Creates a complex test workspace structure
     */
    static createComplexTestWorkspace(baseDir: string): string[] {
        interface FileDefinition {
            name: string;
            namespace: string;
            className: string;
            baseClass?: string;
            interfaces?: string[];
            usings?: string[];
            properties?: { type: string; name: string }[];
            methods?: { returnType: string; name: string; parameters?: string }[];
        }

        const projects: {
            name: string;
            type: 'library' | 'console' | 'web';
            dependencies: string[];
            files: FileDefinition[];
        }[] = [
            {
                name: 'Domain',
                type: 'library',
                dependencies: [],
                files: [
                    {
                        name: 'User.cs',
                        namespace: 'Domain.Entities',
                        className: 'User',
                        properties: [
                            { type: 'int', name: 'Id' },
                            { type: 'string', name: 'Email' },
                            { type: 'DateTime', name: 'CreatedAt' }
                        ]
                    },
                    {
                        name: 'IUserRepository.cs',
                        namespace: 'Domain.Interfaces',
                        className: 'IUserRepository',
                        methods: [
                            { returnType: 'User', name: 'GetById', parameters: 'int id' },
                            { returnType: 'void', name: 'Add', parameters: 'User user' }
                        ]
                    }
                ]
            },
            {
                name: 'Infrastructure',
                type: 'library',
                dependencies: ['Domain'],
                files: [
                    {
                        name: 'UserRepository.cs',
                        namespace: 'Infrastructure.Repositories',
                        className: 'UserRepository',
                        interfaces: ['Domain.Interfaces.IUserRepository'],
                        usings: ['Domain.Entities', 'Domain.Interfaces'],
                        methods: [
                            { returnType: 'User', name: 'GetById', parameters: 'int id' },
                            { returnType: 'void', name: 'Add', parameters: 'User user' }
                        ]
                    }
                ]
            },
            {
                name: 'Application',
                type: 'library',
                dependencies: ['Domain'],
                files: [
                    {
                        name: 'UserService.cs',
                        namespace: 'Application.Services',
                        className: 'UserService',
                        usings: ['Domain.Entities', 'Domain.Interfaces'],
                        properties: [
                            { type: 'IUserRepository', name: 'Repository' }
                        ],
                        methods: [
                            { returnType: 'User', name: 'GetUser', parameters: 'int id' },
                            { returnType: 'void', name: 'CreateUser', parameters: 'User user' }
                        ]
                    }
                ]
            },
            {
                name: 'WebApi',
                type: 'web',
                dependencies: ['Application', 'Infrastructure', 'Domain'],
                files: [
                    {
                        name: 'UserController.cs',
                        namespace: 'WebApi.Controllers',
                        className: 'UserController',
                        baseClass: 'ControllerBase',
                        usings: ['Microsoft.AspNetCore.Mvc', 'Application.Services', 'Domain.Entities'],
                        properties: [
                            { type: 'UserService', name: 'UserService' }
                        ],
                        methods: [
                            { returnType: 'ActionResult<User>', name: 'GetUser', parameters: 'int id' },
                            { returnType: 'ActionResult', name: 'CreateUser', parameters: 'User user' }
                        ]
                    }
                ]
            }
        ];

        const csprojPaths: string[] = [];

        for (const project of projects) {
            const projectDir = path.join(baseDir, project.name);
            fs.mkdirSync(projectDir, { recursive: true });

            // Create .csproj file
            const csprojPath = TestUtils.createMockCsprojFile(projectDir, project.name, {
                targetFramework: 'net6.0',
                dependencies: project.dependencies,
                projectType: project.type,
                packageDependencies: project.name === 'WebApi' ? [
                    { name: 'Microsoft.AspNetCore.Mvc', version: '6.0.0' }
                ] : []
            });
            csprojPaths.push(csprojPath);

            // Create source files
            for (const file of project.files) {
                TestUtils.createMockCSharpFile(projectDir, file.name, {
                    namespace: file.namespace,
                    className: file.className,
                    baseClass: file.baseClass,
                    interfaces: file.interfaces,
                    usings: file.usings,
                    properties: file.properties,
                    methods: file.methods
                });
            }
        }

        return csprojPaths;
    }

    /**
     * Validates DOT graph content
     */
    static validateDotGraph(dotContent: string): {
        isValid: boolean;
        hasHeader: boolean;
        hasFooter: boolean;
        nodeCount: number;
        edgeCount: number;
        errors: string[];
    } {
        const errors: string[] = [];
        
        const hasHeader = dotContent.includes('digraph');
        const hasFooter = dotContent.includes('}');
        
        if (!hasHeader) {
            errors.push('Missing digraph header');
        }
        
        if (!hasFooter) {
            errors.push('Missing closing brace');
        }

        // Count nodes (rough approximation)
        const nodeMatches = dotContent.match(/"\w+"\s*\[/g);
        const nodeCount = nodeMatches ? nodeMatches.length : 0;

        // Count edges (rough approximation)
        const edgeMatches = dotContent.match(/"\w+"\s*->\s*"\w+"/g);
        const edgeCount = edgeMatches ? edgeMatches.length : 0;

        const isValid = hasHeader && hasFooter && errors.length === 0;

        return {
            isValid,
            hasHeader,
            hasFooter,
            nodeCount,
            edgeCount,
            errors
        };
    }

    /**
     * Performance measurement helper
     */
    static async measurePerformance<T>(
        operation: () => Promise<T>,
        label: string = 'Operation'
    ): Promise<{ result: T; duration: number }> {
        const startTime = Date.now();
        const result = await operation();
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`${label} completed in ${duration}ms`);
        
        return { result, duration };
    }

    /**
     * Assert performance within threshold
     */
    static assertPerformance(duration: number, threshold: number, operation: string): void {
        if (duration > threshold) {
            throw new Error(`Performance assertion failed: ${operation} took ${duration}ms, expected <= ${threshold}ms`);
        }
    }

    /**
     * Create test data for stress testing
     */
    static createStressTestData(projectCount: number, classesPerProject: number): {
        projects: Project[];
        classDependencies: ClassDependency[];
    } {
        const projects: Project[] = [];
        const classDependencies: ClassDependency[] = [];

        for (let i = 0; i < projectCount; i++) {
            const projectName = `StressProject${i}`;
            
            projects.push({
                name: projectName,
                path: `/stress/${projectName}/${projectName}.csproj`,
                dependencies: i > 0 ? [`StressProject${i - 1}`] : [],
                packageDependencies: [
                    { name: `Package${i}`, version: '1.0.0' }
                ],
                targetFramework: 'net6.0'
            });

            for (let j = 0; j < classesPerProject; j++) {
                const className = `Class${j}`;
                const dependencies: DependencyInfo[] = [];

                // Add some dependencies to create a realistic graph
                if (i > 0 && j === 0) {
                    dependencies.push({
                        className: 'Class0',
                        namespace: `StressProject${i - 1}`,
                        projectName: `StressProject${i - 1}`
                    });
                }

                if (j > 0) {
                    dependencies.push({
                        className: `Class${j - 1}`,
                        namespace: projectName,
                        projectName: projectName
                    });
                }

                classDependencies.push({
                    className,
                    projectName,
                    namespace: projectName,
                    filePath: `/stress/${projectName}/${className}.cs`,
                    dependencies
                });
            }
        }

        return { projects, classDependencies };
    }
}

/**
 * Test assertions helper
 */
export class TestAssertions {
    /**
     * Assert that a DOT graph contains expected nodes
     */
    static assertGraphContainsNodes(dotContent: string, expectedNodes: string[]): void {
        for (const node of expectedNodes) {
            if (!dotContent.includes(`"${node}"`)) {
                throw new Error(`Graph should contain node: ${node}`);
            }
        }
    }

    /**
     * Assert that a DOT graph contains expected edges
     */
    static assertGraphContainsEdges(dotContent: string, expectedEdges: { from: string; to: string }[]): void {
        for (const edge of expectedEdges) {
            const edgePattern = `"${edge.from}" -> "${edge.to}"`;
            if (!dotContent.includes(edgePattern)) {
                throw new Error(`Graph should contain edge: ${edge.from} -> ${edge.to}`);
            }
        }
    }

    /**
     * Assert that dependencies are correctly resolved
     */
    static assertDependenciesResolved(
        classDependencies: ClassDependency[],
        expectedDependencies: { className: string; dependsOn: string[] }[]
    ): void {
        for (const expected of expectedDependencies) {
            const classObj = classDependencies.find(c => c.className === expected.className);
            if (!classObj) {
                throw new Error(`Class not found: ${expected.className}`);
            }

            for (const expectedDep of expected.dependsOn) {
                const hasDependency = classObj.dependencies.some(d => d.className === expectedDep);
                if (!hasDependency) {
                    throw new Error(`${expected.className} should depend on ${expectedDep}`);
                }
            }
        }
    }

    /**
     * Assert array contents without order dependency
     */
    static assertArrayContains<T>(actual: T[], expected: T[], message?: string): void {
        for (const item of expected) {
            if (!actual.includes(item)) {
                throw new Error(message || `Array should contain: ${item}`);
            }
        }
    }
}