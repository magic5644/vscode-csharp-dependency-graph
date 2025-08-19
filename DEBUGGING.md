# Debugging Guide

## Common Issues and Solutions

### "Command already exists" Error During Extension Development

**Issue**: When debugging the extension, you might encounter the error:
```
Activating extension 'magic5644.vscode-csharp-dependency-graph' failed: command 'vscode-csharp-dependency-graph.generate-dependency-graph' already exists.
```

**Cause**: This happens when VS Code tries to register commands that are already registered, typically during hot reloading or when a previous extension instance wasn't properly disposed.

**Solution**: The extension now includes robust error handling for command registration:

1. **Automatic Command Detection**: The extension checks if commands already exist before registering them
2. **Safe Registration**: Uses a `safeRegisterCommand` helper that gracefully handles duplicate registrations
3. **Proper Cleanup**: The `deactivate()` function ensures all resources are properly disposed

**Implementation Details**:
- Commands are registered using `safeRegisterCommand()` which checks for existing commands
- If a command already exists, it logs a warning and continues without throwing an error
- All disposables are properly tracked in `context.subscriptions`
- The deactivate function resets singleton instances and clears global variables

### How to Test the Fix

1. Start debugging the extension (F5)
2. If the extension is already running, reload the window (Ctrl+R)
3. The extension should activate successfully without command registration errors
4. Check the Developer Console (Help > Toggle Developer Tools) for any warning messages about skipped command registrations

### Development Best Practices

1. **Always use safeRegisterCommand**: For any new commands, use the `safeRegisterCommand` helper
2. **Proper Disposal**: Ensure all disposables are added to `context.subscriptions`
3. **Reset Singletons**: In the deactivate function, reset any singleton instances
4. **Error Logging**: Use console.log/console.error for debugging information

### Additional Debugging Tips

- Use `npm run watch` for continuous compilation during development
- Check the Output panel (View > Output) and select "Log (Extension Host)" for extension-specific logs
- Use the VS Code Developer Tools for detailed error information
- Test both cold starts and hot reloads to ensure proper cleanup
