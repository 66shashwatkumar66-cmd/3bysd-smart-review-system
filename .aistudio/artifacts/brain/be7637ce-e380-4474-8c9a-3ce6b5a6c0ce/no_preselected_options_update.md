# Customer Review Page: Neutral Initial State & User-Selected Options

## Summary of Changes

1. **Neutral Initial State (No Pre-Selected Options)**:
   - **Language**: Defaults to `null`. On initial page load, neither English nor Hinglish is pre-selected. Both options render with a neutral border and background (`bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100`).
   - **Tone**: Defaults to `null`. All tone cards render completely unselected in neutral slate styles until clicked.
   - **Keywords**: Defaults to an empty list `[]`. Suggested business keywords load into the options list normally but are never pre-selected or treated as chosen until clicked by the customer.

2. **Required Options Prompt & Zero Silent Defaults**:
   - When required options (language and tone) are not selected, the review draft section displays the prompt:
     > **"Select your preferred language and tone to generate your review."**
     with helpful visual indicators showing what remains to be selected.
   - Neither the frontend nor the backend (`server.ts` / `reviewGenerator.ts`) applies silent defaults. If an API request is made without both language and tone, it returns HTTP 400 with the required message.

3. **Dynamic Selection & Auto-Generation Workflow**:
   - Customer opens QR/NFC link: All options are unselected and the review draft displays the selection prompt.
   - Customer selects language and tone: As soon as both required selections are complete, the review draft generates automatically.
   - Selection updates: Any subsequent change to language, tone, star rating, or experience keywords automatically regenerates the review with the latest choices.
   - Business configuration, logos, custom notes, ads, and the "Stay Connected" button remain intact.
