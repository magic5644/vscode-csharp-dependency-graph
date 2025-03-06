using ProjectB;

namespace ProjectA
{
    public class AppController
    {
        private readonly UserService _userService;
        private readonly Logger _logger;

        public AppController()
        {
            _userService = new UserService();
            _logger = new Logger(nameof(AppController));
        }

        public async Task<bool> ProcessUserRequestAsync(string userId, string action)
        {
            _logger.Log($"Processing {action} request for user {userId}");
            
            try
            {
                UserProfile profile = await _userService.GetUserProfileAsync(userId);
                _logger.Log($"Successfully retrieved profile for {profile.Name}");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to process request: {ex.Message}");
                return false;
            }
        }
    }
}
