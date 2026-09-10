# VoxShield AI — Production Cloud Deployment Guide

This guide provides the exact step-by-step instructions to deploy **VoxShield AI** live on the cloud, connect your physical laptop agent, and share the link with friends safely.

---

## Architecture Overview

```
 [ Friend's Laptop ] ──┐
                       ├──> [ Vercel Frontend ] ──> [ Render Backend (FastAPI) ]
 [ Poorna's Browser ] ─┘                                     │
                                                             │ (Polls every 2s & Heartbeats)
                                                             ▼
                                                [ Poorna's Physical Laptop Agent ]
```

---

## Step 1: Deploy Backend to Render (Free & 2 Minutes)

1. Go to **[render.com](https://render.com)** and sign in with your GitHub account.
2. Click **New +** at the top-right and select **Web Service**.
3. Choose your repository: **`addusupalipoorna-pc/voxshield-ai`**.
4. Configure the deployment settings:
   - **Name**: `voxshield-backend`
   - **Region**: Oregon (US West) or Frankfurt (EU)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. Click **Advanced** and add the following **Environment Variables**:
   | Key | Value |
   | --- | --- |
   | `APP_ENV` | `production` |
   | `DATABASE_URL` | `sqlite:///./voxshield.db` |
   | `SECRET_KEY` | `voxshield-super-secret-key-2024-secure` |
   | `APPROVAL_SECRET` | `voxshield-approval-key-prod-2024` |
   | `AGENT_API_TOKEN` | `INSECURE-AGENT-TOKEN` |
   | `BACKEND_CORS_ORIGINS` | `*` |
6. Click **Deploy Web Service**.
7. Wait 1–2 minutes for the build to finish. Once live, Render will give you a public URL, for example:
   👉 `https://voxshield-backend.onrender.com`

*(Test it by visiting `https://voxshield-backend.onrender.com/docs` in your browser — you will see the interactive Swagger API documentation!)*

---

## Step 2: Deploy Frontend to Vercel (1-Click & Free)

1. Go to **[vercel.com](https://vercel.com)** and log in with your GitHub account.
2. Click **Add New...** -> **Project**.
3. Import your repository: **`addusupalipoorna-pc/voxshield-ai`**.
4. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand the **Environment Variables** section and add:
   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://voxshield-backend.onrender.com` *(Replace with your Render URL from Step 1)* |
6. Click **Deploy**.
7. In ~45 seconds, Vercel gives you your production website URL, for example:
   👉 `https://voxshield-ai.vercel.app`

---

## Step 3: Connect Your Laptop Enclave to the Live Cloud

To let the live deployed website execute commands on your physical Windows laptop (like opening Notepad, Calculator, etc.):

1. On your Windows laptop, open PowerShell in the project directory (`d:\demo`).
2. Run the agent pointing to your deployed backend:
   ```powershell
   python agent/main.py --server https://voxshield-backend.onrender.com
   ```
3. Your laptop will immediately start sending heartbeats to the live cloud server.
4. On your live Vercel dashboard, your laptop status will immediately turn green: **ONLINE**.

---

## Step 4: Sharing with Friends (Zero-Trust Security)

1. Share your live frontend URL (`https://voxshield-ai.vercel.app`) with your friend.
2. **Privacy Guaranteed**:
   - When your friend registers and logs in on their own laptop, **they will NOT see your laptop name or device ID**.
   - Their session is isolated.
3. **Delegated Access via OTP**:
   - If they want to test command execution on your laptop, they click **"Request Access to Host Laptop (Poorna)"** in the Command Center.
   - A 6-digit OTP is automatically sent to:
     - **Your Phone**: `+91 9392127166`
     - **Your Email**: `poornachandarpc897@gmail.com`
   - Once they get the OTP from you and enter it, they can trigger approved voice commands on your laptop!
