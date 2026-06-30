# CodeAlpha Project Workspace (Task 3: Collaborative Project Management Tool)

A premium, high-performance, collaborative Kanban project management application (inspired by Trello and Asana) built with **React**, **Express/Node.js**, **Socket.io**, and **PostgreSQL**.

The design implements the **Stealth Platinum & Ice Blue (Stealth Wealth & Tech Luxury)** visual style. It features:
- Deep obsidian and charcoal background contrasts.
- Delicate glassmorphic borders with radial light flows.
- Ice-blue glow states for key interactions.
- Smooth, butter-feel UI transitions and slide animations.
- Real-time updates via WebSockets for project actions (task creation, updates, column movements, and comments thread sync).

---

## 🛠️ Stack & Technologies Used

- **Frontend**: React (Vite SPA template) + Custom Vanilla CSS (Design Tokens, variables, and responsive layout).
- **Backend**: Node.js & Express.js + Socket.IO for WebSocket events.
- **Database**: PostgreSQL (Auto-schema initialization via `pg` node pool).
- **Security**: Password hashing with `bcryptjs` and Session JWT tokens.

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed (v18+ recommended)
- PostgreSQL database instance running.

---

### Step 1: Database Setup
1. Create a new database in your local PostgreSQL engine:
   ```sql
   CREATE DATABASE codealpha_project_management;
   ```

2. Make sure the database connection URL is ready. The default connection string used is:
   `postgresql://postgres:postgres@localhost:5432/codealpha_project_management`

---

### Step 2: Configure & Launch Backend
1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create a `.env` file if you need to modify the default credentials:
   ```env
   PORT=5000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/codealpha_project_management
   JWT_SECRET=luxury_stealth_wealth_secret_key_123
   NODE_ENV=development
   ```

3. Install dependencies and start the backend service:
   ```bash
   npm install
   npm run start
   ```
   *The backend will automatically migrate and create all tables (`users`, `projects`, `project_members`, `tasks`, and `comments`) upon starting.*

---

### Step 3: Configure & Launch Frontend
1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the Vite development server:
   ```bash
   npm run dev
   ```

4. Open the displayed local URL in your browser (e.g., `http://localhost:5173`).

---

## 💎 Design Highlights

- **Stealth Luxury Color Accents**: Uses premium styling including `--color-ice-blue` (`#38BDF8`) and `--card-bg` gloss styling.
- **Micro-Animations**: Hover-triggered glass transformations, smooth drag transitions, and sleek floating modals.
- **Real-Time Workspace Activity Log**: Real-time slide-in notifications inside the activity log bell whenever collaborative users make edits or updates.
