# FlowTrace Production Deployment Reference

This document describes the exact build, run, and configuration setup required to run FlowTrace in production on **Vercel** (Frontend) and **Render** (Backend) connected to **MongoDB Atlas**.

---

## Architecture Overview

```text
User
 ↓
Vercel (React + Vite static client)
 ↓
Render (Express Backend API)
 ↓
MongoDB Atlas (Cloud database)
```

---

## 1. Render Deployment (Backend API)

The backend Express server should be deployed as a **Web Service** on Render.

* **Repository Root Directory:** `.` (Repository root)
* **Runtime:** `Node`
* **Build Command:** `pnpm install && pnpm run build`
* **Start Command:** `node dist/server/server/index.js`
* **Environment Variables:**
  * `PORT`: `3001` (Render automatically exposes this)
  * `MONGODB_URI`: `mongodb+srv://<username>:<password>@cluster.mongodb.net/...` (Your Atlas Replica Set / URI string)
  * `MONGODB_DB`: `flowtrace`
  * `CLIENT_URL`: `https://your-frontend-app.vercel.app` (The URL of your deployed Vercel frontend)
  * `LLM_ENABLED`: `false`

---

## 2. Vercel Deployment (Frontend Client)

The React client should be deployed on Vercel.

* **Framework Preset:** `Vite`
* **Root Directory:** `client`
* **Build Command:** `vite build`
* **Output Directory:** `dist`
* **Environment Variables:**
  * `VITE_API_URL`: `https://your-backend-app.onrender.com` (Your Render API URL)

---

## 3. MongoDB Atlas Configuration

* **Database Connection:** Use the connection string provided in your Atlas dashboard.
* **Network Access:** Ensure that Render's outgoing IPs can access your MongoDB Atlas database. You can allow access from anywhere (`0.0.0.0/0`) in your Atlas Network Access settings or use static outgoing IPs if on a paid Render tier.
* **Security:** Never commit your production `MONGODB_URI` containing credentials. Only define it inside Render's environment variables dashboard.
