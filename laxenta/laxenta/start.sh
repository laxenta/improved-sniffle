#!/bin/bash

# Function to compare version numbers using sort -V
version_ge() {
  [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

echo "🔧 Checking for existing ngrok binary..."
if [ -f "./ngrok" ]; then
    echo "✅ Ngrok binary already exists, skipping download."
else
    echo "🔑 Installing Ngrok v3..."
    curl -LO https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
    if [ $? -eq 0 ]; then
        tar -xvzf ngrok-v3-stable-linux-amd64.tgz
        rm ngrok-v3-stable-linux-amd64.tgz
        chmod +x ./ngrok
        echo "✅ Ngrok installed successfully."
    else
        echo "❌ Failed to download Ngrok. Check your internet connection."
        exit 1
    fi
fi

# Check the version to confirm proper installation
CURRENT_VERSION=$(./ngrok --version | awk '{print $2}')
echo "✅ Ngrok installed! Version: $CURRENT_VERSION"

# Set up configuration directory
mkdir -p "$HOME/.config/ngrok"
NGROK_CONFIG="$HOME/.config/ngrok/ngrok.yml"

# Set Ngrok Auth Token directly in the new config file format (v3)
NGROK_TOKEN="2rk9L3sxilpiAOapmqiRt2s6wbF_4McC9BrZhTUL6UX4qw6CK"
if ./ngrok config check > /dev/null 2>&1; then
    echo "✅ Ngrok Auth Token already set, skipping configuration."
else
    echo "🔑 Setting Ngrok Auth Token..."
    ./ngrok config add-authtoken "$NGROK_TOKEN"
    echo "✅ Ngrok Auth Token set!"
fi

# Export NGROK_BIN so that Node.js code can find our binary
export NGROK_BIN="$(pwd)/ngrok"
echo "🔗 NGROK_BIN set to: $NGROK_BIN"

# Set environment variables for the application
export NGROK_AUTH_TOKEN="2rk9L3sxilpiAOapmqiRt2s6wbF_4McC9BrZhTUL6UX4qw6CK"
export NGROK_URL="https://logically-inspired-chipmunk.ngrok-free.app"

# Configure ngrok with static domain
echo "🔧 Configuring ngrok static domain..."
./ngrok config add-authtoken "$NGROK_AUTH_TOKEN"
./ngrok config verify

# Start ngrok in the background with the static domain
# # Start ngrok in the background and silence the output
./ngrok http 3000 --domain=logically-inspired-chipmunk.ngrok-free.app > ngrok.log 2>&1 &
# > ngrok.log 2>&1 &

# Wait for ngrok to start
sleep 5

# Install FFmpeg if not present or not executable
if ! command -v ./ffmpeg &> /dev/null; then
    echo "🎵 FFmpeg not found, installing..."
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
    tar -xJf ffmpeg.tar.xz --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
    rm -f ffmpeg.tar.xz
    chmod +x ffmpeg ffprobe
    echo "✅ FFmpeg installed successfully."
else
    echo "✅ FFmpeg already exists, ensuring it's executable..."
    chmod +x ffmpeg
fi

# Export the FFmpeg path
export FFMPEG_PATH="$(pwd)/ffmpeg"
echo "🎵 FFmpeg path set to: $FFMPEG_PATH"

# Install required packages
# pnpm install express ejs spotify-web-api-node ngrok --save

echo "🚀 Starting application..."
# Start the bot and webserver in the background
node index.js &
echo "✨ All systems go!"
# Keep the container alive
wait
