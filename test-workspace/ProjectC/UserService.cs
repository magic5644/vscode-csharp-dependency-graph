using ProjectD;

namespace ProjectC
{
    public class UserService
    {
        private readonly DataService _dataService;
        private readonly Logger _logger;

        public UserService()
        {
            _dataService = new DataService();
            _logger = new Logger(nameof(UserService));
        }

        public async Task<UserProfile> GetUserProfileAsync(string userId)
        {
            _logger.Log($"Getting user profile for {userId}");
            string userData = await _dataService.FetchDataAsync(userId);
            
            var profile = new UserProfile
            {
                Id = userId,
                Name = $"User {userId}",
                Data = userData
            };
            
            return profile;
        }
    }

    public class UserProfile
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Data { get; set; } = string.Empty;
    }
}
