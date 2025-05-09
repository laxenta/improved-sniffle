<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title><%= botName %> - Ultimate Discord Music Experience</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --spotify-green: #1DB954;
            --spotify-dark: #1aa34a;
            --discord-blue: #5865F2;
            --discord-purple: #7289DA;
            --dark-bg: #23272A;
            --darker-bg: #1a1d20;
            --text-primary: #ffffff;
            --text-secondary: #b9bbbe;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--dark-bg);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
        }

        /* Background Animation */
        .bg-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            opacity: 0.4;
        }

        .bg-animation span {
            position: absolute;
            display: block;
            width: 20px;
            height: 20px;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(29, 185, 84, 0.7), 0 0 20px rgba(29, 185, 84, 0.5), 0 0 30px rgba(29, 185, 84, 0.3);
            animation: float 15s linear infinite;
        }

        @keyframes float {
            0% {
                transform: translateY(100vh) translateX(0) scale(0);
                opacity: 0;
            }
            10% {
                opacity: 1;
            }
            90% {
                opacity: 1;
            }
            100% {
                transform: translateY(-100vh) translateX(100px) scale(1);
                opacity: 0;
            }
        }

        .navbar {
            background: rgba(26, 29, 32, 0.95);
            backdrop-filter: blur(10px);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: fixed;
            width: 100%;
            top: 0;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .navbar-brand {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .brand-logo {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid var(--spotify-green);
        }

        .brand-name {
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .navbar-links {
            display: flex;
            gap: 1.5rem;
        }

        .navbar-links a {
            color: var(--text-secondary);
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .navbar-links a:hover {
            color: var(--text-primary);
        }

        .user-profile {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            background: rgba(255, 255, 255, 0.05);
            padding: 0.5rem 1rem;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .user-profile:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid var(--discord-purple);
        }

        .discord-tag {
            font-weight: 500;
            font-size: 0.9rem;
        }

        .main-content {
            margin-top: 80px;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: calc(100vh - 80px);
        }

        .hero-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-bottom: 3rem;
            max-width: 800px;
        }

        .bot-avatar {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            margin-bottom: 1.5rem;
            border: 4px solid var(--spotify-green);
            box-shadow: 0 0 30px rgba(29, 185, 84, 0.4);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 20px rgba(29, 185, 84, 0.4); }
            50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(29, 185, 84, 0.6); }
            100% { transform: scale(1); box-shadow: 0 0 20px rgba(29, 185, 84, 0.4); }
        }

        .bot-title {
            font-size: 3.5rem;
            margin: 1rem 0;
            font-weight: 800;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: fadeIn 1s ease-out;
        }

        .bot-subtitle {
            font-size: 1.2rem;
            color: var(--text-secondary);
            margin-bottom: 1.5rem;
            max-width: 600px;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.1);
            padding: 0.5rem 1rem;
            border-radius: 50px;
            margin-bottom: 2rem;
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: var(--spotify-green);
            position: relative;
        }

        .status-dot::after {
            content: '';
            position: absolute;
            top: -5px;
            left: -5px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: var(--spotify-green);
            opacity: 0.3;
            animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        @keyframes ping {
            0% { transform: scale(1); opacity: 0.3; }
            75%, 100% { transform: scale(2); opacity: 0; }
        }

        .status-text {
            font-size: 0.9rem;
            font-weight: 500;
        }

        .stats-container {
            display: flex;
            gap: 1.5rem;
            margin-bottom: 3rem;
            flex-wrap: wrap;
            justify-content: center;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 1.5rem;
            border-radius: 15px;
            min-width: 200px;
            text-align: center;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .stat-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin: 2rem 0;
            width: 100%;
            max-width: 1200px;
        }

        .feature {
            background: rgba(26, 29, 32, 0.7);
            padding: 2rem;
            border-radius: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.05);
            position: relative;
            overflow: hidden;
            z-index: 1;
        }

        .feature::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, var(--spotify-green), var(--discord-blue));
            opacity: 0;
            z-index: -1;
            transition: opacity 0.3s ease;
        }

        .feature:hover {
            transform: translateY(-7px);
            border-color: rgba(255, 255, 255, 0.1);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        }

        .feature:hover::before {
            opacity: 0.1;
        }

        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 1.5rem;
            color: var(--spotify-green);
            display: inline-block;
            position: relative;
        }

        .feature-icon i {
            position: relative;
            z-index: 2;
        }

        .feature-icon::after {
            content: '';
            position: absolute;
            width: 50px;
            height: 50px;
            background: rgba(29, 185, 84, 0.1);
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 1;
        }

        .feature h3 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            position: relative;
            display: inline-block;
        }

        .feature p {
            color: var(--text-secondary);
            line-height: 1.6;
        }

        .now-playing {
            background: rgba(26, 29, 32, 0.9);
            border-radius: 15px;
            padding: 1.5rem;
            max-width: 500px;
            width: 90%;
            margin: 3rem auto;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .now-playing-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .now-playing-title {
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .now-playing-badge {
            background: rgba(29, 185, 84, 0.2);
            color: var(--spotify-green);
            padding: 0.25rem 0.5rem;
            border-radius: 50px;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .song-info {
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        .song-cover {
            width: 60px;
            height: 60px;
            border-radius: 10px;
            object-fit: cover;
        }

        .song-details {
            flex: 1;
        }

        .song-name {
            font-weight: 600;
            margin-bottom: 0.25rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .song-artist {
            color: var(--text-secondary);
            font-size: 0.9rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .player-controls {
            display: flex;
            justify-content: center;
            gap: 1rem;
            border-radius: 5px;
            margin: 0.5rem 0;
            position: relative;
        }

        .server-list {
            width: 100%;
            max-width: 1000px;
            margin: 3rem auto;
        }

        .server-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .server-list-title {
            font-size: 1.8rem;
            font-weight: 700;
        }

        .server-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1.5rem;
        }

        .server-card {
            background: rgba(26, 29, 32, 0.7);
            border-radius: 15px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .server-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .server-banner {
            height: 80px;
            background: linear-gradient(45deg, var(--discord-blue), var(--discord-purple));
            position: relative;
        }

        .server-icon {
            width: 60px;
            height: 60px;
            border-radius: 15px;
            border: 4px solid var(--darker-bg);
            position: absolute;
            bottom: -30px;
            left: 20px;
            background-color: var(--darker-bg);
        }

        .server-info {
            padding: 2rem 1.5rem 1.5rem;
        }

        .server-name {
            font-weight: 600;
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
        }

        .server-meta {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .server-meta-item {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            color: var(--text-secondary);
            font-size: 0.85rem;
        }

        .server-status {
            padding-top: 0.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.85rem;
        }

        .cta-section {
            margin: 4rem 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            background: rgba(26, 29, 32, 0.7);
            padding: 3rem;
            border-radius: 20px;
            max-width: 900px;
            position: relative;
            overflow: hidden;
        }

        .cta-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, var(--spotify-green), var(--discord-blue));
            opacity: 0.05;
            z-index: -1;
        }

        .cta-title {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 1rem;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .cta-description {
            max-width: 600px;
            margin-bottom: 2rem;
            color: var(--text-secondary);
            line-height: 1.6;
        }

        .button-group {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
        }

        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 2rem;
            background: var(--spotify-green);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }

        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 7px 20px rgba(29, 185, 84, 0.4);
            background: var(--spotify-dark);
        }

        .cta-button.secondary {
            background: rgba(255, 255, 255, 0.1);
        }

        .cta-button.secondary:hover {
            background: rgba(255, 255, 255, 0.15);
            box-shadow: 0 7px 20px rgba(0, 0, 0, 0.2);
        }

        .footer {
            background: var(--darker-bg);
            padding: 3rem 2rem;
            margin-top: auto;
        }

        .footer-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1200px;
            margin: 0 auto;
            flex-wrap: wrap;
            gap: 2rem;
        }

        .footer-brand {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .footer-logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .footer-brand-text {
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(45deg, var(--spotify-green), var(--discord-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .footer-description {
            max-width: 300px;
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.6;
        }

        .footer-links {
            display: flex;
            gap: 3rem;
        }

        .footer-links-column {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .footer-links-title {
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        .footer-link {
            color: var(--text-secondary);
            text-decoration: none;
            transition: color 0.2s ease;
            font-size: 0.9rem;
        }

        .footer-link:hover {
            color: var(--text-primary);
        }

        .social-links {
            display: flex;
            gap: 1rem;
        }

        .social-link {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-secondary);
            transition: all 0.3s ease;
        }

        .social-link:hover {
            background: var(--spotify-green);
            color: white;
            transform: translateY(-3px);
        }

        .copyright {
            margin-top: 3rem;
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.8rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Media Queries */
        @media (max-width: 768px) {
            .navbar {
                padding: 1rem;
            }

            .navbar-links {
                display: none;
            }

            .bot-title {
                font-size: 2.5rem;
            }

            .feature-grid {
                grid-template-columns: 1fr;
            }

            .server-grid {
                grid-template-columns: 1fr;
            }

            .footer-content {
                flex-direction: column;
                align-items: flex-start;
            }

            .footer-links {
                flex-direction: column;
                gap: 2rem;
            }
        }

        /* Animations for elements */
        .animate-fadeInUp {
            animation: fadeInUp 0.8s ease forwards;
            opacity: 0;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }
        .delay-5 { animation-delay: 0.5s; }

        /* Remove these style blocks */
        .progress-container,
        .progress-bar,
        .time-info {
            display: none;
        }

        .user-dropdown {
            position: relative;
            display: inline-block;
        }

        .dropdown-menu {
            display: none;
            position: absolute;
            right: 0;
            top: 100%;
            background: var(--darker-bg);
            border-radius: 10px;
            padding: 0.5rem;
            min-width: 200px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.05);
            z-index: 1000;
        }

        .user-dropdown:hover .dropdown-menu {
            display: block;
        }

        .dropdown-menu a {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            color: var(--text-secondary);
            text-decoration: none;
            transition: all 0.2s ease;
        }

        .dropdown-menu a:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
        }

        .logout-btn {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            margin-top: 0.5rem;
            color: #ff4444 !important;
        }

        .login-button {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--discord-blue);
            color: white;
            padding: 0.5rem 1.5rem;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .login-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(88, 101, 242, 0.4);
        }

        .spotify-link {
            color: var(--spotify-green) !important;
        }
    </style>
</head>
<body>
    <!-- Background Animation -->
    <div class="bg-animation">
        <span style="top: 15%; left: 10%; animation-duration: 20s; width: 15px; height: 15px;"></span>
        <span style="top: 30%; left: 25%; animation-duration: 18s; animation-delay: 2s; width: 25px; height: 25px;"></span>
        <span style="top: 60%; left: 40%; animation-duration: 16s; animation-delay: 4s; width: 20px; height: 20px;"></span>
        <span style="top: 40%; left: 65%; animation-duration: 22s; animation-delay: 1s; width: 18px; height: 18px;"></span>
        <span style="top: 75%; left: 80%; animation-duration: 19s; animation-delay: 3s; width: 22px; height: 22px;"></span>
        <span style="top: 85%; left: 15%; animation-duration: 21s; animation-delay: 5s; width: 15px; height: 15px;"></span>
        <span style="top: 20%; left: 85%; animation-duration: 17s; animation-delay: 6s; width: 17px; height: 17px;"></span>
        <span style="top: 50%; left: 50%; animation-duration: 23s; animation-delay: 7s; width: 23px; height: 23px;"></span>
</div>
    
    <!-- Navigation Bar -->

    <!-- Navigation Bar -->
<nav class="navbar">
    <div class="navbar-brand">
        <img src="<%= botAvatar %>" alt="Bot Logo" class="brand-logo">
        <span class="brand-name"><%= botName %></span>
    </div>
    <div class="navbar-links">
        <!-- <a href="/commands"><i class="fas fa-terminal"></i> Commands</a> -->
        <a href="/support"><i class="fas fa-headset"></i> Support</a>
        <% if (isAuthenticated) { %>
            <a href="/dashboard"><i class="fas fa-chart-line"></i> Dashboard</a>
            <% 
            <!-- // Check if user has Spotify connected in current session -->
            const hasSpotifySession = user.sessions && 
                user.sessions.some(s => s.sessionId === sessionID && s.spotify);
            if (!hasSpotifySession) { 
            %>
                <a href="/auth/spotify?returnTo=<%= originalUrl %>" class="spotify-link">
                    <i class="fab fa-spotify"></i> Connect Spotify
                </a>
            <% } %>
        <% } %>
    </div>
    <% if (isAuthenticated) { %>
        <div class="user-dropdown">
            <div class="user-profile">
                <img src="<%= user.avatarURL %>" 
                     alt="User Avatar" class="user-avatar">
                <span class="discord-tag"><%= user.username %></span>
            </div>
            <div class="dropdown-menu">
                <a href="/dashboard"><i class="fas fa-home"></i> Dashboard</a>
                <a href="/profile"><i class="fas fa-user"></i> Profile</a>
                <% 
                <!-- // Check if user has Spotify connected in current session -->
                const hasSpotifySession = user.sessions && 
                    user.sessions.some(s => s.sessionId === sessionID && s.spotify);
                if (hasSpotifySession) { 
                %>
                    <a href="/spotify"><i class="fab fa-spotify"></i> Spotify Settings</a>
                    <a href="#" class="disconnect-spotify" data-action="/api/spotify/disconnect">
                        <i class="fab fa-spotify"></i> Disconnect Spotify
                    </a>
                <% } %>
                <form action="/logout" method="post" class="logout-form">
                    <button type="submit" class="logout-btn">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </form>
            </div>
        </div>
    <% } else { %>
        <a href="/auth/discord?returnTo=<%= originalUrl %>" class="login-button">
            <i class="fab fa-discord"></i>
            Login with Discord
        </a>
    <% } %>
</nav>

<!-- Main Content -->
<main class="main-content">
    <!-- Hero Section -->
    <section class="hero-section animate-fadeInUp">
        <img src="<%= botAvatar %>" alt="Bot Avatar" class="bot-avatar">
        <h1 class="bot-title"><%= botName %></h1>
        <p class="bot-subtitle">Experience high-quality music with Spotify integration, advanced queue management, and seamless Discord integration.</p>
        
        <div class="status-indicator animate-fadeInUp delay-1">
            <div class="status-dot"></div>
            <span class="status-text">Online and serving <%= stats.servers %> servers</span>
        </div>
        
        <div class="stats-container animate-fadeInUp delay-2">
            <div class="stat-card">
                <div class="stat-value"><%= stats.servers %></div>
                <div class="stat-label">Active Servers</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><%= stats.users %></div>
                <div class="stat-label">Users Listening Music rn</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><%= stats.songsPlayed %></div>
                <div class="stat-label">Songs Played</div>
            </div>
        </div>
    </section>

    <% if (nowPlaying && nowPlaying.length > 0) { %>
        <section class="now-playing animate-fadeInUp delay-3">
            <div class="now-playing-header">
                <div class="now-playing-title">
                    <i class="fas fa-music"></i>
                    Currently Playing
                </div>
                <div class="now-playing-badge">Live</div>
            </div>
            <div class="song-info">
                <img src="<%= nowPlaying[0].thumbnail %>" alt="Song Cover" class="song-cover">
                <div class="song-details">
                    <div class="song-name"><%= nowPlaying[0].title %></div>
                    <div class="song-artist">Playing in <%= nowPlaying[0].guildName %></div>
                </div>
            </div>
        </section>
    <% } %>


    <!-- Features Grid -->
    <section class="feature-grid animate-fadeInUp delay-4">
        <div class="feature">
            <div class="feature-icon">
                <i class="fab fa-spotify"></i>
            </div>
            <h3>Spotify Integration</h3>
            <p>Play your favorite Spotify tracks and playlists directly in Discord with high-quality audio.</p>
        </div>
        <div class="feature">
            <div class="feature-icon">
                <i class="fas fa-list"></i>
            </div>
            <h3>Advanced Queue</h3>
            <p>Manage your music queue with ease. Add, remove, and reorder songs on the fly.</p>
        </div>
        <div class="feature">
            <div class="feature-icon">
                <i class="fas fa-bolt"></i>
            </div>
            <h3>Fast & Reliable</h3>
            <p>Experience seamless music playback with minimal latency and buffer-free streaming.</p>
        </div>
    </section>

    <!-- Call to Action -->
    <section class="cta-section animate-fadeInUp delay-5">
        <h2 class="cta-title">Ready to enhance your server?</h2>
        <p class="cta-description">Add <%= botName %> to your Discord server and start enjoying general/mod/music/nsfw features today!</p>
        <div class="button-group">
            <a href="https://discord.com/oauth2/authorize?client_id=<%= clientId %>&permissions=1118435113046&scope=bot%20applications.commands" class="cta-button" target="_blank">
                <i class="fas fa-plus"></i>
                Add to Discord?
            </a>
            <a href="https://discord.gg/9emnU25HaY" class="cta-button secondary" target="_blank">
                <i class="fas fa-headset"></i>
                Join Dev Server?
            </a>
        </div>
    </section>
</main>

<!-- Footer -->
<footer class="footer">
    <div class="footer-content">
        <div class="footer-brand">
            <div class="footer-logo">
                <img src="<%= botAvatar %>" alt="Bot Logo" class="brand-logo">
                <span class="footer-brand-text"><%= botName %></span>
            </div>
            <p class="footer-description">Elevating your Discord music experience with (free) Premium features and high-quality audio.</p>
            <div class="social-links">
                <a href="#" class="social-link"><i class="fab fa-discord"></i></a>
                <a href="#" class="social-link"><i class="fab fa-github"></i></a>
                <a href="#" class="social-link"><i class="fab fa-twitter"></i></a>
            </div>
        </div>
        <div class="footer-links">
            <div class="footer-links-column">
                <h4 class="footer-links-title">Product</h4>
                <a href="#" class="footer-link">Features</a>
                <a href="#" class="footer-link">Commands</a>
                <a href="#" class="footer-link">Premium</a>
            </div>
            <div class="footer-links-column">
                <h4 class="footer-links-title">Support</h4>
                <a href="#" class="footer-link">Documentation</a>
                <a href="#" class="footer-link">FAQ</a>
                <a href="#" class="footer-link">Contact</a>
            </div>
            <div class="footer-links-column">
                <h4 class="footer-links-title">Legal</h4>
                <a href="#" class="footer-link">Privacy Policy</a>
                <a href="#" class="footer-link">Terms of Service</a>
                <a href="#" class="footer-link">Cookie Policy</a>
            </div>
        </div>
    </div>
    <div class="copyright">
        &copy; <%= new Date().getFullYear() %> <%= botName %>. All rights reserved.
    </div>
</footer>


    <script>

document.addEventListener('DOMContentLoaded', function() {
        // Handle logout form submission
        const logoutForm = document.querySelector('.logout-form');
        if (logoutForm) {
            logoutForm.addEventListener('submit', function(e) {
                e.preventDefault();
                fetch('/logout', {
                    method: 'POST',
                    credentials: 'same-origin'
                }).then(() => {
                    window.location.href = '/';
                });
            });
        }
        
        // Handle Spotify disconnect
        const disconnectBtn = document.querySelector('.disconnect-spotify');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const url = this.getAttribute('data-action');
                fetch(url, {
                    method: 'POST',
                    credentials: 'same-origin'
                }).then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload();
                    }
                });
            });
        }
    });
    </script>
</body>
</html>