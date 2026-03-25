#!/bin/bash
set -e

REPO_URL="https://github.com/revul93/n8netwatch.git"
REPO_DIR="n8netwatch"

echo "=================================="
echo "  n8netwatch — Installer"
echo "=================================="

if ! command -v git &> /dev/null; then
    echo "ERROR: git is not installed. Please install git and try again."
    exit 1
fi

if [ -d "$REPO_DIR" ]; then
    echo "Directory '$REPO_DIR' already exists. Pulling latest changes..."
    cd "$REPO_DIR"
    git pull
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

echo "Making setup.sh executable..."
chmod +x setup.sh

echo "Running setup.sh..."
echo ""
bash setup.sh
