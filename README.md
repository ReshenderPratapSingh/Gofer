# Gofer (Razorpay Buildathon)
An autonomous AI purchasing agent ("Gofer") that shops at a headless merchant via HTTP, strictly respecting spend ceilings and human-in-the-loop approval gates. 

**Architecture:**
- `/merchant`: Node/Express/Prisma/Neon API representing Meera's store.
- `/agent`: Node/Gemini AI client representing Rohan's buyer.
- `/automation`: Puppeteer headless checkout scripts (Phase 2).
