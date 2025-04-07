import axios from 'axios';
import socketManager from './socketmanager';

// Determine API base URL from environment or default
const baseURL = "https://myapp-nt8s.onrender.com";

// Enhanced logging function
const logApiCall = (method, url, data = null, error = null) => {
  if (error) {
    console.log(`🔴 API ERROR [${method}] ${url}:`, error);
  } else if (data) {
    console.log(`🟢 API SUCCESS [${method}] ${url}:`, data);
  } else {
    console.log(`🟡 API CALL [${method}] ${url}`);
  }
};

// Create axios instance with default config
const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and disconnect socket on authentication failure
      localStorage.removeItem('token');
      socketManager.disconnect();
      window.location.href = '/login?expired=true';
    }
    return Promise.reject(error);
  }
);

// Authentication endpoints
const authService = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    
    // Establish Socket.IO connection after login
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      socketManager.connect(response.data.token);
    }
    
    return response.data;
  },

  signup: async (userData) => {
    const response = await api.post('/auth/signup', userData);
    
    // Establish Socket.IO connection after signup
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      socketManager.connect(response.data.token);
    }
    
    return response.data;
  },

  getUserInfo: async () => {
    const response = await api.get('/api/me');
    return response.data;
  },

  sendPhoneVerification: async (phoneNumber) => {
    const response = await api.post('/auth/phone/send-code', { phoneNumber });
    return response.data;
  },

  verifyPhone: async (phoneNumber, code, deviceToken = null) => {
    const response = await api.post('/auth/phone/verify', {
      phoneNumber,
      code,
      deviceToken
    });
    
    // Establish Socket.IO connection after phone verification
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      socketManager.connect(response.data.token);
    }
    
    return response.data;
  },

  logout: async () => {
    try {
      // Disconnect socket before logout
      socketManager.disconnect();
      
      const response = await api.post('/api/auth/logout');
      localStorage.removeItem('token');
      return response.data;
    } catch (error) {
      // Ensure socket is disconnected even if logout fails
      socketManager.disconnect();
      localStorage.removeItem('token');
      throw error;
    }
  },
  
  // Check auth provider for a given email or phone
  checkAuthProvider: async (identifier) => {
    const payload = identifier.includes('@') 
      ? { email: identifier } 
      : { phoneNumber: identifier };
    
    const response = await api.post('/auth/check-provider', payload);
    return response.data;
  },
  
  // Two-factor authentication setup
  setup2FA: async (method) => {
    const response = await api.post('/api/auth/2fa/setup', { method });
    return response.data;
  },

  // OAuth Login with Google
  googleLogin: () => {
    window.location.href = `${baseURL}/auth/google`;
  },

  // OAuth Login with LinkedIn
  linkedinLogin: () => {
    window.location.href = `${baseURL}/auth/linkedin`;
  }
};

// Profile endpoints
const profileService = {
  updateProfile: async (profileData) => {
    const response = await api.put('/api/profile', profileData);
    return response.data;
  },

  getUserInfo: async () => {
    logApiCall('GET', '/api/me');
    try {
      const response = await api.get('/api/me');
      logApiCall('GET', '/api/me', response.data);
      return response.data;
    } catch (error) {
      logApiCall('GET', '/api/me', null, error);
      throw error;
    }
  },

  getProfile: async (userId) => {
    try {
      // Special case for "view" - redirect to analytics endpoint
      if (userId === 'view') {
        return api.get('/api/profile-views/analytics');
      }
      
      // Basic validation for userId
      if (!userId || userId === 'undefined') {
        console.error('Invalid userId in getProfile:', userId);
        throw new Error('Valid user ID is required');
      }
      
      // Log the userId being requested
      console.log(`Getting profile for user: ${userId}`);
      
      // Make the API request to fetch the profile
      const response = await api.get(`/api/users/${userId}/profile`);
      
      // Log successful response
      console.log(`Successfully fetched profile for user: ${userId}`);
      
      return response.data;
    } catch (error) {
      // Enhanced error logging
      console.error(`Error fetching profile for user ${userId}:`, error);
      
      if (error.response) {
        console.error('Error response status:', error.response.status);
        console.error('Error response data:', error.response.data);
      }
      
      // Re-throw the error to be handled by the component
      throw error;
    }
  },
  
  updateLocation: async (latitude, longitude) => {
    const response = await api.put('/api/location', { latitude, longitude });
    // Emit location update via Socket.IO
    socketManager.emit('update_location', { latitude, longitude });
    return response.data;
  },
  
  // Update privacy settings
  updatePrivacySettings: async (privacySettings) => {
    const response = await api.put('/api/privacy-settings', { privacy: privacySettings });
    return response.data;
  },
  
  // Block a user
  blockUser: async (userId) => {
    const response = await api.post(`/api/users/${userId}/block`);
    return response.data;
  },

  // Get app settings
  getSettings: async () => {
    const response = await api.get('/api/settings');
    return response.data;
  },

  // Update app settings
  updateSettings: async (settings) => {
    const response = await api.put('/api/settings', settings);
    return response.data;
  },

  // Get profile view analytics
  getProfileViewAnalytics: async (period = 'month') => {
    const response = await api.get(`/api/profile-views/analytics?period=${period}`);
    return response.data;
  },

  // Get profile viewers
  getProfileViewers: async (options = {}) => {
    const { limit = 10, page = 1, period = 'month' } = options;
    const url = `/api/profile-views/viewers?limit=${limit}&page=${page}&period=${period}`;
    const response = await api.get(url);
    return response.data;
  },

  // Update profile view privacy
  updateProfileViewPrivacy: async (visibility) => {
    const response = await api.put('/api/settings/profile-view-privacy', { visibility });
    return response.data;
  },

  // Get profile view activity
  getProfileViewActivity: async (options = {}) => {
    const { limit = 10, page = 1 } = options;
    const url = `/api/profile-views/activity?limit=${limit}&page=${page}`;
    const response = await api.get(url);
    return response.data;
  },

  // Endorse a user's skill
  endorseSkill: async (userId, skillName) => {
    const response = await api.post(`/api/users/${userId}/endorse`, { skillName });
    return response.data;
  },

  // Write a recommendation for a user
  writeRecommendation: async (userId, recommendationData) => {
    const response = await api.post(`/api/users/${userId}/recommend`, recommendationData);
    return response.data;
  },

  // Manage pending recommendations
  manageRecommendation: async (recommendationId, action) => {
    const response = await api.put(`/api/recommendations/${recommendationId}`, action);
    return response.data;
  }
};

// Post endpoints
const postService = {
  createPost: async (formData) => {
    const response = await api.post('/api/posts', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  
  getPosts: async (options = {}) => {
    const { limit = 10, before, after } = options;
    let url = '/api/posts';
    
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (before) params.append('before', before);
    if (after) params.append('after', after);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    try {
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching posts:', error);
      return { posts: [] };
    }
  },
  
  likePost: async (postId, reaction = 'like') => {
    const response = await api.post(`/api/posts/${postId}/react`, { reaction });
    return response.data;
  },
  
  commentOnPost: async (postId, content) => {
    const response = await api.post(`/api/posts/${postId}/comments`, { content });
    return response.data;
  },
  
  getPostComments: async (postId, limit = 10) => {
    const response = await api.get(`/api/posts/${postId}/comments?limit=${limit}`);
    return response.data;
  },
  
  sharePost: async (postId, content = '') => {
    const response = await api.post(`/api/posts/${postId}/share`, { content });
    return response.data;
  },
  
  deletePost: async (postId) => {
    const response = await api.delete(`/api/posts/${postId}`);
    return response.data;
  }
};

// Story endpoints
const storyService = {
  createStory: async (formData) => {
    const response = await api.post('/api/stories', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  
  getStories: async () => {
    const response = await api.get('/api/stories');
    return response.data;
  },
  
  viewStory: async (storyId) => {
    const response = await api.post(`/api/stories/${storyId}/view`);
    return response.data;
  },
  
  reactToStory: async (storyId, reaction) => {
    const response = await api.post(`/api/stories/${storyId}/react`, { reaction });
    return response.data;
  },
  
  replyToStory: async (storyId, message) => {
    const response = await api.post(`/api/stories/${storyId}/reply`, { message });
    return response.data;
  },
  
  // Get story highlights
  getHighlights: async (userId) => {
    const response = await api.get(`/api/highlights/${userId}`);
    return response.data;
  },
  
  // Create a highlight from stories
  createHighlight: async (title, stories) => {
    const response = await api.post('/api/highlights', { title, stories });
    return response.data;
  }
};

// Chat endpoints
const chatService = {
  getChats: async () => {
    const response = await api.get('/api/chats');
    return response.data;
  },

  createChat: async (participantId, type = 'direct', name = '', description = '') => {
    const response = await api.post('/api/chats', {
      participantId,
      type,
      name,
      description
    });
    return response.data;
  },

  getMessages: async (chatId, options = {}) => {
    const { limit, before, after, lastMessageId } = options;
    let url = `/api/chats/${chatId}/messages`;
    
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (before) params.append('before', before);
    if (after) params.append('after', after);
    if (lastMessageId) params.append('lastMessageId', lastMessageId);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await api.get(url);
    return response.data;
  },

  sendMessage: async (chatId, messageData) => {
    const response = await api.post(`/api/chats/${chatId}/messages`, messageData);
    
    // Enhance with Socket.IO for real-time delivery
    socketManager.emit('new_message', {
      ...response.data,
      chatId
    });
    
    return response.data;
  },

  sendMessageWithAttachment: async (chatId, formData, config = {}) => {
    // Make sure we're using the right content type for files
    const customConfig = {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      ...config
    };
    
    try {
      const response = await api.post(`/api/chats/${chatId}/messages`, formData, customConfig);
      
      // Notify about new message with attachment via socket
      socketManager.emit('new_message', {
        ...response.data,
        chatId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error sending message with attachment:', error);
      throw error;
    }
  },
  
  // Reply to a message
  replyToMessage: async (chatId, messageId, content, messageType = 'text', attachment = null) => {
    try {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('messageType', messageType);
      formData.append('replyTo', messageId);
      
      if (attachment) {
        formData.append('media', attachment);
      }
      
      const response = await api.post(`/api/chats/${chatId}/messages`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      socketManager.emit('new_message', {
        ...response.data,
        chatId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error replying to message:', error);
      throw error;
    }
  },
  
  // Delete a message
  deleteMessage: async (chatId, messageId) => {
    try {
      const response = await api.delete(`/api/chats/${chatId}/messages/${messageId}`);
      
      // Notify deletion via socket
      socketManager.emit('message_deleted', {
        chatId,
        messageId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  },
  
  // React to a message
  reactToMessage: async (chatId, messageId, reaction) => {
    try {
      const response = await api.post(`/api/chats/${chatId}/messages/${messageId}/react`, { reaction });
      
      // Notify reaction via socket
      socketManager.emit('message_reaction', {
        chatId,
        messageId,
        reaction,
        userId: response.data.userId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error reacting to message:', error);
      throw error;
    }
  },
  
  // Remove reaction from a message
  removeReaction: async (chatId, messageId) => {
    try {
      const response = await api.delete(`/api/chats/${chatId}/messages/${messageId}/react`);
      
      // Notify reaction removal via socket
      socketManager.emit('reaction_removed', {
        chatId,
        messageId,
        userId: response.data.userId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  },
  
  // Start an audio call
  startAudioCall: async (chatId) => {
    try {
      const response = await api.post(`/api/calls/${chatId}/audio`);
      
      // Notify call via socket - include full initiator and participant objects
      const callData = {
        chatId,
        callId: response.data.callId,
        type: 'audio',
        initiator: response.data.initiator
      };
      
      socketManager.emit('call_started', callData);
      
      return response.data;
    } catch (error) {
      console.error('Error starting audio call:', error);
      throw error;
    }
  },

  // Start a video call
  startVideoCall: async (chatId) => {
    try {
      const response = await api.post(`/api/calls/${chatId}/video`);
      
      // Notify call via socket - include full initiator and participant objects
      const callData = {
        chatId,
        callId: response.data.callId,
        type: 'video',
        initiator: response.data.initiator
      };
      
      socketManager.emit('call_started', callData);
      
      return response.data;
    } catch (error) {
      console.error('Error starting video call:', error);
      throw error;
    }
  },
  
  // Accept a call
  acceptCall: async (callId) => {
    try {
      const response = await api.post(`/api/calls/${callId}/accept`);
      
      // Notify call acceptance via socket
      socketManager.emit('call_accepted', {
        callId,
        acceptedBy: response.data.acceptedBy
      });
      
      return response.data;
    } catch (error) {
      console.error('Error accepting call:', error);
      throw error;
    }
  },
  
  // Decline a call
  declineCall: async (callId) => {
    try {
      const response = await api.post(`/api/calls/${callId}/decline`);
      
      // Notify call decline via socket
      socketManager.emit('call_declined', {
        callId,
        declinedBy: response.data.declinedBy
      });
      
      return response.data;
    } catch (error) {
      console.error('Error declining call:', error);
      throw error;
    }
  },
  
  // End a call
  endCall: async (callId) => {
    try {
      const response = await api.post(`/api/calls/${callId}/end`);
      
      // Notify call end via socket
      socketManager.emit('call_ended', {
        callId,
        endedBy: response.data.endedBy
      });
      
      return response.data;
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  },
  
  // Create a poll in a chat
  createPoll: async (chatId, pollData) => {
    try {
      const response = await api.post(`/api/chats/${chatId}/polls`, pollData);
      return response.data;
    } catch (error) {
      console.error('Error creating poll:', error);
      throw error;
    }
  }
};

// Network endpoints
const networkService = {
  
  acceptConnection: async (userId) => {
    const response = await api.post('/api/connections/accept', { senderUserId: userId });
    return response.data;
  },
  
  // Add these methods to your api.js service file

  // Send connection request
  endConnectionRequest: async (targetUserId) => {
    try {
      const response = await api.post('/api/connections/request', { targetUserId });
      return response.data;
    } catch (error) {
      console.error('API Error - sendConnectionRequest:', error);
      throw error;
    }
  },

  // Add this line right here for backward compatibility
  sendConnectionRequest: async (targetUserId) => {
    return networkService.endConnectionRequest(targetUserId);
  },

  // Follow or unfollow a user - properly use the api instance
  followUser: async (userId) => {
    try {
      const response = await api.post(`/api/users/${userId}/follow`);
      return response.data;
    } catch (error) {
      console.error('API Error - followUser:', error);
      throw error;
    }
  },

// Get pending connection requests sent by the user
getPendingConnections: async () => {
  try {
    const response = await api.get('/api/connections/pending/sent');
    return response.data;
  } catch (error) {
    console.error('API Error - getPendingConnections:', error);
    throw error;
  }
},
  declineConnection: async (userId) => {
    const response = await api.post('/api/connections/decline', { senderUserId: userId });
    return response.data;
  },

  getConnections: async (type = 'all') => {
    const response = await api.get(`/api/network/connections?type=${type}`);
    return response.data;
  },

  getConnectionRequests: async () => {
    const response = await api.get('/api/network/connection-requests');
    return response.data;
  },

  followUser: async (userId) => {
    const response = await api.post(`/api/users/${userId}/follow`);
    return response.data;
  },
  
  // Get nearby professionals with simplified implementation
  getNearbyProfessionals : async (distance = 10, latitude = null, longitude = null) => {
  try {
    // Build the request parameters
    const params = { distance };
    
    // Add coordinates if provided
    if (latitude !== null && longitude !== null) {
      params.latitude = latitude;
      params.longitude = longitude;
    }
    
    // Make the API call using the axios instance
    // Make sure 'api' is properly imported or accessible here
    const response = await api.get('/api/network/nearby', { params });
    
    // Process the response to ensure consistent format
    const professionals = Array.isArray(response.data) ? response.data : 
                        (response.data.professionals || []);
    
    // Map any necessary data transformations or enrichments
    // Ensure distance is always a number before calling toFixed
    return professionals.map(prof => {
      // Create a new distance property that's guaranteed to be a number
      let distanceNum = null;
      
      if (typeof prof.distance === 'number') {
        distanceNum = prof.distance;
      } else if (typeof prof.distance === 'string') {
        // Try to parse the string to a number
        const parsed = parseFloat(prof.distance);
        if (!isNaN(parsed)) {
          distanceNum = parsed;
        }
      }
      
      return {
        ...prof,
        // Ensure these properties exist
        firstName: prof.firstName || '',
        lastName: prof.lastName || '',
        connectionStatus: prof.connectionStatus || 'none',
        // Format distance safely
        distanceFormatted: distanceNum !== null ? `${distanceNum.toFixed(1)} km` : 'nearby',
        // Keep the original distance for sorting
        distance: distanceNum
      };
    });
  } catch (error) {
    console.error('Error fetching nearby professionals:', error);
    
    // Return empty array instead of throwing to prevent UI errors
    return [];
  }
},
  // IP-based geolocation as a fallback when other methods fail
  getIPLocation: async () => {
    try {
      // First try server-side IP detection
      const response = await api.get('/api/location/ip');
      
      // If the server has an endpoint for IP location
      if (response.data && response.data.latitude && response.data.longitude) {
        return response.data;
      }
      
      // If server doesn't provide location or endpoint doesn't exist,
      // fall back to a free IP geolocation service
      const ipInfoResponse = await axios.get('https://ipapi.co/json/');
      
      if (ipInfoResponse.data && ipInfoResponse.data.latitude && ipInfoResponse.data.longitude) {
        const location = {
          latitude: ipInfoResponse.data.latitude,
          longitude: ipInfoResponse.data.longitude,
          city: ipInfoResponse.data.city,
          region: ipInfoResponse.data.region,
          country: ipInfoResponse.data.country_name
        };
        
        return location;
      }
      
      throw new Error('Could not determine location from IP');
    } catch (error) {
      console.error('Error in IP-based geolocation:', error);
      throw error;
    }
  },
  
  getProfessionalSuggestions: async (options = {}) => {
    try {
      const { industry, skills, limit } = options;
      
      let url = '/api/network/suggestions';
      const params = new URLSearchParams();
      
      if (industry) params.append('industry', industry);
      if (skills) params.append('skills', skills);
      if (limit) params.append('limit', limit);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      
      // Filter out self and already connected users from the response
      const currentUser = localStorage.getItem('userId');
      const filteredUsers = response.data.filter(user => {
        // Filter out self
        if (user._id === currentUser) return false;
        
        // Filter out connected users
        if (user.isConnected) return false;
        
        return true;
      });
      
      return filteredUsers;
    } catch (error) {
      console.error('Error fetching professional suggestions:', error);
      return [];
    }
  },

  // Location-based networking
  getMapUsers: async (options = {}) => {
    const { 
      latitude, longitude, radius, 
      industries, skills, 
      availableForMeeting, availableForHiring, lookingForWork,
      page, limit
    } = options;
    
    let url = '/api/network/map';
    const params = new URLSearchParams();
    
    if (latitude) params.append('latitude', latitude);
    if (longitude) params.append('longitude', longitude);
    if (radius) params.append('radius', radius);
    if (industries) params.append('industries', industries);
    if (skills) params.append('skills', skills);
    if (availableForMeeting) params.append('availableForMeeting', availableForMeeting);
    if (availableForHiring) params.append('availableForHiring', availableForHiring);
    if (lookingForWork) params.append('lookingForWork', lookingForWork);
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await api.get(url);
    return response.data;
  },

  updateLocationStatus: async (data) => {
    const response = await api.put('/api/network/location-status', data);
    return response.data;
  },

  // Request an in-person meeting
  requestMeeting: async (targetUserId, meetingData) => {
    const response = await api.post('/api/network/meeting-request', {
      targetUserId,
      ...meetingData
    });
    return response.data;
  },

  // Respond to a meeting request
  respondToMeeting: async (meetingId, status, alternativeData = {}) => {
    const response = await api.put(`/api/network/meeting-request/${meetingId}`, {
      status,
      ...alternativeData
    });
    return response.data;
  },
// Add this function to your api.js service file

// Get pending connection requests sent by the user

  // Get user's meetings
  getMeetings: async (options = {}) => {
    const { status, type, page, limit } = options;
    let url = '/api/network/meetings';
    const params = new URLSearchParams();
    
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await api.get(url);
    return response.data;
  }
};

// Profile View endpoints (LinkedIn style)
const profileViewService = {
  // Record a profile view with validation
  recordProfileView: async (profileId) => {
    // Add validation for profileId
    if (!profileId || profileId === 'view' || !/^[0-9a-fA-F]{24}$/.test(profileId)) {
      console.warn('Skipping profile view recording for invalid ID:', profileId);
      return { success: false, skipped: true };
    }
    
    try {
      const response = await api.post('/api/profile-views', { profileId });
      return response.data;
    } catch (error) {
      console.error('Error recording profile view:', error);
      throw error;
    }
  },
  
  // Get users who viewed your profile
  getProfileViewers: async (options = {}) => {
    const { limit = 10, page = 1, period = 'month' } = options;
    
    let url = '/api/profile-views/viewers';
    const params = new URLSearchParams();
    
    params.append('limit', limit);
    params.append('page', page);
    params.append('period', period);
    
    const response = await api.get(`${url}?${params.toString()}`);
    return response.data;
  },
  
  // Get analytics about your profile views
  getProfileViewAnalytics: async (period = 'month') => {
    const response = await api.get(`/api/profile-views/analytics?period=${period}`);
    return response.data;
  },
  
  // Update your profile view privacy settings
  updateProfileViewPrivacy: async (visibility) => {
    const response = await api.put('/api/settings/profile-view-privacy', { visibility });
    return response.data;
  },
  
  // Get your profile view activity (who you viewed)
  getProfileViewActivity: async (options = {}) => {
    const { limit = 10, page = 1 } = options;
    
    let url = '/api/profile-views/activity';
    const params = new URLSearchParams();
    
    params.append('limit', limit);
    params.append('page', page);
    
    const response = await api.get(`${url}?${params.toString()}`);
    return response.data;
  }
};

// Event endpoints
const eventService = {
  // Create an event
  createEvent: async (eventData) => {
    try {
      let dataToSend = eventData;
      
      // Convert to FormData if needed for file uploads
      if (!(eventData instanceof FormData) && eventData.coverImage instanceof File) {
        const formData = new FormData();
        
        // Add all fields except coverImage
        for (const [key, value] of Object.entries(eventData)) {
          if (key !== 'coverImage') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add coverImage
        formData.append('coverImage', eventData.coverImage);
        dataToSend = formData;
      }
      
      const response = await api.post('/api/events', dataToSend, {
        headers: {
          'Content-Type': eventData instanceof FormData || 
                        (eventData.coverImage instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  },
  
  // Create a recurring event
  createRecurringEvent: async (eventData) => {
    try {
      let dataToSend = eventData;
      
      // Convert to FormData if needed for file uploads
      if (!(eventData instanceof FormData) && eventData.coverImage instanceof File) {
        const formData = new FormData();
        
        // Add all fields except coverImage
        for (const [key, value] of Object.entries(eventData)) {
          if (key !== 'coverImage') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add coverImage
        formData.append('coverImage', eventData.coverImage);
        dataToSend = formData;
      }
      
      const response = await api.post('/api/events/recurrent', dataToSend, {
        headers: {
          'Content-Type': eventData instanceof FormData || 
                        (eventData.coverImage instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating recurring event:', error);
      throw error;
    }
  },
  
  // Get events with filters
  getEvents: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      for (const [key, value] of Object.entries(filters)) {
        params.append(key, value);
      }
      
      const response = await api.get(`/api/events?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  },

  // Respond to an event (going, interested, not going)
  respondToEvent: async (eventId, status, message = '') => {
    try {
      const response = await api.post(`/api/events/${eventId}/respond`, { 
        status,
        message
      });
      return response.data;
    } catch (error) {
      console.error('Error responding to event:', error);
      throw error;
    }
  },

  // Get event attendees
  getEventAttendees: async (eventId, options = {}) => {
    try {
      const { status, page = 1, limit = 20, search } = options;
      
      let url = `/api/events/${eventId}/attendees`;
      const params = new URLSearchParams();
      
      if (status) params.append('status', status);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      if (search) params.append('search', search);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching event attendees:', error);
      throw error;
    }
  },

  // Invite connections to an event
  inviteToEvent: async (eventId, userIds, message = '') => {
    try {
      const response = await api.post(`/api/events/${eventId}/invite`, {
        userIds,
        message
      });
      return response.data;
    } catch (error) {
      console.error('Error inviting to event:', error);
      throw error;
    }
  },

  // Check in to an event
  checkInToEvent: async (eventId, data = {}) => {
    try {
      const response = await api.post(`/api/events/${eventId}/checkin`, data);
      return response.data;
    } catch (error) {
      console.error('Error checking in to event:', error);
      throw error;
    }
  },

  // Get event analytics (for organizers)
  getEventAnalytics: async (eventId) => {
    try {
      const response = await api.get(`/api/events/${eventId}/analytics`);
      return response.data;
    } catch (error) {
      console.error('Error fetching event analytics:', error);
      throw error;
    }
  },

  // Get nearby events
  getNearbyEvents: async (options = {}) => {
    try {
      const { 
        latitude, longitude, radius, 
        startDate, endDate, categories,
        page, limit
      } = options;
      
      let url = '/api/map/events';
      const params = new URLSearchParams();
      
      if (latitude) params.append('latitude', latitude);
      if (longitude) params.append('longitude', longitude);
      if (radius) params.append('radius', radius);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (categories) params.append('categories', categories);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby events:', error);
      throw error;
    }
  }
};

// Job endpoints
const jobService = {
  // Create a job posting
  createJob: async (jobData) => {
    try {
      const response = await api.post('/api/jobs', jobData);
      return response.data;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  },
  
  // Get job listings with filters
  getJobs: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      for (const [key, value] of Object.entries(filters)) {
        params.append(key, value);
      }
      
      const response = await api.get(`/api/jobs?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
  },

  // Get nearby jobs
  getNearbyJobs: async (options = {}) => {
    try {
      const { 
        latitude, longitude, radius, 
        jobTypes, experienceLevels, industries, 
        remote, page, limit 
      } = options;
      
      let url = '/api/map/jobs';
      const params = new URLSearchParams();
      
      if (latitude) params.append('latitude', latitude);
      if (longitude) params.append('longitude', longitude);
      if (radius) params.append('radius', radius);
      if (jobTypes) params.append('jobTypes', jobTypes);
      if (experienceLevels) params.append('experienceLevels', experienceLevels);
      if (industries) params.append('industries', industries);
      if (remote) params.append('remote', remote);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby jobs:', error);
      throw error;
    }
  }
};

// Company endpoints
const companyService = {
  // Create a company profile
  createCompany: async (companyData) => {
    try {
      let dataToSend = companyData;
      
      // Convert to FormData if needed for file uploads
      if (!(companyData instanceof FormData) && (companyData.logo instanceof File || companyData.coverImage instanceof File)) {
        const formData = new FormData();
        
        // Add all fields except images
        for (const [key, value] of Object.entries(companyData)) {
          if (!['logo', 'coverImage'].includes(key)) {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add logo and cover image
        if (companyData.logo instanceof File) {
          formData.append('logo', companyData.logo);
        }
        
        if (companyData.coverImage instanceof File) {
          formData.append('coverImage', companyData.coverImage);
        }
        
        dataToSend = formData;
      }
      
      const response = await api.post('/api/companies', dataToSend, {
        headers: {
          'Content-Type': companyData instanceof FormData || 
                        (companyData.logo instanceof File || companyData.coverImage instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating company:', error);
      throw error;
    }
  },
  
  // Get company details
  getCompany: async (companyId) => {
    try {
      const response = await api.get(`/api/companies/${companyId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching company:', error);
      throw error;
    }
  }
};

// Discovery endpoints
const discoveryService = {
  // Get personalized discovery dashboard
  getDiscoveryDashboard: async () => {
    try {
      const response = await api.get('/api/discover');
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery dashboard:', error);
      throw error;
    }
  },

  // Get content feed with filters
  getContentFeed: async (options = {}) => {
    try {
      const { 
        type, filter, page, limit, location 
      } = options;

      let url = '/api/content/feed';
      const params = new URLSearchParams();
      
      if (type) params.append('type', type);
      if (filter) params.append('filter', filter);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      if (location) params.append('location', location);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching content feed:', error);
      throw error;
    }
  },

  // Get trending content
  getTrending: async (options = {}) => {
    try {
      const { period, category, location } = options;
      
      let url = '/api/trending';
      const params = new URLSearchParams();
      
      if (period) params.append('period', period);
      if (category) params.append('category', category);
      if (location) params.append('location', location);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching trending content:', error);
      throw error;
    }
  },

  // Search with advanced filters
  search: async (query, options = {}) => {
    try {
      const { type, filter, page, limit } = options;
      
      let url = '/api/search';
      const params = new URLSearchParams();
      
      params.append('query', query);
      if (type) params.append('type', type);
      if (filter) params.append('filter', typeof filter === 'object' ? JSON.stringify(filter) : filter);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error searching:', error);
      throw error;
    }
  }
};

// Portfolio endpoints
const portfolioService = {
  // Create a project with improved error handling
  createProject: async (projectData) => {
    try {
      // Check if we already have FormData
      if (projectData instanceof FormData) {
        // Ensure we have a title field
        const titleValue = projectData.get('title');
        
        // If no title found, explicitly check for it to provide a better error
        if (!titleValue || titleValue.trim() === '') {
          throw new Error('Title field is missing in FormData');
        }
      } else {
        // If we receive an object instead of FormData, create FormData from it
        const formData = new FormData();
        
        // Add project fields to FormData
        for (const [key, value] of Object.entries(projectData)) {
          if (key !== 'attachments') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add attachments if any
        if (projectData.attachments && Array.isArray(projectData.attachments)) {
          projectData.attachments.forEach((file, index) => {
            formData.append('attachments', file);
          });
        }
        
        projectData = formData;
      }
      
      // Make the API request to the correct endpoint
      const response = await api.post('/api/projects', projectData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error in createProject API call:', error);
      
      // Enhanced error logging for debugging
      if (error.response) {
        console.error('Server response:', error.response.status, error.response.data);
      }
      
      throw error;
    }
  },
  
  // Delete a project
  deleteProject: async (projectId) => {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      const response = await api.delete(`/api/projects/${projectId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  },
  
  // Delete an achievement 
  deleteAchievement: async (achievementId) => {
    try {
      if (!achievementId) {
        throw new Error('Achievement ID is required');
      }
      
      const response = await api.delete(`/api/achievements/${achievementId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting achievement:', error);
      throw error;
    }
  },
  
  // Delete a streak
  deleteStreak: async (streakId) => {
    try {
      if (!streakId) {
        throw new Error('Streak ID is required');
      }
      
      const response = await api.delete(`/api/streaks/${streakId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting streak:', error);
      throw error;
    }
  },

  // Update a project
  updateProject: async (projectId, projectData) => {
    try {
      let dataToSend = projectData;
      
      // Create FormData if needed
      if (!(projectData instanceof FormData)) {
        const formData = new FormData();
        
        for (const [key, value] of Object.entries(projectData)) {
          if (key !== 'attachments') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add attachments if any
        if (projectData.attachments && Array.isArray(projectData.attachments)) {
          projectData.attachments.forEach((file, index) => {
            formData.append('attachments', file);
          });
        }
        
        dataToSend = formData;
      }
      
      const response = await api.put(`/api/projects/${projectId}`, dataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  },
  
  // Get user projects with proper query parameters
  getUserProjects: async (userId, options = {}) => {
    const { limit = 10, page = 1 } = options;
    
    let url = `/api/projects`; // Using general projects endpoint
    const params = new URLSearchParams();
    
    params.append('userId', userId); // Add userId as a query parameter
    params.append('page', page);
    params.append('limit', limit);
    
    try {
      const response = await api.get(`${url}?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user projects:', error);
      return { items: [], total: 0 };
    }
  },

  // Get user achievements with proper query parameters
  getUserAchievements: async (userId, options = {}) => {
    const { limit = 10, page = 1 } = options;
    
    let url = `/api/achievements`; // Using the general achievements endpoint
    const params = new URLSearchParams();
    
    params.append('userId', userId); // Add userId as a query parameter
    params.append('page', page);
    params.append('limit', limit);
    
    try {
      const response = await api.get(`${url}?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      return { items: [], total: 0 };
    }
  },

  // Get user streaks with proper query parameters
  getUserStreaks: async (userId, options = {}) => {
    const { limit = 10, page = 1, active } = options;
    
    let url = `/api/streaks`;  // Using the general streaks endpoint
    const params = new URLSearchParams();
    
    params.append('userId', userId); // Add userId as a query parameter
    params.append('page', page);
    params.append('limit', limit);
    if (active !== undefined) params.append('active', active);
    
    try {
      const response = await api.get(`${url}?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user streaks:', error);
      return { items: [], total: 0 };
    }
  },
  
  // Create an achievement
  createAchievement: async (achievementData) => {
    try {
      let dataToSend = achievementData;
      
      // Convert to FormData if needed for file uploads
      if (!(achievementData instanceof FormData) && achievementData.image instanceof File) {
        const formData = new FormData();
        
        // Add all fields except image
        for (const [key, value] of Object.entries(achievementData)) {
          if (key !== 'image') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add image
        formData.append('image', achievementData.image);
        dataToSend = formData;
      }
      
      const response = await api.post('/api/achievements', dataToSend, {
        headers: {
          'Content-Type': achievementData instanceof FormData || 
                        (achievementData.image instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating achievement:', error);
      throw error;
    }
  },
  
  // Update an achievement
  updateAchievement: async (achievementId, achievementData) => {
    try {
      let dataToSend = achievementData;
      
      // Convert to FormData if needed for file uploads
      if (!(achievementData instanceof FormData) && achievementData.image instanceof File) {
        const formData = new FormData();
        
        // Add all fields except image
        for (const [key, value] of Object.entries(achievementData)) {
          if (key !== 'image') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add image
        formData.append('image', achievementData.image);
        dataToSend = formData;
      }
      
      const response = await api.put(`/api/achievements/${achievementId}`, dataToSend, {
        headers: {
          'Content-Type': achievementData instanceof FormData || 
                        (achievementData.image instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error updating achievement:', error);
      throw error;
    }
  },
  
  // Create a streak
  createStreak: async (streakData) => {
    try {
      const response = await api.post('/api/streaks', streakData);
      return response.data;
    } catch (error) {
      console.error('Error creating streak:', error);
      throw error;
    }
  },
  
  // Update a streak
  updateStreak: async (streakId, streakData) => {
    try {
      const response = await api.put(`/api/streaks/${streakId}`, streakData);
      return response.data;
    } catch (error) {
      console.error('Error updating streak:', error);
      throw error;
    }
  },
  
  // Check in to a streak
  checkInToStreak: async (streakId, checkInData) => {
    try {
      let dataToSend = checkInData;
      
      // Convert to FormData if needed for file uploads
      if (!(checkInData instanceof FormData) && checkInData.evidence instanceof File) {
        const formData = new FormData();
        
        // Add notes
        formData.append('notes', checkInData.notes || '');
        
        // Add evidence file
        formData.append('evidence', checkInData.evidence);
        dataToSend = formData;
      }
      
      const response = await api.post(`/api/streaks/${streakId}/checkin`, dataToSend, {
        headers: {
          'Content-Type': checkInData instanceof FormData || 
                        (checkInData.evidence instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error checking in to streak:', error);
      throw error;
    }
  }
};

// Group & Communities endpoints
const groupService = {
  // Create a group/community
  createGroup: async (groupData) => {
    try {
      // Ensure we have FormData for file uploads
      let dataToSend = groupData;
      
      if (!(groupData instanceof FormData) && groupData.coverImage instanceof File) {
        const formData = new FormData();
        
        // Add all fields except coverImage
        for (const [key, value] of Object.entries(groupData)) {
          if (key !== 'coverImage') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add cover image
        formData.append('coverImage', groupData.coverImage);
        dataToSend = formData;
      }
      
      const response = await api.post('/api/groups', dataToSend, {
        headers: {
          'Content-Type': groupData instanceof FormData || 
                        (groupData.coverImage instanceof File) ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  },

  // Join, leave, or request to join group
  manageGroupMembership: async (groupId, action, message = '') => {
    try {
      const response = await api.post(`/api/groups/${groupId}/membership`, {
        action,
        message
      });
      return response.data;
    } catch (error) {
      console.error('Error managing group membership:', error);
      throw error;
    }
  },

  // Review membership requests (for admins)
  reviewMembershipRequest: async (groupId, userId, status) => {
    try {
      const response = await api.put(`/api/groups/${groupId}/requests/${userId}`, {
        status
      });
      return response.data;
    } catch (error) {
      console.error('Error reviewing membership request:', error);
      throw error;
    }
  },

  // Create group post
  createGroupPost: async (groupId, postData) => {
    try {
      // Ensure we use FormData for file uploads
      let dataToSend = postData;
      
      if (!(postData instanceof FormData) && postData.media) {
        const formData = new FormData();
        
        // Add all fields except media
        for (const [key, value] of Object.entries(postData)) {
          if (key !== 'media') {
            if (typeof value === 'object' && value !== null) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, value);
            }
          }
        }
        
        // Add media files
        if (Array.isArray(postData.media)) {
          postData.media.forEach(file => {
            formData.append('media', file);
          });
        } else {
          formData.append('media', postData.media);
        }
        
        dataToSend = formData;
      }
      
      const response = await api.post(`/api/groups/${groupId}/posts`, dataToSend, {
        headers: {
          'Content-Type': postData instanceof FormData || postData.media ? 
                        'multipart/form-data' : 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating group post:', error);
      throw error;
    }
  },

  // Get nearby groups
  getNearbyGroups: async (options = {}) => {
    try {
      const { 
        latitude, longitude, radius, 
        types, categories,
        page, limit
      } = options;
      
      let url = '/api/map/groups';
      const params = new URLSearchParams();
      
      if (latitude) params.append('latitude', latitude);
      if (longitude) params.append('longitude', longitude);
      if (radius) params.append('radius', radius);
      if (types) params.append('types', types);
      if (categories) params.append('categories', categories);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby groups:', error);
      throw error;
    }
  }
};

// Analytics endpoints
const analyticsService = {
  // Get network analytics
  getNetworkAnalytics: async (period = 'month') => {
    try {
      const response = await api.get(`/api/analytics/network?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching network analytics:', error);
      throw error;
    }
  },

  // Get event analytics
  getEventAnalytics: async (period = 'year') => {
    try {
      const response = await api.get(`/api/analytics/events?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching event analytics:', error);
      throw error;
    }
  }
};

// Location sharing endpoints
const locationService = {
  // Continuous location update method
  continuousLocationUpdate: async (locationData) => {
    try {
      const { latitude, longitude, accuracy, heading, speed } = locationData;
      
      // Validate required parameters
      if (!latitude || !longitude) {
        console.error('Continuous location update requires latitude and longitude');
        return { success: false, error: 'Missing required location data' };
      }
      
      const response = await api.post('/api/location/continuous-update', {
        latitude,
        longitude,
        accuracy,
        heading,
        speed
      });
      
      // Emit location update via Socket.IO if socket is available
      if (socketManager && typeof socketManager.isConnected === 'function' && socketManager.isConnected()) {
        socketManager.emit('update_location', { latitude, longitude });
      }
      
      return response.data;
    } catch (error) {
      console.error('Continuous location update error:', error);
      return { 
        success: false, 
        error: error.response?.data?.msg || error.message 
      };
    }
  },

  // Start continuous location updates
  startContinuousLocationUpdates: (options = {}) => {
    const {
      interval = 30000,
      successCallback = () => {},
      errorCallback = () => {}
    } = options;
    
    let watchId = null;
    let intervalId = null;
    let isRunning = false;
    
    // Function to get and send location
    const updateLocation = () => {
      if (!isRunning) return;
      
      // Use high accuracy for better results
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const locationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed
            };
            
            // Send to server
            const result = await locationService.continuousLocationUpdate(locationData);
            successCallback(result);
          } catch (error) {
            console.error('Error updating location:', error);
            errorCallback(error);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          errorCallback(error);
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };
    // Start tracking
    const start = () => {
      if (isRunning) return;
      
      isRunning = true;
      
      // Initial update
      updateLocation();
      
      // Set up regular interval updates
      intervalId = setInterval(updateLocation, interval);
      
      // Return control object
      return {
        stop: stop,
        isRunning: () => isRunning
      };
    };
    
    // Stop tracking
    const stop = () => {
      isRunning = false;
      
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    
    // Start tracking immediately
    return start();
  },

  // Stop continuous location updates - deprecated, use the return value from startContinuousLocationUpdates instead
  stopContinuousLocationUpdates: () => {
    // This is a simple wrapper that doesn't do anything since the 
    // actual stop function is returned by startContinuousLocationUpdates
    console.log('Use the stop function returned by startContinuousLocationUpdates instead');
  },
    
  // Enable/disable real-time location sharing
  toggleLocationSharing: async (settings) => {
    try {
      const response = await api.post('/api/location/sharing', settings);
      return response.data;
    } catch (error) {
      console.error('Error toggling location sharing:', error);
      throw error;
    }
  },

  // Update real-time location
  updateLocation: async (locationData) => {
    try {
      const response = await api.post('/api/location/update', locationData);
      return response.data;
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  },
updateLocation: async (latitude, longitude) => {
    // Validate input first
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
        isNaN(latitude) || isNaN(longitude)) {
      console.error('Invalid location data:', { latitude, longitude });
      return { 
        success: false, 
        error: 'Invalid location data' 
      };
    }

    // Ensure values are within valid ranges for latitude and longitude
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      console.error('Location coordinates out of valid range:', { latitude, longitude });
      return { 
        success: false, 
        error: 'Coordinates out of valid range' 
      };
    }

    // Format to 6 decimal places max (about 10cm precision) to avoid potential issues
    const formattedLatitude = parseFloat(latitude.toFixed(6));
    const formattedLongitude = parseFloat(longitude.toFixed(6));

    try {
      // First attempt - regular update
      const response = await api.put('/api/location', { 
        latitude: formattedLatitude, 
        longitude: formattedLongitude 
      });
      
      // Emit location update via Socket.IO if successful
      if (socketManager && socketManager.emit) {
        socketManager.emit('update_location', { 
          latitude: formattedLatitude, 
          longitude: formattedLongitude 
        });
      }
      
      return response.data;
    } catch (error) {
      console.log('Location update error (primary):', error);
      
      // If the regular update fails, try the continuous update endpoint as fallback
      try {
        // Retry with continuous location endpoint which might be more reliable
        const fallbackResponse = await api.post('/api/location/continuous-update', {
          latitude: formattedLatitude,
          longitude: formattedLongitude,
          accuracy: 10, // Default reasonable accuracy in meters
          heading: null,
          speed: null
        });
        
        console.log('Used fallback location update method');
        return fallbackResponse.data;
      } catch (fallbackError) {
        console.error('Location update error (fallback):', fallbackError);
        
        // Still emit update via socketManager if available, even if API call failed
        // This might still update the UI without requiring the API success
        if (socketManager && socketManager.emit) {
          socketManager.emit('update_location', { 
            latitude: formattedLatitude, 
            longitude: formattedLongitude 
          });
        }
        
        // Return a constructed mock response to prevent UI errors
        return { 
          success: false,
          locationUpdatedViaSocket: true,
          error: fallbackError.message || 'Location update failed'
        };
      }
    }
  },
  
  // Get nearby professionals without requiring a location update first
  getNearbyProfessionals: async (distance = 10, latitude = null, longitude = null) => {
    try {
      // Build the request parameters
      const params = { distance };
      
      // Add coordinates if provided
      if (latitude !== null && longitude !== null) {
        params.latitude = parseFloat(latitude.toFixed(6));
        params.longitude = parseFloat(longitude.toFixed(6));
      }
      
      // Make the API call
      const response = await api.get('/api/network/nearby', { params });
      
      // Process the response to ensure consistent format
      const professionals = Array.isArray(response.data) ? response.data : 
                          (response.data.professionals || []);
      
      // Map any necessary data transformations or enrichments
      return professionals.map(prof => ({
        ...prof,
        // Ensure these properties exist
        firstName: prof.firstName || '',
        lastName: prof.lastName || '',
        connectionStatus: prof.connectionStatus || 'none',
        // Add distance if available
        distance: prof.distance ? `${prof.distance.toFixed(1)} km` : 'nearby'
      }));
    } catch (error) {
      console.error('Error fetching nearby professionals:', error);
      
      // Return empty array instead of throwing to prevent UI errors
      return [];
    }
  },

  // Get users with shared location
  getSharedLocationUsers: async () => {
    try {
      const response = await api.get('/api/location/shared-users');
      return response.data;
    } catch (error) {
      console.error('Error fetching shared location users:', error);
      throw error;
    }
  }
};

// Webhook endpoints
const webhookService = {
  // Register webhook
  registerWebhook: async (webhookData) => {
    try {
      const response = await api.post('/api/webhooks', webhookData);
      return response.data;
    } catch (error) {
      console.error('Error registering webhook:', error);
      throw error;
    }
  },
  
  // Get registered webhooks
  getWebhooks: async () => {
    try {
      const response = await api.get('/api/webhooks');
      return response.data;
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      throw error;
    }
  },
  
  // Delete a webhook
  deleteWebhook: async (webhookId) => {
    try {
      const response = await api.delete(`/api/webhooks/${webhookId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting webhook:', error);
      throw error;
    }
  }
};

// Initialize socket connection if token exists
const token = localStorage.getItem('token');
if (token) {
  socketManager.connect(token);
}

// Export all services
export default {
  baseURL,
  socketManager,
  // Authentication services
  ...authService,
  // Profile services
  ...profileService,
  // Content services
  ...postService,
  ...storyService,
  // Messaging services
  ...chatService,
  // Network services
  ...networkService,
  ...profileViewService,
  // Event and discovery services
  ...eventService,
  ...jobService,
  ...companyService,
  ...discoveryService,
  // Portfolio and groups services
  ...portfolioService,
  ...groupService,
  // Analytics and utility services
  ...analyticsService,
  ...locationService,
  ...webhookService
};
