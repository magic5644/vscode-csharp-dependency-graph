import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseCsprojFiles } from '../../csprojParser';

suite('Enhanced CSProj Parser Test Suite', () => {
    let tempDir: string;

    setup(() => {
        // Create temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csproj-parser-test-'));
    });

    teardown(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    /**
     * Helper function to create a .csproj file
     */
    function createCsprojFile(fileName: string, content: string): string {
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    test('should parse modern SDK-style project', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Shared/Shared.csproj" />
    <ProjectReference Include="../Common/Common.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.DependencyInjection" Version="6.0.0" />
    <PackageReference Include="AutoMapper" Version="11.0.1" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('ModernProject.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'ModernProject');
        assert.strictEqual(project.targetFramework, 'net6.0');
        assert.strictEqual(project.dependencies.length, 2);
        assert.ok(project.dependencies.includes('Shared'));
        assert.ok(project.dependencies.includes('Common'));
        assert.strictEqual(project.packageDependencies.length, 2);
        
        const diPackage = project.packageDependencies.find(p => p.name === 'Microsoft.Extensions.DependencyInjection');
        assert.ok(diPackage);
        assert.strictEqual(diPackage.version, '6.0.0');
        
        const automapperPackage = project.packageDependencies.find(p => p.name === 'AutoMapper');
        assert.ok(automapperPackage);
        assert.strictEqual(automapperPackage.version, '11.0.1');
    });

    test('should parse legacy .NET Framework project', async () => {
        const csprojContent = `
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{12345678-1234-1234-1234-123456789012}</ProjectGuid>
    <OutputType>Library</OutputType>
    <AppDesignerFolder>Properties</AppDesignerFolder>
    <RootNamespace>LegacyProject</RootNamespace>
    <AssemblyName>LegacyProject</AssemblyName>
    <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
    <FileAlignment>512</FileAlignment>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\\OtherProject\\OtherProject.csproj">
      <Project>{87654321-4321-4321-4321-210987654321}</Project>
      <Name>OtherProject</Name>
    </ProjectReference>
  </ItemGroup>
  <ItemGroup>
    <Reference Include="Newtonsoft.Json, Version=13.0.0.0, Culture=neutral, PublicKeyToken=30ad4fe6b2a6aeed, processorArchitecture=MSIL">
      <HintPath>..\\packages\\Newtonsoft.Json.13.0.1\\lib\\net45\\Newtonsoft.Json.dll</HintPath>
    </Reference>
  </ItemGroup>
  <Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />
</Project>`;

        const csprojPath = createCsprojFile('LegacyProject.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'LegacyProject');
        assert.strictEqual(project.targetFramework, 'v4.7.2');
        assert.strictEqual(project.dependencies.length, 1);
        assert.ok(project.dependencies.includes('OtherProject'));
    });

    test('should handle multi-target projects', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net6.0;netstandard2.1;net472</TargetFrameworks>
    <GeneratePackageOnBuild>true</GeneratePackageOnBuild>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Core/Core.csproj" />
  </ItemGroup>

  <ItemGroup Condition="'$(TargetFramework)' == 'net6.0'">
    <PackageReference Include="Microsoft.Extensions.Hosting" Version="6.0.0" />
  </ItemGroup>

  <ItemGroup Condition="'$(TargetFramework)' == 'netstandard2.1'">
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="6.0.0" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('MultiTargetProject.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'MultiTargetProject');
        // Should pick the first target framework
        assert.ok(['net6.0', 'netstandard2.1', 'net472'].includes(project.targetFramework));
        assert.strictEqual(project.dependencies.length, 1);
        assert.ok(project.dependencies.includes('Core'));
    });

    test('should handle malformed XML gracefully', async () => {
        const malformedContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <!-- Missing closing tag -->
  <ItemGroup>
    <ProjectReference Include="../Other/Other.csproj" />
  </ItemGroup>
`;

        const csprojPath = createCsprojFile('MalformedProject.csproj', malformedContent);
        
        // Should not throw, but may return empty or partial results
        const result = await parseCsprojFiles([csprojPath]);
        
        // Should handle gracefully - either empty result or best-effort parsing
        assert.ok(Array.isArray(result), 'Should return an array');
    });

    test('should handle projects with no dependencies', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <Description>A simple library with no dependencies</Description>
  </PropertyGroup>
</Project>`;

        const csprojPath = createCsprojFile('NoDepsProject.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'NoDepsProject');
        assert.strictEqual(project.targetFramework, 'netstandard2.1');
        assert.strictEqual(project.dependencies.length, 0);
        assert.strictEqual(project.packageDependencies.length, 0);
    });

    test('should handle packages with complex version specifications', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="PackageWithRange" Version="[1.0.0, 2.0.0)" />
    <PackageReference Include="PackageWithWildcard" Version="1.2.*" />
    <PackageReference Include="PackageExact" Version="3.1.4" />
    <PackageReference Include="PackageMinimum" Version="5.0.0-*" />
    <PackageReference Include="PackageNoVersion" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('ComplexVersions.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.packageDependencies.length, 5);
        
        const packages = project.packageDependencies;
        assert.ok(packages.some(p => p.name === 'PackageWithRange' && p.version === '[1.0.0, 2.0.0)'));
        assert.ok(packages.some(p => p.name === 'PackageWithWildcard' && p.version === '1.2.*'));
        assert.ok(packages.some(p => p.name === 'PackageExact' && p.version === '3.1.4'));
        assert.ok(packages.some(p => p.name === 'PackageMinimum' && p.version === '5.0.0-*'));
        assert.ok(packages.some(p => p.name === 'PackageNoVersion' && (p.version === '' || p.version === undefined)));
    });

    test('should handle nested ItemGroups and PropertyGroups', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <PropertyGroup Condition="'$(Configuration)' == 'Debug'">
    <DefineConstants>DEBUG;TRACE</DefineConstants>
  </PropertyGroup>

  <PropertyGroup Condition="'$(Configuration)' == 'Release'">
    <Optimize>true</Optimize>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Project1/Project1.csproj" />
  </ItemGroup>

  <ItemGroup Condition="'$(Configuration)' == 'Debug'">
    <ProjectReference Include="../TestUtils/TestUtils.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Logging" Version="6.0.0" />
  </ItemGroup>

  <ItemGroup Condition="'$(TargetFramework)' == 'net6.0'">
    <PackageReference Include="System.Text.Json" Version="6.0.0" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('NestedGroups.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'NestedGroups');
        
        // Should find dependencies from all ItemGroups
        assert.ok(project.dependencies.includes('Project1'));
        assert.ok(project.dependencies.includes('TestUtils'));
        
        // Should find packages from all ItemGroups
        const packageNames = project.packageDependencies.map(p => p.name);
        assert.ok(packageNames.includes('Microsoft.Extensions.Logging'));
        assert.ok(packageNames.includes('System.Text.Json'));
    });

    test('should handle projects with relative paths containing special characters', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Project With Spaces/Project With Spaces.csproj" />
    <ProjectReference Include="../Project-With-Dashes/Project-With-Dashes.csproj" />
    <ProjectReference Include="../Project.With.Dots/Project.With.Dots.csproj" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('SpecialChars.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.dependencies.length, 3);
        assert.ok(project.dependencies.includes('Project With Spaces'));
        assert.ok(project.dependencies.includes('Project-With-Dashes'));
        assert.ok(project.dependencies.includes('Project.With.Dots'));
    });

    test('should handle empty project files', async () => {
        const emptyCsprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
</Project>`;

        const csprojPath = createCsprojFile('EmptyProject.csproj', emptyCsprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'EmptyProject');
        assert.strictEqual(project.targetFramework, 'unknown');
        assert.strictEqual(project.dependencies.length, 0);
        assert.strictEqual(project.packageDependencies.length, 0);
    });

    test('should handle projects with MSBuild conditions and variables', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Core/Core.csproj" />
  </ItemGroup>

  <ItemGroup Condition="'$(IsTestProject)' == 'true'">
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />
    <PackageReference Include="xunit" Version="2.4.1" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.4.3" />
  </ItemGroup>

  <ItemGroup Condition="'$(IsTestProject)' != 'true'">
    <PackageReference Include="Microsoft.Extensions.Hosting" Version="6.0.0" />
  </ItemGroup>
</Project>`;

        const csprojPath = createCsprojFile('ConditionalProject.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'ConditionalProject');
        assert.ok(project.dependencies.includes('Core'));
        
        // Should include packages from conditional ItemGroups
        const packageNames = project.packageDependencies.map(p => p.name);
        assert.ok(packageNames.includes('Microsoft.NET.Test.Sdk'));
        assert.ok(packageNames.includes('xunit'));
        assert.ok(packageNames.includes('Microsoft.Extensions.Hosting'));
    });

    test('should parse multiple projects efficiently', async () => {
        const projectCount = 20;
        const csprojPaths: string[] = [];

        // Create many similar projects
        for (let i = 0; i < projectCount; i++) {
            const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    ${i > 0 ? `<ProjectReference Include="../Project${i - 1}/Project${i - 1}.csproj" />` : ''}
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Logging" Version="6.0.0" />
  </ItemGroup>
</Project>`;

            const csprojPath = createCsprojFile(`Project${i}.csproj`, csprojContent);
            csprojPaths.push(csprojPath);
        }

        const startTime = Date.now();
        const result = await parseCsprojFiles(csprojPaths);
        const endTime = Date.now();

        assert.strictEqual(result.length, projectCount);
        
        // Verify chain of dependencies
        for (let i = 1; i < projectCount; i++) {
            const project = result.find(p => p.name === `Project${i}`);
            assert.ok(project);
            assert.ok(project.dependencies.includes(`Project${i - 1}`));
        }

        // Performance check
        const executionTime = endTime - startTime;
        assert.ok(executionTime < 3000, `Parsing ${projectCount} projects should complete within 3 seconds, took ${executionTime}ms`);
    });

    test('should handle non-existent files gracefully', async () => {
        const nonExistentPath = path.join(tempDir, 'NonExistent.csproj');
        
        const result = await parseCsprojFiles([nonExistentPath]);
        
        // Should handle gracefully without throwing
        assert.ok(Array.isArray(result), 'Should return an array');
        // May be empty or contain placeholder entries
    });

    test('should handle mixed valid and invalid project files', async () => {
        const validContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
</Project>`;

        const invalidContent = `
This is not XML at all!
Just some random text.
`;

        const validPath = createCsprojFile('Valid.csproj', validContent);
        const invalidPath = createCsprojFile('Invalid.csproj', invalidContent);
        const nonExistentPath = path.join(tempDir, 'NonExistent.csproj');

        const result = await parseCsprojFiles([validPath, invalidPath, nonExistentPath]);
        
        // Should at least parse the valid project
        const validProject = result.find(p => p.name === 'Valid');
        assert.ok(validProject, 'Should parse valid project');
        assert.strictEqual(validProject.targetFramework, 'net6.0');
    });

    test('should handle projects with Import statements', async () => {
        const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <Import Project="../Common.props" />
  
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <Import Project="../Dependencies.targets" />

  <ItemGroup>
    <ProjectReference Include="../Shared/Shared.csproj" />
  </ItemGroup>

  <Import Project="$(MSBuildThisFileDirectory)Local.targets" Condition="Exists('$(MSBuildThisFileDirectory)Local.targets')" />
</Project>`;

        const csprojPath = createCsprojFile('WithImports.csproj', csprojContent);
        const result = await parseCsprojFiles([csprojPath]);

        assert.strictEqual(result.length, 1);
        
        const project = result[0];
        assert.strictEqual(project.name, 'WithImports');
        assert.strictEqual(project.targetFramework, 'net6.0');
        assert.ok(project.dependencies.includes('Shared'));
    });
});