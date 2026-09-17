# MediKiosk: AI-Powered Patient Dashboard & Triage

## Overview
MediKiosk is an intelligent patient intake and health management system designed to streamline clinic workflows and empower patients. By leveraging advanced AI models for voice recognition, document analysis, and conversational symptom gathering, MediKiosk reduces manual data entry and provides doctors with concise, actionable case summaries before the consultation even begins.

## Problem Statement
Managing medical reports, symptoms, and medicines manually is difficult for patients. Additionally, patient intake at clinics is traditionally slow, manual, and consumes valuable doctor consultation time.

## User Stories
- **Story 1:** **As a patient**, I want to upload my medical reports, **so that** the AI can extract and summarize the important information in a way I can easily understand.
- **Story 2:** **As a patient**, I want to describe my symptoms using my voice and answer follow-up questions from an AI assistant, **so that** I can effortlessly record my health issues without typing.
- **Story 3:** **As a patient**, I want to set and manage medicine reminders, **so that** I can take my prescriptions on time and manage my health effectively.
- **Story 4:** **As a doctor**, I want to view structured, summarized case reports on a centralized dashboard, **so that** I can quickly understand a patient's condition before the consultation begins.

## Key Features
- **Voice Symptom Intake:** Patients can speak their symptoms naturally using a microphone.
- **AI Triage Assistant:** The system asks up to 5 highly relevant follow-up questions to gather necessary context based on the patient's chief complaint.
- **Report Analyzer:** Upload medical reports (PDF/Images) and receive simplified, AI-generated plain-English summaries.
- **Medicine Reminders:** A seamless interface for patients to track and manage their daily medication schedules.
- **Doctor Dashboard:** Real-time view of patient cases, intelligently summarized, with accurate regional timestamps (IST) and offline caching fallbacks.

## Tech Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** SQLite
- **AI Integration (NABH Cloud):**
  - **Whisper Large (STT):** For highly accurate voice-to-text symptom recording.
  - **Mistral / Qwen (LLM):** For dynamic triage questioning and report summarization.
  - **PaddleOCR-VL:** For extracting text from uploaded medical documents.
  - **Kokoro (TTS):** For reading AI responses back to the patient.

## How to Run Locally

1. **Install dependencies:**
   Ensure you have Node.js installed, then run:
   ```bash
   npm install
   ```

2. **Environment Setup:**
   Create a `.env` file in the root directory and add your NABH API Key:
   ```env
   NABH_API_KEY=your_api_key_here
   PORT=3000
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

4. **Access the application:**
   Open your browser and navigate to:
   - Patient Intake: `http://localhost:3000/`
   - Doctor Dashboard: `http://localhost:3000/doctor.html`
   - Report Analyzer: `http://localhost:3000/reports.html`
   - Reminders: `http://localhost:3000/reminders.html`

## Project Structure
- `/frontend` - Contains all HTML, CSS, Client-side JS, and UI assets.
- `/backend` - Contains the Express server, SQLite database logic (`database.js`), and API routes.
- `/backend/services/nabh.js` - Core integration with cloud AI models and prompt engineering.
