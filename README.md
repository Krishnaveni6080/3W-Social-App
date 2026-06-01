# 3W Mini Social Post Application

Full-stack social feed assignment inspired by TaskPlanet's social page. Users can sign up, log in, create text/image posts, view a public feed, like posts, and comment on posts.

## Project Structure

- `frontend/` - React + Vite app with basic CSS
- `backend/` - Node.js + Express + MongoDB API

## Features

- Email/password signup and login
- MongoDB users collection
- MongoDB posts collection with embedded likes and comments
- Text-only, image-only, or mixed posts
- Public paginated feed
- Feed filters for all posts, my posts, and commented posts
- Like toggle with liked usernames saved
- Comments with commenter usernames saved
- Delete option for posts created by the logged-in user
- Refresh action to reload the latest feed data
- Responsive layout for desktop and mobile

## Local Setup

1. Install frontend dependencies:

```bash
cd frontend
npm install
```

2. Install backend dependencies:

```bash
cd ../backend
npm install
```

3. Create `backend/.env` from `backend/.env.example` and set:

```bash
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_long_random_secret
CLIENT_ORIGIN=http://localhost:5173
```

4. Create `frontend/.env` from `frontend/.env.example`:

```bash
VITE_API_URL=http://localhost:5000/api
```

5. Start the backend:

```bash
cd backend
npm run dev
```

6. Start the frontend:

```bash
cd frontend
npm run dev
```

7. Open the app:

```text
http://localhost:5173
```

The backend health route is:

```text
http://localhost:5000/api/health
```

## Deployment

- Frontend: deploy `frontend/` to Vercel or Netlify and set `VITE_API_URL` to the Render backend URL plus `/api`.
- Backend: deploy `backend/` to Render and set `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN`.
- Database: use MongoDB Atlas. The app uses only `users` and `posts` collections.

## Live URLs

- Frontend: `https://3-w-social-app-delta.vercel.app/`
- Backend: `https://threew-social-app-3t21.onrender.com`
- Backend health check: `https://threew-social-app-3t21.onrender.com/api/health`
