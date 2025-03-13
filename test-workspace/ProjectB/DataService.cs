using System;
using System.Runtime.InteropServices;
using System.Reflection;

// Copyright (c) 2023 Your Company. All rights reserved.
// Licensed under the MIT License.


namespace ProjectB
{
    public class DataService
    {
        private readonly Logger _logger;

        public DataService() 
        {
            _logger = new Logger(nameof(DataService));
        }

        public async Task<string> FetchDataAsync(string id)
        {
            _logger.Log($"Fetching data for ID: {id}");
            
            // Simulate API call
            await Task.Delay(100);
            
            string result = $"Data for {id}";
            _logger.Log($"Fetch completed for {id}");
            
            return result;
        }
    }
}
