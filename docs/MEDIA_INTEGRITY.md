# Media integrity: spotting AI-generated photos and videos

FixMyDistrict is for real problems people have seen. Every photo or video posted is checked for signs that it
was generated (or substantially altered) by AI. Checks warn and label; they never silently block a post.

## What happens

1. **At upload (real time)** — `/api/upload` reads the original file before anything else:
   - **Content Credentials (C2PA)** via the official reader `@contentauth/c2pa-node`. Google (Imagen/Gemini/Veo),
     OpenAI (DALL·E, GPT image, Sora), Adobe Firefly, Microsoft and others sign a manifest into AI output. A manifest
     whose actions carry the IPTC source type `trainedAlgorithmicMedia` / `compositeWithTrainedAlgorithmicMedia`
     is **conclusive**. A *trusted* camera manifest is strong evidence of a real capture.
   - **Photo metadata** (EXIF/XMP/IPTC, PNG text): IPTC `DigitalSourceType`, AI tool names in Software/CreatorTool,
     Stable Diffusion/ComfyUI generation records in PNGs (conclusive), camera make/model, typical generator sizes.
   - **In-app capture**: the app's own camera asks `/api/capture-token` for a 15-minute token bound to the user; a
     valid token on upload is a supporting (not conclusive) sign of a live capture.
   The poster immediately sees a warning with the reasons. They can still post.
   Photos are then **re-encoded without metadata** (no GPS, device or time in the public file).
2. **When the post is created** — the photo's own GPS and time are compared with the post's pin and date, the
   post gets `media_verdict`, and suspected/confirmed media shows a label in the feed and on the post.
   The verdict follows the file: posting someone else's uploaded AI image carries its evidence along.
3. **After the response** — optional deep detectors:
   - **Gemini** (set `GEMINI_API_KEY`, optional `GEMINI_DETECT_MODEL`): a vision model rates how likely the media is
     AI-generated. It is a *weak* signal: it can raise a post to "suspected", never "confirmed". When enabled, the
     media is sent to Google — say so in the privacy notice.
   - **Google SynthID / Content Detection API**: in limited partner preview. When access is granted it plugs into
     `src/lib/media-integrity/deep.ts` as another detector (a positive watermark result would be conclusive).
   If a deep check makes a post look worse, the poster is notified and it appears in review.
4. **Review** — Account › Review queue › *Media integrity*: signals, score and preview, with **Confirm AI**,
   **Looks real**, **Re-check** and **Hide post**. Confirming adds one strike to the poster (`users.ai_media_strikes`,
   shown in Users & Approvals) and notifies them; clearing removes it. Every decision is in the audit log.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `ai_confirmed` | Hard proof (credentials/metadata say AI) or a reviewer confirmed it |
| `suspected_ai` | Several weaker signs, or a detector is fairly sure |
| `unverified` | No evidence either way — most gallery photos; not an accusation |
| `likely_authentic` | Trusted camera credentials, in-app capture, or camera metadata that fits the post |

Weights live in `src/lib/media-integrity/` and are unit tested (`tests/unit/media-integrity.test.ts`).

## Limits (be honest with users)

- Metadata and credentials are easy to strip (screenshots, messaging apps). Missing evidence is never treated as
  proof of AI. Detection catches honest labels and lazy fakes; a determined faker can still get "unverified".
- Model-based detectors make mistakes in both directions; that is why a person makes the final call.
- The phone app sends library photos (JPEG/PNG/WebP up to 8 MB) as originals so their credentials can be read;
  camera photos are resized on the phone and rely on the capture token instead.
