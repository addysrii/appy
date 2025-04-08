import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Navbar'; // Note: Component naming mismatch
import Posts from '../components/posts/Posts';
import api from '../services/api';
import StoryCard from '../components/posts/StoryCard';
import CreatePost from '../components/posts/CreatePost';
import { PlusCircle, Check, Calendar, X, User, AlertTriangle, MapPin } from 'lucide-react';
import { useToast } from '../components/common/Toast';
import LocationPermissionIcon from '../components/LocationPermissionIcon';
import { MapPin as MapPinIcon, Users, ChevronRight, Search, Filter, UserPlus, Rss, 
  Home, Bell, MessageCircle, Briefcase, Settings, LogOut, RefreshCw } from 'lucide-react';
// Add default profile picture
import defaultProfilePic from '../assets/default-avatar.png';

const Dashboard = () => {
  // State management
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [allNearbyUsers, setAllNearbyUsers] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const locationControlRef = useRef(null);
  
  // Auth and navigation
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const toastContext = useToast();
  const toast = toastContext?.toast;
  
  // Dashboard UI state
  const [activeSection, setActiveSection] = useState('overview');
  const [pendingRequests, setPendingRequests] = useState(0);
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingState, setLoadingState] = useState({
    nearby: false,
    dashboard: false, // Changed from true to false
    connections: false,
    profile: false,
    posts: false
  });
  
  // Dashboard data state
  const [dashboardStats, setDashboardStats] = useState({
    profileViews: 0,
    connections: 0,
    streaks: 0,
    projects: 0
  });
  const [userStreaks, setUserStreaks] = useState([]);
  const [userProjects, setUserProjects] = useState([]);
  const [userAchievements, setUserAchievements] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [planner, setPlanner] = useState([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    // Get user's location and fetch nearby users
    getUserLocation();
  }, []);

  // Improved getUserLocation with better error handling
  const getUserLocation = () => {
    setLoadingState(prev => ({ ...prev, nearby: true }));
    
    if (navigator.geolocation) {
      // Options for high accuracy with reasonable timeout
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      };
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Location obtained with accuracy: ${accuracy} meters`);
          
          // Store location with accuracy information
          setUserLocation({ 
            latitude, 
            longitude, 
            accuracy,
            timestamp: new Date().toISOString()
          });
          
          // Fetch nearby users with the coordinates
          fetchNearbyUsers(latitude, longitude, 10);
        },
        (error) => {
          console.error('Error getting location:', error);
          let errorMessage;
          
          // Provide user-friendly error messages based on error type
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location access denied. Please enable location services for this site.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Your location is currently unavailable. Please try again later.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out. Please try again.";
              break;
            default:
              errorMessage = "Unknown location error. Please try again.";
          }
          
          // Set error state that can be displayed to the user
          setLocationError(errorMessage);
          setLoadingState(prev => ({ ...prev, nearby: false }));
        },
        options
      );
    } else {
      setLocationError("Geolocation is not supported by your browser. Please use a modern browser.");
      setLoadingState(prev => ({ ...prev, nearby: false }));
    }
  };

  // Enhanced fetchNearbyUsers with better error handling
  const fetchNearbyUsers = async (latitude, longitude, distance) => {
    setLoadingState(prev => ({ ...prev, nearby: true }));
    setLocationError(null); // Clear any previous errors
    
    try {
      console.log(`Fetching nearby users at [${latitude}, ${longitude}] within ${distance}km`);
      
      // Validate coordinates before API call
      if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        throw new Error("Invalid coordinates provided");
      }
      
      // Use the updated API with all parameters
      const nearbyResponse = await api.getNearbyProfessionals(distance, latitude, longitude);
      
      // Validate response
      if (!nearbyResponse) {
        throw new Error("Empty response from server");
      }
      
      if (!Array.isArray(nearbyResponse)) {
        console.error('Invalid response format:', nearbyResponse);
        throw new Error("Invalid response format from server");
      }
      
      console.log(`Retrieved ${nearbyResponse.length} nearby professionals`);
      
      // Now fetch connections to exclude them from results (with error handling)
      let connections = [];
      try {
        // Set separate loading state for connections
        setLoadingState(prev => ({ ...prev, connections: true }));
        connections = await api.getConnections('all');
        
        if (!Array.isArray(connections)) {
          console.warn('Invalid connections response:', connections);
          connections = [];
        }
      } catch (connectionError) {
        console.error('Error fetching connections:', connectionError);
        connections = []; // Use empty array on error
      } finally {
        setLoadingState(prev => ({ ...prev, connections: false }));
      }
      
      // Create a Set of connection IDs for faster lookup
      const connectionIds = new Set(
        Array.isArray(connections) 
          ? connections.map(conn => conn._id)
          : []
      );
      
      // Filter out users who are already connections
      const filteredUsers = nearbyResponse.filter(user => !connectionIds.has(user._id));
      
      // Enhance user objects with more info
      const enhancedUsers = filteredUsers.map(user => ({
        ...user,
        // Add time ago for last active
        lastActiveFormatted: user.lastActive ? formatTimeAgo(new Date(user.lastActive)) : null,
        // Add readable distance
        distanceFormatted: formatDistance(user.distance)
      }));
      
      // Store full list but only show limited number in UI
      setAllNearbyUsers(enhancedUsers);
      setNearbyUsers(enhancedUsers.slice(0, 3));
    } catch (error) {
      console.error('Error fetching nearby professionals:', error);
      setLocationError(error.message || "Failed to fetch nearby professionals");
      setNearbyUsers([]);
      setAllNearbyUsers([]);
    } finally {
      setLoadingState(prev => ({ ...prev, nearby: false }));
    }
  };

  // Helper function to format distance in a user-friendly way
  const formatDistance = (distance) => {
    if (distance === null || distance === undefined) return 'Unknown distance';
    
    // For very short distances, show in meters
    if (distance < 0.1) {
      return `${Math.round(distance * 1000)}m away`;
    }
    
    // For distances less than 10km, show one decimal place
    if (distance < 10) {
      return `${distance.toFixed(1)}km away`;
    }
    
    // For longer distances, round to whole number
    return `${Math.round(distance)}km away`;
  };

  // Helper function to format time ago
  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return 'Just now';
    
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
    
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  };

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  // Fetch all dashboard data in parallel with improved error handling
  useEffect(() => {
    const fetchAllData = async () => {
      if (!user) return;
      setLoadingData(true);
      
      try {
        // Array of fetch promises - each wrapped in a try/catch to prevent one error from stopping all others
        const fetchPromises = [
          // Profile Views
          (async () => {
            try {
              return await api.getProfileViewAnalytics();
            } catch (error) {
              console.error('Error fetching profile view analytics:', error);
              return { totalViews: 0, views: [] }; // Return default values on error
            }
          })(),
          
          // Connections
          (async () => {
            try {
              return await api.getConnections('all');
            } catch (error) {
              console.error('Error fetching connections:', error);
              return []; 
            }
          })(),
          
          // Pending Requests
          (async () => {
            try {
              return await api.getConnectionRequests();
            } catch (error) {
              console.error('Error fetching connection requests:', error);
              return [];
            }
          })(),
          
          // Streaks
          (async () => {
            try {
              return await api.getUserStreaks(user._id, { limit: 5, active: true });
            } catch (error) {
              console.error('Error fetching user streaks:', error);
              return { items: [] };
            }
          })(),
          
          // Projects
          (async () => {
            try {
              return await api.getUserProjects(user._id, { limit: 5 });
            } catch (error) {
              console.error('Error fetching user projects:', error);
              return { items: [] };
            }
          })(),
          
          // Achievements
          (async () => {
            try {
              return await api.getUserAchievements(user._id, { limit: 3 });
            } catch (error) {
              console.error('Error fetching user achievements:', error);
              return { items: [] };
            }
          })(),
          
          // Posts
          (async () => {
            try {
              return await api.getPosts({ limit: 3 });
            } catch (error) {
              console.error('Error fetching posts:', error);
              return { posts: [] };
            }
          })()
        ];
        
        // Wait for all promises to settle
        const results = await Promise.all(fetchPromises);
        
        // Destructure results with fallbacks for null values
        const [
          profileViewData,
          connectionsData,
          pendingRequestsData,
          streaksData,
          projectsData,
          achievementsData,
          postsData
        ] = results;
        
        // Update dashboard stats with real data and fallbacks
        setDashboardStats({
          profileViews: profileViewData?.totalViews || 0,
          connections: Array.isArray(connectionsData) ? connectionsData.length : 0,
          streaks: streaksData?.items?.length || 0,
          projects: projectsData?.items?.length || 0
        });
        
        // Update other state data - add null checks
        setPendingRequests(Array.isArray(pendingRequestsData) ? pendingRequestsData.length : 0);
        setConnectionRequests(pendingRequestsData || []);
        setUserStreaks(streaksData?.items || []);
        setUserProjects(projectsData?.items || []);
        setUserAchievements(achievementsData?.items || []);
        setRecentPosts(postsData?.posts || []);
        
        // Load planner from local storage if exists
        const savedPlanner = localStorage.getItem('userPlanner');
        if (savedPlanner) {
          try {
            setPlanner(JSON.parse(savedPlanner));
          } catch (error) {
            console.error('Error parsing planner from localStorage:', error);
            setPlanner([]);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Set default/fallback values for all states
        setDashboardStats({
          profileViews: 0,
          connections: 0,
          streaks: 0,
          projects: 0
        });
        setPendingRequests(0);
        setConnectionRequests([]);
        setUserStreaks([]);
        setUserProjects([]);
        setUserAchievements([]);
        setRecentPosts([]);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, [user]);

  // Location tracking implementation
  useEffect(() => {
    // Skip if user is not logged in
    if (!user || !user._id) return;
    
    const startLocationTracking = async () => {
      try {
        // Check if we have permission first
        if (navigator.permissions) {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          
          if (permission.state !== 'granted') {
            console.log('Location permission not granted');
            setLocationEnabled(false);
            return;
          }
        }
        
        console.log('Starting location tracking...');
        
        // Start tracking and store the control object
        locationControlRef.current = api.startContinuousLocationUpdates({
          interval: 30000, // 30 seconds
          successCallback: (result) => {
            console.log('Location updated successfully:', result);
            setLocationEnabled(true);
          },
          errorCallback: (error) => {
            console.error('Location update error:', error);
            setLocationEnabled(false);
          }
        });
      } catch (error) {
        console.error('Error setting up location tracking:', error);
        setLocationEnabled(false);
      }
    };
    
    // Start tracking
    startLocationTracking();
    
    // Clean up function
    return () => {
      if (locationControlRef.current && typeof locationControlRef.current.stop === 'function') {
        console.log('Stopping location tracking');
        locationControlRef.current.stop();
        locationControlRef.current = null;
      }
    };
  }, [user?._id]);

  // Enhanced connection request handling with proper UI updates
  const handleAcceptConnection = async (userId) => {
    try {
      await api.acceptConnection(userId);
      // Update the pending requests list
      setPendingRequests(prev => prev - 1);
      // Remove the accepted request from the list
      setConnectionRequests(prev => prev.filter(req => req._id !== userId));
      // Update connections count
      setDashboardStats(prev => ({
        ...prev,
        connections: prev.connections + 1
      }));
      
      // Show success toast
      if (toast) {
        toast({
          title: "Connection Accepted",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error accepting connection request:', error);
      
      // Show error toast
      if (toast) {
        toast({
          title: "Failed to accept connection",
          description: error.message || "Please try again later",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  const handleDeclineConnection = async (userId) => {
    try {
      await api.declineConnection(userId);
      // Update the pending requests list
      setPendingRequests(prev => prev - 1);
      // Remove the declined request from the list
      setConnectionRequests(prev => prev.filter(req => req._id !== userId));
      
      // Show success toast
      if (toast) {
        toast({
          title: "Connection Request Declined",
          status: "info",
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error declining connection request:', error);
      
      // Show error toast
      if (toast) {
        toast({
          title: "Failed to decline connection",
          description: error.message || "Please try again later",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  // Handle connecting with a nearby user
  const handleConnect = async (userId) => {
    try {
      await api.sendConnectionRequest(userId);
      // Update the user's status in the nearbyUsers list
      setNearbyUsers(prev => 
        prev.map(user => 
          user._id === userId 
            ? { ...user, connectionStatus: 'pending' } 
            : user
        )
      );
      
      // Also update the full list 
      setAllNearbyUsers(prev => 
        prev.map(user => 
          user._id === userId 
            ? { ...user, connectionStatus: 'pending' } 
            : user
        )
      );
      
      // Show success toast
      if (toast) {
        toast({
          title: "Connection Request Sent",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error sending connection request:', error);
      
      // Show error toast
      if (toast) {
        toast({
          title: "Failed to send request",
          description: error.message || "Please try again later",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  // Handle following a nearby user
  const handleFollow = async (userId) => {
    try {
      const response = await api.followUser(userId);
      // Update the user's status in the nearby users list
      setNearbyUsers(prev => 
        prev.map(user => 
          user._id === userId 
            ? { ...user, isFollowing: response.following } 
            : user
        )
      );
      
      // Also update the full list
      setAllNearbyUsers(prev => 
        prev.map(user => 
          user._id === userId 
            ? { ...user, isFollowing: response.following } 
            : user
        )
      );
      
      // Show success toast
      if (toast) {
        toast({
          title: response.following ? "Following User" : "Unfollowed User",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error following user:', error);
      
      // Show error toast
      if (toast) {
        toast({
          title: "Action Failed",
          description: error.message || "Please try again later",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  // Planner/To-Do list functions with improved error handling
  const addTask = () => {
    if (!newTask.trim()) return;
    
    const task = {
      id: Date.now(),
      text: newTask,
      completed: false,
      date: new Date().toISOString()
    };
    
    const updatedPlanner = [...planner, task];
    setPlanner(updatedPlanner);
    
    // Save to localStorage with error handling
    try {
      localStorage.setItem('userPlanner', JSON.stringify(updatedPlanner));
    } catch (error) {
      console.error('Error saving planner to localStorage:', error);
      
      // Show error toast
      if (toast) {
        toast({
          title: "Failed to save task",
          description: "Your task was added but may not persist after refresh",
          status: "warning",
          duration: 5000,
          isClosable: true,
        });
      }
    }
    
    setNewTask('');
  };

  const toggleTaskCompletion = (taskId) => {
    const updatedPlanner = planner.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    setPlanner(updatedPlanner);
    
    // Save to localStorage with error handling
    try {
      localStorage.setItem('userPlanner', JSON.stringify(updatedPlanner));
    } catch (error) {
      console.error('Error saving planner to localStorage:', error);
    }
  };

  const deleteTask = (taskId) => {
    const updatedPlanner = planner.filter(task => task.id !== taskId);
    setPlanner(updatedPlanner);
    
    // Save to localStorage with error handling
    try {
      localStorage.setItem('userPlanner', JSON.stringify(updatedPlanner));
    } catch (error) {
      console.error('Error saving planner to localStorage:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return ''; // Invalid date
      }
      
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      return date.toLocaleDateString(undefined, options);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Get profile picture with fallback
  const getProfilePicture = (userObj) => {
    if (userObj?.profilePicture) {
      return userObj.profilePicture;
    }
    return defaultProfilePic;
  };

  // Loading state for main dashboard
  if (loadingState.dashboard || loadingData) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-orange-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col md:flex-row h-screen bg-orange-50">
      {/* Sidebar - hidden on mobile, visible on md and up */}
      <div className="hidden md:block">
        <Sidebar user={user} onLogout={logout} />
      </div>
      
      {/* Mobile Navbar - visible only on small screens */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-lg z-10">
        <div className="flex justify-around items-center h-16 px-2">
          <button 
            onClick={() => setActiveSection('overview')}
            className={`flex flex-col items-center justify-center p-2 ${activeSection === 'overview' ? 'text-orange-500' : 'text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs">Home</span>
          </button>
          <button 
            onClick={() => setActiveSection('network')}
            className={`flex flex-col items-center justify-center p-2 ${activeSection === 'network' ? 'text-orange-500' : 'text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-xs">Network</span>
          </button>
          <button 
            onClick={() => setActiveSection('content')}
            className={`flex flex-col items-center justify-center p-2 ${activeSection === 'content' ? 'text-orange-500' : 'text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-xs">Create</span>
          </button>
          <button 
            onClick={() => setActiveSection('portfolio')}
            className={`flex flex-col items-center justify-center p-2 ${activeSection === 'portfolio' ? 'text-orange-500' : 'text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-xs">Portfolio</span>
          </button>
          <Link
            to="/profile"
            className="flex flex-col items-center justify-center p-2 text-gray-500"
          >
            <User className="h-6 w-6" />
            <span className="text-xs">Profile</span>
          </Link>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto pb-16 md:pb-0">
        <div className="md:pl-0 pl-0 md:pt-0 pt-4">
          <main className="max-w-7xl mx-auto p-4 md:p-6">
            {/* Dashboard Header - Calendar View Style */}
            <div className="bg-white rounded-xl shadow-md mb-6 p-4 md:p-6 border-l-4 border-orange-500">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <div className="flex items-center mb-2">
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-lg bg-gradient-to-r from-orange-500 to-orange-400 mr-4 flex items-center justify-center text-white font-bold text-xl">
                      {new Date().getDate()}
                    </div>
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-gray-800">Hello, {user?.firstName || 'User'}!</h1>
                      <p className="text-sm md:text-base text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 md:mt-0 w-full md:w-auto">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/connections`}>
                      <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-md text-sm font-medium">
                        {pendingRequests} connection requests
                      </span>
                    </Link>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-md text-sm font-medium">
                      {planner.filter(task => !task.completed).length} pending tasks
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Tabs Navigation - Scrollable on mobile */}
            <div className="mb-6 bg-white rounded-xl shadow-md overflow-hidden border-b">
              <div className="flex overflow-x-auto scrollbar-hide">
                <button
               
                onClick={() => setActiveSection('overview')}
                className={`flex-none text-center py-4 px-4 font-medium text-sm focus:outline-none transition-colors duration-200 ${
                  activeSection === 'overview'
                    ? 'text-orange-600 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-orange-500'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveSection('network')}
                className={`flex-none text-center py-4 px-4 font-medium text-sm focus:outline-none transition-colors duration-200 ${
                  activeSection === 'network'
                    ? 'text-orange-600 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-orange-500'
                }`}
              >
                Network
              </button>
              <button
                onClick={() => setActiveSection('content')}
                className={`flex-none text-center py-4 px-4 font-medium text-sm focus:outline-none transition-colors duration-200 ${
                  activeSection === 'content'
                    ? 'text-orange-600 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-orange-500'
                }`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveSection('portfolio')}
                className={`flex-none text-center py-4 px-4 font-medium text-sm focus:outline-none transition-colors duration-200 ${
                  activeSection === 'portfolio'
                    ? 'text-orange-600 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-orange-500'
                }`}
              >
                Portfolio
              </button>
            </div>
          </div>

          {/* Dashboard Content - Based on active section */}
          {activeSection === 'overview' && (
            <>
              {/* Stats Cards - Responsive grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                <div className="bg-white rounded-xl shadow p-3 md:p-5 border-l-4 border-orange-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-500 text-xs md:text-sm">Profile Views</p>
                      <h3 className="text-xl md:text-3xl font-bold text-gray-800 mt-1">{dashboardStats.profileViews}</h3>
                    </div>
                    <div className="bg-orange-100 p-1.5 md:p-2 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-6 md:w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-green-600 text-xs md:text-sm mt-2">Career visibility</p>
                </div>
                
                <div className="bg-white rounded-xl shadow p-3 md:p-5 border-l-4 border-blue-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-500 text-xs md:text-sm">Connections</p>
                      <h3 className="text-xl md:text-3xl font-bold text-gray-800 mt-1">{dashboardStats.connections}</h3>
                    </div>
                    <div className="bg-blue-100 p-1.5 md:p-2 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-6 md:w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-green-600 text-xs md:text-sm mt-2">Network growth</p>
                </div>
                
                <div className="bg-white rounded-xl shadow p-3 md:p-5 border-l-4 border-green-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-500 text-xs md:text-sm">Streaks</p>
                      <h3 className="text-xl md:text-3xl font-bold text-gray-800 mt-1">{dashboardStats.streaks}</h3>
                    </div>
                    <div className="bg-green-100 p-1.5 md:p-2 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-6 md:w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-green-600 text-xs md:text-sm mt-2">Active habits</p>
                </div>
                
                <div className="bg-white rounded-xl shadow p-3 md:p-5 border-l-4 border-purple-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-500 text-xs md:text-sm">Projects</p>
                      <h3 className="text-xl md:text-3xl font-bold text-gray-800 mt-1">{dashboardStats.projects}</h3>
                    </div>
                    <div className="bg-purple-100 p-1.5 md:p-2 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-6 md:w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-green-600 text-xs md:text-sm mt-2">Portfolio highlights</p>
                </div>
              </div>

              {/* Responsive Dashboard Layout - Stack on mobile, two columns on larger screens */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left Side - Full width on mobile, 3 columns on larger screens */}
                <div className="lg:col-span-3 space-y-6">
                  {/* Quick Actions */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="border-b border-gray-200 px-4 md:px-6 py-4">
                      <h3 className="font-semibold text-gray-800">Quick Actions</h3>
                    </div>
                    <div className="p-4 md:p-6 grid grid-cols-3 gap-2 md:gap-4">
                      <button 
                        onClick={() => navigate('/posts/create')}
                        className="flex flex-col items-center justify-center bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg p-2 md:p-4 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-8 md:w-8 mb-1 md:mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-xs md:text-sm font-medium">Create Post</span>
                      </button>
                      
                      <button 
                        onClick={() => navigate('/portfolio/projects/new')}
                        className="flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg p-2 md:p-4 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-8 md:w-8 mb-1 md:mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-xs md:text-sm font-medium">Add Project</span>
                      </button>
                      
                      <button 
                        onClick={() => navigate('/portfolio/streak/new')}
                        className="flex flex-col items-center justify-center bg-green-50 hover:bg-green-100 text-green-700 rounded-lg p-2 md:p-4 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-8 md:w-8 mb-1 md:mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span className="text-xs md:text-sm font-medium">Start Streak</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Stories */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800">Stories</h3>
                      <Link to="/stories" className="text-orange-500 hover:text-orange-600 text-xs md:text-sm">View All</Link>
                    </div>
                    <div className="p-4 md:p-6">
                      <StoryCard />
                    </div>
                  </div>
                  
                  {/* Recent Activity */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800">Recent Activity</h3>
                      <button className="text-gray-500 hover:text-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-4 md:p-6">
                      {recentPosts.length > 0 && (
                        <>
                          <h4 className="font-medium text-sm text-gray-700 mb-3">Latest Posts</h4>
                          <div className="mb-6">
                            {recentPosts.map(post => (
                              <div key={post._id} className="mb-4 pb-4 border-b border-gray-100">
                                <div className="flex items-center mb-2">
                                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg overflow-hidden mr-2 md:mr-3">
                                    {post.author && (
                                      <img 
                                        src={getProfilePicture(post.author)}
                                        alt={`${post.author?.firstName || 'User'} ${post.author?.lastName || ''}`}
                                        className="h-full w-full object-cover" 
                                      />
                                    )}
                                  </div>
                                  <div>
                                    {post.author && (
                                      <p className="font-medium text-xs md:text-sm">
                                        {post.author?.firstName || 'User'} {post.author?.lastName || ''}
                                      </p>
                                    )}
                                    <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
                                  </div>
                                </div>
                                <p className="text-xs md:text-sm text-gray-700">{post.content?.length > 100 ? post.content.substring(0, 100) + '...' : post.content}</p>
                                {post.images && post.images.length > 0 && (
                                  <div className="mt-2">
                                    <div className="h-24 md:h-32 rounded-lg overflow-hidden">
                                      <img 
                                        src={post.images[0].url} 
                                        alt="Post content"
                                        className="h-full w-full object-cover" 
                                      />
                                    </div>
                                  </div>
                                )}
                                <div className="mt-3 flex items-center">
                                  <Link to={`/posts/${post._id}`} className="text-xs md:text-sm text-orange-500 hover:text-orange-600 font-medium">
                                    View Post
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      
                      {userAchievements.length > 0 && (
                        <>
                          <h4 className="font-medium text-sm text-gray-700 mb-3">Recent Achievements</h4>
                          <div>
                            {userAchievements.map(achievement => (
                              <div key={achievement._id} className="mb-4 pb-4 border-b border-gray-100 last:border-b-0">
                                <div className="flex">
                                  <div className="flex-shrink-0 mr-3">
                                    <div className="h-10 w-10 md:h-12 md:w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                      {achievement.image ? (
                                        <img 
                                          src={achievement.image} 
                                          alt={achievement.title || 'Achievement'}
                                          className="h-6 w-6 md:h-8 md:w-8 object-contain" 
                                        />
                                      ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <h5 className="font-medium text-sm md:text-base text-gray-800">{achievement.title || 'Untitled Achievement'}</h5>
                                    <p className="text-xs text-gray-500">{formatDate(achievement.dateAchieved)}</p>
                                    <p className="text-xs md:text-sm text-gray-600 mt-1">{achievement.description || ''}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      
                      {recentPosts.length === 0 && userAchievements.length === 0 && (
                        <div className="text-center py-6">
                          <p className="text-gray-500 text-sm">No recent activity to show.</p>
                          <Link to="/posts/create" className="mt-2 inline-block text-orange-500 hover:text-orange-600 text-sm font-medium">
                            Create your first post →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Right Side - Full width on mobile, 2 columns on larger screens */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="mx-4 my-4">
                    <LocationPermissionIcon/>
                  </div>
                  {/* User Profile Card */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                      <div className="relative">
                        <div className="h-20 md:h-24 bg-gradient-to-r from-orange-400 to-orange-500"></div>
                        <div className="absolute top-12 md:top-14 left-4 md:left-6">
                          <div className="h-16 w-16 md:h-20 md:w-20 rounded-lg border-4 border-white bg-white flex items-center justify-center shadow-md overflow-hidden">
                            <img
                              src={getProfilePicture(user)}
                              alt="Profile"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-12 md:pt-14 pb-5 px-4 md:px-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <h2 className="text-lg md:text-xl font-bold text-gray-900">
                              {user?.firstName || 'User'} {user?.lastName || ''}
                            </h2>
                            <p className="text-xs md:text-sm text-gray-500">{user?.headline || 'Professional Title'}</p>
                          </div>
                          <Link 
                            to="/profile" 
                            className="text-orange-500 hover:text-orange-600"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </Link>
                        </div>
                        
                        <div className="mt-4 md:mt-6 bg-orange-50 rounded-lg p-3 md:p-4">
                          <div className="text-xs md:text-sm">
                            <p className="font-medium text-gray-900">Profile Completion: 68%</p>
                            <div className="w-full bg-gray-200 rounded-full h-2 md:h-2.5 mt-2">
                              <div className="bg-orange-500 h-2 md:h-2.5 rounded-full" style={{ width: '68%' }}></div>
                            </div>
                          </div>
                          <div className="mt-2">
                            <Link 
                              to="/profile/edit" 
                              className="text-orange-600 text-xs md:text-sm font-medium hover:text-orange-700"
                            >
                              Complete your profile →
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* My Planner / To-Do List */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden">
                      <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-800">My Planner</h3>
                        <div className="text-orange-500 hover:text-orange-600 text-sm cursor-pointer">
                          <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                        </div>
                      </div>
                      <div className="p-4 md:p-6">
                        {/* Add new task */}
                        <div className="flex mb-4">
                          <input
                            type="text"
                            value={newTask}
                            onChange={(e) => setNewTask(e.target.value)}
                            placeholder="Add a new task..."
                            className="flex-1 border border-gray-300 rounded-l-md py-2 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            onKeyPress={(e) => e.key === 'Enter' && addTask()}
                          />
                          <button
                            onClick={addTask}
                            className="bg-orange-500 text-white rounded-r-md px-3 md:px-4 py-2 text-xs md:text-sm hover:bg-orange-600 transition"
                          >
                            <PlusCircle className="h-4 w-4 md:h-5 md:w-5" />
                          </button>
                        </div>

                        {/* Task list */}
                        <div className="space-y-2 max-h-60 md:max-h-72 overflow-y-auto">
                          {planner.length === 0 ? (
                            <div className="text-center py-4 md:py-6">
                              <p className="text-gray-500 text-xs md:text-sm">No tasks yet. Add your first task above.</p>
                            </div>
                          ) : (
                            planner.map(task => (
                              <div 
                                key={task.id} 
                                className={`flex items-center justify-between p-2 md:p-3 border rounded-md ${
                                  task.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-center flex-1 min-w-0">
                                  <button
                                    onClick={() => toggleTaskCompletion(task.id)}
                                    className={`flex-shrink-0 h-4 w-4 md:h-5 md:w-5 rounded-full border ${
                                      task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                                    } mr-2 md:mr-3 flex items-center justify-center`}
                                  >
                                    {task.completed && <Check className="h-2 w-2 md:h-3 md:w-3 text-white" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs md:text-sm truncate ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                                      {task.text}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                      Added {formatDate(task.date)}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => deleteTask(task.id)}
                                  className="ml-2 text-gray-400 hover:text-red-500 flex-shrink-0"
                                >
                                  <X className="h-3 w-3 md:h-4 md:w-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Active Streaks */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden">
                      <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-800">Active Streaks</h3>
                        <Link to="/portfolio/streaks" className="text-orange-500 hover:text-orange-600 text-xs md:text-sm">View All</Link>
                      </div>
                      <div className="p-4 md:p-6 space-y-4">
                        {userStreaks.length > 0 ? (
                          userStreaks.map(streak => (
                            <div key={streak._id} className="flex">
                              <div className="mr-3 md:mr-4 flex-shrink-0">
                                <div className="h-12 w-12 md:h-14 md:w-14 rounded-lg bg-green-100 flex flex-col items-center justify-center">
                                  <span className="text-green-600 text-xs font-semibold">
                                    Day
                                  </span>
                                  <span className="text-green-600 text-base md:text-lg font-bold">
                                    {streak.currentStreak || 0}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs md:text-sm font-semibold text-gray-900">{streak.title || 'Streak'}</h4>
                                <p className="text-xs text-gray-500 mt-1">{streak.activity || ''}</p>
                                <div className="mt-2">
                                  <Link 
                                    to={`/portfolio/streaks/${streak._id}`}
                                    className="inline-block bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full"
                                  >
                                    Check In
                                  </Link>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 md:py-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 md:h-10 md:w-10 text-gray-300 mx-auto mb-2 md:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <p className="text-xs md:text-sm text-gray-500">No active streaks</p>
                            <Link 
                              to="/portfolio/streak/new" 
                              className="mt-2 text-orange-500 hover:text-orange-600 text-xs md:text-sm font-medium"
                            >
                              Start a Streak →
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeSection === 'network' && (
              <div className="bg-white rounded-xl shadow-md p-4 md:p-6">
                <div className="mb-6">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Your Network</h2>
                  <p className="text-sm text-gray-500">Connect with professionals in your field</p>
                </div>
                
                {/* Connection requests and nearby professionals - stack on mobile */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="bg-orange-50 rounded-xl p-4 md:p-6">
                    <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4">Connection Requests</h3>
                    {pendingRequests > 0 ? (
                      <div className="space-y-3 md:space-y-4">
                        {connectionRequests.map(request => (
                          <div key={request._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center mb-2 sm:mb-0">
                              <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg overflow-hidden bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl mr-3">
                                <img 
                                  src={getProfilePicture(request)} 
                                  alt={`${request?.firstName || 'User'} ${request?.lastName || ''}`} 
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div>
                                <h4 className="font-medium text-sm md:text-base">{request?.firstName || 'User'} {request?.lastName || ''}</h4>
                                <p className="text-xs md:text-sm text-gray-500">{request?.headline || 'Professional'}</p>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => handleAcceptConnection(request._id)}
                                className="bg-orange-500 text-white px-2 md:px-3 py-1 rounded-md text-xs md:text-sm"
                              >
                                Accept
                              </button>
                              <button 
                                onClick={() => handleDeclineConnection(request._id)}
                                className="bg-gray-200 text-gray-700 px-2 md:px-3 py-1 rounded-md text-xs md:text-sm"
                              >
                                Ignore
                              </button>
                            </div>
                          </div>
                        ))}
                        <Link to="/network" className="block w-full text-center text-orange-500 font-medium mt-4 text-sm">
                          View All Requests →
                        </Link>
                      </div>
                    ) : (
                      <div className="text-center py-4 md:py-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 md:h-10 md:w-10 text-gray-300 mx-auto mb-2 md:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <p className="text-sm text-gray-500">No pending requests</p>
                      </div>
                    )}
                  </div>
                
                  {/* Nearby Professionals Card */}
                  <div className="bg-white rounded-xl shadow-md p-3 md:p-6 mb-4">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 md:h-5 md:w-5 text-orange-500 mr-2" />
                        <h2 className="text-base md:text-xl font-semibold text-gray-800">Nearby Professionals</h2>
                      </div>
                      <Link to="/network/nearby" className="text-xs md:text-sm text-orange-500 hover:text-orange-600 flex items-center">
                        See All <ChevronRight className="h-3 w-3 md:h-4 md:w-4 ml-1" />
                      </Link>
                    </div>

                    {/* User Cards */}
                    {loadingState.nearby ? (
                      <div className="flex justify-center items-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                      </div>
                    ) : locationError ? (
                      <div className="bg-orange-50 rounded-xl p-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <AlertTriangle className="h-10 w-10 text-orange-500 mb-2" />
                          <h3 className="text-lg font-semibold text-gray-800 mb-1">Location Error</h3>
                          <p className="text-sm text-gray-600 mb-3">{locationError}</p>
                          <button
                            onClick={getUserLocation}
                            className="inline-flex items-center px-3 py-1.5 bg-orange-500 text-white rounded-md text-sm hover:bg-orange-600 transition-colors"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Try Again
                          </button>
                        </div>
                      </div>
                    ) : nearbyUsers.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4 md:gap-6">
                        {nearbyUsers.map(user => (
                          <div key={user._id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden">
                            <div className="flex items-start p-3 md:p-4">
                              {/* User image */}
                              <div className="mr-3 md:mr-4">
                                <div className="h-14 w-14 md:h-16 md:w-16 rounded-lg overflow-hidden bg-orange-100">
                                  <img 
                                    src={getProfilePicture(user)} 
                                    alt={`${user.firstName} ${user.lastName}`}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                              
                              {/* User details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <h3 className="text-base md:text-lg font-medium text-gray-900 truncate">
                                      {user.firstName} {user.lastName}
                                    </h3>
                                    <p className="text-xs md:text-sm text-gray-600 truncate">{user.headline || 'Professional'}</p>
                                  </div>
                                  
                                  {user.distance !== undefined && (
                                    <span className="mt-1 md:mt-0 text-xs text-gray-500 flex items-center md:ml-2">
                                      <MapPin className="h-3 w-3 mr-1" />
                                      {formatDistance(user.distance)}
                                    </span>
                                  )}
                                </div>
                                
                                {/* Industry and skills */}
                                {user.industry && (
                                  <div className="mt-1 text-xs text-gray-600">
                                    <span className="font-medium">Industry:</span> {user.industry}
                                  </div>
                                )}
                                
                                {user.skills && user.skills.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {user.skills.slice(0, 2).map((skill, index) => (
                                      <span key={index} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
                                        {typeof skill === 'string' ? skill : skill.name}
                                      </span>
                                    ))}
                                    {user.skills.length > 2 && (
                                      <span className="text-xs text-gray-500">+{user.skills.length - 2}</span>
                                    )}
                                  </div>
                                )}
                                
                                {/* Action buttons */}
                                <div className="mt-3 flex space-x-2">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleConnect(user._id);
                                    }}
                                    disabled={user.connectionStatus === 'pending' || user.connectionStatus === 'connected'}
                                    className={`flex items-center px-2 py-1 rounded text-xs md:text-sm ${
                                      user.connectionStatus === 'pending'
                                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                        : user.connectionStatus === 'connected'
                                          ? 'bg-green-100 text-green-700 cursor-not-allowed'
                                          : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                    }`}
                                  >
                                    <UserPlus className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                                    {user.connectionStatus === 'pending'
                                      ? 'Pending'
                                      : user.connectionStatus === 'connected'
                                        ? 'Connected'
                                        : 'Connect'}
                                  </button>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleFollow(user._id);
                                    }}
                                    className={`flex items-center px-2 py-1 rounded text-xs md:text-sm ${
                                      user.isFollowing
                                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                  >
                                    <Rss className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                                    {user.isFollowing ? 'Following' : 'Follow'}
                                  </button>
                                  
                                  <Link
                                    to={`/profile/${user._id}`}
                                    className="flex items-center px-2 py-1 rounded text-xs md:text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 ml-auto"
                                  >
                                    View Profile
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        <Link to="/network/nearby" className="block w-full text-center text-orange-500 font-medium mt-2 text-sm">
                          View All Nearby Professionals →
                        </Link>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-8 text-center">
                        <div className="inline-flex h-12 w-12 md:h-16 md:w-16 rounded-full bg-orange-100 items-center justify-center mb-3 md:mb-4">
                          <MapPin className="h-6 w-6 md:h-8 md:w-8 text-orange-600" />
                        </div>
                        <h3 className="text-base md:text-xl font-semibold text-gray-800 mb-1 md:mb-2">No Nearby Professionals</h3>
                        <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
                          {userLocation 
                            ? "We couldn't find any professionals near your current location." 
                            : "Please enable location services to see professionals near you."}
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-3">
                          <button 
                            onClick={getUserLocation}
                            className="inline-flex items-center justify-center px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Refresh Location
                          </button>
                          <Link
                            to="/network/nearby"
                            className="inline-flex items-center justify-center px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Explore Network
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'content' && (
              <div className="bg-white rounded-xl shadow-md p-3 md:p-6">
                <div className="mb-3 md:mb-6">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1 md:mb-2">Content Creation</h2>
                  <p className="text-xs md:text-sm text-gray-500">Share updates, insights, and connect with your network</p>
                </div>
                
                {/* CreatePost Component */}
                <div className="create-post-wrapper">
                  <CreatePost />
                </div>
                
                {/* Recent Posts Preview */}
                {recentPosts.length > 0 && (
                  <div className="mt-4 md:mt-8">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-base md:text-lg font-semibold text-gray-800">Your Recent Posts</h3>
                      <Link to="/posts" className="text-xs md:text-sm text-orange-500 hover:text-orange-600">
                        View All →
                      </Link>
                    </div>
                    
                    <div className="space-y-3 md:space-y-4">
                      {recentPosts.slice(0, 2).map(post => (
                        <div key={post._id} className="p-2 md:p-4 border border-gray-100 rounded-lg hover:bg-orange-50 transition-colors">
                          <div className="flex items-start">
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg overflow-hidden mr-2 md:mr-3 flex-shrink-0">
                              <img 
                                src={getProfilePicture(post.author || user)}
                                alt={`${post.author?.firstName || user?.firstName || 'User'}`}
                                className="h-full w-full object-cover" 
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-medium text-xs md:text-sm text-gray-900 truncate">
                                  {post.author?.firstName || user?.firstName || 'You'} {post.author?.lastName || user?.lastName || ''}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(post.createdAt)}
                                </p>
                              </div>
                              <p className="text-xs md:text-sm text-gray-700 mt-1 line-clamp-2">
                                {post.content}
                              </p>
                              
                              {post.images && post.images.length > 0 && (
                                <div className="mt-2">
                                  <div className="h-20 md:h-28 rounded-lg overflow-hidden">
                                    <img 
                                      src={post.images[0].url} 
                                      alt="Post media"
                                      className="h-full w-full object-cover" 
                                    />
                                  </div>
                                </div>
                              )}
                              
                              <div className="mt-2 flex items-center justify-between">
                                <div className="flex items-center space-x-3 text-xs text-gray-500">
                                  <div className="flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                    </svg>
                                    {post.likes || 0}
                                  </div>
                                  <div className="flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    {post.comments?.length || 0}
                                  </div>
                                </div>
                                <Link to={`/posts/${post._id}`} className="text-xs md:text-sm text-orange-500 hover:text-orange-600 font-medium">
                                  View Post
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recentPosts.length === 0 && (
                  <div className="mt-6 text-center bg-orange-50 py-8 px-4 rounded-xl">
                    <div className="inline-flex h-12 w-12 rounded-full bg-orange-100 items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Posts Yet</h3>
                    <p className="text-sm text-gray-600 mb-4">Share your thoughts, achievements, or insights with your professional network.</p>
                    <button
                      onClick={() => navigate('/posts/create')}
                      className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
                    >
                      Create Your First Post
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'portfolio' && (
              <div className="bg-white rounded-xl shadow-md p-4 md:p-6">
                <div className="mb-4 md:mb-6">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Your Portfolio</h2>
                  <p className="text-sm text-gray-500">Manage your projects, streaks, and achievements</p>
                </div>
                
                {/* Portfolio dashboard - stack on mobile */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Projects Section */}
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-semibold text-gray-900">Recent Projects</h3>
                    
                    {userProjects.length > 0 ? (
                      <div className="space-y-3 md:space-y-4">
                        {userProjects.map(project => (
                          <div key={project._id} className="p-3 md:p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow">
                            <h4 className="font-medium text-sm md:text-base text-gray-900">{project.title || 'Untitled Project'}</h4>
                            <p className="text-xs md:text-sm text-gray-600 mt-1">
                              {project.description?.length > 80
                                ? project.description.substring(0, 80) + '...' 
                                : project.description || 'No description available'}
                            </p>
                            <div className="mt-2 md:mt-3 flex justify-between items-center">
                              <Link 
                                to={`/portfolio/projects/${project._id}`}
                                className="text-orange-500 hover:text-orange-600 text-xs md:text-sm font-medium"
                              >
                                View Details
                              </Link>
                              <span className="text-xs text-gray-500">
                                {formatDate(project.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                        <Link to="/portfolio/projects" className="block text-center text-orange-500 font-medium pt-2 text-sm">
                          View All Projects →
                        </Link>
                      </div>
                    ) : (
                      <div className="text-center py-4 md:py-6">
                        <p className="text-xs md:text-sm text-gray-500">No projects yet</p>
                        <Link 
                          to="/portfolio/projects/new" 
                          className="mt-2 inline-block text-orange-500 hover:text-orange-600 text-xs md:text-sm font-medium"
                        >
                          Create Your First Project →
                        </Link>
                      </div>
                    )}
                  </div>
                  
                  {/* Achievements Section */}
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-semibold text-gray-900">Achievements</h3>
                    
                    {userAchievements.length > 0 ? (
                      <div className="space-y-3 md:space-y-4">
                        {userAchievements.map(achievement => (
                          <div key={achievement._id} className="p-3 md:p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow">
                            <div className="flex">
                              <div className="mr-3 flex-shrink-0">
                                <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                                  {achievement.image ? (
                                    <img 
                                      src={achievement.image} 
                                      alt={achievement.title || 'Achievement'}
                                      className="h-6 w-6 md:h-8 md:w-8 object-contain" 
                                    />
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium text-sm md:text-base text-gray-900">{achievement.title || 'Untitled Achievement'}</h4>
                                <p className="text-xs text-gray-500">{formatDate(achievement.dateAchieved)}</p>
                                <p className="text-xs md:text-sm text-gray-600 mt-1">
                                  {achievement.description?.length > 80
                                    ? achievement.description.substring(0, 80) + '...' 
                                    : achievement.description || 'No description available'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        <Link to="/portfolio/achievements" className="block text-center text-orange-500 font-medium pt-2 text-sm">
                          View All Achievements →
                        </Link>
                      </div>
                    ) : (
                      <div className="text-center py-4 md:py-6">
                        <p className="text-xs md:text-sm text-gray-500">No achievements yet</p>
                        <Link 
                          to="/portfolio/achievements/new" 
                          className="mt-2 inline-block text-orange-500 hover:text-orange-600 text-xs md:text-sm font-medium"
                        >
                          Add Your First Achievement →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Footer - Adjusted for mobile */}
          <footer className="bg-gradient-to-r from-orange-600 to-orange-700 text-white py-3 md:py-4 mt-6">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-xs md:text-sm">© 2023 Meetkats • Privacy Policy • Terms of Service</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
