# FishBase Explorer

A fish filtering web app using FastAPI (backend) and Next.js (frontend), powered by the FishBase REST API.

## Structure

```
fishbase-explorer/
├── backend/
│   ├── main.py           # FastAPI server
│   └── requirements.txt
└── frontend/
    └── src/
        ├── app/fish/page.tsx       # Filter UI
        └── components/FishTable.tsx
```

## Running locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000/fish

## Filters
- Family (dropdown from FishBase)
- Habitat: freshwater / saltwater / brackish
- Max length (cm)
- Dangerous / non-dangerous
