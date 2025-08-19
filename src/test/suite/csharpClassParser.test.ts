import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseClassDependencies} from '../../csharpClassParser';

suite('C# Class Parser Test Suite', () => {
    let tempDir: string;
    let mockProjectFiles: Map<string, string[]>;

    setup(() => {
        // Create temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csharp-parser-test-'));
        mockProjectFiles = new Map();
    });

    teardown(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    /**
     * Helper function to create a mock C# file
     */
    function createMockCSharpFile(fileName: string, content: string): string {
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    /**
     * Helper function to setup project files map
     */
    function setupProjectFiles(projectName: string, files: { name: string, content: string }[]): void {
        const filePaths: string[] = [];
        for (const file of files) {
            const filePath = createMockCSharpFile(file.name, file.content);
            filePaths.push(filePath);
        }
        mockProjectFiles.set(projectName, filePaths);
    }

    test('should parse simple class with no dependencies', async () => {
        const content = `
using System;

namespace TestProject
{
    public class SimpleClass
    {
        public void DoSomething()
        {
            Console.WriteLine("Hello World");
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'SimpleClass.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].className, 'SimpleClass');
        assert.strictEqual(result[0].projectName, 'TestProject');
        assert.strictEqual(result[0].namespace, 'TestProject');
        assert.strictEqual(result[0].dependencies.length, 0);
    });

    test('should parse class with inheritance dependencies', async () => {
        const baseClassContent = `
namespace TestProject.Base
{
    public class BaseClass
    {
        public virtual void BaseMethod() { }
    }
}`;

        const derivedClassContent = `
using TestProject.Base;

namespace TestProject
{
    public class DerivedClass : BaseClass
    {
        public override void BaseMethod() { }
    }
}`;

        setupProjectFiles('TestProject', [
            { name: 'BaseClass.cs', content: baseClassContent },
            { name: 'DerivedClass.cs', content: derivedClassContent }
        ]);

        const result = await parseClassDependencies(mockProjectFiles);

        const derivedClass = result.find(c => c.className === 'DerivedClass');
        assert.ok(derivedClass, 'DerivedClass should be found');
        assert.ok(derivedClass.dependencies.some(d => d.className === 'BaseClass'), 'Should have dependency on BaseClass');
    });

    test('should parse class with field and property dependencies', async () => {
        const content = `
using System;
using System.Collections.Generic;

namespace TestProject
{
    public class User
    {
        public string Name { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class UserService
    {
        private List<User> users;
        public ICollection<User> Users { get; set; }

        public void AddUser(User user)
        {
            users.Add(user);
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'UserService.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const userService = result.find(c => c.className === 'UserService');
        assert.ok(userService, 'UserService should be found');
        
        const userDependency = userService.dependencies.find(d => d.className === 'User');
        assert.ok(userDependency, 'Should have dependency on User class');
        assert.strictEqual(userDependency.namespace, 'TestProject');
        assert.strictEqual(userDependency.projectName, 'TestProject');
    });

    test('should parse class with method parameter and return type dependencies', async () => {
        const content = `
using System;

namespace TestProject
{
    public class Logger
    {
        public void Log(string message) { }
    }

    public class DataProcessor
    {
        public Logger ProcessData(string input, DateTime timestamp)
        {
            var logger = new Logger();
            logger.Log($"Processing data at {timestamp}");
            return logger;
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'DataProcessor.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const dataProcessor = result.find(c => c.className === 'DataProcessor');
        assert.ok(dataProcessor, 'DataProcessor should be found');
        
        const loggerDependency = dataProcessor.dependencies.find(d => d.className === 'Logger');
        assert.ok(loggerDependency, 'Should have dependency on Logger class');
    });

    test('should parse class with static method calls', async () => {
        const content = `
using System;

namespace TestProject
{
    public static class Helper
    {
        public static string FormatMessage(string message)
        {
            return $"[{DateTime.Now}] {message}";
        }
    }

    public class MessageService
    {
        public void SendMessage(string message)
        {
            var formatted = Helper.FormatMessage(message);
            Console.WriteLine(formatted);
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'MessageService.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const messageService = result.find(c => c.className === 'MessageService');
        assert.ok(messageService, 'MessageService should be found');
        
        const helperDependency = messageService.dependencies.find(d => d.className === 'Helper');
        assert.ok(helperDependency, 'Should have dependency on Helper class');
    });

    test('should handle generic types correctly', async () => {
        const content = `
using System;
using System.Collections.Generic;

namespace TestProject
{
    public class GenericRepository<T> where T : class
    {
        private List<T> items = new List<T>();
        
        public void Add(T item)
        {
            items.Add(item);
        }
        
        public IEnumerable<T> GetAll()
        {
            return items;
        }
    }

    public class User
    {
        public string Name { get; set; }
    }

    public class UserRepository : GenericRepository<User>
    {
        public User FindByName(string name)
        {
            return GetAll().FirstOrDefault(u => u.Name == name);
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'Repository.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const userRepository = result.find(c => c.className === 'UserRepository');
        assert.ok(userRepository, 'UserRepository should be found');
        
        const genericRepoDependency = userRepository.dependencies.find(d => d.className === 'GenericRepository');
        assert.ok(genericRepoDependency, 'Should have dependency on GenericRepository');
        
        const userDependency = userRepository.dependencies.find(d => d.className === 'User');
        assert.ok(userDependency, 'Should have dependency on User');
    });

    test('should handle cross-project dependencies', async () => {
        const coreContent = `
namespace Core.Models
{
    public class User
    {
        public string Email { get; set; }
    }
}`;

        const serviceContent = `
using Core.Models;

namespace Services
{
    public class UserService
    {
        public User GetUser(string email)
        {
            return new User { Email = email };
        }
    }
}`;

        setupProjectFiles('Core', [{ name: 'User.cs', content: coreContent }]);
        setupProjectFiles('Services', [{ name: 'UserService.cs', content: serviceContent }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const userService = result.find(c => c.className === 'UserService' && c.projectName === 'Services');
        assert.ok(userService, 'UserService should be found');
        
        const userDependency = userService.dependencies.find(d => d.className === 'User');
        assert.ok(userDependency, 'Should have dependency on User');
        assert.strictEqual(userDependency.namespace, 'Core.Models');
        assert.strictEqual(userDependency.projectName, 'Core');
    });

    test('should handle complex inheritance with interfaces', async () => {
        const content = `
using System;

namespace TestProject
{
    public interface IRepository<T>
    {
        void Add(T item);
        T GetById(int id);
    }

    public interface IUserRepository : IRepository<User>
    {
        User GetByEmail(string email);
    }

    public class User
    {
        public int Id { get; set; }
        public string Email { get; set; }
    }

    public class UserRepository : IUserRepository
    {
        public void Add(User item) { }
        public User GetById(int id) => null;
        public User GetByEmail(string email) => null;
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'UserRepository.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const userRepository = result.find(c => c.className === 'UserRepository');
        assert.ok(userRepository, 'UserRepository should be found');
        
        const userRepoDependency = userRepository.dependencies.find(d => d.className === 'IUserRepository');
        assert.ok(userRepoDependency, 'Should have dependency on IUserRepository');
        
        const userDependency = userRepository.dependencies.find(d => d.className === 'User');
        assert.ok(userDependency, 'Should have dependency on User');
    });

    test('should handle nested classes correctly', async () => {
        const content = `
namespace TestProject
{
    public class OuterClass
    {
        public class NestedClass
        {
            public void DoSomething() { }
        }

        private NestedClass nested = new NestedClass();

        public void UseNested()
        {
            nested.DoSomething();
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'OuterClass.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        assert.ok(result.length >= 1, 'Should find at least OuterClass');
        
        const outerClass = result.find(c => c.className === 'OuterClass');
        assert.ok(outerClass, 'OuterClass should be found');
    });

    test('should handle malformed C# files gracefully', async () => {
        const malformedContent = `
using System;

namespace TestProject
{
    public class IncompleteClass
        // Missing opening brace
        public void Method() {
        }
    // Missing closing brace
`;

        setupProjectFiles('TestProject', [{ name: 'Malformed.cs', content: malformedContent }]);

        // Should not throw an exception
        const result = await parseClassDependencies(mockProjectFiles);
        
        // May or may not find the class, but should not crash
        assert.ok(Array.isArray(result), 'Should return an array');
    });

    test('should exclude primitive types from dependencies', async () => {
        const content = `
using System;

namespace TestProject
{
    public class PrimitiveUser
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public decimal Balance { get; set; }

        public void UpdateBalance(decimal amount)
        {
            Balance += amount;
        }

        public string GetDisplayName()
        {
            return $"{Name} ({Id})";
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'PrimitiveUser.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const primitiveUser = result.find(c => c.className === 'PrimitiveUser');
        assert.ok(primitiveUser, 'PrimitiveUser should be found');
        
        // Should not have dependencies on primitive types
        const primitiveTypes = ['int', 'string', 'bool', 'DateTime', 'decimal'];
        for (const primitiveType of primitiveTypes) {
            const hasPrimitiveDep = primitiveUser.dependencies.some(d => d.className === primitiveType);
            assert.strictEqual(hasPrimitiveDep, false, `Should not have dependency on primitive type: ${primitiveType}`);
        }
    });

    test('should handle empty namespace correctly', async () => {
        const content = `
public class GlobalClass
{
    public void DoSomething() { }
}`;

        setupProjectFiles('TestProject', [{ name: 'GlobalClass.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        const globalClass = result.find(c => c.className === 'GlobalClass');
        assert.ok(globalClass, 'GlobalClass should be found');
        assert.strictEqual(globalClass.namespace, '', 'Namespace should be empty');
    });

    test('should handle multiple classes in single file', async () => {
        const content = `
using System;

namespace TestProject
{
    public class FirstClass
    {
        public SecondClass Second { get; set; }
    }

    public class SecondClass
    {
        public FirstClass First { get; set; }
    }

    public class ThirdClass
    {
        public void UseOthers()
        {
            var first = new FirstClass();
            var second = new SecondClass();
        }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'MultipleClasses.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles);

        assert.strictEqual(result.length, 3, 'Should find all three classes');
        
        const firstClass = result.find(c => c.className === 'FirstClass');
        const secondClass = result.find(c => c.className === 'SecondClass');
        const thirdClass = result.find(c => c.className === 'ThirdClass');
        
        assert.ok(firstClass, 'FirstClass should be found');
        assert.ok(secondClass, 'SecondClass should be found');
        assert.ok(thirdClass, 'ThirdClass should be found');
        
        // Check circular dependencies
        assert.ok(firstClass.dependencies.some(d => d.className === 'SecondClass'), 'FirstClass should depend on SecondClass');
        assert.ok(secondClass.dependencies.some(d => d.className === 'FirstClass'), 'SecondClass should depend on FirstClass');
        
        // Check ThirdClass dependencies
        assert.ok(thirdClass.dependencies.some(d => d.className === 'FirstClass'), 'ThirdClass should depend on FirstClass');
        assert.ok(thirdClass.dependencies.some(d => d.className === 'SecondClass'), 'ThirdClass should depend on SecondClass');
    });

    test('should handle when includeClassDependencies is false', async () => {
        const content = `
namespace TestProject
{
    public class SimpleClass
    {
        public void DoSomething() { }
    }
}`;

        setupProjectFiles('TestProject', [{ name: 'SimpleClass.cs', content }]);

        const result = await parseClassDependencies(mockProjectFiles, false);

        assert.strictEqual(result.length, 0, 'Should return empty array when includeClassDependencies is false');
    });

    test('should handle performance with large number of classes', async () => {
        const classCount = 50;
        const files: { name: string, content: string }[] = [];

        // Generate many classes with dependencies
        for (let i = 0; i < classCount; i++) {
            const dependencies = i > 0 ? `public Class${i - 1} Previous { get; set; }` : '';
            const content = `
namespace TestProject
{
    public class Class${i}
    {
        ${dependencies}
        
        public void Method${i}()
        {
            // Some logic here
        }
    }
}`;
            files.push({ name: `Class${i}.cs`, content });
        }

        setupProjectFiles('TestProject', files);

        const startTime = Date.now();
        const result = await parseClassDependencies(mockProjectFiles);
        const endTime = Date.now();

        assert.strictEqual(result.length, classCount, `Should find all ${classCount} classes`);
        
        // Performance check - should complete within reasonable time (adjust as needed)
        const executionTime = endTime - startTime;
        assert.ok(executionTime < 5000, `Parsing should complete within 5 seconds, took ${executionTime}ms`);
    });
});