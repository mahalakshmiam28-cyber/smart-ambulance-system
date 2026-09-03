# Smart Ambulance System

A web application for coordinating emergency response, ambulance dispatch, driver directions, hospital recommendations, and administrative operations.

## Features

- Emergency request and ambulance dispatch workflow
- Hospital discovery and recommendation based on emergency needs
- Driver-facing route directions
- Admin dashboard and protected admin login
- MySQL-backed application data
- Optional routing, hospital, and AI service integrations

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- MySQL 8 or later

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file from the example:

   ```bash
   copy .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env` instead.

3. Update `.env` with your MySQL credentials. At minimum, configure `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Change `ADMIN_CONSOLE_PASSWORD` to a secure value.

4. Create the database schema:

   ```bash
   mysql -u root -p < setup.sql
   ```

5. Start the application:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in a browser.

## Configuration

All configuration values are documented in `.env.example`. They include:

- MySQL connection settings
- OpenStreetMap/Nominatim and Overpass endpoints for hospital lookup
- OSRM, OpenRouteService, or GraphHopper routing
- An optional OpenAI-compatible API for AI functionality
- Admin console password

Never commit your `.env` file or API keys. The repository ignores these files by default.

## Project structure

| Path | Purpose |
| --- | --- |
| `server.js` | Express server and application API |
| `index.html`, `main.js`, `style.css` | Main user interface |
| `admin.html`, `admin.js` | Administrative dashboard |
| `admin-login.html`, `admin-login.js` | Admin authentication interface |
| `driver-directions.js` | Driver routing experience |
| `setup.sql` | MySQL database schema |
| `.env.example` | Environment variable template |

## Security note

This project is intended for development and demonstration. Before deploying it for real emergency operations, use production-grade authentication, secure session storage, secret management, validation, audit logging, monitoring, and applicable healthcare/privacy safeguards.
