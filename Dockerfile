# Use official Python 3.12 slim image
FROM python:3.12-slim

# Install system dependencies needed for spatial libraries (geopandas, rasterio, reportlab, postgis client)
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy dependency list and install Python packages
COPY requirements.txt .

# Upgrade pip to prevent resolver issues
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code into container
COPY . .

# Expose port 80 for production deployment
EXPOSE 80

# Command to run the FastApi application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80", "--proxy-headers"]
