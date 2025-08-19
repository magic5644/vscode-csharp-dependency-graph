import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { findCsprojFiles } from '../../csprojFinder';
import { parseCsprojFiles } from '../../csprojParser';
import { findCSharpSourceFiles } from '../../csharpSourceFinder';
import { parseClassDependencies } from '../../csharpClassParser';
import { GraphGenerator } from '../../strategies/GraphGenerator';
import { detectProjectCycles, detectClassCycles } from '../../cycleDetector';

suite('Parsing Workflow Integration Test Suite', () => {
    let tempDir: string;
    let workspaceDir: string;

    setup(() => {
        // Create temporary directory for test workspace
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
        workspaceDir = path.join(tempDir, 'TestWorkspace');
        fs.mkdirSync(workspaceDir, { recursive: true });
    });

    teardown(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    /**
     * Helper to create a complete project structure
     */
    function createTestWorkspace(): void {
        // Create Core project
        const coreDir = path.join(workspaceDir, 'Core');
        fs.mkdirSync(coreDir, { recursive: true });

        fs.writeFileSync(path.join(coreDir, 'Core.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../Shared/Shared.csproj" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.DependencyInjection" Version="6.0.0" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(coreDir, 'UserService.cs'), `
using System;
using Shared.Models;
using Shared.Interfaces;

namespace Core.Services
{
    public class UserService : IUserService
    {
        private readonly IRepository<User> repository;

        public UserService(IRepository<User> repository)
        {
            this.repository = repository;
        }

        public User GetUser(int id)
        {
            return repository.GetById(id);
        }

        public void CreateUser(User user)
        {
            if (user == null)
                throw new ArgumentNullException(nameof(user));
            
            repository.Add(user);
        }
    }
}`);

        fs.writeFileSync(path.join(coreDir, 'UserRepository.cs'), `
using System.Collections.Generic;
using System.Linq;
using Shared.Models;
using Shared.Interfaces;

namespace Core.Repositories
{
    public class UserRepository : IRepository<User>
    {
        private readonly List<User> users = new List<User>();

        public User GetById(int id)
        {
            return users.FirstOrDefault(u => u.Id == id);
        }

        public void Add(User item)
        {
            users.Add(item);
        }

        public IEnumerable<User> GetAll()
        {
            return users.ToList();
        }
    }
}`);

        // Create Api project
        const apiDir = path.join(workspaceDir, 'Api');
        fs.mkdirSync(apiDir, { recursive: true });

        fs.writeFileSync(path.join(apiDir, 'Api.csproj'), `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../Core/Core.csproj" />
    <ProjectReference Include="../Shared/Shared.csproj" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc" Version="6.0.0" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(apiDir, 'UserController.cs'), `
using Microsoft.AspNetCore.Mvc;
using Core.Services;
using Shared.Models;
using Shared.DTOs;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly UserService userService;

        public UserController(UserService userService)
        {
            this.userService = userService;
        }

        [HttpGet("{id}")]
        public ActionResult<UserDto> GetUser(int id)
        {
            var user = userService.GetUser(id);
            if (user == null)
                return NotFound();

            return new UserDto { Id = user.Id, Email = user.Email };
        }

        [HttpPost]
        public ActionResult CreateUser(CreateUserRequest request)
        {
            var user = new User { Email = request.Email };
            userService.CreateUser(user);
            return Ok();
        }
    }
}`);

        // Create Shared project
        const sharedDir = path.join(workspaceDir, 'Shared');
        fs.mkdirSync(sharedDir, { recursive: true });

        fs.writeFileSync(path.join(sharedDir, 'Shared.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
  </PropertyGroup>
</Project>`);

        fs.writeFileSync(path.join(sharedDir, 'User.cs'), `
using System;

namespace Shared.Models
{
    public class User
    {
        public int Id { get; set; }
        public string Email { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}`);

        fs.writeFileSync(path.join(sharedDir, 'IRepository.cs'), `
using System.Collections.Generic;

namespace Shared.Interfaces
{
    public interface IRepository<T>
    {
        T GetById(int id);
        void Add(T item);
        IEnumerable<T> GetAll();
    }
}`);

        fs.writeFileSync(path.join(sharedDir, 'IUserService.cs'), `
using Shared.Models;

namespace Shared.Interfaces
{
    public interface IUserService
    {
        User GetUser(int id);
        void CreateUser(User user);
    }
}`);

        fs.writeFileSync(path.join(sharedDir, 'UserDto.cs'), `
namespace Shared.DTOs
{
    public class UserDto
    {
        public int Id { get; set; }
        public string Email { get; set; }
    }
}`);

        fs.writeFileSync(path.join(sharedDir, 'CreateUserRequest.cs'), `
namespace Shared.DTOs
{
    public class CreateUserRequest
    {
        public string Email { get; set; }
    }
}`);
    }

    test('should complete full project dependency analysis workflow', async () => {
        createTestWorkspace();

        // Step 1: Find .csproj files
        const csprojFiles = await findCsprojFiles(workspaceDir, false, [], false);
        
        assert.strictEqual(csprojFiles.length, 3, 'Should find 3 .csproj files');
        assert.ok(csprojFiles.some(f => f.includes('Core.csproj')), 'Should find Core.csproj');
        assert.ok(csprojFiles.some(f => f.includes('Api.csproj')), 'Should find Api.csproj');
        assert.ok(csprojFiles.some(f => f.includes('Shared.csproj')), 'Should find Shared.csproj');

        // Step 2: Parse .csproj files
        const projects = await parseCsprojFiles(csprojFiles);
        
        assert.strictEqual(projects.length, 3, 'Should parse 3 projects');
        
        const coreProject = projects.find(p => p.name === 'Core');
        const apiProject = projects.find(p => p.name === 'Api');
        const sharedProject = projects.find(p => p.name === 'Shared');
        
        assert.ok(coreProject, 'Should find Core project');
        assert.ok(apiProject, 'Should find Api project');
        assert.ok(sharedProject, 'Should find Shared project');
        
        // Verify dependencies
        assert.ok(coreProject.dependencies.includes('Shared'), 'Core should depend on Shared');
        assert.ok(apiProject.dependencies.includes('Core'), 'Api should depend on Core');
        assert.ok(apiProject.dependencies.includes('Shared'), 'Api should depend on Shared');
        assert.strictEqual(sharedProject.dependencies.length, 0, 'Shared should have no dependencies');

        // Step 3: Generate project dependency graph
        const graphGenerator = new GraphGenerator();
        const projectGraphOptions = {
            includeNetVersion: true,
            classDependencyColor: 'lightgray',
            includePackageDependencies: true,
            packageNodeColor: '#ffcccc'
        };

        const projectGraph = graphGenerator.generateDotFile(projects, projectGraphOptions);
        
        assert.ok(projectGraph.includes('digraph CSharpDependencies'), 'Should generate valid DOT graph');
        assert.ok(projectGraph.includes('"Core"'), 'Should include Core project');
        assert.ok(projectGraph.includes('"Api"'), 'Should include Api project');
        assert.ok(projectGraph.includes('"Shared"'), 'Should include Shared project');
        assert.ok(projectGraph.includes('"Core" -> "Shared"'), 'Should have Core -> Shared edge');
        assert.ok(projectGraph.includes('"Api" -> "Core"'), 'Should have Api -> Core edge');

        // Step 4: Detect project cycles
        const projectCycles = detectProjectCycles(projects);
        
        assert.strictEqual(projectCycles.cycles.length, 0, 'Should detect no project cycles');
        assert.strictEqual(projectCycles.cycles.length, 0, 'Should have no cycles');
    });

    test('should complete full class dependency analysis workflow', async () => {
        createTestWorkspace();

        // Step 1-2: Find and parse projects (same as above)
        const csprojFiles = await findCsprojFiles(workspaceDir, false, [], false);
        const projects = await parseCsprojFiles(csprojFiles);

        // Step 3: Find C# source files
        const sourceFiles = await findCSharpSourceFiles(csprojFiles, [
            '**/obj/**',
            '**/bin/**'
        ]);

        assert.strictEqual(sourceFiles.size, 3, 'Should find source files for 3 projects');
        assert.ok(sourceFiles.has('Core'), 'Should find Core source files');
        assert.ok(sourceFiles.has('Api'), 'Should find Api source files');
        assert.ok(sourceFiles.has('Shared'), 'Should find Shared source files');

        const coreFiles = sourceFiles.get('Core')!;
        const apiFiles = sourceFiles.get('Api')!;
        const sharedFiles = sourceFiles.get('Shared')!;

        assert.strictEqual(coreFiles.length, 2, 'Core should have 2 source files');
        assert.strictEqual(apiFiles.length, 1, 'Api should have 1 source file');
        assert.strictEqual(sharedFiles.length, 5, 'Shared should have 5 source files');

        // Step 4: Parse class dependencies
        const classDependencies = await parseClassDependencies(sourceFiles);

        assert.ok(classDependencies.length >= 5, 'Should find multiple classes');
        
        const userService = classDependencies.find(c => c.className === 'UserService');
        const userController = classDependencies.find(c => c.className === 'UserController');
        const user = classDependencies.find(c => c.className === 'User');
        
        assert.ok(userService, 'Should find UserService class');
        assert.ok(userController, 'Should find UserController class');
        assert.ok(user, 'Should find User class');

        // Verify class dependencies
        assert.ok(userService.dependencies.some(d => d.className === 'User'), 'UserService should depend on User');
        assert.ok(userController.dependencies.some(d => d.className === 'UserService'), 'UserController should depend on UserService');

        // Step 5: Generate class dependency graph
        const graphGenerator = new GraphGenerator();
        const classGraphOptions = {
            includeNetVersion: true,
            classDependencyColor: 'lightgray',
            includeClassDependencies: true
        };

        const classGraph = graphGenerator.generateDotFile(projects, classGraphOptions, classDependencies);

        assert.ok(classGraph.includes('digraph CSharpDependencies'), 'Should generate valid class graph');
        assert.ok(classGraph.includes('subgraph "cluster_Core"'), 'Should have Core cluster');
        assert.ok(classGraph.includes('subgraph "cluster_Api"'), 'Should have Api cluster');
        assert.ok(classGraph.includes('subgraph "cluster_Shared"'), 'Should have Shared cluster');
        assert.ok(classGraph.includes('"Core.UserService"'), 'Should include UserService node');
        assert.ok(classGraph.includes('"Api.UserController"'), 'Should include UserController node');

        // Step 6: Detect class cycles
        const classCycles = detectClassCycles(classDependencies);
        
        // In this simple example, there should be no cycles
        assert.strictEqual(classCycles.cycles.length, 0, 'Should detect no class cycles');
    });

    test('should handle workflow with circular dependencies', async () => {
        // Create a workspace with circular dependencies
        const circularDir = path.join(workspaceDir, 'Circular');
        fs.mkdirSync(circularDir, { recursive: true });

        // Project A depends on B
        fs.writeFileSync(path.join(circularDir, 'ProjectA.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="ProjectB.csproj" />
  </ItemGroup>
</Project>`);

        // Project B depends on A (circular!)
        fs.writeFileSync(path.join(circularDir, 'ProjectB.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="ProjectA.csproj" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(circularDir, 'ClassA.cs'), `
namespace Circular
{
    public class ClassA
    {
        public ClassB B { get; set; }
    }
}`);

        fs.writeFileSync(path.join(circularDir, 'ClassB.cs'), `
namespace Circular
{
    public class ClassB
    {
        public ClassA A { get; set; }
    }
}`);

        // Run the workflow
        const csprojFiles = await findCsprojFiles(circularDir, false, [], false);
        const projects = await parseCsprojFiles(csprojFiles);

        // Should detect project cycle
        const projectCycles = detectProjectCycles(projects);
        assert.ok(projectCycles.cycles.length > 0, 'Should detect project cycles');
        assert.ok(projectCycles.cycles.length > 0, 'Should have cycles detected');

        // Parse class dependencies
        const sourceFiles = await findCSharpSourceFiles(csprojFiles, []);
        const classDependencies = await parseClassDependencies(sourceFiles);

        // Should detect class cycle
        const classCycles = detectClassCycles(classDependencies);
        assert.ok(classCycles.cycles.length > 0, 'Should detect class cycles');
    });

    test('should handle large workspace efficiently', async () => {
        // Create a larger workspace for performance testing
        const projectCount = 10;
        const classesPerProject = 5;

        for (let i = 0; i < projectCount; i++) {
            const projectDir = path.join(workspaceDir, `Project${i}`);
            fs.mkdirSync(projectDir, { recursive: true });

            // Create project file with dependencies on previous projects
            const dependencies = i > 0 ? `<ProjectReference Include="../Project${i - 1}/Project${i - 1}.csproj" />` : '';
            fs.writeFileSync(path.join(projectDir, `Project${i}.csproj`), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    ${dependencies}
  </ItemGroup>
</Project>`);

            // Create multiple classes per project
            for (let j = 0; j < classesPerProject; j++) {
                const classDependency = i > 0 && j === 0 ? `public Project${i - 1}.Class0 Previous { get; set; }` : '';
                fs.writeFileSync(path.join(projectDir, `Class${j}.cs`), `
namespace Project${i}
{
    public class Class${j}
    {
        ${classDependency}
        
        public void Method${j}()
        {
            // Some implementation
        }
    }
}`);
            }
        }

        const startTime = Date.now();

        // Run complete workflow
        const csprojFiles = await findCsprojFiles(workspaceDir, false, [], false);
        const projects = await parseCsprojFiles(csprojFiles);
        const sourceFiles = await findCSharpSourceFiles(csprojFiles, []);
        const classDependencies = await parseClassDependencies(sourceFiles);

        const graphGenerator = new GraphGenerator();
        const projectGraph = graphGenerator.generateDotFile(projects, {
            includeNetVersion: true,
            classDependencyColor: 'lightgray'
        });

        const classGraph = graphGenerator.generateDotFile(projects, {
            includeNetVersion: true,
            classDependencyColor: 'lightgray',
            includeClassDependencies: true
        }, classDependencies);

        const endTime = Date.now();

        // Verify results
        assert.strictEqual(projects.length, projectCount, `Should find ${projectCount} projects`);
        assert.strictEqual(classDependencies.length, projectCount * classesPerProject, `Should find ${projectCount * classesPerProject} classes`);
        assert.ok(projectGraph.includes('digraph CSharpDependencies'), 'Should generate valid project graph');
        assert.ok(classGraph.includes('digraph CSharpDependencies'), 'Should generate valid class graph');

        // Performance check
        const executionTime = endTime - startTime;
        assert.ok(executionTime < 10000, `Complete workflow should finish within 10 seconds, took ${executionTime}ms`);
    });

    test('should handle workspace with mixed project types', async () => {
        // Create different types of projects
        const webApiDir = path.join(workspaceDir, 'WebApi');
        const consoleDir = path.join(workspaceDir, 'Console');
        const libraryDir = path.join(workspaceDir, 'Library');
        const testDir = path.join(workspaceDir, 'Tests');

        fs.mkdirSync(webApiDir, { recursive: true });
        fs.mkdirSync(consoleDir, { recursive: true });
        fs.mkdirSync(libraryDir, { recursive: true });
        fs.mkdirSync(testDir, { recursive: true });

        // Web API project
        fs.writeFileSync(path.join(webApiDir, 'WebApi.csproj'), `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../Library/Library.csproj" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(webApiDir, 'Program.cs'), `
using Library;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => new BusinessService().GetData());
app.Run();
`);

        // Console application
        fs.writeFileSync(path.join(consoleDir, 'Console.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../Library/Library.csproj" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(consoleDir, 'Program.cs'), `
using Library;

var service = new BusinessService();
Console.WriteLine(service.GetData());
`);

        // Library project
        fs.writeFileSync(path.join(libraryDir, 'Library.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
  </PropertyGroup>
</Project>`);

        fs.writeFileSync(path.join(libraryDir, 'BusinessService.cs'), `
namespace Library
{
    public class BusinessService
    {
        public string GetData()
        {
            return "Hello from library!";
        }
    }
}`);

        // Test project
        fs.writeFileSync(path.join(testDir, 'Tests.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../Library/Library.csproj" />
  </ItemGroup>
</Project>`);

        fs.writeFileSync(path.join(testDir, 'BusinessServiceTests.cs'), `
using Library;

namespace Tests
{
    public class BusinessServiceTests
    {
        public void TestGetData()
        {
            var service = new BusinessService();
            var result = service.GetData();
            // Assert result
        }
    }
}`);

        // Run workflow excluding test projects
        const csprojFiles = await findCsprojFiles(workspaceDir, true, ['*Test*', '*Tests*'], false);
        const projects = await parseCsprojFiles(csprojFiles);

        // Should find 3 projects (excluding test project)
        assert.strictEqual(projects.length, 3, 'Should find 3 non-test projects');
        assert.ok(projects.some(p => p.name === 'WebApi'), 'Should find WebApi project');
        assert.ok(projects.some(p => p.name === 'Console'), 'Should find Console project');
        assert.ok(projects.some(p => p.name === 'Library'), 'Should find Library project');
        assert.ok(!projects.some(p => p.name === 'Tests'), 'Should exclude Tests project');

        // Verify dependencies
        const webApiProject = projects.find(p => p.name === 'WebApi')!;
        const consoleProject = projects.find(p => p.name === 'Console')!;
        const libraryProject = projects.find(p => p.name === 'Library')!;

        assert.ok(webApiProject.dependencies.includes('Library'), 'WebApi should depend on Library');
        assert.ok(consoleProject.dependencies.includes('Library'), 'Console should depend on Library');
        assert.strictEqual(libraryProject.dependencies.length, 0, 'Library should have no dependencies');

        // Generate graph and verify structure
        const graphGenerator = new GraphGenerator();
        const graph = graphGenerator.generateDotFile(projects, {
            includeNetVersion: true,
            classDependencyColor: 'lightgray'
        });

        assert.ok(graph.includes('"WebApi" -> "Library"'), 'Should show WebApi -> Library dependency');
        assert.ok(graph.includes('"Console" -> "Library"'), 'Should show Console -> Library dependency');
    });
});