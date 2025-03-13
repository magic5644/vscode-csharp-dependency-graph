using System;
using System.Runtime.InteropServices;
using System.Reflection;

// Copyright (c) 2023 Your Company. All rights reserved.
// Licensed under the MIT License.


namespace ProjectB
{
    public class Logger
    {
        private readonly string _logPrefix;

        public Logger(string component)
        {
            _logPrefix = $"[{component}]";
        }

        public void Log(string message)
        {
            Console.WriteLine($"{_logPrefix} {DateTime.Now}: {message}");
        }

        public void LogError(string error)
        {
            Console.Error.WriteLine($"{_logPrefix} ERROR {DateTime.Now}: {error}");
        }
    }
}
