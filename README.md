# talaan

React landing page and team page prototype budgeting app concept.

## Scripts

- `npm run dev` starts the local Vite dev server.
- `npm run build` creates the production build for Vercel.

## Google Auth

Talaan uses Firebase Authentication for Google sign-in. Copy `.env.example` to
`.env.local`, fill in the Firebase web app values, and add the same variables in
Vercel Project Settings before deploying.

## Visual refresh

This copy redesigns all existing pages with forest-green accents, neutral surfaces, readable typography, a home budget preview, and labeled dashboard navigation. The original project was not modified.

Run `npm ci` then `npm run dev` to preview. Run `npm run build` for production. Firebase configuration is still required for sign-in. Build and browser verification could not be completed in the editing session because dependency downloads were blocked.
