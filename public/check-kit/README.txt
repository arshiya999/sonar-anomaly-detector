Aqua Vision check kit

01-valid-sonar/
  30 side-scan frames. Each was run through the local detector and returned
  at least one contact. Upload these on Upload, then Analyze. They should
  count as valid sonar and show boxes on Analysis.

02-invalid-colour-photos/
  5 colourful RGB pictures (not sonar). They should be rejected before YOLO
  (invalid), not treated as ocean debris.

How to test
1. Open the site (local `npm run dev` or the Vercel URL)
2. Upload → Add files → select all 35 (Ctrl/Shift), or add 30 then add 5
3. Tap Analyze once
4. Batch results should show about 30 valid / 5 rejected, plus the two graphs

These are sonar *images* for the SIH demo, not raw XTF/JSF waterfalls.
