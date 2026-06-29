# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend

# Install dependencies (cached layer – won't change unless package files change)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy only the necessary source files (no node_modules from host)
COPY frontend/index.html .
COPY frontend/vite.config.ts .
COPY frontend/tsconfig.json .
COPY frontend/src ./src
# If you have a 'public' folder, uncomment the next line:
# COPY frontend/public ./public

RUN npm run build

# Stage 2: Production Python backend with frontend served statically
FROM python:3.11-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy the built frontend into the backend's static folder
COPY --from=frontend-build /app/frontend/dist ./dist

# Create a persistent data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]