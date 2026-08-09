# Deploying Backend to Vercel

## Prerequisites
1. Install Vercel CLI: `npm install -g vercel`
2. Login to Vercel: `vercel login`

## Environment Variables
Before deploying, you need to set up your environment variables in Vercel:

1. Go to your Vercel dashboard
2. Select your project (or it will be created on first deploy)
3. Go to Settings → Environment Variables
4. Add the following variables:

```
MONGO_URI=your_mongodb_connection_string
PORT=3000
JWT_SECRET=your_jwt_secret_key
```

**Or use Vercel CLI:**
```bash
cd backend
vercel env add MONGO_URI
vercel env add JWT_SECRET
```

## Deployment Steps

### First Time Deployment:
```bash
cd backend
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (first time)
- Project name? **fortress-backend** (or your preferred name)
- Directory? **.** (current directory)
- Override settings? **N**

### Subsequent Deployments:
```bash
cd backend
vercel --prod
```

## Production Deployment:
```bash
cd backend
vercel --prod
```

## Important Notes:

1. **MongoDB Connection**: Make sure your MongoDB Atlas allows connections from anywhere (0.0.0.0/0) or add Vercel's IP ranges
   - Go to MongoDB Atlas → Network Access → Add IP Address → Allow Access from Anywhere

2. **CORS**: Your backend already has CORS enabled, but you may want to restrict it to your frontend domain:
   ```javascript
   app.use(cors({
     origin: 'https://your-frontend-domain.com'
   }));
   ```

3. **Cold Starts**: Vercel serverless functions may have cold starts. First request after inactivity may be slower.

4. **Logs**: View logs with `vercel logs <deployment-url>`

## Testing After Deployment:

```bash
# Test health endpoint
curl https://your-deployment-url.vercel.app/health

# Should return: {"ok":true}
```

## Local Testing Before Deploy:

```bash
npm install -g vercel
vercel dev
```

This runs your app locally in Vercel's environment.
