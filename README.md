# Nuxt Scoreboard Test

A Nuxt.js frontend application for displaying live and historical roller derby game data from the [CRG Scoreboard](https://github.com/rollerderby/scoreboard) application.

> **Note:** Part of this codebase was generated with the assistance of AI.


## Features

- **Live Game Display**: Real-time score updates via WebSocket connection
  - Current period and jam information
  - Period clock with time remaining
  - Team names and scores

- **Game History**: Browse and view detailed information about completed games
  - Team rosters with skater names, numbers, and penalty counts
  - Jam-by-jam breakdown with scores and cumulative totals
  - Jammer information (name, roster number, lead status)
  - Game statistics with visual charts (WIP)

## Tech Stack

- **Nuxt 4** - Vue.js framework with SSR support
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **nuxt-charts** (Unovis) - Data visualization
- **WebSocket** - Real-time data connection

## Prerequisites

- Node.js (v18 or higher)
- Access to a running CRG Scoreboard instance

## Configuration

The application connects to a scoreboard instance via WebSocket and HTTP. Default configuration:

- **WebSocket URL**: `ws://192.168.1.144:8000/WS/`
- **HTTP API Base URL**: `http://192.168.1.144:8000/`

These can be configured per component via props or updated in the component defaults.

## WebSocket Gateway

For production deployments with many concurrent clients, a WebSocket gateway is available to handle client connections efficiently. The gateway maintains a single connection to the scoreboard and broadcasts updates to all connected clients, significantly improving scalability. See [`gateway/README.md`](gateway/README.md) for setup and usage instructions.
