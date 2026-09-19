// Read-only validation. Never deploys, writes credentials, or guesses a target project.
const required = ['TALAAN_STAGING_PROJECT_ID','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_APP_ID','VITE_FIREBASE_APPCHECK_SITE_KEY','TALAAN_STAGING_TEST_UIDS','TALAAN_STAGING_TEST_EMAILS'];
const missing=required.filter(key=>!process.env[key]);
const failures=missing.map(key=>`Missing ${key}`);
if(process.env.TALAAN_STAGING_PROJECT_ID&&process.env.VITE_FIREBASE_PROJECT_ID!==process.env.TALAAN_STAGING_PROJECT_ID)failures.push('Frontend project must exactly match the explicit staging project.');
if(process.env.VITE_FIREBASE_USE_EMULATORS==='true')failures.push('Staging must use real Firebase services.');
if(process.env.VITE_FIREBASE_APPCHECK_DEBUG==='true')failures.push('Do not ship an App Check debug build to staging.');
if(process.env.TALAAN_STAGING_TEST_EMAILS?.split(',').some(email=>!/^\S+@\S+\.\S+$/.test(email.trim())))failures.push('Controlled test email list is invalid.');
if(failures.length){console.error(`Staging is not ready:\n${failures.map(message=>`- ${message}`).join('\n')}`);process.exitCode=1;}
else console.log('Staging configuration checks passed. Confirm project isolation and provider setup in BACKEND_RELEASE_RUNBOOK.md before deployment.');
