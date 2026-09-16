# MediKiosk

AI-Assisted Patient History Assistant built with HTML, CSS, vanilla JavaScript, Express, SQLite, and NABH.CLOUD AI APIs.

## 1. Project Overview

MediKiosk helps patients enter symptoms by text or voice, lets AI ask focused follow-up questions, generates a short structured history, and gives doctors a dashboard to review cases.

The system assists with history collection only. It does not diagnose, prescribe, triage, or recommend treatment.

## 2. Problem Statement

Patient history is often lengthy and unstructured, making consultation and documentation slower.

## 3. Objective

Make basic patient history collection faster and more structured using AI.

## 4. Features

- Voice symptom input through speech-to-text
- Text-to-speech playback for AI questions
- AI follow-up questions
- Structured patient history summary
- SQLite case storage
- Doctor dashboard with case search and stats
- Similar case search using embeddings
- Educational complaint illustration generation

## 5. AI Models

Official NABH.CLOUD documentation states that the API uses:

- Base URL: `https://api.nabh.cloud/v1`
- Authentication: `Authorization: Bearer nbh_...` or `X-API-Key: nbh_...`
- One NABH API key tied to the account wallet
- OpenAI-compatible request shapes

Configured model IDs:

- LLM: `mistral-7b-instruct`
- Embeddings: `nomic-embed-text`
- Image generation: `stable-diffusion-xl`
- Speech-to-text: `whisper-large-v3-turbo`
- Text-to-speech: `kokoro-tts`

Sources:

- [NABH.CLOUD overview](https://nabh.cloud/docs/)
- [NABH.CLOUD models](https://nabh.cloud/docs/models/)
- [NABH.CLOUD authentication](https://nabh.cloud/docs/authentication/)
- [NABH.CLOUD SDK notes](https://nabh.cloud/docs/sdks/)

## 6. Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express.js
- Database: SQLite
- AI: NABH.CLOUD APIs
- Communication: REST APIs

## 7. Architecture

```text
Frontend HTML/CSS/JS
        |
        v
Express Backend REST APIs
        |
        +--> NABH.CLOUD AI Services
        |
        +--> SQLite Database
```

## 8. PRD

PRD — MediKiosk: AI Patient History Assistant

Problem:
Patient history is often lengthy and unstructured, making consultation and documentation slower.

Users:
Patients and Doctors

Objective:
Make basic patient history collection faster and more structured using AI.

Main Features:
- Voice symptom input
- AI follow-up questions
- Structured history summary
- Similar case search
- Educational medical illustration

Success:
A patient can complete a basic AI-assisted history and a doctor can view the structured summary before consultation.

## 9. Epics

Epic — AI Patient History

Goal:
Collect and structure patient symptoms using AI.

Stories:
- As a patient, I want to speak my symptoms, so that I do not have to type everything.
- As a patient, I want AI to ask follow-up questions, so that important information can be collected.
- As a doctor, I want a structured summary, so that I can quickly understand the case.

Epic — Smart Case Search

Goal:
Find semantically similar previous cases.

Stories:
- As a doctor, I want cases converted into embeddings, so that similar cases can be found.
- As a doctor, I want to view similar cases, so that I can reference previous case information.

Epic — Medical Illustration

Goal:
Generate simple educational illustrations.

Stories:
- As a doctor, I want to generate an illustration, so that I can visually explain the complaint.
- As a doctor, I want to view the illustration with the case, so that it is available during consultation.

Epic — Doctor Review

Goal:
Show submitted cases in a clear doctor dashboard.

Stories:
- As a doctor, I want to search cases, so that I can quickly find a patient.
- As a doctor, I want to update case status, so that I can track pending and completed cases.

## 10. User Stories

- As a patient, I want to enter my basic information, so that the doctor knows who the case belongs to.
- As a patient, I want to describe symptoms by text or voice, so that history entry is easier.
- As a patient, I want to answer AI follow-up questions, so that my history is more complete.
- As a patient, I want to submit my case, so that the doctor can review it.
- As a doctor, I want to view recent cases, so that I can prepare before consultation.
- As a doctor, I want to see a structured AI summary, so that I can understand the case faster.
- As a doctor, I want to find similar cases, so that I can reference previous case information.
- As a doctor, I want to generate an educational illustration, so that I can explain the complaint visually.

## 11. SDLC

Requirement:
Define patient and doctor workflows.

Design:
Create simple pages, REST endpoints, and SQLite schema.

Development:
Build frontend, backend routes, and database operations.

AI Integration:
Call NABH.CLOUD from the backend only.

Testing:
Run local flows and verify API, UI, database, and error handling.

Deployment:
Run the Node.js server on a host that supports environment variables.

Maintenance:
Rotate API keys, update model IDs, and improve prompts as needed.

## 12. Project Structure

```text
MediKiosk/
├── frontend/
│   ├── index.html
│   ├── patient.html
│   ├── doctor.html
│   ├── case.html
│   ├── css/style.css
│   └── js/
│       ├── patient.js
│       ├── doctor.js
│       └── case.js
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── routes/
│   │   ├── cases.js
│   │   └── ai.js
│   └── services/nabh.js
├── data/
│   └── database.sqlite
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 13. Environment Variables

Create `backend/.env` and add your NABH.CLOUD API key:

```env
NABH_API_KEY=
NABH_BASE_URL=https://api.nabh.cloud/v1
NABH_LLM_MODEL=mistral-7b-instruct
NABH_EMBEDDING_MODEL=nomic-embed-text
NABH_IMAGE_MODEL=stable-diffusion-xl
NABH_STT_MODEL=whisper-large-v3-turbo
NABH_TTS_MODEL=kokoro-tts
NABH_TTS_VOICE=af_sarah
PORT=3000
```

NABH.CLOUD documentation describes one API key that can access available model categories based on the account plan. Separate category keys are not required by the official docs.

## 14. API Endpoints

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:id`
- `PATCH /api/cases/:id/status`
- `POST /api/speech-to-text`
- `POST /api/text-to-speech`
- `POST /api/ask-question`
- `POST /api/generate-summary`
- `POST /api/generate-embedding`
- `POST /api/similar-cases`
- `POST /api/generate-image`

## 15. Installation

```bash
npm install
```

## 16. How to Run

```bash
npm start
```

Open:

- Home: `http://localhost:3000/`
- Patient Dashboard: `http://localhost:3000/patient`
- Doctor Dashboard: `http://localhost:3000/doctor`

## 17. Security

- API keys stay in `backend/.env`.
- `.env` and `backend/.env` are ignored by Git.
- The frontend never calls NABH.CLOUD directly.
- The backend never returns API keys to the browser.
- SQLite queries use parameterized values.

## 18. Limitations

- AI features require a valid NABH.CLOUD key and a plan with the selected models.
- Similar case search depends on stored embeddings.
- Generated illustrations are educational references only.
- No authentication is included because the project is scoped for a local demo.

## 19. Future Improvements

- Add role-based login for real clinical use.
- Add export to PDF for doctor notes.
- Add better follow-up question limits and completion detection.
- Add deployment configuration for a production server.
